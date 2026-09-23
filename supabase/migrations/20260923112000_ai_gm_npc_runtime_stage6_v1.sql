-- AI GM Stage 6: canonical NPC runtime, fixed build worker and server-authoritative NPC mechanics.
--
-- NPC mechanics are materialized into the existing Character Engine template runtime.
-- The AI GM selects only canonical NPC + mechanic ids. Numbers, dice, DCs and resource
-- costs are read server-side from the assigned template and executed through existing
-- GENA chat/template RPCs.

alter table public.agent_jobs
  drop constraint if exists agent_jobs_job_type_check;

alter table public.agent_jobs
  add constraint agent_jobs_job_type_check
  check (
    job_type = any (
      array[
        'conversation_turn'::text,
        'image_generate'::text,
        'image_review'::text,
        'image_attach'::text,
        'draft_create'::text,
        'draft_revise'::text,
        'draft_apply'::text,
        'mechanics_compile'::text,
        'dev_patch'::text,
        'dev_test'::text,
        'dev_build'::text,
        'dev_preview'::text,
        'dev_deploy'::text,
        'world_maintenance'::text,
        'npc_runtime_build'::text
      ]
    )
  );

create table if not exists public.npc_runtime_builds (
  character_id uuid primary key references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','running','ready','failed')),
  source_bestiary_slug text,
  template_id uuid references public.rule_templates(id) on delete set null,
  model_id uuid references public.ai_models(id) on delete set null,
  build_revision integer not null default 0 check (build_revision >= 0),
  last_job_id uuid references public.agent_jobs(id) on delete set null,
  build_payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.npc_runtime_builds enable row level security;
revoke all on table public.npc_runtime_builds from public, anon, authenticated;
grant all on table public.npc_runtime_builds to service_role;

create index if not exists npc_runtime_builds_campaign_idx
  on public.npc_runtime_builds(campaign_id);
create index if not exists npc_runtime_builds_template_idx
  on public.npc_runtime_builds(template_id);
create index if not exists npc_runtime_builds_job_idx
  on public.npc_runtime_builds(last_job_id);

create unique index if not exists agent_jobs_npc_runtime_active_unique
  on public.agent_jobs((input->>'npc_character_id'))
  where job_type='npc_runtime_build'
    and status in ('queued','running');

create or replace function private.reserve_ai_gm_npc_runtime_build_v1(
  p_character_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_character public.characters%rowtype;
  v_manager_user_id uuid;
  v_existing public.npc_runtime_builds%rowtype;
  v_job_id uuid;
begin
  if p_character_id is null then return null; end if;

  select * into v_character
  from public.characters
  where id=p_character_id
    and character_type='npc'
    and publication_state='campaign'
    and life_state='alive';

  if v_character.id is null then return null; end if;

  select * into v_existing
  from public.npc_runtime_builds
  where character_id=p_character_id
  for update;

  if v_existing.status='ready' and v_existing.template_id is not null then
    return v_existing.last_job_id;
  end if;

  select j.id into v_job_id
  from public.agent_jobs j
  where j.job_type='npc_runtime_build'
    and j.input->>'npc_character_id'=p_character_id::text
    and j.status in ('queued','running')
  order by j.created_at asc
  limit 1;

  if v_job_id is not null then return v_job_id; end if;

  select cm.user_id into v_manager_user_id
  from public.campaign_members cm
  where cm.campaign_id=v_character.campaign_id
    and (cm.is_owner=true or cm.role='gm')
  order by cm.is_owner desc, cm.created_at asc
  limit 1;

  if v_manager_user_id is null then return null; end if;

  insert into public.agent_jobs(
    campaign_id,thread_id,requested_by,agent_key,job_type,status,input,result,
    requested_outputs,completed_outputs
  )
  values(
    v_character.campaign_id,null,v_manager_user_id,'npc-runtime-worker',
    'npc_runtime_build','queued',
    jsonb_build_object(
      'surface','npc_runtime_build_v1',
      'npc_character_id',p_character_id::text
    ),
    '{}'::jsonb,1,0
  )
  returning id into v_job_id;

  insert into public.npc_runtime_builds(
    character_id,campaign_id,status,last_job_id,updated_at
  )
  values(
    p_character_id,v_character.campaign_id,'queued',v_job_id,now()
  )
  on conflict(character_id) do update set
    status='queued',
    last_job_id=excluded.last_job_id,
    updated_at=now();

  return v_job_id;
exception
  when unique_violation then
    select j.id into v_job_id
    from public.agent_jobs j
    where j.job_type='npc_runtime_build'
      and j.input->>'npc_character_id'=p_character_id::text
      and j.status in ('queued','running')
    order by j.created_at asc
    limit 1;
    return v_job_id;
end;
$$;

create or replace function public.reserve_ai_gm_npc_runtime_build_v1(
  p_character_id uuid
)
returns uuid
language sql
security definer
set search_path=''
as $$
  select private.reserve_ai_gm_npc_runtime_build_v1(p_character_id);
$$;

revoke all on function public.reserve_ai_gm_npc_runtime_build_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.reserve_ai_gm_npc_runtime_build_v1(uuid)
  to service_role;

create table if not exists private.ai_gm_npc_runtime_dispatch_config (
  singleton boolean primary key default true check(singleton=true),
  project_url text,
  dispatch_token text not null default encode(gen_random_bytes(32),'hex'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.ai_gm_npc_runtime_dispatch_config(singleton)
values(true)
on conflict(singleton) do nothing;

create or replace function public.verify_ai_gm_npc_runtime_dispatch_v1(
  p_token text
)
returns boolean
language sql
security definer
set search_path=''
stable
as $$
  select exists(
    select 1
    from private.ai_gm_npc_runtime_dispatch_config c
    where c.singleton=true
      and c.enabled=true
      and length(coalesce(p_token,'')) >= 32
      and c.dispatch_token=p_token
  );
$$;

revoke all on function public.verify_ai_gm_npc_runtime_dispatch_v1(text)
  from public,anon,authenticated;
grant execute on function public.verify_ai_gm_npc_runtime_dispatch_v1(text)
  to service_role;

create or replace function private.dispatch_ai_gm_npc_runtime_build_v1(
  p_job_id uuid
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_config private.ai_gm_npc_runtime_dispatch_config%rowtype;
  v_request_id bigint;
begin
  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='npc_runtime_build'
    and input->>'surface'='npc_runtime_build_v1'
    and status='queued';

  if v_job.id is null then return null; end if;

  select * into v_config
  from private.ai_gm_npc_runtime_dispatch_config
  where singleton=true;

  if v_config.singleton is null
     or v_config.enabled is not true
     or nullif(trim(v_config.project_url),'') is null
  then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_config.project_url,'/') || '/functions/v1/npc-runtime',
    body := jsonb_build_object(
      'jobId',p_job_id::text,
      'campaignId',v_job.campaign_id::text,
      'npcCharacterId',v_job.input->>'npc_character_id',
      'dispatchToken',v_config.dispatch_token
    ),
    headers := jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds := 90000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.dispatch_ai_gm_npc_runtime_build_v1(
  p_job_id uuid
)
returns bigint
language sql
security definer
set search_path=''
as $$
  select private.dispatch_ai_gm_npc_runtime_build_v1(p_job_id);
$$;

revoke all on function public.dispatch_ai_gm_npc_runtime_build_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.dispatch_ai_gm_npc_runtime_build_v1(uuid)
  to service_role;

create or replace function private.queue_ai_gm_npc_runtime_after_profile_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job_id uuid;
begin
  v_job_id := private.reserve_ai_gm_npc_runtime_build_v1(new.character_id);
  if v_job_id is not null then
    perform private.dispatch_ai_gm_npc_runtime_build_v1(v_job_id);
  end if;
  return new;
end;
$$;

drop trigger if exists queue_ai_gm_npc_runtime_after_profile_v1
  on public.npc_profiles;

create trigger queue_ai_gm_npc_runtime_after_profile_v1
after insert on public.npc_profiles
for each row execute function private.queue_ai_gm_npc_runtime_after_profile_v1();

create or replace function private.npc_runtime_dice_v1(p_dice text)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v text := replace(lower(trim(coalesce(p_dice,''))),' ','');
  m text[];
  v_count integer;
  v_sides integer;
  v_mod integer;
begin
  if v ~ '^[0-9]+$' then
    return jsonb_build_object('count',0,'sides',0,'modifier',v::integer);
  end if;

  m := regexp_match(v,'^([0-9]+)d([0-9]+)([+-][0-9]+)?$');
  if m is null then
    return jsonb_build_object('count',0,'sides',0,'modifier',0);
  end if;

  v_count := greatest(0,least(m[1]::integer,40));
  v_sides := greatest(0,least(m[2]::integer,1000));
  v_mod := coalesce(nullif(m[3],''),'0')::integer;
  return jsonb_build_object('count',v_count,'sides',v_sides,'modifier',v_mod);
end;
$$;

create or replace function private.npc_runtime_mechanic_v1(
  p_npc_id uuid,
  p_kind text,
  p_ordinal integer,
  p_action jsonb
)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v_id text;
  v_key text;
  v_label text;
  v_desc text;
  v_attack_bonus integer;
  v_damage jsonb;
  v_dice jsonb;
  v_dc jsonb;
  v_usage jsonb;
  v_resource_key text;
  v_resource_costs jsonb := '[]'::jsonb;
  v_runtime jsonb;
begin
  v_id := 'npc-runtime-'||p_kind||'-'||p_ordinal::text;
  v_key := 'npc_runtime_'||p_kind||'_'||p_ordinal::text;
  v_label := left(coalesce(nullif(trim(p_action->>'name'),''),'NPC ability'),160);
  v_desc := left(coalesce(p_action->>'desc',''),4000);
  v_attack_bonus := case
    when coalesce(p_action->>'attack_bonus','') ~ '^-?[0-9]+$'
      then greatest(-100,least((p_action->>'attack_bonus')::integer,100))
    else null
  end;
  v_damage := case
    when jsonb_typeof(p_action->'damage')='array'
      then coalesce((p_action->'damage')->0,'{}'::jsonb)
    else '{}'::jsonb
  end;
  v_dice := private.npc_runtime_dice_v1(v_damage->>'damage_dice');
  v_dc := case when jsonb_typeof(p_action->'dc')='object'
    then p_action->'dc' else '{}'::jsonb end;
  v_usage := case when jsonb_typeof(p_action->'usage')='object'
    then p_action->'usage' else '{}'::jsonb end;

  if jsonb_typeof(v_usage)='object' and v_usage <> '{}'::jsonb then
    v_resource_key := 'npc_runtime_'||p_kind||'_'||p_ordinal::text||'_uses';
    v_resource_costs := jsonb_build_array(
      jsonb_build_object('key',v_resource_key,'amount',1)
    );
  end if;

  v_runtime := jsonb_strip_nulls(jsonb_build_object(
    'kind', case
      when v_attack_bonus is not null then 'attack'
      when v_dc <> '{}'::jsonb then 'save_action'
      else 'action'
    end,
    'attackBonus',v_attack_bonus,
    'rollD20',v_attack_bonus is not null,
    'diceCount',coalesce((v_dice->>'count')::integer,0),
    'diceSides',coalesce((v_dice->>'sides')::integer,0),
    'diceModifier',coalesce((v_dice->>'modifier')::integer,0),
    'damageType',nullif(v_damage#>>'{damage_type,index}',''),
    'damageComponents',coalesce(p_action->'damage','[]'::jsonb),
    'saveDc',case when coalesce(v_dc->>'dc_value','')~'^[0-9]+$'
      then (v_dc->>'dc_value')::integer else null end,
    'saveAbility',nullif(v_dc#>>'{dc_type,index}',''),
    'description',v_desc,
    'usage',v_usage
  ));

  return jsonb_build_object(
    'id',v_id,
    'key',v_key,
    'type','action',
    'label',v_label,
    'economy',case when p_kind='reaction' then 'reaction' else 'action' end,
    'sourceKey','npc-runtime:'||p_npc_id::text,
    'resourceCosts',v_resource_costs,
    'npcRuntime',v_runtime
  );
end;
$$;

create or replace function public.apply_ai_gm_npc_runtime_build_v1(
  p_job_id uuid,
  p_bestiary_slug text,
  p_model_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_npc public.characters%rowtype;
  v_profile public.npc_profiles%rowtype;
  v_bestiary public.bestiary_catalog%rowtype;
  v_template_id uuid;
  v_slug text;
  v_mechanics jsonb := '[]'::jsonb;
  v_action jsonb;
  v_ord bigint;
  v_usage jsonb;
  v_resource_key text;
  v_resource_max integer;
  v_recharge jsonb;
  v_save_profs jsonb := '[]'::jsonb;
  v_skill_profs jsonb := '{}'::jsonb;
  v_prof jsonb;
  v_prof_index text;
  v_skill_key text;
  v_skill_ability text;
  v_skill_score integer;
  v_skill_base integer;
  v_prof_value integer;
  v_skill_rank integer;
  v_save_key text;
  v_speed integer := 30;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='npc_runtime_build'
    and input->>'surface'='npc_runtime_build_v1'
  for update;

  if v_job.id is null then raise exception 'npc_runtime_job_not_found'; end if;

  if v_job.status='completed' then
    return v_job.result;
  end if;

  if v_job.status not in ('queued','running') then
    raise exception 'npc_runtime_job_not_active';
  end if;

  select * into v_npc
  from public.characters
  where id=(v_job.input->>'npc_character_id')::uuid
    and campaign_id=v_job.campaign_id
    and character_type='npc'
    and publication_state='campaign'
    and life_state='alive';

  if v_npc.id is null then raise exception 'npc_runtime_character_not_found'; end if;

  select * into v_profile
  from public.npc_profiles
  where character_id=v_npc.id;

  select * into v_bestiary
  from public.bestiary_catalog
  where slug=lower(trim(p_bestiary_slug))
  limit 1;

  if v_bestiary.id is null then raise exception 'npc_runtime_bestiary_source_not_found'; end if;

  if coalesce(v_bestiary.speed->>'walk','') ~ '[0-9]+' then
    v_speed := (regexp_match(v_bestiary.speed->>'walk','([0-9]+)'))[1]::integer;
  end if;

  for v_prof in
    select value from jsonb_array_elements(coalesce(v_bestiary.proficiencies,'[]'::jsonb))
  loop
    v_prof_index := lower(coalesce(v_prof#>>'{proficiency,index}',''));

    if v_prof_index like 'saving-throw-%' then
      v_save_key := case replace(v_prof_index,'saving-throw-','')
        when 'str' then 'strength'
        when 'dex' then 'dexterity'
        when 'con' then 'constitution'
        when 'int' then 'intelligence'
        when 'wis' then 'wisdom'
        when 'cha' then 'charisma'
        else null
      end;

      if v_save_key is not null and not (v_save_profs ? v_save_key) then
        v_save_profs := v_save_profs || jsonb_build_array(v_save_key);
      end if;

    elsif v_prof_index like 'skill-%' then
      v_skill_key := replace(v_prof_index,'skill-','');
      v_skill_ability := case v_skill_key
        when 'acrobatics' then 'dexterity'
        when 'animal-handling' then 'wisdom'
        when 'arcana' then 'intelligence'
        when 'athletics' then 'strength'
        when 'deception' then 'charisma'
        when 'history' then 'intelligence'
        when 'insight' then 'wisdom'
        when 'intimidation' then 'charisma'
        when 'investigation' then 'intelligence'
        when 'medicine' then 'wisdom'
        when 'nature' then 'intelligence'
        when 'perception' then 'wisdom'
        when 'performance' then 'charisma'
        when 'persuasion' then 'charisma'
        when 'religion' then 'intelligence'
        when 'sleight-of-hand' then 'dexterity'
        when 'stealth' then 'dexterity'
        when 'survival' then 'wisdom'
        else null
      end;

      -- The rest of the runtime uses snake_case D&D skill keys.
      v_skill_key := replace(v_skill_key,'-','_');

      v_skill_score := case v_skill_ability
        when 'strength' then coalesce((v_bestiary.abilities->>'strength')::integer,10)
        when 'dexterity' then coalesce((v_bestiary.abilities->>'dexterity')::integer,10)
        when 'constitution' then coalesce((v_bestiary.abilities->>'constitution')::integer,10)
        when 'intelligence' then coalesce((v_bestiary.abilities->>'intelligence')::integer,10)
        when 'wisdom' then coalesce((v_bestiary.abilities->>'wisdom')::integer,10)
        when 'charisma' then coalesce((v_bestiary.abilities->>'charisma')::integer,10)
        else 10
      end;

      v_skill_base := floor((v_skill_score-10)::numeric/2)::integer;
      v_prof_value := case
        when coalesce(v_prof->>'value','') ~ '^-?[0-9]+

  update public.character_sheets cs
  set
    strength=greatest(1,least(coalesce((v_bestiary.abilities->>'strength')::integer,10),40)),
    dexterity=greatest(1,least(coalesce((v_bestiary.abilities->>'dexterity')::integer,10),40)),
    constitution=greatest(1,least(coalesce((v_bestiary.abilities->>'constitution')::integer,10),40)),
    intelligence=greatest(1,least(coalesce((v_bestiary.abilities->>'intelligence')::integer,10),40)),
    wisdom=greatest(1,least(coalesce((v_bestiary.abilities->>'wisdom')::integer,10),40)),
    charisma=greatest(1,least(coalesce((v_bestiary.abilities->>'charisma')::integer,10),40)),
    armor_class=greatest(0,least(coalesce(v_bestiary.armor_class,10),50)),
    max_hp=greatest(1,least(coalesce(v_bestiary.hit_points,1),100000)),
    current_hp=least(
      greatest(0,coalesce(cs.current_hp,coalesce(v_bestiary.hit_points,1))),
      greatest(1,coalesce(v_bestiary.hit_points,1))
    ),
    hit_dice=left(coalesce(v_bestiary.hit_dice,''),120),
    proficiency_bonus=greatest(0,least(coalesce(v_bestiary.proficiency_bonus,2),20)),
    speed=greatest(0,least(v_speed,1000)),
    passive_perception=greatest(
      0,least(coalesce((v_bestiary.senses->>'passive_perception')::integer,10),60)
    ),
    saving_throw_proficiencies=v_save_profs,
    skill_proficiencies=v_skill_profs,
    senses=left(coalesce(v_bestiary.senses::text,''),2000),
    languages=left(coalesce(v_bestiary.languages,''),2000),
    runtime_facts=coalesce(cs.runtime_facts,'{}'::jsonb) || jsonb_build_object(
      'npcRuntimeStage',6,
      'npcRuntimeBestiarySlug',v_bestiary.slug,
      'npcRuntimeBuiltAt',now()
    ),
    updated_at=now()
  where cs.character_id=v_npc.id;

  for v_action,v_ord in
    select value,ordinality
    from jsonb_array_elements(coalesce(v_bestiary.actions,'[]'::jsonb))
      with ordinality
  loop
    v_mechanics := v_mechanics || jsonb_build_array(
      private.npc_runtime_mechanic_v1(v_npc.id,'action',v_ord::integer,v_action)
    );

    v_usage := case when jsonb_typeof(v_action->'usage')='object'
      then v_action->'usage' else '{}'::jsonb end;
    if v_usage <> '{}'::jsonb then
      v_resource_key := 'npc_runtime_action_'||v_ord::text||'_uses';
      if lower(coalesce(v_usage->>'type',''))='per day' then
        v_resource_max := greatest(1,least(coalesce((v_usage->>'times')::integer,1),100));
        v_recharge := '{"triggers":["long_rest"],"restore":"full"}'::jsonb;
      else
        v_resource_max := 1;
        v_recharge := '{"triggers":["special"],"restore":"full"}'::jsonb;
      end if;

      insert into public.character_resource_states(
        character_id,state_key,current,max_snapshot,label,recharge,updated_by
      )
      values(
        v_npc.id,v_resource_key,v_resource_max,v_resource_max,
        left(coalesce(v_action->>'name','NPC ability'),160),
        v_recharge,v_job.requested_by
      )
      on conflict(character_id,state_key) do update set
        current=least(public.character_resource_states.current,excluded.max_snapshot),
        max_snapshot=excluded.max_snapshot,
        label=excluded.label,
        recharge=excluded.recharge,
        updated_by=excluded.updated_by,
        updated_at=now();
    end if;
  end loop;

  for v_action,v_ord in
    select value,ordinality
    from jsonb_array_elements(coalesce(v_bestiary.reactions,'[]'::jsonb))
      with ordinality
  loop
    v_mechanics := v_mechanics || jsonb_build_array(
      private.npc_runtime_mechanic_v1(v_npc.id,'reaction',v_ord::integer,v_action)
    );
  end loop;

  for v_action,v_ord in
    select value,ordinality
    from jsonb_array_elements(coalesce(v_bestiary.special_abilities,'[]'::jsonb))
      with ordinality
    where jsonb_typeof(value->'usage')='object'
  loop
    v_mechanics := v_mechanics || jsonb_build_array(
      private.npc_runtime_mechanic_v1(v_npc.id,'special',v_ord::integer,v_action)
    );

    v_usage := v_action->'usage';
    v_resource_key := 'npc_runtime_special_'||v_ord::text||'_uses';
    if lower(coalesce(v_usage->>'type',''))='per day' then
      v_resource_max := greatest(1,least(coalesce((v_usage->>'times')::integer,1),100));
      v_recharge := '{"triggers":["long_rest"],"restore":"full"}'::jsonb;
    else
      v_resource_max := 1;
      v_recharge := '{"triggers":["special"],"restore":"full"}'::jsonb;
    end if;

    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,updated_by
    )
    values(
      v_npc.id,v_resource_key,v_resource_max,v_resource_max,
      left(coalesce(v_action->>'name','NPC ability'),160),
      v_recharge,v_job.requested_by
    )
    on conflict(character_id,state_key) do update set
      current=least(public.character_resource_states.current,excluded.max_snapshot),
      max_snapshot=excluded.max_snapshot,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=excluded.updated_by,
      updated_at=now();
  end loop;

  v_slug := 'npc-runtime-'||replace(v_npc.id::text,'-','');

  select id into v_template_id
  from public.rule_templates
  where campaign_id=v_npc.campaign_id
    and kind='class'
    and slug=v_slug
  for update;

  if v_template_id is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      created_by,catalog_key,catalog_revision,source_kind,source_label,is_builtin,
      mechanical_summary,author_description,author_comment,rules_meta
    )
    values(
      v_npc.campaign_id,'class',v_slug,
      'NPC Runtime · '||left(v_npc.name,120),
      'Canonical Stage 6 NPC runtime generated from bestiary source.',
      1,v_mechanics,'[]'::jsonb,true,v_job.requested_by,
      'npc-runtime:'||v_npc.id::text,'stage6','custom',
      'AI GM NPC Runtime',false,
      'Server-authoritative NPC mechanics.','', '',
      jsonb_build_object(
        'npc_runtime_stage',6,
        'npc_character_id',v_npc.id,
        'bestiary_slug',v_bestiary.slug
      )
    )
    returning id into v_template_id;
  else
    update public.rule_templates
    set
      name='NPC Runtime · '||left(v_npc.name,120),
      mechanics=v_mechanics,
      version=version+1,
      is_active=true,
      catalog_revision='stage6',
      rules_meta=jsonb_build_object(
        'npc_runtime_stage',6,
        'npc_character_id',v_npc.id,
        'bestiary_slug',v_bestiary.slug
      ),
      updated_at=now()
    where id=v_template_id;
  end if;

  insert into public.character_template_assignments(
    character_id,template_id,template_level,selected_choices,assigned_by
  )
  values(
    v_npc.id,v_template_id,greatest(1,v_npc.level),'{}'::jsonb,v_job.requested_by
  )
  on conflict(character_id,template_id) do update set
    template_level=excluded.template_level,
    selected_choices='{}'::jsonb,
    assigned_by=excluded.assigned_by,
    updated_at=now();

  update public.npc_runtime_builds
  set
    status='ready',
    source_bestiary_slug=v_bestiary.slug,
    template_id=v_template_id,
    model_id=p_model_id,
    build_revision=build_revision+1,
    last_job_id=p_job_id,
    build_payload=jsonb_build_object(
      'bestiary_slug',v_bestiary.slug,
      'action_count',jsonb_array_length(coalesce(v_bestiary.actions,'[]'::jsonb)),
      'reaction_count',jsonb_array_length(coalesce(v_bestiary.reactions,'[]'::jsonb)),
      'special_abilities',coalesce(v_bestiary.special_abilities,'[]'::jsonb)
    ),
    generated_at=now(),
    updated_at=now()
  where character_id=v_npc.id;

  update public.agent_jobs
  set
    status='completed',
    completed_outputs=1,
    result=jsonb_build_object(
      'surface','npc_runtime_build_v1',
      'npc_character_id',v_npc.id,
      'template_id',v_template_id,
      'bestiary_slug',v_bestiary.slug,
      'model_id',p_model_id,
      'runtime_stage',6
    ),
    completed_at=now(),
    updated_at=now(),
    error_code=null,
    error_message=null
  where id=p_job_id;

  return jsonb_build_object(
    'npc_character_id',v_npc.id,
    'template_id',v_template_id,
    'bestiary_slug',v_bestiary.slug,
    'runtime_stage',6
  );
end;
$$;

revoke all on function public.apply_ai_gm_npc_runtime_build_v1(uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.apply_ai_gm_npc_runtime_build_v1(uuid,text,uuid)
  to service_role;

create or replace function public.read_ai_gm_npc_runtime_v1(
  p_campaign_id uuid,
  p_npc_ids uuid[]
)
returns jsonb
language sql
security definer
set search_path=''
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'character_id',b.character_id,
    'status',b.status,
    'bestiary_slug',b.source_bestiary_slug,
    'template_id',b.template_id,
    'build_revision',b.build_revision,
    'actions',
      coalesce((
        select jsonb_agg(m.value order by m.ordinality)
        from public.rule_templates rt
        cross join lateral jsonb_array_elements(coalesce(rt.mechanics,'[]'::jsonb))
          with ordinality m(value,ordinality)
        where rt.id=b.template_id
          and m.value->>'type'='action'
      ),'[]'::jsonb),
    'resources',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'state_key',s.state_key,
          'current',s.current,
          'max',s.max_snapshot,
          'label',s.label,
          'recharge',s.recharge
        ) order by s.state_key)
        from public.character_resource_states s
        where s.character_id=b.character_id
          and s.state_key like 'npc_runtime_%'
      ),'[]'::jsonb),
    'special_abilities',coalesce(b.build_payload->'special_abilities','[]'::jsonb)
  ) order by b.character_id),'[]'::jsonb)
  from public.npc_runtime_builds b
  where b.campaign_id=p_campaign_id
    and b.character_id=any(coalesce(p_npc_ids,array[]::uuid[]))
    and b.status='ready';
$$;

revoke all on function public.read_ai_gm_npc_runtime_v1(uuid,uuid[])
  from public,anon,authenticated;
grant execute on function public.read_ai_gm_npc_runtime_v1(uuid,uuid[])
  to service_role;

create or replace function private.npc_runtime_manager_claims_v1(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub',p_user_id::text,
      'role','authenticated',
      'is_anonymous',false
    )::text,
    true
  );
