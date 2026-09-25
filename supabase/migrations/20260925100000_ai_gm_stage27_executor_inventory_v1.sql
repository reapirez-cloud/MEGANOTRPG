-- AI GM Stage 27: deterministic Executor + canonical inventory/economy commit.

alter table public.ai_gm_post_turn_intent_receipts
  drop constraint if exists ai_gm_post_turn_intent_receipts_kind_check;
alter table public.ai_gm_post_turn_intent_receipts
  add constraint ai_gm_post_turn_intent_receipts_kind_check
  check (kind in ('location','npc','quest','memory','canonical_state','binding','inventory'));

alter table public.agent_jobs
  drop constraint if exists agent_jobs_job_type_check;
alter table public.agent_jobs
  add constraint agent_jobs_job_type_check
  check (job_type in (
    'conversation_turn','image_generate','image_review','image_attach',
    'draft_create','draft_revise','draft_apply','mechanics_compile',
    'dev_patch','dev_test','dev_build','dev_preview','dev_deploy',
    'world_maintenance','npc_runtime_build','canonical_mutation'
  ));

create unique index if not exists agent_jobs_executor_source_intent_uidx
  on public.agent_jobs ((input->>'source_intent_id'))
  where agent_key='ai_world_executor'
    and job_type='canonical_mutation';

