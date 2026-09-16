-- Cheburashka Stage 6 equipment-state guard.
-- Applied live as 20260916053628_cheburashka_stage6_equipment_state_guard.
-- The final table state may never contain overlapping equipment slots, even
-- when a legacy RPC is still serving the currently deployed production client.

create or replace function private.cheburashka_assert_equipment_conflicts_v1(
  p_character_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $function$
begin
  if p_character_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.character_inventory_items left_item
    join public.character_inventory_items right_item
      on right_item.character_id = left_item.character_id
     and right_item.id > left_item.id
     and right_item.equipped = true
    where left_item.character_id = p_character_id
      and left_item.equipped = true
      and (
        right_item.equipment_slot = left_item.equipment_slot
        or (
          left_item.equipment_slot = 'two_hands'
          and right_item.equipment_slot in ('main_hand','off_hand')
        )
        or (
          right_item.equipment_slot = 'two_hands'
          and left_item.equipment_slot in ('main_hand','off_hand')
        )
      )
  ) then
    raise exception 'Conflicting equipped inventory items are not allowed';
  end if;
end;
$function$;

revoke execute on function private.cheburashka_assert_equipment_conflicts_v1(uuid)
from public, anon, authenticated;

create or replace function private.cheburashka_validate_equipment_conflicts_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    perform private.cheburashka_assert_equipment_conflicts_v1(old.character_id);
    return old;
  end if;

  perform private.cheburashka_assert_equipment_conflicts_v1(new.character_id);

  if tg_op = 'UPDATE' and old.character_id is distinct from new.character_id then
    perform private.cheburashka_assert_equipment_conflicts_v1(old.character_id);
  end if;

  return new;
end;
$function$;

revoke execute on function private.cheburashka_validate_equipment_conflicts_v1()
from public, anon, authenticated;

drop trigger if exists character_inventory_items_validate_equipment_conflicts
on public.character_inventory_items;

create constraint trigger character_inventory_items_validate_equipment_conflicts
after insert or update or delete
on public.character_inventory_items
deferrable initially deferred
for each row
execute function private.cheburashka_validate_equipment_conflicts_v1();
