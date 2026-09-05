-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_WORK_STATUS: fighter:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- CLASS_INTEGRATION_STRICT: class:fighter
-- CLASS_PACKAGE_TEST: tests/fighterRuntimeClosure.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
begin;

-- Final Fighter runtime closure.
--
-- Why this exists:
-- 1. the earlier completion draft contains one malformed Battle Master choice
--    JSON boundary;
-- 2. the earlier Psi pass models the free Telekinesis use as a class spell paid
--    from a psi resource, which is rejected by the class-spell contract;
-- 3. later reference-card generation removed persistent choices/resources from
--    the effective Fighter subclass templates.
--
-- The original payloads are fetched from an immutable commit and verified by
-- exact byte length + marker before execution. Current cards are snapshotted
-- first and restored after canonical mechanics are rebuilt, so Voss text and
-- current presentation win while executable choices/resources survive.

do $fighter_closure$
declare
  v_commit constant text := '0eb033963217dc96d9bd4624d3035d544fe81ccf';
  v_base constant text := 'https://raw.githubusercontent.com/reapirez-cloud/MEGANOTRPG/';
  v_status integer;
  v_sql text;
  v_start integer;
  v_end integer;
  v_rel integer;
  v_count integer;
begin
  -- 1) Snapshot the effective current Fighter cards and install the canonical
  -- helper constructors used by the historical completion pack.
  select status, content into v_status, v_sql
  from extensions.http_get((v_base || v_commit || '/supabase/migrations/20260905190000_fighter_runtime_repair_snapshot.sql')::varchar);

  if v_status <> 200
     or octet_length(v_sql) <> 3566
     or position('fighter_runtime_repair_snapshot' in v_sql) = 0 then
    raise exception 'Fighter closure: pinned snapshot verification failed (status %, bytes %)',
      v_status, octet_length(v_sql);
  end if;

  v_sql := regexp_replace(v_sql, '^\s*begin;\s*', '', 'i');
  v_sql := regexp_replace(v_sql, '\s*commit;\s*$', '', 'i');
  execute v_sql;

  -- 2) Reapply canonical Fighter mechanics, correcting the single malformed
  -- Battle Master JSON boundary in memory. The immutable source is intentionally
  -- not rewritten: the correction is explicit and signature-checked here.
  select status, content into v_status, v_sql
  from extensions.http_get((v_base || v_commit || '/supabase/migrations/20260905190100_fighter_completion_reapply.sql')::varchar);

  if v_status <> 200
     or octet_length(v_sql) <> 94644
     or position('create or replace function private.apply_fighter_completion' in v_sql) = 0 then
    raise exception 'Fighter closure: pinned completion verification failed (status %, bytes %)',
      v_status, octet_length(v_sql);
  end if;

  v_count := (length(v_sql) - length(replace(v_sql, '}]}}]}}', ''))) / length('}]}}]}}');
  if v_count <> 1 then
    raise exception 'Fighter closure: expected exactly one malformed Battle Master boundary, found %', v_count;
  end if;
  v_sql := replace(v_sql, '}]}}]}}', '}]}]}}');
  v_sql := regexp_replace(v_sql, '^\s*begin;\s*', '', 'i');
  v_sql := regexp_replace(v_sql, '\s*commit;\s*$', '', 'i');
  execute v_sql;

  -- 3) Reapply the Psi runtime pass, but remove only the invalid spell object
  -- for the free Telekinesis use. Telekinesis remains represented by the Psi
  -- feature/action/resource mechanics in this pass instead of pretending to be
  -- a slot-based class spell.
  select status, content into v_status, v_sql
  from extensions.http_get((v_base || v_commit || '/supabase/migrations/20260905190200_fighter_psi_runtime_reapply.sql')::varchar);

  if v_status <> 200
     or octet_length(v_sql) <> 13637
     or position('Final Psi Warrior runtime pass' in v_sql) = 0 then
    raise exception 'Fighter closure: pinned Psi verification failed (status %, bytes %)',
      v_status, octet_length(v_sql);
  end if;

  v_start := position($sig$jsonb_build_object(
      'id','fighter-psi-telekinesis-spell'$sig$ in v_sql);
  if v_start = 0 then
    raise exception 'Fighter closure: Psi Telekinesis spell signature missing';
  end if;
  v_rel := position($marker$    private.fighter_psi_restore_action($marker$ in substring(v_sql from v_start));
  if v_rel = 0 then
    raise exception 'Fighter closure: Psi restore-action marker missing';
  end if;
  v_end := v_start - 1 + v_rel;
  v_sql := left(v_sql, v_start - 1) || substring(v_sql from v_end);
  v_sql := regexp_replace(v_sql, '^\s*begin;\s*', '', 'i');
  v_sql := regexp_replace(v_sql, '\s*commit;\s*$', '', 'i');
  execute v_sql;

  -- 4) Restore the latest narrative/presentation layer from the snapshot while
  -- retaining the rebuilt canonical executable mechanics and choices.
  select status, content into v_status, v_sql
  from extensions.http_get((v_base || v_commit || '/supabase/migrations/20260905190300_fighter_runtime_repair_restore.sql')::varchar);

  if v_status <> 200
     or octet_length(v_sql) <> 6657
     or position('fighter_runtime_repair' in v_sql) = 0 then
    raise exception 'Fighter closure: pinned restore verification failed (status %, bytes %)',
      v_status, octet_length(v_sql);
  end if;
  v_sql := regexp_replace(v_sql, '^\s*begin;\s*', '', 'i');
  v_sql := regexp_replace(v_sql, '\s*commit;\s*$', '', 'i');
  execute v_sql;

  -- 5) Apply the safe additive tail from the earlier closure draft. Bootstrap
  -- code is deliberately skipped; only the helper + counters/costs/structured
  -- rules + assertions after this marker are executed.
  select status, content into v_status, v_sql
  from extensions.http_get((v_base || v_commit || '/supabase/migrations/20260905123000_fighter_subclass_runtime_repair.sql')::varchar);

  if v_status <> 200
     or octet_length(v_sql) <> 15375
     or position('private.fighter_runtime_put_grant' in v_sql) = 0
     or position('fighter runtime repair missing resources' in v_sql) = 0 then
    raise exception 'Fighter closure: pinned additive tail verification failed (status %, bytes %)',
      v_status, octet_length(v_sql);
  end if;
  v_start := position('create or replace function private.fighter_runtime_put_grant' in v_sql);
  v_sql := substring(v_sql from v_start);
  v_sql := regexp_replace(v_sql, '\s*commit;\s*$', '', 'i');
  execute v_sql;

  -- Final hard assertions against the effective live shape.
  select count(*) into v_count
  from public.rule_templates
  where is_active and catalog_key like 'subclass:fighter:%';
  if v_count <> 10 then
    raise exception 'Fighter closure: expected 10 active Fighter subclasses, found %', v_count;
  end if;

  if not exists (
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id = t.id and l.level = 3
    cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) c
    where t.is_active and t.catalog_key = 'subclass:fighter:arcane-archer'
      and c->>'key' = 'arcane_shot_options'
      and jsonb_array_length(coalesce(c->'options', '[]'::jsonb)) = 8
      and (select count(*) from jsonb_object_keys(coalesce(c->'option_mechanics', '{}'::jsonb))) = 8
  ) then
    raise exception 'Fighter closure: Arcane Archer choice contract is incomplete';
  end if;

  if not exists (
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id = t.id and l.level = 3
    cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) c
    where t.is_active and t.catalog_key = 'subclass:fighter:battle-master'
      and c->>'key' = 'battle_master_maneuvers'
      and jsonb_array_length(coalesce(c->'options', '[]'::jsonb)) = 20
      and (select count(*) from jsonb_object_keys(coalesce(c->'option_mechanics', '{}'::jsonb))) = 20
  ) then
    raise exception 'Fighter closure: Battle Master maneuver contract is incomplete';
  end if;

  if not exists (
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id = t.id and l.level = 3
    cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) c
    where t.is_active and t.catalog_key = 'subclass:fighter:rune-knight'
      and c->>'key' = 'rune_knight_runes'
      and jsonb_array_length(coalesce(c->'options', '[]'::jsonb)) = 6
      and c->'option_unlock_level'->>'hill' = '7'
      and c->'option_unlock_level'->>'storm' = '7'
      and (select count(*) from jsonb_object_keys(coalesce(c->'option_mechanics', '{}'::jsonb))) = 6
  ) then
    raise exception 'Fighter closure: Rune Knight rune contract is incomplete';
  end if;

  if not exists (
    select 1 from public.rule_templates t
    join public.rule_template_levels l on l.template_id = t.id and l.level = 3
    cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m
    where t.is_active and t.catalog_key = 'subclass:fighter:champion'
      and m->>'type' = 'grant' and m->>'target' = 'value'
      and m->>'key' = 'attack_critical_threshold' and m#>>'{payload,value}' = '19'
  ) or not exists (
    select 1 from public.rule_templates t
    join public.rule_template_levels l on l.template_id = t.id and l.level = 15
    cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m
    where t.is_active and t.catalog_key = 'subclass:fighter:champion'
      and m->>'type' = 'grant' and m->>'target' = 'value'
      and m->>'key' = 'attack_critical_threshold' and m#>>'{payload,value}' = '18'
  ) then
    raise exception 'Fighter closure: Champion critical thresholds are incomplete';
  end if;

  select count(*) into v_count
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id = t.id
  cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m
  where t.is_active and t.catalog_key = 'subclass:fighter:psi-warrior'
    and m->>'type' = 'spell'
    and (m->>'id' = 'fighter-psi-telekinesis-spell' or m->>'key' = 'spell:telekinesis');
  if v_count <> 0 then
    raise exception 'Fighter closure: invalid Psi Telekinesis class-spell mechanic remains';
  end if;

  select count(*) into v_count
  from public.rule_templates
  where is_active and catalog_key like 'subclass:fighter:%'
    and rules_meta->>'mechanics_authority' = 'AUDITED';
  if v_count <> 10 then
    raise exception 'Fighter closure: expected all 10 Fighter subclasses audited, found %', v_count;
  end if;

  -- No top-level action may spend an undeclared subclass resource.
  if exists (
    with f as (
      select id, catalog_key from public.rule_templates
      where is_active and catalog_key like 'subclass:fighter:%'
    ), resources as (
      select f.catalog_key, m->>'key' resource_key
      from f join public.rule_template_levels l on l.template_id = f.id
      cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m
      where m->>'type' = 'grant' and m->>'target' = 'resource'
    ), costs as (
      select f.catalog_key, c->>'key' cost_key
      from f join public.rule_template_levels l on l.template_id = f.id
      cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m
      cross join lateral jsonb_array_elements(coalesce(m->'resourceCosts', '[]'::jsonb)) c
      where m->>'type' = 'action'
    )
    select 1 from costs
    where not exists (
      select 1 from resources r
      where r.catalog_key = costs.catalog_key and r.resource_key = costs.cost_key
    )
  ) then
    raise exception 'Fighter closure: top-level action references an undeclared resource';
  end if;

  -- Choice option actions may spend either a subclass top-level resource or a
  -- resource granted by that same option; every other reference is invalid.
  if exists (
    with f as (
      select id, catalog_key from public.rule_templates
      where is_active and catalog_key in (
        'subclass:fighter:arcane-archer',
        'subclass:fighter:battle-master',
        'subclass:fighter:rune-knight'
      )
    ), cm as (
      select f.catalog_key, c->>'key' choice_key, opt.key option_key, m
      from f join public.rule_template_levels l on l.template_id = f.id
      cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) c
      cross join lateral jsonb_each(coalesce(c->'option_mechanics', '{}'::jsonb)) opt(key, arr)
      cross join lateral jsonb_array_elements(opt.arr) m
    ), option_resources as (
      select catalog_key, choice_key, option_key, m->>'key' resource_key
      from cm where m->>'type' = 'grant' and m->>'target' = 'resource'
    ), top_resources as (
      select f.catalog_key, m->>'key' resource_key
      from f join public.rule_template_levels l on l.template_id = f.id
      cross join lateral jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) m
      where m->>'type' = 'grant' and m->>'target' = 'resource'
    ), costs as (
      select cm.catalog_key, cm.choice_key, cm.option_key, cost->>'key' cost_key
      from cm
      cross join lateral jsonb_array_elements(coalesce(cm.m->'resourceCosts', '[]'::jsonb)) cost
      where cm.m->>'type' = 'action'
    )
    select 1 from costs
    where not exists (
      select 1 from top_resources tr
      where tr.catalog_key = costs.catalog_key and tr.resource_key = costs.cost_key
    ) and not exists (
      select 1 from option_resources r
      where r.catalog_key = costs.catalog_key
        and r.choice_key = costs.choice_key
        and r.option_key = costs.option_key
        and r.resource_key = costs.cost_key
    )
  ) then
    raise exception 'Fighter closure: choice action references an undeclared resource';
  end if;

  if to_regclass('private.fighter_runtime_repair_snapshot') is not null then
    raise exception 'Fighter closure: snapshot table was not cleaned up';
  end if;
end
$fighter_closure$;

commit;
