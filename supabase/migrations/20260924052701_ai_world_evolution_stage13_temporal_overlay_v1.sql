-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 13: scene-day temporal background overlays and future-safe context loader.


create or replace function private.validate_ai_background_temporal_overlay_event_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_state jsonb;
  v_overlay jsonb;
  v_key text;
  v_location_id uuid;
begin
  if new.entity_scope not in ('world','npc','location') then
    return new;
  end if;

  v_state:=new.effect_payload->'proposed_state';
  if jsonb_typeof(v_state)<>'object' or not (v_state ? 'temporal_overlay') then
    return new;
  end if;

  v_overlay:=v_state->'temporal_overlay';
  if jsonb_typeof(v_overlay)<>'object' then
    raise exception using errcode='22023',message='ai_background_temporal_overlay_must_be_object';
  end if;

  for v_key in select jsonb_object_keys(v_overlay)
  loop
    if new.entity_scope='npc'
       and v_key not in ('life_state','location_id','status') then
      raise exception using errcode='22023',message='ai_background_npc_temporal_overlay_key_invalid';
    elsif new.entity_scope='location'
       and v_key not in ('lifecycle_state','status') then
      raise exception using errcode='22023',message='ai_background_location_temporal_overlay_key_invalid';
    elsif new.entity_scope='world'
       and v_key not in ('status') then
      raise exception using errcode='22023',message='ai_background_world_temporal_overlay_key_invalid';
    end if;
  end loop;

  if new.entity_scope='npc' then
    if v_overlay ? 'life_state'
       and coalesce(v_overlay->>'life_state','') not in ('alive','dead') then
      raise exception using errcode='22023',message='ai_background_npc_temporal_life_state_invalid';
    end if;

    if v_overlay ? 'location_id'
       and jsonb_typeof(v_overlay->'location_id')<>'null'
    then
      if jsonb_typeof(v_overlay->'location_id')<>'string' then
        raise exception using errcode='22023',message='ai_background_npc_temporal_location_invalid';
      end if;

      begin
        v_location_id:=(v_overlay->>'location_id')::uuid;
      exception when invalid_text_representation then
        raise exception using errcode='22023',message='ai_background_npc_temporal_location_invalid';
      end;

      if not exists(
        select 1
        from public.locations l
        where l.id=v_location_id
          and l.campaign_id=new.campaign_id
      ) then
        raise exception using errcode='22023',message='ai_background_npc_temporal_location_not_found';
      end if;
    end if;
  elsif new.entity_scope='location' then
    if v_overlay ? 'lifecycle_state'
       and coalesce(v_overlay->>'lifecycle_state','') not in ('active','archived') then
      raise exception using errcode='22023',message='ai_background_location_temporal_lifecycle_invalid';
    end if;
  end if;

  if v_overlay ? 'status' then
    if jsonb_typeof(v_overlay->'status')<>'string'
       or length(btrim(v_overlay->>'status'))<1
       or length(btrim(v_overlay->>'status'))>80
       or btrim(v_overlay->>'status') !~ '^[a-z][a-z0-9._:-]{0,79}$'
    then
      raise exception using errcode='22023',message='ai_background_temporal_status_invalid';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_ai_background_temporal_overlay_event_v1()
  from public, anon, authenticated;

create trigger ai_background_events_stage13_temporal_overlay_validate
before insert or update of effect_payload,entity_scope,entity_id
on public.ai_background_events
for each row
execute function private.validate_ai_background_temporal_overlay_event_v1();

