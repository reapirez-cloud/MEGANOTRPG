-- Cheburashka Stage 6: authoritative spatial inventory runtime.
-- Applied live as 20260916044954_cheburashka_stage6_spatial_inventory.

alter table public.character_inventory_items
  add column if not exists placement_kind text not null default 'root',
  add column if not exists placement_index integer,
  add column if not exists grid_x integer,
  add column if not exists grid_y integer,
  add column if not exists grid_rotation smallint not null default 0;

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_placement_kind_check,
  add constraint character_inventory_items_placement_kind_check
    check (placement_kind in ('root','grid','hand','external','legacy')),
  drop constraint if exists character_inventory_items_grid_rotation_check,
  add constraint character_inventory_items_grid_rotation_check
    check (grid_rotation in (0,90,180,270)),
  drop constraint if exists character_inventory_items_placement_shape_check,
  add constraint character_inventory_items_placement_shape_check
    check (
      (placement_kind = 'root'
        and holder_item_id is null
        and placement_index is null
        and grid_x is null
        and grid_y is null)
      or
      (placement_kind = 'grid'
        and holder_item_id is not null
        and placement_index is null
        and grid_x is not null and grid_x >= 0
        and grid_y is not null and grid_y >= 0)
      or
      (placement_kind in ('hand','external')
        and holder_item_id is null
        and placement_index is not null and placement_index >= 0
        and grid_x is null
        and grid_y is null)
      or
      (placement_kind = 'legacy'
        and holder_item_id is not null
        and placement_index is null
        and grid_x is null
        and grid_y is null)
    );

create unique index if not exists character_inventory_items_character_carry_slot_unique
  on public.character_inventory_items(character_id, placement_kind, placement_index)
  where placement_kind in ('hand','external');

create index if not exists character_inventory_items_holder_grid_idx
  on public.character_inventory_items(holder_item_id, grid_x, grid_y)
  where placement_kind = 'grid';

create or replace function private.cheburashka_legacy_holder_placement_compat_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.holder_item_id is not null
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
before insert or update of holder_item_id, placement_kind
on public.character_inventory_items
for each row
execute function private.cheburashka_legacy_holder_placement_compat_v1();

revoke execute on function private.cheburashka_legacy_holder_placement_compat_v1()
from public, anon, authenticated;

create or replace function private.cheburashka_inventory_profile_for_item_v1(p_item_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_profile jsonb;
  v_category text;
begin
  select revision.data->'inventory_profile', item.category
  into v_profile, v_category
  from public.character_inventory_items item
  left join public.reference_definition_revisions revision
    on revision.definition_id = item.definition_id
   and revision.revision = item.definition_revision
  where item.id = p_item_id;

  if v_category is null then
    raise exception 'Inventory item not found';
  end if;

  if v_profile is not null and jsonb_typeof(v_profile) = 'object' then
    return v_profile;
  end if;

  if v_category = 'container' then
    return '{
      "semantic_role":"container.legacy",
      "packing_mode":"instance",
      "footprint_mode":"compact_1x1",
      "shape_mask":["1"],
      "shape_width":1,
      "shape_height":1,
      "rotatable":false,
      "stack_max":null,
      "container_profile":{
        "internal_grid_width":6,
        "internal_grid_height":6,
        "cell_size_cm":5,
        "allow_nested_containers":true,
        "external_carry_slots":0,
        "specialized_capacity":[]
      }
    }'::jsonb;
  end if;

  return '{
    "semantic_role":"legacy.item",
    "packing_mode":"instance",
    "footprint_mode":"compact_1x1",
    "shape_mask":["1"],
    "shape_width":1,
    "shape_height":1,
    "rotatable":false,
    "stack_max":null
  }'::jsonb;
end;
$function$;

revoke execute on function private.cheburashka_inventory_profile_for_item_v1(uuid)
from public, anon, authenticated;

create or replace function private.cheburashka_inventory_shape_cells_v1(
  p_profile jsonb,
  p_rotation integer
)
returns table(cell_x integer, cell_y integer)
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_width integer := (p_profile->>'shape_width')::integer;
  v_height integer := (p_profile->>'shape_height')::integer;
  v_y integer;
  v_x integer;
  v_row text;
begin
  if p_rotation not in (0,90,180,270) then
    raise exception 'Inventory rotation must be 0, 90, 180 or 270';
  end if;

  if p_rotation <> 0
     and coalesce((p_profile->>'rotatable')::boolean, false) = false then
    raise exception 'Inventory item is not rotatable';
  end if;

  for v_y in 0..v_height - 1 loop
    v_row := p_profile->'shape_mask'->>v_y;
    for v_x in 0..v_width - 1 loop
      if substr(v_row, v_x + 1, 1) = '1' then
        if p_rotation = 0 then
          cell_x := v_x; cell_y := v_y;
        elsif p_rotation = 90 then
          cell_x := v_height - 1 - v_y; cell_y := v_x;
        elsif p_rotation = 180 then
          cell_x := v_width - 1 - v_x; cell_y := v_height - 1 - v_y;
        else
          cell_x := v_y; cell_y := v_width - 1 - v_x;
        end if;
        return next;
      end if;
    end loop;
  end loop;
