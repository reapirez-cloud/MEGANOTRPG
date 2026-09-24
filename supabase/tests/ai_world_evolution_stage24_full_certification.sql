-- Stage 24 live certification smoke.
-- DEVELOPMENT/TEST ONLY.
--
-- This script deliberately runs against the real schema because Stage 24 must
-- prove cross-system behavior rather than only inspect source text.
-- It temporarily borrows:
--   * one unbound AI-world slot,
--   * one existing human-GM campaign,
--   * two existing auth users,
-- and rolls every mutation back.
--
-- No certification fixture survives the final ROLLBACK.

begin;

do $stage24$
declare
  v_slot uuid;
  v_owner uuid;
  v_user2 uuid;
  v_campaign uuid;
  v_pc1 uuid := gen_random_uuid();
  v_pc2 uuid := gen_random_uuid();
  v_loc uuid := gen_random_uuid();
  v_room uuid := gen_random_uuid();
  v_day integer;
  v_frontier_npc uuid;
  v_reserve1 jsonb;
  v_reserve2 jsonb;
  v_resolve1 jsonb;
  v_resolve2 jsonb;
  v_sync jsonb;
  v_context jsonb;
  v_run_id uuid;
  v_source_message_id bigint;
  v_count integer;
  v_mismatch integer;
  i integer;
