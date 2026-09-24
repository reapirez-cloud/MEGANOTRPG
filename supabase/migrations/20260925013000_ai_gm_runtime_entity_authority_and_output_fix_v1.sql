-- AI GM runtime repair:
-- 1) allow published AI-GM output messages
-- 2) let the trusted service-role worker invoke canonical manager RPCs as the real GM/owner
-- 3) expose stale-running jobs as wakeable after the hosted Edge worker can no longer be alive

alter table public.chat_messages
  drop constraint if exists chat_messages_turn_component_check;

alter table public.chat_messages
  add constraint chat_messages_turn_component_check
  check (
    turn_component is null
    or turn_component in (
      'action',
      'bonus_action',
      'reaction',
      'movement',
      'description',
      'ai_gm_output'
    )
  );

create or replace function public.ai_gm_invoke_as_manager_v1(
  p_actor_user_id uuid,
  p_operation text,
  p_args jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_result jsonb;
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501', message='service_role_required';
  end if;

  if p_actor_user_id is null then
    raise exception 'actor_user_id_required';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);

  case p_operation
    when 'create_world_npc_v1' then
      v_result := public.create_world_npc_v1(
        (v_args->>'campaign_id')::uuid,
        coalesce(v_args->'input','{}'::jsonb)
      );
    when 'update_world_npc_v1' then
      v_result := public.update_world_npc_v1(
        (v_args->>'npc_character_id')::uuid,
        coalesce(v_args->'patch','{}'::jsonb)
      );
    when 'upsert_faction_v1' then
      v_result := public.upsert_faction_v1(
        (v_args->>'campaign_id')::uuid,
        coalesce(v_args->'input','{}'::jsonb)
      );
    when 'set_faction_membership_v1' then
      v_result := public.set_faction_membership_v1(
        (v_args->>'character_id')::uuid,
        (v_args->>'faction_id')::uuid,
        coalesce(v_args->'input','{}'::jsonb)
      );
    when 'set_character_faction_reputation_v1' then
      v_result := public.set_character_faction_reputation_v1(
        (v_args->>'character_id')::uuid,
        (v_args->>'faction_id')::uuid,
        coalesce(v_args->'input','{}'::jsonb)
      );
    when 'move_character_world_v1' then
      v_result := public.move_character_world_v1(
        (v_args->>'character_id')::uuid,
        (v_args->>'location_id')::uuid,
        nullif(v_args->>'campaign_day','')::integer,
        nullif(v_args->>'day_period','')
      );
    when 'manage_world_discovery_v1' then
      v_result := public.manage_world_discovery_v1(
        (v_args->>'character_id')::uuid,
        v_args->>'entity_type',
        (v_args->>'entity_id')::uuid,
        coalesce((v_args->>'discovered')::boolean,true),
        coalesce(nullif(v_args->>'source',''),'ai_gm')
      );
    when 'set_npc_zone_habitat' then
      perform public.set_npc_zone_habitat(
        (v_args->>'npc_character_id')::uuid,
        (v_args->>'location_id')::uuid,
        coalesce((v_args->>'attached')::boolean,true)
      );
      v_result := jsonb_build_object(
        'npc_character_id',v_args->>'npc_character_id',
        'location_id',v_args->>'location_id',
        'attached',coalesce((v_args->>'attached')::boolean,true),
        'canonical_state_changed',true
      );
    when 'upsert_location_transition_v1' then
      v_result := public.upsert_location_transition_v1(
        (v_args->>'source_location_id')::uuid,
        (v_args->>'target_location_id')::uuid,
        coalesce(v_args->'input','{}'::jsonb)
      );
    when 'delete_location_transition_v1' then
      v_result := public.delete_location_transition_v1(
        (v_args->>'link_id')::uuid
      );
    when 'upsert_location_secret_v1' then
      v_result := public.upsert_location_secret_v1(
        (v_args->>'location_id')::uuid,
        coalesce(v_args->'input','{}'::jsonb)
      );
    when 'set_location_secret_state_v1' then
      v_result := public.set_location_secret_state_v1(
        (v_args->>'secret_id')::uuid,
        v_args->>'status',
        coalesce(v_args->>'resolution_note','')
      );
    when 'read_active_quest_context_v1' then
      v_result := public.read_active_quest_context_v1(
        (v_args->>'character_id')::uuid
      );
    when 'read_quest_plan_v1' then
      v_result := public.read_quest_plan_v1(
        (v_args->>'quest_id')::uuid
      );
    when 'create_quest_plan_v1' then
      v_result := public.create_quest_plan_v1(
        (v_args->>'campaign_id')::uuid,
        coalesce(v_args->'input','{}'::jsonb)
      );
    when 'activate_quest_v1' then
      v_result := public.activate_quest_v1(
        (v_args->>'quest_id')::uuid
      );
    when 'materialize_quest_target_v1' then
      v_result := public.materialize_quest_target_v1(
        (v_args->>'quest_id')::uuid,
        v_args->>'target_key',
        coalesce(v_args->'input','{}'::jsonb)
      );
    when 'set_quest_condition_resolution_ai_v1' then
      v_result := public.set_quest_condition_resolution_ai_v1(
        (v_args->>'condition_id')::uuid,
        coalesce((v_args->>'satisfied')::boolean,false),
        coalesce(v_args->>'note','')
      );
    when 'resolve_quest_v1' then
      v_result := public.resolve_quest_v1(
        (v_args->>'quest_id')::uuid
      );
    when 'close_quest_v1' then
      v_result := public.close_quest_v1(
        (v_args->>'quest_id')::uuid,
        v_args->>'status',
        coalesce(v_args->>'note','')
      );
    else
      raise exception using errcode='22023', message='ai_gm_manager_operation_not_allowed';
  end case;

  return coalesce(v_result,'{}'::jsonb);
