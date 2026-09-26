alter table public.campaign_memory_facts
  add column if not exists search_tags text[] not null default '{}'::text[],
  add column if not exists search_aliases text[] not null default '{}'::text[],
  add column if not exists relation_keys text[] not null default '{}'::text[],
  add column if not exists entity_refs jsonb not null default '[]'::jsonb,
  add column if not exists search_vector tsvector;

alter table public.campaign_memory_facts
  drop constraint if exists campaign_memory_facts_entity_refs_array_check;
alter table public.campaign_memory_facts
  add constraint campaign_memory_facts_entity_refs_array_check
  check (jsonb_typeof(entity_refs) = 'array');

alter table public.campaign_memory_summaries
  add column if not exists search_vector tsvector;

alter table public.campaign_events
  add column if not exists search_vector tsvector;

alter table public.world_lore_entries
  add column if not exists search_tags text[] not null default '{}'::text[],
  add column if not exists search_aliases text[] not null default '{}'::text[],
  add column if not exists relation_keys text[] not null default '{}'::text[],
  add column if not exists entity_refs jsonb not null default '[]'::jsonb,
  add column if not exists search_vector tsvector;

alter table public.world_lore_entries
  drop constraint if exists world_lore_entries_entity_refs_array_check;
alter table public.world_lore_entries
  add constraint world_lore_entries_entity_refs_array_check
  check (jsonb_typeof(entity_refs) = 'array');

create or replace function private.normalize_context_terms_v1(
  p_terms text[],
  p_max_items integer default 24,
  p_max_len integer default 96
)
returns text[]
language sql
immutable
set search_path = ''
as $function$
  select coalesce(array_agg(s.term order by s.first_ord), '{}'::text[])
  from (
    select min(x.ord) as first_ord, x.term
    from (
      select
        t.ord,
        left(
          regexp_replace(lower(btrim(t.value)), '\s+', ' ', 'g'),
          greatest(8, least(coalesce(p_max_len, 96), 160))
        ) as term
      from unnest(coalesce(p_terms, '{}'::text[])) with ordinality as t(value, ord)
    ) x
    where x.term <> ''
    group by x.term
    order by min(x.ord)
    limit greatest(1, least(coalesce(p_max_items, 24), 64))
  ) s;
$function$;

create or replace function private.normalize_context_entity_refs_v1(p_refs jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_out jsonb := '[]'::jsonb;
  v_ref jsonb;
  v_kind text;
  v_id text;
  v_relation text;
begin
  if jsonb_typeof(coalesce(p_refs, '[]'::jsonb)) <> 'array' then
    return '[]'::jsonb;
  end if;

  for v_ref in
    select value from jsonb_array_elements(p_refs) limit 32
  loop
    if jsonb_typeof(v_ref) <> 'object' then continue; end if;
    v_kind := lower(btrim(coalesce(v_ref->>'kind', '')));
    v_id := left(btrim(coalesce(v_ref->>'id', '')), 180);
    v_relation := left(lower(btrim(coalesce(v_ref->>'relation', 'related'))), 96);

    if v_kind not in (
      'character','pc','npc','location','faction','quest','quest_target',
      'item_definition','memory_fact','event','other'
    ) or v_id = '' then
      continue;
    end if;

    if not exists (
      select 1 from jsonb_array_elements(v_out) e
      where e->>'kind'=v_kind and e->>'id'=v_id and e->>'relation'=v_relation
    ) then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'kind',v_kind,'id',v_id,
        'relation',case when v_relation='' then 'related' else v_relation end
      ));
    end if;
  end loop;
  return v_out;
end;
$function$;

create or replace function private.prepare_campaign_memory_retrieval_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.search_tags := private.normalize_context_terms_v1(new.search_tags,24,64);
  new.search_aliases := private.normalize_context_terms_v1(new.search_aliases,24,120);
  new.relation_keys := private.normalize_context_terms_v1(new.relation_keys,32,120);
  new.entity_refs := private.normalize_context_entity_refs_v1(new.entity_refs);
  new.search_vector := to_tsvector('simple', concat_ws(
    ' ',
    coalesce(new.fact_key,''),coalesce(new.subject_type,''),
    coalesce(new.subject_id,''),coalesce(new.predicate,''),
    coalesce(new.statement,''),
    array_to_string(new.search_tags,' '),
    array_to_string(new.search_aliases,' '),
    array_to_string(new.relation_keys,' ')
  ));
  return new;
