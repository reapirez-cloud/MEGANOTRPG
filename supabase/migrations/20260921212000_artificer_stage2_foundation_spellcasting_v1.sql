-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:artificer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/artificerRuntimeStage2Foundation.test.ts
-- CLASS_WORK_STATUS: artificer:stage2_foundation_spellcasting=COMPLETE,artificer:mechanics=IN_PROGRESS_STAGE2_COMPLETE
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

insert into public.spell_catalog(
  slug,name_en,name_ru,spell_level,school,casting_time,spell_range,area,duration,
  components,material,concentration,ritual,check_type,damage,effect_summary,upcast,notes,
  rules_text,source,source_kind,license,material_cost_gp,material_consumed,
  material_consumption,roll_mode,roll_recipe,author_description,author_comment
) values
('thorn-whip','Thorn Whip',null,0,'Transmutation','1 Action','30 ft.','1 creature','Instantaneous',
 array['V','S','M'],null,false,false,'Melee spell attack','1d6 Piercing',
 'Ranged-reach melee spell attack; on a hit deals piercing damage and can pull a Large-or-smaller target closer.',
 'Damage dice scale at character levels 5, 11, and 17.','',null,'Player''s Handbook 2024','official',null,null,false,'none','contextual',null,'',''),
('arcane-vigor','Arcane Vigor',null,2,'Abjuration','1 Bonus Action','Self','','Instantaneous',
 array['V','S'],null,false,false,'','Healing from unexpended Hit Point Dice',
 'Spend one or two unexpended Hit Point Dice, roll them, and regain HP equal to the total plus the spellcasting ability modifier.',
 'One additional Hit Point Die can be used per slot level above 2.','Hit Point Dice remain character-owned state.',null,'Player''s Handbook 2024','official',null,null,false,'none','contextual',null,'',''),
('leomund-s-secret-chest','Leomund''s Secret Chest',null,4,'Conjuration','1 Action','Touch','Chest and replica','Until Dispelled',
 array['V','S','M'],'A rare-material chest worth 5,000+ GP and a Tiny matching replica worth 50+ GP',false,false,'','',
 'Hide a prepared chest on the Ethereal Plane and recall or return it by using its miniature replica.',
 '','The costly component objects are not consumed.',null,'Player''s Handbook 2024','official',null,5050,false,'none','link',null,'',''),
('mordenkainen-s-faithful-hound','Mordenkainen''s Faithful Hound',null,4,'Conjuration','1 Action','30 ft.','Phantom watchdog','8 Hours',
 array['V','S','M'],'A silver whistle',false,false,'Dexterity saving throw','4d8 Force',
 'Conjure an intangible watchdog that warns of intruders and can bite a nearby enemy for force damage on a failed Dexterity save.',
 '','The hound can be moved later with a Magic action.',null,'Player''s Handbook 2024','official',null,null,false,'none','contextual',null,'',''),
('mordenkainen-s-private-sanctum','Mordenkainen''s Private Sanctum',null,4,'Abjuration','10 Minutes','120 ft.','Cube up to 100 ft. per side','24 Hours',
 array['V','S','M'],'A thin sheet of lead',false,false,'','',
 'Ward an area with selected protections against sound, sight, divination, teleportation, or planar travel.',
 'The maximum cube size increases by 100 feet per slot level above 4.','Repeated daily casting can make the ward permanent.',null,'Player''s Handbook 2024','official',null,null,false,'none','link',null,'',''),
('otiluke-s-resilient-sphere','Otiluke''s Resilient Sphere',null,4,'Abjuration','1 Action','30 ft.','1 Large-or-smaller creature or object','Concentration, up to 1 Minute',
 array['V','S','M'],'A glass sphere',true,false,'Dexterity saving throw','',
 'Enclose a target in an invulnerable barrier that blocks effects in both directions.',
 '','An unwilling creature makes a Dexterity save to avoid enclosure.',null,'Player''s Handbook 2024','official',null,null,false,'none','contextual',null,'','')
on conflict(slug) do nothing;

create or replace function private.artificer_stage2_spell_unlock_level_v1(p_spell_level integer)
returns integer language sql immutable set search_path=''
as $function$
  select case p_spell_level when 0 then 1 when 1 then 1 when 2 then 5 when 3 then 9 when 4 then 13 when 5 then 17 else 99 end
$function$;
revoke all on function private.artificer_stage2_spell_unlock_level_v1(integer) from public,anon,authenticated;
grant execute on function private.artificer_stage2_spell_unlock_level_v1(integer) to service_role;

