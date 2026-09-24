-- Remove PL/pgSQL output-column ambiguity from AI-world slot membership upsert.
-- open_ai_world_slot_v2 returns a column named campaign_id, so the old
-- ON CONFLICT(campaign_id,user_id) could be parsed as a PL/pgSQL variable.

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
    and p.proname='open_ai_world_slot_v2'
    and pg_get_function_identity_arguments(p.oid)='p_slot_id uuid';

  if v_oid is null then
    raise exception 'open_ai_world_slot_v2(uuid) not found';
  end if;

  v_def:=pg_get_functiondef(v_oid);
  v_next:=replace(
    v_def,
    'on conflict(campaign_id, user_id) do update set',
    'on conflict on constraint campaign_members_pkey do update set'
  );

  if v_next=v_def then
    raise exception 'open_ai_world_slot_v2 conflict patch target not found';
  end if;

  execute v_next;
end;
$patch$;
