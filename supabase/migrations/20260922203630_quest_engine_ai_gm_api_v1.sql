
create or replace function private.quest_plan_build_guard_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select current_setting('meganot.quest_plan_building', true) = '1';
$$;

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
  if private.quest_plan_build_guard_v1() then
    return coalesce(new, old);
  end if;

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
  if private.quest_plan_build_guard_v1() then
    return coalesce(new, old);
  end if;

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

create or replace function private.quest_resolve_from_target_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quest_id uuid;
begin
  if private.quest_plan_build_guard_v1() then
    return coalesce(new, old);
  end if;

  v_quest_id := coalesce(new.quest_id, old.quest_id);

  if v_quest_id is not null then
    perform private.resolve_quest_v1(v_quest_id);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function private.quest_resolve_active_stage_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.quest_plan_build_guard_v1() then
    return new;
  end if;

  if current_setting('meganot.quest_resolver_running', true) = '1' then
    return new;
  end if;

  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.resolve_quest_v1(new.quest_id);
  end if;

  return new;
end;
$$;

create or replace function public.create_quest_plan_v1(
  p_campaign_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_quest_id uuid;
  v_existing_quest_id uuid;
  v_quest_key text;
  v_title text;
  v_player_brief text;
  v_primary_character_id uuid;
  v_participant text;
  v_stage jsonb;
  v_stage_id uuid;
  v_stage_key text;
  v_stage_pos integer;
  v_target jsonb;
  v_target_id uuid;
  v_target_key text;
  v_target_stage_key text;
  v_target_stage_id uuid;
  v_group jsonb;
  v_group_id uuid;
  v_group_key text;
  v_group_pos integer;
  v_condition jsonb;
  v_condition_key text;
  v_condition_pos integer;
  v_condition_target_id uuid;
  v_condition_target_key text;
  v_stages jsonb;
  v_targets jsonb;
  v_participants jsonb;
  v_groups jsonb;
  v_conditions jsonb;
  v_secret jsonb;
  v_stage_secret jsonb;
  v_previous_guard text;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.can_manage_quest_campaign(p_campaign_id, v_user_id) then
    raise exception 'quest_plan_create_denied';
  end if;

  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'quest_plan_input_object_required';
  end if;

  v_quest_key := left(btrim(coalesce(p_input->>'quest_key', '')), 120);
  v_title := left(btrim(coalesce(p_input->>'title', '')), 240);
  v_player_brief := left(coalesce(p_input->>'player_brief', ''), 6000);

  if v_quest_key = '' then
    raise exception 'quest_key_required';
  end if;

  if v_title = '' then
    raise exception 'quest_title_required';
  end if;

  begin
    v_primary_character_id := nullif(p_input->>'primary_character_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'primary_character_id_invalid';
  end;

  if v_primary_character_id is null then
    raise exception 'primary_character_id_required';
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.id = v_primary_character_id
      and c.campaign_id = p_campaign_id
  ) then
    raise exception 'primary_character_not_found_in_campaign';
  end if;

  select q.id into v_existing_quest_id
  from public.quests q
  where q.campaign_id = p_campaign_id
    and q.quest_key = v_quest_key;

  if v_existing_quest_id is not null then
    return jsonb_build_object(
      'ok', true,
      'created', false,
      'idempotent', true,
      'quest_id', v_existing_quest_id,
      'plan', public.read_quest_plan_v1(v_existing_quest_id)
    );
  end if;

  v_stages := coalesce(p_input->'stages', '[]'::jsonb);
  v_targets := coalesce(p_input->'targets', '[]'::jsonb);
  v_participants := coalesce(p_input->'participant_character_ids', '[]'::jsonb);
  v_secret := coalesce(p_input->'secret', '{}'::jsonb);

  if jsonb_typeof(v_stages) <> 'array'
     or jsonb_array_length(v_stages) < 1
     or jsonb_array_length(v_stages) > 32 then
    raise exception 'quest_stages_must_have_1_to_32_items';
  end if;

  if jsonb_typeof(v_targets) <> 'array'
     or jsonb_array_length(v_targets) > 96 then
    raise exception 'quest_targets_invalid';
  end if;

  if jsonb_typeof(v_participants) <> 'array'
     or jsonb_array_length(v_participants) > 24 then
    raise exception 'quest_participants_invalid';
  end if;

  if jsonb_typeof(v_secret) <> 'object' then
    raise exception 'quest_secret_invalid';
  end if;

  v_previous_guard := current_setting('meganot.quest_plan_building', true);
  perform set_config('meganot.quest_plan_building', '1', true);

  insert into public.quests(
    campaign_id,
    quest_key,
    title,
    player_brief,
    status,
    sort_order,
    created_by
  )
  values(
    p_campaign_id,
    v_quest_key,
    v_title,
    v_player_brief,
    'draft',
    greatest(0, coalesce((p_input->>'sort_order')::integer, 0)),
    v_user_id
  )
  returning id into v_quest_id;

  insert into public.quest_secrets(
    quest_id,
    internal_summary,
    gm_notes,
    ai_directive,
    updated_by
  )
  values(
    v_quest_id,
    left(coalesce(v_secret->>'internal_summary', ''), 12000),
    left(coalesce(v_secret->>'gm_notes', ''), 24000),
    left(coalesce(v_secret->>'ai_directive', ''), 12000),
    v_user_id
  );

  insert into public.quest_characters(
    quest_id,
    character_id,
    role
  )
  values(
    v_quest_id,
    v_primary_character_id,
    'primary'
  );

  for v_participant in
    select value
    from jsonb_array_elements_text(v_participants)
  loop
    begin
      if v_participant::uuid <> v_primary_character_id then
        insert into public.quest_characters(
          quest_id,
          character_id,
          role
        )
        values(
          v_quest_id,
          v_participant::uuid,
          'participant'
        )
        on conflict(quest_id, character_id) do nothing;
      end if;
    exception when invalid_text_representation then
      raise exception 'participant_character_id_invalid:%', v_participant;
    end;
  end loop;

  v_stage_pos := 0;
  for v_stage in
    select value
    from jsonb_array_elements(v_stages)
  loop
    if jsonb_typeof(v_stage) <> 'object' then
      raise exception 'quest_stage_object_required';
    end if;

    v_stage_key := left(btrim(coalesce(v_stage->>'stage_key', '')), 120);
    if v_stage_key = '' then
      raise exception 'quest_stage_key_required_at_position:%', v_stage_pos;
    end if;

    insert into public.quest_stages(
      quest_id,
      stage_key,
      position,
      status,
      player_title,
      completion_text
    )
    values(
      v_quest_id,
      v_stage_key,
      v_stage_pos,
      'planned',
      left(coalesce(v_stage->>'player_title', ''), 240),
      left(coalesce(v_stage->>'completion_text', ''), 6000)
    )
    returning id into v_stage_id;

    v_stage_secret := coalesce(v_stage->'secret', '{}'::jsonb);
    if jsonb_typeof(v_stage_secret) <> 'object' then
      raise exception 'quest_stage_secret_invalid:%', v_stage_key;
    end if;

    insert into public.quest_stage_secrets(
      stage_id,
      internal_title,
      objective,
      gm_notes,
      updated_by
    )
    values(
      v_stage_id,
      left(coalesce(v_stage_secret->>'internal_title', ''), 240),
      left(coalesce(v_stage_secret->>'objective', ''), 12000),
      left(coalesce(v_stage_secret->>'gm_notes', ''), 24000),
      v_user_id
    );

    v_stage_pos := v_stage_pos + 1;
  end loop;

  for v_target in
    select value
    from jsonb_array_elements(v_targets)
  loop
    if jsonb_typeof(v_target) <> 'object' then
      raise exception 'quest_target_object_required';
    end if;

    v_target_key := left(btrim(coalesce(v_target->>'target_key', '')), 120);
    if v_target_key = '' then
      raise exception 'quest_target_key_required';
    end if;

    v_target_stage_key := nullif(left(btrim(coalesce(v_target->>'stage_key', '')), 120), '');
    v_target_stage_id := null;

    if v_target_stage_key is not null then
      select qs.id into v_target_stage_id
      from public.quest_stages qs
      where qs.quest_id = v_quest_id
        and qs.stage_key = v_target_stage_key;

      if v_target_stage_id is null then
        raise exception 'quest_target_stage_key_not_found:%', v_target_stage_key;
      end if;
    end if;

    insert into public.quest_targets(
      quest_id,
      stage_id,
      target_key,
      target_kind,
      placeholder_label,
      internal_note,
      location_id,
      npc_character_id,
      item_definition_id,
      created_by
    )
    values(
      v_quest_id,
      v_target_stage_id,
      v_target_key,
      case
        when v_target->>'target_kind' in ('location','npc','item')
          then v_target->>'target_kind'
        else ''
      end,
      left(btrim(coalesce(v_target->>'placeholder_label', '')), 240),
      left(coalesce(v_target->>'internal_note', ''), 12000),
      nullif(v_target->>'location_id', '')::uuid,
      nullif(v_target->>'npc_character_id', '')::uuid,
      nullif(v_target->>'item_definition_id', '')::uuid,
      v_user_id
    )
    returning id into v_target_id;
  end loop;

  v_stage_pos := 0;
  for v_stage in
    select value
    from jsonb_array_elements(v_stages)
  loop
    v_stage_key := left(btrim(coalesce(v_stage->>'stage_key', '')), 120);

    select qs.id into v_stage_id
    from public.quest_stages qs
    where qs.quest_id = v_quest_id
      and qs.stage_key = v_stage_key;

    v_groups := coalesce(v_stage->'condition_groups', '[]'::jsonb);
    if jsonb_typeof(v_groups) <> 'array'
       or jsonb_array_length(v_groups) > 24 then
      raise exception 'quest_condition_groups_invalid:%', v_stage_key;
    end if;

    v_group_pos := 0;
    for v_group in
      select value
      from jsonb_array_elements(v_groups)
    loop
      if jsonb_typeof(v_group) <> 'object' then
        raise exception 'quest_condition_group_object_required:%', v_stage_key;
      end if;

      v_group_key := left(
        btrim(coalesce(v_group->>'group_key', '')),
        120
      );

      if v_group_key = '' then
        raise exception 'quest_condition_group_key_required:%', v_stage_key;
      end if;

      insert into public.quest_condition_groups(
        stage_id,
        group_key,
        mode,
        position
      )
      values(
        v_stage_id,
        v_group_key,
        case when v_group->>'mode' = 'any' then 'any' else 'all' end,
        v_group_pos
      )
      returning id into v_group_id;

      v_conditions := coalesce(v_group->'conditions', '[]'::jsonb);
      if jsonb_typeof(v_conditions) <> 'array'
         or jsonb_array_length(v_conditions) > 32 then
        raise exception 'quest_conditions_invalid:%:%', v_stage_key, v_group_key;
      end if;

      v_condition_pos := 0;
      for v_condition in
        select value
        from jsonb_array_elements(v_conditions)
      loop
        if jsonb_typeof(v_condition) <> 'object' then
          raise exception 'quest_condition_object_required:%:%', v_stage_key, v_group_key;
        end if;

        v_condition_key := left(
          btrim(coalesce(v_condition->>'condition_key', '')),
          120
        );

        if v_condition_key = '' then
          raise exception 'quest_condition_key_required:%:%', v_stage_key, v_group_key;
        end if;

        v_condition_target_key := nullif(
          left(btrim(coalesce(v_condition->>'target_key', '')), 120),
          ''
        );
        v_condition_target_id := null;

        if v_condition_target_key is not null then
          select qt.id into v_condition_target_id
          from public.quest_targets qt
          where qt.quest_id = v_quest_id
            and qt.target_key = v_condition_target_key;

          if v_condition_target_id is null then
            raise exception 'quest_condition_target_key_not_found:%', v_condition_target_key;
          end if;
        end if;

        insert into public.quest_conditions(
          group_id,
          condition_key,
          condition_type,
          target_id,
          required_quantity,
          negated,
          params,
          position
        )
        values(
          v_group_id,
          v_condition_key,
          coalesce(v_condition->>'condition_type', ''),
          v_condition_target_id,
          greatest(1, coalesce((v_condition->>'required_quantity')::integer, 1)),
          coalesce((v_condition->>'negated')::boolean, false),
          case
            when jsonb_typeof(v_condition->'params') = 'object'
              then v_condition->'params'
            else '{}'::jsonb
          end,
          v_condition_pos
        );

        v_condition_pos := v_condition_pos + 1;
      end loop;

      v_group_pos := v_group_pos + 1;
    end loop;

    v_stage_pos := v_stage_pos + 1;
  end loop;

  perform set_config(
    'meganot.quest_plan_building',
    coalesce(v_previous_guard, ''),
    true
  );

  return jsonb_build_object(
    'ok', true,
    'created', true,
    'idempotent', false,
    'quest_id', v_quest_id,
    'plan', public.read_quest_plan_v1(v_quest_id)
  );
end;
$$;

create or replace function public.activate_quest_v1(
  p_quest_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_stage_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.can_manage_quest(p_quest_id, v_user_id) then
    raise exception 'quest_activate_denied';
  end if;

  select q.status into v_status
  from public.quests q
  where q.id = p_quest_id
  for update;

  if v_status is null then
    raise exception 'quest_not_found';
  end if;

  if v_status in ('completed','failed','cancelled') then
    raise exception 'closed_quest_cannot_be_activated';
  end if;

  if not exists (
    select 1
    from public.quest_stages qs
    where qs.quest_id = p_quest_id
  ) then
    raise exception 'quest_has_no_stages';
  end if;

  update public.quests
  set status = 'active',
      activated_at = coalesce(activated_at, now()),
      closed_at = null
  where id = p_quest_id;

  if not exists (
    select 1
    from public.quest_stages qs
    where qs.quest_id = p_quest_id
      and qs.status = 'active'
  ) then
    select qs.id into v_stage_id
    from public.quest_stages qs
    where qs.quest_id = p_quest_id
      and qs.status = 'planned'
    order by qs.position, qs.id
    limit 1
    for update;

    if v_stage_id is not null then
      update public.quest_stages
      set status = 'active'
      where id = v_stage_id;
    end if;
  end if;

  perform private.resolve_quest_v1(p_quest_id);

  return jsonb_build_object(
    'ok', true,
    'quest_id', p_quest_id,
    'plan', public.read_quest_plan_v1(p_quest_id)
  );
end;
$$;

create or replace function public.set_quest_condition_resolution_ai_v1(
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
    'ai',
    jsonb_build_object(
      'note', left(coalesce(p_note, ''), 6000),
      'resolved_by', v_user_id,
      'agent', 'voss'
    ),
    case when p_satisfied then now() else null end,
    now()
  )
  on conflict(condition_id) do update
  set satisfied = excluded.satisfied,
      resolution_source = 'ai',
      evidence = excluded.evidence,
      satisfied_at = excluded.satisfied_at,
      last_evaluated_at = excluded.last_evaluated_at;

  perform private.resolve_quest_v1(v_quest_id);

  return jsonb_build_object(
    'ok', true,
    'condition_id', p_condition_id,
    'satisfied', p_satisfied,
    'source', 'ai'
  );
end;
$$;

create or replace function public.close_quest_v1(
  p_quest_id uuid,
  p_status text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_quest public.quests%rowtype;
  v_character_ids uuid[];
  v_event_type text;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.can_manage_quest(p_quest_id, v_user_id) then
    raise exception 'quest_close_denied';
  end if;

  if p_status not in ('completed','failed','cancelled') then
    raise exception 'quest_close_status_invalid';
  end if;

  select * into v_quest
  from public.quests q
  where q.id = p_quest_id
  for update;

  if not found then
    raise exception 'quest_not_found';
  end if;

  if p_status = 'completed' and exists (
    select 1
    from public.quest_stages qs
    where qs.quest_id = p_quest_id
      and qs.status not in ('completed','skipped')
  ) then
    raise exception 'quest_cannot_complete_with_open_stages';
  end if;

  update public.quests
  set status = p_status,
      closed_at = now()
  where id = p_quest_id;

  if p_status = 'failed' then
    update public.quest_stages
    set status = 'failed'
    where quest_id = p_quest_id
      and status = 'active';
  end if;

  if p_status = 'cancelled' then
    update public.quest_stages
    set status = 'skipped'
    where quest_id = p_quest_id
      and status = 'active';
  end if;

  select coalesce(array_agg(qc.character_id order by qc.created_at), '{}'::uuid[])
    into v_character_ids
  from public.quest_characters qc
  where qc.quest_id = p_quest_id;

  v_event_type := 'quest.' || p_status;

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
    v_event_type,
    'quest_engine',
    'quest:' || p_quest_id::text || ':' || p_status,
    v_character_ids,
    case p_status
      when 'completed' then 'Квест завершён: ' || v_quest.title
      when 'failed' then 'Квест провален: ' || v_quest.title
      else 'Квест закрыт: ' || v_quest.title
    end,
    jsonb_build_object(
      'quest_id', p_quest_id,
      'title', v_quest.title,
      'status', p_status,
      'note', left(coalesce(p_note, ''), 6000)
    ),
    case when p_status = 'completed' then 3 else 2 end,
    'characters',
    v_character_ids,
    1,
    jsonb_build_object(
      'engine', 'quest_tools_v1',
      'automatic', false,
      'actor_user_id', v_user_id
    ),
    now()
  )
  on conflict(campaign_id, source_kind, source_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'quest_id', p_quest_id,
    'status', p_status,
    'plan', public.read_quest_plan_v1(p_quest_id)
  );
end;
$$;

revoke all on function public.create_quest_plan_v1(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.create_quest_plan_v1(uuid, jsonb)
to authenticated, service_role;

revoke all on function public.activate_quest_v1(uuid)
from public, anon, authenticated;
grant execute on function public.activate_quest_v1(uuid)
to authenticated, service_role;

revoke all on function public.set_quest_condition_resolution_ai_v1(uuid, boolean, text)
from public, anon, authenticated;
grant execute on function public.set_quest_condition_resolution_ai_v1(uuid, boolean, text)
to authenticated, service_role;

revoke all on function public.close_quest_v1(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.close_quest_v1(uuid, text, text)
to authenticated, service_role;

comment on function public.create_quest_plan_v1(uuid, jsonb) is
  'GM/Admin atomic Quest Engine authoring API for AI-GM. Creates an idempotent complete hidden draft plan in one transaction.';

comment on function public.activate_quest_v1(uuid) is
  'GM/Admin Quest Engine lifecycle API. Activates the quest and its first planned stage, then runs the resolver.';

comment on function public.set_quest_condition_resolution_ai_v1(uuid, boolean, text) is
  'GM/Admin AI-GM resolution API for custom_narrative conditions. Records source=ai and resolver evidence.';

comment on function public.close_quest_v1(uuid, text, text) is
  'GM/Admin explicit lifecycle close API for completed, failed, or cancelled quests.';
;