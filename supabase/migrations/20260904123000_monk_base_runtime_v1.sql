-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkOfficialPack.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:base=RUNTIME_READY;subclasses=UNCHANGED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Base Monk 2024 runtime pack. Scene/event-dependent rules remain exact feature
-- text; CE owns finite Focus, deliberate spends, recovery, and deterministic
-- progression values. No subclass mechanics are installed here.

begin;

create or replace function private.monk_feature(
  p_id text,p_source_key text,p_key text,p_label text,p_description text,p_mechanic jsonb default '{}'::jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','feature','key',p_key,'sourceKey',p_source_key,
    'payload',jsonb_build_object('label',p_label,'description',p_description,'mechanic',coalesce(p_mechanic,'{}'::jsonb))
  );
$$;

create or replace function private.monk_resource(
  p_id text,p_source_key text,p_key text,p_label text,p_max jsonb,p_recharge jsonb,
  p_priority integer default 0,p_operation text default 'REPLACE'
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','resource','key',p_key,'sourceKey',p_source_key,
    'grantOperation',p_operation,'priority',p_priority,
    'payload',jsonb_build_object('max',p_max,'label',p_label,'initial','full','recharge',p_recharge)
  );
$$;

create or replace function private.monk_value(
  p_id text,p_source_key text,p_key text,p_label text,p_value jsonb,p_priority integer default 0,p_operation text default 'REPLACE'
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','value','key',p_key,'sourceKey',p_source_key,
    'grantOperation',p_operation,'priority',p_priority,
    'payload',jsonb_build_object('label',p_label,'value',p_value)
  );
$$;

create or replace function private.monk_action(
  p_id text,p_source_key text,p_key text,p_label text,p_economy text,p_cost integer default 0,
  p_effects jsonb default '[]'::jsonb,p_tags jsonb default '[]'::jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_id,'type','action','sourceKey',p_source_key,'key',p_key,'label',p_label,'economy',p_economy,
    'range',jsonb_build_object('kind','self'),
    'resourceCosts',case when p_cost>0 then jsonb_build_array(jsonb_build_object('key','monk_focus','amount',p_cost)) else null end,
    'effects',case when jsonb_array_length(coalesce(p_effects,'[]'::jsonb))>0 then p_effects else null end,
    'tags',coalesce(p_tags,'[]'::jsonb),
    'presentation',jsonb_build_object('tone','amber','icon','◆','display','counter','priority',85)
  ));
$$;

