-- D&D 2024 Warlock Eldritch Invocations.
-- Catalog-only preparation for the Chasovoy reference engine.
-- Runtime wiring is intentionally out of scope for this migration.

with seed (
  slug, name_ru, name_en, summary_ru, min_level, repeatable,
  required_invocations, selector, runtime_hint, sort_order
) as (
  values
    ('agonizing-blast', 'Мучительный взрыв', 'Agonizing Blast',
      'Выбранный наносящий урон кантрип колдуна добавляет модификатор Харизмы к броскам урона.',
      2, true, '[]'::jsonb, 'warlock_damage_cantrip'::text,
      '{"kind":"cantrip_damage_modifier","ability":"charisma","target":"selected_cantrip"}'::jsonb, 10),
    ('armor-of-shadows', 'Доспех теней', 'Armor of Shadows',
      'Позволяет накладывать «Доспех мага» на себя без расхода ячейки заклинания.',
      1, false, '[]'::jsonb, 'none',
      '{"kind":"at_will_spell","spell_slug":"mage-armor","target":"self","slot_cost":0}'::jsonb, 20),
    ('ascendant-step', 'Восходящий шаг', 'Ascendant Step',
      'Позволяет накладывать «Левитацию» на себя без расхода ячейки заклинания.',
      5, false, '[]'::jsonb, 'none',
      '{"kind":"at_will_spell","spell_slug":"levitate","target":"self","slot_cost":0}'::jsonb, 30),
    ('devils-sight', 'Дьявольское зрение', 'Devil''s Sight',
      'Колдун нормально видит в тусклом свете и темноте, включая магическую, в пределах 120 футов.',
      2, false, '[]'::jsonb, 'none',
      '{"kind":"sense","sense":"devils_sight","range_ft":120}'::jsonb, 40),
    ('devouring-blade', 'Пожирающий клинок', 'Devouring Blade',
      'Улучшает «Жаждущий клинок»: при действии Атака оружие договора получает уже две дополнительные атаки вместо одной.',
      12, false, '["thirsting-blade"]'::jsonb, 'none',
      '{"kind":"pact_weapon_extra_attack_upgrade","total_attacks":3}'::jsonb, 50),
    ('eldritch-mind', 'Таинственный разум', 'Eldritch Mind',
      'Даёт преимущество на спасброски Телосложения для поддержания концентрации.',
      1, false, '[]'::jsonb, 'none',
      '{"kind":"saving_throw_advantage","ability":"constitution","context":"maintain_concentration"}'::jsonb, 60),
    ('eldritch-smite', 'Таинственная кара', 'Eldritch Smite',
      'Раз в ход после попадания оружием договора можно потратить ячейку Магии договора на дополнительный силовой урон и сбить подходящую цель с ног.',
      5, false, '["pact-of-the-blade"]'::jsonb, 'none',
      '{"kind":"on_hit_pact_slot","frequency":"once_per_turn","damage_base":"1d8","damage_per_slot_level":"1d8","damage_type":"force","prone_max_size":"huge"}'::jsonb, 70),
    ('eldritch-spear', 'Таинственное копьё', 'Eldritch Spear',
      'У выбранного наносящего урон кантрипа колдуна с дальностью не менее 10 футов дальность увеличивается на 30 футов за каждый уровень колдуна.',
      2, true, '[]'::jsonb, 'warlock_damage_cantrip_range_10_plus',
      '{"kind":"cantrip_range_modifier","feet_per_warlock_level":30,"target":"selected_cantrip"}'::jsonb, 80),
    ('fiendish-vigor', 'Дьявольская живучесть', 'Fiendish Vigor',
      'Позволяет накладывать «Ложную жизнь» на себя без ячейки; временные хиты от кости заклинания берутся по максимальному значению.',
      2, false, '[]'::jsonb, 'none',
      '{"kind":"at_will_spell","spell_slug":"false-life","target":"self","slot_cost":0,"temp_hp_die":"maximum"}'::jsonb, 90),
    ('gaze-of-two-minds', 'Взор двух умов', 'Gaze of Two Minds',
      'Бонусным действием связывает чувства колдуна с согласным существом; связь можно поддерживать и использовать его пространство как точку происхождения заклинаний при соблюдении дистанции.',
      5, false, '[]'::jsonb, 'none',
      '{"kind":"linked_senses","activation":"bonus_action","same_plane":true,"spell_origin_max_distance_ft":60}'::jsonb, 100),
    ('gift-of-the-depths', 'Дар глубин', 'Gift of the Depths',
      'Даёт дыхание под водой и скорость плавания, равную обычной скорости; также позволяет раз за долгий отдых бесплатно наложить «Дыхание под водой».',
      5, false, '[]'::jsonb, 'none',
      '{"kind":"compound","effects":[{"type":"underwater_breathing"},{"type":"swim_speed_equals_speed"},{"type":"free_spell","spell_slug":"water-breathing","uses":1,"recharge":"long_rest"}]}'::jsonb, 110),
    ('gift-of-the-protectors', 'Дар защитников', 'Gift of the Protectors',
      'Книга Теней хранит имена защищённых существ; раз за долгий отдых одно из них вместо падения до 0 хитов остаётся на 1 хите.',
      9, false, '["pact-of-the-tome"]'::jsonb, 'none',
      '{"kind":"book_of_shadows_protection","names_max":"charisma_modifier_min_1","trigger":"named_creature_reduced_to_0_hp_not_killed","result_hp":1,"shared_uses":1,"recharge":"long_rest"}'::jsonb, 120),
    ('investment-of-the-chain-master', 'Вложение хозяина цепи', 'Investment of the Chain Master',
      'Усиливает фамильяра договора: мобильность, атака бонусным действием, выбор типа урона, Сл спасбросков колдуна и реакционная защита от урона.',
      5, false, '["pact-of-the-chain"]'::jsonb, 'none',
      '{"kind":"pact_familiar_upgrade","fly_or_swim_speed_ft":40,"bonus_action_attack_command":true,"damage_conversion":["necrotic","radiant"],"uses_warlock_spell_save_dc":true,"reaction_resistance":true}'::jsonb, 130),
    ('lessons-of-the-first-ones', 'Уроки Первых', 'Lessons of the First Ones',
      'Даёт один подходящий Origin feat; инвокацию можно выбирать повторно, каждый раз для другого Origin feat.',
      2, true, '[]'::jsonb, 'origin_feat',
      '{"kind":"grant_origin_feat","target":"selected_origin_feat"}'::jsonb, 140),
    ('lifedrinker', 'Похититель жизни', 'Lifedrinker',
      'Раз в ход попадание оружием договора наносит дополнительно 1к6 некротического, психического или излучающего урона; можно потратить Кость Хитов для лечения.',
      9, false, '["pact-of-the-blade"]'::jsonb, 'none',
      '{"kind":"pact_weapon_on_hit","frequency":"once_per_turn","bonus_damage":"1d6","damage_type_choice":["necrotic","psychic","radiant"],"optional_hit_die_heal":true}'::jsonb, 150),
    ('mask-of-many-faces', 'Маска многих лиц', 'Mask of Many Faces',
      'Позволяет накладывать «Маскировку» без расхода ячейки заклинания.',
      2, false, '[]'::jsonb, 'none',
      '{"kind":"at_will_spell","spell_slug":"disguise-self","slot_cost":0}'::jsonb, 160),
    ('master-of-myriad-forms', 'Владыка множества форм', 'Master of Myriad Forms',
      'Позволяет накладывать «Изменение облика» без расхода ячейки заклинания.',
      5, false, '[]'::jsonb, 'none',
      '{"kind":"at_will_spell","spell_slug":"alter-self","slot_cost":0}'::jsonb, 170),
    ('misty-visions', 'Туманные видения', 'Misty Visions',
      'Позволяет накладывать «Безмолвный образ» без расхода ячейки заклинания.',
      2, false, '[]'::jsonb, 'none',
      '{"kind":"at_will_spell","spell_slug":"silent-image","slot_cost":0}'::jsonb, 180),
    ('one-with-shadows', 'Единство с тенями', 'One with Shadows',
      'В тусклом свете или темноте позволяет накладывать «Невидимость» на себя без расхода ячейки.',
      5, false, '[]'::jsonb, 'none',
      '{"kind":"conditional_at_will_spell","spell_slug":"invisibility","target":"self","slot_cost":0,"condition":"dim_light_or_darkness"}'::jsonb, 190),
    ('otherworldly-leap', 'Потусторонний прыжок', 'Otherworldly Leap',
      'Позволяет накладывать «Прыжок» на себя без расхода ячейки заклинания.',
      2, false, '[]'::jsonb, 'none',
      '{"kind":"at_will_spell","spell_slug":"jump","target":"self","slot_cost":0}'::jsonb, 200),
    ('pact-of-the-blade', 'Договор клинка', 'Pact of the Blade',
      'Создаёт или привязывает оружие договора; колдун владеет им, может использовать как фокус и применять Харизму для атак и урона, а также менять тип наносимого урона.',
      1, false, '[]'::jsonb, 'none',
      '{"kind":"pact_boon_blade","activation":"bonus_action","weapon":"simple_or_martial_melee","spellcasting_ability":"charisma","damage_type_choice":["normal","necrotic","psychic","radiant"]}'::jsonb, 210),
    ('pact-of-the-chain', 'Договор цепи', 'Pact of the Chain',
      'Даёт «Поиск фамильяра» без ячейки как Магическое действие, расширяет список форм фамильяра и позволяет отдавать ему одну из атак персонажа.',
      1, false, '[]'::jsonb, 'none',
      '{"kind":"pact_boon_chain","spell_slug":"find-familiar","slot_cost":0,"casting_action":"magic","special_forms":true,"replace_own_attack_with_familiar_attack":true}'::jsonb, 220),
    ('pact-of-the-tome', 'Договор гримуара', 'Pact of the Tome',
      'После отдыха создаёт Книгу Теней: при создании выбираются три кантрипа и два ритуала 1 уровня из любых списков; книга также служит фокусом.',
      1, false, '[]'::jsonb, 'none',
      '{"kind":"pact_boon_tome","refresh":"short_or_long_rest","cantrip_choices":3,"ritual_level_1_choices":2,"any_class_list":true,"spellcasting_focus":true}'::jsonb, 230),
    ('repelling-blast', 'Отталкивающий взрыв', 'Repelling Blast',
      'Попадание выбранным атакующим кантрипом колдуна может оттолкнуть существо Большого размера или меньше на 10 футов от колдуна.',
      2, true, '[]'::jsonb, 'warlock_attack_roll_cantrip',
      '{"kind":"cantrip_on_hit_push","distance_ft":10,"max_target_size":"large","target":"selected_cantrip"}'::jsonb, 240),
    ('thirsting-blade', 'Жаждущий клинок', 'Thirsting Blade',
      'Даёт Дополнительную атаку только оружием договора: при действии Атака можно атаковать этим оружием дважды.',
      5, false, '["pact-of-the-blade"]'::jsonb, 'none',
      '{"kind":"pact_weapon_extra_attack","total_attacks":2}'::jsonb, 250),
    ('visions-of-distant-realms', 'Видения дальних миров', 'Visions of Distant Realms',
      'Позволяет накладывать «Магический глаз» без расхода ячейки заклинания.',
      9, false, '[]'::jsonb, 'none',
      '{"kind":"at_will_spell","spell_slug":"arcane-eye","slot_cost":0}'::jsonb, 260),
    ('whispers-of-the-grave', 'Шёпот могилы', 'Whispers of the Grave',
      'Позволяет накладывать «Разговор с мёртвыми» без расхода ячейки заклинания.',
      7, false, '[]'::jsonb, 'none',
      '{"kind":"at_will_spell","spell_slug":"speak-with-dead","slot_cost":0}'::jsonb, 270),
    ('witch-sight', 'Ведьмин взгляд', 'Witch Sight',
      'Даёт истинное зрение в радиусе 30 футов.',
      15, false, '[]'::jsonb, 'none',
      '{"kind":"sense","sense":"truesight","range_ft":30}'::jsonb, 280)
), upserted as (
  insert into public.reference_definitions (
    kind, scope, campaign_id, slug, visibility, status,
    source_kind, source_label, external_id, current_revision,
    created_by, updated_at
  )
  select
    'feature', 'system', null, s.slug, 'campaign', 'active',
    'official', 'D&D 2024 Basic Rules',
    'class:warlock:invocation:' || s.slug, 1, null, now()
  from seed s
  on conflict (kind, slug) where scope = 'system'
  do update set
    status = excluded.status,
    source_kind = excluded.source_kind,
    source_label = excluded.source_label,
    external_id = excluded.external_id,
    current_revision = 1,
    updated_at = now()
  returning id, slug
)
insert into public.reference_definition_revisions (
  definition_id, revision, name, summary, rules_text, mechanics, data, created_by
)
select
  d.id,
  1,
  s.name_ru,
  s.summary_ru,
  s.summary_ru,
  '[]'::jsonb,
  jsonb_build_object(
    'class_key', 'warlock',
    'feature_kind', 'eldritch_invocation',
    'rules_year', 2024,
    'name_en', s.name_en,
    'minimum_warlock_level', s.min_level,
    'repeatable', s.repeatable,
    'required_invocations', s.required_invocations,
    'selector', s.selector,
    'runtime_status', 'catalog_only',
    'runtime_hint', s.runtime_hint,
    'sort_order', s.sort_order
  ),
  null
from seed s
join upserted d on d.slug = s.slug
on conflict (definition_id, revision)
do update set
  name = excluded.name,
  summary = excluded.summary,
  rules_text = excluded.rules_text,
  mechanics = excluded.mechanics,
  data = excluded.data;

-- Guard the seed as a complete 2024 set without coupling it to Warlock runtime.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.reference_definitions d
  join public.reference_definition_revisions r
    on r.definition_id = d.id and r.revision = d.current_revision
  where d.scope = 'system'
    and d.kind = 'feature'
    and d.external_id like 'class:warlock:invocation:%'
    and r.data ->> 'rules_year' = '2024';

  if v_count <> 28 then
    raise exception 'Expected 28 Warlock 2024 invocations in Chasovoy, found %', v_count;
  end if;
end
$$;
