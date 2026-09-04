-- CLASS_MIGRATION_SCOPE: infrastructure
-- Character Engine resource contributions support restore:set for exact rest resets
-- (for example War Magic Power Surge resets to exactly 1 after a long rest).
-- The database validator must accept the same canonical recharge contract that
-- recover_character_resources already executes.

create or replace function private.ce_persistent_recharge_valid(p_recharge jsonb)
returns boolean
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_rule jsonb;
  v_trigger text;
  v_seen boolean := false;
begin
  if p_recharge is null or jsonb_typeof(p_recharge) <> 'object' then return false; end if;

  if p_recharge ? 'rules' then
    if jsonb_typeof(p_recharge->'rules') <> 'array' or jsonb_array_length(p_recharge->'rules') = 0 then return false; end if;
    for v_rule in select value from jsonb_array_elements(p_recharge->'rules') loop
      v_seen := true;
      v_trigger := coalesce(v_rule->>'trigger','');
      if v_trigger not in ('short_rest','long_rest','dawn') then return false; end if;
      if coalesce(v_rule->>'restore','') = 'full' then
        null;
      elsif coalesce(v_rule->>'restore','') = 'amount'
        and jsonb_typeof(v_rule->'amount') = 'number'
        and (v_rule->>'amount')::numeric > 0 then
        null;
      elsif coalesce(v_rule->>'restore','') = 'set'
        and jsonb_typeof(v_rule->'amount') = 'number'
        and (v_rule->>'amount')::numeric >= 0 then
        null;
      else
        return false;
      end if;
    end loop;
    return v_seen;
  end if;

  if jsonb_typeof(p_recharge->'triggers') <> 'array'
     or jsonb_array_length(p_recharge->'triggers') = 0 then return false; end if;

  for v_trigger in select value from jsonb_array_elements_text(p_recharge->'triggers') loop
    v_seen := true;
    if v_trigger not in ('short_rest','long_rest','dawn') then return false; end if;
  end loop;

  if coalesce(p_recharge->>'restore','') = 'full' then return v_seen; end if;
  if coalesce(p_recharge->>'restore','') = 'amount'
     and jsonb_typeof(p_recharge->'amount') = 'number'
     and (p_recharge->>'amount')::numeric > 0 then return v_seen; end if;
  if coalesce(p_recharge->>'restore','') = 'set'
     and jsonb_typeof(p_recharge->'amount') = 'number'
     and (p_recharge->>'amount')::numeric >= 0 then return v_seen; end if;
  return false;
end;
$function$;
