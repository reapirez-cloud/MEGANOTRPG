-- Inventory Stage 10 commit path:
-- GENA owns trade session/revision/acceptance state.
-- Cheburashka owns the atomic physical exchange.

-- An offer references an item but must not reserve it merely by FK existence.
-- External consume/remove/move is allowed; acceptance/commit then invalidates.
alter table public.trade_offer_lines
  drop constraint if exists trade_offer_lines_item_id_fkey;

-- Restore the owner-change compatibility law after Stage 9 added Surface scope.
create or replace function private.cheburashka_legacy_holder_placement_compat_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_owner_changed boolean := false;
begin
  if tg_op='UPDATE' then
    v_owner_changed :=
      new.character_id is distinct from old.character_id
      or new.world_storage_id is distinct from old.world_storage_id
      or new.surface_id is distinct from old.surface_id;
  end if;

  if v_owner_changed and new.holder_item_id is null then
    new.placement_kind := case when new.surface_id is not null then 'surface' else 'root' end;
    new.placement_index := null;
    new.grid_x := null;
    new.grid_y := null;
    new.grid_rotation := 0;
  elsif new.holder_item_id is not null
     and coalesce(new.placement_kind,'root') in ('root','surface') then
    new.placement_kind := 'legacy';
    new.placement_index := null;
    new.grid_x := null;
    new.grid_y := null;
    new.grid_rotation := 0;
  elsif new.holder_item_id is null and new.placement_kind='legacy' then
    new.placement_kind := case when new.surface_id is not null then 'surface' else 'root' end;
    new.placement_index := null;
    new.grid_x := null;
    new.grid_y := null;
    new.grid_rotation := 0;
  end if;

  return new;
end;
$function$;

create or replace function private.cheburashka_validate_trade_exchange_v1(
  p_side_a_character_id uuid,
  p_side_b_character_id uuid,
  p_lines jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_line jsonb;
  v_item public.character_inventory_items%rowtype;
  v_owner uuid;
  v_target uuid;
  v_item_id uuid;
  v_quantity integer;
  v_item_version bigint;
  v_fingerprint text;
begin
  if p_side_a_character_id=p_side_b_character_id then
    raise exception 'trade.invalid_sides';
  end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' then
    raise exception 'trade.invalid_offer_projection';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_lines)
  ) <> (
    select count(distinct (line->>'itemId'))
    from jsonb_array_elements(p_lines) line
  ) then
    raise exception 'trade.duplicate_offer_item';
  end if;

  for v_line in
    select value from jsonb_array_elements(p_lines)
  loop
    v_owner:=(v_line->>'ownerCharacterId')::uuid;
    v_target:=(v_line->>'targetCharacterId')::uuid;
    v_item_id:=(v_line->>'itemId')::uuid;
    v_quantity:=(v_line->>'quantity')::integer;
    v_item_version:=(v_line->>'itemVersion')::bigint;
    v_fingerprint:=v_line->>'integrityFingerprint';

    if not (
      (v_owner=p_side_a_character_id and v_target=p_side_b_character_id)
      or
      (v_owner=p_side_b_character_id and v_target=p_side_a_character_id)
    ) then
      raise exception 'trade.invalid_offer_side';
    end if;

    select * into v_item
    from public.character_inventory_items i
    where i.id=v_item_id;

    if not found
       or v_item.character_id is distinct from v_owner
       or v_item.world_storage_id is not null
       or v_item.surface_id is not null then
      raise exception 'trade.offer_item_moved';
    end if;

    if v_item.version<>v_item_version then
      raise exception 'trade.offer_item_stale';
    end if;
    if v_item.equipped then
      raise exception 'trade.offer_item_changed';
    end if;
    if v_quantity<1 or v_item.quantity<v_quantity then
      raise exception 'trade.offer_item_changed';
    end if;
    if coalesce(v_item.stack_mode,'instance')='instance'
       and v_quantity<>v_item.quantity then
      raise exception 'trade.offer_item_changed';
    end if;

    if private.cheburashka_trade_item_fingerprint_v1(v_item_id,v_quantity)
       is distinct from v_fingerprint then
      raise exception 'trade.offer_item_changed';
    end if;

    if exists(
      with recursive descendants as (
        select child.id
        from public.character_inventory_items child
        where child.holder_item_id=v_item_id
        union all
        select child.id
        from public.character_inventory_items child
        join descendants parent on child.holder_item_id=parent.id
      )
      select 1
      from jsonb_array_elements(p_lines) other_line
      where (other_line->>'ownerCharacterId')::uuid=v_owner
        and (other_line->>'itemId')::uuid in (select id from descendants)
    ) then
      raise exception 'trade.offer_subtree_overlap';
    end if;
  end loop;
