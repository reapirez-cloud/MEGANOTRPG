-- CLASS_MIGRATION_SCOPE: runtime
-- CLASS_INTEGRATION_STRICT: class:paladin
-- CLASS_WORK_STATUS: paladin:spells=READY_STAGE3, paladin:subclasses=PENDING_STAGE4

create or replace function private.assert_paladin_spell_preparation_v1(
  p_character_id uuid,
  p_assignment_id uuid,
  p_prepared_spell_ids uuid[]
)
returns void
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_template public.rule_templates%rowtype;
  v_source_level integer;
  v_required integer;
  v_max_slot integer;
  v_invalid integer;
  v_current_count integer;
  v_removed integer;
begin
  select t.* into v_template
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.id=p_assignment_id and a.character_id=p_character_id;
  if v_template.id is null or v_template.catalog_key<>'class:paladin' then return; end if;

  v_source_level:=private.character_template_source_level(p_assignment_id);
  if v_source_level is null then raise exception 'PALADIN_SPELL_SOURCE_NOT_UNLOCKED'; end if;
  v_required:=private.character_prepared_spell_limit(p_assignment_id);
  if cardinality(coalesce(p_prepared_spell_ids,array[]::uuid[]))<>v_required then
    raise exception 'PALADIN_PREPARE_EXACTLY:%',v_required;
  end if;

  select max(e.key::integer) into v_max_slot
  from public.character_sheets cs
  cross join lateral jsonb_each(coalesce(cs.spell_slots,'{}'::jsonb)) e(key,value)
  where cs.character_id=p_character_id and e.key~'^[1-9]$' and coalesce((e.value->>'max')::integer,0)>0;
  v_max_slot:=coalesce(v_max_slot,0);

  select count(*) into v_invalid
  from unnest(coalesce(p_prepared_spell_ids,array[]::uuid[])) selected(id)
  where not exists(
    select 1
    from public.character_spells cs
    join public.spell_catalog s on s.id=cs.catalog_spell_id
    join public.spell_catalog_classes scl on scl.spell_id=s.id and scl.class_key='paladin'
    where cs.id=selected.id and cs.character_id=p_character_id
      and s.spell_level between 1 and v_max_slot
      and not (v_source_level>=2 and s.slug='divine-smite')
      and not (v_source_level>=5 and s.slug='find-steed')
  );
  if v_invalid>0 then raise exception 'PALADIN_PREPARATION_CONTAINS_UNAVAILABLE_OR_ALWAYS_PREPARED_SPELL'; end if;

  select count(*) into v_current_count
  from public.character_spells cs
  join public.spell_catalog s on s.id=cs.catalog_spell_id
  join public.spell_catalog_classes scl on scl.spell_id=s.id and scl.class_key='paladin'
  where cs.character_id=p_character_id and cs.prepared=true and s.spell_level>0
    and not (v_source_level>=2 and s.slug='divine-smite')
    and not (v_source_level>=5 and s.slug='find-steed');

  if v_current_count>0 then
    select count(*) into v_removed
    from public.character_spells cs
    join public.spell_catalog s on s.id=cs.catalog_spell_id
    join public.spell_catalog_classes scl on scl.spell_id=s.id and scl.class_key='paladin'
    where cs.character_id=p_character_id and cs.prepared=true and s.spell_level>0
      and not (v_source_level>=2 and s.slug='divine-smite')
      and not (v_source_level>=5 and s.slug='find-steed')
      and not (cs.id=any(coalesce(p_prepared_spell_ids,array[]::uuid[])));
    if v_removed>1 then raise exception 'PALADIN_LONG_REST_REPLACES_AT_MOST_ONE_SPELL'; end if;
  end if;
end;
$function$;
revoke all on function private.assert_paladin_spell_preparation_v1(uuid,uuid,uuid[]) from public,anon,authenticated;

