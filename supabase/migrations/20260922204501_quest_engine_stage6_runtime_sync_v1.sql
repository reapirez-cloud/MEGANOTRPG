
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'campaign_events'
  ) then
    alter publication supabase_realtime add table public.campaign_events;
  end if;
end $$;

create or replace function private.quest_emit_player_view_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_ids uuid[];
  v_event_type text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status = 'draft' then
    return new;
  end if;

  if new.title is not distinct from old.title
     and new.player_brief is not distinct from old.player_brief
     and new.status is not distinct from old.status then
    return new;
  end if;

  select coalesce(
    array_agg(qc.character_id order by qc.created_at),
    '{}'::uuid[]
  )
  into v_character_ids
  from public.quest_characters qc
  where qc.quest_id = new.id;

  if coalesce(array_length(v_character_ids, 1), 0) = 0 then
    return new;
  end if;

  v_event_type := case
    when old.status = 'draft' and new.status = 'active'
      then 'quest.activated'
    when new.status is distinct from old.status
      then 'quest.status_changed'
    else 'quest.updated'
  end;

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
    new.campaign_id,
    v_event_type,
    'quest_engine',
    'quest-view:' || new.id::text || ':' || gen_random_uuid()::text,
    v_character_ids,
    case v_event_type
      when 'quest.activated' then 'Получен новый квест: ' || new.title
      when 'quest.status_changed' then 'Статус квеста изменён: ' || new.title
      else 'Квест обновлён: ' || new.title
    end,
    jsonb_build_object(
      'quest_id', new.id,
      'title', new.title,
      'status', new.status
    ),
    case when v_event_type = 'quest.activated' then 2 else 1 end,
    'characters',
    v_character_ids,
    1,
    jsonb_build_object(
      'engine', 'quest_engine_v1',
      'player_safe', true
    ),
    now()
  );

  return new;
end;
$$;

drop trigger if exists quests_player_view_change_v1 on public.quests;
create trigger quests_player_view_change_v1
after update of title, player_brief, status
on public.quests
for each row
execute function private.quest_emit_player_view_change_v1();

create or replace function public.read_active_quest_context_v1(
  p_character_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select c.campaign_id
    into v_campaign_id
  from public.characters c
  where c.id = p_character_id;

  if v_campaign_id is null then
    raise exception 'character_not_found';
  end if;

  if not private.can_manage_quest_campaign(v_campaign_id, v_user_id) then
    raise exception 'quest_context_read_denied';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'quest_id', q.id,
        'quest_key', q.quest_key,
        'title', q.title,
        'player_brief', q.player_brief,
        'activated_at', q.activated_at,
        'internal_summary', coalesce(qsec.internal_summary, ''),
        'ai_directive', coalesce(qsec.ai_directive, ''),
        'active_stages', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'stage_id', qs.id,
              'stage_key', qs.stage_key,
              'position', qs.position,
              'internal_title', coalesce(qss.internal_title, ''),
              'objective', coalesce(qss.objective, ''),
              'gm_notes', coalesce(qss.gm_notes, ''),
              'targets', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'target_id', qt.id,
                    'target_key', qt.target_key,
                    'target_kind', qt.target_kind,
                    'placeholder_label', qt.placeholder_label,
                    'internal_note', qt.internal_note,
                    'binding_state', qt.binding_state,
                    'location_id', qt.location_id,
                    'npc_character_id', qt.npc_character_id,
                    'item_definition_id', qt.item_definition_id
                  )
                  order by qt.target_key
                )
                from public.quest_targets qt
                where qt.quest_id = q.id
                  and (qt.stage_id is null or qt.stage_id = qs.id)
              ), '[]'::jsonb),
              'condition_groups', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'group_id', qcg.id,
                    'group_key', qcg.group_key,
                    'mode', qcg.mode,
                    'conditions', coalesce((
                      select jsonb_agg(
                        jsonb_build_object(
                          'condition_id', qcnd.id,
                          'condition_key', qcnd.condition_key,
                          'condition_type', qcnd.condition_type,
                          'target_id', qcnd.target_id,
                          'required_quantity', qcnd.required_quantity,
                          'negated', qcnd.negated,
                          'params', qcnd.params,
                          'satisfied', coalesce(qcs.satisfied, false),
                          'resolution_source', coalesce(qcs.resolution_source, 'pending'),
                          'evidence', coalesce(qcs.evidence, '{}'::jsonb),
                          'last_evaluated_at', qcs.last_evaluated_at
                        )
                        order by qcnd.position, qcnd.condition_key
                      )
                      from public.quest_conditions qcnd
                      left join public.quest_condition_states qcs
                        on qcs.condition_id = qcnd.id
                      where qcnd.group_id = qcg.id
                    ), '[]'::jsonb)
                  )
                  order by qcg.position, qcg.group_key
                )
                from public.quest_condition_groups qcg
                where qcg.stage_id = qs.id
              ), '[]'::jsonb)
            )
            order by qs.position
          )
          from public.quest_stages qs
          left join public.quest_stage_secrets qss on qss.stage_id = qs.id
          where qs.quest_id = q.id
            and qs.status = 'active'
        ), '[]'::jsonb),
        'recent_completed_stages', coalesce((
          select jsonb_agg(stage_row.obj order by stage_row.position)
          from (
            select
              qs.position,
              jsonb_build_object(
                'stage_id', qs.id,
                'stage_key', qs.stage_key,
                'position', qs.position,
                'player_title', qs.player_title,
                'completion_text', qs.completion_text,
                'completed_at', qs.completed_at
              ) as obj
            from public.quest_stages qs
            where qs.quest_id = q.id
              and qs.status = 'completed'
            order by qs.position desc
            limit 8
          ) stage_row
        ), '[]'::jsonb)
      )
      order by q.sort_order, q.created_at
    ),
    '[]'::jsonb
  )
  into v_result
  from public.quests q
  join public.quest_characters qch
    on qch.quest_id = q.id
   and qch.character_id = p_character_id
  left join public.quest_secrets qsec
    on qsec.quest_id = q.id
  where q.campaign_id = v_campaign_id
    and q.status = 'active';

  return jsonb_build_object(
    'character_id', p_character_id,
    'campaign_id', v_campaign_id,
    'active_quests', v_result
  );
end;
$$;

revoke all on function public.read_active_quest_context_v1(uuid)
from public, anon, authenticated;
grant execute on function public.read_active_quest_context_v1(uuid)
to authenticated, service_role;

comment on function public.read_active_quest_context_v1(uuid) is
  'GM/Admin compact runtime Quest Engine context for one character. Returns only active quests and active-stage hidden data needed by AI-GM; never exposed to player authority.';

comment on function private.quest_emit_player_view_change_v1() is
  'Emits character-visible, player-safe Quest Engine invalidation events when a non-draft quest title, brief or status changes.';
;