create or replace function private.artificer_stage2_spell_mechanic_v1(p_slug text,p_source_key text default 'artificer-stage2:spellcasting')
returns jsonb language plpgsql stable set search_path=''
as $function$
declare v_spell public.spell_catalog%rowtype; v_method jsonb;
begin
  select * into v_spell from public.spell_catalog where slug=p_slug;
  if not found then raise exception 'ARTIFICER_STAGE2_SPELL_NOT_FOUND:%',p_slug; end if;
  v_method:=jsonb_build_object(
    'key','artificer-cast','kind','class_spell','ability','intelligence',
    'saveDc',jsonb_build_object('kind','add','terms',jsonb_build_array(
      jsonb_build_object('kind','literal','value',8),
      jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
      jsonb_build_object('kind','reference','key','abilities.intelligence.modifier'))),
    'attackBonus',jsonb_build_object('kind','add','terms',jsonb_build_array(
      jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
      jsonb_build_object('kind','reference','key','abilities.intelligence.modifier'))),
    'requiresPrepared',false
  );
  if v_spell.spell_level>0 then
    v_method:=v_method||jsonb_build_object('resourceOptions',private.class_spell_slot_options(v_spell.spell_level));
  end if;
  return jsonb_build_object(
    'id','artificer-stage2-spell-'||v_spell.slug||'-'||replace(p_source_key,':','-'),
    'key','spell:'||v_spell.slug,'type','spell','sourceKey',p_source_key,
    'variantKey','artificer:'||p_source_key||':'||v_spell.slug,'catalogSlug',v_spell.slug,'grantOperation','GRANT',
    'payload',jsonb_build_object(
      'spell',jsonb_build_object('name',coalesce(nullif(v_spell.name_ru,''),v_spell.name_en,v_spell.slug),'level',v_spell.spell_level,'school',v_spell.school,'ritual',coalesce(v_spell.ritual,false)),
      'methods',jsonb_build_array(v_method),
      'preparation',jsonb_build_object('mode',case when v_spell.spell_level=0 then 'not_required' else 'always_prepared' end)
    )
  );
end;
$function$;
revoke all on function private.artificer_stage2_spell_mechanic_v1(text,text) from public,anon,authenticated;
grant execute on function private.artificer_stage2_spell_mechanic_v1(text,text) to service_role;

