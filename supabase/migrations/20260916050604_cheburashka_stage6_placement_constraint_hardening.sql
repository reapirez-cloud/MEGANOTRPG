-- Cheburashka Stage 6 hardening: table-level spatial invariants.
-- Applied live as 20260916050604_cheburashka_stage6_placement_constraint_hardening.

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_placement_shape_check,
  add constraint character_inventory_items_placement_shape_check
    check (
      (placement_kind = 'root'
        and holder_item_id is null
        and placement_index is null
        and grid_x is null
        and grid_y is null
        and grid_rotation = 0)
      or
      (placement_kind = 'grid'
        and holder_item_id is not null
        and placement_index is null
        and grid_x is not null and grid_x >= 0
        and grid_y is not null and grid_y >= 0)
      or
      (placement_kind = 'hand'
        and holder_item_id is null
        and placement_index in (0,1)
        and grid_x is null
        and grid_y is null
        and grid_rotation = 0)
      or
      (placement_kind = 'external'
        and holder_item_id is null
        and placement_index is not null and placement_index >= 0
        and grid_x is null
        and grid_y is null
        and grid_rotation = 0)
      or
      (placement_kind = 'legacy'
        and holder_item_id is not null
        and placement_index is null
        and grid_x is null
        and grid_y is null
        and grid_rotation = 0)
    );

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_equipped_spatial_check,
  add constraint character_inventory_items_equipped_spatial_check
    check (
      not equipped
      or (
        placement_kind = 'root'
        and holder_item_id is null
        and placement_index is null
        and grid_x is null
        and grid_y is null
        and grid_rotation = 0
      )
    );
