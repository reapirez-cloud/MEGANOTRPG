create or replace function public.get_ai_gm_room_status_v3(p_room_id uuid)
returns jsonb
language plpgsql
stable
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

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where room_id=p_room_id and state in ('queued','running','failed')
  order by created_at desc
  limit 1;

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

  select * into v_job
  from public.agent_jobs j
  where j.campaign_id=v_room.campaign_id
    and j.job_type='conversation_turn'
    and j.input->>'surface'='game_chat_v1'
    and j.input->>'room_id'=p_room_id::text
  order by j.created_at desc,j.id desc
  limit 1;

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

revoke all on function public.get_ai_gm_room_status_v3(uuid) from public;
grant execute on function public.get_ai_gm_room_status_v3(uuid) to authenticated;
