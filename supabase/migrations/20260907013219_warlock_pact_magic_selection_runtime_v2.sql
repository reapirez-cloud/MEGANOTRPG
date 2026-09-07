-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:warlock
-- CLASS_PACKAGE_TEST: tests/warlockPactMagicSelectionRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: warlock:text=IN_PROGRESS;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Warlock 2024 Pact Magic selection closure. Base cantrips and level 1-5
-- prepared spells are persistent class choices. Each list permits one replacement
-- whenever the Warlock gains a level, while count growth follows the class table.

begin;

create or replace function private.warlock_pact_spell_mechanic_v2(
  p_slug text,
  p_cast_level integer,
  p_priority integer,
  p_operation text default 'GRANT'
)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_spell public.spell_catalog%rowtype;
  v_method jsonb;
  v_cast_level integer;
begin
  select * into v_spell
  from public.spell_catalog
  where slug = p_slug;

  if v_spell.id is null then
    raise exception 'WARLOCK_PACT_SPELL_NOT_FOUND:%', p_slug;
  end if;

  if not exists (
    select 1
    from public.spell_catalog_classes sc
    where sc.spell_id = v_spell.id
      and sc.class_key = 'warlock'
  ) then
    raise exception 'WARLOCK_PACT_SPELL_NOT_ON_LIST:%', p_slug;
  end if;

  v_cast_level := case
    when v_spell.spell_level = 0 then 0
    else greatest(v_spell.spell_level, greatest(1, coalesce(p_cast_level, v_spell.spell_level)))
  end;

  v_method := jsonb_build_object(
    'key', case when v_spell.spell_level = 0 then 'warlock-cantrip' else 'warlock-pact-' || v_cast_level end,
    'kind', 'pact_magic',
    'ability', 'charisma',
    'saveDc', jsonb_build_object(
      'kind','add',
      'terms',jsonb_build_array(
        jsonb_build_object('kind','literal','value',8),
        jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
        jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
      )
    ),
    'attackBonus', jsonb_build_object(
      'kind','add',
      'terms',jsonb_build_array(
        jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
        jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
      )
    ),
    'requiresPrepared', false
  );

  if v_spell.spell_level > 0 then
    v_method := v_method || jsonb_build_object(
      'resourceOptions', jsonb_build_array(
        jsonb_build_object(
          'key', 'warlock-pact-' || v_cast_level,
          'castLevel', v_cast_level,
          'costs', jsonb_build_array(
            jsonb_build_object('key','warlock_pact_slots','amount',1)
          )
        )
      )
    );
  end if;

  return jsonb_build_object(
    'id', 'warlock-base-pact-spell-' || p_slug || '-l' || greatest(1, p_priority),
    'type', 'spell',
    'sourceKey', 'warlock-base:pact-magic',
    'key', 'spell:' || p_slug,
    'catalogSlug', p_slug,
    'variantKey', 'warlock-base:pact-magic:' || p_slug,
    'grantOperation', upper(coalesce(nullif(btrim(p_operation),''),'GRANT')),
    'priority', greatest(1, p_priority),
    'payload', jsonb_build_object(
      'spell', jsonb_build_object(
        'name', coalesce(nullif(v_spell.name_ru,''), v_spell.name_en),
        'level', v_spell.spell_level,
        'school', v_spell.school,
        'ritual', coalesce(v_spell.ritual,false)
      ),
      'preparation', jsonb_build_object('mode','always_prepared'),
      'methods', jsonb_build_array(v_method)
    )
  );
end;
$function$;

revoke all on function private.warlock_pact_spell_mechanic_v2(text,integer,integer,text) from public, anon, authenticated;
grant execute on function private.warlock_pact_spell_mechanic_v2(text,integer,integer,text) to service_role;

create or replace function private.warlock_pact_magic_choice_v2(p_kind text)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_options jsonb := '[]'::jsonb;
  v_labels jsonb := '{}'::jsonb;
  v_unlocks jsonb := '{}'::jsonb;
  v_mechanics jsonb := '{}'::jsonb;
  v_by_level jsonb := '{}'::jsonb;
  r record;
  v_unlock integer;
  v_entry jsonb;
