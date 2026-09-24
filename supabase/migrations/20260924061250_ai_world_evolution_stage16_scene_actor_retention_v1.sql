-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 16: temporal-safe scene actor retention and runtime compaction.


alter table public.ai_scene_actors
  add column retention_state text not null default 'full'
    check (retention_state in ('full','compacted')),
  add column retention_version smallint not null default 1
    check (retention_version>=1),
  add column retention_compacted_at timestamptz,
  add column retention_original_bytes integer
    check (retention_original_bytes is null or retention_original_bytes>=0),
  add column retention_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(retention_summary)='object');

alter table public.ai_scene_actors
  add constraint ai_scene_actor_retention_state_check
  check (
    retention_state='full'
    or (
      runtime_state='archived'
      and retention_compacted_at is not null
    )
  );

create index ai_scene_actor_retention_sweep_idx
  on public.ai_scene_actors(
    campaign_id,retention_state,campaign_day,runtime_state
  )
  where runtime_state='archived' and retention_state='full';

create or replace function private.compact_ai_scene_actor_v1(
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor public.ai_scene_actors%rowtype;
  v_resources jsonb;
  v_command_count integer;
  v_damage_count integer;
  v_damage_total integer;
  v_recent_commands jsonb;
  v_original_bytes integer;
  v_summary jsonb;
begin
  select * into v_actor
  from public.ai_scene_actors
  where id=p_actor_id
  for update;

  if v_actor.id is null then
    raise exception using errcode='P0002',message='scene_actor_retention_actor_not_found';
  end if;

  if v_actor.retention_state='compacted' then
    return jsonb_build_object(
      'actor_id',v_actor.id,
      'retention_state',v_actor.retention_state,
      'replayed',true
    );
  end if;

  if v_actor.runtime_state<>'archived' then
    return jsonb_build_object(
      'actor_id',v_actor.id,
      'retention_state',v_actor.retention_state,
      'eligible',false,
      'reason','actor_still_active',
      'replayed',false
    );
  end if;

  if v_actor.promoted_character_id is not null
     and not exists(
       select 1
       from public.ai_background_entity_snapshots s
       where s.campaign_id=v_actor.campaign_id
         and s.entity_scope='npc'
         and s.entity_id=v_actor.promoted_character_id::text
         and s.provenance->>'stage'='15'
         and s.provenance->>'source_actor_id'=v_actor.id::text
     )
  then
    return jsonb_build_object(
      'actor_id',v_actor.id,
      'retention_state',v_actor.retention_state,
      'eligible',false,
      'reason','promoted_handoff_snapshot_missing',
      'replayed',false
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'state_key',r.state_key,
        'current',r.current,
        'max',r.max_snapshot,
        'label',r.label,
        'recharge',r.recharge,
        'usage',r.usage
      ) order by r.state_key
    ),
    '[]'::jsonb
  )
  into v_resources
  from public.ai_scene_actor_resources r
  where r.actor_id=v_actor.id;

  select count(*) into v_command_count
  from public.ai_scene_actor_command_receipts r
  where r.actor_id=v_actor.id;

  select count(*),coalesce(sum(r.applied_damage),0)
  into v_damage_count,v_damage_total
  from public.ai_scene_actor_damage_receipts r
  where r.actor_id=v_actor.id;

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.created_at desc),
    '[]'::jsonb
  )
  into v_recent_commands
  from (
    select r.command_kind,r.created_at
    from public.ai_scene_actor_command_receipts r
    where r.actor_id=v_actor.id
    order by r.created_at desc
    limit 8
  ) x;

  v_original_bytes:=
    pg_column_size(v_actor.sheet_snapshot)
    + pg_column_size(v_actor.mechanics_snapshot)
    + pg_column_size(v_actor.conditions)
    + pg_column_size(v_actor.effects)
    + coalesce((
      select sum(pg_column_size(to_jsonb(r)))
      from public.ai_scene_actor_resources r
      where r.actor_id=v_actor.id
    ),0);

  v_summary:=jsonb_build_object(
    'retention_version',1,
    'compacted_from','full_scene_actor_runtime',
    'actor',jsonb_build_object(
      'current_hp',v_actor.current_hp,
      'max_hp',v_actor.max_hp,
      'life_state',v_actor.life_state,
      'conditions',v_actor.conditions,
      'effects',v_actor.effects,
      'archive_reason',v_actor.archive_reason,
      'campaign_day',v_actor.campaign_day,
      'day_period',v_actor.day_period
    ),
    'runtime',jsonb_build_object(
      'sheet_digest',pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(v_actor.sheet_snapshot::text,'UTF8'),'sha256'
        ),
        'hex'
      ),
      'mechanics_digest',pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(v_actor.mechanics_snapshot::text,'UTF8'),'sha256'
        ),
        'hex'
      ),
      'mechanic_count',jsonb_array_length(v_actor.mechanics_snapshot),
      'resources',v_resources
    ),
    'audit',jsonb_build_object(
      'command_receipt_count',v_command_count,
      'damage_receipt_count',v_damage_count,
      'total_recorded_damage',v_damage_total,
      'recent_command_kinds',v_recent_commands
    ),
    'promotion',jsonb_build_object(
      'promoted_character_id',v_actor.promoted_character_id,
      'promotion_name',v_actor.promotion_name,
      'promoted_at',v_actor.promoted_at,
      'promotion_source_message_id',v_actor.promotion_source_message_id
    ),
    'provenance',jsonb_build_object(
      'source_bestiary_slug',v_actor.source_bestiary_slug,
      'source_digest',v_actor.source_digest,
      'compiler_version',v_actor.compiler_version,
      'spawn_key',v_actor.spawn_key,
      'runtime_ordinal',v_actor.runtime_ordinal,
      'room_id',v_actor.room_id,
      'location_id',v_actor.location_id
    )
  );

  delete from public.ai_scene_actor_resources
  where actor_id=v_actor.id;

  update public.ai_scene_actors
  set
    sheet_snapshot=jsonb_build_object(
      'retention','compacted',
      'source_digest',source_digest,
      'compiler_version',compiler_version
    ),
    mechanics_snapshot='[]'::jsonb,
    conditions='[]'::jsonb,
    effects='[]'::jsonb,
    retention_state='compacted',
    retention_version=1,
    retention_compacted_at=now(),
    retention_original_bytes=v_original_bytes,
    retention_summary=v_summary,
    revision=revision+1,
    updated_at=now()
  where id=v_actor.id
  returning * into v_actor;

  return jsonb_build_object(
    'actor_id',v_actor.id,
    'retention_state',v_actor.retention_state,
    'promoted_character_id',v_actor.promoted_character_id,
    'original_bytes',v_original_bytes,
    'resource_rows_pruned',jsonb_array_length(v_resources),
    'command_receipts_preserved',v_command_count,
    'damage_receipts_preserved',v_damage_count,
    'replayed',false
  );
