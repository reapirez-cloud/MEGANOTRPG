-- AI GM Stage 11: versioned replay/rollback ledger for game-chat GM turns.
-- Safe effects (chat output and still-pending roll requests) can be rolled back.
-- Mechanical/recovery/resolved-roll effects are explicitly fail-closed.

create table if not exists private.ai_gm_turn_revisions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  source_message_id bigint not null references public.chat_messages(id) on delete cascade,
  revision_no integer not null check (revision_no >= 1),
  job_id uuid not null unique references public.agent_jobs(id) on delete cascade,
  parent_revision_id uuid references private.ai_gm_turn_revisions(id) on delete set null,
  replay_mode text not null default 'initial'
    check (replay_mode in ('initial','regenerate','edit_resend')),
  source_body_before text not null default '',
  source_body_after text not null default '',
  state text not null default 'active'
    check (state in ('active','superseded','rolled_back','failed')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  superseded_at timestamptz,
  rolled_back_at timestamptz,
  unique(source_message_id,revision_no)
);

alter table private.ai_gm_turn_revisions enable row level security;

create unique index if not exists ai_gm_turn_revisions_one_active_source
  on private.ai_gm_turn_revisions(source_message_id)
  where state='active';

create index if not exists ai_gm_turn_revisions_room_created_idx
  on private.ai_gm_turn_revisions(room_id,created_at desc);

create index if not exists ai_gm_turn_revisions_parent_idx
  on private.ai_gm_turn_revisions(parent_revision_id)
  where parent_revision_id is not null;

create table if not exists private.ai_gm_turn_effects (
  id bigint generated always as identity primary key,
  revision_id uuid not null
    references private.ai_gm_turn_revisions(id) on delete cascade,
  effect_kind text not null
    check (
      effect_kind in (
        'chat_message',
        'campaign_event',
        'pending_roll_request',
        'engine_receipt',
        'recovery_receipt',
        'runtime_mechanic'
      )
    ),
  effect_ref text not null,
  reversible boolean not null,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique(revision_id,effect_kind,effect_ref)
);

alter table private.ai_gm_turn_effects enable row level security;

create index if not exists ai_gm_turn_effects_revision_reversible_idx
  on private.ai_gm_turn_effects(revision_id,reversible,rolled_back_at);

-- Backfill already-existing game-chat turns into revision 1 before replacing
-- the old one-job-per-source unique index.
insert into private.ai_gm_turn_revisions(
  campaign_id,room_id,source_message_id,revision_no,job_id,
  parent_revision_id,replay_mode,source_body_before,source_body_after,
  state,created_by,created_at,updated_at
)
select
  j.campaign_id,
  (j.input->>'room_id')::uuid,
  (j.input->>'source_chat_message_id')::bigint,
  1,
  j.id,
  null,
  'initial',
  coalesce(j.input->>'original_message',m.body,''),
  coalesce(m.body,j.input->>'original_message',''),
  'active',
  j.requested_by,
  j.created_at,
  j.updated_at
from public.agent_jobs j
join public.chat_messages m
  on m.id=(j.input->>'source_chat_message_id')::bigint
where j.job_type='conversation_turn'
  and j.input->>'surface'='game_chat_v1'
  and j.input ? 'source_chat_message_id'
  and not exists(
    select 1
    from private.ai_gm_turn_revisions r
    where r.job_id=j.id
  )
on conflict do nothing;

update public.agent_jobs j
set input=jsonb_set(
      j.input,
      '{turn_revision_id}',
      to_jsonb(r.id::text),
      true
    )
    || jsonb_build_object(
      'turn_revision_no',r.revision_no,
      'replay_mode',r.replay_mode
    ),
    updated_at=now()
from private.ai_gm_turn_revisions r
where r.job_id=j.id
  and (
    j.input->>'turn_revision_id' is distinct from r.id::text
    or j.input->>'turn_revision_no' is distinct from r.revision_no::text
  );

drop index if exists public.agent_jobs_game_chat_source_unique;