create or replace function private.monk_set_level(p_template_id uuid,p_level integer,p_mechanics jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.rule_template_levels
  set mechanics=coalesce(p_mechanics,'[]'::jsonb),choices='[]'::jsonb
  where template_id=p_template_id and level=p_level;
  if not found then
    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(p_template_id,p_level,coalesce(p_mechanics,'[]'::jsonb),'[]'::jsonb);
  end if;
end;
$$;

create or replace function private.apply_monk_base_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_monk uuid;
  v_level integer;
  v_mechanics jsonb;
  v_focus_recharge jsonb := '{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb;
begin
  select id into v_monk
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:monk' and is_active
  order by version desc,created_at desc limit 1;
  if v_monk is null then return; end if;

  update public.rule_templates set
    catalog_revision='xphb-2024-monk-runtime-v1',
    mechanical_summary='Монах 2024: Очки концентрации ведутся как реальный ресурс, траты выполняются действиями CE, а куб Боевых искусств, скорость и число атак имеют структурированную прогрессию. Событийные условия остаются точными правилами для стола.',
    rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
      'monk_base_runtime',true,
      'runtime_revision','xphb-2024-monk-runtime-v1',
      'resource_ledger_runtime',true,
      'no_fake_scene_state',true,
      'subclass_runtime_included',false,
      'source_book','XPHB','rules_revision','2024'
    ),updated_at=now()
  where id=v_monk;

  for v_level in 1..20 loop
    v_mechanics:='[]'::jsonb;

    -- Focus is a true finite pool from level 2 onward. Replacing it every level
    -- makes max Focus equal the actual Monk level without relying on scene state.
    if v_level>=2 then
      v_mechanics:=v_mechanics||jsonb_build_array(
        private.monk_resource('monk-focus-l'||v_level,'monk-focus','monk_focus','Очки концентрации',to_jsonb(v_level),v_focus_recharge,v_level,'REPLACE')
      );
    end if;

    case v_level
      when 1 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.monk_feature('monk-martial-arts-rules','monk-martial-arts','martial_arts','Боевые искусства',
            'Пока монах не носит доспех и щит, он может использовать Ловкость вместо Силы для атак и урона безоружными ударами и монашеским оружием. Куб урона Боевых искусств начинается с к6 и растёт с уровнем. После действия Атака, если в нём был безоружный удар или монашеское оружие, монах может бонусным действием сделать один безоружный удар.',
            '{"requires":"no_armor_or_shield","bonus_unarmed_strike_after_attack":1}'::jsonb),
          private.monk_value('monk-ma-die-l1','monk-martial-arts','martial_arts_die_sides','Куб Боевых искусств','6'::jsonb,1,'REPLACE'),
          private.monk_feature('monk-unarmored-defense-rules','monk-unarmored-defense','unarmored_defense','Защита без доспехов',
            'Без доспеха и щита КД монаха равен 10 + модификатор Ловкости + модификатор Мудрости.',
            '{"formula":"10 + DEX modifier + WIS modifier","requires":"no_armor_or_shield"}'::jsonb)
        );
      when 2 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.monk_feature('monk-focus-rules','monk-focus','monk_focus_rules','Монашеская концентрация',
            'Запас Очков концентрации равен уровню монаха и полностью восстанавливается после короткого или долгого отдыха. СЛ спасброска способностей концентрации: 8 + модификатор Мудрости + бонус мастерства. Шквал ударов, Терпеливая оборона и Шаг ветра тратят этот ресурс по указанным правилам.',
            '{"save_dc":"8 + WIS modifier + proficiency bonus"}'::jsonb),
          private.monk_action('monk-flurry-action','monk-flurry-of-blows','flurry_of_blows','Шквал ударов','bonus_action',1,'[]'::jsonb,'["class","two-unarmed-strikes"]'::jsonb),
          private.monk_value('monk-flurry-count-l2','monk-flurry-of-blows','flurry_unarmed_strikes','Ударов Шквала','2'::jsonb,2,'REPLACE'),
          private.monk_feature('monk-patient-defense-rules','monk-patient-defense','patient_defense_rules','Терпеливая оборона',
            'Бонусным действием монах может совершить Отход. Если потратить 1 Очко концентрации, тем же бонусным действием он совершает и Отход, и Уклонение.'),
          private.monk_action('monk-patient-defense-focus','monk-patient-defense','patient_defense_focus','Терпеливая оборона: Отход + Уклонение','bonus_action',1,'[]'::jsonb,'["class","disengage","dodge"]'::jsonb),
          private.monk_feature('monk-step-wind-rules','monk-step-of-the-wind','step_of_the_wind_rules','Шаг ветра',
            'Бонусным действием монах может совершить Рывок. Если потратить 1 Очко концентрации, тем же бонусным действием он совершает и Отход, и Рывок, а дальность прыжка удваивается до конца хода.'),
          private.monk_action('monk-step-wind-focus','monk-step-of-the-wind','step_of_the_wind_focus','Шаг ветра: Отход + Рывок','bonus_action',1,'[]'::jsonb,'["class","disengage","dash","double-jump-distance"]'::jsonb),
          private.monk_feature('monk-unarmored-movement-rules','monk-unarmored-movement','unarmored_movement','Движение без доспехов',
            'Пока монах не носит доспех и щит, его Скорость увеличивается на 10 футов. Бонус растёт на более высоких уровнях.'),
          private.monk_value('monk-unarmored-movement-l2','monk-unarmored-movement','unarmored_movement_bonus_feet','Бонус Скорости без доспехов','10'::jsonb,2,'REPLACE'),
          private.monk_resource('monk-uncanny-metabolism-use','monk-uncanny-metabolism','monk_uncanny_metabolism','Невероятный метаболизм','1'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,2,'REPLACE'),
          private.monk_feature('monk-uncanny-metabolism-rules','monk-uncanny-metabolism','uncanny_metabolism_rules','Невероятный метаболизм',
            'При броске инициативы монах может восстановить все потраченные Очки концентрации и HP в количестве, равном броску куба Боевых искусств + уровень монаха. После использования способность недоступна до долгого отдыха. Кнопка CE возвращает Focus; лечение и сам момент инициативы подтверждаются за столом.'),
          jsonb_build_object('id','monk-uncanny-metabolism-action','type','action','sourceKey','monk-uncanny-metabolism','key','uncanny_metabolism','label','Невероятный метаболизм','economy','free','range',jsonb_build_object('kind','self'),'resourceCosts',jsonb_build_array(jsonb_build_object('key','monk_uncanny_metabolism','amount',1)),'effects',jsonb_build_array(jsonb_build_object('kind','resource','key','monk_focus','operation','RESTORE','amount',20),jsonb_build_object('kind','semantic','key','heal','payload',jsonb_build_object('formula','martial_arts_die + monk_level'))),'tags',jsonb_build_array('class','initiative-trigger','gm-confirmed-healing'),'presentation',jsonb_build_object('tone','amber','icon','◆','display','counter','priority',90))
        );
      when 3 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.monk_feature('monk-deflect-attacks-rules','monk-deflect-attacks','deflect_attacks','Отражение атак',
            'Реакцией, когда атака наносит монаху дробящий, колющий или рубящий урон, он уменьшает этот урон на 1к10 + модификатор Ловкости + уровень монаха. Если урон снижен до 0, можно потратить 1 Очко концентрации и перенаправить часть атаки по правилам способности; факт попадания и обнуления урона подтверждает стол.'),
          private.monk_action('monk-deflect-redirect','monk-deflect-attacks','deflect_attacks_redirect','Отражение атак: перенаправить','reaction',1,'[]'::jsonb,'["class","requires-damage-reduced-to-zero","gm-confirmed"]'::jsonb),
          private.monk_feature('monk-subclass-unlock','monk-subclass','monk_subclass','Подкласс монаха','На 3 уровне выбирается традиция монаха. Эта миграция не устанавливает способности подклассов.')
        );
      when 4 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.monk_feature('monk-asi-l4','monk-asi-4','ability_score_improvement_4','Улучшение характеристик','Получите Улучшение характеристик или другой доступный талант по общим правилам.'),
          private.monk_feature('monk-slow-fall','monk-slow-fall','slow_fall','Замедленное падение','Реакцией при падении монах уменьшает получаемый урон от падения на величину, равную пяти уровням монаха.')
        );
      when 5 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.monk_value('monk-ma-die-l5','monk-martial-arts','martial_arts_die_sides','Куб Боевых искусств','8'::jsonb,5,'REPLACE'),
          private.monk_feature('monk-extra-attack-rules','monk-extra-attack','extra_attack','Дополнительная атака','Когда монах совершает действие Атака, он может атаковать дважды вместо одного раза.'),
          private.monk_value('monk-attacks-l5','monk-extra-attack','attacks_per_attack_action','Атак за действие Атака','2'::jsonb,5,'REPLACE'),
          private.monk_feature('monk-stunning-strike-rules','monk-stunning-strike','stunning_strike_rules','Ошеломляющий удар','Один раз за ход, когда монах попадает по существу монашеским оружием или безоружным ударом, он может потратить 1 Очко концентрации. Цель делает спасбросок Телосложения против СЛ концентрации; последствия успеха и провала применяются по правилу способности.'),
          private.monk_action('monk-stunning-strike-action','monk-stunning-strike','stunning_strike','Ошеломляющий удар','free',1,'[]'::jsonb,'["class","on-hit","once-per-turn","constitution-save","gm-confirmed"]'::jsonb)
        );
      when 6 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.monk_feature('monk-empowered-strikes','monk-empowered-strikes','empowered_strikes','Усиленные удары','Когда безоружный удар наносит урон, монах может выбрать урон силовым полем вместо обычного типа урона.'),
          private.monk_value('monk-unarmored-movement-l6','monk-unarmored-movement','unarmored_movement_bonus_feet','Бонус Скорости без доспехов','15'::jsonb,6,'REPLACE')
        );
      when 7 then
        v_mechanics:=v_mechanics||jsonb_build_array(private.monk_feature('monk-evasion','monk-evasion','evasion','Уклонение','Если эффект позволяет спасбросок Ловкости для получения половины урона, монах получает 0 урона при успехе и половину при провале. Эффект не работает, когда монах недееспособен.'));
      when 8 then
        v_mechanics:=v_mechanics||jsonb_build_array(private.monk_feature('monk-asi-l8','monk-asi-8','ability_score_improvement_8','Улучшение характеристик','Получите Улучшение характеристик или другой доступный талант по общим правилам.'));
      when 9 then
        v_mechanics:=v_mechanics||jsonb_build_array(private.monk_feature('monk-acrobatic-movement','monk-acrobatic-movement','acrobatic_movement','Акробатическое движение','Пока действует Движение без доспехов, в свой ход монах может перемещаться по вертикальным поверхностям и по жидкостям, не падая во время этого перемещения.'));
      when 10 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.monk_feature('monk-heightened-focus','monk-heightened-focus','heightened_focus','Усиленная концентрация','Шквал ударов теперь даёт три безоружных удара. Платная Терпеливая оборона дополнительно даёт временные HP в размере двух бросков куба Боевых искусств. Платный Шаг ветра позволяет переместить вместе с собой согласное существо Большого размера или меньше, если оно находится рядом, по правилам способности.'),
          private.monk_value('monk-flurry-count-l10','monk-flurry-of-blows','flurry_unarmed_strikes','Ударов Шквала','3'::jsonb,10,'REPLACE'),
          private.monk_value('monk-unarmored-movement-l10','monk-unarmored-movement','unarmored_movement_bonus_feet','Бонус Скорости без доспехов','20'::jsonb,10,'REPLACE'),
          private.monk_feature('monk-self-restoration','monk-self-restoration','self_restoration','Самовосстановление','В конце своего хода монах может прекратить на себе состояние Очарован или Испуган. Кроме того, долгий отдых снимает один уровень Истощения по правилам способности.')
        );
      when 11 then
        v_mechanics:=v_mechanics||jsonb_build_array(private.monk_value('monk-ma-die-l11','monk-martial-arts','martial_arts_die_sides','Куб Боевых искусств','10'::jsonb,11,'REPLACE'));
      when 12 then
        v_mechanics:=v_mechanics||jsonb_build_array(private.monk_feature('monk-asi-l12','monk-asi-12','ability_score_improvement_12','Улучшение характеристик','Получите Улучшение характеристик или другой доступный талант по общим правилам.'));
      when 13 then
        v_mechanics:=v_mechanics||jsonb_build_array(private.monk_feature('monk-deflect-energy','monk-deflect-energy','deflect_energy','Отражение энергии','Отражение атак теперь можно использовать против атак, наносящих любой тип урона, а не только дробящий, колющий или рубящий.'));
      when 14 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.monk_feature('monk-disciplined-survivor-rules','monk-disciplined-survivor','disciplined_survivor','Дисциплинированный выживший','Монах получает владение всеми спасбросками. При провале спасброска он может потратить 1 Очко концентрации, чтобы перебросить его и использовать новый результат.'),
          private.monk_action('monk-disciplined-survivor-action','monk-disciplined-survivor','disciplined_survivor_reroll','Дисциплинированный выживший: переброс','reaction',1,'[]'::jsonb,'["class","failed-save","reroll","gm-confirmed"]'::jsonb),
          private.monk_value('monk-unarmored-movement-l14','monk-unarmored-movement','unarmored_movement_bonus_feet','Бонус Скорости без доспехов','25'::jsonb,14,'REPLACE')
        );
      when 15 then
        v_mechanics:=v_mechanics||jsonb_build_array(private.monk_feature('monk-perfect-focus','monk-perfect-focus','perfect_focus','Совершенная концентрация','При броске инициативы, если Невероятный метаболизм не используется и у монаха меньше 4 Очков концентрации, запас становится равен 4. Инициатива остаётся подтверждаемым событием стола, поэтому CE не применяет это автоматически.'));
      when 16 then
        v_mechanics:=v_mechanics||jsonb_build_array(private.monk_feature('monk-asi-l16','monk-asi-16','ability_score_improvement_16','Улучшение характеристик','Получите Улучшение характеристик или другой доступный талант по общим правилам.'));
      when 17 then
        v_mechanics:=v_mechanics||jsonb_build_array(private.monk_value('monk-ma-die-l17','monk-martial-arts','martial_arts_die_sides','Куб Боевых искусств','12'::jsonb,17,'REPLACE'));
      when 18 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.monk_feature('monk-superior-defense-rules','monk-superior-defense','superior_defense_rules','Высшая защита','В начале своего хода монах может потратить 3 Очка концентрации и на 1 минуту получить сопротивление всему урону, кроме урона силовым полем. Эффект прекращается раньше, если монах становится недееспособен.'),
          private.monk_action('monk-superior-defense-action','monk-superior-defense','superior_defense','Высшая защита','free',3,'[]'::jsonb,'["class","start-of-turn","resistance-all-except-force","duration-1-minute","gm-confirmed-duration"]'::jsonb),
          private.monk_value('monk-unarmored-movement-l18','monk-unarmored-movement','unarmored_movement_bonus_feet','Бонус Скорости без доспехов','30'::jsonb,18,'REPLACE')
        );
      when 19 then
        v_mechanics:=v_mechanics||jsonb_build_array(private.monk_feature('monk-epic-boon','monk-epic-boon','epic_boon','Эпический дар','Получите Эпический дар или другой талант, доступный по общим правилам 19 уровня.'));
      when 20 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.monk_feature('monk-body-mind-rules','monk-body-and-mind','body_and_mind','Тело и разум','Ловкость и Мудрость монаха увеличиваются на 4 каждая; максимум каждой из этих характеристик становится 25. CE хранит величину и новый предел как структурированные значения, но не применяет некорректное безусловное +4 поверх внешнего редактора характеристик.'),
          private.monk_value('monk-body-mind-dex-bonus','monk-body-and-mind','body_and_mind_dexterity_increase','Повышение Ловкости','4'::jsonb,20,'REPLACE'),
          private.monk_value('monk-body-mind-wis-bonus','monk-body-and-mind','body_and_mind_wisdom_increase','Повышение Мудрости','4'::jsonb,20,'REPLACE'),
          private.monk_value('monk-body-mind-cap','monk-body-and-mind','body_and_mind_ability_cap','Максимум Ловкости и Мудрости','25'::jsonb,20,'REPLACE')
        );
      else null;
    end case;

    perform private.monk_set_level(v_monk,v_level,v_mechanics);
  end loop;
end;
$$;

revoke all on function private.apply_monk_base_runtime_v1(uuid) from public,anon,authenticated;
grant execute on function private.apply_monk_base_runtime_v1(uuid) to service_role;

create or replace function private.apply_monk_base_runtime_v1_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.apply_monk_base_runtime_v1(new.id);
  return new;
end;
$$;

revoke all on function private.apply_monk_base_runtime_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzz_campaigns_apply_monk_base_runtime_v1 on public.campaigns;
create trigger zzzzzzzz_campaigns_apply_monk_base_runtime_v1
after insert on public.campaigns
for each row execute function private.apply_monk_base_runtime_v1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.apply_monk_base_runtime_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
