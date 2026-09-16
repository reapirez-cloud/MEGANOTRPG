-- Cheburashka stage 2: usable items, charge recovery, and recovery bridge.

create or replace function private.cheburashka_recharge_target_v1(
  p_item_state jsonb,
  p_trigger text,
  p_current integer,
  p_max integer
)
returns integer
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_recharge jsonb := coalesce(p_item_state->'recharge', '{}'::jsonb);
  v_rule jsonb;
  v_restore text;
  v_amount integer := 0;
  v_current integer := greatest(coalesce(p_current, 0), 0);
  v_max integer := greatest(coalesce(p_max, 0), 0);
begin
  if p_trigger not in ('short_rest', 'long_rest', 'dawn', 'manual') then
    return v_current;
  end if;
  if jsonb_typeof(v_recharge) <> 'object' or v_max < 1 then
    return v_current;
  end if;
  if jsonb_typeof(v_recharge->'rules') = 'array' then
    select rule into v_rule
    from jsonb_array_elements(v_recharge->'rules') rr(rule)
    where rule->>'trigger' = p_trigger and jsonb_typeof(rule) = 'object'
    limit 1;
  end if;
  if v_rule is null
     and jsonb_typeof(v_recharge->'triggers') = 'array'
     and exists (
       select 1 from jsonb_array_elements_text(v_recharge->'triggers') t(value)
       where t.value = p_trigger
     ) then
    v_rule := v_recharge;
  end if;
  if v_rule is null then
    return least(v_current, v_max);
  end if;
  v_restore := coalesce(nullif(v_rule->>'restore', ''), 'full');
  if v_restore = 'amount' then
    if coalesce(v_rule->>'amount', '') ~ '^[0-9]+$' then
      v_amount := greatest((v_rule->>'amount')::integer, 0);
    end if;
    return least(v_max, v_current + v_amount);
  end if;
  return v_max;
end;
$function$;

revoke execute on function private.cheburashka_recharge_target_v1(jsonb, text, integer, integer)
from public, anon, authenticated;

create or replace function private.cheburashka_recover_inventory_items_v1(
  p_character_id uuid,
  p_trigger text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_changed integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_trigger not in ('short_rest', 'long_rest', 'dawn', 'manual') then
    raise exception 'Unsupported recovery trigger';
  end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM or owner can restore inventory charges';
  end if;
  with candidates as (
    select item.id,
      private.cheburashka_recharge_target_v1(
        item.item_state,p_trigger,item.charges_current,item.charges_max
      ) as next_charges
    from public.character_inventory_items item
    where item.character_id = p_character_id
      and item.usage_mode = 'charges'
      and item.charges_max is not null
  )
  update public.character_inventory_items item
  set charges_current = candidates.next_charges
  from candidates
  where item.id = candidates.id
    and coalesce(item.charges_current, 0) is distinct from candidates.next_charges;
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$function$;

revoke execute on function private.cheburashka_recover_inventory_items_v1(uuid, text)
from public, anon, authenticated;

create or replace function private.cheburashka_consume_inventory_item_v2(
  p_character_id uuid,p_item_id uuid,p_amount integer,p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before jsonb; v_after jsonb; v_usage_mode text;
  v_quantity integer; v_charges integer; v_version bigint;
begin
  if p_amount is null or p_amount < 1 or p_amount > 10000 then raise exception 'Inventory amount must be between 1 and 10000'; end if;
  if p_expected_version is null or p_expected_version < 1 then raise exception 'Expected inventory version is required'; end if;
  select to_jsonb(item),item.usage_mode,item.quantity,item.charges_current,item.version
  into v_before,v_usage_mode,v_quantity,v_charges,v_version
  from public.character_inventory_items item
  where item.id=p_item_id and item.character_id=p_character_id
  for update;
  if v_before is null then raise exception 'Inventory item not found for this character'; end if;
  if v_version <> p_expected_version then raise exception 'Inventory version conflict: expected %, current %',p_expected_version,v_version; end if;
  if v_usage_mode='none' then
    raise exception 'Inventory item is not usable';
  elsif v_usage_mode='charges' then
    if coalesce(v_charges,0)<p_amount then raise exception 'Not enough item charges'; end if;
    update public.character_inventory_items item
    set charges_current=item.charges_current-p_amount
    where item.id=p_item_id returning to_jsonb(item) into v_after;
  else
    if v_quantity<p_amount then raise exception 'Not enough item quantity'; end if;
    if v_quantity=p_amount then
      delete from public.character_inventory_items where id=p_item_id;
      v_after:='null'::jsonb;
    else
      update public.character_inventory_items item
      set quantity=item.quantity-p_amount
      where item.id=p_item_id returning to_jsonb(item) into v_after;
    end if;
  end if;
  return jsonb_build_object('itemId',p_item_id,'affectedCharacterIds',jsonb_build_array(p_character_id),'before',v_before,'after',v_after);
end;
$function$;

revoke execute on function private.cheburashka_consume_inventory_item_v2(uuid, uuid, integer, bigint)
from public, anon, authenticated;

create or replace function public.recover_character_resources(p_character_id uuid,p_trigger text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Only GM or owner can restore resources'; end if;
  if p_trigger not in ('short_rest','long_rest','dawn','manual') then raise exception 'Unsupported recovery trigger'; end if;

  update public.character_resource_states s set
    current = coalesce(
      (
        select case
          when coalesce(rule->>'restore','full')='amount'
            then least(s.max_snapshot,s.current+greatest(0,coalesce((rule->>'amount')::integer,0)))
          else s.max_snapshot
        end
        from jsonb_array_elements(coalesce(s.recharge->'rules','[]'::jsonb)) with ordinality as rr(rule,ord)
        where rule->>'trigger'=p_trigger order by ord limit 1
      ),
      case
        when exists(
          select 1 from jsonb_array_elements_text(coalesce(s.recharge->'triggers','[]'::jsonb)) t(value)
          where t.value=p_trigger
        ) then case
          when coalesce(s.recharge->>'restore','full')='amount'
            then least(s.max_snapshot,s.current+greatest(0,coalesce((s.recharge->>'amount')::integer,0)))
          else s.max_snapshot
        end
        else s.current
      end
    ),
    updated_by=auth.uid(),updated_at=now()
  where s.character_id=p_character_id
    and (
      exists(select 1 from jsonb_array_elements(coalesce(s.recharge->'rules','[]'::jsonb)) rr(rule) where rule->>'trigger'=p_trigger)
      or exists(select 1 from jsonb_array_elements_text(coalesce(s.recharge->'triggers','[]'::jsonb)) t(value) where t.value=p_trigger)
    );

  if p_trigger='long_rest' then
    update public.character_resource_states
    set current=least(current,max_snapshot-temporary_max_bonus),
        max_snapshot=max_snapshot-temporary_max_bonus,
        temporary_max_bonus=0,updated_by=auth.uid(),updated_at=now()
    where character_id=p_character_id and temporary_max_bonus>0;
  end if;

  perform private.cheburashka_recover_inventory_items_v1(p_character_id, p_trigger);
end;
$function$;
