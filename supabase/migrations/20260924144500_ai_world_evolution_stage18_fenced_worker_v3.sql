-- Stage 18 v3 hardening.
-- Fences every junior mutation with a commit lease and removes unfenced queue RPCs.

alter table public.ai_gm_post_turn_commits
  add column if not exists lease_token uuid;

create table if not exists public.ai_gm_post_turn_entity_bindings (
  intent_id uuid primary key
    references public.ai_gm_post_turn_intent_receipts(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('location','npc')),
  entity_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.ai_gm_post_turn_entity_bindings enable row level security;
revoke all on table public.ai_gm_post_turn_entity_bindings
  from public, anon, authenticated;

drop function if exists public.claim_ai_gm_post_turn_commit_v1(uuid);
drop function if exists public.claim_ai_gm_post_turn_intent_v1(uuid);
drop function if exists public.complete_ai_gm_post_turn_intent_v1(uuid,text,jsonb,jsonb,jsonb);
drop function if exists public.fail_ai_gm_post_turn_intent_v1(uuid,text);
drop function if exists public.complete_ai_gm_post_turn_commit_v1(uuid);
drop function if exists public.fail_ai_gm_post_turn_commit_v1(uuid,text);
drop function if exists public.retry_ai_gm_post_turn_commit_v1(uuid);

create or replace function private.stage18_resolve_quest_id_v3(
  p_campaign_id uuid,
  p_args jsonb
)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_raw text := nullif(btrim(coalesce(p_args->>'quest_id','')),'');
  v_key text := nullif(btrim(coalesce(p_args->>'quest_key','')),'');
begin
  if v_raw is not null then
    begin
      v_id := v_raw::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_quest_id_invalid';
    end;
    if not exists (
      select 1 from public.quests q
      where q.id=v_id and q.campaign_id=p_campaign_id
    ) then
      raise exception 'stage18_quest_not_found';
    end if;
    return v_id;
  end if;

  if v_key is null then
    raise exception 'stage18_quest_identity_required';
  end if;

  select q.id into v_id
  from public.quests q
  where q.campaign_id=p_campaign_id
    and q.quest_key=v_key
  limit 1;

  if v_id is null then
    raise exception 'stage18_quest_not_found';
  end if;
  return v_id;
end;
$$;

revoke all on function private.stage18_resolve_quest_id_v3(uuid,jsonb)
  from public, anon, authenticated;

create or replace function private.stage18_assert_worker_lease_v3(
  p_intent_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
    'intent_id',r.id,
    'commit_id',c.id,
    'campaign_id',c.campaign_id,
    'room_id',c.room_id,
    'parent_job_id',c.parent_job_id,
    'manager_user_id',c.manager_user_id,
    'source_character_id',c.source_character_id,
    'intent_key',r.intent_key,
    'intent_kind',r.kind
  )
  into v_payload
  from public.ai_gm_post_turn_intent_receipts r
  join public.ai_gm_post_turn_commits c on c.id=r.commit_id
  where r.id=p_intent_id
    and r.state='running'
    and c.state='running'
    and c.lease_token=p_lease_token
    and c.lease_expires_at is not null
    and c.lease_expires_at>now();

  if v_payload is null then
    raise exception 'stage18_worker_lease_invalid';
  end if;
  return v_payload;
end;
$$;

revoke all on function private.stage18_assert_worker_lease_v3(uuid,uuid)
  from public, anon, authenticated;

create or replace function public.claim_ai_gm_post_turn_commit_v2(
  p_commit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_token uuid;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then
    raise exception 'stage18_commit_not_found';
  end if;

  if v_commit.state in ('completed','failed') then
    return to_jsonb(v_commit) || jsonb_build_object('claimed',false);
  end if;

  if v_commit.state='running'
     and v_commit.lease_expires_at is not null
     and v_commit.lease_expires_at>now()
  then
    return to_jsonb(v_commit) || jsonb_build_object('claimed',false);
  end if;

  if v_commit.attempts>=v_commit.max_attempts then
    update public.ai_gm_post_turn_commits
    set state='failed',
        lease_token=null,
        lease_expires_at=null,
        last_error=coalesce(last_error,'stage18_retry_budget_exhausted'),
        updated_at=now()
    where id=v_commit.id
    returning * into v_commit;
    return to_jsonb(v_commit) || jsonb_build_object('claimed',false);
  end if;

  v_token := extensions.gen_random_uuid();

  update public.ai_gm_post_turn_commits
  set state='running',
      attempts=attempts+1,
      lease_token=v_token,
      lease_expires_at=now()+interval '4 minutes',
      last_error=null,
      updated_at=now()
  where id=v_commit.id
  returning * into v_commit;

  return to_jsonb(v_commit)
    || jsonb_build_object('claimed',true,'lease_token',v_token);
end;
$$;

revoke all on function public.claim_ai_gm_post_turn_commit_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_ai_gm_post_turn_commit_v2(uuid)
  to service_role;

create or replace function public.claim_ai_gm_post_turn_intent_v2(
  p_commit_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
    and state='running'
    and lease_token=p_lease_token
    and lease_expires_at>now()
  for update;

  if v_commit.id is null then
    raise exception 'stage18_worker_lease_invalid';
  end if;

  select * into v_intent
  from public.ai_gm_post_turn_intent_receipts
  where commit_id=p_commit_id
    and state in ('pending','failed')
    and attempts<3
  order by intent_index
  limit 1
  for update skip locked;

  if v_intent.id is null then
    return null;
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='running',
      attempts=attempts+1,
      lease_expires_at=v_commit.lease_expires_at,
      last_error=null,
      updated_at=now()
  where id=v_intent.id
  returning * into v_intent;

  return to_jsonb(v_intent)
    || jsonb_build_object('commit_lease_token',p_lease_token);
end;
$$;

revoke all on function public.claim_ai_gm_post_turn_intent_v2(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.claim_ai_gm_post_turn_intent_v2(uuid,uuid)
  to service_role;

create or replace function public.execute_ai_gm_post_turn_tool_v3(
  p_intent_id uuid,
  p_lease_token uuid,
  p_tool_name text,
  p_args jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ctx jsonb;
  v_campaign_id uuid;
  v_manager_user_id uuid;
  v_room_id uuid;
  v_tool text := btrim(coalesce(p_tool_name,''));
  v_args jsonb := coalesce(p_args,'{}'::jsonb);
  v_result jsonb := '{}'::jsonb;
  v_entity_id uuid;
  v_binding public.ai_gm_post_turn_entity_bindings%rowtype;
  v_location public.locations%rowtype;
  v_quest_id uuid;
  v_character_id uuid;
  v_faction_id uuid;
  v_source_location_id uuid;
  v_target_location_id uuid;
  v_target_key text;
  v_target public.quest_targets%rowtype;
  v_fact public.campaign_memory_facts%rowtype;
  v_fact_id uuid;
  v_event_ids uuid[] := '{}'::uuid[];
  v_event_id_text text;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;
  if jsonb_typeof(v_args)<>'object' then
    raise exception 'stage18_tool_args_must_be_object';
  end if;

  v_ctx := private.stage18_assert_worker_lease_v3(p_intent_id,p_lease_token);
  v_campaign_id := (v_ctx->>'campaign_id')::uuid;
  v_manager_user_id := (v_ctx->>'manager_user_id')::uuid;
  v_room_id := (v_ctx->>'room_id')::uuid;

  if not private.can_manage_campaign(v_campaign_id,v_manager_user_id) then
    raise exception 'stage18_commit_manager_no_longer_authorized';
  end if;

  -- The legacy owner RPCs use auth.uid(). Supply the immutable manager identity
  -- only inside this service-owned transaction. No user JWT is stored or replayed.
  perform set_config('request.jwt.claim.sub',v_manager_user_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  if v_tool='create_location' then
    select * into v_binding
    from public.ai_gm_post_turn_entity_bindings
    where intent_id=p_intent_id
    for update;

    if v_binding.intent_id is not null then
      select * into v_location
      from public.locations
      where id=v_binding.entity_id and campaign_id=v_campaign_id;
      if v_location.id is null then
        raise exception 'stage18_bound_location_missing';
      end if;
      return jsonb_build_object(
        'location',to_jsonb(v_location),
        'reconciled_existing',true,
        'canonical_state_changed',false
      );
    end if;

    if nullif(btrim(coalesce(v_args->>'name','')),'') is null then
      raise exception 'location_name_required';
    end if;

    if nullif(v_args->>'parent_location_id','') is not null then
      begin
        v_source_location_id := (v_args->>'parent_location_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'parent_location_id_invalid';
      end;
      if not exists (
        select 1 from public.locations l
        where l.id=v_source_location_id
          and l.campaign_id=v_campaign_id
          and l.lifecycle_state='active'
      ) then
        raise exception 'parent_location_not_found';
      end if;
    else
      v_source_location_id := null;
    end if;

    insert into public.locations(
      campaign_id,parent_location_id,name,summary,description,image_url,
      visibility_mode,background_simulation_scope,lifecycle_state,created_by
    )
    values(
      v_campaign_id,
      v_source_location_id,
      left(btrim(v_args->>'name'),160),
      left(btrim(coalesce(v_args->>'summary','')),2000),
      left(btrim(coalesce(v_args->>'description','')),12000),
      null,
      case when v_args->>'visibility_mode' in ('always','private')
        then v_args->>'visibility_mode' else 'discover' end,
      case when v_args->>'background_simulation_scope' in ('entity','detail')
        then v_args->>'background_simulation_scope' else 'disabled' end,
      'active',
      v_manager_user_id
    )
    returning * into v_location;

    insert into public.ai_gm_post_turn_entity_bindings(
      intent_id,campaign_id,entity_kind,entity_id
    ) values(p_intent_id,v_campaign_id,'location',v_location.id);

    return jsonb_build_object(
      'location',to_jsonb(v_location),
      'canonical_state_changed',true
    );

  elsif v_tool='update_location' then
    begin
      v_entity_id := nullif(v_args->>'location_id','')::uuid;
    exception when invalid_text_representation then
      raise exception 'location_id_invalid';
    end;
    if v_entity_id is null then raise exception 'location_id_required'; end if;

    update public.locations l
    set parent_location_id=case
          when v_args ? 'parent_location_id'
            then nullif(v_args->>'parent_location_id','')::uuid
          else l.parent_location_id end,
        name=case when v_args ? 'name'
          then coalesce(nullif(left(btrim(v_args->>'name'),160),''),l.name)
          else l.name end,
        summary=case when v_args ? 'summary'
          then left(btrim(coalesce(v_args->>'summary','')),2000)
          else l.summary end,
        description=case when v_args ? 'description'
          then left(btrim(coalesce(v_args->>'description','')),12000)
          else l.description end,
        visibility_mode=case
          when v_args->>'visibility_mode' in ('always','discover','private')
            then v_args->>'visibility_mode'
          else l.visibility_mode end,
        background_simulation_scope=case
          when v_args->>'background_simulation_scope' in ('entity','detail','disabled')
            then v_args->>'background_simulation_scope'
          else l.background_simulation_scope end,
        updated_at=now()
    where l.id=v_entity_id and l.campaign_id=v_campaign_id
    returning * into v_location;
    if v_location.id is null then raise exception 'location_not_found'; end if;
    return jsonb_build_object('location',to_jsonb(v_location),'canonical_state_changed',true);

  elsif v_tool='set_location_archived' then
    begin
      v_entity_id := nullif(v_args->>'location_id','')::uuid;
    exception when invalid_text_representation then
      raise exception 'location_id_invalid';
    end;
    update public.locations l
    set lifecycle_state=case when coalesce((v_args->>'archived')::boolean,false)
          then 'archived' else 'active' end,
        archived_at=case when coalesce((v_args->>'archived')::boolean,false)
          then now() else null end,
        updated_at=now()
    where l.id=v_entity_id and l.campaign_id=v_campaign_id
    returning * into v_location;
    if v_location.id is null then raise exception 'location_not_found'; end if;
    return jsonb_build_object('location',to_jsonb(v_location),'canonical_state_changed',true);

  elsif v_tool='create_world_npc' then
    select * into v_binding
    from public.ai_gm_post_turn_entity_bindings
    where intent_id=p_intent_id
    for update;

    if v_binding.intent_id is not null then
      return jsonb_build_object(
        'npc',jsonb_build_object('npc_id',v_binding.entity_id),
        'reconciled_existing',true,
        'canonical_state_changed',false
      );
    end if;

    v_result := public.create_world_npc_v1(v_campaign_id,v_args);
    v_entity_id := nullif(v_result->>'npc_id','')::uuid;
    if v_entity_id is null then raise exception 'stage18_created_npc_id_missing'; end if;

    insert into public.ai_gm_post_turn_entity_bindings(
      intent_id,campaign_id,entity_kind,entity_id
    ) values(p_intent_id,v_campaign_id,'npc',v_entity_id);

    return jsonb_build_object('npc',v_result,'canonical_state_changed',true);

  elsif v_tool='update_world_npc' then
    begin v_character_id := nullif(v_args->>'character_id','')::uuid;
    exception when invalid_text_representation then raise exception 'character_id_invalid'; end;
    if v_character_id is null then raise exception 'character_id_required'; end if;
    v_result := public.update_world_npc_v1(v_character_id,v_args-'character_id');
    return jsonb_build_object('npc',v_result,'canonical_state_changed',true);

  elsif v_tool='upsert_faction' then
    v_result := public.upsert_faction_v1(v_campaign_id,v_args);
    return jsonb_build_object('faction',v_result,'canonical_state_changed',true);

  elsif v_tool='set_faction_membership' then
    begin
      v_character_id := nullif(v_args->>'character_id','')::uuid;
      v_faction_id := nullif(v_args->>'faction_id','')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_faction_binding_id_invalid';
    end;
    v_result := public.set_faction_membership_v1(
      v_character_id,v_faction_id,v_args-'character_id'-'faction_id'
    );
    return jsonb_build_object('membership',v_result,'canonical_state_changed',true);

  elsif v_tool='set_character_faction_reputation' then
    begin
      v_character_id := nullif(v_args->>'character_id','')::uuid;
      v_faction_id := nullif(v_args->>'faction_id','')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_faction_reputation_id_invalid';
    end;
    v_result := public.set_character_faction_reputation_v1(
      v_character_id,v_faction_id,v_args-'character_id'-'faction_id'
    );
    return jsonb_build_object('reputation',v_result,'canonical_state_changed',true);

  elsif v_tool='move_character_world' then
    begin
      v_character_id := nullif(v_args->>'character_id','')::uuid;
      v_entity_id := nullif(v_args->>'location_id','')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_movement_id_invalid';
    end;
    v_result := public.move_character_world_v1(
      v_character_id,
      v_entity_id,
      case when coalesce(v_args->>'campaign_day','') ~ '^[0-9]+$'
        then (v_args->>'campaign_day')::integer else null end,
      nullif(btrim(coalesce(v_args->>'day_period','')),'')
    );
    return jsonb_build_object('movement',v_result,'canonical_state_changed',true);

  elsif v_tool='set_world_discovery' then
    begin
      v_character_id := nullif(v_args->>'character_id','')::uuid;
      v_entity_id := nullif(v_args->>'entity_id','')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_discovery_id_invalid';
    end;
    v_result := public.manage_world_discovery_v1(
      v_character_id,
      btrim(coalesce(v_args->>'entity_type','')),
      v_entity_id,
      coalesce((v_args->>'discovered')::boolean,true),
      'ai_gm'
    );
    return jsonb_build_object('discovery',v_result,'canonical_state_changed',true);

  elsif v_tool='set_npc_habitat' then
    begin
      v_character_id := nullif(v_args->>'npc_character_id','')::uuid;
      v_entity_id := nullif(v_args->>'location_id','')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_habitat_id_invalid';
    end;
    perform public.set_npc_zone_habitat(
      v_character_id,v_entity_id,coalesce((v_args->>'attached')::boolean,true)
    );
    return jsonb_build_object(
      'npc_character_id',v_character_id,'location_id',v_entity_id,
      'attached',coalesce((v_args->>'attached')::boolean,true),
      'canonical_state_changed',true
    );

  elsif v_tool='upsert_location_transition' then
    begin
      v_source_location_id := nullif(v_args->>'source_location_id','')::uuid;
      v_target_location_id := nullif(v_args->>'target_location_id','')::uuid;
    exception when invalid_text_representation then
      raise exception 'stage18_transition_id_invalid';
    end;
    v_result := public.upsert_location_transition_v1(
      v_source_location_id,v_target_location_id,
      v_args-'source_location_id'-'target_location_id'
    );
    return jsonb_build_object('transition',v_result,'canonical_state_changed',true);

  elsif v_tool='upsert_location_secret' then
    begin v_entity_id := nullif(v_args->>'location_id','')::uuid;
    exception when invalid_text_representation then raise exception 'location_id_invalid'; end;
    v_result := public.upsert_location_secret_v1(v_entity_id,v_args-'location_id');
    return jsonb_build_object('secret',v_result,'canonical_state_changed',true);

  elsif v_tool='set_location_secret_state' then
    begin v_entity_id := nullif(v_args->>'secret_id','')::uuid;
    exception when invalid_text_representation then raise exception 'secret_id_invalid'; end;
    v_result := public.set_location_secret_state_v1(
      v_entity_id,
      btrim(coalesce(v_args->>'status','')),
      btrim(coalesce(v_args->>'resolution_note',''))
    );
    return jsonb_build_object('secret',v_result,'canonical_state_changed',true);

  elsif v_tool='set_character_life_state' then
    begin v_character_id := nullif(v_args->>'character_id','')::uuid;
    exception when invalid_text_representation then raise exception 'character_id_invalid'; end;
    update public.characters c
    set life_state=case when v_args->>'life_state'='dead' then 'dead' else 'alive' end,
        died_at=case
          when v_args->>'life_state'='dead' then coalesce(c.died_at,now())
          else null end,
        updated_at=now()
    where c.id=v_character_id and c.campaign_id=v_campaign_id
    returning to_jsonb(c) into v_result;
    if v_result is null then raise exception 'character_not_found'; end if;
    return jsonb_build_object('character',v_result,'canonical_state_changed',true);

  elsif v_tool='create_quest_plan' then
    v_result := public.create_quest_plan_v1(v_campaign_id,v_args);
    return v_result || jsonb_build_object('canonical_state_changed',true);

  elsif v_tool='activate_quest' then
    v_quest_id := private.stage18_resolve_quest_id_v3(v_campaign_id,v_args);
    v_result := public.activate_quest_v1(v_quest_id);
    return v_result || jsonb_build_object('canonical_state_changed',true);

  elsif v_tool='update_quest_brief' then
    v_quest_id := private.stage18_resolve_quest_id_v3(v_campaign_id,v_args);
    update public.quests q
    set title=case when v_args ? 'title'
          then coalesce(nullif(left(btrim(v_args->>'title'),240),''),q.title)
          else q.title end,
        player_brief=case when v_args ? 'player_brief'
          then left(btrim(coalesce(v_args->>'player_brief','')),6000)
          else q.player_brief end,
        updated_at=now()
    where q.id=v_quest_id and q.campaign_id=v_campaign_id
    returning to_jsonb(q) into v_result;
    return jsonb_build_object('quest',v_result,'canonical_state_changed',true);

  elsif v_tool='bind_quest_target' then
    v_quest_id := private.stage18_resolve_quest_id_v3(v_campaign_id,v_args);
    v_target_key := btrim(coalesce(v_args->>'target_key',''));
    if v_target_key='' then raise exception 'target_key_required'; end if;
    select * into v_target
    from public.quest_targets
    where quest_id=v_quest_id and target_key=v_target_key
    for update;
    if v_target.id is null then raise exception 'quest_target_not_found'; end if;

    begin
      v_entity_id := nullif(v_args->>'entity_id','')::uuid;
    exception when invalid_text_representation then
      raise exception 'entity_id_invalid';
    end;

    if v_target.target_kind='location' then
      update public.quest_targets set location_id=v_entity_id where id=v_target.id;
    elsif v_target.target_kind='npc' then
      update public.quest_targets set npc_character_id=v_entity_id where id=v_target.id;
    else
      update public.quest_targets set item_definition_id=v_entity_id where id=v_target.id;
    end if;
    return jsonb_build_object(
      'quest_id',v_quest_id,'target_id',v_target.id,'target_key',v_target_key,
      'entity_id',v_entity_id,'canonical_state_changed',true
    );

  elsif v_tool='materialize_quest_target' then
    v_quest_id := private.stage18_resolve_quest_id_v3(v_campaign_id,v_args);
    v_result := public.materialize_quest_target_v1(
      v_quest_id,
      btrim(coalesce(v_args->>'target_key','')),
      coalesce(v_args->'entity','{}'::jsonb)
    );
    return v_result || jsonb_build_object('canonical_state_changed',true);

  elsif v_tool='resolve_quest_condition' then
    begin v_entity_id := nullif(v_args->>'condition_id','')::uuid;
    exception when invalid_text_representation then raise exception 'condition_id_invalid'; end;
    v_result := public.set_quest_condition_resolution_ai_v1(
      v_entity_id,
      coalesce((v_args->>'satisfied')::boolean,false),
      left(btrim(coalesce(v_args->>'note','')),6000)
    );
    return v_result || jsonb_build_object('canonical_state_changed',true);

  elsif v_tool='run_quest_resolver' then
    v_quest_id := private.stage18_resolve_quest_id_v3(v_campaign_id,v_args);
    v_result := public.resolve_quest_v1(v_quest_id);
    return jsonb_build_object('resolver',v_result,'canonical_state_changed',true);

  elsif v_tool='close_quest' then
    v_quest_id := private.stage18_resolve_quest_id_v3(v_campaign_id,v_args);
    v_result := public.close_quest_v1(
      v_quest_id,
      btrim(coalesce(v_args->>'status','')),
      left(btrim(coalesce(v_args->>'note','')),6000)
    );
    return v_result || jsonb_build_object('canonical_state_changed',true);

  elsif v_tool='remember_campaign_fact' then
    if jsonb_typeof(coalesce(v_args->'source_event_ids','[]'::jsonb))<>'array' then
      raise exception 'stage18_memory_source_events_invalid';
    end if;

    for v_event_id_text in
      select value from jsonb_array_elements_text(coalesce(v_args->'source_event_ids','[]'::jsonb))
    loop
      begin
        v_event_ids := array_append(v_event_ids,v_event_id_text::uuid);
      exception when invalid_text_representation then
        raise exception 'stage18_memory_source_event_id_invalid';
      end;
    end loop;

    if exists (
      select 1
      from unnest(v_event_ids) event_id
      where not exists (
        select 1 from public.campaign_events e
        where e.id=event_id
          and e.campaign_id=v_campaign_id
          and (e.room_id=v_room_id or e.room_id is null)
      )
    ) then
      raise exception 'stage18_memory_source_event_not_allowed';
    end if;

    select * into v_fact
    from public.campaign_memory_facts
    where campaign_id=v_campaign_id
      and fact_key=nullif(left(btrim(coalesce(v_args->>'fact_key','')),180),'')
      and status='active'
    limit 1
    for update;

    if v_fact.id is not null then
      return jsonb_build_object(
        'fact_id',v_fact.id,'stored',true,'reconciled_existing',true,
        'canonical_state_changed',false
      );
    end if;

    if nullif(btrim(coalesce(v_args->>'statement','')),'') is null then
      raise exception 'statement_required';
    end if;
    v_fact_id := extensions.gen_random_uuid();

    insert into public.campaign_memory_facts(
      id,campaign_id,fact_key,subject_type,subject_id,predicate,statement,
      structured_value,status,confidence,source_event_ids,visibility,room_id,
      visible_user_ids,visible_character_ids,provenance,created_by
    )
    values(
      v_fact_id,
      v_campaign_id,
      nullif(left(btrim(coalesce(v_args->>'fact_key','')),180),''),
      nullif(left(btrim(coalesce(v_args->>'subject_type','')),80),''),
      nullif(left(btrim(coalesce(v_args->>'subject_id','')),180),''),
      nullif(left(btrim(coalesce(v_args->>'predicate','')),120),''),
      left(btrim(v_args->>'statement'),6000),
      coalesce(v_args->'structured_value','{}'::jsonb),
      'active',
      case when coalesce(v_args->>'confidence','') ~ '^[0-9]+([.][0-9]+)?$'
        then greatest(0,least((v_args->>'confidence')::numeric,1))
        else 0.9 end,
      v_event_ids,
      'room',
      v_room_id,
      '{}'::uuid[],
      '{}'::uuid[],
      jsonb_build_object('kind','stage18_post_turn','agent','voss'),
      v_manager_user_id
    );

    return jsonb_build_object(
      'fact_id',v_fact_id,'stored',true,'canonical_state_changed',false
    );
  else
    raise exception 'stage18_post_turn_tool_not_supported';
  end if;
end;
$$;

revoke all on function public.execute_ai_gm_post_turn_tool_v3(uuid,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.execute_ai_gm_post_turn_tool_v3(uuid,uuid,text,jsonb)
  to service_role;

create or replace function public.complete_ai_gm_post_turn_intent_v2(
  p_intent_id uuid,
  p_lease_token uuid,
  p_worker_model_key text,
  p_tool_name text,
  p_tool_arguments jsonb,
  p_tool_result jsonb,
  p_resolved_entity_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ctx jsonb;
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  if jsonb_typeof(coalesce(p_resolved_entity_ids,'[]'::jsonb))<>'array' then
    raise exception 'stage18_resolved_entity_ids_must_be_array';
  end if;

  v_ctx := private.stage18_assert_worker_lease_v3(p_intent_id,p_lease_token);

  update public.ai_gm_post_turn_intent_receipts
  set state='completed',
      tool_name=nullif(left(btrim(coalesce(p_tool_name,'')),160),''),
      tool_arguments=coalesce(p_tool_arguments,'{}'::jsonb),
      tool_result=coalesce(p_tool_result,'{}'::jsonb),
      resolved_entity_ids=coalesce(p_resolved_entity_ids,'[]'::jsonb),
      lease_expires_at=null,
      last_error=null,
      completed_at=now(),
      updated_at=now()
  where id=p_intent_id and state='running'
  returning * into v_intent;

  if v_intent.id is null then raise exception 'stage18_intent_not_running'; end if;
  return to_jsonb(v_intent);
end;
$$;

revoke all on function public.complete_ai_gm_post_turn_intent_v2(
  uuid,uuid,text,text,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.complete_ai_gm_post_turn_intent_v2(
  uuid,uuid,text,text,jsonb,jsonb,jsonb
) to service_role;

create or replace function public.fail_ai_gm_post_turn_intent_v2(
  p_intent_id uuid,
  p_lease_token uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ctx jsonb;
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  v_ctx := private.stage18_assert_worker_lease_v3(p_intent_id,p_lease_token);

  update public.ai_gm_post_turn_intent_receipts
  set state='failed',
      lease_expires_at=null,
      last_error=left(coalesce(p_error,'stage18_intent_failed'),500),
      updated_at=now()
  where id=p_intent_id and state='running'
  returning * into v_intent;

  return case when v_intent.id is null then null else to_jsonb(v_intent) end;
end;
$$;

revoke all on function public.fail_ai_gm_post_turn_intent_v2(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.fail_ai_gm_post_turn_intent_v2(uuid,uuid,text)
  to service_role;

create or replace function public.complete_ai_gm_post_turn_commit_v2(
  p_commit_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
    and state='running'
    and lease_token=p_lease_token
    and lease_expires_at>now()
  for update;

  if v_commit.id is null then raise exception 'stage18_worker_lease_invalid'; end if;

  if exists (
    select 1 from public.ai_gm_post_turn_intent_receipts
    where commit_id=p_commit_id and state not in ('completed','skipped')
  ) then
    raise exception 'stage18_commit_has_unfinished_intents';
  end if;

  update public.ai_gm_post_turn_commits
  set state='completed',
      lease_token=null,
      lease_expires_at=null,
      last_error=null,
      completed_at=now(),
      updated_at=now()
  where id=p_commit_id
  returning * into v_commit;

  update public.agent_jobs
  set result=coalesce(result,'{}'::jsonb)
      || jsonb_build_object(
        'post_turn_state','completed',
        'post_turn_commit_id',p_commit_id,
        'runtime_stage',18
      ),
      updated_at=now()
  where id=v_commit.parent_job_id;

  return to_jsonb(v_commit);
end;
$$;

revoke all on function public.complete_ai_gm_post_turn_commit_v2(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.complete_ai_gm_post_turn_commit_v2(uuid,uuid)
  to service_role;

create or replace function public.fail_ai_gm_post_turn_commit_v2(
  p_commit_id uuid,
  p_lease_token uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_next_state text;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
    and state='running'
    and lease_token=p_lease_token
  for update;

  if v_commit.id is null then raise exception 'stage18_worker_lease_invalid'; end if;

  v_next_state := case
    when v_commit.attempts<v_commit.max_attempts then 'queued'
    else 'failed'
  end;

  update public.ai_gm_post_turn_intent_receipts
  set state=case
        when state in ('running','failed') and v_next_state='queued' then 'pending'
        when state='running' then 'failed'
        else state end,
      lease_expires_at=null,
      last_error=case
        when state in ('running','failed')
          then left(coalesce(p_error,'stage18_intent_failed'),500)
        else last_error end,
      updated_at=now()
  where commit_id=p_commit_id and state in ('running','failed');

  update public.ai_gm_post_turn_commits
  set state=v_next_state,
      lease_token=null,
      lease_expires_at=null,
      last_error=left(coalesce(p_error,'stage18_post_turn_commit_failed'),500),
      updated_at=now()
  where id=p_commit_id
  returning * into v_commit;

  update public.agent_jobs
  set result=coalesce(result,'{}'::jsonb)
      || jsonb_build_object(
        'post_turn_state',v_next_state,
        'post_turn_commit_id',p_commit_id,
        'post_turn_error',v_commit.last_error,
        'runtime_stage',18
      ),
      updated_at=now()
  where id=v_commit.parent_job_id;

  return to_jsonb(v_commit);
end;
$$;

revoke all on function public.fail_ai_gm_post_turn_commit_v2(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.fail_ai_gm_post_turn_commit_v2(uuid,uuid,text)
  to service_role;

create or replace function public.retry_ai_gm_post_turn_commit_v2(
  p_commit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'auth_required'; end if;

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then raise exception 'stage18_commit_not_found'; end if;
  if not private.can_manage_campaign(v_commit.campaign_id,v_user_id) then
    raise exception 'campaign_manage_required';
  end if;
  if v_commit.state<>'failed' then
    raise exception 'stage18_commit_not_failed';
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state=case when state='completed' then 'completed' else 'pending' end,
      attempts=case when state='completed' then attempts else 0 end,
      lease_expires_at=null,
      last_error=case when state='completed' then last_error else null end,
      updated_at=now()
  where commit_id=p_commit_id;

  update public.ai_gm_post_turn_commits
  set state='queued',
      attempts=0,
      lease_token=null,
      lease_expires_at=null,
      last_error=null,
      updated_at=now()
  where id=p_commit_id
  returning * into v_commit;

  update public.agent_jobs
  set result=coalesce(result,'{}'::jsonb)
      || jsonb_build_object(
        'post_turn_state','queued',
        'post_turn_commit_id',p_commit_id,
        'post_turn_error',null,
        'runtime_stage',18
      ),
      updated_at=now()
  where id=v_commit.parent_job_id;

  return jsonb_build_object(
    'commit_id',v_commit.id,'state','queued','room_id',v_commit.room_id,'runtime_stage',18
  );
end;
$$;

revoke all on function public.retry_ai_gm_post_turn_commit_v2(uuid)
  from public, anon;
grant execute on function public.retry_ai_gm_post_turn_commit_v2(uuid)
  to authenticated;
