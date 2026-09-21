-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:rogue
-- CLASS_PACKAGE_TEST: tests/rogueRuntimeStage6LegacySubclasses.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: rogue:stage6=LEGACY_SUBCLASSES_READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Rogue Stage 6 installs the five frozen legacy/supplement subclasses on the
-- 2024 Rogue parent. It does not rewrite their source rules.

begin;

-- Generic persistent-resource primitive required by legacy Phantom:
-- keep an existing pool untouched by a rest, but guarantee a minimum when a
-- source explicitly grants that behavior (Death's Friend).
create or replace function public.recover_character_resources(
  p_character_id uuid,
  p_trigger text
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then
    raise exception 'Only GM or owner can restore resources';
  end if;
  if p_trigger not in ('short_rest','long_rest','dawn','manual') then
    raise exception 'Unsupported recovery trigger';
  end if;

  update public.character_resource_states s
  set current=coalesce(
    (
      select case coalesce(rule->>'restore','full')
        when 'amount' then least(
          s.max_snapshot,
          s.current+greatest(0,coalesce((rule->>'amount')::integer,0))
        )
        when 'set' then least(
          s.max_snapshot,
          greatest(0,coalesce((rule->>'amount')::integer,0))
        )
        when 'ensure_minimum' then least(
          s.max_snapshot,
          greatest(s.current,greatest(0,coalesce((rule->>'amount')::integer,0)))
        )
        else s.max_snapshot
      end
      from jsonb_array_elements(coalesce(s.recharge->'rules','[]'::jsonb))
        with ordinality as rr(rule,ord)
      where rule->>'trigger'=p_trigger
      order by ord
      limit 1
    ),
    case
      when exists(
        select 1
        from jsonb_array_elements_text(coalesce(s.recharge->'triggers','[]'::jsonb)) t(value)
        where t.value=p_trigger
      ) then case coalesce(s.recharge->>'restore','full')
        when 'amount' then least(
          s.max_snapshot,
          s.current+greatest(0,coalesce((s.recharge->>'amount')::integer,0))
        )
        when 'set' then least(
          s.max_snapshot,
          greatest(0,coalesce((s.recharge->>'amount')::integer,0))
        )
        else s.max_snapshot
      end
      else s.current
    end
  ),
  updated_by=auth.uid(),
  updated_at=now()
  where s.character_id=p_character_id
    and (
      exists(
        select 1
        from jsonb_array_elements(coalesce(s.recharge->'rules','[]'::jsonb)) rr(rule)
        where rule->>'trigger'=p_trigger
      )
      or exists(
        select 1
        from jsonb_array_elements_text(coalesce(s.recharge->'triggers','[]'::jsonb)) t(value)
        where t.value=p_trigger
      )
    );

  if p_trigger='long_rest' then
    update public.character_resource_states
    set current=least(current,max_snapshot-temporary_max_bonus),
        max_snapshot=max_snapshot-temporary_max_bonus,
        temporary_max_bonus=0,
        updated_by=auth.uid(),
        updated_at=now()
    where character_id=p_character_id
      and temporary_max_bonus>0;
  end if;

  perform private.cheburashka_recover_inventory_items_v1(p_character_id,p_trigger);
end;
$function$;

revoke all on function public.recover_character_resources(uuid,text)
from public,anon;
grant execute on function public.recover_character_resources(uuid,text)
to authenticated,service_role;

-- Generic server authority for refreshable choices that require a skill/tool the
-- character does not currently own.
create or replace function private.character_has_tool_proficiency_for_choice_v1(
  p_character_id uuid,
  p_tool_key text,
  p_exclude_assignment_id uuid default null,
  p_exclude_choice_key text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_sheet text;
begin
  if p_tool_key !~ '^tool:[a-z0-9:-]+$' then return false; end if;

  select coalesce(proficiencies,'') into v_sheet
  from public.character_sheets
  where character_id=p_character_id;

  if position(lower(p_tool_key) in lower(coalesce(v_sheet,'')))>0
     or position(lower(replace(split_part(p_tool_key,':',2),'-',' ')) in lower(coalesce(v_sheet,'')))>0
  then
    return true;
  end if;

  if exists(
    select 1
    from public.character_template_assignments a
    join public.rule_templates t on t.id=a.template_id and t.is_active
    where a.character_id=p_character_id
      and (
        a.id is distinct from p_exclude_assignment_id
        or p_exclude_choice_key is null
        or (
          coalesce(a.selected_choices,'{}'::jsonb)-p_exclude_choice_key
        )::text ilike '%'||p_tool_key||'%'
      )
      and (
        coalesce(t.mechanics,'[]'::jsonb)::text ilike '%'||p_tool_key||'%'
        or coalesce(a.selected_choices,'{}'::jsonb)::text ilike '%'||p_tool_key||'%'
        or exists(
          select 1 from public.rule_template_levels l
          where l.template_id=t.id
            and l.level<=private.character_template_source_level(a.id)
            and coalesce(l.mechanics,'[]'::jsonb)::text ilike '%'||p_tool_key||'%'
        )
      )
  ) then
    return true;
  end if;

  return false;
end;
$function$;

revoke all on function private.character_has_tool_proficiency_for_choice_v1(
  uuid,text,uuid,text
) from public,anon,authenticated;
grant execute on function private.character_has_tool_proficiency_for_choice_v1(
  uuid,text,uuid,text
) to service_role;

create or replace function private.validate_choice_option_provider_v1(
  p_character_id uuid,
  p_assignment_id uuid,
  p_choice_key text,
  p_choice jsonb,
  p_before jsonb,
  p_instances jsonb
)
returns void
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_provider jsonb:=p_choice->'option_provider';
  v_kind text;
  v_min integer;
  v_max integer;
  v_instance jsonb;
  v_option text;
  v_rank integer;
  v_already_stored boolean;
begin
  if v_provider is null or jsonb_typeof(v_provider)<>'object' then return; end if;
  v_kind:=coalesce(v_provider->>'kind','');

  for v_instance in
    select value from jsonb_array_elements(coalesce(p_instances,'[]'::jsonb))
  loop
    v_option:=case
      when jsonb_typeof(v_instance)='string' then v_instance #>> '{}'
      else coalesce(v_instance->>'option','')
    end;
    if v_option='' then continue; end if;

    select exists(
      select 1 from jsonb_array_elements(coalesce(p_before,'[]'::jsonb)) b(value)
      where case
        when jsonb_typeof(b.value)='string' then b.value #>> '{}'
        else coalesce(b.value->>'option','')
      end=v_option
    ) into v_already_stored;
    if v_already_stored then continue; end if;

    if v_kind='skill_proficiencies' then
      v_min:=greatest(0,least(2,coalesce((v_provider->>'minimum_rank')::integer,1)));
      v_max:=greatest(v_min,least(2,coalesce((v_provider->>'maximum_rank')::integer,2)));
      if v_option !~ '^skill:[a-z_]+$' then
        raise exception 'CHOICE_PROVIDER_SKILL_OPTION_INVALID:%',v_option;
      end if;
      v_rank:=private.character_skill_proficiency_rank_for_choice_v1(
        p_character_id,v_option,p_assignment_id,p_choice_key
      );
      if v_rank<v_min or v_rank>v_max then
        raise exception 'CHOICE_PROVIDER_SKILL_PROFICIENCY_INELIGIBLE:option=%:rank=%:min=%:max=%',
          v_option,v_rank,v_min,v_max;
      end if;
      continue;
    end if;

    if v_kind='weapon_proficiencies' then
      if v_option !~ '^weapon:[a-z0-9-]+$' then
        raise exception 'CHOICE_PROVIDER_WEAPON_OPTION_INVALID:%',v_option;
      end if;
      if not private.character_has_weapon_proficiency_for_choice_v1(
        p_character_id,v_option,p_assignment_id,p_choice_key
      ) then
        raise exception 'CHOICE_PROVIDER_WEAPON_PROFICIENCY_INELIGIBLE:%',v_option;
      end if;
      continue;
    end if;

    if v_kind='unproficient_skill_or_tool' then
      if v_option ~ '^skill:[a-z_]+$' then
        v_rank:=private.character_skill_proficiency_rank_for_choice_v1(
          p_character_id,v_option,p_assignment_id,p_choice_key
        );
        if v_rank>0 then
          raise exception 'CHOICE_PROVIDER_ALREADY_PROFICIENT:%',v_option;
        end if;
      elsif v_option ~ '^tool:[a-z0-9:-]+$' then
        if private.character_has_tool_proficiency_for_choice_v1(
          p_character_id,v_option,p_assignment_id,p_choice_key
        ) then
          raise exception 'CHOICE_PROVIDER_ALREADY_PROFICIENT:%',v_option;
        end if;
      else
        raise exception 'CHOICE_PROVIDER_SKILL_OR_TOOL_OPTION_INVALID:%',v_option;
      end if;
      continue;
    end if;

    raise exception 'CHOICE_OPTION_PROVIDER_UNSUPPORTED:%',v_kind;
  end loop;
end;
$function$;

revoke all on function private.validate_choice_option_provider_v1(
  uuid,uuid,text,jsonb,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function private.validate_choice_option_provider_v1(
  uuid,uuid,text,jsonb,jsonb,jsonb
) to service_role;

create or replace function private.rogue_stage6_subclass_v1(
  p_campaign_id uuid,
  p_parent_id uuid,
  p_catalog_key text,
  p_slug text,
  p_name text,
  p_description text,
  p_summary text,
  p_source_label text,
  p_rules_meta jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v_id uuid;
begin
  select id into v_id
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='subclass'
    and catalog_key=p_catalog_key
    and catalog_revision='rogue-stage6-legacy-subclasses-v1'
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
      p_parent_id,3,p_catalog_key,'rogue-stage6-legacy-subclasses-v1',
      'official',p_source_label,true,p_summary,'','',
      coalesce(p_rules_meta,'{}'::jsonb)||jsonb_build_object(
        'rules_revision','legacy_exact',
        'runtime_stage',6,
        'runtime_revision','rogue-stage6-legacy-subclasses-v1',
        'mechanics_status','IN_PROGRESS_STAGE6_LEGACY_SUBCLASS_READY',
        'reference_only_until_final_certification',true
      ),
      true
    ) returning id into v_id;
  else
    update public.rule_templates
    set slug=p_slug,name=p_name,description=p_description,
        parent_template_id=p_parent_id,unlock_level=3,
        source_kind='official',source_label=p_source_label,is_builtin=true,
        mechanical_summary=p_summary,
        rules_meta=coalesce(rules_meta,'{}'::jsonb)
          ||coalesce(p_rules_meta,'{}'::jsonb)
          ||jsonb_build_object(
            'rules_revision','legacy_exact',
            'runtime_stage',6,
            'runtime_revision','rogue-stage6-legacy-subclasses-v1',
            'mechanics_status','IN_PROGRESS_STAGE6_LEGACY_SUBCLASS_READY',
            'reference_only_until_final_certification',true
          ),
        is_active=true,updated_at=now()
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

revoke all on function private.rogue_stage6_subclass_v1(
  uuid,uuid,text,text,text,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function private.rogue_stage6_subclass_v1(
  uuid,uuid,text,text,text,text,text,text,jsonb
) to service_role;

create or replace function private.ensure_rogue_stage6_legacy_subclasses_v1(
  p_campaign_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rogue uuid;
  v_swash uuid;
  v_inq uuid;
  v_mastermind uuid;
  v_scout uuid;
  v_phantom uuid;
  v_skill_tool_options jsonb;
  v_skill_tool_labels jsonb;
  v_whispers_choice jsonb;
  v_game_choice jsonb;
  v_language_choice jsonb;
begin
  select id into v_rogue
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class' and catalog_key='class:rogue' and is_active
  order by version desc,created_at desc
  limit 1;

  if v_rogue is null then raise exception 'ROGUE_STAGE6_PARENT_MISSING:%',p_campaign_id; end if;
  if not exists(
    select 1 from public.rule_templates
    where id=v_rogue
      and coalesce((rules_meta->>'stage5_phb_subclasses_runtime')::boolean,false)
  ) then
    raise exception 'ROGUE_STAGE6_REQUIRES_STAGE5:%',p_campaign_id;
  end if;

  -- SWASHBUCKLER ------------------------------------------------------------
  v_swash:=private.rogue_stage6_subclass_v1(
    p_campaign_id,v_rogue,'subclass:rogue:swashbuckler','rogue-swashbuckler',
    'Сорвиголова',
    'Разбойник, выигрывающий дуэли мобильностью, дерзостью и Харизмой.',
    'Xanathar legacy: Fancy Footwork, Rakish Audacity, Panache, Elegant Maneuver, Master Duelist.',
    'Xanathar''s Guide to Everything',
    jsonb_build_object('subclass_key','swashbuckler','source_book','XGE')
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_swash,3,
    private.rogue_stage3_feature_v1(
      'swash-fancy-footwork-feature-l3','fancy-footwork',
      'subclass:rogue:swashbuckler:fancy-footwork','Причудливая дерзость',
      'Если в свой ход вы совершаете рукопашную атаку против существа, это существо не может совершать провоцированные атаки против вас до конца вашего текущего хода; попадание для этого не требуется.',
      jsonb_build_object(
        'kind','opportunity_attack_lockout',
        'trigger','melee_attack_made',
        'duration','end_of_current_turn',
        'requiresHit',false,'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_swash,3,
    private.rogue_stage3_feature_v1(
      'swash-rakish-audacity-feature-l3','rakish-audacity',
      'subclass:rogue:swashbuckler:rakish-audacity','Дерзкая отвага',
      'Вы добавляете модификатор Харизмы к Инициативе. Кроме того, Скрытая атака не требует Преимущества, если цель в 5 футах от вас, других существ в 5 футах от вас нет и у атаки нет Помехи.',
      jsonb_build_object(
        'kind','sneak_attack_alternate_qualification',
        'targetDistanceFeet',5,'otherCreatureDistanceFeet',5,
        'requiresNoDisadvantage',true,'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_swash,3,
    jsonb_build_object(
      'id','swash-rakish-initiative-formula-l3',
      'type','formula','sourceKey','rakish-audacity',
      'target','combat.initiative','operation','SET_FORMULA',
      'formula',jsonb_build_object(
        'kind','add','terms',jsonb_build_array(
          jsonb_build_object('kind','reference','key','abilities.dexterity.modifier'),
          jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
        )
      ),
      'priority',603
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_swash,9,
    private.rogue_stage3_feature_v1(
      'swash-panache-feature-l9','panache',
      'subclass:rogue:swashbuckler:panache','Панегирик / Насмешка',
      'Действием совершите Харизма (Убеждение) против Мудрость (Проницательность) видимого существа в пределах 60 футов, которое слышит вас и разделяет язык. Успех против враждебной цели ограничивает её атаки и провоцированные атаки на 1 минуту; успех против невраждебной цели очаровывает её на 1 минуту.',
      jsonb_build_object(
        'kind','contested_social_action',
        'actorCheck','charisma:persuasion','targetCheck','wisdom:insight',
        'rangeFeet',60,'requiresHearing',true,'requiresSharedLanguage',true,
        'duration','1_minute','adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_swash,9,
    private.rogue_stage3_action_v1(
      'swash-panache-action-l9','panache','swashbuckler_panache',
      'Панегирик / Насмешка','action',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','contested_social_action',
        'payload',jsonb_build_object(
          'actorCheck','charisma:persuasion','targetCheck','wisdom:insight',
          'rangeFeet',60,'duration','1_minute','adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','swashbuckler','social','gm_scene_requirement')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_swash,13,
    private.rogue_stage3_feature_v1(
      'swash-elegant-maneuver-feature-l13','elegant-maneuver',
      'subclass:rogue:swashbuckler:elegant-maneuver','Элегантный маневр',
      'Бонусным действием вы получаете Преимущество на следующую проверку Ловкости (Акробатика) или Силы (Атлетика), совершённую в течение текущего хода.',
      jsonb_build_object(
        'kind','next_check_advantage',
        'economy','bonus_action',
        'checks',jsonb_build_array('dexterity:acrobatics','strength:athletics'),
        'duration','current_turn','adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_swash,13,
    private.rogue_stage3_action_v1(
      'swash-elegant-maneuver-action-l13','elegant-maneuver','swashbuckler_elegant_maneuver',
      'Элегантный маневр','bonus_action',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','next_check_advantage',
        'payload',jsonb_build_object(
          'checks',jsonb_build_array('dexterity:acrobatics','strength:athletics'),
          'duration','current_turn','adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','swashbuckler','skill')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_swash,17,
    private.rogue_stage3_feature_v1(
      'swash-master-duelist-feature-l17','master-duelist',
      'subclass:rogue:swashbuckler:master-duelist','Мастерский выпад',
      'Когда вы промахиваетесь броском атаки, можете немедленно перебросить эту атаку с Преимуществом. После использования способность восстанавливается после короткого или долгого отдыха.',
      jsonb_build_object(
        'kind','attack_reroll_with_advantage',
        'trigger','attack_miss','resourceKey','swashbuckler_master_duelist_use'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_swash,17,
    jsonb_build_object(
      'id','swash-master-duelist-resource-l17','type','resource',
      'sourceKey','master-duelist','key','swashbuckler_master_duelist_use',
      'label','Мастерский выпад','max',1,
      'recharge',jsonb_build_array('short_rest','long_rest'),
      'initial','full','grantOperation','REPLACE','priority',617
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_swash,17,
    private.rogue_stage3_action_v1(
      'swash-master-duelist-action-l17','master-duelist','swashbuckler_master_duelist',
      'Мастерский выпад','triggered',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','reroll_attack_with_advantage',
        'payload',jsonb_build_object('trigger','attack_miss','adjudication','gm')
      )),
      jsonb_build_array('rogue','swashbuckler','attack_reroll')
    )
    ||jsonb_build_object(
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','swashbuckler_master_duelist_use','amount',1
      ))
    )
  );

  -- INQUISITIVE -------------------------------------------------------------
  v_inq:=private.rogue_stage6_subclass_v1(
    p_campaign_id,v_rogue,'subclass:rogue:inquisitive','rogue-inquisitive',
    'Инквизитив',
    'Разбойник-наблюдатель, читающий ложь, улики и слабости противника.',
    'Xanathar legacy: Ear for Deceit, Eye for Detail, Insightful Fighting, Steady Eye, Unerring Eye, Eye for Weakness.',
    'Xanathar''s Guide to Everything',
    jsonb_build_object('subclass_key','inquisitive','source_book','XGE')
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_inq,3,
    private.rogue_stage3_feature_v1(
      'inq-ear-deceit-feature-l3','ear-for-deceit',
      'subclass:rogue:inquisitive:ear-for-deceit','Ухо обманщика',
      'Когда вы совершаете проверку Мудрости (Проницательность), чтобы определить, лжёт ли существо, результат 7 или ниже на к20 считается 8. Это правило само по себе не применяется к Проницательному бою.',
      jsonb_build_object(
        'kind','minimum_d20_result',
        'check','wisdom:insight','minimum',8,
        'scope','detect_lie_only','excludes','insightful_fighting'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_inq,3,
    private.rogue_stage3_feature_v1(
      'inq-eye-detail-feature-l3','eye-for-detail',
      'subclass:rogue:inquisitive:eye-for-detail','Око проницательности',
      'Бонусным действием совершите Мудрость (Восприятие), чтобы заметить скрытое существо или объект, либо Интеллект (Расследование), чтобы обнаружить или расшифровать улики.',
      jsonb_build_object(
        'kind','bonus_action_skill_check',
        'checks',jsonb_build_array('wisdom:perception','intelligence:investigation'),
        'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_inq,3,
    private.rogue_stage3_action_v1(
      'inq-eye-detail-action-l3','eye-for-detail','inquisitive_eye_for_detail',
      'Око проницательности','bonus_action',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','choose_skill_check',
        'payload',jsonb_build_object(
          'checks',jsonb_build_array('wisdom:perception','intelligence:investigation'),
          'adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','inquisitive','skill')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_inq,3,
    private.rogue_stage3_feature_v1(
      'inq-insightful-fighting-feature-l3','insightful-fighting',
      'subclass:rogue:inquisitive:insightful-fighting','Проницательный бой',
      'Бонусным действием совершите Мудрость (Проницательность) против Харизма (Обман) видимого дееспособного существа. При успехе 1 минуту Скрытая атака против этой цели не требует Преимущества, если у атаки нет Помехи; новый успех против другой цели завершает прежний эффект.',
      jsonb_build_object(
        'kind','sneak_attack_target_qualification',
        'actorCheck','wisdom:insight','targetCheck','charisma:deception',
        'duration','1_minute','requiresNoDisadvantage',true,
        'oneTargetAtATime',true,'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_inq,3,
    private.rogue_stage3_action_v1(
      'inq-insightful-fighting-action-l3','insightful-fighting','inquisitive_insightful_fighting',
      'Проницательный бой','bonus_action',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','contested_target_rule',
        'payload',jsonb_build_object(
          'actorCheck','wisdom:insight','targetCheck','charisma:deception',
          'duration','1_minute','adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','inquisitive','sneak_attack','gm_scene_requirement')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_inq,9,
    private.rogue_stage3_feature_v1(
      'inq-steady-eye-feature-l9','steady-eye',
      'subclass:rogue:inquisitive:steady-eye','Непогрешимый взгляд',
      'Вы имеете Преимущество на проверки Мудрости (Восприятие) и Интеллекта (Расследование), если в текущий ход переместились не более чем на половину своей Скорости.',
      jsonb_build_object(
        'kind','skill_check_advantage_rule',
        'checks',jsonb_build_array('wisdom:perception','intelligence:investigation'),
        'movementLimit','half_speed_current_turn','adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_inq,13,
    private.rogue_stage3_feature_v1(
      'inq-unerring-eye-feature-l13','unerring-eye',
      'subclass:rogue:inquisitive:unerring-eye','Безошибочный глаз',
      'Действием, если вы не ослеплены и не оглушены, вы чувствуете в пределах 30 футов присутствие иллюзий, меняющих форму существ не в исходной форме и другой магии, созданной для обмана чувств. Способность не раскрывает точный источник или истинную природу обмана. Использований: модификатор Мудрости, минимум 1; восстановление после долгого отдыха.',
      jsonb_build_object(
        'kind','sense_deception_magic',
        'rangeFeet',30,'minimumUses',1,
        'usesAbility','wisdom','doesNotRevealSource',true,
        'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_inq,13,
    jsonb_build_object(
      'id','inq-unerring-eye-resource-l13','type','resource',
      'sourceKey','unerring-eye','key','inquisitive_unerring_eye_uses',
      'label','Безошибочный глаз',
      'max',jsonb_build_object(
        'kind','max','values',jsonb_build_array(
          jsonb_build_object('kind','literal','value',1),
          jsonb_build_object('kind','reference','key','abilities.wisdom.modifier')
        )
      ),
      'recharge',jsonb_build_array('long_rest'),'initial','full',
      'grantOperation','REPLACE','priority',613
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_inq,13,
    private.rogue_stage3_action_v1(
      'inq-unerring-eye-action-l13','unerring-eye','inquisitive_unerring_eye',
      'Безошибочный глаз','action',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','sense_deception_magic',
        'payload',jsonb_build_object(
          'rangeFeet',30,'doesNotRevealSource',true,'adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','inquisitive','sense','gm_scene_requirement')
    )
    ||jsonb_build_object(
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','inquisitive_unerring_eye_uses','amount',1
      ))
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_inq,17,
    private.rogue_stage3_feature_v1(
      'inq-eye-weakness-feature-l17','eye-for-weakness',
      'subclass:rogue:inquisitive:eye-for-weakness','Эксплуатация слабости',
      'Когда вы наносите урон Скрытой атакой существу, на которое действует ваш Проницательный бой, дополнительный урон Скрытой атаки увеличивается ещё на 3к6.',
      jsonb_build_object(
        'kind','sneak_attack_bonus_damage',
        'requiresRule','insightful_fighting','count',3,'sides',6,
        'adjudication','gm'
      )
    )
  );

  -- MASTERMIND --------------------------------------------------------------
  v_mastermind:=private.rogue_stage6_subclass_v1(
    p_campaign_id,v_rogue,'subclass:rogue:mastermind','rogue-mastermind',
    'Мастер интриг',
    'Разбойник-манипулятор, работающий через маскировку, помощь, наблюдение и ложь.',
    'Xanathar legacy: Master of Intrigue, Master of Tactics, Insightful Manipulator, Misdirection, Soul of Deceit.',
    'Xanathar''s Guide to Everything',
    jsonb_build_object('subclass_key','mastermind','source_book','XGE')
  );

  v_game_choice:=jsonb_build_object(
    'key','mastermind_gaming_set','label','Игровой набор Мастера интриг',
    'target','proficiency','count',1,'selection_mode','player_once',
    'replacement_policy','locked','required',true,
    'options',jsonb_build_array(
      'tool:gaming:dice','tool:gaming:dragonchess',
      'tool:gaming:playing-cards','tool:gaming:three-dragon-ante'
    ),
    'option_labels',jsonb_build_object(
      'tool:gaming:dice','Кости',
      'tool:gaming:dragonchess','Драконьи шахматы',
      'tool:gaming:playing-cards','Игральные карты',
      'tool:gaming:three-dragon-ante','Три Дракона'
    )
  );
  v_language_choice:=jsonb_build_object(
    'key','mastermind_languages','label','Два языка Мастера интриг',
    'target','language','count',2,'selection_mode','player_once',
    'replacement_policy','locked','required',true,
    'options',jsonb_build_array(
      'common','dwarvish','elvish','giant','gnomish','goblin','halfling','orc',
      'abyssal','celestial','deep-speech','draconic','infernal','primordial',
      'sylvan','undercommon'
    )
  );
  insert into public.rule_template_levels(template_id,level,mechanics,choices)
  values(v_mastermind,3,'[]'::jsonb,jsonb_build_array(v_game_choice,v_language_choice))
  on conflict(template_id,level) do update set choices=excluded.choices;

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_mastermind,3,
    private.rogue_stage3_feature_v1(
      'mastermind-intrigue-feature-l3','master-of-intrigue',
      'subclass:rogue:mastermind:master-of-intrigue','Мастер интриг',
      'Вы получаете владение Набором для грима и Набором для подделки документов, одним игровым набором по выбору и двумя языками по выбору. После минуты прослушивания знакомого вам языка вы можете воспроизводить манеру речи и акцент; способность не создаёт отдельной проверки Проницательности против Обмана.',
      jsonb_build_object(
        'kind','intrigue_proficiencies_and_mimicry',
        'fixedTools',jsonb_build_array('tool:disguise-kit','tool:forgery-kit'),
        'speechStudy','1_minute','requiresKnownLanguage',true,
        'inventedInsightDetector',false
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_mastermind,3,
    jsonb_build_object(
      'id','mastermind-disguise-kit-l3','type','grant','sourceKey','master-of-intrigue',
      'target','proficiency','key','tool:disguise-kit',
      'payload',jsonb_build_object('rank',1,'label','Набор для грима')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_mastermind,3,
    jsonb_build_object(
      'id','mastermind-forgery-kit-l3','type','grant','sourceKey','master-of-intrigue',
      'target','proficiency','key','tool:forgery-kit',
      'payload',jsonb_build_object('rank',1,'label','Набор для подделки документов')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_mastermind,3,
    private.rogue_stage3_feature_v1(
      'mastermind-tactics-feature-l3','master-of-tactics',
      'subclass:rogue:mastermind:master-of-tactics','Мастер тактики',
      'Вы можете совершать Help бонусным действием. Когда вы помогаете союзнику атаковать существо, цель может находиться в пределах 30 футов от вас вместо обычной ближней дистанции, если она способна видеть или слышать вас.',
      jsonb_build_object(
        'kind','help_action_extension','economy','bonus_action',
        'attackHelpRangeFeet',30,'requiresTargetSeeOrHear',true
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_mastermind,3,
    private.rogue_stage3_action_v1(
      'mastermind-help-action-l3','master-of-tactics','mastermind_help',
      'Помощь Мастера тактики','bonus_action',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','help_action_extension',
        'payload',jsonb_build_object(
          'attackHelpRangeFeet',30,'requiresTargetSeeOrHear',true,'adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','mastermind','help')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_mastermind,9,
    private.rogue_stage3_feature_v1(
      'mastermind-manipulator-feature-l9','insightful-manipulator',
      'subclass:rogue:mastermind:insightful-manipulator','Проницательный манипулятор',
      'После минимум 1 минуты наблюдения или общения с существом вне боя выберите две характеристики из Интеллекта, Мудрости, Харизмы или уровней классов. Для каждой мастер сообщает, превосходит ли существо вас, уступает или равно вам; по усмотрению мастера можно узнать фрагмент истории или черту личности.',
      jsonb_build_object(
        'kind','comparative_observation','studyTime','1_minute',
        'outsideCombat',true,'chooseCount',2,
        'traits',jsonb_build_array('intelligence','wisdom','charisma','class_levels'),
        'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_mastermind,13,
    private.rogue_stage3_feature_v1(
      'mastermind-misdirection-feature-l13','misdirection',
      'subclass:rogue:mastermind:misdirection','Ложное направление',
      'Когда атака выбирает вас целью и существо в пределах 5 футов предоставляет вам укрытие от этой атаки, Реакцией перенаправьте ту же атаку на это существо. Исходный бросок атаки не перебрасывается.',
      jsonb_build_object(
        'kind','redirect_attack','economy','reaction','coverRangeFeet',5,
        'reuseOriginalAttackRoll',true,'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_mastermind,13,
    private.rogue_stage3_action_v1(
      'mastermind-misdirection-action-l13','misdirection','mastermind_misdirection',
      'Ложное направление','reaction',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','redirect_attack',
        'payload',jsonb_build_object(
          'coverRangeFeet',5,'reuseOriginalAttackRoll',true,'adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','mastermind','reaction','gm_scene_requirement')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_mastermind,17,
    private.rogue_stage3_feature_v1(
      'mastermind-soul-deceit-feature-l17','soul-of-deceit',
      'subclass:rogue:mastermind:soul-of-deceit','Душа обмана',
      'Ваши мысли нельзя прочитать без вашего разрешения. При попытке чтения можете представить ложные мысли через Харизма (Обман) против Мудрость (Проницательность) читающего. По вашему выбору магия считает ваши слова правдивыми, а магия не может принудить вас говорить правду.',
      jsonb_build_object(
        'kind','thought_and_truth_protection',
        'telepathyRequiresPermission',true,
        'falseThoughtContest',jsonb_build_object(
          'actorCheck','charisma:deception','readerCheck','wisdom:insight'
        ),
        'truthDetectionChoice','treat_as_truthful',
        'truthCompulsionImmune',true
      )
    )
  );

  -- SCOUT -------------------------------------------------------------------
  v_scout:=private.rogue_stage6_subclass_v1(
    p_campaign_id,v_rogue,'subclass:rogue:scout','rogue-scout',
    'Скаут',
    'Подвижный разведчик с природной экспертизой, инициативой и дополнительной атакой.',
    'Xanathar legacy: Skirmisher, Survivalist, Superior Mobility, Ambush Master, Sudden Strike.',
    'Xanathar''s Guide to Everything',
    jsonb_build_object('subclass_key','scout','source_book','XGE')
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_scout,3,
    private.rogue_stage3_feature_v1(
      'scout-skirmisher-feature-l3','skirmisher',
      'subclass:rogue:scout:skirmisher','Застрельщик',
      'Когда враждебное существо заканчивает свой ход в пределах 5 футов от вас, Реакцией переместитесь на расстояние до половины своей Скорости. Это перемещение не провоцирует провоцированных атак.',
      jsonb_build_object(
        'kind','reaction_movement','trigger','hostile_ends_turn_within_5ft',
        'distance','half_speed','provokesOpportunityAttacks',false,
        'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_scout,3,
    private.rogue_stage3_action_v1(
      'scout-skirmisher-action-l3','skirmisher','scout_skirmisher',
      'Застрельщик','reaction',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','reaction_movement',
        'payload',jsonb_build_object(
          'distance','half_speed','provokesOpportunityAttacks',false,'adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','scout','movement','gm_scene_requirement')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_scout,3,
    private.rogue_stage3_feature_v1(
      'scout-survivalist-feature-l3','survivalist',
      'subclass:rogue:scout:survivalist','Мастер выживания',
      'Вы получаете владение Природой и Выживанием, если ещё не владеете ими, а ваш бонус мастерства удваивается для любых проверок характеристик, использующих одно из этих владений.',
      jsonb_build_object(
        'kind','fixed_skill_expertise',
        'skills',jsonb_build_array('nature','survival'),'duplicateReplacement',false
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_scout,3,
    jsonb_build_object(
      'id','scout-nature-expertise-l3','type','grant','sourceKey','survivalist',
      'target','proficiency','key','skill:nature',
      'payload',jsonb_build_object('rank',2,'label','Природа')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_scout,3,
    jsonb_build_object(
      'id','scout-survival-expertise-l3','type','grant','sourceKey','survivalist',
      'target','proficiency','key','skill:survival',
      'payload',jsonb_build_object('rank',2,'label','Выживание')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_scout,9,
    private.rogue_stage3_feature_v1(
      'scout-superior-mobility-feature-l9','superior-mobility',
      'subclass:rogue:scout:superior-mobility','Превосходная подвижность',
      'Ваша Скорость ходьбы увеличивается на 10 футов. Уже существующие Скорости лазания и плавания также увеличиваются на 10 футов; способность не создаёт отсутствующие скорости и не увеличивает Скорость полёта.',
      jsonb_build_object(
        'kind','movement_speed_extension',
        'walkingFeet',10,'existingClimbFeet',10,'existingSwimFeet',10,
        'createsMissingSpeeds',false,'flyFeet',0
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_scout,9,
    jsonb_build_object(
      'id','scout-walking-speed-l9','type','numeric','sourceKey','superior-mobility',
      'target','combat.speed','operation','ADD','value',10
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_scout,13,
    private.rogue_stage3_feature_v1(
      'scout-ambush-master-feature-l13','ambush-master',
      'subclass:rogue:scout:ambush-master','Мастер засад',
      'Вы совершаете Инициативу с Преимуществом. Первое существо, по которому вы попали атакой в первом раунде боя, даёт Преимущество на все последующие атаки против него до начала вашего следующего хода.',
      jsonb_build_object(
        'kind','first_round_ambush',
        'initiativeAdvantage',true,
        'firstHitGrantsAttackAdvantage',true,
        'duration','start_of_next_turn','persistentTurnTracker',false,
        'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_scout,17,
    private.rogue_stage3_feature_v1(
      'scout-sudden-strike-feature-l17','sudden-strike',
      'subclass:rogue:scout:sudden-strike','Внезапный удар',
      'Если в свой ход вы совершаете действие Атака, бонусным действием можете совершить одну дополнительную атаку. Она может получить Скрытую атаку даже после уже применённой Скрытой атаки в этом ходу, но вторую Скрытую атаку нельзя нанести той же цели; сама дополнительная атака может выбирать любую законную цель.',
      jsonb_build_object(
        'kind','bonus_attack_with_second_sneak_attack',
        'requiresAttackAction',true,'attackMayTargetAnyLegalTarget',true,
        'secondSneakAttackMustUseDifferentTarget',true,
        'persistentTurnTracker',false,'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_scout,17,
    private.rogue_stage3_action_v1(
      'scout-sudden-strike-action-l17','sudden-strike','scout_sudden_strike',
      'Внезапный удар','bonus_action',
      jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','bonus_attack_second_sneak_attack',
        'payload',jsonb_build_object(
          'requiresAttackAction',true,'attackMayTargetAnyLegalTarget',true,
          'secondSneakAttackMustUseDifferentTarget',true,'adjudication','gm'
        )
      )),
      jsonb_build_array('rogue','scout','attack','sneak_attack','gm_scene_requirement')
    )
  );

  -- PHANTOM -----------------------------------------------------------------
  v_phantom:=private.rogue_stage6_subclass_v1(
    p_campaign_id,v_rogue,'subclass:rogue:phantom','rogue-phantom',
    'Фантом',
    'Разбойник, заимствующий владения мёртвых и собирающий осколки душ.',
    'Tasha legacy: Whispers of the Dead, Wails from the Grave, Tokens of the Departed, Ghost Walk, Deaths Friend.',
    'Tasha''s Cauldron of Everything',
    jsonb_build_object('subclass_key','phantom','source_book','TCE')
  );

  v_skill_tool_options:=jsonb_build_array(
    'skill:acrobatics','skill:animal_handling','skill:arcana','skill:athletics',
    'skill:deception','skill:history','skill:insight','skill:intimidation',
    'skill:investigation','skill:medicine','skill:nature','skill:perception',
    'skill:performance','skill:persuasion','skill:religion','skill:sleight_of_hand',
    'skill:stealth','skill:survival',
    'tool:herbalism-kit','tool:scribes-tools','tool:alchemist-supplies',
    'tool:brewer-supplies','tool:calligrapher-supplies','tool:carpenter-tools',
    'tool:cartographer-tools','tool:cobbler-tools','tool:cook-utensils',
    'tool:glassblower-tools','tool:jeweler-tools','tool:leatherworker-tools',
    'tool:mason-tools','tool:painter-supplies','tool:potter-tools',
    'tool:smith-tools','tool:tinker-tools','tool:weaver-tools',
    'tool:woodcarver-tools','tool:disguise-kit','tool:forgery-kit',
    'tool:poisoners-kit','tool:thieves-tools'
  );
  v_skill_tool_labels:=jsonb_build_object(
    'skill:acrobatics','Акробатика','skill:animal_handling','Уход за животными',
    'skill:arcana','Магия','skill:athletics','Атлетика','skill:deception','Обман',
    'skill:history','История','skill:insight','Проницательность',
    'skill:intimidation','Запугивание','skill:investigation','Расследование',
    'skill:medicine','Медицина','skill:nature','Природа','skill:perception','Восприятие',
    'skill:performance','Выступление','skill:persuasion','Убеждение',
    'skill:religion','Религия','skill:sleight_of_hand','Ловкость рук',
    'skill:stealth','Скрытность','skill:survival','Выживание',
    'tool:herbalism-kit','Набор травника','tool:scribes-tools','Инструменты писца',
    'tool:alchemist-supplies','Инструменты алхимика','tool:brewer-supplies','Инструменты пивовара',
    'tool:calligrapher-supplies','Инструменты каллиграфа','tool:carpenter-tools','Инструменты плотника',
    'tool:cartographer-tools','Инструменты картографа','tool:cobbler-tools','Инструменты сапожника',
    'tool:cook-utensils','Инструменты повара','tool:glassblower-tools','Инструменты стеклодува',
    'tool:jeweler-tools','Инструменты ювелира','tool:leatherworker-tools','Инструменты кожевника',
    'tool:mason-tools','Инструменты каменщика','tool:painter-supplies','Инструменты художника',
    'tool:potter-tools','Инструменты гончара','tool:smith-tools','Инструменты кузнеца',
    'tool:tinker-tools','Инструменты ремонтника','tool:weaver-tools','Инструменты ткача',
    'tool:woodcarver-tools','Инструменты резчика','tool:disguise-kit','Набор для грима',
    'tool:forgery-kit','Набор для подделки документов','tool:poisoners-kit','Набор отравителя',
    'tool:thieves-tools','Воровские инструменты'
  );
  v_whispers_choice:=jsonb_build_object(
    'key','phantom_whispers_proficiency',
    'label','Шепот мертвецов',
    'target','proficiency','count',1,'selection_mode','player_once',
    'refresh','short_or_long_rest','replacement_policy','always','replacement_limit',1,
    'required',true,'options',v_skill_tool_options,'option_labels',v_skill_tool_labels,
    'option_provider',jsonb_build_object('kind','unproficient_skill_or_tool')
  );
  insert into public.rule_template_levels(template_id,level,mechanics,choices)
  values(v_phantom,3,'[]'::jsonb,jsonb_build_array(v_whispers_choice))
  on conflict(template_id,level) do update set choices=excluded.choices;

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,3,
    private.rogue_stage3_feature_v1(
      'phantom-whispers-feature-l3','whispers-of-the-dead',
      'subclass:rogue:phantom:whispers-of-the-dead','Шепот мертвецов',
      'После короткого или долгого отдыха выберите один навык или инструмент, которым не владеете, и получите владение им. Выбор сохраняется, пока после последующего отдыха вы не замените его новым; сам отдых автоматически его не снимает.',
      jsonb_build_object(
        'kind','refreshable_proficiency_choice',
        'choiceKey','phantom_whispers_proficiency',
        'refresh',jsonb_build_array('short_rest','long_rest'),
        'requiresUnownedProficiency',true
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,3,
    private.rogue_stage3_feature_v1(
      'phantom-wails-feature-l3','wails-from-the-grave',
      'subclass:rogue:phantom:wails-from-the-grave','Вопли из могилы',
      'Сразу после нанесения Скрытой атакой урона в свой ход выберите второе видимое существо в пределах 30 футов от первой цели. Оно получает некротический урон, равный броску половины числа костей вашей Скрытой атаки с округлением вверх. Использований: бонус мастерства; восстановление после долгого отдыха.',
      jsonb_build_object(
        'kind','sneak_attack_secondary_damage',
        'rangeFromFirstTargetFeet',30,'damageType','necrotic',
        'diceCount','ceil(sneak_attack_dice / 2)',
        'resourceKey','phantom_wails_uses','adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,3,
    jsonb_build_object(
      'id','phantom-wails-resource-l3','type','resource','sourceKey','wails-from-the-grave',
      'key','phantom_wails_uses','label','Вопли из могилы',
      'max',jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
      'recharge',jsonb_build_array('long_rest'),'initial','full',
      'grantOperation','REPLACE','priority',603
    )
  );

  -- Wails damage only changes when ceil(Sneak Attack dice/2) changes.
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,3,
    jsonb_build_object(
      'id','phantom-wails-action-l3','type','action','sourceKey','wails-from-the-grave',
      'key','phantom_wails','label','Вопли из могилы','economy','triggered',
      'range',jsonb_build_object('kind','ranged','normal',30,'unit','ft'),
      'resourceCosts',jsonb_build_array(jsonb_build_object('key','phantom_wails_uses','amount',1)),
      'damage',jsonb_build_array(jsonb_build_object(
        'key','wails','damageType','necrotic','count',1,'sides',6
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','requires_sneak_attack_secondary_target',
        'payload',jsonb_build_object('adjudication','gm')
      )),
      'tags',jsonb_build_array('rogue','phantom','sneak_attack','necrotic')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,5,
    jsonb_build_object(
      'id','phantom-wails-action-l5','type','action','sourceKey','wails-from-the-grave',
      'key','phantom_wails','label','Вопли из могилы','economy','triggered',
      'range',jsonb_build_object('kind','ranged','normal',30,'unit','ft'),
      'resourceCosts',jsonb_build_array(jsonb_build_object('key','phantom_wails_uses','amount',1)),
      'damage',jsonb_build_array(jsonb_build_object(
        'key','wails','damageType','necrotic','count',2,'sides',6
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','requires_sneak_attack_secondary_target',
        'payload',jsonb_build_object('adjudication','gm')
      )),
      'tags',jsonb_build_array('rogue','phantom','sneak_attack','necrotic'),
      'grantOperation','REPLACE','priority',605
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,9,
    jsonb_build_object(
      'id','phantom-wails-action-l9','type','action','sourceKey','wails-from-the-grave',
      'key','phantom_wails','label','Вопли из могилы','economy','triggered',
      'range',jsonb_build_object('kind','ranged','normal',30,'unit','ft'),
      'resourceCosts',jsonb_build_array(jsonb_build_object('key','phantom_wails_uses','amount',1)),
      'damage',jsonb_build_array(jsonb_build_object(
        'key','wails','damageType','necrotic','count',3,'sides',6
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','requires_sneak_attack_secondary_target',
        'payload',jsonb_build_object('adjudication','gm')
      )),
      'tags',jsonb_build_array('rogue','phantom','sneak_attack','necrotic'),
      'grantOperation','REPLACE','priority',609
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,13,
    jsonb_build_object(
      'id','phantom-wails-action-l13','type','action','sourceKey','wails-from-the-grave',
      'key','phantom_wails','label','Вопли из могилы','economy','triggered',
      'range',jsonb_build_object('kind','ranged','normal',30,'unit','ft'),
      'resourceCosts',jsonb_build_array(jsonb_build_object('key','phantom_wails_uses','amount',1)),
      'damage',jsonb_build_array(jsonb_build_object(
        'key','wails','damageType','necrotic','count',4,'sides',6
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','requires_sneak_attack_secondary_target',
        'payload',jsonb_build_object('adjudication','gm')
      )),
      'tags',jsonb_build_array('rogue','phantom','sneak_attack','necrotic'),
      'grantOperation','REPLACE','priority',613
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,17,
    jsonb_build_object(
      'id','phantom-wails-action-l17','type','action','sourceKey','wails-from-the-grave',
      'key','phantom_wails','label','Вопли из могилы','economy','triggered',
      'range',jsonb_build_object('kind','ranged','normal',30,'unit','ft'),
      'resourceCosts',jsonb_build_array(jsonb_build_object('key','phantom_wails_uses','amount',1)),
      'damage',jsonb_build_array(jsonb_build_object(
        'key','wails','damageType','necrotic','count',5,'sides',6
      )),
      'effects',jsonb_build_array(
        jsonb_build_object(
          'kind','semantic','key','requires_sneak_attack_secondary_target',
          'payload',jsonb_build_object('adjudication','gm')
        ),
        jsonb_build_object(
          'kind','semantic','key','also_damage_first_sneak_attack_target',
          'payload',jsonb_build_object('sameRoll',true,'adjudication','gm')
        )
      ),
      'tags',jsonb_build_array('rogue','phantom','sneak_attack','necrotic'),
      'grantOperation','REPLACE','priority',617
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,9,
    private.rogue_stage3_feature_v1(
      'phantom-tokens-feature-l9','tokens-of-the-departed',
      'subclass:rogue:phantom:tokens-of-the-departed','Осколки усопших',
      'Когда видимое существо умирает в пределах 30 футов, Реакцией с открытой свободной рукой создайте крошечный Soul Trinket; максимум жетонов равен бонусу мастерства. Никакого исключения для Нежити или Конструктов нет. Жетон можно уничтожить для бесплатных Воплей из могилы либо действием задать духу один вопрос; дух знает только известное при жизни и не обязан говорить правду.',
      jsonb_build_object(
        'kind','soul_trinket_pool',
        'resourceKey','phantom_soul_trinkets',
        'maximum','proficiency_bonus',
        'creationTrigger','visible_creature_dies_within_30ft',
        'requiresFreeHand',true,'undeadConstructExcluded',false,
        'spiritTruthRequired',false,'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,9,
    jsonb_build_object(
      'id','phantom-trinkets-resource-l9','type','resource','sourceKey','tokens-of-the-departed',
      'key','phantom_soul_trinkets','label','Осколки душ',
      'max',jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
      'recharge',jsonb_build_array('long_rest'),
      'recoveryRules',jsonb_build_array(jsonb_build_object(
        'trigger','long_rest','restore','ensure_minimum','amount',0
      )),
      'initial','empty','grantOperation','REPLACE','priority',709
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,9,
    jsonb_build_object(
      'id','phantom-create-trinket-action-l9','type','action','sourceKey','tokens-of-the-departed',
      'key','phantom_create_soul_trinket','label','Создать осколок души','economy','reaction',
      'range',jsonb_build_object('kind','ranged','normal',30,'unit','ft'),
      'effects',jsonb_build_array(
        jsonb_build_object(
          'kind','resource','key','phantom_soul_trinkets',
          'operation','RESTORE','amount',1
        ),
        jsonb_build_object(
          'kind','semantic','key','creature_death_trinket_creation',
          'payload',jsonb_build_object(
            'requiresVisibleDeath',true,'requiresFreeHand',true,
            'undeadConstructExcluded',false,'adjudication','gm'
          )
        )
      ),
      'tags',jsonb_build_array('rogue','phantom','reaction','soul_trinket','gm_scene_requirement')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,9,
    jsonb_build_object(
      'id','phantom-wails-trinket-action-l9','type','action','sourceKey','tokens-of-the-departed',
      'key','phantom_wails_from_trinket','label','Вопли из могилы: осколок души','economy','triggered',
      'range',jsonb_build_object('kind','ranged','normal',30,'unit','ft'),
      'resourceCosts',jsonb_build_array(jsonb_build_object('key','phantom_soul_trinkets','amount',1)),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','free_wails_from_trinket',
        'payload',jsonb_build_object('usesNormalWailsUse',false,'adjudication','gm')
      )),
      'tags',jsonb_build_array('rogue','phantom','soul_trinket','wails')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,9,
    jsonb_build_object(
      'id','phantom-question-spirit-action-l9','type','action','sourceKey','tokens-of-the-departed',
      'key','phantom_question_spirit','label','Вопрос духу','economy','action',
      'range',jsonb_build_object('kind','self'),
      'resourceCosts',jsonb_build_array(jsonb_build_object('key','phantom_soul_trinkets','amount',1)),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','question_departed_spirit',
        'payload',jsonb_build_object(
          'questions',1,'answer','brief','knowledge','known_in_life',
          'truthRequired',false,'trinketLocationIrrelevant',true,'adjudication','gm'
        )
      )),
      'tags',jsonb_build_array('rogue','phantom','soul_trinket','social')
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,13,
    private.rogue_stage3_feature_v1(
      'phantom-ghost-walk-feature-l13','ghost-walk',
      'subclass:rogue:phantom:ghost-walk','Призрачная походка',
      'Бонусным действием примите спектральную форму на 10 минут или до прекращения бонусным действием. Вы получаете полёт 10 футов с Hover, атаки против вас идут с Помехой, а через существ и объекты вы проходите как через труднопроходимую местность; завершение хода внутри существа или объекта наносит 1к10 силового урона. Одно использование восстанавливается после долгого отдыха; вместо него можно уничтожить Soul Trinket.',
      jsonb_build_object(
        'kind','spectral_form','duration','10_minutes','flySpeedFeet',10,'hover',true,
        'attacksAgainstDisadvantage',true,'phaseThroughCreaturesAndObjects',true,
        'insideObjectEndTurnDamage','1d10_force',
        'adjudication','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,13,
    jsonb_build_object(
      'id','phantom-ghost-walk-free-resource-l13','type','resource','sourceKey','ghost-walk',
      'key','phantom_ghost_walk_free','label','Призрачная походка: бесплатное использование',
      'max',1,'recharge',jsonb_build_array('long_rest'),'initial','full',
      'grantOperation','REPLACE','priority',713
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,13,
    jsonb_build_object(
      'id','phantom-ghost-walk-action-l13','type','action','sourceKey','ghost-walk',
      'key','phantom_ghost_walk','label','Призрачная походка','economy','bonus_action',
      'range',jsonb_build_object('kind','self'),
      'costOptions',jsonb_build_array(
        jsonb_build_object(
          'key','free-use','label','Бесплатное использование',
          'costs',jsonb_build_array(jsonb_build_object('key','phantom_ghost_walk_free','amount',1))
        ),
        jsonb_build_object(
          'key','soul-trinket','label','Осколок души',
          'costs',jsonb_build_array(jsonb_build_object('key','phantom_soul_trinkets','amount',1))
        )
      ),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','spectral_form',
        'payload',jsonb_build_object(
          'duration','10_minutes','flySpeedFeet',10,'hover',true,
          'attacksAgainstDisadvantage',true,'insideObjectEndTurnDamage','1d10_force',
          'adjudication','gm'
        )
      )),
      'tags',jsonb_build_array('rogue','phantom','movement','spectral')
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,17,
    private.rogue_stage3_feature_v1(
      'phantom-deaths-friend-feature-l17','deaths-friend',
      'subclass:rogue:phantom:deaths-friend','Друг смерти',
      'Вопли из могилы теперь наносят тот же некротический урон одновременно первой цели Скрытой атаки и второй выбранной цели. Кроме того, в конце долгого отдыха, если у вас нет Soul Trinket, в руке появляется один; бросок Инициативы жетон не создаёт.',
      jsonb_build_object(
        'kind','death_friend_upgrade',
        'wailsAlsoHitsFirstTarget',true,
        'longRestEnsureSoulTrinket',1,
        'initiativeCreatesTrinket',false
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_phantom,17,
    jsonb_build_object(
      'id','phantom-trinkets-resource-l17','type','resource','sourceKey','tokens-of-the-departed',
      'key','phantom_soul_trinkets','label','Осколки душ',
      'max',jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
      'recharge',jsonb_build_array('long_rest'),
      'recoveryRules',jsonb_build_array(jsonb_build_object(
        'trigger','long_rest','restore','ensure_minimum','amount',1
      )),
      'initial','empty','grantOperation','REPLACE','priority',717
    )
  );

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','IN_PROGRESS_STAGE6_ALL_SUBCLASSES_READY',
        'runtime_stage',6,
        'stage6_legacy_subclasses_runtime',true,
        'stage6_legacy_subclass_count',5,
        'stage6_legacy_subclass_roster',jsonb_build_array(
          'swashbuckler','inquisitive','mastermind','scout','phantom'
        ),
        'subclass_runtime_included',true,
        'supported_subclass_count',9,
        'next_stage','rogue_final_production_certification'
      ),
      updated_at=now()
  where id=v_rogue;
end;
$function$;

revoke all on function private.ensure_rogue_stage6_legacy_subclasses_v1(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_rogue_stage6_legacy_subclasses_v1(uuid)
to service_role;

create or replace function private.ensure_rogue_stage6_legacy_subclasses_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_rogue_stage5_phb_subclasses_v1(new.id);
  perform private.ensure_rogue_stage6_legacy_subclasses_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_rogue_stage6_legacy_subclasses_v1_after_campaign()
from public,anon,authenticated;

drop trigger if exists q_campaigns_ensure_rogue_stage6_legacy_subclasses_v1
on public.campaigns;
create trigger q_campaigns_ensure_rogue_stage6_legacy_subclasses_v1
after insert on public.campaigns
for each row execute function private.ensure_rogue_stage6_legacy_subclasses_v1_after_campaign();

do $apply$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_rogue_stage6_legacy_subclasses_v1(r.id);
  end loop;
end;
$apply$;

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
      and s.kind='subclass' and s.is_active
      and s.parent_template_id=r.id
      and s.catalog_key in (
        'subclass:rogue:thief','subclass:rogue:assassin',
        'subclass:rogue:arcane-trickster','subclass:rogue:soulknife',
        'subclass:rogue:swashbuckler','subclass:rogue:inquisitive',
        'subclass:rogue:mastermind','subclass:rogue:scout',
        'subclass:rogue:phantom'
      );
    if v_count<>9 then raise exception 'ROGUE_STAGE6_ROSTER:%:%',r.campaign_id,v_count; end if;

    select count(*) into v_bad
    from public.rule_templates s
    where s.campaign_id=r.campaign_id
      and s.kind='subclass' and s.is_active
      and (s.catalog_key like 'subclass:rogue:%' or s.slug like 'rogue-%')
      and s.catalog_key not in (
        'subclass:rogue:thief','subclass:rogue:assassin',
        'subclass:rogue:arcane-trickster','subclass:rogue:soulknife',
        'subclass:rogue:swashbuckler','subclass:rogue:inquisitive',
        'subclass:rogue:mastermind','subclass:rogue:scout',
        'subclass:rogue:phantom'
      );
    if v_bad<>0 then raise exception 'ROGUE_STAGE6_UNSUPPORTED_SUBCLASS_ACTIVE:%:%',r.campaign_id,v_bad; end if;

    select c.value into v_choice
    from public.rule_templates s
    join public.rule_template_levels l on l.template_id=s.id and l.level=3
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
    where s.campaign_id=r.campaign_id
      and s.catalog_key='subclass:rogue:phantom' and s.is_active
      and c.value->>'key'='phantom_whispers_proficiency'
    limit 1;
    if v_choice is null
       or v_choice->>'refresh'<>'short_or_long_rest'
       or v_choice->'option_provider'->>'kind'<>'unproficient_skill_or_tool'
    then
      raise exception 'ROGUE_STAGE6_PHANTOM_WHISPERS_INVALID:%',r.campaign_id;
    end if;

    if not exists(
      select 1
      from public.rule_templates s
      join public.rule_template_levels l on l.template_id=s.id and l.level=17
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where s.campaign_id=r.campaign_id
        and s.catalog_key='subclass:rogue:phantom' and s.is_active
        and m.value->>'type'='resource'
        and m.value->>'key'='phantom_soul_trinkets'
        and m.value->'recoveryRules' @>
          '[{"trigger":"long_rest","restore":"ensure_minimum","amount":1}]'::jsonb
    ) then
      raise exception 'ROGUE_STAGE6_DEATHS_FRIEND_RECOVERY_INVALID:%',r.campaign_id;
    end if;

    if exists(
      select 1
      from public.rule_templates s
      join public.rule_template_levels l on l.template_id=s.id
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where s.campaign_id=r.campaign_id
        and s.catalog_key='subclass:rogue:mastermind' and s.is_active
        and coalesce(m.value::text,'') ilike '%insight_detector%'
    ) then
      raise exception 'ROGUE_STAGE6_MASTERMIND_INVENTED_DETECTOR:%',r.campaign_id;
    end if;

    if not exists(
      select 1
      from public.rule_templates s
      join public.rule_template_levels l on l.template_id=s.id and l.level=17
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where s.campaign_id=r.campaign_id
        and s.catalog_key='subclass:rogue:scout' and s.is_active
        and m.value->>'key'='subclass:rogue:scout:sudden-strike'
        and (m.value->'payload'->'mechanic'->>'attackMayTargetAnyLegalTarget')::boolean=true
        and (m.value->'payload'->'mechanic'->>'secondSneakAttackMustUseDifferentTarget')::boolean=true
    ) then
      raise exception 'ROGUE_STAGE6_SCOUT_SUDDEN_STRIKE_INVALID:%',r.campaign_id;
    end if;

    if coalesce((r.rules_meta->>'stage6_legacy_subclasses_runtime')::boolean,false)<>true
       or coalesce((r.rules_meta->>'supported_subclass_count')::integer,0)<>9
       or r.rules_meta->>'mechanics_status'<>'IN_PROGRESS_STAGE6_ALL_SUBCLASSES_READY'
    then
      raise exception 'ROGUE_STAGE6_PARENT_STATUS_INVALID:%',r.campaign_id;
    end if;
  end loop;
end;
$cert$;

commit;