end;
$function$;

drop trigger if exists campaign_memory_facts_prepare_retrieval_v1 on public.campaign_memory_facts;
create trigger campaign_memory_facts_prepare_retrieval_v1
before insert or update of fact_key,subject_type,subject_id,predicate,statement,
  search_tags,search_aliases,relation_keys,entity_refs
on public.campaign_memory_facts
for each row execute function private.prepare_campaign_memory_retrieval_v1();

create or replace function private.prepare_campaign_memory_summary_search_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.search_vector := to_tsvector('simple',concat_ws(' ',coalesce(new.title,''),coalesce(new.summary,'')));
  return new;
end;
$function$;

drop trigger if exists campaign_memory_summaries_prepare_search_v1 on public.campaign_memory_summaries;
create trigger campaign_memory_summaries_prepare_search_v1
before insert or update of title,summary on public.campaign_memory_summaries
for each row execute function private.prepare_campaign_memory_summary_search_v1();

create or replace function private.prepare_campaign_event_search_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.search_vector := to_tsvector('simple',concat_ws(
    ' ',coalesce(new.event_type,''),coalesce(new.source_kind,''),coalesce(new.summary,'')
  ));
  return new;
end;
$function$;

drop trigger if exists campaign_events_prepare_search_v1 on public.campaign_events;
create trigger campaign_events_prepare_search_v1
before insert or update of event_type,source_kind,summary on public.campaign_events
for each row execute function private.prepare_campaign_event_search_v1();

create or replace function private.prepare_world_lore_retrieval_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_fact public.campaign_memory_facts%rowtype;
begin
  if new.source_kind='memory_fact'
     and new.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    select * into v_fact
    from public.campaign_memory_facts
    where id=new.source_id::uuid and campaign_id=new.campaign_id;

    if v_fact.id is not null then
      if cardinality(new.search_tags)=0 then new.search_tags:=v_fact.search_tags; end if;
      if cardinality(new.search_aliases)=0 then new.search_aliases:=v_fact.search_aliases; end if;
      if cardinality(new.relation_keys)=0 then new.relation_keys:=v_fact.relation_keys; end if;
      if jsonb_array_length(new.entity_refs)=0 then new.entity_refs:=v_fact.entity_refs; end if;
    end if;
  end if;

  new.search_tags := private.normalize_context_terms_v1(
    coalesce(new.search_tags,'{}'::text[]) || coalesce(new.tags,'{}'::text[]),32,64
  );
  new.search_aliases := private.normalize_context_terms_v1(new.search_aliases,24,120);
  new.relation_keys := private.normalize_context_terms_v1(new.relation_keys,32,120);
  new.entity_refs := private.normalize_context_entity_refs_v1(new.entity_refs);
  new.search_vector := to_tsvector('simple',concat_ws(
    ' ',coalesce(new.category,''),coalesce(new.title,''),coalesce(new.summary,''),
    coalesce(new.body,''),array_to_string(new.search_tags,' '),
    array_to_string(new.search_aliases,' '),array_to_string(new.relation_keys,' ')
  ));
  return new;
end;
$function$;

drop trigger if exists world_lore_entries_prepare_retrieval_v1 on public.world_lore_entries;
create trigger world_lore_entries_prepare_retrieval_v1
before insert or update of category,title,summary,body,tags,search_tags,search_aliases,
  relation_keys,entity_refs,source_kind,source_id
on public.world_lore_entries
for each row execute function private.prepare_world_lore_retrieval_v1();

update public.campaign_memory_facts set search_tags=coalesce(search_tags,'{}'::text[]);
update public.campaign_memory_summaries set title=title;
update public.campaign_events set summary=summary;
update public.world_lore_entries set search_tags=coalesce(search_tags,'{}'::text[]);

create index if not exists campaign_memory_facts_search_vector_gin
  on public.campaign_memory_facts using gin(search_vector) where status='active';
create index if not exists campaign_memory_facts_search_tags_gin
  on public.campaign_memory_facts using gin(search_tags) where status='active';
create index if not exists campaign_memory_facts_search_aliases_gin
  on public.campaign_memory_facts using gin(search_aliases) where status='active';
