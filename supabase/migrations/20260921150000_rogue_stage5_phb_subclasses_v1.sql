-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:rogue
-- CLASS_PACKAGE_TEST: tests/rogueRuntimeStage5PhbSubclasses.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: rogue:stage5=PHB_SUBCLASSES_READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Rogue Stage 5: Thief, Assassin, Arcane Trickster and Soulknife (PHB 2024).
-- All four use the existing Rule Template -> CE -> GENA / inventory / spell
-- runtime. No Rogue-only inventory, spell-slot, or resource engine is added.

begin;

-- ---------------------------------------------------------------------------
-- Generic temporary spell access.
-- Existing character_spells is already the shared spell projection. Temporary
-- rows live there too and are ignored by the runtime after temporary_until.
-- ---------------------------------------------------------------------------

alter table public.character_spells
  add column if not exists temporary_until timestamptz,
  add column if not exists temporary_source_key text,
  add column if not exists temporary_assignment_id uuid
    references public.character_template_assignments(id) on delete cascade,
  add column if not exists temporary_casting_ability text;

do $check$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.character_spells'::regclass
      and conname='character_spells_temporary_casting_ability_check'
  ) then
    alter table public.character_spells
      add constraint character_spells_temporary_casting_ability_check
      check (
        temporary_casting_ability is null
        or temporary_casting_ability in ('intelligence','wisdom','charisma')
      );
  end if;
end;
$check$;

create index if not exists character_spells_temporary_until_idx
  on public.character_spells(temporary_until)
  where temporary_until is not null;

