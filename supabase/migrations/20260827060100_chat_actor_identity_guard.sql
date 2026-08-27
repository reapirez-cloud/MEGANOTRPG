-- Final guard for UI v2 chat identities.
-- Managers deliberately use character_id = null to speak as their GM/owner role.
-- Character actors are always explicit, and private visibility is re-checked on every insert.

create or replace function public.set_chat_message_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_role text;
  v_is_owner boolean;
  v_player_name text;
  v_active_character_id uuid;
  v_character public.characters%rowtype;
  v_bound boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select r.campaign_id, cm.role, cm.is_owner, cm.active_character_id, p.display_name
    into v_campaign_id, v_role, v_is_owner, v_active_character_id, v_player_name
  from public.chat_rooms r
  join public.campaign_members cm
    on cm.campaign_id = r.campaign_id
   and cm.user_id = auth.uid()
  join public.profiles p
    on p.user_id = auth.uid()
  where r.id = new.room_id;

  if v_campaign_id is null then
    raise exception 'Campaign membership required';
  end if;

  new.user_id := auth.uid();
  new.client_id := auth.uid();

  -- A character selected in the composer is always explicit.
  if new.character_id is not null then
    select * into v_character
    from public.characters c
    where c.id = new.character_id
      and c.campaign_id = v_campaign_id;

    if v_character.id is null then
      raise exception 'Character is unavailable in this campaign';
    end if;

    -- A stale binding must never bypass a later "Only me" change.
    if v_character.visibility = 'private'
       and v_character.created_by is distinct from auth.uid()
       and v_character.assigned_user_id is distinct from auth.uid() then
      raise exception 'Private character belongs to another GM';
    end if;

    select exists (
      select 1
      from public.chat_actor_bindings b
      where b.user_id = auth.uid()
        and b.character_id = v_character.id
        and b.campaign_id = v_campaign_id
    ) into v_bound;

    if not v_bound and not (
      v_character.character_type = 'pc'
      and v_character.assigned_user_id = auth.uid()
      and v_active_character_id = v_character.id
    ) then
      raise exception 'This character is not available as your chat actor';
    end if;

    new.author_name := v_character.name;
    new.author_avatar_url := v_character.avatar_url;
    return new;
  end if;

  -- For managers, no character id is an intentional role identity.
  -- This keeps GM/owner status independent from the PC they may be playing.
  if v_is_owner then
    new.character_id := null;
    new.author_name := 'Владелец (' || v_player_name || ')';
    new.author_avatar_url := null;
    return new;
  end if;

  if v_role = 'gm' then
    new.character_id := null;
    new.author_name := 'ГМ (' || v_player_name || ')';
    new.author_avatar_url := null;
    return new;
  end if;

  -- Ordinary players keep the convenient active-character fallback.
  if v_active_character_id is not null then
    select * into v_character
    from public.characters c
    where c.id = v_active_character_id
      and c.campaign_id = v_campaign_id
      and c.assigned_user_id = auth.uid()
      and c.character_type = 'pc';
  end if;

  if v_character.id is not null then
    new.character_id := v_character.id;
    new.author_name := v_character.name;
    new.author_avatar_url := v_character.avatar_url;
    return new;
  end if;

  raise exception 'Active character must be assigned by GM or owner';
end;
$$;
