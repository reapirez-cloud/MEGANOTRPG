alter table public.ai_drafts
  drop constraint ai_drafts_status_check;

alter table public.ai_drafts
  add constraint ai_drafts_status_check
  check (status in ('review','archived','applied'));

alter table public.ai_drafts
  add column applied_at timestamptz,
  add column applied_by uuid references auth.users(id) on delete set null;

create table public.ai_draft_apply_runs (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.ai_drafts(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  draft_revision integer not null check (draft_revision >= 1),
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running','succeeded','failed','partial_failed')),
  planned_steps jsonb not null default '[]'::jsonb
    check (jsonb_typeof(planned_steps) = 'array'),
  completed_steps jsonb not null default '[]'::jsonb
    check (jsonb_typeof(completed_steps) = 'array'),
  entity_map jsonb not null default '{}'::jsonb
    check (jsonb_typeof(entity_map) = 'object'),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ai_draft_apply_runs_one_per_revision_idx
  on public.ai_draft_apply_runs (draft_id, draft_revision);

create index ai_draft_apply_runs_campaign_created_idx
  on public.ai_draft_apply_runs (campaign_id, created_at desc);

alter table public.ai_draft_apply_runs enable row level security;

create policy ai_draft_apply_runs_manager_read
on public.ai_draft_apply_runs
for select
to authenticated
using (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
);

revoke all on public.ai_draft_apply_runs from public, anon, authenticated;
grant select on public.ai_draft_apply_runs to authenticated;
grant select, insert, update, delete on public.ai_draft_apply_runs to service_role;

create or replace function public.begin_ai_draft_apply_v1(
  p_draft_id uuid,
  p_expected_revision integer,
  p_planned_steps jsonb
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
declare
  v_draft public.ai_drafts%rowtype;
  v_run_id uuid;
begin
  select *
    into v_draft
  from public.ai_drafts
  where id = p_draft_id
  for update;

  if v_draft.id is null then
    raise exception 'ai_draft_not_found';
  end if;

  if not private.is_campaign_manager(v_draft.campaign_id, auth.uid()) then
    raise exception 'ai_draft_gm_required';
  end if;

  if v_draft.status <> 'review' then
    raise exception 'ai_draft_not_reviewable';
  end if;

  if v_draft.current_revision <> p_expected_revision then
    raise exception 'ai_draft_revision_conflict';
  end if;

  if jsonb_typeof(coalesce(p_planned_steps, '[]'::jsonb)) <> 'array' then
    raise exception 'ai_draft_invalid_plan';
  end if;

  insert into public.ai_draft_apply_runs (
    draft_id,
    campaign_id,
    draft_revision,
    requested_by,
    status,
    planned_steps
  )
  values (
    v_draft.id,
    v_draft.campaign_id,
    v_draft.current_revision,
    auth.uid(),
    'running',
    coalesce(p_planned_steps, '[]'::jsonb)
  )
  returning id into v_run_id;

  return v_run_id;
exception
  when unique_violation then
    raise exception 'ai_draft_already_applied_or_started';
end;
$$;

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
  set completed_steps = completed_steps || jsonb_build_array(coalesce(p_step, '{}'::jsonb)),
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

revoke all on function public.begin_ai_draft_apply_v1(uuid, integer, jsonb) from public;
revoke all on function public.record_ai_draft_apply_step_v1(uuid, jsonb, text, text, text) from public;
revoke all on function public.finish_ai_draft_apply_v1(uuid, boolean, text) from public;

grant execute on function public.begin_ai_draft_apply_v1(uuid, integer, jsonb) to authenticated;
grant execute on function public.record_ai_draft_apply_step_v1(uuid, jsonb, text, text, text) to authenticated;
grant execute on function public.finish_ai_draft_apply_v1(uuid, boolean, text) to authenticated;
