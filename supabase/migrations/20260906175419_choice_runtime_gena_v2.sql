-- Structured Choice Runtime v2 bridge for GENA long-rest preparation.
-- Keeps gena_commit_character_template_choice_v1 unchanged.

create or replace function public.gena_commit_character_template_choice_v2(
  p_character_id uuid,
  p_assignment_id uuid,
  p_choice_key text,
  p_instances jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_session public.character_preparation_sessions%rowtype;
  v_source_level integer;
  v_choice jsonb;
  v_fallback_refresh boolean;
  v_task_key text;
  v_result jsonb;
  v_resolved jsonb;
  v_count integer;
begin
  perform private.gena_assert_assigned_player(p_character_id);

  if nullif(btrim(coalesce(p_choice_key, '')), '') is null then
    raise exception 'CHOICE_KEY_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(p_instances, 'null'::jsonb)) <> 'array' then
    raise exception 'CHOICE_INSTANCES_MUST_BE_ARRAY';
  end if;
  v_count := jsonb_array_length(p_instances);
  if v_count = 0 then
    raise exception 'CHOICE_INSTANCES_EMPTY';
  end if;

  select * into v_assignment
  from public.character_template_assignments
  where id = p_assignment_id
    and character_id = p_character_id
  for update;
  if v_assignment.id is null then
    raise exception 'TEMPLATE_ASSIGNMENT_NOT_FOUND';
  end if;

  select * into v_template
  from public.rule_templates
  where id = v_assignment.template_id
    and is_active = true;
  if v_template.id is null then
    raise exception 'ACTIVE_TEMPLATE_NOT_FOUND';
  end if;

  v_source_level := private.character_template_source_level(v_assignment.id);
  if v_source_level is null then
    raise exception 'CHOICE_SOURCE_NOT_UNLOCKED';
  end if;

  select q.choice into v_choice
  from (
    select 0 as level, c.choice
    from jsonb_array_elements(coalesce(v_template.choices, '[]'::jsonb)) c(choice)
    union all
    select l.level, c.choice
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) c(choice)
    where l.template_id = v_template.id
      and l.level <= v_source_level
  ) q
  where q.choice->>'key' = btrim(p_choice_key)
  order by q.level desc
  limit 1;
  if v_choice is null then
    raise exception 'CHOICE_NOT_UNLOCKED';
  end if;

  v_fallback_refresh := coalesce(v_template.rules_meta->>'choice_refresh', '') = 'long_rest'
    and coalesce(v_template.rules_meta->>'persistent_choice', '') = btrim(p_choice_key);
  if coalesce(v_choice->>'refresh', '') <> 'long_rest' and not v_fallback_refresh then
    raise exception 'CHOICE_NOT_LONG_REST_PREPARATION';
  end if;

  select * into v_session
  from public.character_preparation_sessions
  where character_id = p_character_id
  for update;
  if v_session.character_id is null or not v_session.is_open then
    raise exception 'PREPARATION_WINDOW_CLOSED';
  end if;

  v_task_key := 'choice:' || btrim(p_choice_key);
  if exists (
    select 1
    from public.character_preparation_records r
    where r.character_id = p_character_id
      and r.generation = v_session.generation
      and r.assignment_id = v_assignment.id
      and r.task_key = v_task_key
  ) then
    raise exception 'CHOICE_ALREADY_FIXED_FOR_LONG_REST';
  end if;

  v_result := public.commit_character_template_choice_v2(
    p_assignment_id,
    btrim(p_choice_key),
    p_instances
  );

  v_resolved := jsonb_build_object(
    'instances', coalesce(v_result->'instances', '[]'::jsonb),
    'legacy_value', coalesce(v_result->'selected_choices'->btrim(p_choice_key), 'null'::jsonb),
    'runtime_version', 2
  );

  insert into public.character_preparation_records(
    character_id,
    generation,
    assignment_id,
    task_key,
    input_value,
    resolved_value,
    created_by,
    created_at
  ) values (
    p_character_id,
    v_session.generation,
    v_assignment.id,
    v_task_key,
    v_count,
    v_resolved,
    auth.uid(),
    now()
  );

  return v_result || jsonb_build_object(
    'generation', v_session.generation,
    'task_key', v_task_key,
    'fixed', true
  );
end;
$function$;

revoke all on function public.gena_commit_character_template_choice_v2(uuid,uuid,text,jsonb) from public;
grant execute on function public.gena_commit_character_template_choice_v2(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.gena_commit_character_template_choice_v2(uuid,uuid,text,jsonb) to service_role;

comment on function public.gena_commit_character_template_choice_v2(uuid,uuid,text,jsonb) is
'GENA long-rest bridge for structured Choice Runtime v2. Records structured instances while preserving the legacy selected_choices projection.';
