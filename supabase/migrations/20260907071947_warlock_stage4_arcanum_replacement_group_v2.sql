-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:warlock
-- CLASS_PACKAGE_TEST: tests/warlockHighLevelStage4Closure.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: warlock:text=IN_PROGRESS;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Stage 4 precision closure: Mystic Arcanum allows one total arcanum replacement
-- whenever a Warlock level is gained, not one replacement per arcanum spell level.
-- The shared Choice Runtime gains generic cross-choice replacement groups.

begin;

create or replace function public.commit_character_template_choice_v2(
  p_assignment_id uuid,
  p_choice_key text,
  p_instances jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_source_level integer;
  v_choice jsonb;
  v_replacement_limit integer;
  v_replacement_group text;
  v_replacement_group_limit integer;
  v_before jsonb := '[]'::jsonb;
  v_after jsonb := '[]'::jsonb;
  v_legacy jsonb;
  v_result jsonb;
  v_removed integer := 0;
  v_selected_after jsonb;
  v_runtime_after jsonb;
  v_groups jsonb;
  v_group_state jsonb;
  v_group_used integer := 0;
  v_group_source_level integer;
  v_group_next jsonb;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_choice_key, '')), '') is null then
    raise exception 'CHOICE_KEY_REQUIRED';
  end if;

  select * into v_assignment
  from public.character_template_assignments
  where id = p_assignment_id
  for update;
  if v_assignment.id is null then
    raise exception 'TEMPLATE_ASSIGNMENT_NOT_FOUND';
  end if;

  select * into v_template
  from public.rule_templates
  where id = v_assignment.template_id and is_active = true;
  if v_template.id is null then
    raise exception 'ACTIVE_TEMPLATE_NOT_FOUND';
  end if;

  v_source_level := private.character_template_source_level(v_assignment.id);
  if v_source_level is null then
    raise exception 'CHOICE_SOURCE_NOT_UNLOCKED';
  end if;

  select q.choice into v_choice
  from (
    select 0 as level, c.choice
    from jsonb_array_elements(coalesce(v_template.choices, '[]'::jsonb)) c(choice)
    union all
    select l.level, c.choice
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) c(choice)
    where l.template_id = v_template.id and l.level <= v_source_level
  ) q
  where q.choice->>'key' = btrim(p_choice_key)
  order by q.level desc
  limit 1;

  if v_choice is null then
    raise exception 'CHOICE_NOT_UNLOCKED';
  end if;

  if nullif(v_choice->>'replacement_limit', '') is not null then
    v_replacement_limit := (v_choice->>'replacement_limit')::integer;
    if v_replacement_limit < 1 then
      raise exception 'CHOICE_REPLACEMENT_LIMIT_INVALID:%', v_replacement_limit;
    end if;
  end if;

  v_replacement_group := nullif(btrim(coalesce(v_choice->>'replacement_group', '')), '');
  if nullif(v_choice->>'replacement_group_limit', '') is not null then
    v_replacement_group_limit := (v_choice->>'replacement_group_limit')::integer;
  end if;

  if v_replacement_group is null and v_replacement_group_limit is not null then
    raise exception 'CHOICE_REPLACEMENT_GROUP_REQUIRED';
  end if;
  if v_replacement_group is not null and v_replacement_group_limit is null then
    raise exception 'CHOICE_REPLACEMENT_GROUP_LIMIT_REQUIRED:%', v_replacement_group;
  end if;
  if v_replacement_group_limit is not null and v_replacement_group_limit < 1 then
    raise exception 'CHOICE_REPLACEMENT_GROUP_LIMIT_INVALID:%', v_replacement_group_limit;
  end if;

  v_before := coalesce(
    coalesce(v_assignment.selected_choices, '{}'::jsonb) #> array['_choice_runtime_v2','choices',btrim(p_choice_key),'instances'],
    '[]'::jsonb
  );
  if jsonb_typeof(v_before) <> 'array' or jsonb_array_length(v_before) = 0 then
    v_legacy := coalesce(v_assignment.selected_choices, '{}'::jsonb)->btrim(p_choice_key);
    if jsonb_typeof(v_legacy) = 'string' then
      v_before := jsonb_build_array(jsonb_build_object('option', v_legacy #>> '{}'));
    elsif jsonb_typeof(v_legacy) = 'array' then
      select coalesce(jsonb_agg(jsonb_build_object('option', x.value)), '[]'::jsonb)
      into v_before
      from jsonb_array_elements_text(v_legacy) x(value);
    else
      v_before := '[]'::jsonb;
    end if;
  end if;

  v_result := private.commit_character_template_choice_v2_core_stage4(
    p_assignment_id,
    btrim(p_choice_key),
    p_instances
  );

  if (v_replacement_limit is not null or v_replacement_group is not null)
     and jsonb_array_length(v_before) > 0 then
    v_after := coalesce(v_result->'instances', '[]'::jsonb);
    if jsonb_typeof(v_after) <> 'array' then
      v_after := '[]'::jsonb;
    end if;

    with before_counts as (
      select
        case
          when jsonb_typeof(i.value) = 'string' then i.value #>> '{}'
          else coalesce(i.value->>'option', i.value->>'key', i.value->>'slug', '')
        end || chr(31) ||
        case when jsonb_typeof(i.value) = 'object' then coalesce(i.value->>'selector_value', i.value->>'target', '') else '' end as identity,
        count(*)::integer as n
      from jsonb_array_elements(v_before) i(value)
      group by 1
    ), after_counts as (
      select
        case
          when jsonb_typeof(i.value) = 'string' then i.value #>> '{}'
          else coalesce(i.value->>'option', i.value->>'key', i.value->>'slug', '')
        end || chr(31) ||
        case when jsonb_typeof(i.value) = 'object' then coalesce(i.value->>'selector_value', i.value->>'target', '') else '' end as identity,
        count(*)::integer as n
      from jsonb_array_elements(v_after) i(value)
      group by 1
    )
    select coalesce(sum(greatest(b.n - coalesce(a.n, 0), 0)), 0)::integer
    into v_removed
    from before_counts b
    left join after_counts a using(identity);
  end if;

  if v_replacement_limit is not null and v_removed > v_replacement_limit then
    raise exception 'CHOICE_REPLACEMENT_LIMIT_EXCEEDED:limit=%:actual=%', v_replacement_limit, v_removed;
  end if;

  if v_replacement_group is not null and v_removed > 0 then
    v_selected_after := coalesce(v_result->'selected_choices', '{}'::jsonb);
    if jsonb_typeof(v_selected_after) <> 'object' then
      raise exception 'CHOICE_RUNTIME_SELECTED_CHOICES_INVALID';
    end if;

    v_runtime_after := coalesce(v_selected_after->'_choice_runtime_v2', '{}'::jsonb);
    if jsonb_typeof(v_runtime_after) <> 'object' then
      v_runtime_after := '{}'::jsonb;
    end if;

    v_groups := coalesce(v_runtime_after->'replacement_groups', '{}'::jsonb);
    if jsonb_typeof(v_groups) <> 'object' then
      v_groups := '{}'::jsonb;
    end if;

    v_group_state := coalesce(v_groups->v_replacement_group, '{}'::jsonb);
    if jsonb_typeof(v_group_state) <> 'object' then
      v_group_state := '{}'::jsonb;
    end if;

    if nullif(v_group_state->>'source_level', '') is not null then
      v_group_source_level := (v_group_state->>'source_level')::integer;
    end if;
    if v_group_source_level = v_source_level then
      v_group_used := coalesce(nullif(v_group_state->>'used', '')::integer, 0);
    else
      v_group_used := 0;
    end if;

    if v_group_used + v_removed > v_replacement_group_limit then
      raise exception 'CHOICE_REPLACEMENT_GROUP_LIMIT_EXCEEDED:group=%:limit=%:actual=%',
        v_replacement_group,
        v_replacement_group_limit,
        v_group_used + v_removed;
    end if;

    v_group_next := jsonb_build_object(
      'source_level', v_source_level,
      'used', v_group_used + v_removed,
      'updated_at', to_jsonb(now())
    );
    v_groups := jsonb_set(v_groups, array[v_replacement_group], v_group_next, true);
    v_runtime_after := jsonb_set(v_runtime_after, '{replacement_groups}', v_groups, true);
    v_selected_after := jsonb_set(v_selected_after, '{_choice_runtime_v2}', v_runtime_after, true);

    update public.character_template_assignments
    set selected_choices = v_selected_after,
        updated_at = now()
    where id = v_assignment.id
    returning updated_at into v_updated_at;

    v_result := jsonb_set(v_result, '{selected_choices}', v_selected_after, true);
    v_result := jsonb_set(v_result, '{updated_at}', to_jsonb(v_updated_at), true);
  end if;

  return v_result;
end;
$function$;

revoke all on function public.commit_character_template_choice_v2(uuid,text,jsonb) from public, anon;
grant execute on function public.commit_character_template_choice_v2(uuid,text,jsonb) to authenticated, service_role;

comment on function public.commit_character_template_choice_v2(uuid,text,jsonb) is
'Choice Runtime v2 policy wrapper. Enforces per-choice replacement_limit and optional cross-choice replacement_group/replacement_group_limit budgets under one assignment lock.';

create or replace function private.apply_warlock_stage4_arcanum_replacement_group_v2(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_warlock uuid;
  v_level integer;
  v_key text;
  v_choices jsonb;
  v_certified integer;
begin
  perform private.apply_warlock_stage4_high_level_runtime_v1(p_campaign_id);

  select id into v_warlock
  from public.rule_templates
  where campaign_id = p_campaign_id
    and kind = 'class'
    and catalog_key = 'class:warlock'
    and is_active
  order by version desc, created_at desc
  limit 1;

  if v_warlock is null then
    return;
  end if;

  for v_level, v_key in
    select * from (values
      (11, 'warlock_mystic_arcanum_6'::text),
      (13, 'warlock_mystic_arcanum_7'::text),
      (15, 'warlock_mystic_arcanum_8'::text),
      (17, 'warlock_mystic_arcanum_9'::text)
    ) x(class_level, choice_key)
  loop
    select coalesce(jsonb_agg(
      case
        when e.value->>'key' = v_key then
          e.value || jsonb_build_object(
            'replacement_group', 'warlock_mystic_arcanum',
            'replacement_group_limit', 1
          )
        else e.value
      end
      order by e.ord
    ), '[]'::jsonb)
    into v_choices
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) with ordinality e(value, ord)
    where l.template_id = v_warlock and l.level = v_level;

    update public.rule_template_levels
    set choices = v_choices
    where template_id = v_warlock and level = v_level;
  end loop;

  select count(*)::integer
  into v_certified
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) c(choice)
  where l.template_id = v_warlock
    and c.choice->>'key' in (
      'warlock_mystic_arcanum_6',
      'warlock_mystic_arcanum_7',
      'warlock_mystic_arcanum_8',
      'warlock_mystic_arcanum_9'
    )
    and c.choice->>'replacement_group' = 'warlock_mystic_arcanum'
    and (c.choice->>'replacement_group_limit')::integer = 1;

  if v_certified <> 4 then
    raise exception 'WARLOCK_STAGE4_ARCANUM_REPLACEMENT_GROUP_INVALID:%', v_certified;
  end if;

  update public.rule_templates
  set rules_meta = coalesce(rules_meta, '{}'::jsonb) || jsonb_build_object(
        'stage4_high_level_runtime', true,
        'stage4_high_level_revision', 'xphb-2024-warlock-high-level-runtime-v2',
        'mystic_arcanum_replacement_group', 'warlock_mystic_arcanum',
        'mystic_arcanum_replacement_group_limit', 1
      ),
      updated_at = now()
  where id = v_warlock;
end;
$function$;

revoke all on function private.apply_warlock_stage4_arcanum_replacement_group_v2(uuid) from public, anon, authenticated;
grant execute on function private.apply_warlock_stage4_arcanum_replacement_group_v2(uuid) to service_role;

create or replace function private.apply_warlock_stage4_arcanum_replacement_group_after_campaign_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.apply_warlock_stage4_arcanum_replacement_group_v2(new.id);
  return new;
end;
$function$;

revoke all on function private.apply_warlock_stage4_arcanum_replacement_group_after_campaign_v2() from public, anon, authenticated;

drop trigger if exists zzzzzzzzzzzzzzzz_warlock_stage4_high_level_group_v2 on public.campaigns;
create trigger zzzzzzzzzzzzzzzz_warlock_stage4_high_level_group_v2
after insert on public.campaigns
for each row execute function private.apply_warlock_stage4_arcanum_replacement_group_after_campaign_v2();

do $apply$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.apply_warlock_stage4_arcanum_replacement_group_v2(v_campaign.id);
  end loop;
end
$apply$;

commit;