begin;

drop function if exists public.get_campaign_chat_rooms(uuid);

create function public.get_campaign_chat_rooms(p_campaign_id uuid)
returns table (
  id uuid,
  slug text,
  title text,
  category text,
  room_type text,
  room_position integer,
  avatar_url text,
  character_id uuid,
  character_life_state text,
  open_to_campaign boolean,
  is_read_only boolean,
  room_state text,
  campaign_can_write boolean,
  location_id uuid,
  campaign_day integer,
  day_period text,
  scene_state text,
  is_own_character_room boolean,
  context_location_id uuid,
  context_location_name text,
  context_campaign_day integer,
  context_day_period text,
  preview text,
  created_at timestamptz,
  updated_at timestamptz,
  closed_at timestamptz,
  character_died_at timestamptz,
  last_message_at timestamptz,
  last_message_id bigint,
  unread_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.slug,
    r.title,
    r.category,
    r.room_type,
    r.position,
    coalesce(r.avatar_url, c.avatar_url),
    r.character_id,
    c.life_state,
    r.open_to_campaign,
    r.is_read_only,
    r.room_state,
    r.campaign_can_write,
    r.location_id,
    r.campaign_day,
    r.day_period,
    r.scene_state,
    (r.room_type = 'character' and c.assigned_user_id = auth.uid()) as is_own_character_room,
    case
      when ctx.location_id is not null
        and private.can_view_location(ctx.location_id, auth.uid())
        then ctx.location_id
      else null
    end as context_location_id,
    case
      when ctx.location_id is not null
        and private.can_view_location(ctx.location_id, auth.uid())
        then l.name
      else null
    end as context_location_name,
    ctx.campaign_day as context_campaign_day,
    ctx.day_period as context_day_period,
    case
      when r.room_type = 'character' and c.life_state = 'dead' then 'Мёртв · история доступна для чтения'
      when r.room_state = 'closed' then 'Событие завершено · история сохранена'
      when r.room_state = 'gm_only' then 'Только ГМ пишет'
      when lm.id is null and r.room_type = 'flood' then 'Общий разговор кампании'
      when lm.id is null and r.room_type = 'character' then 'Персональная игровая история'
      when lm.id is null then 'Общее игровое событие'
      when lm.event_kind = 'roll' then lm.author_name || ': бросок · ' || coalesce(lm.event_payload->>'label', 'кубики')
      when lm.event_kind = 'spell' then lm.author_name || ': ✦ ' || coalesce(lm.event_payload->>'label', 'заклинание')
      when lm.event_kind = 'action' then lm.author_name || ': ' || coalesce(lm.event_payload->>'label', 'действие')
      else lm.author_name || ': ' || lm.body
    end as preview,
    r.created_at,
    r.updated_at,
    r.closed_at,
    c.died_at as character_died_at,
    lm.created_at as last_message_at,
    lm.id as last_message_id,
    coalesce(unread.value, 0)::integer as unread_count
  from public.chat_rooms r
  left join public.characters c on c.id = r.character_id
  left join public.character_world_state cws on cws.character_id = r.character_id
  left join lateral (
    select
      case when r.room_type = 'character' then cws.location_id else r.location_id end as location_id,
      case when r.room_type = 'character' then cws.campaign_day else r.campaign_day end as campaign_day,
      case when r.room_type = 'character' then cws.day_period else r.day_period end as day_period
  ) ctx on true
  left join public.locations l on l.id = ctx.location_id
  left join public.chat_read_states rs
    on rs.room_id = r.id
   and rs.user_id = auth.uid()
  left join lateral (
    select m.id, m.author_name, m.body, m.created_at, m.event_kind, m.event_payload
    from public.chat_messages m
    where m.room_id = r.id
    order by m.id desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) value
    from public.chat_messages m
    where m.room_id = r.id
      and m.id > coalesce(rs.last_read_message_id, 0)
      and m.user_id is distinct from auth.uid()
  ) unread on true
  where r.campaign_id = p_campaign_id
    and private.can_read_chat_room(r.id, auth.uid())
  order by
    case
      when r.room_type = 'flood' then 0
      when r.room_type = 'character' and c.assigned_user_id = auth.uid() then 1
      when r.room_type = 'scene' and r.scene_state = 'active' then 2
      else 3
    end,
    r.position,
    r.created_at;
$$;

revoke all on function public.get_campaign_chat_rooms(uuid) from public, anon;
grant execute on function public.get_campaign_chat_rooms(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'character_world_state'
    ) then
      execute 'alter publication supabase_realtime add table public.character_world_state';
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'locations'
    ) then
      execute 'alter publication supabase_realtime add table public.locations';
    end if;
  end if;
end
$$;

commit;
