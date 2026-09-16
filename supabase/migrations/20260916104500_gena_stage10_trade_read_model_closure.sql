-- Stage 10 read-model closure: qualify RETURNS TABLE output names inside
-- PL/pgSQL so PostgreSQL cannot confuse them with CTE columns.

create or replace function public.list_trade_visible_inventory_v1(
  p_session_id uuid,
  p_viewer_character_id uuid
)
returns table(
  item jsonb,
  inventory_profile jsonb,
  visibility_kind text,
  visibility_group text,
  source_item_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_other uuid;
begin
  if not private.can_act_trade_side_v1(p_session_id,p_viewer_character_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  v_other:=private.trade_other_side_v1(p_session_id,p_viewer_character_id);
  if v_other is null then raise exception 'Trade side not found'; end if;

  return query
  with recursive visible as (
    select
      grant_row.item_id id,
      grant_row.item_id source_id,
      grant_row.visibility_kind,
      grant_row.visibility_group,
      0 depth
    from public.trade_visible_items grant_row
    where grant_row.session_id=p_session_id
      and grant_row.owner_character_id=v_other

    union all

    select
      child.id,
      visible.source_id,
      visible.visibility_kind,
      visible.visibility_group,
      visible.depth+1
    from public.character_inventory_items child
    join visible on child.holder_item_id=visible.id
    where visible.visibility_kind='container'
      and visible.depth<16
  ),
  distinct_visible as (
    select distinct on (visible.id)
      visible.id,
      visible.source_id,
      visible.visibility_kind,
      visible.visibility_group
    from visible
    order by visible.id,
      case visible.visibility_kind when 'item' then 1 when 'assortment' then 2 else 3 end
  )
  select
    to_jsonb(i),
    private.cheburashka_inventory_profile_for_item_v1(i.id),
    dv.visibility_kind,
    dv.visibility_group,
    dv.source_id
  from distinct_visible dv
  join public.character_inventory_items i on i.id=dv.id
  where i.character_id=v_other
    and i.world_storage_id is null
    and i.surface_id is null
  order by i.sort_order,i.created_at,i.id;
end;
$function$;
revoke all on function public.list_trade_visible_inventory_v1(uuid,uuid)
from public,anon;
grant execute on function public.list_trade_visible_inventory_v1(uuid,uuid)
to authenticated;