create or replace function public.commit_character_spell_preparation_v1(
  p_character_id uuid,
  p_assignment_id uuid,
  p_prepared_spell_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_character public.characters%rowtype;
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_session public.character_preparation_sessions%rowtype;
  v_ids uuid[]:=array[]::uuid[];
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
     and not private.can_manage_character(v_character.id,auth.uid()) then raise exception 'Only the assigned player or campaign manager can prepare spells'; end if;
  select * into v_assignment from public.character_template_assignments where id=p_assignment_id and character_id=p_character_id;
  if v_assignment.id is null then raise exception 'Spell preparation source is not assigned to this character'; end if;
  v_source_level:=private.character_template_source_level(v_assignment.id);
  select * into v_template from public.rule_templates where id=v_assignment.template_id and is_active=true;
  if v_template.id is null or coalesce(v_template.rules_meta->>'spell_preparation_refresh','')<>'long_rest' or v_source_level is null then raise exception 'This source does not allow long-rest spell preparation'; end if;
  select * into v_session from public.character_preparation_sessions where character_id=p_character_id for update;
  if v_session.character_id is null or not v_session.is_open then raise exception 'Preparation window is closed until the next long rest'; end if;

  select coalesce(array_agg(id order by id),array[]::uuid[]) into v_ids
  from (select distinct value as id from unnest(coalesce(p_prepared_spell_ids,array[]::uuid[])) value) selected;
  if cardinality(v_ids)<>cardinality(coalesce(p_prepared_spell_ids,array[]::uuid[])) then raise exception 'Prepared spell selection contains duplicate spells'; end if;

  if v_template.catalog_key='class:wizard' then
    v_required:=coalesce((v_template.rules_meta->'sheet_profile'->'prepared_spells_by_level'->>v_source_level::text)::integer,0);
    if v_required<1 then raise exception 'Wizard prepared-spell limit is unavailable'; end if;
    if cardinality(v_ids)<>v_required then raise exception 'Wizard must prepare exactly % ordinary spells at level %',v_required,v_source_level; end if;
    if not exists(select 1 from public.character_inventory_items item where item.character_id=p_character_id and private.is_wizard_spellbook_item(item.id,p_character_id)) then raise exception 'Wizard spell preparation requires a spellbook in inventory'; end if;
    select count(*) into v_invalid from unnest(v_ids) selected(id)
    where exists(select 1 from public.character_spells s where s.id=selected.id and s.character_id=p_character_id and (s.wizard_spell_mastery or s.wizard_signature_spell));
    if v_invalid>0 then raise exception 'Always-prepared Wizard spells do not occupy the normal preparation quota'; end if;
    select count(*) into v_invalid
    from unnest(v_ids) selected(id)
    where not exists(
      select 1 from public.character_spells s
      join public.wizard_spellbook_entries entry on entry.spell_catalog_id=s.catalog_spell_id
      join public.character_inventory_items item on item.id=entry.spellbook_item_id
      join public.spell_catalog spell on spell.id=s.catalog_spell_id
      where s.id=selected.id and s.character_id=p_character_id and item.character_id=p_character_id
        and private.is_wizard_spellbook_item(item.id,p_character_id)
        and spell.spell_level between 1 and private.character_wizard_max_spell_level(p_character_id)
        and exists(select 1 from public.spell_catalog_classes class_link where class_link.spell_id=spell.id and class_link.class_key='wizard')
    );
    if v_invalid>0 then raise exception 'Wizard preparation contains a spell that is not written in a held spellbook'; end if;
    update public.character_spells s set prepared=case when s.wizard_spell_mastery or s.wizard_signature_spell then true else s.id=any(v_ids) end,updated_at=now()
    where s.character_id=p_character_id and s.spell_level>0 and s.cast_mode='slot'
      and s.prepared is distinct from case when s.wizard_spell_mastery or s.wizard_signature_spell then true else s.id=any(v_ids) end;
  else
    if v_template.catalog_key='class:paladin' then
      v_required:=private.character_prepared_spell_limit(v_assignment.id);
      perform private.assert_paladin_spell_preparation_v1(p_character_id,p_assignment_id,v_ids);
    else
      select count(*) into v_invalid from unnest(v_ids) selected(id)
      where not exists(select 1 from public.character_spells s where s.id=selected.id and s.character_id=p_character_id and s.spell_level>0 and s.cast_mode='slot');
      if v_invalid>0 then raise exception 'Prepared spell selection contains a spell that cannot be prepared for this character'; end if;
    end if;
    update public.character_spells s set prepared=(s.id=any(v_ids)),updated_at=now()
    where s.character_id=p_character_id and s.spell_level>0 and s.cast_mode='slot' and s.prepared is distinct from (s.id=any(v_ids));
  end if;

  v_task_key:='spells:'||v_template.id::text;
  v_prepared:=to_jsonb(v_ids);
  insert into public.character_preparation_records(character_id,generation,assignment_id,task_key,input_value,resolved_value,created_by,created_at)
  values(p_character_id,v_session.generation,v_assignment.id,v_task_key,cardinality(v_ids),v_prepared,auth.uid(),now())
  on conflict(character_id,generation,assignment_id,task_key) do update set input_value=excluded.input_value,resolved_value=excluded.resolved_value,created_by=excluded.created_by,created_at=now();
  return jsonb_build_object('character_id',p_character_id,'generation',v_session.generation,'assignment_id',v_assignment.id,'task_key',v_task_key,'prepared_spell_ids',v_prepared,'required',v_required);
end;
$function$;

create or replace function public.set_character_spell_prepared(p_spell_id uuid,p_prepared boolean)
returns void language plpgsql security definer set search_path='' as $function$
declare v_character_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select character_id into v_character_id from public.character_spells where id=p_spell_id;
  if v_character_id is null then raise exception 'Spell not found'; end if;
  if not private.can_change_character_spells(v_character_id,auth.uid()) then raise exception 'Spell changes are locked. GM must grant access after a long rest'; end if;
  if exists(select 1 from public.character_template_assignments a join public.rule_templates t on t.id=a.template_id and t.is_active where a.character_id=v_character_id and t.catalog_key='class:paladin') then
    raise exception 'Paladin spell preparation must be committed through the long-rest preparation flow';
  end if;
  update public.character_spells set prepared=coalesce(p_prepared,false),updated_at=now() where id=p_spell_id;
end;
$function$;

create or replace function private.ensure_paladin_spell_runtime_stage3_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare
  v_paladin uuid;
  v_level integer;
  v_slot_level_text text;
  v_slot_max_text text;
  v_slot_max integer;
  v_slots jsonb;
  v_resources jsonb;
  v_special jsonb;
  v_smite_slots jsonb;
  v_steed_slots jsonb;
  v_cantrip_choice jsonb;
  v_slots_by_level jsonb := $slots${"1":{"1":2},"2":{"1":2},"3":{"1":3},"4":{"1":3},"5":{"1":4,"2":2},"6":{"1":4,"2":2},"7":{"1":4,"2":3},"8":{"1":4,"2":3},"9":{"1":4,"2":3,"3":2},"10":{"1":4,"2":3,"3":2},"11":{"1":4,"2":3,"3":3},"12":{"1":4,"2":3,"3":3},"13":{"1":4,"2":3,"3":3,"4":1},"14":{"1":4,"2":3,"3":3,"4":1},"15":{"1":4,"2":3,"3":3,"4":2},"16":{"1":4,"2":3,"3":3,"4":2},"17":{"1":4,"2":3,"3":3,"4":3,"5":1},"18":{"1":4,"2":3,"3":3,"4":3,"5":1},"19":{"1":4,"2":3,"3":3,"4":3,"5":2},"20":{"1":4,"2":3,"3":3,"4":3,"5":2}}$slots$::jsonb;
  v_prepared_by_level jsonb := $prepared${"1":2,"2":3,"3":4,"4":5,"5":6,"6":6,"7":7,"8":7,"9":9,"10":9,"11":10,"12":10,"13":11,"14":11,"15":12,"16":12,"17":14,"18":14,"19":15,"20":15}$prepared$::jsonb;
begin
  perform private.ensure_paladin_base_runtime_stage2_v1(p_campaign_id);
  select id into v_paladin from public.rule_templates where campaign_id=p_campaign_id and kind='class' and catalog_key='class:paladin' and is_active order by version desc,created_at desc limit 1;
  if v_paladin is null then raise exception 'PALADIN_STAGE3_ACTIVE_TEMPLATE_NOT_FOUND:%',p_campaign_id; end if;

  select coalesce(jsonb_agg(jsonb_build_object('key','slot-'||g::text,'label','Ячейка '||g::text||' уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_'||g::text,'amount',1)),'castLevel',g) order by g),'[]'::jsonb) into v_smite_slots from generate_series(1,5) g;
  select coalesce(jsonb_agg(jsonb_build_object('key','slot-'||g::text,'label','Ячейка '||g::text||' уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_'||g::text,'amount',1)),'castLevel',g) order by g),'[]'::jsonb) into v_steed_slots from generate_series(2,5) g;

  select jsonb_build_object(
    'key','paladin-blessed-warrior-cantrips','label','Благословенный воин · заговоры жреца','target','trait','count',2,'selection_mode','player_once',
    'replacement_policy','on_level_change','replacement_limit',1,
    'requires_choice',jsonb_build_object('key','paladin-fighting-style','option','style:blessed-warrior'),
    'options',coalesce(jsonb_agg(to_jsonb('spell:'||s.slug) order by s.sort_order,s.slug),'[]'::jsonb),
    'option_labels',coalesce(jsonb_object_agg('spell:'||s.slug,coalesce(nullif(s.name_ru,''),s.name_en)),'{}'::jsonb),
    'option_mechanics',coalesce(jsonb_object_agg('spell:'||s.slug,jsonb_build_array(jsonb_build_object(
      'id','paladin-blessed-warrior-'||s.slug,'key','spell:'||s.slug,'type','spell','sourceKey','blessed-warrior','variantKey','paladin-blessed-warrior:'||s.slug,'catalogSlug',s.slug,
      'payload',jsonb_build_object('spell',jsonb_build_object('name',coalesce(nullif(s.name_ru,''),s.name_en),'level',0,'ritual',s.ritual,'school',s.school),
        'methods',jsonb_build_array(jsonb_build_object('key','paladin-blessed-warrior:'||s.slug,'kind','class_feature','ability','charisma','resourceOptions','[]'::jsonb,'requiresPrepared',false)),
        'preparation',jsonb_build_object('mode','not_required'))
    ))),'{}'::jsonb)
  ) into v_cantrip_choice
  from public.spell_catalog s where s.spell_level=0 and exists(select 1 from public.spell_catalog_classes scl where scl.spell_id=s.id and scl.class_key='cleric');

  for v_level in 1..20 loop
    v_slots:=coalesce(v_slots_by_level->v_level::text,'{}'::jsonb); v_resources:='[]'::jsonb;
    for v_slot_level_text,v_slot_max_text in select key,value from jsonb_each_text(v_slots) loop
      v_slot_max:=v_slot_max_text::integer;
      v_resources:=v_resources||jsonb_build_array(jsonb_build_object(
        'id','paladin-slot-'||v_slot_level_text||'-l'||v_level::text,'key','spell_slot_'||v_slot_level_text,'max',v_slot_max,'type','resource','label','Ячейки '||v_slot_level_text||' уровня',
        'initial','full','restore','full','priority',v_level,'recharge',jsonb_build_array('long_rest'),'recoveryRules',jsonb_build_array(jsonb_build_object('trigger','long_rest','restore','full')),
        'sourceKey','spellcasting','grantOperation','REPLACE','presentation',jsonb_build_object('icon','✦','tone','violet','display','pips','priority',80)
      ));
    end loop;

    v_special:='[]'::jsonb;
    if v_level=2 then
      v_special:=jsonb_build_array(
        jsonb_build_object('id','paladin-smite-free-cast-resource','key','paladin_smite_free_cast','max',1,'type','resource','label','Божественная кара · бесплатно','initial','full','restore','full','recharge',jsonb_build_array('long_rest'),'recoveryRules',jsonb_build_array(jsonb_build_object('trigger','long_rest','restore','full')),'sourceKey','paladin-s-smite','grantOperation','REPLACE','priority',2,'presentation',jsonb_build_object('icon','✦','tone','gold','display','pips','priority',86)),
        jsonb_build_object('id','paladin-divine-smite-spell','key','spell:divine-smite','type','spell','sourceKey','paladin-s-smite','variantKey','paladin-s-smite:divine-smite','catalogSlug','divine-smite','payload',jsonb_build_object(
          'spell',jsonb_build_object('name','Божественная кара','level',1,'school','Evocation'),
          'methods',jsonb_build_array(
            jsonb_build_object('key','paladin-s-smite-slots','kind','class_spell','ability','charisma','resourceOptions',v_smite_slots,'requiresPrepared',false),
            jsonb_build_object('key','paladin-s-smite-free','kind','class_feature','ability','charisma','resourceOptions',jsonb_build_array(jsonb_build_object('key','free','label','Бесплатное применение','costs',jsonb_build_array(jsonb_build_object('key','paladin_smite_free_cast','amount',1)),'castLevel',1)),'requiresPrepared',false)
          ),
          'preparation',jsonb_build_object('mode','always_prepared'),
          'rules',jsonb_build_object('trigger','immediately_after_melee_weapon_or_unarmed_hit','economy','bonus_action','damageBase','2d8','damageType','radiant','extraVs',jsonb_build_array('fiend','undead'),'extraVsDamage','1d8','upcastPerLevel','1d8')
        ))
      );
    elsif v_level=5 then
      v_special:=jsonb_build_array(
        jsonb_build_object('id','paladin-faithful-steed-free-cast-resource','key','faithful_steed_free_cast','max',1,'type','resource','label','Верный скакун · бесплатно','initial','full','restore','full','recharge',jsonb_build_array('long_rest'),'recoveryRules',jsonb_build_array(jsonb_build_object('trigger','long_rest','restore','full')),'sourceKey','faithful-steed','grantOperation','REPLACE','priority',5,'presentation',jsonb_build_object('icon','✦','tone','gold','display','pips','priority',85)),
        jsonb_build_object('id','paladin-find-steed-spell','key','spell:find-steed','type','spell','sourceKey','faithful-steed','variantKey','paladin-faithful-steed:find-steed','catalogSlug','find-steed','payload',jsonb_build_object(
          'spell',jsonb_build_object('name','Поиск скакуна','level',2,'school','Conjuration'),
          'methods',jsonb_build_array(
            jsonb_build_object('key','paladin-faithful-steed-slots','kind','class_spell','ability','charisma','resourceOptions',v_steed_slots,'requiresPrepared',false),
            jsonb_build_object('key','paladin-faithful-steed-free','kind','class_feature','ability','charisma','resourceOptions',jsonb_build_array(jsonb_build_object('key','free','label','Бесплатное применение','costs',jsonb_build_array(jsonb_build_object('key','faithful_steed_free_cast','amount',1)),'castLevel',2)),'requiresPrepared',false)
          ),'preparation',jsonb_build_object('mode','always_prepared')
        ))
      );
    end if;

    update public.rule_template_levels l set mechanics=(
      select coalesce(jsonb_agg(e.value order by e.ord) filter(where not (coalesce(e.value->>'type','')='resource' and coalesce(e.value->>'sourceKey','')='spellcasting' and coalesce(e.value->>'key','') like 'spell_slot_%') and coalesce(e.value->>'id','') not in ('paladin-smite-free-cast-resource','paladin-divine-smite-spell','paladin-faithful-steed-free-cast-resource','paladin-find-steed-spell')),'[]'::jsonb)||v_resources||v_special
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(value,ord)
    ) where l.template_id=v_paladin and l.level=v_level;
  end loop;

  update public.rule_template_levels l set choices=(select coalesce(jsonb_agg(e.value order by e.ord) filter(where coalesce(e.value->>'key','')<>'paladin-blessed-warrior-cantrips'),'[]'::jsonb)||jsonb_build_array(v_cantrip_choice) from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality e(value,ord)) where l.template_id=v_paladin and l.level=2;

  update public.rule_template_levels l set mechanics=(
    select coalesce(jsonb_agg(case e.value->>'id'
      when 'paladin-spellcasting-feature-l1' then jsonb_set(jsonb_set(e.value,'{payload,description}',to_jsonb('Использует Харизму для заклинаний Паладина. Подготовка следует таблице Паладина; после долгого отдыха можно заменить не более одного подготовленного заклинания. Ячейки восстанавливаются после долгого отдыха.'::text),true),'{payload,runtime}',jsonb_build_object('kind','prepared_spellcasting','ability','charisma','spellList','paladin','preparationRefresh','long_rest','replacementLimit',1,'sharedSlots',true),true)
      when 'paladin-paladin-s-smite-feature-l2' then jsonb_set(jsonb_set(e.value,'{payload,description}',to_jsonb('Божественная кара всегда подготовлена. Один раз между долгими отдыхами её можно применить без ячейки; остальные применения используют общие ячейки заклинаний Паладина.'::text),true),'{payload,runtime}',jsonb_build_object('kind','always_prepared_spell','spell','divine-smite','freeCastResource','paladin_smite_free_cast','freeCasts',1,'refresh','long_rest','sharedSlots',true),true)
      when 'paladin-faithful-steed-feature-l5' then jsonb_set(jsonb_set(e.value,'{payload,description}',to_jsonb('Поиск скакуна всегда подготовлен. Один раз между долгими отдыхами его можно применить без ячейки; остальные применения используют общие ячейки.'::text),true),'{payload,runtime}',jsonb_build_object('kind','always_prepared_spell','spell','find-steed','freeCastResource','faithful_steed_free_cast','freeCasts',1,'refresh','long_rest','sharedSlots',true),true)
      else e.value end order by e.ord),'[]'::jsonb)
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(value,ord)
  ) where l.template_id=v_paladin and l.level in (1,2,5);

  update public.rule_templates set catalog_revision='xphb-2024-paladin-spell-runtime-v1',
    rules_meta=(coalesce(rules_meta,'{}'::jsonb)-'stage3_deferred')||jsonb_build_object(
      'class_key','paladin','rules_revision','2024','mechanics_status','SPELL_RUNTIME_READY_STAGE3','runtime_stage',3,'runtime_revision','xphb-2024-paladin-spell-runtime-v1','spell_runtime_included',true,
      'spell_progression','half','spellcasting_ability','charisma','spell_preparation_refresh','long_rest','prepared_spell_replacement_limit',1,'class_spells_catalog_linked',true,'class_spells_use_shared_slots',true,
      'paladins_smite_spell','divine-smite','paladins_smite_free_cast_resource','paladin_smite_free_cast','faithful_steed_spell','find-steed','faithful_steed_free_cast_resource','faithful_steed_free_cast','blessed_warrior_choice_key','paladin-blessed-warrior-cantrips',
      'stage4_deferred',jsonb_build_array('subclass_runtime','ui_chat_final_certification'),
      'sheet_profile',jsonb_build_object('spell_list','paladin','spellcasting_enabled',true,'spellcasting_ability','charisma','spell_slots_by_level',v_slots_by_level,'prepared_spells_by_level',v_prepared_by_level)
    ),updated_at=now() where id=v_paladin;
  perform private.sync_rule_template_spell_links(v_paladin);
