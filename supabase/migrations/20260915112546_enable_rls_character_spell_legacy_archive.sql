-- Lock the legacy spell archive behind RLS without exposing it to client roles.
-- The table is retained for service-side recovery/audit only; application reads use
-- the canonical character spell tables instead.

alter table public.character_spell_legacy_archive
  enable row level security;

revoke all privileges on table public.character_spell_legacy_archive
  from anon, authenticated;

comment on table public.character_spell_legacy_archive is
  'Legacy character spell archive. Client roles intentionally have no direct access; retained for service-side recovery/audit only.';
