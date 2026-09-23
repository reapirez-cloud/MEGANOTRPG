-- AI GM Stage 5: durable player roll requests + hard wait/resume.

create table if not exists public.pending_player_roll_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  gm_job_id uuid not null references public.agent_jobs(id) on delete cascade,
  sequence_no integer not null check (sequence_no >= 1),
  character_id uuid not null references public.characters(id) on delete cascade,
  request_type text not null check (
    request_type in ('skill','ability','save','attack','custom')
  ),
  ability_key text,
  skill_key text,
  attack_kind text,
  label text not null,
  reason text not null,
  dc integer,
  dc_visibility text not null default 'hidden'
    check (dc_visibility in ('public','hidden')),
  status text not null default 'pending'
    check (status in ('pending','resolving','resolved','cancelled')),
  request_message_id bigint references public.chat_messages(id) on delete set null,
  roll_message_id bigint references public.chat_messages(id) on delete set null,
  resolved_modifier integer,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (gm_job_id, sequence_no)
);

create unique index if not exists pending_player_roll_requests_one_pending_job
  on public.pending_player_roll_requests (gm_job_id)
  where status in ('pending','resolving');

create index if not exists pending_player_roll_requests_character_status_idx
  on public.pending_player_roll_requests (character_id,status,created_at desc);

alter table public.pending_player_roll_requests enable row level security;

-- Hidden DC is stored here, therefore clients get no direct table access at all.
-- The player-facing projection is only chat_messages.event_payload, where a
-- hidden DC is emitted as null/omitted.
revoke all on table public.pending_player_roll_requests
  from public, anon, authenticated;
grant all on public.pending_player_roll_requests to service_role;

drop policy if exists pending_player_roll_requests_read_target
  on public.pending_player_roll_requests;

create or replace function private.normalize_roll_ability_v1(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_value,'')))
    when 'str' then 'strength'
    when 'strength' then 'strength'
    when 'dex' then 'dexterity'
    when 'dexterity' then 'dexterity'
    when 'con' then 'constitution'
    when 'constitution' then 'constitution'
    when 'int' then 'intelligence'
    when 'intelligence' then 'intelligence'
    when 'wis' then 'wisdom'
    when 'wisdom' then 'wisdom'
    when 'cha' then 'charisma'
    when 'charisma' then 'charisma'
    else null
  end;
$$;

create or replace function private.skill_ability_v1(p_skill text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_skill,'')))
    when 'athletics' then 'strength'
    when 'acrobatics' then 'dexterity'
    when 'sleight_of_hand' then 'dexterity'
    when 'stealth' then 'dexterity'
    when 'arcana' then 'intelligence'
    when 'history' then 'intelligence'
    when 'investigation' then 'intelligence'
    when 'nature' then 'intelligence'
    when 'religion' then 'intelligence'
    when 'animal_handling' then 'wisdom'
    when 'insight' then 'wisdom'
    when 'medicine' then 'wisdom'
    when 'perception' then 'wisdom'
    when 'survival' then 'wisdom'
    when 'deception' then 'charisma'
    when 'intimidation' then 'charisma'
    when 'performance' then 'charisma'
    when 'persuasion' then 'charisma'
    else null
  end;
$$;

