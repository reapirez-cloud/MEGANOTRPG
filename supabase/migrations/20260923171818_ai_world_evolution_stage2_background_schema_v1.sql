-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 2: temporal-safe background simulation storage.
-- Stage 3 owns entity/detail/disabled classification; this migration deliberately does not pre-empt it.

create table public.ai_background_daily_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_day integer not null check (campaign_day >= 1),
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  world_roll_receipt_id uuid references public.ai_world_random_receipts(id) on delete restrict,
  eligible_npc_count integer not null default 0 check (eligible_npc_count >= 0),
  selected_npc_count integer not null default 0 check (selected_npc_count >= 0),
  eligible_location_count integer not null default 0 check (eligible_location_count >= 0),
  selected_location_count integer not null default 0 check (selected_location_count >= 0),
  worker_model text not null default 'deepseek-v4.1-flash',
  worker_input jsonb not null default '{}'::jsonb check (jsonb_typeof(worker_input) = 'object'),
  worker_output jsonb not null default '{}'::jsonb check (jsonb_typeof(worker_output) = 'object'),
  audit jsonb not null default '{}'::jsonb check (jsonb_typeof(audit) = 'object'),
  failure_code text,
  failure_detail text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, campaign_day),
  unique (id, campaign_id, campaign_day),
  check (selected_npc_count <= eligible_npc_count),
  check (selected_location_count <= eligible_location_count),
  check (length(worker_model) between 1 and 160)
);

comment on table public.ai_background_daily_runs is
  'AI-world-only daily background simulation reservation. Exactly one row may exist per campaign game day.';

create table public.ai_background_rolls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  campaign_id uuid not null,
  campaign_day integer not null check (campaign_day >= 1),
  resolver_receipt_id uuid not null unique references public.ai_world_random_receipts(id) on delete restrict,
  decision_key text not null,
  decision_kind text not null,
  target_scope text,
  target_id text,
  sides integer not null check (sides between 1 and 1000000),
  result integer not null check (result between 1 and sides),
  outcome_bands jsonb not null default '[]'::jsonb check (jsonb_typeof(outcome_bands) = 'array'),
  matched_outcome_key text,
  matched_outcome jsonb,
  created_at timestamptz not null default now(),
  foreign key (run_id, campaign_id, campaign_day)
    references public.ai_background_daily_runs(id, campaign_id, campaign_day) on delete cascade,
  unique (run_id, decision_key)
);

comment on table public.ai_background_rolls is
  'Immutable background-run projection of Stage 1 World Resolver receipts. Numeric results are copied only from the authoritative resolver receipt.';

create table public.ai_background_events (
  id uuid primary key,
  campaign_id uuid not null,
  run_id uuid not null,
  effective_game_day integer not null check (effective_game_day >= 1),
  event_key text not null,
  entity_scope text not null check (entity_scope ~ '^[a-z][a-z0-9._:-]{0,79}$'),
  entity_id text not null check (length(btrim(entity_id)) between 1 and 240),
  event_kind text not null check (event_kind ~ '^[a-z][a-z0-9._:-]{0,119}$'),
  summary text not null check (length(summary) between 1 and 6000),
  effect_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(effect_payload) = 'object'),
  importance smallint not null default 2 check (importance between 0 and 5),
  campaign_event_id uuid unique references public.campaign_events(id) on delete set null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (run_id, campaign_id, effective_game_day)
    references public.ai_background_daily_runs(id, campaign_id, campaign_day) on delete cascade,
  unique (run_id, event_key)
);

comment on table public.ai_background_events is
  'Immutable background history with explicit effective game day, mirrored into campaign_events for shared provenance without mutating live canon.';

