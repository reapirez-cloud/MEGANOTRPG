-- Cheburashka stage 1 runtime closure.
-- Inventory state remains readable through RLS, but client mutations must pass
-- through the versioned/idempotent Cheburashka RPC surface.

revoke insert, update, delete
on table public.character_inventory_items
from anon, authenticated;

grant select
on table public.character_inventory_items
to authenticated;

-- Retire pre-versioned inventory mutation endpoints from the client API.
-- They remain defined for database-level compatibility, but signed-in clients
-- can no longer bypass optimistic locking or command receipts through them.
revoke execute
on function public.consume_inventory_item_v1(uuid, uuid, integer, uuid)
from public, anon, authenticated;

revoke execute
on function public.transfer_inventory_item_v1(uuid, uuid, uuid, integer, uuid)
from public, anon, authenticated;

revoke execute
on function public.set_character_inventory_equipped(uuid, boolean, text)
from public, anon, authenticated;

-- Keep the canonical Cheburashka API explicit.
grant execute
on function public.create_inventory_item_v1(uuid, jsonb, uuid)
to authenticated;

grant execute
on function public.update_inventory_item_v1(uuid, uuid, jsonb, bigint, uuid)
to authenticated;

grant execute
on function public.remove_inventory_item_v1(uuid, uuid, bigint, uuid)
to authenticated;

grant execute
on function public.set_inventory_item_equipped_v1(uuid, uuid, boolean, text, bigint, uuid)
to authenticated;

grant execute
on function public.consume_inventory_item_v2(uuid, uuid, integer, bigint, uuid)
to authenticated;

grant execute
on function public.transfer_inventory_item_v2(uuid, uuid, uuid, integer, bigint, uuid)
to authenticated;