create or replace function private.grant_character_temporary_spell_access_core_v1(
  p_character_id uuid,
  p_assignment_id uuid,
  p_spell_catalog_id uuid,
  p_source_key text,
  p_casting_ability text,
  p_duration interval
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_spell public.spell_catalog%rowtype;
  v_id uuid;
  v_until timestamptz;
begin
  if p_character_id is null or p_assignment_id is null or p_spell_catalog_id is null then
    raise exception 'TEMPORARY_SPELL_ARGUMENT_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_source_key,'')),'') is null then
    raise exception 'TEMPORARY_SPELL_SOURCE_REQUIRED';
  end if;
  if p_casting_ability not in ('intelligence','wisdom','charisma') then
    raise exception 'TEMPORARY_SPELL_CASTING_ABILITY_INVALID:%',p_casting_ability;
  end if;
  if p_duration is null or p_duration<=interval '0 seconds' then
    raise exception 'TEMPORARY_SPELL_DURATION_INVALID';
  end if;

  select * into v_spell
  from public.spell_catalog
  where id=p_spell_catalog_id;
  if v_spell.id is null then raise exception 'TEMPORARY_SPELL_CATALOG_NOT_FOUND'; end if;

  v_until:=now()+p_duration;

  -- One active row per source/assignment. Re-stealing from the same source
  -- replaces its previous temporary spell rather than creating duplicate access.
  delete from public.character_spells
  where character_id=p_character_id
    and temporary_assignment_id=p_assignment_id
    and temporary_source_key=p_source_key;

  insert into public.character_spells(
    character_id,catalog_spell_id,name,spell_level,school,casting_time,
    spell_range,duration,components,concentration,ritual,prepared,
    description,source,sort_order,cast_mode,slot_level,
    temporary_until,temporary_source_key,temporary_assignment_id,
    temporary_casting_ability
  ) values (
    p_character_id,
    v_spell.id,
    coalesce(nullif(v_spell.name_ru,''),nullif(v_spell.name_en,''),v_spell.slug),
    v_spell.spell_level,
    coalesce(v_spell.school,''),
    coalesce(v_spell.casting_time,''),
    coalesce(v_spell.spell_range,''),
    coalesce(v_spell.duration,''),
    coalesce(array_to_string(v_spell.components,', '),''),
    coalesce(v_spell.concentration,false),
    coalesce(v_spell.ritual,false),
    true,
    coalesce(v_spell.rules_text,v_spell.effect_summary,''),
    'temporary:'||p_source_key,
    0,
    case when v_spell.spell_level=0 then 'cantrip' else 'slot' end,
    case when v_spell.spell_level=0 then null else v_spell.spell_level end,
    v_until,p_source_key,p_assignment_id,p_casting_ability
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function private.grant_character_temporary_spell_access_core_v1(
  uuid,uuid,uuid,text,text,interval
) from public,anon,authenticated;
grant execute on function private.grant_character_temporary_spell_access_core_v1(
  uuid,uuid,uuid,text,text,interval
) to service_role;

-- ---------------------------------------------------------------------------
-- Generic Stage 5 helpers.
-- ---------------------------------------------------------------------------

create or replace function private.rogue_stage5_subclass_v1(
  p_campaign_id uuid,
  p_parent_id uuid,
  p_catalog_key text,
  p_slug text,
  p_name text,
  p_description text,
  p_summary text,
  p_rules_meta jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
begin
  select id into v_id
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='subclass'
    and catalog_key=p_catalog_key
    and catalog_revision='xphb-2024-rogue-stage5-phb-subclasses-v1'
  order by created_at desc
  limit 1;

  if v_id is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,
      parent_template_id,unlock_level,catalog_key,catalog_revision,
      source_kind,source_label,is_builtin,mechanical_summary,
      author_description,author_comment,rules_meta,is_active
    ) values (
      p_campaign_id,'subclass',p_slug,p_name,p_description,1,'[]'::jsonb,'[]'::jsonb,
      p_parent_id,3,p_catalog_key,'xphb-2024-rogue-stage5-phb-subclasses-v1',
      'official','Player''s Handbook 2024',true,p_summary,
      '','',
      coalesce(p_rules_meta,'{}'::jsonb)||jsonb_build_object(
        'rules_revision','2024',
        'runtime_stage',5,
        'runtime_revision','xphb-2024-rogue-stage5-phb-subclasses-v1',
        'mechanics_status','IN_PROGRESS_STAGE5_PHB_SUBCLASS_READY',
        'reference_only_until_final_certification',true
      ),
      true
    )
    returning id into v_id;
  else
    update public.rule_templates
    set slug=p_slug,
        name=p_name,
        description=p_description,
        parent_template_id=p_parent_id,
        unlock_level=3,
        source_kind='official',
        source_label='Player''s Handbook 2024',
        is_builtin=true,
        mechanical_summary=p_summary,
        rules_meta=coalesce(rules_meta,'{}'::jsonb)
          ||coalesce(p_rules_meta,'{}'::jsonb)
          ||jsonb_build_object(
            'rules_revision','2024',
            'runtime_stage',5,
            'runtime_revision','xphb-2024-rogue-stage5-phb-subclasses-v1',
            'mechanics_status','IN_PROGRESS_STAGE5_PHB_SUBCLASS_READY',
            'reference_only_until_final_certification',true
          ),
        is_active=true,
        updated_at=now()
    where id=v_id;
  end if;

  update public.rule_templates
  set is_active=false,updated_at=now()
  where campaign_id=p_campaign_id
    and kind='subclass'
    and catalog_key=p_catalog_key
    and id<>v_id
    and is_active;

  delete from public.rule_template_levels where template_id=v_id;
  return v_id;
end;
$function$;

revoke all on function private.rogue_stage5_subclass_v1(
  uuid,uuid,text,text,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function private.rogue_stage5_subclass_v1(
  uuid,uuid,text,text,text,text,text,jsonb
) to service_role;

create or replace function private.rogue_stage5_attack_v1(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_economy text,
  p_die_sides integer,
  p_tags jsonb
)
returns jsonb
language sql
immutable
set search_path=''
as $function$
  select jsonb_build_object(
    'id',p_id,
    'type','action',
    'sourceKey',p_source_key,
    'key',p_key,
    'label',p_label,
    'economy',p_economy,
    'range',jsonb_build_object('kind','ranged','normal',60,'long',120,'unit','ft'),
    'attackAbility','dexterity',
    'proficient',true,
    'damage',jsonb_build_array(jsonb_build_object(
      'key','psychic_blade',
      'damageType','psychic',
      'count',1,
      'sides',p_die_sides,
      'modifierAbility','dexterity'
    )),
    'effects',jsonb_build_array(jsonb_build_object(
      'kind','semantic',
      'key','weapon_properties',
      'payload',jsonb_build_object(
        'finesse',true,'thrown',true,'mastery','vex',
        'opportunityAttackEligible',true,
        'notInventoryItem',true
      )
    )),
    'tags',coalesce(p_tags,'[]'::jsonb),
    'presentation',jsonb_build_object('tone','neutral','icon','◆','priority',90)
  );
$function$;

revoke all on function private.rogue_stage5_attack_v1(
  text,text,text,text,text,integer,jsonb
) from public,anon,authenticated;

create or replace function private.rogue_stage5_psionic_resource_v1(
  p_level integer,
  p_max integer
)
returns jsonb
language sql
immutable
set search_path=''
as $function$
  select jsonb_build_object(
    'id','soulknife-psionic-energy-l'||p_level::text,
    'type','resource',
    'sourceKey','psionic-power',
    'key','soulknife_psionic_energy',
    'label','Псионические кости',
    'max',p_max,
    'recharge',jsonb_build_array('short_rest','long_rest'),
    'recoveryRules',jsonb_build_array(
      jsonb_build_object('trigger','short_rest','restore','amount','amount',1),
      jsonb_build_object('trigger','long_rest','restore','full')
    ),
    'initial','full',
    'grantOperation','REPLACE',
    'priority',500+p_level,
    'presentation',jsonb_build_object(
      'icon','◆','tone','neutral','display','pips','priority',95
    )
  );
$function$;

revoke all on function private.rogue_stage5_psionic_resource_v1(integer,integer)
from public,anon,authenticated;

create or replace function private.rogue_stage5_slot_resource_v1(
  p_level integer,
  p_slot integer,
  p_max integer
)
returns jsonb
language sql
immutable
set search_path=''
as $function$
  select jsonb_build_object(
    'id','arcane-trickster-slot-'||p_slot::text||'-l'||p_level::text,
    'type','resource',
    'sourceKey','arcane-trickster-spellcasting',
    'key','spell_slot_'||p_slot::text,
    'label','Ячейки заклинаний '||p_slot::text||' уровня',
    'max',p_max,
    'recharge',jsonb_build_array('long_rest'),
    'initial','full',
    'grantOperation','REPLACE',
    'priority',700+p_level
  );
$function$;

revoke all on function private.rogue_stage5_slot_resource_v1(integer,integer,integer)
from public,anon,authenticated;

-- Arcane Trickster spell grant uses the canonical Wizard catalog and shared
-- spell_slot_N options. The choice itself is the prepared/known access.
create or replace function private.rogue_stage5_arcane_spell_v1(
  p_slug text,
  p_source_key text
)
returns jsonb
language plpgsql
stable
set search_path=''
as $function$
declare
  v_spell public.spell_catalog%rowtype;
  v_method jsonb;
begin
  select * into v_spell
  from public.spell_catalog
  where slug=p_slug;

  if v_spell.id is null then
    raise exception 'ROGUE_STAGE5_ARCANE_SPELL_NOT_FOUND:%',p_slug;
  end if;

  v_method:=jsonb_build_object(
    'key','arcane-trickster-cast',
    'kind','class_spell',
    'ability','intelligence',
    'saveDc',jsonb_build_object(
      'kind','add',
      'terms',jsonb_build_array(
        jsonb_build_object('kind','literal','value',8),
        jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
        jsonb_build_object('kind','reference','key','abilities.intelligence.modifier')
      )
    ),
    'attackBonus',jsonb_build_object(
      'kind','add',
      'terms',jsonb_build_array(
        jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
        jsonb_build_object('kind','reference','key','abilities.intelligence.modifier')
      )
    ),
    'requiresPrepared',false
  );

  if v_spell.spell_level>0 then
    v_method:=v_method||jsonb_build_object(
      'resourceOptions',private.class_spell_slot_options(v_spell.spell_level)
    );
  end if;

  return jsonb_build_object(
    'id','arcane-trickster-spell-'||p_source_key||'-'||v_spell.slug,
    'key','spell:'||v_spell.slug,
    'type','spell',
    'payload',jsonb_build_object(
      'spell',jsonb_build_object(
        'name',coalesce(nullif(v_spell.name_ru,''),nullif(v_spell.name_en,''),v_spell.slug),
        'level',v_spell.spell_level,
        'school',v_spell.school,
        'ritual',coalesce(v_spell.ritual,false)
      ),
      'methods',jsonb_build_array(v_method),
      'preparation',jsonb_build_object(
        'mode',case when v_spell.spell_level=0 then 'not_required' else 'always_prepared' end
      )
    ),
    'priority',5,
    'sourceKey',p_source_key,
    'variantKey','arcane-trickster:'||p_source_key||':'||v_spell.slug,
    'catalogSlug',v_spell.slug,
    'grantOperation','GRANT'
  );
end;
$function$;

revoke all on function private.rogue_stage5_arcane_spell_v1(text,text)
from public,anon,authenticated;
grant execute on function private.rogue_stage5_arcane_spell_v1(text,text)
to service_role;

create or replace function private.rogue_stage5_arcane_spell_unlock_v1(p_spell_level integer)
returns integer
language sql
immutable
set search_path=''
as $function$
  select case p_spell_level
    when 0 then 3
    when 1 then 3
    when 2 then 7
    when 3 then 13
    when 4 then 19
    else 99
  end
$function$;

revoke all on function private.rogue_stage5_arcane_spell_unlock_v1(integer)
from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Arcane Trickster Spell Thief executor. Scene facts are explicitly confirmed
-- by the caller/GM; only a successful actual steal spends the once/Long-Rest use.
-- ---------------------------------------------------------------------------

create or replace function public.arcane_trickster_steal_spell_v1(
  p_character_id uuid,
  p_spell_catalog_id uuid,
  p_confirm_failed_save boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_character public.characters%rowtype;
  v_assignment_id uuid;
  v_rogue_level integer;
  v_spell public.spell_catalog%rowtype;
  v_max_spell_level integer;
  v_state public.character_resource_states%rowtype;
  v_row_id uuid;
  v_until timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_character
  from public.characters
  where id=p_character_id;
  if v_character.id is null then raise exception 'CHARACTER_NOT_FOUND'; end if;

  if coalesce(v_character.assigned_user_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid()
     and not private.can_manage_character(p_character_id,auth.uid())
  then
    raise exception 'SPELL_THIEF_PERMISSION_DENIED';
  end if;

  if not p_confirm_failed_save then
    raise exception 'SPELL_THIEF_REQUIRES_CONFIRMED_FAILED_SAVE';
  end if;

  select a.id,private.character_template_source_level(a.id)
  into v_assignment_id,v_rogue_level
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id
    and t.catalog_key='subclass:rogue:arcane-trickster'
  order by a.assigned_at,a.id
  limit 1;

  if v_assignment_id is null or coalesce(v_rogue_level,0)<17 then
    raise exception 'SPELL_THIEF_NOT_UNLOCKED';
  end if;

  select * into v_spell from public.spell_catalog where id=p_spell_catalog_id;
  if v_spell.id is null then raise exception 'SPELL_THIEF_SPELL_NOT_FOUND'; end if;
  if v_spell.spell_level<1 then raise exception 'SPELL_THIEF_REQUIRES_LEVELLED_SPELL'; end if;

  v_max_spell_level:=case
    when v_rogue_level>=19 then 4
    when v_rogue_level>=13 then 3
    when v_rogue_level>=7 then 2
    else 1
  end;
  if v_spell.spell_level>v_max_spell_level then
    raise exception 'SPELL_THIEF_LEVEL_TOO_HIGH:%:%',v_spell.spell_level,v_max_spell_level;
  end if;

  select * into v_state
  from public.character_resource_states
  where character_id=p_character_id
    and state_key='arcane_trickster_spell_thief_use'
  for update;

  if v_state.character_id is null or v_state.current<1 then
    raise exception 'SPELL_THIEF_USE_UNAVAILABLE';
  end if;

  v_row_id:=private.grant_character_temporary_spell_access_core_v1(
    p_character_id,
    v_assignment_id,
    p_spell_catalog_id,
    'arcane-trickster-spell-thief',
    'intelligence',
    interval '8 hours'
  );
  v_until:=now()+interval '8 hours';

  update public.character_resource_states
  set current=current-1,updated_by=auth.uid(),updated_at=now()
  where character_id=p_character_id
    and state_key='arcane_trickster_spell_thief_use';

  return jsonb_build_object(
    'character_id',p_character_id,
    'assignment_id',v_assignment_id,
    'character_spell_id',v_row_id,
    'spell_catalog_id',p_spell_catalog_id,
    'temporary_until',v_until,
    'casting_ability','intelligence',
    'resource_spent','arcane_trickster_spell_thief_use'
  );
end;
$function$;

revoke all on function public.arcane_trickster_steal_spell_v1(uuid,uuid,boolean)
from public,anon;
grant execute on function public.arcane_trickster_steal_spell_v1(uuid,uuid,boolean)
to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Main Stage 5 installer.
-- ---------------------------------------------------------------------------

create or replace function private.ensure_rogue_stage5_phb_subclasses_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rogue uuid;
  v_thief uuid;
  v_assassin uuid;
  v_arcane uuid;
  v_soulknife uuid;
  v_cantrip_options jsonb;
  v_cantrip_labels jsonb;
  v_cantrip_mechanics jsonb;
  v_cantrip_unlocks jsonb;
  v_spell_options jsonb;
  v_spell_labels jsonb;
  v_spell_mechanics jsonb;
  v_spell_unlocks jsonb;
  v_choices jsonb;
  r record;
begin
  select id into v_rogue
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:rogue'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_rogue is null then raise exception 'ROGUE_STAGE5_PARENT_MISSING:%',p_campaign_id; end if;

  if not exists(
    select 1 from public.rule_templates
    where id=v_rogue
      and catalog_revision='xphb-2024-rogue-stage4-base-runtime-v1'
      and coalesce((rules_meta->>'base_runtime_certified')::boolean,false)
  ) then
    raise exception 'ROGUE_STAGE5_REQUIRES_CERTIFIED_STAGE4:%',p_campaign_id;
  end if;

  -- Keep all non-PHB Stage 6 packages inactive until their own stage.
  update public.rule_templates
  set is_active=false,updated_at=now()
  where campaign_id=p_campaign_id
    and kind='subclass'
    and (
      catalog_key like 'subclass:rogue:%'
      or slug like 'rogue-%'
    )
    and catalog_key not in (
      'subclass:rogue:thief',
      'subclass:rogue:assassin',
      'subclass:rogue:arcane-trickster',
      'subclass:rogue:soulknife'
    )
    and is_active;

  -- -------------------------------------------------------------------------
  -- THIEF
  -- -------------------------------------------------------------------------
  v_thief:=private.rogue_stage5_subclass_v1(
    p_campaign_id,v_rogue,
    'subclass:rogue:thief','rogue-thief','Вор',
    'Разбойник, превращающий ловкость рук, предметы, скрытность и темп боя в оружие.',
    'PHB 2024: Быстрые руки, Работа на втором этаже, Высшая скрытность, Использование магических устройств, Рефлексы вора.',
    jsonb_build_object('subclass_key','thief','source_book','XPHB')
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_thief,3,
    private.rogue_stage3_feature_v1(
      'thief-fast-hands-feature-l3','fast-hands','subclass:rogue:thief:fast-hands',
      'Быстрые руки',
      'Бонусным действием вы можете выполнить проверку Ловкости рук для вскрытия замка, обезвреживания ловушки или карманной кражи, либо совершить действие Utilize; подходящее свойство магического предмета, требующее Magic action, также может быть использовано этим бонусным действием.',
      jsonb_build_object(
        'kind','action_economy_override',
        'economy','bonus_action',
        'allowed',jsonb_build_array(
          'sleight_of_hand_lock_or_trap',
          'sleight_of_hand_pick_pocket',
          'inventory_utilize',
          'qualifying_magic_item_magic_action'
        ),
        'inventoryExecutor','shared'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_thief,3,
    private.rogue_stage3_action_v1(
      'thief-fast-hands-sleight-action','fast-hands','thief_fast_hands_sleight',
      'Быстрые руки: Ловкость рук','bonus_action',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','skill_or_tool_action',
        'payload',jsonb_build_object(
          'skill','sleight_of_hand',
          'tools','thieves-tools',
          'uses',jsonb_build_array('pick_lock','disarm_trap','pick_pocket'),
          'adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','thief','fast_hands','skill','tool')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_thief,3,
    private.rogue_stage3_action_v1(
      'thief-fast-hands-item-action','fast-hands','thief_fast_hands_item',
      'Быстрые руки: предмет','bonus_action',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','inventory_action_economy_override',
        'payload',jsonb_build_object(
          'executor','shared_inventory',
          'allowedActions',jsonb_build_array('utilize','qualifying_magic_item_magic_action')
        )
      )),
      jsonb_build_array('rogue','thief','fast_hands','inventory')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_thief,3,
    private.rogue_stage3_feature_v1(
      'thief-second-story-work-feature-l3','second-story-work',
      'subclass:rogue:thief:second-story-work','Работа на втором этаже',
      'Вы получаете Скорость лазания, равную вашей Скорости. При определении дистанции прыжка вы можете использовать Ловкость вместо Силы.',
      jsonb_build_object(
        'kind','movement_rule',
        'climbSpeed',jsonb_build_object('equals','combat.speed'),
        'jumpAbilityChoice',jsonb_build_array('strength','dexterity')
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_thief,9,
    private.rogue_stage3_feature_v1(
      'thief-supreme-sneak-feature-l9','supreme-sneak',
      'subclass:rogue:thief:supreme-sneak','Высшая скрытность',
      'К Хитрому удару добавляется Скрытная атака стоимостью 1к6. Если Невидимость от действия Скрыться действовала при атаке, атака не завершает её, если текущий ход заканчивается за укрытием 3/4 или полным укрытием.',
      jsonb_build_object(
        'kind','cunning_strike_extension',
        'option','stealth_attack',
        'diceCost',1,
        'hideInvisiblePersistence',jsonb_build_object(
          'requiresEndTurnCover',jsonb_build_array('three_quarters','total'),
          'adjudication','gm'
        )
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_thief,9,
    private.rogue_stage3_action_v1(
      'thief-supreme-sneak-action','supreme-sneak','thief_supreme_sneak',
      'Хитрый удар: Скрытная атака (−1к6)','triggered',
      jsonb_build_array(
        private.rogue_stage3_bonus_dice_sacrifice_v1(1,'Скрытная атака'),
        jsonb_build_object(
          'kind','semantic','key','hide_invisibility_persistence',
          'payload',jsonb_build_object(
            'requiresSource','hide',
            'endTurnCover',jsonb_build_array('three_quarters','total'),
            'adjudication','gm'
          )
        )
      ),
      jsonb_build_array('rogue','thief','sneak_attack','cunning_strike','gm_scene_requirement')
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_thief,13,
    private.rogue_stage3_feature_v1(
      'thief-use-magic-device-feature-l13','use-magic-device',
      'subclass:rogue:thief:use-magic-device','Использование магических устройств',
      'Ваш предел настроек на магические предметы становится 4. При расходовании зарядов свойства магического предмета бросьте к6: на 6 заряды не тратятся. Вы можете использовать любой Свиток заклинания, применяя Интеллект; для заклинания 2+ уровня требуется проверка Интеллекта (Магия) со СЛ 10 + уровень заклинания.',
      jsonb_build_object(
        'kind','magic_item_use_extension',
        'attunementMaximum',4,
        'chargeConservation',jsonb_build_object('die','d6','successOn',6),
        'spellScroll',jsonb_build_object(
          'anyClass',true,'ability','intelligence',
          'checkFromSpellLevel',2,'checkSkill','arcana',
          'dcFormula','10 + spell_level',
          'failureConsumesScroll',true
        ),
        'inventoryExecutor','shared'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_thief,13,
    jsonb_build_object(
      'id','thief-use-magic-device-scroll-permission',
      'type','grant','sourceKey','use-magic-device',
      'target','permission','key','spell_scroll:any:intelligence',
      'payload',jsonb_build_object(
        'label','Свитки: любой список через Интеллект',
        'executor','shared_inventory_spell_scroll'
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_thief,17,
    private.rogue_stage3_feature_v1(
      'thief-thiefs-reflexes-feature-l17','thiefs-reflexes',
      'subclass:rogue:thief:thiefs-reflexes','Рефлексы вора',
      'В первом раунде каждого боя вы получаете второй ход. Его Инициатива равна результату вашей первой Инициативы минус 10.',
      jsonb_build_object(
        'kind','first_round_extra_turn',
        'initiativeOffset',-10,
        'persistentTurnTracker',false,
        'adjudication','gm'
      )
    )
  );

  -- -------------------------------------------------------------------------
  -- ASSASSIN
  -- -------------------------------------------------------------------------
  v_assassin:=private.rogue_stage5_subclass_v1(
    p_campaign_id,v_rogue,
    'subclass:rogue:assassin','rogue-assassin','Ассасин',
    'Разбойник, специализирующийся на первом мгновении боя, ядах и смертельных атаках.',
    'PHB 2024: Assassinate, Assassin''s Tools, Infiltration Expertise, Envenom Weapons, Death Strike.',
    jsonb_build_object('subclass_key','assassin','source_book','XPHB')
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_assassin,3,
    private.rogue_stage3_feature_v1(
      'assassin-assassinate-feature-l3','assassinate',
      'subclass:rogue:assassin:assassinate','Ликвидация',
      'Вы совершаете броски Инициативы с Преимуществом. В первом раунде боя ваши атаки имеют Преимущество против существ, которые ещё не совершали ход; если в первом раунде вы попали Скрытой атакой, она наносит дополнительный урон того же типа, равный вашему уровню Разбойника.',
      jsonb_build_object(
        'kind','first_round_assassination',
        'initiativeAdvantage',true,
        'attackAdvantageAgainstNotActed',true,
        'sneakAttackExtraDamage',jsonb_build_object(
          'amountValueKey','assassin_rogue_level',
          'damageType','same_as_attack'
        ),
        'sceneEligibility','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_assassin,3,
    private.rogue_stage2_value_v1(
      'assassin-rogue-level-value-l3','assassinate','assassin_rogue_level',
      'Уровень Разбойника для Ликвидации',3,3
    )
  );
  -- Replace the scalar at every Rogue level 4-20 so subclass source level, not
  -- total character level, remains authoritative even in multiclass characters.
  for r in select generate_series(4,20) as level loop
    perform private.rogue_stage3_upsert_level_mechanic_v1(v_assassin,r.level,
      private.rogue_stage2_value_v1(
        'assassin-rogue-level-value-l'||r.level::text,
        'assassinate','assassin_rogue_level',
        'Уровень Разбойника для Ликвидации',r.level,r.level
      )
    );
  end loop;

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_assassin,3,
    private.rogue_stage3_feature_v1(
      'assassin-tools-feature-l3','assassins-tools',
      'subclass:rogue:assassin:assassins-tools','Инструменты ассасина',
      'Вы получаете Набор для грима и Набор отравителя и владение ими. Повторное владение не создаёт заменяющего выбора.',
      jsonb_build_object(
        'kind','tool_proficiency_grant',
        'tools',jsonb_build_array('disguise-kit','poisoners-kit'),
        'duplicateReplacement',false
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_assassin,3,
    jsonb_build_object(
      'id','assassin-disguise-kit-proficiency','type','grant',
      'sourceKey','assassins-tools','target','proficiency','key','tool:disguise-kit',
      'payload',jsonb_build_object('rank',1,'label','Набор для грима')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_assassin,3,
    jsonb_build_object(
      'id','assassin-poisoners-kit-proficiency','type','grant',
      'sourceKey','assassins-tools','target','proficiency','key','tool:poisoners-kit',
      'payload',jsonb_build_object('rank',1,'label','Набор отравителя')
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_assassin,9,
    private.rogue_stage3_feature_v1(
      'assassin-infiltration-expertise-feature-l9','infiltration-expertise',
      'subclass:rogue:assassin:infiltration-expertise','Эксперт по внедрению',
      'После часа изучения речи или почерка вы можете убедительно имитировать их; оценку убедительности решает мастер. Кроме того, Точный прицел больше не делает вашу Скорость равной 0 после использования, но по-прежнему требует, чтобы до применения вы не перемещались.',
      jsonb_build_object(
        'kind','infiltration_and_steady_aim_override',
        'masterfulMimicry',jsonb_build_object('studyTime','1_hour','adjudication','gm'),
        'steadyAim',jsonb_build_object(
          'removePostUseSpeedZero',true,
          'retainNoMovementPrecondition',true
        )
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_assassin,13,
    private.rogue_stage3_feature_v1(
      'assassin-envenom-weapons-feature-l13','envenom-weapons',
      'subclass:rogue:assassin:envenom-weapons','Отравленное оружие',
      'Когда цель проваливает спасбросок против Отравления от вашего Хитрого удара, она получает дополнительно 2к6 урона ядом. Этот урон игнорирует сопротивление яду, но не иммунитет.',
      jsonb_build_object(
        'kind','cunning_strike_rider_extension',
        'requiresRider','poison',
        'requiresFailedSave',true,
        'damage',jsonb_build_object('count',2,'sides',6,'type','poison'),
        'ignoreResistance',true,
        'ignoreImmunity',false,
        'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_assassin,13,
    private.rogue_stage3_action_v1(
      'assassin-envenom-weapons-damage','envenom-weapons','assassin_envenom_weapons_damage',
      'Отравленное оружие: +2к6 яда','triggered',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','requires_failed_cunning_strike_save',
        'payload',jsonb_build_object('rider','poison','adjudication','gm')
      )),
      jsonb_build_array('rogue','assassin','poison','gm_scene_requirement'),
      jsonb_build_array(jsonb_build_object(
        'key','envenom','damageType','poison','count',2,'sides',6
      ))
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_assassin,17,
    private.rogue_stage3_feature_v1(
      'assassin-death-strike-feature-l17','death-strike',
      'subclass:rogue:assassin:death-strike','Смертельный удар',
      'Когда в первом раунде боя вы попадаете по существу Скрытой атакой, цель совершает спасбросок Телосложения против СЛ Хитрого удара. При провале весь урон этой атаки удваивается.',
      jsonb_build_object(
        'kind','attack_damage_multiplier_on_failed_save',
        'trigger','first_round_sneak_attack_hit',
        'saveAbility','constitution',
        'saveDcValueKey','rogue_cunning_strike_save_dc',
        'multiplier',2,
        'adjudication','gm'
      )
    )
  );

  -- -------------------------------------------------------------------------
  -- ARCANE TRICKSTER
  -- -------------------------------------------------------------------------
  v_arcane:=private.rogue_stage5_subclass_v1(
    p_campaign_id,v_rogue,
    'subclass:rogue:arcane-trickster','rogue-arcane-trickster','Мистический ловкач',
    'Разбойник, соединяющий воровское ремесло с магией Волшебника.',
    'PHB 2024: Intelligence Wizard spellcasting, Mage Hand Legerdemain, Magical Ambush, Versatile Trickster, Spell Thief.',
    jsonb_build_object(
      'subclass_key','arcane-trickster',
      'source_book','XPHB',
      'spellcasting_ability','intelligence',
      'spell_list','wizard',
      'spell_progression','one_third_caster'
    )
  );

  select
    coalesce(jsonb_agg(s.slug order by s.sort_order,coalesce(s.name_ru,s.name_en),s.slug),'[]'::jsonb),
    coalesce(jsonb_object_agg(s.slug,coalesce(nullif(s.name_ru,''),nullif(s.name_en,''),s.slug)),'{}'::jsonb),
    coalesce(jsonb_object_agg(
      s.slug,
      jsonb_build_array(private.rogue_stage5_arcane_spell_v1(s.slug,'arcane-trickster-cantrip'))
    ),'{}'::jsonb),
    coalesce(jsonb_object_agg(s.slug,3),'{}'::jsonb)
  into v_cantrip_options,v_cantrip_labels,v_cantrip_mechanics,v_cantrip_unlocks
  from public.spell_catalog s
  where s.spell_level=0
    and s.slug<>'mage-hand'
    and exists(
      select 1 from public.spell_catalog_classes c
      where c.spell_id=s.id and c.class_key='wizard'
    );

  select
    coalesce(jsonb_agg(s.slug order by s.spell_level,s.sort_order,coalesce(s.name_ru,s.name_en),s.slug),'[]'::jsonb),
    coalesce(jsonb_object_agg(s.slug,coalesce(nullif(s.name_ru,''),nullif(s.name_en,''),s.slug)),'{}'::jsonb),
    coalesce(jsonb_object_agg(
      s.slug,
      jsonb_build_array(private.rogue_stage5_arcane_spell_v1(s.slug,'arcane-trickster-prepared'))
    ),'{}'::jsonb),
    coalesce(jsonb_object_agg(
      s.slug,
      private.rogue_stage5_arcane_spell_unlock_v1(s.spell_level)
    ),'{}'::jsonb)
  into v_spell_options,v_spell_labels,v_spell_mechanics,v_spell_unlocks
  from public.spell_catalog s
  where s.spell_level between 1 and 4
    and exists(
      select 1 from public.spell_catalog_classes c
      where c.spell_id=s.id and c.class_key='wizard'
    );

  if jsonb_array_length(v_cantrip_options)=0 or jsonb_array_length(v_spell_options)=0 then
    raise exception 'ROGUE_STAGE5_ARCANE_CATALOG_EMPTY:%',p_campaign_id;
  end if;

  v_choices:=jsonb_build_array(
    jsonb_build_object(
      'key','arcane_trickster_cantrips',
      'label','Заговоры Мистического ловкача',
      'target','spell',
      'count',2,
      'count_by_level',jsonb_build_object('3',2,'10',3),
      'selection_mode','player_once',
      'replacement_policy','on_level_change',
      'replacement_limit',1,
      'required',true,
      'options',v_cantrip_options,
      'option_labels',v_cantrip_labels,
      'option_unlock_level',v_cantrip_unlocks,
      'option_mechanics',v_cantrip_mechanics
    ),
    jsonb_build_object(
      'key','arcane_trickster_prepared_spells',
      'label','Подготовленные заклинания Мистического ловкача',
      'target','spell',
      'count',3,
      'count_by_level',jsonb_build_object(
        '3',3,'4',4,'5',4,'6',4,'7',5,'8',6,'9',6,'10',7,
        '11',8,'12',8,'13',9,'14',10,'15',10,'16',11,
        '17',11,'18',11,'19',12,'20',13
      ),
      'selection_mode','player_once',
      'replacement_policy','on_level_change',
      'replacement_limit',1,
      'required',true,
      'options',v_spell_options,
      'option_labels',v_spell_labels,
      'option_unlock_level',v_spell_unlocks,
      'option_mechanics',v_spell_mechanics
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,3,
    private.rogue_stage3_feature_v1(
      'arcane-trickster-spellcasting-feature-l3','spellcasting',
      'subclass:rogue:arcane-trickster:spellcasting','Заклинания',
      'Вы используете Интеллект для заклинаний Мистического ловкача. На 3 уровне вы знаете Волшебную руку и выбираете ещё два заговора Волшебника и три заклинания 1 уровня; дальнейшее число заговоров, подготовленных заклинаний и ячеек растёт по таблице подкласса. Ограничения по школам магии нет.',
      jsonb_build_object(
        'kind','class_spellcasting',
        'ability','intelligence',
        'spellList','wizard',
        'progression','one_third_caster',
        'schoolRestriction',false,
        'focus','arcane_focus',
        'cantripChoiceKey','arcane_trickster_cantrips',
        'preparedChoiceKey','arcane_trickster_prepared_spells'
      )
    )
  );

  insert into public.rule_template_levels(template_id,level,mechanics,choices)
  values(v_arcane,3,'[]'::jsonb,v_choices)
  on conflict(template_id,level) do update
  set choices=excluded.choices;

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,3,
    private.rogue_stage5_arcane_spell_v1('mage-hand','mage-hand-legerdemain')
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,3,
    jsonb_build_object(
      'id','arcane-trickster-focus-permission-l3',
      'type','grant','sourceKey','spellcasting',
      'target','permission','key','spellcasting_focus:arcane_focus',
      'payload',jsonb_build_object('label','Фокусировка: магическая фокусировка')
    )
  );

  -- Shared CE spell slots for the exact one-third-caster table.
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,3,private.rogue_stage5_slot_resource_v1(3,1,2));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,4,private.rogue_stage5_slot_resource_v1(4,1,3));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,7,private.rogue_stage5_slot_resource_v1(7,1,4));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,7,private.rogue_stage5_slot_resource_v1(7,2,2));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,10,private.rogue_stage5_slot_resource_v1(10,2,3));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,13,private.rogue_stage5_slot_resource_v1(13,3,2));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,16,private.rogue_stage5_slot_resource_v1(16,3,3));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,19,private.rogue_stage5_slot_resource_v1(19,4,1));

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,3,
    private.rogue_stage3_feature_v1(
      'arcane-trickster-mage-hand-feature-l3','mage-hand-legerdemain',
      'subclass:rogue:arcane-trickster:mage-hand-legerdemain','Ловкость Волшебной руки',
      'Вы можете сделать созданную Волшебной рукой кисть невидимой и управлять ею бонусным действием. Ею можно выполнять точные воровские манипуляции, включая проверки Ловкости рук, в пределах правил заклинания.',
      jsonb_build_object(
        'kind','spell_rider',
        'spellKey','spell:mage-hand',
        'controlEconomy','bonus_action',
        'mayBeInvisible',true,
        'skill','sleight_of_hand',
        'sceneEligibility','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,3,
    private.rogue_stage3_action_v1(
      'arcane-trickster-mage-hand-control-action','mage-hand-legerdemain',
      'arcane_trickster_mage_hand_control','Волшебная рука: управление','bonus_action',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','spell_rider_control',
        'payload',jsonb_build_object(
          'spellKey','spell:mage-hand','mayBeInvisible',true,
          'skill','sleight_of_hand','adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','arcane_trickster','mage_hand','spell_rider')
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,9,
    private.rogue_stage3_feature_v1(
      'arcane-trickster-magical-ambush-feature-l9','magical-ambush',
      'subclass:rogue:arcane-trickster:magical-ambush','Магическая засада',
      'Если вы Невидимы для существа, когда накладываете заклинание на него, в этот ход существо совершает спасброски против этого заклинания с Помехой.',
      jsonb_build_object(
        'kind','spell_save_disadvantage_rule',
        'requiresInvisibleToTargetAtCast',true,
        'duration','current_turn',
        'adjudication','gm'
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,13,
    private.rogue_stage3_feature_v1(
      'arcane-trickster-versatile-trickster-feature-l13','versatile-trickster',
      'subclass:rogue:arcane-trickster:versatile-trickster','Универсальный ловкач',
      'Когда вы применяете Подножку из Хитрого удара, можете также выбрать второе существо в пределах 5 футов от вашей Волшебной руки. Положение руки и существ остаётся сценическим фактом.',
      jsonb_build_object(
        'kind','cunning_strike_target_extension',
        'rider','trip',
        'additionalTargets',1,
        'anchor','spell:mage-hand',
        'radiusFeet',5,
        'adjudication','gm'
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,17,
    private.rogue_stage3_feature_v1(
      'arcane-trickster-spell-thief-feature-l17','spell-thief',
      'subclass:rogue:arcane-trickster:spell-thief','Вор заклинаний',
      'Когда существо накладывает на вас заклинание 1+ уровня, Реакцией заставьте его совершить спасбросок Интеллекта против вашей СЛ заклинаний. При провале эффект на вас отменяется. Если уровень заклинания не выше максимального уровня вашей ячейки, вы крадёте его на 8 часов, можете накладывать своими ячейками, а исходный заклинатель не может его накладывать. Использование способности блокируется до долгого отдыха только после реальной кражи.',
      jsonb_build_object(
        'kind','temporary_spell_theft',
        'economy','reaction',
        'saveAbility','intelligence',
        'saveDc','arcane_trickster_spell_save_dc',
        'minimumSpellLevel',1,
        'maximumSpellLevel','highest_arcane_trickster_slot',
        'temporaryDuration','8_hours',
        'temporaryAccessStore','character_spells',
        'castingAbility','intelligence',
        'spendsUseOnlyOnActualSteal',true,
        'sourceCasterLock','gm_scene_rule',
        'executorRpc','arcane_trickster_steal_spell_v1'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,17,
    jsonb_build_object(
      'id','arcane-trickster-spell-thief-resource-l17',
      'type','resource','sourceKey','spell-thief',
      'key','arcane_trickster_spell_thief_use',
      'label','Вор заклинаний',
      'max',1,'recharge',jsonb_build_array('long_rest'),
      'initial','full','grantOperation','REPLACE','priority',817,
      'presentation',jsonb_build_object('icon','◆','tone','neutral','display','pips','priority',95)
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_arcane,17,
    private.rogue_stage3_action_v1(
      'arcane-trickster-spell-thief-reaction','spell-thief',
      'arcane_trickster_spell_thief_reaction','Вор заклинаний: реакция','reaction',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','temporary_spell_theft',
        'payload',jsonb_build_object(
          'executorRpc','arcane_trickster_steal_spell_v1',
          'resourceSpentOnlyByExecutorOnSuccessfulSteal',true,
          'adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','arcane_trickster','spell_thief','gm_scene_requirement')
    )
  );

  perform private.sync_rule_template_spell_links(v_arcane);

  -- -------------------------------------------------------------------------
  -- SOULKNIFE
  -- -------------------------------------------------------------------------
  v_soulknife:=private.rogue_stage5_subclass_v1(
    p_campaign_id,v_rogue,
    'subclass:rogue:soulknife','rogue-soulknife','Клинок души',
    'Разбойник, использующий псионические кости и клинки разума.',
    'PHB 2024: Psionic Power, Psychic Blades, Soul Blades, Psychic Veil, Rend Mind.',
    jsonb_build_object('subclass_key','soulknife','source_book','XPHB')
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,3,
    private.rogue_stage3_feature_v1(
      'soulknife-psionic-power-feature-l3','psionic-power',
      'subclass:rogue:soulknife:psionic-power','Псионическая сила',
      'Вы получаете запас Псионических костей. Их количество и размер растут с уровнем Разбойника; после короткого отдыха восстанавливается одна потраченная кость, после долгого отдыха — все. Psi-Bolstered Knack тратит кость только если она превращает провал во успех; Psychic Whispers первый раз после долгого отдыха бесплатен, затем тратит кость.',
      jsonb_build_object(
        'kind','psionic_energy_dice',
        'resourceKey','soulknife_psionic_energy',
        'dieSidesValueKey','soulknife_psionic_die_sides',
        'conditionalSpend',jsonb_build_array('psi_bolstered_knack','homing_strikes'),
        'shortRestRecovery',1,
        'longRestRecovery','full'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,3,
    private.rogue_stage5_psionic_resource_v1(3,4)
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,3,
    private.rogue_stage2_value_v1(
      'soulknife-psionic-die-sides-l3','psionic-power','soulknife_psionic_die_sides',
      'Грани Псионической кости',6,503
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,5,
    private.rogue_stage5_psionic_resource_v1(5,6)
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,5,
    private.rogue_stage2_value_v1(
      'soulknife-psionic-die-sides-l5','psionic-power','soulknife_psionic_die_sides',
      'Грани Псионической кости',8,505
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,9,
    private.rogue_stage5_psionic_resource_v1(9,8)
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,11,
    private.rogue_stage2_value_v1(
      'soulknife-psionic-die-sides-l11','psionic-power','soulknife_psionic_die_sides',
      'Грани Псионической кости',10,511
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,13,
    private.rogue_stage5_psionic_resource_v1(13,10)
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,17,
    private.rogue_stage5_psionic_resource_v1(17,12)
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,17,
    private.rogue_stage2_value_v1(
      'soulknife-psionic-die-sides-l17','psionic-power','soulknife_psionic_die_sides',
      'Грани Псионической кости',12,517
    )
  );

  -- First Psychic Whispers activation after each Long Rest is free.
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,3,
    jsonb_build_object(
      'id','soulknife-psychic-whispers-free-resource-l3',
      'type','resource','sourceKey','psionic-power',
      'key','soulknife_psychic_whispers_free',
      'label','Психические шёпоты: бесплатное использование',
      'max',1,'recharge',jsonb_build_array('long_rest'),
      'initial','full','grantOperation','REPLACE','priority',503
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,3,
    private.rogue_stage3_action_v1(
      'soulknife-knack-roll-action','psionic-power','soulknife_psi_bolstered_knack_roll',
      'Псионическая сноровка: бросить кость','triggered',
      jsonb_build_array(
        jsonb_build_object(
          'kind','semantic','key','semantic_die_roll',
          'payload',jsonb_build_object(
            'count',1,'sidesValueKey','soulknife_psionic_die_sides',
            'label','Псионическая сноровка'
          )
        ),
        jsonb_build_object(
          'kind','semantic','key','conditional_resource_spend',
          'payload',jsonb_build_object(
            'resourceKey','soulknife_psionic_energy',
            'amount',1,
            'condition','spend_only_if_bonus_changes_failure_to_success',
            'commitActionKey','soulknife_psi_bolstered_knack_commit',
            'adjudication','gm'
          )
        )
      ),
      jsonb_build_array('rogue','soulknife','psionic','skill','tool','conditional_spend')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,3,
    jsonb_build_object(
      'id','soulknife-knack-commit-action',
      'type','action','sourceKey','psionic-power',
      'key','soulknife_psi_bolstered_knack_commit',
      'label','Псионическая сноровка: подтвердить расход',
      'economy','triggered','range',jsonb_build_object('kind','self'),
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','soulknife_psionic_energy','amount',1
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','conditional_spend_confirmation',
        'payload',jsonb_build_object(
          'condition','rolled_die_changed_failure_to_success','adjudication','gm'
        )
      )),
      'tags',jsonb_build_array('rogue','soulknife','conditional_spend','table_adjudicated')
    )
  );

  -- Psychic Whispers: free first use, then paid uses. Both roll the duration die.
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,3,
    jsonb_build_object(
      'id','soulknife-whispers-free-action',
      'type','action','sourceKey','psionic-power',
      'key','soulknife_psychic_whispers_free',
      'label','Психические шёпоты: бесплатное использование',
      'economy','magic_action','range',jsonb_build_object('kind','self'),
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','soulknife_psychic_whispers_free','amount',1
      )),
      'requirements',jsonb_build_array(jsonb_build_object(
        'kind','resource','key','soulknife_psychic_whispers_free','minimum',1
      )),
      'effects',jsonb_build_array(
        jsonb_build_object(
          'kind','semantic','key','semantic_die_roll',
          'payload',jsonb_build_object(
            'count',1,'sidesValueKey','soulknife_psionic_die_sides',
            'label','Длительность Психических шёпотов'
          )
        ),
        jsonb_build_object(
          'kind','semantic','key','telepathy_link',
          'payload',jsonb_build_object(
            'targets','up_to_proficiency_bonus_visible_creatures',
            'durationHours','rolled_die',
            'rangeMiles',1,
            'creatureMaySever',true,
            'languageRule','general_2024_telepathy'
          )
        )
      ),
      'tags',jsonb_build_array('rogue','soulknife','psionic','telepathy')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,3,
    jsonb_build_object(
      'id','soulknife-whispers-paid-action',
      'type','action','sourceKey','psionic-power',
      'key','soulknife_psychic_whispers_paid',
      'label','Психические шёпоты: псионическая кость',
      'economy','magic_action','range',jsonb_build_object('kind','self'),
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','soulknife_psionic_energy','amount',1
      )),
      'requirements',jsonb_build_array(jsonb_build_object(
        'kind','resource','key','soulknife_psychic_whispers_free','minimum',0,'maximum',0
      )),
      'effects',jsonb_build_array(
        jsonb_build_object(
          'kind','semantic','key','semantic_die_roll',
          'payload',jsonb_build_object(
            'count',1,'sidesValueKey','soulknife_psionic_die_sides',
            'label','Длительность Психических шёпотов'
          )
        ),
        jsonb_build_object(
          'kind','semantic','key','telepathy_link',
          'payload',jsonb_build_object(
            'targets','up_to_proficiency_bonus_visible_creatures',
            'durationHours','rolled_die','rangeMiles',1,
            'creatureMaySever',true,'languageRule','general_2024_telepathy'
          )
        )
      ),
      'tags',jsonb_build_array('rogue','soulknife','psionic','telepathy')
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,3,
    private.rogue_stage3_feature_v1(
      'soulknife-psychic-blades-feature-l3','psychic-blades',
      'subclass:rogue:soulknife:psychic-blades','Психические клинки',
      'Когда вы совершаете действие Атака или провоцированную атаку, можете создать психический клинок: 1к6 психического урона, Finesse, Thrown 60/120 и Vex. После атаки первым клинком можно бонусным действием атаковать вторым клинком, который наносит 1к4.',
      jsonb_build_object(
        'kind','native_ce_weapon_attacks',
        'inventoryItem',false,
        'primaryActionKey','soulknife_psychic_blade',
        'secondaryActionKey','soulknife_psychic_blade_bonus',
        'properties',jsonb_build_array('finesse','thrown','vex')
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,3,
    private.rogue_stage5_attack_v1(
      'soulknife-psychic-blade-primary','psychic-blades',
      'soulknife_psychic_blade','Психический клинок','action',6,
      jsonb_build_array('rogue','soulknife','attack','psychic_blade','finesse','thrown','vex')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,3,
    private.rogue_stage5_attack_v1(
      'soulknife-psychic-blade-secondary','psychic-blades',
      'soulknife_psychic_blade_bonus','Психический клинок: второй','bonus_action',4,
      jsonb_build_array('rogue','soulknife','attack','psychic_blade','secondary','finesse','thrown','vex')
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,9,
    private.rogue_stage3_feature_v1(
      'soulknife-soul-blades-feature-l9','soul-blades',
      'subclass:rogue:soulknife:soul-blades','Клинки души',
      'После промаха Психическим клинком вы можете бросить Псионическую кость и добавить результат к атаке; кость тратится только если атака становится попаданием. Психическая телепортация тратит одну Псионическую кость и телепортирует на результат × 10 футов.',
      jsonb_build_object(
        'kind','soul_blades',
        'homingStrikes',jsonb_build_object(
          'conditionalSpend',true,
          'condition','miss_to_hit'
        ),
        'psychicTeleportation',jsonb_build_object(
          'resourceKey','soulknife_psionic_energy',
          'cost',1,'distanceFeet','rolled_die * 10'
        )
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,9,
    private.rogue_stage3_action_v1(
      'soulknife-homing-roll-action','soul-blades','soulknife_homing_strikes_roll',
      'Наводящий удар: бросить кость','triggered',
      jsonb_build_array(
        jsonb_build_object(
          'kind','semantic','key','semantic_die_roll',
          'payload',jsonb_build_object(
            'count',1,'sidesValueKey','soulknife_psionic_die_sides',
            'label','Наводящий удар'
          )
        ),
        jsonb_build_object(
          'kind','semantic','key','conditional_resource_spend',
          'payload',jsonb_build_object(
            'resourceKey','soulknife_psionic_energy','amount',1,
            'condition','spend_only_if_bonus_changes_miss_to_hit',
            'commitActionKey','soulknife_homing_strikes_commit',
            'adjudication','gm'
          )
        )
      ),
      jsonb_build_array('rogue','soulknife','psionic','conditional_spend')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,9,
    jsonb_build_object(
      'id','soulknife-homing-commit-action',
      'type','action','sourceKey','soul-blades',
      'key','soulknife_homing_strikes_commit',
      'label','Наводящий удар: подтвердить расход',
      'economy','triggered','range',jsonb_build_object('kind','self'),
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','soulknife_psionic_energy','amount',1
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','conditional_spend_confirmation',
        'payload',jsonb_build_object(
          'condition','rolled_die_changed_miss_to_hit','adjudication','gm'
        )
      )),
      'tags',jsonb_build_array('rogue','soulknife','conditional_spend','table_adjudicated')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,9,
    jsonb_build_object(
      'id','soulknife-psychic-teleport-action',
      'type','action','sourceKey','soul-blades',
      'key','soulknife_psychic_teleportation',
      'label','Психическая телепортация',
      'economy','bonus_action','range',jsonb_build_object('kind','self'),
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','soulknife_psionic_energy','amount',1
      )),
      'effects',jsonb_build_array(
        jsonb_build_object(
          'kind','semantic','key','semantic_die_roll',
          'payload',jsonb_build_object(
            'count',1,'sidesValueKey','soulknife_psionic_die_sides',
            'label','Психическая телепортация'
          )
        ),
        jsonb_build_object(
          'kind','semantic','key','teleport_distance',
          'payload',jsonb_build_object(
            'formula','rolled_die * 10','unit','ft',
            'destination','visible_unoccupied_space','adjudication','gm'
          )
        )
      ),
      'tags',jsonb_build_array('rogue','soulknife','psionic','teleport')
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,13,
    private.rogue_stage3_feature_v1(
      'soulknife-psychic-veil-feature-l13','psychic-veil',
      'subclass:rogue:soulknife:psychic-veil','Психическая завеса',
      'Магическим действием вы становитесь Невидимы на 1 час или до прекращения эффекта по правилам способности. Одно использование бесплатно после долгого отдыха; после него можно применять способность, тратя по одной Псионической кости.',
      jsonb_build_object(
        'kind','invisibility_feature',
        'duration','1_hour',
        'freeUsesResourceKey','soulknife_psychic_veil_free',
        'alternateCost',jsonb_build_object(
          'resourceKey','soulknife_psionic_energy','amount',1
        )
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,13,
    jsonb_build_object(
      'id','soulknife-psychic-veil-free-resource-l13',
      'type','resource','sourceKey','psychic-veil',
      'key','soulknife_psychic_veil_free','label','Психическая завеса: бесплатное использование',
      'max',1,'recharge',jsonb_build_array('long_rest'),
      'initial','full','grantOperation','REPLACE','priority',613
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,13,
    jsonb_build_object(
      'id','soulknife-psychic-veil-free-action','type','action',
      'sourceKey','psychic-veil','key','soulknife_psychic_veil_free',
      'label','Психическая завеса','economy','magic_action',
      'range',jsonb_build_object('kind','self'),
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','soulknife_psychic_veil_free','amount',1
      )),
      'requirements',jsonb_build_array(jsonb_build_object(
        'kind','resource','key','soulknife_psychic_veil_free','minimum',1
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','condition_grant',
        'payload',jsonb_build_object('condition','invisible','duration','1_hour','adjudication','gm')
      )),
      'tags',jsonb_build_array('rogue','soulknife','psionic','invisible')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,13,
    jsonb_build_object(
      'id','soulknife-psychic-veil-paid-action','type','action',
      'sourceKey','psychic-veil','key','soulknife_psychic_veil_paid',
      'label','Психическая завеса: псионическая кость','economy','magic_action',
      'range',jsonb_build_object('kind','self'),
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','soulknife_psionic_energy','amount',1
      )),
      'requirements',jsonb_build_array(jsonb_build_object(
        'kind','resource','key','soulknife_psychic_veil_free','minimum',0,'maximum',0
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','condition_grant',
        'payload',jsonb_build_object('condition','invisible','duration','1_hour','adjudication','gm')
      )),
      'tags',jsonb_build_array('rogue','soulknife','psionic','invisible')
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,17,
    private.rogue_stage3_feature_v1(
      'soulknife-rend-mind-feature-l17','rend-mind',
      'subclass:rogue:soulknife:rend-mind','Разрыв разума',
      'Когда вы наносите Скрытую атаку Психическим клинком, можете заставить цель совершить спасбросок Мудрости против СЛ Хитрого удара. При провале цель Ошеломлена до 1 минуты и повторяет спасбросок в конце каждого своего хода. Одно использование бесплатно после долгого отдыха; затем каждое применение стоит 3 Псионические кости.',
      jsonb_build_object(
        'kind','sneak_attack_rider',
        'requiresAttackKey','soulknife_psychic_blade',
        'saveAbility','wisdom',
        'saveDcValueKey','rogue_cunning_strike_save_dc',
        'condition','stunned',
        'duration','1_minute',
        'repeatSave','end_of_each_target_turn',
        'freeUsesResourceKey','soulknife_rend_mind_free',
        'alternateCost',jsonb_build_object(
          'resourceKey','soulknife_psionic_energy','amount',3
        ),
        'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,17,
    jsonb_build_object(
      'id','soulknife-rend-mind-free-resource-l17',
      'type','resource','sourceKey','rend-mind',
      'key','soulknife_rend_mind_free','label','Разрыв разума: бесплатное использование',
      'max',1,'recharge',jsonb_build_array('long_rest'),
      'initial','full','grantOperation','REPLACE','priority',617
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,17,
    jsonb_build_object(
      'id','soulknife-rend-mind-free-action','type','action',
      'sourceKey','rend-mind','key','soulknife_rend_mind_free',
      'label','Разрыв разума','economy','triggered',
      'range',jsonb_build_object('kind','self'),
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','soulknife_rend_mind_free','amount',1
      )),
      'requirements',jsonb_build_array(jsonb_build_object(
        'kind','resource','key','soulknife_rend_mind_free','minimum',1
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','saving_throw_condition',
        'payload',jsonb_build_object(
          'trigger','sneak_attack_with_psychic_blade',
          'saveAbility','wisdom','saveDcValueKey','rogue_cunning_strike_save_dc',
          'condition','stunned','duration','1_minute',
          'repeatSave','end_of_each_target_turn','adjudication','gm'
        )
      )),
      'tags',jsonb_build_array('rogue','soulknife','psionic','stunned','gm_scene_requirement')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_soulknife,17,
    jsonb_build_object(
      'id','soulknife-rend-mind-paid-action','type','action',
      'sourceKey','rend-mind','key','soulknife_rend_mind_paid',
      'label','Разрыв разума: 3 псионические кости','economy','triggered',
      'range',jsonb_build_object('kind','self'),
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','soulknife_psionic_energy','amount',3
      )),
      'requirements',jsonb_build_array(jsonb_build_object(
        'kind','resource','key','soulknife_rend_mind_free','minimum',0,'maximum',0
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','saving_throw_condition',
        'payload',jsonb_build_object(
          'trigger','sneak_attack_with_psychic_blade',
          'saveAbility','wisdom','saveDcValueKey','rogue_cunning_strike_save_dc',
          'condition','stunned','duration','1_minute',
          'repeatSave','end_of_each_target_turn','adjudication','gm'
        )
      )),
      'tags',jsonb_build_array('rogue','soulknife','psionic','stunned','gm_scene_requirement')
    )
  );

  -- Parent remains non-READY: four of nine subclass packages now exist.
  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','IN_PROGRESS_STAGE5_PHB_SUBCLASSES_READY',
        'runtime_stage',5,
        'stage5_phb_subclasses_runtime',true,
        'stage5_phb_subclass_count',4,
        'stage5_phb_subclass_roster',jsonb_build_array(
          'thief','assassin','arcane-trickster','soulknife'
        ),
        'temporary_spell_access_runtime',true,
        'subclass_runtime_included',false,
        'next_stage','rogue_legacy_supplement_subclasses'
      ),
      updated_at=now()
  where id=v_rogue;

  -- Existing assigned characters immediately receive persistent resource rows
  -- from the normal runtime synchronizer on next resolution. Temporary expired
  -- Spell Thief rows are safe to delete eagerly.
  delete from public.character_spells
  where temporary_until is not null and temporary_until<=now();
end;
$function$;

revoke all on function private.ensure_rogue_stage5_phb_subclasses_v1(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_rogue_stage5_phb_subclasses_v1(uuid)
to service_role;

create or replace function private.ensure_rogue_stage5_phb_subclasses_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_rogue_stage5_phb_subclasses_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_rogue_stage5_phb_subclasses_v1_after_campaign()
from public,anon,authenticated;

drop trigger if exists p_campaigns_ensure_rogue_stage5_phb_subclasses_v1
on public.campaigns;
create trigger p_campaigns_ensure_rogue_stage5_phb_subclasses_v1
after insert on public.campaigns
for each row execute function private.ensure_rogue_stage5_phb_subclasses_v1_after_campaign();

do $apply$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_rogue_stage5_phb_subclasses_v1(r.id);
  end loop;
end;
$apply$;

-- ---------------------------------------------------------------------------
-- Fail-closed Stage 5 certification.
-- ---------------------------------------------------------------------------

do $cert$
declare
  r record;
  v_count integer;
  v_bad integer;
  v_choice jsonb;
begin
  for r in
    select id,campaign_id,rules_meta
    from public.rule_templates
    where kind='class' and catalog_key='class:rogue' and is_active
  loop
    select count(*) into v_count
    from public.rule_templates s
    where s.campaign_id=r.campaign_id
      and s.kind='subclass'
      and s.is_active
      and s.parent_template_id=r.id
      and s.catalog_key in (
        'subclass:rogue:thief',
        'subclass:rogue:assassin',
        'subclass:rogue:arcane-trickster',
        'subclass:rogue:soulknife'
      )
      and s.catalog_revision='xphb-2024-rogue-stage5-phb-subclasses-v1';
    if v_count<>4 then raise exception 'ROGUE_STAGE5_PHB_ROSTER:%:%',r.campaign_id,v_count; end if;

    select count(*) into v_bad
    from public.rule_templates s
    where s.campaign_id=r.campaign_id
      and s.kind='subclass'
      and s.is_active
      and (s.catalog_key like 'subclass:rogue:%' or s.slug like 'rogue-%')
      and s.catalog_key not in (
        'subclass:rogue:thief',
        'subclass:rogue:assassin',
        'subclass:rogue:arcane-trickster',
        'subclass:rogue:soulknife'
      );
    if v_bad<>0 then raise exception 'ROGUE_STAGE5_NON_PHB_RUNTIME_LEAK:%:%',r.campaign_id,v_bad; end if;

    if exists(
      select 1 from public.rule_templates s
      where s.campaign_id=r.campaign_id
        and (
          s.catalog_key='subclass:rogue:scion-of-the-three'
          or s.slug='rogue-scion-of-the-three'
        )
        and s.is_active
    ) then
      raise exception 'ROGUE_STAGE5_RETIRED_SCION_ACTIVE:%',r.campaign_id;
    end if;

    -- Every Stage 5 subclass uses parent Rogue level.
    select count(*) into v_bad
    from public.rule_templates s
    where s.campaign_id=r.campaign_id
      and s.catalog_key in (
        'subclass:rogue:thief',
        'subclass:rogue:assassin',
        'subclass:rogue:arcane-trickster',
        'subclass:rogue:soulknife'
      )
      and s.is_active
      and (s.parent_template_id is distinct from r.id or s.unlock_level<>3);
    if v_bad<>0 then raise exception 'ROGUE_STAGE5_PARENT_LEVEL_INVALID:%:%',r.campaign_id,v_bad; end if;

    -- Arcane Trickster: exact persistent choices, Mage Hand and slot ceiling.
    select c.value into v_choice
    from public.rule_templates s
    join public.rule_template_levels l on l.template_id=s.id and l.level=3
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
    where s.campaign_id=r.campaign_id
      and s.catalog_key='subclass:rogue:arcane-trickster'
      and s.is_active
      and c.value->>'key'='arcane_trickster_prepared_spells'
    limit 1;

    if v_choice is null
       or (v_choice->>'count')::integer<>3
       or (v_choice->'count_by_level'->>'20')::integer<>13
       or v_choice->>'replacement_policy'<>'on_level_change'
       or (v_choice->>'replacement_limit')::integer<>1
    then
      raise exception 'ROGUE_STAGE5_ARCANE_PREPARED_CHOICE_INVALID:%',r.campaign_id;
    end if;

    if not exists(
      select 1
      from public.rule_templates s
      join public.rule_template_levels l on l.template_id=s.id
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where s.campaign_id=r.campaign_id
        and s.catalog_key='subclass:rogue:arcane-trickster'
        and s.is_active
        and m.value->>'type'='spell'
        and m.value->>'catalogSlug'='mage-hand'
    ) then
      raise exception 'ROGUE_STAGE5_MAGE_HAND_MISSING:%',r.campaign_id;
    end if;

    if not exists(
      select 1
      from public.rule_templates s
      join public.rule_template_levels l on l.template_id=s.id and l.level=19
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where s.campaign_id=r.campaign_id
        and s.catalog_key='subclass:rogue:arcane-trickster'
        and s.is_active
        and m.value->>'type'='resource'
        and m.value->>'key'='spell_slot_4'
        and (m.value->>'max')::integer=1
    ) then
      raise exception 'ROGUE_STAGE5_ARCANE_SLOT4_MISSING:%',r.campaign_id;
    end if;

    -- Soulknife exact top progression and native attacks.
    if not exists(
      select 1
      from public.rule_templates s
      join public.rule_template_levels l on l.template_id=s.id and l.level=17
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where s.campaign_id=r.campaign_id
        and s.catalog_key='subclass:rogue:soulknife'
        and s.is_active
        and m.value->>'type'='resource'
        and m.value->>'key'='soulknife_psionic_energy'
        and (m.value->>'max')::integer=12
        and m.value->'recoveryRules' @> '[{"trigger":"short_rest","restore":"amount","amount":1},{"trigger":"long_rest","restore":"full"}]'::jsonb
    ) then
      raise exception 'ROGUE_STAGE5_SOULKNIFE_RESOURCE_INVALID:%',r.campaign_id;
    end if;

    select count(*) into v_count
    from public.rule_templates s
    join public.rule_template_levels l on l.template_id=s.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where s.campaign_id=r.campaign_id
      and s.catalog_key='subclass:rogue:soulknife'
      and s.is_active
      and m.value->>'type'='action'
      and m.value->>'key' in ('soulknife_psychic_blade','soulknife_psychic_blade_bonus');
    if v_count<>2 then raise exception 'ROGUE_STAGE5_PSYCHIC_BLADES_INVALID:%:%',r.campaign_id,v_count; end if;

    if coalesce((r.rules_meta->>'stage5_phb_subclasses_runtime')::boolean,false)<>true
       or coalesce((r.rules_meta->>'stage5_phb_subclass_count')::integer,0)<>4
       or r.rules_meta->>'mechanics_status'<>'IN_PROGRESS_STAGE5_PHB_SUBCLASSES_READY'
    then
      raise exception 'ROGUE_STAGE5_PARENT_STATUS_INVALID:%',r.campaign_id;
    end if;
  end loop;

  if to_regprocedure(
    'public.arcane_trickster_steal_spell_v1(uuid,uuid,boolean)'
  ) is null then
    raise exception 'ROGUE_STAGE5_SPELL_THIEF_RPC_MISSING';
  end if;

  if not exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='character_spells'
      and column_name='temporary_until'
  ) then
    raise exception 'ROGUE_STAGE5_TEMPORARY_SPELL_STATE_MISSING';
  end if;
end;
$cert$;

commit;
