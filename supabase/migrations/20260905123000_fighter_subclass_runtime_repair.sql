begin;

-- Preserve current authored/generated presentation before restoring the
-- canonical Fighter mechanics pack. Production missed the historical completion
-- migration while later reference syncs kept prose but removed choices/resources.
create temp table _fighter_runtime_snapshot on commit drop as
select
  t.id as template_id,
  t.catalog_key,
  t.name,
  t.catalog_revision,
  t.mechanical_summary,
  coalesce(t.rules_meta, '{}'::jsonb) as rules_meta,
  l.level,
  coalesce(l.mechanics, '[]'::jsonb) as mechanics
from public.rule_templates t
join public.rule_template_levels l on l.template_id = t.id
where t.is_active
  and (t.catalog_key = 'class:fighter' or t.catalog_key like 'subclass:fighter:%');

-- Normal migration chains already have private.apply_fighter_completion().
-- The live database had migration-history drift, so bootstrap the historical
-- pack from an immutable repository commit only when that function is absent.
do $bootstrap$
declare
  v_status integer;
  v_sql text;
begin
  if to_regprocedure('private.apply_fighter_completion(uuid)') is null then
    select status, content into v_status, v_sql
    from extensions.http_get(
      'https://raw.githubusercontent.com/reapirez-cloud/MEGANOTRPG/8884fcbcbed66e8b649e5d70196d26c490e1fbe4/supabase/migrations/20260829060000_fighter_completion_and_ru_audit.sql'
    );

    if v_status <> 200 or v_sql is null or length(v_sql) < 1000 then
      raise exception 'fighter runtime repair: canonical bootstrap unavailable (HTTP %, bytes %)',
        v_status, coalesce(length(v_sql), 0);
    end if;

    v_sql := regexp_replace(v_sql, '^\s*begin;\s*', '', 'i');
    v_sql := regexp_replace(v_sql, '\s*commit;\s*$', '', 'i');
    execute v_sql;
  end if;
end
$bootstrap$;

-- Re-apply the canonical executable layer for every campaign containing Fighter.
do $apply$
declare
  r record;
begin
  for r in
    select distinct campaign_id
    from public.rule_templates
    where is_active and catalog_key = 'class:fighter'
  loop
    perform private.apply_fighter_completion(r.campaign_id);
  end loop;
end
$apply$;

-- Preserve current feature prose, spell records and useful generated actions.
-- Canonical actions win on equal labels/keys; this prevents duplicated buttons.
update public.rule_template_levels l
set mechanics = rebuilt.mechanics
from _fighter_runtime_snapshot s
cross join lateral (
  select coalesce(jsonb_agg(x.m order by x.bucket, x.ord), '[]'::jsonb) as mechanics
  from (
    select m, 0 as bucket, ord
    from jsonb_array_elements(s.mechanics) with ordinality q(m, ord)
    where m->>'type' = 'grant' and m->>'target' = 'feature'

    union all

    select m, 1 as bucket, ord
    from jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) with ordinality q(m, ord)
    where not (m->>'type' = 'grant' and m->>'target' = 'feature')
      and m->>'type' <> 'spell'

    union all

    select m, 2 as bucket, ord
    from jsonb_array_elements(s.mechanics) with ordinality q(m, ord)
    where m->>'type' = 'spell'

    union all

    select original.m, 3 as bucket, original.ord
    from jsonb_array_elements(s.mechanics) with ordinality original(m, ord)
    where original.m->>'type' = 'action'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) canonical(m)
        where canonical.m->>'type' = 'action'
          and (
            canonical.m->>'key' = original.m->>'key'
            or (
              coalesce(canonical.m->>'label','') <> ''
              and canonical.m->>'label' = original.m->>'label'
            )
          )
      )
  ) x
) rebuilt
where l.template_id = s.template_id and l.level = s.level;

-- Preserve current catalog wording/metadata, merge canonical runtime flags and
-- mark the resulting Fighter layer as mechanically audited.
update public.rule_templates t
set
  name = s.name,
  catalog_revision = s.catalog_revision,
  mechanical_summary = s.mechanical_summary,
  rules_meta = coalesce(t.rules_meta, '{}'::jsonb)
    || s.rules_meta
    || jsonb_build_object(
      'fighter_runtime_repair', true,
      'fighter_runtime_repair_revision', '2026-09-05',
      'mechanics_authority', 'AUDITED',
      'persistent_level_choices', true
    ),
  updated_at = now()
from (
  select distinct on (template_id)
    template_id, name, catalog_revision, mechanical_summary, rules_meta
  from _fighter_runtime_snapshot
  order by template_id, level
) s
where t.id = s.template_id;

