-- AI GM Stage 12: cooperative scene sequencing, explicit dialogue audience,
-- NPC text inventory, durable status read model, and location-scoped memory events.

alter table public.chat_messages
  add column if not exists audience_scope text not null default 'scene',
  add column if not exists recipient_character_ids uuid[] not null default '{}'::uuid[];

alter table public.chat_messages
  drop constraint if exists chat_messages_audience_scope_check;
alter table public.chat_messages
  add constraint chat_messages_audience_scope_check
  check (audience_scope in ('scene','direct_pc'));

create index if not exists chat_messages_recipients_gin_idx
  on public.chat_messages using gin(recipient_character_ids);

alter table public.npc_profiles
  add column if not exists inventory_text text not null default '',
  add column if not exists inventory_data jsonb not null default '[]'::jsonb;

alter table public.npc_profiles
  drop constraint if exists npc_profiles_inventory_data_array_check;
alter table public.npc_profiles
  add constraint npc_profiles_inventory_data_array_check
  check (jsonb_typeof(inventory_data)='array');

comment on column public.npc_profiles.inventory_text is
  'Canonical lightweight NPC inventory description. Does not create physical Cheburashka item instances.';
comment on column public.npc_profiles.inventory_data is
  'Structured lightweight NPC possessions. Physical item instances are materialized only when mechanics/transfer require them.';

create or replace function private.validate_chat_message_audience_stage12_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign_id uuid;
  v_source_location_id uuid;
  v_bad_recipient uuid;
begin
  new.recipient_character_ids := coalesce(new.recipient_character_ids,'{}'::uuid[]);

  if new.audience_scope='scene' then
    if cardinality(new.recipient_character_ids)<>0 then
      raise exception 'scene_message_cannot_have_direct_recipients';
    end if;
    return new;
  end if;

  if new.audience_scope<>'direct_pc' then
    raise exception 'chat_message_audience_scope_invalid';
  end if;

  if new.character_id is null then
    raise exception 'direct_pc_requires_character_author';
  end if;

  if cardinality(new.recipient_character_ids)<1 then
    raise exception 'direct_pc_requires_recipient';
  end if;

  if new.character_id=any(new.recipient_character_ids) then
    raise exception 'direct_pc_cannot_target_self';
  end if;

  if (
    select count(distinct x)
    from unnest(new.recipient_character_ids) x
  ) <> cardinality(new.recipient_character_ids) then
    raise exception 'direct_pc_duplicate_recipient';
  end if;

  select r.campaign_id
    into v_campaign_id
  from public.chat_rooms r
  where r.id=new.room_id;

  if v_campaign_id is null then
    raise exception 'chat_room_not_found';
  end if;

  select ws.location_id
    into v_source_location_id
  from public.character_world_state ws
  where ws.campaign_id=v_campaign_id
    and ws.character_id=new.character_id;

  if v_source_location_id is null then
    raise exception 'direct_pc_source_location_required';
  end if;

  select x
    into v_bad_recipient
  from unnest(new.recipient_character_ids) x
  left join public.characters c
    on c.id=x
   and c.campaign_id=v_campaign_id
   and c.character_type='pc'
   and c.life_state='alive'
   and c.publication_state='campaign'
  left join public.character_world_state ws
    on ws.campaign_id=v_campaign_id
   and ws.character_id=x
  where c.id is null
     or ws.location_id is distinct from v_source_location_id
  limit 1;

  if v_bad_recipient is not null then
    raise exception 'direct_pc_recipient_not_present';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_chat_message_audience_stage12_v1()
  from public,anon,authenticated;

drop trigger if exists validate_chat_message_audience_stage12_v1
  on public.chat_messages;
create trigger validate_chat_message_audience_stage12_v1
before insert or update of audience_scope,recipient_character_ids,character_id,room_id
on public.chat_messages
for each row
execute function private.validate_chat_message_audience_stage12_v1();