end;
$function$;
revoke all on function private.ensure_paladin_spell_runtime_stage3_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_paladin_spell_runtime_stage3_v1(uuid) to service_role;

create or replace function private.ensure_paladin_spell_runtime_stage3_v1_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $function$ begin perform private.ensure_paladin_spell_runtime_stage3_v1(new.id); return new; end;$function$;
revoke all on function private.ensure_paladin_spell_runtime_stage3_v1_after_campaign() from public,anon,authenticated;
drop trigger if exists aaaaaaaae_campaigns_ensure_paladin_spell_runtime_stage3_v1 on public.campaigns;
create trigger aaaaaaaae_campaigns_ensure_paladin_spell_runtime_stage3_v1 after insert on public.campaigns for each row execute function private.ensure_paladin_spell_runtime_stage3_v1_after_campaign();

do $block$ declare v_campaign record; begin for v_campaign in select id from public.campaigns loop perform private.ensure_paladin_spell_runtime_stage3_v1(v_campaign.id); end loop; end;$block$;

do $cert$
declare v_bad integer;
begin
  select count(*) into v_bad from public.rule_templates t where t.kind='class' and t.catalog_key='class:paladin' and t.is_active and (t.rules_meta->>'mechanics_status'<>'SPELL_RUNTIME_READY_STAGE3' or t.rules_meta->>'spellcasting_ability'<>'charisma' or t.rules_meta->>'spell_preparation_refresh'<>'long_rest' or coalesce((t.rules_meta->>'prepared_spell_replacement_limit')::integer,0)<>1 or jsonb_typeof(t.rules_meta->'sheet_profile'->'spell_slots_by_level')<>'object' or (t.rules_meta->'sheet_profile'->'prepared_spells_by_level'->>'20')::integer<>15);
  if v_bad>0 then raise exception 'PALADIN_STAGE3_PROFILE_CERTIFICATION_FAILED:%',v_bad; end if;
  select count(*) into v_bad from public.rule_templates t where t.kind='class' and t.catalog_key='class:paladin' and t.is_active and (select count(*) from public.rule_template_levels l where l.template_id=t.id)<>20;
  if v_bad>0 then raise exception 'PALADIN_STAGE3_LEVEL_CERTIFICATION_FAILED:%',v_bad; end if;
  select count(*) into v_bad from public.rule_templates t where t.kind='class' and t.catalog_key='class:paladin' and t.is_active and not exists(select 1 from public.rule_template_spell_links l where l.template_id=t.id and l.catalog_slug='divine-smite');
  if v_bad>0 then raise exception 'PALADIN_STAGE3_DIVINE_SMITE_LINK_MISSING:%',v_bad; end if;
  select count(*) into v_bad from public.rule_templates t where t.kind='class' and t.catalog_key='class:paladin' and t.is_active and not exists(select 1 from public.rule_template_spell_links l where l.template_id=t.id and l.catalog_slug='find-steed');
  if v_bad>0 then raise exception 'PALADIN_STAGE3_FIND_STEED_LINK_MISSING:%',v_bad; end if;
end;$cert$;