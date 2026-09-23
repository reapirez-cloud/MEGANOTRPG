-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 12: immutable event -> versioned compact replacement snapshot.
-- Active worker context reads the latest applicable snapshot; raw event history remains queryable separately.

alter table public.ai_background_entity_snapshots
  add column previous_snapshot_id uuid
    references public.ai_background_entity_snapshots(id) on delete restrict,
  add column merge_version smallint not null default 1
    check (merge_version>=1);

create unique index ai_background_snapshots_source_event_unique_idx
  on public.ai_background_entity_snapshots(source_event_id)
  where source_event_id is not null;

create index ai_background_snapshots_previous_idx
  on public.ai_background_entity_snapshots(previous_snapshot_id)
  where previous_snapshot_id is not null;

create or replace function private.ai_background_snapshot_for_worker_v1(
  p_campaign_id uuid,
  p_campaign_day integer,
  p_scope text,
  p_entity_id text
)
returns jsonb
language sql
stable
set search_path=''
as $$
  select jsonb_build_object(
    'id',s.id,
    'through_game_day',s.through_game_day,
    'version',s.version,
    'merge_version',s.merge_version,
    'summary',s.summary,
    'state',s.state,
    'source_event_id',s.source_event_id,
    'previous_snapshot_id',s.previous_snapshot_id
  )
  from public.ai_background_entity_snapshots s
  where s.campaign_id=p_campaign_id
    and s.entity_scope=p_scope
    and s.entity_id=p_entity_id
    and s.through_game_day<=p_campaign_day
  order by s.through_game_day desc,s.version desc
  limit 1
$$;

revoke all on function private.ai_background_snapshot_for_worker_v1(uuid,integer,text,text)
  from public, anon, authenticated;

create or replace function private.ai_background_recent_events_for_worker_v1(
  p_campaign_id uuid,
  p_campaign_day integer,
  p_scope text,
  p_entity_id text,
  p_limit integer default 4
)
returns jsonb
language sql
stable
set search_path=''
as $$
  select case
    when exists(
      select 1
      from public.ai_background_entity_snapshots s
      where s.campaign_id=p_campaign_id
        and s.entity_scope=p_scope
        and s.entity_id=p_entity_id
        and s.through_game_day<=p_campaign_day
    ) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(to_jsonb(e) order by e.effective_game_day desc,e.created_at desc)
      from (
        select
          b.effective_game_day,
          b.event_kind,
          left(b.summary,1200) summary,
          b.importance,
          b.created_at
        from public.ai_background_events b
        where b.campaign_id=p_campaign_id
          and b.entity_scope=p_scope
          and b.entity_id=p_entity_id
          and b.effective_game_day<=p_campaign_day
        order by b.effective_game_day desc,b.created_at desc
        limit greatest(0,least(coalesce(p_limit,4),8))
      ) e
    ),'[]'::jsonb)
  end
$$;

revoke all on function private.ai_background_recent_events_for_worker_v1(uuid,integer,text,text,integer)
  from public, anon, authenticated;

