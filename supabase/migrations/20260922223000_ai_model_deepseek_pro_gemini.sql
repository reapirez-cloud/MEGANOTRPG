-- Enable DeepSeek V4 Pro and add Gemini 3.8 Flash to Voss model selection.
-- Reasoning effort is enforced in provider-gateway.ts by model_key.

update public.ai_models
set
  provider_key = 'deepseek',
  display_name = 'DeepSeek V4 Pro',
  enabled = true,
  is_base = false,
  gm_selectable = true,
  user_selectable = true,
  supports_tools = true,
  supports_json = true,
  supports_streaming = true,
  supports_vision = false,
  context_window = 1000000,
  cost_tier = 3,
  reasoning_tier = 5,
  latency_tier = 3,
  model_kind = 'agent',
  access_scope = 'campaign',
  updated_at = now()
where model_key = 'deepseek-v4-pro';

insert into public.ai_models (
  provider_key, model_key, display_name, enabled, is_base,
  gm_selectable, user_selectable,
  supports_tools, supports_json, supports_streaming, supports_vision,
  context_window, cost_tier, reasoning_tier, latency_tier,
  model_kind, access_scope
)
values (
  'openai-compatible',
  'gemini-3.8-flash',
  'Gemini 3.8 Flash',
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  true,
  1000000,
  1,
  4,
  1,
  'agent',
  'campaign'
)
on conflict (model_key) do update set
  provider_key = excluded.provider_key,
  display_name = excluded.display_name,
  enabled = true,
  is_base = false,
  gm_selectable = true,
  user_selectable = true,
  supports_tools = true,
  supports_json = true,
  supports_streaming = true,
  supports_vision = true,
  context_window = excluded.context_window,
  cost_tier = excluded.cost_tier,
  reasoning_tier = excluded.reasoning_tier,
  latency_tier = excluded.latency_tier,
  model_kind = 'agent',
  access_scope = 'campaign',
  updated_at = now();
