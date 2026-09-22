-- Simple inventory drag/swap support.
-- Keeps the spatial/Tetris runtime isolated while allowing stable slot reordering.

create or replace function public.swap_inventory_items_simple_v1(
  p_character_id uuid,
  p_item_a_id uuid,
  p_item_b_id uuid,
  p_expected_version_a bigint,
  p_expected_version_b bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_a public.character_inventory_items%rowtype;
  v_b public.character_inventory_items%rowtype;
  v_after_a jsonb;
  v_after_b jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_item_a_id is null or p_item_b_id is null or p_item_a_id = p_item_b_id then
    raise exception 'Two different inventory items are required';
  end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory-simple:' || p_character_id::text, 0)
  );

  select * into v_a from public.character_inventory_items
  where id = p_item_a_id and character_id = p_character_id for update;
  select * into v_b from public.character_inventory_items
  where id = p_item_b_id and character_id = p_character_id for update;

  if v_a.id is null or v_b.id is null then
    raise exception 'Inventory item not found for this character';
  end if;
  if v_a.version <> p_expected_version_a or v_b.version <> p_expected_version_b then
    raise exception 'Inventory version conflict';
  end if;
  if v_a.equipped or v_b.equipped then
    raise exception 'Equipped inventory items cannot be reordered directly';
  end if;
  if v_a.category = 'container' or v_b.category = 'container' then
    raise exception 'Inventory containers cannot be swapped as simple slots';
  end if;
  if coalesce(v_a.placement_kind, 'root') not in ('root','legacy','hand')
     or coalesce(v_b.placement_kind, 'root') not in ('root','legacy','hand') then
    raise exception 'Only simple inventory positions can be swapped';
  end if;

  update public.character_inventory_items
  set holder_item_id = null, placement_kind = 'root', placement_index = null,
      grid_x = null, grid_y = null, grid_rotation = 0
  where id = v_a.id;

  update public.character_inventory_items
  set holder_item_id = v_a.holder_item_id,
      placement_kind = coalesce(v_a.placement_kind, case when v_a.holder_item_id is null then 'root' else 'legacy' end),
      placement_index = v_a.placement_index,
      grid_x = null, grid_y = null, grid_rotation = 0,
      sort_order = v_a.sort_order
  where id = v_b.id;

  update public.character_inventory_items
  set holder_item_id = v_b.holder_item_id,
      placement_kind = coalesce(v_b.placement_kind, case when v_b.holder_item_id is null then 'root' else 'legacy' end),
      placement_index = v_b.placement_index,
      grid_x = null, grid_y = null, grid_rotation = 0,
      sort_order = v_b.sort_order
  where id = v_a.id;

  if v_a.holder_item_id is not null then
    perform private.cheburashka_assert_specialized_capacity_v1(v_a.holder_item_id);
  end if;
  if v_b.holder_item_id is not null and v_b.holder_item_id is distinct from v_a.holder_item_id then
    perform private.cheburashka_assert_specialized_capacity_v1(v_b.holder_item_id);
  end if;
  perform private.cheburashka_assert_character_external_capacity_v1(p_character_id);

  select to_jsonb(item) into v_after_a from public.character_inventory_items item where item.id = v_a.id;
  select to_jsonb(item) into v_after_b from public.character_inventory_items item where item.id = v_b.id;

  return jsonb_build_object(
    'itemA', v_after_a,
    'itemB', v_after_b,
    'affectedCharacterIds', jsonb_build_array(p_character_id)
  );
end;
$function$;

revoke all on function public.swap_inventory_items_simple_v1(
  uuid, uuid, uuid, bigint, bigint
) from public, anon;
grant execute on function public.swap_inventory_items_simple_v1(
  uuid, uuid, uuid, bigint, bigint
) to authenticated;
