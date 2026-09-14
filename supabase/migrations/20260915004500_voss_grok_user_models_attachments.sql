-- Voss UX / model-selection update.
-- 1) DeepSeek + Grok are user-selectable campaign agents.
-- 2) Model choice is per-user, not a campaign-global preference.
-- 3) Short-lived user attachments live in a private storage bucket.

alter table public.ai_models
  add column if not exists user_selectable boolean not null default false;

alter table public.ai_models
  drop constraint if exists ai_models_user_selectable_consistency_check;

alter table public.ai_models
  add constraint ai_models_user_selectable_consistency_check
  check (
    user_selectable = false
    or (model_kind = 'agent' and access_scope = 'campaign')
  );

update public.ai_models
set
  user_selectable = true,
  gm_selectable = true,
  updated_at = now()
where enabled = true
  and model_kind = 'agent'
  and access_scope = 'campaign'
  and model_key = 'deepseek-v4.1-flash';

insert into public.ai_models (
  provider_key, model_key, display_name, enabled, is_base,
  gm_selectable, user_selectable,
  supports_tools, supports_json, supports_streaming, supports_vision,
  context_window, cost_tier, reasoning_tier, latency_tier,
  model_kind, access_scope
)
values (
  'openai-compatible',
  'grok-4.6',
  'Grok 4.6',
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  true,
  500000,
  2,
  5,
  2,
  'agent',
  'campaign'
)
on conflict (model_key) do update set
  provider_key = excluded.provider_key,
  display_name = excluded.display_name,
  enabled = true,
  is_base = false,
  gm_selectable = true,
  user_selectable = true,
  supports_tools = true,
  supports_json = true,
  supports_streaming = true,
  supports_vision = true,
  context_window = 500000,
  cost_tier = excluded.cost_tier,
  reasoning_tier = excluded.reasoning_tier,
  latency_tier = excluded.latency_tier,
  model_kind = 'agent',
  access_scope = 'campaign',
  updated_at = now();

create or replace function private.can_select_campaign_ai_model(
  p_model_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_model_id is null
    or exists (
      select 1
      from public.ai_models m
      where m.id = p_model_id
        and m.enabled = true
        and m.model_kind = 'agent'
        and m.access_scope = 'campaign'
        and (
          m.is_base = true
          or m.user_selectable = true
          or (
            m.gm_selectable = true
            and exists (
              select 1
              from public.campaign_members cm
              where cm.user_id = p_user_id
                and (cm.role = 'gm' or cm.is_owner = true)
            )
          )
        )
    );
$$;

revoke all on function private.can_select_campaign_ai_model(uuid, uuid) from public;
grant execute on function private.can_select_campaign_ai_model(uuid, uuid)
  to authenticated, service_role;

drop policy if exists ai_models_read on public.ai_models;
create policy ai_models_read
on public.ai_models
for select
to authenticated
using (
  enabled = true
  and model_kind = 'agent'
  and access_scope = 'campaign'
  and (
    is_base = true
    or user_selectable = true
    or (
      gm_selectable = true
      and exists (
        select 1
        from public.campaign_members cm
        where cm.user_id = (select auth.uid())
          and (cm.role = 'gm' or cm.is_owner = true)
      )
    )
  )
);

create table if not exists public.ai_user_agent_settings (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_key text not null default 'voss' check (agent_key = 'voss'),
  selected_model_id uuid not null references public.ai_models(id),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id, agent_key)
);

alter table public.ai_user_agent_settings enable row level security;

drop policy if exists ai_user_agent_settings_select on public.ai_user_agent_settings;
create policy ai_user_agent_settings_select
on public.ai_user_agent_settings
for select
to authenticated
using (
  user_id = (select auth.uid())
  and private.is_campaign_member(campaign_id, (select auth.uid()))
);

drop policy if exists ai_user_agent_settings_insert on public.ai_user_agent_settings;
create policy ai_user_agent_settings_insert
on public.ai_user_agent_settings
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and private.is_campaign_member(campaign_id, (select auth.uid()))
  and private.can_select_campaign_ai_model(selected_model_id, (select auth.uid()))
);

drop policy if exists ai_user_agent_settings_update on public.ai_user_agent_settings;
create policy ai_user_agent_settings_update
on public.ai_user_agent_settings
for update
to authenticated
using (
  user_id = (select auth.uid())
  and private.is_campaign_member(campaign_id, (select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  and private.is_campaign_member(campaign_id, (select auth.uid()))
  and private.can_select_campaign_ai_model(selected_model_id, (select auth.uid()))
);

drop policy if exists ai_user_agent_settings_delete on public.ai_user_agent_settings;
create policy ai_user_agent_settings_delete
on public.ai_user_agent_settings
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and private.is_campaign_member(campaign_id, (select auth.uid()))
);

grant select, insert, update, delete
on public.ai_user_agent_settings
to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('ai-attachments', 'ai-attachments', false, 12582912)
on conflict (id) do update set
  public = false,
  file_size_limit = 12582912;

create or replace function private.can_use_ai_attachment_path(
  p_name text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and split_part(p_name, '/', 2) = p_user_id::text
    and exists (
      select 1
      from public.campaign_members cm
      where cm.user_id = p_user_id
        and cm.campaign_id::text = split_part(p_name, '/', 1)
    );
$$;

revoke all on function private.can_use_ai_attachment_path(text, uuid) from public;
grant execute on function private.can_use_ai_attachment_path(text, uuid)
  to authenticated, service_role;

drop policy if exists ai_attachments_read_own on storage.objects;
create policy ai_attachments_read_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ai-attachments'
  and private.can_use_ai_attachment_path(name, (select auth.uid()))
);

drop policy if exists ai_attachments_insert_own on storage.objects;
create policy ai_attachments_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ai-attachments'
  and private.can_use_ai_attachment_path(name, (select auth.uid()))
);

drop policy if exists ai_attachments_update_own on storage.objects;
create policy ai_attachments_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'ai-attachments'
  and private.can_use_ai_attachment_path(name, (select auth.uid()))
)
with check (
  bucket_id = 'ai-attachments'
  and private.can_use_ai_attachment_path(name, (select auth.uid()))
);

drop policy if exists ai_attachments_delete_own on storage.objects;
create policy ai_attachments_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ai-attachments'
  and private.can_use_ai_attachment_path(name, (select auth.uid()))
);
