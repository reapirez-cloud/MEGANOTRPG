begin;

-- Chat actor authority follows the same role model as the rest of the app:
-- owner/admin and GM may speak as every living character they are allowed to
-- see, while a player may speak only as their assigned active living PC.
-- This deliberately preserves creator-only privacy for private characters.
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
  v_can_manage boolean;
  v_player_name text;
  v_active_character_id uuid;
  v_character public.characters%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select r.campaign_id, cm.role, cm.is_owner, cm.active_character_id, p.display_name
    into v_campaign_id, v_role, v_is_owner, v_active_character_id, v_player_name
  from public.chat_rooms r
  join public.campaign_members cm
    on cm.campaign_id = r.campaign_id
   and cm.user_id = auth.uid()
  join public.profiles p on p.user_id = auth.uid()
  where r.id = new.room_id;

  if v_campaign_id is null then raise exception 'Campaign membership required'; end if;
  v_can_manage := v_is_owner or v_role = 'gm';

  if new.character_id is not null then
    select * into v_character
    from public.characters c
    where c.id = new.character_id
      and c.campaign_id = v_campaign_id;

    if v_character.id is null then
      raise exception 'Character is unavailable in this campaign';
    end if;
    if v_character.life_state = 'dead' then
      raise exception 'Dead character cannot act in chat';
    end if;

    if v_can_manage then
      if not private.can_view_character(v_character.id, auth.uid()) then
        raise exception 'This character is not available as your chat actor';
      end if;
    elsif not (
      v_character.character_type = 'pc'
      and v_character.assigned_user_id = auth.uid()
      and v_active_character_id = v_character.id
    ) then
      raise exception 'This character is not available as your chat actor';
    end if;

    new.user_id := auth.uid();
    new.client_id := auth.uid();
    new.character_id := v_character.id;
    new.author_name := v_character.name;
    new.author_avatar_url := v_character.avatar_url;
    return new;
  end if;

  new.user_id := auth.uid();
  new.client_id := auth.uid();

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

  if v_active_character_id is not null then
    select * into v_character
    from public.characters c
    where c.id = v_active_character_id
      and c.campaign_id = v_campaign_id
      and c.assigned_user_id = auth.uid()
      and c.character_type = 'pc'
      and c.life_state = 'alive';
  end if;

  if v_character.id is not null then
    new.character_id := v_character.id;
    new.author_name := v_character.name;
    new.author_avatar_url := v_character.avatar_url;
    return new;
  end if;

  raise exception 'Active living character must be assigned by GM or owner';
end;
$$;

revoke all on function public.set_chat_message_identity() from public, anon, authenticated;

commit;