CREATE OR REPLACE FUNCTION public.finalize_ai_gm_turn_v3(p_job_id uuid, p_messages jsonb, p_post_turn_intents jsonb, p_result_patch jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.agent_jobs%rowtype;
  v_room_id uuid;
  v_manager_user_id uuid;
  v_source_character_id uuid;
  v_source_message_id bigint;
  v_messages jsonb := coalesce(p_messages,'[]'::jsonb);
  v_intents jsonb := coalesce(p_post_turn_intents,'[]'::jsonb);
  v_message jsonb;
  v_intent jsonb;
  v_message_index bigint;
  v_intent_index bigint;
  v_message_count integer;
  v_intent_count integer;
  v_kind text;
  v_body text;
  v_npc_id uuid;
  v_message_id bigint;
  v_message_ids jsonb := '[]'::jsonb;
  v_commit_id uuid;
  v_intent_key text;
  v_instruction text;
  v_evidence text;
  v_intent_fingerprint text;
  v_contract_fingerprint text;
  v_seen_keys text[] := '{}'::text[];
  v_result jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;
  if jsonb_typeof(v_messages)<>'array' then
    raise exception 'stage18_messages_must_be_array';
  end if;
  if jsonb_typeof(v_intents)<>'array' then
    raise exception 'stage18_intents_must_be_array';
  end if;
  if jsonb_typeof(coalesce(p_result_patch,'{}'::jsonb))<>'object' then
    raise exception 'stage18_result_patch_must_be_object';
  end if;

  v_message_count := jsonb_array_length(v_messages);
  v_intent_count := jsonb_array_length(v_intents);
  if v_message_count<1 or v_message_count>12 then
    raise exception 'stage18_message_count_invalid';
  end if;
  if v_intent_count>16 then
    raise exception 'stage18_intent_count_invalid';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_turn_not_found';
  end if;

  if v_job.status='completed'
     and coalesce((v_job.result->>'stage18_v3_finalized')::boolean,false)
  then
    return jsonb_build_object(
      'reply_message_ids',coalesce(v_job.result->'reply_message_ids','[]'::jsonb),
      'reply_message_id',v_job.result->'reply_message_id',
      'post_turn_commit_id',v_job.result->'post_turn_commit_id',
      'post_turn_state',coalesce(v_job.result->>'post_turn_state','idle'),
      'replayed',true,
      'runtime_stage',18,
      'stage18_version',3
    );
  end if;

  if v_job.status<>'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  begin
    v_room_id := nullif(v_job.input->>'room_id','')::uuid;
    v_manager_user_id := nullif(v_job.input->>'manager_user_id','')::uuid;
    v_source_character_id := nullif(v_job.input->>'source_character_id','')::uuid;
    v_source_message_id := nullif(v_job.input->>'source_chat_message_id','')::bigint;
  exception when invalid_text_representation then
    raise exception 'stage18_turn_identity_invalid';
  end;

  if v_room_id is null or v_manager_user_id is null
     or v_source_character_id is null or v_source_message_id is null
  then
    raise exception 'stage18_turn_identity_missing';
  end if;

  v_contract_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'job_id',p_job_id,
          'messages',v_messages,
          'post_turn_intents',v_intents
        )::text,'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  for v_message,v_message_index in
    select value,ordinality
    from jsonb_array_elements(v_messages) with ordinality
  loop
    if jsonb_typeof(v_message)<>'object' then
      raise exception 'stage18_message_invalid';
    end if;
    v_kind := lower(btrim(coalesce(v_message->>'kind','')));
    if v_kind not in ('narration','npc_dialogue') then
      raise exception 'stage18_message_kind_invalid';
    end if;
    v_body := btrim(coalesce(v_message->>'body',''));
    if length(v_body)<1 or length(v_body)>4000 then
      raise exception 'stage18_message_body_invalid';
    end if;
    begin
      v_npc_id := case
        when v_kind='npc_dialogue'
          then nullif(btrim(coalesce(v_message->>'npc_character_id','')),'')::uuid
        else null
      end;
    exception when invalid_text_representation then
      raise exception 'stage18_message_npc_invalid';
    end;

    v_message_id := public.publish_ai_gm_turn_message_v1(
      p_job_id,
      v_message_index::smallint,
      v_kind,
      v_npc_id,
      v_body
    );
    v_message_ids := v_message_ids || jsonb_build_array(v_message_id);
  end loop;

  if v_intent_count>0 then
    insert into public.ai_gm_post_turn_commits(
      campaign_id,room_id,parent_job_id,source_message_id,
      manager_user_id,source_character_id,reply_message_ids,
      published_messages,contract_fingerprint
    )
    values(
      v_job.campaign_id,v_room_id,p_job_id,v_source_message_id,
      v_manager_user_id,v_source_character_id,v_message_ids,
      v_messages,v_contract_fingerprint
    )
    returning id into v_commit_id;

    for v_intent,v_intent_index in
      select value,ordinality
      from jsonb_array_elements(v_intents) with ordinality
    loop
      if jsonb_typeof(v_intent)<>'object' then
        raise exception 'stage18_intent_invalid';
      end if;

      v_intent_key := lower(btrim(coalesce(v_intent->>'intent_key','')));
      v_kind := lower(btrim(coalesce(v_intent->>'kind','')));
      v_instruction := btrim(coalesce(v_intent->>'instruction',''));
      v_evidence := btrim(coalesce(v_intent->>'evidence',''));

      if v_intent_key !~ '^[a-z0-9][a-z0-9:_-]{0,119}$' then
        raise exception 'stage18_intent_key_invalid';
      end if;
      if v_intent_key=any(v_seen_keys) then
        raise exception 'stage18_intent_key_duplicate';
      end if;
      v_seen_keys := array_append(v_seen_keys,v_intent_key);

      if v_kind not in ('location','npc','quest','memory','canonical_state','binding','inventory') then
        raise exception 'stage18_intent_kind_invalid';
      end if;
      if length(v_instruction)<1 or length(v_instruction)>3000 then
        raise exception 'stage18_intent_instruction_invalid';
      end if;
      if length(v_evidence)>3000 then
        raise exception 'stage18_intent_evidence_invalid';
      end if;

      v_intent_fingerprint := encode(
        extensions.digest(
          convert_to(
            jsonb_build_object(
              'commit_id',v_commit_id,
              'intent_index',v_intent_index,
              'intent_key',v_intent_key,
              'kind',v_kind,
              'instruction',v_instruction,
              'evidence',v_evidence,
              'reply_message_ids',v_message_ids
            )::text,'UTF8'
          ),
          'sha256'
        ),
        'hex'
      );

      insert into public.ai_gm_post_turn_intent_receipts(
        commit_id,intent_index,intent_key,kind,instruction,evidence,intent_fingerprint
      )
      values(
        v_commit_id,v_intent_index::smallint,v_intent_key,v_kind,
        v_instruction,v_evidence,v_intent_fingerprint
      );
    end loop;
  end if;

  v_result :=
    coalesce(v_job.result,'{}'::jsonb)
    || coalesce(p_result_patch,'{}'::jsonb)
    || jsonb_build_object(
      'stage18_v3_finalized',true,
      'runtime_stage',18,
      'stage18_version',3,
      'reply_message_id',(v_message_ids->>(jsonb_array_length(v_message_ids)-1))::bigint,
      'reply_message_ids',v_message_ids,
      'post_turn_commit_id',v_commit_id,
      'post_turn_state',case when v_commit_id is null then 'idle' else 'queued' end,
      'post_turn_intent_count',v_intent_count
    );

  update public.agent_jobs
  set status='completed',
      completed_outputs=1,
      result=v_result,
      completed_at=now(),
      updated_at=now(),
      error_code=null,
      error_message=null
  where id=p_job_id and status='running';

  if not found then
    raise exception 'stage18_parent_job_completion_race';
  end if;

  return jsonb_build_object(
    'reply_message_ids',v_message_ids,
    'reply_message_id',(v_message_ids->>(jsonb_array_length(v_message_ids)-1))::bigint,
    'post_turn_commit_id',v_commit_id,
    'post_turn_state',case when v_commit_id is null then 'idle' else 'queued' end,
    'replayed',false,
    'runtime_stage',18,
    'stage18_version',3
  );
