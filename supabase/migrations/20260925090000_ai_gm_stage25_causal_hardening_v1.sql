-- Stage 25: repair the authenticated AI-GM control-panel permission chain.
-- This helper is read-only SECURITY DEFINER over the public AI model catalog.
-- The original selector migration intended authenticated callers to execute it;
-- reassert the grant so public SECURITY INVOKER wrappers and RLS checks cannot
-- collapse the entire control panel with permission denied.

revoke all on function private.can_select_campaign_junior_model_v1(uuid)
  from public, anon;
grant execute on function private.can_select_campaign_junior_model_v1(uuid)
  to authenticated, service_role;


-- Behavior-profile listing is part of the same public SECURITY INVOKER
-- control-panel read chain. Keep it unavailable to anon/PUBLIC while allowing
-- signed-in campaign members to traverse the read-only helper.
revoke all on function private.ai_gm_behavior_profile_json_v1(text)
  from public, anon;
grant execute on function private.ai_gm_behavior_profile_json_v1(text)
  to authenticated;
