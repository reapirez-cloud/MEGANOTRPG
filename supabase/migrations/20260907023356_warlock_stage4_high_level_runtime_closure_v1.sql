-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:warlock
-- CLASS_PACKAGE_TEST: tests/warlockHighLevelStage4Closure.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: warlock:text=IN_PROGRESS;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Warlock high-level runtime closure: Contact Patron, Mystic Arcanum 6-9,
-- and Eldritch Master. Concrete spell access replaces semantic cast placeholders.

begin;

create or replace function private.warlock_stage4_spell_mechanic_v1(
  p_slug text,
  p_source_key text,
  p_resource_key text,
  p_method_key text,
  p_cast_level integer,
  p_include_pact_method boolean default false
)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_spell public.spell_catalog%rowtype;
  v_methods jsonb;
  v_free_method jsonb;
  v_pact_method jsonb;
begin
  select * into v_spell
  from public.spell_catalog
  where slug = p_slug;

  if v_spell.id is null then
    raise exception 'WARLOCK_STAGE4_SPELL_NOT_FOUND:%', p_slug;
  end if;

  if not exists (
    select 1
    from public.spell_catalog_classes sc
    where sc.spell_id = v_spell.id
      and sc.class_key = 'warlock'
  ) then
    raise exception 'WARLOCK_STAGE4_SPELL_NOT_ON_WARLOCK_LIST:%', p_slug;
  end if;

  if v_spell.spell_level <> p_cast_level then
    raise exception 'WARLOCK_STAGE4_SPELL_LEVEL_MISMATCH:%:expected=%:actual=%', p_slug, p_cast_level, v_spell.spell_level;
  end if;

  v_free_method := jsonb_build_object(
    'key', p_method_key,
    'kind', 'class_feature',
    'ability', 'charisma',
    'requiresPrepared', false,
    'resourceOptions', jsonb_build_array(jsonb_build_object(
      'key', p_method_key,
      'castLevel', p_cast_level,
      'costs', jsonb_build_array(jsonb_build_object('key', p_resource_key, 'amount', 1))
    ))
  );

  v_methods := jsonb_build_array(v_free_method);

  if p_include_pact_method then
    v_pact_method := jsonb_build_object(
      'key', 'warlock-pact-5',
      'kind', 'pact_magic',
      'ability', 'charisma',
      'requiresPrepared', false,
      'resourceOptions', jsonb_build_array(jsonb_build_object(
        'key', 'warlock-pact-5',
        'castLevel', 5,
        'costs', jsonb_build_array(jsonb_build_object('key', 'warlock_pact_slots', 'amount', 1))
      ))
    );
    v_methods := jsonb_build_array(v_pact_method) || v_methods;
  end if;

  return jsonb_build_object(
    'id', 'warlock-stage4-spell-' || replace(replace(p_source_key, ':', '-'), '_', '-') || '-' || p_slug,
    'type', 'spell',
    'sourceKey', p_source_key,
    'key', 'spell:' || p_slug,
    'catalogSlug', p_slug,
    'variantKey', p_source_key || ':' || p_slug,
    'payload', jsonb_build_object(
      'spell', jsonb_strip_nulls(jsonb_build_object(
        'name', coalesce(nullif(v_spell.name_ru, ''), v_spell.name_en),
        'level', v_spell.spell_level,
        'school', nullif(v_spell.school, ''),
        'ritual', coalesce(v_spell.ritual, false)
      )),
      'preparation', jsonb_build_object('mode', 'always_prepared'),
      'methods', v_methods
    )
  );
end;
$function$;

revoke all on function private.warlock_stage4_spell_mechanic_v1(text,text,text,text,integer,boolean) from public, anon, authenticated;
grant execute on function private.warlock_stage4_spell_mechanic_v1(text,text,text,text,integer,boolean) to service_role;

create or replace function private.warlock_mystic_arcanum_choice_stage4_v1(p_spell_level integer)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_options jsonb := '[]'::jsonb;
  v_labels jsonb := '{}'::jsonb;
  v_mechanics jsonb := '{}'::jsonb;
  v_key text := 'warlock_mystic_arcanum_' || p_spell_level;
  v_source_key text := 'warlock-base:mystic-arcanum-' || p_spell_level;
  r record;
