create or replace function public.control_active_ai_gm_turn_v1(
  p_campaign_id uuid,
  p_user_id uuid,
  p_job_id uuid,
  p_mode text,
  p_edited_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mode text := lower(trim(coalesce(p_mode,'')));
  v_job public.agent_jobs%rowtype;
  v_revision private.ai_gm_turn_revisions%rowtype;
  v_message public.chat_messages%rowtype;
  v_allowed boolean := false;
  v_can_control boolean := false;
  v_body text;
  v_new_job_id uuid;
  v_new_revision_id uuid;
  v_new_revision_no integer;
  v_new_input jsonb;
  v_has_post_turn boolean := false;
  v_runtime_phase text;
  v_before_body text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if p_campaign_id is null or p_user_id is null or p_job_id is null then
    raise exception 'campaign_user_job_required';
  end if;

  if v_mode not in ('inspect','cancel','edit_resend') then
    raise exception 'ai_gm_active_control_mode_invalid';
  end if;

  select * into v_job
  from public.agent_jobs j
  where j.id=p_job_id
    and j.campaign_id=p_campaign_id
    and j.job_type='conversation_turn'
    and j.input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_active_job_not_found';
  end if;

  select * into v_revision
  from private.ai_gm_turn_revisions r
  where r.job_id=v_job.id
  for update;

  if v_revision.id is null then
    raise exception 'ai_gm_active_revision_not_found';
  end if;

  select * into v_message
  from public.chat_messages m
  where m.id=v_revision.source_message_id
  for update;

  if v_message.id is null then
    raise exception 'source_chat_message_not_found';
  end if;

  v_allowed :=
    v_message.user_id is not distinct from p_user_id
    or private.can_manage_campaign(p_campaign_id,p_user_id);

  if not v_allowed then
    raise exception 'ai_gm_active_turn_control_denied';
  end if;

  select exists(
    select 1
    from public.ai_gm_post_turn_commits c
    where c.parent_job_id=v_job.id
      and c.state in ('queued','running','completed')
  ) into v_has_post_turn;

  v_runtime_phase := coalesce(nullif(v_job.result->>'runtime_phase',''),'thinking');

  v_can_control :=
    v_revision.state='active'
    and not v_has_post_turn
    and (
      v_job.status='queued'
      or (v_job.status='running' and v_runtime_phase='thinking')
    );

  if v_mode='inspect' then
    return jsonb_build_object(
      'job_id',v_job.id,
      'job_status',v_job.status,
      'runtime_phase',v_runtime_phase,
      'source_message_id',v_message.id,
      'source_body',v_message.body,
      'can_cancel',v_can_control,
      'can_edit',v_can_control,
      'blocked_reason',case
        when v_revision.state<>'active' then 'Ход уже закрыт.'
        when v_job.status='waiting_for_user' then 'ИИ-ГМ уже ответил запросом броска.'
        when v_job.status='running' and v_runtime_phase<>'thinking'
          then 'ИИ-ГМ уже применяет серверную механику; дождись завершения этой короткой стадии.'
        when v_job.status not in ('queued','running') then 'Ход уже завершён.'
        when v_has_post_turn then 'Уже началась синхронизация канона после ответа.'
        else null
      end,
      'runtime_stage',29
    );
  end if;

  if not v_can_control then
    raise exception 'ai_gm_active_turn_already_answered_or_applying';
  end if;

  update public.agent_jobs
  set status='cancelled',
      cancel_requested=true,
      error_code='user_cancelled_ai_gm_turn',
      error_message=case
        when v_mode='edit_resend' then 'Superseded by player edit before GM answer.'
        else 'Cancelled by player before GM answer.'
      end,
      result=coalesce(result,'{}'::jsonb) || jsonb_build_object(
        'runtime_phase','cancelled',
        'continuation_pending',false,
        'continuation_checkpoint',null,
        'cancelled_by_user_id',p_user_id,
        'cancelled_at',now(),
        'cancel_mode',v_mode
      ),
      completed_at=coalesce(completed_at,now()),
      updated_at=now()
  where id=v_job.id
    and (
      status='queued'
      or (
        status='running'
        and coalesce(nullif(result->>'runtime_phase',''),'thinking')='thinking'
      )
    );

  if not found then
    raise exception 'ai_gm_active_turn_control_race_lost';
  end if;

  perform private.rollback_ai_gm_turn_revision_v1(
    v_revision.id,
    case when v_mode='edit_resend' then 'superseded' else 'rolled_back' end,
    p_user_id,
    case
      when v_mode='edit_resend' then 'Player edited the source message before GM answer.'
      else 'Player cancelled GM generation before answer.'
    end
  );

  if v_mode='cancel' then
    return jsonb_build_object(
      'accepted',true,
      'mode','cancel',
      'job_id',v_job.id,
      'status','cancelled',
      'source_message_id',v_message.id,
      'runtime_stage',29
    );
  end if;

  v_body:=trim(coalesce(p_edited_body,''));
  if v_body='' then raise exception 'edited_message_empty'; end if;
  if char_length(v_body)>4000 then raise exception 'edited_message_too_long'; end if;

  v_before_body:=v_message.body;

  update public.chat_messages
  set body=v_body,
      edited_at=now()
  where id=v_message.id;

  select coalesce(max(r.revision_no),0)+1
    into v_new_revision_no
  from private.ai_gm_turn_revisions r
  where r.source_message_id=v_message.id;

  v_new_revision_id:=gen_random_uuid();

  v_new_input :=
    (
      coalesce(v_job.input,'{}'::jsonb)
      - 'resume_chat_message_id'
      - 'replay_parent_job_id'
      - 'replay_inherited_roll_request_id'
    )
    || jsonb_build_object(
      'original_message',v_body,
      'turn_revision_id',v_new_revision_id::text,
      'turn_revision_no',v_new_revision_no,
      'replay_mode','edit_resend'
    );

  insert into public.agent_jobs(
    campaign_id,thread_id,requested_by,agent_key,job_type,status,input,result,
    requested_outputs,completed_outputs,cancel_requested
  )
  values(
    p_campaign_id,
    v_job.thread_id,
    p_user_id,
    coalesce(nullif(v_job.agent_key,''),'voss'),
    'conversation_turn',
    'queued',
    v_new_input,
    jsonb_build_object(
      'surface','game_chat_v1',
      'runtime_stage',29,
      'runtime_phase','queued',
      'turn_revision_id',v_new_revision_id,
      'turn_revision_no',v_new_revision_no,
      'replay_mode','edit_resend',
      'edited_before_gm_answer',true,
      'superseded_job_id',v_job.id
    ),
    1,
    0,
    false
  )
  returning id into v_new_job_id;

  insert into private.ai_gm_turn_revisions(
    id,campaign_id,room_id,source_message_id,revision_no,job_id,
    parent_revision_id,replay_mode,source_body_before,source_body_after,
    state,created_by
  )
  values(
    v_new_revision_id,
    p_campaign_id,
    v_message.room_id,
    v_message.id,
    v_new_revision_no,
    v_new_job_id,
    v_revision.id,
    'edit_resend',
    v_before_body,
    v_body,
    'active',
    p_user_id
  );

  return jsonb_build_object(
    'accepted',true,
    'mode','edit_resend',
    'old_job_id',v_job.id,
    'job_id',v_new_job_id,
    'status','queued',
    'source_message_id',v_message.id,
    'source_body',v_body,
    'turn_revision_id',v_new_revision_id,
    'turn_revision_no',v_new_revision_no,
    'runtime_stage',29
  );
end;
$function$;

revoke all on function public.control_active_ai_gm_turn_v1(uuid,uuid,uuid,text,text) from public;
revoke all on function public.control_active_ai_gm_turn_v1(uuid,uuid,uuid,text,text) from anon;
revoke all on function public.control_active_ai_gm_turn_v1(uuid,uuid,uuid,text,text) from authenticated;
grant execute on function public.control_active_ai_gm_turn_v1(uuid,uuid,uuid,text,text) to service_role;