create index if not exists campaign_memory_facts_relation_keys_gin
  on public.campaign_memory_facts using gin(relation_keys) where status='active';
create index if not exists campaign_memory_facts_entity_refs_gin
  on public.campaign_memory_facts using gin(entity_refs jsonb_path_ops) where status='active';
create index if not exists campaign_memory_summaries_search_vector_gin
  on public.campaign_memory_summaries using gin(search_vector) where status='active';
create index if not exists campaign_events_search_vector_gin
  on public.campaign_events using gin(search_vector);
create index if not exists world_lore_entries_search_vector_gin
  on public.world_lore_entries using gin(search_vector);
create index if not exists world_lore_entries_search_tags_gin
  on public.world_lore_entries using gin(search_tags);
create index if not exists world_lore_entries_search_aliases_gin
  on public.world_lore_entries using gin(search_aliases);
create index if not exists world_lore_entries_relation_keys_gin
  on public.world_lore_entries using gin(relation_keys);
create index if not exists world_lore_entries_entity_refs_gin
  on public.world_lore_entries using gin(entity_refs jsonb_path_ops);

-- The resolver searches the entire eligible corpus first. LIMIT is applied only
-- after scoring, never before matching. World Resolver randomness remains separate.
create or replace function public.resolve_ai_gm_context_v1(
  p_campaign_id uuid,
  p_source_character_id uuid,
  p_room_id uuid,
  p_query text,
  p_current_location_id uuid default null,
  p_current_day integer default null,
  p_fact_limit integer default 16,
  p_summary_limit integer default 4,
  p_event_limit integer default 8,
  p_lore_limit integer default 8
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_query text := left(btrim(coalesce(p_query,'')),4000);
  v_query_lower text := lower(left(btrim(coalesce(p_query,'')),4000));
  v_tsquery tsquery;
  v_tokens text[] := '{}'::text[];
  v_anchor_character_ids text[] := '{}'::text[];
  v_anchor_location_ids text[] := '{}'::text[];
  v_anchor_faction_ids text[] := '{}'::text[];
  v_anchor_quest_ids text[] := '{}'::text[];
  v_anchor_ids text[] := '{}'::text[];
  v_location_cue boolean := false;
  v_facts jsonb := '[]'::jsonb;
  v_summaries jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_lore jsonb := '[]'::jsonb;
  v_anchors jsonb := '{}'::jsonb;
  v_fact_limit integer := greatest(1,least(coalesce(p_fact_limit,16),32));
  v_summary_limit integer := greatest(0,least(coalesce(p_summary_limit,4),12));
  v_event_limit integer := greatest(0,least(coalesce(p_event_limit,8),20));
  v_lore_limit integer := greatest(0,least(coalesce(p_lore_limit,8),20));
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service_role_required'; end if;
  if not exists(select 1 from public.characters c where c.id=p_source_character_id and c.campaign_id=p_campaign_id)
    then raise exception using errcode='22023',message='context_resolver_source_character_invalid'; end if;
  if not exists(select 1 from public.chat_rooms r where r.id=p_room_id and r.campaign_id=p_campaign_id)
    then raise exception using errcode='22023',message='context_resolver_room_invalid'; end if;
  if p_current_location_id is not null and not exists(
    select 1 from public.locations l where l.id=p_current_location_id and l.campaign_id=p_campaign_id
  ) then raise exception using errcode='22023',message='context_resolver_location_invalid'; end if;

  if v_query<>'' then v_tsquery:=websearch_to_tsquery('simple',v_query); end if;

  select coalesce(array_agg(token order by first_ord),'{}'::text[]) into v_tokens
  from (
    select min(ord) first_ord,token
    from (
      select ord,left(lower(btrim(value)),64) token
      from regexp_split_to_table(v_query,'[^[:alnum:]_]+') with ordinality t(value,ord)
    ) q
    where char_length(token)>=3
    group by token order by min(ord) limit 24
  ) x;

  v_location_cue := v_query_lower ~
    '(тут|здесь|мест|локац|район|улиц|ворот|окрест|произош|случил|раньше|недавно|where|here|place|location|district|street|gate|happen|recent)';

  select coalesce(array_agg(c.id::text order by char_length(c.name) desc),'{}'::text[])
    into v_anchor_character_ids
  from public.characters c
  where c.campaign_id=p_campaign_id and c.publication_state='campaign'
    and char_length(btrim(c.name))>=2 and position(lower(c.name) in v_query_lower)>0;

  select coalesce(array_agg(l.id::text order by char_length(l.name) desc),'{}'::text[])
    into v_anchor_location_ids
  from public.locations l
  where l.campaign_id=p_campaign_id and l.lifecycle_state='active'
    and char_length(btrim(l.name))>=2 and position(lower(l.name) in v_query_lower)>0;

  select coalesce(array_agg(f.id::text order by char_length(f.name) desc),'{}'::text[])
    into v_anchor_faction_ids
  from public.factions f
  where f.campaign_id=p_campaign_id and f.state='active'
    and char_length(btrim(f.name))>=2 and position(lower(f.name) in v_query_lower)>0;

  select coalesce(array_agg(q.id::text order by char_length(q.title) desc),'{}'::text[])
    into v_anchor_quest_ids
  from public.quests q
  where q.campaign_id=p_campaign_id and q.status not in ('failed','completed')
    and char_length(btrim(q.title))>=2 and position(lower(q.title) in v_query_lower)>0;

  v_anchor_ids:=array(
    select distinct id from unnest(
      v_anchor_character_ids||v_anchor_location_ids||v_anchor_faction_ids||v_anchor_quest_ids
    ) id where id<>''
  );

  select jsonb_build_object(
    'characters',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'name',c.name,'character_type',c.character_type,'life_state',c.life_state
    ) order by c.name) from public.characters c where c.id::text=any(v_anchor_character_ids)),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'name',l.name,'parent_location_id',l.parent_location_id,'summary',left(l.summary,500)
    ) order by l.name) from public.locations l where l.id::text=any(v_anchor_location_ids)),'[]'::jsonb),
    'factions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'name',f.name,'summary',left(f.summary,500)
    ) order by f.name) from public.factions f where f.id::text=any(v_anchor_faction_ids)),'[]'::jsonb),
    'quests',coalesce((select jsonb_agg(jsonb_build_object(
      'id',q.id,'title',q.title,'status',q.status,'player_brief',left(q.player_brief,700)
    ) order by q.updated_at desc) from public.quests q where q.id::text=any(v_anchor_quest_ids)),'[]'::jsonb)
  ) into v_anchors;

  with eligible as (
    select f.*,
      exists(select 1 from jsonb_array_elements(f.entity_refs) r where r->>'id'=any(v_anchor_ids)) entity_match,
      exists(select 1 from jsonb_array_elements(f.entity_refs) r
        where p_current_location_id is not null and r->>'kind'='location' and r->>'id'=p_current_location_id::text) current_location_ref,
      coalesce((select count(*)::int from unnest(f.search_tags) tag where tag=any(v_tokens)),0) tag_hits,
      coalesce((select count(*)::int from unnest(f.search_aliases) alias where alias=any(v_tokens)
        or exists(select 1 from unnest(v_tokens) tok where position(tok in alias)>0)),0) alias_hits,
      coalesce((select count(*)::int from unnest(f.relation_keys) rk
        where exists(select 1 from unnest(v_tokens) tok where position(tok in rk)>0)),0) relation_hits,
      case when v_tsquery is not null and f.search_vector@@v_tsquery then ts_rank_cd(f.search_vector,v_tsquery) else 0 end text_rank,
      exists(
        select 1 from unnest(f.source_event_ids) sid join public.campaign_events e on e.id=sid
        where e.campaign_id=p_campaign_id and (
          e.location_id=p_current_location_id or e.actor_character_id::text=any(v_anchor_character_ids)
          or e.participant_character_ids && array(
            select x::uuid from unnest(v_anchor_character_ids) x
            where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
        )
      ) source_context_match
    from public.campaign_memory_facts f
    where f.campaign_id=p_campaign_id and f.status='active'
      and (
        f.visibility in ('campaign','gm')
        or (f.visibility='room' and f.room_id=p_room_id)
        or (f.visibility='characters' and p_source_character_id=any(f.visible_character_ids))
      )
      and not (
        p_current_day is not null and exists(
          select 1 from unnest(f.source_event_ids) sid join public.campaign_events e on e.id=sid
          where e.campaign_id=p_campaign_id
            and coalesce(e.payload->>'effective_game_day',e.payload->>'campaign_day','') ~ '^[0-9]+$'
            and coalesce(e.payload->>'effective_game_day',e.payload->>'campaign_day')::integer>p_current_day
        )
      )
  ), scored as (
    select e.*,
      (e.text_rank*24 + e.tag_hits*7 + e.alias_hits*9 + e.relation_hits*4
       +case when e.entity_match then 18 else 0 end
       +case when e.subject_id=any(v_anchor_ids) then 18 else 0 end
       +case when e.current_location_ref then 5 else 0 end
       +case when e.source_context_match then 4 else 0 end
       +case when e.room_id=p_room_id then 2 else 0 end
       +case when v_query_lower<>'' and position(v_query_lower in lower(e.statement))>0 then 12 else 0 end
      )::numeric resolver_score,
      (e.text_rank>0 or e.tag_hits>0 or e.alias_hits>0 or e.relation_hits>0
       or e.entity_match or e.subject_id=any(v_anchor_ids)
       or (v_location_cue and (e.current_location_ref or e.source_context_match))) is_match
    from eligible e
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.resolver_score desc,x.updated_at desc),'[]'::jsonb)
    into v_facts
  from (
    select id,fact_key,subject_type,subject_id,predicate,statement,structured_value,confidence,
      source_event_ids,visibility,room_id,visible_character_ids,search_tags,search_aliases,
      relation_keys,entity_refs,updated_at,resolver_score
    from scored where is_match
    order by resolver_score desc,updated_at desc limit v_fact_limit
  ) x;

  if v_summary_limit>0 then
    with scored as (
      select s.*,case when v_tsquery is not null and s.search_vector@@v_tsquery
        then ts_rank_cd(s.search_vector,v_tsquery) else 0 end text_rank
      from public.campaign_memory_summaries s
      where s.campaign_id=p_campaign_id and s.status='active'
        and (
          s.visibility in ('campaign','gm')
          or (s.visibility='room' and s.room_id=p_room_id)
          or (s.visibility='characters' and p_source_character_id=any(s.visible_character_ids))
        )
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.resolver_score desc,x.period_end desc),'[]'::jsonb)
      into v_summaries
    from (
      select id,title,summary,key_event_ids,visibility,room_id,period_start,period_end,updated_at,
        (text_rank*20+case when room_id=p_room_id then 2 else 0 end)::numeric resolver_score
      from scored
      where text_rank>0 or (v_query_lower<>'' and position(v_query_lower in lower(summary))>0)
      order by resolver_score desc,period_end desc nulls last limit v_summary_limit
    ) x;
  end if;

  if v_event_limit>0 then
    with scored as (
      select e.*,
        case when v_tsquery is not null and e.search_vector@@v_tsquery then ts_rank_cd(e.search_vector,v_tsquery) else 0 end text_rank,
        (e.actor_character_id::text=any(v_anchor_character_ids)
         or e.participant_character_ids && array(
           select x::uuid from unnest(v_anchor_character_ids) x
           where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         )) character_match,
        e.location_id::text=any(v_anchor_location_ids) location_match
      from public.campaign_events e
      where e.campaign_id=p_campaign_id
        and (
          e.visibility in ('campaign','gm')
          or (e.visibility='room' and (e.room_id is null or e.room_id=p_room_id))
          or (e.visibility='characters' and p_source_character_id=any(e.visible_character_ids))
        )
        and (
          p_current_day is null
          or coalesce(e.payload->>'effective_game_day',e.payload->>'campaign_day','') !~ '^[0-9]+$'
          or coalesce(e.payload->>'effective_game_day',e.payload->>'campaign_day')::integer<=p_current_day
        )
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.resolver_score desc,x.occurred_at desc),'[]'::jsonb)
      into v_events
    from (
      select id,event_type,source_kind,source_id,room_id,location_id,actor_character_id,
        participant_character_ids,summary,importance,confidence,visibility,occurred_at,
        (text_rank*18+case when character_match then 16 else 0 end
         +case when location_match then 14 else 0 end
         +case when v_location_cue and location_id=p_current_location_id then 6 else 0 end
         +importance*0.5)::numeric resolver_score
      from scored
      where text_rank>0 or character_match or location_match
         or (v_location_cue and location_id=p_current_location_id)
      order by resolver_score desc,occurred_at desc limit v_event_limit
    ) x;
  end if;

  if v_lore_limit>0 then
    with scored as (
      select l.*,
        case when v_tsquery is not null and l.search_vector@@v_tsquery then ts_rank_cd(l.search_vector,v_tsquery) else 0 end text_rank,
        exists(select 1 from jsonb_array_elements(l.entity_refs) r where r->>'id'=any(v_anchor_ids)) entity_match,
        coalesce((select count(*)::int from unnest(l.search_tags) tag where tag=any(v_tokens)),0) tag_hits,
        coalesce((select count(*)::int from unnest(l.search_aliases) alias where alias=any(v_tokens)
          or exists(select 1 from unnest(v_tokens) tok where position(tok in alias)>0)),0) alias_hits
      from public.world_lore_entries l
      where l.campaign_id=p_campaign_id
        and (
          l.visibility='campaign' or l.visibility='gm'
          or (l.visibility='characters' and p_source_character_id=any(l.visible_character_ids))
        )
        and (p_current_day is null or l.campaign_day is null or l.campaign_day<=p_current_day)
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.resolver_score desc,x.occurred_at desc),'[]'::jsonb)
      into v_lore
    from (
      select id,category,title,summary,body,source_kind,source_id,location_id,campaign_day,
        day_period,occurred_at,visibility,visible_character_ids,importance,tags,search_tags,
        search_aliases,relation_keys,entity_refs,
        (text_rank*22+tag_hits*7+alias_hits*9+case when entity_match then 18 else 0 end
         +case when location_id::text=any(v_anchor_location_ids) then 14 else 0 end
         +case when v_location_cue and location_id=p_current_location_id then 5 else 0 end
         +importance*0.5)::numeric resolver_score
      from scored
      where text_rank>0 or tag_hits>0 or alias_hits>0 or entity_match
         or location_id::text=any(v_anchor_location_ids)
         or (v_location_cue and location_id=p_current_location_id)
      order by resolver_score desc,occurred_at desc limit v_lore_limit
    ) x;
  end if;

  return jsonb_build_object(
    'query',v_query,'anchors',v_anchors,'memory_facts',v_facts,
    'memory_summaries',v_summaries,'campaign_events',v_events,'lore_entries',v_lore,
    'limits',jsonb_build_object('facts',v_fact_limit,'summaries',v_summary_limit,'events',v_event_limit,'lore',v_lore_limit),
    'contract',jsonb_build_object(
      'search_scope','entire_campaign_before_output_limit',
      'pre_limit_recent_memory',false,
      'visibility_filtered',true,'temporal_filtered',true,'world_resolver_separate',true
    )
  );
