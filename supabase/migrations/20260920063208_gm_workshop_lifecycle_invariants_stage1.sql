-- Stage 1: canonical character lifecycle invariants for the GM Workshop.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'characters_draft_lifecycle_check'
      and conrelid = 'public.characters'::regclass
  ) then
    alter table public.characters
      add constraint characters_draft_lifecycle_check
      check (
        publication_state <> 'draft'
        or (
          assigned_user_id is null
          and visibility = 'private'
          and visibility_mode = 'private'
        )
      ) not valid;
    alter table public.characters
      validate constraint characters_draft_lifecycle_check;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'characters_npc_unassigned_check'
      and conrelid = 'public.characters'::regclass
  ) then
    alter table public.characters
      add constraint characters_npc_unassigned_check
      check (character_type <> 'npc' or assigned_user_id is null) not valid;
    alter table public.characters
      validate constraint characters_npc_unassigned_check;
  end if;
end
$$;

create or replace function private.validate_character_lifecycle_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.publication_state = 'draft' then
    if new.assigned_user_id is not null
       or new.visibility <> 'private'
       or new.visibility_mode <> 'private' then
      raise exception 'Draft character must be private and unassigned';
    end if;
  end if;

  if new.character_type = 'npc' and new.assigned_user_id is not null then
    raise exception 'NPC cannot be assigned to a campaign member';
  end if;

  if new.assigned_user_id is not null and not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = new.campaign_id
      and cm.user_id = new.assigned_user_id
  ) then
    raise exception 'Assigned user is not a member of this campaign';
  end if;

  return new;
end;
$function$;

drop trigger if exists characters_validate_lifecycle_v1 on public.characters;
create trigger characters_validate_lifecycle_v1
before insert or update of
  campaign_id,
  assigned_user_id,
  character_type,
  publication_state,
  visibility,
  visibility_mode
on public.characters
for each row
execute function private.validate_character_lifecycle_v1();

create or replace function private.validate_campaign_member_active_character_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.active_character_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.id = new.active_character_id
      and c.campaign_id = new.campaign_id
      and c.assigned_user_id = new.user_id
      and c.character_type = 'pc'
      and c.publication_state = 'campaign'
      and c.life_state = 'alive'
  ) then
    raise exception 'Active character must be a living published PC assigned to this member';
  end if;

  return new;
end;
$function$;

drop trigger if exists campaign_members_validate_active_character_v1
  on public.campaign_members;
create trigger campaign_members_validate_active_character_v1
before insert or update of
  campaign_id,
  user_id,
  active_character_id
on public.campaign_members
for each row
execute function private.validate_campaign_member_active_character_v1();

create or replace function private.clear_invalid_character_activity_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.life_state <> 'alive'
     or new.publication_state <> 'campaign'
     or new.character_type <> 'pc'
     or new.assigned_user_id is null then
    update public.campaign_members
    set active_character_id = null
    where campaign_id = new.campaign_id
      and active_character_id = new.id;
    return new;
  end if;

  if old.assigned_user_id is distinct from new.assigned_user_id then
    update public.campaign_members
    set active_character_id = null
    where campaign_id = new.campaign_id
      and active_character_id = new.id
      and user_id is distinct from new.assigned_user_id;
  end if;

  return new;
end;
$function$;

drop trigger if exists characters_clear_invalid_activity_v1
  on public.characters;
create trigger characters_clear_invalid_activity_v1
after update of
  assigned_user_id,
  character_type,
  publication_state,
  life_state
on public.characters
for each row
execute function private.clear_invalid_character_activity_v1();

