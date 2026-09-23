-- Cheburashka simple inventory mode.
-- The spatial/Tetris runtime remains intact but is isolated from the active
-- character inventory UI. Canonical item identity, holder relationships,
-- stacking, equipment, specialized capacities and profiles remain unchanged.

create or replace function private.cheburashka_simple_container_capacity_v1(
  p_holder_item_id uuid
)
returns integer
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_category text;
  v_profile jsonb;
  v_width integer;
  v_height integer;
begin
  select item.category
  into v_category
  from public.character_inventory_items item
  where item.id = p_holder_item_id;

  if v_category is null then
    raise exception 'Inventory holder not found';
  end if;
  if v_category <> 'container' then
    raise exception 'Inventory holder must be a container';
  end if;

  v_profile := private.cheburashka_inventory_profile_for_item_v1(p_holder_item_id);
  v_width := greatest(
    1,
    coalesce((v_profile->'container_profile'->>'internal_grid_width')::integer, 1)
  );
  v_height := greatest(
    1,
    coalesce((v_profile->'container_profile'->>'internal_grid_height')::integer, 1)
  );

  return least(10000, v_width * v_height);
end;
$function$;

revoke all on function private.cheburashka_simple_container_capacity_v1(uuid)
from public, anon, authenticated;

create or replace function public.move_inventory_item_simple_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_holder_item_id uuid,
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
  v_item_category text;
  v_holder_character uuid;
  v_holder_category text;
  v_holder_profile jsonb;
  v_capacity integer;
  v_occupied integer;
  v_cycle boolean := false;
  v_overflow boolean := false;
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
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  select character.campaign_id
  into v_campaign_id
  from public.characters character
  where character.id = p_character_id;

  if v_campaign_id is null then
    raise exception 'Character not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory-simple:' || p_character_id::text, 0)
  );

  select *
  into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.move'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  perform 1
  from public.character_inventory_items item
  where item.character_id = p_character_id
  order by item.id
  for update;

  select to_jsonb(item), item.version, item.category
  into v_before, v_version, v_item_category
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id;

  if v_before is null then
    raise exception 'Inventory item not found for this character';
  end if;
  if v_version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',
      p_expected_version, v_version;
  end if;

  if p_holder_item_id = p_item_id then
    raise exception 'Inventory item cannot contain itself';
  end if;

  if p_holder_item_id is null then
    if coalesce((v_before->>'equipped')::boolean, false) then
      raise exception 'Equipped inventory item requires a real unequip destination';
    end if;
  else
    select
      holder.character_id,
      holder.category,
      private.cheburashka_inventory_profile_for_item_v1(holder.id)
    into v_holder_character, v_holder_category, v_holder_profile
    from public.character_inventory_items holder
    where holder.id = p_holder_item_id;

    if v_holder_character is null then
      raise exception 'Inventory holder not found';
    end if;
    if v_holder_character <> p_character_id then
      raise exception 'Inventory holder must belong to the same character';
    end if;
    if v_holder_category <> 'container' then
      raise exception 'Inventory holder must be a container';
    end if;

    if v_item_category = 'container'
       and coalesce(
         (v_holder_profile->'container_profile'->>'allow_nested_containers')::boolean,
         true
       ) = false then
      raise exception 'Inventory holder does not allow nested containers';
    end if;

    with recursive chain as (
      select holder.id, holder.holder_item_id, 1 as depth
      from public.character_inventory_items holder
      where holder.id = p_holder_item_id

      union all

      select parent.id, parent.holder_item_id, chain.depth + 1
      from public.character_inventory_items parent
      join chain on parent.id = chain.holder_item_id
      where chain.depth < 17
    )
    select
      coalesce(bool_or(id = p_item_id), false),
      coalesce(bool_or(depth = 17 and holder_item_id is not null), false)
    into v_cycle, v_overflow
    from chain;

    if v_cycle then
      raise exception 'Inventory container cycle is not allowed';
    end if;
    if v_overflow then
      raise exception 'Inventory container nesting depth exceeds 16';
    end if;

    v_capacity := private.cheburashka_simple_container_capacity_v1(p_holder_item_id);

    select count(*)::integer
    into v_occupied
    from public.character_inventory_items child
    where child.character_id = p_character_id
      and child.holder_item_id = p_holder_item_id
      and child.id <> p_item_id;

    if v_occupied >= v_capacity then
      raise exception 'Inventory container is full';
    end if;
  end if;

  update public.character_inventory_items item
  set
    holder_item_id = p_holder_item_id,
    equipped = case
      when p_holder_item_id is null then item.equipped
      else false
    end,
    placement_kind = case
      when p_holder_item_id is null then 'root'
      else 'legacy'
    end,
    placement_index = null,
    grid_x = null,
    grid_y = null,
    grid_rotation = 0
  where item.id = p_item_id
    and item.character_id = p_character_id
  returning to_jsonb(item)
  into v_after;

  if p_holder_item_id is not null then
    perform private.cheburashka_assert_specialized_capacity_v1(p_holder_item_id);
  end if;
  perform private.cheburashka_assert_character_external_capacity_v1(p_character_id);

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(p_character_id),
    'before', v_before,
    'after', v_after
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
    'inventory.move',
    p_item_id,
    v_result,
    auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.move_inventory_item_simple_v1(
  uuid, uuid, uuid, bigint, uuid
) from public, anon;

grant execute on function public.move_inventory_item_simple_v1(
  uuid, uuid, uuid, bigint, uuid
) to authenticated;