create table public.ai_background_entity_snapshots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  run_id uuid not null,
  through_game_day integer not null check (through_game_day >= 1),
  snapshot_key text not null,
  entity_scope text not null check (entity_scope ~ '^[a-z][a-z0-9._:-]{0,79}$'),
  entity_id text not null check (length(btrim(entity_id)) between 1 and 240),
  version integer not null check (version >= 1),
  summary text not null default '' check (length(summary) <= 6000),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  source_event_id uuid references public.ai_background_events(id) on delete set null,
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (run_id, campaign_id, through_game_day)
    references public.ai_background_daily_runs(id, campaign_id, campaign_day) on delete cascade,
  unique (campaign_id, entity_scope, entity_id, version),
  unique (run_id, snapshot_key)
);

comment on table public.ai_background_entity_snapshots is
  'Immutable versioned compact background state. Readers choose the newest through_game_day not later than their source scene day.';

create index ai_background_daily_runs_status_idx
  on public.ai_background_daily_runs(campaign_id, status, campaign_day desc);
create index ai_background_rolls_run_idx
  on public.ai_background_rolls(run_id, created_at);
create index ai_background_events_temporal_idx
  on public.ai_background_events(campaign_id, entity_scope, entity_id, effective_game_day desc, created_at desc);
create index ai_background_events_run_idx
  on public.ai_background_events(run_id, created_at);
create index ai_background_snapshots_temporal_idx
  on public.ai_background_entity_snapshots(campaign_id, entity_scope, entity_id, through_game_day desc, version desc);

alter table public.ai_background_daily_runs enable row level security;
alter table public.ai_background_rolls enable row level security;
alter table public.ai_background_events enable row level security;
alter table public.ai_background_entity_snapshots enable row level security;

revoke all on table public.ai_background_daily_runs from public, anon, authenticated, service_role;
revoke all on table public.ai_background_rolls from public, anon, authenticated, service_role;
revoke all on table public.ai_background_events from public, anon, authenticated, service_role;
revoke all on table public.ai_background_entity_snapshots from public, anon, authenticated, service_role;
grant select on table public.ai_background_daily_runs to service_role;
grant select on table public.ai_background_rolls to service_role;
grant select on table public.ai_background_events to service_role;
grant select on table public.ai_background_entity_snapshots to service_role;

create or replace function private.guard_ai_background_ai_world_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_ai_world_campaign_v1(new.campaign_id) then
    raise exception using errcode = '42501', message = 'ai_background_ai_world_only';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_ai_background_ai_world_v1() from public, anon, authenticated;

create trigger ai_background_daily_runs_ai_world_guard
before insert or update on public.ai_background_daily_runs
for each row execute function private.guard_ai_background_ai_world_v1();
create trigger ai_background_rolls_ai_world_guard
before insert or update on public.ai_background_rolls
for each row execute function private.guard_ai_background_ai_world_v1();
create trigger ai_background_events_ai_world_guard
before insert or update on public.ai_background_events
for each row execute function private.guard_ai_background_ai_world_v1();
create trigger ai_background_snapshots_ai_world_guard
before insert or update on public.ai_background_entity_snapshots
for each row execute function private.guard_ai_background_ai_world_v1();

create or replace function public.reserve_ai_background_daily_run_v1(
  p_campaign_id uuid, p_campaign_day integer,
  p_worker_model text default 'deepseek-v4.1-flash',
  p_audit jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_model text := btrim(coalesce(p_worker_model, ''));
  v_audit jsonb := coalesce(p_audit, '{}'::jsonb);
  v_existing public.ai_background_daily_runs%rowtype;
  v_created public.ai_background_daily_runs%rowtype;
begin
  if p_campaign_id is null or p_campaign_day is null or p_campaign_day < 1 then
    raise exception using errcode='22023', message='ai_background_run_input_invalid';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501', message='ai_background_ai_world_only';
  end if;
  if length(v_model) < 1 or length(v_model) > 160 then
    raise exception using errcode='22023', message='ai_background_worker_model_invalid';
  end if;
  if jsonb_typeof(v_audit) <> 'object' then
    raise exception using errcode='22023', message='ai_background_audit_must_be_object';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text || ':background-day:' || p_campaign_day::text, 0)
  );

  select * into v_existing from public.ai_background_daily_runs
  where campaign_id=p_campaign_id and campaign_day=p_campaign_day;
  if found then
    return jsonb_build_object('run',to_jsonb(v_existing),'replayed',true);
  end if;

  insert into public.ai_background_daily_runs(campaign_id,campaign_day,worker_model,audit)
  values(p_campaign_id,p_campaign_day,v_model,v_audit)
  returning * into v_created;
  return jsonb_build_object('run',to_jsonb(v_created),'replayed',false);
