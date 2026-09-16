-- Cheburashka Stage 6 integrity closure.
-- Applied live as 20260916052417_cheburashka_stage6_integrity_closure.

create or replace function private.cheburashka_assert_character_external_capacity_v1(
  p_character_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_capacity integer;
  v_max_index integer;
begin
  if p_character_id is null then
    return;
  end if;

  v_capacity := private.cheburashka_external_carry_capacity_v1(p_character_id);

  select coalesce(max(item.placement_index), -1)
  into v_max_index
  from public.character_inventory_items item
  where item.character_id = p_character_id
    and item.placement_kind = 'external';

  if v_max_index >= v_capacity then
    raise exception 'External carry capacity would orphan occupied slot % (capacity %)',
      v_max_index, v_capacity;
  end if;
end;
$function$;

revoke execute on function private.cheburashka_assert_character_external_capacity_v1(uuid)
from public, anon, authenticated;

create or replace function private.cheburashka_assert_spatial_item_v1(
  p_item_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_item public.character_inventory_items%rowtype;
  v_child public.character_inventory_items%rowtype;
begin
  select *
  into v_item
  from public.character_inventory_items item
  where item.id = p_item_id;

  if not found then
    return;
  end if;

  if v_item.placement_kind = 'grid' then
    perform private.cheburashka_assert_spatial_placement_v1(
      v_item.character_id,
      v_item.id,
      'grid',
      v_item.holder_item_id,
      v_item.grid_x,
      v_item.grid_y,
      v_item.grid_rotation,
      null
    );
  elsif v_item.placement_kind = 'hand' then
    perform private.cheburashka_assert_spatial_placement_v1(
      v_item.character_id,
      v_item.id,
      'hand',
      null,
      null,
      null,
      0,
      v_item.placement_index
    );
  elsif v_item.placement_kind = 'external' then
    perform private.cheburashka_assert_spatial_placement_v1(
      v_item.character_id,
      v_item.id,
      'external',
      null,
      null,
      null,
      0,
      v_item.placement_index
    );
  end if;

  for v_child in
    select child.*
    from public.character_inventory_items child
    where child.holder_item_id = v_item.id
      and child.placement_kind = 'grid'
    order by child.id
  loop
    perform private.cheburashka_assert_spatial_placement_v1(
      v_child.character_id,
      v_child.id,
      'grid',
      v_child.holder_item_id,
      v_child.grid_x,
      v_child.grid_y,
      v_child.grid_rotation,
      null
    );
  end loop;

  perform private.cheburashka_assert_character_external_capacity_v1(v_item.character_id);
end;
$function$;

revoke execute on function private.cheburashka_assert_spatial_item_v1(uuid)
from public, anon, authenticated;

create or replace function private.cheburashka_validate_spatial_state_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    perform private.cheburashka_assert_character_external_capacity_v1(old.character_id);
    return old;
  end if;

  perform private.cheburashka_assert_spatial_item_v1(new.id);

  if tg_op = 'UPDATE' and old.character_id is distinct from new.character_id then
    perform private.cheburashka_assert_character_external_capacity_v1(old.character_id);
  end if;

  return new;
end;
$function$;

revoke execute on function private.cheburashka_validate_spatial_state_v1()
from public, anon, authenticated;

drop trigger if exists character_inventory_items_validate_spatial_state
on public.character_inventory_items;

create constraint trigger character_inventory_items_validate_spatial_state
after insert or update or delete
on public.character_inventory_items
deferrable initially deferred
for each row
execute function private.cheburashka_validate_spatial_state_v1();

create or replace function public.create_inventory_item_v2(
  p_character_id uuid,
  p_input jsonb,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'Inventory input must be an object';
  end if;
  if coalesce((p_input->>'equipped')::boolean, false) then
    raise exception 'Inventory creation cannot equip directly; create the item and equip it through the equipment command';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory:' || p_character_id::text, 0)
  );

  return public.create_inventory_item_v1(
    p_character_id,
    p_input || jsonb_build_object('equipped', false),
    p_command_id
  );
end;
$function$;

revoke all on function public.create_inventory_item_v2(uuid,jsonb,uuid)
from public, anon;
grant execute on function public.create_inventory_item_v2(uuid,jsonb,uuid)
to authenticated;

create or replace function public.update_inventory_item_v2(
  p_character_id uuid,
  p_item_id uuid,
  p_input jsonb,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.engine_command_receipts%rowtype;
  v_current_version bigint;
  v_equipped boolean;
  v_category text;
  v_slot text;
  v_requested_equipped boolean;
  v_requested_category text;
  v_requested_slot text;
  v_sanitized jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'Expected inventory version is required';
  end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'Inventory input must be an object';
  end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM can update inventory items';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory:' || p_character_id::text, 0)
  );

  select *
  into v_existing
  from public.engine_command_receipts receipt
  where receipt.command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.update'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select item.version, item.equipped, item.category, item.equipment_slot
  into v_current_version, v_equipped, v_category, v_slot
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id
  for update;

  if not found then
    raise exception 'Inventory item not found for this character';
  end if;
  if v_current_version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',
      p_expected_version, v_current_version;
  end if;

  v_requested_equipped := coalesce((p_input->>'equipped')::boolean, v_equipped);
  if v_requested_equipped is distinct from v_equipped then
    raise exception 'Inventory equipment state must change through the equipment or spatial move command';
  end if;

  v_requested_category := coalesce(nullif(btrim(p_input->>'category'), ''), v_category);
  v_requested_slot := coalesce(nullif(btrim(p_input->>'equipment_slot'), ''), v_slot);

  if v_equipped and (
    v_requested_category <> 'equipment'
    or v_requested_slot is distinct from v_slot
  ) then
    raise exception 'Equipped inventory category and slot cannot be edited in place; move the item first';
  end if;

  v_sanitized := p_input || jsonb_build_object('equipped', v_equipped);
  if v_equipped then
    v_sanitized := v_sanitized
      || jsonb_build_object('category', 'equipment', 'equipment_slot', v_slot);
  end if;

  return public.update_inventory_item_v1(
    p_character_id,
    p_item_id,
    v_sanitized,
    p_expected_version,
    p_command_id
  );
end;
$function$;

revoke all on function public.update_inventory_item_v2(uuid,uuid,jsonb,bigint,uuid)
from public, anon;
grant execute on function public.update_inventory_item_v2(uuid,uuid,jsonb,bigint,uuid)
to authenticated;

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
  if not p_equipped then
    raise exception 'Unequip requires a real inventory destination; use move_inventory_item_v2';
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

  if v_before is null then raise exception 'Inventory item not found for this character'; end if;
  if v_version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',
      p_expected_version, v_version;
  end if;

  v_slot := coalesce(nullif(btrim(p_equipment_slot), ''), v_current_slot);

  if v_category <> 'equipment' then
    raise exception 'Only equipment items can be equipped';
  end if;
  if v_slot is null then raise exception 'Equipment slot is required'; end if;
  if v_slot not in (
    'main_hand','off_hand','two_hands','head','neck','shoulders',
    'chest','hands','wrists','waist','legs','feet','back',
    'ring_left','ring_right','ammo','other'
  ) then
    raise exception 'Unsupported equipment slot';
  end if;

  if exists (
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
    equipped = true,
    equipment_slot = v_slot,
    holder_item_id = null,
    placement_kind = 'root',
    placement_index = null,
    grid_x = null,
    grid_y = null,
    grid_rotation = 0
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
