-- AI GM Stage 8: canonical short rest, long rest and location-scoped dawn recovery.

alter table public.chat_messages
  drop constraint if exists chat_messages_turn_component_check;

alter table public.chat_messages
  add constraint chat_messages_turn_component_check
  check (
    turn_component is null
    or turn_component in (
      'action','bonus_action','movement','description',
      'ai_gm_output','ai_gm_recovery'
    )
  );

create unique index if not exists chat_messages_ai_gm_recovery_turn_unique
  on public.chat_messages(turn_command_id)
  where turn_command_id is not null
    and turn_component='ai_gm_recovery';

create table if not exists private.ai_gm_dawn_receipts (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  campaign_day integer not null check (campaign_day >= 1),
  job_id uuid not null,
  message_id bigint references public.chat_messages(id) on delete set null,
  result jsonb not null check (jsonb_typeof(result)='object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key(campaign_id,location_id,campaign_day)
);

create unique index if not exists ai_gm_dawn_receipts_job_idx
  on private.ai_gm_dawn_receipts(job_id);

create or replace function public.execute_ai_gm_recovery_v1(
  p_job_id uuid,
  p_trigger text,
  p_target_character_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job public.agent_jobs%rowtype;
  v_room public.chat_rooms%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_manager_user_id uuid;
  v_source_character_id uuid;
  v_source_location_id uuid;
  v_current_day integer;
  v_current_period text;
  v_effective_day integer;
  v_trigger text := lower(trim(coalesce(p_trigger,'')));
  v_targets uuid[] := '{}'::uuid[];
  v_target_names text[] := '{}'::text[];
  v_target_id uuid;
  v_target_location_id uuid;
  v_scene_room_id uuid;
  v_message_id bigint;
  v_body text;
  v_result jsonb;
  v_dawn private.ai_gm_dawn_receipts%rowtype;
begin
  if p_job_id is null then
    raise exception 'ai_gm_job_required';
  end if;
  if v_trigger not in ('short_rest','long_rest','dawn') then
    raise exception 'ai_gm_recovery_trigger_invalid';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_turn_not_found';
  end if;

  select * into v_existing
  from public.engine_command_receipts
  where command_id=p_job_id;

  if found then
    if v_existing.campaign_id<>v_job.campaign_id
       or v_existing.engine<>'ai_gm'
       or v_existing.command_kind<>'ai_gm.recovery'
    then
      raise exception 'ai_gm_recovery_command_conflict';
    end if;
    return v_existing.result || jsonb_build_object('idempotent_replay',true);
  end if;

  if v_job.status<>'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  v_manager_user_id:=nullif(v_job.input->>'manager_user_id','')::uuid;
  v_source_character_id:=nullif(v_job.input->>'source_character_id','')::uuid;

  if v_manager_user_id is null or v_source_character_id is null then
    raise exception 'ai_gm_recovery_identity_missing';
  end if;

  if not private.can_manage_campaign(v_job.campaign_id,v_manager_user_id) then
    raise exception 'ai_gm_recovery_manager_required';
  end if;

  select * into v_room
  from public.chat_rooms
  where id=nullif(v_job.input->>'room_id','')::uuid
    and campaign_id=v_job.campaign_id
  for update;

  if v_room.id is null
     or v_room.category<>'game'
     or v_room.room_type<>'scene'
     or v_room.room_state<>'open'
     or v_room.scene_state<>'active'
     or v_room.is_read_only
  then
    raise exception 'ai_gm_recovery_requires_active_scene';
  end if;

  select
    coalesce(ws.location_id,v_room.location_id),
    coalesce(ws.campaign_day,v_room.campaign_day,1),
    coalesce(ws.day_period,v_room.day_period,'day')
  into v_source_location_id,v_current_day,v_current_period
  from public.characters c
  left join public.character_world_state ws on ws.character_id=c.id
  where c.id=v_source_character_id
    and c.campaign_id=v_job.campaign_id
    and c.life_state='alive';

  if v_source_location_id is null then
    v_source_location_id:=v_room.location_id;
  end if;
  v_current_day:=coalesce(v_current_day,v_room.campaign_day,1);
  v_current_period:=coalesce(v_current_period,v_room.day_period,'day');

  perform private.npc_runtime_manager_claims_v1(v_manager_user_id);

  if v_trigger in ('short_rest','long_rest') then
    select coalesce(array_agg(x.id order by x.id),'{}'::uuid[])
      into v_targets
    from (
      select distinct value as id
      from unnest(coalesce(p_target_character_ids,'{}'::uuid[])) as u(value)
    ) x;

    if cardinality(v_targets)<1 or cardinality(v_targets)>12 then
      raise exception 'ai_gm_recovery_targets_invalid';
    end if;

    if v_source_location_id is null then
      raise exception 'ai_gm_recovery_source_location_unknown';
    end if;

    if exists(
      select 1
      from unnest(v_targets) as target(id)
      left join public.characters c
        on c.id=target.id
       and c.campaign_id=v_job.campaign_id
       and c.life_state='alive'
       and c.publication_state='campaign'
      left join public.character_world_state ws
        on ws.character_id=c.id
      where c.id is null
         or coalesce(
              ws.location_id,
              case when target.id=v_source_character_id then v_room.location_id end
            ) is distinct from v_source_location_id
    ) then
      raise exception 'ai_gm_recovery_target_not_present';
    end if;

    foreach v_target_id in array v_targets loop
      if v_trigger='short_rest' then
        perform public.grant_character_short_rest(v_target_id);
      else
        perform public.grant_character_long_rest(v_target_id);
      end if;
    end loop;

    select coalesce(array_agg(c.name order by c.name),'{}'::text[])
      into v_target_names
    from public.characters c
    where c.id=any(v_targets);

    v_body:=case
      when v_trigger='short_rest'
        then 'Короткий отдых: '||array_to_string(v_target_names,', ')||'.'
      else 'Длительный отдых: '||array_to_string(v_target_names,', ')||'.'
    end;

    perform set_config('meganot.ai_gm_runtime','on',true);

    insert into public.chat_messages(
      room_id,client_id,user_id,character_id,author_name,body,
      event_payload,turn_command_id,turn_component,turn_order
    )
    values(
      v_room.id,v_manager_user_id,v_manager_user_id,null,'Рассказчик',v_body,
      jsonb_build_object(
        'systemEvent','recovery',
        'recoveryTrigger',v_trigger,
        'targetCharacterIds',to_jsonb(v_targets),
        'campaignDay',v_current_day,
        'dayPeriod',v_current_period,
        'runtimeStage',8
      ),
      p_job_id,'ai_gm_recovery',0
    )
    returning id into v_message_id;

    v_result:=jsonb_build_object(
      'applied',true,
      'already_applied',false,
      'trigger',v_trigger,
      'target_character_ids',to_jsonb(v_targets),
      'campaign_day',v_current_day,
      'day_period',v_current_period,
      'message_id',v_message_id,
      'runtime_stage',8
    );
  else
    if p_target_character_ids is not null
       and cardinality(p_target_character_ids)>0
    then
      raise exception 'ai_gm_dawn_does_not_accept_targets';
    end if;

    if v_source_location_id is null then
      raise exception 'ai_gm_dawn_requires_location';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'ai-gm-dawn:'||v_job.campaign_id::text||':'||v_source_location_id::text,
        0
      )
    );

    select
      coalesce(ws.campaign_day,v_room.campaign_day,1),
      coalesce(ws.day_period,v_room.day_period,'day')
    into v_current_day,v_current_period
    from public.characters c
    left join public.character_world_state ws on ws.character_id=c.id
    where c.id=v_source_character_id;

    v_effective_day:=case
      when v_current_period='dawn' then v_current_day
      else v_current_day+1
    end;

    select * into v_dawn
    from private.ai_gm_dawn_receipts
    where campaign_id=v_job.campaign_id
      and location_id=v_source_location_id
      and campaign_day=v_effective_day
    for update;

    if found then
      v_result:=jsonb_build_object(
        'applied',false,
        'already_applied',true,
        'trigger','dawn',
        'target_character_ids',coalesce(v_dawn.result->'target_character_ids','[]'::jsonb),
        'campaign_day',v_effective_day,
        'day_period','dawn',
        'message_id',null,
        'prior_message_id',v_dawn.message_id,
        'runtime_stage',8
      );

      insert into public.engine_command_receipts(
        command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by,actor_character_id
      ) values(
        p_job_id,v_job.campaign_id,'ai_gm','ai_gm.recovery',
        v_source_location_id,v_result,v_manager_user_id,v_source_character_id
      );

      return v_result;
    end if;

    select coalesce(array_agg(c.id order by c.id),'{}'::uuid[])
      into v_targets
    from public.characters c
    join public.character_world_state ws
      on ws.character_id=c.id
     and ws.campaign_id=c.campaign_id
    where c.campaign_id=v_job.campaign_id
      and c.life_state='alive'
      and c.publication_state='campaign'
      and ws.location_id=v_source_location_id;

    if not v_source_character_id=any(v_targets) then
      v_targets:=array_append(v_targets,v_source_character_id);
    end if;

    for v_scene_room_id in
      select r.id
      from public.chat_rooms r
      where r.campaign_id=v_job.campaign_id
        and r.room_type='scene'
        and r.scene_state='active'
        and r.location_id=v_source_location_id
      order by r.id
    loop
      perform public.set_scene_position(
        v_scene_room_id,
        v_source_location_id,
        v_effective_day,
        'dawn'
      );
    end loop;

    foreach v_target_id in array v_targets loop
      select ws.location_id into v_target_location_id
      from public.character_world_state ws
      where ws.character_id=v_target_id;

      perform public.set_character_world_position(
        v_target_id,
        coalesce(v_target_location_id,v_source_location_id),
        v_effective_day,
        'dawn'
      );
      perform public.recover_character_resources(v_target_id,'dawn');
    end loop;

    v_body:='Рассвет. День '||v_effective_day::text||
      '. Ресурсы рассвета восстановлены для участников этой локации.';

    perform set_config('meganot.ai_gm_runtime','on',true);

    insert into public.chat_messages(
      room_id,client_id,user_id,character_id,author_name,body,
      event_payload,turn_command_id,turn_component,turn_order
    )
    values(
      v_room.id,v_manager_user_id,v_manager_user_id,null,'Рассказчик',v_body,
      jsonb_build_object(
        'systemEvent','recovery',
        'recoveryTrigger','dawn',
        'targetCharacterIds',to_jsonb(v_targets),
        'campaignDay',v_effective_day,
        'dayPeriod','dawn',
        'locationId',v_source_location_id,
        'runtimeStage',8
      ),
      p_job_id,'ai_gm_recovery',0
    )
    returning id into v_message_id;

    v_result:=jsonb_build_object(
      'applied',true,
      'already_applied',false,
      'trigger','dawn',
      'target_character_ids',to_jsonb(v_targets),
      'campaign_day',v_effective_day,
      'day_period','dawn',
      'location_id',v_source_location_id,
      'message_id',v_message_id,
      'runtime_stage',8
    );

    insert into private.ai_gm_dawn_receipts(
      campaign_id,location_id,campaign_day,job_id,message_id,result,created_by
    ) values(
      v_job.campaign_id,v_source_location_id,v_effective_day,
      p_job_id,v_message_id,v_result,v_manager_user_id
    );
  end if;

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by,actor_character_id
  ) values(
    p_job_id,v_job.campaign_id,'ai_gm','ai_gm.recovery',
    case when v_trigger='dawn' then v_source_location_id else v_source_character_id end,
    v_result,v_manager_user_id,v_source_character_id
  );

  return v_result;
end;
$function$;

revoke all on function public.execute_ai_gm_recovery_v1(uuid,text,uuid[])
  from public,anon,authenticated;
grant execute on function public.execute_ai_gm_recovery_v1(uuid,text,uuid[])
  to service_role;
