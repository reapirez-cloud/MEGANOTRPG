-- Living Lore v1
-- Player-facing projection of durable campaign memory and explicitly public background events.

create table if not exists public.world_lore_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  category text not null default 'chronicle'
    check (category in ('news','chronicle','history','world_event','rumor')),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  summary text not null check (char_length(btrim(summary)) between 1 and 2000),
  body text not null default '' check (char_length(body) <= 12000),
  source_kind text not null check (source_kind in ('memory_fact','background_event','campaign_event','manual')),
  source_id text not null check (char_length(btrim(source_id)) between 1 and 180),
  source_entry_key text not null check (
    char_length(source_entry_key) between 1 and 120
    and source_entry_key ~ '^[a-z0-9][a-z0-9:_-]{0,119}$'
  ),
  location_id uuid references public.locations(id) on delete set null,
  campaign_day integer check (campaign_day is null or campaign_day >= 1),
  day_period text check (
    day_period is null or day_period in ('dawn','morning','day','afternoon','evening','night')
  ),
  occurred_at timestamptz not null default now(),
  visibility text not null default 'campaign'
    check (visibility in ('campaign','characters','gm')),
  visible_character_ids uuid[] not null default '{}'::uuid[],
  importance smallint not null default 2 check (importance between 0 and 5),
  tags text[] not null default '{}'::text[],
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, source_kind, source_id, source_entry_key)
);

create index if not exists world_lore_entries_campaign_occurred_idx
  on public.world_lore_entries(campaign_id, occurred_at desc, created_at desc);
create index if not exists world_lore_entries_campaign_category_idx
  on public.world_lore_entries(campaign_id, category, occurred_at desc);
create index if not exists world_lore_entries_visible_characters_gin
  on public.world_lore_entries using gin(visible_character_ids);

alter table public.world_lore_entries enable row level security;
revoke all on table public.world_lore_entries from anon, authenticated;
grant select on table public.world_lore_entries to authenticated;
grant select, insert, update, delete on table public.world_lore_entries to service_role;

drop policy if exists world_lore_entries_member_read on public.world_lore_entries;
create policy world_lore_entries_member_read
on public.world_lore_entries for select to authenticated
using (
  private.is_campaign_member(campaign_id, (select auth.uid()))
  and (
    visibility='campaign'
    or private.is_campaign_manager(campaign_id, (select auth.uid()))
    or (
      visibility='characters'
      and exists (
        select 1
        from unnest(visible_character_ids) as visible_character_id
        where private.is_character_campaign_member(
          visible_character_id,
          (select auth.uid())
        )
      )
    )
  )
);

create or replace function private.sync_world_lore_from_memory_fact_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_lore jsonb; v_entries jsonb; v_entry jsonb; v_index integer:=0;
  v_key text; v_category text; v_title text; v_summary text; v_body text; v_visibility text;
  v_character_ids uuid[]; v_tags text[]; v_location_id uuid; v_campaign_day integer;
  v_day_period text; v_importance smallint; v_occurred_at timestamptz;
