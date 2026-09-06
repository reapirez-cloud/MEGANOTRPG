-- Seed Chasovoy with the D&D 5e SRD 5.1 monster set from the explicit 2014 dataset.
-- The import intentionally excludes top-level flavor `desc`, image and API URL fields.
-- Mechanical descriptions inside traits/actions/reactions are retained because they are rules data.

with source_document as (
  select content::jsonb as doc
  from extensions.http_get('https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/5e-SRD-Monsters.json')
  where status = 200
), monsters as (
  select m.value as monster
  from source_document,
       jsonb_array_elements(doc) as m(value)
)
insert into public.reference_definitions (
  kind, scope, campaign_id, slug, visibility, status,
  source_kind, source_label, external_id, current_revision, created_by
)
select
  'monster',
  'system',
  null,
  monster ->> 'index',
  'campaign',
  'active',
  'srd',
  'D&D 5e SRD 5.1 (2014 rules)',
  'srd2014:monster:' || (monster ->> 'index'),
  1,
  null
from monsters
on conflict (kind, slug) where scope = 'system'
do nothing;

with source_document as (
  select content::jsonb as doc
  from extensions.http_get('https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/5e-SRD-Monsters.json')
  where status = 200
), monsters as (
  select m.value as monster
  from source_document,
       jsonb_array_elements(doc) as m(value)
), source_rows as (
  select
    d.id as definition_id,
    m.monster,
    coalesce((
      select jsonb_agg(jsonb_build_object('mechanic_group', 'special_ability') || e.value)
      from jsonb_array_elements(case when jsonb_typeof(m.monster -> 'special_abilities')='array' then m.monster -> 'special_abilities' else '[]'::jsonb end) e(value)
    ), '[]'::jsonb)
    || coalesce((
      select jsonb_agg(jsonb_build_object('mechanic_group', 'action') || e.value)
      from jsonb_array_elements(case when jsonb_typeof(m.monster -> 'actions')='array' then m.monster -> 'actions' else '[]'::jsonb end) e(value)
    ), '[]'::jsonb)
    || coalesce((
      select jsonb_agg(jsonb_build_object('mechanic_group', 'reaction') || e.value)
      from jsonb_array_elements(case when jsonb_typeof(m.monster -> 'reactions')='array' then m.monster -> 'reactions' else '[]'::jsonb end) e(value)
    ), '[]'::jsonb)
    || coalesce((
      select jsonb_agg(jsonb_build_object('mechanic_group', 'legendary_action') || e.value)
      from jsonb_array_elements(case when jsonb_typeof(m.monster -> 'legendary_actions')='array' then m.monster -> 'legendary_actions' else '[]'::jsonb end) e(value)
    ), '[]'::jsonb) as mechanics
  from monsters m
  join public.reference_definitions d
    on d.kind='monster'
   and d.scope='system'
   and d.slug=m.monster ->> 'index'
   and d.external_id='srd2014:monster:' || (m.monster ->> 'index')
)
insert into public.reference_definition_revisions (
  definition_id, revision, name, summary, rules_text, mechanics, data, created_by
)
select
  definition_id,
  1,
  monster ->> 'name',
  '',
  '',
  mechanics,
  jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 1,
    'ruleset', 'dnd5e',
    'rules_year', 2014,
    'edition_key', '5e-2014',
    'source', 'D&D 5e SRD 5.1',
    'source_kind', 'srd',
    'license', 'CC-BY-4.0',
    'dataset', '5e-bits/5e-database src/2014/en/5e-SRD-Monsters.json',
    'name_en', monster ->> 'name',
    'size', monster ->> 'size',
    'creature_type', monster ->> 'type',
    'subtype', monster ->> 'subtype',
    'alignment', monster ->> 'alignment',
    'armor_class', coalesce(monster -> 'armor_class', '[]'::jsonb),
    'armor_class_value', case
      when jsonb_typeof(monster -> 'armor_class')='array' then nullif(monster -> 'armor_class' -> 0 ->> 'value','')::integer
      when jsonb_typeof(monster -> 'armor_class')='number' then (monster ->> 'armor_class')::integer
      else null
    end,
    'hit_points', (monster ->> 'hit_points')::integer,
    'hit_dice', monster ->> 'hit_dice',
    'hit_points_roll', monster ->> 'hit_points_roll',
    'speed', coalesce(monster -> 'speed', '{}'::jsonb),
    'abilities', jsonb_build_object(
      'strength', (monster ->> 'strength')::integer,
      'dexterity', (monster ->> 'dexterity')::integer,
      'constitution', (monster ->> 'constitution')::integer,
      'intelligence', (monster ->> 'intelligence')::integer,
      'wisdom', (monster ->> 'wisdom')::integer,
      'charisma', (monster ->> 'charisma')::integer
    ),
    'proficiencies', coalesce(monster -> 'proficiencies', '[]'::jsonb),
    'damage_vulnerabilities', coalesce(monster -> 'damage_vulnerabilities', '[]'::jsonb),
    'damage_resistances', coalesce(monster -> 'damage_resistances', '[]'::jsonb),
    'damage_immunities', coalesce(monster -> 'damage_immunities', '[]'::jsonb),
    'condition_immunities', coalesce(monster -> 'condition_immunities', '[]'::jsonb),
    'senses', coalesce(monster -> 'senses', '{}'::jsonb),
    'languages', monster ->> 'languages',
    'challenge_rating', monster -> 'challenge_rating',
    'proficiency_bonus', monster -> 'proficiency_bonus',
    'xp', monster -> 'xp',
    'special_abilities', coalesce(monster -> 'special_abilities', '[]'::jsonb),
    'actions', coalesce(monster -> 'actions', '[]'::jsonb),
    'reactions', coalesce(monster -> 'reactions', '[]'::jsonb),
    'legendary_actions', coalesce(monster -> 'legendary_actions', '[]'::jsonb),
    'forms', coalesce(monster -> 'forms', '[]'::jsonb)
  )),
  null
from source_rows
on conflict (definition_id, revision)
do nothing;
