create or replace function public.read_ai_gm_recent_chat_context_v1(
  p_campaign_id uuid,
  p_room_id uuid,
  p_source_character_id uuid,
  p_source_message_id bigint,
  p_source_location_id uuid,
  p_current_day integer,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),50));
  v_source jsonb;
  v_messages jsonb;
  v_count integer;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;

  if not exists(select 1 from public.chat_rooms r where r.id=p_room_id and r.campaign_id=p_campaign_id)
    then raise exception 'stage19_room_not_found'; end if;
  if not exists(select 1 from public.characters c where c.id=p_source_character_id and c.campaign_id=p_campaign_id)
    then raise exception 'stage19_source_character_not_found'; end if;

  select jsonb_build_object(
    'id',m.id,'audience_scope',m.audience_scope,
    'recipient_character_ids',to_jsonb(m.recipient_character_ids)
  ) into v_source
  from public.chat_messages m
  where m.id=p_source_message_id and m.room_id=p_room_id;

  if v_source is null then raise exception 'stage19_source_message_not_found'; end if;

  with eligible as (
    select m.id,m.author_name,m.character_id,m.body,m.created_at,m.attachment_kind,
      m.event_kind,m.event_payload,m.audience_scope,m.recipient_character_ids,
      e.location_id source_location_id,e.payload campaign_event_payload,
      e.visibility campaign_event_visibility,
      e.visible_character_ids campaign_event_visible_character_ids,
      case
        when coalesce(e.payload->>'effective_game_day',e.payload->>'campaign_day','') ~ '^[0-9]+$'
        then coalesce(e.payload->>'effective_game_day',e.payload->>'campaign_day')::integer
        else null
      end campaign_day,
      nullif(btrim(coalesce(e.payload->>'day_period','')),'') day_period
    from public.chat_messages m
    left join public.campaign_events e
      on e.campaign_id=p_campaign_id and e.source_kind='chat_message' and e.source_id=m.id::text
    where m.room_id=p_room_id and m.id<=p_source_message_id
      and (
        m.audience_scope<>'direct_pc' or m.character_id=p_source_character_id
        or p_source_character_id=any(m.recipient_character_ids)
      )
      and (
        e.id is null or e.visibility='campaign'
        or (e.visibility='room' and (e.room_id is null or e.room_id=p_room_id))
        or (e.visibility='characters' and p_source_character_id=any(e.visible_character_ids))
      )
      and (
        p_current_day is null or e.id is null
        or case
          when coalesce(e.payload->>'effective_game_day',e.payload->>'campaign_day','') ~ '^[0-9]+$'
          then coalesce(e.payload->>'effective_game_day',e.payload->>'campaign_day')::integer
          else null
        end is null
        or case
          when coalesce(e.payload->>'effective_game_day',e.payload->>'campaign_day','') ~ '^[0-9]+$'
          then coalesce(e.payload->>'effective_game_day',e.payload->>'campaign_day')::integer
          else null
        end<=p_current_day
      )
    order by m.id desc limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'author_name',x.author_name,'character_id',x.character_id,'body',x.body,
    'created_at',x.created_at,'attachment_kind',x.attachment_kind,'event_kind',x.event_kind,
    'event_payload',x.event_payload,'audience_scope',x.audience_scope,
    'recipient_character_ids',to_jsonb(x.recipient_character_ids),
    'campaign_day',x.campaign_day,'day_period',x.day_period,
    'source_location_id',x.source_location_id
  ) order by x.id asc),'[]'::jsonb),count(*)::integer
  into v_messages,v_count
  from eligible x;

  return jsonb_build_object(
    'source_message',v_source,'messages',v_messages,
    'eligible_message_count',coalesce(v_count,0),'limit',v_limit,
    'runtime_stage',19,'stage19_version',2,'cross_location_room_history',true
  );
end;
$function$;
