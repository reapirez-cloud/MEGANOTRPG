-- Scope the extra AI-world room password to the owner's current first
-- experimental slot. Other users' slot 01 remains directly accessible.

do $patch$
declare
  v_oid oid;
  v_def text;
  v_next text;
  v_name text;
begin
  foreach v_name in array array['open_ai_world_slot_v2','open_ai_world_slot_v3']
  loop
    select p.oid into v_oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=v_name
      and p.prokind='f'
    order by p.oid desc
    limit 1;

    if v_oid is null then
      raise exception '% not found',v_name;
    end if;

    v_def:=pg_get_functiondef(v_oid);
    v_next:=replace(
      v_def,
      'if v_slot.slot_index=1 then',
      'if v_slot.id=''7c911141-669c-469c-bc40-2e898841774c''::uuid then'
    );

    if v_next=v_def then
      if position('7c911141-669c-469c-bc40-2e898841774c' in v_def)>0 then
        continue;
      end if;
      raise exception '% lock patch target not found',v_name;
    end if;

    execute v_next;
  end loop;
end;
$patch$;
