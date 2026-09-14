revoke all on public.ai_models from public, anon, authenticated;
revoke all on public.ai_agent_settings from public, anon, authenticated;
revoke all on public.ai_threads from public, anon, authenticated;
revoke all on public.ai_messages from public, anon, authenticated;

grant select on public.ai_models to authenticated;
grant select, insert, update on public.ai_agent_settings to authenticated;
grant select on public.ai_threads to authenticated;
grant select on public.ai_messages to authenticated;