create or replace function public.read_ai_background_temporal_context_v1(
  p_campaign_id uuid,
  p_scene_day integer,
  p_source_location_id uuid default null,
  p_relevant_npc_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_world jsonb;
  v_location jsonb;
  v_npcs jsonb;
  v_events jsonb;
  v_npc_ids uuid[]:=coalesce(p_relevant_npc_ids,'{}'::uuid[]);
begin
  if p_campaign_id is null then
    raise exception using errcode='22023',message='ai_background_temporal_campaign_required';
  end if;

  if p_scene_day is null or p_scene_day<1 then
    raise exception using errcode='22023',message='ai_background_temporal_scene_day_invalid';
  end if;

  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    return jsonb_build_object(
      'enabled',false,'scene_day',p_scene_day,
      'world_snapshot',null,'source_location_snapshot',null,
      'npc_snapshots','[]'::jsonb,'high_importance_events','[]'::jsonb
    );
  end if;

  if p_source_location_id is not null
     and not exists(
       select 1 from public.locations l
       where l.id=p_source_location_id and l.campaign_id=p_campaign_id
     )
  then
    raise exception using errcode='22023',message='ai_background_temporal_source_location_mismatch';
  end if;

  if exists(
    select 1
    from unnest(v_npc_ids) u(id)
    where not exists(
      select 1
      from public.characters c
      where c.id=u.id
        and c.campaign_id=p_campaign_id
        and c.character_type='npc'
        and c.publication_state='campaign'
    )
  ) then
    raise exception using errcode='22023',message='ai_background_temporal_npc_mismatch';
  end if;

  v_world:=private.ai_background_snapshot_for_worker_v1(
    p_campaign_id,p_scene_day,'world',p_campaign_id::text
  );

  if p_source_location_id is not null then
    v_location:=private.ai_background_snapshot_for_worker_v1(
      p_campaign_id,p_scene_day,'location',p_source_location_id::text
    );
  end if;

  with latest_npc as (
    select distinct on (s.entity_id)
      s.id,s.entity_id,s.through_game_day,s.version,s.merge_version,
      s.summary,s.state,s.source_event_id,s.previous_snapshot_id
    from public.ai_background_entity_snapshots s
    where s.campaign_id=p_campaign_id
      and s.entity_scope='npc'
      and s.through_game_day<=p_scene_day
    order by s.entity_id,s.through_game_day desc,s.version desc
  ),
  chosen as (
    select n.*
    from latest_npc n
    where
      (
        n.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (n.entity_id::uuid)=any(v_npc_ids)
      )
      or (
        p_source_location_id is not null
        and n.state->'temporal_overlay' ? 'location_id'
        and n.state->'temporal_overlay'->>'location_id'=p_source_location_id::text
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'entity_id',entity_id,
        'snapshot',jsonb_build_object(
          'id',id,'through_game_day',through_game_day,'version',version,
          'merge_version',merge_version,'summary',summary,'state',state,
          'source_event_id',source_event_id,'previous_snapshot_id',previous_snapshot_id
        )
      )
      order by entity_id
    ),
    '[]'::jsonb
  )
  into v_npcs
  from chosen;

  with relevant_ids as (
    select 'world'::text scope,p_campaign_id::text entity_id
    union all
    select 'location',p_source_location_id::text
    where p_source_location_id is not null
    union all
    select 'npc',x->>'entity_id'
    from jsonb_array_elements(v_npcs) x
  )
  select coalesce(
    jsonb_agg(to_jsonb(e) order by e.effective_game_day desc,e.importance desc,e.created_at desc),
    '[]'::jsonb
  )
  into v_events
  from (
    select
      b.id,b.effective_game_day,b.entity_scope,b.entity_id,b.event_kind,
      left(b.summary,1200) summary,b.importance,b.created_at
    from public.ai_background_events b
    join relevant_ids r
      on r.scope=b.entity_scope and r.entity_id=b.entity_id
    where b.campaign_id=p_campaign_id
      and b.effective_game_day<=p_scene_day
      and b.importance>=4
    order by b.effective_game_day desc,b.importance desc,b.created_at desc
    limit 8
  ) e;

  return jsonb_build_object(
    'enabled',true,'scene_day',p_scene_day,
    'world_snapshot',v_world,'source_location_snapshot',v_location,
    'npc_snapshots',v_npcs,'high_importance_events',v_events
  );
end;
$$;

revoke all on function public.read_ai_background_temporal_context_v1(uuid,integer,uuid,uuid[])
  from public, anon, authenticated;
grant execute on function public.read_ai_background_temporal_context_v1(uuid,integer,uuid,uuid[])
  to service_role;

