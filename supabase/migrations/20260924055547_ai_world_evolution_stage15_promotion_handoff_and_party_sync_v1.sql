-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 15: promoted scene-actor background handoff
-- plus cooperative temporal convergence for colocated player characters.

alter table public.ai_background_entity_snapshots
  alter column run_id drop not null;

alter table public.ai_background_entity_snapshots
  add constraint ai_background_snapshot_run_or_promotion_check
  check (run_id is not null or provenance->>'stage'='15');

create unique index ai_background_stage15_bootstrap_key_uidx
  on public.ai_background_entity_snapshots(campaign_id,snapshot_key)
  where run_id is null;

create table public.ai_player_time_catchup_receipts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  source_character_id uuid references public.characters(id) on delete set null,
  from_day integer not null check (from_day>=1),
  from_period text not null
    check (from_period in ('dawn','morning','day','late_day','evening','night','deep_night')),
  to_day integer not null check (to_day>=1),
  to_period text not null
    check (to_period in ('dawn','morning','day','late_day','evening','night','deep_night')),
  catchup_kind text not null default 'idle_life'
    check (catchup_kind='idle_life'),
  meaningful_actions boolean not null default false
    check (meaningful_actions=false),
  narrative_semantics jsonb not null default jsonb_build_object(
    'mode','ordinary_life',
    'major_successes',false,
    'offscreen_heroics',false,
    'unresolved_attempts','may_have_been_attempted_but_are_not_successful_without_canonical_evidence'
  ) check (jsonb_typeof(narrative_semantics)='object'),
  created_at timestamptz not null default now(),
  unique(character_id,location_id,from_day,from_period,to_day,to_period)
);

alter table public.ai_player_time_catchup_receipts enable row level security;
revoke all on table public.ai_player_time_catchup_receipts
  from public, anon, authenticated;
grant select on table public.ai_player_time_catchup_receipts to service_role;

create policy ai_player_time_catchup_receipts_deny_client
on public.ai_player_time_catchup_receipts
for all to anon, authenticated
using(false) with check(false);

create index ai_player_time_catchup_recent_idx
  on public.ai_player_time_catchup_receipts(
    campaign_id,location_id,to_day desc,created_at desc
  );

create or replace function private.ai_day_period_rank_v1(p_period text)
returns integer
language sql
immutable
set search_path=''
as $$
  select case lower(btrim(coalesce(p_period,'')))
    when 'dawn' then 0
    when 'morning' then 1
    when 'day' then 2
    when 'late_day' then 3
    when 'evening' then 4
    when 'night' then 5
    when 'deep_night' then 6
    else 2
  end
$$;

revoke all on function private.ai_day_period_rank_v1(text)
  from public, anon, authenticated;

create or replace function private.ai_scene_actor_promotion_background_handoff_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_character public.characters%rowtype;
  v_previous public.ai_background_entity_snapshots%rowtype;
  v_state jsonb;
  v_provenance jsonb;
  v_resources jsonb;
  v_recent_commands jsonb;
  v_command_count integer;
  v_damage_count integer;
  v_damage_total integer;
  v_version integer;
  v_summary text;
  v_semantics jsonb;
  v_fingerprint text;
