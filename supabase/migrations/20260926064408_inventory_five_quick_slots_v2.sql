-- Five non-physical shortcuts to existing Cheburashka item rows.
-- The character lock and unique index prevent competing assignments to one slot.
update public.character_inventory_items
set item_state = (coalesce(item_state, '{}'::jsonb) - 'quick_access') || jsonb_build_object('quick_slot', 1)
where character_id is not null and item_state ->> 'quick_access' = 'true';

drop index if exists public.character_inventory_items_one_quick_access_per_character;
create unique index character_inventory_items_one_quick_slot_per_character
  on public.character_inventory_items (character_id, (item_state ->> 'quick_slot'))
  where character_id is not null and item_state ? 'quick_slot';

create or replace function private.cheburashka_clear_quick_access_on_owner_change_v1()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.character_id is distinct from old.character_id
     or new.world_storage_id is distinct from old.world_storage_id
     or new.surface_id is distinct from old.surface_id then
    new.item_state := coalesce(new.item_state, '{}'::jsonb) - 'quick_access' - 'quick_slot';
  end if;
  return new;
end;
$function$;

create or replace function public.set_inventory_quick_slot_v2(
  p_character_id uuid, p_item_id uuid, p_slot integer, p_expected_version bigint
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_before jsonb; v_after jsonb; v_version bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_item_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Item and expected inventory version are required';
  end if;
  if p_slot is not null and p_slot not between 1 and 5 then
    raise exception 'Quick slot must be between 1 and 5';
  end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory-simple:' || p_character_id::text, 0)
  );
  select to_jsonb(item), item.version into v_before, v_version
  from public.character_inventory_items item
  where item.id = p_item_id and item.character_id = p_character_id
  for update;
  if v_before is null then raise exception 'Inventory item not found for this character'; end if;
  if v_version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %', p_expected_version, v_version;
  end if;

  if p_slot is not null then
    update public.character_inventory_items item
    set item_state = coalesce(item.item_state, '{}'::jsonb) - 'quick_slot' - 'quick_access'
    where item.character_id = p_character_id and item.id <> p_item_id
      and item.item_state ->> 'quick_slot' = p_slot::text;
  end if;
  update public.character_inventory_items item
  set item_state = case when p_slot is null
    then coalesce(item.item_state, '{}'::jsonb) - 'quick_slot' - 'quick_access'
    else jsonb_set(coalesce(item.item_state, '{}'::jsonb) - 'quick_access',
      '{quick_slot}', to_jsonb(p_slot), true) end
  where item.id = p_item_id and item.character_id = p_character_id;

  select to_jsonb(item) into v_after from public.character_inventory_items item where item.id = p_item_id;
  return jsonb_build_object('itemId', p_item_id, 'slot', p_slot,
    'before', v_before, 'after', v_after, 'affectedCharacterIds', jsonb_build_array(p_character_id));
end;
$function$;
revoke all on function public.set_inventory_quick_slot_v2(uuid, uuid, integer, bigint) from public, anon;
grant execute on function public.set_inventory_quick_slot_v2(uuid, uuid, integer, bigint) to authenticated;

-- Old clients still call v1; route them through the same five-slot invariant.
create or replace function public.set_inventory_quick_access_v1(
  p_character_id uuid, p_item_id uuid, p_enabled boolean, p_expected_version bigint
) returns jsonb language sql security invoker set search_path = '' as $function$
  select public.set_inventory_quick_slot_v2(
    p_character_id, p_item_id, case when p_enabled then 1 else null end, p_expected_version
  );
$function$;
