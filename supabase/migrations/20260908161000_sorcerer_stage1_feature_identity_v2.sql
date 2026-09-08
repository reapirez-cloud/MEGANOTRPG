-- CLASS_MIGRATION_SCOPE: infrastructure
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_WORK_STATUS: sorcerer:catalog=STAGE1_READY, sorcerer:mechanics=PENDING_STAGE2
--
-- Forward-only repair for Stage 1. Repeated progression features (Metamagic,
-- ASI and subclass feature rows) must not share one CE grant identity across
-- different class levels. Keep the display/source key, but make the grant key
-- level-stable so level 10+ resolution cannot collide on different payloads.

begin;

create or replace function private.ensure_sorcerer_catalog_stage1_v2(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_sorcerer uuid;
begin
  perform private.ensure_sorcerer_catalog_stage1_v1(p_campaign_id);

  select id into v_sorcerer
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:sorcerer'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_sorcerer is null then
    raise exception 'SORCERER_STAGE1_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  update public.rule_template_levels rtl
  set mechanics = coalesce((
    select jsonb_agg(
      case
        when mechanic->>'type'='grant'
          and mechanic->>'target'='feature'
          and mechanic->>'key' like 'class:sorcerer:%'
          and mechanic->>'key' !~ ':l[0-9]+$'
        then jsonb_set(
          mechanic,
          '{key}',
          to_jsonb((mechanic->>'key') || ':l' || rtl.level::text),
          false
        )
        else mechanic
      end
      order by ordinal
    )
    from jsonb_array_elements(coalesce(rtl.mechanics,'[]'::jsonb))
      with ordinality as entry(mechanic,ordinal)
  ),'[]'::jsonb)
  where rtl.template_id=v_sorcerer;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
      'runtime_revision','xphb-2024-sorcerer-stage1-foundation-v2',
      'feature_identity_policy','level_stable_stage1'
    ),
    catalog_revision='xphb-2024-sorcerer-stage1-foundation-v2',
    updated_at=now()
  where id=v_sorcerer;
end;
$$;

revoke all on function private.ensure_sorcerer_catalog_stage1_v2(uuid) from public,anon,authenticated;
grant execute on function private.ensure_sorcerer_catalog_stage1_v2(uuid) to service_role;

create or replace function private.ensure_sorcerer_catalog_stage1_v2_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.ensure_sorcerer_catalog_stage1_v2(new.id);
  return new;
end;
$$;

revoke all on function private.ensure_sorcerer_catalog_stage1_v2_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaad_campaigns_ensure_sorcerer_catalog_stage1_v1 on public.campaigns;
drop trigger if exists aaaaaaaad_campaigns_ensure_sorcerer_catalog_stage1_v2 on public.campaigns;
create trigger aaaaaaaad_campaigns_ensure_sorcerer_catalog_stage1_v2
after insert on public.campaigns
for each row execute function private.ensure_sorcerer_catalog_stage1_v2_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.ensure_sorcerer_catalog_stage1_v2(v_campaign.id);
  end loop;
end;
$block$;

commit;
