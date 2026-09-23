-- AI GM Stage 10: allow authenticated RLS policies to evaluate GM-model eligibility.

grant execute on function private.can_select_campaign_gm_model_v1(uuid)
  to authenticated;