begin
  if old.promoted_character_id is not null
     or new.promoted_character_id is null
  then
    return new;
  end if;

  select * into v_character
  from public.characters c
  where c.id=new.promoted_character_id
    and c.campaign_id=new.campaign_id
    and c.character_type='npc'
    and c.publication_state='campaign'
  for update;

  if v_character.id is null then
    raise exception using errcode='22023',message='stage15_promoted_npc_missing';
  end if;

  update public.npc_profiles
  set background_simulation_scope='entity',
      tags=(
        select array(
          select distinct x
          from unnest(
            coalesce(tags,'{}'::text[])
            || array['background-handoff','scene-actor-promotion']
          ) x
        )
      ),
      updated_at=now()
  where character_id=v_character.id
    and campaign_id=new.campaign_id;

  if not found then
    raise exception using errcode='55000',message='stage15_promoted_npc_profile_missing';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'state_key',r.state_key,
        'current',r.current,
        'max',r.max_snapshot,
        'label',r.label
      ) order by r.state_key
    ),
    '[]'::jsonb
  )
  into v_resources
  from public.ai_scene_actor_resources r
  where r.actor_id=new.id;

  select count(*) into v_command_count
  from public.ai_scene_actor_command_receipts r
  where r.actor_id=new.id;

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.created_at desc),
    '[]'::jsonb
  )
  into v_recent_commands
  from (
    select r.command_kind,r.created_at
    from public.ai_scene_actor_command_receipts r
    where r.actor_id=new.id
    order by r.created_at desc
    limit 8
  ) x;

  select count(*),coalesce(sum(r.applied_damage),0)
  into v_damage_count,v_damage_total
  from public.ai_scene_actor_damage_receipts r
  where r.actor_id=new.id;

  select * into v_previous
  from public.ai_background_entity_snapshots s
  where s.campaign_id=new.campaign_id
    and s.entity_scope='npc'
    and s.entity_id=v_character.id::text
  order by s.through_game_day desc,s.version desc
  limit 1;

  v_version:=coalesce(v_previous.version,0)+1;
  v_summary:=left(
    coalesce(new.promotion_name,v_character.name)||
    ' promoted from scene actor '||new.display_label||
    ' ('||new.source_bestiary_slug||'). Encounter handoff preserved at '||
    new.current_hp::text||'/'||new.max_hp::text||' HP.',
    1800
  );

  v_state:=jsonb_build_object(
    'origin',jsonb_build_object(
      'kind','scene_actor_promotion',
      'scene_actor_id',new.id,
      'room_id',new.room_id,
      'spawn_key',new.spawn_key,
      'runtime_ordinal',new.runtime_ordinal,
      'source_bestiary_slug',new.source_bestiary_slug,
      'source_digest',new.source_digest,
      'compiler_version',new.compiler_version,
      'promotion_name',new.promotion_name,
      'promotion_source_message_id',new.promotion_source_message_id
    ),
    'encounter_handoff',jsonb_build_object(
      'current_hp',new.current_hp,
      'max_hp',new.max_hp,
      'conditions',new.conditions,
      'effects',new.effects,
      'resources',v_resources,
      'command_count',v_command_count,
      'recent_command_kinds',v_recent_commands,
      'damage_receipt_count',v_damage_count,
      'total_recorded_damage',v_damage_total
    ),
    'temporal_overlay',jsonb_build_object(
      'life_state',new.life_state,
      'location_id',new.location_id,
      'status','promoted'
    )
  );

  v_provenance:=jsonb_build_object(
    'stage','15',
    'source_kind','scene_actor_promotion',
    'source_actor_id',new.id,
    'promoted_character_id',v_character.id,
    'promoted_at',new.promoted_at,
    'source_bestiary_slug',new.source_bestiary_slug,
    'source_digest',new.source_digest,
    'compiler_version',new.compiler_version
  );

  v_semantics:=jsonb_build_object(
    'campaign_id',new.campaign_id,
    'through_game_day',new.campaign_day,
    'snapshot_key','stage15:promotion:'||new.id::text,
    'entity_scope','npc',
    'entity_id',v_character.id::text,
    'version',v_version,
    'summary',v_summary,
    'state',v_state,
    'previous_snapshot_id',v_previous.id,
    'provenance',v_provenance
  );

  v_fingerprint:=pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_semantics::text,'UTF8'),'sha256'),
    'hex'
  );

  insert into public.ai_background_entity_snapshots(
    campaign_id,run_id,through_game_day,snapshot_key,
    entity_scope,entity_id,version,summary,state,
    source_event_id,provenance,request_fingerprint,
    previous_snapshot_id,merge_version
  ) values (
    new.campaign_id,null,new.campaign_day,
    'stage15:promotion:'||new.id::text,
    'npc',v_character.id::text,v_version,v_summary,v_state,
    null,v_provenance,v_fingerprint,v_previous.id,1
  );

  update public.character_sheets
  set runtime_facts=coalesce(runtime_facts,'{}'::jsonb)||jsonb_build_object(
    'backgroundHandoffStage',15,
    'backgroundSimulationEligible',true,
    'backgroundInitialSnapshot','stage15:promotion:'||new.id::text
  ),
  updated_at=now()
  where character_id=v_character.id;

  return new;