end;
$function$;

revoke all on function public.ai_gm_invoke_as_manager_v1(uuid,text,jsonb) from public;
revoke all on function public.ai_gm_invoke_as_manager_v1(uuid,text,jsonb) from anon;
revoke all on function public.ai_gm_invoke_as_manager_v1(uuid,text,jsonb) from authenticated;
grant execute on function public.ai_gm_invoke_as_manager_v1(uuid,text,jsonb) to service_role;

create or replace function public.get_ai_gm_room_status_v3(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid:=(select auth.uid());
  v_room public.chat_rooms%rowtype;
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_job public.agent_jobs%rowtype;
  v_can_recover boolean:=false;
  v_job_wake_required boolean:=false;
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
      'active',true,
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
      'runtime_stage',18,'stage18_version',3
    );
  end if;

  v_job_wake_required :=
    v_job.status='running'
    and v_job.updated_at < now() - interval '8 minutes';

  return jsonb_build_object(
    'active',v_job.status in ('queued','running','waiting_for_user','failed'),
    'phase',case
      when v_job.status='queued' then 'queued'
      when v_job.status='running' then coalesce(nullif(v_job.result->>'runtime_phase',''),'thinking')
      when v_job.status='waiting_for_user' then 'waiting_for_roll'
      when v_job.status='failed' then 'failed'
      when v_job.status='cancelled' then 'cancelled'
      else v_job.status
    end,
    'label',case
      when v_job.status='queued' then 'ИИ-ГМ запускается'
      when v_job.status='running' and v_job_wake_required then 'ИИ-ГМ перезапускает оборванный ход'
      when v_job.status='running' then 'ИИ-ГМ думает'
      when v_job.status='waiting_for_user' then 'ИИ-ГМ ждёт бросок'
      when v_job.status='failed' then 'Ошибка хода ИИ-ГМ'
      when v_job.status='cancelled' then 'Ход ИИ-ГМ отменён'
      else 'ИИ-ГМ: '||v_job.status
    end,
    'room_id',p_room_id,
    'campaign_id',v_job.campaign_id,
    'job_id',v_job.id,
    'job_status',v_job.status,
    'wake_required',v_job_wake_required,
    'error_code',v_job.error_code,
    'error_message',v_job.error_message,
    'updated_at',v_job.updated_at,
    'runtime_stage',18,
    'stage18_version',3
  );
end;
$function$;
