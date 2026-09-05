-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/clericLevel20RuntimeAudit.test.ts
-- CLASS_WORK_STATUS: cleric:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

-- Runtime completion introduced corrected finite-resource mechanics under stable
-- new ids. Older catalog rows used different ids/source keys and therefore could
-- survive beside the corrected action/resource. Remove only historical ids;
-- never delete by action/resource key because some canonical mechanics reuse a
-- key intentionally (for example war_priest).
create or replace function private.cleric_l20_remove_legacy_mechanic(
  p_catalog_key text,
  p_level integer,
  p_legacy_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_template uuid;
begin
  select id into v_template
  from public.rule_templates
  where catalog_key=p_catalog_key and is_active
  order by version desc,updated_at desc
  limit 1;
  if v_template is null then return; end if;

  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(m order by ord)
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(m,ord)
    where m->>'id'<>p_legacy_id
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=p_level;
end;
$$;

-- Superseded free/legacy action rows.
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:death-domain',2,'cleric-death-touch-of-death-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:forge-domain',2,'cleric-forge-artisans-blessing-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:grave-domain',3,'cleric-grave-path-to-grave-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:grave-domain',17,'cleric-grave-enhanced-necromancy-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:knowledge-domain',3,'cleric-knowledge-mind-magic-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:light-domain',3,'cleric-light-radiance-of-dawn-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:light-domain',3,'cleric-light-warding-flare-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:peace-domain',1,'cleric-peace-emboldening-bond-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:tempest-domain',1,'cleric-tempest-wrath-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:tempest-domain',2,'cleric-tempest-destructive-wrath-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:trickery-domain',3,'cleric-trickery-invoke-duplicity-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:war-domain',3,'cleric-war-guided-strike-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:war-domain',3,'cleric-war-priest-action');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:war-domain',6,'cleric-war-gods-blessing-shield');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:war-domain',6,'cleric-war-gods-blessing-spiritual');

-- Superseded resource rows whose new canonical ledger uses another id/key.
-- Rows whose runtime-completion id is identical (Grave Sentinel, Knowledge
-- Foreknowledge, Tempest Wrath, Twilight Steps, War Priest) are replaced in
-- place by the earlier migration and must not be removed here.
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:light-domain',3,'cleric-light-warding-flare-resource-l3');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:light-domain',6,'cleric-light-warding-flare-resource-l6');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:order-domain',6,'cleric-order-embodiment-resource');
select private.cleric_l20_remove_legacy_mechanic('subclass:cleric:peace-domain',1,'cleric-peace-emboldening-bond-resource');

-- Fail the migration if a historical alias/ledger survived.
do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
  where t.is_active and t.catalog_key like 'subclass:cleric:%'
    and m->>'id' in (
      'cleric-death-touch-of-death-action',
      'cleric-forge-artisans-blessing-action',
      'cleric-grave-path-to-grave-action',
      'cleric-grave-enhanced-necromancy-action',
      'cleric-knowledge-mind-magic-action',
      'cleric-light-radiance-of-dawn-action',
      'cleric-light-warding-flare-action',
      'cleric-peace-emboldening-bond-action',
      'cleric-tempest-wrath-action',
      'cleric-tempest-destructive-wrath-action',
      'cleric-trickery-invoke-duplicity-action',
      'cleric-war-guided-strike-action',
      'cleric-war-priest-action',
      'cleric-war-gods-blessing-shield',
      'cleric-war-gods-blessing-spiritual',
      'cleric-light-warding-flare-resource-l3',
      'cleric-light-warding-flare-resource-l6',
      'cleric-order-embodiment-resource',
      'cleric-peace-emboldening-bond-resource'
    );
  if v_count<>0 then
    raise exception 'Cleric L20 runtime cleanup left % legacy mechanics',v_count;
  end if;
end $$;

-- The corrected actions must exist and must point at a finite CE ledger. This
-- assertion protects sequential deployment: runtime_completion runs first, then
-- this cleanup removes only its superseded predecessors.
do $$
declare v_missing integer;
begin
  with expected(id,resource_key) as (values
    ('cleric-death-touch-runtime','channel_divinity'),
    ('cleric-forge-artisan-runtime','channel_divinity'),
    ('cleric-grave-path-runtime','channel_divinity'),
    ('cleric-grave-enhanced-necromancy-runtime','channel_divinity'),
    ('cleric-knowledge-mind-magic-runtime','channel_divinity'),
    ('cleric-light-radiance-runtime','channel_divinity'),
    ('cleric-light-flare-action','light_warding_flare'),
    ('cleric-peace-bond-action','peace_emboldening_bond'),
    ('cleric-tempest-wrath-action','tempest_wrath_of_storm'),
    ('cleric-tempest-destructive-runtime','channel_divinity'),
    ('cleric-trickery-duplicity-runtime','channel_divinity'),
    ('cleric-war-guided-strike-action','channel_divinity'),
    ('cleric-war-priest-action','war_priest'),
    ('cleric-war-god-shield-action','channel_divinity'),
    ('cleric-war-god-weapon-action','channel_divinity')
  ), actual as (
    select m->>'id' id,m->>'resourceKey' resource_key,coalesce((m->>'resourceCost')::integer,0) resource_cost
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.is_active and t.catalog_key like 'subclass:cleric:%' and m->>'type'='action'
  )
  select count(*) into v_missing
  from expected e
  left join actual a on a.id=e.id and a.resource_key=e.resource_key and a.resource_cost=1
  where a.id is null;

  if v_missing<>0 then
    raise exception 'Cleric L20 runtime cleanup is missing % canonical finite-resource actions',v_missing;
  end if;
end $$;

-- Canonical replacement ledgers must also exist after old-key cleanup.
do $$
declare v_missing integer;
begin
  with expected(id,resource_key) as (values
    ('cleric-light-flare-resource','light_warding_flare'),
    ('cleric-light-flare-upgrade-resource','light_warding_flare'),
    ('cleric-order-law-resource','order_embodiment_law'),
    ('cleric-peace-bond-resource','peace_emboldening_bond')
  ), actual as (
    select m->>'id' id,m->>'key' resource_key
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.is_active and t.catalog_key like 'subclass:cleric:%' and m->>'type'='resource'
  )
  select count(*) into v_missing
  from expected e left join actual a on a.id=e.id and a.resource_key=e.resource_key
  where a.id is null;

  if v_missing<>0 then
    raise exception 'Cleric L20 runtime cleanup is missing % canonical replacement resources',v_missing;
  end if;
end $$;

drop function private.cleric_l20_remove_legacy_mechanic(text,integer,text);

commit;
