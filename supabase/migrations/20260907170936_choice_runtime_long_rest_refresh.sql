-- CLASS_MIGRATION_SCOPE: infrastructure
-- Generic Choice Runtime v2: add exact long-rest-only refresh support.
begin;

create or replace function public.commit_character_template_rest_choice_v1(
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
  v_character public.characters%rowtype;
  v_source_level integer;
  v_choice jsonb;
  v_refresh text;
  v_short_open boolean := false;
  v_long_open boolean := false;
  v_validation jsonb;
  v_instances jsonb;
  v_legacy_options jsonb;
  v_required integer;
  v_value jsonb;
  v_next jsonb;
  v_runtime jsonb;
  v_runtime_choices jsonb;
  v_entry jsonb;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_choice_key, '')), '') is null then raise exception 'CHOICE_KEY_REQUIRED'; end if;

  select * into v_assignment from public.character_template_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then raise exception 'TEMPLATE_ASSIGNMENT_NOT_FOUND'; end if;

  select * into v_template from public.rule_templates where id = v_assignment.template_id and is_active = true;
  if v_template.id is null then raise exception 'ACTIVE_TEMPLATE_NOT_FOUND'; end if;

  select * into v_character from public.characters where id = v_assignment.character_id;
  if v_character.id is null then raise exception 'CHARACTER_NOT_FOUND'; end if;

  if coalesce(v_character.assigned_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid()
     and not private.can_manage_character(v_character.id, auth.uid()) then
    raise exception 'CHOICE_PERMISSION_DENIED';
  end if;

  v_source_level := private.character_template_source_level(v_assignment.id);
  if v_source_level is null then raise exception 'CHOICE_SOURCE_NOT_UNLOCKED'; end if;

  select q.choice into v_choice
  from (
    select 0 as level, c.choice
    from jsonb_array_elements(coalesce(v_template.choices, '[]'::jsonb)) c(choice)
    union all
    select l.level, c.choice
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices, '[]'::jsonb)) c(choice)
    where l.template_id = v_template.id and l.level <= v_source_level
  ) q
  where q.choice->>'key' = p_choice_key
  order by q.level desc
  limit 1;

  if v_choice is null then raise exception 'CHOICE_NOT_UNLOCKED'; end if;
  if coalesce(v_choice->>'selection_mode', 'manager') <> 'player_once' then raise exception 'CHOICE_NOT_PLAYER_RESOLVABLE'; end if;

  v_refresh := coalesce(v_choice->>'refresh', '');
  if v_refresh not in ('short_rest', 'long_rest', 'short_or_long_rest') then
    raise exception 'CHOICE_REST_REFRESH_UNSUPPORTED:%', v_refresh;
  end if;

  select exists(select 1 from public.character_short_rest_sessions s where s.character_id = v_character.id and s.is_open = true)
  into v_short_open;
  v_long_open := private.is_character_preparation_open(v_character.id);

  if v_refresh = 'short_rest' and not v_short_open then raise exception 'CHOICE_SHORT_REST_WINDOW_CLOSED'; end if;
  if v_refresh = 'long_rest' and not v_long_open then raise exception 'CHOICE_LONG_REST_WINDOW_CLOSED'; end if;
  if v_refresh = 'short_or_long_rest' and not (v_short_open or v_long_open) then raise exception 'CHOICE_REST_WINDOW_CLOSED'; end if;

  v_validation := private.validate_template_choice_instances_v2(
    v_choice,p_instances,v_source_level,coalesce(v_assignment.selected_choices, '{}'::jsonb),p_choice_key
  );
  v_instances := v_validation->'instances';
  v_legacy_options := v_validation->'legacy_options';
  v_required := (v_validation->>'required_count')::integer;
  v_value := case when v_required = 1 then v_legacy_options->0 else v_legacy_options end;

  v_next := jsonb_set(coalesce(v_assignment.selected_choices, '{}'::jsonb),array[p_choice_key],v_value,true);
  v_runtime := coalesce(v_next->'_choice_runtime_v2', '{}'::jsonb);
  if jsonb_typeof(v_runtime) <> 'object' then v_runtime := '{}'::jsonb; end if;
  v_runtime := jsonb_set(v_runtime, '{version}', to_jsonb(2), true);
  v_runtime_choices := coalesce(v_runtime->'choices', '{}'::jsonb);
  if jsonb_typeof(v_runtime_choices) <> 'object' then v_runtime_choices := '{}'::jsonb; end if;

  v_entry := jsonb_build_object('source_level',v_source_level,'instances',v_instances,'refresh',v_refresh,'updated_at',to_jsonb(now()));
  v_runtime_choices := jsonb_set(v_runtime_choices,array[p_choice_key],v_entry,true);
  v_runtime := jsonb_set(v_runtime,'{choices}',v_runtime_choices,true);
  v_next := jsonb_set(v_next,'{_choice_runtime_v2}',v_runtime,true);

  update public.character_template_assignments
  set selected_choices=v_next,updated_at=now()
  where id=v_assignment.id
  returning updated_at into v_updated_at;

  return jsonb_build_object(
    'assignment_id',v_assignment.id,'choice_key',p_choice_key,'source_level',v_source_level,
    'refresh',v_refresh,'instances',v_instances,'selected_choices',v_next,'updated_at',v_updated_at
  );
end;
$function$;

revoke all on function public.commit_character_template_rest_choice_v1(uuid,text,jsonb) from public,anon;
grant execute on function public.commit_character_template_rest_choice_v1(uuid,text,jsonb) to authenticated,service_role;
comment on function public.commit_character_template_rest_choice_v1(uuid,text,jsonb) is
'Generic Choice Runtime v2 rest refresh for short-rest, long-rest, and short-or-long-rest choices.';

commit;