end;
$function$;

create or replace function public.ai_gm_commit_inventory_delta_v1(
  p_campaign_id uuid,
  p_actor_user_id uuid,
  p_source_message_id bigint,
  p_args jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  v_args jsonb := coalesce(p_args,'{}'::jsonb);
  v_action text := lower(btrim(coalesce(v_args->>'action','')));
  v_character_id uuid;
  v_item_id uuid;
  v_item jsonb := coalesce(v_args->'item','{}'::jsonb);
  v_name text;
  v_category text;
  v_currency_key text;
  v_quantity integer;
  v_definition_id uuid;
  v_existing public.character_inventory_items%rowtype;
  v_command_id uuid;
  v_semantic_key text;
  v_input jsonb;
  v_result jsonb;
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501', message='service_role_required';
  end if;
  if p_campaign_id is null or p_actor_user_id is null or p_source_message_id is null then
    raise exception using errcode='22023', message='inventory_executor_identity_required';
  end if;
  if jsonb_typeof(v_args)<>'object' then
    raise exception using errcode='22023', message='inventory_executor_args_must_be_object';
  end if;
  if v_action not in ('grant','consume','remove') then
    raise exception using errcode='22023', message='inventory_executor_action_invalid';
  end if;

  begin
    v_character_id := nullif(btrim(coalesce(v_args->>'character_id','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023', message='inventory_executor_character_id_invalid';
  end;
  if v_character_id is null then
    raise exception using errcode='22023', message='inventory_executor_character_id_required';
  end if;
  if not exists(
    select 1 from public.characters c
    where c.id=v_character_id and c.campaign_id=p_campaign_id
  ) then
    raise exception using errcode='22023', message='inventory_executor_character_unavailable';
  end if;
  if not private.is_campaign_manager(p_campaign_id,p_actor_user_id) then
    raise exception using errcode='42501', message='campaign_manager_required';
  end if;

  perform set_config('request.jwt.claim.sub',p_actor_user_id::text,true);

  if v_action='grant' then
    if jsonb_typeof(v_item)<>'object' then
      raise exception using errcode='22023', message='inventory_executor_item_invalid';
    end if;
    v_currency_key := lower(btrim(coalesce(v_item->>'currency_key','')));
    if v_currency_key<>'' and v_currency_key not in ('cp','sp','ep','gp','pp') then
      raise exception using errcode='22023', message='inventory_executor_currency_key_invalid';
    end if;

    v_name := left(btrim(coalesce(v_item->>'name','')),160);
    if v_currency_key='cp' then v_name:='Медная монета';
    elsif v_currency_key='sp' then v_name:='Серебряная монета';
    elsif v_currency_key='ep' then v_name:='Электрумная монета';
    elsif v_currency_key='gp' then v_name:='Золотая монета';
    elsif v_currency_key='pp' then v_name:='Платиновая монета';
    end if;
    if v_name='' then
      raise exception using errcode='22023', message='inventory_executor_item_name_required';
    end if;

    v_category := lower(btrim(coalesce(v_item->>'category','other')));
    if v_currency_key<>'' then v_category:='currency'; end if;
    if v_category not in (
      'equipment','consumable','tool','book','trinket','quest',
      'material','currency','container','other'
    ) then
      raise exception using errcode='22023', message='inventory_executor_category_invalid';
    end if;

    v_quantity := coalesce(nullif(v_item->>'quantity','')::integer,1);
    if v_quantity<1 or v_quantity>1000000 then
      raise exception using errcode='22023', message='inventory_executor_quantity_invalid';
    end if;

    begin
      v_definition_id := nullif(btrim(coalesce(v_item->>'definition_id','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode='22023', message='inventory_executor_definition_id_invalid';
    end;

    v_semantic_key := concat_ws(
      '|','stage27',p_campaign_id::text,p_source_message_id::text,'grant',
      v_character_id::text,
      coalesce(nullif(v_currency_key,''),lower(v_name)),
      v_category,
      coalesce(v_definition_id::text,''),
      v_quantity::text
    );
    v_command_id := md5(v_semantic_key)::uuid;

    if v_category='currency'
       or lower(btrim(coalesce(v_item->>'stack_mode','')))='bulk_stack'
    then
      select * into v_existing
      from public.character_inventory_items i
      where i.character_id=v_character_id
        and i.category=v_category
        and i.stack_mode='bulk_stack'
        and (
          (v_definition_id is not null and i.definition_id=v_definition_id)
          or
          (v_definition_id is null and lower(btrim(i.name))=lower(v_name))
        )
      order by i.created_at
      limit 1
      for update;
    end if;

    if v_existing.id is not null then
      v_result := public.update_inventory_item_v3(
        v_character_id,
        v_existing.id,
        jsonb_build_object('quantity',v_existing.quantity+v_quantity),
        null,
        v_existing.version,
        v_command_id
      );
    else
      v_input := v_item
        - 'currency_key'
        || jsonb_build_object(
          'name',v_name,
          'category',v_category,
          'quantity',v_quantity
        );
      if v_category='currency' then
        v_input := v_input || jsonb_build_object(
          'stack_mode','bulk_stack',
          'usage_mode','quantity'
        );
      end if;
      v_result := public.create_inventory_item_v3(
        v_character_id,
        v_input,
        null,
        v_command_id
      );
    end if;

    return jsonb_build_object(
      'action','grant',
      'character_id',v_character_id,
      'quantity',v_quantity,
      'currency_key',nullif(v_currency_key,''),
      'command_id',v_command_id,
      'inventory_result',v_result,
      'canonical_state_changed',true
    );
  end if;

  begin
    v_item_id := nullif(btrim(coalesce(v_args->>'item_id','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023', message='inventory_executor_item_id_invalid';
  end;
  if v_item_id is null then
    raise exception using errcode='22023', message='inventory_executor_item_id_required';
  end if;

  select * into v_existing
  from public.character_inventory_items i
  where i.id=v_item_id and i.character_id=v_character_id
  for update;
  if v_existing.id is null then
    raise exception using errcode='22023', message='inventory_executor_item_not_found';
  end if;

  if v_action='remove' then
    v_quantity:=v_existing.quantity;
  else
    v_quantity:=coalesce(nullif(v_args->>'quantity','')::integer,1);
  end if;
  if v_quantity<1 or v_quantity>v_existing.quantity then
    raise exception using errcode='22023', message='inventory_executor_consume_quantity_invalid';
  end if;

  v_semantic_key := concat_ws(
    '|','stage27',p_campaign_id::text,p_source_message_id::text,v_action,
    v_character_id::text,v_item_id::text,v_quantity::text
  );
  v_command_id:=md5(v_semantic_key)::uuid;

  if v_quantity=v_existing.quantity then
    v_result:=public.remove_inventory_item_v1(
      v_character_id,v_item_id,v_existing.version,v_command_id
    );
  else
    v_result:=public.update_inventory_item_v3(
      v_character_id,
      v_item_id,
      jsonb_build_object('quantity',v_existing.quantity-v_quantity),
      null,
      v_existing.version,
      v_command_id
    );
  end if;

  return jsonb_build_object(
    'action',v_action,
    'character_id',v_character_id,
    'item_id',v_item_id,
    'quantity',v_quantity,
    'command_id',v_command_id,
    'inventory_result',v_result,
    'canonical_state_changed',true
  );
end;
$function$;

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
set search_path=''
as $function$
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
    'move_character_world','set_world_discovery','set_character_life_state'
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
end;
$function$;

create or replace function public.execute_ai_world_executor_job_v1(
  p_job_id uuid,
  p_commit_lease_token uuid,
  p_intent_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
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
end;
$function$;

create or replace function public.fail_ai_world_executor_job_v1(
  p_job_id uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  v_job public.agent_jobs%rowtype;
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501', message='service_role_required';
  end if;
  update public.agent_jobs
  set status=case when status='completed' then status else 'failed' end,
      error_code=case when status='completed' then error_code else 'executor_mutation_failed' end,
      error_message=case when status='completed' then error_message else left(coalesce(p_error,'executor_mutation_failed'),4000) end,
      completed_at=case when status='completed' then completed_at else now() end,
      updated_at=now()
  where id=p_job_id and agent_key='ai_world_executor'
    and job_type='canonical_mutation'
  returning * into v_job;
  if v_job.id is null then
    raise exception using errcode='22023', message='executor_job_not_found';
  end if;
  return to_jsonb(v_job) || jsonb_build_object('executor_stage',27);
end;
$function$;

revoke all on function public.ai_gm_commit_inventory_delta_v1(uuid,uuid,bigint,jsonb)
  from public,anon,authenticated;
grant execute on function public.ai_gm_commit_inventory_delta_v1(uuid,uuid,bigint,jsonb)
  to service_role;
revoke all on function public.enqueue_ai_world_executor_job_v1(uuid,uuid,uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.enqueue_ai_world_executor_job_v1(uuid,uuid,uuid,text,jsonb)
  to service_role;
revoke all on function public.execute_ai_world_executor_job_v1(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.execute_ai_world_executor_job_v1(uuid,uuid,uuid)
  to service_role;
revoke all on function public.fail_ai_world_executor_job_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.fail_ai_world_executor_job_v1(uuid,text)
  to service_role;

comment on function public.ai_gm_commit_inventory_delta_v1(uuid,uuid,bigint,jsonb) is
  'Stage 27 service-only canonical inventory delta with Cheburashka command-id idempotency keyed to the source player message.';
comment on function public.enqueue_ai_world_executor_job_v1(uuid,uuid,uuid,text,jsonb) is
  'Stage 27 converts one Junior post-turn plan into one typed deterministic Executor job.';
comment on function public.execute_ai_world_executor_job_v1(uuid,uuid,uuid) is
  'Stage 27 deterministic Executor: no LLM decisions, only an already planned typed canonical mutation.';
