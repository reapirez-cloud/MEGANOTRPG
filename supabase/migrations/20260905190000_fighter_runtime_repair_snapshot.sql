-- CLASS_MIGRATION_SCOPE: infrastructure
begin;

create table if not exists private.fighter_runtime_repair_snapshot (
  template_id uuid not null,
  level integer not null,
  mechanics jsonb not null default '[]'::jsonb,
  template_name text,
  rules_meta jsonb,
  catalog_revision text,
  mechanical_summary text,
  primary key (template_id, level)
);

truncate table private.fighter_runtime_repair_snapshot;

insert into private.fighter_runtime_repair_snapshot(
  template_id, level, mechanics, template_name, rules_meta, catalog_revision, mechanical_summary
)
select
  t.id,
  l.level,
  coalesce(l.mechanics,'[]'::jsonb),
  t.name,
  coalesce(t.rules_meta,'{}'::jsonb),
  t.catalog_revision,
  t.mechanical_summary
from public.rule_templates t
join public.rule_template_levels l on l.template_id=t.id
where t.catalog_key='class:fighter'
   or t.catalog_key like 'subclass:fighter:%';

-- Bootstrap only the pure JSON constructors required by the canonical Fighter
-- completion migrations. We intentionally do not re-apply the old base pack,
-- because it also replaces unrelated global resource functions.
create or replace function private.fighter_feature(
  p_id text,p_source_key text,p_key text,p_label text,p_description text,p_mechanic jsonb default '{}'::jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','feature','key',p_key,'sourceKey',p_source_key,
    'payload',jsonb_build_object('label',p_label,'description',p_description,'mechanic',coalesce(p_mechanic,'{}'::jsonb))
  );
$$;

create or replace function private.fighter_resource(
  p_id text,p_source_key text,p_key text,p_label text,p_max jsonb,p_recharge jsonb,
  p_priority integer default 0,p_operation text default 'GRANT',p_recovery_rules jsonb default null
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_id,'type','grant','target','resource','key',p_key,'sourceKey',p_source_key,
    'grantOperation',p_operation,'priority',p_priority,
    'payload',jsonb_strip_nulls(jsonb_build_object(
      'max',p_max,'label',p_label,'initial','full','recharge',p_recharge,'recoveryRules',p_recovery_rules
    ))
  ));
$$;

create or replace function private.fighter_value(
  p_id text,p_source_key text,p_key text,p_label text,p_value jsonb,p_priority integer default 0,p_operation text default 'GRANT'
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','value','key',p_key,'sourceKey',p_source_key,
    'grantOperation',p_operation,'priority',p_priority,
    'payload',jsonb_build_object('label',p_label,'value',p_value)
  );
$$;

create or replace function private.fighter_action(
  p_id text,p_source_key text,p_key text,p_label text,p_economy text,p_costs jsonb default '[]'::jsonb,
  p_effects jsonb default '[]'::jsonb,p_tags jsonb default '[]'::jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_id,'type','action','sourceKey',p_source_key,'key',p_key,'label',p_label,'economy',p_economy,
    'range',jsonb_build_object('kind','self'),
    'resourceCosts',case when jsonb_array_length(coalesce(p_costs,'[]'::jsonb))>0 then p_costs else null end,
    'effects',case when jsonb_array_length(coalesce(p_effects,'[]'::jsonb))>0 then p_effects else null end,
    'tags',coalesce(p_tags,'[]'::jsonb),
    'presentation',jsonb_build_object('tone','amber','icon','◆','display','counter','priority',85)
  ));
$$;

commit;