end;
$$;

create or replace function public.record_ai_background_roll_v1(
  p_run_id uuid, p_resolver_receipt_id uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.ai_background_daily_runs%rowtype;
  v_receipt public.ai_world_random_receipts%rowtype;
  v_existing public.ai_background_rolls%rowtype;
  v_created public.ai_background_rolls%rowtype;
begin
  if p_run_id is null or p_resolver_receipt_id is null then
    raise exception using errcode='22023', message='ai_background_roll_input_invalid';
  end if;
  select * into v_run from public.ai_background_daily_runs where id=p_run_id for update;
  if v_run.id is null then
    raise exception using errcode='P0002', message='ai_background_run_not_found';
  end if;
  if not private.is_ai_world_campaign_v1(v_run.campaign_id) then
    raise exception using errcode='42501', message='ai_background_ai_world_only';
  end if;

  select * into v_receipt from public.ai_world_random_receipts where id=p_resolver_receipt_id;
  if v_receipt.id is null then
    raise exception using errcode='P0002', message='ai_background_resolver_receipt_not_found';
  end if;
  if v_receipt.campaign_id <> v_run.campaign_id
     or v_receipt.campaign_day is distinct from v_run.campaign_day
     or v_receipt.run_key is distinct from v_run.id::text then
    raise exception using errcode='22023', message='ai_background_resolver_receipt_mismatch';
  end if;

  select * into v_existing from public.ai_background_rolls
  where resolver_receipt_id=p_resolver_receipt_id;
  if found then
    if v_existing.run_id <> v_run.id then
      raise exception using errcode='22023', message='ai_background_roll_receipt_already_bound';
    end if;
    return jsonb_build_object('roll',to_jsonb(v_existing),'replayed',true);
  end if;

  insert into public.ai_background_rolls(
    run_id,campaign_id,campaign_day,resolver_receipt_id,decision_key,decision_kind,
    target_scope,target_id,sides,result,outcome_bands,matched_outcome_key,matched_outcome
  ) values (
    v_run.id,v_run.campaign_id,v_run.campaign_day,v_receipt.id,v_receipt.decision_key,
    v_receipt.decision_kind,v_receipt.target_scope,v_receipt.target_id,v_receipt.sides,
    v_receipt.result,v_receipt.outcome_bands,v_receipt.matched_outcome_key,v_receipt.matched_outcome
  ) returning * into v_created;

  if v_receipt.target_scope='world' then
    if v_run.world_roll_receipt_id is not null and v_run.world_roll_receipt_id<>v_receipt.id then
      raise exception using errcode='22023', message='ai_background_world_roll_already_bound';
    end if;
    update public.ai_background_daily_runs
      set world_roll_receipt_id=v_receipt.id, updated_at=now()
      where id=v_run.id;
  end if;

  return jsonb_build_object('roll',to_jsonb(v_created),'replayed',false);
end;
$$;

create or replace function public.append_ai_background_event_v1(
  p_run_id uuid, p_event_key text, p_entity_scope text, p_entity_id text,
  p_event_kind text, p_summary text,
  p_effect_payload jsonb default '{}'::jsonb,
  p_importance smallint default 2
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.ai_background_daily_runs%rowtype;
  v_event_key text := btrim(coalesce(p_event_key,''));
  v_scope text := lower(btrim(coalesce(p_entity_scope,'')));
  v_entity_id text := btrim(coalesce(p_entity_id,''));
  v_kind text := lower(btrim(coalesce(p_event_kind,'')));
  v_summary text := btrim(coalesce(p_summary,''));
  v_effect jsonb := coalesce(p_effect_payload,'{}'::jsonb);
  v_semantics jsonb;
  v_fingerprint text;
  v_existing public.ai_background_events%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_campaign_event_id uuid := gen_random_uuid();
  v_created public.ai_background_events%rowtype;
begin
  if p_run_id is null then
    raise exception using errcode='22023', message='ai_background_event_run_required';
  end if;
  select * into v_run from public.ai_background_daily_runs where id=p_run_id;
  if v_run.id is null then
    raise exception using errcode='P0002', message='ai_background_run_not_found';
  end if;
  if not private.is_ai_world_campaign_v1(v_run.campaign_id) then
    raise exception using errcode='42501', message='ai_background_ai_world_only';
  end if;

  if length(v_event_key)<1 or length(v_event_key)>240
     or v_scope !~ '^[a-z][a-z0-9._:-]{0,79}$'
     or length(v_entity_id)<1 or length(v_entity_id)>240
     or v_kind !~ '^[a-z][a-z0-9._:-]{0,119}$'
     or length(v_summary)<1 or length(v_summary)>6000
     or jsonb_typeof(v_effect)<>'object'
     or p_importance is null or p_importance<0 or p_importance>5 then
    raise exception using errcode='22023', message='ai_background_event_payload_invalid';
  end if;

  v_semantics:=jsonb_build_object(
    'run_id',v_run.id,'effective_game_day',v_run.campaign_day,
    'entity_scope',v_scope,'entity_id',v_entity_id,'event_kind',v_kind,
    'summary',v_summary,'effect_payload',v_effect,'importance',p_importance
  );
  v_fingerprint:=pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_semantics::text,'UTF8'),'sha256'),'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_run.id::text || ':event:' || v_event_key,0)
  );

  select * into v_existing from public.ai_background_events
  where run_id=v_run.id and event_key=v_event_key;
  if found then
    if v_existing.request_fingerprint<>v_fingerprint then
      raise exception using errcode='22023', message='ai_background_event_key_conflict';
    end if;
    return jsonb_build_object('event',to_jsonb(v_existing)-'request_fingerprint','replayed',true);
  end if;

  insert into public.campaign_events(
    id,campaign_id,event_type,source_kind,source_id,summary,payload,importance,
    visibility,confidence,provenance,occurred_at
  ) values (
    v_campaign_event_id,v_run.campaign_id,'background.'||v_kind,'ai_background',
    v_event_id::text,v_summary,
    jsonb_build_object(
      'background_event_id',v_event_id,'run_id',v_run.id,
      'effective_game_day',v_run.campaign_day,'entity_scope',v_scope,
      'entity_id',v_entity_id,'effect_payload',v_effect
    ),
    p_importance,'gm',1,
    jsonb_build_object(
      'table','ai_background_events','background_event_id',v_event_id,
      'run_id',v_run.id,'effective_game_day',v_run.campaign_day
    ),
    now()
  );

  insert into public.ai_background_events(
    id,campaign_id,run_id,effective_game_day,event_key,entity_scope,entity_id,
    event_kind,summary,effect_payload,importance,campaign_event_id,request_fingerprint
  ) values (
    v_event_id,v_run.campaign_id,v_run.id,v_run.campaign_day,v_event_key,v_scope,
    v_entity_id,v_kind,v_summary,v_effect,p_importance,v_campaign_event_id,v_fingerprint
  ) returning * into v_created;

  return jsonb_build_object('event',to_jsonb(v_created)-'request_fingerprint','replayed',false);