end;
$function$;

revoke execute on function private.cheburashka_inventory_shape_cells_v1(jsonb,integer)
from public, anon, authenticated;

create or replace function private.cheburashka_external_carry_capacity_v1(p_character_id uuid)
returns integer
language sql
stable
set search_path = ''
as $function$
  select coalesce(sum(
    case
      when item.equipped
        or (item.category = 'container' and item.placement_kind = 'root')
      then coalesce(
        ((private.cheburashka_inventory_profile_for_item_v1(item.id)
          ->'container_profile'->>'external_carry_slots')::integer),
        0
      )
      else 0
    end
  ), 0)::integer
  from public.character_inventory_items item
  where item.character_id = p_character_id;
$function$;

revoke execute on function private.cheburashka_external_carry_capacity_v1(uuid)
from public, anon, authenticated;

create or replace function private.cheburashka_assert_spatial_placement_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_target_kind text,
  p_holder_item_id uuid,
  p_grid_x integer,
  p_grid_y integer,
  p_rotation integer,
  p_slot_index integer
)
returns void
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_profile jsonb;
  v_item_category text;
  v_container_profile jsonb;
  v_grid_width integer;
  v_grid_height integer;
  v_bounds_width integer;
  v_bounds_height integer;
  v_capacity integer;
  v_holder_character uuid;
  v_holder_category text;
begin
  select item.category into v_item_category
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id;

  if v_item_category is null then
    raise exception 'Inventory item not found for this character';
  end if;

  v_profile := private.cheburashka_inventory_profile_for_item_v1(p_item_id);

  if p_target_kind = 'root' then
    if p_holder_item_id is not null
       or p_grid_x is not null
       or p_grid_y is not null
       or p_slot_index is not null then
      raise exception 'Root inventory placement does not accept holder, grid coordinates or slot index';
    end if;
    return;
  end if;

  if p_target_kind = 'hand' then
    if p_holder_item_id is not null or p_grid_x is not null or p_grid_y is not null then
      raise exception 'Hand placement does not accept holder or grid coordinates';
    end if;
    if p_slot_index not in (0,1) then
      raise exception 'Inventory hand index must be 0 or 1';
    end if;
    if exists (
      select 1
      from public.character_inventory_items occupied
      where occupied.character_id = p_character_id
        and occupied.placement_kind = 'hand'
        and occupied.placement_index = p_slot_index
        and occupied.id <> p_item_id
    ) then
      raise exception 'Inventory hand slot is occupied';
    end if;
    return;
  end if;

  if p_target_kind = 'external' then
    if p_holder_item_id is not null or p_grid_x is not null or p_grid_y is not null then
      raise exception 'External carry placement does not accept holder or grid coordinates';
    end if;
    if p_slot_index is null or p_slot_index < 0 then
      raise exception 'External carry slot index is required';
    end if;
    v_capacity := private.cheburashka_external_carry_capacity_v1(p_character_id);
    if p_slot_index >= v_capacity then
      raise exception 'External carry slot is unavailable';
    end if;
    if exists (
      select 1
      from public.character_inventory_items occupied
      where occupied.character_id = p_character_id
        and occupied.placement_kind = 'external'
        and occupied.placement_index = p_slot_index
        and occupied.id <> p_item_id
    ) then
      raise exception 'External carry slot is occupied';
    end if;
    return;
  end if;

  if p_target_kind <> 'grid' then
    raise exception 'Unsupported inventory placement kind';
  end if;

  if p_holder_item_id is null or p_grid_x is null or p_grid_y is null then
    raise exception 'Grid placement requires holder and coordinates';
  end if;
  if p_grid_x < 0 or p_grid_y < 0 then
    raise exception 'Inventory grid coordinates cannot be negative';
  end if;
  if p_slot_index is not null then
    raise exception 'Grid placement does not accept carry slot index';
  end if;

  select holder.character_id, holder.category
  into v_holder_character, v_holder_category
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
  if p_holder_item_id = p_item_id then
    raise exception 'Inventory item cannot contain itself';
  end if;

  v_container_profile :=
    private.cheburashka_inventory_profile_for_item_v1(p_holder_item_id)->'container_profile';

  if v_container_profile is null or jsonb_typeof(v_container_profile) <> 'object' then
    raise exception 'Inventory holder has no container profile';
  end if;

  if v_item_category = 'container'
     and coalesce((v_container_profile->>'allow_nested_containers')::boolean, true) = false then
    raise exception 'Inventory holder does not allow nested containers';
  end if;

  v_grid_width := (v_container_profile->>'internal_grid_width')::integer;
  v_grid_height := (v_container_profile->>'internal_grid_height')::integer;

  select coalesce(max(cell_x), -1) + 1, coalesce(max(cell_y), -1) + 1
  into v_bounds_width, v_bounds_height
  from private.cheburashka_inventory_shape_cells_v1(v_profile, p_rotation);

  if p_grid_x + v_bounds_width > v_grid_width
     or p_grid_y + v_bounds_height > v_grid_height then
    raise exception 'Inventory placement is out of bounds';
  end if;

  if exists (
    select 1
    from private.cheburashka_inventory_shape_cells_v1(v_profile, p_rotation) source_cell
    join public.character_inventory_items other
      on other.holder_item_id = p_holder_item_id
     and other.placement_kind = 'grid'
     and other.id <> p_item_id
    cross join lateral private.cheburashka_inventory_shape_cells_v1(
      private.cheburashka_inventory_profile_for_item_v1(other.id),
      other.grid_rotation
    ) other_cell
    where p_grid_x + source_cell.cell_x = other.grid_x + other_cell.cell_x
      and p_grid_y + source_cell.cell_y = other.grid_y + other_cell.cell_y
  ) then
    raise exception 'Inventory placement overlaps another item';
  end if;
