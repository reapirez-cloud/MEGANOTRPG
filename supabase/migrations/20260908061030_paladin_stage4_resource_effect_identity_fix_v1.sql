-- CLASS_MIGRATION_SCOPE: runtime
-- CLASS_INTEGRATION_STRICT: class:paladin
begin;

with mapping(catalog_key, mechanic_id, resource_key) as (
  values
    ('subclass:paladin:devotion','devotion-holy-nimbus-recharge','devotion_holy_nimbus'),
    ('subclass:paladin:glory','glory-living-legend-recharge','glory_living_legend'),
    ('subclass:paladin:ancients','ancients-elder-champion-recharge','ancients_elder_champion'),
    ('subclass:paladin:vengeance','vengeance-avenging-angel-recharge','vengeance_avenging_angel')
), targets as (
  select t.id template_id,m.mechanic_id,m.resource_key
  from public.rule_templates t
  join mapping m on m.catalog_key=t.catalog_key
  where t.kind='subclass' and t.is_active
)
update public.rule_template_levels l
set mechanics=(
  select coalesce(jsonb_agg(
    case
      when e.value->>'id'=targets.mechanic_id then
        jsonb_set(e.value,'{effects,0,key}',to_jsonb(targets.resource_key),true)
      else e.value
    end
    order by e.ord
  ),'[]'::jsonb)
  from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(value,ord)
)
from targets
where l.template_id=targets.template_id
  and l.level=20
  and exists(
    select 1 from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) x(value)
    where x.value->>'id'=targets.mechanic_id
  );

do $cert$
declare v_bad integer;
begin
  with expected(catalog_key,mechanic_id,resource_key) as (
    values
      ('subclass:paladin:devotion','devotion-holy-nimbus-recharge','devotion_holy_nimbus'),
      ('subclass:paladin:glory','glory-living-legend-recharge','glory_living_legend'),
      ('subclass:paladin:ancients','ancients-elder-champion-recharge','ancients_elder_champion'),
      ('subclass:paladin:vengeance','vengeance-avenging-angel-recharge','vengeance_avenging_angel')
  )
  select count(*) into v_bad
  from expected e
  where not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=20
    cross join lateral jsonb_array_elements(l.mechanics) m(value)
    where t.kind='subclass' and t.catalog_key=e.catalog_key and t.is_active
      and m.value->>'id'=e.mechanic_id
      and m.value#>>'{effects,0,kind}'='resource'
      and m.value#>>'{effects,0,key}'=e.resource_key
      and m.value#>>'{effects,0,operation}'='RESTORE'
      and (m.value#>>'{effects,0,amount}')::integer=1
  );
  if v_bad<>0 then raise exception 'PALADIN_STAGE4_RESOURCE_EFFECT_IDENTITY_FIX_FAILED:%',v_bad; end if;
end;
$cert$;

commit;