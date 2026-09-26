-- Keep AI-GM room status bound to the latest conversation turn.
-- Historical failed post-turn commits remain audit history and must not shadow
-- a newer successful/regenerated turn. Superseded revisions cannot be retried.

create or replace function public.get_ai_gm_room_status_v3(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.chat_rooms%rowtype;
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_job public.agent_jobs%rowtype;
  v_can_recover boolean := false;
  v_job_wake_required boolean := false;
  v_continuation_pending boolean := false;
  v_continuation_attempt integer := 0;
  v_pending_roll_request_id uuid := null;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;

  select * into v_room from public.chat_rooms where id=p_room_id;
  if v_room.id is null or not private.can_read_chat_room(p_room_id) then
    raise exception 'chat_room_read_required';
  end if;

  perform private.recover_stale_ai_gm_post_turn_room_v1(p_room_id);

  select * into v_job
  from public.agent_jobs j
  where j.campaign_id=v_room.campaign_id
    and j.job_type='conversation_turn'
    and j.input->>'surface'='game_chat_v1'
    and j.input->>'room_id'=p_room_id::text
  order by j.created_at desc,j.id desc
  limit 1;

  if v_job.id is not null then
    select * into v_commit
    from public.ai_gm_post_turn_commits c
    where c.parent_job_id=v_job.id
      and c.room_id=p_room_id
      and c.state in ('queued','running','failed')
    order by c.created_at desc
    limit 1;
  end if;

  if v_commit.id is not null then
    v_can_recover :=
      v_commit.state='failed'
      and private.can_manage_campaign(v_commit.campaign_id,v_user_id);

    return jsonb_build_object(
      'active',v_commit.state in ('queued','running'),
      'phase',case when v_commit.state='failed' then 'post_turn_failed' else 'post_turn_commit' end,
      'label',case when v_commit.state='failed'
        then 'Синхронизация мира не завершилась'
        else 'Младший шуршит…'
      end,
      'room_id',p_room_id,
      'campaign_id',v_commit.campaign_id,
      'commit_id',v_commit.id,
      'commit_state',v_commit.state,
      'attempts',v_commit.attempts,
      'max_attempts',v_commit.max_attempts,
      'can_recover',v_can_recover,
      'wake_required',(
        v_commit.state='queued'
        or (
          v_commit.state='running'
          and v_commit.lease_expires_at is not null
          and v_commit.lease_expires_at<now()
        )
      ),
      'pending_roll_request_id',null,
      'error_code',case when v_commit.state='failed' then 'stage18_post_turn_commit_failed' else null end,
      'error_message',v_commit.last_error,
      'updated_at',v_commit.updated_at,
      'lease_expires_at',v_commit.lease_expires_at,
      'runtime_stage',18,
      'stage18_version',3
    );
  end if;

  if v_job.id is null or v_job.status='completed' then
    return jsonb_build_object(
      'active',false,'phase','idle','label','ИИ-ГМ готов',
      'room_id',p_room_id,'campaign_id',v_room.campaign_id,
      'runtime_stage',18,'stage18_version',3,
      'continuation_version',1,
      'pending_roll_request_id',null,
      'auto_roll_version',1
    );
  end if;

  if v_job.status='waiting_for_user' then
    select r.id into v_pending_roll_request_id
    from public.pending_player_roll_requests r
    join public.characters c on c.id=r.character_id
    where r.gm_job_id=v_job.id
      and r.status='pending'
      and c.assigned_user_id=v_user_id
      and c.life_state='alive'
    order by r.sequence_no desc,r.created_at desc
    limit 1;
  end if;

  v_continuation_pending := v_job.result->'continuation_pending' = 'true'::jsonb;
  v_continuation_attempt := case
    when coalesce(v_job.result->>'provider_continuation_count','') ~ '^[0-9]+$'
      then (v_job.result->>'provider_continuation_count')::integer
    else 0
  end;

  v_job_wake_required :=
    v_job.status='queued'
    or (
      v_job.status='running'
      and v_job.updated_at < now() - interval '3 minutes'
    );

  return jsonb_build_object(
    'active',v_job.status in ('queued','running','waiting_for_user'),
    'phase',case
      when v_job.status='queued' then 'queued'
      when v_job.status='running' then coalesce(nullif(v_job.result->>'runtime_phase',''),'thinking')
      when v_job.status='waiting_for_user' then 'waiting_for_roll'
      when v_job.status='failed' then 'failed'
      when v_job.status='cancelled' then 'cancelled'
      else v_job.status
    end,
    'label',case
      when v_job.status='queued' and v_continuation_pending then 'ИИ-ГМ продолжает оборванный ход'
      when v_job.status='queued' then 'ИИ-ГМ запускается'
      when v_job.status='running' and v_job_wake_required then 'ИИ-ГМ перезапускает оборванный ход'
      when v_job.status='running' then 'ИИ-ГМ думает'
      when v_job.status='waiting_for_user' and v_pending_roll_request_id is not null
        then 'ИИ-ГМ запросил бросок · бросаем автоматически'
      when v_job.status='waiting_for_user' then 'ИИ-ГМ ждёт бросок игрока'
      when v_job.status='failed' then 'Ошибка хода ИИ-ГМ'
      when v_job.status='cancelled' then 'Ход ИИ-ГМ отменён'
      else 'ИИ-ГМ: '||v_job.status
    end,
    'room_id',p_room_id,
    'campaign_id',v_job.campaign_id,
    'job_id',v_job.id,
    'job_status',v_job.status,
    'wake_required',v_job_wake_required,
    'pending_roll_request_id',v_pending_roll_request_id,
    'auto_roll_available',v_pending_roll_request_id is not null,
    'continuation_pending',v_continuation_pending,
    'continuation_attempt',v_continuation_attempt,
    'continuation_max_attempts',2,
    'error_code',v_job.error_code,
    'error_message',v_job.error_message,
    'updated_at',v_job.updated_at,
    'runtime_stage',18,
    'stage18_version',3,
    'continuation_version',1,
    'auto_roll_version',1
  );
end;
$function$;

create or replace function public.retry_ai_gm_post_turn_commit_v3(p_commit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_revision private.ai_gm_turn_revisions%rowtype;
  v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'auth_required'; end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then raise exception 'stage18_commit_not_found'; end if;
  if not private.can_manage_campaign(v_commit.campaign_id,v_user_id) then
    raise exception 'campaign_manage_required';
  end if;
  if v_commit.state<>'failed' then raise exception 'stage18_commit_not_failed'; end if;

  select * into v_revision
  from private.ai_gm_turn_revisions r
  where r.job_id=v_commit.parent_job_id
  order by r.revision_no desc
  limit 1;

  if v_revision.id is null or v_revision.state<>'active' then
    raise exception 'stage18_commit_superseded';
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state=case when state in ('completed','skipped') then state else 'pending' end,
      attempts=case when state in ('completed','skipped') then attempts else 0 end,
      lease_token=null,
      lease_expires_at=null,
      last_error=case when state in ('completed','skipped') then last_error else null end,
      updated_at=now()
  where commit_id=p_commit_id;

  update public.ai_gm_post_turn_commits
  set state='queued',
      attempts=0,
      lease_token=null,
      lease_expires_at=null,
      last_error=null,
      updated_at=now()
  where id=p_commit_id
  returning * into v_commit;

  update public.agent_jobs
  set result=coalesce(result,'{}'::jsonb)
      || jsonb_build_object(
        'post_turn_state','queued',
        'post_turn_commit_id',p_commit_id,
        'post_turn_error',null,
        'runtime_stage',18,
        'stage18_version',3
      ),
      updated_at=now()
  where id=v_commit.parent_job_id;

  return jsonb_build_object(
    'commit_id',v_commit.id,'state',v_commit.state,
    'room_id',v_commit.room_id,'runtime_stage',18,'stage18_version',3
  );
end;
$function$;
