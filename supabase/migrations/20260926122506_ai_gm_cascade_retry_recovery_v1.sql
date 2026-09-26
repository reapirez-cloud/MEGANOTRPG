-- Fix AI-GM Stage 18/26 retry recovery and semantic structure-role coverage.
-- 1) normalize semantic location roles before Stage 26 validates coverage;
-- 2) preserve previous executor errors across Junior retries;
-- 3) terminalize stale exhausted post-turn work instead of leaving rooms locked.

create or replace function private.ai_gm_normalize_structure_roles_v1(p_roles text[])
returns text[]
language sql
immutable
set search_path=''
as $function$
  with base as (
    select distinct lower(left(btrim(role),64)) as role
    from unnest(coalesce(p_roles,'{}'::text[])) as t(role)
    where btrim(role)<>''
  ),
  canonical as (
    select distinct mapped.role
    from base b
    cross join lateral (
      values
        (case when b.role in ('common_room','public_house','gathering_hall','social_hall')
          then 'public_hall' end),
        (case when b.role in ('tap','bar','kitchen','service_counter','reception')
          then 'service' end),
        (case when b.role in ('tap','bar','pantry','cellar','storeroom','storage_room')
          then 'storage' end),
        (case when b.role in ('lodging','guest_rooms','bedrooms','sleeping_quarters')
          then 'guest_area' end),
        (case when b.role in ('residence','housing','homes')
          then 'residential' end),
        (case when b.role in ('market','trade','shops')
          then 'commerce' end),
        (case when b.role in ('guards','guard_post','watch')
          then 'security' end)
    ) as mapped(role)
    where mapped.role is not null
  ),
  prioritized as (
    select role, 0 as priority from canonical
    union
    select role, 1 as priority from base
  ),
  limited as (
    select role
    from prioritized
    group by role
    order by min(priority), role
    limit 16
  )
  select coalesce(array_agg(role order by role),'{}'::text[])
  from limited;
$function$;

create or replace function private.ai_gm_normalize_location_structure_roles_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  new.structure_roles := private.ai_gm_normalize_structure_roles_v1(new.structure_roles);
  return new;
end;
$function$;

drop trigger if exists ai_gm_normalize_location_structure_roles_v1 on public.locations;
create trigger ai_gm_normalize_location_structure_roles_v1
before insert or update of structure_roles
on public.locations
for each row
execute function private.ai_gm_normalize_location_structure_roles_v1();

update public.locations l
set structure_roles=private.ai_gm_normalize_structure_roles_v1(l.structure_roles),
    updated_at=now()
where l.structure_roles is distinct from private.ai_gm_normalize_structure_roles_v1(l.structure_roles);

