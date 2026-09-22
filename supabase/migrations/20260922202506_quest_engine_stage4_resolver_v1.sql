
create table public.quest_condition_states (
  condition_id uuid primary key
    references public.quest_conditions(id) on delete cascade,
  satisfied boolean not null default false,
  resolution_source text not null default 'pending'
    check (resolution_source in ('pending','resolver','gm','ai')),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  satisfied_at timestamptz,
  last_evaluated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.quest_condition_states enable row level security;

create policy quest_condition_states_manager_access
on public.quest_condition_states
for all
to authenticated
using (
  exists (
    select 1
    from public.quest_conditions qc
    where qc.id = condition_id
      and private.can_manage_quest_condition_group(qc.group_id, (select auth.uid()))
  )
)
with check (
  exists (
    select 1
    from public.quest_conditions qc
    where qc.id = condition_id
      and private.can_manage_quest_condition_group(qc.group_id, (select auth.uid()))
  )
);

revoke all on public.quest_condition_states
from public, anon, authenticated;

grant select, insert, update, delete on public.quest_condition_states
to authenticated, service_role;

create trigger quest_condition_states_touch_updated_at
before update on public.quest_condition_states
for each row execute function private.quest_touch_updated_at();

create or replace function private.quest_condition_character_ids_v1(
  p_condition_id uuid
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quest_id uuid;
  v_params jsonb;
  v_scope text;
  v_explicit text;
  v_explicit_uuid uuid;
  v_ids uuid[];
begin
  select qs.quest_id, qc.params
    into v_quest_id, v_params
  from public.quest_conditions qc
  join public.quest_condition_groups qcg on qcg.id = qc.group_id
  join public.quest_stages qs on qs.id = qcg.stage_id
  where qc.id = p_condition_id;

  if v_quest_id is null then
    return '{}'::uuid[];
  end if;

  v_explicit := nullif(btrim(coalesce(v_params->>'character_id', '')), '');
  if v_explicit is not null
     and v_explicit ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_explicit_uuid := v_explicit::uuid;
    if exists (
      select 1
      from public.quest_characters qch
      where qch.quest_id = v_quest_id
        and qch.character_id = v_explicit_uuid
    ) then
      return array[v_explicit_uuid];
    end if;
  end if;

  v_scope := lower(coalesce(nullif(v_params->>'character_scope', ''), 'primary'));

  if v_scope = 'primary' then
    select array_agg(qch.character_id order by qch.created_at)
      into v_ids
    from public.quest_characters qch
    where qch.quest_id = v_quest_id
      and qch.role = 'primary';

    if coalesce(array_length(v_ids, 1), 0) > 0 then
      return v_ids;
    end if;
  end if;

  select array_agg(qch.character_id order by
      case qch.role when 'primary' then 0 else 1 end,
      qch.created_at
    )
    into v_ids
  from public.quest_characters qch
  where qch.quest_id = v_quest_id;

  return coalesce(v_ids, '{}'::uuid[]);
end;
$$;

create or replace function private.quest_condition_base_satisfied_v1(
  p_condition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_condition public.quest_conditions%rowtype;
  v_group public.quest_condition_groups%rowtype;
  v_stage public.quest_stages%rowtype;
  v_quest public.quests%rowtype;
  v_target public.quest_targets%rowtype;
  v_character_ids uuid[];
  v_scope text;
  v_all_scope boolean;
  v_since timestamptz;
  v_satisfied boolean := false;
  v_event_type text;
  v_payload_contains jsonb;
  v_field text;
  v_expected text;
begin
  select * into v_condition
  from public.quest_conditions
  where id = p_condition_id;

  if not found then
    return jsonb_build_object(
      'satisfied', false,
      'automatic', false,
      'reason', 'condition_not_found'
    );
  end if;

  select * into v_group
  from public.quest_condition_groups
  where id = v_condition.group_id;

  select * into v_stage
  from public.quest_stages
  where id = v_group.stage_id;

  select * into v_quest
  from public.quests
  where id = v_stage.quest_id;

  if v_condition.target_id is not null then
    select * into v_target
    from public.quest_targets
    where id = v_condition.target_id;
  end if;

  if v_condition.condition_type = 'custom_narrative' then
    select qcs.satisfied
      into v_satisfied
    from public.quest_condition_states qcs
    where qcs.condition_id = p_condition_id
      and qcs.resolution_source in ('gm','ai');

    return jsonb_build_object(
      'satisfied', coalesce(v_satisfied, false),
      'automatic', false,
      'reason', case when v_satisfied is null then 'manual_required' else 'manual_resolution' end
    );
  end if;

  v_character_ids := private.quest_condition_character_ids_v1(p_condition_id);
  if coalesce(array_length(v_character_ids, 1), 0) = 0 then
    return jsonb_build_object(
      'satisfied', false,
      'automatic', true,
      'reason', 'no_assigned_characters'
    );
  end if;

  v_scope := lower(coalesce(nullif(v_condition.params->>'character_scope', ''), 'primary'));
  v_all_scope := v_scope = 'all';

  if coalesce((v_condition.params->>'historical')::boolean, false) then
    v_since := null;
  else
    v_since := coalesce(v_quest.activated_at, v_quest.created_at);
  end if;

  if v_condition.condition_type = 'visit_location' then
    if v_target.location_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    if v_all_scope then
      select bool_and(
        exists (
          select 1
          from public.character_world_state cws
          where cws.character_id = cid
            and cws.location_id = v_target.location_id
        )
        or exists (
          select 1
          from public.campaign_events ce
          where ce.campaign_id = v_quest.campaign_id
            and ce.event_type = 'world.location_entered'
            and ce.location_id = v_target.location_id
            and ce.actor_character_id = cid
            and (v_since is null or ce.occurred_at >= v_since)
        )
      )
      into v_satisfied
      from unnest(v_character_ids) as cid;
    else
      select exists (
        select 1
        from unnest(v_character_ids) as cid
        where exists (
          select 1
          from public.character_world_state cws
          where cws.character_id = cid
            and cws.location_id = v_target.location_id
        )
        or exists (
          select 1
          from public.campaign_events ce
          where ce.campaign_id = v_quest.campaign_id
            and ce.event_type = 'world.location_entered'
            and ce.location_id = v_target.location_id
            and ce.actor_character_id = cid
            and (v_since is null or ce.occurred_at >= v_since)
        )
      ) into v_satisfied;
    end if;

  elsif v_condition.condition_type = 'discover_location' then
    if v_target.location_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    if v_all_scope then
      select bool_and(exists (
        select 1
        from public.character_location_discoveries cld
        where cld.character_id = cid
          and cld.location_id = v_target.location_id
          and (
            coalesce((v_condition.params->>'since_activation')::boolean, false) = false
            or cld.discovered_at >= coalesce(v_quest.activated_at, v_quest.created_at)
          )
      ))
      into v_satisfied
      from unnest(v_character_ids) as cid;
    else
      select exists (
        select 1
        from public.character_location_discoveries cld
        where cld.character_id = any(v_character_ids)
          and cld.location_id = v_target.location_id
          and (
            coalesce((v_condition.params->>'since_activation')::boolean, false) = false
            or cld.discovered_at >= coalesce(v_quest.activated_at, v_quest.created_at)
          )
      ) into v_satisfied;
    end if;

  elsif v_condition.condition_type = 'meet_npc' then
    if v_target.npc_character_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    if v_all_scope then
      select bool_and(exists (
        select 1
        from public.character_npc_discoveries cnd
        where cnd.character_id = cid
          and cnd.npc_character_id = v_target.npc_character_id
          and (
            coalesce((v_condition.params->>'since_activation')::boolean, false) = false
            or cnd.discovered_at >= coalesce(v_quest.activated_at, v_quest.created_at)
          )
      ))
      into v_satisfied
      from unnest(v_character_ids) as cid;
    else
      select exists (
        select 1
        from public.character_npc_discoveries cnd
        where cnd.character_id = any(v_character_ids)
          and cnd.npc_character_id = v_target.npc_character_id
          and (
            coalesce((v_condition.params->>'since_activation')::boolean, false) = false
            or cnd.discovered_at >= coalesce(v_quest.activated_at, v_quest.created_at)
          )
      ) into v_satisfied;
    end if;

  elsif v_condition.condition_type = 'talk_to_npc' then
    if v_target.npc_character_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    if v_all_scope then
      select bool_and(exists (
        select 1
        from public.character_npc_discoveries cnd
        where cnd.character_id = cid
          and cnd.npc_character_id = v_target.npc_character_id
          and (v_since is null or cnd.last_interaction_at >= v_since)
      ))
      into v_satisfied
      from unnest(v_character_ids) as cid;
    else
      select exists (
        select 1
        from public.character_npc_discoveries cnd
        where cnd.character_id = any(v_character_ids)
          and cnd.npc_character_id = v_target.npc_character_id
          and (v_since is null or cnd.last_interaction_at >= v_since)
      ) into v_satisfied;
    end if;

  elsif v_condition.condition_type = 'inventory_has' then
    if v_target.item_definition_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    if v_all_scope then
      select bool_and(
        coalesce((
          select sum(cii.quantity)
          from public.character_inventory_items cii
          where cii.character_id = cid
            and cii.definition_id = v_target.item_definition_id
            and cii.world_storage_id is null
            and cii.surface_id is null
        ), 0) >= v_condition.required_quantity
      )
      into v_satisfied
      from unnest(v_character_ids) as cid;
    else
      select exists (
        select 1
        from unnest(v_character_ids) as cid
        where coalesce((
          select sum(cii.quantity)
          from public.character_inventory_items cii
          where cii.character_id = cid
            and cii.definition_id = v_target.item_definition_id
            and cii.world_storage_id is null
            and cii.surface_id is null
        ), 0) >= v_condition.required_quantity
      ) into v_satisfied;
    end if;

  elsif v_condition.condition_type = 'deliver_item' then
    if v_target.item_definition_id is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'target_unbound'
      );
    end if;

    v_event_type := coalesce(nullif(v_condition.params->>'event_type', ''), 'quest.item_delivered');

    select exists (
      select 1
      from public.campaign_events ce
      where ce.campaign_id = v_quest.campaign_id
        and ce.event_type = v_event_type
        and (v_since is null or ce.occurred_at >= v_since)
        and (
          coalesce((v_condition.params->>'campaign_wide')::boolean, false)
          or ce.actor_character_id = any(v_character_ids)
          or ce.participant_character_ids && v_character_ids
        )
        and (
          ce.payload->>'target_id' = v_condition.target_id::text
          or ce.payload->>'item_definition_id' = v_target.item_definition_id::text
          or ce.payload#>>'{event_payload,targetId}' = v_condition.target_id::text
          or ce.payload#>>'{event_payload,itemDefinitionId}' = v_target.item_definition_id::text
        )
    ) into v_satisfied;

  elsif v_condition.condition_type = 'event_occurred' then
    v_event_type := nullif(v_condition.params->>'event_type', '');
    if v_event_type is null then
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'event_type_required'
      );
    end if;

    if jsonb_typeof(v_condition.params->'payload_contains') = 'object' then
      v_payload_contains := v_condition.params->'payload_contains';
    else
      v_payload_contains := '{}'::jsonb;
    end if;

    select exists (
      select 1
      from public.campaign_events ce
      where ce.campaign_id = v_quest.campaign_id
        and ce.event_type = v_event_type
        and (v_since is null or ce.occurred_at >= v_since)
        and (
          nullif(v_condition.params->>'source_kind', '') is null
          or ce.source_kind = v_condition.params->>'source_kind'
        )
        and (
          nullif(v_condition.params->>'source_id', '') is null
          or ce.source_id = v_condition.params->>'source_id'
        )
        and ce.payload @> v_payload_contains
        and (
          coalesce((v_condition.params->>'campaign_wide')::boolean, false)
          or ce.actor_character_id = any(v_character_ids)
          or ce.participant_character_ids && v_character_ids
        )
        and (
          v_condition.target_id is null
          or (
            v_target.target_kind = 'location'
            and v_target.location_id is not null
            and (
              ce.location_id = v_target.location_id
              or ce.payload->>'location_id' = v_target.location_id::text
            )
          )
          or (
            v_target.target_kind = 'npc'
            and v_target.npc_character_id is not null
            and (
              ce.payload->>'npc_character_id' = v_target.npc_character_id::text
              or ce.payload->>'target_id' = v_condition.target_id::text
            )
          )
          or (
            v_target.target_kind = 'item'
            and v_target.item_definition_id is not null
            and (
              ce.payload->>'item_definition_id' = v_target.item_definition_id::text
              or ce.payload->>'target_id' = v_condition.target_id::text
            )
          )
        )
    ) into v_satisfied;

  elsif v_condition.condition_type = 'character_state' then
    v_field := lower(coalesce(v_condition.params->>'field', ''));
    v_expected := coalesce(v_condition.params->>'equals', v_condition.params->>'value');

    if v_field = 'life_state' then
      if v_all_scope then
        select bool_and(c.life_state = v_expected)
          into v_satisfied
        from unnest(v_character_ids) cid
        join public.characters c on c.id = cid;
      else
        select exists (
          select 1
          from public.characters c
          where c.id = any(v_character_ids)
            and c.life_state = v_expected
        ) into v_satisfied;
      end if;

    elsif v_field = 'level' then
      if v_all_scope then
        select bool_and(
          (v_condition.params->>'min' is null or c.level >= (v_condition.params->>'min')::integer)
          and (v_condition.params->>'max' is null or c.level <= (v_condition.params->>'max')::integer)
          and (v_expected is null or c.level = v_expected::integer)
        )
        into v_satisfied
        from unnest(v_character_ids) cid
        join public.characters c on c.id = cid;
      else
        select exists (
          select 1
          from public.characters c
          where c.id = any(v_character_ids)
            and (v_condition.params->>'min' is null or c.level >= (v_condition.params->>'min')::integer)
            and (v_condition.params->>'max' is null or c.level <= (v_condition.params->>'max')::integer)
            and (v_expected is null or c.level = v_expected::integer)
        ) into v_satisfied;
      end if;

    elsif v_field = 'location_id' then
      if v_target.location_id is not null then
        v_expected := v_target.location_id::text;
      end if;

      if v_expected is null then
        return jsonb_build_object(
          'satisfied', false,
          'automatic', true,
          'reason', 'location_value_required'
        );
      end if;

      if v_all_scope then
        select bool_and(cws.location_id::text = v_expected)
          into v_satisfied
        from unnest(v_character_ids) cid
        left join public.character_world_state cws on cws.character_id = cid;
      else
        select exists (
          select 1
          from public.character_world_state cws
          where cws.character_id = any(v_character_ids)
            and cws.location_id::text = v_expected
        ) into v_satisfied;
      end if;

    elsif v_field = 'campaign_day' then
      if v_all_scope then
        select bool_and(
          (v_condition.params->>'min' is null or cws.campaign_day >= (v_condition.params->>'min')::integer)
          and (v_condition.params->>'max' is null or cws.campaign_day <= (v_condition.params->>'max')::integer)
          and (v_expected is null or cws.campaign_day = v_expected::integer)
        )
        into v_satisfied
        from unnest(v_character_ids) cid
        join public.character_world_state cws on cws.character_id = cid;
      else
        select exists (
          select 1
          from public.character_world_state cws
          where cws.character_id = any(v_character_ids)
            and (v_condition.params->>'min' is null or cws.campaign_day >= (v_condition.params->>'min')::integer)
            and (v_condition.params->>'max' is null or cws.campaign_day <= (v_condition.params->>'max')::integer)
            and (v_expected is null or cws.campaign_day = v_expected::integer)
        ) into v_satisfied;
      end if;

    elsif v_field = 'day_period' then
      if v_all_scope then
        select bool_and(cws.day_period = v_expected)
          into v_satisfied
        from unnest(v_character_ids) cid
        join public.character_world_state cws on cws.character_id = cid;
      else
        select exists (
          select 1
          from public.character_world_state cws
          where cws.character_id = any(v_character_ids)
            and cws.day_period = v_expected
        ) into v_satisfied;
      end if;

    else
      return jsonb_build_object(
        'satisfied', false,
        'automatic', true,
        'reason', 'unsupported_character_state_field'
      );
    end if;

  else
    return jsonb_build_object(
      'satisfied', false,
      'automatic', false,
      'reason', 'unsupported_condition_type'
    );
  end if;

  if v_condition.negated then
    v_satisfied := not coalesce(v_satisfied, false);
  end if;

  return jsonb_build_object(
    'satisfied', coalesce(v_satisfied, false),
    'automatic', true,
    'condition_type', v_condition.condition_type,
    'target_id', v_condition.target_id,
    'character_ids', to_jsonb(v_character_ids),
    'evaluated_at', now()
  );
end;
$$;

create or replace function private.refresh_quest_condition_state_v1(
  p_condition_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_result jsonb;
  v_satisfied boolean;
  v_existing_source text;
begin
  select qc.condition_type
    into v_type
  from public.quest_conditions qc
  where qc.id = p_condition_id;

  if v_type is null then
    return false;
  end if;

  if v_type = 'custom_narrative' then
    select qcs.resolution_source
      into v_existing_source
    from public.quest_condition_states qcs
    where qcs.condition_id = p_condition_id;

    if v_existing_source in ('gm','ai') then
      select qcs.satisfied into v_satisfied
      from public.quest_condition_states qcs
      where qcs.condition_id = p_condition_id;
      return coalesce(v_satisfied, false);
    end if;

    insert into public.quest_condition_states(
      condition_id,
      satisfied,
      resolution_source,
      evidence,
      satisfied_at,
      last_evaluated_at
    )
    values(
      p_condition_id,
      false,
      'pending',
      jsonb_build_object('reason', 'manual_required'),
      null,
      now()
    )
    on conflict(condition_id) do update
    set last_evaluated_at = excluded.last_evaluated_at,
        evidence = excluded.evidence;

    return false;
  end if;

  v_result := private.quest_condition_base_satisfied_v1(p_condition_id);
  v_satisfied := coalesce((v_result->>'satisfied')::boolean, false);

  insert into public.quest_condition_states(
    condition_id,
    satisfied,
    resolution_source,
    evidence,
    satisfied_at,
    last_evaluated_at
  )
  values(
    p_condition_id,
    v_satisfied,
    'resolver',
    v_result,
    case when v_satisfied then now() else null end,
    now()
  )
  on conflict(condition_id) do update
  set satisfied = excluded.satisfied,
      resolution_source = 'resolver',
      evidence = excluded.evidence,
      satisfied_at = case
        when excluded.satisfied
          then coalesce(public.quest_condition_states.satisfied_at, now())
        else null
      end,
      last_evaluated_at = now();

  return v_satisfied;
end;
$$;

create or replace function private.quest_condition_group_satisfied_v1(
  p_group_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_count integer;
  v_result boolean;
  v_condition record;
begin
  select qcg.mode into v_mode
  from public.quest_condition_groups qcg
  where qcg.id = p_group_id;

  if v_mode is null then
    return false;
  end if;

  v_count := 0;
  v_result := case when v_mode = 'all' then true else false end;

  for v_condition in
    select qc.id
    from public.quest_conditions qc
    where qc.group_id = p_group_id
    order by qc.position, qc.id
  loop
    v_count := v_count + 1;

    if v_mode = 'all' then
      v_result := v_result and private.refresh_quest_condition_state_v1(v_condition.id);
    else
      v_result := v_result or private.refresh_quest_condition_state_v1(v_condition.id);
    end if;
  end loop;

  if v_count = 0 then
    return false;
  end if;

  return v_result;
end;
$$;

create or replace function private.quest_emit_stage_completed_event_v1(
  p_stage_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.quest_stages%rowtype;
  v_quest public.quests%rowtype;
  v_character_ids uuid[];
  v_summary text;
begin
  select * into v_stage
  from public.quest_stages
  where id = p_stage_id;

  if not found then return; end if;

  select * into v_quest
  from public.quests
  where id = v_stage.quest_id;

  select coalesce(array_agg(qch.character_id order by qch.created_at), '{}'::uuid[])
    into v_character_ids
  from public.quest_characters qch
  where qch.quest_id = v_quest.id;

  v_summary := coalesce(
    nullif(v_stage.completion_text, ''),
    nullif(v_stage.player_title, ''),
    'Этап квеста завершён.'
  );

  insert into public.campaign_events(
    campaign_id,
    event_type,
    source_kind,
    source_id,
    participant_character_ids,
    summary,
    payload,
    importance,
    visibility,
    visible_character_ids,
    confidence,
    provenance,
    occurred_at
  )
  values(
    v_quest.campaign_id,
    'quest.stage_completed',
    'quest_engine',
    'stage:' || v_stage.id::text,
    v_character_ids,
    v_summary,
    jsonb_build_object(
      'quest_id', v_quest.id,
      'stage_id', v_stage.id,
      'player_title', v_stage.player_title,
      'completion_text', v_stage.completion_text
    ),
    2,
    'characters',
    v_character_ids,
    1,
    jsonb_build_object(
      'engine', 'quest_resolver_v1',
      'automatic', true
    ),
    coalesce(v_stage.completed_at, now())
  )
  on conflict(campaign_id, source_kind, source_id) do nothing;
end;
$$;

create or replace function private.quest_emit_completed_event_v1(
  p_quest_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quest public.quests%rowtype;
  v_character_ids uuid[];
begin
  select * into v_quest
  from public.quests
  where id = p_quest_id;

  if not found then return; end if;

  select coalesce(array_agg(qch.character_id order by qch.created_at), '{}'::uuid[])
    into v_character_ids
  from public.quest_characters qch
  where qch.quest_id = p_quest_id;

  insert into public.campaign_events(
    campaign_id,
    event_type,
    source_kind,
    source_id,
    participant_character_ids,
    summary,
    payload,
    importance,
    visibility,
    visible_character_ids,
    confidence,
    provenance,
    occurred_at
  )
  values(
    v_quest.campaign_id,
    'quest.completed',
    'quest_engine',
    'quest:' || v_quest.id::text || ':completed',
    v_character_ids,
    'Квест завершён: ' || v_quest.title,
    jsonb_build_object(
      'quest_id', v_quest.id,
      'title', v_quest.title
    ),
    3,
    'characters',
    v_character_ids,
    1,
    jsonb_build_object(
      'engine', 'quest_resolver_v1',
      'automatic', true
    ),
    coalesce(v_quest.closed_at, now())
  )
  on conflict(campaign_id, source_kind, source_id) do nothing;
end;
$$;

create or replace function private.resolve_quest_stage_v1(
  p_stage_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.quest_stages%rowtype;
  v_quest public.quests%rowtype;
  v_group record;
  v_group_count integer := 0;
  v_all_groups boolean := true;
  v_next_stage_id uuid;
  v_has_open boolean;
  v_all_complete boolean;
begin
  select * into v_stage
  from public.quest_stages
  where id = p_stage_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'stage_not_found');
  end if;

  select * into v_quest
  from public.quests
  where id = v_stage.quest_id
  for update;

  for v_group in
    select qcg.id
    from public.quest_condition_groups qcg
    where qcg.stage_id = p_stage_id
    order by qcg.position, qcg.id
  loop
    v_group_count := v_group_count + 1;
    v_all_groups := v_all_groups
      and private.quest_condition_group_satisfied_v1(v_group.id);
  end loop;

  if v_stage.status <> 'active' then
    return jsonb_build_object(
      'ok', true,
      'completed', false,
      'status', v_stage.status,
      'groups', v_group_count,
      'conditions_satisfied', v_group_count > 0 and v_all_groups
    );
  end if;

  if v_group_count = 0 or not v_all_groups then
    return jsonb_build_object(
      'ok', true,
      'completed', false,
      'status', v_stage.status,
      'groups', v_group_count,
      'conditions_satisfied', false
    );
  end if;

  update public.quest_stages
  set status = 'completed',
      completed_at = coalesce(completed_at, now())
  where id = p_stage_id
    and status = 'active';

  perform private.quest_emit_stage_completed_event_v1(p_stage_id);

  select qs.id into v_next_stage_id
  from public.quest_stages qs
  where qs.quest_id = v_quest.id
    and qs.status = 'planned'
    and qs.position > v_stage.position
  order by qs.position
  limit 1
  for update;

  if v_next_stage_id is not null then
    update public.quest_stages
    set status = 'active'
    where id = v_next_stage_id
      and status = 'planned';

    perform private.resolve_quest_stage_v1(v_next_stage_id);
  end if;

  select exists (
    select 1
    from public.quest_stages qs
    where qs.quest_id = v_quest.id
      and qs.status in ('planned','active')
  )
  into v_has_open;

  select
    count(*) > 0
    and bool_and(qs.status in ('completed','skipped'))
  into v_all_complete
  from public.quest_stages qs
  where qs.quest_id = v_quest.id;

  if not v_has_open
     and v_all_complete
     and v_quest.status = 'active' then
    update public.quests
    set status = 'completed',
        closed_at = coalesce(closed_at, now())
    where id = v_quest.id
      and status = 'active';

    perform private.quest_emit_completed_event_v1(v_quest.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'completed', true,
    'stage_id', p_stage_id,
    'next_stage_id', v_next_stage_id
  );
end;
$$;

create or replace function private.resolve_quest_v1(
  p_quest_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quest public.quests%rowtype;
  v_stage record;
  v_stage_results jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('quest:' || p_quest_id::text, 0));

  select * into v_quest
  from public.quests
  where id = p_quest_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'quest_not_found');
  end if;

  for v_stage in
    select qs.id
    from public.quest_stages qs
    where qs.quest_id = p_quest_id
    order by qs.position, qs.id
  loop
    v_stage_results := v_stage_results
      || jsonb_build_array(private.resolve_quest_stage_v1(v_stage.id));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'quest_id', p_quest_id,
    'stages', v_stage_results
  );
end;
$$;

create or replace function private.resolve_quests_for_character_v1(
  p_character_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quest record;
  v_count integer := 0;
begin
  if p_character_id is null then
    return 0;
  end if;

  for v_quest in
    select distinct q.id
    from public.quest_characters qch
    join public.quests q on q.id = qch.quest_id
    where qch.character_id = p_character_id
      and q.status = 'active'
  loop
    perform private.resolve_quest_v1(v_quest.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function private.quest_record_location_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.location_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.location_id is not distinct from new.location_id then
    return new;
  end if;

  insert into public.campaign_events(
    campaign_id,
    event_type,
    source_kind,
    source_id,
    location_id,
    actor_character_id,
    participant_character_ids,
    summary,
    payload,
    importance,
    visibility,
    visible_character_ids,
    confidence,
    provenance,
    occurred_at
  )
  values(
    new.campaign_id,
    'world.location_entered',
    'world_state',
    gen_random_uuid()::text,
    new.location_id,
    new.character_id,
    array[new.character_id],
    'Персонаж вошёл в локацию.',
    jsonb_build_object(
      'character_id', new.character_id,
      'location_id', new.location_id,
      'campaign_day', new.campaign_day,
      'day_period', new.day_period
    ),
    1,
    'characters',
    array[new.character_id],
    1,
    jsonb_build_object('engine', 'quest_resolver_v1'),
    now()
  );

  return new;
end;
$$;

create trigger character_world_state_quest_location_event_v1
after insert or update of location_id
on public.character_world_state
for each row
execute function private.quest_record_location_event_v1();

create or replace function private.quest_resolve_character_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_character_id uuid;
  v_new_character_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_character_id := old.character_id;
  end if;

  if tg_op <> 'DELETE' then
    v_new_character_id := new.character_id;
  end if;

  if v_old_character_id is not null then
    perform private.resolve_quests_for_character_v1(v_old_character_id);
  end if;

  if v_new_character_id is not null
     and v_new_character_id is distinct from v_old_character_id then
    perform private.resolve_quests_for_character_v1(v_new_character_id);
  end if;

  return coalesce(new, old);
end;
$$;

create trigger character_inventory_items_quest_resolver_v1
after insert or update or delete
on public.character_inventory_items
for each row
execute function private.quest_resolve_character_change_v1();

create trigger character_location_discoveries_quest_resolver_v1
after insert or update or delete
on public.character_location_discoveries
for each row
execute function private.quest_resolve_character_change_v1();

create trigger character_npc_discoveries_quest_resolver_v1
after insert or update or delete
on public.character_npc_discoveries
for each row
execute function private.quest_resolve_character_change_v1();

create trigger character_world_state_quest_resolver_v1
after insert or update or delete
on public.character_world_state
for each row
execute function private.quest_resolve_character_change_v1();

create or replace function private.quest_resolve_campaign_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_id uuid;
  v_seen uuid[] := '{}'::uuid[];
  v_quest record;
begin
  if new.source_kind = 'quest_engine' then
    return new;
  end if;

  if new.actor_character_id is not null then
    perform private.resolve_quests_for_character_v1(new.actor_character_id);
    v_seen := array_append(v_seen, new.actor_character_id);
  end if;

  foreach v_character_id in array new.participant_character_ids
  loop
    if v_character_id is not null
       and not (v_character_id = any(v_seen)) then
      perform private.resolve_quests_for_character_v1(v_character_id);
      v_seen := array_append(v_seen, v_character_id);
    end if;
  end loop;

  if coalesce(array_length(v_seen, 1), 0) = 0 then
    for v_quest in
      select q.id
      from public.quests q
      where q.campaign_id = new.campaign_id
        and q.status = 'active'
    loop
      perform private.resolve_quest_v1(v_quest.id);
    end loop;
  end if;

  return new;
end;
$$;

create trigger campaign_events_quest_resolver_v1
after insert
on public.campaign_events
for each row
execute function private.quest_resolve_campaign_event_v1();

create or replace function private.quest_resolve_from_condition_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_stage_id uuid;
  v_quest_id uuid;
begin
  v_group_id := coalesce(new.group_id, old.group_id);

  select qcg.stage_id, qs.quest_id
    into v_stage_id, v_quest_id
  from public.quest_condition_groups qcg
  join public.quest_stages qs on qs.id = qcg.stage_id
  where qcg.id = v_group_id;

  if v_quest_id is not null then
    perform private.resolve_quest_v1(v_quest_id);
  end if;

  return coalesce(new, old);
end;
$$;

create trigger quest_conditions_resolver_v1
after insert or update or delete
on public.quest_conditions
for each row
execute function private.quest_resolve_from_condition_v1();

create or replace function private.quest_resolve_from_group_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_id uuid;
  v_quest_id uuid;
begin
  v_stage_id := coalesce(new.stage_id, old.stage_id);

  select qs.quest_id
    into v_quest_id
  from public.quest_stages qs
  where qs.id = v_stage_id;

  if v_quest_id is not null then
    perform private.resolve_quest_v1(v_quest_id);
  end if;

  return coalesce(new, old);
end;
$$;

create trigger quest_condition_groups_resolver_v1
after insert or update or delete
on public.quest_condition_groups
for each row
execute function private.quest_resolve_from_group_v1();

create or replace function private.quest_resolve_from_target_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quest_id uuid;
begin
  v_quest_id := coalesce(new.quest_id, old.quest_id);

  if v_quest_id is not null then
    perform private.resolve_quest_v1(v_quest_id);
  end if;

  return coalesce(new, old);
end;
$$;

create trigger quest_targets_resolver_v1
after insert or update or delete
on public.quest_targets
for each row
execute function private.quest_resolve_from_target_v1();

create or replace function private.quest_resolve_active_stage_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.resolve_quest_v1(new.quest_id);
  end if;

  return new;
end;
$$;

create trigger quest_stages_active_resolver_v1
after insert or update of status
on public.quest_stages
for each row
execute function private.quest_resolve_active_stage_v1();

create or replace function public.resolve_quest_v1(
  p_quest_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.can_manage_quest(p_quest_id, v_user_id) then
    raise exception 'quest_resolve_denied';
  end if;

  return private.resolve_quest_v1(p_quest_id);
end;
$$;

revoke all on function public.resolve_quest_v1(uuid)
from public, anon, authenticated;
grant execute on function public.resolve_quest_v1(uuid)
to authenticated, service_role;

create or replace function public.set_quest_condition_resolution_v1(
  p_condition_id uuid,
  p_satisfied boolean,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_type text;
  v_group_id uuid;
  v_quest_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select qc.condition_type, qc.group_id, qs.quest_id
    into v_type, v_group_id, v_quest_id
  from public.quest_conditions qc
  join public.quest_condition_groups qcg on qcg.id = qc.group_id
  join public.quest_stages qs on qs.id = qcg.stage_id
  where qc.id = p_condition_id;

  if v_type is null then
    raise exception 'quest_condition_not_found';
  end if;

  if not private.can_manage_quest_condition_group(v_group_id, v_user_id) then
    raise exception 'quest_condition_resolution_denied';
  end if;

  if v_type <> 'custom_narrative' then
    raise exception 'only_custom_narrative_conditions_are_manually_resolved';
  end if;

  insert into public.quest_condition_states(
    condition_id,
    satisfied,
    resolution_source,
    evidence,
    satisfied_at,
    last_evaluated_at
  )
  values(
    p_condition_id,
    p_satisfied,
    'gm',
    jsonb_build_object(
      'note', left(coalesce(p_note, ''), 6000),
      'resolved_by', v_user_id
    ),
    case when p_satisfied then now() else null end,
    now()
  )
  on conflict(condition_id) do update
  set satisfied = excluded.satisfied,
      resolution_source = 'gm',
      evidence = excluded.evidence,
      satisfied_at = excluded.satisfied_at,
      last_evaluated_at = excluded.last_evaluated_at;

  perform private.resolve_quest_v1(v_quest_id);

  return jsonb_build_object(
    'ok', true,
    'condition_id', p_condition_id,
    'satisfied', p_satisfied
  );
end;
$$;

revoke all on function public.set_quest_condition_resolution_v1(uuid, boolean, text)
from public, anon, authenticated;
grant execute on function public.set_quest_condition_resolution_v1(uuid, boolean, text)
to authenticated, service_role;

create or replace function public.read_quest_plan_v1(
  p_quest_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.can_manage_quest(p_quest_id, v_user_id) then
    raise exception 'quest_plan_read_denied';
  end if;

  select jsonb_build_object(
    'quest', to_jsonb(q),
    'characters', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'character_id', qc.character_id,
          'role', qc.role,
          'created_at', qc.created_at
        )
        order by case qc.role when 'primary' then 0 else 1 end, qc.created_at
      )
      from public.quest_characters qc
      where qc.quest_id = q.id
    ), '[]'::jsonb),
    'secret', coalesce((
      select to_jsonb(qsec)
      from public.quest_secrets qsec
      where qsec.quest_id = q.id
    ), '{}'::jsonb),
    'stages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', qs.id,
          'stage_key', qs.stage_key,
          'position', qs.position,
          'status', qs.status,
          'player_title', qs.player_title,
          'completion_text', qs.completion_text,
          'completed_at', qs.completed_at,
          'created_at', qs.created_at,
          'updated_at', qs.updated_at,
          'secret', coalesce((
            select to_jsonb(qss)
            from public.quest_stage_secrets qss
            where qss.stage_id = qs.id
          ), '{}'::jsonb)
        )
        order by qs.position
      )
      from public.quest_stages qs
      where qs.quest_id = q.id
    ), '[]'::jsonb),
    'targets', coalesce((
      select jsonb_agg(to_jsonb(qt) order by qt.created_at, qt.target_key)
      from public.quest_targets qt
      where qt.quest_id = q.id
    ), '[]'::jsonb),
    'condition_groups', coalesce((
      select jsonb_agg(to_jsonb(qcg) order by qs.position, qcg.position, qcg.group_key)
      from public.quest_condition_groups qcg
      join public.quest_stages qs on qs.id = qcg.stage_id
      where qs.quest_id = q.id
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(
        to_jsonb(qcnd)
        || jsonb_build_object(
          'state', coalesce((
            select to_jsonb(qcs)
            from public.quest_condition_states qcs
            where qcs.condition_id = qcnd.id
          ), jsonb_build_object(
            'satisfied', false,
            'resolution_source', 'pending',
            'evidence', '{}'::jsonb,
            'satisfied_at', null,
            'last_evaluated_at', null
          ))
        )
        order by qs.position, qcg.position, qcnd.position, qcnd.condition_key
      )
      from public.quest_conditions qcnd
      join public.quest_condition_groups qcg on qcg.id = qcnd.group_id
      join public.quest_stages qs on qs.id = qcg.stage_id
      where qs.quest_id = q.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.quests q
  where q.id = p_quest_id;

  if v_result is null then
    raise exception 'quest_not_found';
  end if;

  return v_result;
end;
$$;

comment on table public.quest_condition_states is
  'Resolver state and evidence for structured quest conditions. Manager-only; player quest RPC never exposes it.';

comment on function public.resolve_quest_v1(uuid) is
  'Manager-only explicit Quest Resolver pass. Normal state changes also invoke the resolver automatically.';

comment on function public.set_quest_condition_resolution_v1(uuid, boolean, text) is
  'Manager-only manual resolution for custom_narrative quest conditions.';
;