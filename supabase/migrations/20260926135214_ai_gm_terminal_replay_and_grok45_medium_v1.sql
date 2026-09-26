-- Allow regenerate/edit-resend after a provider failure or explicit cancel.
-- Previously the replay path required an active revision and stranded terminal turns.

CREATE OR REPLACE FUNCTION private.reserve_ai_gm_revision_job_v1(p_campaign_id uuid, p_user_id uuid, p_source_chat_message_id bigint, p_mode text, p_edited_body text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_message public.chat_messages%rowtype;
  v_room public.chat_rooms%rowtype;
  v_character public.characters%rowtype;
  v_manager_user_id uuid;
  v_active private.ai_gm_turn_revisions%rowtype;
  v_latest private.ai_gm_turn_revisions%rowtype;
  v_latest_job public.agent_jobs%rowtype;
  v_revision_id uuid;
  v_revision_no integer;
  v_job_id uuid;
  v_status text;
  v_mode text := lower(trim(coalesce(p_mode,'initial')));
  v_before text;
  v_after text;
begin
  if p_campaign_id is null
     or p_user_id is null
     or p_source_chat_message_id is null
  then
    raise exception 'campaign_user_source_required';
  end if;

  if v_mode not in ('initial','regenerate','edit_resend') then
    raise exception 'ai_gm_replay_mode_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ai-gm-turn-source:'||p_source_chat_message_id::text,
      0
    )
  );

  select * into v_message
  from public.chat_messages
  where id=p_source_chat_message_id
  for update;

  if v_message.id is null then
    raise exception 'source_chat_message_not_found';
  end if;

  select * into v_room
  from public.chat_rooms
  where id=v_message.room_id;

  if v_room.id is null or v_room.campaign_id<>p_campaign_id then
    raise exception 'source_chat_room_campaign_mismatch';
  end if;

  if v_room.category<>'game'
     or v_room.room_state<>'open'
     or v_room.is_read_only
     or v_room.scene_state<>'active'
  then
    raise exception 'source_chat_room_not_active';
  end if;

  if v_message.character_id is null then
    raise exception 'source_chat_message_requires_pc';
  end if;

  select * into v_character
  from public.characters
  where id=v_message.character_id
    and campaign_id=p_campaign_id;

  if v_character.id is null
     or v_character.character_type<>'pc'
     or v_character.life_state<>'alive'
  then
    raise exception 'source_chat_message_requires_live_pc';
  end if;

  if not exists(
    select 1
    from public.campaign_members cm
    where cm.campaign_id=p_campaign_id
      and cm.user_id=p_user_id
  ) then
    raise exception 'campaign_membership_required';
  end if;

  if v_message.user_id is distinct from p_user_id
     and not private.can_manage_campaign(p_campaign_id,p_user_id)
  then
    raise exception 'source_chat_message_replay_not_allowed';
  end if;

  select cm.user_id into v_manager_user_id
  from public.campaign_members cm
  where cm.campaign_id=p_campaign_id
    and (cm.is_owner=true or cm.role='gm')
  order by cm.is_owner desc,cm.created_at asc
  limit 1;

  if v_manager_user_id is null then
    raise exception 'campaign_manager_required_for_ai_gm';
  end if;

  select * into v_active
  from private.ai_gm_turn_revisions r
  where r.source_message_id=p_source_chat_message_id
    and r.state='active'
  for update;

  select * into v_latest
  from private.ai_gm_turn_revisions r
  where r.source_message_id=p_source_chat_message_id
  order by r.revision_no desc
  limit 1;

  if v_mode='initial' then
    if v_latest.id is not null then
      select j.status into v_status
      from public.agent_jobs j
      where j.id=v_latest.job_id;

      return jsonb_build_object(
        'job_id',v_latest.job_id,
        'status',coalesce(v_status,'completed'),
        'room_id',v_message.room_id,
        'source_chat_message_id',v_message.id,
        'turn_revision_id',v_latest.id,
        'turn_revision_no',v_latest.revision_no,
        'canonical_state',v_latest.state
      );
    end if;
  else
    if v_active.id is null then
      if v_latest.id is null then
        raise exception 'ai_gm_active_revision_not_found';
      end if;

      select * into v_latest_job
      from public.agent_jobs j
      where j.id=v_latest.job_id
      for update;

      if v_latest_job.id is null
         or (
           v_latest.state<>'rolled_back'
           and v_latest_job.status not in ('failed','cancelled')
         )
      then
        raise exception 'ai_gm_active_revision_not_found';
      end if;

      -- A manually rolled-back revision has already passed the reversible
      -- effect and later-message guards. Its historical job may stay completed.
      if v_latest.state<>'rolled_back'
         and exists(
           select 1
           from public.ai_gm_post_turn_commits c
           where c.parent_job_id=v_latest_job.id
             and c.state in ('queued','running','completed')
         )
      then
        raise exception 'ai_gm_regenerate_has_committed_post_turn_world_changes';
      end if;
    else
      perform private.rollback_ai_gm_turn_revision_v1(
        v_active.id,
        'superseded',
        p_user_id,
        case
          when v_mode='edit_resend' then 'edit_and_resend'
          else 'regenerate'
        end
      );
    end if;
  end if;

  v_before:=v_message.body;
  v_after:=v_before;

  if v_mode='edit_resend' then
    if v_message.event_kind is not null
       or v_message.turn_command_id is not null
       or v_message.turn_component is not null
    then
      raise exception 'ai_gm_edit_requires_plain_source_message';
    end if;

    v_after:=trim(coalesce(p_edited_body,''));
    if v_after='' then
      raise exception 'edited_message_empty';
    end if;
    if char_length(v_after)>4000 then
      raise exception 'edited_message_too_long';
    end if;

    update public.chat_messages
    set body=v_after,
        edited_at=now()
    where id=v_message.id;
  end if;

  select coalesce(max(r.revision_no),0)+1
    into v_revision_no
  from private.ai_gm_turn_revisions r
  where r.source_message_id=p_source_chat_message_id;

  v_revision_id:=gen_random_uuid();

  insert into public.agent_jobs(
    campaign_id,thread_id,requested_by,agent_key,job_type,status,input,result,
    requested_outputs,completed_outputs
  )
  values(
    p_campaign_id,
    null,
    p_user_id,
    'voss',
    'conversation_turn',
    'queued',
    jsonb_build_object(
      'surface','game_chat_v1',
      'source_chat_message_id',v_message.id::text,
      'room_id',v_message.room_id::text,
      'source_character_id',v_message.character_id::text,
      'request_user_id',p_user_id::text,
      'manager_user_id',v_manager_user_id::text,
      'original_message',v_after,
      'original_author_name',v_message.author_name,
      'room_title',v_room.title,
      'location_id',v_room.location_id,
      'campaign_day',v_room.campaign_day,
      'day_period',v_room.day_period,
      'source_created_at',v_message.created_at,
      'turn_revision_id',v_revision_id::text,
      'turn_revision_no',v_revision_no,
      'replay_mode',v_mode
    ),
    jsonb_build_object(
      'surface','game_chat_v1',
      'runtime_stage',11,
      'turn_revision_id',v_revision_id,
      'turn_revision_no',v_revision_no,
      'replay_mode',v_mode
    ),
    1,
    0
  )
  returning id,status into v_job_id,v_status;

  insert into private.ai_gm_turn_revisions(
    id,campaign_id,room_id,source_message_id,revision_no,job_id,
    parent_revision_id,replay_mode,source_body_before,source_body_after,
    state,created_by
  )
  values(
    v_revision_id,p_campaign_id,v_message.room_id,v_message.id,v_revision_no,v_job_id,
    case when v_active.id is not null then v_active.id else v_latest.id end,
    v_mode,v_before,v_after,'active',p_user_id
  );

  return jsonb_build_object(
    'job_id',v_job_id,
    'status',v_status,
    'room_id',v_message.room_id,
    'source_chat_message_id',v_message.id,
    'turn_revision_id',v_revision_id,
    'turn_revision_no',v_revision_no,
    'replay_mode',v_mode
  );
end;
$function$


-- Grok 4.5 test model: 500k context, text+image, selectable for campaign GM.
insert into public.ai_models (
  id, provider_key, model_key, display_name, enabled, is_base, gm_selectable,
  supports_tools, supports_json, supports_streaming, context_window, cost_tier,
  reasoning_tier, latency_tier, model_kind, access_scope, supports_vision,
  user_selectable, created_at, updated_at
)
values (
  gen_random_uuid(),
  'openai-compatible',
  'grok-4.5',
  'Grok 4.5',
  true,
  false,
  true,
  true,
  true,
  true,
  500000,
  2,
  5,
  2,
  'agent',
  'campaign',
  true,
  true,
  now(),
  now()
)
on conflict (model_key) do update
set display_name='Grok 4.5',
    enabled=true,
    gm_selectable=true,
    supports_tools=true,
    supports_json=true,
    supports_streaming=true,
    context_window=500000,
    cost_tier=2,
    reasoning_tier=5,
    latency_tier=2,
    model_kind='agent',
    access_scope='campaign',
    supports_vision=true,
    user_selectable=true,
    updated_at=now();
