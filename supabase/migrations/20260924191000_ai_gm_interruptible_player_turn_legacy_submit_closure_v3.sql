-- Enforce the two-phase AI-player turn contract by closing legacy immediate-submit entrypoints.
revoke execute on function public.submit_player_turn_v1(uuid,integer,uuid)
  from public,anon,authenticated;
revoke execute on function public.submit_player_turn_stage12_v1(uuid,integer,uuid,uuid[])
  from public,anon,authenticated;

comment on function public.submit_player_turn_v1(uuid,integer,uuid) is
  'Legacy immediate-execution submit retained for migration history/internal compatibility; authenticated clients must use submit_player_turn_stage12_v2.';
comment on function public.submit_player_turn_stage12_v1(uuid,integer,uuid,uuid[]) is
  'Legacy Stage 12 immediate-execution submit. Authenticated execution revoked after interruptible player-turn hardening.';
