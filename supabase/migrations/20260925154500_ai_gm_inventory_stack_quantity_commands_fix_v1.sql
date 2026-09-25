CREATE OR REPLACE FUNCTION public.ai_gm_commit_inventory_delta_v1(p_campaign_id uuid, p_actor_user_id uuid, p_source_message_id bigint, p_args jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_quantity integer;
  v_definition_id uuid;
  v_definition_revision integer;
  v_resolution jsonb;
  v_rev public.reference_definition_revisions%rowtype;
  v_stack_mode text;
  v_usage_mode text;
  v_category text;
  v_stack_max integer;
  v_remaining integer;
  v_chunk integer;
  v_step integer := 0;
  v_existing public.character_inventory_items%rowtype;
  v_command_id uuid;
  v_subcommand_id uuid;
  v_semantic_key text;
  v_input jsonb;
  v_op jsonb;
  v_results jsonb := '[]'::jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_receipt private.ai_gm_inventory_delta_receipts_v1%rowtype;
  v_result jsonb;
  v_batch_delta jsonb;
  v_batch_result jsonb;
  v_batch_results jsonb := '[]'::jsonb;
  v_batch_ids jsonb := '[]'::jsonb;
  v_batch_first_inventory_result jsonb := null;
  v_batch_changed boolean := false;
  v_batch_all_replayed boolean := true;
  v_batch_character_id text;
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501',message='service_role_required';
  end if;
  if p_campaign_id is null or p_actor_user_id is null or p_source_message_id is null then
    raise exception using errcode='22023',message='inventory_executor_identity_required';
  end if;
  if jsonb_typeof(v_args)<>'object' then
    raise exception using errcode='22023',message='inventory_executor_args_must_be_object';
  end if;
  if v_action='batch' then
    if jsonb_typeof(v_args->'deltas')<>'array'
       or jsonb_array_length(v_args->'deltas')<1
       or jsonb_array_length(v_args->'deltas')>16
    then
      raise exception using errcode='22023',message='inventory_executor_batch_deltas_invalid';
    end if;

    v_batch_character_id:=btrim(coalesce(v_args->>'character_id',''));
    if v_batch_character_id='' then
      raise exception using errcode='22023',message='inventory_executor_character_id_required';
    end if;

    for v_batch_delta in
      select value from jsonb_array_elements(v_args->'deltas')
    loop
      if jsonb_typeof(v_batch_delta)<>'object'
         or v_batch_delta ? 'deltas'
         or lower(btrim(coalesce(v_batch_delta->>'action',''))) not in ('grant','consume','remove')
      then
        raise exception using errcode='22023',message='inventory_executor_batch_delta_invalid';
      end if;

      if btrim(coalesce(v_batch_delta->>'character_id',''))='' then
        v_batch_delta:=v_batch_delta || jsonb_build_object(
          'character_id',v_batch_character_id
        );
      elsif btrim(v_batch_delta->>'character_id')<>v_batch_character_id then
        raise exception using errcode='22023',message='inventory_executor_batch_character_mismatch';
      end if;

      v_batch_result:=public.ai_gm_commit_inventory_delta_v1(
        p_campaign_id,p_actor_user_id,p_source_message_id,v_batch_delta
      );
      v_batch_results:=v_batch_results || jsonb_build_array(v_batch_result);
      v_batch_ids:=v_batch_ids || coalesce(v_batch_result->'resolved_item_ids','[]'::jsonb);
      v_batch_changed:=v_batch_changed
        or coalesce((v_batch_result->>'canonical_state_changed')::boolean,false);
      v_batch_all_replayed:=v_batch_all_replayed
        and coalesce((v_batch_result->>'replayed')::boolean,false);

      if v_batch_first_inventory_result is null then
        v_batch_first_inventory_result:=coalesce(
          v_batch_result->'inventory_result',
          '{}'::jsonb
        );
      end if;
    end loop;

    return jsonb_build_object(
      'action','batch',
      'character_id',v_batch_character_id,
      'delta_results',v_batch_results,
      'inventory_results',v_batch_results,
      'inventory_result',coalesce(v_batch_first_inventory_result,'{}'::jsonb),
      'resolved_item_ids',v_batch_ids,
      'canonical_state_changed',v_batch_changed,
      'replayed',v_batch_all_replayed
    );
  end if;

  if v_action not in ('grant','consume','remove') then
    raise exception using errcode='22023',message='inventory_executor_action_invalid';
  end if;

  begin
    v_character_id:=nullif(btrim(coalesce(v_args->>'character_id','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='inventory_executor_character_id_invalid';
  end;
  if v_character_id is null then
    raise exception using errcode='22023',message='inventory_executor_character_id_required';
  end if;
  if not exists(
    select 1 from public.characters c
    where c.id=v_character_id and c.campaign_id=p_campaign_id
  ) then
    raise exception using errcode='22023',message='inventory_executor_character_unavailable';
  end if;
  if not private.is_campaign_manager(p_campaign_id,p_actor_user_id) then
    raise exception using errcode='42501',message='campaign_manager_required';
  end if;

  perform set_config('request.jwt.claim.sub',p_actor_user_id::text,true);

  if v_action='grant' then
    if jsonb_typeof(v_item)<>'object' then
      raise exception using errcode='22023',message='inventory_executor_item_invalid';
    end if;
    v_quantity:=coalesce(
      nullif(v_item->>'quantity','')::integer,
      nullif(v_args->>'quantity','')::integer,1
    );
    if v_quantity<1 or v_quantity>100000 then
      raise exception using errcode='22023',message='inventory_executor_quantity_invalid';
    end if;

    v_resolution:=public.ai_gm_resolve_item_definition_v1(
      p_campaign_id,p_actor_user_id,v_item || jsonb_build_object('allow_create',true)
    );
    if v_resolution->>'state'<>'resolved' then
      raise exception using errcode='22023',message='inventory_executor_definition_not_resolved';
    end if;

    v_definition_id:=(v_resolution->>'definition_id')::uuid;
    v_definition_revision:=(v_resolution->>'definition_revision')::integer;
    select * into v_rev
    from public.reference_definition_revisions r
    where r.definition_id=v_definition_id and r.revision=v_definition_revision;
    if v_rev.definition_id is null then
      raise exception using errcode='22023',message='inventory_executor_definition_revision_missing';
    end if;

    v_stack_mode:=coalesce(v_rev.data->>'stack_mode','instance');
    v_usage_mode:=coalesce(v_rev.data->>'usage_mode','none');
    v_category:=coalesce(v_rev.data->>'category','other');
    v_stack_max:=case when v_stack_mode='stack'
      then coalesce(nullif(v_rev.data->'inventory_profile'->>'stack_max','')::integer,100000)
      else 1 end;

    v_semantic_key:=concat_ws(
      '|','stage27',p_campaign_id::text,p_source_message_id::text,'grant',
      v_character_id::text,v_definition_id::text,v_definition_revision::text,v_quantity::text
    );
    v_command_id:=md5(v_semantic_key)::uuid;

    select * into v_receipt
    from private.ai_gm_inventory_delta_receipts_v1 r
    where r.command_id=v_command_id;
    if v_receipt.command_id is not null then
      return v_receipt.result || jsonb_build_object('replayed',true);
    end if;

    v_remaining:=v_quantity;

    if v_stack_mode='stack' then
      for v_existing in
        select * from public.character_inventory_items i
        where i.character_id=v_character_id
          and i.definition_id=v_definition_id
          and i.definition_revision=v_definition_revision
          and i.stack_mode='stack'
          and i.quantity < v_stack_max
        order by i.created_at,i.id
        for update
      loop
        exit when v_remaining<=0;
        v_chunk:=least(v_remaining,v_stack_max-v_existing.quantity);
        if v_chunk<=0 then continue; end if;
        v_step:=v_step+1;
        v_subcommand_id:=md5(v_command_id::text||'|update|'||v_step::text)::uuid;
        v_op:=public.update_inventory_item_v2(
          v_character_id,v_existing.id,
          to_jsonb(v_existing) || jsonb_build_object(
            'quantity',v_existing.quantity+v_chunk
          ),
          v_existing.version,v_subcommand_id
        );
        v_results:=v_results || jsonb_build_array(v_op);
        v_ids:=v_ids || jsonb_build_array(coalesce(v_op->>'itemId',v_op->'after'->>'id'));
        v_remaining:=v_remaining-v_chunk;
      end loop;

      while v_remaining>0 loop
        v_chunk:=least(v_remaining,v_stack_max);
        v_step:=v_step+1;
        v_subcommand_id:=md5(v_command_id::text||'|create|'||v_step::text)::uuid;
        v_input:=jsonb_build_object(
          'name',v_rev.name,'quantity',v_chunk,'category',v_category,
          'definition_id',v_definition_id,
          'definition_revision',v_definition_revision,
          'stack_mode','stack','usage_mode',v_usage_mode
        );
        if jsonb_typeof(v_item->'item_state')='object' then
          v_input:=v_input||jsonb_build_object('item_state',v_item->'item_state');
        end if;
        v_op:=public.create_inventory_item_v3(
          v_character_id,v_input,null,v_subcommand_id
        );
        v_results:=v_results || jsonb_build_array(v_op);
        v_ids:=v_ids || jsonb_build_array(coalesce(v_op->>'itemId',v_op->'after'->>'id'));
        v_remaining:=v_remaining-v_chunk;
      end loop;
    else
      while v_remaining>0 loop
        v_step:=v_step+1;
        v_subcommand_id:=md5(v_command_id::text||'|instance|'||v_step::text)::uuid;
        v_input:=jsonb_build_object(
          'name',v_rev.name,'quantity',1,'category',v_category,
          'definition_id',v_definition_id,
          'definition_revision',v_definition_revision,
          'stack_mode','instance','usage_mode',v_usage_mode
        );
        if jsonb_typeof(v_item->'item_state')='object' then
          v_input:=v_input||jsonb_build_object('item_state',v_item->'item_state');
        end if;
        v_op:=public.create_inventory_item_v3(
          v_character_id,v_input,null,v_subcommand_id
        );
        v_results:=v_results || jsonb_build_array(v_op);
        v_ids:=v_ids || jsonb_build_array(coalesce(v_op->>'itemId',v_op->'after'->>'id'));
        v_remaining:=v_remaining-1;
      end loop;
    end if;

    v_result:=jsonb_build_object(
      'action','grant','character_id',v_character_id,'quantity',v_quantity,
      'definition',v_resolution,'definition_id',v_definition_id,
      'definition_revision',v_definition_revision,'command_id',v_command_id,
      'inventory_results',v_results,
      'inventory_result',coalesce(v_results->0,'{}'::jsonb),
      'resolved_item_ids',v_ids,'canonical_state_changed',true,'replayed',false
    );

    insert into private.ai_gm_inventory_delta_receipts_v1(
      command_id,campaign_id,source_message_id,character_id,action,
      definition_id,item_id,quantity,result
    ) values (
      v_command_id,p_campaign_id,p_source_message_id,v_character_id,'grant',
      v_definition_id,null,v_quantity,v_result
    );
    return v_result;
  end if;

  begin
    v_item_id:=nullif(btrim(coalesce(v_args->>'item_id','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='inventory_executor_item_id_invalid';
  end;
  if v_item_id is null then
    raise exception using errcode='22023',message='inventory_executor_item_id_required';
  end if;

  if v_action='consume' then
    v_quantity:=coalesce(nullif(v_args->>'quantity','')::integer,1);
    if v_quantity<1 then
      raise exception using errcode='22023',message='inventory_executor_consume_quantity_invalid';
    end if;
  else
    select quantity into v_quantity
    from public.character_inventory_items i
    where i.id=v_item_id and i.character_id=v_character_id;
    if v_quantity is null then
      raise exception using errcode='22023',message='inventory_executor_item_not_found';
    end if;
  end if;

  v_semantic_key:=concat_ws(
    '|','stage27',p_campaign_id::text,p_source_message_id::text,v_action,
    v_character_id::text,v_item_id::text,v_quantity::text
  );
  v_command_id:=md5(v_semantic_key)::uuid;

  select * into v_receipt
  from private.ai_gm_inventory_delta_receipts_v1 r
  where r.command_id=v_command_id;
  if v_receipt.command_id is not null then
    return v_receipt.result || jsonb_build_object('replayed',true);
  end if;

  select * into v_existing
  from public.character_inventory_items i
  where i.id=v_item_id and i.character_id=v_character_id
  for update;
  if v_existing.id is null then
    raise exception using errcode='22023',message='inventory_executor_item_not_found';
  end if;
  if v_quantity>v_existing.quantity then
    raise exception using errcode='22023',message='inventory_executor_consume_quantity_invalid';
  end if;

  v_subcommand_id:=md5(v_command_id::text||'|mutate')::uuid;
  if v_action='remove' or v_quantity=v_existing.quantity then
    v_op:=public.remove_inventory_item_v1(
      v_character_id,v_item_id,v_existing.version,v_subcommand_id
    );
  else
    v_op:=public.update_inventory_item_v2(
      v_character_id,v_item_id,
      to_jsonb(v_existing) || jsonb_build_object(
        'quantity',v_existing.quantity-v_quantity
      ),
      v_existing.version,v_subcommand_id
    );
  end if;

  v_result:=jsonb_build_object(
    'action',v_action,'character_id',v_character_id,'item_id',v_item_id,
    'quantity',v_quantity,'command_id',v_command_id,'inventory_result',v_op,
    'inventory_results',jsonb_build_array(v_op),
    'resolved_item_ids',jsonb_build_array(v_item_id),
    'canonical_state_changed',true,'replayed',false
  );

  insert into private.ai_gm_inventory_delta_receipts_v1(
    command_id,campaign_id,source_message_id,character_id,action,
    definition_id,item_id,quantity,result
  ) values (
    v_command_id,p_campaign_id,p_source_message_id,v_character_id,v_action,
    v_existing.definition_id,v_item_id,v_quantity,v_result
  );

  return v_result;
end;
$function$;

comment on function public.ai_gm_commit_inventory_delta_v1(uuid,uuid,bigint,jsonb) is
  'Stage 27 atomic inventory mutation. Supports single and batch deltas. Partial stack grant/consume preserves the existing canonical row and changes only quantity through Cheburashka inventory.update; whole-stack removal uses the remove command.';
