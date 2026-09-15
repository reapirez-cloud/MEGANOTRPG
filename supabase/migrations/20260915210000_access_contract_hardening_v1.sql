-- Central access-control invariants for MEGANOT RPG.
-- This migration intentionally does not rewrite the client-facing RPC surface:
-- authenticated SECURITY DEFINER RPCs are reviewed APIs and keep their explicit grants.

-- 1) New functions in public must opt into API exposure explicitly.
-- Existing RPC grants are unchanged.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Anonymous callers are never allowed to invoke public RPCs in this app.
revoke execute on all functions in schema public from public, anon;

-- 2) Identity and membership records are not client-mutable.
-- Reads remain RLS-scoped for authenticated users.
revoke insert, update, delete, truncate, references, trigger
  on table public.campaign_members
  from public, anon, authenticated;
grant select on table public.campaign_members to authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.campaign_invites
  from public, anon, authenticated;
grant select on table public.campaign_invites to authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.telegram_identities
  from public, anon, authenticated;
grant select on table public.telegram_identities to authenticated;

-- 3) Internal command/session/archive tables stay server-only even if a later
-- policy is accidentally added.
revoke all on table public.ai_dev_sessions
  from public, anon, authenticated;
revoke all on table public.character_spell_legacy_archive
  from public, anon, authenticated;
revoke all on table public.engine_command_receipts
  from public, anon, authenticated;

-- 4) "Только я" means creator-only for private locations. Managers retain full
-- authority over non-private campaign locations, but private rows do not leak
-- across GM/owner accounts.
create or replace function private.can_view_location(
  p_location_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.locations l
    where l.id = p_location_id
      and private.is_campaign_member(l.campaign_id, p_user_id)
      and (
        (
          l.visibility_mode = 'private'
          and private.is_owner_only_creator(l.created_by, p_user_id)
        )
        or (
          l.visibility_mode <> 'private'
          and (
            private.can_manage_campaign(l.campaign_id, p_user_id)
            or l.visibility_mode = 'always'
            or (
              l.visibility_mode = 'discover'
              and exists(
                select 1
                from public.character_location_discoveries d
                where d.character_id = private.active_character_for_user(
                  l.campaign_id,
                  p_user_id
                )
                  and d.location_id = l.id
              )
            )
          )
        )
      )
  );
$$;

create or replace function private.can_manage_location(
  p_location_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and private.can_manage_campaign(l.campaign_id, p_user_id)
      and (
        l.visibility_mode <> 'private'
        or private.is_owner_only_creator(l.created_by, p_user_id)
      )
  );
$$;

revoke all on function private.can_view_location(uuid, uuid)
  from public, anon;
grant execute on function private.can_view_location(uuid, uuid)
  to authenticated, service_role;

revoke all on function private.can_manage_location(uuid, uuid)
  from public, anon;
grant execute on function private.can_manage_location(uuid, uuid)
  to authenticated, service_role;

-- 5) Fail the migration if a core invariant is already broken.
do $access_contract$
declare
  v_missing_rls text;
  v_anon_tables text;
  v_anon_definers text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ')
  into v_missing_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;

  if v_missing_rls is not null then
    raise exception 'Public tables without RLS: %', v_missing_rls;
  end if;

  select string_agg(c.relname, ', ')
  into v_anon_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and (
      has_table_privilege('anon', c.oid, 'SELECT')
      or has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE')
      or has_table_privilege('anon', c.oid, 'DELETE')
    );

  if v_anon_tables is not null then
    raise exception 'Anonymous table privileges detected: %', v_anon_tables;
  end if;

  select string_agg(
    format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)),
    ', '
  )
  into v_anon_definers
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_anon_definers is not null then
    raise exception 'Anonymous SECURITY DEFINER RPCs detected: %', v_anon_definers;
  end if;

  if has_table_privilege('authenticated', 'public.campaign_members', 'INSERT')
     or has_table_privilege('authenticated', 'public.campaign_members', 'UPDATE')
     or has_table_privilege('authenticated', 'public.campaign_members', 'DELETE')
  then
    raise exception 'campaign_members must not be directly mutable by authenticated';
  end if;

  if has_table_privilege('authenticated', 'public.telegram_identities', 'INSERT')
     or has_table_privilege('authenticated', 'public.telegram_identities', 'UPDATE')
     or has_table_privilege('authenticated', 'public.telegram_identities', 'DELETE')
  then
    raise exception 'telegram_identities must not be directly mutable by authenticated';
  end if;
end;
$access_contract$;
