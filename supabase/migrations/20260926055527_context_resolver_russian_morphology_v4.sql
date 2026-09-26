create or replace function private.context_search_vector_v2(p_text text)
returns tsvector
language sql
immutable
set search_path = ''
as $function$
  select
    to_tsvector('pg_catalog.russian', coalesce(p_text,'')) ||
    to_tsvector('pg_catalog.simple', coalesce(p_text,''));
$function$;

create or replace function private.build_context_websearch_query_v2(p_query text)
returns text
language sql
immutable
set search_path = ''
as $function$
  with raw as (
    select ord,left(lower(btrim(value)),64) token
    from regexp_split_to_table(left(coalesce(p_query,''),4000),'[^[:alnum:]_]+')
      with ordinality t(value,ord)
  ), kept as (
    select ord,token
    from raw
    where char_length(token)>=3
      and token<>all(array[
        'что','как','где','там','тут','это','про','для','или','кто','чем','при',
        'был','была','были','есть','мне','тебя','они','она','оно','его','её',
        'the','and','for','with','what','where','who','was','were','are','about'
      ]::text[])
  ), expanded as (
    select ord,token term from kept
    union all
    select k.ord,stem
    from kept k
    cross join lateral unnest(
      tsvector_to_array(to_tsvector('pg_catalog.russian',k.token))
    ) stem
    where stem<>k.token and char_length(stem)>=2
  ), dedup as (
    select min(ord) first_ord,term
    from expanded
    where btrim(term)<>''
    group by term
    order by min(ord),term
    limit 40
  )
  select coalesce(string_agg(term,' OR ' order by first_ord,term),'')
  from dedup;
$function$;

create or replace function private.prepare_campaign_memory_retrieval_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_text text;
begin
  new.search_tags := private.normalize_context_terms_v1(new.search_tags,24,64);
  new.search_aliases := private.normalize_context_terms_v1(new.search_aliases,24,120);
  new.relation_keys := private.normalize_context_terms_v1(new.relation_keys,32,120);
  new.entity_refs := private.normalize_context_entity_refs_v1(new.entity_refs);

  v_text := concat_ws(
    ' ',
    coalesce(new.fact_key,''),coalesce(new.subject_type,''),
    coalesce(new.subject_id,''),coalesce(new.predicate,''),
    coalesce(new.statement,''),
    array_to_string(new.search_tags,' '),
    array_to_string(new.search_aliases,' '),
    array_to_string(new.relation_keys,' ')
  );
  new.search_vector := private.context_search_vector_v2(v_text);
  return new;
end;
$function$;

create or replace function private.prepare_campaign_memory_summary_search_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.search_vector := private.context_search_vector_v2(
    concat_ws(' ',coalesce(new.title,''),coalesce(new.summary,''))
  );
  return new;
end;
$function$;

create or replace function private.prepare_campaign_event_search_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.search_vector := private.context_search_vector_v2(
    concat_ws(' ',coalesce(new.event_type,''),coalesce(new.source_kind,''),coalesce(new.summary,''))
  );
  return new;
end;
$function$;

create or replace function private.prepare_world_lore_retrieval_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_fact public.campaign_memory_facts%rowtype;
  v_text text;
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

  v_text := concat_ws(
    ' ',coalesce(new.category,''),coalesce(new.title,''),coalesce(new.summary,''),
    coalesce(new.body,''),array_to_string(new.search_tags,' '),
    array_to_string(new.search_aliases,' '),array_to_string(new.relation_keys,' ')
  );
  new.search_vector := private.context_search_vector_v2(v_text);
  return new;
end;
$function$;

update public.campaign_memory_facts
set search_tags=search_tags;

update public.campaign_memory_summaries
set title=title;

update public.campaign_events
set summary=summary;

update public.world_lore_entries
set search_tags=search_tags;

create or replace function public.resolve_ai_gm_context_v2(
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
  v_original text:=left(btrim(coalesce(p_query,'')),4000);
  v_search text:=private.build_context_websearch_query_v2(p_query);
  v_result jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception using errcode='42501',message='service_role_required';
  end if;

  v_result:=public.resolve_ai_gm_context_v1(
    p_campaign_id,p_source_character_id,p_room_id,
    case when v_search='' then v_original else v_search end,
    p_current_location_id,p_current_day,p_fact_limit,p_summary_limit,p_event_limit,p_lore_limit
  );

  return v_result||jsonb_build_object(
    'query',v_original,
    'search_query',case when v_search='' then v_original else v_search end,
    'resolver_version',3,
    'morphology','russian+simple'
  );
end;
$function$;

comment on function public.resolve_ai_gm_context_v2 is
  'Context Resolver v3 behind stable RPC name: full-campaign retrieval with Russian stemming plus simple-token fallback, canonical graph links, temporal/visibility filtering, and output-only limits.';