create or replace function private.merge_ai_background_event_snapshot_v1(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event public.ai_background_events%rowtype;
  v_run public.ai_background_daily_runs%rowtype;
  v_existing public.ai_background_entity_snapshots%rowtype;
  v_previous public.ai_background_entity_snapshots%rowtype;
  v_created public.ai_background_entity_snapshots%rowtype;
  v_summary text;
  v_state jsonb;
  v_snapshot_key text;
  v_provenance jsonb;
  v_semantics jsonb;
  v_fingerprint text;
  v_version integer;
  v_state_bytes integer;
begin
  if p_event_id is null then
    raise exception using errcode='22023',message='ai_background_snapshot_event_required';
  end if;

  select * into v_event
  from public.ai_background_events
  where id=p_event_id;

  if v_event.id is null then
    raise exception using errcode='P0002',message='ai_background_snapshot_event_not_found';
  end if;

  select * into v_run
  from public.ai_background_daily_runs
  where id=v_event.run_id;

  if v_run.id is null
     or v_run.campaign_id<>v_event.campaign_id
     or v_run.campaign_day<>v_event.effective_game_day
  then
    raise exception using errcode='22023',message='ai_background_snapshot_event_run_mismatch';
  end if;

  if not private.is_ai_world_campaign_v1(v_event.campaign_id) then
    raise exception using errcode='42501',message='ai_background_ai_world_only';
  end if;

  if v_event.entity_scope not in ('world','npc','location') then
    raise exception using errcode='22023',message='ai_background_snapshot_scope_invalid';
  end if;

  if coalesce(v_event.effect_payload->>'snapshot_mode','')<>'replace' then
    raise exception using errcode='22023',message='ai_background_snapshot_replace_mode_required';
  end if;

  v_summary:=btrim(coalesce(v_event.effect_payload->>'snapshot_summary',''));
  v_state:=v_event.effect_payload->'proposed_state';

  if length(v_summary)<1 or length(v_summary)>1800 then
    raise exception using errcode='22023',message='ai_background_snapshot_summary_invalid';
  end if;

  if jsonb_typeof(v_state)<>'object' then
    raise exception using errcode='22023',message='ai_background_snapshot_state_invalid';
  end if;

  v_state_bytes:=pg_catalog.octet_length(v_state::text);
  if v_state_bytes>24000 then
    raise exception using errcode='54000',message='ai_background_snapshot_state_budget_exceeded';
  end if;

  if v_state ?| array[
    'history','event_history','daily_history','timeline','events','event_log'
  ] then
    raise exception using errcode='22023',message='ai_background_snapshot_history_key_forbidden';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_event.campaign_id::text||':snapshot:'||
      v_event.entity_scope||':'||v_event.entity_id,
      0
    )
  );

  select * into v_existing
  from public.ai_background_entity_snapshots
  where source_event_id=v_event.id;

  if found then
    return jsonb_build_object(
      'snapshot',to_jsonb(v_existing)-'request_fingerprint',
      'replayed',true
    );
  end if;

  if exists(
    select 1
    from public.ai_background_entity_snapshots s
    where s.campaign_id=v_event.campaign_id
      and s.entity_scope=v_event.entity_scope
      and s.entity_id=v_event.entity_id
      and s.through_game_day>v_event.effective_game_day
  ) then
    raise exception using errcode='55000',message='ai_background_snapshot_future_version_conflict';
  end if;

  select * into v_previous
  from public.ai_background_entity_snapshots s
  where s.campaign_id=v_event.campaign_id
    and s.entity_scope=v_event.entity_scope
    and s.entity_id=v_event.entity_id
    and s.through_game_day<=v_event.effective_game_day
  order by s.through_game_day desc,s.version desc
  limit 1;

  v_version:=coalesce(v_previous.version,0)+1;
  v_snapshot_key:='stage12:event:'||v_event.id::text;
  v_provenance:=jsonb_strip_nulls(jsonb_build_object(
    'stage',12,
    'merge_mode','replace',
    'merge_version',1,
    'source_event_id',v_event.id,
    'source_event_key',v_event.event_key,
    'source_event_kind',v_event.event_kind,
    'source_event_day',v_event.effective_game_day,
    'previous_snapshot_id',v_previous.id,
    'previous_version',v_previous.version,
    'previous_through_game_day',v_previous.through_game_day
  ));

  v_semantics:=jsonb_build_object(
    'run_id',v_run.id,
    'through_game_day',v_event.effective_game_day,
    'entity_scope',v_event.entity_scope,
    'entity_id',v_event.entity_id,
    'version',v_version,
    'summary',v_summary,
    'state',v_state,
    'source_event_id',v_event.id,
    'previous_snapshot_id',v_previous.id,
    'merge_version',1,
    'provenance',v_provenance
  );

  v_fingerprint:=pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_semantics::text,'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.ai_background_entity_snapshots(
    campaign_id,run_id,through_game_day,snapshot_key,
    entity_scope,entity_id,version,summary,state,
    source_event_id,previous_snapshot_id,merge_version,
    provenance,request_fingerprint
  ) values (
    v_event.campaign_id,v_run.id,v_event.effective_game_day,v_snapshot_key,
    v_event.entity_scope,v_event.entity_id,v_version,v_summary,v_state,
    v_event.id,v_previous.id,1,
    v_provenance,v_fingerprint
  )
  returning * into v_created;

  return jsonb_build_object(
    'snapshot',to_jsonb(v_created)-'request_fingerprint',
    'previous_snapshot',case
      when v_previous.id is null then null
      else to_jsonb(v_previous)-'request_fingerprint'
    end,
    'replayed',false
  );
end;
$$;

revoke all on function private.merge_ai_background_event_snapshot_v1(uuid)
  from public, anon, authenticated;

create or replace function public.merge_ai_background_event_snapshot_v1(
  p_event_id uuid
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select private.merge_ai_background_event_snapshot_v1(p_event_id)
$$;

revoke all on function public.merge_ai_background_event_snapshot_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.merge_ai_background_event_snapshot_v1(uuid)
  to service_role;

create or replace function private.merge_ai_background_event_snapshot_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.entity_scope in ('world','npc','location')
     and coalesce(new.effect_payload->>'snapshot_mode','')='replace'
  then
    perform private.merge_ai_background_event_snapshot_v1(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.merge_ai_background_event_snapshot_trigger_v1()
  from public, anon, authenticated;

create trigger ai_background_events_stage12_snapshot_merge
after insert on public.ai_background_events
for each row
execute function private.merge_ai_background_event_snapshot_trigger_v1();

