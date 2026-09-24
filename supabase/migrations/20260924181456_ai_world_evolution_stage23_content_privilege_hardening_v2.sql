-- Stage 23 least-privilege closure for the service runtime.
revoke all on table public.ai_gm_content_settings from service_role;
grant select, insert, update on table public.ai_gm_content_settings to service_role;
