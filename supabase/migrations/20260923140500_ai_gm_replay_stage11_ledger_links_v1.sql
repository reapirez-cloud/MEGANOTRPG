-- AI GM Stage 11 hardening: include job result reply_message_id(s) in the rollback ledger.

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

  with result_message_ids as (
    select (v_job.result->>'reply_message_id')::bigint as id
    where coalesce(v_job.result->>'reply_message_id','') ~ '^[0-9]+$'
    union
    select value::bigint
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(v_job.result->'reply_message_ids')='array'
          then v_job.result->'reply_message_ids'
        else '[]'::jsonb
      end
    ) value
    where value ~ '^[0-9]+$'
  ),
  linked_messages as (
    select distinct m.*
    from public.chat_messages m
    where m.turn_command_id=p_job_id
       or m.event_payload->>'gmJobId'=p_job_id::text
       or m.id in (select id from result_message_ids)
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