create or replace function private.reference_item_plan_option_valid_v1(
  p_character_id uuid,p_option text,p_source_level integer,p_category text default null
)
returns boolean language plpgsql stable security definer set search_path=''
as $function$
declare v_campaign uuid; v_definition uuid;
begin
  select campaign_id into v_campaign from public.characters where id=p_character_id;
  if v_campaign is null or p_option !~ '^refdef:[0-9a-fA-F-]{36}$' then return false; end if;
  begin v_definition:=substring(p_option from 8)::uuid; exception when others then return false; end;
  return exists(
    select 1
    from public.reference_definitions d
    join public.reference_definition_revisions r on r.definition_id=d.id and r.revision=d.current_revision
    where d.id=v_definition and d.kind='item' and d.status='active'
      and (d.scope='system' or d.campaign_id=v_campaign)
      and coalesce((r.data#>>'{replication_plan,eligible}')::boolean,false)
      and coalesce(nullif(r.data#>>'{replication_plan,unlock_level}','')::integer,99)<=greatest(1,p_source_level)
      and (nullif(btrim(coalesce(p_category,'')),'') is null or r.data#>>'{replication_plan,category}'=p_category)
  );
end;
$function$;
revoke all on function private.reference_item_plan_option_valid_v1(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function private.reference_item_plan_option_valid_v1(uuid,text,integer,text) to service_role;

create or replace function private.validate_choice_option_provider_v1(
  p_character_id uuid,p_assignment_id uuid,p_choice_key text,p_choice jsonb,p_before jsonb,p_instances jsonb
)
returns void language plpgsql stable security definer set search_path=''
as $function$
declare
  v_provider jsonb:=p_choice->'option_provider'; v_kind text; v_min integer; v_max integer;
  v_instance jsonb; v_option text; v_rank integer; v_source_level integer; v_already_stored boolean;
begin
  if v_provider is null or jsonb_typeof(v_provider)<>'object' then return; end if;
  v_kind:=coalesce(v_provider->>'kind','');
  v_source_level:=coalesce(private.character_template_source_level(p_assignment_id),1);
  for v_instance in select value from jsonb_array_elements(coalesce(p_instances,'[]'::jsonb))
  loop
    v_option:=case when jsonb_typeof(v_instance)='string' then v_instance #>> '{}' else coalesce(v_instance->>'option','') end;
    if v_option='' then continue; end if;
    select exists(
      select 1 from jsonb_array_elements(coalesce(p_before,'[]'::jsonb)) b(value)
      where case when jsonb_typeof(b.value)='string' then b.value #>> '{}' else coalesce(b.value->>'option','') end=v_option
    ) into v_already_stored;
    if v_already_stored then continue; end if;

    if v_kind='skill_proficiencies' then
      v_min:=greatest(0,least(2,coalesce((v_provider->>'minimum_rank')::integer,1)));
      v_max:=greatest(v_min,least(2,coalesce((v_provider->>'maximum_rank')::integer,2)));
      if v_option !~ '^skill:[a-z_]+$' then raise exception 'CHOICE_PROVIDER_SKILL_OPTION_INVALID:%',v_option; end if;
      v_rank:=private.character_skill_proficiency_rank_for_choice_v1(p_character_id,v_option,p_assignment_id,p_choice_key);
      if v_rank<v_min or v_rank>v_max then raise exception 'CHOICE_PROVIDER_SKILL_PROFICIENCY_INELIGIBLE:%',v_option; end if;
      continue;
    end if;
    if v_kind='weapon_proficiencies' then
      if v_option !~ '^weapon:[a-z0-9-]+$' then raise exception 'CHOICE_PROVIDER_WEAPON_OPTION_INVALID:%',v_option; end if;
      if not private.character_has_weapon_proficiency_for_choice_v1(p_character_id,v_option,p_assignment_id,p_choice_key) then
        raise exception 'CHOICE_PROVIDER_WEAPON_PROFICIENCY_INELIGIBLE:%',v_option;
      end if;
      continue;
    end if;
    if v_kind='unproficient_skill_or_tool' then
      if v_option ~ '^skill:[a-z_]+$' then
        v_rank:=private.character_skill_proficiency_rank_for_choice_v1(p_character_id,v_option,p_assignment_id,p_choice_key);
        if v_rank>0 then raise exception 'CHOICE_PROVIDER_ALREADY_PROFICIENT:%',v_option; end if;
      elsif v_option ~ '^tool:[a-z0-9:-]+$' then
        if private.character_has_tool_proficiency_for_choice_v1(p_character_id,v_option,p_assignment_id,p_choice_key) then
          raise exception 'CHOICE_PROVIDER_ALREADY_PROFICIENT:%',v_option;
        end if;
      else raise exception 'CHOICE_PROVIDER_SKILL_OR_TOOL_OPTION_INVALID:%',v_option;
      end if;
      continue;
    end if;
    if v_kind='reference_item_plans' then
      if not private.reference_item_plan_option_valid_v1(p_character_id,v_option,v_source_level,nullif(v_provider->>'category','')) then
        raise exception 'CHOICE_PROVIDER_REFERENCE_ITEM_PLAN_INELIGIBLE:%',v_option;
      end if;
      continue;
    end if;
    raise exception 'CHOICE_OPTION_PROVIDER_UNSUPPORTED:%',v_kind;
  end loop;
end;
$function$;
revoke all on function private.validate_choice_option_provider_v1(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.validate_choice_option_provider_v1(uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;

do $spell_catalog$
declare v_target jsonb:='["acid-splash","dancing-lights","elementalism","fire-bolt","guidance","light","mage-hand","mending","message","poison-spray","prestidigitation","ray-of-frost","resistance","shocking-grasp","spare-the-dying","thorn-whip","thunderclap","true-strike","alarm","cure-wounds","detect-magic","disguise-self","expeditious-retreat","faerie-fire","false-life","feather-fall","grease","identify","jump","longstrider","purify-food-and-drink","sanctuary","aid","alter-self","arcane-lock","arcane-vigor","blur","continual-flame","darkvision","dragon-s-breath","enhance-ability","enlarge-reduce","heat-metal","homunculus-servant","invisibility","lesser-restoration","levitate","magic-mouth","magic-weapon","protection-from-poison","rope-trick","see-invisibility","spider-climb","web","blink","create-food-and-water","dispel-magic","elemental-weapon","fly","glyph-of-warding","haste","protection-from-energy","revivify","water-breathing","water-walk","arcane-eye","fabricate","freedom-of-movement","leomund-s-secret-chest","mordenkainen-s-faithful-hound","mordenkainen-s-private-sanctum","otiluke-s-resilient-sphere","stone-shape","stoneskin","summon-construct","animate-objects","arcane-hand","circle-of-power","creation","greater-restoration","wall-of-stone","air-bubble","ashardalon-s-stride","booming-blade","create-spelljamming-helm","green-flame-blade","intellect-fortress","kinetic-jaunt","lightning-lure","sword-burst","tasha-s-caustic-brew","vortex-warp"]'::jsonb; v_slug text; v_missing text[];
begin
  select array_agg(x.slug order by x.slug) into v_missing
  from jsonb_array_elements_text(v_target) x(slug)
  where not exists(select 1 from public.spell_catalog s where s.slug=x.slug);
  if coalesce(array_length(v_missing,1),0)>0 then
    raise exception 'ARTIFICER_STAGE2_SPELL_DEFINITIONS_MISSING:%',array_to_string(v_missing,',');
  end if;
  delete from public.spell_catalog_classes c
  where c.class_key='artificer'
    and not exists(
      select 1 from jsonb_array_elements_text(v_target) x(slug)
      join public.spell_catalog s on s.slug=x.slug where s.id=c.spell_id
    );
  for v_slug in select value from jsonb_array_elements_text(v_target)
  loop
    insert into public.spell_catalog_classes(spell_id,class_key)
    select id,'artificer' from public.spell_catalog where slug=v_slug on conflict do nothing;
  end loop;
  if (select count(*) from public.spell_catalog_classes where class_key='artificer')<>92 then
    raise exception 'ARTIFICER_STAGE2_SPELL_LINK_COUNT_INVALID';
  end if;
end;
$spell_catalog$;

create or replace function private.sync_artificer_spell_slots_stage2_v1(p_character_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_template_id uuid; v_level integer; v_profile jsonb; v_target jsonb; v_slot integer; v_base_max integer; v_actor uuid:=auth.uid();
begin
  select t.id,greatest(1,least(20,coalesce(a.template_level,1))) into v_template_id,v_level
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id and t.kind='class' and t.catalog_key='class:artificer'
  order by a.assigned_at,a.id limit 1;
  if v_template_id is null then return; end if;
  select rules_meta->'sheet_profile' into v_profile from public.rule_templates where id=v_template_id;
  v_target:=v_profile->'spell_slots_by_level'->v_level::text;
  if v_target is null or jsonb_typeof(v_target)<>'object' then raise exception 'ARTIFICER_STAGE2_SLOT_PROFILE_MISSING:%:%',v_template_id,v_level; end if;
  for v_slot in 1..5 loop
    v_base_max:=greatest(0,coalesce((v_target->>v_slot::text)::integer,0));
    insert into public.character_resource_states(character_id,state_key,current,max_snapshot,label,recharge,updated_by)
    values(p_character_id,'spell_slot_'||v_slot::text,v_base_max,v_base_max,'Ячейки заклинаний '||v_slot::text||' уровня',
      jsonb_build_object('triggers',jsonb_build_array('long_rest'),'restore','full'),v_actor)
    on conflict(character_id,state_key) do update set
      current=greatest(0,excluded.max_snapshot+public.character_resource_states.temporary_max_bonus
        -greatest(0,public.character_resource_states.max_snapshot-public.character_resource_states.current)),
      max_snapshot=excluded.max_snapshot+public.character_resource_states.temporary_max_bonus,
      label=excluded.label,recharge=excluded.recharge,updated_by=v_actor,updated_at=now();
  end loop;
end;
$function$;
revoke all on function private.sync_artificer_spell_slots_stage2_v1(uuid) from public,anon,authenticated;
grant execute on function private.sync_artificer_spell_slots_stage2_v1(uuid) to service_role;

create or replace function private.ensure_artificer_stage2_foundation_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare
  v_artificer uuid; v_level integer; v_slot integer; v_level_mechanics jsonb; v_level_choices jsonb; v_feature jsonb;
  v_cantrip_options jsonb; v_cantrip_labels jsonb; v_cantrip_mechanics jsonb; v_cantrip_unlocks jsonb;
  v_spell_options jsonb; v_spell_labels jsonb; v_spell_mechanics jsonb; v_spell_unlocks jsonb;
  v_cantrip_choice jsonb; v_spell_choice jsonb; v_root_mechanics jsonb; v_root_choices jsonb; r record;
  v_spell_slots_by_level jsonb:='{"1":{"1":2},"2":{"1":2},"3":{"1":3},"4":{"1":3},"5":{"1":4,"2":2},"6":{"1":4,"2":2},"7":{"1":4,"2":3},"8":{"1":4,"2":3},"9":{"1":4,"2":3,"3":2},"10":{"1":4,"2":3,"3":2},"11":{"1":4,"2":3,"3":3},"12":{"1":4,"2":3,"3":3},"13":{"1":4,"2":3,"3":3,"4":1},"14":{"1":4,"2":3,"3":3,"4":1},"15":{"1":4,"2":3,"3":3,"4":2},"16":{"1":4,"2":3,"3":3,"4":2},"17":{"1":4,"2":3,"3":3,"4":3,"5":1},"18":{"1":4,"2":3,"3":3,"4":3,"5":1},"19":{"1":4,"2":3,"3":3,"4":3,"5":2},"20":{"1":4,"2":3,"3":3,"4":3,"5":2}}'::jsonb;
  v_prepared_by_level jsonb:='{"1":2,"2":3,"3":4,"4":5,"5":6,"6":6,"7":7,"8":7,"9":9,"10":9,"11":10,"12":10,"13":11,"14":11,"15":12,"16":12,"17":14,"18":14,"19":15,"20":15}'::jsonb;
  v_cantrips_by_level jsonb:='{"1":2,"2":2,"3":2,"4":2,"5":2,"6":2,"7":2,"8":2,"9":2,"10":3,"11":3,"12":3,"13":3,"14":4,"15":4,"16":4,"17":4,"18":4,"19":4,"20":4}'::jsonb;
  v_skill_options jsonb:=jsonb_build_array('skill:arcana','skill:history','skill:investigation','skill:medicine','skill:nature','skill:perception','skill:sleight_of_hand');
  v_skill_labels jsonb:=jsonb_build_object('skill:arcana','Магия','skill:history','История','skill:investigation','Расследование','skill:medicine','Медицина','skill:nature','Природа','skill:perception','Восприятие','skill:sleight_of_hand','Ловкость рук');
  v_artisan_options jsonb:=jsonb_build_array('tool:alchemists-supplies','tool:brewers-supplies','tool:calligraphers-supplies','tool:carpenters-tools','tool:cartographers-tools','tool:cobblers-tools','tool:cooks-utensils','tool:glassblowers-tools','tool:jewelers-tools','tool:leatherworkers-tools','tool:masons-tools','tool:painters-supplies','tool:potters-tools','tool:smiths-tools','tool:tinkers-tools','tool:weavers-tools','tool:woodcarvers-tools');
  v_features jsonb:='[
    {"level":1,"key":"spellcasting","name":"Spellcasting","description":"Intelligence spellcasting with shared slots and fixed prepared-spell progression."},
    {"level":1,"key":"tinkers-magic","name":"Tinker''s Magic","description":"Grants Mending; temporary item creation is Stage 3."},
    {"level":2,"key":"replicate-magic-item","name":"Replicate Magic Item","description":"Plan choices and created-item lifecycle are Stage 3."},
    {"level":3,"key":"artificer-subclass","name":"Artificer Subclass","description":"Subclass unlock at Artificer level 3."},
    {"level":4,"key":"ability-score-improvement","name":"Ability Score Improvement","description":"Uses the normal shared sheet/GM feat path."},
    {"level":5,"key":"subclass","name":"Subclass Feature","description":"Subclass runtime is added in Stages 5-6."},
    {"level":6,"key":"magic-item-tinker","name":"Magic Item Tinker","description":"Runtime is Stage 4."},
    {"level":7,"key":"flash-of-genius","name":"Flash of Genius","description":"Runtime is Stage 4."},
    {"level":8,"key":"ability-score-improvement","name":"Ability Score Improvement","description":"Uses the normal shared sheet/GM feat path."},
    {"level":9,"key":"subclass","name":"Subclass Feature","description":"Subclass runtime is added in Stages 5-6."},
    {"level":10,"key":"magic-item-adept","name":"Magic Item Adept","description":"Runtime is Stage 4."},
    {"level":11,"key":"spell-storing-item","name":"Spell-Storing Item","description":"Runtime is Stage 4."},
    {"level":12,"key":"ability-score-improvement","name":"Ability Score Improvement","description":"Uses the normal shared sheet/GM feat path."},
    {"level":14,"key":"advanced-artifice","name":"Advanced Artifice","description":"Runtime is Stage 4."},
    {"level":15,"key":"subclass","name":"Subclass Feature","description":"Subclass runtime is added in Stages 5-6."},
    {"level":16,"key":"ability-score-improvement","name":"Ability Score Improvement","description":"Uses the normal shared sheet/GM feat path."},
    {"level":18,"key":"magic-item-master","name":"Magic Item Master","description":"Runtime is Stage 4."},
    {"level":19,"key":"epic-boon","name":"Epic Boon","description":"Uses the normal shared sheet/GM feat path."},
    {"level":20,"key":"soul-of-artifice","name":"Soul of Artifice","description":"Runtime is Stage 4."}
  ]'::jsonb;
begin
  if p_campaign_id is null then return; end if;

  select coalesce(jsonb_agg(s.slug order by s.sort_order,coalesce(s.name_ru,s.name_en),s.slug),'[]'::jsonb),
         coalesce(jsonb_object_agg(s.slug,coalesce(nullif(s.name_ru,''),s.name_en,s.slug)),'{}'::jsonb),
         coalesce(jsonb_object_agg(s.slug,jsonb_build_array(private.artificer_stage2_spell_mechanic_v1(s.slug))),'{}'::jsonb),
         coalesce(jsonb_object_agg(s.slug,1),'{}'::jsonb)
  into v_cantrip_options,v_cantrip_labels,v_cantrip_mechanics,v_cantrip_unlocks
  from public.spell_catalog s join public.spell_catalog_classes c on c.spell_id=s.id and c.class_key='artificer'
  where s.spell_level=0 and s.slug<>'mending';

  select coalesce(jsonb_agg(s.slug order by s.spell_level,s.sort_order,coalesce(s.name_ru,s.name_en),s.slug),'[]'::jsonb),
         coalesce(jsonb_object_agg(s.slug,coalesce(nullif(s.name_ru,''),s.name_en,s.slug)),'{}'::jsonb),
         coalesce(jsonb_object_agg(s.slug,jsonb_build_array(private.artificer_stage2_spell_mechanic_v1(s.slug))),'{}'::jsonb),
         coalesce(jsonb_object_agg(s.slug,private.artificer_stage2_spell_unlock_level_v1(s.spell_level)),'{}'::jsonb)
  into v_spell_options,v_spell_labels,v_spell_mechanics,v_spell_unlocks
  from public.spell_catalog s join public.spell_catalog_classes c on c.spell_id=s.id and c.class_key='artificer'
  where s.spell_level between 1 and 5;

  if jsonb_array_length(v_cantrip_options)<>21 or jsonb_array_length(v_spell_options)<>70 then
    raise exception 'ARTIFICER_STAGE2_OPTION_COUNT_INVALID:cantrips=%:spells=%',jsonb_array_length(v_cantrip_options),jsonb_array_length(v_spell_options);
  end if;

  v_cantrip_choice:=jsonb_build_object(
    'key','artificer_cantrips','label','Artificer Cantrips','target','spell','count',2,
    'count_by_level',jsonb_build_object('1',2,'10',3,'14',4),
    'selection_mode','player_once','refresh','long_rest','replacement_policy','preparation','replacement_limit',1,'required',true,
    'options',v_cantrip_options,'option_labels',v_cantrip_labels,'option_unlock_level',v_cantrip_unlocks,'option_mechanics',v_cantrip_mechanics
  );
  v_spell_choice:=jsonb_build_object(
    'key','artificer_prepared_spells','label','Prepared Artificer Spells','target','spell','count',2,
    'count_by_level',v_prepared_by_level,'selection_mode','player_once','refresh','long_rest','replacement_policy','preparation','required',true,
    'options',v_spell_options,'option_labels',v_spell_labels,'option_unlock_level',v_spell_unlocks,'option_mechanics',v_spell_mechanics
  );

  v_root_mechanics:=jsonb_build_array(
    jsonb_build_object('id','artificer-hit-die','type','grant','sourceKey','hit-die','target','feature','key','class:artificer:hit-die','payload',jsonb_build_object('label','Hit Die: d8','hitDie',8)),
    jsonb_build_object('id','artificer-save-con','type','grant','sourceKey','saving-throw-constitution','target','proficiency','key','savingThrow:constitution','payload',jsonb_build_object('rank',1)),
    jsonb_build_object('id','artificer-save-int','type','grant','sourceKey','saving-throw-intelligence','target','proficiency','key','savingThrow:intelligence','payload',jsonb_build_object('rank',1)),
    jsonb_build_object('id','artificer-armor-light','type','grant','sourceKey','armor-light','target','proficiency','key','armor:light','payload',jsonb_build_object('rank',1)),
    jsonb_build_object('id','artificer-armor-medium','type','grant','sourceKey','armor-medium','target','proficiency','key','armor:medium','payload',jsonb_build_object('rank',1)),
    jsonb_build_object('id','artificer-armor-shield','type','grant','sourceKey','armor-shield','target','proficiency','key','armor:shield','payload',jsonb_build_object('rank',1)),
    jsonb_build_object('id','artificer-weapon-simple','type','grant','sourceKey','weapon-simple','target','proficiency','key','weapon:simple','payload',jsonb_build_object('rank',1)),
    jsonb_build_object('id','artificer-thieves-tools','type','grant','sourceKey','thieves-tools','target','proficiency','key','tool:thieves-tools','payload',jsonb_build_object('rank',1)),
    jsonb_build_object('id','artificer-tinkers-tools','type','grant','sourceKey','tinkers-tools','target','proficiency','key','tool:tinkers-tools','payload',jsonb_build_object('rank',1)),
    jsonb_build_object('id','artificer-spellcasting-focus','type','grant','sourceKey','spellcasting','target','permission','key','spellcasting_focus:artificer-tools','payload',jsonb_build_object('label','Artificer spellcasting focus'))
  );
  v_root_choices:=jsonb_build_array(
    jsonb_build_object('key','artificer-skills','label','Artificer Skills','target','proficiency','count',2,'selection_mode','player_once','required',true,'options',v_skill_options,'option_labels',v_skill_labels),
    jsonb_build_object('key','artificer-artisan-tool','label','Artisan''s Tools','target','proficiency','count',1,'selection_mode','player_once','required',true,'options',v_artisan_options,'option_provider',jsonb_build_object('kind','unproficient_skill_or_tool'))
  );

  select id into v_artificer from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and (catalog_key='class:artificer' or slug='artificer-core')
  order by (catalog_key='class:artificer') desc,is_active desc,version desc,created_at desc limit 1;

  if v_artificer is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,catalog_key,catalog_revision,
      source_kind,source_label,is_builtin,mechanical_summary,author_description,author_comment,rules_meta
    ) values(
      p_campaign_id,'class','artificer-core','Артификер','Технический runtime-пакет Artificer 2025; литературный слой заполняется отдельно.',
      1,v_root_mechanics,v_root_choices,true,'class:artificer','efota-2025-artificer-stage2-foundation-spellcasting-v1',
      'official','Eberron: Forge of the Artificer (2025)',true,
      'd8; Intelligence; Constitution/Intelligence saves; Light/Medium armor and Shields; Simple weapons; tools; exact 1-20 shared spell runtime.','','',
      jsonb_build_object(
        'class_key','artificer','rules_revision','2025','hit_die',8,'text_status','DEFERRED_USER_TRANSLATION',
        'mechanics_status','IN_PROGRESS_STAGE2_FOUNDATION_SPELLCASTING_READY','runtime_stage',2,
        'runtime_revision','efota-2025-artificer-stage2-foundation-spellcasting-v1',
        'reference_only_until_final_certification',true,'literary_layer_required_for_runtime',false,
        'spell_runtime_included',true,'spell_slot_runtime_included',true,'spellcasting_ability','intelligence',
        'spell_progression','artificer_half_caster_round_up','cantrip_replacement_refresh','long_rest','cantrip_replacement_limit',1,
        'prepared_spell_refresh','long_rest','mending_from_tinkers_magic',true,'spell_catalog_target_count',92,
        'spell_choice_cantrip_count',21,'spell_choice_levelled_count',70,'magic_item_plan_provider','reference_item_plans',
        'subclass_unlock_level',3,'subclass_runtime_included',false,'base_item_runtime_pending_stage3',true,
        'remaining_base_runtime_pending_stage4',true,
        'sheet_profile',jsonb_build_object('spellcasting_enabled',true,'spellcasting_ability','intelligence','spell_list','artificer','spellcasting_focus','artificer_tools','spell_slots_by_level',v_spell_slots_by_level,'prepared_spells_by_level',v_prepared_by_level,'cantrips_by_level',v_cantrips_by_level),
        'spellcasting_contract',jsonb_build_object('spell_slots_by_level',v_spell_slots_by_level,'prepared_spells_by_level',v_prepared_by_level,'cantrips_by_level',v_cantrips_by_level,'runtime_status','active'),
        'next_stage','artificer_core_item_replication_runtime'
      )
    ) returning id into v_artificer;
  else
    update public.rule_templates set
      slug='artificer-core',name='Артификер',description='Технический runtime-пакет Artificer 2025; литературный слой заполняется отдельно.',
      mechanics=v_root_mechanics,choices=v_root_choices,is_active=true,catalog_key='class:artificer',
      catalog_revision='efota-2025-artificer-stage2-foundation-spellcasting-v1',source_kind='official',
      source_label='Eberron: Forge of the Artificer (2025)',is_builtin=true,
      mechanical_summary='d8; Intelligence; Constitution/Intelligence saves; Light/Medium armor and Shields; Simple weapons; tools; exact 1-20 shared spell runtime.',
      author_description='',author_comment='',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'class_key','artificer','rules_revision','2025','hit_die',8,'text_status','DEFERRED_USER_TRANSLATION',
        'mechanics_status','IN_PROGRESS_STAGE2_FOUNDATION_SPELLCASTING_READY','runtime_stage',2,
        'runtime_revision','efota-2025-artificer-stage2-foundation-spellcasting-v1',
        'reference_only_until_final_certification',true,'literary_layer_required_for_runtime',false,
        'spell_runtime_included',true,'spell_slot_runtime_included',true,'spellcasting_ability','intelligence',
        'spell_progression','artificer_half_caster_round_up','cantrip_replacement_refresh','long_rest','cantrip_replacement_limit',1,
        'prepared_spell_refresh','long_rest','mending_from_tinkers_magic',true,'spell_catalog_target_count',92,
        'spell_choice_cantrip_count',21,'spell_choice_levelled_count',70,'magic_item_plan_provider','reference_item_plans',
        'subclass_unlock_level',3,'subclass_runtime_included',false,'base_item_runtime_pending_stage3',true,
        'remaining_base_runtime_pending_stage4',true,
        'sheet_profile',jsonb_build_object('spellcasting_enabled',true,'spellcasting_ability','intelligence','spell_list','artificer','spellcasting_focus','artificer_tools','spell_slots_by_level',v_spell_slots_by_level,'prepared_spells_by_level',v_prepared_by_level,'cantrips_by_level',v_cantrips_by_level),
        'spellcasting_contract',jsonb_build_object('spell_slots_by_level',v_spell_slots_by_level,'prepared_spells_by_level',v_prepared_by_level,'cantrips_by_level',v_cantrips_by_level,'runtime_status','active'),
        'next_stage','artificer_core_item_replication_runtime'
      ),updated_at=now()
    where id=v_artificer;
  end if;

  update public.rule_templates set is_active=false,updated_at=now()
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:artificer' and id<>v_artificer and is_active;

  update public.rule_templates set is_active=false,updated_at=now()
  where campaign_id=p_campaign_id and kind='subclass' and is_active
    and (parent_template_id=v_artificer or catalog_key like 'subclass:artificer:%' or slug like 'artificer-%');

  for v_level in 1..20 loop
    v_level_mechanics:='[]'::jsonb; v_level_choices:='[]'::jsonb;
    for v_feature in select value from jsonb_array_elements(v_features) where (value->>'level')::integer=v_level
    loop
      v_level_mechanics:=v_level_mechanics||jsonb_build_array(jsonb_build_object(
        'id','artificer-'||(v_feature->>'key')||'-feature-l'||v_level::text,'type','grant','sourceKey',v_feature->>'key',
        'target','feature','key','class:artificer:'||(v_feature->>'key')||':l'||v_level::text,
        'payload',jsonb_build_object('label',v_feature->>'name','description',v_feature->>'description',
          'mechanic',case
            when v_feature->>'key'='artificer-subclass' then jsonb_build_object('kind','subclass_unlock','unlock_level',3,'runtime_owner','shared_template_hierarchy')
            when v_feature->>'key'='ability-score-improvement' then jsonb_build_object('kind','normal_sheet_feat_path','source_level',v_level)
            when v_feature->>'key'='epic-boon' then jsonb_build_object('kind','normal_sheet_feat_path','source_level',19,'epic_boon',true)
            when v_feature->>'key' in ('tinkers-magic','replicate-magic-item') then jsonb_build_object('runtime_stage','pending_stage3')
            when v_feature->>'key' in ('magic-item-tinker','flash-of-genius','magic-item-adept','spell-storing-item','advanced-artifice','magic-item-master','soul-of-artifice') then jsonb_build_object('runtime_stage','pending_stage4')
            else jsonb_build_object('runtime_stage','stage2') end)
      ));
    end loop;
    if v_level=1 then
      v_level_mechanics:=v_level_mechanics||jsonb_build_array(private.artificer_stage2_spell_mechanic_v1('mending','tinkers-magic'));
      v_level_choices:=jsonb_build_array(v_cantrip_choice,v_spell_choice);
    end if;
    for v_slot in 1..5 loop
      if coalesce((v_spell_slots_by_level->v_level::text->>v_slot::text)::integer,0)>0 then
        v_level_mechanics:=v_level_mechanics||jsonb_build_array(jsonb_build_object(
          'id','artificer-spell-slot-'||v_slot::text||'-l'||v_level::text,'type','resource','sourceKey','spellcasting',
          'grantOperation','REPLACE','priority',v_level,'key','spell_slot_'||v_slot::text,'label','Spell Slot '||v_slot::text,
          'max',(v_spell_slots_by_level->v_level::text->>v_slot::text)::integer,'recharge',jsonb_build_array('long_rest'),'restore','full','initial','full'
        ));
      end if;
    end loop;
    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(v_artificer,v_level,v_level_mechanics,v_level_choices)
    on conflict(template_id,level) do update set mechanics=excluded.mechanics,choices=excluded.choices;
  end loop;
  delete from public.rule_template_levels where template_id=v_artificer and (level<1 or level>20);
  perform private.sync_rule_template_spell_links(v_artificer);
  for r in select distinct character_id from public.character_template_assignments where template_id=v_artificer
  loop
    perform private.sync_artificer_spell_slots_stage2_v1(r.character_id);
    update public.character_sheets set spellcasting_enabled=true,
      spellcasting_ability=case when nullif(spellcasting_ability,'') is null then 'intelligence' else spellcasting_ability end,
      updated_at=now() where character_id=r.character_id;
  end loop;
end;
$function$;
revoke all on function private.ensure_artificer_stage2_foundation_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_artificer_stage2_foundation_v1(uuid) to service_role;

create or replace function private.sync_artificer_spell_slots_stage2_v1_after_assignment()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin perform private.sync_artificer_spell_slots_stage2_v1(coalesce(new.character_id,old.character_id)); return coalesce(new,old); end;
$function$;
revoke all on function private.sync_artificer_spell_slots_stage2_v1_after_assignment() from public,anon,authenticated;
drop trigger if exists character_template_assignments_sync_artificer_spell_slots_stage2_v1 on public.character_template_assignments;
create trigger character_template_assignments_sync_artificer_spell_slots_stage2_v1
after insert or update of template_id,template_level,selected_choices or delete on public.character_template_assignments
for each row execute function private.sync_artificer_spell_slots_stage2_v1_after_assignment();

create or replace function private.ensure_artificer_stage2_foundation_v1_after_campaign()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin perform private.ensure_artificer_stage2_foundation_v1(new.id); return new; end;
$function$;
revoke all on function private.ensure_artificer_stage2_foundation_v1_after_campaign() from public,anon,authenticated;
drop trigger if exists n_campaigns_ensure_artificer_stage2_foundation_v1 on public.campaigns;
create trigger n_campaigns_ensure_artificer_stage2_foundation_v1 after insert on public.campaigns
for each row execute function private.ensure_artificer_stage2_foundation_v1_after_campaign();

do $apply$
declare r record;
begin for r in select id from public.campaigns loop perform private.ensure_artificer_stage2_foundation_v1(r.id); end loop; end;
$apply$;

do $cert$
declare r record; v_count integer; v_bad integer; v_choice jsonb;
begin
  if (select count(*) from public.spell_catalog_classes where class_key='artificer')<>92 then raise exception 'ARTIFICER_STAGE2_GLOBAL_SPELL_LINK_PARITY'; end if;
  for r in
    select rt.id,rt.campaign_id,rt.catalog_revision,rt.rules_meta,l.choices
    from public.rule_templates rt join public.rule_template_levels l on l.template_id=rt.id and l.level=1
    where rt.kind='class' and rt.catalog_key='class:artificer' and rt.is_active
  loop
    if r.catalog_revision<>'efota-2025-artificer-stage2-foundation-spellcasting-v1' then raise exception 'ARTIFICER_STAGE2_BAD_REVISION:%',r.campaign_id; end if;
    if r.rules_meta->>'mechanics_status'<>'IN_PROGRESS_STAGE2_FOUNDATION_SPELLCASTING_READY'
       or coalesce((r.rules_meta->>'runtime_stage')::integer,0)<>2
       or coalesce((r.rules_meta->>'subclass_runtime_included')::boolean,true)
    then raise exception 'ARTIFICER_STAGE2_BAD_STATUS:%',r.campaign_id; end if;
    select count(*) into v_count from public.rule_template_levels where template_id=r.id;
    if v_count<>20 then raise exception 'ARTIFICER_STAGE2_LEVEL_COUNT:%:%',r.campaign_id,v_count; end if;

    select c.value into v_choice from jsonb_array_elements(coalesce(r.choices,'[]'::jsonb)) c(value)
    where c.value->>'key'='artificer_cantrips';
    if v_choice is null or jsonb_array_length(v_choice->'options')<>21
       or (v_choice->'count_by_level'->>'1')::integer<>2 or (v_choice->'count_by_level'->>'10')::integer<>3
       or (v_choice->'count_by_level'->>'14')::integer<>4 or v_choice->>'refresh'<>'long_rest'
       or (v_choice->>'replacement_limit')::integer<>1 or (v_choice->'options') ? 'mending'
    then raise exception 'ARTIFICER_STAGE2_CANTRIP_CHOICE_INVALID:%',r.campaign_id; end if;

    select c.value into v_choice from jsonb_array_elements(coalesce(r.choices,'[]'::jsonb)) c(value)
    where c.value->>'key'='artificer_prepared_spells';
    if v_choice is null or jsonb_array_length(v_choice->'options')<>70
       or (v_choice->'count_by_level'->>'1')::integer<>2 or (v_choice->'count_by_level'->>'9')::integer<>9
       or (v_choice->'count_by_level'->>'17')::integer<>14 or (v_choice->'count_by_level'->>'20')::integer<>15
       or v_choice->>'refresh'<>'long_rest'
    then raise exception 'ARTIFICER_STAGE2_PREPARED_CHOICE_INVALID:%',r.campaign_id; end if;

    if not exists(
      select 1 from public.rule_template_levels l cross join lateral jsonb_array_elements(l.mechanics) m(value)
      where l.template_id=r.id and l.level=1 and m.value->>'type'='spell' and m.value->>'catalogSlug'='mending' and m.value->>'sourceKey'='tinkers-magic'
    ) then raise exception 'ARTIFICER_STAGE2_MENDING_GRANT_MISSING:%',r.campaign_id; end if;

    select count(*) into v_count from public.rule_template_spell_links where template_id=r.id;
    if v_count<>92 then raise exception 'ARTIFICER_STAGE2_TEMPLATE_SPELL_LINK_PARITY:%:%',r.campaign_id,v_count; end if;
    select count(*) into v_bad from public.rule_templates s
    where s.campaign_id=r.campaign_id and s.kind='subclass' and s.is_active
      and (s.parent_template_id=r.id or s.catalog_key like 'subclass:artificer:%' or s.slug like 'artificer-%');
    if v_bad<>0 then raise exception 'ARTIFICER_STAGE2_SUBCLASS_RUNTIME_LEAK:%:%',r.campaign_id,v_bad; end if;
    if nullif(r.rules_meta->'sheet_profile'->'spell_slots_by_level'->'20'->>'5','')::integer<>2 then raise exception 'ARTIFICER_STAGE2_SLOT_PROFILE_INVALID:%',r.campaign_id; end if;
  end loop;
  select count(*) into v_bad from (
    select campaign_id,count(*) n from public.rule_templates where kind='class' and catalog_key='class:artificer' and is_active
    group by campaign_id having count(*)<>1
  ) q;
  if v_bad<>0 then raise exception 'ARTIFICER_STAGE2_DUPLICATE_ACTIVE_CLASS:%',v_bad; end if;
end;
$cert$;

commit;
