-- A capacity refusal resolves the background intent without failing the GM turn.
-- The read-only projection gives the narrator authoritative free-space context.

create or replace function public.ai_gm_inventory_room_v1(p_campaign_id uuid,p_character_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare
  v_bags jsonb;
  v_free_hands integer;
  v_recent jsonb;
  v_role text:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'));
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501',message='service_role_required';
  end if;
  if not exists(select 1 from public.characters c where c.id=p_character_id
      and c.campaign_id=p_campaign_id) then
    raise exception using errcode='22023',message='inventory_character_unavailable';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',bag.id,'name',bag.name,'capacity',private.cheburashka_simple_container_capacity_v1(bag.id),
    'occupied',(select count(*) from public.character_inventory_items child
      where child.character_id=p_character_id and child.holder_item_id=bag.id),
    'allows_nested_containers',coalesce((private.cheburashka_inventory_profile_for_item_v1(bag.id)
      ->'container_profile'->>'allow_nested_containers')::boolean,true)
  ) order by bag.created_at,bag.id),'[]'::jsonb) into v_bags
  from (select * from public.character_inventory_items
    where character_id=p_character_id and category='container'
    order by created_at,id limit 32) bag
  where bag.character_id=p_character_id and bag.category='container'
    and (bag.placement_kind in ('hand','external','grid','legacy','root') or bag.equipped);

  select count(*) into v_free_hands from generate_series(0,1) hand(slot)
  where not exists(select 1 from public.character_inventory_items i
    where i.character_id=p_character_id and i.placement_kind='hand'
      and i.placement_index=hand.slot);

  select jsonb_build_object('source_message_id',c.source_message_id,
    'reason',i.tool_result->>'reason','message',i.tool_result->>'message')
  into v_recent
  from public.ai_gm_post_turn_commits c
  join public.ai_gm_post_turn_intent_receipts i on i.commit_id=c.id
  where c.campaign_id=p_campaign_id and c.source_character_id=p_character_id
    and i.kind='inventory' and i.tool_result->>'outcome'='no_space'
    and c.id=(select recent.id from public.ai_gm_post_turn_commits recent
      where recent.campaign_id=p_campaign_id and recent.source_character_id=p_character_id
      order by recent.source_message_id desc limit 1)
  order by c.source_message_id desc,i.id desc limit 1;

  return jsonb_build_object('bags',v_bags,'free_hands',v_free_hands,
    'recent_no_space',v_recent);
end;
$function$;
revoke all on function public.ai_gm_inventory_room_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_gm_inventory_room_v1(uuid,uuid) to service_role;

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
    -- A capacity refusal is an ordinary game outcome. The exception block rolls
    -- back every linked inventory delta and any registry definition created in
    -- the batch, while preserving the durable Executor/intent receipt below.
    begin
      v_result := public.ai_gm_commit_inventory_delta_v1(
        v_commit.campaign_id,v_commit.manager_user_id,v_commit.source_message_id,v_args
      );
    exception when sqlstate '22023' then
      if sqlerrm not like 'inventory_no_free_slot:%' then raise; end if;
      v_result := jsonb_build_object(
        'action',v_args->>'action','accepted',false,'outcome','no_space',
        'reason','inventory_no_free_slot',
        'message','Нет свободного места в сумке или руке. Предмет не взят.',
        'canonical_state_changed',false,'resolved_item_ids','[]'::jsonb
      );
    end;
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
