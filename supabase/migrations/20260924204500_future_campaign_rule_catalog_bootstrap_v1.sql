-- Repair the new-campaign builtin rule bootstrap after legacy helper renames.
--
-- install_builtin_rule_catalog still referenced three helpers that no longer
-- exist. Fresh campaigns therefore failed during AFTER INSERT bootstrap before
-- an AI-world slot could materialize.
--
-- Replace them with current equivalents:
--   install_builtin_druid_class -> install_builtin_druid_base_v2
--   apply_subclass_action_explanations -> apply_subclass_action_explanation_quality
--   apply_narrator_immersion_guard -> normalize + assert narrator copy

create or replace function private.install_builtin_rule_catalog(
  p_campaign_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.install_builtin_druid_base_v2(p_campaign_id);
  perform private.install_official_class_catalog(p_campaign_id);
  perform private.install_official_subclass_catalog(p_campaign_id);
  perform private.apply_subclass_reference_quality(p_campaign_id);
  perform private.apply_subclass_action_explanation_quality(p_campaign_id);
  perform private.normalize_builtin_narrator_copy(p_campaign_id);
  perform private.assert_builtin_narrator_immersion(p_campaign_id);
  perform private.apply_cleric_precision_pack(p_campaign_id);
  perform private.finalize_builtin_cleric_runtime_v2(p_campaign_id);
  perform private.finalize_builtin_cleric_runtime_v3(p_campaign_id);
end;
$function$;

revoke all on function private.install_builtin_rule_catalog(uuid)
  from public,anon,authenticated;
grant execute on function private.install_builtin_rule_catalog(uuid)
  to service_role;
