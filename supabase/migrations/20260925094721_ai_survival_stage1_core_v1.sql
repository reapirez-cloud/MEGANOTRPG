-- AI Survival Stage 1: minute clock + canonical survival runtime.
-- Applied migration version: 20260925094721.
-- AI-world only. Human-GM campaigns keep their existing behavior.

create or replace function private.ai_campaign_minute_from_legacy_v1(
  p_campaign_day integer,
  p_day_period text
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select ((greatest(coalesce(p_campaign_day,1),1)-1)::bigint * 1440)
       + case lower(trim(coalesce(p_day_period,'day')))
           when 'deep_night' then 120
           when 'dawn' then 360
           when 'morning' then 540
           when 'day' then 780
           when 'late_day' then 960
           when 'evening' then 1200
           when 'night' then 1380
           else 780
         end
$$;

create or replace function private.ai_campaign_day_from_minute_v1(
  p_campaign_minute bigint
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (greatest(coalesce(p_campaign_minute,0),0) / 1440)::integer + 1
$$;

create or replace function private.ai_day_period_from_campaign_minute_v1(
  p_campaign_minute bigint
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when (greatest(coalesce(p_campaign_minute,0),0) % 1440) < 300 then 'deep_night'
    when (greatest(coalesce(p_campaign_minute,0),0) % 1440) < 420 then 'dawn'
    when (greatest(coalesce(p_campaign_minute,0),0) % 1440) < 660 then 'morning'
    when (greatest(coalesce(p_campaign_minute,0),0) % 1440) < 900 then 'day'
    when (greatest(coalesce(p_campaign_minute,0),0) % 1440) < 1080 then 'late_day'
    when (greatest(coalesce(p_campaign_minute,0),0) % 1440) < 1320 then 'evening'
    else 'night'
  end
$$;

alter table public.character_world_state
  add column if not exists campaign_minute bigint;

alter table public.chat_rooms
  add column if not exists campaign_minute bigint;

update public.character_world_state
set campaign_minute = private.ai_campaign_minute_from_legacy_v1(campaign_day,day_period)
where campaign_minute is null;

update public.chat_rooms
set campaign_minute = private.ai_campaign_minute_from_legacy_v1(campaign_day,day_period)
where campaign_minute is null;

alter table public.character_world_state
  alter column campaign_minute set not null;

alter table public.chat_rooms
  alter column campaign_minute set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.character_world_state'::regclass
      and conname='character_world_state_campaign_minute_check'
  ) then
    alter table public.character_world_state
      add constraint character_world_state_campaign_minute_check
      check (campaign_minute >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.chat_rooms'::regclass
      and conname='chat_rooms_campaign_minute_check'
  ) then
    alter table public.chat_rooms
      add constraint chat_rooms_campaign_minute_check
      check (campaign_minute >= 0);
  end if;
end
$$;

create or replace function private.sync_campaign_clock_columns_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_minute_changed boolean;
  v_legacy_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.campaign_minute is null then
      new.campaign_minute :=
        private.ai_campaign_minute_from_legacy_v1(new.campaign_day,new.day_period);
    else
      new.campaign_day := private.ai_campaign_day_from_minute_v1(new.campaign_minute);
      new.day_period := private.ai_day_period_from_campaign_minute_v1(new.campaign_minute);
    end if;
    return new;
  end if;

  v_minute_changed := new.campaign_minute is distinct from old.campaign_minute;
  v_legacy_changed :=
    new.campaign_day is distinct from old.campaign_day
    or new.day_period is distinct from old.day_period;

  if v_minute_changed then
    new.campaign_minute := greatest(coalesce(new.campaign_minute,0),0);
    new.campaign_day := private.ai_campaign_day_from_minute_v1(new.campaign_minute);
    new.day_period := private.ai_day_period_from_campaign_minute_v1(new.campaign_minute);
  elsif v_legacy_changed then
    new.campaign_minute :=
      private.ai_campaign_minute_from_legacy_v1(new.campaign_day,new.day_period);
  end if;

  return new;
end
$$;

drop trigger if exists character_world_state_sync_campaign_clock
  on public.character_world_state;
create trigger character_world_state_sync_campaign_clock
before insert or update of campaign_minute,campaign_day,day_period
on public.character_world_state
for each row
execute function private.sync_campaign_clock_columns_v1();

drop trigger if exists chat_rooms_sync_campaign_clock
  on public.chat_rooms;
create trigger chat_rooms_sync_campaign_clock
before insert or update of campaign_minute,campaign_day,day_period
on public.chat_rooms
for each row
execute function private.sync_campaign_clock_columns_v1();

create index if not exists character_world_state_campaign_location_minute_idx
  on public.character_world_state(campaign_id,location_id,campaign_minute desc);

alter table public.ai_player_time_catchup_receipts
  add column if not exists from_minute bigint,
  add column if not exists to_minute bigint;

update public.ai_player_time_catchup_receipts
set
  from_minute = private.ai_campaign_minute_from_legacy_v1(from_day,from_period),
  to_minute = private.ai_campaign_minute_from_legacy_v1(to_day,to_period)
where from_minute is null or to_minute is null;

alter table public.ai_player_time_catchup_receipts
  alter column from_minute set not null,
  alter column to_minute set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid='public.ai_player_time_catchup_receipts'::regclass
      and conname='ai_player_time_catchup_receip_character_id_location_id_from_key'
  ) then
    alter table public.ai_player_time_catchup_receipts
      drop constraint ai_player_time_catchup_receip_character_id_location_id_from_key;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.ai_player_time_catchup_receipts'::regclass
      and conname='ai_player_time_catchup_receipts_minute_key'
  ) then
    alter table public.ai_player_time_catchup_receipts
      add constraint ai_player_time_catchup_receipts_minute_key
      unique(character_id,location_id,from_minute,to_minute);
  end if;
