-- AI GM: Stage 21 audit closure + MiMo V2.5 Pro + campaign-level junior worker model selector.
-- Keeps primary GM and all junior workers independently selectable.

-- Stage 21 audit tail: least-privilege table grants.
revoke all on table public.ai_gm_behavior_profiles from anon, authenticated;
grant select on table public.ai_gm_behavior_profiles to authenticated;

revoke all on table public.ai_gm_behavior_settings from anon, authenticated;
grant select, insert, update on table public.ai_gm_behavior_settings to authenticated;

-- MiMo V2.5 Pro: main GM selectable and available to junior workers.
insert into public.ai_models (
  provider_key, model_key, display_name, enabled, is_base,
  gm_selectable, user_selectable,
  supports_tools, supports_json, supports_streaming, supports_vision,
  context_window, cost_tier, reasoning_tier, latency_tier,
  model_kind, access_scope
)
values (
  'openai-compatible',
  'mimo-v2.5-pro',
  'MiMo V2.5 Pro',
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  false,
  1000000,
  2,
  5,
  2,
  'agent',
  'campaign'
)
on conflict (model_key) do update set
  provider_key = excluded.provider_key,
  display_name = excluded.display_name,
  enabled = true,
  is_base = false,
  gm_selectable = true,
  user_selectable = true,
  supports_tools = true,
  supports_json = true,
  supports_streaming = true,
  supports_vision = false,
  context_window = 1000000,
  cost_tier = excluded.cost_tier,
  reasoning_tier = excluded.reasoning_tier,
  latency_tier = excluded.latency_tier,
  model_kind = 'agent',
  access_scope = 'campaign',
  updated_at = now();

create or replace function private.can_select_campaign_junior_model_v1(
  p_model_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.ai_models m
    where m.id=p_model_id
      and m.enabled=true
      and m.model_kind='agent'
      and m.access_scope='campaign'
      and m.model_key in ('deepseek-v4.1-flash','mimo-v2.5-pro')
      and m.supports_tools=true
      and m.supports_json=true
  );
$$;

revoke all on function private.can_select_campaign_junior_model_v1(uuid)
  from public,anon;
grant execute on function private.can_select_campaign_junior_model_v1(uuid)
  to authenticated,service_role;

create or replace function private.is_ai_gm_junior_model_key_v1(
  p_model_key text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.ai_models m
    where m.model_key=lower(btrim(coalesce(p_model_key,'')))
      and m.enabled=true
      and m.model_kind='agent'
      and m.access_scope='campaign'
      and m.model_key in ('deepseek-v4.1-flash','mimo-v2.5-pro')
      and m.supports_tools=true
      and m.supports_json=true
  );
$$;

revoke all on function private.is_ai_gm_junior_model_key_v1(text)
  from public,anon,authenticated;
grant execute on function private.is_ai_gm_junior_model_key_v1(text)
  to service_role;

create or replace function private.ai_gm_junior_model_key_v1(
  p_campaign_id uuid
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    (
      select m.model_key
      from public.ai_agent_settings s
      join public.ai_models m on m.id=s.selected_model_id
      where s.campaign_id=p_campaign_id
        and s.agent_key='junior'
        and m.enabled=true
        and m.model_kind='agent'
        and m.access_scope='campaign'
        and m.model_key in ('deepseek-v4.1-flash','mimo-v2.5-pro')
        and m.supports_tools=true
        and m.supports_json=true
      limit 1
    ),
    'deepseek-v4.1-flash'
  );
$$;

revoke all on function private.ai_gm_junior_model_key_v1(uuid)
  from public,anon,authenticated;
grant execute on function private.ai_gm_junior_model_key_v1(uuid)
  to service_role;

insert into public.ai_agent_settings(
  campaign_id,agent_key,selected_model_id,updated_by,updated_at
)
select
  c.id,
  'junior',
  (
    select m.id
    from public.ai_models m
    where m.model_key='deepseek-v4.1-flash'
      and m.enabled=true
    limit 1
  ),
  null,
  now()
from public.campaigns c
where private.is_ai_world_campaign_v1(c.id)
  and exists(
    select 1 from public.ai_models m
    where m.model_key='deepseek-v4.1-flash'
      and m.enabled=true
  )
on conflict(campaign_id,agent_key) do nothing;

