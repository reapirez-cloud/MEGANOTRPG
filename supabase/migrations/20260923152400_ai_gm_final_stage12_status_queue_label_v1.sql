-- AI GM Stage 12 UX correction: free-play queued jobs are not described
-- as waiting for a shared-scene queue unless they actually have a scene_key.

create or replace function public.get_ai_gm_room_status_v1(
  p_room_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.chat_rooms%rowtype;
  v_job public.agent_jobs%rowtype;
  v_media_status text;
  v_phase text;
  v_label text;
  v_scene_key text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_room
  from public.chat_rooms r
  where r.id=p_room_id;

  if v_room.id is null or not private.can_read_chat_room(p_room_id) then
    raise exception 'chat_room_read_required';
  end if;

  select * into v_job
  from public.agent_jobs j
  where j.campaign_id=v_room.campaign_id
    and j.job_type='conversation_turn'
    and j.input->>'surface'='game_chat_v1'
    and j.input->>'room_id'=p_room_id::text
  order by j.created_at desc,j.id desc
  limit 1;

  if v_job.id is null then
    return jsonb_build_object(
      'active',false,
      'phase','idle',
      'label','ИИ-ГМ готов',
      'room_id',p_room_id,
      'runtime_stage',12
    );
  end if;

  v_scene_key:=nullif(v_job.input->>'scene_key','');

  select l.status into v_media_status
  from private.ai_gm_media_lifecycle l
  where l.campaign_id=v_room.campaign_id
    and l.source_character_id=nullif(v_job.input->>'source_character_id','')::uuid
    and l.status in ('pending','queued','running')
    and l.updated_at>=v_job.created_at
  order by l.updated_at desc
  limit 1;

  v_phase:=case
    when v_job.status='queued' then 'queued'
    when v_job.status='running' then
      coalesce(nullif(v_job.result->>'runtime_phase',''),'thinking')
    when v_job.status='waiting_for_user' then 'waiting_for_roll'
    when v_job.status='failed' then 'failed'
    when v_job.status='cancelled' then 'cancelled'
    when v_job.status='completed' and v_media_status is not null then 'generating_art'
    when v_job.status='completed' then 'completed'
    else v_job.status
  end;

  v_label:=case
    when v_phase='queued' and v_scene_key is not null
      then 'ИИ-ГМ ждёт очередь общей сцены'
    when v_phase='queued'
      then 'ИИ-ГМ запускается'
    when v_phase='thinking' then 'ИИ-ГМ думает'
    when v_phase='applying' then 'ИИ-ГМ применяет изменения'
    when v_phase='waiting_for_roll' then 'ИИ-ГМ ждёт бросок'
    when v_phase='generating_art' then 'ИИ-ГМ генерирует арт'
    when v_phase='completed' then 'Ход ИИ-ГМ завершён'
    when v_phase='failed' then 'Ошибка хода ИИ-ГМ'
    when v_phase='cancelled' then 'Ход ИИ-ГМ отменён'
    else 'ИИ-ГМ: '||v_phase
  end;

  return jsonb_build_object(
    'active',v_phase in ('queued','thinking','applying','waiting_for_roll','generating_art'),
    'phase',v_phase,
    'label',v_label,
    'job_id',v_job.id,
    'job_status',v_job.status,
    'source_message_id',v_job.input->>'source_chat_message_id',
    'scene_key',v_scene_key,
    'scene_sequence',v_job.input->>'scene_sequence',
    'error_code',v_job.error_code,
    'error_message',v_job.error_message,
    'updated_at',v_job.updated_at,
    'runtime_stage',12
  );
end;
$$;
