-- CLASS_MIGRATION_SCOPE: runtime
-- CLASS_INTEGRATION_STRICT: class:paladin
-- CLASS_WORK_STATUS: paladin:subclasses=READY_STAGE4, paladin:final-certification=PENDING
begin;

create or replace function private.ensure_paladin_phb2024_subclasses_stage4_v2(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_devotion uuid;
  v_glory uuid;
  v_ancients uuid;
  v_vengeance uuid;
begin
  perform private.ensure_paladin_spell_runtime_stage3_v1(p_campaign_id);

  v_devotion:=private.paladin_stage4_upsert_subclass_v2(
    p_campaign_id,'subclass:paladin:devotion','oath-of-devotion','Клятва преданности',
    'Священное оружие, защита от чар и сияющая верхняя форма.',
    'Священное оружие, защита от чар и сияющая верхняя форма. Сначала разберитесь, когда способность включается и что расходует; красивое название ещё ни разу не вернуло потраченный заряд.',
    'Клятва звучит возвышенно, пока не приходится соблюдать её под дождём, в крови и перед особенно убедительной дверью.'
  );
  v_glory:=private.paladin_stage4_upsert_subclass_v2(
    p_campaign_id,'subclass:paladin:glory','oath-of-glory','Клятва славы',
    'Атлетизм, скорость союзников, отражение ударов и героическая вершина.',
    'Атлетизм, скорость союзников, отражение ударов и героическая вершина. Сначала разберитесь, когда способность включается и что расходует; красивое название ещё ни разу не вернуло потраченный заряд.',
    'Клятва звучит возвышенно, пока не приходится соблюдать её под дождём, в крови и перед особенно убедительной дверью.'
  );
  v_ancients:=private.paladin_stage4_upsert_subclass_v2(
    p_campaign_id,'subclass:paladin:ancients','oath-of-the-ancients','Клятва древних',
    'Природный свет, защита от магии и исключительная живучесть.',
    'Природный свет, защита от магии и исключительная живучесть. Сначала разберитесь, когда способность включается и что расходует; красивое название ещё ни разу не вернуло потраченный заряд.',
    'Клятва звучит возвышенно, пока не приходится соблюдать её под дождём, в крови и перед особенно убедительной дверью.'
  );
  v_vengeance:=private.paladin_stage4_upsert_subclass_v2(
    p_campaign_id,'subclass:paladin:vengeance','oath-of-vengeance','Клятва мести',
    'Клятва против одной цели, неотступное преследование и ответные атаки.',
    'Клятва против одной цели, неотступное преследование и ответные атаки. Сначала разберитесь, когда способность включается и что расходует; красивое название ещё ни разу не вернуло потраченный заряд.',
    'Клятва звучит возвышенно, пока не приходится соблюдать её под дождём, в крови и перед особенно убедительной дверью.'
  );

  perform private.paladin_stage4_set_level_v2(v_devotion,3,
    $j$[
      {"id":"devotion-sacred-weapon-feature","type":"grant","sourceKey":"sacred-weapon","target":"feature","key":"class:paladin:devotion:sacred-weapon","payload":{"label":"Священное оружие","description":"При действии Атака можно потратить Божественный канал и освятить удерживаемое оружие на 10 минут.","runtime":{"kind":"channel_divinity_feature","activation":"attack_action","durationMinutes":10,"attackBonus":{"abilityModifier":"charisma","minimum":1},"damageTypeChoice":["normal","radiant"],"brightLightFeet":20,"dimLightAdditionalFeet":20}}},
      {"id":"devotion-sacred-weapon-action","type":"action","sourceKey":"sacred-weapon","key":"sacred_weapon","label":"Священное оружие","economy":"attack_action","resourceKey":"channel_divinity","resourceCost":1,"tags":["class","channel-divinity","duration:10m","semantic"],"effects":[{"key":"sacred_weapon","kind":"semantic","payload":{"durationMinutes":10,"weapon":"held_melee_weapon","attackBonus":{"abilityModifier":"charisma","minimum":1},"radiantDamageOption":true,"brightLightFeet":20,"dimLightAdditionalFeet":20}}]}
    ]$j$::jsonb
    ||jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('protection-from-evil-and-good','devotion-oath-spells'),private.paladin_stage4_spell_mechanic_v2('shield-of-faith','devotion-oath-spells'))
  );
  perform private.paladin_stage4_set_level_v2(v_devotion,5,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('aid','devotion-oath-spells'),private.paladin_stage4_spell_mechanic_v2('zone-of-truth','devotion-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_devotion,7,$j$[
    {"id":"devotion-aura-feature","type":"grant","sourceKey":"aura-of-devotion","target":"feature","key":"class:paladin:devotion:aura-of-devotion","payload":{"label":"Аура преданности","description":"Вы и союзники в Ауре защиты иммунны к Очарованию; уже наложенное Очарование подавляется, пока существо остаётся в ауре.","runtime":{"kind":"aura_extension","auraKey":"aura_of_protection","conditionImmunity":"charmed","suppressExistingCondition":true}}}
  ]$j$::jsonb);
  perform private.paladin_stage4_set_level_v2(v_devotion,9,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('beacon-of-hope','devotion-oath-spells'),private.paladin_stage4_spell_mechanic_v2('dispel-magic','devotion-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_devotion,13,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('freedom-of-movement','devotion-oath-spells'),private.paladin_stage4_spell_mechanic_v2('guardian-of-faith','devotion-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_devotion,15,$j$[
    {"id":"devotion-smite-protection-feature","type":"grant","sourceKey":"smite-of-protection","target":"feature","key":"class:paladin:devotion:smite-of-protection","payload":{"label":"Кара защиты","description":"После применения Божественной кары вы и союзники в Ауре защиты получаете половинное укрытие до начала вашего следующего хода.","runtime":{"kind":"triggered_aura","trigger":"cast_divine_smite","duration":"until_start_of_next_turn","auraKey":"aura_of_protection","halfCover":true,"acBonus":2,"dexSaveBonus":2}}}
  ]$j$::jsonb);
  perform private.paladin_stage4_set_level_v2(v_devotion,17,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('commune','devotion-oath-spells'),private.paladin_stage4_spell_mechanic_v2('flame-strike','devotion-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_devotion,20,$j$[
    {"id":"devotion-holy-nimbus-resource","type":"resource","sourceKey":"holy-nimbus","grantOperation":"REPLACE","priority":20,"key":"devotion_holy_nimbus","label":"Священный нимб","max":1,"initial":"full","restore":"full","recharge":["long_rest"],"recoveryRules":[{"trigger":"long_rest","restore":"full"}]},
    {"id":"devotion-holy-nimbus-action","type":"action","sourceKey":"holy-nimbus","key":"holy_nimbus","label":"Священный нимб","economy":"bonus_action","resourceKey":"devotion_holy_nimbus","resourceCost":1,"tags":["class","duration:10m","semantic"],"effects":[{"key":"holy_nimbus","kind":"semantic","payload":{"durationMinutes":10,"auraKey":"aura_of_protection","brightLight":"sunlight","enemyStartTurnRadiantDamage":"charisma_modifier + proficiency_bonus"}}]},
    {"id":"devotion-holy-nimbus-recharge","type":"action","sourceKey":"holy-nimbus","key":"holy_nimbus_recharge","label":"Восстановить Священный нимб","economy":"free","costOptions":[{"key":"slot-5","label":"Потратить ячейку 5 уровня","costs":[{"key":"spell_slot_5","amount":1}]}],"effects":[{"key":"restore_holy_nimbus","kind":"resource","resourceKey":"devotion_holy_nimbus","operation":"RESTORE","amount":1}]}
  ]$j$::jsonb);

  perform private.paladin_stage4_set_level_v2(v_glory,3,
    $j$[
      {"id":"glory-inspiring-smite-feature","type":"grant","sourceKey":"inspiring-smite","target":"feature","key":"class:paladin:glory:inspiring-smite","payload":{"label":"Вдохновляющая кара","description":"Сразу после Божественной кары можно потратить Божественный канал и распределить 2d8 + уровень Паладина временных HP между выбранными существами в 30 футах.","runtime":{"kind":"channel_divinity_feature","trigger":"immediately_after_cast_divine_smite","rangeFeet":30,"tempHpPool":"2d8 + paladin_level","distribution":"chosen_creatures"}}},
      {"id":"glory-inspiring-smite-action","type":"action","sourceKey":"inspiring-smite","key":"inspiring_smite","label":"Вдохновляющая кара","economy":"triggered","resourceKey":"channel_divinity","resourceCost":1,"tags":["class","channel-divinity","after-divine-smite","semantic"],"effects":[{"key":"inspiring_smite","kind":"semantic","payload":{"rangeFeet":30,"tempHpPool":"2d8 + paladin_level","distribution":"chosen_creatures"}}]},
      {"id":"glory-peerless-athlete-feature","type":"grant","sourceKey":"peerless-athlete","target":"feature","key":"class:paladin:glory:peerless-athlete","payload":{"label":"Несравненный атлет","description":"Бонусным действием тратит Божественный канал: на 1 час Преимущество Атлетики и Акробатики, а длина и высота прыжков увеличиваются на 10 футов.","runtime":{"kind":"channel_divinity_feature","economy":"bonus_action","durationMinutes":60,"advantageChecks":["athletics","acrobatics"],"jumpBonusFeet":10}}},
      {"id":"glory-peerless-athlete-action","type":"action","sourceKey":"peerless-athlete","key":"peerless_athlete","label":"Несравненный атлет","economy":"bonus_action","resourceKey":"channel_divinity","resourceCost":1,"tags":["class","channel-divinity","duration:1h","semantic"],"effects":[{"key":"peerless_athlete","kind":"semantic","payload":{"durationMinutes":60,"advantageChecks":["athletics","acrobatics"],"jumpBonusFeet":10}}]}
    ]$j$::jsonb
    ||jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('guiding-bolt','glory-oath-spells'),private.paladin_stage4_spell_mechanic_v2('heroism','glory-oath-spells'))
  );
  perform private.paladin_stage4_set_level_v2(v_glory,5,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('enhance-ability','glory-oath-spells'),private.paladin_stage4_spell_mechanic_v2('magic-weapon','glory-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_glory,7,$j$[
    {"id":"glory-aura-alacrity-feature","type":"grant","sourceKey":"aura-of-alacrity","target":"feature","key":"class:paladin:glory:aura-of-alacrity","payload":{"label":"Аура проворства","description":"Ваша Скорость увеличивается на 10 футов. Союзник, впервые за ход вошедший в Ауру защиты или начавший там ход, получает +10 футов Скорости до конца своего следующего хода.","runtime":{"kind":"aura_extension","auraKey":"aura_of_protection","selfSpeedBonusFeet":10,"allySpeedBonusFeet":10,"allyTrigger":"enter_first_time_or_start_turn","allyDuration":"until_end_of_next_turn"}}}
  ]$j$::jsonb);
  perform private.paladin_stage4_set_level_v2(v_glory,9,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('haste','glory-oath-spells'),private.paladin_stage4_spell_mechanic_v2('protection-from-energy','glory-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_glory,13,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('compulsion','glory-oath-spells'),private.paladin_stage4_spell_mechanic_v2('freedom-of-movement','glory-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_glory,15,$j$[
    {"id":"glory-glorious-defense-resource","type":"resource","sourceKey":"glorious-defense","grantOperation":"REPLACE","priority":15,"key":"glory_glorious_defense","label":"Славная защита","max":{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.charisma.modifier"}]},"initial":"full","restore":"full","recharge":["long_rest"],"recoveryRules":[{"trigger":"long_rest","restore":"full"}]},
    {"id":"glory-glorious-defense-action","type":"action","sourceKey":"glorious-defense","key":"glorious_defense","label":"Славная защита","economy":"reaction","resourceKey":"glory_glorious_defense","resourceCost":1,"tags":["class","reaction","semantic"],"effects":[{"key":"glorious_defense","kind":"semantic","payload":{"trigger":"self_or_visible_creature_within_10ft_hit","acBonus":{"abilityModifier":"charisma","minimum":1},"counterattackOnMiss":true,"counterattack":"one_weapon_attack_if_attacker_in_range"}}]}
  ]$j$::jsonb);
  perform private.paladin_stage4_set_level_v2(v_glory,17,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('legend-lore','glory-oath-spells'),private.paladin_stage4_spell_mechanic_v2('yolande-s-regal-presence','glory-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_glory,20,$j$[
    {"id":"glory-living-legend-resource","type":"resource","sourceKey":"living-legend","grantOperation":"REPLACE","priority":20,"key":"glory_living_legend","label":"Живая легенда","max":1,"initial":"full","restore":"full","recharge":["long_rest"],"recoveryRules":[{"trigger":"long_rest","restore":"full"}]},
    {"id":"glory-living-legend-action","type":"action","sourceKey":"living-legend","key":"living_legend","label":"Живая легенда","economy":"bonus_action","resourceKey":"glory_living_legend","resourceCost":1,"tags":["class","duration:10m","semantic"],"effects":[{"key":"living_legend","kind":"semantic","payload":{"durationMinutes":10,"advantageCharismaChecks":true,"failedSaveRerollReaction":true,"weaponMissToHitOncePerTurn":true}}]},
    {"id":"glory-living-legend-recharge","type":"action","sourceKey":"living-legend","key":"living_legend_recharge","label":"Восстановить Живую легенду","economy":"free","costOptions":[{"key":"slot-5","label":"Потратить ячейку 5 уровня","costs":[{"key":"spell_slot_5","amount":1}]}],"effects":[{"key":"restore_living_legend","kind":"resource","resourceKey":"glory_living_legend","operation":"RESTORE","amount":1}]}
  ]$j$::jsonb);

  perform private.paladin_stage4_set_level_v2(v_ancients,3,
    $j$[
      {"id":"ancients-natures-wrath-feature","type":"grant","sourceKey":"natures-wrath","target":"feature","key":"class:paladin:ancients:natures-wrath","payload":{"label":"Гнев природы","description":"Магическим действием тратит Божественный канал: выбранные видимые существа в эманации 15 футов совершают спасбросок Силы или получают состояние Опутан до 1 минуты, повторяя спасбросок в конце хода.","runtime":{"kind":"channel_divinity_feature","economy":"magic_action","emanationFeet":15,"saveAbility":"strength","condition":"restrained","durationMinutes":1,"repeatSave":"end_of_each_turn"}}},
      {"id":"ancients-natures-wrath-action","type":"action","sourceKey":"natures-wrath","key":"natures_wrath","label":"Гнев природы","economy":"magic_action","resourceKey":"channel_divinity","resourceCost":1,"tags":["class","channel-divinity","save:strength","restrained","semantic"],"effects":[{"key":"natures_wrath","kind":"semantic","payload":{"emanationFeet":15,"targets":"chosen_visible_creatures","saveAbility":"strength","saveDc":"paladin_spell_save_dc","onFailCondition":"restrained","durationMinutes":1,"repeatSave":"end_of_each_turn"}}]}
    ]$j$::jsonb
    ||jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('ensnaring-strike','ancients-oath-spells'),private.paladin_stage4_spell_mechanic_v2('speak-with-animals','ancients-oath-spells'))
  );
  perform private.paladin_stage4_set_level_v2(v_ancients,5,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('misty-step','ancients-oath-spells'),private.paladin_stage4_spell_mechanic_v2('moonbeam','ancients-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_ancients,7,$j$[
    {"id":"ancients-aura-warding-feature","type":"grant","sourceKey":"aura-of-warding","target":"feature","key":"class:paladin:ancients:aura-of-warding","payload":{"label":"Аура защиты","description":"Вы и союзники в Ауре защиты имеют сопротивление некротическому, психическому и лучистому урону.","runtime":{"kind":"aura_extension","auraKey":"aura_of_protection","damageResistance":["necrotic","psychic","radiant"]}}}
  ]$j$::jsonb);
  perform private.paladin_stage4_set_level_v2(v_ancients,9,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('plant-growth','ancients-oath-spells'),private.paladin_stage4_spell_mechanic_v2('protection-from-energy','ancients-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_ancients,13,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('ice-storm','ancients-oath-spells'),private.paladin_stage4_spell_mechanic_v2('stoneskin','ancients-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_ancients,15,$j$[
    {"id":"ancients-undying-sentinel-resource","type":"resource","sourceKey":"undying-sentinel","grantOperation":"REPLACE","priority":15,"key":"ancients_undying_sentinel","label":"Неумирающий страж","max":1,"initial":"full","restore":"full","recharge":["long_rest"],"recoveryRules":[{"trigger":"long_rest","restore":"full"}]},
    {"id":"ancients-undying-sentinel-action","type":"action","sourceKey":"undying-sentinel","key":"undying_sentinel","label":"Неумирающий страж","economy":"triggered","resourceKey":"ancients_undying_sentinel","resourceCost":1,"tags":["class","trigger:0hp","semantic"],"effects":[{"key":"undying_sentinel","kind":"semantic","payload":{"trigger":"reduced_to_0_not_killed_outright","dropToHp":1,"thenRegainHp":"3 * paladin_level","cannotBeAgedMagically":true,"ceaseVisibleAging":true}}]}
  ]$j$::jsonb);
  perform private.paladin_stage4_set_level_v2(v_ancients,17,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('commune-with-nature','ancients-oath-spells'),private.paladin_stage4_spell_mechanic_v2('tree-stride','ancients-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_ancients,20,$j$[
    {"id":"ancients-elder-champion-resource","type":"resource","sourceKey":"elder-champion","grantOperation":"REPLACE","priority":20,"key":"ancients_elder_champion","label":"Старший чемпион","max":1,"initial":"full","restore":"full","recharge":["long_rest"],"recoveryRules":[{"trigger":"long_rest","restore":"full"}]},
    {"id":"ancients-elder-champion-action","type":"action","sourceKey":"elder-champion","key":"elder_champion","label":"Старший чемпион","economy":"bonus_action","resourceKey":"ancients_elder_champion","resourceCost":1,"tags":["class","duration:1m","semantic"],"effects":[{"key":"elder_champion","kind":"semantic","payload":{"durationMinutes":1,"regainHpStartTurn":10,"paladinActionSpellsAsBonusAction":true,"enemyAuraSaveDisadvantageAgainst":["paladin_spells","channel_divinity"]}}]},
    {"id":"ancients-elder-champion-recharge","type":"action","sourceKey":"elder-champion","key":"elder_champion_recharge","label":"Восстановить Старшего чемпиона","economy":"free","costOptions":[{"key":"slot-5","label":"Потратить ячейку 5 уровня","costs":[{"key":"spell_slot_5","amount":1}]}],"effects":[{"key":"restore_elder_champion","kind":"resource","resourceKey":"ancients_elder_champion","operation":"RESTORE","amount":1}]}
  ]$j$::jsonb);

  perform private.paladin_stage4_set_level_v2(v_vengeance,3,
    $j$[
      {"id":"vengeance-vow-enmity-feature","type":"grant","sourceKey":"vow-of-enmity","target":"feature","key":"class:paladin:vengeance:vow-of-enmity","payload":{"label":"Обет вражды","description":"При действии Атака можно потратить Божественный канал и выбрать видимое существо в 30 футах: атаки по нему с Преимуществом 1 минуту; после падения цели обет можно перенести.","runtime":{"kind":"channel_divinity_feature","activation":"attack_action","rangeFeet":30,"durationMinutes":1,"advantageAttackRolls":true,"transferWhenTargetDropsToZero":true}}},
      {"id":"vengeance-vow-enmity-action","type":"action","sourceKey":"vow-of-enmity","key":"vow_of_enmity","label":"Обет вражды","economy":"attack_action","resourceKey":"channel_divinity","resourceCost":1,"tags":["class","channel-divinity","duration:1m","semantic"],"effects":[{"key":"vow_of_enmity","kind":"semantic","payload":{"rangeFeet":30,"target":"visible_creature","durationMinutes":1,"advantageAttackRollsAgainstTarget":true,"transferOnZeroHp":true}}]}
    ]$j$::jsonb
    ||jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('bane','vengeance-oath-spells'),private.paladin_stage4_spell_mechanic_v2('hunter-s-mark','vengeance-oath-spells'))
  );
  perform private.paladin_stage4_set_level_v2(v_vengeance,5,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('hold-person','vengeance-oath-spells'),private.paladin_stage4_spell_mechanic_v2('misty-step','vengeance-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_vengeance,7,$j$[
    {"id":"vengeance-relentless-avenger-feature","type":"grant","sourceKey":"relentless-avenger","target":"feature","key":"class:paladin:vengeance:relentless-avenger","payload":{"label":"Неотступный мститель","description":"При попадании Атакой по возможности можно снизить Скорость цели до 0 до конца текущего хода и переместиться на половину своей Скорости без провоцирования Атак по возможности.","runtime":{"kind":"reaction_rider","trigger":"opportunity_attack_hit","targetSpeed":0,"targetSpeedDuration":"until_end_current_turn","selfMove":"half_speed","provokesOpportunityAttacks":false}}}
  ]$j$::jsonb);
  perform private.paladin_stage4_set_level_v2(v_vengeance,9,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('haste','vengeance-oath-spells'),private.paladin_stage4_spell_mechanic_v2('protection-from-energy','vengeance-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_vengeance,13,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('banishment','vengeance-oath-spells'),private.paladin_stage4_spell_mechanic_v2('dimension-door','vengeance-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_vengeance,15,$j$[
    {"id":"vengeance-soul-feature","type":"grant","sourceKey":"soul-of-vengeance","target":"feature","key":"class:paladin:vengeance:soul-of-vengeance","payload":{"label":"Душа мести","description":"Сразу после того как цель Обета вражды попадает или промахивается атакой, можно Реакцией сделать по ней одну атаку ближнего боя, если она в пределах досягаемости.","runtime":{"kind":"reaction_attack","trigger":"vow_target_attack_hit_or_miss","attack":"one_melee_attack_if_in_range"}}}
  ]$j$::jsonb);
  perform private.paladin_stage4_set_level_v2(v_vengeance,17,jsonb_build_array(private.paladin_stage4_spell_mechanic_v2('hold-monster','vengeance-oath-spells'),private.paladin_stage4_spell_mechanic_v2('scrying','vengeance-oath-spells')));
  perform private.paladin_stage4_set_level_v2(v_vengeance,20,$j$[
    {"id":"vengeance-avenging-angel-resource","type":"resource","sourceKey":"avenging-angel","grantOperation":"REPLACE","priority":20,"key":"vengeance_avenging_angel","label":"Ангел мщения","max":1,"initial":"full","restore":"full","recharge":["long_rest"],"recoveryRules":[{"trigger":"long_rest","restore":"full"}]},
    {"id":"vengeance-avenging-angel-action","type":"action","sourceKey":"avenging-angel","key":"avenging_angel","label":"Ангел мщения","economy":"bonus_action","resourceKey":"vengeance_avenging_angel","resourceCost":1,"tags":["class","duration:10m","semantic"],"effects":[{"key":"avenging_angel","kind":"semantic","payload":{"durationMinutes":10,"flySpeedFeet":60,"hover":true,"auraKey":"aura_of_protection","enemyStartTurnSave":"wisdom","onFailCondition":"frightened","frightenedDuration":"1_minute_or_until_damage","attacksAgainstFrightenedAdvantage":true}}]},
    {"id":"vengeance-avenging-angel-recharge","type":"action","sourceKey":"avenging-angel","key":"avenging_angel_recharge","label":"Восстановить Ангела мщения","economy":"free","costOptions":[{"key":"slot-5","label":"Потратить ячейку 5 уровня","costs":[{"key":"spell_slot_5","amount":1}]}],"effects":[{"key":"restore_avenging_angel","kind":"resource","resourceKey":"vengeance_avenging_angel","operation":"RESTORE","amount":1}]}
  ]$j$::jsonb);

  perform private.sync_rule_template_spell_links(v_devotion);
  perform private.sync_rule_template_spell_links(v_glory);
  perform private.sync_rule_template_spell_links(v_ancients);
  perform private.sync_rule_template_spell_links(v_vengeance);

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||'{"subclass_runtime_included":true,"phb2024_subclass_count":4,"runtime_stage":4,"runtime_revision":"xphb-2024-paladin-subclasses-stage4-v2","mechanics_status":"SUBCLASS_RUNTIME_READY_STAGE4"}'::jsonb,
      updated_at=now()
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:paladin' and is_active;
end;
$function$;
revoke all on function private.ensure_paladin_phb2024_subclasses_stage4_v2(uuid) from public,anon,authenticated;
grant execute on function private.ensure_paladin_phb2024_subclasses_stage4_v2(uuid) to service_role;

create or replace function private.ensure_paladin_phb2024_subclasses_stage4_v2_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_paladin_phb2024_subclasses_stage4_v2(new.id);
  return new;
end;
$function$;
revoke all on function private.ensure_paladin_phb2024_subclasses_stage4_v2_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaaf_campaigns_ensure_paladin_phb2024_subclasses_stage4_v2 on public.campaigns;
create trigger aaaaaaaaf_campaigns_ensure_paladin_phb2024_subclasses_stage4_v2
after insert on public.campaigns
for each row execute function private.ensure_paladin_phb2024_subclasses_stage4_v2_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.ensure_paladin_phb2024_subclasses_stage4_v2(v_campaign.id);
  end loop;
end;
$block$;

commit;