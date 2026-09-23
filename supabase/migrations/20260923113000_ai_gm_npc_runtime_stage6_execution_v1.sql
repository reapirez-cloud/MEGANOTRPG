-- AI GM Stage 6 execution hardening: canonical actor/location validation and optional targets.

create or replace function public.execute_ai_gm_npc_action_v2(
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
  v_job public.agent_jobs%rowtype;
  v_source_character_id uuid;
  v_source_location_id uuid;
  v_actor_location_id uuid;
  v_target_location_id uuid;
  v_mechanic jsonb;
  v_runtime jsonb;
  v_result jsonb;
  v_message_id bigint;
  v_target_type text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null or v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  if not exists(
    select 1
    from public.npc_runtime_builds b
    where b.character_id=p_npc_character_id
      and b.campaign_id=v_job.campaign_id
      and b.status='ready'
      and b.template_id is not null
  ) then
    raise exception 'npc_runtime_not_ready';
  end if;

  if not exists(
    select 1
    from public.characters c
    where c.id=p_npc_character_id
      and c.campaign_id=v_job.campaign_id
      and c.character_type='npc'
      and c.publication_state='campaign'
      and c.life_state='alive'
  ) then
    raise exception 'npc_action_actor_invalid';
  end if;

  v_source_character_id :=
    nullif(v_job.input->>'source_character_id','')::uuid;

  select ws.location_id into v_source_location_id
  from public.character_world_state ws
  where ws.character_id=v_source_character_id;

  if v_source_location_id is null then
    select r.location_id into v_source_location_id
    from public.chat_rooms r
    where r.id=nullif(v_job.input->>'room_id','')::uuid;
  end if;

  select ws.location_id into v_actor_location_id
  from public.character_world_state ws
  where ws.character_id=p_npc_character_id;

  if v_source_location_id is null
     or v_actor_location_id is null
     or v_source_location_id <> v_actor_location_id
  then
    raise exception 'npc_action_requires_same_location';
  end if;

  v_mechanic :=
    private.character_template_selected_action_definition_v1(
      p_npc_character_id,
      trim(coalesce(p_mechanic_id,''))
    );

  if v_mechanic is null
     or jsonb_typeof(v_mechanic->'npcRuntime') <> 'object'
  then
    raise exception 'npc_runtime_mechanic_not_found';
  end if;

  v_runtime := v_mechanic->'npcRuntime';

  if p_target_character_id is not null then
    select c.character_type,ws.location_id
      into v_target_type,v_target_location_id
    from public.characters c
    left join public.character_world_state ws
      on ws.character_id=c.id
    where c.id=p_target_character_id
      and c.campaign_id=v_job.campaign_id
      and c.life_state='alive';

    if v_target_type is null
       or v_target_location_id is null
       or v_target_location_id <> v_source_location_id
    then
      raise exception 'npc_action_target_not_present';
    end if;
  end if;

  if v_runtime->>'kind'='save_action' then
    if p_target_character_id is null then
      raise exception 'npc_save_action_requires_target';
    end if;
    if v_target_type <> 'pc' then
      raise exception 'npc_save_action_stage6_target_must_be_pc';
    end if;
    if nullif(v_runtime->>'saveAbility','') is null
       or coalesce(v_runtime->>'saveDc','') !~ '^[0-9]+$'
    then
      raise exception 'npc_save_action_runtime_invalid';
    end if;
  end if;

  v_result := public.execute_ai_gm_npc_action_v1(
    p_job_id,
    p_npc_character_id,
    p_mechanic_id,
    p_option_key
  );

  v_message_id := nullif(v_result->>'message_id','')::bigint;

  if v_message_id is not null then
    update public.chat_messages
    set event_payload=coalesce(event_payload,'{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'targetCharacterId',p_target_character_id,
        'npcRuntimeStage',6
      ))
    where id=v_message_id;
  end if;

  return v_result || jsonb_build_object(
    'target_character_id',p_target_character_id,
    'runtime_stage',6
  );
end;
$$;

revoke all on function public.execute_ai_gm_npc_action_v2(
  uuid,uuid,text,uuid,text
) from public,anon,authenticated;
grant execute on function public.execute_ai_gm_npc_action_v2(
  uuid,uuid,text,uuid,text
) to service_role;

create or replace function public.execute_ai_gm_npc_roll_v2(
  p_job_id uuid,
  p_npc_character_id uuid,
  p_request_type text,
  p_ability_key text,
  p_skill_key text,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_source_character_id uuid;
  v_source_location_id uuid;
  v_actor_location_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null or v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  if not exists(
    select 1
    from public.npc_runtime_builds b
    join public.characters c on c.id=b.character_id
    where b.character_id=p_npc_character_id
      and b.campaign_id=v_job.campaign_id
      and b.status='ready'
      and b.template_id is not null
      and c.character_type='npc'
      and c.publication_state='campaign'
      and c.life_state='alive'
  ) then
    raise exception 'npc_runtime_not_ready';
  end if;

  v_source_character_id :=
    nullif(v_job.input->>'source_character_id','')::uuid;

  select ws.location_id into v_source_location_id
  from public.character_world_state ws
  where ws.character_id=v_source_character_id;

  if v_source_location_id is null then
    select r.location_id into v_source_location_id
    from public.chat_rooms r
    where r.id=nullif(v_job.input->>'room_id','')::uuid;
  end if;

  select ws.location_id into v_actor_location_id
  from public.character_world_state ws
  where ws.character_id=p_npc_character_id;

  if v_source_location_id is null
     or v_actor_location_id is null
     or v_source_location_id <> v_actor_location_id
  then
    raise exception 'npc_roll_requires_same_location';
  end if;

  return public.execute_ai_gm_npc_roll_v1(
    p_job_id,
    p_npc_character_id,
    p_request_type,
    p_ability_key,
    p_skill_key,
    p_label
  ) || jsonb_build_object('runtime_stage',6);
end;
$$;

revoke all on function public.execute_ai_gm_npc_roll_v2(
  uuid,uuid,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.execute_ai_gm_npc_roll_v2(
  uuid,uuid,text,text,text,text
) to service_role;

comment on function public.execute_ai_gm_npc_action_v2(
  uuid,uuid,text,uuid,text
) is
  'Stage 6 canonical NPC action executor with same-location actor/target validation. Model supplies no numeric mechanics.';

comment on function public.execute_ai_gm_npc_roll_v2(
  uuid,uuid,text,text,text,text
) is
  'Stage 6 canonical NPC ability/save/skill roll executor with same-location validation.';
