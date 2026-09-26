-- Replace the public Grok 4.6 registry entry in place so campaign settings
-- keep the same selected_model_id while the provider model id advances to 4.7.

do $migration$
begin
  if exists (
    select 1 from public.ai_models where model_key='grok-4.7'
  ) then
    raise exception 'grok-4.7 registry row already exists';
  end if;

  update public.ai_models
  set model_key='grok-4.7',
      display_name='Grok 4.7',
      context_window=500000,
      supports_tools=true,
      supports_json=true,
      supports_streaming=true,
      supports_vision=true,
      enabled=true,
      gm_selectable=true,
      user_selectable=true,
      reasoning_tier=5,
      updated_at=now()
  where model_key='grok-4.6';

  if not found then
    raise exception 'grok-4.6 registry row not found';
  end if;
end
$migration$;
