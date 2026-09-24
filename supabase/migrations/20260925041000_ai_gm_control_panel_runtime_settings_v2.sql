-- AI GM control panel v2: real runtime switches + unrestricted compatible junior model selector.

create table if not exists public.ai_gm_runtime_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  junior_commit_enabled boolean not null default true,
  world_materialization_enabled boolean not null default true,
  background_world_enabled boolean not null default true,
  npc_identity_enabled boolean not null default true,
  quest_updates_enabled boolean not null default true,
  maintenance_enabled boolean not null default true,
  media_pipeline_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.ai_gm_runtime_settings enable row level security;
revoke all on table public.ai_gm_runtime_settings from public, anon, authenticated;
grant select on table public.ai_gm_runtime_settings to service_role;

create or replace function public.read_ai_gm_runtime_settings_v1(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_row public.ai_gm_runtime_settings%rowtype;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if not private.is_campaign_member(p_campaign_id,v_user_id) then
    raise exception 'campaign_membership_required';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_gm_not_available';
  end if;

  select * into v_row
  from public.ai_gm_runtime_settings s
  where s.campaign_id=p_campaign_id;

  return jsonb_build_object(
    'junior_commit',coalesce(v_row.junior_commit_enabled,true),
    'world_materialization',coalesce(v_row.world_materialization_enabled,true),
    'background_world',coalesce(v_row.background_world_enabled,true),
    'npc_identity',coalesce(v_row.npc_identity_enabled,true),
    'quest_updates',coalesce(v_row.quest_updates_enabled,true),
    'maintenance',coalesce(v_row.maintenance_enabled,true),
    'media_pipeline',coalesce(v_row.media_pipeline_enabled,true),
    'updated_at',v_row.updated_at
  );
end;
$function$;

revoke all on function public.read_ai_gm_runtime_settings_v1(uuid) from public, anon;
grant execute on function public.read_ai_gm_runtime_settings_v1(uuid) to authenticated;

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

  return public.read_ai_gm_runtime_settings_v1(p_campaign_id);
end;
$function$;

revoke all on function public.set_campaign_ai_gm_runtime_feature_v1(uuid,text,boolean) from public, anon;
grant execute on function public.set_campaign_ai_gm_runtime_feature_v1(uuid,text,boolean) to authenticated;

create or replace function private.can_select_campaign_junior_model_v1(p_model_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.ai_models m
    where m.id=p_model_id
      and m.enabled=true
      and m.model_kind='agent'
      and m.access_scope='campaign'
      and m.supports_tools=true
      and m.supports_json=true
      and (m.gm_selectable=true or m.user_selectable=true or m.is_base=true)
  );
$function$;

revoke all on function private.can_select_campaign_junior_model_v1(uuid)
  from public, anon, authenticated;

create or replace function public.list_campaign_ai_junior_models_v1(p_campaign_id uuid)
returns table(
  id uuid,
  model_key text,
  display_name text,
  supports_tools boolean,
  supports_json boolean,
  supports_vision boolean,
  context_window integer,
  cost_tier smallint,
  reasoning_tier smallint,
  latency_tier smallint,
  selected boolean
)
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_selected_model_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'auth_required';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_gm_junior_model_ai_world_only';
  end if;
  if not private.is_campaign_member(p_campaign_id,(select auth.uid())) then
    raise exception 'campaign_membership_required';
  end if;

  select s.selected_model_id into v_selected_model_id
  from public.ai_agent_settings s
  join public.ai_models m on m.id=s.selected_model_id
  where s.campaign_id=p_campaign_id
    and s.agent_key='junior'
    and private.can_select_campaign_junior_model_v1(m.id);

  if v_selected_model_id is null then
    select m.id into v_selected_model_id
    from public.ai_models m
    where m.model_key='deepseek-v4.1-flash'
      and private.can_select_campaign_junior_model_v1(m.id)
    limit 1;
  end if;

  return query
  select
    m.id,m.model_key,m.display_name,m.supports_tools,m.supports_json,
    m.supports_vision,m.context_window,m.cost_tier,m.reasoning_tier,
    m.latency_tier,m.id=v_selected_model_id
  from public.ai_models m
  where private.can_select_campaign_junior_model_v1(m.id)
  order by
    (m.id=v_selected_model_id) desc,
    m.cost_tier asc,
    m.latency_tier asc,
    m.reasoning_tier desc,
    m.display_name asc;
end;
$function$;

revoke all on function public.list_campaign_ai_junior_models_v1(uuid) from public, anon;
grant execute on function public.list_campaign_ai_junior_models_v1(uuid) to authenticated;

create or replace function public.read_ai_gm_control_panel_v1(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_ai_world boolean;
  v_can_manage boolean;
  v_behavior jsonb;
  v_director jsonb;
  v_content jsonb;
  v_runtime jsonb;
  v_gm_models jsonb := '[]'::jsonb;
  v_junior_models jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if not private.is_campaign_member(p_campaign_id,v_user_id) then
    raise exception 'campaign_membership_required';
  end if;

  v_ai_world := private.is_ai_world_campaign_v1(p_campaign_id);
  v_can_manage := private.is_campaign_manager(p_campaign_id,v_user_id);

  if not v_ai_world then
    return jsonb_build_object(
      'campaign_id',p_campaign_id,'ai_world',false,'can_manage',v_can_manage,
      'gm_models','[]'::jsonb,'junior_models','[]'::jsonb,'behavior',null,
      'director',null,'content',null,'features','[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
    into v_gm_models
  from public.list_campaign_gm_models_v1(p_campaign_id) x;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
    into v_junior_models
  from public.list_campaign_ai_junior_models_v1(p_campaign_id) x;

  v_behavior := public.list_campaign_ai_gm_behavior_profiles_v1(p_campaign_id);
  v_director := public.read_my_ai_director_preferences_v1(p_campaign_id);
  v_content := public.list_campaign_ai_gm_content_profiles_v1(p_campaign_id);
  v_runtime := public.read_ai_gm_runtime_settings_v1(p_campaign_id);

  return jsonb_build_object(
    'campaign_id',p_campaign_id,
    'ai_world',true,
    'can_manage',v_can_manage,
    'gm_models',v_gm_models,
    'junior_models',v_junior_models,
    'behavior',v_behavior,
    'director',v_director,
    'content',v_content,
    'features',jsonb_build_array(
      jsonb_build_object(
        'key','server_resolver','display_name','Серверные броски и Resolver',
        'summary','Кубы, DC, decision_key и причинные проверки остаются серверными.',
        'enabled',true,'mutable',false,'state','locked'
      ),
      jsonb_build_object(
        'key','junior_commit','display_name','Младший шуршальщик',
        'summary','После ответа старшего ИИ переносит уже объявленный канон в NPC, локации, связи и состояние.',
        'enabled',(v_runtime->>'junior_commit')::boolean,'mutable',true,'state','toggle'
      ),
      jsonb_build_object(
        'key','world_materialization','display_name','Автосоздание мира',
        'summary','Разрешает ИИ создавать минимально необходимые локации и постоянные сущности по ходу игры.',
        'enabled',(v_runtime->>'world_materialization')::boolean,'mutable',true,'state','toggle'
      ),
      jsonb_build_object(
        'key','background_world','display_name','Живой фон мира',
        'summary','Мир и сущности продолжают меняться между сценами через daily Resolver.',
        'enabled',(v_runtime->>'background_world')::boolean,'mutable',true,'state','toggle'
      ),
      jsonb_build_object(
        'key','npc_identity','display_name','Память личности NPC',
        'summary','ИИ достраивает и использует устойчивый fingerprint характера NPC.',
        'enabled',(v_runtime->>'npc_identity')::boolean,'mutable',true,'state','toggle'
      ),
      jsonb_build_object(
        'key','quest_updates','display_name','Автообновление квестов',
        'summary','Младший ИИ может создавать и обновлять квестовый канон после ответа мастера.',
        'enabled',(v_runtime->>'quest_updates')::boolean,'mutable',true,'state','toggle'
      ),
      jsonb_build_object(
        'key','maintenance','display_name','Архивация и долговременная память',
        'summary','Каждые игровые окна история сворачивается в факты и сводки.',
        'enabled',(v_runtime->>'maintenance')::boolean,'mutable',true,'state','toggle'
      ),
      jsonb_build_object(
        'key','media_pipeline','display_name','Автоарты NPC и локаций',
        'summary','Автоматически запускает арт-пайплайн на игровых триггерах.',
        'enabled',(v_runtime->>'media_pipeline')::boolean,'mutable',true,'state','toggle'
      ),
      jsonb_build_object(
        'key','coop_sync','display_name','Кооператив и временная синхронизация',
        'summary','Разделённые группы, встречи и передача времени остаются частью ядра причинности.',
        'enabled',true,'mutable',false,'state','locked'
      ),
      jsonb_build_object(
        'key','bounded_context','display_name','Ограниченный канонический контекст',
        'summary','Модели получают релевантный снимок мира вместо бесконечного сырого архива.',
        'enabled',true,'mutable',false,'state','locked'
      )
    )
  );
end;
$function$;

revoke all on function public.read_ai_gm_control_panel_v1(uuid) from public, anon;
grant execute on function public.read_ai_gm_control_panel_v1(uuid) to authenticated;

-- Stop optional DB-driven workers before they enqueue HTTP work.
create or replace function private.ai_gm_runtime_feature_enabled_v1(
  p_campaign_id uuid,
  p_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case lower(btrim(coalesce(p_feature_key,'')))
    when 'junior_commit' then coalesce(s.junior_commit_enabled,true)
    when 'world_materialization' then coalesce(s.world_materialization_enabled,true)
    when 'background_world' then coalesce(s.background_world_enabled,true)
    when 'npc_identity' then coalesce(s.npc_identity_enabled,true)
    when 'quest_updates' then coalesce(s.quest_updates_enabled,true)
    when 'maintenance' then coalesce(s.maintenance_enabled,true)
    when 'media_pipeline' then coalesce(s.media_pipeline_enabled,true)
    else true
  end
  from (select 1) seed
  left join public.ai_gm_runtime_settings s on s.campaign_id=p_campaign_id;
$function$;

revoke all on function private.ai_gm_runtime_feature_enabled_v1(uuid,text)
  from public, anon, authenticated;

create or replace function private.dispatch_ai_gm_media_job_v1(p_job_id uuid)
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_job public.agent_jobs%rowtype;
  v_config private.ai_gm_media_dispatch_config%rowtype;
  v_request_id bigint;
begin
  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and agent_key='ai-gm-media-worker'
    and job_type='image_generate'
    and input->>'surface'='ai_gm_media_stage9_v1'
    and status='queued';

  if v_job.id is null then return null; end if;
  if not private.ai_gm_runtime_feature_enabled_v1(v_job.campaign_id,'media_pipeline') then
    return null;
  end if;

  select * into v_config
  from private.ai_gm_media_dispatch_config
  where singleton=true;

  if v_config.singleton is null
     or v_config.enabled is not true
     or nullif(trim(v_config.project_url),'') is null
  then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_config.project_url,'/') || '/functions/v1/ai-gm-media',
    body := jsonb_build_object(
      'jobId',p_job_id::text,
      'campaignId',v_job.campaign_id::text,
      'dispatchToken',v_config.dispatch_token
    ),
    headers := jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds := 90000
  )
  into v_request_id;

  return v_request_id;
end;
$function$;

create or replace function private.dispatch_ai_gm_maintenance_job_v1(p_job_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.agent_jobs%rowtype;
  v_state public.ai_gm_room_maintenance_state%rowtype;
  v_config private.ai_gm_maintenance_dispatch_config%rowtype;
  v_room_id uuid;
  v_request_id bigint;
begin
  if p_job_id is null then return null; end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='world_maintenance'
    and input->>'surface'='world_maintenance_v1'
  for update;

  if v_job.id is null or v_job.status<>'queued' then return null; end if;
  if not private.ai_gm_runtime_feature_enabled_v1(v_job.campaign_id,'maintenance') then
    return null;
  end if;

  v_room_id := nullif(v_job.input->>'maintenance_room_id','')::uuid;
  if v_room_id is null then return null; end if;

  select * into v_state
  from public.ai_gm_room_maintenance_state
  where room_id=v_room_id
  for update;
  if v_state.room_id is null then return null; end if;

  if v_state.last_dispatched_job_id=p_job_id
     and v_state.last_dispatch_at is not null
     and v_state.last_dispatch_at>now()-interval '30 seconds'
  then return null; end if;

  select * into v_config
  from private.ai_gm_maintenance_dispatch_config
  where singleton=true;

  if v_config.singleton is null
     or v_config.enabled is not true
     or nullif(btrim(v_config.project_url),'') is null
     or nullif(btrim(v_config.dispatch_token),'') is null
  then return null; end if;

  select net.http_post(
    url:=rtrim(v_config.project_url,'/')||'/functions/v1/world-maintenance',
    body:=jsonb_build_object(
      'campaignId',v_job.campaign_id::text,
      'roomId',v_room_id::text,
      'dispatchToken',v_config.dispatch_token
    ),
    headers:=jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds:=5000
  ) into v_request_id;

  if v_request_id is not null then
    update public.ai_gm_room_maintenance_state
    set last_dispatched_job_id=p_job_id,last_dispatch_at=now(),updated_at=now()
    where room_id=v_room_id;
  end if;

  return v_request_id;
end;
$function$;

create or replace function private.dispatch_ai_background_daily_run_v1(p_run_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run public.ai_background_daily_runs%rowtype;
  v_config private.ai_background_dispatch_config%rowtype;
  v_request_id bigint;
begin
  if p_run_id is null then return null; end if;

  select * into v_run
  from public.ai_background_daily_runs
  where id=p_run_id
  for update;

  if v_run.id is null
     or v_run.candidate_resolved_at is null
     or v_run.status not in ('queued','failed')
  then return null; end if;

  if not private.ai_gm_runtime_feature_enabled_v1(v_run.campaign_id,'background_world') then
    return null;
  end if;

  if v_run.last_dispatch_at is not null
     and v_run.last_dispatch_at>now()-interval '30 seconds'
  then return null; end if;

  select * into v_config
  from private.ai_background_dispatch_config
  where singleton=true;

  if v_config.singleton is null
     or v_config.enabled is not true
     or nullif(btrim(v_config.project_url),'') is null
     or nullif(btrim(v_config.dispatch_token),'') is null
  then return null; end if;

  select net.http_post(
    url:=rtrim(v_config.project_url,'/')||'/functions/v1/ai-world-background',
    body:=jsonb_build_object('runId',v_run.id::text,'dispatchToken',v_config.dispatch_token),
    headers:=jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds:=90000
  ) into v_request_id;

  if v_request_id is not null then
    update public.ai_background_daily_runs
    set last_dispatch_at=now(),dispatch_request_id=v_request_id,updated_at=now()
    where id=v_run.id;
  end if;
  return v_request_id;
end;
$function$;