begin
  delete from public.world_lore_entries
  where campaign_id=new.campaign_id and source_kind='memory_fact' and source_id=new.id::text;

  if new.status<>'active' then return new; end if;
  v_lore:=coalesce(new.structured_value->'lore','null'::jsonb);
  if jsonb_typeof(v_lore)<>'object' then return new; end if;
  v_entries:=v_lore->'entries';
  if jsonb_typeof(v_entries)<>'array' then return new; end if;

  select max(e.occurred_at) into v_occurred_at
  from public.campaign_events e
  where e.id=any(coalesce(new.source_event_ids,'{}'::uuid[]));
  v_occurred_at:=coalesce(v_occurred_at,new.created_at,now());

  for v_entry in select value from jsonb_array_elements(v_entries) limit 12 loop
    v_index:=v_index+1;
    v_title:=left(btrim(coalesce(v_entry->>'title','')),240);
    v_summary:=left(btrim(coalesce(v_entry->>'summary','')),2000);
    if v_title='' or v_summary='' then continue; end if;

    v_category:=lower(btrim(coalesce(v_entry->>'category','chronicle')));
    if v_category not in ('news','chronicle','history','world_event','rumor') then v_category:='chronicle'; end if;

    v_key:=lower(btrim(coalesce(v_entry->>'key','')));
    v_key:=regexp_replace(v_key,'[^a-z0-9:_-]+','-','g');
    v_key:=regexp_replace(v_key,'^-+|-+$','','g');
    if v_key='' then v_key:='entry-'||v_index::text; end if;
    v_key:=left(v_key,120);

    v_visibility:=lower(btrim(coalesce(v_entry->>'visibility','characters')));
    if v_visibility not in ('campaign','characters','gm') then v_visibility:='characters'; end if;

    v_character_ids:='{}'::uuid[];
    if jsonb_typeof(v_entry->'character_ids')='array' then
      select coalesce(array_agg(distinct x.id),'{}'::uuid[]) into v_character_ids
      from (
        select value::uuid as id
        from jsonb_array_elements_text(v_entry->'character_ids')
        where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ) x
      where exists(select 1 from public.characters c where c.id=x.id and c.campaign_id=new.campaign_id);
    end if;
    if v_visibility='characters' and cardinality(v_character_ids)=0 then continue; end if;

    v_tags:='{}'::text[];
    if jsonb_typeof(v_entry->'tags')='array' then
      select coalesce(array_agg(tag),'{}'::text[]) into v_tags
      from (
        select distinct left(btrim(value),64) as tag
        from jsonb_array_elements_text(v_entry->'tags')
        where btrim(value)<>'' limit 12
      ) t;
    end if;

    v_location_id:=null;
    begin
      v_location_id:=nullif(btrim(coalesce(v_entry->>'location_id','')),'')::uuid;
    exception when invalid_text_representation then v_location_id:=null; end;
    if v_location_id is not null and not exists(
      select 1 from public.locations l where l.id=v_location_id and l.campaign_id=new.campaign_id
    ) then v_location_id:=null; end if;
    if v_location_id is null then
      select e.location_id into v_location_id
      from public.campaign_events e
      where e.id=any(coalesce(new.source_event_ids,'{}'::uuid[])) and e.location_id is not null
      order by e.occurred_at desc limit 1;
    end if;

    begin v_campaign_day:=nullif(v_entry->>'campaign_day','')::integer;
    exception when invalid_text_representation then v_campaign_day:=null; end;
    if v_campaign_day is not null and v_campaign_day<1 then v_campaign_day:=null; end if;

    v_day_period:=nullif(lower(btrim(coalesce(v_entry->>'day_period',''))),'');
    if v_day_period is not null and v_day_period not in ('dawn','morning','day','afternoon','evening','night')
      then v_day_period:=null; end if;

    begin v_importance:=greatest(0,least(5,coalesce((v_entry->>'importance')::smallint,2)));
    exception when invalid_text_representation then v_importance:=2; end;
    v_body:=left(coalesce(v_entry->>'body',''),12000);

    insert into public.world_lore_entries(
      campaign_id,category,title,summary,body,source_kind,source_id,source_entry_key,
      location_id,campaign_day,day_period,occurred_at,visibility,visible_character_ids,
      importance,tags,provenance
    ) values (
      new.campaign_id,v_category,v_title,v_summary,v_body,'memory_fact',new.id::text,v_key,
      v_location_id,v_campaign_day,v_day_period,v_occurred_at,v_visibility,v_character_ids,
      v_importance,v_tags,jsonb_build_object(
        'memory_fact_id',new.id,
        'source_event_ids',to_jsonb(coalesce(new.source_event_ids,'{}'::uuid[])),
        'projection','living_lore_v1'
      )
    )
    on conflict (campaign_id,source_kind,source_id,source_entry_key)
    do update set category=excluded.category,title=excluded.title,summary=excluded.summary,
      body=excluded.body,location_id=excluded.location_id,campaign_day=excluded.campaign_day,
      day_period=excluded.day_period,occurred_at=excluded.occurred_at,visibility=excluded.visibility,
      visible_character_ids=excluded.visible_character_ids,importance=excluded.importance,
      tags=excluded.tags,provenance=excluded.provenance,updated_at=now();
  end loop;
  return new;
end;
$function$;

create or replace function private.sync_world_lore_from_background_event_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_lore jsonb; v_entries jsonb; v_entry jsonb; v_index integer:=0;
  v_key text; v_category text; v_title text; v_summary text; v_body text;
  v_tags text[]; v_location_id uuid;
