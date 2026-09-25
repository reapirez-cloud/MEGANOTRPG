-- AI GM control panel v3: make optional switches operational at queue boundaries
-- and wake paused durable work when a feature is re-enabled.

create or replace function public.set_campaign_ai_gm_runtime_feature_v1(
  p_campaign_id uuid,
  p_feature_key text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_key text := lower(btrim(coalesce(p_feature_key,'')));
  v_row record;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if not private.is_campaign_manager(p_campaign_id,v_user_id) then
    raise exception 'campaign_manager_required';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_gm_not_available';
  end if;
  if p_enabled is null then
    raise exception 'ai_gm_feature_enabled_required';
  end if;

  if v_key not in (
    'junior_commit',
    'world_materialization',
    'background_world',
    'npc_identity',
    'quest_updates',
    'maintenance',
    'media_pipeline'
  ) then
    raise exception 'ai_gm_feature_not_mutable';
  end if;

  insert into public.ai_gm_runtime_settings(campaign_id,updated_by,updated_at)
  values(p_campaign_id,v_user_id,now())
  on conflict(campaign_id) do nothing;

  update public.ai_gm_runtime_settings s
  set junior_commit_enabled = case when v_key='junior_commit' then p_enabled else s.junior_commit_enabled end,
      world_materialization_enabled = case when v_key='world_materialization' then p_enabled else s.world_materialization_enabled end,
      background_world_enabled = case when v_key='background_world' then p_enabled else s.background_world_enabled end,
      npc_identity_enabled = case when v_key='npc_identity' then p_enabled else s.npc_identity_enabled end,
      quest_updates_enabled = case when v_key='quest_updates' then p_enabled else s.quest_updates_enabled end,
      maintenance_enabled = case when v_key='maintenance' then p_enabled else s.maintenance_enabled end,
      media_pipeline_enabled = case when v_key='media_pipeline' then p_enabled else s.media_pipeline_enabled end,
      updated_by=v_user_id,
      updated_at=now()
  where s.campaign_id=p_campaign_id;

  -- Re-enable already durable work that may have been reserved while the
  -- feature was disabled. Dispatchers remain idempotent and rate-guarded.
  if p_enabled and v_key='background_world' then
    for v_row in
      select r.id
      from public.ai_background_daily_runs r
      where r.campaign_id=p_campaign_id
        and r.candidate_resolved_at is not null
        and r.status in ('queued','failed')
      order by r.campaign_day asc
      limit 12
    loop
      perform private.dispatch_ai_background_daily_run_v1(v_row.id);
    end loop;
  elsif p_enabled and v_key='maintenance' then
    for v_row in
      select j.id
      from public.agent_jobs j
      where j.campaign_id=p_campaign_id
        and j.job_type='world_maintenance'
        and j.input->>'surface'='world_maintenance_v1'
        and j.status='queued'
      order by j.created_at asc
      limit 24
    loop
      perform private.dispatch_ai_gm_maintenance_job_v1(v_row.id);
    end loop;
  elsif p_enabled and v_key='media_pipeline' then
    for v_row in
      select j.id
      from public.agent_jobs j
      where j.campaign_id=p_campaign_id
        and j.agent_key='ai-gm-media-worker'
        and j.job_type='image_generate'
        and j.input->>'surface'='ai_gm_media_stage9_v1'
        and j.status='queued'
      order by j.created_at asc
      limit 24
    loop
      perform private.dispatch_ai_gm_media_job_v1(v_row.id);
    end loop;
  end if;

  return public.read_ai_gm_runtime_settings_v1(p_campaign_id);
end;
$function$;

revoke all on function public.set_campaign_ai_gm_runtime_feature_v1(uuid,text,boolean)
  from public,anon;
grant execute on function public.set_campaign_ai_gm_runtime_feature_v1(uuid,text,boolean)
  to authenticated;

create or replace function private.queue_ai_gm_npc_media_after_profile_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_campaign_id uuid;
begin
  select c.campaign_id into v_campaign_id
  from public.characters c
  where c.id=new.character_id;

  if v_campaign_id is null
     or not private.ai_gm_runtime_feature_enabled_v1(v_campaign_id,'media_pipeline')
  then
    return new;
  end if;

  perform private.queue_ai_gm_media_target_v1(
    'character',new.character_id,'npc_create',null
  );
  return new;
end;
$function$;

revoke all on function private.queue_ai_gm_npc_media_after_profile_v1()
  from public,anon,authenticated;

create or replace function private.queue_ai_gm_location_media_after_entry_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_type text;
  v_publication text;
  v_npc_id uuid;
begin
  if new.location_id is null then return new; end if;
  if tg_op='UPDATE' and old.location_id is not distinct from new.location_id then
    return new;
  end if;

  select c.character_type,c.publication_state
    into v_type,v_publication
  from public.characters c
  where c.id=new.character_id;

  if v_publication<>'campaign' then return new; end if;

  if v_type='npc' then
    perform private.publish_existing_ai_gm_target_media_v1(
      'character',new.character_id,null
    );
    return new;
  end if;

  if v_type<>'pc' then return new; end if;

  perform private.publish_existing_ai_gm_target_media_v1(
    'location',new.location_id,new.character_id
  );

  if private.ai_gm_runtime_feature_enabled_v1(new.campaign_id,'media_pipeline') then
    perform private.queue_ai_gm_media_target_v1(
      'location',new.location_id,'location_first_visit',new.character_id
    );
  end if;

  for v_npc_id in
    select c.id
    from public.characters c
    join public.character_world_state ws
      on ws.character_id=c.id
     and ws.campaign_id=c.campaign_id
    where c.campaign_id=new.campaign_id
      and c.character_type='npc'
      and c.publication_state='campaign'
      and c.life_state='alive'
      and ws.location_id=new.location_id
    order by c.id
  loop
    perform private.publish_existing_ai_gm_target_media_v1(
      'character',v_npc_id,new.character_id
    );
  end loop;

  return new;
end;
$function$;

revoke all on function private.queue_ai_gm_location_media_after_entry_v1()
  from public,anon,authenticated;
