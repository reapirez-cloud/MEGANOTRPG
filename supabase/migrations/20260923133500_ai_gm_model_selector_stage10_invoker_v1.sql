-- AI GM Stage 10 hardening: selector RPCs rely on RLS instead of SECURITY DEFINER.

drop policy if exists ai_models_read on public.ai_models;
create policy ai_models_read
on public.ai_models
for select
to authenticated
using (
  enabled=true
  and model_kind='agent'
  and access_scope='campaign'
  and (
    is_base=true
    or user_selectable=true
    or gm_selectable=true
  )
);

create or replace function public.list_campaign_gm_models_v1(
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
security invoker
set search_path=''
as $$
declare
  v_selected_model_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'auth_required';
  end if;

  if not private.is_campaign_member(
    p_campaign_id,
    (select auth.uid())
  ) then
    raise exception 'campaign_membership_required';
  end if;

  select s.selected_model_id
    into v_selected_model_id
  from public.ai_agent_settings s
  join public.ai_models m
    on m.id=s.selected_model_id
  where s.campaign_id=p_campaign_id
    and s.agent_key='gm'
    and m.enabled=true
    and m.model_kind='agent'
    and m.access_scope='campaign'
    and m.gm_selectable=true
    and m.supports_json=true;

  if v_selected_model_id is null then
    select m.id into v_selected_model_id
    from public.ai_models m
    where m.enabled=true
      and m.model_kind='agent'
      and m.access_scope='campaign'
      and m.gm_selectable=true
      and m.supports_json=true
    order by m.is_base desc,m.reasoning_tier desc,m.cost_tier asc,m.display_name
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
  where m.enabled=true
    and m.model_kind='agent'
    and m.access_scope='campaign'
    and m.gm_selectable=true
    and m.supports_json=true
  order by
    (m.id=v_selected_model_id) desc,
    m.reasoning_tier desc,
    m.cost_tier asc,
    m.display_name asc;
end;
$$;

create or replace function public.set_campaign_gm_model_v1(
  p_campaign_id uuid,
  p_model_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if not private.is_campaign_manager(p_campaign_id,v_user_id) then
    raise exception 'campaign_manager_required';
  end if;

  if not exists(
    select 1
    from public.ai_models m
    where m.id=p_model_id
      and m.enabled=true
      and m.model_kind='agent'
      and m.access_scope='campaign'
      and m.gm_selectable=true
      and m.supports_json=true
  ) then
    raise exception 'gm_model_not_selectable';
  end if;

  insert into public.ai_agent_settings(
    campaign_id,agent_key,selected_model_id,updated_by,updated_at
  )
  values(
    p_campaign_id,'gm',p_model_id,v_user_id,now()
  )
  on conflict(campaign_id,agent_key) do update set
    selected_model_id=excluded.selected_model_id,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at;

  return p_model_id;
end;
$$;
