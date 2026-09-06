-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_WORK_STATUS: warlock:base=READY;invocations=RUNTIME_READY;subclasses=UNCHANGED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- CLASS_INTEGRATION_STRICT: class:warlock
-- CLASS_PACKAGE_TEST: tests/warlockInvocationsRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- Stage 3: D&D 2024 Eldritch Invocation runtime. Subclasses remain out of scope.

begin;

create or replace function private.warlock_invocation_spell_mechanic_v1(
  p_spell_slug text,
  p_source_key text,
  p_mechanic_id text,
  p_variant_key text,
  p_method_kind text,
  p_resource_key text default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_spell public.spell_catalog%rowtype;
  v_method jsonb;
begin
  select * into v_spell from public.spell_catalog where slug = p_spell_slug;
  if v_spell.id is null then
    raise exception 'WARLOCK_INVOCATION_SPELL_NOT_FOUND:%', p_spell_slug;
  end if;

  v_method := jsonb_build_object(
    'key', p_method_kind,
    'kind', 'class_feature',
    'ability', 'charisma',
    'requiresPrepared', false
  );
  if nullif(btrim(coalesce(p_resource_key, '')), '') is not null then
    v_method := v_method || jsonb_build_object(
      'resourceOptions', jsonb_build_array(jsonb_build_object(
        'key', 'invocation_free_use',
        'castLevel', v_spell.spell_level,
        'costs', jsonb_build_array(jsonb_build_object('key', p_resource_key, 'amount', 1))
      ))
    );
  end if;

  return jsonb_build_object(
    'id', p_mechanic_id,
    'type', 'spell',
    'key', 'spell:' || v_spell.slug,
    'catalogSlug', v_spell.slug,
    'variantKey', p_variant_key,
    'sourceKey', p_source_key,
    'payload', jsonb_build_object(
      'spell', jsonb_build_object(
        'name', coalesce(nullif(v_spell.name_ru, ''), v_spell.name_en),
        'level', v_spell.spell_level,
        'school', coalesce(v_spell.school, ''),
        'ritual', coalesce(v_spell.ritual, false)
      ),
      'preparation', jsonb_build_object('mode', 'always_prepared'),
      'methods', jsonb_build_array(v_method)
    )
  );
end;
$function$;

revoke all on function private.warlock_invocation_spell_mechanic_v1(text,text,text,text,text,text) from public;

create or replace function private.warlock_invocation_rule_mechanic_v1(
  p_slug text,
  p_label text,
  p_summary text,
  p_runtime_hint jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', 'warlock-invocation-rule-' || p_slug,
    'type', 'grant',
    'target', 'feature',
    'key', 'warlock_invocation_' || replace(p_slug, '-', '_'),
    'sourceKey', 'warlock-invocation:' || p_slug,
    'variantKey', '{{choice.selector_value}}',
    'payload', jsonb_build_object(
      'label', p_label,
      'description', p_summary,
      'mechanic', coalesce(p_runtime_hint, '{}'::jsonb)
        || case when coalesce(p_runtime_hint->>'target', '') = 'selected_cantrip'
             then jsonb_build_object('selected_cantrip', '{{choice.selector_value}}')
             when coalesce(p_runtime_hint->>'target', '') = 'selected_origin_feat'
             then jsonb_build_object('selected_origin_feat', '{{choice.selector_value}}')
             else '{}'::jsonb end
    )
  );
$function$;

revoke all on function private.warlock_invocation_rule_mechanic_v1(text,text,text,jsonb) from public;

create or replace function private.warlock_invocation_mechanics_v1(
  p_slug text,
  p_label text,
  p_summary text,
  p_runtime_hint jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_kind text := coalesce(p_runtime_hint->>'kind', '');
  v_source_key text := 'warlock-invocation:' || p_slug;
  v_result jsonb := jsonb_build_array(private.warlock_invocation_rule_mechanic_v1(p_slug, p_label, p_summary, p_runtime_hint));
  v_spell_slug text;
  v_total_attacks integer;
begin
  if v_kind = 'at_will_spell' then
    -- False Life has an invocation-specific maximum-die rider. Until Roll Engine
    -- can enforce that rider, its exact structured rule is safer than a wrong free cast.
    if p_runtime_hint->>'temp_hp_die' is null then
      v_spell_slug := p_runtime_hint->>'spell_slug';
      v_result := v_result || jsonb_build_array(private.warlock_invocation_spell_mechanic_v1(
        v_spell_slug, v_source_key, 'warlock-invocation-spell-' || p_slug,
        'invocation:' || p_slug, 'invocation_at_will', null
      ));
    end if;
  elsif v_kind = 'sense' then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'warlock-invocation-sense-' || p_slug,
      'type', 'grant',
      'target', 'sense',
      'key', p_runtime_hint->>'sense',
      'sourceKey', v_source_key,
      'payload', jsonb_build_object('range', coalesce((p_runtime_hint->>'range_ft')::integer, 0), 'unit', 'ft')
    ));
  elsif v_kind in ('pact_weapon_extra_attack', 'pact_weapon_extra_attack_upgrade') then
    v_total_attacks := coalesce((p_runtime_hint->>'total_attacks')::integer, 1);
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'warlock-invocation-pact-attacks-' || p_slug,
      'type', 'grant',
      'target', 'value',
      'key', 'warlock_pact_weapon_attack_count',
      'sourceKey', v_source_key,
      'grantOperation', 'REPLACE',
      'priority', v_total_attacks,
      'payload', jsonb_build_object('label', 'Атаки оружием договора', 'value', v_total_attacks)
    ));
  elsif v_kind = 'on_hit_pact_slot' then
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'warlock-invocation-action-' || p_slug,
      'type', 'action',
      'key', 'warlock_eldritch_smite',
      'label', p_label,
      'economy', 'on_hit',
      'sourceKey', v_source_key,
      'resourceCosts', jsonb_build_array(jsonb_build_object('key', 'warlock_pact_slots', 'amount', 1)),
      'damage', jsonb_build_array(jsonb_build_object(
        'key', 'force',
        'damageType', 'force',
        'count', jsonb_build_object('kind', 'add', 'terms', jsonb_build_array(
          jsonb_build_object('kind', 'literal', 'value', 1),
          jsonb_build_object('kind', 'reference', 'key', 'values.warlock_pact_slot_level')
        )),
        'sides', 8
      )),
      'effects', jsonb_build_array(jsonb_build_object(
        'kind', 'semantic', 'key', 'prone_if_eligible',
        'payload', jsonb_build_object('max_target_size', coalesce(p_runtime_hint->>'prone_max_size', 'huge'))
      )),
      'tags', jsonb_build_array('class', 'warlock', 'invocation', 'gm_hit_gate', 'gm_turn_gate')
    ));
  elsif v_kind = 'compound' and p_slug = 'gift-of-the-depths' then
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'id', 'warlock-invocation-resource-gift-of-the-depths',
        'type', 'resource',
        'key', 'warlock_gift_of_the_depths_water_breathing',
        'label', 'Дар глубин: Дыхание под водой',
        'max', 1,
        'recharge', jsonb_build_array('long_rest'),
        'initial', 'full',
        'sourceKey', v_source_key
      ),
      private.warlock_invocation_spell_mechanic_v1(
        'water-breathing', v_source_key, 'warlock-invocation-spell-gift-of-the-depths',
        'invocation:gift-of-the-depths', 'invocation_free_once', 'warlock_gift_of_the_depths_water_breathing'
      )
    );
  elsif v_kind = 'book_of_shadows_protection' then
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'id', 'warlock-invocation-resource-gift-of-the-protectors',
        'type', 'resource',
        'key', 'warlock_gift_of_the_protectors',
        'label', p_label,
        'max', 1,
        'recharge', jsonb_build_array('long_rest'),
        'initial', 'full',
        'sourceKey', v_source_key
      ),
      jsonb_build_object(
        'id', 'warlock-invocation-action-gift-of-the-protectors',
        'type', 'action',
        'key', 'warlock_gift_of_the_protectors',
        'label', p_label,
        'economy', 'triggered',
        'sourceKey', v_source_key,
        'resourceCosts', jsonb_build_array(jsonb_build_object('key', 'warlock_gift_of_the_protectors', 'amount', 1)),
        'effects', jsonb_build_array(jsonb_build_object(
          'kind', 'semantic', 'key', 'set_triggered_creature_hp',
          'payload', jsonb_build_object('hp', 1, 'trigger', p_runtime_hint->>'trigger')
        )),
        'tags', jsonb_build_array('class', 'warlock', 'invocation', 'gm_trigger_gate')
      )
    );
  elsif v_kind = 'pact_boon_chain' then
    v_result := v_result || jsonb_build_array(private.warlock_invocation_spell_mechanic_v1(
      'find-familiar', v_source_key, 'warlock-invocation-spell-pact-of-the-chain',
      'invocation:pact-of-the-chain', 'invocation_at_will', null
    ));
  end if;

  return v_result;
