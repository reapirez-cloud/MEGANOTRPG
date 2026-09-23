-- AI GM Stage 6 hardening: rebuild only for a real NPC build change and reject stale worker output.

alter table public.npc_runtime_builds
  add column if not exists build_signature text;

alter table public.npc_runtime_builds
  add column if not exists requested_signature text;

create or replace function private.ai_gm_npc_runtime_signature_v1(
  p_character_id uuid
)
returns text
language sql
security definer
set search_path=''
stable
as $$
  select md5(
    jsonb_build_object(
      'character_class',coalesce(c.character_class,''),
      'level',coalesce(c.level,1),
      'role',coalesce(np.role,''),
      'species',coalesce(np.species,''),
      'creature_type',coalesce(np.creature_type,''),
      'size',coalesce(np.size,''),
      'challenge_rating',coalesce(np.challenge_rating,0),
      'occupation',coalesce(np.occupation,''),
      'tags',coalesce(to_jsonb(np.tags),'[]'::jsonb)
    )::text
  )
  from public.characters c
  join public.npc_profiles np on np.character_id=c.id
  where c.id=p_character_id
    and c.character_type='npc'
    and c.publication_state='campaign'
    and c.life_state='alive';
$$;

revoke all on function private.ai_gm_npc_runtime_signature_v1(uuid)
  from public,anon,authenticated;

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
  v_signature text;
begin
  if p_character_id is null then return null; end if;

  select * into v_character
  from public.characters
  where id=p_character_id
    and character_type='npc'
    and publication_state='campaign'
    and life_state='alive';

  if v_character.id is null then return null; end if;

  v_signature := private.ai_gm_npc_runtime_signature_v1(p_character_id);
  if nullif(v_signature,'') is null then return null; end if;

  select * into v_existing
  from public.npc_runtime_builds
  where character_id=p_character_id
  for update;

  if v_existing.status='ready'
     and v_existing.template_id is not null
     and v_existing.build_signature=v_signature
  then
    return v_existing.last_job_id;
  end if;

  select j.id into v_job_id
  from public.agent_jobs j
  where j.job_type='npc_runtime_build'
    and j.input->>'npc_character_id'=p_character_id::text
    and j.status in ('queued','running')
  order by j.created_at asc
  limit 1;

  if v_job_id is not null then
    if (
      select j.input->>'build_signature'
      from public.agent_jobs j
      where j.id=v_job_id
    ) = v_signature then
      return v_job_id;
    end if;

    -- An older queued/running build is stale. The worker will fail closed
    -- through the expected-signature check; do not create a parallel build.
    return v_job_id;
  end if;

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
      'npc_character_id',p_character_id::text,
      'build_signature',v_signature
    ),
    '{}'::jsonb,1,0
  )
  returning id into v_job_id;

  insert into public.npc_runtime_builds(
    character_id,campaign_id,status,last_job_id,requested_signature,updated_at
  )
  values(
    p_character_id,v_character.campaign_id,'queued',v_job_id,v_signature,now()
  )
  on conflict(character_id) do update set
    status='queued',
    last_job_id=excluded.last_job_id,
    requested_signature=excluded.requested_signature,
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

create or replace function public.apply_ai_gm_npc_runtime_build_v2(
  p_job_id uuid,
  p_bestiary_slug text,
  p_model_id uuid,
  p_expected_signature text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_character_id uuid;
  v_current_signature text;
  v_result jsonb;
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

  if v_job.id is null then
    raise exception 'npc_runtime_job_not_found';
  end if;

  v_character_id := nullif(v_job.input->>'npc_character_id','')::uuid;

  -- Lock both build inputs so an update cannot land between signature validation
  -- and materialization of the canonical sheet/template.
  perform 1
  from public.characters c
  where c.id=v_character_id
  for update;

  perform 1
  from public.npc_profiles p
  where p.character_id=v_character_id
  for update;

  v_current_signature :=
    private.ai_gm_npc_runtime_signature_v1(v_character_id);

  if nullif(p_expected_signature,'') is null
     or p_expected_signature is distinct from (v_job.input->>'build_signature')
     or p_expected_signature is distinct from v_current_signature
  then
    raise exception 'npc_runtime_build_stale';
  end if;

  v_result := public.apply_ai_gm_npc_runtime_build_v1(
    p_job_id,
    p_bestiary_slug,
    p_model_id
  );

  update public.npc_runtime_builds
  set build_signature=p_expected_signature,
      requested_signature=p_expected_signature,
      updated_at=now()
  where character_id=v_character_id;

  return v_result;
end;
$$;

revoke all on function public.apply_ai_gm_npc_runtime_build_v2(
  uuid,text,uuid,text
) from public,anon,authenticated;
grant execute on function public.apply_ai_gm_npc_runtime_build_v2(
  uuid,text,uuid,text
) to service_role;

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
after insert or update of
  role,species,creature_type,size,challenge_rating,occupation,tags
on public.npc_profiles
for each row
execute function private.queue_ai_gm_npc_runtime_after_profile_v1();

create or replace function private.queue_ai_gm_npc_runtime_after_character_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job_id uuid;
begin
  if new.character_type <> 'npc'
     or new.publication_state <> 'campaign'
     or new.life_state <> 'alive'
  then
    return new;
  end if;

  v_job_id := private.reserve_ai_gm_npc_runtime_build_v1(new.id);
  if v_job_id is not null then
    perform private.dispatch_ai_gm_npc_runtime_build_v1(v_job_id);
  end if;
  return new;
end;
$$;

drop trigger if exists queue_ai_gm_npc_runtime_after_character_v1
  on public.characters;

create trigger queue_ai_gm_npc_runtime_after_character_v1
after update of character_class,level
on public.characters
for each row
when (
  old.character_class is distinct from new.character_class
  or old.level is distinct from new.level
)
execute function private.queue_ai_gm_npc_runtime_after_character_v1();

comment on column public.npc_runtime_builds.build_signature is
  'Signature of the character/profile inputs used for the currently READY NPC runtime.';
comment on column public.npc_runtime_builds.requested_signature is
  'Signature captured when the active fixed-worker build was reserved.';
