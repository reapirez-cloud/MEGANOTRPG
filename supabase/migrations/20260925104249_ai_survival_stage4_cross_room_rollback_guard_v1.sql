CREATE OR REPLACE FUNCTION private.rollback_ai_survival_receipt_v1(p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_receipt private.ai_survival_turn_receipts_v1%rowtype;
  v_revision private.ai_gm_turn_revisions%rowtype;
  v_before jsonb;
  v_row jsonb;
  v_character_ids uuid[];
  v_item_id uuid;
begin
  select * into v_receipt
  from private.ai_survival_turn_receipts_v1 r
  where r.command_id=p_command_id
  for update;

  if v_receipt.command_id is null then
    raise exception using errcode='22023',message='survival_rollback_receipt_not_found';
  end if;

  if v_receipt.rolled_back_at is not null then
    return jsonb_build_object(
      'command_id',v_receipt.command_id,
      'revision_id',v_receipt.revision_id,
      'rolled_back',true,
      'replayed',true
    );
  end if;

  select * into v_revision
  from private.ai_gm_turn_revisions r
  where r.id=v_receipt.revision_id;

  if v_revision.id is null then
    raise exception using errcode='22023',message='survival_rollback_revision_missing';
  end if;

  v_before:=coalesce(v_receipt.before_state,'{}'::jsonb);
  v_character_ids:=coalesce(v_receipt.participant_character_ids,'{}'::uuid[]);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ai-survival-rollback:'||v_receipt.revision_id::text,
      0
    )
  );

  -- Stage 11 checks later messages only inside the source room. A co-op PC may
  -- already have advanced through another room, so never rewind a participant
  -- through a later active survival revision.
  if exists(
    select 1
    from private.ai_survival_turn_receipts_v1 later
    join private.ai_gm_turn_revisions lr on lr.id=later.revision_id
    where later.command_id<>v_receipt.command_id
      and later.rolled_back_at is null
      and lr.state='active'
      and lr.created_at>v_revision.created_at
      and later.participant_character_ids && v_character_ids
  ) then
    raise exception using
      errcode='55000',
      message='survival_rollback_has_later_participant_turn';
  end if;

  perform set_config('meganot.party_time_sync','on',true);

  if nullif(v_before#>>'{room,id}','') is not null then
    update public.chat_rooms r
    set campaign_minute=(v_before#>>'{room,campaign_minute}')::bigint,
        updated_at=now()
    where r.id=(v_before#>>'{room,id}')::uuid
      and r.campaign_id=v_receipt.campaign_id;
  end if;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'world','[]'::jsonb))
  loop
    update public.character_world_state ws
    set campaign_minute=(v_row->>'campaign_minute')::bigint,
        updated_at=now(),
        updated_by=null
    where ws.campaign_id=v_receipt.campaign_id
      and ws.character_id=(v_row->>'character_id')::uuid;
  end loop;

  delete from public.character_resource_states rs
  where rs.character_id=any(v_character_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_before->'resources','[]'::jsonb)) e
      where (e->>'character_id')::uuid=rs.character_id
        and e->>'state_key'=rs.state_key
    );

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'resources','[]'::jsonb))
  loop
    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,
      updated_by,created_at,updated_at,temporary_max_bonus
    ) values (
      (v_row->>'character_id')::uuid,
      v_row->>'state_key',
      (v_row->>'current')::integer,
      (v_row->>'max_snapshot')::integer,
      coalesce(v_row->>'label',''),
      coalesce(v_row->'recharge','{}'::jsonb),
      nullif(v_row->>'updated_by','')::uuid,
      coalesce((v_row->>'created_at')::timestamptz,now()),
      now(),
      coalesce((v_row->>'temporary_max_bonus')::integer,0)
    )
    on conflict(character_id,state_key) do update set
      current=excluded.current,
      max_snapshot=excluded.max_snapshot,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=excluded.updated_by,
      temporary_max_bonus=excluded.temporary_max_bonus,
      updated_at=now();
  end loop;

  delete from private.character_survival_runtime sr
  where sr.campaign_id=v_receipt.campaign_id
    and sr.character_id=any(v_character_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_before->'survival_runtime','[]'::jsonb)) e
      where (e->>'character_id')::uuid=sr.character_id
    );

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'survival_runtime','[]'::jsonb))
  loop
    insert into private.character_survival_runtime(
      character_id,campaign_id,satiety_remainder,alertness_remainder,
      created_at,updated_at
    ) values (
      (v_row->>'character_id')::uuid,
      (v_row->>'campaign_id')::uuid,
      coalesce((v_row->>'satiety_remainder')::integer,0),
      coalesce((v_row->>'alertness_remainder')::integer,0),
      coalesce((v_row->>'created_at')::timestamptz,now()),
      now()
    )
    on conflict(character_id) do update set
      campaign_id=excluded.campaign_id,
      satiety_remainder=excluded.satiety_remainder,
      alertness_remainder=excluded.alertness_remainder,
      updated_at=now();
  end loop;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'sheets','[]'::jsonb))
  loop
    update public.character_sheets cs
    set current_hp=(v_row->>'current_hp')::integer,
        temp_hp=coalesce((v_row->>'temp_hp')::integer,0),
        death_save_successes=coalesce((v_row->>'death_save_successes')::integer,0),
        death_save_failures=coalesce((v_row->>'death_save_failures')::integer,0),
        spell_slots=coalesce(v_row->'spell_slots','{}'::jsonb),
        spell_change_unlocked=coalesce((v_row->>'spell_change_unlocked')::boolean,false),
        updated_at=now()
    where cs.character_id=(v_row->>'character_id')::uuid;
  end loop;

  delete from public.character_short_rest_sessions s
  where s.character_id=any(v_character_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_before->'short_rest_sessions','[]'::jsonb)) e
      where (e->>'character_id')::uuid=s.character_id
    );

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'short_rest_sessions','[]'::jsonb))
  loop
    insert into public.character_short_rest_sessions(
      character_id,generation,is_open,opened_at,opened_by,closed_at,updated_at
    ) values (
      (v_row->>'character_id')::uuid,
      (v_row->>'generation')::bigint,
      (v_row->>'is_open')::boolean,
      nullif(v_row->>'opened_at','')::timestamptz,
      nullif(v_row->>'opened_by','')::uuid,
      nullif(v_row->>'closed_at','')::timestamptz,
      now()
    )
    on conflict(character_id) do update set
      generation=excluded.generation,
      is_open=excluded.is_open,
      opened_at=excluded.opened_at,
      opened_by=excluded.opened_by,
      closed_at=excluded.closed_at,
      updated_at=now();
  end loop;

  delete from public.character_preparation_sessions s
  where s.character_id=any(v_character_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_before->'preparation_sessions','[]'::jsonb)) e
      where (e->>'character_id')::uuid=s.character_id
    );

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'preparation_sessions','[]'::jsonb))
  loop
    insert into public.character_preparation_sessions(
      character_id,generation,is_open,opened_at,opened_by,closed_at,
      closed_by_message_id,updated_at
    ) values (
      (v_row->>'character_id')::uuid,
      (v_row->>'generation')::bigint,
      (v_row->>'is_open')::boolean,
      nullif(v_row->>'opened_at','')::timestamptz,
      nullif(v_row->>'opened_by','')::uuid,
      nullif(v_row->>'closed_at','')::timestamptz,
      nullif(v_row->>'closed_by_message_id','')::bigint,
      now()
    )
    on conflict(character_id) do update set
      generation=excluded.generation,
      is_open=excluded.is_open,
      opened_at=excluded.opened_at,
      opened_by=excluded.opened_by,
      closed_at=excluded.closed_at,
      closed_by_message_id=excluded.closed_by_message_id,
      updated_at=now();
  end loop;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'inventory','[]'::jsonb))
    order by
      case when nullif(value->>'holder_item_id','') is null then 0 else 1 end,
      value->>'id'
  loop
    v_item_id:=(v_row->>'id')::uuid;

    if exists(select 1 from public.character_inventory_items i where i.id=v_item_id) then
      update public.character_inventory_items i
      set character_id=nullif(v_row->>'character_id','')::uuid,
          name=v_row->>'name',
          quantity=(v_row->>'quantity')::integer,
          weight=nullif(v_row->>'weight','')::numeric,
          equipped=(v_row->>'equipped')::boolean,
          image_url=nullif(v_row->>'image_url',''),
          description=coalesce(v_row->>'description',''),
          sort_order=(v_row->>'sort_order')::integer,
          category=v_row->>'category',
          equipment_slot=nullif(v_row->>'equipment_slot',''),
          mechanics=coalesce(v_row->'mechanics','[]'::jsonb),
          definition_id=nullif(v_row->>'definition_id','')::uuid,
          definition_revision=nullif(v_row->>'definition_revision','')::integer,
          usage_mode=v_row->>'usage_mode',
          charges_current=nullif(v_row->>'charges_current','')::integer,
          charges_max=nullif(v_row->>'charges_max','')::integer,
          item_state=coalesce(v_row->'item_state','{}'::jsonb),
          stack_mode=v_row->>'stack_mode',
          holder_item_id=nullif(v_row->>'holder_item_id','')::uuid,
          placement_kind=v_row->>'placement_kind',
          placement_index=nullif(v_row->>'placement_index','')::integer,
          grid_x=nullif(v_row->>'grid_x','')::integer,
          grid_y=nullif(v_row->>'grid_y','')::integer,
          grid_rotation=(v_row->>'grid_rotation')::smallint,
          world_storage_id=nullif(v_row->>'world_storage_id','')::uuid,
          surface_id=nullif(v_row->>'surface_id','')::uuid
      where i.id=v_item_id;
    else
      insert into public.character_inventory_items(
        id,character_id,name,quantity,weight,equipped,image_url,description,
        sort_order,created_at,updated_at,category,equipment_slot,mechanics,
        definition_id,definition_revision,usage_mode,charges_current,charges_max,
        item_state,version,stack_mode,holder_item_id,placement_kind,
        placement_index,grid_x,grid_y,grid_rotation,world_storage_id,surface_id
      ) values (
        v_item_id,
        nullif(v_row->>'character_id','')::uuid,
        v_row->>'name',
        (v_row->>'quantity')::integer,
        nullif(v_row->>'weight','')::numeric,
        (v_row->>'equipped')::boolean,
        nullif(v_row->>'image_url',''),
        coalesce(v_row->>'description',''),
        (v_row->>'sort_order')::integer,
        coalesce((v_row->>'created_at')::timestamptz,now()),
        now(),
        v_row->>'category',
        nullif(v_row->>'equipment_slot',''),
        coalesce(v_row->'mechanics','[]'::jsonb),
        nullif(v_row->>'definition_id','')::uuid,
        nullif(v_row->>'definition_revision','')::integer,
        v_row->>'usage_mode',
        nullif(v_row->>'charges_current','')::integer,
        nullif(v_row->>'charges_max','')::integer,
        coalesce(v_row->'item_state','{}'::jsonb),
        coalesce((v_row->>'version')::bigint,1),
        v_row->>'stack_mode',
        nullif(v_row->>'holder_item_id','')::uuid,
        v_row->>'placement_kind',
        nullif(v_row->>'placement_index','')::integer,
        nullif(v_row->>'grid_x','')::integer,
        nullif(v_row->>'grid_y','')::integer,
        (v_row->>'grid_rotation')::smallint,
        nullif(v_row->>'world_storage_id','')::uuid,
        nullif(v_row->>'surface_id','')::uuid
      );
    end if;
  end loop;

  perform set_config('meganot.party_time_sync','off',true);

  update private.ai_survival_turn_receipts_v1
  set rolled_back_at=now()
  where command_id=v_receipt.command_id;

  return jsonb_build_object(
    'command_id',v_receipt.command_id,
    'revision_id',v_receipt.revision_id,
    'participant_character_ids',to_jsonb(v_character_ids),
    'rolled_back',true,
    'replayed',false
  );
end
$function$;