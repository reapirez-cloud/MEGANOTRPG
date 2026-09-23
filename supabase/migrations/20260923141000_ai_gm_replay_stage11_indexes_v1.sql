-- AI GM Stage 11 advisor cleanup: cover campaign foreign-key lookup path.

create index if not exists ai_gm_turn_revisions_campaign_idx
  on private.ai_gm_turn_revisions(campaign_id,created_at desc);
