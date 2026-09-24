-- Route new background-world daily runs through the campaign's selected junior model.

create or replace function public.reserve_ai_background_daily_run_v1(
  p_campaign_id uuid,
  p_campaign_day integer,
  p_worker_model text default 'deepseek-v4.1-flash',
  p_audit jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_model text := btrim(coalesce(p_worker_model,''));
  v_audit jsonb := coalesce(p_audit,'{}'::jsonb);
  v_existing public.ai_background_daily_runs%rowtype;
  v_created public.ai_background_daily_runs%rowtype;
  v_selected_model text;
begin
  if p_campaign_id is null or p_campaign_day is null or p_campaign_day < 1 then
    raise exception using errcode='22023',message='ai_background_run_input_invalid';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501',message='ai_background_ai_world_only';
  end if;
  if jsonb_typeof(v_audit)<>'object' then
    raise exception using errcode='22023',message='ai_background_audit_must_be_object';
  end if;

  -- Stage 9 historically passed the Flash default explicitly. For automatic
  -- daily runs, replace that default with the campaign's current junior choice.
  if coalesce(v_audit->>'reserved_by','')='stage9-daily-candidate-resolver' then
    select m.model_key into v_selected_model
    from public.ai_agent_settings s
    join public.ai_models m on m.id=s.selected_model_id
    where s.campaign_id=p_campaign_id
      and s.agent_key='junior'
      and private.can_select_campaign_junior_model_v1(m.id)
    limit 1;

    v_model:=coalesce(nullif(v_selected_model,''),v_model);
  end if;

  if length(v_model)<1 or length(v_model)>160 then
    raise exception using errcode='22023',message='ai_background_worker_model_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_campaign_id::text||':background-day:'||p_campaign_day::text,
      0
    )
  );

  select * into v_existing
  from public.ai_background_daily_runs
  where campaign_id=p_campaign_id and campaign_day=p_campaign_day;

  if found then
    return jsonb_build_object('run',to_jsonb(v_existing),'replayed',true);
  end if;

  insert into public.ai_background_daily_runs(
    campaign_id,campaign_day,worker_model,audit
  )
  values(p_campaign_id,p_campaign_day,v_model,v_audit)
  returning * into v_created;

  return jsonb_build_object('run',to_jsonb(v_created),'replayed',false);
end;
$function$;

revoke all on function public.reserve_ai_background_daily_run_v1(uuid,integer,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.reserve_ai_background_daily_run_v1(uuid,integer,text,jsonb)
  to service_role;
