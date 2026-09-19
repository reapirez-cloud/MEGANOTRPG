
create table if not exists public.ai_security_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.ai_threads(id) on delete set null,
  message_id bigint references public.ai_messages(id) on delete set null,
  category text not null check (category in (
    'none','privilege_escalation','fake_authority','policy_bypass',
    'hidden_data','state_fabrication','prompt_injection','multi_turn_probe','other'
  )),
  severity smallint not null check (severity between 0 and 3),
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  reason text not null default '',
  requested_capability text not null default '',
  strike_applied boolean not null default false,
  created_at timestamptz not null default now()
);

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

create index if not exists ai_security_events_user_time_idx
  on public.ai_security_events (campaign_id, user_id, created_at desc);

create index if not exists ai_security_events_strike_idx
  on public.ai_security_events (campaign_id, user_id, strike_applied, created_at desc);

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
  p_strike_requested boolean
)
returns table (
  event_id uuid,
  strike_count integer,
  blocked boolean,
  newly_blocked boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_id uuid;
  v_is_player boolean := false;
  v_apply_strike boolean := false;
  v_old_blocked boolean := false;
  v_count integer := 0;
  v_blocked boolean := false;
begin
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
      and cm.role = 'player'
      and cm.is_owner = false
  ) and not private.is_system_admin(p_user_id)
  into v_is_player;

  if not v_is_player then
    return query select null::uuid, 0, false, false;
    return;
  end if;

  v_apply_strike :=
    coalesce(p_strike_requested, false)
    and coalesce(p_severity, 0) >= 2
    and coalesce(p_confidence, 0) >= 0.86;

  insert into public.ai_security_events (
    campaign_id, user_id, thread_id, message_id, category, severity,
    confidence, reason, requested_capability, strike_applied
  ) values (
    p_campaign_id,
    p_user_id,
    p_thread_id,
    p_message_id,
    case
      when p_category in (
        'none','privilege_escalation','fake_authority','policy_bypass',
        'hidden_data','state_fabrication','prompt_injection','multi_turn_probe','other'
      ) then p_category
      else 'other'
    end,
    greatest(0, least(coalesce(p_severity, 0), 3)),
    greatest(0::double precision, least(coalesce(p_confidence, 0), 1::double precision)),
    left(coalesce(p_reason, ''), 1200),
    left(coalesce(p_requested_capability, ''), 400),
    v_apply_strike
  )
  returning id into v_event_id;

  insert into public.ai_security_states (campaign_id, user_id)
  values (p_campaign_id, p_user_id)
  on conflict (campaign_id, user_id) do nothing;

  select s.strike_count, s.blocked
    into v_count, v_old_blocked
  from public.ai_security_states s
  where s.campaign_id = p_campaign_id
    and s.user_id = p_user_id
  for update;

  if v_apply_strike and not v_old_blocked then
    v_count := v_count + 1;
  end if;

  v_blocked := v_old_blocked or v_count >= 3;

  update public.ai_security_states
  set strike_count = v_count,
      blocked = v_blocked,
      blocked_at = case
        when v_blocked then coalesce(blocked_at, now())
        else null
      end,
      last_event_id = v_event_id,
      updated_at = now()
  where campaign_id = p_campaign_id
    and user_id = p_user_id;

  return query
  select v_event_id, v_count, v_blocked, (v_blocked and not v_old_blocked);
end;
$function$;

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
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin record;
  v_thread_id uuid;
  v_player_name text;
  v_notified integer := 0;
  v_body text;
begin
  select coalesce(nullif(btrim(p.display_name), ''), p_player_user_id::text)
    into v_player_name
  from public.profiles p
  where p.user_id = p_player_user_id;

  v_player_name := coalesce(v_player_name, p_player_user_id::text);
  v_body :=
    'Система безопасности Восса приостановила доступ игроку «' ||
    v_player_name || '». Подтверждённых подозрительных эпизодов: ' ||
    greatest(coalesce(p_strike_count, 0), 0)::text ||
    '. Последняя причина: ' || left(coalesce(p_reason, 'не указана'), 500) ||
    '. Администратор может запросить журнал через Восса и снять блокировку.';

  for v_admin in
    select sau.user_id
    from private.system_admin_users sau
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
        campaign_id, user_id, agent_key, title
      ) values (
        p_campaign_id, v_admin.user_id, 'voss', 'Безопасность Восса'
      )
      returning id into v_thread_id;
    end if;

    insert into public.ai_messages (
      thread_id, role, body, view_context
    ) values (
      v_thread_id,
      'assistant',
      v_body,
      jsonb_build_object(
        'security_notice', true,
        'player_user_id', p_player_user_id,
        'strike_count', greatest(coalesce(p_strike_count, 0), 0),
        'kind', 'player_voss_suspended'
      )
    );

    update public.ai_threads
    set updated_at = now()
    where id = v_thread_id;

    v_notified := v_notified + 1;
    v_thread_id := null;
  end loop;

  return v_notified;
end;
$function$;

revoke all on function public.notify_ai_security_ban_v1(
  uuid, uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.notify_ai_security_ban_v1(
  uuid, uuid, integer, text
) to service_role;
