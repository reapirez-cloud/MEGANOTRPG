alter table public.characters
  add column if not exists publication_state text;

update public.characters
set publication_state = 'campaign'
where publication_state is null;

alter table public.characters
  alter column publication_state set default 'campaign',
  alter column publication_state set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'characters_publication_state_check'
      and conrelid = 'public.characters'::regclass
  ) then
    alter table public.characters
      add constraint characters_publication_state_check
      check (publication_state in ('draft','campaign'));
  end if;
end $$;

create index if not exists characters_campaign_publication_idx
  on public.characters (campaign_id, publication_state, character_type, life_state);

create or replace function private.can_manage_character(
  p_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.characters c
    where c.id = p_character_id
      and private.can_manage_campaign(c.campaign_id, p_user_id)
      and (
        c.publication_state = 'draft'
        or c.visibility <> 'private'
        or c.created_by = p_user_id
      )
  );
$function$;

create or replace function private.can_view_character(
  p_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.characters c
    where c.id = p_character_id
      and private.is_campaign_member(c.campaign_id, p_user_id)
      and (
        (
          c.publication_state = 'draft'
          and private.can_manage_campaign(c.campaign_id, p_user_id)
        )
        or
        (
          c.publication_state = 'campaign'
          and (
            c.assigned_user_id = p_user_id
            or (c.visibility_mode = 'private' and c.created_by = p_user_id)
            or (c.visibility_mode <> 'private' and private.can_manage_campaign(c.campaign_id, p_user_id))
            or (
              c.character_type = 'pc'
              and c.visibility_mode <> 'private'
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
  );
$function$;

create or replace function public.create_campaign_character_v2(
  p_campaign_id uuid,
  p_name text,
  p_character_class text default 'Персонаж',
  p_level integer default 1,
  p_bio text default '',
  p_avatar_url text default null,
  p_assigned_user_id uuid default null,
  p_character_type text default 'pc',
  p_publication_state text default 'campaign',
  p_visibility_mode text default 'always'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_assigned_user_id uuid;
  v_character_type text := lower(trim(coalesce(p_character_type, 'pc')));
  v_publication_state text := lower(trim(coalesce(p_publication_state, 'campaign')));
  v_visibility_mode text := lower(trim(coalesce(p_visibility_mode, 'always')));
  v_visibility text := 'campaign';
  v_level integer := greatest(1, least(coalesce(p_level, 1), 30));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_campaign(p_campaign_id, auth.uid()) then raise exception 'Only GM or owner can create characters'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Character name is required'; end if;
  if v_character_type not in ('pc', 'npc') then raise exception 'Unsupported character type'; end if;
  if v_publication_state not in ('draft', 'campaign') then raise exception 'Unsupported publication state'; end if;

  if v_publication_state = 'draft' then
    v_assigned_user_id := null;
    v_visibility_mode := 'private';
    v_visibility := 'private';
  else
    v_assigned_user_id := case when v_character_type = 'npc' then null else p_assigned_user_id end;
    if v_character_type = 'pc' then
      v_visibility_mode := 'always';
    elsif v_visibility_mode not in ('always', 'discover') then
      raise exception 'Published NPC visibility must be always or discover';
    end if;
    v_visibility := 'campaign';
  end if;

  if v_assigned_user_id is not null and not exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = p_campaign_id and cm.user_id = v_assigned_user_id
  ) then
    raise exception 'Assigned user is not a campaign member';
  end if;

  insert into public.characters (
    campaign_id, assigned_user_id, name, character_class, level, bio, avatar_url,
    character_type, visibility, visibility_mode, publication_state, created_by
  ) values (
    p_campaign_id, v_assigned_user_id, trim(p_name),
    coalesce(nullif(trim(coalesce(p_character_class, '')), ''), 'Персонаж'),
    v_level, trim(coalesce(p_bio, '')), nullif(trim(coalesce(p_avatar_url, '')), ''),
    v_character_type, v_visibility, v_visibility_mode, v_publication_state, auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.update_campaign_character_v2(
  p_character_id uuid,
  p_name text,
  p_character_class text,
  p_level integer,
  p_bio text,
  p_avatar_url text,
  p_assigned_user_id uuid,
  p_character_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_character public.characters%rowtype;
  v_assigned_user_id uuid;
  v_character_type text := lower(trim(coalesce(p_character_type, 'pc')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_character from public.characters where id = p_character_id for update;
  if v_character.id is null then raise exception 'Character not found'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then raise exception 'Only GM or owner can edit the character'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Character name is required'; end if;
  if v_character_type not in ('pc', 'npc') then raise exception 'Unsupported character type'; end if;

  v_assigned_user_id := case when v_character_type = 'npc' then null else p_assigned_user_id end;
  if v_character.publication_state = 'draft' and v_assigned_user_id is not null then
    raise exception 'Publish the character before assigning it to a player';
  end if;

  if v_assigned_user_id is not null and not exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = v_character.campaign_id and cm.user_id = v_assigned_user_id
  ) then
    raise exception 'Assigned user is not a campaign member';
  end if;

  update public.characters
  set assigned_user_id = v_assigned_user_id,
      name = trim(p_name),
      character_class = coalesce(nullif(trim(coalesce(p_character_class, '')), ''), 'Персонаж'),
      level = greatest(1, least(coalesce(p_level, 1), 30)),
      bio = trim(coalesce(p_bio, '')),
      avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
      character_type = v_character_type,
      updated_at = now()
  where id = p_character_id;

  if v_character.assigned_user_id is not null and v_character.assigned_user_id is distinct from v_assigned_user_id then
    update public.campaign_members
    set active_character_id = null
    where campaign_id = v_character.campaign_id
      and user_id = v_character.assigned_user_id
      and active_character_id = p_character_id;
  end if;
end;
$function$;

create or replace function public.set_character_publication_state_v1(
  p_character_id uuid,
  p_publication_state text,
  p_visibility_mode text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_character public.characters%rowtype;
  v_state text := lower(trim(coalesce(p_publication_state, '')));
  v_mode text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_state not in ('draft', 'campaign') then raise exception 'Unsupported publication state'; end if;

  select * into v_character from public.characters where id = p_character_id for update;
  if v_character.id is null then raise exception 'Character not found'; end if;
  if not private.can_manage_campaign(v_character.campaign_id, auth.uid()) then raise exception 'Only GM or owner can publish characters'; end if;

  if v_state = 'draft' then
    update public.campaign_members
    set active_character_id = null
    where campaign_id = v_character.campaign_id and active_character_id = p_character_id;

    update public.characters
    set publication_state = 'draft', assigned_user_id = null, visibility = 'private',
        visibility_mode = 'private', updated_at = now()
    where id = p_character_id;
    return;
  end if;

  if v_character.character_type = 'npc' then
    v_mode := lower(trim(coalesce(p_visibility_mode, 'discover')));
    if v_mode not in ('always', 'discover') then raise exception 'Published NPC visibility must be always or discover'; end if;
  else
    v_mode := 'always';
  end if;

  update public.characters
  set publication_state = 'campaign', visibility = 'campaign',
      visibility_mode = v_mode, updated_at = now()
  where id = p_character_id;
end;
$function$;

create or replace function public.set_character_visibility_mode(
  p_character_id uuid,
  p_visibility_mode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_character public.characters%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_character from public.characters where id = p_character_id for update;
  if v_character.id is null then raise exception 'Character not found'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then raise exception 'Not allowed'; end if;

  if v_character.publication_state = 'draft' then
    if p_visibility_mode <> 'private' then raise exception 'Publish the character before changing campaign visibility'; end if;
  elsif p_visibility_mode not in ('always','discover','private') then
    raise exception 'Unsupported visibility mode';
  end if;

  update public.characters
  set visibility_mode = p_visibility_mode,
      visibility = case when p_visibility_mode = 'private' then 'private' else 'campaign' end,
      updated_at = now()
  where id = p_character_id;
end;
$function$;

create or replace function public.set_campaign_active_character(
  p_campaign_id uuid,
  p_user_id uuid,
  p_character_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_character public.characters%rowtype;
  v_can_manage boolean := false;
  v_self_member boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  v_can_manage := private.can_manage_campaign(p_campaign_id, auth.uid());
  v_self_member := p_user_id = auth.uid()
    and exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = p_campaign_id and cm.user_id = auth.uid()
    );

  if not v_can_manage and not v_self_member then
    raise exception 'Only GM, owner, or the player themselves can manage the active character';
  end if;

  if p_character_id is not null then
    select * into v_character
    from public.characters c
    where c.id = p_character_id
      and c.campaign_id = p_campaign_id
      and c.assigned_user_id = p_user_id
      and c.character_type = 'pc'
      and c.publication_state = 'campaign';

    if v_character.id is null then raise exception 'Character is not assigned to this player or is still a draft'; end if;
    if v_character.life_state = 'dead' then raise exception 'Dead character cannot be active'; end if;
  end if;

  update public.campaign_members
  set active_character_id = p_character_id
  where campaign_id = p_campaign_id and user_id = p_user_id;

  if not found then raise exception 'Campaign member not found'; end if;
end;
$function$;

create or replace function public.set_reference_definition_status_v1(
  p_definition_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_scope text;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_status not in ('draft', 'active', 'archived') then raise exception 'Unsupported definition status'; end if;

  select campaign_id, scope into v_campaign_id, v_scope
  from public.reference_definitions where id = p_definition_id for update;

  if not found then raise exception 'Definition not found'; end if;
  if v_scope = 'system' then raise exception 'System definitions are immutable through campaign API'; end if;
  if not private.can_manage_campaign(v_campaign_id, auth.uid()) then raise exception 'Not allowed'; end if;

  update public.reference_definitions
  set status = v_status,
      visibility = case when v_status = 'active' then 'campaign' else 'gm' end,
      updated_at = now()
  where id = p_definition_id;
end;
$function$;

revoke all on function public.create_campaign_character_v2(uuid,text,text,integer,text,text,uuid,text,text,text) from public;
grant execute on function public.create_campaign_character_v2(uuid,text,text,integer,text,text,uuid,text,text,text) to authenticated;
revoke all on function public.update_campaign_character_v2(uuid,text,text,integer,text,text,uuid,text) from public;
grant execute on function public.update_campaign_character_v2(uuid,text,text,integer,text,text,uuid,text) to authenticated;
revoke all on function public.set_character_publication_state_v1(uuid,text,text) from public;
grant execute on function public.set_character_publication_state_v1(uuid,text,text) to authenticated;
revoke all on function public.set_reference_definition_status_v1(uuid,text) from public;
grant execute on function public.set_reference_definition_status_v1(uuid,text) to authenticated;
