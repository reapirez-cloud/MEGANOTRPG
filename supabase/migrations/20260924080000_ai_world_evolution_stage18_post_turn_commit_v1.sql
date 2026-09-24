create extension if not exists pgcrypto with schema extensions;

create table if not exists public.ai_gm_turn_commit_gates (
  id uuid primary key default extensions.gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  source_message_id bigint not null references public.chat_messages(id) on delete cascade,
  reply_message_id bigint not null references public.chat_messages(id) on delete cascade,
  parent_job_id uuid not null references public.agent_jobs(id) on delete cascade,
  post_job_id uuid unique references public.agent_jobs(id) on delete set null,
  state text not null default 'pending' check (state in ('pending','running','completed','failed')),
  post_turn_intents jsonb not null default '[]'::jsonb,
  published_answer text not null,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz
);

create unique index if not exists ai_gm_turn_commit_gates_source_uq
  on public.ai_gm_turn_commit_gates(source_message_id);
create index if not exists ai_gm_turn_commit_gates_room_state_idx
  on public.ai_gm_turn_commit_gates(room_id,state,created_at desc);

alter table public.ai_gm_turn_commit_gates enable row level security;
revoke all on table public.ai_gm_turn_commit_gates from public, anon, authenticated;

create or replace function private.ai_gm_post_turn_gate_trigger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if current_setting('meganot.ai_gm_runtime', true) = 'on' then
    return new;
  end if;

  if new.character_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.ai_gm_turn_commit_gates g
    where g.room_id = new.room_id
      and g.state in ('pending','running','failed')
  ) then
    raise exception 'ai_gm_post_turn_commit_in_progress';
  end if;

  if exists (
    select 1
    from public.agent_jobs j
    where j.job_type='conversation_turn'
      and j.input->>'surface'='game_chat_v1'
      and j.input->>'room_id'=new.room_id::text
      and j.status='waiting_for_user'
  ) then
    raise exception 'ai_gm_roll_wait_in_progress';
  end if;

  return new;
end;
$$;

drop trigger if exists ai_gm_post_turn_gate on public.chat_messages;
create trigger ai_gm_post_turn_gate
before insert on public.chat_messages
for each row execute function private.ai_gm_post_turn_gate_trigger();

create or replace function public.create_ai_gm_post_turn_commit_v1(
  p_parent_job_id uuid,
  p_campaign_id uuid,
  p_room_id uuid,
  p_source_chat_message_id bigint,
  p_reply_message_id bigint,
  p_manager_user_id uuid,
  p_source_character_id uuid,
  p_original_message text,
  p_published_answer text,
  p_post_turn_intents jsonb
) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_existing public.ai_gm_turn_commit_gates%rowtype;
  v_gate_id uuid;
  v_job_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;

  select * into v_existing
  from public.ai_gm_turn_commit_gates
  where source_message_id=p_source_chat_message_id
  for update;

  if v_existing.id is not null then
    return jsonb_build_object('job_id',v_existing.post_job_id,'gate_id',v_existing.id,'state',v_existing.state);
  end if;

  v_gate_id := extensions.gen_random_uuid();

  insert into public.ai_gm_turn_commit_gates(
    id,campaign_id,room_id,source_message_id,reply_message_id,parent_job_id,
    state,post_turn_intents,published_answer
  ) values (
    v_gate_id,p_campaign_id,p_room_id,p_source_chat_message_id,p_reply_message_id,p_parent_job_id,
    'pending',coalesce(p_post_turn_intents,'[]'::jsonb),left(coalesce(p_published_answer,''),4000)
  );

  insert into public.agent_jobs(
    campaign_id,thread_id,requested_by,agent_key,job_type,status,input,result,requested_outputs,completed_outputs
  ) values (
    p_campaign_id,null,p_manager_user_id,'voss','ai_gm_post_turn_commit','queued',
    jsonb_build_object(
      'surface','game_chat_v1',
      'room_id',p_room_id::text,
      'source_chat_message_id',p_source_chat_message_id::text,
      'reply_message_id',p_reply_message_id::text,
      'parent_job_id',p_parent_job_id::text,
      'manager_user_id',p_manager_user_id::text,
      'source_character_id',p_source_character_id::text,
      'original_message',left(coalesce(p_original_message,''),4000),
      'published_answer',left(coalesce(p_published_answer,''),4000),
      'post_turn_intents',coalesce(p_post_turn_intents,'[]'::jsonb)
    ),
    jsonb_build_object('runtime_stage',18,'gate_id',v_gate_id),
    1,0
  ) returning id into v_job_id;

  update public.ai_gm_turn_commit_gates
  set post_job_id=v_job_id,updated_at=now()
  where id=v_gate_id;

  return jsonb_build_object('job_id',v_job_id,'gate_id',v_gate_id,'state','pending');
