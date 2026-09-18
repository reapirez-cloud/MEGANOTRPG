-- CLASS_MIGRATION_SCOPE: mechanics
-- Stage 2 spell-screen repair:
-- encode the Cleric's base cantrip choice as real class spell mechanics so
-- spell_catalog -> class template -> Character Engine -> UI stays continuous.
-- Existing assignments are backfilled from canonical character_spells when
-- possible; only missing historical selections receive deterministic defaults.

begin;

do $$
declare
  v_template_id uuid;
  v_choice jsonb;
  v_options jsonb;
  v_option_labels jsonb;
  v_option_mechanics jsonb;
  v_option_unlocks jsonb;
  v_valid_cantrips text[];
  v_assignment record;
  v_existing text[];
  v_selected text[];
  v_slug text;
  v_default text;
  v_required_count integer;
  v_defaults constant text[] := array[
    'guidance',
    'sacred-flame',
    'thaumaturgy',
    'spare-the-dying',
    'light'
  ];
begin
  select t.id
    into v_template_id
  from public.rule_templates t
  where t.kind = 'class'
    and t.slug = 'cleric-core'
    and t.is_active
  order by t.version desc
  limit 1;

  if v_template_id is null then
    raise exception 'Active cleric-core template not found';
  end if;

  with cantrips as (
    select distinct
      sc.id,
      sc.slug,
      coalesce(nullif(sc.name_ru, ''), sc.name_en) as display_name,
      sc.school,
      sc.ritual,
      coalesce(sc.sort_order, 0) as sort_order
    from public.spell_catalog sc
    join public.spell_catalog_classes scc
      on scc.spell_id = sc.id
    where lower(scc.class_key) = 'cleric'
      and sc.spell_level = 0
  )
  select
    jsonb_agg(c.slug order by c.sort_order, c.display_name, c.slug),
    jsonb_object_agg(c.slug, c.display_name),
    jsonb_object_agg(
      c.slug,
      jsonb_build_array(
        jsonb_build_object(
          'id', 'cleric-stage2-cantrip-' || c.slug,
          'key', 'spell:' || c.slug,
          'type', 'spell',
          'payload', jsonb_build_object(
            'spell', jsonb_build_object(
              'name', c.display_name,
              'level', 0,
              'ritual', coalesce(c.ritual, false),
              'school', c.school
            ),
            'methods', jsonb_build_array(
              jsonb_build_object(
                'key', 'cleric-cast',
                'kind', 'class_spell',
                'ability', 'wisdom',
                'requiresPrepared', false
              )
            ),
            'preparation', jsonb_build_object('mode', 'not_required')
          ),
          'priority', 1,
          'sourceKey', 'cleric-stage2:spellcasting',
          'variantKey', 'cleric:spellcasting:' || c.slug,
          'catalogSlug', c.slug,
          'grantOperation', 'GRANT'
        )
      )
    ),
    jsonb_object_agg(c.slug, 1),
    array_agg(c.slug order by c.sort_order, c.display_name, c.slug)
  into
    v_options,
    v_option_labels,
    v_option_mechanics,
    v_option_unlocks,
    v_valid_cantrips
  from cantrips c;

  if coalesce(jsonb_array_length(v_options), 0) = 0 then
    raise exception 'Cleric cantrips are missing from spell_catalog_classes';
  end if;

  v_choice := jsonb_build_object(
    'key', 'cleric_cantrips',
    'count', 3,
    'label', 'Заговоры жреца',
    'target', 'spell',
    'options', v_options,
    'option_labels', v_option_labels,
    'count_by_level', jsonb_build_object('1', 3, '4', 4, '10', 5),
    'selection_mode', 'player_once',
    'option_mechanics', v_option_mechanics,
    'replacement_limit', 1,
    'replacement_policy', 'on_level_change',
    'option_unlock_level', v_option_unlocks
  );

  update public.rule_template_levels l
  set choices = (
    select coalesce(jsonb_agg(entry.value order by entry.ord), '[]'::jsonb)
    from jsonb_array_elements(coalesce(l.choices, '[]'::jsonb))
      with ordinality as entry(value, ord)
    where entry.value->>'key' <> 'cleric_cantrips'
  ) || jsonb_build_array(v_choice)
  where l.template_id = v_template_id
    and l.level = 1;

  if not found then
    raise exception 'cleric-core level 1 runtime row not found';
  end if;

  -- Keep the searchable class-spell index aligned with the mechanics authored
  -- above. Runtime resolution reads the template mechanics; this table is the
  -- canonical catalog linkage used by audits and class-spell discovery.
  delete from public.rule_template_spell_links
  where template_id = v_template_id
    and template_level = 1
    and mechanic_id like 'cleric-stage2-cantrip-%';

  insert into public.rule_template_spell_links (
    template_id,
    template_level,
    mechanic_id,
    spell_id,
    source_kind,
    access_category,
    catalog_slug
  )
  select
    v_template_id,
    1,
    'cleric-stage2-cantrip-' || sc.slug,
    sc.id,
    'class',
    'class_spell',
    sc.slug
  from public.spell_catalog sc
  join public.spell_catalog_classes scc
    on scc.spell_id = sc.id
  where lower(scc.class_key) = 'cleric'
    and sc.spell_level = 0
  on conflict (template_id, template_level, mechanic_id)
  do update set
    spell_id = excluded.spell_id,
    source_kind = excluded.source_kind,
    access_category = excluded.access_category,
    catalog_slug = excluded.catalog_slug;

  -- Old Cleric assignments predate the base-cantrip choice entirely. Preserve
  -- any canonical cantrip rows they already own, then fill only missing slots
  -- with stable defaults. New assignments are expected to choose normally.
  for v_assignment in
    select
      a.id,
      a.character_id,
      greatest(1, coalesce(a.template_level, 1)) as template_level,
      coalesce(a.selected_choices, '{}'::jsonb) as selected_choices
    from public.character_template_assignments a
    where a.template_id = v_template_id
      and (
        not coalesce(a.selected_choices, '{}'::jsonb) ? 'cleric_cantrips'
        or coalesce(jsonb_array_length(
          case
            when jsonb_typeof(coalesce(a.selected_choices, '{}'::jsonb)->'cleric_cantrips') = 'array'
              then coalesce(a.selected_choices, '{}'::jsonb)->'cleric_cantrips'
            else '[]'::jsonb
          end
        ), 0) = 0
      )
  loop
    v_required_count := case
      when v_assignment.template_level >= 10 then 5
      when v_assignment.template_level >= 4 then 4
      else 3
    end;

    select array_agg(x.slug order by x.created_at, x.slug)
      into v_existing
    from (
      select distinct on (sc.slug)
        sc.slug,
        cs.created_at
      from public.character_spells cs
      join public.spell_catalog sc
        on sc.id = cs.catalog_spell_id
      join public.spell_catalog_classes scc
        on scc.spell_id = sc.id
       and lower(scc.class_key) = 'cleric'
      where cs.character_id = v_assignment.character_id
        and sc.spell_level = 0
      order by sc.slug, cs.created_at
    ) x;

    v_selected := array[]::text[];

    foreach v_slug in array coalesce(v_existing, array[]::text[])
    loop
      if v_slug = any(v_valid_cantrips)
         and not (v_slug = any(v_selected))
         and coalesce(array_length(v_selected, 1), 0) < v_required_count then
        v_selected := array_append(v_selected, v_slug);
      end if;
    end loop;

    foreach v_default in array v_defaults
    loop
      if v_default = any(v_valid_cantrips)
         and not (v_default = any(v_selected))
         and coalesce(array_length(v_selected, 1), 0) < v_required_count then
        v_selected := array_append(v_selected, v_default);
      end if;
    end loop;

    if coalesce(array_length(v_selected, 1), 0) < v_required_count then
      foreach v_slug in array v_valid_cantrips
      loop
        if not (v_slug = any(v_selected))
           and coalesce(array_length(v_selected, 1), 0) < v_required_count then
          v_selected := array_append(v_selected, v_slug);
        end if;
      end loop;
    end if;

    update public.character_template_assignments
    set selected_choices = jsonb_set(
      coalesce(selected_choices, '{}'::jsonb),
      '{cleric_cantrips}',
      to_jsonb(v_selected),
      true
    ),
    updated_at = now()
    where id = v_assignment.id;
  end loop;
end;
$$;

commit;