create unique index if not exists agent_jobs_game_chat_source_revision_unique
  on public.agent_jobs(
    (input->>'source_chat_message_id'),
    (coalesce(input->>'turn_revision_id','legacy'))
  )
  where job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
    and input ? 'source_chat_message_id';

create or replace function private.sync_ai_gm_turn_ledger_v1(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_revision private.ai_gm_turn_revisions%rowtype;
  v_job public.agent_jobs%rowtype;
  v_chat_count integer := 0;
  v_roll_count integer := 0;
  v_irreversible_count integer := 0;
begin
  select * into v_revision
  from private.ai_gm_turn_revisions r
  where r.job_id=p_job_id
  for update;

  if v_revision.id is null then
    return jsonb_build_object(
      'job_id',p_job_id,
      'tracked',false,
      'runtime_stage',11
    );
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id;

  if v_job.id is null then
    raise exception 'ai_gm_turn_job_not_found';
  end if;

  with linked_messages as (
    select distinct m.*
    from public.chat_messages m
    where m.turn_command_id=p_job_id
       or m.event_payload->>'gmJobId'=p_job_id::text
       or m.id in (
         select pr.request_message_id
         from public.pending_player_roll_requests pr
         where pr.gm_job_id=p_job_id
           and pr.request_message_id is not null
       )
       or m.id in (
         select pr.roll_message_id
         from public.pending_player_roll_requests pr
         where pr.gm_job_id=p_job_id
           and pr.roll_message_id is not null
       )
  )
  insert into private.ai_gm_turn_effects(
    revision_id,effect_kind,effect_ref,reversible,payload
  )
  select
    v_revision.id,
    'chat_message',
    m.id::text,
    true,
    to_jsonb(m)
  from linked_messages m
  on conflict(revision_id,effect_kind,effect_ref)
  do update set
    reversible=excluded.reversible,
    payload=excluded.payload;

  get diagnostics v_chat_count = row_count;

  insert into private.ai_gm_turn_effects(
    revision_id,effect_kind,effect_ref,reversible,payload
  )
  select
    v_revision.id,
    'campaign_event',
    e.id::text,
    true,
    to_jsonb(e)
  from public.campaign_events e
  where e.campaign_id=v_revision.campaign_id
    and e.source_kind='chat_message'
    and exists(
      select 1
      from private.ai_gm_turn_effects fx
      where fx.revision_id=v_revision.id
        and fx.effect_kind='chat_message'
        and fx.effect_ref=e.source_id
    )
  on conflict(revision_id,effect_kind,effect_ref)
  do update set
    payload=excluded.payload;

  insert into private.ai_gm_turn_effects(
    revision_id,effect_kind,effect_ref,reversible,payload
  )
  select
    v_revision.id,
    'pending_roll_request',
    pr.id::text,
    pr.status in ('pending','cancelled'),
    to_jsonb(pr)
  from public.pending_player_roll_requests pr
  where pr.gm_job_id=p_job_id
  on conflict(revision_id,effect_kind,effect_ref)
  do update set
    reversible=excluded.reversible,
    payload=excluded.payload;

  get diagnostics v_roll_count = row_count;

  insert into private.ai_gm_turn_effects(
    revision_id,effect_kind,effect_ref,reversible,payload
  )
  select
    v_revision.id,
    'engine_receipt',
    r.command_id::text,
    false,
    to_jsonb(r)
  from public.engine_command_receipts r
  where r.command_id=p_job_id
  on conflict(revision_id,effect_kind,effect_ref)
  do update set
    reversible=false,
    payload=excluded.payload;

  insert into private.ai_gm_turn_effects(
    revision_id,effect_kind,effect_ref,reversible,payload
  )
  select
    v_revision.id,
    'recovery_receipt',
    r.job_id::text,
    false,
    to_jsonb(r)
  from private.ai_gm_recovery_receipts r
  where r.job_id=p_job_id
  on conflict(revision_id,effect_kind,effect_ref)
  do update set
    reversible=false,
    payload=excluded.payload;

  if (
    v_job.result ? 'mechanic_result'
    and coalesce(v_job.result->>'reaction_mode','')='npc_action'
  ) then
    insert into private.ai_gm_turn_effects(
      revision_id,effect_kind,effect_ref,reversible,payload
    )
    values(
      v_revision.id,
      'runtime_mechanic',
      'npc_action',
      false,
      jsonb_build_object(
        'reaction_mode',v_job.result->>'reaction_mode',
        'mechanic_result',coalesce(v_job.result->'mechanic_result','{}'::jsonb)
      )
    )
    on conflict(revision_id,effect_kind,effect_ref)
    do update set
      reversible=false,
      payload=excluded.payload;
  end if;

  if v_job.result ? 'recovery_result' then
    insert into private.ai_gm_turn_effects(
      revision_id,effect_kind,effect_ref,reversible,payload
    )
    values(
      v_revision.id,
      'runtime_mechanic',
      'recovery',
      false,
      jsonb_build_object(
        'recovery_result',coalesce(v_job.result->'recovery_result','{}'::jsonb)
      )
    )
    on conflict(revision_id,effect_kind,effect_ref)
    do update set
      reversible=false,
      payload=excluded.payload;
  end if;

  select count(*)::integer into v_irreversible_count
  from private.ai_gm_turn_effects fx
  where fx.revision_id=v_revision.id
    and fx.rolled_back_at is null
    and fx.reversible=false;

  return jsonb_build_object(
    'revision_id',v_revision.id,
    'job_id',p_job_id,
    'tracked',true,
    'chat_effects',v_chat_count,
    'roll_effects',v_roll_count,
    'irreversible_effects',v_irreversible_count,
    'runtime_stage',11
  );
end;
$function$;

revoke all on function private.sync_ai_gm_turn_ledger_v1(uuid)
  from public,anon,authenticated;

create or replace function public.sync_ai_gm_turn_ledger_v1(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;
  return private.sync_ai_gm_turn_ledger_v1(p_job_id);
end;
$function$;

revoke all on function public.sync_ai_gm_turn_ledger_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.sync_ai_gm_turn_ledger_v1(uuid)
  to service_role;

create or replace function private.ai_gm_turn_has_later_messages_v1(
  p_revision_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_revision private.ai_gm_turn_revisions%rowtype;
  v_boundary bigint;
begin
  select * into v_revision
  from private.ai_gm_turn_revisions r
  where r.id=p_revision_id;

  if v_revision.id is null then return true; end if;

  select greatest(
    v_revision.source_message_id,
    coalesce(max(fx.effect_ref::bigint),v_revision.source_message_id)
  )
  into v_boundary
  from private.ai_gm_turn_effects fx
  where fx.revision_id=v_revision.id
    and fx.effect_kind='chat_message'
    and fx.effect_ref ~ '^[0-9]+$';

  return exists(
    select 1
    from public.chat_messages m
    where m.room_id=v_revision.room_id
      and m.id>v_boundary
      and not exists(
        select 1
        from private.ai_gm_turn_effects fx
        where fx.revision_id=v_revision.id
          and fx.effect_kind='chat_message'
          and fx.effect_ref=m.id::text
      )
  );
end;
$function$;

revoke all on function private.ai_gm_turn_has_later_messages_v1(uuid)
  from public,anon,authenticated;

create or replace function private.rollback_ai_gm_turn_revision_v1(
  p_revision_id uuid,
  p_next_state text,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_revision private.ai_gm_turn_revisions%rowtype;
  v_job public.agent_jobs%rowtype;
  v_irreversible integer;
  v_deleted_messages integer := 0;
  v_deleted_rolls integer := 0;
begin
  if p_next_state not in ('superseded','rolled_back') then
    raise exception 'ai_gm_rollback_state_invalid';
  end if;

  select * into v_revision
  from private.ai_gm_turn_revisions r
  where r.id=p_revision_id
  for update;

  if v_revision.id is null then
    raise exception 'ai_gm_turn_revision_not_found';
  end if;

  if v_revision.state<> 'active' then
    return jsonb_build_object(
      'revision_id',v_revision.id,
      'state',v_revision.state,
      'already_terminal',true,
      'runtime_stage',11
    );
  end if;

  select * into v_job
  from public.agent_jobs
  where id=v_revision.job_id
  for update;

  if v_job.status in ('queued','running') then
    raise exception 'ai_gm_turn_in_progress';
  end if;

  perform private.sync_ai_gm_turn_ledger_v1(v_revision.job_id);

  select count(*)::integer into v_irreversible
  from private.ai_gm_turn_effects fx
  where fx.revision_id=v_revision.id
    and fx.rolled_back_at is null
    and fx.reversible=false;

  if v_irreversible>0 then
    raise exception 'ai_gm_turn_irreversible_effects';
  end if;

  if private.ai_gm_turn_has_later_messages_v1(v_revision.id) then
    raise exception 'ai_gm_turn_has_later_messages';
  end if;

  delete from public.pending_player_roll_requests pr
  where pr.gm_job_id=v_revision.job_id
    and pr.status in ('pending','cancelled');
  get diagnostics v_deleted_rolls = row_count;

  delete from public.chat_messages m
  where exists(
    select 1
    from private.ai_gm_turn_effects fx
    where fx.revision_id=v_revision.id
      and fx.effect_kind='chat_message'
      and fx.effect_ref=m.id::text
      and fx.rolled_back_at is null
  );
  get diagnostics v_deleted_messages = row_count;

  update private.ai_gm_turn_effects
  set rolled_back_at=coalesce(rolled_back_at,now())
  where revision_id=v_revision.id
    and reversible=true;

  if v_job.status='waiting_for_user' then
    update public.agent_jobs
    set status='cancelled',
        cancel_requested=true,
        completed_at=coalesce(completed_at,now()),
        error_code='superseded_by_stage11',
        error_message=left(coalesce(p_reason,'AI GM turn rolled back.'),1200),
        result=coalesce(result,'{}'::jsonb)||jsonb_build_object(
          'stage11_rollback',jsonb_build_object(
            'revision_id',v_revision.id,
            'reason',p_reason,
            'actor_user_id',p_actor_user_id,
            'rolled_back_at',now()
          )
        ),
        updated_at=now()
    where id=v_revision.job_id;
  else
    update public.agent_jobs
    set result=coalesce(result,'{}'::jsonb)||jsonb_build_object(
          'stage11_rollback',jsonb_build_object(
            'revision_id',v_revision.id,
            'reason',p_reason,
            'actor_user_id',p_actor_user_id,
            'rolled_back_at',now()
          )
        ),
        updated_at=now()
    where id=v_revision.job_id;
  end if;

  update private.ai_gm_turn_revisions
  set state=p_next_state,
      updated_at=now(),
      superseded_at=case
        when p_next_state='superseded' then now()
        else superseded_at
      end,
      rolled_back_at=case
        when p_next_state='rolled_back' then now()
        else rolled_back_at
      end
  where id=v_revision.id;

  return jsonb_build_object(
    'revision_id',v_revision.id,
    'state',p_next_state,
    'deleted_messages',v_deleted_messages,
    'deleted_roll_requests',v_deleted_rolls,
    'runtime_stage',11
  );
end;
$function$;

revoke all on function private.rollback_ai_gm_turn_revision_v1(uuid,text,uuid,text)
  from public,anon,authenticated;

create or replace function private.reserve_ai_gm_revision_job_v1(
  p_campaign_id uuid,
  p_user_id uuid,
  p_source_chat_message_id bigint,
  p_mode text,
  p_edited_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_message public.chat_messages%rowtype;
  v_room public.chat_rooms%rowtype;
  v_character public.characters%rowtype;
  v_manager_user_id uuid;
  v_active private.ai_gm_turn_revisions%rowtype;
  v_latest private.ai_gm_turn_revisions%rowtype;
  v_revision_id uuid;
  v_revision_no integer;
  v_job_id uuid;
  v_status text;
  v_mode text := lower(trim(coalesce(p_mode,'initial')));
  v_before text;
  v_after text;
begin
  if p_campaign_id is null
     or p_user_id is null
     or p_source_chat_message_id is null
  then
    raise exception 'campaign_user_source_required';
  end if;

  if v_mode not in ('initial','regenerate','edit_resend') then
    raise exception 'ai_gm_replay_mode_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ai-gm-turn-source:'||p_source_chat_message_id::text,
      0
    )
  );

  select * into v_message
  from public.chat_messages
  where id=p_source_chat_message_id
  for update;

  if v_message.id is null then
    raise exception 'source_chat_message_not_found';
  end if;

  select * into v_room
  from public.chat_rooms
  where id=v_message.room_id;

  if v_room.id is null or v_room.campaign_id<>p_campaign_id then
    raise exception 'source_chat_room_campaign_mismatch';
  end if;

  if v_room.category<>'game'
     or v_room.room_state<>'open'
     or v_room.is_read_only
     or v_room.scene_state<>'active'
  then
    raise exception 'source_chat_room_not_active';
  end if;

  if v_message.character_id is null then
    raise exception 'source_chat_message_requires_pc';
  end if;

  select * into v_character
  from public.characters
  where id=v_message.character_id
    and campaign_id=p_campaign_id;

  if v_character.id is null
     or v_character.character_type<>'pc'
     or v_character.life_state<>'alive'
  then
    raise exception 'source_chat_message_requires_live_pc';
  end if;

  if not exists(
    select 1
    from public.campaign_members cm
    where cm.campaign_id=p_campaign_id
      and cm.user_id=p_user_id
  ) then
    raise exception 'campaign_membership_required';
  end if;

  if v_message.user_id is distinct from p_user_id
     and not private.can_manage_campaign(p_campaign_id,p_user_id)
  then
    raise exception 'source_chat_message_replay_not_allowed';
  end if;

  select cm.user_id into v_manager_user_id
  from public.campaign_members cm
  where cm.campaign_id=p_campaign_id
    and (cm.is_owner=true or cm.role='gm')
  order by cm.is_owner desc,cm.created_at asc
  limit 1;

  if v_manager_user_id is null then
    raise exception 'campaign_manager_required_for_ai_gm';
  end if;

  select * into v_active
  from private.ai_gm_turn_revisions r
  where r.source_message_id=p_source_chat_message_id
    and r.state='active'
  for update;

  select * into v_latest
  from private.ai_gm_turn_revisions r
  where r.source_message_id=p_source_chat_message_id
  order by r.revision_no desc
  limit 1;

  if v_mode='initial' then
    if v_latest.id is not null then
      select j.status into v_status
      from public.agent_jobs j
      where j.id=v_latest.job_id;

      return jsonb_build_object(
        'job_id',v_latest.job_id,
        'status',coalesce(v_status,'completed'),
        'room_id',v_message.room_id,
        'source_chat_message_id',v_message.id,
        'turn_revision_id',v_latest.id,
        'turn_revision_no',v_latest.revision_no,
        'canonical_state',v_latest.state
      );
    end if;
  else
    if v_active.id is null then
      raise exception 'ai_gm_active_revision_not_found';
    end if;

    perform private.rollback_ai_gm_turn_revision_v1(
      v_active.id,
      'superseded',
      p_user_id,
      case
        when v_mode='edit_resend' then 'edit_and_resend'
        else 'regenerate'
      end
    );
  end if;

  v_before:=v_message.body;
  v_after:=v_before;

  if v_mode='edit_resend' then
    if v_message.event_kind is not null
       or v_message.turn_command_id is not null
       or v_message.turn_component is not null
    then
      raise exception 'ai_gm_edit_requires_plain_source_message';
    end if;

    v_after:=trim(coalesce(p_edited_body,''));
    if v_after='' then
      raise exception 'edited_message_empty';
    end if;
    if char_length(v_after)>4000 then
      raise exception 'edited_message_too_long';
    end if;

    update public.chat_messages
    set body=v_after,
        edited_at=now()
    where id=v_message.id;
  end if;

  select coalesce(max(r.revision_no),0)+1
    into v_revision_no
  from private.ai_gm_turn_revisions r
  where r.source_message_id=p_source_chat_message_id;

  v_revision_id:=gen_random_uuid();

  insert into public.agent_jobs(
    campaign_id,thread_id,requested_by,agent_key,job_type,status,input,result,
    requested_outputs,completed_outputs
  )
  values(
    p_campaign_id,
    null,
    p_user_id,
    'voss',
    'conversation_turn',
    'queued',
    jsonb_build_object(
      'surface','game_chat_v1',
      'source_chat_message_id',v_message.id::text,
      'room_id',v_message.room_id::text,
      'source_character_id',v_message.character_id::text,
      'request_user_id',p_user_id::text,
      'manager_user_id',v_manager_user_id::text,
      'original_message',v_after,
      'original_author_name',v_message.author_name,
      'room_title',v_room.title,
      'location_id',v_room.location_id,
      'campaign_day',v_room.campaign_day,
      'day_period',v_room.day_period,
      'source_created_at',v_message.created_at,
      'turn_revision_id',v_revision_id::text,
      'turn_revision_no',v_revision_no,
      'replay_mode',v_mode
    ),
    jsonb_build_object(
      'surface','game_chat_v1',
      'runtime_stage',11,
      'turn_revision_id',v_revision_id,
      'turn_revision_no',v_revision_no,
      'replay_mode',v_mode
    ),
    1,
    0
  )
  returning id,status into v_job_id,v_status;

  insert into private.ai_gm_turn_revisions(
    id,campaign_id,room_id,source_message_id,revision_no,job_id,
    parent_revision_id,replay_mode,source_body_before,source_body_after,
    state,created_by
  )
  values(
    v_revision_id,p_campaign_id,v_message.room_id,v_message.id,v_revision_no,v_job_id,
    case when v_active.id is not null then v_active.id else v_latest.id end,
    v_mode,v_before,v_after,'active',p_user_id
  );

  return jsonb_build_object(
    'job_id',v_job_id,
    'status',v_status,
    'room_id',v_message.room_id,
    'source_chat_message_id',v_message.id,
    'turn_revision_id',v_revision_id,
    'turn_revision_no',v_revision_no,
    'replay_mode',v_mode
  );
end;
$function$;

revoke all on function private.reserve_ai_gm_revision_job_v1(uuid,uuid,bigint,text,text)
  from public,anon,authenticated;

create or replace function public.reserve_ai_gm_chat_turn_v1(
  p_campaign_id uuid,
  p_user_id uuid,
  p_source_chat_message_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  return private.reserve_ai_gm_revision_job_v1(
    p_campaign_id,
    p_user_id,
    p_source_chat_message_id,
    'initial',
    null
  );
end;
$function$;

revoke all on function public.reserve_ai_gm_chat_turn_v1(uuid,uuid,bigint)
  from public,anon,authenticated;
grant execute on function public.reserve_ai_gm_chat_turn_v1(uuid,uuid,bigint)
  to service_role;

create or replace function public.reserve_ai_gm_replay_v1(
  p_campaign_id uuid,
  p_user_id uuid,
  p_source_chat_message_id bigint,
  p_mode text,
  p_edited_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  return private.reserve_ai_gm_revision_job_v1(
    p_campaign_id,
    p_user_id,
    p_source_chat_message_id,
    p_mode,
    p_edited_body
  );
end;
$function$;

revoke all on function public.reserve_ai_gm_replay_v1(uuid,uuid,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.reserve_ai_gm_replay_v1(uuid,uuid,bigint,text,text)
  to service_role;

create or replace function private.resolve_ai_gm_revision_for_message_v1(
  p_message_id bigint
)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_revision_id uuid;
begin
  select r.id into v_revision_id
  from private.ai_gm_turn_revisions r
  where r.source_message_id=p_message_id
    and r.state='active'
  order by r.revision_no desc
  limit 1;

  if v_revision_id is not null then
    return v_revision_id;
  end if;

  select r.id into v_revision_id
  from private.ai_gm_turn_effects fx
  join private.ai_gm_turn_revisions r on r.id=fx.revision_id
  where fx.effect_kind='chat_message'
    and fx.effect_ref=p_message_id::text
    and r.state='active'
  order by r.revision_no desc
  limit 1;

  if v_revision_id is not null then
    return v_revision_id;
  end if;

  select r.id into v_revision_id
  from public.chat_messages m
  join private.ai_gm_turn_revisions r
    on r.job_id=m.turn_command_id
   and r.state='active'
  where m.id=p_message_id
  limit 1;

  return v_revision_id;
end;
$function$;

revoke all on function private.resolve_ai_gm_revision_for_message_v1(bigint)
  from public,anon,authenticated;

create or replace function public.get_ai_gm_turn_control_v1(
  p_message_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_revision private.ai_gm_turn_revisions%rowtype;
  v_source public.chat_messages%rowtype;
  v_job public.agent_jobs%rowtype;
  v_can_manage boolean := false;
  v_is_author boolean := false;
  v_has_irreversible boolean := false;
  v_has_later boolean := false;
  v_in_progress boolean := false;
  v_plain_source boolean := false;
  v_block_reason text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_revision
  from private.ai_gm_turn_revisions r
  where r.id=private.resolve_ai_gm_revision_for_message_v1(p_message_id);

  if v_revision.id is null then
    return jsonb_build_object(
      'tracked',false,
      'message_id',p_message_id,
      'runtime_stage',11
    );
  end if;

  if not private.is_campaign_member(v_revision.campaign_id,v_user_id) then
    raise exception 'campaign_membership_required';
  end if;

  if not private.can_read_chat_room(v_revision.room_id) then
    raise exception 'chat_room_read_required';
  end if;

  perform private.sync_ai_gm_turn_ledger_v1(v_revision.job_id);

  select * into v_source
  from public.chat_messages
  where id=v_revision.source_message_id;

  select * into v_job
  from public.agent_jobs
  where id=v_revision.job_id;

  v_can_manage:=private.can_manage_campaign(v_revision.campaign_id,v_user_id);
  v_is_author:=v_source.user_id=v_user_id;
  v_in_progress:=v_job.status in ('queued','running');
  v_plain_source:=v_source.event_kind is null
    and v_source.turn_command_id is null
    and v_source.turn_component is null;

  select exists(
    select 1
    from private.ai_gm_turn_effects fx
    where fx.revision_id=v_revision.id
      and fx.rolled_back_at is null
      and fx.reversible=false
  ) into v_has_irreversible;

  v_has_later:=private.ai_gm_turn_has_later_messages_v1(v_revision.id);

  v_block_reason:=case
    when v_in_progress then 'Ход ИИ-ГМ ещё выполняется.'
    when v_has_irreversible then
      'Ход уже изменил механику/ресурсы или использовал разрешённый бросок. Автооткат заблокирован.'
    when v_has_later then
      'После этого хода уже появились более поздние сообщения. Сначала нельзя безопасно менять прошлую ветку.'
    else null
  end;

  return jsonb_build_object(
    'tracked',true,
    'campaign_id',v_revision.campaign_id,
    'room_id',v_revision.room_id,
    'source_message_id',v_revision.source_message_id,
    'source_body',v_source.body,
    'revision_id',v_revision.id,
    'revision_no',v_revision.revision_no,
    'job_id',v_revision.job_id,
    'job_status',v_job.status,
    'replay_mode',v_revision.replay_mode,
    'can_manage',v_can_manage,
    'is_source_author',v_is_author,
    'can_regenerate',(v_is_author or v_can_manage)
      and not v_in_progress
      and not v_has_irreversible
      and not v_has_later,
    'can_edit_resend',(v_is_author or v_can_manage)
      and v_plain_source
      and not v_in_progress
      and not v_has_irreversible
      and not v_has_later,
    'can_undo',v_can_manage
      and not v_in_progress
      and not v_has_irreversible
      and not v_has_later,
    'block_reason',v_block_reason,
    'runtime_stage',11
  );
end;
$function$;

revoke all on function public.get_ai_gm_turn_control_v1(bigint)
  from public,anon;
grant execute on function public.get_ai_gm_turn_control_v1(bigint)
  to authenticated,service_role;

create or replace function public.undo_ai_gm_turn_v1(
  p_message_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_revision private.ai_gm_turn_revisions%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_revision
  from private.ai_gm_turn_revisions r
  where r.id=private.resolve_ai_gm_revision_for_message_v1(p_message_id)
  for update;

  if v_revision.id is null then
    raise exception 'ai_gm_active_revision_not_found';
  end if;

  if not private.can_manage_campaign(v_revision.campaign_id,v_user_id) then
    raise exception 'campaign_manager_required';
  end if;

  v_result:=private.rollback_ai_gm_turn_revision_v1(
    v_revision.id,
    'rolled_back',
    v_user_id,
    'manual_undo'
  );

  if v_revision.replay_mode='edit_resend'
     and v_revision.source_body_before is distinct from v_revision.source_body_after
  then
    update public.chat_messages
    set body=v_revision.source_body_before,
        edited_at=now()
    where id=v_revision.source_message_id;
  end if;

  return v_result||jsonb_build_object(
    'source_message_id',v_revision.source_message_id,
    'source_body_restored',
      v_revision.replay_mode='edit_resend'
      and v_revision.source_body_before is distinct from v_revision.source_body_after
  );
end;
$function$;

revoke all on function public.undo_ai_gm_turn_v1(bigint)
  from public,anon;
grant execute on function public.undo_ai_gm_turn_v1(bigint)
  to authenticated,service_role;

create or replace function public.edit_chat_message(
  p_message_id bigint,
  p_body text
)
returns void
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_user_id uuid;
  v_room_id uuid;
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists(
    select 1
    from private.ai_gm_turn_revisions r
    where r.source_message_id=p_message_id
      and r.state='active'
  ) then
    raise exception 'ai_gm_source_message_use_edit_resend';
  end if;

  v_body:=trim(coalesce(p_body,''));
  if v_body='' then raise exception 'Message cannot be empty'; end if;
  if char_length(v_body)>4000 then raise exception 'Message is too long'; end if;

  select user_id,room_id into v_user_id,v_room_id
  from public.chat_messages
  where id=p_message_id;

  if v_room_id is null then raise exception 'Message not found'; end if;
  if v_user_id is distinct from auth.uid() then
    raise exception 'Only the author can edit this message';
  end if;
  if not private.can_write_chat_room(v_room_id) then
    raise exception 'You cannot write in this room';
  end if;

  update public.chat_messages
  set body=v_body,edited_at=now()
  where id=p_message_id;
end;
$function$;

create or replace function public.delete_chat_message(
  p_message_id bigint
)
returns void
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_user_id uuid;
  v_room_id uuid;
  v_campaign_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if private.resolve_ai_gm_revision_for_message_v1(p_message_id) is not null then
    raise exception 'ai_gm_message_use_stage11_rollback';
  end if;

  select m.user_id,m.room_id,r.campaign_id
    into v_user_id,v_room_id,v_campaign_id
  from public.chat_messages m
  join public.chat_rooms r on r.id=m.room_id
  where m.id=p_message_id;

  if v_room_id is null then raise exception 'Message not found'; end if;

  if not (
    v_user_id=auth.uid()
    or private.can_manage_campaign(v_campaign_id)
  ) then
    raise exception 'Not allowed to delete this message';
  end if;

  if not private.can_read_chat_room(v_room_id)
     and not private.can_manage_campaign(v_campaign_id)
  then
    raise exception 'You cannot access this room';
  end if;

  delete from public.chat_messages where id=p_message_id;
end;
$function$;
