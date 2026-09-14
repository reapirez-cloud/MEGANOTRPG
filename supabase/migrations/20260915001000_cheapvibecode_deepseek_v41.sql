-- CheapVibeCode model registry correction.
-- Confirmed provider model:
--   deepseek-v4.1-flash
--   multimodal text + image input
--   1M context
-- The previous V4 Flash / Pro / Vision EXP ids were speculative placeholders.

update public.ai_models
set
  provider_key = 'deepseek',
  model_key = 'deepseek-v4.1-flash',
  display_name = 'DeepSeek V4.1 Flash',
  enabled = true,
  is_base = true,
  gm_selectable = true,
  supports_tools = true,
  supports_json = true,
  supports_streaming = true,
  supports_vision = true,
  context_window = 1000000,
  cost_tier = 1,
  reasoning_tier = 4,
  latency_tier = 1,
  model_kind = 'agent',
  access_scope = 'campaign',
  updated_at = now()
where provider_key = 'deepseek'
  and is_base = true;

update public.ai_models
set
  enabled = false,
  is_base = false,
  gm_selectable = false,
  updated_at = now()
where provider_key = 'deepseek'
  and model_key <> 'deepseek-v4.1-flash';
