create or replace function public.record_ai_draft_apply_step_v1(
  p_run_id uuid,
  p_step jsonb,
  p_entity_key text default null,
  p_entity_type text default null,
  p_entity_id text default null
)
returns void
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
declare
  v_run public.ai_draft_apply_runs%rowtype;
  v_map jsonb;
  v_step_key text;
begin
  select *
    into v_run
  from public.ai_draft_apply_runs
  where id = p_run_id
  for update;

  if v_run.id is null then
    raise exception 'ai_draft_apply_run_not_found';
  end if;

  if v_run.requested_by <> auth.uid()
     or not private.is_campaign_manager(v_run.campaign_id, auth.uid()) then
    raise exception 'ai_draft_gm_required';
  end if;

  if v_run.status <> 'running' then
    raise exception 'ai_draft_apply_run_closed';
  end if;

  if jsonb_typeof(coalesce(p_step, '{}'::jsonb)) <> 'object' then
    raise exception 'ai_draft_invalid_step';
  end if;

  v_step_key := nullif(btrim(coalesce(p_step->>'key', '')), '');
  if v_step_key is null then
    raise exception 'ai_draft_invalid_step';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_run.planned_steps) planned
    where planned->>'key' = v_step_key
  ) then
    raise exception 'ai_draft_step_not_planned';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_run.completed_steps) completed
    where completed->>'key' = v_step_key
  ) then
    raise exception 'ai_draft_step_already_recorded';
  end if;

  v_map := v_run.entity_map;

  if nullif(btrim(coalesce(p_entity_key,'')), '') is not null
     and nullif(btrim(coalesce(p_entity_id,'')), '') is not null then
    v_map := jsonb_set(
      v_map,
      array[p_entity_key],
      jsonb_build_object(
        'type', coalesce(p_entity_type, ''),
        'id', p_entity_id
      ),
      true
    );
  end if;

  update public.ai_draft_apply_runs
  set completed_steps = completed_steps || jsonb_build_array(p_step),
      entity_map = v_map,
      updated_at = now()
  where id = p_run_id;
end;
$$;

create or replace function public.finish_ai_draft_apply_v1(
  p_run_id uuid,
  p_succeeded boolean,
  p_error text default null
)
returns text
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
declare
  v_run public.ai_draft_apply_runs%rowtype;
  v_status text;
begin
  select *
    into v_run
  from public.ai_draft_apply_runs
  where id = p_run_id
  for update;

  if v_run.id is null then
    raise exception 'ai_draft_apply_run_not_found';
  end if;

  if v_run.requested_by <> auth.uid()
     or not private.is_campaign_manager(v_run.campaign_id, auth.uid()) then
    raise exception 'ai_draft_gm_required';
  end if;

  if v_run.status <> 'running' then
    return v_run.status;
  end if;

  if p_succeeded then
    if jsonb_array_length(v_run.completed_steps)
       <> jsonb_array_length(v_run.planned_steps) then
      raise exception 'ai_draft_apply_incomplete';
    end if;

    v_status := 'succeeded';

    update public.ai_drafts
    set status = 'applied',
        applied_at = now(),
        applied_by = auth.uid(),
        updated_at = now()
    where id = v_run.draft_id
      and status = 'review'
      and current_revision = v_run.draft_revision;

    if not found then
      raise exception 'ai_draft_revision_conflict';
    end if;
  else
    v_status := case
      when jsonb_array_length(v_run.completed_steps) > 0
        then 'partial_failed'
      else 'failed'
    end;
  end if;

  update public.ai_draft_apply_runs
  set status = v_status,
      error = nullif(left(coalesce(p_error, ''), 4000), ''),
      updated_at = now()
  where id = p_run_id;

  return v_status;
end;
$$;
