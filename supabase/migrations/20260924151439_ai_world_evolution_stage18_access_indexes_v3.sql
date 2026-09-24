create index if not exists ai_gm_post_turn_commits_campaign_fk_idx
  on public.ai_gm_post_turn_commits(campaign_id);
create index if not exists ai_gm_post_turn_commits_manager_user_fk_idx
  on public.ai_gm_post_turn_commits(manager_user_id);
create index if not exists ai_gm_post_turn_commits_source_character_fk_idx
  on public.ai_gm_post_turn_commits(source_character_id);
create index if not exists ai_gm_post_turn_commits_source_message_fk_idx
  on public.ai_gm_post_turn_commits(source_message_id);

drop policy if exists ai_gm_post_turn_commits_no_direct_reads
  on public.ai_gm_post_turn_commits;
create policy ai_gm_post_turn_commits_no_direct_reads
  on public.ai_gm_post_turn_commits
  for select to authenticated
  using (false);

drop policy if exists ai_gm_post_turn_intents_no_direct_reads
  on public.ai_gm_post_turn_intent_receipts;
create policy ai_gm_post_turn_intents_no_direct_reads
  on public.ai_gm_post_turn_intent_receipts
  for select to authenticated
  using (false);