create or replace function public.list_pc_dialogue_recipients_v1(
  p_room_id uuid,
  p_source_character_id uuid
)
returns table(
  character_id uuid,
  character_name text,
  location_id uuid
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_source_location_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select r.campaign_id
    into v_campaign_id
  from public.chat_rooms r
  where r.id=p_room_id;

  if v_campaign_id is null
     or not private.can_read_chat_room(p_room_id)
     or not private.can_write_chat_room(p_room_id)
  then
    raise exception 'chat_room_write_required';
  end if;

  if not exists(
    select 1
    from public.characters c
    where c.id=p_source_character_id
      and c.campaign_id=v_campaign_id
      and c.character_type='pc'
      and c.life_state='alive'
      and c.publication_state='campaign'
      and (
        c.assigned_user_id=v_user_id
        or private.can_manage_campaign(v_campaign_id,v_user_id)
      )
  ) then
    raise exception 'source_character_not_authorized';
  end if;

  select ws.location_id
    into v_source_location_id
  from public.character_world_state ws
  where ws.campaign_id=v_campaign_id
    and ws.character_id=p_source_character_id;

  if v_source_location_id is null then
    return;
  end if;

  return query
  select c.id,c.name,ws.location_id
  from public.characters c
  join public.character_world_state ws
    on ws.campaign_id=c.campaign_id
   and ws.character_id=c.id
  where c.campaign_id=v_campaign_id
    and c.character_type='pc'
    and c.life_state='alive'
    and c.publication_state='campaign'
    and c.id<>p_source_character_id
    and ws.location_id=v_source_location_id
  order by c.name,c.id;
end;
$$;

revoke all on function public.list_pc_dialogue_recipients_v1(uuid,uuid)
  from public,anon;
grant execute on function public.list_pc_dialogue_recipients_v1(uuid,uuid)
  to authenticated,service_role;

create table if not exists private.ai_gm_scene_sequence_state (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scene_key text not null,
  next_sequence bigint not null default 1 check(next_sequence>=1),
  updated_at timestamptz not null default now(),
  primary key(campaign_id,scene_key)
);

alter table private.ai_gm_scene_sequence_state enable row level security;

create or replace function private.assign_ai_gm_scene_sequence_stage12_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_room_id uuid;
  v_source_character_id uuid;
  v_location_id uuid;
  v_scene_key text;
  v_sequence bigint;
begin
  if new.job_type<>'conversation_turn'
     or new.input->>'surface'<>'game_chat_v1'
  then
    return new;
  end if;

  begin
    v_room_id := (new.input->>'room_id')::uuid;
    v_source_character_id := (new.input->>'source_character_id')::uuid;
  exception when others then
    return new;
  end;

  select ws.location_id
    into v_location_id
  from public.character_world_state ws
  where ws.campaign_id=new.campaign_id
    and ws.character_id=v_source_character_id;

  if v_location_id is null then
    select r.location_id
      into v_location_id
    from public.chat_rooms r
    where r.id=v_room_id
      and r.campaign_id=new.campaign_id;
  end if;

  -- A character keeps one persistent game dialogue while physical location changes.
  -- Queue identity therefore follows the room, never the mutable location.
  v_scene_key := 'room:'||v_room_id::text;

  insert into private.ai_gm_scene_sequence_state(
    campaign_id,scene_key,next_sequence,updated_at
  )
  values(new.campaign_id,v_scene_key,2,now())
  on conflict(campaign_id,scene_key) do update set
    next_sequence=private.ai_gm_scene_sequence_state.next_sequence+1,
    updated_at=now()
  returning next_sequence-1 into v_sequence;

  new.input := coalesce(new.input,'{}'::jsonb)||jsonb_build_object(
    'scene_key',v_scene_key,
    'scene_sequence',v_sequence,
    'source_location_id_snapshot',v_location_id
  );

  return new;
end;
$$;

revoke all on function private.assign_ai_gm_scene_sequence_stage12_v1()
  from public,anon,authenticated;

drop trigger if exists assign_ai_gm_scene_sequence_stage12_v1
  on public.agent_jobs;
create trigger assign_ai_gm_scene_sequence_stage12_v1
before insert on public.agent_jobs
for each row
execute function private.assign_ai_gm_scene_sequence_stage12_v1();

create index if not exists agent_jobs_game_chat_scene_queue_idx
  on public.agent_jobs(
    campaign_id,
    (input->>'scene_key'),
    ((input->>'scene_sequence')::bigint),
    status
  )
  where job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
    and input ? 'scene_key'
    and input ? 'scene_sequence';

create or replace function public.claim_ai_gm_scene_job_v1(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_scene_key text;
  v_sequence bigint;
  v_now timestamptz := now();
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  select *
    into v_job
  from public.agent_jobs j
  where j.id=p_job_id
  for update;

  if v_job.id is null or v_job.status<>'queued' then
    return null;
  end if;

  v_scene_key:=nullif(v_job.input->>'scene_key','');
  v_sequence:=nullif(v_job.input->>'scene_sequence','')::bigint;

  if v_scene_key is null or v_sequence is null then
    update public.agent_jobs
    set status='running',
        started_at=coalesce(started_at,v_now),
        updated_at=v_now
    where id=p_job_id
      and status='queued'
    returning * into v_job;

    if v_job.id is null then return null; end if;
    return jsonb_build_object(
      'id',v_job.id,
      'input',v_job.input,
      'result',v_job.result
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_job.campaign_id::text||':'||v_scene_key,
      0
    )
  );

  if exists(
    select 1
    from public.agent_jobs earlier
    where earlier.campaign_id=v_job.campaign_id
      and earlier.job_type='conversation_turn'
      and earlier.input->>'surface'='game_chat_v1'
      and earlier.input->>'scene_key'=v_scene_key
      and nullif(earlier.input->>'scene_sequence','')::bigint<v_sequence
      and earlier.status in ('queued','running','waiting_for_user')
  ) then
    return null;
  end if;

  update public.agent_jobs
  set status='running',
      started_at=coalesce(started_at,v_now),
      updated_at=v_now
  where id=p_job_id
    and status='queued'
  returning * into v_job;

  if v_job.id is null then return null; end if;

  return jsonb_build_object(
    'id',v_job.id,
    'input',v_job.input,
    'result',v_job.result
  );
end;
$$;

revoke all on function public.claim_ai_gm_scene_job_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.claim_ai_gm_scene_job_v1(uuid)
  to service_role;

create or replace function public.next_ai_gm_scene_job_v1(
  p_completed_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_scene_key text;
  v_sequence bigint;
  v_next uuid;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_completed_job_id;

  if v_job.id is null then return null; end if;

  v_scene_key:=nullif(v_job.input->>'scene_key','');
  v_sequence:=nullif(v_job.input->>'scene_sequence','')::bigint;
  if v_scene_key is null or v_sequence is null then return null; end if;

  select j.id into v_next
  from public.agent_jobs j
  where j.campaign_id=v_job.campaign_id
    and j.job_type='conversation_turn'
    and j.input->>'surface'='game_chat_v1'
    and j.input->>'scene_key'=v_scene_key
    and nullif(j.input->>'scene_sequence','')::bigint>v_sequence
    and j.status='queued'
  order by nullif(j.input->>'scene_sequence','')::bigint,j.created_at,j.id
  limit 1;

  return v_next;
end;
$$;

revoke all on function public.next_ai_gm_scene_job_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.next_ai_gm_scene_job_v1(uuid)
  to service_role;

create or replace function public.set_npc_text_inventory_v1(
  p_campaign_id uuid,
  p_npc_character_id uuid,
  p_inventory_text text,
  p_inventory_data jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.npc_profiles%rowtype;
  v_data jsonb := coalesce(p_inventory_data,'[]'::jsonb);
begin
  if auth.role()<>'service_role' then
    if v_user_id is null
       or not private.can_manage_campaign(p_campaign_id,v_user_id)
    then
      raise exception 'campaign_manager_required';
    end if;
  end if;

  if jsonb_typeof(v_data)<>'array' or jsonb_array_length(v_data)>80 then
    raise exception 'npc_text_inventory_invalid';
  end if;

  update public.npc_profiles p
  set inventory_text=left(coalesce(p_inventory_text,''),12000),
      inventory_data=v_data,
      updated_at=now(),
      updated_by=coalesce(v_user_id,p.updated_by)
  where p.character_id=p_npc_character_id
    and p.campaign_id=p_campaign_id
  returning * into v_profile;

  if v_profile.character_id is null then
    raise exception 'npc_profile_not_found';
  end if;

  return jsonb_build_object(
    'character_id',v_profile.character_id,
    'inventory_text',v_profile.inventory_text,
    'inventory_data',v_profile.inventory_data,
    'physical_items_created',false
  );
end;
$$;

revoke all on function public.set_npc_text_inventory_v1(uuid,uuid,text,jsonb)
  from public,anon;
grant execute on function public.set_npc_text_inventory_v1(uuid,uuid,text,jsonb)
  to authenticated,service_role;

create or replace function public.get_ai_gm_room_status_v1(
  p_room_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.chat_rooms%rowtype;
  v_job public.agent_jobs%rowtype;
  v_media_status text;
  v_phase text;
  v_label text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_room
  from public.chat_rooms r
  where r.id=p_room_id;

  if v_room.id is null or not private.can_read_chat_room(p_room_id) then
    raise exception 'chat_room_read_required';
  end if;

  select * into v_job
  from public.agent_jobs j
  where j.campaign_id=v_room.campaign_id
    and j.job_type='conversation_turn'
    and j.input->>'surface'='game_chat_v1'
    and j.input->>'room_id'=p_room_id::text
  order by j.created_at desc,j.id desc
  limit 1;

  if v_job.id is null then
    return jsonb_build_object(
      'active',false,
      'phase','idle',
      'label','ИИ-ГМ готов',
      'room_id',p_room_id,
      'runtime_stage',12
    );
  end if;

  select l.status into v_media_status
  from private.ai_gm_media_lifecycle l
  where l.campaign_id=v_room.campaign_id
    and l.source_character_id=nullif(v_job.input->>'source_character_id','')::uuid
    and l.status in ('pending','queued','running')
    and l.updated_at>=v_job.created_at
  order by l.updated_at desc
  limit 1;

  v_phase:=case
    when v_job.status='queued' then 'queued'
    when v_job.status='running' then
      coalesce(nullif(v_job.result->>'runtime_phase',''),'thinking')
    when v_job.status='waiting_for_user' then 'waiting_for_roll'
    when v_job.status='failed' then 'failed'
    when v_job.status='cancelled' then 'cancelled'
    when v_job.status='completed' and v_media_status is not null then 'generating_art'
    when v_job.status='completed' then 'completed'
    else v_job.status
  end;

  v_label:=case v_phase
    when 'queued' then 'ИИ-ГМ ждёт очередь сцены'
    when 'thinking' then 'ИИ-ГМ думает'
    when 'applying' then 'ИИ-ГМ применяет изменения'
    when 'waiting_for_roll' then 'ИИ-ГМ ждёт бросок'
    when 'generating_art' then 'ИИ-ГМ генерирует арт'
    when 'completed' then 'Ход ИИ-ГМ завершён'
    when 'failed' then 'Ошибка хода ИИ-ГМ'
    when 'cancelled' then 'Ход ИИ-ГМ отменён'
    else 'ИИ-ГМ: '||v_phase
  end;

  return jsonb_build_object(
    'active',v_phase in ('queued','thinking','applying','waiting_for_roll','generating_art'),
    'phase',v_phase,
    'label',v_label,
    'job_id',v_job.id,
    'job_status',v_job.status,
    'source_message_id',v_job.input->>'source_chat_message_id',
    'scene_key',v_job.input->>'scene_key',
    'scene_sequence',v_job.input->>'scene_sequence',
    'error_code',v_job.error_code,
    'error_message',v_job.error_message,
    'updated_at',v_job.updated_at,
    'runtime_stage',12
  );
end;
$$;

revoke all on function public.get_ai_gm_room_status_v1(uuid)
  from public,anon;
grant execute on function public.get_ai_gm_room_status_v1(uuid)
  to authenticated,service_role;

create or replace function private.sync_campaign_memory_chat_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_message public.chat_messages%rowtype;
  v_room public.chat_rooms%rowtype;
  v_summary text;
  v_location_id uuid;
  v_participants uuid[];
begin
  if tg_op='DELETE' then
    delete from public.campaign_events
    where source_kind='chat_message'
      and source_id=old.id::text;
    return old;
  end if;

  v_message:=new;

  select * into v_room
  from public.chat_rooms
  where id=v_message.room_id;

  if v_room.id is null or v_room.category<>'game' then
    delete from public.campaign_events
    where source_kind='chat_message'
      and source_id=v_message.id::text;
    return new;
  end if;

  if v_message.character_id is not null then
    select ws.location_id into v_location_id
    from public.character_world_state ws
    where ws.campaign_id=v_room.campaign_id
      and ws.character_id=v_message.character_id;
  end if;
  v_location_id:=coalesce(v_location_id,v_room.location_id);

  v_participants:=coalesce(v_message.recipient_character_ids,'{}'::uuid[]);
  if v_message.character_id is not null
     and not (v_message.character_id=any(v_participants))
  then
    v_participants:=array_prepend(v_message.character_id,v_participants);
  end if;

  v_summary:=left(
    case
      when nullif(btrim(coalesce(v_message.body,'')),'') is not null
        then coalesce(nullif(btrim(v_message.author_name),''),'Участник')||': '||btrim(v_message.body)
      when v_message.attachment_kind='image'
        then coalesce(nullif(btrim(v_message.author_name),''),'Участник')||': [изображение]'
      when v_message.event_kind is not null
        then coalesce(nullif(btrim(v_message.author_name),''),'Участник')||': '||v_message.event_kind
      else coalesce(nullif(btrim(v_message.author_name),''),'Участник')
    end,
    6000
  );

  insert into public.campaign_events(
    campaign_id,event_type,source_kind,source_id,room_id,location_id,
    actor_character_id,participant_character_ids,summary,payload,
    importance,visibility,visible_character_ids,confidence,provenance,occurred_at
  )
  values(
    v_room.campaign_id,
    case
      when v_message.event_kind is null then 'chat.message'
      else 'gameplay.'||v_message.event_kind
    end,
    'chat_message',
    v_message.id::text,
    v_room.id,
    v_location_id,
    v_message.character_id,
    v_participants,
    v_summary,
    jsonb_build_object(
      'message_id',v_message.id,
      'event_kind',v_message.event_kind,
      'event_payload',coalesce(v_message.event_payload,'{}'::jsonb),
      'attachment_kind',v_message.attachment_kind,
      'room_type',v_room.room_type,
      'room_title',v_room.title,
      'campaign_day',v_room.campaign_day,
      'day_period',v_room.day_period,
      'edited_at',v_message.edited_at,
      'audience_scope',v_message.audience_scope,
      'recipient_character_ids',v_message.recipient_character_ids
    ),
    case when v_message.event_kind is null then 1 else 2 end,
    case when v_message.audience_scope='direct_pc'
      then 'characters' else 'room' end,
    case when v_message.audience_scope='direct_pc'
      then v_participants else '{}'::uuid[] end,
    1,
    jsonb_build_object(
      'table','chat_messages',
      'message_id',v_message.id,
      'client_id',v_message.client_id,
      'location_snapshot',v_location_id
    ),
    v_message.created_at
  )
  on conflict(campaign_id,source_kind,source_id)
  do update set
    event_type=excluded.event_type,
    room_id=excluded.room_id,
    location_id=excluded.location_id,
    actor_character_id=excluded.actor_character_id,
    participant_character_ids=excluded.participant_character_ids,
    summary=excluded.summary,
    payload=excluded.payload,
    importance=excluded.importance,
    visibility=excluded.visibility,
    visible_character_ids=excluded.visible_character_ids,
    confidence=excluded.confidence,
    provenance=excluded.provenance,
    occurred_at=excluded.occurred_at;

  return new;
end;
$$;

revoke all on function private.sync_campaign_memory_chat_event()
  from public,anon,authenticated;