begin
  if p_spell_level not in (6,7,8,9) then
    raise exception 'WARLOCK_STAGE4_ARCANUM_LEVEL_INVALID:%', p_spell_level;
  end if;

  for r in
    select s.slug, coalesce(nullif(s.name_ru, ''), s.name_en) as label
    from public.spell_catalog s
    where s.spell_level = p_spell_level
      and exists (
        select 1
        from public.spell_catalog_classes sc
        where sc.spell_id = s.id
          and sc.class_key = 'warlock'
      )
    order by coalesce(nullif(s.name_ru, ''), s.name_en), s.slug
  loop
    v_options := v_options || jsonb_build_array(r.slug);
    v_labels := jsonb_set(v_labels, array[r.slug], to_jsonb(r.label), true);
    v_mechanics := jsonb_set(
      v_mechanics,
      array[r.slug],
      jsonb_build_array(private.warlock_stage4_spell_mechanic_v1(
        r.slug,
        v_source_key,
        v_key,
        'mystic-arcanum-' || p_spell_level,
        p_spell_level,
        false
      )),
      true
    );
  end loop;

  if jsonb_array_length(v_options) = 0 then
    raise exception 'WARLOCK_STAGE4_ARCANUM_LIST_EMPTY:%', p_spell_level;
  end if;

  return jsonb_build_object(
    'key', v_key,
    'label', 'Таинственный арканум: заклинание ' || p_spell_level || ' уровня',
    'target', 'trait',
    'count', 1,
    'options', v_options,
    'option_labels', v_labels,
    'option_mechanics', v_mechanics,
    'selection_mode', 'player_once',
    'replacement_policy', 'on_level_change',
    'replacement_limit', 1,
    'required', true,
    'resolved_as', 'class_spell'
  );
end;
$function$;

revoke all on function private.warlock_mystic_arcanum_choice_stage4_v1(integer) from public, anon, authenticated;
grant execute on function private.warlock_mystic_arcanum_choice_stage4_v1(integer) to service_role;

create or replace function private.apply_warlock_stage4_high_level_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_warlock uuid;
  v_keep jsonb;
  v_choice_keep jsonb;
  v_choice jsonb;
  v_spell_level integer;
  v_class_level integer;
  v_key text;
  v_source_key text;
