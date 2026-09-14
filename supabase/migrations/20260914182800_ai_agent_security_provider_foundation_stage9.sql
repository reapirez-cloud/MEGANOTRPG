create table if not exists private.system_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note text not null default '' check (length(note) <= 500)
);

revoke all on private.system_admin_users from public, anon, authenticated;

create or replace function private.is_system_admin(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from private.system_admin_users sau
      where sau.user_id = p_user_id
    );
$$;

revoke all on function private.is_system_admin(uuid) from public;
grant execute on function private.is_system_admin(uuid) to authenticated, service_role;

create or replace function public.is_system_admin_for_v1(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_system_admin(p_user_id);
$$;

revoke all on function public.is_system_admin_for_v1(uuid) from public, anon, authenticated;
grant execute on function public.is_system_admin_for_v1(uuid) to service_role;

create or replace function private.is_owner_only_creator(
  p_created_by uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_created_by is not null
    and p_created_by = p_user_id;
$$;

revoke all on function private.is_owner_only_creator(uuid, uuid) from public;
grant execute on function private.is_owner_only_creator(uuid, uuid) to authenticated, service_role;

alter table public.ai_models
  add column if not exists model_kind text not null default 'agent',
  add column if not exists access_scope text not null default 'campaign',
  add column if not exists supports_vision boolean not null default false;

alter table public.ai_models
  drop constraint if exists ai_models_model_kind_check,
  drop constraint if exists ai_models_access_scope_check,
  drop constraint if exists ai_models_role_consistency_check;

alter table public.ai_models
  add constraint ai_models_model_kind_check
    check (model_kind in ('agent','image','owner_override')),
  add constraint ai_models_access_scope_check
    check (access_scope in ('campaign','system_admin')),
  add constraint ai_models_role_consistency_check
    check (
      (is_base = false or model_kind = 'agent')
      and (gm_selectable = false or model_kind = 'agent')
      and (model_kind <> 'owner_override' or access_scope = 'system_admin')
    );

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
        and (m.is_base = true or m.gm_selectable = true)
    );
$$;

revoke all on function private.can_select_campaign_ai_model(uuid, uuid) from public;
grant execute on function private.can_select_campaign_ai_model(uuid, uuid) to authenticated, service_role;

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

drop policy if exists ai_agent_settings_insert on public.ai_agent_settings;
create policy ai_agent_settings_insert
on public.ai_agent_settings
for insert
to authenticated
with check (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
  and private.can_select_campaign_ai_model(selected_model_id, (select auth.uid()))
);

drop policy if exists ai_agent_settings_update on public.ai_agent_settings;
create policy ai_agent_settings_update
on public.ai_agent_settings
for update
to authenticated
using (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
)
with check (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
  and private.can_select_campaign_ai_model(selected_model_id, (select auth.uid()))
);

drop policy if exists ai_agent_model_routes_manager_insert on public.ai_agent_model_routes;
create policy ai_agent_model_routes_manager_insert
on public.ai_agent_model_routes
for insert
to authenticated
with check (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
  and private.can_select_campaign_ai_model(selected_model_id, (select auth.uid()))
);

drop policy if exists ai_agent_model_routes_manager_update on public.ai_agent_model_routes;
create policy ai_agent_model_routes_manager_update
on public.ai_agent_model_routes
for update
to authenticated
using (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
)
with check (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
  and private.can_select_campaign_ai_model(selected_model_id, (select auth.uid()))
);

update public.ai_models
set
  provider_key = 'deepseek',
  model_key = 'deepseek-v4-flash',
  display_name = 'DeepSeek V4 Flash',
  enabled = true,
  is_base = true,
  gm_selectable = true,
  supports_tools = true,
  supports_json = true,
  supports_streaming = true,
  supports_vision = false,
  context_window = 1048576,
  cost_tier = 1,
  reasoning_tier = 4,
  latency_tier = 1,
  model_kind = 'agent',
  access_scope = 'campaign',
  updated_at = now()
where is_base = true;

insert into public.ai_models (
  provider_key, model_key, display_name, enabled, is_base, gm_selectable,
  supports_tools, supports_json, supports_streaming, supports_vision,
  context_window, cost_tier, reasoning_tier, latency_tier, model_kind, access_scope
)
values
  (
    'deepseek', 'deepseek-v4-pro', 'DeepSeek V4 Pro', true, false, true,
    true, true, true, false,
    1048576, 3, 5, 3, 'agent', 'campaign'
  ),
  (
    'deepseek', 'deepseek-v4-flash-vision-exp', 'DeepSeek V4 Flash Vision', true, false, false,
    true, true, true, true,
    1048576, 1, 4, 2, 'agent', 'campaign'
  )
on conflict (model_key) do update set
  provider_key = excluded.provider_key,
  display_name = excluded.display_name,
  enabled = excluded.enabled,
  is_base = excluded.is_base,
  gm_selectable = excluded.gm_selectable,
  supports_tools = excluded.supports_tools,
  supports_json = excluded.supports_json,
  supports_streaming = excluded.supports_streaming,
  supports_vision = excluded.supports_vision,
  context_window = excluded.context_window,
  cost_tier = excluded.cost_tier,
  reasoning_tier = excluded.reasoning_tier,
  latency_tier = excluded.latency_tier,
  model_kind = excluded.model_kind,
  access_scope = excluded.access_scope,
  updated_at = now();

create or replace function private.can_manage_character(
  p_character_id uuid,
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
    from public.characters c
    where c.id = p_character_id
      and private.can_manage_campaign(c.campaign_id, p_user_id)
      and (
        (
          c.publication_state = 'draft'
          and private.is_owner_only_creator(c.created_by, p_user_id)
        )
        or (
          c.publication_state = 'campaign'
          and (
            (
              (c.visibility = 'private' or c.visibility_mode = 'private')
              and private.is_owner_only_creator(c.created_by, p_user_id)
            )
            or (
              c.visibility <> 'private'
              and c.visibility_mode <> 'private'
            )
          )
        )
      )
  );
$$;

create or replace function private.can_view_character(
  p_character_id uuid,
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
    from public.characters c
    where c.id = p_character_id
      and private.is_campaign_member(c.campaign_id, p_user_id)
      and (
        (
          c.publication_state = 'draft'
          and private.is_owner_only_creator(c.created_by, p_user_id)
        )
        or
        (
          c.publication_state = 'campaign'
          and (
            (
              (c.visibility = 'private' or c.visibility_mode = 'private')
              and private.is_owner_only_creator(c.created_by, p_user_id)
            )
            or (
              c.visibility <> 'private'
              and c.visibility_mode <> 'private'
              and (
                c.assigned_user_id = p_user_id
                or private.can_manage_campaign(c.campaign_id, p_user_id)
                or (
                  c.character_type = 'pc'
                  and exists(
                    select 1
                    from public.campaign_members owner_member
                    where owner_member.campaign_id = c.campaign_id
                      and owner_member.user_id = c.assigned_user_id
                      and owner_member.active_character_id = c.id
                  )
                )
                or (c.character_type = 'npc' and c.visibility_mode = 'always')
                or (
                  c.character_type = 'npc'
                  and c.visibility_mode = 'discover'
                  and exists(
                    select 1
                    from public.character_npc_discoveries d
                    where d.character_id = private.active_character_for_user(c.campaign_id, p_user_id)
                      and d.npc_character_id = c.id
                  )
                )
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

revoke all on function private.can_manage_location(uuid, uuid) from public;
grant execute on function private.can_manage_location(uuid, uuid) to authenticated, service_role;

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
                where d.character_id = private.active_character_for_user(l.campaign_id, p_user_id)
                  and d.location_id = l.id
              )
            )
          )
        )
      )
  );
$$;

create or replace function private.can_manage_location_link(
  p_link_id uuid,
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
    from public.location_links link
    join public.location_sections s on s.id = link.section_id
    join public.locations l on l.id = s.location_id
    where link.id = p_link_id
      and private.can_manage_location(l.id, p_user_id)
      and (
        link.visibility_mode <> 'private'
        or private.is_owner_only_creator(link.created_by, p_user_id)
      )
  );
$$;

revoke all on function private.can_manage_location_link(uuid, uuid) from public;
grant execute on function private.can_manage_location_link(uuid, uuid) to authenticated, service_role;

create or replace function private.can_view_location_link(
  p_link_id uuid,
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
    from public.location_links link
    join public.location_sections s on s.id = link.section_id
    join public.locations l on l.id = s.location_id
    where link.id = p_link_id
      and private.can_view_location(l.id, p_user_id)
      and private.can_view_location(link.target_location_id, p_user_id)
      and (
        (
          link.visibility_mode = 'private'
          and private.is_owner_only_creator(link.created_by, p_user_id)
        )
        or (
          link.visibility_mode <> 'private'
          and (
            private.can_manage_campaign(l.campaign_id, p_user_id)
            or link.visibility_mode = 'always'
            or (
              link.visibility_mode = 'discover'
              and exists(
                select 1
                from public.character_location_link_discoveries d
                where d.character_id = private.active_character_for_user(l.campaign_id, p_user_id)
                  and d.location_link_id = link.id
              )
            )
          )
        )
      )
  );
$$;

drop policy if exists characters_manager_insert on public.characters;
create policy characters_manager_insert
on public.characters
for insert
to authenticated
with check (
  private.can_manage_campaign(campaign_id)
  and (
    not (
      publication_state = 'draft'
      or visibility = 'private'
      or visibility_mode = 'private'
    )
    or private.is_owner_only_creator(created_by, (select auth.uid()))
  )
);

drop policy if exists characters_manager_update on public.characters;
create policy characters_manager_update
on public.characters
for update
to authenticated
using (private.can_manage_character(id))
with check (
  private.can_manage_campaign(campaign_id)
  and (
    not (
      publication_state = 'draft'
      or visibility = 'private'
      or visibility_mode = 'private'
    )
    or private.is_owner_only_creator(created_by, (select auth.uid()))
  )
);

drop policy if exists locations_manager_insert on public.locations;
create policy locations_manager_insert
on public.locations
for insert
to authenticated
with check (
  private.can_manage_campaign(campaign_id)
  and (
    visibility_mode <> 'private'
    or private.is_owner_only_creator(created_by, (select auth.uid()))
  )
);

drop policy if exists locations_manager_update on public.locations;
create policy locations_manager_update
on public.locations
for update
to authenticated
using (private.can_manage_location(id))
with check (
  private.can_manage_campaign(campaign_id)
  and (
    visibility_mode <> 'private'
    or private.is_owner_only_creator(created_by, (select auth.uid()))
  )
);

drop policy if exists locations_manager_delete on public.locations;
create policy locations_manager_delete
on public.locations
for delete
to authenticated
using (private.can_manage_location(id));

drop policy if exists location_links_manager_insert on public.location_links;
create policy location_links_manager_insert
on public.location_links
for insert
to authenticated
with check (
  exists (
    select 1
    from public.location_sections s
    join public.locations l on l.id = s.location_id
    where s.id = location_links.section_id
      and private.can_manage_location(l.id)
  )
  and (
    visibility_mode <> 'private'
    or private.is_owner_only_creator(created_by, (select auth.uid()))
  )
);

drop policy if exists location_links_manager_update on public.location_links;
create policy location_links_manager_update
on public.location_links
for update
to authenticated
using (private.can_manage_location_link(id))
with check (
  exists (
    select 1
    from public.location_sections s
    join public.locations l on l.id = s.location_id
    where s.id = location_links.section_id
      and private.can_manage_location(l.id)
  )
  and (
    visibility_mode <> 'private'
    or private.is_owner_only_creator(created_by, (select auth.uid()))
  )
);

drop policy if exists location_links_manager_delete on public.location_links;
create policy location_links_manager_delete
on public.location_links
for delete
to authenticated
using (private.can_manage_location_link(id));
