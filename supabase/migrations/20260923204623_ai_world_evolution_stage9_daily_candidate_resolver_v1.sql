-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 9: daily whole-entity candidate Resolver.
-- Selection is server-owned, independently persisted per candidate, and completed before any AI worker sees input.

create table public.ai_background_entity_protections (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entity_scope text not null check (entity_scope in ('npc','location')),
  entity_id uuid not null,
  protection_kind text not null default 'hard_transition'
    check (length(protection_kind) between 1 and 80 and protection_kind ~ '^[a-z0-9][a-z0-9._:-]*$'),
  source_key text not null check (length(btrim(source_key)) between 1 and 240),
  starts_game_day integer not null default 1 check (starts_game_day >= 1),
  through_game_day integer check (through_game_day is null or through_game_day >= starts_game_day),
  reason text not null default '' check (length(reason) <= 2000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, entity_scope, entity_id, source_key)
);

comment on table public.ai_background_entity_protections is
  'Stage 9 hard protection boundary. Active rows remove an entity from a day candidate pool before any selection roll is made.';

create index ai_background_entity_protections_lookup_idx
  on public.ai_background_entity_protections(
    campaign_id, entity_scope, entity_id, starts_game_day, through_game_day
  );

alter table public.ai_background_entity_protections enable row level security;
revoke all on table public.ai_background_entity_protections
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.ai_background_entity_protections
  to service_role;