create or replace function public.claim_ai_gm_post_turn_intent_v3(
  p_commit_id uuid,
  p_commit_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
  v_token uuid := gen_random_uuid();
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
  if v_commit.state<>'running'
     or v_commit.lease_token is distinct from p_commit_lease_token
     or v_commit.lease_expires_at is null
     or v_commit.lease_expires_at<now()
  then
    raise exception 'stage18_commit_lease_invalid';
  end if;

  update public.ai_gm_post_turn_intent_receipts i
  set state='failed',
      lease_token=null,
      lease_expires_at=null,
      last_error=coalesce(
        i.last_error,
        (
          select left(coalesce(j.error_message,j.error_code),500)
          from public.agent_jobs j
          where j.agent_key='ai_world_executor'
            and j.input->>'source_intent_id'=i.id::text
            and j.status='failed'
          order by j.created_at desc,j.id desc
          limit 1
        ),
        'stage18_intent_attempts_exhausted'
      ),
      updated_at=now()
  where i.commit_id=p_commit_id
    and i.state in ('pending','running')
    and i.attempts>=i.max_attempts
    and (i.state='pending' or i.lease_expires_at<now());

  select * into v_intent
  from public.ai_gm_post_turn_intent_receipts
  where commit_id=p_commit_id
    and attempts<max_attempts
    and (
      state='pending'
      or (state='running' and lease_expires_at<now())
    )
  order by intent_index
  limit 1
  for update skip locked;

  if v_intent.id is null then
    return null;
  end if;

  update public.ai_gm_post_turn_intent_receipts
  set state='running',
      attempts=attempts+1,
      lease_token=v_token,
      lease_expires_at=now()+interval '90 seconds',
      started_at=coalesce(started_at,now()),
      updated_at=now()
  where id=v_intent.id
  returning * into v_intent;

  return to_jsonb(v_intent)
    || jsonb_build_object('runtime_stage',18,'stage18_version',3);
end;
$function$;

create or replace function private.recover_stale_ai_gm_post_turn_room_v1(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_error text;
begin
  for v_commit in
    select *
    from public.ai_gm_post_turn_commits c
    where c.room_id=p_room_id
      and c.state='running'
      and c.lease_expires_at is not null
      and c.lease_expires_at<now()
    order by c.created_at desc
    for update
  loop
    update public.ai_gm_post_turn_intent_receipts i
    set state='failed',
        lease_token=null,
        lease_expires_at=null,
        last_error=coalesce(
          i.last_error,
          (
            select left(coalesce(j.error_message,j.error_code),500)
            from public.agent_jobs j
            where j.agent_key='ai_world_executor'
              and j.input->>'source_intent_id'=i.id::text
              and j.status='failed'
            order by j.created_at desc,j.id desc
            limit 1
          ),
          'stage18_intent_attempts_exhausted'
        ),
        updated_at=now()
    where i.commit_id=v_commit.id
      and i.state='running'
      and i.attempts>=i.max_attempts
      and i.lease_expires_at is not null
      and i.lease_expires_at<now();

    if v_commit.attempts>=v_commit.max_attempts
       or exists(
         select 1
         from public.ai_gm_post_turn_intent_receipts i
         where i.commit_id=v_commit.id
           and i.state='failed'
       )
    then
      select coalesce(
        (
          select nullif(i.last_error,'')
          from public.ai_gm_post_turn_intent_receipts i
          where i.commit_id=v_commit.id
            and i.state='failed'
            and nullif(i.last_error,'') is not null
          order by i.intent_index
          limit 1
        ),
        (
          select nullif(coalesce(j.error_message,j.error_code),'')
          from public.agent_jobs j
          where j.agent_key='ai_world_executor'
            and j.input->>'source_commit_id'=v_commit.id::text
            and j.status='failed'
          order by j.created_at desc,j.id desc
          limit 1
        ),
        nullif(v_commit.last_error,''),
        'stage18_commit_attempts_exhausted'
      ) into v_error;

      update public.ai_gm_post_turn_intent_receipts i
      set state='failed',
          lease_token=null,
          lease_expires_at=null,
          last_error=coalesce(i.last_error,left(v_error,500)),
          updated_at=now()
      where i.commit_id=v_commit.id
        and i.state='running';

      update public.ai_gm_post_turn_commits
      set state='failed',
          lease_token=null,
          lease_expires_at=null,
          last_error=left(v_error,500),
          updated_at=now()
      where id=v_commit.id;

      update public.agent_jobs
      set result=coalesce(result,'{}'::jsonb)
          || jsonb_build_object(
            'post_turn_state','failed',
            'post_turn_commit_id',v_commit.id,
            'post_turn_error',left(v_error,500),
            'runtime_stage',18,
            'stage18_version',3
          ),
          updated_at=now()
      where id=v_commit.parent_job_id;
    end if;
  end loop;
end;
$function$;

create or replace function public.get_ai_gm_room_status_v3(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.chat_rooms%rowtype;
  v_commit public.ai_gm_post_turn_commits%rowtype;
  v_job public.agent_jobs%rowtype;
  v_can_recover boolean := false;
  v_job_wake_required boolean := false;
  v_continuation_pending boolean := false;
  v_continuation_attempt integer := 0;
  v_pending_roll_request_id uuid := null;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;

  select * into v_room from public.chat_rooms where id=p_room_id;
  if v_room.id is null or not private.can_read_chat_room(p_room_id) then
    raise exception 'chat_room_read_required';
  end if;

  perform private.recover_stale_ai_gm_post_turn_room_v1(p_room_id);

  select * into v_commit
  from public.ai_gm_post_turn_commits
  where room_id=p_room_id and state in ('queued','running','failed')
  order by created_at desc
  limit 1;

  if v_commit.id is not null then
    v_can_recover :=
      v_commit.state='failed'
      and private.can_manage_campaign(v_commit.campaign_id,v_user_id);

    return jsonb_build_object(
      'active',v_commit.state in ('queued','running'),
      'phase',case when v_commit.state='failed' then 'post_turn_failed' else 'post_turn_commit' end,
      'label',case when v_commit.state='failed'
        then 'Синхронизация мира не завершилась'
        else 'Младший шуршит…'
      end,
      'room_id',p_room_id,
      'campaign_id',v_commit.campaign_id,
      'commit_id',v_commit.id,
      'commit_state',v_commit.state,
      'attempts',v_commit.attempts,
      'max_attempts',v_commit.max_attempts,
      'can_recover',v_can_recover,
      'wake_required',(
        v_commit.state='queued'
        or (
          v_commit.state='running'
          and v_commit.lease_expires_at is not null
          and v_commit.lease_expires_at<now()
        )
      ),
      'pending_roll_request_id',null,
      'error_code',case when v_commit.state='failed' then 'stage18_post_turn_commit_failed' else null end,
      'error_message',v_commit.last_error,
      'updated_at',v_commit.updated_at,
      'lease_expires_at',v_commit.lease_expires_at,
      'runtime_stage',18,
      'stage18_version',3
    );
  end if;

  select * into v_job
  from public.agent_jobs j
  where j.campaign_id=v_room.campaign_id
    and j.job_type='conversation_turn'
    and j.input->>'surface'='game_chat_v1'
    and j.input->>'room_id'=p_room_id::text
  order by j.created_at desc,j.id desc
  limit 1;

  if v_job.id is null or v_job.status='completed' then
    return jsonb_build_object(
      'active',false,'phase','idle','label','ИИ-ГМ готов',
      'room_id',p_room_id,'campaign_id',v_room.campaign_id,
      'runtime_stage',18,'stage18_version',3,
      'continuation_version',1,
      'pending_roll_request_id',null,
      'auto_roll_version',1
    );
  end if;

  if v_job.status='waiting_for_user' then
    select r.id into v_pending_roll_request_id
    from public.pending_player_roll_requests r
    join public.characters c on c.id=r.character_id
    where r.gm_job_id=v_job.id
      and r.status='pending'
      and c.assigned_user_id=v_user_id
      and c.life_state='alive'
    order by r.sequence_no desc,r.created_at desc
    limit 1;
  end if;

  v_continuation_pending := v_job.result->'continuation_pending' = 'true'::jsonb;
  v_continuation_attempt := case
    when coalesce(v_job.result->>'provider_continuation_count','') ~ '^[0-9]+$'
      then (v_job.result->>'provider_continuation_count')::integer
    else 0
  end;

  v_job_wake_required :=
    v_job.status='queued'
    or (
      v_job.status='running'
      and v_job.updated_at < now() - interval '3 minutes'
    );

  return jsonb_build_object(
    'active',v_job.status in ('queued','running','waiting_for_user'),
    'phase',case
      when v_job.status='queued' then 'queued'
      when v_job.status='running' then coalesce(nullif(v_job.result->>'runtime_phase',''),'thinking')
      when v_job.status='waiting_for_user' then 'waiting_for_roll'
      when v_job.status='failed' then 'failed'
      when v_job.status='cancelled' then 'cancelled'
      else v_job.status
    end,
    'label',case
      when v_job.status='queued' and v_continuation_pending then 'ИИ-ГМ продолжает оборванный ход'
      when v_job.status='queued' then 'ИИ-ГМ запускается'
      when v_job.status='running' and v_job_wake_required then 'ИИ-ГМ перезапускает оборванный ход'
      when v_job.status='running' then 'ИИ-ГМ думает'
      when v_job.status='waiting_for_user' and v_pending_roll_request_id is not null
        then 'ИИ-ГМ запросил бросок · бросаем автоматически'
      when v_job.status='waiting_for_user' then 'ИИ-ГМ ждёт бросок игрока'
      when v_job.status='failed' then 'Ошибка хода ИИ-ГМ'
      when v_job.status='cancelled' then 'Ход ИИ-ГМ отменён'
      else 'ИИ-ГМ: '||v_job.status
    end,
    'room_id',p_room_id,
    'campaign_id',v_job.campaign_id,
    'job_id',v_job.id,
    'job_status',v_job.status,
    'wake_required',v_job_wake_required,
    'pending_roll_request_id',v_pending_roll_request_id,
    'auto_roll_available',v_pending_roll_request_id is not null,
    'continuation_pending',v_continuation_pending,
    'continuation_attempt',v_continuation_attempt,
    'continuation_max_attempts',2,
    'error_code',v_job.error_code,
    'error_message',v_job.error_message,
    'updated_at',v_job.updated_at,
    'runtime_stage',18,
    'stage18_version',3,
    'continuation_version',1,
    'auto_roll_version',1
  );
end;
$function$;

revoke all on function private.ai_gm_normalize_structure_roles_v1(text[])
  from public,anon,authenticated,service_role;
revoke all on function private.ai_gm_normalize_location_structure_roles_v1()
  from public,anon,authenticated,service_role;
revoke all on function private.recover_stale_ai_gm_post_turn_room_v1(uuid)
  from public,anon,authenticated,service_role;

revoke all on function public.claim_ai_gm_post_turn_intent_v3(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.claim_ai_gm_post_turn_intent_v3(uuid,uuid)
  to service_role;

revoke all on function public.get_ai_gm_room_status_v3(uuid)
  from public,anon;
grant execute on function public.get_ai_gm_room_status_v3(uuid)
  to authenticated,service_role;

do $function$
declare
  v_room record;
begin
  for v_room in
    select distinct c.room_id
    from public.ai_gm_post_turn_commits c
    where c.state='running'
      and c.lease_expires_at is not null
      and c.lease_expires_at<now()
  loop
    perform private.recover_stale_ai_gm_post_turn_room_v1(v_room.room_id);
  end loop;
end;
$function$;

comment on function private.ai_gm_normalize_structure_roles_v1(text[]) is
  'Canonicalizes semantic Stage 26 structure-role aliases while preserving useful source labels and the 16-role limit.';
comment on function private.recover_stale_ai_gm_post_turn_room_v1(uuid) is
  'Terminalizes expired exhausted Stage 18 post-turn leases and records the latest deterministic executor error so a room cannot remain locked at 3/3.';
