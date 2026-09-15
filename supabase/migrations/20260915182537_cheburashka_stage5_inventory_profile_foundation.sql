-- Cheburashka Stage 5A: physical inventory profile foundation.
-- Live migration version: 20260915182537.
-- New clients use instance-first semantics. The helper keeps a narrow quantity>1
-- compatibility bridge for the old production client until rollout completes.

alter table public.character_inventory_items
  alter column stack_mode set default 'instance';

CREATE OR REPLACE FUNCTION private.cheburashka_assert_inventory_profile_v1(p_profile jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_semantic_role text;
  v_packing text;
  v_footprint text;
  v_width integer;
  v_height integer;
  v_stack_max integer;
  v_mask jsonb;
  v_row jsonb;
  v_row_text text;
  v_has_cell boolean := false;
  v_dimensions jsonb;
  v_container jsonb;
  v_capacity jsonb;
  v_capacity_row jsonb;
  v_key text;
  v_number numeric;
begin
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Item inventory_profile must be an object';
  end if;

  v_semantic_role := btrim(coalesce(p_profile->>'semantic_role', ''));
  if v_semantic_role = '' or char_length(v_semantic_role) > 80 then
    raise exception 'inventory_profile.semantic_role is required and must be <= 80 chars';
  end if;

  v_packing := p_profile->>'packing_mode';
  if v_packing not in ('instance', 'bulk_stack') then
    raise exception 'inventory_profile.packing_mode must be instance or bulk_stack';
  end if;

  v_footprint := p_profile->>'footprint_mode';
  if v_footprint not in ('compact_1x1', 'shape') then
    raise exception 'inventory_profile.footprint_mode must be compact_1x1 or shape';
  end if;

  begin
    v_width := (p_profile->>'shape_width')::integer;
    v_height := (p_profile->>'shape_height')::integer;
  exception when others then
    raise exception 'inventory_profile shape_width/shape_height must be integers';
  end;

  if v_width < 1 or v_width > 80 or v_height < 1 or v_height > 80 then
    raise exception 'inventory_profile shape bounds must be between 1 and 80 cells';
  end if;

  if not (p_profile ? 'rotatable') or jsonb_typeof(p_profile->'rotatable') <> 'boolean' then
    raise exception 'inventory_profile.rotatable must be boolean';
  end if;

  v_mask := p_profile->'shape_mask';
  if jsonb_typeof(v_mask) <> 'array' then
    raise exception 'inventory_profile.shape_mask must be an array of strings';
  end if;

  if jsonb_array_length(v_mask) <> v_height then
    raise exception 'inventory_profile.shape_mask height does not match shape_height';
  end if;

  for v_row in select value from jsonb_array_elements(v_mask)
  loop
    if jsonb_typeof(v_row) <> 'string' then
      raise exception 'inventory_profile.shape_mask rows must be strings';
    end if;
    v_row_text := v_row #>> '{}';
    if char_length(v_row_text) <> v_width or v_row_text !~ '^[01]+$' then
      raise exception 'inventory_profile.shape_mask row does not match shape_width';
    end if;
    if position('1' in v_row_text) > 0 then
      v_has_cell := true;
    end if;
  end loop;

  if not v_has_cell then
    raise exception 'inventory_profile.shape_mask must contain at least one occupied cell';
  end if;

  if v_footprint = 'compact_1x1' and (
    v_width <> 1 or
    v_height <> 1 or
    jsonb_array_length(v_mask) <> 1 or
    (v_mask->>0) <> '1'
  ) then
    raise exception 'compact_1x1 inventory profile must use a 1x1 occupied shape';
  end if;

  if v_packing = 'bulk_stack' then
    if v_footprint <> 'compact_1x1' then
      raise exception 'bulk_stack inventory profile must use compact_1x1 footprint';
    end if;
    if not (p_profile ? 'stack_max') or p_profile->'stack_max' = 'null'::jsonb then
      raise exception 'bulk_stack inventory profile requires stack_max';
    end if;
    begin
      v_number := (p_profile->>'stack_max')::numeric;
    exception when others then
      raise exception 'inventory_profile.stack_max must be an integer';
    end;
    if v_number < 2 or trunc(v_number) <> v_number or v_number > 100000 then
      raise exception 'inventory_profile.stack_max must be an integer between 2 and 100000';
    end if;
    v_stack_max := v_number::integer;
  elsif p_profile ? 'stack_max' and p_profile->'stack_max' <> 'null'::jsonb then
    raise exception 'instance inventory profile must not define stack_max';
  end if;

  if p_profile ? 'weight_per_unit' and p_profile->'weight_per_unit' <> 'null'::jsonb then
    if jsonb_typeof(p_profile->'weight_per_unit') <> 'number' then
      raise exception 'inventory_profile.weight_per_unit must be numeric';
    end if;
    v_number := (p_profile->>'weight_per_unit')::numeric;
    if v_number < 0 then
      raise exception 'inventory_profile.weight_per_unit cannot be negative';
    end if;
  end if;

  if p_profile ? 'base_value_cp' and p_profile->'base_value_cp' <> 'null'::jsonb then
    if jsonb_typeof(p_profile->'base_value_cp') <> 'number' then
      raise exception 'inventory_profile.base_value_cp must be numeric';
    end if;
    v_number := (p_profile->>'base_value_cp')::numeric;
    if v_number < 0 or trunc(v_number) <> v_number then
      raise exception 'inventory_profile.base_value_cp must be a non-negative integer';
    end if;
  end if;

  v_dimensions := p_profile->'physical_dimensions_cm';
  if v_dimensions is not null and v_dimensions <> 'null'::jsonb then
    if jsonb_typeof(v_dimensions) <> 'object' then
      raise exception 'inventory_profile.physical_dimensions_cm must be an object';
    end if;
    foreach v_key in array array['width','height','depth']
    loop
      if v_dimensions ? v_key then
        if jsonb_typeof(v_dimensions->v_key) <> 'number' then
          raise exception 'inventory_profile physical dimension % must be numeric', v_key;
        end if;
        v_number := (v_dimensions->>v_key)::numeric;
        if v_number <= 0 then
          raise exception 'inventory_profile physical dimension % must be positive', v_key;
        end if;
      end if;
    end loop;
  end if;

  v_container := p_profile->'container_profile';
  if v_container is not null and v_container <> 'null'::jsonb then
    if jsonb_typeof(v_container) <> 'object' then
      raise exception 'inventory_profile.container_profile must be an object';
    end if;

    foreach v_key in array array['internal_grid_width','internal_grid_height']
    loop
      if not (v_container ? v_key) or jsonb_typeof(v_container->v_key) <> 'number' then
        raise exception 'container_profile.% is required and must be numeric', v_key;
      end if;
      v_number := (v_container->>v_key)::numeric;
      if v_number < 1 or v_number > 100 or trunc(v_number) <> v_number then
        raise exception 'container_profile.% must be an integer between 1 and 100', v_key;
      end if;
    end loop;

    if not (v_container ? 'cell_size_cm') or jsonb_typeof(v_container->'cell_size_cm') <> 'number' then
      raise exception 'container_profile.cell_size_cm is required and must be numeric';
    end if;
    v_number := (v_container->>'cell_size_cm')::numeric;
    if v_number <= 0 or v_number > 100 then
      raise exception 'container_profile.cell_size_cm must be > 0 and <= 100';
    end if;

    if v_container ? 'allow_nested_containers'
       and jsonb_typeof(v_container->'allow_nested_containers') <> 'boolean' then
      raise exception 'container_profile.allow_nested_containers must be boolean';
    end if;

    if v_container ? 'external_carry_slots' then
      if jsonb_typeof(v_container->'external_carry_slots') <> 'number' then
        raise exception 'container_profile.external_carry_slots must be numeric';
      end if;
      v_number := (v_container->>'external_carry_slots')::numeric;
      if v_number < 0 or v_number > 50 or trunc(v_number) <> v_number then
        raise exception 'container_profile.external_carry_slots must be an integer between 0 and 50';
      end if;
    end if;

    v_capacity := v_container->'specialized_capacity';
    if v_capacity is not null and v_capacity <> 'null'::jsonb then
      if jsonb_typeof(v_capacity) <> 'array' then
        raise exception 'container_profile.specialized_capacity must be an array';
      end if;
      for v_capacity_row in select value from jsonb_array_elements(v_capacity)
      loop
        if jsonb_typeof(v_capacity_row) <> 'object' then
          raise exception 'specialized_capacity entries must be objects';
        end if;
        if btrim(coalesce(v_capacity_row->>'semantic_role','')) = '' then
          raise exception 'specialized_capacity.semantic_role is required';
        end if;
        if not (v_capacity_row ? 'max_quantity')
           or jsonb_typeof(v_capacity_row->'max_quantity') <> 'number' then
          raise exception 'specialized_capacity.max_quantity is required and must be numeric';
        end if;
        v_number := (v_capacity_row->>'max_quantity')::numeric;
        if v_number < 1 or trunc(v_number) <> v_number or v_number > 100000 then
          raise exception 'specialized_capacity.max_quantity must be a positive integer <= 100000';
        end if;
      end loop;
    end if;
  end if;
end;
$function$

CREATE OR REPLACE FUNCTION private.cheburashka_inventory_stack_mode_v1(p_requested text, p_category text, p_usage_mode text, p_quantity integer)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_requested text := nullif(btrim(coalesce(p_requested, '')), '');
  v_mode text;
  v_forced boolean :=
    coalesce(p_usage_mode, 'none') = 'charges'
    or coalesce(p_category, 'other') in ('equipment', 'container', 'quest');
begin
  if v_requested is not null and v_requested not in ('stack', 'instance') then
    raise exception 'Unsupported inventory stack mode';
  end if;

  v_mode := case
    when v_forced then 'instance'
    when v_requested is not null then v_requested
    -- Transitional compatibility: the old UI did not send stack_mode.
    -- Singletons become instances; legacy quantity>1 remains a stack.
    when coalesce(p_quantity, 1) > 1 then 'stack'
    else 'instance'
  end;

  if coalesce(p_quantity, 0) < 1 then
    raise exception 'Inventory quantity must be at least 1';
  end if;

  if v_mode = 'instance' and p_quantity <> 1 then
    raise exception 'Inventory instance quantity must be 1';
  end if;

  return v_mode;
end;
$function$

CREATE OR REPLACE FUNCTION private.cheburashka_validate_reference_item_profile_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_kind text;
begin
  select definition.kind
  into v_kind
  from public.reference_definitions definition
  where definition.id = new.definition_id;

  -- Rollout compatibility: legacy item revisions without inventory_profile remain
  -- readable/editable by the old production client. Any profile that is present
  -- is already server-validated. A later hardening migration can make it mandatory.
  if v_kind = 'item' and new.data ? 'inventory_profile' then
    perform private.cheburashka_assert_inventory_profile_v1(
      new.data->'inventory_profile'
    );
  end if;

  return new;
end;
$function$

revoke execute
on function private.cheburashka_inventory_stack_mode_v1(text, text, text, integer)
from public, anon, authenticated;

revoke execute
on function private.cheburashka_assert_inventory_profile_v1(jsonb)
from public, anon, authenticated;

revoke execute
on function private.cheburashka_validate_reference_item_profile_v1()
from public, anon, authenticated;

drop trigger if exists reference_item_inventory_profile_guard
on public.reference_definition_revisions;

create trigger reference_item_inventory_profile_guard
before insert or update of data
on public.reference_definition_revisions
for each row
execute function private.cheburashka_validate_reference_item_profile_v1();
