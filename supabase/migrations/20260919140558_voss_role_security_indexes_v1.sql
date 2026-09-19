create index if not exists ai_security_events_user_id_idx
  on public.ai_security_events (user_id);

create index if not exists ai_security_events_thread_id_idx
  on public.ai_security_events (thread_id)
  where thread_id is not null;

create index if not exists ai_security_events_message_id_idx
  on public.ai_security_events (message_id)
  where message_id is not null;

create index if not exists ai_security_states_user_id_idx
  on public.ai_security_states (user_id);

create index if not exists ai_security_states_last_event_id_idx
  on public.ai_security_states (last_event_id)
  where last_event_id is not null;
