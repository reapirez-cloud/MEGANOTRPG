-- CLASS_MIGRATION_SCOPE: infrastructure
-- Warlock Stage 5 prerequisite: PHB 2024 patron/base spell identity missing from the shared catalog.
-- Keep the spell contextual: its start/end-of-turn effects belong to scene timing, not an eager Roll Engine recipe.

insert into public.spell_catalog (
  slug,
  name_en,
  name_ru,
  spell_level,
  school,
  casting_time,
  spell_range,
  area,
  duration,
  components,
  material,
  concentration,
  ritual,
  check_type,
  damage,
  effect_summary,
  upcast,
  notes,
  rules_text,
  source,
  source_kind,
  license,
  sort_order,
  roll_mode,
  roll_recipe
)
values (
  'hunger-of-hadar',
  'Hunger of Hadar',
  'Голод Хадара',
  3,
  'Conjuration',
  'Действие',
  '150 футов',
  'Сфера радиусом 20 футов',
  'Концентрация, до 1 минуты',
  array['В','С','М']::text[],
  null,
  true,
  false,
  'Спасбросок Ловкости для кислотного эффекта',
  '2к6 холодом в начале хода; 2к6 кислотой в конце хода при провале спасброска Ловкости',
  'В выбранной точке появляется опасная сфера чуждой тьмы. Область является труднопроходимой; существа внутри ослеплены. Урон и спасбросок завязаны на начало и конец хода существа.',
  '',
  'Контекстное заклинание: начало и конец хода, положение существа и состояние области подтверждаются сценой.',
  null,
  'Player''s Handbook 2024',
  'official',
  null,
  10114,
  'contextual',
  null
)
on conflict (slug) do nothing;

insert into public.spell_catalog_classes (spell_id, class_key)
select id, 'warlock'
from public.spell_catalog
where slug = 'hunger-of-hadar'
on conflict (spell_id, class_key) do nothing;