end;
$$;

create or replace function public.append_ai_background_snapshot_v1(
  p_run_id uuid, p_snapshot_key text, p_entity_scope text, p_entity_id text,
  p_summary text, p_state jsonb,
  p_source_event_id uuid default null,
  p_provenance jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.ai_background_daily_runs%rowtype;
  v_key text := btrim(coalesce(p_snapshot_key,''));
  v_scope text := lower(btrim(coalesce(p_entity_scope,'')));
  v_entity_id text := btrim(coalesce(p_entity_id,''));
  v_summary text := btrim(coalesce(p_summary,''));
  v_state jsonb := coalesce(p_state,'{}'::jsonb);
  v_provenance jsonb := coalesce(p_provenance,'{}'::jsonb);
  v_source_event public.ai_background_events%rowtype;
  v_semantics jsonb;
  v_fingerprint text;
  v_existing public.ai_background_entity_snapshots%rowtype;
  v_created public.ai_background_entity_snapshots%rowtype;
  v_version integer;
begin
  if p_run_id is null then
    raise exception using errcode='22023', message='ai_background_snapshot_run_required';
  end if;
  select * into v_run from public.ai_background_daily_runs where id=p_run_id;
  if v_run.id is null then
    raise exception using errcode='P0002', message='ai_background_run_not_found';
  end if;
  if not private.is_ai_world_campaign_v1(v_run.campaign_id) then
    raise exception using errcode='42501', message='ai_background_ai_world_only';
  end if;

  if length(v_key)<1 or length(v_key)>240
     or v_scope !~ '^[a-z][a-z0-9._:-]{0,79}$'
     or length(v_entity_id)<1 or length(v_entity_id)>240
     or length(v_summary)>6000
     or jsonb_typeof(v_state)<>'object'
     or jsonb_typeof(v_provenance)<>'object' then
    raise exception using errcode='22023', message='ai_background_snapshot_payload_invalid';
  end if;

  if p_source_event_id is not null then
    select * into v_source_event from public.ai_background_events where id=p_source_event_id;
    if v_source_event.id is null
       or v_source_event.campaign_id<>v_run.campaign_id
       or v_source_event.effective_game_day>v_run.campaign_day then
      raise exception using errcode='22023', message='ai_background_snapshot_source_event_mismatch';
    end if;
  end if;

  v_semantics:=jsonb_build_object(
    'run_id',v_run.id,'through_game_day',v_run.campaign_day,'entity_scope',v_scope,
    'entity_id',v_entity_id,'summary',v_summary,'state',v_state,
    'source_event_id',p_source_event_id,'provenance',v_provenance
  );
  v_fingerprint:=pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_semantics::text,'UTF8'),'sha256'),'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_run.campaign_id::text || ':snapshot:' || v_scope || ':' || v_entity_id,0
    )
  );

  select * into v_existing from public.ai_background_entity_snapshots
  where run_id=v_run.id and snapshot_key=v_key;
  if found then
    if v_existing.request_fingerprint<>v_fingerprint then
      raise exception using errcode='22023', message='ai_background_snapshot_key_conflict';
    end if;
    return jsonb_build_object('snapshot',to_jsonb(v_existing)-'request_fingerprint','replayed',true);
  end if;

  select coalesce(max(version),0)+1 into v_version
  from public.ai_background_entity_snapshots
  where campaign_id=v_run.campaign_id and entity_scope=v_scope and entity_id=v_entity_id;

  insert into public.ai_background_entity_snapshots(
    campaign_id,run_id,through_game_day,snapshot_key,entity_scope,entity_id,version,
    summary,state,source_event_id,provenance,request_fingerprint
  ) values (
    v_run.campaign_id,v_run.id,v_run.campaign_day,v_key,v_scope,v_entity_id,v_version,
    v_summary,v_state,p_source_event_id,v_provenance,v_fingerprint
  ) returning * into v_created;

  return jsonb_build_object('snapshot',to_jsonb(v_created)-'request_fingerprint','replayed',false);
