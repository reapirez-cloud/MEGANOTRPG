create or replace function private.cheburashka_consume_inventory_item_v2(
  p_character_id uuid,
  p_item_id uuid,
  p_amount integer,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_usage_mode text;
  v_quantity integer;
  v_charges integer;
  v_version bigint;
begin
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    raise exception 'Inventory amount must be between 1 and 10000';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'Expected inventory version is required';
  end if;

  select
    to_jsonb(item),
    item.usage_mode,
    item.quantity,
    item.charges_current,
    item.version
  into
    v_before,
    v_usage_mode,
    v_quantity,
    v_charges,
    v_version
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id
  for update;

  if v_before is null then
    raise exception 'Inventory item not found for this character';
  end if;

  if v_version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',
      p_expected_version, v_version;
  end if;

  if v_usage_mode = 'none' then
    v_after := v_before;
  elsif v_usage_mode = 'charges' then
    if coalesce(v_charges, 0) < p_amount then
      raise exception 'Not enough item charges';
    end if;

    update public.character_inventory_items item
    set charges_current = item.charges_current - p_amount
    where item.id = p_item_id
    returning to_jsonb(item) into v_after;
  else
    if v_quantity < p_amount then
      raise exception 'Not enough item quantity';
    end if;

    if v_quantity = p_amount then
      delete from public.character_inventory_items
      where id = p_item_id;
      v_after := 'null'::jsonb;
    else
      update public.character_inventory_items item
      set quantity = item.quantity - p_amount
      where item.id = p_item_id
      returning to_jsonb(item) into v_after;
    end if;
  end if;

  return jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(p_character_id),
    'before', v_before,
    'after', v_after
  );
end;
$$;

revoke all on function private.cheburashka_consume_inventory_item_v2(uuid, uuid, integer, bigint)
  from public, anon, authenticated;

create or replace function public.consume_inventory_item_v2(
  p_character_id uuid,
  p_item_id uuid,
  p_amount integer,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_command_id is null then
    raise exception 'Command id is required';
  end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  select campaign_id
  into v_campaign_id
  from public.characters
  where id = p_character_id;

  if v_campaign_id is null then
    raise exception 'Character not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text, 0)
  );

  select *
  into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.consume'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  v_result := private.cheburashka_consume_inventory_item_v2(
    p_character_id,
    p_item_id,
    p_amount,
    p_expected_version
  );

  insert into public.engine_command_receipts(
    command_id,
    campaign_id,
    engine,
    command_kind,
    aggregate_id,
    result,
    created_by
  )
  values (
    p_command_id,
    v_campaign_id,
    'cheburashka',
    'inventory.consume',
    p_item_id,
    v_result,
    auth.uid()
  );

  return v_result;
end;
$$;

revoke all on function public.consume_inventory_item_v2(uuid, uuid, integer, bigint, uuid)
  from public, anon;
grant execute on function public.consume_inventory_item_v2(uuid, uuid, integer, bigint, uuid)
  to authenticated;

create or replace function public.transfer_inventory_item_v2(
  p_from_character_id uuid,
  p_to_character_id uuid,
  p_item_id uuid,
  p_amount integer,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_target_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_after jsonb := 'null'::jsonb;
  v_destination jsonb;
  v_quantity integer;
  v_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_command_id is null then
    raise exception 'Command id is required';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'Expected inventory version is required';
  end if;
  if p_from_character_id = p_to_character_id then
    raise exception 'Characters must be different';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    raise exception 'Inventory amount must be between 1 and 10000';
  end if;
  if not private.can_manage_character(p_from_character_id, auth.uid())
     or not private.can_manage_character(p_to_character_id, auth.uid()) then
    raise exception 'Only GM can transfer inventory between characters';
  end if;

  select campaign_id
  into v_campaign_id
  from public.characters
  where id = p_from_character_id;

  select campaign_id
  into v_target_campaign_id
  from public.characters
  where id = p_to_character_id;

  if v_campaign_id is null
     or v_target_campaign_id is null
     or v_campaign_id <> v_target_campaign_id then
    raise exception 'Characters must belong to the same campaign';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text, 0)
  );

  select *
  into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.transfer'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select
    to_jsonb(item),
    item.quantity,
    item.version
  into
    v_before,
    v_quantity,
    v_version
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_from_character_id
  for update;

  if v_before is null then
    raise exception 'Inventory item not found for source character';
  end if;
  if v_version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',
      p_expected_version, v_version;
  end if;
  if v_quantity < p_amount then
    raise exception 'Not enough item quantity';
  end if;

  if v_quantity = p_amount then
    update public.character_inventory_items item
    set
      character_id = p_to_character_id,
      equipped = false
    where item.id = p_item_id
    returning to_jsonb(item) into v_destination;
  else
    update public.character_inventory_items item
    set quantity = item.quantity - p_amount
    where item.id = p_item_id
    returning to_jsonb(item) into v_after;

    insert into public.character_inventory_items(
      character_id,
      name,
      quantity,
      weight,
      equipped,
      image_url,
      description,
      sort_order,
      category,
      equipment_slot,
      mechanics,
      definition_id,
      definition_revision,
      usage_mode,
      charges_current,
      charges_max,
      item_state
    )
    select
      p_to_character_id,
      item.name,
      p_amount,
      item.weight,
      false,
      item.image_url,
      item.description,
      item.sort_order,
      item.category,
      item.equipment_slot,
      item.mechanics,
      item.definition_id,
      item.definition_revision,
      item.usage_mode,
      item.charges_current,
      item.charges_max,
      item.item_state
    from public.character_inventory_items item
    where item.id = p_item_id
    returning to_jsonb(character_inventory_items) into v_destination;
  end if;

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(
      p_from_character_id,
      p_to_character_id
    ),
    'before', v_before,
    'after', v_after,
    'destinationItem', v_destination
  );

  insert into public.engine_command_receipts(
    command_id,
    campaign_id,
    engine,
    command_kind,
    aggregate_id,
    result,
    created_by
  )
  values (
    p_command_id,
    v_campaign_id,
    'cheburashka',
    'inventory.transfer',
    p_item_id,
    v_result,
    auth.uid()
  );

  return v_result;
end;
$$;

revoke all on function public.transfer_inventory_item_v2(uuid, uuid, uuid, integer, bigint, uuid)
  from public, anon;
grant execute on function public.transfer_inventory_item_v2(uuid, uuid, uuid, integer, bigint, uuid)
  to authenticated;