end;
$$;

create or replace function public.execute_ai_gm_npc_action_v1(
  p_job_id uuid,
  p_npc_character_id uuid,
  p_mechanic_id text,
  p_option_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_mechanic jsonb;
  v_runtime jsonb;
  v_manager_user_id uuid;
  v_source_character_id uuid;
  v_source_location_id uuid;
  v_npc_location_id uuid;
  v_message_id bigint;
  v_command_id uuid := p_job_id;
  v_existing public.engine_command_receipts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null or v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  v_manager_user_id := nullif(v_job.input->>'manager_user_id','')::uuid;
  v_source_character_id := nullif(v_job.input->>'source_character_id','')::uuid;

  if not exists(
    select 1 from public.characters c
    where c.id=p_npc_character_id
      and c.campaign_id=v_job.campaign_id
      and c.character_type='npc'
      and c.publication_state='campaign'
      and c.life_state='alive'
  ) then
    raise exception 'npc_action_actor_invalid';
  end if;

  select ws.location_id into v_source_location_id
  from public.character_world_state ws
  where ws.character_id=v_source_character_id;

  select ws.location_id into v_npc_location_id
  from public.character_world_state ws
  where ws.character_id=p_npc_character_id;

  if v_source_location_id is null
     or v_npc_location_id is null
     or v_source_location_id <> v_npc_location_id
  then
    raise exception 'npc_action_requires_same_location';
  end if;

  v_mechanic := private.character_template_selected_action_definition_v1(
    p_npc_character_id,trim(p_mechanic_id)
  );

  if v_mechanic is null
     or jsonb_typeof(v_mechanic->'npcRuntime') <> 'object'
  then
    raise exception 'npc_runtime_mechanic_not_found';
  end if;

  v_runtime := v_mechanic->'npcRuntime';

  select * into v_existing
  from public.engine_command_receipts
  where command_id=v_command_id;

  if v_existing.command_id is not null then
    if v_existing.command_kind not in ('template.roll','template.action')
       or v_existing.aggregate_id <> p_npc_character_id
    then
      raise exception 'npc_action_command_conflict';
    end if;
    v_message_id := (v_existing.result->>'messageId')::bigint;
  else
    perform private.npc_runtime_manager_claims_v1(v_manager_user_id);

    if coalesce((v_runtime->>'rollD20')::boolean,false)
       or coalesce((v_runtime->>'diceCount')::integer,0) > 0
    then
      v_message_id := public.send_chat_template_roll_v2(
        (v_job.input->>'room_id')::uuid,
        p_npc_character_id,
        trim(p_mechanic_id),
        nullif(trim(coalesce(p_option_key,'')),''),
        v_mechanic->>'label',
        'npc_action',
        coalesce((v_runtime->>'attackBonus')::integer,0),
        coalesce((v_runtime->>'rollD20')::boolean,false),
        coalesce((v_runtime->>'diceCount')::integer,0),
        coalesce((v_runtime->>'diceSides')::integer,0),
        coalesce((v_runtime->>'diceModifier')::integer,0),
        v_command_id
      );
    else
      v_message_id := public.send_chat_template_action_v2(
        (v_job.input->>'room_id')::uuid,
        p_npc_character_id,
        trim(p_mechanic_id),
        nullif(trim(coalesce(p_option_key,'')),''),
        v_mechanic->>'label',
        jsonb_build_object(
          'detail',coalesce(v_runtime->>'description',''),
          'npcRuntime',v_runtime,
          'gmJobId',p_job_id
        ),
        v_command_id
      );
    end if;
  end if;

  update public.chat_messages
  set event_payload=coalesce(event_payload,'{}'::jsonb) || jsonb_build_object(
    'npcRuntime',v_runtime,
    'gmJobId',p_job_id,
    'npcCharacterId',p_npc_character_id
  )
  where id=v_message_id;

  return jsonb_build_object(
    'message_id',v_message_id,
    'npc_character_id',p_npc_character_id,
    'mechanic_id',trim(p_mechanic_id),
    'label',v_mechanic->>'label',
    'runtime',v_runtime,
    'event_payload',(select event_payload from public.chat_messages where id=v_message_id)
  );
end;
$$;

revoke all on function public.execute_ai_gm_npc_action_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.execute_ai_gm_npc_action_v1(uuid,uuid,text,text)
  to service_role;

create or replace function private.npc_roll_ability_v1(p_skill text)
returns text
language sql immutable
as $$
  select case lower(trim(coalesce(p_skill,'')))
    when 'acrobatics' then 'dexterity'
    when 'animal_handling' then 'wisdom'
    when 'arcana' then 'intelligence'
    when 'athletics' then 'strength'
    when 'deception' then 'charisma'
    when 'history' then 'intelligence'
    when 'insight' then 'wisdom'
    when 'intimidation' then 'charisma'
    when 'investigation' then 'intelligence'
    when 'medicine' then 'wisdom'
    when 'nature' then 'intelligence'
    when 'perception' then 'wisdom'
    when 'performance' then 'charisma'
    when 'persuasion' then 'charisma'
    when 'religion' then 'intelligence'
    when 'sleight_of_hand' then 'dexterity'
    when 'stealth' then 'dexterity'
    when 'survival' then 'wisdom'
    else null
  end;
$$;

create or replace function public.execute_ai_gm_npc_roll_v1(
  p_job_id uuid,
  p_npc_character_id uuid,
  p_request_type text,
  p_ability_key text,
  p_skill_key text,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_sheet public.character_sheets%rowtype;
  v_type text := lower(trim(coalesce(p_request_type,'')));
  v_ability text := lower(trim(coalesce(p_ability_key,'')));
  v_skill text := nullif(lower(trim(coalesce(p_skill_key,''))),'');
  v_score integer;
  v_modifier integer;
  v_message_id bigint;
  v_manager_user_id uuid;
  v_receipt public.engine_command_receipts%rowtype;
  v_payload jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null or v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  if v_type not in ('ability','save','skill') then
    raise exception 'unsupported_npc_roll_type';
  end if;

  if v_type='skill' then
    v_ability := private.npc_roll_ability_v1(v_skill);
  end if;

  if v_ability not in (
    'strength','dexterity','constitution','intelligence','wisdom','charisma'
  ) then
    raise exception 'unsupported_npc_roll_ability';
  end if;

  select * into v_sheet
  from public.character_sheets
  where character_id=p_npc_character_id;

  if v_sheet.character_id is null then raise exception 'npc_sheet_missing'; end if;

  v_score := case v_ability
    when 'strength' then v_sheet.strength
    when 'dexterity' then v_sheet.dexterity
    when 'constitution' then v_sheet.constitution
    when 'intelligence' then v_sheet.intelligence
    when 'wisdom' then v_sheet.wisdom
    else v_sheet.charisma
  end;

  v_modifier := floor((v_score-10)::numeric/2)::integer;

  if v_type='save'
     and coalesce(v_sheet.saving_throw_proficiencies,'[]'::jsonb) ? v_ability
  then
    v_modifier := v_modifier + v_sheet.proficiency_bonus;
  elsif v_type='skill'
     and coalesce(v_sheet.skill_proficiencies,'{}'::jsonb) ? v_skill
  then
    v_modifier := v_modifier + v_sheet.proficiency_bonus;
  end if;

  select * into v_receipt
  from public.engine_command_receipts
  where command_id=p_job_id;

  if v_receipt.command_id is not null then
    if v_receipt.command_kind <> 'npc.roll.v1'
       or v_receipt.aggregate_id <> p_npc_character_id
    then
      raise exception 'npc_roll_command_conflict';
    end if;
    v_message_id := (v_receipt.result->>'messageId')::bigint;
  else
    v_manager_user_id := nullif(v_job.input->>'manager_user_id','')::uuid;
    perform private.npc_runtime_manager_claims_v1(v_manager_user_id);

    v_message_id := public.send_chat_roll_v4(
      (v_job.input->>'room_id')::uuid,
      p_npc_character_id,
      left(coalesce(nullif(trim(p_label),''),'NPC roll'),160),
      'npc_'||v_type,
      v_modifier,
      true,0,0,0,1,'[]'::jsonb
    );

    insert into public.engine_command_receipts(
      command_id,campaign_id,actor_character_id,engine,command_kind,
      aggregate_id,result,created_by
    )
    values(
      p_job_id,v_job.campaign_id,p_npc_character_id,'gena','npc.roll.v1',
      p_npc_character_id,
      jsonb_build_object(
        'messageId',v_message_id,
        'requestType',v_type,
        'abilityKey',v_ability,
        'skillKey',v_skill,
        'modifier',v_modifier
      ),
      v_manager_user_id
    );
  end if;

  update public.chat_messages
  set event_payload=coalesce(event_payload,'{}'::jsonb) || jsonb_build_object(
    'gmJobId',p_job_id,
    'npcCharacterId',p_npc_character_id,
    'npcRollType',v_type,
    'abilityKey',v_ability,
    'skillKey',v_skill
  )
  where id=v_message_id
  returning event_payload into v_payload;

  return jsonb_build_object(
    'message_id',v_message_id,
    'npc_character_id',p_npc_character_id,
    'request_type',v_type,
    'ability_key',v_ability,
    'skill_key',v_skill,
    'modifier',v_modifier,
    'event_payload',v_payload
  );
end;
$$;

revoke all on function public.execute_ai_gm_npc_roll_v1(
  uuid,uuid,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.execute_ai_gm_npc_roll_v1(
  uuid,uuid,text,text,text,text
) to service_role;

comment on table public.npc_runtime_builds is
  'Stage 6 canonical NPC runtime build state. A fixed worker selects a bestiary basis; server materializes validated stats/actions into Character Engine templates.';

comment on function public.execute_ai_gm_npc_action_v1(uuid,uuid,text,text) is
  'Stage 6 server-authoritative NPC action executor. AI supplies only canonical NPC/mechanic ids; numbers and costs come from stored template mechanics.';

          then (v_prof->>'value')::integer
        else v_skill_base
      end;

      v_skill_rank := case
        when coalesce(v_bestiary.proficiency_bonus,0) <= 0 then 0
        else greatest(
          0,
          least(
            2,
            round(
              (v_prof_value-v_skill_base)::numeric /
              v_bestiary.proficiency_bonus
            )::integer
          )
        )
      end;

      if v_skill_ability is not null and v_skill_rank > 0 then
        v_skill_profs := v_skill_profs || jsonb_build_object(
          v_skill_key,
          v_skill_rank
        );
      end if;
    end if;
  end loop;

  update public.character_sheets cs
  set
    strength=greatest(1,least(coalesce((v_bestiary.abilities->>'strength')::integer,10),40)),
    dexterity=greatest(1,least(coalesce((v_bestiary.abilities->>'dexterity')::integer,10),40)),
    constitution=greatest(1,least(coalesce((v_bestiary.abilities->>'constitution')::integer,10),40)),
    intelligence=greatest(1,least(coalesce((v_bestiary.abilities->>'intelligence')::integer,10),40)),
    wisdom=greatest(1,least(coalesce((v_bestiary.abilities->>'wisdom')::integer,10),40)),
    charisma=greatest(1,least(coalesce((v_bestiary.abilities->>'charisma')::integer,10),40)),
    armor_class=greatest(0,least(coalesce(v_bestiary.armor_class,10),50)),
    max_hp=greatest(1,least(coalesce(v_bestiary.hit_points,1),100000)),
    current_hp=least(
      greatest(0,coalesce(cs.current_hp,coalesce(v_bestiary.hit_points,1))),
      greatest(1,coalesce(v_bestiary.hit_points,1))
    ),
    hit_dice=left(coalesce(v_bestiary.hit_dice,''),120),
    proficiency_bonus=greatest(0,least(coalesce(v_bestiary.proficiency_bonus,2),20)),
    speed=greatest(0,least(v_speed,1000)),
    passive_perception=greatest(
      0,least(coalesce((v_bestiary.senses->>'passive_perception')::integer,10),60)
    ),
    saving_throw_proficiencies=v_save_profs,
    skill_proficiencies=v_skill_profs,
    senses=left(coalesce(v_bestiary.senses::text,''),2000),
    languages=left(coalesce(v_bestiary.languages,''),2000),
    runtime_facts=coalesce(cs.runtime_facts,'{}'::jsonb) || jsonb_build_object(
      'npcRuntimeStage',6,
      'npcRuntimeBestiarySlug',v_bestiary.slug,
      'npcRuntimeBuiltAt',now()
    ),
    updated_at=now()
  where cs.character_id=v_npc.id;

  for v_action,v_ord in
    select value,ordinality
    from jsonb_array_elements(coalesce(v_bestiary.actions,'[]'::jsonb))
      with ordinality
  loop
    v_mechanics := v_mechanics || jsonb_build_array(
      private.npc_runtime_mechanic_v1(v_npc.id,'action',v_ord::integer,v_action)
    );

    v_usage := case when jsonb_typeof(v_action->'usage')='object'
      then v_action->'usage' else '{}'::jsonb end;
    if v_usage <> '{}'::jsonb then
      v_resource_key := 'npc_runtime_action_'||v_ord::text||'_uses';
      if lower(coalesce(v_usage->>'type',''))='per day' then
        v_resource_max := greatest(1,least(coalesce((v_usage->>'times')::integer,1),100));
        v_recharge := '{"triggers":["long_rest"],"restore":"full"}'::jsonb;
      else
        v_resource_max := 1;
        v_recharge := '{"triggers":["special"],"restore":"full"}'::jsonb;
      end if;

      insert into public.character_resource_states(
        character_id,state_key,current,max_snapshot,label,recharge,updated_by
      )
      values(
        v_npc.id,v_resource_key,v_resource_max,v_resource_max,
        left(coalesce(v_action->>'name','NPC ability'),160),
        v_recharge,v_job.requested_by
      )
      on conflict(character_id,state_key) do update set
        current=least(public.character_resource_states.current,excluded.max_snapshot),
        max_snapshot=excluded.max_snapshot,
        label=excluded.label,
        recharge=excluded.recharge,
        updated_by=excluded.updated_by,
        updated_at=now();
    end if;
  end loop;

  for v_action,v_ord in
    select value,ordinality
    from jsonb_array_elements(coalesce(v_bestiary.reactions,'[]'::jsonb))
      with ordinality
  loop
    v_mechanics := v_mechanics || jsonb_build_array(
      private.npc_runtime_mechanic_v1(v_npc.id,'reaction',v_ord::integer,v_action)
    );
  end loop;

  for v_action,v_ord in
    select value,ordinality
    from jsonb_array_elements(coalesce(v_bestiary.special_abilities,'[]'::jsonb))
      with ordinality
    where jsonb_typeof(value->'usage')='object'
  loop
    v_mechanics := v_mechanics || jsonb_build_array(
      private.npc_runtime_mechanic_v1(v_npc.id,'special',v_ord::integer,v_action)
    );

    v_usage := v_action->'usage';
    v_resource_key := 'npc_runtime_special_'||v_ord::text||'_uses';
    if lower(coalesce(v_usage->>'type',''))='per day' then
      v_resource_max := greatest(1,least(coalesce((v_usage->>'times')::integer,1),100));
      v_recharge := '{"triggers":["long_rest"],"restore":"full"}'::jsonb;
    else
      v_resource_max := 1;
      v_recharge := '{"triggers":["special"],"restore":"full"}'::jsonb;
    end if;

    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,updated_by
    )
    values(
      v_npc.id,v_resource_key,v_resource_max,v_resource_max,
      left(coalesce(v_action->>'name','NPC ability'),160),
      v_recharge,v_job.requested_by
    )
    on conflict(character_id,state_key) do update set
      current=least(public.character_resource_states.current,excluded.max_snapshot),
      max_snapshot=excluded.max_snapshot,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=excluded.updated_by,
      updated_at=now();
  end loop;

  v_slug := 'npc-runtime-'||replace(v_npc.id::text,'-','');

  select id into v_template_id
  from public.rule_templates
  where campaign_id=v_npc.campaign_id
    and kind='class'
    and slug=v_slug
  for update;

  if v_template_id is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      created_by,catalog_key,catalog_revision,source_kind,source_label,is_builtin,
      mechanical_summary,author_description,author_comment,rules_meta
    )
    values(
      v_npc.campaign_id,'class',v_slug,
      'NPC Runtime · '||left(v_npc.name,120),
      'Canonical Stage 6 NPC runtime generated from bestiary source.',
      1,v_mechanics,'[]'::jsonb,true,v_job.requested_by,
      'npc-runtime:'||v_npc.id::text,'stage6','custom',
      'AI GM NPC Runtime',false,
      'Server-authoritative NPC mechanics.','', '',
      jsonb_build_object(
        'npc_runtime_stage',6,
        'npc_character_id',v_npc.id,
        'bestiary_slug',v_bestiary.slug
      )
    )
    returning id into v_template_id;
  else
    update public.rule_templates
    set
      name='NPC Runtime · '||left(v_npc.name,120),
      mechanics=v_mechanics,
      version=version+1,
      is_active=true,
      catalog_revision='stage6',
      rules_meta=jsonb_build_object(
        'npc_runtime_stage',6,
        'npc_character_id',v_npc.id,
        'bestiary_slug',v_bestiary.slug
      ),
      updated_at=now()
    where id=v_template_id;
  end if;

  insert into public.character_template_assignments(
    character_id,template_id,template_level,selected_choices,assigned_by
  )
  values(
    v_npc.id,v_template_id,greatest(1,v_npc.level),'{}'::jsonb,v_job.requested_by
  )
  on conflict(character_id,template_id) do update set
    template_level=excluded.template_level,
    selected_choices='{}'::jsonb,
    assigned_by=excluded.assigned_by,
    updated_at=now();

  update public.npc_runtime_builds
  set
    status='ready',
    source_bestiary_slug=v_bestiary.slug,
    template_id=v_template_id,
    model_id=p_model_id,
    build_revision=build_revision+1,
    last_job_id=p_job_id,
    build_payload=jsonb_build_object(
      'bestiary_slug',v_bestiary.slug,
      'action_count',jsonb_array_length(coalesce(v_bestiary.actions,'[]'::jsonb)),
      'reaction_count',jsonb_array_length(coalesce(v_bestiary.reactions,'[]'::jsonb)),
      'special_abilities',coalesce(v_bestiary.special_abilities,'[]'::jsonb)
    ),
    generated_at=now(),
    updated_at=now()
  where character_id=v_npc.id;

  update public.agent_jobs
  set
    status='completed',
    completed_outputs=1,
    result=jsonb_build_object(
      'surface','npc_runtime_build_v1',
      'npc_character_id',v_npc.id,
      'template_id',v_template_id,
      'bestiary_slug',v_bestiary.slug,
      'model_id',p_model_id,
      'runtime_stage',6
    ),
    completed_at=now(),
    updated_at=now(),
    error_code=null,
    error_message=null
  where id=p_job_id;

  return jsonb_build_object(
    'npc_character_id',v_npc.id,
    'template_id',v_template_id,
    'bestiary_slug',v_bestiary.slug,
    'runtime_stage',6
  );
end;
$$;

revoke all on function public.apply_ai_gm_npc_runtime_build_v1(uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.apply_ai_gm_npc_runtime_build_v1(uuid,text,uuid)
  to service_role;

create or replace function public.read_ai_gm_npc_runtime_v1(
  p_campaign_id uuid,
  p_npc_ids uuid[]
)
returns jsonb
language sql
security definer
set search_path=''
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'character_id',b.character_id,
    'status',b.status,
    'bestiary_slug',b.source_bestiary_slug,
    'template_id',b.template_id,
    'build_revision',b.build_revision,
    'actions',
      coalesce((
        select jsonb_agg(m.value order by m.ordinality)
        from public.rule_templates rt
        cross join lateral jsonb_array_elements(coalesce(rt.mechanics,'[]'::jsonb))
          with ordinality m(value,ordinality)
        where rt.id=b.template_id
          and m.value->>'type'='action'
      ),'[]'::jsonb),
    'resources',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'state_key',s.state_key,
          'current',s.current,
          'max',s.max_snapshot,
          'label',s.label,
          'recharge',s.recharge
        ) order by s.state_key)
        from public.character_resource_states s
        where s.character_id=b.character_id
          and s.state_key like 'npc_runtime_%'
      ),'[]'::jsonb),
    'special_abilities',coalesce(b.build_payload->'special_abilities','[]'::jsonb)
  ) order by b.character_id),'[]'::jsonb)
  from public.npc_runtime_builds b
  where b.campaign_id=p_campaign_id
    and b.character_id=any(coalesce(p_npc_ids,array[]::uuid[]))
    and b.status='ready';
