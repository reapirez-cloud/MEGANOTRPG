-- CLASS_MIGRATION_SCOPE: infrastructure
-- Fix the AI-world unlock path.
-- ensure_ai_world_slots_v2() RETURNS TABLE columns are PL/pgSQL variables too,
-- so ON CONFLICT(owner_user_id, slot_index) is ambiguous inside the function.
-- Use the named UNIQUE constraint, matching the existing open_ai_world_slot_v2 fix.

do $patch$
declare
  v_oid oid;
  v_def text;
  v_next text;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='ensure_ai_world_slots_v2'
    and pg_get_function_identity_arguments(p.oid)='';

  if v_oid is null then
    raise exception 'ensure_ai_world_slots_v2() not found';
  end if;

  v_def:=pg_get_functiondef(v_oid);

  if position(
    'on conflict on constraint ai_world_slots_owner_user_id_slot_index_key do nothing;'
    in v_def
  ) > 0 then
    return;
  end if;

  v_next:=replace(
    v_def,
    'on conflict(owner_user_id, slot_index) do nothing;',
    'on conflict on constraint ai_world_slots_owner_user_id_slot_index_key do nothing;'
  );

  if v_next=v_def then
    raise exception 'ensure_ai_world_slots_v2 conflict patch target not found';
  end if;

  execute v_next;
end;
$patch$;
