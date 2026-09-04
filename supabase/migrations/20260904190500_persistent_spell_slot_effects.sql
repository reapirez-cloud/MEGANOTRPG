-- CLASS_MIGRATION_SCOPE: infrastructure
-- Keep every CE resource read/effect on character_resource_states, including parser-owned spell slots.
-- Template runtime helpers now use one persistent CE ledger for both ordinary class resources and spell slots.

create or replace function private.character_runtime_resource_snapshot(
  p_character_id uuid,
  p_state_key text
)
returns table(
  current_value integer,
  max_value integer,
  label_value text,
  recharge_value jsonb
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return query
  select s.current,
         s.max_snapshot,
         coalesce(nullif(s.label,''),p_state_key),
         s.recharge
  from public.character_resource_states s
  where s.character_id=p_character_id
    and s.state_key=p_state_key;
end;
$function$;

create or replace function private.apply_character_runtime_resource_effect(
  p_character_id uuid,
  p_state_key text,
  p_operation text,
  p_amount integer,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_current integer;
  v_max integer;
  v_label text;
  v_operation text:=upper(coalesce(p_operation,''));
begin
  select s.current,
         s.max_snapshot,
         coalesce(nullif(s.label,''),p_state_key)
  into v_current,v_max,v_label
  from public.character_resource_states s
  where s.character_id=p_character_id
    and s.state_key=p_state_key
  for update;

  if v_max is null then
    raise exception 'Ресурс не синхронизирован: %',p_state_key;
  end if;

  if v_operation='RESTORE' then
    if v_current>=v_max and p_amount>0 then
      raise exception 'Ресурс уже заполнен: %',v_label;
    end if;
    update public.character_resource_states
    set current=least(max_snapshot,current+greatest(0,p_amount)),
        updated_by=p_actor,
        updated_at=now()
    where character_id=p_character_id and state_key=p_state_key;
  elsif v_operation='SPEND' then
    if v_current<greatest(0,p_amount) then
      raise exception 'Недостаточно ресурса: %',v_label;
    end if;
    update public.character_resource_states
    set current=current-greatest(0,p_amount),
        updated_by=p_actor,
        updated_at=now()
    where character_id=p_character_id and state_key=p_state_key;
  elsif v_operation='SET' then
    update public.character_resource_states
    set current=greatest(0,least(max_snapshot,greatest(0,p_amount))),
        updated_by=p_actor,
        updated_at=now()
    where character_id=p_character_id and state_key=p_state_key;
  else
    raise exception 'Unsupported resource effect operation: %',v_operation;
  end if;
end;
$function$;
