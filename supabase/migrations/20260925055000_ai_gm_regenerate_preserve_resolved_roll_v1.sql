-- Allow prose regeneration after a resolved AI-GM player roll without rerolling canon.
-- The resolved roll and resolver receipts are inherited as locked mechanics.
-- Edit-and-resend and other irreversible effects retain the strict rollback contract.

CREATE OR REPLACE FUNCTION private.reserve_ai_gm_replay_preserving_roll_v1(p_campaign_id uuid, p_user_id uuid, p_source_chat_message_id bigint, p_mode text, p_edited_body text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$;
declare
  v_mode text := lower(trim(coalesce(p_mode,'')));
  v_message public.chat_messages%rowtype;
  v_room public.chat_rooms%rowtype;
  v_character public.characters%rowtype;
  v_active private.ai_gm_turn_revisions%rowtype;
  v_job public.agent_jobs%rowtype;
  v_roll public.pending_player_roll_requests%rowtype;
  v_other_irreversible integer := 0;
  v_revision_id uuid;
  v_revision_no integer;
  v_job_id uuid;
  v_status text;
  v_new_input jsonb;
  v_new_result jsonb;
begin
  if v_mode <> 'regenerate' then
    return private.reserve_ai_gm_revision_job_v1(
      p_campaign_id,p_user_id,p_source_chat_message_id,p_mode,p_edited_body
    );
  end if;

  if p_campaign_id is null
     or p_user_id is null
     or p_source_chat_message_id is null
  then
    raise exception 'campaign_user_source_required';
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

  select * into v_active
  from private.ai_gm_turn_revisions r
  where r.source_message_id=p_source_chat_message_id
    and r.state='active'
  for update;

  if v_active.id is null then
    return private.reserve_ai_gm_revision_job_v1(
      p_campaign_id,p_user_id,p_source_chat_message_id,p_mode,p_edited_body
    );
  end if;

  select * into v_job
  from public.agent_jobs
  where id=v_active.job_id
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_turn_job_not_found';
  end if;

  if v_job.status in ('queued','running','waiting_for_user') then
    return private.reserve_ai_gm_revision_job_v1(
      p_campaign_id,p_user_id,p_source_chat_message_id,p_mode,p_edited_body
    );
  end if;

  if coalesce(v_job.result->>'last_roll_request_id','') !~* '^[0-9a-f-]{36}$'
     or coalesce(v_job.result->>'last_roll_message_id','') !~ '^[0-9]+$'
     or jsonb_typeof(v_job.result->'last_roll_result') <> 'object'
  then
    return private.reserve_ai_gm_revision_job_v1(
      p_campaign_id,p_user_id,p_source_chat_message_id,p_mode,p_edited_body
    );
  end if;

  select * into v_roll
  from public.pending_player_roll_requests pr
  where pr.id=(v_job.result->>'last_roll_request_id')::uuid
    and pr.gm_job_id=v_job.id
    and pr.status='resolved'
    and pr.roll_message_id=(v_job.result->>'last_roll_message_id')::bigint
  for update;

  if v_roll.id is null then
    return private.reserve_ai_gm_revision_job_v1(
      p_campaign_id,p_user_id,p_source_chat_message_id,p_mode,p_edited_body
    );
  end if;

  perform private.sync_ai_gm_turn_ledger_v1(v_job.id);

  select count(*)::integer into v_other_irreversible
  from private.ai_gm_turn_effects fx
  where fx.revision_id=v_active.id
    and fx.rolled_back_at is null
    and fx.reversible=false
    and not (
      fx.effect_kind='pending_roll_request'
      and fx.effect_ref=v_roll.id::text
    );

  if v_other_irreversible>0 then
    return private.reserve_ai_gm_revision_job_v1(
      p_campaign_id,p_user_id,p_source_chat_message_id,p_mode,p_edited_body
    );
  end if;

  if private.ai_gm_turn_has_later_messages_v1(v_active.id) then
    raise exception 'ai_gm_turn_has_later_messages';
  end if;

  if exists(
    select 1
    from public.ai_gm_post_turn_commits c
    where c.parent_job_id=v_job.id
      and c.state in ('queued','running','completed')
  ) then
    raise exception 'ai_gm_regenerate_has_committed_post_turn_world_changes';
  end if;

  delete from public.chat_messages m
  where exists(
    select 1
    from private.ai_gm_turn_effects fx
    where fx.revision_id=v_active.id
      and fx.effect_kind='chat_message'
      and fx.effect_ref=m.id::text
      and fx.rolled_back_at is null
      and coalesce(fx.payload->>'turn_component','')='ai_gm_output'
  );

  update private.ai_gm_turn_effects fx
  set rolled_back_at=coalesce(fx.rolled_back_at,now())
  where fx.revision_id=v_active.id
    and fx.reversible=true
    and (
      (
        fx.effect_kind='chat_message'
        and coalesce(fx.payload->>'turn_component','')='ai_gm_output'
      )
      or (
        fx.effect_kind='campaign_event'
        and exists(
          select 1
          from private.ai_gm_turn_effects msgfx
          where msgfx.revision_id=v_active.id
            and msgfx.effect_kind='chat_message'
            and coalesce(msgfx.payload->>'turn_component','')='ai_gm_output'
            and msgfx.effect_ref=coalesce(fx.payload->>'source_id','')
        )
      )
    );

  update private.ai_gm_turn_revisions
  set state='superseded',
      updated_at=now(),
      superseded_at=now()
  where id=v_active.id;

  select coalesce(max(r.revision_no),0)+1
    into v_revision_no
  from private.ai_gm_turn_revisions r
  where r.source_message_id=p_source_chat_message_id;

  v_revision_id:=gen_random_uuid();

  v_new_input :=
    coalesce(v_job.input,'{}'::jsonb)
    || jsonb_build_object(
      'turn_revision_id',v_revision_id::text,
      'turn_revision_no',v_revision_no,
      'replay_mode','regenerate',
      'resume_chat_message_id',v_roll.roll_message_id::text,
      'replay_parent_job_id',v_job.id::text,
      'replay_inherited_roll_request_id',v_roll.id::text
    );

  v_new_result := jsonb_build_object(
    'surface','game_chat_v1',
    'runtime_stage',17,
    'turn_revision_id',v_revision_id,
    'turn_revision_no',v_revision_no,
    'replay_mode','regenerate',
    'replay_mechanics_locked',true,
    'inherited_from_job_id',v_job.id,
    'last_roll_request_id',v_roll.id,
    'last_roll_message_id',v_roll.roll_message_id,
    'last_roll_result',coalesce(v_job.result->'last_roll_result',v_roll.result,'{}'::jsonb),
    'inherited_scene_actor_tool_runs',
      case
        when jsonb_typeof(v_job.result->'scene_actor_tool_runs')='array'
          then v_job.result->'scene_actor_tool_runs'
        when jsonb_typeof(v_job.result->'inherited_scene_actor_tool_runs')='array'
          then v_job.result->'inherited_scene_actor_tool_runs'
        else '[]'::jsonb
      end
  );

  insert into public.agent_jobs(
    campaign_id,thread_id,requested_by,agent_key,job_type,status,input,result,
    requested_outputs,completed_outputs
  )
  values(
    p_campaign_id,
    v_job.thread_id,
    p_user_id,
    coalesce(nullif(v_job.agent_key,''),'voss'),
    'conversation_turn',
    'queued',
    v_new_input,
    v_new_result,
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
    v_active.id,'regenerate',v_message.body,v_message.body,'active',p_user_id
  );

  insert into private.ai_gm_turn_effects(
    revision_id,effect_kind,effect_ref,reversible,payload
  )
  select
    v_revision_id,
    fx.effect_kind,
    fx.effect_ref,
    false,
    fx.payload
  from private.ai_gm_turn_effects fx
  where fx.revision_id=v_active.id
    and fx.rolled_back_at is null
    and (
      (fx.effect_kind='pending_roll_request' and fx.effect_ref=v_roll.id::text)
      or (
        fx.effect_kind='chat_message'
        and fx.effect_ref in (
          coalesce(v_roll.request_message_id,0)::text,
          coalesce(v_roll.roll_message_id,0)::text
        )
      )
      or (
        fx.effect_kind='campaign_event'
        and coalesce(fx.payload->>'source_id','') in (
          coalesce(v_roll.request_message_id,0)::text,
          coalesce(v_roll.roll_message_id,0)::text
        )
      )
    )
  on conflict(revision_id,effect_kind,effect_ref)
  do update set
    reversible=false,
    payload=excluded.payload,
    rolled_back_at=null;

  return jsonb_build_object(
    'job_id',v_job_id,
    'status',v_status,
    'room_id',v_message.room_id,
    'source_chat_message_id',v_message.id,
    'turn_revision_id',v_revision_id,
    'turn_revision_no',v_revision_no,
    'replay_mode','regenerate',
    'mechanics_preserved',true,
    'inherited_roll_request_id',v_roll.id,
    'inherited_roll_message_id',v_roll.roll_message_id
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.reserve_ai_gm_replay_v1(p_campaign_id uuid, p_user_id uuid, p_source_chat_message_id bigint, p_mode text, p_edited_body text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$;
begin
  return private.reserve_ai_gm_replay_preserving_roll_v1(
    p_campaign_id,
    p_user_id,
    p_source_chat_message_id,
    p_mode,
    p_edited_body
  );
end;
$function$;


revoke all on function private.reserve_ai_gm_replay_preserving_roll_v1(uuid,uuid,bigint,text,text)
  from public, anon, authenticated;
grant execute on function private.reserve_ai_gm_replay_preserving_roll_v1(uuid,uuid,bigint,text,text)
  to service_role;

revoke all on function public.reserve_ai_gm_replay_v1(uuid,uuid,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_gm_replay_v1(uuid,uuid,bigint,text,text)
  to service_role;
