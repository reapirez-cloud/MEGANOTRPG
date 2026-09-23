-- AI GM Stage 5: durable player roll requests and hard wait/resume.
--
-- The model may request a roll, but never supplies the numeric modifier.
-- Modifiers are resolved server-side from the canonical character sheet/runtime.
-- Hidden DC values live only in ai_gm_roll_requests and never enter player-visible
-- chat event payloads.

alter table public.chat_messages
  drop constraint if exists chat_messages_event_kind_check;

alter table public.chat_messages
  add constraint chat_messages_event_kind_check
  check (
    event_kind is null
    or event_kind in ('roll','action','spell','roll_request')
  );

create table if not exists public.ai_gm_roll_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  gm_job_id uuid not null references public.agent_jobs(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  roll_type text not null
    check (roll_type in ('skill','ability','save','attack','custom')),
  skill_key text,
  ability_key text,
  attack_mechanic_id text,
  label text not null,
  reason text not null,
  dc integer,
  dc_visibility text not null default 'hidden'
    check (dc_visibility in ('hidden','public','gm')),
  resolved_modifier integer not null,
  modifier_source jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','resolved','cancelled')),
  request_message_id bigint references public.chat_messages(id) on delete set null,
  result_message_id bigint references public.chat_messages(id) on delete set null,
  result_d20 integer,
  result_total integer,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint ai_gm_roll_requests_label_length
    check (char_length(label) between 1 and 160),
  constraint ai_gm_roll_requests_reason_length
    check (char_length(reason) between 1 and 1200),
  constraint ai_gm_roll_requests_dc_range
    check (dc is null or dc between 0 and 100),
  constraint ai_gm_roll_requests_modifier_range
    check (resolved_modifier between -500 and 500)
);

create unique index if not exists ai_gm_roll_requests_one_pending_job_idx
  on public.ai_gm_roll_requests (gm_job_id)
  where status = 'pending';

create index if not exists ai_gm_roll_requests_target_pending_idx
  on public.ai_gm_roll_requests (target_user_id, room_id, created_at desc)
  where status = 'pending';

create index if not exists ai_gm_roll_requests_character_idx
  on public.ai_gm_roll_requests (character_id, created_at desc);

alter table public.ai_gm_roll_requests enable row level security;

revoke all on table public.ai_gm_roll_requests
  from public, anon, authenticated;
grant all on table public.ai_gm_roll_requests
  to service_role;

create or replace function private.ai_gm_ability_modifier_v1(
  p_score integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select floor((coalesce(p_score, 10) - 10)::numeric / 2)::integer;
$$;

create or replace function private.ai_gm_skill_ability_v1(
  p_skill_key text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_skill_key,'')))
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

