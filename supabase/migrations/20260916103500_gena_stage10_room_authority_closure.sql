-- Stage 10 room-authority closure: Trade is a dedicated block inside a chat,
-- so trade access must never bypass access to that chat room.

create or replace function private.can_act_trade_side_v1(
  p_session_id uuid,
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
    from public.trade_sessions s
    where s.id=p_session_id
      and p_character_id in (s.side_a_character_id,s.side_b_character_id)
      and private.can_read_chat_room(s.room_id,p_user_id)
      and private.can_act_character_trade_side_v1(p_character_id,p_user_id)
  );
$function$;
revoke execute on function private.can_act_trade_side_v1(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function private.can_read_trade_session_v1(
  p_session_id uuid,
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
    from public.trade_sessions s
    where s.id=p_session_id
      and private.can_read_chat_room(s.room_id,p_user_id)
      and (
        private.can_manage_campaign(s.campaign_id,p_user_id)
        or private.can_act_character_trade_side_v1(s.side_a_character_id,p_user_id)
        or private.can_act_character_trade_side_v1(s.side_b_character_id,p_user_id)
      )
  );
$function$;
revoke execute on function private.can_read_trade_session_v1(uuid,uuid)
from public,anon,authenticated;

create or replace function public.create_trade_session_v1(
  p_room_id uuid,
  p_side_a_character_id uuid,
  p_side_b_character_id uuid,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.chat_rooms%rowtype;
  v_a public.characters%rowtype;
  v_b public.characters%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_session_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_side_a_character_id=p_side_b_character_id then
    raise exception 'Trade requires two distinct characters';
  end if;

  select * into v_room from public.chat_rooms where id=p_room_id;
  if not found then raise exception 'Trade room not found'; end if;

  if not private.can_write_chat_room(p_room_id,auth.uid())
     and not private.can_manage_campaign(v_room.campaign_id,auth.uid()) then
    raise exception 'Not allowed to start trade in this room';
  end if;

  select * into v_a from public.characters where id=p_side_a_character_id;
  select * into v_b from public.characters where id=p_side_b_character_id;

  if v_a.id is null or v_b.id is null
     or v_a.campaign_id<>v_room.campaign_id
     or v_b.campaign_id<>v_room.campaign_id then
    raise exception 'Trade characters and room must belong to the same campaign';
  end if;

  if v_a.character_type='npc' and v_b.character_type='npc' then
    raise exception 'Trade requires at least one PC side';
  end if;

  if v_a.character_type='pc' and (
    v_a.assigned_user_id is null
    or not private.can_read_chat_room(p_room_id,v_a.assigned_user_id)
  ) then
    raise exception 'Trade PC side A cannot read this room';
  end if;

  if v_b.character_type='pc' and (
    v_b.assigned_user_id is null
    or not private.can_read_chat_room(p_room_id,v_b.assigned_user_id)
  ) then
    raise exception 'Trade PC side B cannot read this room';
  end if;

  if not (
    private.can_act_character_trade_side_v1(v_a.id,auth.uid())
    or private.can_act_character_trade_side_v1(v_b.id,auth.uid())
    or private.can_manage_campaign(v_room.campaign_id,auth.uid())
  ) then
    raise exception 'User cannot act for either trade side';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trade-room:'||p_room_id::text,0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text,0)
  );

  select * into v_existing
  from public.engine_command_receipts
  where command_id=p_command_id;

  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'trade.create' then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  insert into public.trade_sessions(
    campaign_id,room_id,side_a_character_id,side_b_character_id,created_by
  )
  values(
    v_room.campaign_id,p_room_id,p_side_a_character_id,p_side_b_character_id,auth.uid()
  )
  returning id into v_session_id;

  perform private.trade_record_event_v1(
    v_session_id,'trade.created',1,null,
    jsonb_build_object(
      'roomId',p_room_id,
      'sideACharacterId',p_side_a_character_id,
      'sideBCharacterId',p_side_b_character_id
    ),
    auth.uid()
  );

  v_result:=jsonb_build_object(
    'sessionId',v_session_id,
    'roomId',p_room_id,
    'revision',1,
    'state','open'
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  )
  values(
    p_command_id,v_room.campaign_id,'gena','trade.create',
    v_session_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;
revoke all on function public.create_trade_session_v1(uuid,uuid,uuid,uuid)
from public,anon;
grant execute on function public.create_trade_session_v1(uuid,uuid,uuid,uuid)
to authenticated;
