-- Experimental AI world isolation.
-- AI GM exists only in campaigns materialized from ai_world_slots.
-- Shared D&D rules/catalogs stay reusable; campaign-scoped world state stays isolated.

alter table public.ai_world_slots
  add column if not exists campaign_id uuid
  references public.campaigns(id) on delete set null;

create unique index if not exists ai_world_slots_campaign_id_unique
  on public.ai_world_slots(campaign_id)
  where campaign_id is not null;

create or replace function private.is_ai_world_campaign_v1(
  p_campaign_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_campaign_id is not null
    and exists (
      select 1
      from public.ai_world_slots s
      where s.campaign_id = p_campaign_id
    );
$$;

revoke all on function private.is_ai_world_campaign_v1(uuid)
  from public, anon;
grant execute on function private.is_ai_world_campaign_v1(uuid)
  to authenticated, service_role;

create or replace function public.is_ai_world_campaign_v1(
  p_campaign_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or p_campaign_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = v_user_id
  ) then
    return false;
  end if;

  return private.is_ai_world_campaign_v1(p_campaign_id);
end;
$$;

revoke all on function public.is_ai_world_campaign_v1(uuid)
  from public, anon;
grant execute on function public.is_ai_world_campaign_v1(uuid)
  to authenticated;

create or replace function public.ensure_ai_world_slots_v2()
returns table(
  id uuid,
  owner_user_id uuid,
  slot_index smallint,
  name text,
  campaign_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_slot_index integer;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-world-slots:' || v_user_id::text, 0)
  );

  for v_slot_index in 1..5 loop
    insert into public.ai_world_slots(owner_user_id, slot_index, name)
    values(v_user_id, v_slot_index, '')
    on conflict(owner_user_id, slot_index) do nothing;
  end loop;

  return query
  select
    s.id,
    s.owner_user_id,
    s.slot_index,
    s.name,
    s.campaign_id,
    s.created_at,
    s.updated_at
  from public.ai_world_slots s
  where s.owner_user_id = v_user_id
  order by s.slot_index
  limit 5;
end;
$$;

revoke all on function public.ensure_ai_world_slots_v2()
  from public, anon;
grant execute on function public.ensure_ai_world_slots_v2()
  to authenticated;

create or replace function public.open_ai_world_slot_v2(
  p_slot_id uuid
)
returns table(
  campaign_id uuid,
  role text,
  is_owner boolean,
  active_character_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_slot public.ai_world_slots%rowtype;
  v_campaign_id uuid;
  v_title text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_slot_id is null then
    raise exception 'slot_required';
  end if;

  select *
    into v_slot
  from public.ai_world_slots s
  where s.id = p_slot_id
    and s.owner_user_id = v_user_id
  for update;

  if v_slot.id is null then
    raise exception 'ai_world_slot_not_found';
  end if;

  v_title := coalesce(
    nullif(btrim(v_slot.name), ''),
    'ИИ мир · Слот ' || lpad(v_slot.slot_index::text, 2, '0')
  );

  v_campaign_id := v_slot.campaign_id;

  if v_campaign_id is null then
    insert into public.campaigns(slug, title, summary, rules_summary)
    values(
      'ai-world-' || replace(v_slot.id::text, '-', ''),
      v_title,
      '',
      ''
    )
    returning id into v_campaign_id;

    update public.ai_world_slots
    set campaign_id = v_campaign_id,
        updated_at = now()
    where id = v_slot.id;
  else
    update public.campaigns
    set title = v_title
    where id = v_campaign_id;
  end if;

  insert into public.campaign_members(
    campaign_id,
    user_id,
    role,
    is_owner
  )
  values(v_campaign_id, v_user_id, 'gm', true)
  on conflict(campaign_id, user_id) do update set
    role = 'gm',
    is_owner = true;

  return query
  select
    cm.campaign_id,
    cm.role,
    cm.is_owner,
    cm.active_character_id
  from public.campaign_members cm
  where cm.campaign_id = v_campaign_id
    and cm.user_id = v_user_id;
end;
$$;

revoke all on function public.open_ai_world_slot_v2(uuid)
  from public, anon;
grant execute on function public.open_ai_world_slot_v2(uuid)
  to authenticated;

create or replace function private.sync_ai_world_slot_campaign_title_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.campaign_id is not null
     and new.name is distinct from old.name
  then
    update public.campaigns
    set title = coalesce(
      nullif(btrim(new.name), ''),
      'ИИ мир · Слот ' || lpad(new.slot_index::text, 2, '0')
    )
    where id = new.campaign_id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_ai_world_slot_campaign_title_v1()
  from public, anon, authenticated;

drop trigger if exists ai_world_slots_sync_campaign_title_v1
  on public.ai_world_slots;
create trigger ai_world_slots_sync_campaign_title_v1
after update of name
on public.ai_world_slots
for each row
execute function private.sync_ai_world_slot_campaign_title_v1();

-- Slot lifecycle is now server-owned. Clients may rename/read slots, but cannot
-- manufacture or delete canonical AI-world containers around the RPC boundary.
revoke insert, delete on table public.ai_world_slots
  from authenticated;

drop policy if exists ai_world_slots_owner_insert
  on public.ai_world_slots;
drop policy if exists ai_world_slots_owner_delete
  on public.ai_world_slots;

-- A GM model setting has meaning only in an experimental AI world.
drop policy if exists ai_agent_settings_ai_gm_scope_select
  on public.ai_agent_settings;
create policy ai_agent_settings_ai_gm_scope_select
on public.ai_agent_settings
as restrictive
for select
to authenticated
using (
  agent_key <> 'gm'
  or private.is_ai_world_campaign_v1(campaign_id)
);

drop policy if exists ai_agent_settings_ai_gm_scope_insert
  on public.ai_agent_settings;
create policy ai_agent_settings_ai_gm_scope_insert
on public.ai_agent_settings
as restrictive
for insert
to authenticated
with check (
  agent_key <> 'gm'
  or private.is_ai_world_campaign_v1(campaign_id)
);

drop policy if exists ai_agent_settings_ai_gm_scope_update
  on public.ai_agent_settings;
create policy ai_agent_settings_ai_gm_scope_update
on public.ai_agent_settings
as restrictive
for update
to authenticated
using (
  agent_key <> 'gm'
  or private.is_ai_world_campaign_v1(campaign_id)
)
with check (
  agent_key <> 'gm'
  or private.is_ai_world_campaign_v1(campaign_id)
);

drop policy if exists ai_agent_settings_ai_gm_scope_delete
  on public.ai_agent_settings;
create policy ai_agent_settings_ai_gm_scope_delete
on public.ai_agent_settings
as restrictive
for delete
to authenticated
using (
  agent_key <> 'gm'
  or private.is_ai_world_campaign_v1(campaign_id)
);

create or replace function public.list_campaign_gm_models_v1(
  p_campaign_id uuid
)
returns table(
  id uuid,
  model_key text,
  display_name text,
  supports_tools boolean,
  supports_json boolean,
  supports_vision boolean,
  context_window integer,
  cost_tier smallint,
  reasoning_tier smallint,
  latency_tier smallint,
  selected boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_selected_model_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'auth_required';
  end if;

  if not private.is_campaign_member(
    p_campaign_id,
    (select auth.uid())
  ) then
    raise exception 'campaign_membership_required';
  end if;

  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_gm_not_available';
  end if;

  select s.selected_model_id
    into v_selected_model_id
  from public.ai_agent_settings s
  join public.ai_models m on m.id = s.selected_model_id
  where s.campaign_id = p_campaign_id
    and s.agent_key = 'gm'
    and m.enabled = true
    and m.model_kind = 'agent'
    and m.access_scope = 'campaign'
    and m.gm_selectable = true
    and m.supports_json = true;

  if v_selected_model_id is null then
    select m.id
      into v_selected_model_id
    from public.ai_models m
    where m.enabled = true
      and m.model_kind = 'agent'
      and m.access_scope = 'campaign'
      and m.gm_selectable = true
      and m.supports_json = true
    order by
      m.is_base desc,
      m.reasoning_tier desc,
      m.cost_tier asc,
      m.display_name
    limit 1;
  end if;

  return query
  select
    m.id,
    m.model_key,
    m.display_name,
    m.supports_tools,
    m.supports_json,
    m.supports_vision,
    m.context_window,
    m.cost_tier,
    m.reasoning_tier,
    m.latency_tier,
    m.id = v_selected_model_id
  from public.ai_models m
  where m.enabled = true
    and m.model_kind = 'agent'
    and m.access_scope = 'campaign'
    and m.gm_selectable = true
    and m.supports_json = true
  order by
    (m.id = v_selected_model_id) desc,
    m.reasoning_tier desc,
    m.cost_tier asc,
    m.display_name asc;
end;
$$;

create or replace function public.set_campaign_gm_model_v1(
  p_campaign_id uuid,
  p_model_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if not private.is_campaign_manager(p_campaign_id, v_user_id) then
    raise exception 'campaign_manager_required';
  end if;

  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_gm_not_available';
  end if;

  if not exists(
    select 1
    from public.ai_models m
    where m.id = p_model_id
      and m.enabled = true
      and m.model_kind = 'agent'
      and m.access_scope = 'campaign'
      and m.gm_selectable = true
      and m.supports_json = true
  ) then
    raise exception 'gm_model_not_selectable';
  end if;

  insert into public.ai_agent_settings(
    campaign_id,
    agent_key,
    selected_model_id,
    updated_by,
    updated_at
  )
  values(p_campaign_id, 'gm', p_model_id, v_user_id, now())
  on conflict(campaign_id, agent_key) do update set
    selected_model_id = excluded.selected_model_id,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  return p_model_id;
end;
$$;

-- Defense in depth: even a service-role caller cannot create AI GM jobs in a
-- normal campaign by bypassing the browser.
create or replace function private.guard_ai_gm_agent_job_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_surface text := coalesce(new.input ->> 'surface', '');
begin
  if v_surface in ('game_chat_v1', 'world_maintenance_v1')
     and not private.is_ai_world_campaign_v1(new.campaign_id)
  then
    raise exception 'ai_gm_not_available';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_ai_gm_agent_job_scope_v1()
  from public, anon, authenticated;

drop trigger if exists agent_jobs_ai_gm_scope_guard_v1
  on public.agent_jobs;
create trigger agent_jobs_ai_gm_scope_guard_v1
before insert
on public.agent_jobs
for each row
execute function private.guard_ai_gm_agent_job_scope_v1();

create or replace function private.guard_ai_gm_campaign_row_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_ai_world_campaign_v1(new.campaign_id) then
    raise exception 'ai_gm_not_available';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_ai_gm_campaign_row_scope_v1()
  from public, anon, authenticated;

drop trigger if exists ai_gm_room_maintenance_scope_guard_v1
  on public.ai_gm_room_maintenance_state;
create trigger ai_gm_room_maintenance_scope_guard_v1
before insert
on public.ai_gm_room_maintenance_state
for each row
execute function private.guard_ai_gm_campaign_row_scope_v1();

drop trigger if exists player_turn_drafts_ai_gm_scope_guard_v1
  on public.player_turn_drafts;
create trigger player_turn_drafts_ai_gm_scope_guard_v1
before insert
on public.player_turn_drafts
for each row
execute function private.guard_ai_gm_campaign_row_scope_v1();

drop trigger if exists pending_player_roll_requests_ai_gm_scope_guard_v1
  on public.pending_player_roll_requests;
create trigger pending_player_roll_requests_ai_gm_scope_guard_v1
before insert
on public.pending_player_roll_requests
for each row
execute function private.guard_ai_gm_campaign_row_scope_v1();

-- The 45-message world-maintenance hook must be a no-op in human-run campaigns.
create or replace function private.reserve_ai_gm_room_maintenance_on_message_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_campaign_id uuid;
begin
  select r.campaign_id
    into v_campaign_id
  from public.chat_rooms r
  where r.id = new.room_id;

  if v_campaign_id is null
     or not private.is_ai_world_campaign_v1(v_campaign_id)
  then
    return new;
  end if;

  v_job_id := private.reserve_ai_gm_room_maintenance_v1(new.room_id);

  if v_job_id is not null then
    perform private.dispatch_ai_gm_maintenance_job_v1(v_job_id);
  end if;

  return new;
end;
$$;

comment on function public.open_ai_world_slot_v2(uuid) is
  'Materializes an owner-only experimental AI world slot as its own canonical campaign. Unique world state stays isolated by campaign_id while shared rules/catalogs remain reusable.';

comment on function public.is_ai_world_campaign_v1(uuid) is
  'Returns true only for a campaign member whose campaign is backed by an experimental AI world slot.';

comment on function private.guard_ai_gm_agent_job_scope_v1() is
  'Fail-closed boundary: AI GM game-chat and maintenance jobs can only be created inside ai_world_slots campaigns.';