end;
$function$;

revoke execute on function private.cheburashka_assert_spatial_placement_v1(
  uuid,uuid,text,uuid,integer,integer,integer,integer
) from public, anon, authenticated;

create or replace function public.move_inventory_item_v2(
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
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_version bigint;
  v_cycle boolean := false;
  v_overflow boolean := false;
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

  select to_jsonb(item), item.version
  into v_before, v_version
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

  if p_target_kind = 'grid' then
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

    if v_cycle then raise exception 'Inventory container cycle is not allowed'; end if;
    if v_overflow then
      raise exception 'Inventory container nesting depth exceeds 16';
    end if;
  end if;

  perform private.cheburashka_assert_spatial_placement_v1(
    p_character_id, p_item_id, p_target_kind, p_holder_item_id,
    p_grid_x, p_grid_y, coalesce(p_rotation,0), p_slot_index
  );

  if (v_before->>'placement_kind') is not distinct from p_target_kind
     and (v_before->>'holder_item_id') is not distinct from p_holder_item_id::text
     and ((v_before->>'grid_x')::integer) is not distinct from p_grid_x
     and ((v_before->>'grid_y')::integer) is not distinct from p_grid_y
     and coalesce((v_before->>'grid_rotation')::integer, 0) = coalesce(p_rotation, 0)
     and ((v_before->>'placement_index')::integer) is not distinct from p_slot_index
     and coalesce((v_before->>'equipped')::boolean, false) = false then
    v_after := v_before;
  else
    update public.character_inventory_items item
    set
      holder_item_id = case when p_target_kind = 'grid' then p_holder_item_id else null end,
      placement_kind = p_target_kind,
      placement_index = case
        when p_target_kind in ('hand','external') then p_slot_index
        else null
      end,
      grid_x = case when p_target_kind = 'grid' then p_grid_x else null end,
      grid_y = case when p_target_kind = 'grid' then p_grid_y else null end,
      grid_rotation = case
        when p_target_kind = 'grid' then coalesce(p_rotation,0)
        else 0
      end,
      equipped = false
    where item.id = p_item_id
      and item.character_id = p_character_id
    returning to_jsonb(item)
    into v_after;
  end if;

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(p_character_id),
    'before', v_before,
    'after', v_after
  );

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind,
    aggregate_id, result, created_by
  )
  values (
    p_command_id, v_campaign_id, 'cheburashka', 'inventory.move',
    p_item_id, v_result, auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.move_inventory_item_v2(
  uuid,uuid,text,uuid,integer,integer,integer,integer,bigint,uuid
) from public, anon;
grant execute on function public.move_inventory_item_v2(
  uuid,uuid,text,uuid,integer,integer,integer,integer,bigint,uuid
) to authenticated;

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

  select to_jsonb(item), item.version, item.category
  into v_before, v_version, v_category
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
  if p_equipped and v_category <> 'equipment' then
    raise exception 'Only equipment items can be equipped';
  end if;

  update public.character_inventory_items item
  set
    equipped = p_equipped,
    equipment_slot = case
      when v_category = 'equipment' then p_equipment_slot
      else null
    end,
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
    'after', v_after
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
