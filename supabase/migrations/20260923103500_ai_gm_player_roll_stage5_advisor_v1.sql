-- AI GM Stage 5 advisor hardening.
-- The durable request table contains hidden DC. Clients have no table grants;
-- this explicit deny policy documents that boundary for RLS/advisor tooling.

drop policy if exists pending_player_roll_requests_no_direct_reads
  on public.pending_player_roll_requests;

create policy pending_player_roll_requests_no_direct_reads
on public.pending_player_roll_requests
for select
to authenticated
using (false);

comment on policy pending_player_roll_requests_no_direct_reads
on public.pending_player_roll_requests is
  'Stage 5 privacy boundary: hidden DC never has a direct authenticated table projection; use safe chat event payload + resolve RPC only.';
