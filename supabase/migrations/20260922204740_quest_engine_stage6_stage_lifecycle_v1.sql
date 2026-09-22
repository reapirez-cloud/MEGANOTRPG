
create or replace function public.set_quest_stage_status_v1(
  p_stage_id uuid,
  p_status text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_stage public.quest_stages%rowtype;
  v_quest public.quests%rowtype;
  v_character_ids uuid[];
  v_next_stage_id uuid;
  v_has_open boolean;
  v_all_complete boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if p_status not in ('planned','active','completed','failed','skipped') then
    raise exception 'quest_stage_status_invalid';
  end if;

  select * into v_stage
  from public.quest_stages
  where id = p_stage_id
  for update;

  if not found then
    raise exception 'quest_stage_not_found';
  end if;

  if not private.can_manage_quest(v_stage.quest_id, v_user_id) then
    raise exception 'quest_stage_status_denied';
  end if;

  select * into v_quest
  from public.quests
  where id = v_stage.quest_id
  for update;

  if v_stage.status = p_status then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'stage_id', p_stage_id,
      'status', p_status,
      'plan', public.read_quest_plan_v1(v_stage.quest_id)
    );
  end if;

  update public.quest_stages
  set status = p_status,
      completed_at = case
        when p_status = 'completed' then coalesce(completed_at, now())
        else null
      end
  where id = p_stage_id;

  if p_status = 'completed' then
    select coalesce(
      array_agg(qc.character_id order by qc.created_at),
      '{}'::uuid[]
    )
    into v_character_ids
    from public.quest_characters qc
    where qc.quest_id = v_stage.quest_id;

    insert into public.campaign_events(
      campaign_id,
      event_type,
      source_kind,
      source_id,
      participant_character_ids,
      summary,
      payload,
      importance,
      visibility,
      visible_character_ids,
      confidence,
      provenance,
      occurred_at
    )
    values(
      v_quest.campaign_id,
      'quest.stage_completed',
      'quest_engine',
      'stage:' || p_stage_id::text,
      v_character_ids,
      coalesce(
        nullif(v_stage.completion_text, ''),
        nullif(v_stage.player_title, ''),
        'Этап квеста завершён.'
      ),
      jsonb_build_object(
        'quest_id', v_stage.quest_id,
        'stage_id', p_stage_id,
        'player_title', v_stage.player_title,
        'completion_text', v_stage.completion_text,
        'note', left(coalesce(p_note, ''), 6000)
      ),
      2,
      'characters',
      v_character_ids,
      1,
      jsonb_build_object(
        'engine', 'quest_stage_status_v1',
        'automatic', false,
        'actor_user_id', v_user_id
      ),
      now()
    )
    on conflict(campaign_id, source_kind, source_id) do nothing;
  end if;

  if p_status in ('completed','skipped') then
    select qs.id into v_next_stage_id
    from public.quest_stages qs
    where qs.quest_id = v_stage.quest_id
      and qs.status = 'planned'
      and qs.position > v_stage.position
    order by qs.position, qs.id
    limit 1
    for update;

    if v_next_stage_id is not null then
      update public.quest_stages
      set status = 'active'
      where id = v_next_stage_id
        and status = 'planned';
    end if;
  end if;

  select exists (
    select 1
    from public.quest_stages qs
    where qs.quest_id = v_stage.quest_id
      and qs.status in ('planned','active')
  )
  into v_has_open;

  select
    count(*) > 0
    and bool_and(qs.status in ('completed','skipped'))
  into v_all_complete
  from public.quest_stages qs
  where qs.quest_id = v_stage.quest_id;

  if not v_has_open
     and v_all_complete
     and v_quest.status = 'active' then
    update public.quests
    set status = 'completed',
        closed_at = coalesce(closed_at, now())
    where id = v_stage.quest_id
      and status = 'active';

    perform private.quest_emit_completed_event_v1(v_stage.quest_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'stage_id', p_stage_id,
    'status', p_status,
    'next_stage_id', v_next_stage_id,
    'plan', public.read_quest_plan_v1(v_stage.quest_id)
  );
end;
$$;

revoke all on function public.set_quest_stage_status_v1(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.set_quest_stage_status_v1(uuid, text, text)
to authenticated, service_role;

comment on function public.set_quest_stage_status_v1(uuid, text, text) is
  'GM/Admin lifecycle-safe manual stage status API. Manual completion emits the canonical player-safe stage event, advances the next planned stage, and closes the quest when appropriate.';
;