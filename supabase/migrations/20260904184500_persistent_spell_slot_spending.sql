-- CLASS_MIGRATION_SCOPE: infrastructure
-- Character Engine owns parser-defined spell slots in character_resource_states.
-- Keep every generic class/chat resource cost on that same persistent ledger.
-- Legacy cast_prepared_spell keeps its separate legacy slot-storage path and is intentionally
-- not routed through this helper.

create or replace function private.consume_character_resource_costs(
  p_character_id uuid,
  p_costs jsonb,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cost jsonb;
  v_state_key text;
  v_amount integer;
  v_current integer;
  v_max integer;
  v_label text;
  v_recharge jsonb;
begin
  if p_costs is null or p_costs = '[]'::jsonb then
    return;
  end if;
  if p_character_id is null then
    raise exception 'Character is required for resource costs';
  end if;
  if not private.can_operate_character_resources(p_character_id, p_user_id) then
    raise exception 'Not allowed';
  end if;
  if jsonb_typeof(p_costs) <> 'array' then
    raise exception 'Resource costs must be an array';
  end if;

  for v_cost in select value from jsonb_array_elements(p_costs) loop
    v_state_key := trim(coalesce(v_cost ->> 'stateKey', ''));
    v_amount := coalesce((v_cost ->> 'amount')::integer, 0);
    if v_state_key = '' or v_amount < 1 or v_amount > 10000 then
      raise exception 'Invalid resource cost';
    end if;

    select current, max_snapshot, label, recharge
    into v_current, v_max, v_label, v_recharge
    from public.character_resource_states
    where character_id = p_character_id
      and state_key = v_state_key
    for update;

    if v_max is null then
      v_max := greatest(0, least(100000, coalesce((v_cost ->> 'max')::integer, 0)));
      v_current := greatest(0, least(v_max, coalesce((v_cost ->> 'current')::integer, v_max)));
      v_label := left(trim(coalesce(v_cost ->> 'label', v_state_key)), 160);
      v_recharge := coalesce(
        v_cost -> 'recharge',
        '{"triggers":["never"],"restore":"full"}'::jsonb
      );

      insert into public.character_resource_states(
        character_id,
        state_key,
        current,
        max_snapshot,
        label,
        recharge,
        updated_by
      )
      values(
        p_character_id,
        v_state_key,
        v_current,
        v_max,
        v_label,
        v_recharge,
        p_user_id
      )
      on conflict(character_id, state_key) do nothing;

      select current, max_snapshot, label, recharge
      into v_current, v_max, v_label, v_recharge
      from public.character_resource_states
      where character_id = p_character_id
        and state_key = v_state_key
      for update;
    end if;

    v_label := coalesce(nullif(trim(v_label), ''), v_state_key);
    if v_current < v_amount then
      raise exception 'Недостаточно ресурса: %', v_label;
    end if;

    update public.character_resource_states
    set current = current - v_amount,
        updated_by = p_user_id,
        updated_at = now()
    where character_id = p_character_id
      and state_key = v_state_key;
  end loop;
end;
$function$;

create or replace function public.spend_character_resources(
  p_character_id uuid,
  p_costs jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  perform private.consume_character_resource_costs(
    p_character_id,
    coalesce(p_costs, '[]'::jsonb),
    auth.uid()
  );
end;
$function$;

revoke all on function public.spend_character_resources(uuid, jsonb) from public;
grant execute on function public.spend_character_resources(uuid, jsonb) to authenticated;
grant execute on function public.spend_character_resources(uuid, jsonb) to service_role;
