
-- AI Survival Stage 3 database bridge:
-- deterministic post-turn executor operation + player status snapshot RPC.

create or replace function public.get_ai_survival_status_v1(
  p_character_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_character public.characters%rowtype;
  v_world public.character_world_state%rowtype;
  v_location_name text;
  v_pressure jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Anonymous accounts cannot read survival status';
  end if;

  select * into v_character
  from public.characters c
  where c.id=p_character_id;

  if v_character.id is null then
    raise exception 'character_not_found';
  end if;
  if not private.is_ai_world_campaign_v1(v_character.campaign_id) then
    raise exception 'survival_status_ai_world_only';
  end if;
  if v_character.assigned_user_id is distinct from auth.uid()
     and not private.can_manage_campaign(v_character.campaign_id,auth.uid())
  then
    raise exception 'survival_status_not_allowed';
  end if;

  select * into v_world
  from public.character_world_state ws
  where ws.character_id=p_character_id
    and ws.campaign_id=v_character.campaign_id;

  if v_world.location_id is not null then
    select l.name into v_location_name
    from public.locations l
    where l.id=v_world.location_id
      and l.campaign_id=v_character.campaign_id;
  end if;

  v_pressure:=private.resolve_character_survival_pressure_v1(p_character_id);

  return jsonb_build_object(
    'character_id',p_character_id,
    'campaign_id',v_character.campaign_id,
    'character_name',v_character.name,
    'location_id',v_world.location_id,
    'location_name',v_location_name,
    'campaign_minute',coalesce(v_world.campaign_minute,0),
    'campaign_day',coalesce(v_world.campaign_day,1),
    'day_period',coalesce(v_world.day_period,'day'),
    'survival',v_pressure
  );
end
$$;

revoke all on function public.get_ai_survival_status_v1(uuid)
  from public, anon;
grant execute on function public.get_ai_survival_status_v1(uuid)
  to authenticated, service_role;

create or replace function public.enqueue_ai_world_executor_job_v1(
  p_intent_id uuid,
  p_commit_lease_token uuid,
  p_intent_lease_token uuid,
  p_operation text,
  p_args jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_operation text := lower(btrim(coalesce(p_operation,'')));
  v_args jsonb := coalesce(p_args,'{}'::jsonb);
  v_job public.agent_jobs%rowtype;
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501', message='service_role_required';
  end if;
  if jsonb_typeof(v_args)<>'object' then
    raise exception using errcode='22023', message='executor_args_must_be_object';
  end if;

  select * into v_intent
  from public.ai_gm_post_turn_intent_receipts
  where id=p_intent_id
  for update;
  if v_intent.id is null then
    raise exception using errcode='22023', message='executor_intent_not_found';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=v_intent.commit_id
  for update;
  if v_commit.id is null then
    raise exception using errcode='22023', message='executor_commit_not_found';
  end if;

  if v_commit.state<>'running'
     or v_commit.lease_token is distinct from p_commit_lease_token
     or v_commit.lease_expires_at is null
     or v_commit.lease_expires_at<now()
  then
    raise exception using errcode='22023', message='executor_commit_lease_invalid';
  end if;

  if v_intent.state='completed' then
    return jsonb_build_object(
      'state','completed','replayed',true,'intent_id',v_intent.id,
      'tool_name',v_intent.tool_name,'tool_result',v_intent.tool_result
    );
  end if;

  if v_intent.state<>'running'
     or v_intent.lease_token is distinct from p_intent_lease_token
     or v_intent.lease_expires_at is null
     or v_intent.lease_expires_at<now()
  then
    raise exception using errcode='22023', message='executor_intent_lease_invalid';
  end if;

  if v_intent.kind='inventory' and v_operation<>'commit_inventory_delta' then
    raise exception using errcode='22023', message='executor_operation_not_allowed_for_kind';
  elsif v_intent.kind='location' and v_operation not in (
    'materialize_location_cascade','create_location','update_location',
    'set_location_archived','upsert_location_transition',
    'upsert_location_secret','set_location_secret_state'
  ) then
    raise exception using errcode='22023', message='executor_operation_not_allowed_for_kind';
  elsif v_intent.kind='npc' and v_operation not in (
    'create_world_npc','update_world_npc','set_npc_habitat',
    'move_character_world','set_character_life_state'
  ) then
    raise exception using errcode='22023', message='executor_operation_not_allowed_for_kind';
  elsif v_intent.kind='quest' and v_operation not in (
    'create_quest_plan','activate_quest','update_quest_brief',
    'bind_quest_target','materialize_quest_target',
    'resolve_quest_condition','close_quest'
  ) then
    raise exception using errcode='22023', message='executor_operation_not_allowed_for_kind';
  elsif v_intent.kind='memory' and v_operation<>'remember_campaign_fact' then
    raise exception using errcode='22023', message='executor_operation_not_allowed_for_kind';
  elsif v_intent.kind='canonical_state' and v_operation not in (
    'upsert_faction','set_faction_membership','set_character_faction_reputation',
    'move_character_world','set_world_discovery','set_character_life_state',
    'commit_survival_turn'
  ) then
    raise exception using errcode='22023', message='executor_operation_not_allowed_for_kind';
  elsif v_intent.kind='binding' and v_operation not in (
    'bind_quest_target','set_npc_habitat','upsert_location_transition',
    'set_faction_membership','set_world_discovery'
  ) then
    raise exception using errcode='22023', message='executor_operation_not_allowed_for_kind';
  end if;

  insert into public.agent_jobs(
    campaign_id,thread_id,requested_by,agent_key,job_type,status,
    input,result,requested_outputs,completed_outputs
  )
  values(
    v_commit.campaign_id,null,v_commit.manager_user_id,
    'ai_world_executor','canonical_mutation','queued',
    jsonb_build_object(
      'source_intent_id',v_intent.id,'source_commit_id',v_commit.id,
      'source_message_id',v_commit.source_message_id,
      'source_character_id',v_commit.source_character_id,
      'manager_user_id',v_commit.manager_user_id,
      'operation',v_operation,'arguments',v_args
    ),
    '{}'::jsonb,1,0
  )
  on conflict do nothing;

  select * into v_job
  from public.agent_jobs j
  where j.agent_key='ai_world_executor'
    and j.job_type='canonical_mutation'
    and j.input->>'source_intent_id'=v_intent.id::text
  order by j.created_at
  limit 1;

  if v_job.id is null then
    raise exception using errcode='22023', message='executor_job_enqueue_failed';
  end if;
  if v_job.input->>'operation' is distinct from v_operation
     or coalesce(v_job.input->'arguments','{}'::jsonb) is distinct from v_args
  then
    raise exception using errcode='22023', message='executor_job_contract_conflict';
  end if;

  return to_jsonb(v_job) || jsonb_build_object('executor_stage',27);
end
$$;

create or replace function public.execute_ai_world_executor_job_v1(
  p_job_id uuid,
  p_commit_lease_token uuid,
  p_intent_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  v_job public.agent_jobs%rowtype;
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_intent_id uuid;
  v_operation text;
  v_args jsonb;
  v_result jsonb := '{}'::jsonb;
  v_resolved_ids jsonb := '[]'::jsonb;
  v_location jsonb;
  v_inventory jsonb;
  v_item_id uuid;
  v_character_id uuid;
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501', message='service_role_required';
  end if;

  select * into v_job from public.agent_jobs where id=p_job_id for update;
  if v_job.id is null or v_job.agent_key<>'ai_world_executor'
     or v_job.job_type<>'canonical_mutation'
  then
    raise exception using errcode='22023', message='executor_job_not_found';
  end if;

  if v_job.status='completed' then
    return coalesce(v_job.result,'{}'::jsonb)
      || jsonb_build_object('state','completed','replayed',true,'executor_job_id',v_job.id);
  end if;
  if v_job.status not in ('queued','running') then
    raise exception using errcode='22023', message='executor_job_not_executable';
  end if;

  begin
    v_intent_id := nullif(v_job.input->>'source_intent_id','')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023', message='executor_source_intent_invalid';
  end;
  v_operation := lower(btrim(coalesce(v_job.input->>'operation','')));
  v_args := coalesce(v_job.input->'arguments','{}'::jsonb);

  select * into v_intent
  from public.ai_gm_post_turn_intent_receipts where id=v_intent_id for update;
  select * into v_commit
  from public.ai_gm_post_turn_commits where id=v_intent.commit_id for update;

  if v_intent.id is null or v_commit.id is null then
    raise exception using errcode='22023', message='executor_contract_missing';
  end if;
  if v_commit.state<>'running'
     or v_commit.lease_token is distinct from p_commit_lease_token
     or v_commit.lease_expires_at is null or v_commit.lease_expires_at<now()
  then
    raise exception using errcode='22023', message='executor_commit_lease_invalid';
  end if;
  if v_intent.state='completed' then
    update public.agent_jobs
    set status='completed',completed_outputs=1,
        result=jsonb_build_object(
          'state','completed','replayed',true,'intent_id',v_intent.id,
          'tool_name',v_intent.tool_name,'tool_result',v_intent.tool_result,
          'executor_stage',27,'executor_job_id',v_job.id
        ),
        completed_at=coalesce(completed_at,now()),updated_at=now()
    where id=v_job.id returning * into v_job;
    return v_job.result;
  end if;
  if v_intent.state<>'running'
     or v_intent.lease_token is distinct from p_intent_lease_token
     or v_intent.lease_expires_at is null or v_intent.lease_expires_at<now()
  then
    raise exception using errcode='22023', message='executor_intent_lease_invalid';
  end if;

  update public.agent_jobs
  set status='running',started_at=coalesce(started_at,now()),updated_at=now()
  where id=v_job.id;

  if v_operation='commit_inventory_delta' then
    v_result := public.ai_gm_commit_inventory_delta_v1(
      v_commit.campaign_id,v_commit.manager_user_id,v_commit.source_message_id,v_args
    );
    v_inventory:=coalesce(v_result->'inventory_result','{}'::jsonb);
    begin
      v_item_id:=coalesce(
        nullif(v_inventory->>'itemId','')::uuid,
        nullif(v_inventory->'after'->>'id','')::uuid
      );
    exception when invalid_text_representation then
      v_item_id:=null;
    end;
    if v_item_id is not null then v_resolved_ids:=jsonb_build_array(v_item_id); end if;

    update public.ai_gm_post_turn_intent_receipts
    set state='completed',lease_token=null,lease_expires_at=null,
        tool_name=v_operation,tool_arguments=v_args,tool_result=v_result,
        resolved_entity_ids=v_resolved_ids,last_error=null,
        completed_at=now(),updated_at=now()
    where id=v_intent.id;

  elsif v_operation='commit_survival_turn' then
    -- Character id is server-bound to the immutable commit source. The junior
    -- may describe mechanics, but cannot spend another PC's survival state.
    v_args:=v_args || jsonb_build_object(
      'character_id',v_commit.source_character_id
    );

    v_result:=public.ai_gm_commit_survival_turn_v1(
      v_commit.campaign_id,
      v_commit.manager_user_id,
      v_commit.source_message_id,
      v_args
    );
    v_character_id:=v_commit.source_character_id;
    v_resolved_ids:=jsonb_build_array(v_character_id);

    update public.ai_gm_post_turn_intent_receipts
    set state='completed',lease_token=null,lease_expires_at=null,
        tool_name=v_operation,tool_arguments=v_args,tool_result=v_result,
        resolved_entity_ids=v_resolved_ids,last_error=null,
        completed_at=now(),updated_at=now()
    where id=v_intent.id;

  elsif v_operation='materialize_location_cascade' then
    v_result := public.ai_gm_materialize_location_cascade_v1(
      v_commit.campaign_id,v_commit.manager_user_id,v_args
    );
    v_location:=coalesce(v_result->'location','{}'::jsonb);
    if nullif(v_location->>'id','') is not null then
      v_resolved_ids:=jsonb_build_array(v_location->>'id');
    end if;

    update public.ai_gm_post_turn_intent_receipts
    set state='completed',lease_token=null,lease_expires_at=null,
        tool_name=v_operation,tool_arguments=v_args,tool_result=v_result,
        resolved_entity_ids=v_resolved_ids,last_error=null,
        completed_at=now(),updated_at=now()
    where id=v_intent.id;

  else
    v_result := public.execute_ai_gm_post_turn_mutation_v3(
      v_intent.id,p_commit_lease_token,p_intent_lease_token,v_operation,v_args
    );
  end if;

  update public.agent_jobs
  set status='completed',completed_outputs=1,
      result=jsonb_build_object(
        'state','completed','executor_stage',27,'executor_job_id',v_job.id,
        'operation',v_operation,'mutation_result',v_result
      ),
      error_code=null,error_message=null,completed_at=now(),updated_at=now()
  where id=v_job.id returning * into v_job;

  return v_job.result;
end
$$;

comment on function public.get_ai_survival_status_v1(uuid) is
  'Player-facing AI-world status snapshot for exact time, location, hunger and fatigue.';