end;
$function$;

revoke all on function public.resolve_ai_gm_context_v1(
  uuid,uuid,uuid,text,uuid,integer,integer,integer,integer,integer
) from public,anon,authenticated;
grant execute on function public.resolve_ai_gm_context_v1(
  uuid,uuid,uuid,text,uuid,integer,integer,integer,integer,integer
) to service_role;

create or replace function public.read_ai_gm_retrieval_tag_dictionary_v1(
  p_campaign_id uuid,
  p_limit integer default 120
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with terms as (
    select unnest(f.search_tags) tag
    from public.campaign_memory_facts f
    where f.campaign_id=p_campaign_id and f.status='active'
    union all
    select unnest(l.search_tags) tag
    from public.world_lore_entries l
    where l.campaign_id=p_campaign_id
  ), ranked as (
    select tag,count(*)::integer uses
    from terms where btrim(tag)<>''
    group by tag order by count(*) desc,tag
    limit greatest(1,least(coalesce(p_limit,120),200))
  )
  select jsonb_build_object(
    'tags',coalesce(jsonb_agg(jsonb_build_object('tag',tag,'uses',uses) order by uses desc,tag),'[]'::jsonb),
    'normalization','lowercase trimmed semantic tags; reuse an existing tag when it means the same thing'
  )
  from ranked;
$function$;

revoke all on function public.read_ai_gm_retrieval_tag_dictionary_v1(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.read_ai_gm_retrieval_tag_dictionary_v1(uuid,integer)
  to service_role;
