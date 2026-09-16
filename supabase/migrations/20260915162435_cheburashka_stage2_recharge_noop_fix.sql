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
    return v_current;
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
