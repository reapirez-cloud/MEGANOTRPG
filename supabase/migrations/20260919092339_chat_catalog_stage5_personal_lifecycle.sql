begin;

create or replace function private.ensure_character_chat_room(p_character_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character public.characters%rowtype;
  v_room_id uuid;
  v_position integer;
begin
  select * into v_character
  from public.characters c
  where c.id = p_character_id;

  if v_character.id is null or v_character.character_type <> 'pc' then
    return null;
  end if;

  select r.id into v_room_id
  from public.chat_rooms r
  where r.character_id = v_character.id
    and r.room_type = 'character'
  limit 1;

  if v_room_id is not null then
    update public.chat_rooms
    set title = v_character.name,
        open_to_campaign = true,
        campaign_can_write = false,
        is_read_only = (v_character.life_state = 'dead'),
        room_state = 'open',
        scene_state = 'active',
        closed_at = null
    where id = v_room_id;
    return v_room_id;
  end if;

  select coalesce(max(r.position), 0) + 10 into v_position
  from public.chat_rooms r
  where r.campaign_id = v_character.campaign_id
    and r.room_type = 'character';

  insert into public.chat_rooms(
    campaign_id, slug, title, category, position,
    room_type, character_id, open_to_campaign, campaign_can_write,
    is_read_only, room_state, scene_state, closed_at
  ) values (
    v_character.campaign_id,
    'character-' || replace(v_character.id::text, '-', ''),
    v_character.name,
    'game',
    v_position,
    'character',
    v_character.id,
    true,
    false,
    v_character.life_state = 'dead',
    'open',
    'active',
    null
  )
  returning id into v_room_id;

  return v_room_id;
end;
$$;

revoke all on function private.ensure_character_chat_room(uuid)
from public, anon, authenticated;

create or replace function private.sync_character_game_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_changed_to_dead boolean := false;
  v_changed_to_alive boolean := false;
begin
  if new.character_type = 'pc' then
    v_room_id := private.ensure_character_chat_room(new.id);
  end if;

  if tg_op = 'UPDATE' then
    v_changed_to_dead :=
      old.life_state is distinct from new.life_state and new.life_state = 'dead';
    v_changed_to_alive :=
      old.life_state is distinct from new.life_state and new.life_state = 'alive';

    if old.name is distinct from new.name and v_room_id is not null then
      update public.chat_rooms set title = new.name where id = v_room_id;
    end if;

    if v_changed_to_dead then
      update public.campaign_members
      set active_character_id = null
      where campaign_id = new.campaign_id and active_character_id = new.id;

      update public.chat_rooms
      set is_read_only = true,
          room_state = 'open',
          scene_state = 'active',
          closed_at = null,
          updated_at = now()
      where character_id = new.id and room_type = 'character';

      insert into public.feed_items(
        campaign_id, source_type, source_id, created_by, character_id,
        title, body, media_url, published_at, updated_at
      )
      values (
        new.campaign_id, 'update', gen_random_uuid(), auth.uid(), new.id,
        'Погиб: ' || new.name,
        'Персональная история персонажа завершена. Его игровой чат теперь доступен только для чтения.',
        new.avatar_url, now(), now()
      );

    elsif v_changed_to_alive then
      update public.chat_rooms
      set is_read_only = false,
          room_state = 'open',
          scene_state = 'active',
          closed_at = null,
          updated_at = now()
      where character_id = new.id and room_type = 'character';

      insert into public.feed_items(
        campaign_id, source_type, source_id, created_by, character_id,
        title, body, media_url, published_at, updated_at
      )
      values (
        new.campaign_id, 'update', gen_random_uuid(), auth.uid(), new.id,
        'Вернулся: ' || new.name,
        'Персональный игровой чат персонажа снова открыт.',
        new.avatar_url, now(), now()
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_character_game_lifecycle()
from public, anon, authenticated;

create or replace function public.set_chat_room_state(p_room_id uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_room_type text;
begin
  if p_state not in ('open', 'gm_only', 'closed') then
    raise exception 'Unsupported room state';
  end if;

  select r.campaign_id, r.room_type
  into v_campaign_id, v_room_type
  from public.chat_rooms r
  where r.id = p_room_id;

  if v_campaign_id is null then
    raise exception 'Chat room not found';
  end if;

  if not private.can_manage_campaign(v_campaign_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  if v_room_type = 'character' then
    raise exception 'Personal history state follows character life state';
  end if;

  update public.chat_rooms
  set room_state = p_state,
      closed_at = case when p_state = 'closed' then now() else null end,
      scene_state = case
        when room_type = 'scene' and p_state = 'closed' then 'closed'
        when room_type = 'scene' then 'active'
        else scene_state
      end,
      updated_at = now()
  where id = p_room_id;
end;
$$;

revoke all on function public.set_chat_room_state(uuid, text)
from public, anon;
grant execute on function public.set_chat_room_state(uuid, text)
to authenticated;

update public.chat_rooms r
set open_to_campaign = true,
    campaign_can_write = false,
    is_read_only = (c.life_state = 'dead'),
    room_state = 'open',
    scene_state = 'active',
    closed_at = null
from public.characters c
where r.room_type = 'character'
  and r.character_id = c.id;

commit;
