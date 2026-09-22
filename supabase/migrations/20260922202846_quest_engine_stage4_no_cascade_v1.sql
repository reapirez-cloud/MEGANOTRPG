
create or replace function private.resolve_quest_stage_v1(
  p_stage_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage public.quest_stages%rowtype;
  v_quest public.quests%rowtype;
  v_group record;
  v_group_count integer := 0;
  v_all_groups boolean := true;
  v_next_stage_id uuid;
  v_has_open boolean;
  v_all_complete boolean;
begin
  select * into v_stage
  from public.quest_stages
  where id = p_stage_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'stage_not_found');
  end if;

  select * into v_quest
  from public.quests
  where id = v_stage.quest_id
  for update;

  for v_group in
    select qcg.id
    from public.quest_condition_groups qcg
    where qcg.stage_id = p_stage_id
    order by qcg.position, qcg.id
  loop
    v_group_count := v_group_count + 1;
    v_all_groups := v_all_groups
      and private.quest_condition_group_satisfied_v1(v_group.id);
  end loop;

  if v_stage.status <> 'active' then
    return jsonb_build_object(
      'ok', true,
      'completed', false,
      'status', v_stage.status,
      'groups', v_group_count,
      'conditions_satisfied', v_group_count > 0 and v_all_groups
    );
  end if;

  if v_group_count = 0 or not v_all_groups then
    return jsonb_build_object(
      'ok', true,
      'completed', false,
      'status', v_stage.status,
      'groups', v_group_count,
      'conditions_satisfied', false
    );
  end if;

  update public.quest_stages
  set status = 'completed',
      completed_at = coalesce(completed_at, now())
  where id = p_stage_id
    and status = 'active';

  perform private.quest_emit_stage_completed_event_v1(p_stage_id);

  select qs.id into v_next_stage_id
  from public.quest_stages qs
  where qs.quest_id = v_quest.id
    and qs.status = 'planned'
    and qs.position > v_stage.position
  order by qs.position
  limit 1
  for update;

  if v_next_stage_id is not null then
    update public.quest_stages
    set status = 'active'
    where id = v_next_stage_id
      and status = 'planned';
  end if;

  select exists (
    select 1
    from public.quest_stages qs
    where qs.quest_id = v_quest.id
      and qs.status in ('planned','active')
  )
  into v_has_open;

  select
    count(*) > 0
    and bool_and(qs.status in ('completed','skipped'))
  into v_all_complete
  from public.quest_stages qs
  where qs.quest_id = v_quest.id;

  if not v_has_open
     and v_all_complete
     and v_quest.status = 'active' then
    update public.quests
    set status = 'completed',
        closed_at = coalesce(closed_at, now())
    where id = v_quest.id
      and status = 'active';

    perform private.quest_emit_completed_event_v1(v_quest.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'completed', true,
    'stage_id', p_stage_id,
    'next_stage_id', v_next_stage_id
  );
end;
$$;

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
begin
  perform pg_advisory_xact_lock(hashtextextended('quest:' || p_quest_id::text, 0));

  select * into v_quest
  from public.quests
  where id = p_quest_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'quest_not_found');
  end if;

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

  return jsonb_build_object(
    'ok', true,
    'quest_id', p_quest_id,
    'stages', v_stage_results
  );
end;
$$;

comment on function private.resolve_quest_v1(uuid) is
  'Resolves only stages active at the beginning of a resolver pass. Completing one stage may activate the next, but never auto-completes that newly activated stage in the same pass.';
;