end;
$function$;

revoke all on function private.warlock_invocation_mechanics_v1(text,text,text,jsonb) from public;

create or replace function private.apply_warlock_invocations_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_warlock public.rule_templates%rowtype;
  v_catalog record;
  v_options jsonb := '[]'::jsonb;
  v_labels jsonb := '{}'::jsonb;
  v_rules jsonb := '{}'::jsonb;
  v_selector_options jsonb;
  v_rule jsonb;
  v_invocation_choice jsonb;
  v_tome_cantrip_options jsonb := '[]'::jsonb;
  v_tome_cantrip_labels jsonb := '{}'::jsonb;
  v_tome_cantrip_mechanics jsonb := '{}'::jsonb;
  v_tome_ritual_options jsonb := '[]'::jsonb;
  v_tome_ritual_labels jsonb := '{}'::jsonb;
  v_tome_ritual_mechanics jsonb := '{}'::jsonb;
  v_spell record;
  v_choices jsonb;
begin
  perform private.apply_warlock_base_runtime_v1(p_campaign_id);

  select * into v_warlock
  from public.rule_templates
  where campaign_id = p_campaign_id and catalog_key = 'class:warlock' and is_active = true
  order by version desc
  limit 1;
  if v_warlock.id is null then
    raise exception 'WARLOCK_TEMPLATE_NOT_FOUND:%', p_campaign_id;
  end if;

  -- Materialize the catalog-only records into typed CE mechanics once. The catalog
  -- remains the source for requirements, labels and handler hints.
  update public.reference_definition_revisions r
  set mechanics = private.warlock_invocation_mechanics_v1(d.slug, r.name, r.summary, r.data->'runtime_hint'),
      data = jsonb_set(r.data, '{runtime_status}', to_jsonb('runtime_ready'::text), true)
  from public.reference_definitions d
  where r.definition_id = d.id
    and r.revision = d.current_revision
    and d.scope = 'system'
    and d.kind = 'feature'
    and d.external_id like 'class:warlock:invocation:%';

  for v_catalog in
    select d.slug, r.name, r.summary, r.mechanics, r.data
    from public.reference_definitions d
    join public.reference_definition_revisions r
      on r.definition_id = d.id and r.revision = d.current_revision
    where d.scope = 'system'
      and d.kind = 'feature'
      and d.external_id like 'class:warlock:invocation:%'
    order by (r.data->>'sort_order')::integer, d.slug
  loop
    v_options := v_options || jsonb_build_array(to_jsonb(v_catalog.slug));
    v_labels := jsonb_set(v_labels, array[v_catalog.slug], to_jsonb(v_catalog.name), true);
    v_selector_options := '[]'::jsonb;

    if v_catalog.data->>'selector' = 'warlock_damage_cantrip' then
      select coalesce(jsonb_agg(jsonb_build_object('value', s.slug, 'label', coalesce(nullif(s.name_ru, ''), s.name_en)) order by s.slug), '[]'::jsonb)
      into v_selector_options
      from public.spell_catalog s
      where s.spell_level = 0
        and nullif(btrim(coalesce(s.damage, '')), '') is not null
        and exists (select 1 from public.spell_catalog_classes c where c.spell_id = s.id and c.class_key = 'warlock');
    elsif v_catalog.data->>'selector' = 'warlock_damage_cantrip_range_10_plus' then
      select coalesce(jsonb_agg(jsonb_build_object('value', s.slug, 'label', coalesce(nullif(s.name_ru, ''), s.name_en)) order by s.slug), '[]'::jsonb)
      into v_selector_options
      from public.spell_catalog s
      where s.spell_level = 0
        and nullif(btrim(coalesce(s.damage, '')), '') is not null
        and substring(s.spell_range from '([0-9]+)') is not null
        and substring(s.spell_range from '([0-9]+)')::integer >= 10
        and exists (select 1 from public.spell_catalog_classes c where c.spell_id = s.id and c.class_key = 'warlock');
    elsif v_catalog.data->>'selector' = 'warlock_attack_roll_cantrip' then
      select coalesce(jsonb_agg(jsonb_build_object('value', s.slug, 'label', coalesce(nullif(s.name_ru, ''), s.name_en)) order by s.slug), '[]'::jsonb)
      into v_selector_options
      from public.spell_catalog s
      where s.spell_level = 0
        and nullif(btrim(coalesce(s.damage, '')), '') is not null
        and (lower(coalesce(s.check_type, '')) like '%атак%' or lower(coalesce(s.check_type, '')) like '%attack%')
        and exists (select 1 from public.spell_catalog_classes c where c.spell_id = s.id and c.class_key = 'warlock');
    elsif v_catalog.data->>'selector' = 'origin_feat' then
      -- Chasovoy has no Origin Feat definitions yet. Keep this selector bounded to
      -- the 2024 Origin roster; the chosen entitlement resolves as a structured CE
      -- rule, while feat-internal mechanics remain owned by the future generic feat source.
      v_selector_options := jsonb_build_array(
        jsonb_build_object('value','alert','label','Alert'),
        jsonb_build_object('value','crafter','label','Crafter'),
        jsonb_build_object('value','healer','label','Healer'),
        jsonb_build_object('value','lucky','label','Lucky'),
        jsonb_build_object('value','magic-initiate-cleric','label','Magic Initiate: Cleric'),
        jsonb_build_object('value','magic-initiate-druid','label','Magic Initiate: Druid'),
        jsonb_build_object('value','magic-initiate-wizard','label','Magic Initiate: Wizard'),
        jsonb_build_object('value','musician','label','Musician'),
        jsonb_build_object('value','savage-attacker','label','Savage Attacker'),
        jsonb_build_object('value','skilled','label','Skilled'),
        jsonb_build_object('value','tavern-brawler','label','Tavern Brawler'),
        jsonb_build_object('value','tough','label','Tough')
      );
    end if;

    v_rule := jsonb_build_object(
      'min_level', greatest(1, coalesce((v_catalog.data->>'minimum_warlock_level')::integer, 1)),
      'repeatable', coalesce((v_catalog.data->>'repeatable')::boolean, false),
      'required_invocations', coalesce(v_catalog.data->'required_invocations', '[]'::jsonb),
      'mechanics', coalesce(v_catalog.mechanics, '[]'::jsonb)
    );
    if coalesce(v_catalog.data->>'selector', 'none') <> 'none' then
      v_rule := v_rule || jsonb_build_object(
        'selector', jsonb_build_object('key', v_catalog.data->>'selector', 'options', v_selector_options)
      );
    end if;
    v_rules := jsonb_set(v_rules, array[v_catalog.slug], v_rule, true);
  end loop;

  if jsonb_array_length(v_options) <> 28 then
    raise exception 'WARLOCK_INVOCATION_CATALOG_COUNT_INVALID:%', jsonb_array_length(v_options);
  end if;

  v_invocation_choice := jsonb_build_object(
    'key', 'warlock_eldritch_invocations',
    'label', 'Мистические воззвания',
    'target', 'trait',
    'options', v_options,
    'option_labels', v_labels,
    'option_rules', v_rules,
    'count', 1,
    'count_by_level', jsonb_build_object('1',1,'2',3,'5',5,'7',6,'9',7,'12',8,'15',9,'18',10),
    'selection_mode', 'player_once',
    'required', true,
    'resolved_as', 'eldritch_invocation'
  );

  -- Pact of the Tome uses ordinary distinct spell options, so the resolver can
  -- emit concrete spell accesses rather than an opaque selector blob.
  for v_spell in
    select s.* from public.spell_catalog s
    where s.spell_level = 0
      and exists (select 1 from public.spell_catalog_classes c where c.spell_id=s.id)
    order by s.slug
  loop
    v_tome_cantrip_options := v_tome_cantrip_options || jsonb_build_array(to_jsonb(v_spell.slug));
    v_tome_cantrip_labels := jsonb_set(v_tome_cantrip_labels, array[v_spell.slug], to_jsonb(coalesce(nullif(v_spell.name_ru,''),v_spell.name_en)), true);
    v_tome_cantrip_mechanics := jsonb_set(v_tome_cantrip_mechanics, array[v_spell.slug], jsonb_build_array(
      private.warlock_invocation_spell_mechanic_v1(
        v_spell.slug, 'warlock-invocation:pact-of-the-tome', 'warlock-pact-tome-cantrip-' || v_spell.slug,
        'invocation:pact-of-the-tome:cantrip:' || v_spell.slug, 'pact_tome_cantrip', null
      )
    ), true);
  end loop;

  for v_spell in
    select s.* from public.spell_catalog s
    where s.spell_level = 1 and s.ritual = true
      and exists (select 1 from public.spell_catalog_classes c where c.spell_id=s.id)
    order by s.slug
  loop
    v_tome_ritual_options := v_tome_ritual_options || jsonb_build_array(to_jsonb(v_spell.slug));
    v_tome_ritual_labels := jsonb_set(v_tome_ritual_labels, array[v_spell.slug], to_jsonb(coalesce(nullif(v_spell.name_ru,''),v_spell.name_en)), true);
    v_tome_ritual_mechanics := jsonb_set(v_tome_ritual_mechanics, array[v_spell.slug], jsonb_build_array(
      private.warlock_invocation_spell_mechanic_v1(
        v_spell.slug, 'warlock-invocation:pact-of-the-tome', 'warlock-pact-tome-ritual-' || v_spell.slug,
        'invocation:pact-of-the-tome:ritual:' || v_spell.slug, 'ritual', null
      )
    ), true);
  end loop;

  select coalesce(choices, '[]'::jsonb) into v_choices
  from public.rule_template_levels
  where template_id = v_warlock.id and level = 1
  for update;

  select coalesce(jsonb_agg(value), '[]'::jsonb) into v_choices
  from jsonb_array_elements(coalesce(v_choices, '[]'::jsonb)) e(value)
  where value->>'key' not in ('warlock_eldritch_invocations','warlock_pact_tome_cantrips','warlock_pact_tome_rituals');

  v_choices := v_choices || jsonb_build_array(
    v_invocation_choice,
    jsonb_build_object(
      'key', 'warlock_pact_tome_cantrips',
      'label', 'Договор гримуара: заговоры',
      'target', 'trait',
      'options', v_tome_cantrip_options,
      'option_labels', v_tome_cantrip_labels,
      'option_mechanics', v_tome_cantrip_mechanics,
      'count', 3,
      'selection_mode', 'player_once',
      'required', true,
      'refresh', 'short_or_long_rest',
      'requires_choice', jsonb_build_object('key','warlock_eldritch_invocations','option','pact-of-the-tome')
    ),
    jsonb_build_object(
      'key', 'warlock_pact_tome_rituals',
      'label', 'Договор гримуара: ритуалы 1 уровня',
      'target', 'trait',
      'options', v_tome_ritual_options,
      'option_labels', v_tome_ritual_labels,
      'option_mechanics', v_tome_ritual_mechanics,
      'count', 2,
      'selection_mode', 'player_once',
      'required', true,
      'refresh', 'short_or_long_rest',
      'requires_choice', jsonb_build_object('key','warlock_eldritch_invocations','option','pact-of-the-tome')
    )
  );

  update public.rule_template_levels
  set choices = v_choices
  where template_id = v_warlock.id and level = 1;

  update public.rule_templates
  set catalog_revision = 'xphb-2024-warlock-invocations-runtime-v1',
      rules_meta = coalesce(rules_meta, '{}'::jsonb) || jsonb_build_object(
        'runtime_revision','xphb-2024-warlock-invocations-runtime-v1',
        'mechanics_status','BASE_AND_INVOCATIONS_RUNTIME_READY',
        'invocation_runtime_included',true,
        'invocation_runtime_count',28,
        'invocation_choice_key','warlock_eldritch_invocations',
        'pact_tome_rest_refresh','short_or_long_rest',
        'subclass_runtime_included',false
      ),
      updated_at = now()
  where id = v_warlock.id;
end;
$function$;

revoke all on function private.apply_warlock_invocations_runtime_v1(uuid) from public;

create or replace function private.apply_warlock_invocations_runtime_on_campaign_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.apply_warlock_invocations_runtime_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.apply_warlock_invocations_runtime_on_campaign_v1() from public;

drop trigger if exists zzzzzzzd_campaigns_apply_warlock_invocations_runtime_v1 on public.campaigns;
create trigger zzzzzzzd_campaigns_apply_warlock_invocations_runtime_v1
after insert on public.campaigns
for each row execute function private.apply_warlock_invocations_runtime_on_campaign_v1();

do $apply$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.apply_warlock_invocations_runtime_v1(v_campaign.id);
  end loop;
end
$apply$;

commit;