end
$$;

create table if not exists private.character_survival_runtime (
  character_id uuid primary key references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  satiety_remainder integer not null default 0
    check (satiety_remainder >= 0 and satiety_remainder < 2160),
  alertness_remainder integer not null default 0
    check (alertness_remainder >= 0 and alertness_remainder < 1440),
  updated_at timestamptz not null default now()
);

create index if not exists character_survival_runtime_campaign_idx
  on private.character_survival_runtime(campaign_id);

create or replace function private.ai_survival_stage_v1(
  p_current integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when greatest(coalesce(p_current,0),0) <= 10 then 3
    when greatest(coalesce(p_current,0),0) <= 25 then 2
    when greatest(coalesce(p_current,0),0) <= 50 then 1
    else 0
  end
$$;

create or replace function private.ai_survival_stage_penalty_v1(
  p_stage integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_stage,0) >= 3 then -7
    when coalesce(p_stage,0) = 2 then -5
    else 0
  end
$$;

create or replace function private.ensure_character_survival_state_v1(
  p_campaign_id uuid,
  p_character_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_campaign_id is null or p_character_id is null then
    raise exception using errcode='22023',message='survival_scope_required';
  end if;

  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    return;
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.id=p_character_id
      and c.campaign_id=p_campaign_id
      and c.character_type='pc'
  ) then
    raise exception using errcode='22023',message='survival_character_outside_campaign';
  end if;

  insert into public.character_resource_states(
    character_id,state_key,current,max_snapshot,label,recharge,updated_by
  ) values
    (
      p_character_id,'survival_satiety',100,100,'Сытость',
      '{"triggers":["never"],"restore":"full"}'::jsonb,null
    ),
    (
      p_character_id,'survival_alertness',100,100,'Бодрость',
      '{"triggers":["never"],"restore":"full"}'::jsonb,null
    )
  on conflict(character_id,state_key) do nothing;

  insert into private.character_survival_runtime(
    character_id,campaign_id,satiety_remainder,alertness_remainder
  ) values (
    p_character_id,p_campaign_id,0,0
  )
  on conflict(character_id) do update
  set campaign_id=excluded.campaign_id;
end
$$;

create or replace function private.resolve_character_survival_pressure_v1(
  p_character_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_satiety integer := 100;
  v_alertness integer := 100;
  v_hunger_stage integer := 0;
  v_fatigue_stage integer := 0;
  v_hunger_penalty integer := 0;
  v_fatigue_penalty integer := 0;
  v_flat_penalty integer := 0;
  v_disadvantage boolean := false;
  v_sources jsonb := '[]'::jsonb;
begin
  select c.campaign_id into v_campaign_id
  from public.characters c
  where c.id=p_character_id;

  if v_campaign_id is null or not private.is_ai_world_campaign_v1(v_campaign_id) then
    return jsonb_build_object(
      'enabled',false,
      'hunger',jsonb_build_object('value',100,'stage',0,'penalty',0),
      'fatigue',jsonb_build_object('value',100,'stage',0,'penalty',0),
      'roll',jsonb_build_object('mode','normal','flat_penalty',0,'sources','[]'::jsonb)
    );
  end if;

  select current into v_satiety
  from public.character_resource_states
  where character_id=p_character_id and state_key='survival_satiety';

  select current into v_alertness
  from public.character_resource_states
  where character_id=p_character_id and state_key='survival_alertness';

  v_satiety := coalesce(v_satiety,100);
  v_alertness := coalesce(v_alertness,100);

  v_hunger_stage := private.ai_survival_stage_v1(v_satiety);
  v_fatigue_stage := private.ai_survival_stage_v1(v_alertness);
  v_hunger_penalty := private.ai_survival_stage_penalty_v1(v_hunger_stage);
  v_fatigue_penalty := private.ai_survival_stage_penalty_v1(v_fatigue_stage);

  v_flat_penalty := least(v_hunger_penalty,v_fatigue_penalty);
  v_disadvantage := v_hunger_stage >= 1 or v_fatigue_stage >= 1;

  if v_hunger_stage >= 1 then
    v_sources := v_sources || jsonb_build_array(
      jsonb_build_object(
        'key','survival_hunger',
        'resource_key','survival_satiety',
        'stage',v_hunger_stage,
        'penalty',v_hunger_penalty
      )
    );
  end if;

  if v_fatigue_stage >= 1 then
    v_sources := v_sources || jsonb_build_array(
      jsonb_build_object(
        'key','survival_fatigue',
        'resource_key','survival_alertness',
        'stage',v_fatigue_stage,
        'penalty',v_fatigue_penalty
      )
    );
  end if;

  return jsonb_build_object(
    'enabled',true,
    'hunger',jsonb_build_object(
      'value',v_satiety,
      'stage',v_hunger_stage,
      'penalty',v_hunger_penalty
    ),
    'fatigue',jsonb_build_object(
      'value',v_alertness,
      'stage',v_fatigue_stage,
      'penalty',v_fatigue_penalty
    ),
    'roll',jsonb_build_object(
      'mode',case when v_disadvantage then 'disadvantage' else 'normal' end,
      'flat_penalty',v_flat_penalty,
      'stacking','worst_only',
      'sources',v_sources
    )
  );
end
$$;

create or replace function private.tick_character_survival_v1(
  p_campaign_id uuid,
  p_character_id uuid,
  p_elapsed_minutes integer,
  p_deplete_alertness boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime private.character_survival_runtime%rowtype;
  v_satiety_total bigint;
  v_alertness_total bigint;
  v_satiety_drop integer;
  v_alertness_drop integer;
begin
  if coalesce(p_elapsed_minutes,0) < 0 or p_elapsed_minutes > 10080 then
    raise exception using errcode='22023',message='survival_elapsed_minutes_out_of_range';
  end if;

  perform private.ensure_character_survival_state_v1(p_campaign_id,p_character_id);

  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    return private.resolve_character_survival_pressure_v1(p_character_id);
  end if;

  select * into v_runtime
  from private.character_survival_runtime
  where character_id=p_character_id
  for update;

  v_satiety_total :=
    v_runtime.satiety_remainder::bigint + p_elapsed_minutes::bigint * 100;
  v_satiety_drop := (v_satiety_total / 2160)::integer;

  update private.character_survival_runtime
  set satiety_remainder=(v_satiety_total % 2160)::integer,
      updated_at=now()
  where character_id=p_character_id;

  update public.character_resource_states
  set current=greatest(0,current-v_satiety_drop),
      updated_at=now(),
      updated_by=null
  where character_id=p_character_id
    and state_key='survival_satiety';

  if p_deplete_alertness then
    v_alertness_total :=
      v_runtime.alertness_remainder::bigint + p_elapsed_minutes::bigint * 100;
    v_alertness_drop := (v_alertness_total / 1440)::integer;

    update private.character_survival_runtime
    set alertness_remainder=(v_alertness_total % 1440)::integer,
        updated_at=now()
    where character_id=p_character_id;

    update public.character_resource_states
    set current=greatest(0,current-v_alertness_drop),
        updated_at=now(),
        updated_by=null
    where character_id=p_character_id
      and state_key='survival_alertness';
  end if;

  return private.resolve_character_survival_pressure_v1(p_character_id);
end
$$;

create or replace function private.advance_character_world_time_v1(
  p_campaign_id uuid,
  p_character_id uuid,
  p_elapsed_minutes integer,
  p_reason text default 'scene'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_world public.character_world_state%rowtype;
  v_new_minute bigint;
  v_pressure jsonb;
begin
  if p_campaign_id is null or p_character_id is null then
    raise exception using errcode='22023',message='world_time_scope_required';
  end if;
  if coalesce(p_elapsed_minutes,0) < 0 or p_elapsed_minutes > 10080 then
    raise exception using errcode='22023',message='world_time_elapsed_minutes_out_of_range';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501',message='ai_world_time_only';
  end if;

  select * into v_world
  from public.character_world_state
  where campaign_id=p_campaign_id
    and character_id=p_character_id
  for update;

  if v_world.character_id is null then
    raise exception using errcode='22023',message='character_world_state_missing';
  end if;

  v_new_minute := v_world.campaign_minute + p_elapsed_minutes;

  update public.character_world_state
  set campaign_minute=v_new_minute,
      updated_at=now(),
      updated_by=null
  where character_id=p_character_id
    and campaign_id=p_campaign_id;

  v_pressure := private.tick_character_survival_v1(
    p_campaign_id,p_character_id,p_elapsed_minutes,true
  );

  return jsonb_build_object(
    'campaign_id',p_campaign_id,
    'character_id',p_character_id,
    'reason',coalesce(nullif(trim(p_reason),''),'scene'),
    'elapsed_minutes',p_elapsed_minutes,
    'from_minute',v_world.campaign_minute,
    'to_minute',v_new_minute,
    'campaign_day',private.ai_campaign_day_from_minute_v1(v_new_minute),
    'day_period',private.ai_day_period_from_campaign_minute_v1(v_new_minute),
    'survival',v_pressure
  );
end
$$;

create or replace function private.sync_colocated_player_time_v1(
  p_campaign_id uuid,
  p_source_character_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.character_world_state%rowtype;
  v_target_minute bigint;
  v_target_day integer;
  v_target_period text;
  v_target_character_id uuid;
  v_group_count integer;
  v_row record;
  v_receipt_id uuid;
  v_catchups jsonb:='[]'::jsonb;
  v_synced integer:=0;
begin
  if p_campaign_id is null or p_source_character_id is null then
    raise exception using errcode='22023',message='player_time_sync_scope_required';
  end if;

  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    return jsonb_build_object('enabled',false,'synced_count',0,'catchups','[]'::jsonb);
  end if;

  if not exists(
    select 1
    from public.campaign_members cm
    join public.characters c
      on c.id=cm.active_character_id and c.campaign_id=cm.campaign_id
    where cm.campaign_id=p_campaign_id
      and cm.role='player'
      and cm.active_character_id=p_source_character_id
      and c.character_type='pc'
      and c.publication_state='campaign'
      and c.life_state='alive'
  ) then
    return jsonb_build_object('enabled',true,'synced_count',0,'catchups','[]'::jsonb);
  end if;

  select * into v_source
  from public.character_world_state ws
  where ws.character_id=p_source_character_id
    and ws.campaign_id=p_campaign_id;

  if v_source.character_id is null or v_source.location_id is null then
    return jsonb_build_object('enabled',true,'synced_count',0,'catchups','[]'::jsonb);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_campaign_id::text||':party-time-sync:'||v_source.location_id::text,0
    )
  );

  select count(*) into v_group_count
  from public.campaign_members cm
  join public.characters c
    on c.id=cm.active_character_id
   and c.campaign_id=cm.campaign_id
   and c.character_type='pc'
   and c.publication_state='campaign'
   and c.life_state='alive'
  join public.character_world_state ws
    on ws.character_id=c.id and ws.campaign_id=c.campaign_id
  where cm.campaign_id=p_campaign_id
    and cm.role='player'
    and cm.active_character_id is not null
    and ws.location_id=v_source.location_id;

  if v_group_count<2 then
    return jsonb_build_object(
      'enabled',true,'location_id',v_source.location_id,
      'synced_count',0,'catchups','[]'::jsonb
    );
  end if;

  select ws.campaign_minute,ws.campaign_day,ws.day_period,ws.character_id
  into v_target_minute,v_target_day,v_target_period,v_target_character_id
  from public.campaign_members cm
  join public.characters c
    on c.id=cm.active_character_id
   and c.campaign_id=cm.campaign_id
   and c.character_type='pc'
   and c.publication_state='campaign'
   and c.life_state='alive'
  join public.character_world_state ws
    on ws.character_id=c.id and ws.campaign_id=c.campaign_id
  where cm.campaign_id=p_campaign_id
    and cm.role='player'
    and ws.location_id=v_source.location_id
  order by ws.campaign_minute desc,ws.updated_at desc,ws.character_id
  limit 1;

  perform set_config('meganot.party_time_sync','on',true);

  for v_row in
    select ws.character_id,ws.campaign_minute,ws.campaign_day,ws.day_period
    from public.campaign_members cm
    join public.characters c
      on c.id=cm.active_character_id
     and c.campaign_id=cm.campaign_id
     and c.character_type='pc'
     and c.publication_state='campaign'
     and c.life_state='alive'
    join public.character_world_state ws
      on ws.character_id=c.id and ws.campaign_id=c.campaign_id
    where cm.campaign_id=p_campaign_id
      and cm.role='player'
      and ws.location_id=v_source.location_id
      and ws.campaign_minute<v_target_minute
    order by ws.campaign_minute,ws.character_id
  loop
    insert into public.ai_player_time_catchup_receipts(
      campaign_id,location_id,character_id,source_character_id,
      from_day,from_period,to_day,to_period,from_minute,to_minute
    ) values (
      p_campaign_id,v_source.location_id,v_row.character_id,p_source_character_id,
      v_row.campaign_day,v_row.day_period,v_target_day,v_target_period,
      v_row.campaign_minute,v_target_minute
    )
    on conflict(character_id,location_id,from_minute,to_minute)
    do update set source_character_id=excluded.source_character_id
    returning id into v_receipt_id;

    update public.character_world_state
    set campaign_minute=v_target_minute,
        updated_at=now(),
        updated_by=null
    where character_id=v_row.character_id
      and campaign_id=p_campaign_id
      and location_id=v_source.location_id;

    v_catchups:=v_catchups||jsonb_build_array(
      jsonb_build_object(
        'receipt_id',v_receipt_id,
        'character_id',v_row.character_id,
        'from_minute',v_row.campaign_minute,
        'to_minute',v_target_minute,
        'from_day',v_row.campaign_day,
        'from_period',v_row.day_period,
        'to_day',v_target_day,
        'to_period',v_target_period,
        'catchup_kind','idle_life',
        'meaningful_actions',false
      )
    );
    v_synced:=v_synced+1;
  end loop;

  perform set_config('meganot.party_time_sync','off',true);

  return jsonb_build_object(
    'enabled',true,
    'location_id',v_source.location_id,
    'target_minute',v_target_minute,
    'target_day',v_target_day,
    'target_period',v_target_period,
    'anchor_character_id',v_target_character_id,
    'synced_count',v_synced,
    'catchups',v_catchups
  );
end
$$;

comment on column public.character_world_state.campaign_minute is
  'AI survival exact game clock: elapsed minutes from Day 1 00:00. day/period are compatibility projections.';
comment on column public.chat_rooms.campaign_minute is
  'Exact scene game clock in campaign minutes. day/period remain compatibility projections.';
comment on function private.resolve_character_survival_pressure_v1(uuid) is
  'Returns independent hunger/fatigue stages and one non-stacking roll pressure channel: disadvantage once, worst flat penalty only.';