end;
$$;

revoke all on function private.ai_scene_actor_promotion_background_handoff_v1()
  from public, anon, authenticated;

create trigger ai_scene_actor_stage15_background_handoff
after update of promoted_character_id on public.ai_scene_actors
for each row
when (old.promoted_character_id is null and new.promoted_character_id is not null)
execute function private.ai_scene_actor_promotion_background_handoff_v1();

create or replace function private.sync_colocated_player_time_v1(
  p_campaign_id uuid,
  p_source_character_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source public.character_world_state%rowtype;
  v_target_day integer;
  v_target_period text;
  v_target_rank integer;
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

  select ws.campaign_day,ws.day_period,
         private.ai_day_period_rank_v1(ws.day_period),ws.character_id
  into v_target_day,v_target_period,v_target_rank,v_target_character_id
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
  order by ws.campaign_day desc,
           private.ai_day_period_rank_v1(ws.day_period) desc,
           ws.updated_at desc,ws.character_id
  limit 1;

  perform set_config('meganot.party_time_sync','on',true);

  for v_row in
    select ws.character_id,ws.campaign_day,ws.day_period
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
      and (
        ws.campaign_day<v_target_day
        or (
          ws.campaign_day=v_target_day
          and private.ai_day_period_rank_v1(ws.day_period)<v_target_rank
        )
      )
    order by ws.campaign_day,
             private.ai_day_period_rank_v1(ws.day_period),
             ws.character_id
  loop
    insert into public.ai_player_time_catchup_receipts(
      campaign_id,location_id,character_id,source_character_id,
      from_day,from_period,to_day,to_period
    ) values (
      p_campaign_id,v_source.location_id,v_row.character_id,p_source_character_id,
      v_row.campaign_day,v_row.day_period,v_target_day,v_target_period
    )
    on conflict(character_id,location_id,from_day,from_period,to_day,to_period)
    do update set source_character_id=excluded.source_character_id
    returning id into v_receipt_id;

    update public.character_world_state
    set campaign_day=v_target_day,
        day_period=v_target_period,
        updated_at=now(),
        updated_by=null
    where character_id=v_row.character_id
      and campaign_id=p_campaign_id
      and location_id=v_source.location_id;

    v_catchups:=v_catchups||jsonb_build_array(
      jsonb_build_object(
        'receipt_id',v_receipt_id,
        'character_id',v_row.character_id,
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
    'target_day',v_target_day,
    'target_period',v_target_period,
    'anchor_character_id',v_target_character_id,
    'synced_count',v_synced,
    'catchups',v_catchups
  );
end;
$$;

revoke all on function private.sync_colocated_player_time_v1(uuid,uuid)
  from public, anon, authenticated;

create or replace function public.sync_colocated_player_time_v1(
  p_campaign_id uuid,
  p_source_character_id uuid
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select private.sync_colocated_player_time_v1(p_campaign_id,p_source_character_id)
$$;

revoke all on function public.sync_colocated_player_time_v1(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.sync_colocated_player_time_v1(uuid,uuid)
  to service_role;

create or replace function private.ai_sync_colocated_player_time_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(current_setting('meganot.party_time_sync',true),'off')='on'
     or new.location_id is null
     or not private.is_ai_world_campaign_v1(new.campaign_id)
  then
    return new;
  end if;

  if exists(
    select 1
    from public.campaign_members cm
    join public.characters c
      on c.id=cm.active_character_id and c.campaign_id=cm.campaign_id
    where cm.campaign_id=new.campaign_id
      and cm.role='player'
      and cm.active_character_id=new.character_id
      and c.character_type='pc'
      and c.publication_state='campaign'
      and c.life_state='alive'
  ) then
    perform private.sync_colocated_player_time_v1(new.campaign_id,new.character_id);
  end if;

  return new;
end;
$$;

revoke all on function private.ai_sync_colocated_player_time_trigger_v1()
  from public, anon, authenticated;

create trigger character_world_state_stage15_party_time_sync
after insert or update of location_id,campaign_day,day_period
on public.character_world_state
for each row
execute function private.ai_sync_colocated_player_time_trigger_v1();
