-- Keep the quick-access shortcut singular and character-local.

create unique index if not exists character_inventory_items_one_quick_access_per_character
  on public.character_inventory_items(character_id)
  where character_id is not null
    and item_state ->> 'quick_access' = 'true';

create or replace function private.cheburashka_clear_quick_access_on_owner_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.character_id is distinct from old.character_id
     or new.world_storage_id is distinct from old.world_storage_id
     or new.surface_id is distinct from old.surface_id then
    new.item_state := coalesce(new.item_state, '{}'::jsonb) - 'quick_access';
  end if;
  return new;
end;
$function$;

revoke all on function private.cheburashka_clear_quick_access_on_owner_change_v1()
from public, anon, authenticated;

drop trigger if exists character_inventory_items_clear_quick_access_owner_change_v1
  on public.character_inventory_items;

create trigger character_inventory_items_clear_quick_access_owner_change_v1
before update of character_id, world_storage_id, surface_id
on public.character_inventory_items
for each row
execute function private.cheburashka_clear_quick_access_on_owner_change_v1();
