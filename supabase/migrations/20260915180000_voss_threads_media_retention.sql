-- Voss multi-thread conversations + generated media retention.

alter table public.ai_threads
  drop constraint if exists ai_threads_campaign_id_user_id_agent_key_key;

create index if not exists ai_threads_user_agent_updated_idx
  on public.ai_threads (campaign_id, user_id, agent_key, updated_at desc);

grant insert, delete on table public.ai_threads to authenticated;

drop policy if exists ai_threads_insert_own on public.ai_threads;
create policy ai_threads_insert_own
on public.ai_threads
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and private.is_campaign_member(campaign_id, (select auth.uid()))
);

drop policy if exists ai_threads_delete_own on public.ai_threads;
create policy ai_threads_delete_own
on public.ai_threads
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and private.is_campaign_member(campaign_id, (select auth.uid()))
);

alter table public.media_assets
  add column if not exists expires_at timestamptz null,
  add column if not exists saved_at timestamptz null;

alter table public.media_assets
  alter column expires_at set default (now() + interval '3 days');

update public.media_assets
set saved_at = coalesce(saved_at, attached_at, updated_at),
    expires_at = null
where status = 'attached';

update public.media_assets
set expires_at = coalesce(expires_at, created_at + interval '3 days')
where status in ('generated','reviewed','rejected')
  and saved_at is null
  and attached_at is null;

create index if not exists media_assets_expiry_idx
  on public.media_assets (expires_at)
  where expires_at is not null;

create or replace function private.normalize_generated_media_retention_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'attached' or new.saved_at is not null then
    new.expires_at := null;
    if new.status = 'attached' then
      new.saved_at := coalesce(new.saved_at, new.attached_at, now());
    end if;
  elsif tg_op = 'INSERT' and new.expires_at is null then
    new.expires_at := now() + interval '3 days';
  end if;
  return new;
end;
$$;

drop trigger if exists media_assets_retention_v1 on public.media_assets;
create trigger media_assets_retention_v1
before insert or update of status, attached_at, saved_at, expires_at
on public.media_assets
for each row
execute function private.normalize_generated_media_retention_v1();

create or replace function public.save_my_generated_media_v1(p_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset public.media_assets%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select * into v_asset
  from public.media_assets
  where id = p_asset_id
    and created_by = v_user_id
  for update;

  if not found then
    raise exception 'media_asset_not_found';
  end if;

  if v_asset.status = 'garbage'
     and v_asset.garbage_marked_at is not null
     and v_asset.garbage_marked_at <= now() - interval '3 days' then
    raise exception 'media_asset_expired';
  end if;

  update public.media_assets
  set status = case
        when status = 'garbage' and review ->> 'status' = 'completed' then 'reviewed'
        when status = 'garbage' then 'generated'
        else status
      end,
      saved_at = coalesce(saved_at, now()),
      expires_at = null,
      garbage_marked_at = null,
      updated_at = now()
  where id = p_asset_id
  returning * into v_asset;

  return jsonb_build_object(
    'asset_id', v_asset.id,
    'saved', true,
    'saved_at', v_asset.saved_at,
    'expires_at', v_asset.expires_at,
    'status', v_asset.status
  );
end;
$$;

revoke all on function public.save_my_generated_media_v1(uuid) from public, anon;
grant execute on function public.save_my_generated_media_v1(uuid) to authenticated;

comment on column public.media_assets.expires_at is
  'Unsaved generated media becomes purge-eligible at this time. Saving or attaching clears it.';
comment on column public.media_assets.saved_at is
  'Set when the user explicitly keeps generated media or when it is attached to canonical content.';
