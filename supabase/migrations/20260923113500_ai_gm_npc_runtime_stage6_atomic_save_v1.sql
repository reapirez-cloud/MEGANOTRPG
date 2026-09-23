-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI GM Stage 6: execute a canonical NPC action and reserve its player save atomically.

create or replace function public.execute_ai_gm_npc_action_turn_v1(
  p_job_id uuid,
  p_npc_character_id uuid,
  p_mechanic_id text,
  p_target_character_id uuid default null,
  p_option_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_action jsonb;
  v_runtime jsonb;
  v_roll_request jsonb;
  v_save_dc integer;
  v_save_ability text;
  v_label text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  v_action := public.execute_ai_gm_npc_action_v2(
    p_job_id,
    p_npc_character_id,
    p_mechanic_id,
    p_target_character_id,
    p_option_key
  );

  v_runtime := coalesce(v_action->'runtime','{}'::jsonb);
  v_label := coalesce(nullif(v_action->>'label',''),'Способность NPC');

  if v_runtime->>'kind'='save_action' then
    if p_target_character_id is null then
      raise exception 'npc_save_action_requires_target';
    end if;

    v_save_ability := nullif(trim(coalesce(v_runtime->>'saveAbility','')),'');
    if v_save_ability is null
       or coalesce(v_runtime->>'saveDc','') !~ '^[0-9]+$'
    then
      raise exception 'npc_save_action_runtime_invalid';
    end if;

    v_save_dc := (v_runtime->>'saveDc')::integer;

    v_roll_request := public.create_ai_gm_player_roll_request_v1(
      p_job_id,
      p_target_character_id,
      'save',
      v_save_ability,
      null,
      null,
      left(v_label||': спасбросок',160),
      left('NPC использует '||v_label||'.',1200),
      v_save_dc,
      'hidden'
    );

    update public.agent_jobs
    set result=coalesce(result,'{}'::jsonb) || jsonb_build_object(
      'last_npc_action',v_action,
      'last_npc_action_mechanic_id',trim(p_mechanic_id),
      'runtime_stage',6
    ),
    updated_at=now()
    where id=p_job_id
      and status='waiting_for_user';

    return v_action || jsonb_build_object(
      'waiting_for_user',true,
      'roll_request',v_roll_request,
      'runtime_stage',6
    );
  end if;

  return v_action || jsonb_build_object(
    'waiting_for_user',false,
    'runtime_stage',6
  );
end;
$$;

revoke all on function public.execute_ai_gm_npc_action_turn_v1(
  uuid,uuid,text,uuid,text
) from public,anon,authenticated;
grant execute on function public.execute_ai_gm_npc_action_turn_v1(
  uuid,uuid,text,uuid,text
) to service_role;

comment on function public.execute_ai_gm_npc_action_turn_v1(
  uuid,uuid,text,uuid,text
) is
  'Stage 6 atomic NPC action + Stage 5 player-save reservation. Prevents an emitted NPC ability without its required hard-wait.';
