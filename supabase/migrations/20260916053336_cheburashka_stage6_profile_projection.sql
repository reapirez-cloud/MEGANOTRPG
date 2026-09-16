-- Cheburashka Stage 6 physical-profile projection.
-- Applied live as 20260916053336_cheburashka_stage6_profile_projection.
-- Players who may view an inventory item must receive the same safe physical
-- geometry the server validates, even when the underlying Chasovoy definition
-- is not itself player-visible.

create or replace function public.list_character_inventory_physical_profiles_v1(
  p_character_id uuid
)
returns table(item_id uuid, inventory_profile jsonb)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_view_character(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  return query
  select
    item.id,
    private.cheburashka_inventory_profile_for_item_v1(item.id)
  from public.character_inventory_items item
  where item.character_id = p_character_id
  order by item.sort_order, item.created_at, item.id;
end;
$function$;

revoke all on function public.list_character_inventory_physical_profiles_v1(uuid)
from public, anon;
grant execute on function public.list_character_inventory_physical_profiles_v1(uuid)
to authenticated;
