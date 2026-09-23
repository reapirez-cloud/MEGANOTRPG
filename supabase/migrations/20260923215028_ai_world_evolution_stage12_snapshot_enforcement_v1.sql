-- CLASS_MIGRATION_SCOPE: infrastructure
-- Stage 12 enforcement: every world/NPC/location background event must atomically produce a compact replacement snapshot.

create or replace function private.merge_ai_background_event_snapshot_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.entity_scope in ('world','npc','location') then
    if coalesce(new.effect_payload->>'snapshot_mode','')<>'replace' then
      raise exception using
        errcode='22023',
        message='ai_background_event_snapshot_payload_required';
    end if;

    perform private.merge_ai_background_event_snapshot_v1(new.id);
  end if;

  return new;
end;
$$;

revoke all on function private.merge_ai_background_event_snapshot_trigger_v1()
  from public, anon, authenticated;
