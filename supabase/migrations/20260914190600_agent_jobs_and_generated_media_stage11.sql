-- Stage 11: unified agent jobs + generated media foundation.

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid null references public.ai_threads(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  agent_key text not null default 'voss',
  job_type text not null,
  status text not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  requested_outputs smallint not null default 1,
  completed_outputs smallint not null default 0,
  cancel_requested boolean not null default false,
  error_code text null,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_jobs_job_type_check check (
    job_type in (
      'image_generate','image_review','image_attach',
      'draft_create','draft_revise','draft_apply',
      'mechanics_compile',
      'dev_patch','dev_test','dev_build','dev_preview','dev_deploy'
    )
  ),
  constraint agent_jobs_status_check check (
    status in ('queued','running','waiting_for_user','completed','failed','cancelled')
  ),
  constraint agent_jobs_output_count_check check (
    requested_outputs between 1 and 3
    and completed_outputs between 0 and requested_outputs
  )
);

create index if not exists agent_jobs_requester_created_idx
  on public.agent_jobs(requested_by, created_at desc);
create index if not exists agent_jobs_campaign_status_idx
  on public.agent_jobs(campaign_id, status, created_at desc);
create index if not exists agent_jobs_active_idx
  on public.agent_jobs(status, created_at)
  where status in ('queued','running','waiting_for_user');

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  source_job_id uuid null references public.agent_jobs(id) on delete set null,
  provider_key text not null,
  model_key text not null,
  purpose text not null,
  profile text not null,
  status text not null default 'generated',
  storage_bucket text not null default 'campaign-media',
  storage_path text not null unique,
  mime_type text not null default 'image/webp',
  width integer not null,
  height integer not null,
  variant_index smallint not null default 1,
  prompt text not null default '',
  review jsonb not null default '{}'::jsonb,
  attached_at timestamptz null,
  garbage_marked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_status_check check (
    status in ('generated','reviewed','attached','rejected','garbage')
  ),
  constraint media_assets_purpose_check check (
    purpose in ('icon','ui_preview','portrait','panel','hero_art','master_art')
  ),
  constraint media_assets_profile_check check (
    profile in ('tiny_icon','ui_preview','portrait','panel','hero_art','master_art')
  ),
  constraint media_assets_dimensions_check check (
    width > 0 and height > 0 and variant_index between 1 and 3
  )
);

create index if not exists media_assets_job_variant_idx
  on public.media_assets(source_job_id, variant_index);
create index if not exists media_assets_creator_status_idx
  on public.media_assets(created_by, status, created_at desc);
create index if not exists media_assets_garbage_idx
  on public.media_assets(garbage_marked_at)
  where status = 'garbage';

create table if not exists public.media_bindings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  target_field text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint media_bindings_target_type_check check (
    target_type in ('character','location','reference_definition','campaign_art')
  ),
  constraint media_bindings_target_field_check check (
    length(target_field) between 1 and 80
  )
);

create unique index if not exists media_bindings_active_target_idx
  on public.media_bindings(campaign_id, target_type, target_id, target_field)
  where is_active = true;
create index if not exists media_bindings_asset_idx
  on public.media_bindings(asset_id, is_active);

alter table public.agent_jobs enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_bindings enable row level security;

revoke insert, update, delete on public.agent_jobs from anon, authenticated;
revoke insert, update, delete on public.media_assets from anon, authenticated;
revoke insert, update, delete on public.media_bindings from anon, authenticated;
grant select on public.agent_jobs to authenticated;
grant select on public.media_assets to authenticated;
grant select on public.media_bindings to authenticated;

drop policy if exists agent_jobs_owner_read on public.agent_jobs;
create policy agent_jobs_owner_read
on public.agent_jobs
for select
to authenticated
using (requested_by = (select auth.uid()));