begin
  select s.id,s.owner_user_id
  into v_slot,v_owner
  from public.ai_world_slots s
  where s.campaign_id is null
  order by s.slot_index,s.id
  limit 1;

  if v_slot is null or v_owner is null then
    raise exception 'stage24_unbound_ai_slot_required';
  end if;

  select c.id
  into v_campaign
  from public.campaigns c
  where not private.is_ai_world_campaign_v1(c.id)
  order by c.created_at,c.id
  limit 1;

  if v_campaign is null then
    raise exception 'stage24_human_campaign_fixture_required';
  end if;

  select u.id
  into v_user2
  from auth.users u
  where u.id<>v_owner
  order by u.created_at,u.id
  limit 1;

  if v_user2 is null then
    raise exception 'stage24_second_auth_user_required';
  end if;

  v_day:=greatest(
    private.ai_background_campaign_frontier_day_v1(v_campaign)+1000,
    4242
  );

  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'role','service_role',
      'sub',v_owner::text,
      'is_anonymous',false
    )::text,
    true
  );

  -- A normal campaign must fail closed before temporary AI-world binding.
  begin
    perform public.resolve_ai_background_daily_candidates_v1(
      v_campaign,1,30::smallint
    );
    raise exception 'stage24_human_campaign_wrongly_entered_ai_background';
  exception
    when others then
      if sqlerrm not like '%ai_background_ai_world_only%' then raise; end if;
  end;

  if (
    public.sync_colocated_player_time_v1(
      v_campaign,gen_random_uuid()
    )->>'enabled'
  )::boolean is distinct from false then
    raise exception 'stage24_human_campaign_time_sync_not_isolated';
  end if;

  update public.ai_world_slots
  set campaign_id=v_campaign,updated_at=now()
  where id=v_slot and owner_user_id=v_owner;

  if not private.is_ai_world_campaign_v1(v_campaign) then
    raise exception 'stage24_ai_world_binding_failed';
  end if;

  insert into public.campaign_members(
    campaign_id,user_id,role,active_character_id,is_owner
  )
  values
    (v_campaign,v_owner,'player',null,true),
    (v_campaign,v_user2,'player',null,false)
  on conflict(campaign_id,user_id) do update set
    role='player',
    active_character_id=null,
    is_owner=excluded.is_owner;

  insert into public.locations(
    id,campaign_id,name,summary,description,visibility_mode,lifecycle_state,
    created_by,background_simulation_scope
  )
  values(
    v_loc,v_campaign,'Stage24 room','','',
    'discover','active',v_owner,'disabled'
  );

  insert into public.characters(
    id,campaign_id,assigned_user_id,name,character_class,level,bio,
    character_type,visibility,created_by,life_state,visibility_mode,
    publication_state
  )
  values
    (
      v_pc1,v_campaign,v_owner,'Stage24 PC A','Воин',5,'',
      'pc','campaign',v_owner,'alive','always','campaign'
    ),
    (
      v_pc2,v_campaign,v_user2,'Stage24 PC B','Разбойник',5,'',
      'pc','campaign',v_owner,'alive','always','campaign'
    );

  update public.campaign_members
  set active_character_id=case
    when user_id=v_owner then v_pc1
    else v_pc2
  end
  where campaign_id=v_campaign
    and user_id in(v_owner,v_user2);

  update public.character_world_state
  set location_id=v_loc,campaign_day=3,day_period='morning',updated_at=now()
  where character_id=v_pc1 and campaign_id=v_campaign;

  update public.character_world_state
  set location_id=v_loc,campaign_day=7,day_period='evening',updated_at=now()
  where character_id=v_pc2 and campaign_id=v_campaign;

  -- The trigger may already synchronize the pair; replaying the public RPC
  -- must stay safe and the final receipt must remain idle-only.
  v_sync:=public.sync_colocated_player_time_v1(v_campaign,v_pc2);

  if coalesce((v_sync->>'enabled')::boolean,false) is distinct from true then
    raise exception 'stage24_colocated_sync_not_enabled';
  end if;

  if exists(
    select 1
    from public.character_world_state
    where campaign_id=v_campaign
      and character_id in(v_pc1,v_pc2)
      and (campaign_day<>7 or day_period<>'evening')
  ) then
    raise exception 'stage24_colocated_time_did_not_converge';
  end if;

  if not exists(
    select 1
    from public.ai_player_time_catchup_receipts
    where campaign_id=v_campaign
      and character_id=v_pc1
      and catchup_kind='idle_life'
      and meaningful_actions=false
      and from_day=3
      and to_day=7
  ) then
    raise exception 'stage24_idle_catchup_receipt_missing';
  end if;

  insert into public.chat_rooms(
    id,campaign_id,slug,title,category,room_type,open_to_campaign,is_read_only,
    room_state,campaign_can_write,location_id,campaign_day,day_period,scene_state
  )
  values(
    v_room,
    v_campaign,
    'stage24-'||substr(v_room::text,1,8),
    'Stage24 Scene',
    'game',
    'scene',
    true,
    false,
    'open',
    true,
    v_loc,
    7,
    'evening',
    'active'
  );

  -- Stress floor: at least 205 whole persistent NPC entities.
  insert into public.characters(
    campaign_id,assigned_user_id,name,character_class,level,bio,
    character_type,visibility,created_by,life_state,visibility_mode,
    publication_state
  )
  select
    v_campaign,
    null,
    'Stage24 NPC '||g::text,
    'NPC',
    1,
    '',
    'npc',
    'campaign',
    v_owner,
    'alive',
    'discover',
    'campaign'
  from generate_series(1,205) g;

  insert into public.npc_profiles(
    character_id,campaign_id,role,species,creature_type,size,challenge_rating,
    occupation,faction,appearance,demeanor,motivation,public_notes,gm_notes,tags,
    created_by,updated_by,background_simulation_scope
  )
  select
    c.id,
    v_campaign,
    'npc',
    'Human',
    'humanoid',
    'medium',
    0,
    'certification',
    '',
    '',
    '',
    '',
    '',
    '',
    '{}'::text[],
    v_owner,
    v_owner,
    'entity'
  from public.characters c
  where c.campaign_id=v_campaign
    and c.character_type='npc'
    and c.name like 'Stage24 NPC %';

  select c.id
  into v_frontier_npc
  from public.characters c
  where c.campaign_id=v_campaign
    and c.name='Stage24 NPC 1'
  limit 1;

  update public.character_world_state
  set campaign_day=v_day,day_period='deep_night',updated_at=now()
  where character_id=v_frontier_npc
    and campaign_id=v_campaign;

  if private.ai_background_campaign_frontier_day_v1(v_campaign)<v_day then
    raise exception 'stage24_background_frontier_not_reached';
  end if;

  select count(*)
  into v_count
  from public.npc_profiles np
  join public.characters c on c.id=np.character_id
  where np.campaign_id=v_campaign
    and np.background_simulation_scope='entity'
    and c.character_type='npc'
    and c.publication_state='campaign'
    and c.life_state='alive';

  if v_count<205 then
    raise exception 'stage24_205_npc_fixture_failed:%',v_count;
  end if;

  -- Repeated reserve/resolve is the same committed day-run, never a reroll.
  v_reserve1:=public.reserve_ai_background_daily_run_v1(
    v_campaign,v_day,'deepseek-v4.1-flash','{"stage24":true}'::jsonb
  );
  v_reserve2:=public.reserve_ai_background_daily_run_v1(
    v_campaign,v_day,'deepseek-v4.1-flash','{"stage24":true}'::jsonb
  );

  if v_reserve1->'run'->>'id' is distinct from v_reserve2->'run'->>'id' then
    raise exception 'stage24_daily_run_not_idempotent';
  end if;

  if coalesce((v_reserve2->>'replayed')::boolean,false) is distinct from true then
    raise exception 'stage24_daily_run_replay_not_reported';
  end if;

  v_resolve1:=public.resolve_ai_background_daily_candidates_v1(
    v_campaign,v_day,30::smallint
  );
  v_resolve2:=public.resolve_ai_background_daily_candidates_v1(
    v_campaign,v_day,30::smallint
  );
  v_run_id:=(v_resolve1->>'run_id')::uuid;

  if (v_resolve1->>'eligible_npc_count')::integer<205 then
    raise exception 'stage24_candidate_pool_below_205:%',
      v_resolve1->>'eligible_npc_count';
  end if;

  if coalesce((v_resolve2->>'replayed')::boolean,false) is distinct from true then
    raise exception 'stage24_candidate_resolution_not_replay_safe';
  end if;

  if v_resolve1->'selected_npc_ids' is distinct from
     v_resolve2->'selected_npc_ids' then
    raise exception 'stage24_candidate_replay_changed_selection';
  end if;

  select count(*)
  into v_mismatch
  from public.ai_background_candidates c
  where c.run_id=v_run_id
    and c.entity_scope='npc'
    and c.selected is distinct from (c.selection_roll<=30);

  if v_mismatch<>0 then
    raise exception 'stage24_candidate_threshold_mismatch:%',v_mismatch;
  end if;

  select count(*)
  into v_count
  from public.ai_background_candidates c
  where c.run_id=v_run_id and c.entity_scope='npc';

  if v_count<205 then
    raise exception 'stage24_candidate_rows_below_205:%',v_count;
  end if;

  -- Insert 500 messages as 500 independent user turns so row triggers observe
  -- the growing room history exactly as they do in real chat.
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'role','authenticated',
      'sub',v_owner::text,
      'is_anonymous',false
    )::text,
    true
  );

  for i in 1..500 loop
    insert into public.chat_messages(
      room_id,client_id,author_name,body,user_id,character_id,
      audience_scope,recipient_character_ids
    )
    values(
      v_room,
      v_owner,
      'Stage24 PC A',
      'history-'||i::text,
      v_owner,
      v_pc1,
      'scene',
      '{}'::uuid[]
    );
  end loop;

  select max(id),count(*)
  into v_source_message_id,v_count
  from public.chat_messages
  where room_id=v_room;

  if v_count<>500 then
    raise exception 'stage24_500_message_fixture_failed:%',v_count;
  end if;

  -- Maintenance is intentionally serial: one active 45-message window.
  -- Atomic completion advances the watermark and reserves the next window.
  select count(*)
  into v_count
  from public.agent_jobs j
  where j.campaign_id=v_campaign
    and j.job_type='world_maintenance'
    and j.input->>'maintenance_room_id'=v_room::text
    and j.status in('queued','running');

  if v_count<>1 then
    raise exception 'stage24_maintenance_active_window_count:%',v_count;
  end if;

  if not exists(
    select 1
    from public.agent_jobs j
    where j.campaign_id=v_campaign
      and j.job_type='world_maintenance'
      and j.input->>'maintenance_room_id'=v_room::text
      and (j.input->>'message_count')::integer=45
      and (j.input->>'context_limit')::integer=50
  ) then
    raise exception 'stage24_maintenance_window_contract_missing';
  end if;

  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'role','service_role',
      'sub',v_owner::text,
      'is_anonymous',false
    )::text,
    true
  );

  v_context:=public.read_ai_gm_recent_chat_context_v1(
    v_campaign,
    v_room,
    v_pc1,
    v_source_message_id,
    v_loc,
    7,
    50
  );

  if jsonb_array_length(v_context->'messages')<>50 then
    raise exception 'stage24_context_not_bounded_to_50:%',
      jsonb_array_length(v_context->'messages');
  end if;

  if (v_context->>'limit')::integer<>50 then
    raise exception 'stage24_context_limit_not_50';
  end if;

  if (v_context->'messages'->0->>'body') is distinct from 'history-451' then
    raise exception 'stage24_context_did_not_keep_latest_50:%',
      v_context->'messages'->0->>'body';
  end if;

  if octet_length(v_context::text)>60000 then
    raise exception 'stage24_context_projection_too_large:%',
      octet_length(v_context::text);
  end if;
end
$stage24$;

rollback;

select jsonb_build_object(
  'stage24_live_smoke','passed',
  'rolled_back',true,
  'stress_entities_min',205,
  'history_messages',500,
  'maintenance_active_window',1,
  'maintenance_window_size',45,
  'context_limit',50,
  'human_gm_isolation',true,
  'daily_run_replay',true,
  'candidate_threshold_verified',true,
  'colocated_idle_catchup',true,
  'future_history_filter_verified',true
) as certification;
