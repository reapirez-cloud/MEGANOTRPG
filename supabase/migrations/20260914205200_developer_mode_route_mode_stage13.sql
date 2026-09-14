alter table public.ai_model_route_runs
  drop constraint if exists ai_model_route_runs_route_mode_check;

alter table public.ai_model_route_runs
  add constraint ai_model_route_runs_route_mode_check
  check (route_mode = any (array[
    'base_lock'::text,
    'auto'::text,
    'primary'::text,
    'base'::text,
    'fixed'::text,
    'fallback'::text,
    'owner_override'::text
  ]));
