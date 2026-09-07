-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:warlock
-- CLASS_PACKAGE_TEST: tests/warlockInvocationStage3Closure.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: warlock:text=IN_PROGRESS;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- STAGE3_AUTOMATED: armor-of-shadows,ascendant-step,devils-sight,mask-of-many-faces,master-of-myriad-forms,misty-visions,otherworldly-leap,pact-of-the-chain,pact-of-the-tome,visions-of-distant-realms,whispers-of-the-grave,witch-sight
-- STAGE3_RESOURCE_ACTION: eldritch-smite,gift-of-the-depths,gift-of-the-protectors
-- STAGE3_GM_SEMANTIC: agonizing-blast,devouring-blade,eldritch-mind,eldritch-spear,fiendish-vigor,gaze-of-two-minds,investment-of-the-chain-master,lessons-of-the-first-ones,lifedrinker,one-with-shadows,pact-of-the-blade,repelling-blast,thirsting-blade
--
-- Stage 3 closes the base Warlock invocation runtime without inventing scene state.
-- Every 2024 invocation is explicitly classified as Character Engine automated,
-- finite resource/action bookkeeping, or a structured GM-adjudicated rule.

begin;

create or replace function private.certify_warlock_invocation_stage3_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_warlock uuid;
  v_choices jsonb;
  v_choice jsonb;
  v_rebuilt jsonb;
  v_auto text[] := array[
    'armor-of-shadows','ascendant-step','devils-sight','mask-of-many-faces',
    'master-of-myriad-forms','misty-visions','otherworldly-leap','pact-of-the-chain',
    'pact-of-the-tome','visions-of-distant-realms','whispers-of-the-grave','witch-sight'
  ];
  v_resource text[] := array['eldritch-smite','gift-of-the-depths','gift-of-the-protectors'];
  v_semantic text[] := array[
    'agonizing-blast','devouring-blade','eldritch-mind','eldritch-spear','fiendish-vigor',
    'gaze-of-two-minds','investment-of-the-chain-master','lessons-of-the-first-ones',
    'lifedrinker','one-with-shadows','pact-of-the-blade','repelling-blast','thirsting-blade'
  ];
  v_all text[];
  v_spell_auto text[] := array[
    'armor-of-shadows','ascendant-step','mask-of-many-faces','master-of-myriad-forms',
    'misty-visions','otherworldly-leap','pact-of-the-chain','visions-of-distant-realms',
    'whispers-of-the-grave'
  ];
  v_slug text;
  v_mode text;
  v_boundary text;
  v_rule jsonb;
  v_count integer;
  v_distinct integer;
  v_tome_cantrips jsonb;
  v_tome_rituals jsonb;