end;
$$;

revoke all on function public.create_ai_gm_post_turn_commit_v1(uuid,uuid,uuid,bigint,bigint,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_ai_gm_post_turn_commit_v1(uuid,uuid,uuid,bigint,bigint,uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.get_ai_gm_room_status_v1(p_room_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.chat_rooms%rowtype;
  v_job public.agent_jobs%rowtype;
  v_gate public.ai_gm_turn_commit_gates%rowtype;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;

  select * into v_room from public.chat_rooms r where r.id=p_room_id;
  if v_room.id is null or not private.can_read_chat_room(p_room_id) then raise exception 'chat_room_read_required'; end if;

  select * into v_gate
  from public.ai_gm_turn_commit_gates g
  where g.room_id=p_room_id and g.state in ('pending','running','failed')
  order by g.created_at desc
  limit 1;

  if v_gate.id is not null then
    return jsonb_build_object(
      'active',true,
      'phase','post_turn_commit',
      'label',case when v_gate.state='failed' then 'Синхронизация мира не завершилась' else 'Младший шуршит…' end,
      'room_id',p_room_id,
      'gate_id',v_gate.id,
      'gate_state',v_gate.state,
      'job_id',v_gate.post_job_id,
      'job_status',case when v_gate.state='failed' then 'failed' else 'running' end,
      'error_code',case when v_gate.state='failed' then 'stage18_post_turn_commit_failed' else null end,
      'error_message',v_gate.last_error,
      'updated_at',v_gate.updated_at,
      'runtime_stage',18
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

  if v_job.id is null then
    return jsonb_build_object('active',false,'phase','idle','label','ИИ-ГМ готов','room_id',p_room_id,'runtime_stage',12);
  end if;

  return jsonb_build_object(
    'active',v_job.status in ('queued','running','waiting_for_user'),
    'phase',case
      when v_job.status='queued' then 'queued'
      when v_job.status='running' then coalesce(nullif(v_job.result->>'runtime_phase',''),'thinking')
      when v_job.status='waiting_for_user' then 'waiting_for_roll'
      when v_job.status='failed' then 'failed'
      when v_job.status='cancelled' then 'cancelled'
      when v_job.status='completed' then 'completed'
      else v_job.status end,
    'label',case
      when v_job.status='queued' then 'ИИ-ГМ запускается'
      when v_job.status='running' then 'ИИ-ГМ думает'
      when v_job.status='waiting_for_user' then 'ИИ-ГМ ждёт бросок'
      when v_job.status='failed' then 'Ошибка хода ИИ-ГМ'
      when v_job.status='cancelled' then 'Ход ИИ-ГМ отменён'
      when v_job.status='completed' then 'Ход ИИ-ГМ завершён'
      else 'ИИ-ГМ: '||v_job.status end,
    'room_id',p_room_id,'job_id',v_job.id,'job_status',v_job.status,
    'error_code',v_job.error_code,'error_message',v_job.error_message,
    'updated_at',v_job.updated_at,'runtime_stage',12
  );
end;
$$;

grant execute on function public.get_ai_gm_room_status_v1(uuid) to authenticated;
