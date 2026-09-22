
create or replace function private.resolve_quest_v1(
  p_quest_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quest public.quests%rowtype;
  v_stage record;
  v_stage_results jsonb := '[]'::jsonb;
  v_previous_guard text;
begin
  perform pg_advisory_xact_lock(hashtextextended('quest:' || p_quest_id::text, 0));

  select * into v_quest
  from public.quests
  where id = p_quest_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'quest_not_found');
  end if;

  v_previous_guard := current_setting('meganot.quest_resolver_running', true);
  perform set_config('meganot.quest_resolver_running', '1', true);

  for v_stage in
    select qs.id
    from public.quest_stages qs
    where qs.quest_id = p_quest_id
      and qs.status = 'active'
    order by qs.position, qs.id
  loop
    v_stage_results := v_stage_results
      || jsonb_build_array(private.resolve_quest_stage_v1(v_stage.id));
  end loop;

  perform set_config(
    'meganot.quest_resolver_running',
    coalesce(v_previous_guard, ''),
    true
  );

  return jsonb_build_object(
    'ok', true,
    'quest_id', p_quest_id,
    'stages', v_stage_results
  );
end;
$$;

create or replace function private.quest_resolve_active_stage_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('meganot.quest_resolver_running', true) = '1' then
    return new;
  end if;

  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.resolve_quest_v1(new.quest_id);
  end if;

  return new;
end;
$$;

comment on function private.quest_resolve_active_stage_v1() is
  'Starts Resolver for externally activated stages, but ignores activation performed internally by the Resolver itself.';
;