begin
  select id into v_warlock
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:warlock'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_warlock is null then
    return;
  end if;

  select choices into v_choices
  from public.rule_template_levels
  where template_id=v_warlock and level=1;

  if v_choices is null then
    raise exception 'WARLOCK_STAGE3_LEVEL1_MISSING';
  end if;

  select x.value into v_choice
  from jsonb_array_elements(v_choices) x(value)
  where x.value->>'key'='warlock_eldritch_invocations'
  limit 1;

  if v_choice is null then
    raise exception 'WARLOCK_STAGE3_INVOCATION_CHOICE_MISSING';
  end if;

  v_all := v_auto || v_resource || v_semantic;
  select count(*),count(distinct x) into v_count,v_distinct from unnest(v_all) x;
  if v_count<>28 or v_distinct<>28 then
    raise exception 'WARLOCK_STAGE3_CERTIFICATION_SET_INVALID:%/%',v_count,v_distinct;
  end if;

  if jsonb_array_length(coalesce(v_choice->'options','[]'::jsonb))<>28 then
    raise exception 'WARLOCK_STAGE3_CATALOG_COUNT_INVALID';
  end if;

  if exists(
    select 1 from unnest(v_all) expected
    where not exists(
      select 1 from jsonb_array_elements_text(v_choice->'options') actual(value)
      where actual.value=expected
    )
  ) or exists(
    select 1 from jsonb_array_elements_text(v_choice->'options') actual(value)
    where not (actual.value=any(v_all))
  ) then
    raise exception 'WARLOCK_STAGE3_CATALOG_SET_MISMATCH';
  end if;

  if coalesce(v_choice->>'selection_mode','')<>'player_once'
     or coalesce(v_choice->>'replacement_policy','')<>'on_level_change'
     or coalesce((v_choice->>'replacement_limit')::integer,0)<>1 then
    raise exception 'WARLOCK_STAGE3_CHOICE_POLICY_INVALID';
  end if;

  foreach v_slug in array v_spell_auto loop
    if not exists(
      select 1
      from jsonb_array_elements(coalesce(v_choice->'option_rules'->v_slug->'mechanics','[]'::jsonb)) m(value)
      where m.value->>'type'='spell'
    ) then
      raise exception 'WARLOCK_STAGE3_EXPECTED_SPELL_ACCESS_MISSING:%',v_slug;
    end if;
  end loop;

  foreach v_slug in array array['devils-sight','witch-sight'] loop
    if not exists(
      select 1
      from jsonb_array_elements(coalesce(v_choice->'option_rules'->v_slug->'mechanics','[]'::jsonb)) m(value)
      where m.value->>'type'='grant' and m.value->>'target'='sense'
    ) then
      raise exception 'WARLOCK_STAGE3_EXPECTED_SENSE_MISSING:%',v_slug;
    end if;
  end loop;

  if not exists(
    select 1 from jsonb_array_elements(coalesce(v_choice->'option_rules'->'eldritch-smite'->'mechanics','[]'::jsonb)) m(value)
    where m.value->>'type'='action'
  ) then raise exception 'WARLOCK_STAGE3_ELDRITCH_SMITE_ACTION_MISSING'; end if;

  if not exists(
    select 1 from jsonb_array_elements(coalesce(v_choice->'option_rules'->'gift-of-the-depths'->'mechanics','[]'::jsonb)) m(value)
    where m.value->>'type'='resource'
  ) or not exists(
    select 1 from jsonb_array_elements(coalesce(v_choice->'option_rules'->'gift-of-the-depths'->'mechanics','[]'::jsonb)) m(value)
    where m.value->>'type'='spell'
  ) then raise exception 'WARLOCK_STAGE3_GIFT_DEPTHS_RUNTIME_INCOMPLETE'; end if;

  if not exists(
    select 1 from jsonb_array_elements(coalesce(v_choice->'option_rules'->'gift-of-the-protectors'->'mechanics','[]'::jsonb)) m(value)
    where m.value->>'type'='resource'
  ) or not exists(
    select 1 from jsonb_array_elements(coalesce(v_choice->'option_rules'->'gift-of-the-protectors'->'mechanics','[]'::jsonb)) m(value)
    where m.value->>'type'='action'
  ) then raise exception 'WARLOCK_STAGE3_GIFT_PROTECTORS_RUNTIME_INCOMPLETE'; end if;

  select x.value into v_tome_cantrips
  from jsonb_array_elements(v_choices) x(value)
  where x.value->>'key'='warlock_pact_tome_cantrips'
  limit 1;
  select x.value into v_tome_rituals
  from jsonb_array_elements(v_choices) x(value)
  where x.value->>'key'='warlock_pact_tome_rituals'
  limit 1;

  if v_tome_cantrips is null or v_tome_rituals is null
     or v_tome_cantrips->>'refresh'<>'short_or_long_rest'
     or v_tome_rituals->>'refresh'<>'short_or_long_rest'
     or v_tome_cantrips->'requires_choice'->>'key'<>'warlock_eldritch_invocations'
     or v_tome_cantrips->'requires_choice'->>'option'<>'pact-of-the-tome'
     or v_tome_rituals->'requires_choice'->>'key'<>'warlock_eldritch_invocations'
     or v_tome_rituals->'requires_choice'->>'option'<>'pact-of-the-tome'
     or coalesce((v_tome_cantrips->>'count')::integer,0)<>3
     or coalesce((v_tome_rituals->>'count')::integer,0)<>2 then
    raise exception 'WARLOCK_STAGE3_PACT_TOME_RUNTIME_INVALID';
  end if;

  foreach v_slug in array v_all loop
    v_mode := case
      when v_slug=any(v_auto) then 'automated'
      when v_slug=any(v_resource) then 'resource_action'
      else 'gm_semantic'
    end;

    v_boundary := case v_slug
      when 'agonizing-blast' then 'selected_cantrip_roll_modifier'
      when 'devouring-blade' then 'dynamic_pact_weapon_attack_sequence'
      when 'eldritch-mind' then 'concentration_save_advantage'
      when 'eldritch-spear' then 'selected_cantrip_range_override'
      when 'fiendish-vigor' then 'false_life_maximum_roll_override'
      when 'gaze-of-two-minds' then 'scene_linked_senses'
      when 'investment-of-the-chain-master' then 'familiar_scene_actions'
      when 'lessons-of-the-first-ones' then 'origin_feat_runtime_catalog_pending'
      when 'lifedrinker' then 'once_per_turn_pact_weapon_hit'
      when 'one-with-shadows' then 'scene_light_condition'
      when 'pact-of-the-blade' then 'dynamic_weapon_binding_transaction'
      when 'repelling-blast' then 'confirmed_cantrip_hit_and_target'
      when 'thirsting-blade' then 'dynamic_pact_weapon_attack_sequence'
      when 'eldritch-smite' then 'confirmed_pact_weapon_hit'
      when 'gift-of-the-protectors' then 'lethal_damage_trigger'
      else null
    end;

    v_rule := coalesce(v_choice->'option_rules'->v_slug,'{}'::jsonb)
      || jsonb_build_object(
        'runtime',jsonb_strip_nulls(jsonb_build_object(
          'stage',3,
          'mode',v_mode,
          'owner',case when v_mode='automated' then 'character_engine' when v_mode='resource_action' then 'gena_resource_plus_gm_trigger' else 'gm_adjudication' end,
          'boundary',v_boundary,
          'certified',true
        ))
      );
    v_choice := jsonb_set(v_choice,array['option_rules',v_slug],v_rule,true);
  end loop;

  select jsonb_agg(
    case when x.value->>'key'='warlock_eldritch_invocations' then v_choice else x.value end
    order by x.ord
  ) into v_rebuilt
  from jsonb_array_elements(v_choices) with ordinality x(value,ord);

  update public.rule_template_levels
  set choices=v_rebuilt
  where template_id=v_warlock and level=1;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
    'invocation_runtime_stage',3,
    'invocation_runtime_certified',true,
    'invocation_runtime_certification_revision','xphb-2024-warlock-stage3-closure-v1',
    'invocation_runtime_coverage',jsonb_build_object(
      'total',28,
      'automated',to_jsonb(v_auto),
      'resource_action',to_jsonb(v_resource),
      'gm_semantic',to_jsonb(v_semantic),
      'gm_boundary','src/rule-templates/GM_ADJUDICATION_BOUNDARY.md'
    ),
    'pact_boons_runtime',jsonb_build_object(
      'pact-of-the-blade','structured_dynamic_weapon_binding',
      'pact-of-the-chain','find_familiar_at_will_spell_access',
      'pact-of-the-tome','dependent_rest_editable_spell_choices'
    )
  ),updated_at=now()
  where id=v_warlock;
end;
$function$;

revoke all on function private.certify_warlock_invocation_stage3_v1(uuid) from public,anon,authenticated;
grant execute on function private.certify_warlock_invocation_stage3_v1(uuid) to service_role;

create or replace function private.apply_warlock_invocation_stage3_closure_after_campaign_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.certify_warlock_invocation_stage3_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.apply_warlock_invocation_stage3_closure_after_campaign_v1() from public,anon,authenticated;

drop trigger if exists zzzzzzzzzzz_warlock_stage3_invocation_closure_v1 on public.campaigns;
create trigger zzzzzzzzzzz_warlock_stage3_invocation_closure_v1
after insert on public.campaigns
for each row execute function private.apply_warlock_invocation_stage3_closure_after_campaign_v1();

do $block$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.certify_warlock_invocation_stage3_v1(r.id);
  end loop;
end;
$block$;

commit;