$$;

revoke all on function public.read_ai_gm_npc_runtime_v1(uuid,uuid[])
  from public,anon,authenticated;
grant execute on function public.read_ai_gm_npc_runtime_v1(uuid,uuid[])
  to service_role;

create or replace function private.npc_runtime_manager_claims_v1(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub',p_user_id::text,
      'role','authenticated',
      'is_anonymous',false
    )::text,
    true
  );
end;
$$;

create or replace function public.execute_ai_gm_npc_action_v1(
  p_job_id uuid,
  p_npc_character_id uuid,
  p_mechanic_id text,
  p_option_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_mechanic jsonb;
  v_runtime jsonb;
  v_manager_user_id uuid;
  v_source_character_id uuid;
  v_source_location_id uuid;
  v_npc_location_id uuid;
  v_message_id bigint;
  v_command_id uuid := p_job_id;
  v_existing public.engine_command_receipts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null or v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  v_manager_user_id := nullif(v_job.input->>'manager_user_id','')::uuid;
  v_source_character_id := nullif(v_job.input->>'source_character_id','')::uuid;

  if not exists(
    select 1 from public.characters c
    where c.id=p_npc_character_id
      and c.campaign_id=v_job.campaign_id
      and c.character_type='npc'
      and c.publication_state='campaign'
      and c.life_state='alive'
  ) then
    raise exception 'npc_action_actor_invalid';
  end if;

  select ws.location_id into v_source_location_id
  from public.character_world_state ws
  where ws.character_id=v_source_character_id;

  select ws.location_id into v_npc_location_id
  from public.character_world_state ws
  where ws.character_id=p_npc_character_id;

  if v_source_location_id is null
     or v_npc_location_id is null
     or v_source_location_id <> v_npc_location_id
  then
    raise exception 'npc_action_requires_same_location';
  end if;

  v_mechanic := private.character_template_selected_action_definition_v1(
    p_npc_character_id,trim(p_mechanic_id)
  );

  if v_mechanic is null
     or jsonb_typeof(v_mechanic->'npcRuntime') <> 'object'
  then
    raise exception 'npc_runtime_mechanic_not_found';
  end if;

  v_runtime := v_mechanic->'npcRuntime';

  select * into v_existing
  from public.engine_command_receipts
  where command_id=v_command_id;

  if v_existing.command_id is not null then
    if v_existing.command_kind not in ('template.roll','template.action')
       or v_existing.aggregate_id <> p_npc_character_id
    then
      raise exception 'npc_action_command_conflict';
    end if;
    v_message_id := (v_existing.result->>'messageId')::bigint;
  else
    perform private.npc_runtime_manager_claims_v1(v_manager_user_id);

    if coalesce((v_runtime->>'rollD20')::boolean,false)
       or coalesce((v_runtime->>'diceCount')::integer,0) > 0
    then
      v_message_id := public.send_chat_template_roll_v2(
        (v_job.input->>'room_id')::uuid,
        p_npc_character_id,
        trim(p_mechanic_id),
        nullif(trim(coalesce(p_option_key,'')),''),
        v_mechanic->>'label',
        'npc_action',
        coalesce((v_runtime->>'attackBonus')::integer,0),
        coalesce((v_runtime->>'rollD20')::boolean,false),
        coalesce((v_runtime->>'diceCount')::integer,0),
        coalesce((v_runtime->>'diceSides')::integer,0),
        coalesce((v_runtime->>'diceModifier')::integer,0),
        v_command_id
      );
    else
      v_message_id := public.send_chat_template_action_v2(
        (v_job.input->>'room_id')::uuid,
        p_npc_character_id,
        trim(p_mechanic_id),
        nullif(trim(coalesce(p_option_key,'')),''),
        v_mechanic->>'label',
        jsonb_build_object(
          'detail',coalesce(v_runtime->>'description',''),
          'npcRuntime',v_runtime,
          'gmJobId',p_job_id
        ),
        v_command_id
      );
    end if;
  end if;

  update public.chat_messages
  set event_payload=coalesce(event_payload,'{}'::jsonb) || jsonb_build_object(
    'npcRuntime',v_runtime,
    'gmJobId',p_job_id,
    'npcCharacterId',p_npc_character_id
  )
  where id=v_message_id;

  return jsonb_build_object(
    'message_id',v_message_id,
    'npc_character_id',p_npc_character_id,
    'mechanic_id',trim(p_mechanic_id),
    'label',v_mechanic->>'label',
    'runtime',v_runtime,
    'event_payload',(select event_payload from public.chat_messages where id=v_message_id)
  );
end;
$$;

revoke all on function public.execute_ai_gm_npc_action_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.execute_ai_gm_npc_action_v1(uuid,uuid,text,text)
  to service_role;

create or replace function private.npc_roll_ability_v1(p_skill text)
returns text
language sql immutable
as $$
  select case lower(trim(coalesce(p_skill,'')))
    when 'acrobatics' then 'dexterity'
    when 'animal_handling' then 'wisdom'
    when 'arcana' then 'intelligence'
    when 'athletics' then 'strength'
    when 'deception' then 'charisma'
    when 'history' then 'intelligence'
    when 'insight' then 'wisdom'
    when 'intimidation' then 'charisma'
    when 'investigation' then 'intelligence'
    when 'medicine' then 'wisdom'
    when 'nature' then 'intelligence'
    when 'perception' then 'wisdom'
    when 'performance' then 'charisma'
    when 'persuasion' then 'charisma'
    when 'religion' then 'intelligence'
    when 'sleight_of_hand' then 'dexterity'
    when 'stealth' then 'dexterity'
    when 'survival' then 'wisdom'
    else null
  end;
$$;

create or replace function public.execute_ai_gm_npc_roll_v1(
  p_job_id uuid,
  p_npc_character_id uuid,
  p_request_type text,
  p_ability_key text,
  p_skill_key text,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_sheet public.character_sheets%rowtype;
  v_type text := lower(trim(coalesce(p_request_type,'')));
  v_ability text := lower(trim(coalesce(p_ability_key,'')));
  v_skill text := nullif(lower(trim(coalesce(p_skill_key,''))),'');
  v_score integer;
  v_modifier integer;
  v_message_id bigint;
  v_manager_user_id uuid;
  v_receipt public.engine_command_receipts%rowtype;
  v_payload jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null or v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  if v_type not in ('ability','save','skill') then
    raise exception 'unsupported_npc_roll_type';
  end if;

  if v_type='skill' then
    v_ability := private.npc_roll_ability_v1(v_skill);
  end if;

  if v_ability not in (
    'strength','dexterity','constitution','intelligence','wisdom','charisma'
  ) then
    raise exception 'unsupported_npc_roll_ability';
  end if;

  select * into v_sheet
  from public.character_sheets
  where character_id=p_npc_character_id;

  if v_sheet.character_id is null then raise exception 'npc_sheet_missing'; end if;

  v_score := case v_ability
    when 'strength' then v_sheet.strength
    when 'dexterity' then v_sheet.dexterity
    when 'constitution' then v_sheet.constitution
    when 'intelligence' then v_sheet.intelligence
    when 'wisdom' then v_sheet.wisdom
    else v_sheet.charisma
  end;

  v_modifier := floor((v_score-10)::numeric/2)::integer;

  if v_type='save'
     and coalesce(v_sheet.saving_throw_proficiencies,'[]'::jsonb) ? v_ability
  then
    v_modifier := v_modifier + v_sheet.proficiency_bonus;
  elsif v_type='skill'
     and coalesce(v_sheet.skill_proficiencies,'{}'::jsonb) ? v_skill
  then
    v_modifier := v_modifier + v_sheet.proficiency_bonus;
  end if;

  select * into v_receipt
  from public.engine_command_receipts
  where command_id=p_job_id;

  if v_receipt.command_id is not null then
    if v_receipt.command_kind <> 'npc.roll.v1'
       or v_receipt.aggregate_id <> p_npc_character_id
    then
      raise exception 'npc_roll_command_conflict';
    end if;
    v_message_id := (v_receipt.result->>'messageId')::bigint;
  else
    v_manager_user_id := nullif(v_job.input->>'manager_user_id','')::uuid;
    perform private.npc_runtime_manager_claims_v1(v_manager_user_id);

    v_message_id := public.send_chat_roll_v4(
      (v_job.input->>'room_id')::uuid,
      p_npc_character_id,
      left(coalesce(nullif(trim(p_label),''),'NPC roll'),160),
      'npc_'||v_type,
      v_modifier,
      true,0,0,0,1,'[]'::jsonb
    );

    insert into public.engine_command_receipts(
      command_id,campaign_id,actor_character_id,engine,command_kind,
      aggregate_id,result,created_by
    )
    values(
      p_job_id,v_job.campaign_id,p_npc_character_id,'gena','npc.roll.v1',
      p_npc_character_id,
      jsonb_build_object(
        'messageId',v_message_id,
        'requestType',v_type,
        'abilityKey',v_ability,
        'skillKey',v_skill,
        'modifier',v_modifier
      ),
      v_manager_user_id
    );
  end if;

  update public.chat_messages
  set event_payload=coalesce(event_payload,'{}'::jsonb) || jsonb_build_object(
    'gmJobId',p_job_id,
    'npcCharacterId',p_npc_character_id,
    'npcRollType',v_type,
    'abilityKey',v_ability,
    'skillKey',v_skill
  )
  where id=v_message_id
  returning event_payload into v_payload;

  return jsonb_build_object(
    'message_id',v_message_id,
    'npc_character_id',p_npc_character_id,
    'request_type',v_type,
    'ability_key',v_ability,
    'skill_key',v_skill,
    'modifier',v_modifier,
    'event_payload',v_payload
  );
end;
$$;

revoke all on function public.execute_ai_gm_npc_roll_v1(
  uuid,uuid,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.execute_ai_gm_npc_roll_v1(
  uuid,uuid,text,text,text,text
) to service_role;

comment on table public.npc_runtime_builds is
  'Stage 6 canonical NPC runtime build state. A fixed worker selects a bestiary basis; server materializes validated stats/actions into Character Engine templates.';

comment on function public.execute_ai_gm_npc_action_v1(uuid,uuid,text,text) is
  'Stage 6 server-authoritative NPC action executor. AI supplies only canonical NPC/mechanic ids; numbers and costs come from stored template mechanics.';
