create or replace function private.chat_player_viewer_character_for_room(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when cm.role = 'gm' then null
    when r.room_type = 'character'
      and room_character.assigned_user_id = p_user_id
      then room_character.id
    when r.room_type = 'flood'
      and active_character.id is not null
      and active_character.assigned_user_id = p_user_id
      and active_character.character_type = 'pc'
      then active_character.id
    when r.room_type = 'scene'
      and active_character.id is not null
      and active_character.assigned_user_id = p_user_id
      and active_character.character_type = 'pc'
      and (
        r.campaign_can_write = true
        or exists (
          select 1
          from public.scene_participants sp
          where sp.room_id = r.id
            and sp.character_id = active_character.id
        )
        or exists (
          select 1
          from public.chat_room_members crm
          where crm.room_id = r.id
            and crm.user_id = p_user_id
            and crm.can_write = true
        )
      )
      then active_character.id
    else null
  end
  from public.chat_rooms r
  join public.campaign_members cm
    on cm.campaign_id = r.campaign_id
   and cm.user_id = p_user_id
  left join public.characters room_character
    on room_character.id = r.character_id
  left join public.characters active_character
    on active_character.id = cm.active_character_id
  where r.id = p_room_id
  limit 1;
$function$;

comment on function private.chat_player_viewer_character_for_room(uuid, uuid) is
  'Resolves the room-scoped player character. Campaign ownership grants management authority but does not erase the ordinary player identity; only role=gm suppresses the player-character projection.';