create or replace function private.ensure_ai_gm_junior_setting_for_slot_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_model_id uuid;
begin
  if new.campaign_id is not null
     and (tg_op='INSERT' or old.campaign_id is distinct from new.campaign_id)
  then
    select m.id into v_model_id
    from public.ai_models m
    where m.model_key='deepseek-v4.1-flash'
      and m.enabled=true
      and m.model_kind='agent'
      and m.access_scope='campaign'
    limit 1;

    if v_model_id is not null then
      insert into public.ai_agent_settings(
        campaign_id,agent_key,selected_model_id,updated_by,updated_at
      ) values (
        new.campaign_id,'junior',v_model_id,new.owner_user_id,now()
      )
      on conflict(campaign_id,agent_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_ai_gm_junior_setting_for_slot_v1
  on public.ai_world_slots;
create trigger ensure_ai_gm_junior_setting_for_slot_v1
after insert or update of campaign_id
on public.ai_world_slots
for each row
execute function private.ensure_ai_gm_junior_setting_for_slot_v1();

revoke all on function private.ensure_ai_gm_junior_setting_for_slot_v1()
  from public,anon,authenticated;

drop policy if exists ai_agent_settings_insert
  on public.ai_agent_settings;
create policy ai_agent_settings_insert
on public.ai_agent_settings
for insert
to authenticated
with check (
  private.is_campaign_manager(campaign_id,(select auth.uid()))
  and (updated_by is null or updated_by=(select auth.uid()))
  and (
    (
      agent_key='gm'
      and private.can_select_campaign_gm_model_v1(selected_model_id)
    )
    or
    (
      agent_key='junior'
      and private.is_ai_world_campaign_v1(campaign_id)
      and private.can_select_campaign_junior_model_v1(selected_model_id)
    )
    or
    (
      agent_key not in ('gm','junior')
      and private.can_select_campaign_ai_model(
        selected_model_id,
        (select auth.uid())
      )
    )
  )
);

drop policy if exists ai_agent_settings_update
  on public.ai_agent_settings;
create policy ai_agent_settings_update
on public.ai_agent_settings
for update
to authenticated
using (
  private.is_campaign_manager(campaign_id,(select auth.uid()))
)
with check (
  private.is_campaign_manager(campaign_id,(select auth.uid()))
  and (updated_by is null or updated_by=(select auth.uid()))
  and (
    (
      agent_key='gm'
      and private.can_select_campaign_gm_model_v1(selected_model_id)
    )
    or
    (
      agent_key='junior'
      and private.is_ai_world_campaign_v1(campaign_id)
      and private.can_select_campaign_junior_model_v1(selected_model_id)
    )
    or
    (
      agent_key not in ('gm','junior')
      and private.can_select_campaign_ai_model(
        selected_model_id,
        (select auth.uid())
      )
    )
  )
);

create or replace function public.list_campaign_ai_junior_models_v1(
  p_campaign_id uuid
)
returns table(
  id uuid,
  model_key text,
  display_name text,
  supports_tools boolean,
  supports_json boolean,
  supports_vision boolean,
  context_window integer,
  cost_tier smallint,
  reasoning_tier smallint,
  latency_tier smallint,
  selected boolean
)
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_selected_model_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'auth_required';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_gm_junior_model_ai_world_only';
  end if;
  if not private.is_campaign_member(
    p_campaign_id,
    (select auth.uid())
  ) then
    raise exception 'campaign_membership_required';
  end if;

  select s.selected_model_id
    into v_selected_model_id
  from public.ai_agent_settings s
  join public.ai_models m on m.id=s.selected_model_id
  where s.campaign_id=p_campaign_id
    and s.agent_key='junior'
    and m.enabled=true
    and m.model_kind='agent'
    and m.access_scope='campaign'
    and m.model_key in ('deepseek-v4.1-flash','mimo-v2.5-pro')
    and m.supports_tools=true
    and m.supports_json=true;

  if v_selected_model_id is null then
    select m.id into v_selected_model_id
    from public.ai_models m
    where m.model_key='deepseek-v4.1-flash'
      and m.enabled=true
      and m.model_kind='agent'
      and m.access_scope='campaign'
      and m.supports_tools=true
      and m.supports_json=true
    limit 1;
  end if;

  return query
  select
    m.id,
    m.model_key,
    m.display_name,
    m.supports_tools,
    m.supports_json,
    m.supports_vision,
    m.context_window,
    m.cost_tier,
    m.reasoning_tier,
    m.latency_tier,
    m.id=v_selected_model_id
  from public.ai_models m
  where m.enabled=true
    and m.model_kind='agent'
    and m.access_scope='campaign'
    and m.model_key in ('deepseek-v4.1-flash','mimo-v2.5-pro')
    and m.supports_tools=true
    and m.supports_json=true
  order by
    (m.id=v_selected_model_id) desc,
    case m.model_key
      when 'deepseek-v4.1-flash' then 1
      when 'mimo-v2.5-pro' then 2
      else 9
    end,
    m.display_name;
end;
$$;

revoke all on function public.list_campaign_ai_junior_models_v1(uuid)
  from public,anon;
grant execute on function public.list_campaign_ai_junior_models_v1(uuid)
  to authenticated,service_role;

create or replace function public.set_campaign_ai_junior_model_v1(
  p_campaign_id uuid,
  p_model_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_gm_junior_model_ai_world_only';
  end if;
  if not private.is_campaign_manager(p_campaign_id,v_user_id) then
    raise exception 'campaign_manager_required';
  end if;
  if not private.can_select_campaign_junior_model_v1(p_model_id) then
    raise exception 'ai_gm_junior_model_not_selectable';
  end if;

  insert into public.ai_agent_settings(
    campaign_id,agent_key,selected_model_id,updated_by,updated_at
  )
  values(
    p_campaign_id,'junior',p_model_id,v_user_id,now()
  )
  on conflict(campaign_id,agent_key) do update set
    selected_model_id=excluded.selected_model_id,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at;

  return p_model_id;
end;
$$;

revoke all on function public.set_campaign_ai_junior_model_v1(uuid,uuid)
  from public,anon;
grant execute on function public.set_campaign_ai_junior_model_v1(uuid,uuid)
  to authenticated,service_role;

create index if not exists ai_agent_settings_junior_selected_idx
  on public.ai_agent_settings(campaign_id,selected_model_id)
  where agent_key='junior';

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
    p_campaign_id,p_campaign_day,private.ai_gm_junior_model_key_v1(p_campaign_id),
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

CREATE OR REPLACE FUNCTION public.prepare_ai_background_daily_worker_v1(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run public.ai_background_daily_runs%rowtype;
  v_input jsonb; v_npcs jsonb; v_locations jsonb; v_world_roll jsonb; v_world_snapshot jsonb;
  v_input_bytes integer; v_missing_rolls integer;
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service_role_required'; end if;
  if p_run_id is null then raise exception using errcode='22023',message='ai_background_worker_run_required'; end if;

  select * into v_run from public.ai_background_daily_runs where id=p_run_id for update;
  if v_run.id is null then raise exception using errcode='P0002',message='ai_background_run_not_found'; end if;
  if not private.is_ai_world_campaign_v1(v_run.campaign_id) then
    raise exception using errcode='42501',message='ai_background_ai_world_only';
  end if;
  if v_run.candidate_resolved_at is null then
    raise exception using errcode='55000',message='ai_background_candidates_not_resolved';
  end if;
  if not private.is_ai_gm_junior_model_key_v1(v_run.worker_model) then
    raise exception using errcode='22023',message='ai_background_worker_model_not_selectable';
  end if;

  if v_run.status='completed' then
    return jsonb_build_object(
      'run_id',v_run.id,'campaign_id',v_run.campaign_id,'campaign_day',v_run.campaign_day,
      'worker_input',v_run.worker_input,'worker_output',v_run.worker_output,
      'input_bytes',v_run.worker_input_bytes,'replayed',true,'completed',true
    );
  end if;

  if v_run.status='running' and v_run.started_at is not null and v_run.started_at>now()-interval '2 minutes' then
    return jsonb_build_object(
      'run_id',v_run.id,'campaign_id',v_run.campaign_id,'campaign_day',v_run.campaign_day,
      'busy',true,'replayed',true,'completed',false
    );
  end if;

  if v_run.worker_input<>'{}'::jsonb then
    v_input:=v_run.worker_input; v_input_bytes:=v_run.worker_input_bytes;
  else
    v_world_roll:=private.ai_background_roll_for_worker_v1(v_run.id,'world',v_run.campaign_id::text);
    if v_world_roll is null then raise exception using errcode='55000',message='ai_background_world_roll_missing'; end if;

    select count(*) into v_missing_rolls
    from unnest(v_run.selected_npc_ids) x(id)
    where private.ai_background_roll_for_worker_v1(v_run.id,'npc',x.id::text) is null;
    if v_missing_rolls>0 then raise exception using errcode='55000',message='ai_background_selected_npc_roll_missing'; end if;

    select count(*) into v_missing_rolls
    from unnest(v_run.selected_location_ids) x(id)
    where private.ai_background_roll_for_worker_v1(v_run.id,'location',x.id::text) is null;
    if v_missing_rolls>0 then raise exception using errcode='55000',message='ai_background_selected_location_roll_missing'; end if;

    select coalesce(jsonb_agg(ctx order by ord),'[]'::jsonb) into v_npcs
    from (
      select u.ord,private.ai_background_npc_context_v1(v_run.id,v_run.campaign_id,v_run.campaign_day,u.id) ctx
      from unnest(v_run.selected_npc_ids) with ordinality u(id,ord)
    ) x;
    if exists(select 1 from jsonb_array_elements(v_npcs) j(value) where j.value is null or j.value='null'::jsonb) then
      raise exception using errcode='55000',message='ai_background_selected_npc_context_missing';
    end if;

    select coalesce(jsonb_agg(ctx order by ord),'[]'::jsonb) into v_locations
    from (
      select u.ord,private.ai_background_location_context_v1(v_run.id,v_run.campaign_id,v_run.campaign_day,u.id) ctx
      from unnest(v_run.selected_location_ids) with ordinality u(id,ord)
    ) x;
    if exists(select 1 from jsonb_array_elements(v_locations) j(value) where j.value is null or j.value='null'::jsonb) then
      raise exception using errcode='55000',message='ai_background_selected_location_context_missing';
    end if;

    v_world_snapshot:=private.ai_background_snapshot_for_worker_v1(v_run.campaign_id,v_run.campaign_day,'world',v_run.campaign_id::text);

    v_input:=jsonb_build_object(
      'surface','ai_background_daily_v1','prompt_version',1,'run_id',v_run.id,
      'campaign_id',v_run.campaign_id,'campaign_day',v_run.campaign_day,
      'rules',jsonb_build_object(
        'randomness_owner','world_resolver','supplied_rolls_locked',true,
        'candidate_selection_locked',true,'rejected_candidates_visible',false,
        'neutral_may_have_no_lasting_event',true,'canonical_mutation_allowed',false,
        'snapshot_write_allowed',false
      ),
      'world',jsonb_build_object(
        'campaign',(
          select jsonb_build_object(
            'id',c.id,'title',left(c.title,240),'summary',left(c.summary,2200),
            'rules_summary',left(c.rules_summary,1800)
          ) from public.campaigns c where c.id=v_run.campaign_id
        ),
        'roll',v_world_roll,'current_snapshot',v_world_snapshot,
        'recent_events',private.ai_background_recent_events_for_worker_v1(
          v_run.campaign_id,v_run.campaign_day,'world',v_run.campaign_id::text,6
        )
      ),
      'selected_npcs',v_npcs,'selected_locations',v_locations
    );

    v_input_bytes:=pg_catalog.octet_length(v_input::text);
    if v_input_bytes>180000 then
      raise exception using errcode='54000',message='ai_background_worker_input_budget_exceeded',
        detail=format('bytes=%s limit=180000',v_input_bytes);
    end if;
  end if;

  update public.ai_background_daily_runs
  set status='running',worker_input=v_input,worker_input_bytes=v_input_bytes,worker_prompt_version=1,
      started_at=now(),completed_at=null,failed_at=null,failure_code=null,failure_detail=null,updated_at=now()
  where id=v_run.id returning * into v_run;

  return jsonb_build_object(
    'run_id',v_run.id,'campaign_id',v_run.campaign_id,'campaign_day',v_run.campaign_day,
    'worker_model',v_run.worker_model,'worker_input',v_run.worker_input,
    'input_bytes',v_run.worker_input_bytes,'replayed',false,'completed',false
  );
end;
$function$;

comment on function public.list_campaign_ai_junior_models_v1(uuid) is
  'Campaign AI-world junior-worker model selector. Only DeepSeek V4.1 Flash and MiMo V2.5 Pro are exposed.';
comment on function public.set_campaign_ai_junior_model_v1(uuid,uuid) is
  'Manager-only AI-world junior-worker model selection. All junior worker surfaces consume this campaign setting.';
