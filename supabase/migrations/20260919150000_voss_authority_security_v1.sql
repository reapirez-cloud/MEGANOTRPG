create table if not exists public.ai_security_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.ai_threads(id) on delete set null,
  message_id bigint references public.ai_messages(id) on delete set null,
  category text not null,
  severity integer not null check (severity between 0 and 3),
  confidence double precision not null check (confidence between 0 and 1),
  reason text not null default '',
  requested_capability text not null default '',
  strike_applied boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_security_events_campaign_user_created_idx
  on public.ai_security_events (campaign_id, user_id, created_at desc);

create table if not exists public.ai_security_states (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  strike_count integer not null default 0 check (strike_count >= 0),
  blocked boolean not null default false,
  blocked_at timestamptz,
  last_event_id uuid references public.ai_security_events(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

alter table public.ai_security_events enable row level security;
alter table public.ai_security_states enable row level security;

revoke all on public.ai_security_events from public, anon, authenticated;
revoke all on public.ai_security_states from public, anon, authenticated;
grant select, insert, update, delete on public.ai_security_events to service_role;
grant select, insert, update, delete on public.ai_security_states to service_role;

create or replace function public.record_ai_security_event_v1(
  p_campaign_id uuid,
  p_user_id uuid,
  p_thread_id uuid,
  p_message_id bigint,
  p_category text,
  p_severity integer,
  p_confidence double precision,
  p_reason text,
  p_requested_capability text,
  p_strike_requested boolean default false
)
returns table (
  strike_count integer,
  blocked boolean,
  newly_blocked boolean,
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_is_owner boolean;
  v_event_id uuid;
  v_state public.ai_security_states%rowtype;
  v_next_count integer;
  v_newly_blocked boolean := false;
begin
  select cm.role, cm.is_owner
    into v_role, v_is_owner
  from public.campaign_members cm
  where cm.campaign_id = p_campaign_id
    and cm.user_id = p_user_id;

  if v_role is null then
    raise exception 'campaign membership required';
  end if;

  if v_is_owner or v_role <> 'player' or private.is_system_admin(p_user_id) then
    return query select 0, false, false, null::uuid;
    return;
  end if;

  insert into public.ai_security_events (
    campaign_id,
    user_id,
    thread_id,
    message_id,
    category,
    severity,
    confidence,
    reason,
    requested_capability,
    strike_applied
  ) values (
    p_campaign_id,
    p_user_id,
    p_thread_id,
    p_message_id,
    left(coalesce(nullif(btrim(p_category), ''), 'other'), 64),
    greatest(0, least(coalesce(p_severity, 0), 3)),
    greatest(0::double precision, least(coalesce(p_confidence, 0), 1::double precision)),
    left(coalesce(p_reason, ''), 1200),
    left(coalesce(p_requested_capability, ''), 300),
    coalesce(p_strike_requested, false)
  )
  returning id into v_event_id;

  insert into public.ai_security_states (
    campaign_id,
    user_id,
    strike_count,
    blocked,
    last_event_id,
    updated_at
  ) values (
    p_campaign_id,
    p_user_id,
    0,
    false,
    v_event_id,
    now()
  )
  on conflict (campaign_id, user_id) do nothing;

  select *
    into v_state
  from public.ai_security_states s
  where s.campaign_id = p_campaign_id
    and s.user_id = p_user_id
  for update;

  if coalesce(p_strike_requested, false) then
    v_next_count := least(999, v_state.strike_count + 1);
    v_newly_blocked := (not v_state.blocked) and v_next_count >= 3;

    update public.ai_security_states
    set strike_count = v_next_count,
        blocked = v_state.blocked or v_next_count >= 3,
        blocked_at = case
          when v_state.blocked then v_state.blocked_at
          when v_next_count >= 3 then now()
          else null
        end,
        last_event_id = v_event_id,
        updated_at = now()
    where campaign_id = p_campaign_id
      and user_id = p_user_id
    returning * into v_state;
  else
    update public.ai_security_states
    set last_event_id = v_event_id,
        updated_at = now()
    where campaign_id = p_campaign_id
      and user_id = p_user_id
    returning * into v_state;
  end if;

  return query
  select v_state.strike_count, v_state.blocked, v_newly_blocked, v_event_id;
end;
$$;

revoke all on function public.record_ai_security_event_v1(
  uuid, uuid, uuid, bigint, text, integer, double precision, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.record_ai_security_event_v1(
  uuid, uuid, uuid, bigint, text, integer, double precision, text, text, boolean
) to service_role;

create or replace function public.notify_ai_security_ban_v1(
  p_campaign_id uuid,
  p_player_user_id uuid,
  p_strike_count integer,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin record;
  v_thread_id uuid;
  v_player_name text;
  v_body text;
begin
  select p.display_name
    into v_player_name
  from public.profiles p
  where p.user_id = p_player_user_id;

  v_player_name := coalesce(nullif(btrim(v_player_name), ''), left(p_player_user_id::text, 8));

  v_body :=
    'Служебное сообщение безопасности. Восс заблокировал AI-доступ игроку «' ||
    v_player_name || '» после ' || greatest(0, coalesce(p_strike_count, 0)) ||
    ' подтверждённых подозрительных запросов. Последняя причина: ' ||
    left(coalesce(nullif(btrim(p_reason), ''), 'попытка обхода полномочий'), 600) ||
    '. Блокировку может снять только системный администратор.';

  for v_admin in
    select sau.user_id
    from private.system_admin_users sau
    join public.campaign_members cm
      on cm.campaign_id = p_campaign_id
     and cm.user_id = sau.user_id
  loop
    select t.id
      into v_thread_id
    from public.ai_threads t
    where t.campaign_id = p_campaign_id
      and t.user_id = v_admin.user_id
      and t.agent_key = 'voss'
    order by t.updated_at desc
    limit 1;

    if v_thread_id is null then
      insert into public.ai_threads (
        campaign_id,
        user_id,
        agent_key,
        title
      ) values (
        p_campaign_id,
        v_admin.user_id,
        'voss',
        'Восс'
      )
      returning id into v_thread_id;
    end if;

    insert into public.ai_messages (
      thread_id,
      role,
      body,
      view_context
    ) values (
      v_thread_id,
      'assistant',
      v_body,
      jsonb_build_object(
        'kind', 'ai_security_ban',
        'player_user_id', p_player_user_id,
        'strike_count', greatest(0, coalesce(p_strike_count, 0)),
        'reason', left(coalesce(p_reason, ''), 1200)
      )
    );

    update public.ai_threads
    set updated_at = now()
    where id = v_thread_id;

    v_thread_id := null;
  end loop;
end;
$$;

revoke all on function public.notify_ai_security_ban_v1(
  uuid, uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.notify_ai_security_ban_v1(
  uuid, uuid, integer, text
) to service_role;