end;
$$;

create or replace function public.read_ai_background_snapshot_v1(
  p_campaign_id uuid,p_entity_scope text,p_entity_id text,p_source_game_day integer
) returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_snapshot public.ai_background_entity_snapshots%rowtype;
begin
  if p_campaign_id is null or p_source_game_day is null or p_source_game_day<1 then
    raise exception using errcode='22023', message='ai_background_snapshot_read_input_invalid';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501', message='ai_background_ai_world_only';
  end if;
  select * into v_snapshot from public.ai_background_entity_snapshots
  where campaign_id=p_campaign_id
    and entity_scope=lower(btrim(p_entity_scope))
    and entity_id=btrim(p_entity_id)
    and through_game_day<=p_source_game_day
  order by through_game_day desc,version desc
  limit 1;
  if v_snapshot.id is null then return null; end if;
  return to_jsonb(v_snapshot)-'request_fingerprint';
end;
$$;

create or replace function public.read_ai_background_events_v1(
  p_campaign_id uuid,p_source_game_day integer,
  p_entity_scope text default null,p_entity_id text default null,p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_scope text := nullif(lower(btrim(coalesce(p_entity_scope,''))),'');
  v_entity_id text := nullif(btrim(coalesce(p_entity_id,'')),'');
  v_limit integer := least(greatest(coalesce(p_limit,20),1),100);
  v_events jsonb;
begin
  if p_campaign_id is null or p_source_game_day is null or p_source_game_day<1 then
    raise exception using errcode='22023', message='ai_background_event_read_input_invalid';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501', message='ai_background_ai_world_only';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(q)-'request_fingerprint'
      order by q.effective_game_day desc,q.created_at desc),
    '[]'::jsonb
  ) into v_events
  from (
    select * from public.ai_background_events
    where campaign_id=p_campaign_id
      and effective_game_day<=p_source_game_day
      and (v_scope is null or entity_scope=v_scope)
      and (v_entity_id is null or entity_id=v_entity_id)
    order by effective_game_day desc,created_at desc
    limit v_limit
  ) q;
  return v_events;