create or replace function private.resolve_player_roll_modifier_v1(
  p_character_id uuid,
  p_request_type text,
  p_ability_key text default null,
  p_skill_key text default null,
  p_attack_kind text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_sheet public.character_sheets%rowtype;
  v_type text := lower(trim(coalesce(p_request_type,'')));
  v_ability text;
  v_score integer;
  v_base integer;
  v_rank integer := 0;
  v_attack_kind text := lower(trim(coalesce(p_attack_kind,'')));
begin
  select * into v_sheet
  from public.character_sheets
  where character_id = p_character_id;

  if v_sheet.character_id is null then
    raise exception 'character_sheet_missing';
  end if;

  if v_type = 'custom' then
    return 0;
  end if;

  if v_type = 'attack' and v_attack_kind = 'spell' then
    if v_sheet.spell_attack_bonus is null then
      raise exception 'spell_attack_bonus_missing';
    end if;
    return v_sheet.spell_attack_bonus;
  end if;

  if v_type = 'skill' then
    v_ability := private.skill_ability_v1(p_skill_key);
    if v_ability is null then
      raise exception 'unsupported_skill_key';
    end if;
  elsif v_type in ('ability','save') then
    v_ability := private.normalize_roll_ability_v1(p_ability_key);
    if v_ability is null then
      raise exception 'unsupported_ability_key';
    end if;
  elsif v_type = 'attack' then
    if v_attack_kind = 'ranged' then
      v_ability := 'dexterity';
    elsif v_attack_kind = 'melee' then
      v_ability := 'strength';
    else
      raise exception 'unsupported_attack_kind';
    end if;
  else
    raise exception 'unsupported_roll_request_type';
  end if;

  v_score := case v_ability
    when 'strength' then v_sheet.strength
    when 'dexterity' then v_sheet.dexterity
    when 'constitution' then v_sheet.constitution
    when 'intelligence' then v_sheet.intelligence
    when 'wisdom' then v_sheet.wisdom
    when 'charisma' then v_sheet.charisma
  end;

  v_base := floor((v_score - 10)::numeric / 2)::integer;

  if v_type = 'skill' then
    v_rank := greatest(
      0,
      least(
        2,
        coalesce((v_sheet.skill_proficiencies ->> lower(trim(p_skill_key)))::integer,0)
      )
    );
    return v_base + (v_sheet.proficiency_bonus * v_rank);
  end if;

  if v_type = 'save'
     and v_sheet.saving_throw_proficiencies ? v_ability
  then
    return v_base + v_sheet.proficiency_bonus;
  end if;

  if v_type = 'attack' then
    return v_base + v_sheet.proficiency_bonus;
  end if;

  return v_base;
end;
$$;

create or replace function public.create_ai_gm_player_roll_request_v1(
  p_job_id uuid,
  p_character_id uuid,
  p_request_type text,
  p_ability_key text,
  p_skill_key text,
  p_attack_kind text,
  p_label text,
  p_reason text,
  p_dc integer,
  p_dc_visibility text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_existing public.pending_player_roll_requests%rowtype;
  v_request public.pending_player_roll_requests%rowtype;
  v_room_id uuid;
  v_manager_user_id uuid;
  v_sequence integer;
  v_type text := lower(trim(coalesce(p_request_type,'')));
  v_visibility text := lower(trim(coalesce(p_dc_visibility,'hidden')));
  v_ability text;
  v_skill text := nullif(lower(trim(coalesce(p_skill_key,''))), '');
  v_attack text := nullif(lower(trim(coalesce(p_attack_kind,''))), '');
  v_modifier integer;
  v_message_id bigint;
  v_public_dc integer;
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

  if v_job.id is null then
    raise exception 'ai_gm_turn_not_found';
  end if;

  select * into v_existing
  from public.pending_player_roll_requests
  where gm_job_id=p_job_id
    and status in ('pending','resolving')
  order by sequence_no desc
  limit 1
  for update;

  if v_existing.id is not null then
    return jsonb_build_object(
      'request_id',v_existing.id,
      'request_message_id',v_existing.request_message_id,
      'status',v_existing.status,
      'sequence_no',v_existing.sequence_no
    );
  end if;

  if v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  if v_type not in ('skill','ability','save','attack','custom') then
    raise exception 'unsupported_roll_request_type';
  end if;

  v_room_id := nullif(v_job.input->>'room_id','')::uuid;
  v_manager_user_id := nullif(v_job.input->>'manager_user_id','')::uuid;
  if v_room_id is null or v_manager_user_id is null then
    raise exception 'ai_gm_turn_identity_missing';
  end if;

  if not exists (
    select 1 from public.characters c
    where c.id=p_character_id
      and c.campaign_id=v_job.campaign_id
      and c.character_type='pc'
      and c.life_state='alive'
      and c.assigned_user_id is not null
  ) then
    raise exception 'roll_target_must_be_live_player_character';
  end if;

  v_ability := private.normalize_roll_ability_v1(p_ability_key);
  if v_type='skill' then
    if private.skill_ability_v1(v_skill) is null then
      raise exception 'unsupported_skill_key';
    end if;
    v_ability := private.skill_ability_v1(v_skill);
  elsif v_type in ('ability','save') and v_ability is null then
    raise exception 'unsupported_ability_key';
  elsif v_type='attack' and v_attack not in ('melee','ranged','spell') then
    raise exception 'unsupported_attack_kind';
  end if;

  v_modifier := private.resolve_player_roll_modifier_v1(
    p_character_id,v_type,v_ability,v_skill,v_attack
  );

  v_visibility := case when v_visibility='public' then 'public' else 'hidden' end;
  v_public_dc := case when v_visibility='public' then p_dc else null end;

  select coalesce(max(sequence_no),0)+1 into v_sequence
  from public.pending_player_roll_requests
  where gm_job_id=p_job_id;

  insert into public.pending_player_roll_requests (
    campaign_id,room_id,gm_job_id,sequence_no,character_id,request_type,
    ability_key,skill_key,attack_kind,label,reason,dc,dc_visibility
  )
  values (
    v_job.campaign_id,v_room_id,p_job_id,v_sequence,p_character_id,v_type,
    v_ability,v_skill,v_attack,
    left(coalesce(nullif(trim(p_label),''),'Проверка'),160),
    left(coalesce(nullif(trim(p_reason),''),'Требуется проверка.'),1200),
    p_dc,v_visibility
  )
  returning * into v_request;

  perform set_config('meganot.ai_gm_runtime','on',true);

  insert into public.chat_messages (
    room_id,client_id,user_id,character_id,author_name,body,event_kind,event_payload
  )
  values (
    v_room_id,
    v_manager_user_id,
    v_manager_user_id,
    null,
    'Рассказчик',
    left(v_request.reason,4000),
    'action',
    jsonb_strip_nulls(jsonb_build_object(
      'kind','player_roll_request',
      'requestId',v_request.id,
      'targetCharacterId',p_character_id,
      'requestType',v_type,
      'abilityKey',v_ability,
      'skillKey',v_skill,
      'attackKind',v_attack,
      'label',v_request.label,
      'reason',v_request.reason,
      'modifier',v_modifier,
      'dcVisibility',v_visibility,
      'dc',v_public_dc,
      'status','pending'
    ))
  )
  returning id into v_message_id;

  update public.pending_player_roll_requests
  set request_message_id=v_message_id
  where id=v_request.id;

  update public.agent_jobs
  set status='waiting_for_user',
      result=coalesce(result,'{}'::jsonb) || jsonb_build_object(
        'pending_roll_request_id',v_request.id,
        'pending_roll_request_message_id',v_message_id,
        'roll_request_sequence',v_sequence,
        'runtime_stage',5
      ),
      updated_at=now()
  where id=p_job_id;

  return jsonb_build_object(
    'request_id',v_request.id,
    'request_message_id',v_message_id,
    'status','pending',
    'sequence_no',v_sequence,
    'modifier',v_modifier
  );
end;
$$;

revoke all on function public.create_ai_gm_player_roll_request_v1(
  uuid,uuid,text,text,text,text,text,text,integer,text
) from public, anon, authenticated;
grant execute on function public.create_ai_gm_player_roll_request_v1(
  uuid,uuid,text,text,text,text,text,text,integer,text
) to service_role;

create table if not exists private.ai_gm_roll_resume_dispatch_config (
  singleton boolean primary key default true check (singleton=true),
  project_url text,
  dispatch_token text not null default encode(gen_random_bytes(32),'hex'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.ai_gm_roll_resume_dispatch_config(singleton)
values(true)
on conflict(singleton) do nothing;

create or replace function public.verify_ai_gm_roll_resume_dispatch_v1(p_token text)
returns boolean
language sql
security definer
set search_path=''
stable
as $$
  select exists(
    select 1 from private.ai_gm_roll_resume_dispatch_config c
    where c.singleton=true
      and c.enabled=true
      and length(coalesce(p_token,'')) >= 32
      and c.dispatch_token=p_token
  );
$$;

revoke all on function public.verify_ai_gm_roll_resume_dispatch_v1(text)
  from public, anon, authenticated;
grant execute on function public.verify_ai_gm_roll_resume_dispatch_v1(text)
  to service_role;

create or replace function private.dispatch_ai_gm_roll_resume_v1(p_job_id uuid)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_config private.ai_gm_roll_resume_dispatch_config%rowtype;
  v_request_id bigint;
begin
  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
    and status='queued';

  if v_job.id is null then
    return null;
  end if;

  select * into v_config
  from private.ai_gm_roll_resume_dispatch_config
  where singleton=true;

  if v_config.singleton is null
     or v_config.enabled is not true
     or nullif(trim(v_config.project_url),'') is null
  then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_config.project_url,'/') || '/functions/v1/gm-roll-resume',
    body := jsonb_build_object(
      'jobId',p_job_id::text,
      'campaignId',v_job.campaign_id::text,
      'dispatchToken',v_config.dispatch_token
    ),
    headers := jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds := 90000
  ) into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.dispatch_ai_gm_roll_resume_v1(p_job_id uuid)
returns bigint
language sql
security definer
set search_path=''
as $$
  select private.dispatch_ai_gm_roll_resume_v1(p_job_id);
$$;

revoke all on function public.dispatch_ai_gm_roll_resume_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.dispatch_ai_gm_roll_resume_v1(uuid)
  to service_role;

create or replace function public.resolve_player_roll_request_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.pending_player_roll_requests%rowtype;
  v_modifier integer;
  v_roll_message_id bigint;
  v_roll_payload jsonb;
  v_job public.agent_jobs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Anonymous accounts cannot resolve player rolls';
  end if;

  select * into v_request
  from public.pending_player_roll_requests
  where id=p_request_id
  for update;

  if v_request.id is null then
    raise exception 'roll_request_not_found';
  end if;

  if not exists(
    select 1 from public.characters c
    where c.id=v_request.character_id
      and c.assigned_user_id=auth.uid()
      and c.life_state='alive'
  ) then
    raise exception 'roll_request_belongs_to_another_player';
  end if;

  if v_request.status='resolved' and v_request.roll_message_id is not null then
    return v_request.result;
  end if;

  if v_request.status <> 'pending' then
    raise exception 'roll_request_not_pending';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=v_request.gm_job_id
  for update;

  if v_job.id is null or v_job.status <> 'waiting_for_user' then
    raise exception 'gm_turn_not_waiting_for_roll';
  end if;

  update public.pending_player_roll_requests
  set status='resolving'
  where id=v_request.id;

  v_modifier := private.resolve_player_roll_modifier_v1(
    v_request.character_id,
    v_request.request_type,
    v_request.ability_key,
    v_request.skill_key,
    v_request.attack_kind
  );

  v_roll_message_id := public.send_chat_roll_v4(
    v_request.room_id,
    v_request.character_id,
    v_request.label,
    case
      when v_request.request_type='skill' then 'skill'
      when v_request.request_type='save' then 'save'
      when v_request.request_type='attack' then 'attack'
      when v_request.request_type='ability' then 'check'
      else 'custom'
    end,
    v_modifier,
    true,
    0,0,0,1,
    '[]'::jsonb
  );

  select event_payload into v_roll_payload
  from public.chat_messages
  where id=v_roll_message_id;

  update public.chat_messages
  set event_payload=coalesce(event_payload,'{}'::jsonb) || jsonb_build_object(
    'playerRollRequestId',v_request.id,
    'gmJobId',v_request.gm_job_id
  )
  where id=v_roll_message_id;

  update public.chat_messages
  set event_payload=coalesce(event_payload,'{}'::jsonb) || jsonb_build_object(
    'status','resolved',
    'rollMessageId',v_roll_message_id
  )
  where id=v_request.request_message_id;

  v_roll_payload := coalesce(v_roll_payload,'{}'::jsonb) || jsonb_build_object(
    'requestId',v_request.id,
    'requestType',v_request.request_type,
    'resolvedModifier',v_modifier,
    'rollMessageId',v_roll_message_id,
    'dcPassed',
      case
        when v_request.dc is null then null
        else coalesce((v_roll_payload->>'total')::integer,0) >= v_request.dc
      end
  );

  update public.pending_player_roll_requests
  set status='resolved',
      roll_message_id=v_roll_message_id,
      resolved_modifier=v_modifier,
      result=v_roll_payload,
      resolved_at=now()
  where id=v_request.id;

  update public.agent_jobs
  set status='queued',
      input=coalesce(input,'{}'::jsonb) || jsonb_build_object(
        'resume_chat_message_id',v_roll_message_id
      ),
      result=(coalesce(result,'{}'::jsonb) - 'pending_roll_request_id')
        || jsonb_build_object(
          'last_roll_request_id',v_request.id,
          'last_roll_message_id',v_roll_message_id,
          'last_roll_result',v_roll_payload,
          'runtime_stage',5
        ),
      updated_at=now(),
      error_code=null,
      error_message=null
  where id=v_request.gm_job_id
    and status='waiting_for_user';

  perform private.dispatch_ai_gm_roll_resume_v1(v_request.gm_job_id);

  return v_roll_payload;
end;
$$;

revoke all on function public.resolve_player_roll_request_v1(uuid)
  from public, anon;
grant execute on function public.resolve_player_roll_request_v1(uuid)
  to authenticated;

comment on table public.pending_player_roll_requests is
  'Stage 5 durable player-roll requests. Hidden DC stays server-side; resolving a request resumes the same GM job exactly once.';
