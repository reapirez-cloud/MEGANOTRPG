-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardCompletionRuntime.test.ts
-- CLASS_WORK_STATUS: wizard:text=READY;mechanics=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- Wizard 2024 preparation contract.
-- The live Wizard template lost the metadata consumed by CharacterPreparation,
-- while the server commit path also treated always-prepared Mastery/Signature
-- spells as ordinary quota selections. Restore one authoritative contract.

update public.rule_templates
set rules_meta = jsonb_set(
  jsonb_set(
    coalesce(rules_meta, '{}'::jsonb),
    '{sheet_profile}',
    coalesce(rules_meta->'sheet_profile', '{}'::jsonb) || jsonb_build_object(
      'spell_list', 'wizard',
      'spellcasting_ability', 'intelligence',
      'spellcasting_enabled', true,
      'prepared_spells_by_level', '{"1":4,"2":5,"3":6,"4":7,"5":9,"6":10,"7":11,"8":12,"9":14,"10":15,"11":16,"12":16,"13":17,"14":18,"15":19,"16":21,"17":22,"18":23,"19":24,"20":25}'::jsonb
    ),
    true
  ),
  '{spell_preparation_refresh}',
  '"long_rest"'::jsonb,
  true
),
updated_at = now()
where catalog_key = 'class:wizard'
  and kind = 'class'
  and is_active = true;

create or replace function public.commit_character_spell_preparation_v1(
  p_character_id uuid,
  p_assignment_id uuid,
  p_prepared_spell_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_character public.characters%rowtype;
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_session public.character_preparation_sessions%rowtype;
  v_ids uuid[] := array[]::uuid[];
  v_task_key text;
  v_invalid integer;
  v_prepared jsonb;
  v_source_level integer;
  v_required integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_character from public.characters where id=p_character_id;
  if v_character.id is null then raise exception 'Character not found'; end if;
  if coalesce(v_character.assigned_user_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid()
     and not private.can_manage_character(v_character.id,auth.uid()) then
    raise exception 'Only the assigned player or campaign manager can prepare spells';
  end if;

  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id and character_id=p_character_id;
  if v_assignment.id is null then raise exception 'Spell preparation source is not assigned to this character'; end if;

  v_source_level:=private.character_template_source_level(v_assignment.id);
  select * into v_template
  from public.rule_templates
  where id=v_assignment.template_id and is_active=true;
  if v_template.id is null
     or coalesce(v_template.rules_meta->>'spell_preparation_refresh','')<>'long_rest'
     or v_source_level is null then
    raise exception 'This source does not allow long-rest spell preparation';
  end if;

  select * into v_session
  from public.character_preparation_sessions
  where character_id=p_character_id
  for update;
  if v_session.character_id is null or not v_session.is_open then
    raise exception 'Preparation window is closed until the next long rest';
  end if;

  select coalesce(array_agg(id order by id),array[]::uuid[])
  into v_ids
  from (select distinct value as id from unnest(coalesce(p_prepared_spell_ids,array[]::uuid[])) value) selected;

  if v_template.catalog_key='class:wizard' then
    v_required:=coalesce((v_template.rules_meta->'sheet_profile'->'prepared_spells_by_level'->>v_source_level::text)::integer,0);
    if v_required<1 then raise exception 'Wizard prepared-spell limit is unavailable'; end if;
    if cardinality(v_ids)<>v_required then
      raise exception 'Wizard must prepare exactly % ordinary spells at level %',v_required,v_source_level;
    end if;

    if not exists(
      select 1 from public.character_inventory_items item
      where item.character_id=p_character_id
        and private.is_wizard_spellbook_item(item.id,p_character_id)
    ) then
      raise exception 'Wizard spell preparation requires a spellbook in inventory';
    end if;

    select count(*) into v_invalid
    from unnest(v_ids) selected(id)
    where exists(
      select 1 from public.character_spells s
      where s.id=selected.id
        and s.character_id=p_character_id
        and (s.wizard_spell_mastery or s.wizard_signature_spell)
    );
    if v_invalid>0 then
      raise exception 'Always-prepared Wizard spells do not occupy the normal preparation quota';
    end if;

    select count(*) into v_invalid
    from unnest(v_ids) selected(id)
    where not exists(
      select 1
      from public.character_spells s
      join public.wizard_spellbook_entries entry on entry.spell_catalog_id=s.catalog_spell_id
      join public.character_inventory_items item on item.id=entry.spellbook_item_id
      join public.spell_catalog spell on spell.id=s.catalog_spell_id
      where s.id=selected.id
        and s.character_id=p_character_id
        and item.character_id=p_character_id
        and private.is_wizard_spellbook_item(item.id,p_character_id)
        and spell.spell_level between 1 and private.character_wizard_max_spell_level(p_character_id)
        and exists(
          select 1 from public.spell_catalog_classes class_link
          where class_link.spell_id=spell.id and class_link.class_key='wizard'
        )
    );
    if v_invalid>0 then
      raise exception 'Wizard preparation contains a spell that is not written in a held spellbook';
    end if;

    update public.character_spells s
    set prepared=case
          when s.wizard_spell_mastery or s.wizard_signature_spell then true
          else s.id=any(v_ids)
        end,
        updated_at=now()
    where s.character_id=p_character_id
      and s.spell_level>0
      and s.cast_mode='slot'
      and s.prepared is distinct from case
        when s.wizard_spell_mastery or s.wizard_signature_spell then true
        else s.id=any(v_ids)
      end;
  else
    select count(*) into v_invalid
    from unnest(v_ids) selected(id)
    where not exists(
      select 1 from public.character_spells s
      where s.id=selected.id and s.character_id=p_character_id and s.spell_level>0 and s.cast_mode='slot'
    );
    if v_invalid>0 then
      raise exception 'Prepared spell selection contains a spell that cannot be prepared for this character';
    end if;

    update public.character_spells s
    set prepared=(s.id=any(v_ids)),updated_at=now()
    where s.character_id=p_character_id
      and s.spell_level>0
      and s.cast_mode='slot'
      and s.prepared is distinct from (s.id=any(v_ids));
  end if;

  v_task_key:='spells:' || v_template.id::text;
  v_prepared:=to_jsonb(v_ids);
  insert into public.character_preparation_records(
    character_id,generation,assignment_id,task_key,input_value,resolved_value,created_by,created_at
  ) values (
    p_character_id,v_session.generation,v_assignment.id,v_task_key,cardinality(v_ids),v_prepared,auth.uid(),now()
  )
  on conflict (character_id,generation,assignment_id,task_key) do update
  set input_value=excluded.input_value,resolved_value=excluded.resolved_value,
      created_by=excluded.created_by,created_at=now();

  return jsonb_build_object(
    'character_id',p_character_id,'generation',v_session.generation,
    'assignment_id',v_assignment.id,'task_key',v_task_key,
    'prepared_spell_ids',v_prepared,'required',v_required
  );
end;
$function$;