end;
$$;

create or replace function private.quest_resolve_campaign_event_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_character_id uuid;
  v_seen uuid[] := '{}'::uuid[];
  v_quest record;
begin
  if new.source_kind in ('quest_engine','ai_background') then
    return new;
  end if;

  if new.actor_character_id is not null then
    perform private.resolve_quests_for_character_v1(new.actor_character_id);
    v_seen := array_append(v_seen,new.actor_character_id);
  end if;

  foreach v_character_id in array new.participant_character_ids loop
    if v_character_id is not null and not (v_character_id=any(v_seen)) then
      perform private.resolve_quests_for_character_v1(v_character_id);
      v_seen:=array_append(v_seen,v_character_id);
    end if;
  end loop;

  if coalesce(array_length(v_seen,1),0)=0 then
    for v_quest in
      select q.id from public.quests q
      where q.campaign_id=new.campaign_id and q.status='active'
    loop
      perform private.resolve_quest_v1(v_quest.id);
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.reserve_ai_background_daily_run_v1(uuid,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.record_ai_background_roll_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.append_ai_background_event_v1(uuid,text,text,text,text,text,jsonb,smallint) from public,anon,authenticated;
revoke all on function public.append_ai_background_snapshot_v1(uuid,text,text,text,text,jsonb,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.read_ai_background_snapshot_v1(uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.read_ai_background_events_v1(uuid,integer,text,text,integer) from public,anon,authenticated;

grant execute on function public.reserve_ai_background_daily_run_v1(uuid,integer,text,jsonb) to service_role;
grant execute on function public.record_ai_background_roll_v1(uuid,uuid) to service_role;
grant execute on function public.append_ai_background_event_v1(uuid,text,text,text,text,text,jsonb,smallint) to service_role;
grant execute on function public.append_ai_background_snapshot_v1(uuid,text,text,text,text,jsonb,uuid,jsonb) to service_role;
grant execute on function public.read_ai_background_snapshot_v1(uuid,text,text,integer) to service_role;
grant execute on function public.read_ai_background_events_v1(uuid,integer,text,text,integer) to service_role;