begin
  delete from public.world_lore_entries
  where campaign_id=new.campaign_id and source_kind='background_event' and source_id=new.id::text;
  if new.importance<2 then return new; end if;

  v_lore:=coalesce(new.effect_payload->'public_lore','null'::jsonb);
  if jsonb_typeof(v_lore)<>'object' or coalesce((v_lore->>'publish')::boolean,false) is not true then
    return new;
  end if;

  v_entries:=v_lore->'entries';
  if jsonb_typeof(v_entries)<>'array' then v_entries:=jsonb_build_array(v_lore); end if;

  for v_entry in select value from jsonb_array_elements(v_entries) limit 8 loop
    v_index:=v_index+1;
    v_title:=left(btrim(coalesce(v_entry->>'title','')),240);
    v_summary:=left(btrim(coalesce(v_entry->>'summary','')),2000);
    if v_title='' or v_summary='' then continue; end if;

    v_category:=lower(btrim(coalesce(v_entry->>'category','world_event')));
    if v_category not in ('news','chronicle','history','world_event','rumor') then v_category:='world_event'; end if;

    v_key:=lower(btrim(coalesce(v_entry->>'key','')));
    v_key:=regexp_replace(v_key,'[^a-z0-9:_-]+','-','g');
    v_key:=regexp_replace(v_key,'^-+|-+$','','g');
    if v_key='' then v_key:='entry-'||v_index::text; end if;
    v_key:=left(v_key,120);

    v_tags:='{}'::text[];
    if jsonb_typeof(v_entry->'tags')='array' then
      select coalesce(array_agg(tag),'{}'::text[]) into v_tags
      from (
        select distinct left(btrim(value),64) as tag
        from jsonb_array_elements_text(v_entry->'tags')
        where btrim(value)<>'' limit 12
      ) t;
    end if;

    v_location_id:=null;
    if new.entity_scope='location'
      and new.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      select id into v_location_id from public.locations
      where id=new.entity_id::uuid and campaign_id=new.campaign_id;
    end if;

    v_body:=left(coalesce(v_entry->>'body',''),12000);
    insert into public.world_lore_entries(
      campaign_id,category,title,summary,body,source_kind,source_id,source_entry_key,
      location_id,campaign_day,occurred_at,visibility,visible_character_ids,importance,tags,provenance
    ) values (
      new.campaign_id,v_category,v_title,v_summary,v_body,'background_event',new.id::text,v_key,
      v_location_id,new.effective_game_day,new.created_at,'campaign','{}'::uuid[],new.importance,
      v_tags,jsonb_build_object(
        'background_event_id',new.id,'event_kind',new.event_kind,'entity_scope',new.entity_scope,
        'entity_id',new.entity_id,'projection','living_lore_v1'
      )
    )
    on conflict (campaign_id,source_kind,source_id,source_entry_key)
    do update set category=excluded.category,title=excluded.title,summary=excluded.summary,
      body=excluded.body,location_id=excluded.location_id,campaign_day=excluded.campaign_day,
      occurred_at=excluded.occurred_at,visibility=excluded.visibility,importance=excluded.importance,
      tags=excluded.tags,provenance=excluded.provenance,updated_at=now();
  end loop;
  return new;
exception when invalid_text_representation then return new;
end;
$function$;

drop trigger if exists campaign_memory_facts_living_lore_v1 on public.campaign_memory_facts;
create trigger campaign_memory_facts_living_lore_v1
after insert or update of status,structured_value,source_event_ids on public.campaign_memory_facts
for each row execute function private.sync_world_lore_from_memory_fact_v1();

drop trigger if exists ai_background_events_living_lore_v1 on public.ai_background_events;
create trigger ai_background_events_living_lore_v1
after insert or update of importance,effect_payload on public.ai_background_events
for each row execute function private.sync_world_lore_from_background_event_v1();

do $do$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='world_lore_entries'
    )
  then
    alter publication supabase_realtime add table public.world_lore_entries;
  end if;
end
$do$;

comment on table public.world_lore_entries is
  'Player-facing Living Lore projection. Canon stays in domain tables/events; this table stores readable news, chronicle and public world-development entries with provenance.';
