-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardRuntimeClosure.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: wizard:text=READY;mechanics=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Final forward-only Wizard closure. The subclass v3 installer intentionally
-- reuses the base text/mechanics installers; on existing campaigns that can
-- overwrite metadata written by the later base/rest closure migrations. This
-- migration reapplies the closure after subclass install and makes that order
-- explicit for new campaigns.

begin;

create or replace function private.apply_wizard_runtime_closure_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_wizard uuid;
begin
  -- Keep the existing base closure authoritative for its durable server/UI
  -- behavior, then stamp the final runtime metadata that must survive v3.
  perform private.apply_wizard_base_closure(p_campaign_id);

  select id into v_wizard
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:wizard'
    and is_builtin=true
    and is_active=true
  order by version desc,created_at desc
  limit 1;

  if v_wizard is null then return; end if;

  update public.rule_templates
  set rules_meta=(
        coalesce(rules_meta,'{}'::jsonb)
        || jsonb_build_object(
          'mechanics_status','READY',
          'subclasses_included',true,
          'subclass_supported_count',13,
          'subclass_mechanics_status','READY',
          'subclass_runtime_revision','wizard-subclasses-runtime@3',
          'runtime_closure_revision','wizard-runtime-closure@1',
          'gena_rest_window_policy','first_assigned_player_message_closes_all_post_rest_choices',
          'core_traits',coalesce(rules_meta->'core_traits','{}'::jsonb)
            || jsonb_build_object('starting_equipment','[]'::jsonb),
          'manual_resolution_policy',coalesce(rules_meta->'manual_resolution_policy','{}'::jsonb)
            || jsonb_build_object(
              'cantrip_progression','gm_sheet_edit',
              'cantrip_long_rest_replacement','gena_popup_rpc',
              'scholar','player_choice_then_gm_expertise_edit',
              'asi_epic_boon','generic_or_gm_sheet_edit'
            )
        )
      ),
      updated_at=now()
  where id=v_wizard;
end;
$function$;

revoke all on function private.apply_wizard_runtime_closure_v1(uuid) from public,anon,authenticated;
grant execute on function private.apply_wizard_runtime_closure_v1(uuid) to service_role;

-- The existing campaign trigger already points at this function. Replacing its
-- body preserves the trigger while making subclass-v3 -> final-closure ordering
-- explicit for every future campaign.
create or replace function private.install_wizard_subclass_runtime_for_new_campaign_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.install_wizard_subclass_runtime_v3(new.id);
  perform private.apply_wizard_runtime_closure_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.install_wizard_subclass_runtime_for_new_campaign_v3() from public,anon,authenticated;

-- Repair every existing campaign that was backfilled by subclass v3 after the
-- historical base/rest closure migrations.
do $block$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.apply_wizard_runtime_closure_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