begin
  perform private.apply_warlock_base_runtime_v1(p_campaign_id);

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

  select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
  into v_keep
  from jsonb_array_elements(coalesce((
    select mechanics from public.rule_template_levels where template_id = v_warlock and level = 9
  ), '[]'::jsonb)) with ordinality e(value, ord)
  where coalesce(e.value->>'sourceKey', '') <> 'warlock-base:contact-patron';

  update public.rule_template_levels
  set mechanics = v_keep || jsonb_build_array(
    private.warlock_resource(
      'warlock-base-contact-patron-use',
      'warlock-base:contact-patron',
      'warlock_contact_patron',
      'Связь с покровителем',
      1,
      '{"triggers":["long_rest"],"restore":"full"}'::jsonb,
      9
    ),
    private.warlock_feature(
      'warlock-base-contact-patron-rules',
      'warlock-base:contact-patron',
      'contact_patron',
      'Связь с покровителем',
      '«Контакт с иным планом» всегда подготовлен. Его можно сотворять обычной Магией договора. Кроме того, один раз между долгими отдыхами его можно сотворить без ячейки для связи с покровителем; при таком сотворении спасбросок Интеллекта автоматически успешен.',
      jsonb_build_object(
        'spell_slug', 'contact-other-plane',
        'always_prepared', true,
        'free_resource_key', 'warlock_contact_patron',
        'automatic_intelligence_save_success_on_free_cast', true
      )
    ),
    private.warlock_stage4_spell_mechanic_v1(
      'contact-other-plane',
      'warlock-base:contact-patron',
      'warlock_contact_patron',
      'contact-patron-free',
      5,
      true
    )
  )
  where template_id = v_warlock and level = 9;

  for v_class_level, v_spell_level in
    select * from (values (11,6),(13,7),(15,8),(17,9)) x(class_level, spell_level)
  loop
    v_key := 'warlock_mystic_arcanum_' || v_spell_level;
    v_source_key := 'warlock-base:mystic-arcanum-' || v_spell_level;
    v_choice := private.warlock_mystic_arcanum_choice_stage4_v1(v_spell_level);
    perform private.assert_class_spell_contract_json(v_choice);

    select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
    into v_keep
    from jsonb_array_elements(coalesce((
      select mechanics from public.rule_template_levels where template_id = v_warlock and level = v_class_level
    ), '[]'::jsonb)) with ordinality e(value, ord)
    where coalesce(e.value->>'sourceKey', '') <> v_source_key;

    select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
    into v_choice_keep
    from jsonb_array_elements(coalesce((
      select choices from public.rule_template_levels where template_id = v_warlock and level = v_class_level
    ), '[]'::jsonb)) with ordinality e(value, ord)
    where coalesce(e.value->>'key', '') <> v_key;

    update public.rule_template_levels
    set mechanics = v_keep || jsonb_build_array(
          private.warlock_resource(
            'warlock-base-arcanum-' || v_spell_level || '-use',
            v_source_key,
            v_key,
            'Таинственный арканум ' || v_spell_level || ' уровня',
            1,
            '{"triggers":["long_rest"],"restore":"full"}'::jsonb,
            v_class_level
          ),
          private.warlock_feature(
            'warlock-base-arcanum-' || v_spell_level || '-rules',
            v_source_key,
            'mystic_arcanum_' || v_spell_level,
            'Таинственный арканум (' || v_spell_level || ' уровень)',
            'Выберите одно заклинание колдуна ' || v_spell_level || ' уровня. Оно всегда подготовлено и сотворяется один раз без ячейки; использование восстанавливается после долгого отдыха. При получении уровня колдуна выбор можно заменить другим заклинанием колдуна того же уровня.',
            jsonb_build_object(
              'spell_level', v_spell_level,
              'resource_key', v_key,
              'replacement', 'on_warlock_level_gain',
              'spell_access', true
            )
          )
        ),
        choices = v_choice_keep || jsonb_build_array(v_choice)
    where template_id = v_warlock and level = v_class_level;
  end loop;

  if not exists (
    select 1
    from public.rule_template_levels l,
         lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m(value)
    where l.template_id = v_warlock
      and l.level = 20
      and m.value->>'key' = 'warlock_magical_cunning_restore'
      and (m.value->'payload'->>'value')::integer = 4
  ) then
    raise exception 'WARLOCK_STAGE4_ELDRITCH_MASTER_RESTORE_INVALID';
  end if;

  if not exists (
    select 1
    from public.rule_template_levels l,
         lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m(value)
    where l.template_id = v_warlock
      and l.level = 20
      and m.value->>'key' = 'warlock_pact_slots'
      and (m.value->'payload'->>'max')::integer = 4
  ) then
    raise exception 'WARLOCK_STAGE4_ELDRITCH_MASTER_PACT_MAX_INVALID';
  end if;

  update public.rule_templates
  set rules_meta = coalesce(rules_meta, '{}'::jsonb) || jsonb_build_object(
        'stage4_high_level_runtime', true,
        'stage4_high_level_revision', 'xphb-2024-warlock-high-level-runtime-v1',
        'contact_patron_spell_access', true,
        'mystic_arcanum_spell_access', true,
        'mystic_arcanum_selector_closed', true,
        'eldritch_master_runtime', true
      ),
      updated_at = now()
  where id = v_warlock;
end;
$function$;

revoke all on function private.apply_warlock_stage4_high_level_runtime_v1(uuid) from public, anon, authenticated;
grant execute on function private.apply_warlock_stage4_high_level_runtime_v1(uuid) to service_role;

create or replace function private.apply_warlock_stage4_high_level_runtime_after_campaign_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.apply_warlock_stage4_high_level_runtime_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.apply_warlock_stage4_high_level_runtime_after_campaign_v1() from public, anon, authenticated;

drop trigger if exists zzzzzzzzzzzzzzzz_warlock_stage4_high_level_closure_v1 on public.campaigns;
create trigger zzzzzzzzzzzzzzzz_warlock_stage4_high_level_closure_v1
after insert on public.campaigns
for each row execute function private.apply_warlock_stage4_high_level_runtime_after_campaign_v1();

do $apply$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.apply_warlock_stage4_high_level_runtime_v1(v_campaign.id);
  end loop;
end
$apply$;

commit;