end;
$$;

revoke all on function private.compact_ai_scene_actor_v1(uuid)
  from public, anon, authenticated;

create or replace function private.compact_ai_scene_actor_retention_v1(
  p_campaign_id uuid,
  p_keep_game_days integer default 14,
  p_limit integer default 128
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_safe_day integer;
  v_cutoff_day integer;
  v_actor_id uuid;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_processed integer:=0;
  v_compacted integer:=0;
begin
  if p_campaign_id is null
     or not private.is_ai_world_campaign_v1(p_campaign_id)
  then
    return jsonb_build_object(
      'enabled',false,
      'processed',0,
      'compacted',0,
      'results','[]'::jsonb
    );
  end if;

  if p_keep_game_days is null or p_keep_game_days<1 or p_keep_game_days>3650 then
    raise exception using errcode='22023',message='scene_actor_retention_keep_days_invalid';
  end if;

  v_safe_day:=private.ai_background_safe_materialization_day_v1(p_campaign_id);
  v_cutoff_day:=greatest(0,v_safe_day-p_keep_game_days);

  for v_actor_id in
    select a.id
    from public.ai_scene_actors a
    where a.campaign_id=p_campaign_id
      and a.runtime_state='archived'
      and a.retention_state='full'
      and a.campaign_day<=v_cutoff_day
    order by a.campaign_day,a.archived_at nulls last,a.id
    limit greatest(1,least(coalesce(p_limit,128),512))
  loop
    v_result:=private.compact_ai_scene_actor_v1(v_actor_id);
    v_results:=v_results||jsonb_build_array(v_result);
    v_processed:=v_processed+1;
    if v_result->>'retention_state'='compacted' then
      v_compacted:=v_compacted+1;
    end if;
  end loop;

  return jsonb_build_object(
    'enabled',true,
    'safe_through_game_day',v_safe_day,
    'keep_game_days',p_keep_game_days,
    'cutoff_game_day',v_cutoff_day,
    'processed',v_processed,
    'compacted',v_compacted,
    'results',v_results
  );
end;
$$;

revoke all on function private.compact_ai_scene_actor_retention_v1(uuid,integer,integer)
  from public, anon, authenticated;

create or replace function public.compact_ai_scene_actor_retention_v1(
  p_campaign_id uuid,
  p_keep_game_days integer default 14,
  p_limit integer default 128
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select private.compact_ai_scene_actor_retention_v1(
    p_campaign_id,p_keep_game_days,p_limit
  )
$$;

revoke all on function public.compact_ai_scene_actor_retention_v1(uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.compact_ai_scene_actor_retention_v1(uuid,integer,integer)
  to service_role;

create or replace function private.ai_background_materialize_after_world_time_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.campaign_day>old.campaign_day
     and exists(
       select 1
       from public.campaign_members cm
       where cm.campaign_id=new.campaign_id
         and cm.role='player'
         and cm.active_character_id=new.character_id
     )
  then
    perform private.materialize_safe_ai_background_events_v1(
      new.campaign_id,128
    );
    perform private.compact_ai_scene_actor_retention_v1(
      new.campaign_id,14,128
    );
  end if;

  return new;
end;
$$;

revoke all on function private.ai_background_materialize_after_world_time_v1()
  from public, anon, authenticated;

