drop index if exists public.ai_draft_apply_runs_one_per_revision_idx;

create unique index ai_draft_apply_runs_one_per_revision_idx
  on public.ai_draft_apply_runs (draft_id, draft_revision)
  where status in ('running','succeeded','partial_failed');

create or replace function public.finish_ai_draft_apply_v2(
  p_run_id uuid,
  p_succeeded boolean,
  p_partial_hint boolean default false,
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
      when p_partial_hint
        or jsonb_array_length(v_run.completed_steps) > 0
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

revoke all on function public.finish_ai_draft_apply_v2(uuid, boolean, boolean, text) from public;
grant execute on function public.finish_ai_draft_apply_v2(uuid, boolean, boolean, text) to authenticated;
