-- AI GM Stage 4 hardening: the draft table is read-only to clients.
--
-- Some project-wide default grants can give authenticated additional table
-- privileges on newly-created relations. Player turn mutations must remain RPC-only.

revoke all on table public.player_turn_drafts
  from public, anon, authenticated;

grant select on table public.player_turn_drafts
  to authenticated;

drop policy if exists player_turn_drafts_read_own
  on public.player_turn_drafts;

create policy player_turn_drafts_read_own
on public.player_turn_drafts
for select
to authenticated
using (
  user_id = auth.uid()
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

create or replace function private.assert_player_turn_actor_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_campaign_id uuid;
begin
  if p_user_id is null then
    raise exception 'Authentication required';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Anonymous accounts cannot submit player turns';
  end if;

  select r.campaign_id
    into v_campaign_id
  from public.chat_rooms r
  where r.id = p_room_id
    and r.category = 'game'
    and r.room_state = 'open'
    and r.is_read_only = false
    and r.scene_state = 'active';

  if v_campaign_id is null then
    raise exception 'Player turn requires an active game room';
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.id = p_character_id
      and c.campaign_id = v_campaign_id
      and c.character_type = 'pc'
      and c.life_state = 'alive'
      and c.assigned_user_id = p_user_id
  ) then
    raise exception 'Player turn requires your live PC';
  end if;

  if not private.can_write_chat_room(p_room_id, p_user_id) then
    raise exception 'Нет права писать в этот чат';
  end if;

  return v_campaign_id;
end;
$$;