begin
  if p_kind not in ('cantrip','prepared') then
    raise exception 'WARLOCK_PACT_CHOICE_KIND_INVALID:%', p_kind;
  end if;

  for r in
    select s.slug, s.spell_level, coalesce(nullif(s.name_ru,''), s.name_en) as label
    from public.spell_catalog s
    where exists (
      select 1
      from public.spell_catalog_classes sc
      where sc.spell_id = s.id
        and sc.class_key = 'warlock'
    )
      and (
        (p_kind = 'cantrip' and s.spell_level = 0)
        or (p_kind = 'prepared' and s.spell_level between 1 and 5)
      )
    order by s.spell_level, coalesce(nullif(s.name_ru,''), s.name_en), s.slug
  loop
    v_options := v_options || jsonb_build_array(r.slug);
    v_labels := jsonb_set(v_labels, array[r.slug], to_jsonb(r.label), true);

    if p_kind = 'cantrip' then
      v_mechanics := jsonb_set(
        v_mechanics,
        array[r.slug],
        jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,0,1,'GRANT')),
        true
      );
    else
      v_unlock := case r.spell_level
        when 1 then 1
        when 2 then 3
        when 3 then 5
        when 4 then 7
        else 9
      end;
      v_unlocks := jsonb_set(v_unlocks, array[r.slug], to_jsonb(v_unlock), true);
      v_mechanics := jsonb_set(
        v_mechanics,
        array[r.slug],
        jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,r.spell_level,1,'GRANT')),
        true
      );
      v_entry := jsonb_build_object(
        '3', jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,greatest(2,r.spell_level),3,'REPLACE')),
        '5', jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,greatest(3,r.spell_level),5,'REPLACE')),
        '7', jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,greatest(4,r.spell_level),7,'REPLACE')),
        '9', jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,5,9,'REPLACE'))
      );
      v_by_level := jsonb_set(v_by_level, array[r.slug], v_entry, true);
    end if;
  end loop;

  if jsonb_array_length(v_options) = 0 then
    raise exception 'WARLOCK_PACT_CHOICE_EMPTY:%', p_kind;
  end if;

  if p_kind = 'cantrip' then
    return jsonb_build_object(
      'key','warlock_pact_magic_cantrips',
      'label','Магия договора: кантрипы',
      'target','trait',
      'count',2,
      'count_by_level',jsonb_build_object('1',2,'4',3,'10',4),
      'options',v_options,
      'option_labels',v_labels,
      'option_mechanics',v_mechanics,
      'selection_mode','player_once',
      'replacement_policy','on_level_change',
      'replacement_limit',1,
      'required',true,
      'resolved_as','class_spell'
    );
  end if;

  return jsonb_build_object(
    'key','warlock_pact_magic_spells',
    'label','Магия договора: подготовленные заклинания',
    'target','trait',
    'count',2,
    'count_by_level',jsonb_build_object(
      '1',2,'2',3,'3',4,'4',5,'5',6,'6',7,'7',8,'8',9,'9',10,
      '11',11,'13',12,'15',13,'17',14,'19',15
    ),
    'options',v_options,
    'option_labels',v_labels,
    'option_unlock_level',v_unlocks,
    'option_mechanics',v_mechanics,
    'option_mechanics_by_level',v_by_level,
    'selection_mode','player_once',
    'replacement_policy','on_level_change',
    'replacement_limit',1,
    'required',true,
    'resolved_as','class_spell'
  );
end;
$function$;

revoke all on function private.warlock_pact_magic_choice_v2(text) from public, anon, authenticated;
grant execute on function private.warlock_pact_magic_choice_v2(text) to service_role;

create or replace function private.install_warlock_pact_magic_selection_v2(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_warlock uuid;
  v_cantrips jsonb;
  v_spells jsonb;
  v_keep jsonb := '[]'::jsonb;
begin
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

  v_cantrips := private.warlock_pact_magic_choice_v2('cantrip');
  v_spells := private.warlock_pact_magic_choice_v2('prepared');

  perform private.assert_class_spell_contract_json(v_cantrips);
  perform private.assert_class_spell_contract_json(v_spells);

  insert into public.rule_template_levels(template_id,level,mechanics,choices)
  values(v_warlock,1,'[]'::jsonb,'[]'::jsonb)
  on conflict(template_id,level) do nothing;

  select coalesce(jsonb_agg(c.value order by c.ord),'[]'::jsonb)
  into v_keep
  from jsonb_array_elements(
    coalesce((select choices from public.rule_template_levels where template_id=v_warlock and level=1),'[]'::jsonb)
  ) with ordinality c(value,ord)
  where coalesce(c.value->>'key','') not in ('warlock_pact_magic_cantrips','warlock_pact_magic_spells');

  update public.rule_template_levels
  set choices = v_keep || jsonb_build_array(v_cantrips,v_spells)
  where template_id = v_warlock and level = 1;

  update public.rule_templates
  set rules_meta = coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
    'pact_magic_selection_runtime',true,
    'pact_magic_selection_revision','xphb-2024-warlock-pact-selection-v2',
    'pact_magic_cantrip_choice_key','warlock_pact_magic_cantrips',
    'pact_magic_prepared_choice_key','warlock_pact_magic_spells',
    'pact_magic_choice_replacement_limit',1,
    'pact_magic_choice_replacement_policy','on_warlock_level_gain'
  ),
  updated_at = now()
  where id = v_warlock;
