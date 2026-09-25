-- Living Lore v2 hardening
-- Cover the location FK and remove projections when source records are physically deleted.

create index if not exists world_lore_entries_location_id_idx
  on public.world_lore_entries(location_id);

create or replace function private.delete_world_lore_from_memory_fact_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  delete from public.world_lore_entries
  where campaign_id=old.campaign_id
    and source_kind='memory_fact'
    and source_id=old.id::text;
  return old;
end;
$function$;

create or replace function private.delete_world_lore_from_background_event_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  delete from public.world_lore_entries
  where campaign_id=old.campaign_id
    and source_kind='background_event'
    and source_id=old.id::text;
  return old;
end;
$function$;

drop trigger if exists campaign_memory_facts_living_lore_delete_v1
  on public.campaign_memory_facts;
create trigger campaign_memory_facts_living_lore_delete_v1
after delete on public.campaign_memory_facts
for each row execute function private.delete_world_lore_from_memory_fact_v1();

drop trigger if exists ai_background_events_living_lore_delete_v1
  on public.ai_background_events;
create trigger ai_background_events_living_lore_delete_v1
after delete on public.ai_background_events
for each row execute function private.delete_world_lore_from_background_event_v1();

comment on function private.delete_world_lore_from_memory_fact_v1() is
  'Removes the player-facing Living Lore projection when its durable memory source is physically deleted.';
comment on function private.delete_world_lore_from_background_event_v1() is
  'Removes the player-facing Living Lore projection when its background-event source is physically deleted.';
