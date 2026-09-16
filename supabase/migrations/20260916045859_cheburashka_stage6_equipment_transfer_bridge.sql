-- Cheburashka Stage 6 follow-up: preserve transfer compatibility and
-- require explicit physical destination before displacing equipped items.
-- Applied live as 20260916045859_cheburashka_stage6_equipment_transfer_bridge.

create or replace function private.cheburashka_legacy_holder_placement_compat_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
     and new.character_id is distinct from old.character_id
     and new.holder_item_id is null
     and coalesce(new.placement_kind, 'root') <> 'root' then
    new.placement_kind := 'root';
    new.placement_index := null;
    new.grid_x := null;
    new.grid_y := null;
    new.grid_rotation := 0;
  elsif new.holder_item_id is not null
     and coalesce(new.placement_kind, 'root') = 'root' then
    new.placement_kind := 'legacy';
    new.placement_index := null;
    new.grid_x := null;
    new.grid_y := null;
    new.grid_rotation := 0;
  elsif new.holder_item_id is null and new.placement_kind = 'legacy' then
    new.placement_kind := 'root';
    new.placement_index := null;
    new.grid_x := null;
    new.grid_y := null;
    new.grid_rotation := 0;
  end if;
  return new;
end;
$function$;

drop trigger if exists character_inventory_items_legacy_holder_placement_compat
on public.character_inventory_items;

create trigger character_inventory_items_legacy_holder_placement_compat
before insert or update of holder_item_id, placement_kind, character_id
on public.character_inventory_items
for each row
execute function private.cheburashka_legacy_holder_placement_compat_v1();

create or replace function public.set_inventory_item_equipped_v2(
  p_character_id uuid,
  p_item_id uuid,
  p_equipped boolean,
  p_equipment_slot text,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_version bigint;
  v_category text;
  v_current_slot text;
  v_slot text;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'Expected inventory version is required';
  end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  select character.campaign_id into v_campaign_id
  from public.characters character
  where character.id = p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory:' || p_character_id::text, 0)
  );

  select * into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.set_equipped'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select to_jsonb(item), item.version, item.category, item.equipment_slot
  into v_before, v_version, v_category, v_current_slot
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

  v_slot := coalesce(nullif(btrim(p_equipment_slot), ''), v_current_slot);

  if p_equipped and v_category <> 'equipment' then
    raise exception 'Only equipment items can be equipped';
  end if;
  if p_equipped and v_slot is null then
    raise exception 'Equipment slot is required';
  end if;
  if p_equipped and v_slot not in (
    'main_hand','off_hand','two_hands','head','neck','shoulders',
    'chest','hands','wrists','waist','legs','feet','back',
    'ring_left','ring_right','ammo','other'
  ) then
    raise exception 'Unsupported equipment slot';
  end if;

  if p_equipped and exists (
    select 1
    from public.character_inventory_items conflict
    where conflict.character_id = p_character_id
      and conflict.id <> p_item_id
      and conflict.equipped = true
      and (
        conflict.equipment_slot = v_slot
        or (v_slot = 'two_hands' and conflict.equipment_slot in ('main_hand','off_hand'))
        or (v_slot in ('main_hand','off_hand') and conflict.equipment_slot = 'two_hands')
      )
  ) then
    raise exception 'Equipment slot is occupied; choose a destination for the equipped item first';
  end if;

  update public.character_inventory_items item
  set
    equipped = p_equipped,
    equipment_slot = case when p_equipped then v_slot else item.equipment_slot end,
    holder_item_id = case when p_equipped then null else item.holder_item_id end,
    placement_kind = case when p_equipped then 'root' else item.placement_kind end,
    placement_index = case when p_equipped then null else item.placement_index end,
    grid_x = case when p_equipped then null else item.grid_x end,
    grid_y = case when p_equipped then null else item.grid_y end,
    grid_rotation = case when p_equipped then 0 else item.grid_rotation end
  where item.id = p_item_id
    and item.character_id = p_character_id
  returning to_jsonb(item)
  into v_after;

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(p_character_id),
    'before', v_before,
    'after', v_after,
    'relatedChanges', '[]'::jsonb
  );

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind,
    aggregate_id, result, created_by
  )
  values (
    p_command_id, v_campaign_id, 'cheburashka', 'inventory.set_equipped',
    p_item_id, v_result, auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.set_inventory_item_equipped_v2(
  uuid,uuid,boolean,text,bigint,uuid
) from public, anon;
grant execute on function public.set_inventory_item_equipped_v2(
  uuid,uuid,boolean,text,bigint,uuid
) to authenticated;