create or replace function private.fighter_runtime_put_grant(
  p_catalog_key text,
  p_level integer,
  p_mechanic jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_identity text := coalesce(p_mechanic->>'id', p_mechanic->>'key');
begin
  select id into v_id
  from public.rule_templates
  where is_active and catalog_key = p_catalog_key
  order by version desc
  limit 1;

  if v_id is null then return; end if;

  insert into public.rule_template_levels(template_id, level, mechanics, choices)
  values(v_id, p_level, '[]'::jsonb, '[]'::jsonb)
  on conflict(template_id, level) do nothing;

  update public.rule_template_levels l
  set mechanics = coalesce((
    select jsonb_agg(m order by ord)
    from jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) with ordinality q(m, ord)
    where coalesce(m->>'id', m->>'key') <> v_identity
  ), '[]'::jsonb) || jsonb_build_array(p_mechanic)
  where l.template_id = v_id and l.level = p_level;
end;
$$;

-- Cavalier counters omitted by the historical precision pass.
select private.fighter_runtime_put_grant(
  'subclass:fighter:cavalier', 3,
  '{"id":"fighter-cavalier-mark-pool","type":"grant","target":"resource","key":"unwavering_mark_bonus_attack","sourceKey":"unwavering-mark","grantOperation":"REPLACE","priority":3,"payload":{"max":{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.strength.modifier"}]},"label":"Непоколебимая метка","initial":"full","recharge":{"triggers":["long_rest"],"restore":"full"}}}'::jsonb
);
select private.fighter_runtime_put_grant(
  'subclass:fighter:cavalier', 7,
  '{"id":"fighter-cavalier-warding-pool","type":"grant","target":"resource","key":"warding_maneuver","sourceKey":"warding-maneuver","grantOperation":"REPLACE","priority":7,"payload":{"max":{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.constitution.modifier"}]},"label":"Защитный манёвр","initial":"full","recharge":{"triggers":["long_rest"],"restore":"full"}}}'::jsonb
);

-- Echo Knight counters.
select private.fighter_runtime_put_grant(
  'subclass:fighter:echo-knight', 3,
  '{"id":"fighter-echo-unleash-pool","type":"grant","target":"resource","key":"unleash_incarnation","sourceKey":"unleash-incarnation","grantOperation":"REPLACE","priority":3,"payload":{"max":{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.constitution.modifier"}]},"label":"Воплощение ярости","initial":"full","recharge":{"triggers":["long_rest"],"restore":"full"}}}'::jsonb
);
select private.fighter_runtime_put_grant(
  'subclass:fighter:echo-knight', 10,
  '{"id":"fighter-echo-martyr-pool","type":"grant","target":"resource","key":"shadow_martyr","sourceKey":"shadow-martyr","grantOperation":"REPLACE","priority":10,"payload":{"max":1,"label":"Теневой мученик","initial":"full","recharge":{"triggers":["short_rest","long_rest"],"restore":"full"}}}'::jsonb
);
select private.fighter_runtime_put_grant(
  'subclass:fighter:echo-knight', 15,
  '{"id":"fighter-echo-reclaim-pool","type":"grant","target":"resource","key":"reclaim_potential","sourceKey":"reclaim-potential","grantOperation":"REPLACE","priority":15,"payload":{"max":{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.constitution.modifier"}]},"label":"Возврат потенциала","initial":"full","recharge":{"triggers":["long_rest"],"restore":"full"}}}'::jsonb
);

-- Samurai counters. Tireless Spirit is a structured executor event below.
select private.fighter_runtime_put_grant(
  'subclass:fighter:samurai', 3,
  '{"id":"fighter-samurai-spirit-pool","type":"grant","target":"resource","key":"fighting_spirit","sourceKey":"fighting-spirit","grantOperation":"REPLACE","priority":3,"payload":{"max":3,"label":"Боевой дух","initial":"full","recharge":{"triggers":["long_rest"],"restore":"full"}}}'::jsonb
);
select private.fighter_runtime_put_grant(
  'subclass:fighter:samurai', 18,
  '{"id":"fighter-samurai-death-pool","type":"grant","target":"resource","key":"strength_before_death","sourceKey":"strength-before-death","grantOperation":"REPLACE","priority":18,"payload":{"max":1,"label":"Стойкость перед смертью","initial":"full","recharge":{"triggers":["long_rest"],"restore":"full"}}}'::jsonb
);

-- Champion publishes improved critical as a generic scalar and structured rule;
-- consumers can apply it to weapon/unarmed attack resolution without class names.
select private.fighter_runtime_put_grant(
  'subclass:fighter:champion', 3,
  '{"id":"fighter-champion-critical-19","type":"grant","target":"value","key":"attack_critical_threshold","sourceKey":"improved-critical","grantOperation":"REPLACE","priority":3,"payload":{"value":19,"label":"Порог критического попадания"}}'::jsonb
);
select private.fighter_runtime_put_grant(
  'subclass:fighter:champion', 15,
  '{"id":"fighter-champion-critical-18","type":"grant","target":"value","key":"attack_critical_threshold","sourceKey":"superior-critical","grantOperation":"REPLACE","priority":15,"payload":{"value":18,"label":"Порог критического попадания"}}'::jsonb
);

-- Add costs to generated actions that already exist; this keeps one UI action and
-- lets Character Engine availability/spending use the restored counters.
do $costs$
declare
  r record;
  v_cost_key text;