create or replace function private.ai_gm_character_roll_modifier_v1(
  p_character_id uuid,
  p_roll_type text,
  p_skill_key text default null,
  p_ability_key text default null,
  p_attack_mechanic_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_sheet public.character_sheets%rowtype;
  v_character public.characters%rowtype;
  v_type text := lower(trim(coalesce(p_roll_type,'')));
  v_skill text := nullif(lower(trim(coalesce(p_skill_key,''))), '');
  v_ability text := nullif(lower(trim(coalesce(p_ability_key,''))), '');
  v_score integer;
  v_ability_mod integer;
  v_proficiency_bonus integer;
  v_rank numeric := 0;
  v_modifier integer;
  v_source jsonb;
begin
  select * into v_character
  from public.characters
  where id = p_character_id
    and character_type = 'pc'
    and life_state = 'alive';

  if v_character.id is null then
    raise exception 'roll_request_character_not_live_pc';
  end if;

  select * into v_sheet
  from public.character_sheets
  where character_id = p_character_id;

  if v_sheet.character_id is null then
    raise exception 'roll_request_character_sheet_missing';
  end if;

  v_proficiency_bonus := coalesce(v_sheet.proficiency_bonus, 0);

  if v_type = 'skill' then
    if v_skill is null then
      raise exception 'roll_request_skill_required';
    end if;

    v_ability := private.ai_gm_skill_ability_v1(v_skill);
    if v_ability is null then
      raise exception 'roll_request_skill_invalid';
    end if;

    if jsonb_typeof(v_sheet.skill_proficiencies) = 'object' then
      begin
        v_rank := coalesce((v_sheet.skill_proficiencies ->> v_skill)::numeric, 0);
      exception when invalid_text_representation then
        v_rank := case
          when lower(coalesce(v_sheet.skill_proficiencies ->> v_skill,'')) in ('true','yes')
            then 1
          else 0
        end;
      end;
    elsif jsonb_typeof(v_sheet.skill_proficiencies) = 'array'
      and v_sheet.skill_proficiencies ? v_skill
    then
      v_rank := 1;
    end if;

  elsif v_type = 'save' then
    if v_ability is null then
      raise exception 'roll_request_ability_required';
    end if;

    if jsonb_typeof(v_sheet.saving_throw_proficiencies) = 'array'
      and v_sheet.saving_throw_proficiencies ? v_ability
    then
      v_rank := 1;
    elsif jsonb_typeof(v_sheet.saving_throw_proficiencies) = 'object' then
      begin
        v_rank := coalesce((v_sheet.saving_throw_proficiencies ->> v_ability)::numeric, 0);
      exception when invalid_text_representation then
        v_rank := case
          when lower(coalesce(v_sheet.saving_throw_proficiencies ->> v_ability,'')) in ('true','yes')
            then 1
          else 0
        end;
      end;
    end if;

  elsif v_type = 'ability' then
    if v_ability is null then
      raise exception 'roll_request_ability_required';
    end if;
    v_rank := 0;

  elsif v_type = 'attack' then
    -- Stage 5 resolves the numeric bonus from canonical character data.
    -- The model may choose which canonical ability the requested attack uses,
    -- but it cannot provide the modifier itself. Stage 6 will bind NPC attacks
    -- to concrete mechanic ids and full action execution.
    if v_ability is null then
      v_ability := 'strength';
    end if;
    v_rank := 1;

  elsif v_type = 'custom' then
    -- Custom checks may optionally name one canonical ability. Without one,
    -- the custom roll is an unmodified d20 rather than a model-invented bonus.
    v_rank := 0;
    if v_ability is null then
      return jsonb_build_object(
        'modifier', 0,
        'ability_key', null,
        'skill_key', v_skill,
        'proficiency_rank', 0,
        'proficiency_bonus', v_proficiency_bonus,
        'source', 'character_runtime_custom_unmodified'
      );
    end if;
  else
    raise exception 'roll_request_type_invalid';
  end if;

  if v_ability not in (
    'strength','dexterity','constitution',
    'intelligence','wisdom','charisma'
  ) then
    raise exception 'roll_request_ability_invalid';
  end if;

  v_score := case v_ability
    when 'strength' then v_sheet.strength
    when 'dexterity' then v_sheet.dexterity
    when 'constitution' then v_sheet.constitution
    when 'intelligence' then v_sheet.intelligence
    when 'wisdom' then v_sheet.wisdom
    when 'charisma' then v_sheet.charisma
  end;

  v_ability_mod := private.ai_gm_ability_modifier_v1(v_score);
  v_modifier := v_ability_mod + round(v_proficiency_bonus * v_rank)::integer;

  v_source := jsonb_build_object(
    'source', 'character_engine_runtime_sheet',
    'ability_key', v_ability,
    'ability_score', v_score,
    'ability_modifier', v_ability_mod,
    'skill_key', v_skill,
    'proficiency_rank', v_rank,
    'proficiency_bonus', v_proficiency_bonus,
    'attack_mechanic_id', nullif(trim(coalesce(p_attack_mechanic_id,'')), '')
  );

  return v_source || jsonb_build_object('modifier', v_modifier);
end;
$$;

create or replace function public.create_ai_gm_roll_request_v1(
  p_job_id uuid,
  p_character_id uuid,
  p_roll_type text,
  p_skill_key text default null,
  p_ability_key text default null,
  p_attack_mechanic_id text default null,
  p_label text default 'Проверка',
  p_reason text default 'Ведущий просит бросок.',
  p_dc integer default null,
  p_dc_visibility text default 'hidden'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.agent_jobs%rowtype;
  v_room public.chat_rooms%rowtype;
  v_character public.characters%rowtype;
  v_source_character_id uuid;
  v_source_location_id uuid;
  v_target_location_id uuid;
  v_manager_user_id uuid;
  v_modifier jsonb;
  v_modifier_value integer;
  v_visibility text := lower(trim(coalesce(p_dc_visibility,'hidden')));
  v_request public.ai_gm_roll_requests%rowtype;
  v_existing public.ai_gm_roll_requests%rowtype;
  v_message_id bigint;
  v_payload jsonb;
begin
  select * into v_job
  from public.agent_jobs
  where id = p_job_id
    and job_type = 'conversation_turn'
    and input ->> 'surface' = 'game_chat_v1'
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_turn_not_found';
  end if;

  if v_job.status <> 'running' then
    raise exception 'ai_gm_turn_not_running';
  end if;

  select * into v_existing
  from public.ai_gm_roll_requests
  where gm_job_id = p_job_id
    and status = 'pending'
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'request_id', v_existing.id,
      'request_message_id', v_existing.request_message_id,
      'status', v_existing.status,
      'job_id', v_existing.gm_job_id
    );
  end if;

  select * into v_room
  from public.chat_rooms
  where id = nullif(v_job.input ->> 'room_id','')::uuid
    and campaign_id = v_job.campaign_id;

  if v_room.id is null
     or v_room.category <> 'game'
     or v_room.room_state <> 'open'
     or v_room.is_read_only
     or v_room.scene_state <> 'active'
  then
    raise exception 'ai_gm_roll_room_not_active';
  end if;

  v_manager_user_id := nullif(v_job.input ->> 'manager_user_id','')::uuid;
  v_source_character_id := nullif(v_job.input ->> 'source_character_id','')::uuid;

  if v_manager_user_id is null
     or v_source_character_id is null
     or not exists (
       select 1
       from public.campaign_members cm
       where cm.campaign_id = v_job.campaign_id
         and cm.user_id = v_manager_user_id
         and (cm.is_owner = true or cm.role = 'gm')
     )
  then
    raise exception 'ai_gm_roll_manager_invalid';
  end if;

  select * into v_character
  from public.characters
  where id = p_character_id
    and campaign_id = v_job.campaign_id
    and character_type = 'pc'
    and life_state = 'alive'
    and assigned_user_id is not null;

  if v_character.id is null then
    raise exception 'ai_gm_roll_target_invalid';
  end if;

  if private.chat_player_actor_for_room(
       v_room.id,
       v_character.assigned_user_id
     ) is distinct from v_character.id
  then
    raise exception 'ai_gm_roll_target_not_active_chat_actor';
  end if;

  select cws.location_id into v_source_location_id
  from public.character_world_state cws
  where cws.campaign_id = v_job.campaign_id
    and cws.character_id = v_source_character_id;

  select cws.location_id into v_target_location_id
  from public.character_world_state cws
  where cws.campaign_id = v_job.campaign_id
    and cws.character_id = p_character_id;

  v_source_location_id := coalesce(v_source_location_id, v_room.location_id);
  v_target_location_id := coalesce(v_target_location_id, v_room.location_id);

  if v_source_location_id is distinct from v_target_location_id then
    raise exception 'ai_gm_roll_target_not_in_source_scene';
  end if;

  if v_visibility not in ('hidden','public','gm') then
    raise exception 'ai_gm_roll_dc_visibility_invalid';
  end if;

  if p_dc is not null and (p_dc < 0 or p_dc > 100) then
    raise exception 'ai_gm_roll_dc_invalid';
  end if;

  v_modifier := private.ai_gm_character_roll_modifier_v1(
    p_character_id,
    p_roll_type,
    p_skill_key,
    p_ability_key,
    p_attack_mechanic_id
  );
  v_modifier_value := (v_modifier ->> 'modifier')::integer;

  insert into public.ai_gm_roll_requests (
    campaign_id,
    room_id,
    gm_job_id,
    character_id,
    target_user_id,
    roll_type,
    skill_key,
    ability_key,
    attack_mechanic_id,
    label,
    reason,
    dc,
    dc_visibility,
    resolved_modifier,
    modifier_source
  )
  values (
    v_job.campaign_id,
    v_room.id,
    v_job.id,
    v_character.id,
    v_character.assigned_user_id,
    lower(trim(p_roll_type)),
    nullif(lower(trim(coalesce(p_skill_key,''))), ''),
    nullif(lower(trim(coalesce(v_modifier ->> 'ability_key',''))), ''),
    nullif(trim(coalesce(p_attack_mechanic_id,'')), ''),
    left(trim(coalesce(nullif(p_label,''),'Проверка')), 160),
    left(trim(coalesce(nullif(p_reason,''),'Ведущий просит бросок.')), 1200),
    p_dc,
    v_visibility,
    v_modifier_value,
    v_modifier
  )
  returning * into v_request;

  v_payload := jsonb_build_object(
    'requestId', v_request.id,
    'status', 'pending',
    'rollType', v_request.roll_type,
    'label', v_request.label,
    'reason', v_request.reason,
    'characterId', v_request.character_id,
    'targetUserId', v_request.target_user_id,
    'skillKey', v_request.skill_key,
    'abilityKey', v_request.ability_key,
    'modifier', v_request.resolved_modifier,
    'dcVisibility', v_request.dc_visibility
  );

  if v_request.dc_visibility = 'public' and v_request.dc is not null then
    v_payload := v_payload || jsonb_build_object('dc', v_request.dc);
  end if;

  perform set_config('meganot.ai_gm_runtime', 'on', true);

  insert into public.chat_messages (
    room_id,
    client_id,
    user_id,
    character_id,
    author_name,
    body,
    event_kind,
    event_payload
  )
  values (
    v_room.id,
    v_manager_user_id,
    v_manager_user_id,
    null,
    'Рассказчик',
    '',
    'roll_request',
    v_payload
  )
  returning id into v_message_id;

  update public.ai_gm_roll_requests
  set request_message_id = v_message_id,
      updated_at = now()
  where id = v_request.id;

  update public.agent_jobs
  set status = 'waiting_for_user',
      result = coalesce(result,'{}'::jsonb) || jsonb_build_object(
        'waiting_for', 'player_roll',
        'pending_roll_request_id', v_request.id,
        'pending_roll_message_id', v_message_id
      ),
      updated_at = now(),
      error_code = null,
      error_message = null
  where id = v_job.id;

  return jsonb_build_object(
    'request_id', v_request.id,
    'request_message_id', v_message_id,
    'status', 'pending',
    'job_id', v_job.id,
    'modifier', v_request.resolved_modifier
  );
end;
$$;

revoke all on function public.create_ai_gm_roll_request_v1(
  uuid,uuid,text,text,text,text,text,text,integer,text
) from public, anon, authenticated;
grant execute on function public.create_ai_gm_roll_request_v1(
  uuid,uuid,text,text,text,text,text,text,integer,text
) to service_role;

create or replace function public.resolve_ai_gm_roll_request_v1(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.ai_gm_roll_requests%rowtype;
  v_job public.agent_jobs%rowtype;
  v_message_id bigint;
  v_message public.chat_messages%rowtype;
  v_success boolean;
  v_safe_request_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_request
  from public.ai_gm_roll_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'ai_gm_roll_request_not_found';
  end if;

  if v_request.target_user_id is distinct from auth.uid() then
    raise exception 'ai_gm_roll_request_not_yours';
  end if;

  if v_request.status = 'resolved' then
    return jsonb_build_object(
      'request_id', v_request.id,
      'status', 'resolved',
      'job_id', v_request.gm_job_id,
      'result_message_id', v_request.result_message_id,
      'd20', v_request.result_d20,
      'total', v_request.result_total
    );
  end if;

  if v_request.status <> 'pending' then
    raise exception 'ai_gm_roll_request_not_pending';
  end if;

  select * into v_job
  from public.agent_jobs
  where id = v_request.gm_job_id
    and campaign_id = v_request.campaign_id
    and job_type = 'conversation_turn'
    and input ->> 'surface' = 'game_chat_v1'
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_roll_job_not_found';
  end if;

  if v_job.status <> 'waiting_for_user' then
    raise exception 'ai_gm_roll_job_not_waiting';
  end if;

  v_message_id := public.send_chat_roll_v4(
    v_request.room_id,
    v_request.character_id,
    v_request.label,
    case v_request.roll_type
      when 'save' then 'save'
      when 'attack' then 'attack'
      when 'skill' then 'skill'
      when 'ability' then 'ability'
      else 'custom'
    end,
    v_request.resolved_modifier,
    true,
    0,
    0,
    0,
    1,
    '[]'::jsonb
  );

  select * into v_message
  from public.chat_messages
  where id = v_message_id;

  if v_message.id is null then
    raise exception 'ai_gm_roll_result_message_missing';
  end if;

  update public.chat_messages
  set event_payload = coalesce(event_payload,'{}'::jsonb) || jsonb_build_object(
        'aiGmRollRequestId', v_request.id,
        'requestedByAiGm', true
      )
  where id = v_message_id;

  if v_request.dc is not null then
    v_success := (v_message.event_payload ->> 'total')::integer >= v_request.dc;
  else
    v_success := null;
  end if;

  update public.ai_gm_roll_requests
  set status = 'resolved',
      result_message_id = v_message_id,
      result_d20 = (v_message.event_payload ->> 'd20')::integer,
      result_total = (v_message.event_payload ->> 'total')::integer,
      resolved_at = now(),
      updated_at = now()
  where id = v_request.id;

  v_safe_request_payload := jsonb_build_object(
    'status', 'resolved',
    'resultMessageId', v_message_id,
    'resultD20', (v_message.event_payload ->> 'd20')::integer,
    'resultTotal', (v_message.event_payload ->> 'total')::integer
  );

  if v_request.dc_visibility = 'public' and v_request.dc is not null then
    v_safe_request_payload := v_safe_request_payload || jsonb_build_object(
      'dc', v_request.dc,
      'success', v_success
    );
  end if;

  update public.chat_messages
  set event_payload = coalesce(event_payload,'{}'::jsonb) || v_safe_request_payload
  where id = v_request.request_message_id;

  update public.agent_jobs
  set status = 'queued',
      input = coalesce(input,'{}'::jsonb) || jsonb_build_object(
        'continuation_kind', 'player_roll',
        'continuation_roll_request_id', v_request.id,
        'continuation_chat_message_id', v_message_id
      ),
      result = coalesce(result,'{}'::jsonb) || jsonb_build_object(
        'waiting_for', null,
        'pending_roll_request_id', null,
        'roll_result', jsonb_build_object(
          'request_id', v_request.id,
          'result_message_id', v_message_id,
          'd20', (v_message.event_payload ->> 'd20')::integer,
          'total', (v_message.event_payload ->> 'total')::integer,
          'modifier', v_request.resolved_modifier,
          'roll_type', v_request.roll_type,
          'skill_key', v_request.skill_key,
          'ability_key', v_request.ability_key,
          'dc_visibility', v_request.dc_visibility,
          'dc', case when v_request.dc_visibility = 'public' then v_request.dc else null end,
          'success', case
            when v_request.dc_visibility = 'public' then v_success
            else null
          end
        )
      ),
      completed_at = null,
      updated_at = now(),
      error_code = null,
      error_message = null
  where id = v_job.id;

  return jsonb_build_object(
    'request_id', v_request.id,
    'status', 'resolved',
    'job_id', v_job.id,
    'result_message_id', v_message_id,
    'd20', (v_message.event_payload ->> 'd20')::integer,
    'total', (v_message.event_payload ->> 'total')::integer
  );
end;
$$;

revoke all on function public.resolve_ai_gm_roll_request_v1(uuid)
  from public, anon;
grant execute on function public.resolve_ai_gm_roll_request_v1(uuid)
  to authenticated;

create or replace function public.reserve_ai_gm_roll_resume_v1(
  p_campaign_id uuid,
  p_user_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.ai_gm_roll_requests%rowtype;
  v_job public.agent_jobs%rowtype;
begin
  select * into v_request
  from public.ai_gm_roll_requests
  where id = p_request_id
    and campaign_id = p_campaign_id;

  if v_request.id is null then
    raise exception 'ai_gm_roll_request_not_found';
  end if;

  if v_request.target_user_id is distinct from p_user_id then
    raise exception 'ai_gm_roll_resume_not_yours';
  end if;

  if v_request.status <> 'resolved'
     or v_request.result_message_id is null
  then
    raise exception 'ai_gm_roll_request_not_resolved';
  end if;

  select * into v_job
  from public.agent_jobs
  where id = v_request.gm_job_id
    and campaign_id = p_campaign_id
    and job_type = 'conversation_turn'
    and input ->> 'surface' = 'game_chat_v1';

  if v_job.id is null then
    raise exception 'ai_gm_roll_job_not_found';
  end if;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'request_id', v_request.id,
    'result_message_id', v_request.result_message_id
  );
end;
$$;

revoke all on function public.reserve_ai_gm_roll_resume_v1(
  uuid,uuid,uuid
) from public, anon, authenticated;
grant execute on function public.reserve_ai_gm_roll_resume_v1(
  uuid,uuid,uuid
) to service_role;

comment on table public.ai_gm_roll_requests is
  'Stage 5 durable AI GM player-roll requests. Hidden DC is server-only; player-visible chat payload never contains it.';

comment on function public.create_ai_gm_roll_request_v1(
  uuid,uuid,text,text,text,text,text,text,integer,text
) is
  'Stage 5 service boundary: resolves modifier from canonical character runtime, publishes request card and hard-pauses the same GM job.';

comment on function public.resolve_ai_gm_roll_request_v1(uuid) is
  'Stage 5 player boundary: rolls exactly once via canonical chat roll runtime, resolves the request and queues the same GM job for continuation.';