create or replace function public.set_character_life_state(
  p_character_id uuid,
  p_life_state text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_character public.characters%rowtype;
  v_life_state text := lower(trim(coalesce(p_life_state, '')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_life_state not in ('alive', 'dead') then raise exception 'Unsupported life state'; end if;

  select * into v_character
  from public.characters
  where id = p_character_id
  for update;

  if v_character.id is null then raise exception 'Character not found'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM or owner can change character life state';
  end if;

  update public.characters
  set life_state = v_life_state,
      died_at = case when v_life_state = 'dead' then coalesce(died_at, now()) else null end,
      updated_at = now()
  where id = p_character_id;
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
  v_character_type text := lower(trim(coalesce(p_character_type, 'pc')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_character
  from public.characters
  where id = p_character_id
  for update;

  if v_character.id is null then raise exception 'Character not found'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM or owner can edit the character';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Character name is required'; end if;
  if v_character_type not in ('pc', 'npc') then raise exception 'Unsupported character type'; end if;
  if v_character_type <> v_character.character_type then
    raise exception 'Use convert_campaign_character_type_v1 to change character type';
  end if;
  if v_character.publication_state = 'draft' and p_assigned_user_id is not null then
    raise exception 'Publish the character before assigning it to a player';
  end if;
  if v_character.character_type = 'npc' and p_assigned_user_id is not null then
    raise exception 'NPC cannot be assigned to a campaign member';
  end if;
  if p_assigned_user_id is not null and not exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = v_character.campaign_id
      and cm.user_id = p_assigned_user_id
  ) then
    raise exception 'Assigned user is not a campaign member';
  end if;

  update public.characters
  set assigned_user_id = case when v_character.character_type = 'pc' then p_assigned_user_id else null end,
      name = trim(p_name),
      character_class = coalesce(nullif(trim(coalesce(p_character_class, '')), ''), 'Персонаж'),
      level = greatest(1, least(coalesce(p_level, 1), 30)),
      bio = trim(coalesce(p_bio, '')),
      avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
      updated_at = now()
  where id = p_character_id;
end;
$function$;

create or replace function public.convert_campaign_character_type_v1(
  p_character_id uuid,
  p_character_type text,
  p_npc_visibility_mode text default 'discover'
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_character public.characters%rowtype;
  v_target_type text := lower(trim(coalesce(p_character_type, '')));
  v_npc_visibility text := lower(trim(coalesce(p_npc_visibility_mode, 'discover')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_target_type not in ('pc', 'npc') then raise exception 'Unsupported character type'; end if;
  if v_npc_visibility not in ('always', 'discover') then
    raise exception 'Published NPC visibility must be always or discover';
  end if;

  select * into v_character
  from public.characters
  where id = p_character_id
  for update;

  if v_character.id is null then raise exception 'Character not found'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM or owner can convert character type';
  end if;
  if v_character.character_type = v_target_type then return; end if;

  if v_target_type = 'npc' then
    update public.characters
    set character_type = 'npc',
        assigned_user_id = null,
        visibility = case when publication_state = 'draft' then 'private' else 'campaign' end,
        visibility_mode = case when publication_state = 'draft' then 'private' else v_npc_visibility end,
        updated_at = now()
    where id = p_character_id;
    return;
  end if;

  delete from public.location_npc_habitats
  where campaign_id = v_character.campaign_id
    and npc_character_id = p_character_id;

  delete from public.character_npc_discoveries
  where npc_character_id = p_character_id;

  update public.characters
  set character_type = 'pc',
      assigned_user_id = null,
      visibility = case when publication_state = 'draft' then 'private' else 'campaign' end,
      visibility_mode = case when publication_state = 'draft' then 'private' else 'always' end,
      updated_at = now()
  where id = p_character_id;
end;
$function$;

create or replace function public.remove_campaign_member_v1(
  p_campaign_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member public.campaign_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'Only campaign owner can remove members';
  end if;
  if p_user_id = auth.uid() then raise exception 'Campaign owner cannot remove themselves'; end if;

  select * into v_member
  from public.campaign_members
  where campaign_id = p_campaign_id
    and user_id = p_user_id
  for update;

  if v_member.user_id is null then raise exception 'Campaign member not found'; end if;
  if v_member.is_owner then raise exception 'Campaign owner cannot be removed'; end if;

  update public.characters
  set assigned_user_id = null,
      updated_at = now()
  where campaign_id = p_campaign_id
    and assigned_user_id = p_user_id;

  delete from public.campaign_members
  where campaign_id = p_campaign_id
    and user_id = p_user_id;
end;
$function$;

revoke all on function private.validate_character_lifecycle_v1() from public;
revoke all on function private.validate_campaign_member_active_character_v1() from public;
revoke all on function private.clear_invalid_character_activity_v1() from public;

revoke all on function public.set_character_life_state(uuid, text) from public, anon;
grant execute on function public.set_character_life_state(uuid, text) to authenticated;

revoke all on function public.update_campaign_character_v2(uuid, text, text, integer, text, text, uuid, text)
  from public, anon;
grant execute on function public.update_campaign_character_v2(uuid, text, text, integer, text, text, uuid, text)
  to authenticated;

revoke all on function public.convert_campaign_character_type_v1(uuid, text, text)
  from public, anon;
grant execute on function public.convert_campaign_character_type_v1(uuid, text, text)
  to authenticated;

revoke all on function public.remove_campaign_member_v1(uuid, uuid) from public, anon;
grant execute on function public.remove_campaign_member_v1(uuid, uuid) to authenticated;
