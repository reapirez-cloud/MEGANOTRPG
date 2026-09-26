create or replace function private.build_context_websearch_query_v1(p_query text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select coalesce(string_agg(token,' OR ' order by first_ord),'')
  from (
    select min(ord) first_ord,token
    from (
      select ord,left(lower(btrim(value)),64) token
      from regexp_split_to_table(left(coalesce(p_query,''),4000),'[^[:alnum:]_]+')
        with ordinality t(value,ord)
    ) q
    where char_length(token)>=3
      and token<>all(array[
        'что','как','где','там','тут','это','про','для','или','кто','чем','при',
        'был','была','были','есть','мне','тебя','они','она','оно','его','её',
        'the','and','for','with','what','where','who','was','were','are','about'
      ]::text[])
    group by token order by min(ord) limit 24
  ) s;
$function$;

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
  v_search text:=private.build_context_websearch_query_v1(p_query);
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
    'resolver_version',2
  );
end;
$function$;

revoke all on function public.resolve_ai_gm_context_v2(
  uuid,uuid,uuid,text,uuid,integer,integer,integer,integer,integer
) from public,anon,authenticated;
grant execute on function public.resolve_ai_gm_context_v2(
  uuid,uuid,uuid,text,uuid,integer,integer,integer,integer,integer
) to service_role;
