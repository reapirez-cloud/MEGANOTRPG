-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 14: safe canonical materialization bridge.
-- Background events remain temporal overlays until the minimum active-player day reaches
-- the event day. Canonical mutations are guarded by captured pre-event owner state.

create table public.ai_background_materialization_receipts (
  event_id uuid primary key references public.ai_background_events(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  effective_game_day integer not null check (effective_game_day>=1),
  entity_scope text not null check (entity_scope in ('npc','location')),
  entity_id text not null,
  status text not null default 'pending' check (status in (
    'pending','blocked_temporal','blocked_predecessor',
    'blocked_protection','blocked_conflict','applied','no_materialization'
  )),
  safe_through_game_day integer,
  expected_before jsonb not null default '{}'::jsonb check (jsonb_typeof(expected_before)='object'),
  desired_after jsonb not null default '{}'::jsonb check (jsonb_typeof(desired_after)='object'),
  applied_operations jsonb not null default '[]'::jsonb check (jsonb_typeof(applied_operations)='array'),
  conflict_detail jsonb not null default '{}'::jsonb check (jsonb_typeof(conflict_detail)='object'),
  first_attempted_at timestamptz,
  last_attempted_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_background_materialization_receipts enable row level security;
revoke all on table public.ai_background_materialization_receipts from public, anon, authenticated;
grant select on table public.ai_background_materialization_receipts to service_role;

create policy ai_background_materialization_receipts_deny_client
on public.ai_background_materialization_receipts
for all to anon, authenticated
using(false) with check(false);

create index ai_background_materialization_campaign_status_idx
  on public.ai_background_materialization_receipts(campaign_id,status,effective_game_day);

CREATE OR REPLACE FUNCTION private.ai_background_safe_materialization_day_v1(p_campaign_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_day integer;
begin
  select min(coalesce(ws.campaign_day,1))
  into v_day
  from public.campaign_members cm
  join public.characters c
    on c.id=cm.active_character_id
   and c.campaign_id=cm.campaign_id
   and c.character_type='pc'
   and c.publication_state='campaign'
   and c.life_state='alive'
  left join public.character_world_state ws
    on ws.character_id=c.id and ws.campaign_id=c.campaign_id
  where cm.campaign_id=p_campaign_id
    and cm.role='player'
    and cm.active_character_id is not null;

  if v_day is not null then return greatest(1,v_day); end if;

  select min(coalesce(ws.campaign_day,1))
  into v_day
  from public.characters c
  left join public.character_world_state ws
    on ws.character_id=c.id and ws.campaign_id=c.campaign_id
  where c.campaign_id=p_campaign_id
    and c.character_type='pc'
    and c.publication_state='campaign'
    and c.life_state='alive';

  if v_day is not null then return greatest(1,v_day); end if;

  return greatest(1,private.ai_background_campaign_frontier_day_v1(p_campaign_id));
end;
$function$;

CREATE OR REPLACE FUNCTION private.ai_background_materialization_guard_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state jsonb:=new.effect_payload->'proposed_state';
  v_overlay jsonb;
  v_previous_overlay jsonb:='{}'::jsonb;
  v_expected jsonb:='{}'::jsonb;
  v_desired jsonb:='{}'::jsonb;
  v_prev_snapshot_id uuid;
  v_character public.characters%rowtype;
  v_world public.character_world_state%rowtype;
  v_location public.locations%rowtype;
begin
  if new.entity_scope not in ('npc','location')
     or jsonb_typeof(v_state)<>'object'
     or jsonb_typeof(v_state->'temporal_overlay')<>'object'
  then return new; end if;

  v_overlay:=v_state->'temporal_overlay';

  select s.id,coalesce(s.state->'temporal_overlay','{}'::jsonb)
  into v_prev_snapshot_id,v_previous_overlay
  from public.ai_background_entity_snapshots s
  where s.campaign_id=new.campaign_id
    and s.entity_scope=new.entity_scope
    and s.entity_id=new.entity_id
    and s.through_game_day<=new.effective_game_day
  order by s.through_game_day desc,s.version desc
  limit 1;

  if new.entity_scope='npc' then
    select * into v_character
    from public.characters c
    where c.id=new.entity_id::uuid
      and c.campaign_id=new.campaign_id
      and c.character_type='npc'
      and c.publication_state='campaign';

    if v_character.id is null then
      raise exception using errcode='22023',message='ai_background_materialization_npc_not_found';
    end if;

    select * into v_world
    from public.character_world_state ws
    where ws.character_id=v_character.id and ws.campaign_id=new.campaign_id;

    if v_overlay ? 'life_state' then
      v_desired:=v_desired||jsonb_build_object('life_state',v_overlay->'life_state');
      v_expected:=v_expected||jsonb_build_object(
        'life_state',
        case when v_previous_overlay ? 'life_state'
          then v_previous_overlay->'life_state'
          else to_jsonb(v_character.life_state) end
      );
    end if;

    if v_overlay ? 'location_id' then
      v_desired:=v_desired||jsonb_build_object('location_id',v_overlay->'location_id');
      v_expected:=v_expected||jsonb_build_object(
        'location_id',
        case
          when v_previous_overlay ? 'location_id' then v_previous_overlay->'location_id'
          when v_world.character_id is null or v_world.location_id is null then 'null'::jsonb
          else to_jsonb(v_world.location_id::text)
        end
      );
    end if;
  else
    select * into v_location
    from public.locations l
    where l.id=new.entity_id::uuid and l.campaign_id=new.campaign_id;

    if v_location.id is null then
      raise exception using errcode='22023',message='ai_background_materialization_location_not_found';
    end if;

    if v_overlay ? 'lifecycle_state' then
      v_desired:=v_desired||jsonb_build_object('lifecycle_state',v_overlay->'lifecycle_state');
      v_expected:=v_expected||jsonb_build_object(
        'lifecycle_state',
        case when v_previous_overlay ? 'lifecycle_state'
          then v_previous_overlay->'lifecycle_state'
          else to_jsonb(v_location.lifecycle_state) end
      );
    end if;
  end if;

  new.effect_payload:=new.effect_payload||jsonb_build_object(
    'materialization_guard',
    jsonb_build_object(
      'version',1,'captured_at',now(),'previous_snapshot_id',v_prev_snapshot_id,
      'expected_before',v_expected,'desired_after',v_desired
    )
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.ai_background_materialization_is_protected_v1(p_event ai_background_events, p_safe_day integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_entity_uuid uuid;
begin
  if p_event.entity_scope not in ('npc','location') then return false; end if;
  begin v_entity_uuid:=p_event.entity_id::uuid;
  exception when invalid_text_representation then return true; end;

  if private.ai_background_entity_is_protected_v1(
    p_event.campaign_id,greatest(p_event.effective_game_day,p_safe_day),
    p_event.entity_scope,v_entity_uuid
  ) then return true; end if;

  if p_event.entity_scope='npc' then
    return exists(
      select 1
      from public.quests q
      join public.quest_targets t on t.quest_id=q.id
      left join public.quest_stages s on s.id=t.stage_id
      where q.campaign_id=p_event.campaign_id
        and q.status='active'
        and t.npc_character_id=v_entity_uuid
        and (t.stage_id is null or s.status='active')
    );
  end if;

  return exists(
    select 1
    from public.quests q
    join public.quest_targets t on t.quest_id=q.id
    left join public.quest_stages s on s.id=t.stage_id
    where q.campaign_id=p_event.campaign_id
      and q.status='active'
      and t.location_id=v_entity_uuid
      and (t.stage_id is null or s.status='active')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.materialize_ai_background_event_v1(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event public.ai_background_events%rowtype;
  v_guard jsonb; v_expected jsonb; v_desired jsonb;
  v_receipt public.ai_background_materialization_receipts%rowtype;
  v_safe_day integer;
  v_current jsonb:='{}'::jsonb; v_conflict jsonb:='{}'::jsonb; v_ops jsonb:='[]'::jsonb;
  v_character public.characters%rowtype; v_world public.character_world_state%rowtype;
  v_location public.locations%rowtype; v_desired_location uuid;
  v_key text; v_current_value jsonb; v_expected_value jsonb; v_desired_value jsonb;
  v_predecessor uuid;
begin
  select * into v_event from public.ai_background_events where id=p_event_id for update;
  if v_event.id is null then
    raise exception using errcode='P0002',message='ai_background_materialization_event_not_found';
  end if;
  if not private.is_ai_world_campaign_v1(v_event.campaign_id) then
    raise exception using errcode='42501',message='ai_background_ai_world_only';
  end if;

  v_guard:=coalesce(v_event.effect_payload->'materialization_guard','{}'::jsonb);
  v_expected:=coalesce(v_guard->'expected_before','{}'::jsonb);
  v_desired:=coalesce(v_guard->'desired_after','{}'::jsonb);

  insert into public.ai_background_materialization_receipts(
    event_id,campaign_id,effective_game_day,entity_scope,entity_id,
    expected_before,desired_after,first_attempted_at,last_attempted_at
  ) values (
    v_event.id,v_event.campaign_id,v_event.effective_game_day,v_event.entity_scope,v_event.entity_id,
    v_expected,v_desired,now(),now()
  )
  on conflict(event_id) do update set last_attempted_at=now(),updated_at=now()
  returning * into v_receipt;

  if v_receipt.applied_at is not null or v_receipt.status in ('applied','no_materialization') then
    return jsonb_build_object('receipt',to_jsonb(v_receipt),'replayed',true);
  end if;

  if jsonb_typeof(v_desired)<>'object' or v_desired='{}'::jsonb
     or v_event.entity_scope not in ('npc','location') then
    update public.ai_background_materialization_receipts
    set status='no_materialization',
        safe_through_game_day=private.ai_background_safe_materialization_day_v1(v_event.campaign_id),
        applied_at=now(),last_attempted_at=now(),updated_at=now()
    where event_id=v_event.id returning * into v_receipt;
    return jsonb_build_object('receipt',to_jsonb(v_receipt),'replayed',false);
  end if;

  v_safe_day:=private.ai_background_safe_materialization_day_v1(v_event.campaign_id);
  if v_safe_day<v_event.effective_game_day then
    update public.ai_background_materialization_receipts
    set status='blocked_temporal',safe_through_game_day=v_safe_day,
        conflict_detail=jsonb_build_object('required_day',v_event.effective_game_day,'safe_day',v_safe_day),
        last_attempted_at=now(),updated_at=now()
    where event_id=v_event.id returning * into v_receipt;
    return jsonb_build_object('receipt',to_jsonb(v_receipt),'replayed',false);
  end if;

  select e.id into v_predecessor
  from public.ai_background_events e
  left join public.ai_background_materialization_receipts r on r.event_id=e.id
  where e.campaign_id=v_event.campaign_id
    and e.entity_scope=v_event.entity_scope and e.entity_id=v_event.entity_id
    and jsonb_typeof(e.effect_payload->'materialization_guard'->'desired_after')='object'
    and e.effect_payload->'materialization_guard'->'desired_after'<>'{}'::jsonb
    and (
      e.effective_game_day<v_event.effective_game_day
      or (e.effective_game_day=v_event.effective_game_day
          and (e.created_at<v_event.created_at or (e.created_at=v_event.created_at and e.id<v_event.id)))
    )
    and coalesce(r.status,'pending') not in ('applied','no_materialization')
  order by e.effective_game_day,e.created_at,e.id limit 1;

  if v_predecessor is not null then
    update public.ai_background_materialization_receipts
    set status='blocked_predecessor',safe_through_game_day=v_safe_day,
        conflict_detail=jsonb_build_object('predecessor_event_id',v_predecessor),
        last_attempted_at=now(),updated_at=now()
    where event_id=v_event.id returning * into v_receipt;
    return jsonb_build_object('receipt',to_jsonb(v_receipt),'replayed',false);
  end if;

  if private.ai_background_materialization_is_protected_v1(v_event,v_safe_day) then
    update public.ai_background_materialization_receipts
    set status='blocked_protection',safe_through_game_day=v_safe_day,
        conflict_detail=jsonb_build_object('reason','active_entity_or_quest_protection'),
        last_attempted_at=now(),updated_at=now()
    where event_id=v_event.id returning * into v_receipt;
    return jsonb_build_object('receipt',to_jsonb(v_receipt),'replayed',false);
  end if;

  if v_event.entity_scope='npc' then
    select * into v_character
    from public.characters c
    where c.id=v_event.entity_id::uuid and c.campaign_id=v_event.campaign_id
      and c.character_type='npc' and c.publication_state='campaign'
    for update;

    if v_character.id is null then
      v_conflict:=jsonb_build_object('reason','npc_missing');
    else
      select * into v_world
      from public.character_world_state ws
      where ws.character_id=v_character.id and ws.campaign_id=v_event.campaign_id
      for update;
      if v_expected ? 'life_state' then
        v_current:=v_current||jsonb_build_object('life_state',v_character.life_state);
      end if;
      if v_expected ? 'location_id' then
        v_current:=v_current||jsonb_build_object(
          'location_id',
          case when v_world.character_id is null or v_world.location_id is null
            then 'null'::jsonb else to_jsonb(v_world.location_id::text) end
        );
      end if;
    end if;
  else
    select * into v_location
    from public.locations l
    where l.id=v_event.entity_id::uuid and l.campaign_id=v_event.campaign_id
    for update;
    if v_location.id is null then
      v_conflict:=jsonb_build_object('reason','location_missing');
    elsif v_expected ? 'lifecycle_state' then
      v_current:=v_current||jsonb_build_object('lifecycle_state',v_location.lifecycle_state);
    end if;
  end if;

  if v_conflict='{}'::jsonb then
    for v_key in select jsonb_object_keys(v_desired) loop
      v_current_value:=v_current->v_key;
      v_expected_value:=v_expected->v_key;
      v_desired_value:=v_desired->v_key;
      if v_current_value is distinct from v_expected_value
         and v_current_value is distinct from v_desired_value then
        v_conflict:=v_conflict||jsonb_build_object(
          v_key,jsonb_build_object('expected',v_expected_value,'current',v_current_value,'desired',v_desired_value)
        );
      end if;
    end loop;
  end if;

  if v_conflict<>'{}'::jsonb then
    update public.ai_background_materialization_receipts
    set status='blocked_conflict',safe_through_game_day=v_safe_day,
        conflict_detail=v_conflict,last_attempted_at=now(),updated_at=now()
    where event_id=v_event.id returning * into v_receipt;
    return jsonb_build_object('receipt',to_jsonb(v_receipt),'replayed',false);
  end if;

  if v_event.entity_scope='npc' then
    if v_desired ? 'life_state' then
      v_current_value:=to_jsonb(v_character.life_state);
      v_desired_value:=v_desired->'life_state';
      if v_current_value is distinct from v_desired_value then
        update public.characters
        set life_state=v_desired->>'life_state',
            died_at=case when v_desired->>'life_state'='dead' then coalesce(died_at,now()) else null end,
            updated_at=now()
        where id=v_character.id;
        v_ops:=v_ops||jsonb_build_array(jsonb_build_object(
          'owner','characters','field','life_state','from',v_current_value,'to',v_desired_value
        ));
      else
        v_ops:=v_ops||jsonb_build_array(jsonb_build_object(
          'owner','characters','field','life_state','already_satisfied',true,'value',v_desired_value
        ));
      end if;
    end if;

    if v_desired ? 'location_id' then
      v_desired_value:=v_desired->'location_id';
      if v_desired_value<>'null'::jsonb then
        begin v_desired_location:=(v_desired->>'location_id')::uuid;
        exception when invalid_text_representation then
          raise exception using errcode='22023',message='ai_background_materialization_location_invalid';
        end;
        if not exists(
          select 1 from public.locations l
          where l.id=v_desired_location and l.campaign_id=v_event.campaign_id and l.lifecycle_state='active'
        ) then
          update public.ai_background_materialization_receipts
          set status='blocked_protection',safe_through_game_day=v_safe_day,
              conflict_detail=jsonb_build_object('reason','destination_location_not_active','location_id',v_desired_location),
              last_attempted_at=now(),updated_at=now()
          where event_id=v_event.id returning * into v_receipt;
          return jsonb_build_object('receipt',to_jsonb(v_receipt),'replayed',false);
        end if;
      else
        v_desired_location:=null;
      end if;

      v_current_value:=case when v_world.character_id is null or v_world.location_id is null
        then 'null'::jsonb else to_jsonb(v_world.location_id::text) end;

      if v_current_value is distinct from v_desired_value then
        insert into public.character_world_state(
          character_id,campaign_id,location_id,campaign_day,day_period,updated_at,updated_by
        ) values (
          v_character.id,v_event.campaign_id,v_desired_location,
          greatest(coalesce(v_world.campaign_day,1),v_event.effective_game_day),
          coalesce(v_world.day_period,'day'),now(),null
        )
        on conflict(character_id) do update set
          location_id=excluded.location_id,
          campaign_day=greatest(public.character_world_state.campaign_day,excluded.campaign_day),
          updated_at=now(),updated_by=null;

        v_ops:=v_ops||jsonb_build_array(jsonb_build_object(
          'owner','character_world_state','field','location_id','from',v_current_value,'to',v_desired_value
        ));
      else
        v_ops:=v_ops||jsonb_build_array(jsonb_build_object(
          'owner','character_world_state','field','location_id','already_satisfied',true,'value',v_desired_value
        ));
      end if;
    end if;
  else
    if v_desired ? 'lifecycle_state' then
      v_current_value:=to_jsonb(v_location.lifecycle_state);
      v_desired_value:=v_desired->'lifecycle_state';
      if v_current_value is distinct from v_desired_value then
        update public.locations
        set lifecycle_state=v_desired->>'lifecycle_state',
            archived_at=case when v_desired->>'lifecycle_state'='archived' then coalesce(archived_at,now()) else null end,
            updated_at=now()
        where id=v_location.id;
        v_ops:=v_ops||jsonb_build_array(jsonb_build_object(
          'owner','locations','field','lifecycle_state','from',v_current_value,'to',v_desired_value
        ));
      else
        v_ops:=v_ops||jsonb_build_array(jsonb_build_object(
          'owner','locations','field','lifecycle_state','already_satisfied',true,'value',v_desired_value
        ));
      end if;
    end if;
  end if;

  update public.ai_background_materialization_receipts
  set status='applied',safe_through_game_day=v_safe_day,
      applied_operations=v_ops,conflict_detail='{}'::jsonb,
      applied_at=coalesce(applied_at,now()),last_attempted_at=now(),updated_at=now()
  where event_id=v_event.id returning * into v_receipt;

  return jsonb_build_object('receipt',to_jsonb(v_receipt),'replayed',false);
end;
$function$;

CREATE OR REPLACE FUNCTION private.materialize_safe_ai_background_events_v1(p_campaign_id uuid, p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event_id uuid; v_result jsonb; v_results jsonb:='[]'::jsonb; v_count integer:=0;
begin
  if p_campaign_id is null or not private.is_ai_world_campaign_v1(p_campaign_id) then
    return jsonb_build_object('campaign_id',p_campaign_id,'processed',0,'results','[]'::jsonb);
  end if;

  for v_event_id in
    select e.id
    from public.ai_background_events e
    left join public.ai_background_materialization_receipts r on r.event_id=e.id
    where e.campaign_id=p_campaign_id
      and e.entity_scope in ('npc','location')
      and jsonb_typeof(e.effect_payload->'materialization_guard'->'desired_after')='object'
      and e.effect_payload->'materialization_guard'->'desired_after'<>'{}'::jsonb
      and coalesce(r.status,'pending') not in ('applied','no_materialization')
    order by e.effective_game_day,e.created_at,e.id
    limit greatest(1,least(coalesce(p_limit,64),256))
  loop
    v_result:=private.materialize_ai_background_event_v1(v_event_id);
    v_results:=v_results||jsonb_build_array(v_result);
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'campaign_id',p_campaign_id,
    'safe_through_game_day',private.ai_background_safe_materialization_day_v1(p_campaign_id),
    'processed',v_count,'results',v_results
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_safe_ai_background_events_v1(p_campaign_id uuid, p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.materialize_safe_ai_background_events_v1(p_campaign_id,p_limit)
$function$;

CREATE OR REPLACE FUNCTION private.ai_background_materialize_after_world_time_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.campaign_day>old.campaign_day
     and exists(
       select 1 from public.campaign_members cm
       where cm.campaign_id=new.campaign_id
         and cm.role='player'
         and cm.active_character_id=new.character_id
     )
  then
    perform private.materialize_safe_ai_background_events_v1(new.campaign_id,128);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.merge_ai_background_event_snapshot_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.entity_scope in ('world','npc','location') then
    if coalesce(new.effect_payload->>'snapshot_mode','')<>'replace' then
      raise exception using errcode='22023',message='ai_background_event_snapshot_payload_required';
    end if;
    perform private.merge_ai_background_event_snapshot_v1(new.id);
    perform private.materialize_safe_ai_background_events_v1(new.campaign_id,64);
  end if;
  return new;
end;
$function$;


revoke all on function private.ai_background_safe_materialization_day_v1(uuid)
  from public, anon, authenticated;
revoke all on function private.ai_background_materialization_guard_trigger_v1()
  from public, anon, authenticated;
revoke all on function private.ai_background_materialization_is_protected_v1(public.ai_background_events,integer)
  from public, anon, authenticated;
revoke all on function private.materialize_ai_background_event_v1(uuid)
  from public, anon, authenticated;
revoke all on function private.materialize_safe_ai_background_events_v1(uuid,integer)
  from public, anon, authenticated;
revoke all on function private.ai_background_materialize_after_world_time_v1()
  from public, anon, authenticated;
revoke all on function private.merge_ai_background_event_snapshot_trigger_v1()
  from public, anon, authenticated;

revoke all on function public.materialize_safe_ai_background_events_v1(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.materialize_safe_ai_background_events_v1(uuid,integer)
  to service_role;

create trigger ai_background_events_stage14_materialization_guard
before insert on public.ai_background_events
for each row
execute function private.ai_background_materialization_guard_trigger_v1();

create trigger character_world_state_stage14_materialize
after update of campaign_day on public.character_world_state
for each row
when (new.campaign_day>old.campaign_day)
execute function private.ai_background_materialize_after_world_time_v1();