end;
$function$;

revoke all on function private.install_warlock_pact_magic_selection_v2(uuid) from public, anon, authenticated;
grant execute on function private.install_warlock_pact_magic_selection_v2(uuid) to service_role;

create or replace function public.cast_warlock_pact_spell_v1(p_character_id uuid,p_spell_catalog_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_spell_level integer;
  v_spell_slug text;
  v_slot_level integer;
  v_selected jsonb := '[]'::jsonb;
  v_state public.character_resource_states%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;

  select a.* into v_assignment
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id
  where a.character_id=p_character_id
    and t.kind='class'
    and t.catalog_key='class:warlock'
    and t.is_active
  order by t.version desc
  limit 1;

  if v_assignment.id is null then raise exception 'Active Warlock class assignment not found'; end if;

  select s.spell_level,s.slug into v_spell_level,v_spell_slug
  from public.spell_catalog s
  where s.id=p_spell_catalog_id
    and exists(
      select 1 from public.spell_catalog_classes sc
      where sc.spell_id=s.id and sc.class_key='warlock'
    );

  if v_spell_level is null or v_spell_level<1 or v_spell_level>5 then
    raise exception 'Spell is not an eligible Pact Magic spell';
  end if;

  v_selected := coalesce(v_assignment.selected_choices->'warlock_pact_magic_spells','[]'::jsonb);
  if jsonb_typeof(v_selected)='string' then
    v_selected:=jsonb_build_array(v_selected #>> '{}');
  end if;
  if jsonb_typeof(v_selected)<>'array' then
    v_selected:='[]'::jsonb;
  end if;

  if not exists(
    select 1 from jsonb_array_elements_text(v_selected) x(value)
    where x.value=v_spell_slug
  ) then
    raise exception 'Warlock spell is not selected by Pact Magic';
  end if;

  v_slot_level:=private.character_runtime_value_snapshot(p_character_id,'warlock_pact_slot_level')::integer;
  if v_spell_level>v_slot_level then raise exception 'Pact Magic slot level is too low'; end if;

  select * into v_state
  from public.character_resource_states
  where character_id=p_character_id and state_key='warlock_pact_slots'
  for update;

  if v_state.state_key is null then raise exception 'Pact Magic resource is not synchronized'; end if;
  if v_state.current<1 then raise exception 'Pact Magic slots are exhausted'; end if;

  update public.character_resource_states
  set current=current-1,updated_at=now(),updated_by=auth.uid()
  where character_id=p_character_id and state_key='warlock_pact_slots';

  return jsonb_build_object(
    'spellCatalogId',p_spell_catalog_id,
    'castLevel',v_slot_level,
    'remaining',v_state.current-1,
    'max',v_state.max_snapshot
  );
end;
$function$;

revoke all on function public.cast_warlock_pact_spell_v1(uuid,uuid) from public,anon;
grant execute on function public.cast_warlock_pact_spell_v1(uuid,uuid) to authenticated,service_role;

create or replace function private.apply_warlock_pact_magic_selection_v2_after_campaign()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.install_warlock_pact_magic_selection_v2(new.id);
  return new;
end;
$function$;

revoke all on function private.apply_warlock_pact_magic_selection_v2_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzb2_campaigns_apply_warlock_pact_magic_selection_v2 on public.campaigns;
create trigger zzzzzzzb2_campaigns_apply_warlock_pact_magic_selection_v2
after insert on public.campaigns
for each row execute function private.apply_warlock_pact_magic_selection_v2_after_campaign();

do $block$
declare
  r record;
begin
  for r in select id from public.campaigns loop
    perform private.install_warlock_pact_magic_selection_v2(r.id);
  end loop;
end;
$block$;

commit;