-- Allow deferred inventory-capacity validation to observe that a holder
-- was already removed by a cascade. There is no capacity invariant left to
-- enforce once the container row itself no longer exists.

create or replace function private.cheburashka_assert_specialized_capacity_v1(
  p_holder_item_id uuid
)
returns void
language plpgsql
stable
set search_path=''
as $function$
declare
  v_container jsonb;
  v_rule jsonb;
  v_role text;
  v_max integer;
  v_quantity bigint;
begin
  if p_holder_item_id is null then
    return;
  end if;

  if not exists(
    select 1
    from public.character_inventory_items item
    where item.id=p_holder_item_id
  ) then
    return;
  end if;

  v_container :=
    private.cheburashka_inventory_profile_for_item_v1(p_holder_item_id)
    -> 'container_profile';

  if v_container is null or jsonb_typeof(v_container) <> 'object' then
    return;
  end if;

  for v_rule in
    select value
    from jsonb_array_elements(
      coalesce(v_container->'specialized_capacity','[]'::jsonb)
    )
  loop
    v_role:=btrim(coalesce(v_rule->>'semantic_role',''));
    v_max:=coalesce((v_rule->>'max_quantity')::integer,0);

    if v_role='' or v_max<1 then
      continue;
    end if;

    select coalesce(sum(child.quantity),0)
      into v_quantity
    from public.character_inventory_items child
    where child.holder_item_id=p_holder_item_id
      and child.placement_kind in ('grid','legacy')
      and private.cheburashka_inventory_profile_for_item_v1(child.id)
          ->> 'semantic_role'=v_role;

    if v_quantity>v_max then
      raise exception
        'Specialized inventory capacity exceeded: role %, quantity %, max %',
        v_role,v_quantity,v_max;
    end if;
  end loop;
end;
$function$;