create table public.ai_background_candidates (
  run_id uuid not null,
  campaign_id uuid not null,
  campaign_day integer not null check (campaign_day >= 1),
  entity_scope text not null check (entity_scope in ('npc','location')),
  entity_id uuid not null,
  selection_receipt_id uuid not null unique
    references public.ai_world_random_receipts(id) on delete restrict,
  selection_decision_key text not null,
  selection_roll smallint not null check (selection_roll between 1 and 100),
  selection_threshold smallint not null check (selection_threshold between 1 and 99),
  selected boolean not null,
  eligibility_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(eligibility_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  primary key (run_id, entity_scope, entity_id),
  foreign key (run_id, campaign_id, campaign_day)
    references public.ai_background_daily_runs(id, campaign_id, campaign_day)
    on delete cascade
);

comment on table public.ai_background_candidates is
  'Stage 9 auditable daily candidate ledger. Selection is one independent persisted World Resolver d100 per eligible entity. Rejected candidates remain server-side only.';

create index ai_background_candidates_selected_idx
  on public.ai_background_candidates(run_id, entity_scope, entity_id)
  where selected = true;

alter table public.ai_background_candidates enable row level security;
revoke all on table public.ai_background_candidates
  from public, anon, authenticated, service_role;
grant select on table public.ai_background_candidates to service_role;

alter table public.ai_background_daily_runs
  add column selection_percent smallint not null default 30
    check (selection_percent between 1 and 99),
  add column rejected_npc_count integer not null default 0
    check (rejected_npc_count >= 0),
  add column rejected_location_count integer not null default 0
    check (rejected_location_count >= 0),
  add column selected_npc_ids uuid[] not null default '{}'::uuid[],
  add column selected_location_ids uuid[] not null default '{}'::uuid[],
  add column candidate_resolved_at timestamptz,
  add constraint ai_background_daily_runs_npc_partition_check
    check (eligible_npc_count = selected_npc_count + rejected_npc_count),
  add constraint ai_background_daily_runs_location_partition_check
    check (eligible_location_count = selected_location_count + rejected_location_count);

comment on column public.ai_background_daily_runs.selected_npc_ids is
  'Stage 9 selected persistent NPC IDs only. Rejected IDs are intentionally not copied into the worker-facing run payload.';
comment on column public.ai_background_daily_runs.selected_location_ids is
  'Stage 9 selected whole-location IDs only. Rejected IDs are intentionally not copied into the worker-facing run payload.';

create or replace function private.ai_background_selection_bands_v1(
  p_selection_percent integer
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_array(
    jsonb_build_object('key','selected','label','selected','min',1,'max',p_selection_percent),
    jsonb_build_object('key','rejected','label','rejected','min',p_selection_percent + 1,'max',100)
  )
  where p_selection_percent between 1 and 99
$$;

revoke all on function private.ai_background_selection_bands_v1(integer)
  from public, anon, authenticated;

create or replace function private.ai_background_severity_bands_v1()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '[
    {"key":"critical_negative","min":1,"max":1},
    {"key":"severe_negative","min":2,"max":5},
    {"key":"notable_negative","min":6,"max":15},
    {"key":"minor_negative","min":16,"max":35},
    {"key":"neutral","min":36,"max":65},
    {"key":"minor_positive","min":66,"max":85},
    {"key":"notable_positive","min":86,"max":95},
    {"key":"severe_positive","min":96,"max":99},
    {"key":"critical_positive","min":100,"max":100}
  ]'::jsonb
$$;

revoke all on function private.ai_background_severity_bands_v1()
  from public, anon, authenticated;

create or replace function private.ai_background_entity_is_protected_v1(
  p_campaign_id uuid,
  p_campaign_day integer,
  p_entity_scope text,
  p_entity_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists(
    select 1
    from public.ai_background_entity_protections p
    where p.campaign_id = p_campaign_id
      and p.entity_scope = p_entity_scope
      and p.entity_id = p_entity_id
      and p.starts_game_day <= p_campaign_day
      and (p.through_game_day is null or p.through_game_day >= p_campaign_day)
  )
$$;

revoke all on function private.ai_background_entity_is_protected_v1(uuid,integer,text,uuid)
  from public, anon, authenticated;

create or replace function private.ai_background_campaign_frontier_day_v1(
  p_campaign_id uuid
)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(
    coalesce((select max(cws.campaign_day) from public.character_world_state cws where cws.campaign_id = p_campaign_id),1),
    coalesce((select max(r.campaign_day) from public.chat_rooms r where r.campaign_id = p_campaign_id),1)
  )
$$;

revoke all on function private.ai_background_campaign_frontier_day_v1(uuid)
  from public, anon, authenticated;

create or replace function public.resolve_ai_background_daily_candidates_v1(
  p_campaign_id uuid,
  p_campaign_day integer,
  p_selection_percent smallint default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.ai_background_daily_runs%rowtype;
  v_frontier_day integer;
  v_selection_bands jsonb;
  v_severity_bands jsonb := private.ai_background_severity_bands_v1();
  v_resolution jsonb;
  v_receipt jsonb;
  v_candidate record;
  v_selected boolean;
  v_selection_roll integer;
  v_selection_receipt_id uuid;
  v_selected_npc_ids uuid[] := '{}'::uuid[];
  v_selected_location_ids uuid[] := '{}'::uuid[];
  v_eligible_npc_count integer := 0;
  v_selected_npc_count integer := 0;
  v_eligible_location_count integer := 0;
  v_selected_location_count integer := 0;
  v_world_roll integer;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode='42501', message='service_role_required';
  end if;
  if p_campaign_id is null or p_campaign_day is null or p_campaign_day < 1 then
    raise exception using errcode='22023', message='ai_background_candidate_input_invalid';
  end if;
  if p_selection_percent is null or p_selection_percent not between 1 and 99 then
    raise exception using errcode='22023', message='ai_background_selection_percent_invalid';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501', message='ai_background_ai_world_only';
  end if;

  v_selection_bands := private.ai_background_selection_bands_v1(p_selection_percent);

  perform public.reserve_ai_background_daily_run_v1(
    p_campaign_id,p_campaign_day,'deepseek-v4.1-flash',
    jsonb_build_object('reserved_by','stage9-daily-candidate-resolver')
  );

  select * into v_run
  from public.ai_background_daily_runs
  where campaign_id=p_campaign_id and campaign_day=p_campaign_day
  for update;

  if v_run.id is null then
    raise exception using errcode='P0002', message='ai_background_run_not_found_after_reservation';
  end if;

  if v_run.candidate_resolved_at is not null then
    if v_run.selection_percent <> p_selection_percent then
      raise exception using errcode='22023', message='ai_background_selection_percent_conflict';
    end if;
    select br.result into v_world_roll
    from public.ai_background_rolls br
    where br.run_id=v_run.id and br.target_scope='world'
    order by br.created_at limit 1;

    return jsonb_build_object(
      'run_id',v_run.id,'campaign_id',v_run.campaign_id,'campaign_day',v_run.campaign_day,
      'selection_percent',v_run.selection_percent,
      'eligible_npc_count',v_run.eligible_npc_count,'selected_npc_count',v_run.selected_npc_count,
      'rejected_npc_count',v_run.rejected_npc_count,
      'eligible_location_count',v_run.eligible_location_count,
      'selected_location_count',v_run.selected_location_count,
      'rejected_location_count',v_run.rejected_location_count,
      'selected_npc_ids',to_jsonb(v_run.selected_npc_ids),
      'selected_location_ids',to_jsonb(v_run.selected_location_ids),
      'world_roll',v_world_roll,'replayed',true
    );
  end if;

  if v_run.status <> 'queued' then
    raise exception using errcode='55000', message='ai_background_run_not_queueable';
  end if;

  v_frontier_day := private.ai_background_campaign_frontier_day_v1(p_campaign_id);
  if p_campaign_day > v_frontier_day then
    raise exception using errcode='22023', message='ai_background_day_not_reached',
      detail=format('requested=%s frontier=%s',p_campaign_day,v_frontier_day);
  end if;

  if exists(select 1 from public.ai_background_candidates c where c.run_id=v_run.id)
     or exists(select 1 from public.ai_background_rolls r where r.run_id=v_run.id) then
    raise exception using errcode='55000', message='ai_background_unresolved_run_has_partial_stage9_state';
  end if;

  v_resolution := public.resolve_world_random_v1(
    p_campaign_id=>p_campaign_id,
    p_decision_key=>format('background:day:%s:severity:world',p_campaign_day),
    p_sides=>100,p_bands=>v_severity_bands,p_decision_kind=>'background.daily.world',
    p_campaign_day=>p_campaign_day,p_run_key=>v_run.id::text,
    p_target_scope=>'world',p_target_id=>p_campaign_id::text,
    p_audit=>jsonb_build_object('stage',9,'role','daily-world-severity')
  );
  v_receipt := v_resolution->'receipt';
  v_world_roll := (v_receipt->>'result')::integer;
  perform public.record_ai_background_roll_v1(v_run.id,(v_receipt->>'id')::uuid);

  for v_candidate in
    select c.id entity_id,
      jsonb_build_object(
        'character_type',c.character_type,'publication_state',c.publication_state,
        'life_state',c.life_state,'background_simulation_scope',np.background_simulation_scope
      ) eligibility_snapshot
    from public.npc_profiles np
    join public.characters c on c.id=np.character_id
    where np.campaign_id=p_campaign_id and c.campaign_id=p_campaign_id
      and np.background_simulation_scope='entity'
      and c.character_type='npc' and c.publication_state='campaign' and c.life_state='alive'
      and not private.ai_background_entity_is_protected_v1(p_campaign_id,p_campaign_day,'npc',c.id)
    order by c.id
  loop
    v_eligible_npc_count := v_eligible_npc_count + 1;
    v_resolution := public.resolve_world_random_v1(
      p_campaign_id=>p_campaign_id,
      p_decision_key=>format('background:day:%s:select:npc:%s',p_campaign_day,v_candidate.entity_id),
      p_sides=>100,p_bands=>v_selection_bands,p_decision_kind=>'background.selection',
      p_campaign_day=>p_campaign_day,p_run_key=>v_run.id::text,
      p_target_scope=>'npc',p_target_id=>v_candidate.entity_id::text,
      p_audit=>jsonb_build_object('stage',9,'role','candidate-selection')
    );
    v_receipt := v_resolution->'receipt';
    v_selection_roll := (v_receipt->>'result')::integer;
    v_selection_receipt_id := (v_receipt->>'id')::uuid;
    v_selected := (v_receipt->>'matched_outcome_key')='selected';

    insert into public.ai_background_candidates(
      run_id,campaign_id,campaign_day,entity_scope,entity_id,
      selection_receipt_id,selection_decision_key,selection_roll,
      selection_threshold,selected,eligibility_snapshot
    ) values (
      v_run.id,p_campaign_id,p_campaign_day,'npc',v_candidate.entity_id,
      v_selection_receipt_id,v_receipt->>'decision_key',v_selection_roll,
      p_selection_percent,v_selected,v_candidate.eligibility_snapshot
    );

    if v_selected then
      v_selected_npc_count := v_selected_npc_count + 1;
      v_selected_npc_ids := array_append(v_selected_npc_ids,v_candidate.entity_id);
      v_resolution := public.resolve_world_random_v1(
        p_campaign_id=>p_campaign_id,
        p_decision_key=>format('background:day:%s:severity:npc:%s',p_campaign_day,v_candidate.entity_id),
        p_sides=>100,p_bands=>v_severity_bands,p_decision_kind=>'background.daily.entity',
        p_campaign_day=>p_campaign_day,p_run_key=>v_run.id::text,
        p_target_scope=>'npc',p_target_id=>v_candidate.entity_id::text,
        p_audit=>jsonb_build_object('stage',9,'role','selected-entity-severity')
      );
      v_receipt := v_resolution->'receipt';
      perform public.record_ai_background_roll_v1(v_run.id,(v_receipt->>'id')::uuid);
    end if;
  end loop;

  for v_candidate in
    select l.id entity_id,
      jsonb_build_object('lifecycle_state',l.lifecycle_state,'background_simulation_scope',l.background_simulation_scope)
        eligibility_snapshot
    from public.locations l
    where l.campaign_id=p_campaign_id
      and l.lifecycle_state='active'
      and l.background_simulation_scope='entity'
      and not private.ai_background_entity_is_protected_v1(p_campaign_id,p_campaign_day,'location',l.id)
    order by l.id
  loop
    v_eligible_location_count := v_eligible_location_count + 1;
    v_resolution := public.resolve_world_random_v1(
      p_campaign_id=>p_campaign_id,
      p_decision_key=>format('background:day:%s:select:location:%s',p_campaign_day,v_candidate.entity_id),
      p_sides=>100,p_bands=>v_selection_bands,p_decision_kind=>'background.selection',
      p_campaign_day=>p_campaign_day,p_run_key=>v_run.id::text,
      p_target_scope=>'location',p_target_id=>v_candidate.entity_id::text,
      p_audit=>jsonb_build_object('stage',9,'role','candidate-selection')
    );
    v_receipt := v_resolution->'receipt';
    v_selection_roll := (v_receipt->>'result')::integer;
    v_selection_receipt_id := (v_receipt->>'id')::uuid;
    v_selected := (v_receipt->>'matched_outcome_key')='selected';

    insert into public.ai_background_candidates(
      run_id,campaign_id,campaign_day,entity_scope,entity_id,
      selection_receipt_id,selection_decision_key,selection_roll,
      selection_threshold,selected,eligibility_snapshot
    ) values (
      v_run.id,p_campaign_id,p_campaign_day,'location',v_candidate.entity_id,
      v_selection_receipt_id,v_receipt->>'decision_key',v_selection_roll,
      p_selection_percent,v_selected,v_candidate.eligibility_snapshot
    );

    if v_selected then
      v_selected_location_count := v_selected_location_count + 1;
      v_selected_location_ids := array_append(v_selected_location_ids,v_candidate.entity_id);
      v_resolution := public.resolve_world_random_v1(
        p_campaign_id=>p_campaign_id,
        p_decision_key=>format('background:day:%s:severity:location:%s',p_campaign_day,v_candidate.entity_id),
        p_sides=>100,p_bands=>v_severity_bands,p_decision_kind=>'background.daily.entity',
        p_campaign_day=>p_campaign_day,p_run_key=>v_run.id::text,
        p_target_scope=>'location',p_target_id=>v_candidate.entity_id::text,
        p_audit=>jsonb_build_object('stage',9,'role','selected-entity-severity')
      );
      v_receipt := v_resolution->'receipt';
      perform public.record_ai_background_roll_v1(v_run.id,(v_receipt->>'id')::uuid);
    end if;
  end loop;

  update public.ai_background_daily_runs
  set selection_percent=p_selection_percent,
      eligible_npc_count=v_eligible_npc_count,
      selected_npc_count=v_selected_npc_count,
      rejected_npc_count=v_eligible_npc_count-v_selected_npc_count,
      eligible_location_count=v_eligible_location_count,
      selected_location_count=v_selected_location_count,
      rejected_location_count=v_eligible_location_count-v_selected_location_count,
      selected_npc_ids=v_selected_npc_ids,
      selected_location_ids=v_selected_location_ids,
      candidate_resolved_at=now(),
      audit=coalesce(audit,'{}'::jsonb)||jsonb_build_object(
        'stage9',jsonb_build_object(
          'selection_percent',p_selection_percent,'frontier_day',v_frontier_day,'candidate_resolved_at',now()
        )
      ),
      updated_at=now()
  where id=v_run.id
  returning * into v_run;

  return jsonb_build_object(
    'run_id',v_run.id,'campaign_id',v_run.campaign_id,'campaign_day',v_run.campaign_day,
    'selection_percent',v_run.selection_percent,
    'eligible_npc_count',v_run.eligible_npc_count,'selected_npc_count',v_run.selected_npc_count,
    'rejected_npc_count',v_run.rejected_npc_count,
    'eligible_location_count',v_run.eligible_location_count,
    'selected_location_count',v_run.selected_location_count,
    'rejected_location_count',v_run.rejected_location_count,
    'selected_npc_ids',to_jsonb(v_run.selected_npc_ids),
    'selected_location_ids',to_jsonb(v_run.selected_location_ids),
    'world_roll',v_world_roll,'replayed',false
  );
end;
$$;

comment on function public.resolve_ai_background_daily_candidates_v1(uuid,integer,smallint) is
  'Stage 9 AI-world-only daily candidate Resolver. Reserves one run per reached game day, independently selects each eligible whole entity through persisted World Resolver d100 receipts, then pre-rolls world/entity severity before any model call.';

revoke all on function public.resolve_ai_background_daily_candidates_v1(uuid,integer,smallint)
  from public, anon, authenticated;
grant execute on function public.resolve_ai_background_daily_candidates_v1(uuid,integer,smallint)
  to service_role;
