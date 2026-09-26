create or replace function private.force_ai_gm_media_low_budget_v1()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  if new.job_type='image_generate'
     and coalesce(new.input->>'surface','')='ai_gm_media_stage9_v1'
  then
    new.input := jsonb_set(
      jsonb_set(
        coalesce(new.input,'{}'::jsonb),
        '{generation_tier}',
        to_jsonb('low'::text),
        true
      ),
      '{target_token_budget}',
      to_jsonb(50000),
      true
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists force_ai_gm_media_low_budget_v1 on public.agent_jobs;
create trigger force_ai_gm_media_low_budget_v1
before insert or update of input
on public.agent_jobs
for each row
execute function private.force_ai_gm_media_low_budget_v1();

update public.agent_jobs
set input = jsonb_set(
  jsonb_set(input,'{generation_tier}',to_jsonb('low'::text),true),
  '{target_token_budget}',to_jsonb(50000),true
)
where job_type='image_generate'
  and status='queued'
  and input->>'surface'='ai_gm_media_stage9_v1';

update public.ai_models
set display_name='Grok 4.6',
    context_window=500000,
    supports_tools=true,
    supports_json=true,
    supports_streaming=true,
    supports_vision=true,
    enabled=true,
    gm_selectable=true,
    user_selectable=true,
    updated_at=now()
where model_key='grok-4.6';

comment on function private.force_ai_gm_media_low_budget_v1() is
  'Hard safety clamp for automatic AI-GM Stage 9 image jobs: low quality and a 50k target budget while test art is enabled.';
