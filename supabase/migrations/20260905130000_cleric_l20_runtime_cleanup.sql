-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/clericLevel20RuntimeAudit.test.ts
-- CLASS_WORK_STATUS: cleric:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

-- Runtime completion introduced corrected finite-resource actions under stable
-- new ids. Older catalog rows used different ids/source keys and therefore could
-- survive beside the corrected action as a second, free button. Remove only the
-- historical ids; never delete by action key because some canonical actions
-- intentionally reuse the same key (for example war_priest).
create or replace function private.cleric_l20_remove_legacy_action(
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

select private.cleric_l20_remove_legacy_action('subclass:cleric:death-domain',2,'cleric-death-touch-of-death-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:forge-domain',2,'cleric-forge-artisans-blessing-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:grave-domain',3,'cleric-grave-path-to-grave-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:grave-domain',17,'cleric-grave-enhanced-necromancy-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:knowledge-domain',3,'cleric-knowledge-mind-magic-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:light-domain',3,'cleric-light-radiance-of-dawn-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:light-domain',3,'cleric-light-warding-flare-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:peace-domain',1,'cleric-peace-emboldening-bond-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:tempest-domain',1,'cleric-tempest-wrath-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:tempest-domain',2,'cleric-tempest-destructive-wrath-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:trickery-domain',3,'cleric-trickery-invoke-duplicity-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:war-domain',3,'cleric-war-guided-strike-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:war-domain',3,'cleric-war-priest-action');
select private.cleric_l20_remove_legacy_action('subclass:cleric:war-domain',6,'cleric-war-gods-blessing-shield');
select private.cleric_l20_remove_legacy_action('subclass:cleric:war-domain',6,'cleric-war-gods-blessing-spiritual');

-- Fail the migration if a historical free alias survived.
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
      'cleric-war-gods-blessing-spiritual'
    );
  if v_count<>0 then
    raise exception 'Cleric L20 runtime cleanup left % legacy free actions',v_count;
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

drop function private.cleric_l20_remove_legacy_action(text,integer,text);

commit;
