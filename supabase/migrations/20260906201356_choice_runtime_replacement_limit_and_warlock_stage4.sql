-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:warlock
-- CLASS_PACKAGE_TEST: tests/warlockStage4UiQa.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: warlock:base=READY;invocations=RUNTIME_READY;ui_qa=STAGE4;subclasses=UNCHANGED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- Stage 4: generic Choice Runtime v2 replacement limit plus Warlock 2024 invocation replacement policy.

begin;

-- Move the already-audited v2 implementation behind a private core and keep the
-- public signature as the authoritative policy wrapper.
alter function public.commit_character_template_choice_v2(uuid,text,jsonb) set schema private;
alter function private.commit_character_template_choice_v2(uuid,text,jsonb) rename to commit_character_template_choice_v2_core_stage4;
revoke all on function private.commit_character_template_choice_v2_core_stage4(uuid,text,jsonb) from public, anon, authenticated, service_role;

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
  v_before jsonb := '[]'::jsonb;
  v_after jsonb := '[]'::jsonb;
  v_legacy jsonb;
  v_result jsonb;
  v_removed integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_choice_key, '')), '') is null then
    raise exception 'CHOICE_KEY_REQUIRED';
  end if;

  select * into v_assignment
  from public.character_template_assignments
  where id = p_assignment_id;
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

  if v_replacement_limit is not null and jsonb_array_length(v_before) > 0 then
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

    if v_removed > v_replacement_limit then
      raise exception 'CHOICE_REPLACEMENT_LIMIT_EXCEEDED:limit=%:actual=%', v_replacement_limit, v_removed;
    end if;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.commit_character_template_choice_v2(uuid,text,jsonb) from public, anon;
grant execute on function public.commit_character_template_choice_v2(uuid,text,jsonb) to authenticated, service_role;

comment on function public.commit_character_template_choice_v2(uuid,text,jsonb) is
'Choice Runtime v2 policy wrapper. Preserves structured validation/replacement semantics and enforces optional replacement_limit as a multiset of durable option+selector identities.';

create or replace function private.apply_warlock_stage4_choice_policy_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_warlock public.rule_templates%rowtype;
  v_choices jsonb;
begin
  select * into v_warlock
  from public.rule_templates
  where campaign_id = p_campaign_id
    and catalog_key = 'class:warlock'
    and is_active = true
  order by version desc
  limit 1;

  if v_warlock.id is null then
    return;
  end if;

  select coalesce(jsonb_agg(
    case when e.value->>'key' = 'warlock_eldritch_invocations'
      then e.value || jsonb_build_object(
        'replacement_policy', 'on_level_change',
        'replacement_limit', 1
      )
      else e.value
    end
    order by e.ordinality
  ), '[]'::jsonb)
  into v_choices
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) with ordinality e(value, ordinality)
  where l.template_id = v_warlock.id and l.level = 1;

  update public.rule_template_levels
  set choices = v_choices
  where template_id = v_warlock.id and level = 1;

  update public.rule_templates
  set catalog_revision = 'xphb-2024-warlock-ui-qa-v1',
      rules_meta = coalesce(rules_meta, '{}'::jsonb) || jsonb_build_object(
        'runtime_revision', 'xphb-2024-warlock-ui-qa-v1',
        'stage_4_ui_qa', true,
        'invocation_replacement_policy', 'on_level_change',
        'invocation_replacement_limit', 1,
        'subclass_runtime_included', false
      ),
      updated_at = now()
  where id = v_warlock.id;
end;
$function$;

revoke all on function private.apply_warlock_stage4_choice_policy_v1(uuid) from public;

create or replace function private.apply_warlock_stage4_choice_policy_on_campaign_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.apply_warlock_stage4_choice_policy_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.apply_warlock_stage4_choice_policy_on_campaign_v1() from public;

drop trigger if exists zzzzzzzze_campaigns_apply_warlock_stage4_choice_policy_v1 on public.campaigns;
create trigger zzzzzzzze_campaigns_apply_warlock_stage4_choice_policy_v1
after insert on public.campaigns
for each row execute function private.apply_warlock_stage4_choice_policy_on_campaign_v1();

do $apply$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.apply_warlock_stage4_choice_policy_v1(v_campaign.id);
  end loop;
end
$apply$;

commit;