end;
$function$;
revoke execute on function private.cheburashka_validate_trade_exchange_v1(uuid,uuid,jsonb)
from public,anon,authenticated;

create or replace function private.cheburashka_commit_trade_exchange_v1(
  p_side_a_character_id uuid,
  p_side_b_character_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lock_key text;
  v_line jsonb;
  v_owner uuid;
  v_target uuid;
  v_item_id uuid;
  v_quantity integer;
  v_item public.character_inventory_items%rowtype;
  v_destination public.character_inventory_items%rowtype;
  v_subtree_ids uuid[];
  v_transfer_results jsonb := '[]'::jsonb;
begin
  -- Lock both character inventory aggregates in deterministic order.
  for v_lock_key in
    select key
    from (
      values
        ('inventory:'||p_side_a_character_id::text),
        ('inventory:'||p_side_b_character_id::text)
    ) locks(key)
    order by key
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_lock_key,0)
    );
  end loop;

  -- Lock every offered item and its descendants before validation.
  perform i.id
  from public.character_inventory_items i
  where i.id in (
    with recursive offered_roots as (
      select (line->>'itemId')::uuid id
      from jsonb_array_elements(p_lines) line
    ),
    subtree as (
      select id from offered_roots
      union
      select child.id
      from public.character_inventory_items child
      join subtree parent on child.holder_item_id=parent.id
    )
    select id from subtree
  )
  order by i.id
  for update;

  perform private.cheburashka_validate_trade_exchange_v1(
    p_side_a_character_id,p_side_b_character_id,p_lines
  );

  for v_line in
    select value
    from jsonb_array_elements(p_lines)
    order by value->>'itemId'
  loop
    v_owner:=(v_line->>'ownerCharacterId')::uuid;
    v_target:=(v_line->>'targetCharacterId')::uuid;
    v_item_id:=(v_line->>'itemId')::uuid;
    v_quantity:=(v_line->>'quantity')::integer;

    select * into v_item
    from public.character_inventory_items i
    where i.id=v_item_id
    for update;

    if v_item.quantity=v_quantity then
      with recursive subtree as (
        select i.id
        from public.character_inventory_items i
        where i.id=v_item_id
        union all
        select child.id
        from public.character_inventory_items child
        join subtree parent on child.holder_item_id=parent.id
      )
      select array_agg(id) into v_subtree_ids from subtree;

      update public.character_inventory_items i
      set character_id=v_target,
          world_storage_id=null,
          surface_id=null,
          holder_item_id=null,
          placement_kind='root',
          placement_index=null,
          grid_x=null,
          grid_y=null,
          grid_rotation=0,
          equipped=false
      where i.id=v_item_id
      returning * into v_destination;

      update public.character_inventory_items i
      set character_id=v_target,
          world_storage_id=null,
          surface_id=null,
          equipped=false
      where i.id=any(v_subtree_ids)
        and i.id<>v_item_id;

      v_transfer_results:=v_transfer_results||jsonb_build_array(
        jsonb_build_object(
          'sourceItemId',v_item_id,
          'destinationItemId',v_destination.id,
          'fromCharacterId',v_owner,
          'toCharacterId',v_target,
          'quantity',v_quantity,
          'wholeInstance',true
        )
      );
    else
      update public.character_inventory_items i
      set quantity=i.quantity-v_quantity
      where i.id=v_item_id;

      insert into public.character_inventory_items(
        character_id,world_storage_id,surface_id,
        name,quantity,weight,equipped,image_url,description,sort_order,
        category,equipment_slot,mechanics,definition_id,definition_revision,
        usage_mode,charges_current,charges_max,item_state,stack_mode,
        holder_item_id,placement_kind,placement_index,grid_x,grid_y,grid_rotation
      )
      values(
        v_target,null,null,
        v_item.name,v_quantity,v_item.weight,false,v_item.image_url,
        v_item.description,v_item.sort_order,v_item.category,v_item.equipment_slot,
        v_item.mechanics,v_item.definition_id,v_item.definition_revision,
        v_item.usage_mode,v_item.charges_current,v_item.charges_max,
        v_item.item_state,v_item.stack_mode,
        null,'root',null,null,null,0
      )
      returning * into v_destination;

      v_transfer_results:=v_transfer_results||jsonb_build_array(
        jsonb_build_object(
          'sourceItemId',v_item_id,
          'destinationItemId',v_destination.id,
          'fromCharacterId',v_owner,
          'toCharacterId',v_target,
          'quantity',v_quantity,
          'wholeInstance',false
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'affectedCharacterIds',jsonb_build_array(
      p_side_a_character_id,p_side_b_character_id
    ),
    'transfers',v_transfer_results
  );
end;
$function$;
revoke execute on function private.cheburashka_commit_trade_exchange_v1(uuid,uuid,jsonb)
from public,anon,authenticated;

create or replace function public.accept_trade_v1(
  p_session_id uuid,
  p_actor_character_id uuid,
  p_expected_revision bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.trade_sessions%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_lines jsonb;
  v_exchange jsonb;
  v_result jsonb;
  v_error text;
  v_new_revision bigint;
  v_both_accepted boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trade:'||p_session_id::text,0)
  );

  select * into v_session
  from public.trade_sessions
  where id=p_session_id
  for update;

  if not found or v_session.state<>'open' then
    raise exception 'Trade session is not open';
  end if;
  if v_session.revision<>p_expected_revision then
    raise exception 'trade.revision_stale';
  end if;
  if not private.can_act_trade_side_v1(
    p_session_id,p_actor_character_id,auth.uid()
  ) then
    raise exception 'Not allowed to accept for this trade side';
  end if;

  select * into v_existing
  from public.engine_command_receipts
  where command_id=p_command_id;

  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'trade.accept'
       or v_existing.aggregate_id<>p_session_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ownerCharacterId',line.owner_character_id,
        'targetCharacterId',
          case
            when line.owner_character_id=v_session.side_a_character_id
              then v_session.side_b_character_id
            else v_session.side_a_character_id
          end,
        'itemId',line.item_id,
        'quantity',line.quantity,
        'itemVersion',line.item_version,
        'integrityFingerprint',line.integrity_fingerprint
      )
      order by line.item_id
    ),
    '[]'::jsonb
  )
  into v_lines
  from public.trade_offer_lines line
  where line.session_id=p_session_id;

  -- Validate before even recording the first acceptance. If outside inventory
  -- mutations made the offer stale, invalidate this revision persistently.
  begin
    perform private.cheburashka_validate_trade_exchange_v1(
      v_session.side_a_character_id,
      v_session.side_b_character_id,
      v_lines
    );
  exception
    when others then
      v_error:=sqlerrm;
      if v_error like 'trade.%' then
        v_new_revision:=private.trade_bump_revision_v1(p_session_id,v_error);
        v_result:=jsonb_build_object(
          'sessionId',p_session_id,
          'state','open',
          'revision',v_new_revision,
          'invalidated',true,
          'failureCode',v_error
        );
        perform private.trade_record_event_v1(
          p_session_id,'offer.invalidated',v_new_revision,
          p_actor_character_id,v_result,auth.uid()
        );
        insert into public.engine_command_receipts(
          command_id,campaign_id,engine,command_kind,aggregate_id,result,
          created_by,actor_character_id
        )
        values(
          p_command_id,v_session.campaign_id,'gena','trade.accept',
          p_session_id,v_result,auth.uid(),p_actor_character_id
        );
        return v_result;
      end if;
      raise;
  end;

  if p_actor_character_id=v_session.side_a_character_id then
    update public.trade_sessions
    set accepted_a_revision=revision,
        last_failure_code=null,
        updated_at=now()
    where id=p_session_id;
  else
    update public.trade_sessions
    set accepted_b_revision=revision,
        last_failure_code=null,
        updated_at=now()
    where id=p_session_id;
  end if;

  select * into v_session
  from public.trade_sessions
  where id=p_session_id
  for update;

  v_both_accepted :=
    v_session.accepted_a_revision=v_session.revision
    and v_session.accepted_b_revision=v_session.revision;

  if not v_both_accepted then
    v_result:=jsonb_build_object(
      'sessionId',p_session_id,
      'state','open',
      'revision',v_session.revision,
      'acceptedARevision',v_session.accepted_a_revision,
      'acceptedBRevision',v_session.accepted_b_revision,
      'committed',false
    );

    perform private.trade_record_event_v1(
      p_session_id,'trade.accepted',v_session.revision,
      p_actor_character_id,v_result,auth.uid()
    );

    insert into public.engine_command_receipts(
      command_id,campaign_id,engine,command_kind,aggregate_id,result,
      created_by,actor_character_id
    )
    values(
      p_command_id,v_session.campaign_id,'gena','trade.accept',
      p_session_id,v_result,auth.uid(),p_actor_character_id
    );

    return v_result;
  end if;

  -- Second acceptance commits the same revision in this transaction.
  begin
    v_exchange:=private.cheburashka_commit_trade_exchange_v1(
      v_session.side_a_character_id,
      v_session.side_b_character_id,
      v_lines
    );
  exception
    when others then
      v_error:=sqlerrm;
      if v_error like 'trade.%' then
        v_new_revision:=private.trade_bump_revision_v1(p_session_id,v_error);
        v_result:=jsonb_build_object(
          'sessionId',p_session_id,
          'state','open',
          'revision',v_new_revision,
          'invalidated',true,
          'failureCode',v_error
        );
        perform private.trade_record_event_v1(
          p_session_id,'offer.invalidated',v_new_revision,
          p_actor_character_id,v_result,auth.uid()
        );
        insert into public.engine_command_receipts(
          command_id,campaign_id,engine,command_kind,aggregate_id,result,
          created_by,actor_character_id
        )
        values(
          p_command_id,v_session.campaign_id,'gena','trade.accept',
          p_session_id,v_result,auth.uid(),p_actor_character_id
        );
        return v_result;
      end if;
      raise;
  end;

  update public.trade_sessions
  set state='committed',
      committed_at=now(),
      last_failure_code=null,
      updated_at=now()
  where id=p_session_id;

  v_result:=jsonb_build_object(
    'sessionId',p_session_id,
    'state','committed',
    'revision',v_session.revision,
    'committed',true,
    'exchange',v_exchange
  );

  perform private.trade_record_event_v1(
    p_session_id,'trade.committed',v_session.revision,
    p_actor_character_id,v_result,auth.uid()
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,
    created_by,actor_character_id
  )
  values(
    p_command_id,v_session.campaign_id,'gena','trade.accept',
    p_session_id,v_result,auth.uid(),p_actor_character_id
  );

  return v_result;
end;
$function$;
revoke all on function public.accept_trade_v1(uuid,uuid,bigint,uuid)
from public,anon;
grant execute on function public.accept_trade_v1(uuid,uuid,bigint,uuid)
to authenticated;
