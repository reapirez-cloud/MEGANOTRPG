-- Cheburashka Stage 6 move-destination guard.
-- Applied live as 20260916053859_cheburashka_stage6_move_destination_guard.
-- Dev moves now reject unequipping into abstract root/free state. A real hand,
-- bag grid or external carry cell is required.

create or replace function public.move_inventory_item_v3(
  p_character_id uuid,
  p_item_id uuid,
  p_target_kind text,
  p_holder_item_id uuid,
  p_grid_x integer,
  p_grid_y integer,
  p_rotation integer,
  p_slot_index integer,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_equipped boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select item.equipped
  into v_equipped
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id;

  if not found then
    raise exception 'Inventory item not found for this character';
  end if;

  if p_target_kind = 'root' and v_equipped then
    raise exception 'Equipped inventory item requires a real unequip destination';
  end if;

  return public.move_inventory_item_v2(
    p_character_id,
    p_item_id,
    p_target_kind,
    p_holder_item_id,
    p_grid_x,
    p_grid_y,
    p_rotation,
    p_slot_index,
    p_expected_version,
    p_command_id
  );
end;
$function$;

revoke all on function public.move_inventory_item_v3(
  uuid,uuid,text,uuid,integer,integer,integer,integer,bigint,uuid
) from public, anon;
grant execute on function public.move_inventory_item_v3(
  uuid,uuid,text,uuid,integer,integer,integer,integer,bigint,uuid
) to authenticated;

revoke execute on function public.move_inventory_item_v2(
  uuid,uuid,text,uuid,integer,integer,integer,integer,bigint,uuid
) from authenticated;
