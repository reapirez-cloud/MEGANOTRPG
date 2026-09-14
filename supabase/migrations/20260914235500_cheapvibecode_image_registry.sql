-- CheapVibeCode exposes GPT Image 2 through an OpenAI-compatible image API.
-- Retire the speculative Stage 11 image model aliases and register the actual
-- provider/model pair used by the runtime image profiles.

update public.ai_models
set enabled = false,
    updated_at = now()
where model_kind = 'image'
  and model_key in ('gpt-image-2.5-flare','gpt-image-2.5-sunburst');

insert into public.ai_models (
  provider_key, model_key, display_name, enabled, is_base, gm_selectable,
  supports_tools, supports_json, supports_streaming, supports_vision,
  context_window, cost_tier, reasoning_tier, latency_tier, model_kind, access_scope
)
values (
  'cheapvibecode-image',
  'gpt-image-2',
  'GPT Image 2 · CheapVibeCode',
  true,
  false,
  false,
  false,
  false,
  false,
  true,
  null,
  3,
  4,
  2,
  'image',
  'campaign'
)
on conflict (model_key) do update set
  provider_key = excluded.provider_key,
  display_name = excluded.display_name,
  enabled = true,
  is_base = false,
  gm_selectable = false,
  supports_tools = false,
  supports_json = false,
  supports_streaming = false,
  supports_vision = true,
  context_window = null,
  cost_tier = excluded.cost_tier,
  reasoning_tier = excluded.reasoning_tier,
  latency_tier = excluded.latency_tier,
  model_kind = 'image',
  access_scope = 'campaign',
  updated_at = now();