create or replace function private.can_read_media_asset(
  p_asset_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
begin
  if p_user_id is null then return false; end if;

  select * into v_asset
  from public.media_assets
  where id = p_asset_id;

  if not found then return false; end if;
  if v_asset.created_by = p_user_id then return true; end if;

  return exists (
    select 1
    from public.media_bindings b
    where b.asset_id = p_asset_id
      and b.is_active = true
      and (
        (
          b.target_type = 'character'
          and private.can_view_character(b.target_id, p_user_id)
        )
        or (
          b.target_type = 'location'
          and private.can_view_location(b.target_id, p_user_id)
        )
        or (
          b.target_type = 'reference_definition'
          and exists (
            select 1
            from public.reference_definitions d
            where d.id = b.target_id
              and (
                d.scope = 'system'
                or (
                  d.campaign_id = v_asset.campaign_id
                  and private.is_campaign_member(v_asset.campaign_id, p_user_id)
                  and (
                    d.visibility = 'campaign'
                    or private.can_manage_campaign(v_asset.campaign_id, p_user_id)
                  )
                )
              )
          )
        )
        or (
          b.target_type = 'campaign_art'
          and exists (
            select 1
            from public.campaign_art_items a
            where a.id = b.target_id
              and a.campaign_id = v_asset.campaign_id
              and private.is_campaign_member(v_asset.campaign_id, p_user_id)
              and (
                a.character_id is null
                or private.can_view_character(a.character_id, p_user_id)
              )
          )
        )
      )
  );
end;
$$;

revoke all on function private.can_read_media_asset(uuid, uuid) from public;
grant execute on function private.can_read_media_asset(uuid, uuid) to authenticated, service_role;

drop policy if exists media_assets_visible_read on public.media_assets;
create policy media_assets_visible_read
on public.media_assets
for select
to authenticated
using ((select private.can_read_media_asset(id)));

drop policy if exists media_bindings_visible_read on public.media_bindings;
create policy media_bindings_visible_read
on public.media_bindings
for select
to authenticated
using ((select private.can_read_media_asset(asset_id)));

create or replace function private.can_attach_media_target(
  p_campaign_id uuid,
  p_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_target_field text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_target_id is null then return false; end if;
  if not private.is_campaign_member(p_campaign_id, p_user_id) then return false; end if;

  if p_target_type = 'character' then
    if p_target_field not in ('avatar','avatar_url','panel_avatar','portrait','art') then
      return false;
    end if;

    return exists (
      select 1
      from public.characters c
      where c.id = p_target_id
        and c.campaign_id = p_campaign_id
        and private.can_view_character(c.id, p_user_id)
        and (
          private.can_manage_character(c.id, p_user_id)
          or c.assigned_user_id = p_user_id
        )
    );
  end if;

  if p_target_type = 'location' then
    if p_target_field not in ('image','image_url','hero','cover','panel') then
      return false;
    end if;
    return exists (
      select 1
      from public.locations l
      where l.id = p_target_id
        and l.campaign_id = p_campaign_id
        and private.can_manage_location(l.id, p_user_id)
    );
  end if;

  if p_target_type = 'reference_definition' then
    if p_target_field not in ('icon','preview','image','hero','art') then
      return false;
    end if;
    return private.can_manage_campaign(p_campaign_id, p_user_id)
      and exists (
        select 1
        from public.reference_definitions d
        where d.id = p_target_id
          and d.scope = 'campaign'
          and d.campaign_id = p_campaign_id
      );
  end if;

  if p_target_type = 'campaign_gallery' then
    return (
      private.can_manage_campaign(p_campaign_id, p_user_id)
      or exists (
        select 1
        from public.characters c
        where c.id = p_target_id
          and c.campaign_id = p_campaign_id
          and private.can_view_character(c.id, p_user_id)
          and c.assigned_user_id = p_user_id
      )
    );
  end if;

  return false;
end;
$$;

revoke all on function private.can_attach_media_target(uuid, uuid, text, uuid, text) from public;
grant execute on function private.can_attach_media_target(uuid, uuid, text, uuid, text) to service_role;

create or replace function public.reserve_agent_image_job_v1(
  p_campaign_id uuid,
  p_user_id uuid,
  p_thread_id uuid,
  p_input jsonb,
  p_requested_outputs smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_role text;
  v_is_owner boolean;
  v_used integer;
begin
  if p_requested_outputs not between 1 and 3 then
    raise exception 'image_variants_must_be_1_to_3';
  end if;

  select cm.role, cm.is_owner
    into v_role, v_is_owner
  from public.campaign_members cm
  where cm.campaign_id = p_campaign_id
    and cm.user_id = p_user_id;

  if not found then
    raise exception 'campaign_access_denied';
  end if;

  if v_role <> 'gm' and coalesce(v_is_owner, false) = false then
    perform pg_advisory_xact_lock(
      hashtextextended(p_user_id::text || ':' || current_date::text, 0)
    );

    select coalesce(sum(j.requested_outputs), 0)::integer
      into v_used
    from public.agent_jobs j
    where j.requested_by = p_user_id
      and j.job_type = 'image_generate'
      and j.created_at >= date_trunc('day', now())
      and j.status in ('queued','running','waiting_for_user','completed');

    if v_used + p_requested_outputs > 10 then
      raise exception 'player_image_quota_exceeded';
    end if;
  end if;

  insert into public.agent_jobs (
    campaign_id,
    thread_id,
    requested_by,
    agent_key,
    job_type,
    status,
    input,
    requested_outputs
  ) values (
    p_campaign_id,
    p_thread_id,
    p_user_id,
    'voss',
    'image_generate',
    'queued',
    coalesce(p_input, '{}'::jsonb),
    p_requested_outputs
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.reserve_agent_image_job_v1(uuid, uuid, uuid, jsonb, smallint) from public, anon, authenticated;
grant execute on function public.reserve_agent_image_job_v1(uuid, uuid, uuid, jsonb, smallint) to service_role;

create or replace function public.attach_generated_media_v1(
  p_asset_id uuid,
  p_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_target_field text,
  p_title text default '',
  p_caption text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets%rowtype;
  v_binding_id uuid;
  v_canonical_target_id uuid := p_target_id;
begin
  select * into v_asset
  from public.media_assets
  where id = p_asset_id;

  if not found then
    raise exception 'media_asset_not_found';
  end if;

  if v_asset.created_by <> p_user_id then
    raise exception 'media_asset_owner_required';
  end if;

  if v_asset.status in ('garbage','rejected') then
    raise exception 'media_asset_not_attachable';
  end if;

  if p_target_type = 'campaign_gallery' then
    if not private.can_attach_media_target(
      v_asset.campaign_id,
      p_user_id,
      'campaign_gallery',
      p_target_id,
      'image'
    ) then
      raise exception 'media_attach_denied';
    end if;

    insert into public.campaign_art_items (
      campaign_id,
      uploaded_by,
      title,
      image_url,
      character_id,
      caption,
      kind
    ) values (
      v_asset.campaign_id,
      p_user_id,
      left(coalesce(p_title, ''), 160),
      v_asset.storage_path,
      p_target_id,
      left(coalesce(p_caption, ''), 1000),
      'art'
    )
    returning id into v_canonical_target_id;

    p_target_type := 'campaign_art';
    p_target_field := 'image';
  elsif not private.can_attach_media_target(
    v_asset.campaign_id,
    p_user_id,
    p_target_type,
    p_target_id,
    p_target_field
  ) then
    raise exception 'media_attach_denied';
  end if;

  update public.media_bindings
  set is_active = false
  where campaign_id = v_asset.campaign_id
    and target_type = p_target_type
    and target_id = v_canonical_target_id
    and target_field = p_target_field
    and is_active = true;

  insert into public.media_bindings (
    campaign_id,
    asset_id,
    target_type,
    target_id,
    target_field,
    created_by
  ) values (
    v_asset.campaign_id,
    v_asset.id,
    p_target_type,
    v_canonical_target_id,
    p_target_field,
    p_user_id
  )
  returning id into v_binding_id;

  if p_target_type = 'character' and p_target_field in ('avatar','avatar_url') then
    update public.characters
    set avatar_url = v_asset.storage_path,
        updated_at = now()
    where id = v_canonical_target_id;
  elsif p_target_type = 'location' and p_target_field in ('image','image_url','hero','cover','panel') then
    update public.locations
    set image_url = v_asset.storage_path,
        updated_at = now()
    where id = v_canonical_target_id;
  end if;

  update public.media_assets
  set status = 'attached',
      attached_at = coalesce(attached_at, now()),
      garbage_marked_at = null,
      updated_at = now()
  where id = v_asset.id;

  return jsonb_build_object(
    'binding_id', v_binding_id,
    'asset_id', v_asset.id,
    'target_type', p_target_type,
    'target_id', v_canonical_target_id,
    'target_field', p_target_field,
    'storage_path', v_asset.storage_path
  );
end;
$$;

revoke all on function public.attach_generated_media_v1(uuid, uuid, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.attach_generated_media_v1(uuid, uuid, text, uuid, text, text, text) to service_role;

create or replace function public.mark_generated_media_garbage_v1(
  p_asset_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.media_bindings b
    where b.asset_id = p_asset_id and b.is_active = true
  ) then
    raise exception 'attached_media_cannot_be_garbage';
  end if;

  update public.media_assets
  set status = 'garbage',
      garbage_marked_at = now(),
      updated_at = now()
  where id = p_asset_id
    and created_by = p_user_id
    and status in ('generated','reviewed','rejected');

  return found;
end;
$$;

revoke all on function public.mark_generated_media_garbage_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_generated_media_garbage_v1(uuid, uuid) to service_role;

create or replace function public.cancel_agent_job_v1(
  p_job_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.agent_jobs
  where id = p_job_id
    and requested_by = p_user_id
  for update;

  if not found then
    raise exception 'agent_job_not_found';
  end if;

  if v_status = 'queued' then
    update public.agent_jobs
    set status = 'cancelled',
        cancel_requested = true,
        completed_at = now(),
        updated_at = now()
    where id = p_job_id;
    return 'cancelled';
  end if;

  if v_status = 'running' then
    update public.agent_jobs
    set cancel_requested = true,
        updated_at = now()
    where id = p_job_id;
    return 'cancel_requested';
  end if;

  return v_status;
end;
$$;

revoke all on function public.cancel_agent_job_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_agent_job_v1(uuid, uuid) to service_role;

-- Generated files are creator-only until a binding makes the target visible.
create or replace function private.can_read_campaign_media(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_campaign_id uuid;
  v_owner_id uuid;
  v_asset_id uuid;
begin
  if auth.uid() is null or v_parts is null then
    return false;
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 4
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and v_parts[3] = 'ai-assets'
     and v_parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_asset_id := v_parts[4]::uuid;
    return private.can_read_media_asset(v_asset_id, auth.uid());
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 3
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_campaign_id := v_parts[1]::uuid;
    v_owner_id := case
      when v_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then v_parts[2]::uuid
      else null
    end;

    if v_parts[3] = 'gm-private' then
      return v_owner_id = auth.uid()
        and private.can_manage_campaign(v_campaign_id, auth.uid());
    end if;

    return private.is_campaign_member(v_campaign_id, auth.uid());
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 2
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_parts[1]::uuid;
    return v_owner_id = auth.uid()
      or private.shares_campaign(v_owner_id, auth.uid());
  end if;

  return false;
end;
$$;

-- Image models are server-visible only. They never appear in the normal GM model selector.
insert into public.ai_models (
  provider_key, model_key, display_name, enabled, is_base, gm_selectable,
  supports_tools, supports_json, supports_streaming, supports_vision,
  context_window, cost_tier, reasoning_tier, latency_tier, model_kind, access_scope
)
values
  (
    'openai-image', 'gpt-image-2.5-flare', 'GPT Image 2.5 Flare',
    true, false, false,
    false, false, false, true,
    null, 2, 3, 1, 'image', 'campaign'
  ),
  (
    'openai-image', 'gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst',
    true, false, false,
    false, false, false, true,
    null, 4, 5, 4, 'image', 'campaign'
  )
on conflict (model_key) do update set
  provider_key = excluded.provider_key,
  display_name = excluded.display_name,
  enabled = excluded.enabled,
  is_base = false,
  gm_selectable = false,
  supports_tools = false,
  supports_json = false,
  supports_streaming = false,
  supports_vision = true,
  context_window = null,
  cost_tier = excluded.cost_tier,
  reasoning_tier = excluded.reasoning_tier,
  latency_tier = excluded.latency_tier,
  model_kind = 'image',
  access_scope = 'campaign',
  updated_at = now();
