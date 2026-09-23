-- AI GM Stage 4 advisor cleanup.

create index if not exists player_turn_drafts_campaign_idx
  on public.player_turn_drafts (campaign_id);

create index if not exists player_turn_drafts_character_idx
  on public.player_turn_drafts (character_id);

drop policy if exists player_turn_drafts_read_own
  on public.player_turn_drafts;

create policy player_turn_drafts_read_own
on public.player_turn_drafts
for select
to authenticated
using (
  user_id = (select auth.uid())
  and coalesce(
    (((select auth.jwt())) ->> 'is_anonymous')::boolean,
    false
  ) = false
);
