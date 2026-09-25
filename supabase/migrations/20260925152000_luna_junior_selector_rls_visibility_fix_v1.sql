create or replace function public.list_campaign_ai_junior_models_v1(
  p_campaign_id uuid
)
returns table(
  id uuid,
  model_key text,
  display_name text,
  supports_tools boolean,
  supports_json boolean,
  supports_vision boolean,
  context_window integer,
  cost_tier smallint,
  reasoning_tier smallint,
  latency_tier smallint,
  selected boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_selected_model_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_gm_junior_model_ai_world_only';
  end if;
  if not private.is_campaign_member(p_campaign_id,v_user_id) then
    raise exception 'campaign_membership_required';
  end if;

  select s.selected_model_id into v_selected_model_id
  from public.ai_agent_settings s
  join public.ai_models m on m.id=s.selected_model_id
  where s.campaign_id=p_campaign_id
    and s.agent_key='junior'
    and private.can_select_campaign_junior_model_v1(m.id);

  if v_selected_model_id is null then
    select m.id into v_selected_model_id
    from public.ai_models m
    where m.model_key='deepseek-v4.1-flash'
      and private.can_select_campaign_junior_model_v1(m.id)
    limit 1;
  end if;

  return query
  select
    m.id,
    m.model_key,
    m.display_name,
    m.supports_tools,
    m.supports_json,
    m.supports_vision,
    m.context_window,
    m.cost_tier,
    m.reasoning_tier,
    m.latency_tier,
    m.id=v_selected_model_id
  from public.ai_models m
  where private.can_select_campaign_junior_model_v1(m.id)
  order by
    (m.id=v_selected_model_id) desc,
    m.cost_tier asc,
    m.latency_tier asc,
    m.reasoning_tier desc,
    m.display_name asc;
end;
$function$;

revoke all on function public.list_campaign_ai_junior_models_v1(uuid) from public;
revoke all on function public.list_campaign_ai_junior_models_v1(uuid) from anon;
grant execute on function public.list_campaign_ai_junior_models_v1(uuid)
  to authenticated,service_role;

comment on function public.list_campaign_ai_junior_models_v1(uuid) is
  'Campaign AI-world junior-worker model selector. Uses a membership-checked definer read so junior-only models hidden by ai_models RLS (for example GPT-5.6 Luna) remain selectable without exposing them to primary/global model selectors.';
