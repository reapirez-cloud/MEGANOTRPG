alter table public.reference_definitions
  drop constraint if exists reference_definitions_kind_check;

alter table public.reference_definitions
  add constraint reference_definitions_kind_check
  check (kind = any (array[
    'class'::text,
    'subclass'::text,
    'race'::text,
    'subrace'::text,
    'spell'::text,
    'item'::text,
    'feat'::text,
    'feature'::text,
    'condition'::text,
    'background'::text,
    'species'::text,
    'reference'::text,
    'monster'::text
  ]));

drop view if exists public.bestiary_catalog;

create view public.bestiary_catalog
with (security_invoker = on)
as
select
  d.id,
  d.slug,
  r.name as name_en,
  d.source_kind,
  d.source_label,
  d.external_id,
  (r.data ->> 'rules_year')::integer as rules_year,
  r.data ->> 'size' as size,
  r.data ->> 'creature_type' as creature_type,
  nullif(r.data ->> 'subtype', '') as subtype,
  r.data ->> 'alignment' as alignment,
  (r.data ->> 'armor_class_value')::integer as armor_class,
  (r.data ->> 'hit_points')::integer as hit_points,
  r.data ->> 'hit_dice' as hit_dice,
  (r.data ->> 'challenge_rating')::numeric as challenge_rating,
  (r.data ->> 'xp')::integer as xp,
  (r.data ->> 'proficiency_bonus')::integer as proficiency_bonus,
  (r.data -> 'abilities') as abilities,
  (r.data -> 'speed') as speed,
  (r.data -> 'senses') as senses,
  r.data ->> 'languages' as languages,
  (r.data -> 'damage_vulnerabilities') as damage_vulnerabilities,
  (r.data -> 'damage_resistances') as damage_resistances,
  (r.data -> 'damage_immunities') as damage_immunities,
  (r.data -> 'condition_immunities') as condition_immunities,
  (r.data -> 'proficiencies') as proficiencies,
  (r.data -> 'special_abilities') as special_abilities,
  (r.data -> 'actions') as actions,
  (r.data -> 'reactions') as reactions,
  (r.data -> 'legendary_actions') as legendary_actions,
  (r.data -> 'forms') as forms,
  r.mechanics,
  r.data as stat_block,
  d.current_revision,
  d.updated_at
from public.reference_definitions d
join public.reference_definition_revisions r
  on r.definition_id = d.id
 and r.revision = d.current_revision
where d.kind = 'monster'
  and d.status = 'active';

grant select on public.bestiary_catalog to authenticated;
grant select on public.bestiary_catalog to service_role;

comment on view public.bestiary_catalog is
  'D&D 5e reusable monster definitions exposed from Chasovoy. Canonical ownership remains in reference_definitions/reference_definition_revisions.';