begin
  for r in
    select t.id as template_id, t.catalog_key, l.level, m, ord
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
    where t.is_active and t.catalog_key in (
      'subclass:fighter:cavalier','subclass:fighter:echo-knight','subclass:fighter:samurai'
    ) and m->>'type'='action'
  loop
    v_cost_key := case
      when r.catalog_key='subclass:fighter:cavalier' and r.m->>'sourceKey' like 'warding-maneuver%' then 'warding_maneuver'
      when r.catalog_key='subclass:fighter:echo-knight' and r.m->>'sourceKey' like 'shadow-martyr%' then 'shadow_martyr'
      when r.catalog_key='subclass:fighter:samurai' and r.m->>'sourceKey' like 'strength-before-death%' then 'strength_before_death'
      else null
    end;

    if v_cost_key is not null then
      update public.rule_template_levels l
      set mechanics = (
        select jsonb_agg(
          case when ord=r.ord
            then jsonb_set(m,'{resourceCosts}',jsonb_build_array(jsonb_build_object('key',v_cost_key,'amount',1)),true)
            else m end
          order by ord
        )
        from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
      )
      where l.template_id=r.template_id and l.level=r.level;
    end if;
  end loop;
end
$costs$;

-- Structured rules for effects whose executor lifecycle is broader than a plain
-- rest counter.
do $structured$
declare
  r record;
begin
  for r in
    select t.id as template_id,t.catalog_key,l.level
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    where t.is_active and (
      (t.catalog_key='subclass:fighter:champion' and l.level in (3,15)) or
      (t.catalog_key='subclass:fighter:samurai' and l.level=10)
    )
  loop
    update public.rule_template_levels l
    set mechanics = (
      select jsonb_agg(
        case
          when r.catalog_key='subclass:fighter:champion' and r.level=3
            and m->>'type'='grant' and m->>'target'='feature'
            then jsonb_set(m,'{payload,mechanic}','{"kind":"attack_critical_threshold","threshold":19,"appliesTo":["weapon","unarmed"]}'::jsonb,true)
          when r.catalog_key='subclass:fighter:champion' and r.level=15
            and m->>'type'='grant' and m->>'target'='feature'
            then jsonb_set(m,'{payload,mechanic}','{"kind":"attack_critical_threshold","threshold":18,"appliesTo":["weapon","unarmed"]}'::jsonb,true)
          when r.catalog_key='subclass:fighter:samurai' and r.level=10
            and m->>'type'='grant' and m->>'target'='feature'
            then jsonb_set(m,'{payload,mechanic}','{"kind":"resource_floor_on_initiative","resourceKey":"fighting_spirit","minimum":1}'::jsonb,true)
          else m
        end
        order by ord
      )
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
    )
    where l.template_id=r.template_id and l.level=r.level;
  end loop;
end
$structured$;

-- Hard integrity gate: fail atomically if persistent selections or core resource
-- systems are still missing.
do $verify$
declare
  v_missing text;
begin
  with required(catalog_key, choice_key) as (values
    ('subclass:fighter:arcane-archer','arcane_shot_options'),
    ('subclass:fighter:battle-master','battle_master_maneuvers'),
    ('subclass:fighter:rune-knight','rune_knight_runes')
  ), missing as (
    select req.catalog_key || ':' || req.choice_key as item
    from required req
    where not exists (
      select 1
      from public.rule_templates t
      join public.rule_template_levels l on l.template_id=t.id
      cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c
      where t.is_active and t.catalog_key=req.catalog_key and c->>'key'=req.choice_key
    )
  )
  select string_agg(item, ', ') into v_missing from missing;

  if v_missing is not null then
    raise exception 'fighter runtime repair missing persistent choices: %', v_missing;
  end if;

  with required(catalog_key, resource_key) as (values
    ('subclass:fighter:arcane-archer','arcane_shot'),
    ('subclass:fighter:battle-master','superiority_dice'),
    ('subclass:fighter:banneret','group_recovery'),
    ('subclass:fighter:cavalier','warding_maneuver'),
    ('subclass:fighter:echo-knight','unleash_incarnation'),
    ('subclass:fighter:eldritch-knight','spell_slot_1'),
    ('subclass:fighter:psi-warrior','psionic_energy'),
    ('subclass:fighter:rune-knight','giants_might'),
    ('subclass:fighter:samurai','fighting_spirit')
  ), missing as (
    select req.catalog_key || ':' || req.resource_key as item
    from required req
    where not exists (
      select 1
      from public.rule_templates t
      join public.rule_template_levels l on l.template_id=t.id
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
      where t.is_active and t.catalog_key=req.catalog_key
        and m->>'type'='grant' and m->>'target'='resource' and m->>'key'=req.resource_key
    )
  )
  select string_agg(item, ', ') into v_missing from missing;

  if v_missing is not null then
    raise exception 'fighter runtime repair missing resources: %', v_missing;
  end if;
end
$verify$;

drop function if exists private.fighter_runtime_put_grant(text,integer,jsonb);

commit;
