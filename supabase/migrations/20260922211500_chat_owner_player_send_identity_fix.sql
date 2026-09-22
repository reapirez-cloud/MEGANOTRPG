begin;

-- Owner/admin authority is additive. A campaign owner whose ordinary role is
-- "player" must still be able to speak as their own playable PC. The previous
-- trigger entered the manager branch first and then accepted only Narrator or
-- a bound NPC, so owner-player messages sent as the selected PC were rejected.
create or replace function public.set_chat_message_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_role text;
  v_is_owner boolean;
  v_active_character_id uuid;
  v_can_manage boolean;
  v_actor_id uuid;
  v_character public.characters%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select r.campaign_id, cm.role, cm.is_owner, cm.active_character_id
    into v_campaign_id, v_role, v_is_owner, v_active_character_id
  from public.chat_rooms r
  join public.campaign_members cm
    on cm.campaign_id = r.campaign_id
   and cm.user_id = auth.uid()
  where r.id = new.room_id;

  if v_campaign_id is null then
    raise exception 'Campaign membership required';
  end if;

  v_can_manage := v_is_owner or v_role = 'gm';

  if v_can_manage then
    new.user_id := auth.uid();
    new.client_id := auth.uid();

    if new.character_id is null then
      new.character_id := null;
      new.author_name := 'Рассказчик';
      new.author_avatar_url := null;
      return new;
    end if;

    select c.*
      into v_character
    from public.characters c
    where c.id = new.character_id
      and c.campaign_id = v_campaign_id
      and c.life_state = 'alive';

    if v_character.id is null then
      raise exception 'This character is not available as your chat actor';
    end if;

    -- A player who also owns/manages the campaign keeps their player identity.
    -- In scene/flood rooms that identity is the active assigned PC. In a
    -- character room the player may also speak as that assigned room PC, which
    -- mirrors chat_player_viewer_character_for_room().
    if v_role = 'player'
       and v_character.character_type = 'pc'
       and v_character.assigned_user_id = auth.uid()
       and (
         v_active_character_id = v_character.id
         or exists (
           select 1
           from public.chat_rooms r
           where r.id = new.room_id
             and r.room_type = 'character'
             and r.character_id = v_character.id
         )
       )
    then
      new.character_id := v_character.id;
      new.author_name := v_character.name;
      new.author_avatar_url := v_character.avatar_url;
      return new;
    end if;

    -- Manager NPC speech remains explicit and binding-scoped.
    if v_character.character_type = 'npc'
       and exists (
         select 1
         from public.chat_actor_bindings cab
         where cab.campaign_id = v_campaign_id
           and cab.user_id = auth.uid()
           and cab.character_id = v_character.id
       )
    then
      new.character_id := v_character.id;
      new.author_name := v_character.name;
      new.author_avatar_url := v_character.avatar_url;
      return new;
    end if;

    raise exception 'This character is not available as your chat actor';
  end if;

  v_actor_id := private.chat_player_actor_for_room(new.room_id, auth.uid());

  if v_actor_id is null then
    raise exception 'Your active character cannot act in this chat';
  end if;

  if new.character_id is not null and new.character_id <> v_actor_id then
    raise exception 'This character is not available as your chat actor';
  end if;

  select c.*
    into v_character
  from public.characters c
  where c.id = v_actor_id;

  new.user_id := auth.uid();
  new.client_id := auth.uid();
  new.character_id := v_character.id;
  new.author_name := v_character.name;
  new.author_avatar_url := v_character.avatar_url;
  return new;
end;
$function$;

revoke all on function public.set_chat_message_identity() from public, anon, authenticated;

commit;
