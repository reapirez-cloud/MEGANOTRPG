-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkSubclassBatch1.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:subclasses-batch1=RUNTIME_READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Metadata audit for Monk subclass batch 1. Targeting/range is descriptive only;
-- scene-dependent eligibility remains a table rule and is never faked as CE state.

begin;

create or replace function private.audit_monk_subclasses_batch1_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_template uuid;
begin
  for v_template in
    select id from public.rule_templates
    where campaign_id=p_campaign_id and kind='subclass' and catalog_key in (
      'subclass:monk:mercy','subclass:monk:shadow','subclass:monk:elements','subclass:monk:open-hand'
    ) and is_builtin is true and is_active
  loop
    update public.rule_template_levels l
    set mechanics=coalesce((
      select jsonb_agg(
        case m->>'id'
          when 'mercy-hand-harm-action' then jsonb_set(m,'{range}','{"kind":"custom","label":"Цель Безоружного удара"}'::jsonb,true)
          when 'mercy-hand-healing-action' then jsonb_set(m,'{range}','{"kind":"touch"}'::jsonb,true)
          when 'mercy-hand-healing-flurry' then jsonb_set(m,'{range}','{"kind":"touch"}'::jsonb,true)
          when 'mercy-ultimate-action' then jsonb_set(m,'{range}','{"kind":"touch"}'::jsonb,true)
          when 'shadow-darkness-action' then jsonb_set(m,'{range}','{"kind":"ranged","normal":60,"unit":"feet"}'::jsonb,true)
          when 'elements-burst-action' then jsonb_set(m,'{range}','{"kind":"custom","label":"Точка в пределах 120 футов; сфера радиусом 20 футов"}'::jsonb,true)
          when 'open-hand-technique-addle' then jsonb_set(m,'{range}','{"kind":"custom","label":"Цель попадания Шквала ударов"}'::jsonb,true)
          when 'open-hand-technique-push' then jsonb_set(m,'{range}','{"kind":"custom","label":"Цель попадания Шквала ударов"}'::jsonb,true)
          when 'open-hand-technique-topple' then jsonb_set(m,'{range}','{"kind":"custom","label":"Цель попадания Шквала ударов"}'::jsonb,true)
          when 'open-hand-quivering-mark' then jsonb_set(m,'{range}','{"kind":"custom","label":"Цель Безоружного удара"}'::jsonb,true)
          when 'open-hand-quivering-end' then jsonb_set(m,'{range}','{"kind":"custom","label":"Отмеченная цель на том же плане"}'::jsonb,true)
          else m
        end order by ord
      ) from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
    ),'[]'::jsonb)
    where l.template_id=v_template;
  end loop;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
    'action_range_metadata_audited',true,
    'rules_precision_source','Player''s Handbook 2024'
  ),updated_at=now()
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key in (
    'subclass:monk:mercy','subclass:monk:shadow','subclass:monk:elements','subclass:monk:open-hand'
  ) and is_builtin is true and is_active;
end;
$$;

revoke all on function private.audit_monk_subclasses_batch1_v1(uuid) from public,anon,authenticated;
grant execute on function private.audit_monk_subclasses_batch1_v1(uuid) to service_role;

create or replace function private.audit_monk_subclasses_batch1_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.audit_monk_subclasses_batch1_v1(new.id);
  return new;
end;
$$;

revoke all on function private.audit_monk_subclasses_batch1_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzzzzzz_campaigns_audit_monk_subclasses_batch1 on public.campaigns;
create trigger zzzzzzzzzzzz_campaigns_audit_monk_subclasses_batch1
after insert on public.campaigns
for each row execute function private.audit_monk_subclasses_batch1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.audit_monk_subclasses_batch1_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;