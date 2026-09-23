-- AI GM Stage 12 follow-up: persist direct PC dialogue on player turn drafts
-- and copy it into the canonical trigger message without changing message text.

alter table public.player_turn_drafts
  add column if not exists audience_scope text not null default 'scene',
  add column if not exists recipient_character_ids uuid[] not null default '{}'::uuid[];

alter table public.player_turn_drafts
  drop constraint if exists player_turn_drafts_audience_scope_check;
alter table public.player_turn_drafts
  add constraint player_turn_drafts_audience_scope_check
  check (audience_scope in ('scene','direct_pc'));

create or replace function private.normalize_player_turn_audience_stage12_v1(
  p_campaign_id uuid,
  p_character_id uuid,
  p_audience_scope text,
  p_recipient_character_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_scope text := lower(btrim(coalesce(p_audience_scope,'scene')));
  v_recipients uuid[] := coalesce(p_recipient_character_ids,'{}'::uuid[]);
  v_source_location_id uuid;
  v_bad_recipient uuid;
begin
  if v_scope not in ('scene','direct_pc') then
    raise exception 'player_turn_audience_invalid';
  end if;

  if v_scope='scene' then
    return jsonb_build_object(
      'audience_scope','scene',
      'recipient_character_ids',to_jsonb('{}'::uuid[])
    );
  end if;

  if cardinality(v_recipients)<1 then
    raise exception 'direct_pc_requires_recipient';
  end if;

  if p_character_id=any(v_recipients) then
    raise exception 'direct_pc_cannot_target_self';
  end if;

  if (
    select count(distinct x)
    from unnest(v_recipients) x
  ) <> cardinality(v_recipients) then
    raise exception 'direct_pc_duplicate_recipient';
  end if;

  select ws.location_id
    into v_source_location_id
  from public.character_world_state ws
  where ws.campaign_id=p_campaign_id
    and ws.character_id=p_character_id;

  if v_source_location_id is null then
    raise exception 'direct_pc_source_location_required';
  end if;

  select x
    into v_bad_recipient
  from unnest(v_recipients) x
  left join public.characters c
    on c.id=x
   and c.campaign_id=p_campaign_id
   and c.character_type='pc'
   and c.life_state='alive'
   and c.publication_state='campaign'
  left join public.character_world_state ws
    on ws.campaign_id=p_campaign_id
   and ws.character_id=x
  where c.id is null
     or ws.location_id is distinct from v_source_location_id
  limit 1;

  if v_bad_recipient is not null then
    raise exception 'direct_pc_recipient_not_present';
  end if;

  return jsonb_build_object(
    'audience_scope','direct_pc',
    'recipient_character_ids',to_jsonb(v_recipients)
  );
end;
$$;

revoke all on function private.normalize_player_turn_audience_stage12_v1(uuid,uuid,text,uuid[])
  from public,anon,authenticated;

create or replace function public.save_player_turn_draft_v2(
  p_room_id uuid,
  p_character_id uuid,
  p_action_entry jsonb default null,
  p_bonus_action_entry jsonb default null,
  p_movement jsonb default null,
  p_component_order text[] default null,
  p_description text default '',
  p_expected_revision integer default null,
  p_audience_scope text default 'scene',
  p_recipient_character_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_existing public.player_turn_drafts%rowtype;
  v_row public.player_turn_drafts%rowtype;
  v_action jsonb;
  v_bonus jsonb;
  v_movement jsonb;
  v_component_order text[];
  v_audience jsonb;
  v_scope text;
  v_recipients uuid[];
begin
  v_campaign_id := private.assert_player_turn_actor_v1(
    p_room_id,p_character_id,v_user_id
  );

  v_action := private.normalize_player_turn_entry_v1(
    p_character_id,p_action_entry,'action'
  );
  v_bonus := private.normalize_player_turn_entry_v1(
    p_character_id,p_bonus_action_entry,'bonus_action'
  );
  v_movement := private.normalize_player_turn_movement_v1(p_movement);
  v_component_order := private.normalize_player_turn_order_v1(
    v_action,v_bonus,v_movement,p_component_order
  );

  v_audience := private.normalize_player_turn_audience_stage12_v1(
    v_campaign_id,
    p_character_id,
    p_audience_scope,
    p_recipient_character_ids
  );
  v_scope := v_audience->>'audience_scope';
  select coalesce(array_agg(value::uuid),'{}'::uuid[])
    into v_recipients
  from jsonb_array_elements_text(
    coalesce(v_audience->'recipient_character_ids','[]'::jsonb)
  );

  if v_scope='direct_pc'
     and (v_action is not null or v_bonus is not null or v_movement is not null)
  then
    raise exception 'direct_pc_dialogue_cannot_include_gameplay_components';
  end if;

  select *
    into v_existing
  from public.player_turn_drafts d
  where d.room_id=p_room_id
    and d.character_id=p_character_id
    and d.user_id=v_user_id
    and d.status='draft'
  for update;

  if v_existing.id is null then
    if p_expected_revision is not null then
      raise exception 'Turn draft changed; reload it';
    end if;

    insert into public.player_turn_drafts(
      campaign_id,room_id,character_id,user_id,
      action_entry,bonus_action_entry,movement,component_order,description,
      audience_scope,recipient_character_ids
    )
    values(
      v_campaign_id,p_room_id,p_character_id,v_user_id,
      v_action,v_bonus,v_movement,v_component_order,
      left(coalesce(p_description,''),5000),
      v_scope,v_recipients
    )
    returning * into v_row;
  else
    if p_expected_revision is not null
       and v_existing.revision<>p_expected_revision
    then
      raise exception 'Turn draft changed; reload it';
    end if;

    update public.player_turn_drafts
    set action_entry=v_action,
        bonus_action_entry=v_bonus,
        movement=v_movement,
        component_order=v_component_order,
        description=left(coalesce(p_description,''),5000),
        audience_scope=v_scope,
        recipient_character_ids=v_recipients,
        revision=revision+1,
        updated_at=now()
    where id=v_existing.id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.save_player_turn_draft_v2(
  uuid,uuid,jsonb,jsonb,jsonb,text[],text,integer,text,uuid[]
) from public,anon;
grant execute on function public.save_player_turn_draft_v2(
  uuid,uuid,jsonb,jsonb,jsonb,text[],text,integer,text,uuid[]
) to authenticated,service_role;

create or replace function private.copy_player_turn_audience_stage12_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_draft public.player_turn_drafts%rowtype;
begin
  if new.turn_component<>'description'
     or new.turn_command_id is null
     or new.character_id is null
  then
    return new;
  end if;

  select *
    into v_draft
  from public.player_turn_drafts d
  where d.room_id=new.room_id
    and d.character_id=new.character_id
    and d.status='draft'
    and d.user_id=auth.uid()
  order by d.updated_at desc
  limit 1;

  if v_draft.id is null then
    return new;
  end if;

  new.audience_scope:=v_draft.audience_scope;
  new.recipient_character_ids:=v_draft.recipient_character_ids;
  return new;
end;
$$;

revoke all on function private.copy_player_turn_audience_stage12_v1()
  from public,anon,authenticated;

drop trigger if exists copy_player_turn_audience_stage12_v1
  on public.chat_messages;
create trigger copy_player_turn_audience_stage12_v1
before insert on public.chat_messages
for each row
execute function private.copy_player_turn_audience_stage12_v1();

create or replace function private.sync_campaign_memory_chat_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_message public.chat_messages%rowtype;
  v_room public.chat_rooms%rowtype;
  v_summary text;
  v_location_id uuid;
  v_participants uuid[];
begin
  if tg_op='DELETE' then
    delete from public.campaign_events
    where source_kind='chat_message'
      and source_id=old.id::text;
    return old;
  end if;

  v_message:=new;

  select * into v_room
  from public.chat_rooms
  where id=v_message.room_id;

  if v_room.id is null or v_room.category<>'game' then
    delete from public.campaign_events
    where source_kind='chat_message'
      and source_id=v_message.id::text;
    return new;
  end if;

  if v_message.character_id is not null then
    select ws.location_id into v_location_id
    from public.character_world_state ws
    where ws.campaign_id=v_room.campaign_id
      and ws.character_id=v_message.character_id;
  elsif v_message.turn_command_id is not null then
    select nullif(j.input->>'source_location_id_snapshot','')::uuid
      into v_location_id
    from public.agent_jobs j
    where j.id=v_message.turn_command_id
      and j.campaign_id=v_room.campaign_id
      and j.input->>'surface'='game_chat_v1';
  end if;
  v_location_id:=coalesce(v_location_id,v_room.location_id);

  v_participants:=coalesce(v_message.recipient_character_ids,'{}'::uuid[]);
  if v_message.character_id is not null
     and not (v_message.character_id=any(v_participants))
  then
    v_participants:=array_prepend(v_message.character_id,v_participants);
  end if;

  v_summary:=left(
    case
      when nullif(btrim(coalesce(v_message.body,'')),'') is not null
        then coalesce(nullif(btrim(v_message.author_name),''),'Участник')||': '||btrim(v_message.body)
      when v_message.attachment_kind='image'
        then coalesce(nullif(btrim(v_message.author_name),''),'Участник')||': [изображение]'
      when v_message.event_kind is not null
        then coalesce(nullif(btrim(v_message.author_name),''),'Участник')||': '||v_message.event_kind
      else coalesce(nullif(btrim(v_message.author_name),''),'Участник')
    end,
    6000
  );

  insert into public.campaign_events(
    campaign_id,event_type,source_kind,source_id,room_id,location_id,
    actor_character_id,participant_character_ids,summary,payload,
    importance,visibility,visible_character_ids,confidence,provenance,occurred_at
  )
  values(
    v_room.campaign_id,
    case
      when v_message.event_kind is null then 'chat.message'
      else 'gameplay.'||v_message.event_kind
    end,
    'chat_message',
    v_message.id::text,
    v_room.id,
    v_location_id,
    v_message.character_id,
    v_participants,
    v_summary,
    jsonb_build_object(
      'message_id',v_message.id,
      'event_kind',v_message.event_kind,
      'event_payload',coalesce(v_message.event_payload,'{}'::jsonb),
      'attachment_kind',v_message.attachment_kind,
      'room_type',v_room.room_type,
      'room_title',v_room.title,
      'campaign_day',v_room.campaign_day,
      'day_period',v_room.day_period,
      'edited_at',v_message.edited_at,
      'audience_scope',v_message.audience_scope,
      'recipient_character_ids',v_message.recipient_character_ids
    ),
    case when v_message.event_kind is null then 1 else 2 end,
    case when v_message.audience_scope='direct_pc'
      then 'characters' else 'room' end,
    case when v_message.audience_scope='direct_pc'
      then v_participants else '{}'::uuid[] end,
    1,
    jsonb_build_object(
      'table','chat_messages',
      'message_id',v_message.id,
      'client_id',v_message.client_id,
      'location_snapshot',v_location_id
    ),
    v_message.created_at
  )
  on conflict(campaign_id,source_kind,source_id)
  do update set
    event_type=excluded.event_type,
    room_id=excluded.room_id,
    location_id=excluded.location_id,
    actor_character_id=excluded.actor_character_id,
    participant_character_ids=excluded.participant_character_ids,
    summary=excluded.summary,
    payload=excluded.payload,
    importance=excluded.importance,
    visibility=excluded.visibility,
    visible_character_ids=excluded.visible_character_ids,
    confidence=excluded.confidence,
    provenance=excluded.provenance,
    occurred_at=excluded.occurred_at;

  return new;
end;
$$;

revoke all on function private.sync_campaign_memory_chat_event()
  from public,anon,authenticated;
