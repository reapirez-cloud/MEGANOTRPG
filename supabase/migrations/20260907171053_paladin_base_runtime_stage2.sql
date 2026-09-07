-- CLASS_MIGRATION_SCOPE: runtime
-- CLASS_INTEGRATION_STRICT: class:paladin
-- CLASS_WORK_STATUS: paladin:base-runtime=READY_STAGE2, paladin:spells=PENDING_STAGE3
begin;

create or replace function public.use_character_template_resource_action_amount_v1(
  p_character_id uuid,
  p_mechanic_id text,
  p_amount integer,
  p_option_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_i integer;
  v_result jsonb;
begin
  if p_amount is null or p_amount < 1 then
    raise exception 'RESOURCE_ACTION_AMOUNT_INVALID:%', coalesce(p_amount, 0);
  end if;
  if p_amount > 1000 then
    raise exception 'RESOURCE_ACTION_AMOUNT_TOO_LARGE:%', p_amount;
  end if;
  if nullif(btrim(coalesce(p_mechanic_id, '')), '') is null then
    raise exception 'MECHANIC_ID_REQUIRED';
  end if;
  for v_i in 1..p_amount loop
    v_result := public.use_character_template_resource_action(p_character_id,p_mechanic_id,p_option_key);
  end loop;
  return jsonb_build_object('character_id',p_character_id,'mechanic_id',p_mechanic_id,'option_key',p_option_key,'amount',p_amount,'last_result',v_result);
end;
$function$;

revoke all on function public.use_character_template_resource_action_amount_v1(uuid,text,integer,text) from public,anon;
grant execute on function public.use_character_template_resource_action_amount_v1(uuid,text,integer,text) to authenticated,service_role;
comment on function public.use_character_template_resource_action_amount_v1(uuid,text,integer,text) is
'Generic atomic wrapper for per-unit Character Engine resource actions; used by variable-cost features such as Lay on Hands.';

create or replace function private.ensure_paladin_base_runtime_stage2_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_paladin uuid;
  v_level integer;
  v_add jsonb;
  v_choice jsonb;
  v_weapon_catalog jsonb := $weapons$[
    {"key":"club","label":"Дубинка","mastery":"slow"},{"key":"dagger","label":"Кинжал","mastery":"nick"},{"key":"greatclub","label":"Большая дубина","mastery":"push"},{"key":"handaxe","label":"Ручной топор","mastery":"vex"},{"key":"javelin","label":"Метательное копьё","mastery":"slow"},{"key":"light-hammer","label":"Лёгкий молот","mastery":"nick"},{"key":"mace","label":"Булава","mastery":"sap"},{"key":"quarterstaff","label":"Боевой посох","mastery":"topple"},{"key":"sickle","label":"Серп","mastery":"nick"},{"key":"spear","label":"Копьё","mastery":"sap"},{"key":"dart","label":"Дротик","mastery":"vex"},{"key":"light-crossbow","label":"Лёгкий арбалет","mastery":"slow"},{"key":"shortbow","label":"Короткий лук","mastery":"vex"},{"key":"sling","label":"Праща","mastery":"slow"},{"key":"battleaxe","label":"Боевой топор","mastery":"topple"},{"key":"flail","label":"Цеп","mastery":"sap"},{"key":"glaive","label":"Глефа","mastery":"graze"},{"key":"greataxe","label":"Двуручный топор","mastery":"cleave"},{"key":"greatsword","label":"Двуручный меч","mastery":"graze"},{"key":"halberd","label":"Алебарда","mastery":"cleave"},{"key":"lance","label":"Кавалерийское копьё","mastery":"topple"},{"key":"longsword","label":"Длинный меч","mastery":"sap"},{"key":"maul","label":"Кувалда","mastery":"topple"},{"key":"morningstar","label":"Моргенштерн","mastery":"sap"},{"key":"pike","label":"Пика","mastery":"push"},{"key":"rapier","label":"Рапира","mastery":"vex"},{"key":"scimitar","label":"Скимитар","mastery":"nick"},{"key":"shortsword","label":"Короткий меч","mastery":"vex"},{"key":"trident","label":"Трезубец","mastery":"topple"},{"key":"warhammer","label":"Боевой молот","mastery":"push"},{"key":"war-pick","label":"Боевой клевец","mastery":"sap"},{"key":"whip","label":"Кнут","mastery":"slow"},{"key":"blowgun","label":"Духовая трубка","mastery":"vex"},{"key":"hand-crossbow","label":"Ручной арбалет","mastery":"vex"},{"key":"heavy-crossbow","label":"Тяжёлый арбалет","mastery":"push"},{"key":"longbow","label":"Длинный лук","mastery":"slow"},{"key":"musket","label":"Мушкет","mastery":"slow"},{"key":"pistol","label":"Пистолет","mastery":"vex"}
  ]$weapons$::jsonb;
  v_style_catalog jsonb := $styles$[
    {"key":"archery","label":"Стрельба","runtime":{"kind":"fighting_style","style":"archery","attackBonus":2,"condition":{"weaponCategory":"ranged"}}},
    {"key":"blind-fighting","label":"Бой вслепую","runtime":{"kind":"fighting_style","style":"blind_fighting","blindsightFeet":10}},
    {"key":"defense","label":"Оборона","runtime":{"kind":"fighting_style","style":"defense","acBonus":1,"condition":{"wearingArmor":["light","medium","heavy"]}}},
    {"key":"dueling","label":"Дуэлянт","runtime":{"kind":"fighting_style","style":"dueling","damageBonus":2,"condition":{"weapon":"melee_one_handed","noOtherWeapon":true}}},
    {"key":"great-weapon-fighting","label":"Бой большим оружием","runtime":{"kind":"fighting_style","style":"great_weapon_fighting","damageDieMinimum":3,"condition":{"weapon":"melee_two_handed","propertyAny":["two_handed","versatile"]}}},
    {"key":"interception","label":"Перехват","runtime":{"kind":"fighting_style","style":"interception","economy":"reaction","rangeFeet":5,"damageReduction":{"dice":"1d10","plus":"proficiency_bonus"},"condition":{"holdingAny":["shield","simple_weapon","martial_weapon"]}}},
    {"key":"protection","label":"Защита","runtime":{"kind":"fighting_style","style":"protection","economy":"reaction","rangeFeet":5,"condition":{"holding":"shield","targetOtherThanSelf":true},"effect":{"attackDisadvantage":"until_start_of_your_next_turn_if_within_5ft"}}},
    {"key":"thrown-weapon-fighting","label":"Бой метательным оружием","runtime":{"kind":"fighting_style","style":"thrown_weapon_fighting","damageBonus":2,"condition":{"attack":"ranged","weaponProperty":"thrown"}}},
    {"key":"two-weapon-fighting","label":"Бой двумя оружиями","runtime":{"kind":"fighting_style","style":"two_weapon_fighting","effect":{"addAbilityModifierToLightExtraAttackDamage":true}}},
    {"key":"unarmed-fighting","label":"Безоружный бой","runtime":{"kind":"fighting_style","style":"unarmed_fighting","unarmedDamageDie":"1d6","unarmedDamageDieEmptyHands":"1d8","ability":"strength","grappledTargetStartTurnDamage":"1d4"}},
    {"key":"blessed-warrior","label":"Благословенный воин","runtime":{"kind":"fighting_style","style":"blessed_warrior","clericCantrips":2,"spellcastingAbility":"charisma","spellRuntimeStage":3}}
  ]$styles$::jsonb;
  v_weapon_choice jsonb;
  v_fighting_choice jsonb;
  v_stage2 jsonb := $stage2${
    "1":[
      {"id":"paladin-lay-on-hands-resource","type":"resource","sourceKey":"lay-on-hands","grantOperation":"REPLACE","priority":1,"key":"lay_on_hands","label":"Наложение рук","max":{"kind":"multiply","factors":[{"kind":"literal","value":5},{"kind":"reference","key":"source.level"}]},"recharge":["long_rest"],"recoveryRules":[{"trigger":"long_rest","restore":"full"}],"restore":"full","initial":"full","presentation":{"tone":"green","icon":"✚","display":"counter","priority":90}},
      {"id":"paladin-lay-on-hands-action","type":"action","sourceKey":"lay-on-hands","key":"lay_on_hands","label":"Наложение рук","economy":"bonus_action","range":{"kind":"touch"},"tags":["unique","class","healing","variable-cost","cost-unit:1"],"resourceKey":"lay_on_hands","resourceCost":1,"effects":[{"key":"lay_on_hands_heal","kind":"semantic","payload":{"hpPerPoint":1,"amountArgument":"amount","max":"resource.current"}}],"presentation":{"tone":"green","icon":"✚","display":"counter","priority":90}}
    ],
    "3":[
      {"id":"paladin-channel-divinity-l3","type":"resource","sourceKey":"channel-divinity","grantOperation":"REPLACE","priority":3,"key":"channel_divinity","label":"Божественный канал","max":2,"recharge":["short_rest","long_rest"],"recoveryRules":[{"trigger":"short_rest","restore":"amount","amount":1},{"trigger":"long_rest","restore":"full"}],"restore":"full","initial":"full","presentation":{"tone":"cyan","icon":"✦","display":"pips","priority":88}},
      {"id":"paladin-divine-sense-action","type":"action","sourceKey":"channel-divinity","key":"divine_sense","label":"Божественное чутьё","economy":"bonus_action","range":{"kind":"self"},"tags":["unique","class","duration:10m","range:60ft","semantic"],"resourceKey":"channel_divinity","resourceCost":1,"effects":[{"key":"divine_sense","kind":"semantic","payload":{"durationMinutes":10,"endsWhen":"incapacitated","rangeFeet":60,"creatureTypes":["celestial","fiend","undead"],"revealsLocation":true,"revealsCreatureType":true,"detectsConsecratedDesecratedPlacesAndObjects":true}}],"presentation":{"tone":"cyan","icon":"✦","display":"counter","priority":88}}
    ],
    "9":[
      {"id":"paladin-abjure-foes-action","type":"action","sourceKey":"abjure-foes","key":"abjure_foes","label":"Изгнание врагов","economy":"magic_action","range":{"kind":"ranged","unit":"ft","normal":60},"tags":["unique","class","save:wisdom","frightened","duration:1m","semantic"],"resourceKey":"channel_divinity","resourceCost":1,"effects":[{"key":"abjure_foes","kind":"semantic","payload":{"targetCount":{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.charisma.modifier"}]},"mustSee":true,"rangeFeet":60,"saveAbility":"wisdom","saveDc":"paladin_spell_save_dc","onFail":{"condition":"frightened","duration":"1_minute_or_until_damage","turnRestriction":"choose_one_of_move_action_bonus_action"}}}],"presentation":{"tone":"amber","icon":"◆","display":"counter","priority":88}}
    ],
    "11":[
      {"id":"paladin-channel-divinity-l11","type":"resource","sourceKey":"channel-divinity","grantOperation":"REPLACE","priority":11,"key":"channel_divinity","label":"Божественный канал","max":3,"recharge":["short_rest","long_rest"],"recoveryRules":[{"trigger":"short_rest","restore":"amount","amount":1},{"trigger":"long_rest","restore":"full"}],"restore":"full","initial":"full","presentation":{"tone":"cyan","icon":"✦","display":"pips","priority":88}}
    ],
    "14":[
      {"id":"paladin-restoring-touch-action","type":"action","sourceKey":"restoring-touch","key":"restoring_touch","label":"Целительное касание","economy":"bonus_action","range":{"kind":"touch"},"tags":["class","same-lay-on-hands-use","condition-removal","semantic"],"costOptions":[{"key":"blinded","label":"Снять Ослепление","costs":[{"key":"lay_on_hands","amount":5}]},{"key":"charmed","label":"Снять Очарование","costs":[{"key":"lay_on_hands","amount":5}]},{"key":"deafened","label":"Снять Глухоту","costs":[{"key":"lay_on_hands","amount":5}]},{"key":"frightened","label":"Снять Испуг","costs":[{"key":"lay_on_hands","amount":5}]},{"key":"paralyzed","label":"Снять Паралич","costs":[{"key":"lay_on_hands","amount":5}]},{"key":"stunned","label":"Снять Оглушение","costs":[{"key":"lay_on_hands","amount":5}]}],"effects":[{"key":"restoring_touch","kind":"semantic","payload":{"conditionFromOption":true,"costPerCondition":5,"pointsDoNotHeal":true,"repeatableWithinSameLayOnHandsUse":true}}],"presentation":{"tone":"green","icon":"✚","display":"counter","priority":88}}
    ]
  }$stage2$::jsonb;
  v_feature_runtime jsonb := $features${
    "paladin-lay-on-hands-feature-l1":{"description":"После долгого отдыха запас равен 5 × уровень Паладина. Бонусным действием касанием можно потратить любое число оставшихся очков и восстановить столько же HP.","runtime":{"kind":"resource_feature","resourceKey":"lay_on_hands","maxFormula":"5 * paladin_level","economy":"bonus_action","range":"touch","longRestRestore":"full"}},
    "paladin-weapon-mastery-feature-l1":{"description":"Выбирает два вида оружия, которыми владеет, и использует их свойства мастерства; оба выбора можно сменить после долгого отдыха.","runtime":{"kind":"choice_feature","choiceKey":"paladin-weapon-mastery","count":2,"refresh":"long_rest"}},
    "paladin-fighting-style-feature-l2":{"description":"Получает один талант Боевого стиля либо выбирает «Благословенного воина».","runtime":{"kind":"choice_feature","choiceKey":"paladin-fighting-style","count":1}},
    "paladin-channel-divinity-feature-l3":{"description":"Имеет 2 заряда Божественного канала; после короткого отдыха возвращается 1 потраченный заряд, после долгого — все. На 11 уровне максимум становится 3.","runtime":{"kind":"resource_feature","resourceKey":"channel_divinity","maxByLevel":{"3":2,"11":3},"shortRestRecovery":{"mode":"add","amount":1},"longRestRecovery":{"mode":"full"}}},
    "paladin-extra-attack-feature-l5":{"description":"При действии Атака на своём ходу может атаковать дважды вместо одного раза.","runtime":{"kind":"passive","attackActionAttacks":2,"onOwnTurn":true}},
    "paladin-aura-of-protection-feature-l6":{"description":"Пока Паладин не Недееспособен, он и союзники в его Ауре защиты получают к спасброскам бонус, равный модификатору Харизмы (минимум +1). Радиус ауры — 10 футов.","runtime":{"kind":"aura","radiusFeet":10,"inactiveCondition":"incapacitated","targets":["self","allies"],"saveBonus":{"abilityModifier":"charisma","minimum":1},"stacking":"one_aura_of_protection"}},
    "paladin-abjure-foes-feature-l9":{"description":"Магическим действием тратит 1 заряд Божественного канала и выбирает видимых существ в пределах 60 футов числом до модификатора Харизмы (минимум 1). При провале спасброска Мудрости цель Испугана на 1 минуту или пока не получит урон; в таком состоянии на своём ходу она выбирает только одно: движение, действие или бонусное действие.","runtime":{"kind":"resource_action_feature","actionId":"paladin-abjure-foes-action","resourceKey":"channel_divinity","resourceCost":1}},
    "paladin-aura-of-courage-feature-l10":{"description":"Паладин и союзники в его Ауре защиты иммунны к Испугу. Если испуганный союзник входит в ауру, Испуг не действует на него, пока он остаётся в ауре.","runtime":{"kind":"aura_extension","auraKey":"aura_of_protection","grantsConditionImmunity":"frightened"}},
    "paladin-radiant-strikes-feature-l11":{"description":"При попадании атакой ближнего оружия или Безоружным ударом цель получает дополнительно 1d8 урона излучением.","runtime":{"kind":"passive_damage","trigger":"hit","attackAny":["melee_weapon","unarmed_strike"],"extraDamage":{"dice":"1d8","type":"radiant"}}},
    "paladin-restoring-touch-feature-l14":{"description":"При использовании Наложения рук можно дополнительно снять Ослепление, Очарование, Глухоту, Испуг, Паралич или Оглушение, тратя 5 очков запаса за каждое снятое состояние; эти очки не восстанавливают HP.","runtime":{"kind":"resource_action_feature","actionId":"paladin-restoring-touch-action","resourceKey":"lay_on_hands","costPerCondition":5,"conditions":["blinded","charmed","deafened","frightened","paralyzed","stunned"]}},
    "paladin-aura-expansion-feature-l18":{"description":"Радиус Ауры защиты увеличивается до 30 футов; связанные с ней ауры Паладина используют тот же расширенный радиус.","runtime":{"kind":"aura_upgrade","auraKey":"aura_of_protection","radiusFeet":30}}
  }$features$::jsonb;
begin
  perform private.ensure_paladin_catalog_stage1_v1(p_campaign_id);

  select id into v_paladin from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:paladin' and is_active
  order by version desc,created_at desc limit 1;
  if v_paladin is null then raise exception 'PALADIN_STAGE2_ACTIVE_TEMPLATE_NOT_FOUND:%',p_campaign_id; end if;

  select jsonb_build_object(
    'key','paladin-weapon-mastery','label','Мастерство владения оружием','target','feature','count',2,
    'selection_mode','player_once','refresh','long_rest',
    'options',coalesce(jsonb_agg(to_jsonb('weapon:'||(x->>'key')) order by ord),'[]'::jsonb),
    'option_labels',coalesce(jsonb_object_agg('weapon:'||(x->>'key'),x->>'label'),'{}'::jsonb),
    'option_mechanics',coalesce(jsonb_object_agg('weapon:'||(x->>'key'),jsonb_build_array(jsonb_build_object(
      'id','paladin-weapon-mastery-'||(x->>'key'),'type','grant','sourceKey','weapon-mastery','target','feature',
      'key','class:paladin:weapon-mastery:'||(x->>'key'),
      'payload',jsonb_build_object('label','Мастерство: '||(x->>'label'),'weaponKey',x->>'key','mastery',x->>'mastery',
        'runtime',jsonb_build_object('kind','weapon_mastery','weaponKey',x->>'key','mastery',x->>'mastery'))
    ))),'{}'::jsonb)
  ) into v_weapon_choice
  from jsonb_array_elements(v_weapon_catalog) with ordinality w(x,ord);

  select jsonb_build_object(
    'key','paladin-fighting-style','label','Боевой стиль','target','feature','count',1,'selection_mode','player_once',
    'options',coalesce(jsonb_agg(to_jsonb('style:'||(x->>'key')) order by ord),'[]'::jsonb),
    'option_labels',coalesce(jsonb_object_agg('style:'||(x->>'key'),x->>'label'),'{}'::jsonb),
    'option_mechanics',coalesce(jsonb_object_agg('style:'||(x->>'key'),jsonb_build_array(jsonb_build_object(
      'id','paladin-style-'||(x->>'key'),'type','grant','sourceKey','fighting-style','target','feature',
      'key','class:paladin:fighting-style:'||(x->>'key'),'payload',jsonb_build_object('label',x->>'label','runtime',x->'runtime')
    ))),'{}'::jsonb)
  ) into v_fighting_choice
  from jsonb_array_elements(v_style_catalog) with ordinality s(x,ord);

  v_choice:=v_weapon_choice;
  update public.rule_template_levels l set choices=(
    select coalesce(jsonb_agg(e.value order by e.ord) filter(where coalesce(e.value->>'key','')<>v_choice->>'key'),'[]'::jsonb)||jsonb_build_array(v_choice)
    from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality e(value,ord)
  ) where l.template_id=v_paladin and l.level=1;

  v_choice:=v_fighting_choice;
  update public.rule_template_levels l set choices=(
    select coalesce(jsonb_agg(e.value order by e.ord) filter(where coalesce(e.value->>'key','')<>v_choice->>'key'),'[]'::jsonb)||jsonb_build_array(v_choice)
    from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality e(value,ord)
  ) where l.template_id=v_paladin and l.level=2;

  for v_level in select value::integer from jsonb_object_keys(v_stage2) k(value) loop
    v_add:=v_stage2->(v_level::text);
    update public.rule_template_levels l set mechanics=(
      select coalesce(jsonb_agg(e.value order by e.ord) filter(where not exists(
        select 1 from jsonb_array_elements(v_add) a(value) where a.value->>'id'=e.value->>'id'
      )),'[]'::jsonb)||v_add
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(value,ord)
    ) where l.template_id=v_paladin and l.level=v_level;
  end loop;

  update public.rule_template_levels l set mechanics=(
    select coalesce(jsonb_agg(case when v_feature_runtime?coalesce(e.value->>'id','') then
      jsonb_set(jsonb_set(e.value,'{payload,description}',to_jsonb(v_feature_runtime->(e.value->>'id')->>'description'),true),
        '{payload,runtime}',v_feature_runtime->(e.value->>'id')->'runtime',true)
      else e.value end order by e.ord),'[]'::jsonb)
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(value,ord)
  ) where l.template_id=v_paladin and exists(
    select 1 from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) x(value)
    where v_feature_runtime?coalesce(x.value->>'id','')
  );

  update public.rule_templates set
    catalog_revision='xphb-2024-paladin-base-runtime-v1',
    rules_meta=jsonb_set(
      coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'class_key','paladin','class_identity','paladin','rules_revision','2024','mechanics_status','BASE_RUNTIME_READY_STAGE2',
        'runtime_stage',2,'runtime_revision','xphb-2024-paladin-base-runtime-v1','feature_runtime_included',true,
        'spell_runtime_included',false,'subclass_runtime_included',false,'lay_on_hands_resource','lay_on_hands',
        'channel_divinity_resource','channel_divinity','weapon_mastery_choice_key','paladin-weapon-mastery',
        'fighting_style_choice_key','paladin-fighting-style','stage3_deferred',jsonb_build_array('spellcasting','paladin_s_smite','faithful_steed'),
        'contextual_runtime_policy','structured_semantic_until_authoritative_combat_spatial_facts'
      ),'{core_traits}',coalesce(rules_meta->'core_traits','{}'::jsonb)||jsonb_build_object('primary_abilities',jsonb_build_array('strength','charisma')),true
    ),updated_at=now()
  where id=v_paladin;
end;
$function$;

revoke all on function private.ensure_paladin_base_runtime_stage2_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_paladin_base_runtime_stage2_v1(uuid) to service_role;

create or replace function private.ensure_paladin_base_runtime_stage2_v1_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $function$
begin perform private.ensure_paladin_base_runtime_stage2_v1(new.id); return new; end;$function$;
revoke all on function private.ensure_paladin_base_runtime_stage2_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaad_campaigns_ensure_paladin_base_runtime_stage2_v1 on public.campaigns;
create trigger aaaaaaaad_campaigns_ensure_paladin_base_runtime_stage2_v1 after insert on public.campaigns
for each row execute function private.ensure_paladin_base_runtime_stage2_v1_after_campaign();

do $block$ declare v_campaign record; begin
  for v_campaign in select id from public.campaigns loop perform private.ensure_paladin_base_runtime_stage2_v1(v_campaign.id); end loop;
end;$block$;

commit;