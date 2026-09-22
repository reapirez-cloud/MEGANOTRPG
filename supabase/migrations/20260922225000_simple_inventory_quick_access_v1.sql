-- One non-physical quick-access shortcut per character.
-- This references an existing Cheburashka item row and never changes its placement.

create or replace function public.set_inventory_quick_access_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_enabled boolean,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_version bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_item_id is null then raise exception 'Inventory item is required'; end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'Expected inventory version is required';
  end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory-simple:' || p_character_id::text, 0)
  );

  select to_jsonb(item), item.version
  into v_before, v_version
  from public.character_inventory_items item
  where item.id = p_item_id and item.character_id = p_character_id
  for update;

  if v_before is null then raise exception 'Inventory item not found for this character'; end if;
  if v_version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %', p_expected_version, v_version;
  end if;

  if p_enabled then
    update public.character_inventory_items item
    set item_state = coalesce(item.item_state, '{}'::jsonb) - 'quick_access'
    where item.character_id = p_character_id
      and item.id <> p_item_id
      and item.item_state ->> 'quick_access' = 'true';

    update public.character_inventory_items item
    set item_state = jsonb_set(
      coalesce(item.item_state, '{}'::jsonb),
      '{quick_access}',
      'true'::jsonb,
      true
    )
    where item.id = p_item_id and item.character_id = p_character_id;
  else
    update public.character_inventory_items item
    set item_state = coalesce(item.item_state, '{}'::jsonb) - 'quick_access'
    where item.id = p_item_id and item.character_id = p_character_id;
  end if;

  select to_jsonb(item) into v_after
  from public.character_inventory_items item
  where item.id = p_item_id;

  return jsonb_build_object(
    'itemId', p_item_id,
    'enabled', p_enabled,
    'before', v_before,
    'after', v_after,
    'affectedCharacterIds', jsonb_build_array(p_character_id)
  );
end;
$function$;

revoke all on function public.set_inventory_quick_access_v1(
  uuid, uuid, boolean, bigint
) from public, anon;
grant execute on function public.set_inventory_quick_access_v1(
  uuid, uuid, boolean, bigint
) to authenticated;
