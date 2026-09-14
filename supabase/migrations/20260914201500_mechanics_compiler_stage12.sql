-- Stage 12: deterministic Mechanics Compiler artifacts and safe apply gate.

alter table public.ai_agent_model_routes
  drop constraint if exists ai_agent_model_routes_task_key_check;
alter table public.ai_agent_model_routes
  add constraint ai_agent_model_routes_task_key_check
  check (task_key = any (array[
    'general'::text,
    'reference_read'::text,
    'memory_read'::text,
    'memory_write'::text,
    'workshop'::text,
    'draft_edit'::text,
    'mechanics_compile'::text
  ]));

alter table public.ai_model_route_runs
  drop constraint if exists ai_model_route_runs_task_key_check;
alter table public.ai_model_route_runs
  add constraint ai_model_route_runs_task_key_check
  check (task_key = any (array[
    'general'::text,
    'reference_read'::text,
    'memory_read'::text,
    'memory_write'::text,
    'workshop'::text,
    'draft_edit'::text,
    'mechanics_compile'::text
  ]));

alter table public.ai_messages
  drop constraint if exists ai_messages_task_key_check;
alter table public.ai_messages
  add constraint ai_messages_task_key_check
  check (
    task_key is null
    or task_key = any (array[
      'general'::text,
      'reference_read'::text,
      'memory_read'::text,
      'memory_write'::text,
      'workshop'::text,
      'draft_edit'::text,
      'mechanics_compile'::text
    ])
  );

create table if not exists public.ai_mechanics_compilations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid null references public.ai_threads(id) on delete set null,
  agent_job_id uuid null unique references public.agent_jobs(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  intent_text text not null default '',
  target_kind text not null default 'preview',
  target_id uuid null,
  target_level integer null,
  target_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'validated',
  mechanics jsonb not null default '[]'::jsonb,
  coverage jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '[]'::jsonb,
  unsupported_reasons jsonb not null default '[]'::jsonb,
  compiler_version integer not null default 1,
  applied_at timestamptz null,
  applied_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_mechanics_compilations_target_kind_check check (
    target_kind in (
      'preview',
      'reference_definition',
      'rule_template',
      'rule_template_level'
    )
  ),
  constraint ai_mechanics_compilations_status_check check (
    status in ('validated','unsupported','applied','rejected')
  ),
  constraint ai_mechanics_compilations_target_level_check check (
    target_level is null or target_level between 1 and 30
  ),
  constraint ai_mechanics_compilations_mechanics_array_check check (
    jsonb_typeof(mechanics) = 'array'
  ),
  constraint ai_mechanics_compilations_coverage_array_check check (
    jsonb_typeof(coverage) = 'array'
  ),
  constraint ai_mechanics_compilations_diagnostics_array_check check (
    jsonb_typeof(diagnostics) = 'array'
  ),
  constraint ai_mechanics_compilations_unsupported_array_check check (
    jsonb_typeof(unsupported_reasons) = 'array'
  )
);

create index if not exists ai_mechanics_compilations_creator_created_idx
  on public.ai_mechanics_compilations(created_by, created_at desc);
create index if not exists ai_mechanics_compilations_campaign_status_idx
  on public.ai_mechanics_compilations(campaign_id, status, created_at desc);
create index if not exists ai_mechanics_compilations_target_idx
  on public.ai_mechanics_compilations(target_kind, target_id, created_at desc);

alter table public.ai_mechanics_compilations enable row level security;

revoke insert, update, delete on public.ai_mechanics_compilations from anon, authenticated;
grant select on public.ai_mechanics_compilations to authenticated;

drop policy if exists ai_mechanics_compilations_creator_read
  on public.ai_mechanics_compilations;
create policy ai_mechanics_compilations_creator_read
on public.ai_mechanics_compilations
for select
to authenticated
using (created_by = (select auth.uid()));

create or replace function public.apply_ai_mechanics_compilation_v1(
  p_compilation_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.ai_mechanics_compilations%rowtype;
  v_definition public.reference_definitions%rowtype;
  v_revision public.reference_definition_revisions%rowtype;
  v_template public.rule_templates%rowtype;
  v_level public.rule_template_levels%rowtype;
  v_expected_revision integer;
  v_next_revision integer;
  v_result jsonb;
begin
  if p_user_id is null then
    raise exception 'mechanics_apply_user_required';
  end if;

  select *
    into v_comp
  from public.ai_mechanics_compilations
  where id = p_compilation_id
  for update;

  if not found then
    raise exception 'mechanics_compilation_not_found';
  end if;

  if v_comp.created_by <> p_user_id then
    raise exception 'mechanics_compilation_owner_required';
  end if;

  if not private.can_manage_campaign(v_comp.campaign_id, p_user_id) then
    raise exception 'mechanics_apply_gm_required';
  end if;

  if v_comp.status <> 'validated' then
    raise exception 'mechanics_compilation_not_validated';
  end if;

  if v_comp.target_kind = 'preview' or v_comp.target_id is null then
    raise exception 'mechanics_compilation_has_no_apply_target';
  end if;

  if v_comp.target_kind = 'reference_definition' then
    select *
      into v_definition
    from public.reference_definitions
    where id = v_comp.target_id
    for update;

    if not found
       or v_definition.scope <> 'campaign'
       or v_definition.campaign_id <> v_comp.campaign_id then
      raise exception 'mechanics_target_not_found_or_immutable';
    end if;

    v_expected_revision :=
      nullif(v_comp.target_snapshot->>'current_revision','')::integer;

    if v_expected_revision is null
       or v_definition.current_revision <> v_expected_revision then
      raise exception 'mechanics_target_conflict';
    end if;

    select *
      into v_revision
    from public.reference_definition_revisions
    where definition_id = v_definition.id
      and revision = v_definition.current_revision;

    if not found then
      raise exception 'mechanics_target_revision_missing';
    end if;

    v_next_revision := v_definition.current_revision + 1;

    insert into public.reference_definition_revisions(
      definition_id,
      revision,
      name,
      summary,
      rules_text,
      mechanics,
      data,
      created_by,
      created_at
    ) values (
      v_definition.id,
      v_next_revision,
      v_revision.name,
      v_revision.summary,
      v_revision.rules_text,
      v_comp.mechanics,
      v_revision.data,
      p_user_id,
      now()
    );

    update public.reference_definitions
    set current_revision = v_next_revision,
        updated_at = now()
    where id = v_definition.id;

    v_result := jsonb_build_object(
      'target_kind','reference_definition',
      'target_id',v_definition.id,
      'revision',v_next_revision
    );

  elsif v_comp.target_kind = 'rule_template' then
    select *
      into v_template
    from public.rule_templates
    where id = v_comp.target_id
    for update;

    if not found or v_template.campaign_id <> v_comp.campaign_id then
      raise exception 'mechanics_target_not_found';
    end if;

    if v_template.is_builtin then
      raise exception 'builtin_template_requires_developer_mode';
    end if;

    if coalesce(v_comp.target_snapshot->'mechanics','[]'::jsonb)
       <> coalesce(v_template.mechanics,'[]'::jsonb) then
      raise exception 'mechanics_target_conflict';
    end if;

    update public.rule_templates
    set mechanics = v_comp.mechanics,
        updated_at = now()
    where id = v_template.id;

    v_result := jsonb_build_object(
      'target_kind','rule_template',
      'target_id',v_template.id,
      'version',v_template.version
    );

  elsif v_comp.target_kind = 'rule_template_level' then
    select l.*
      into v_level
    from public.rule_template_levels l
    where l.id = v_comp.target_id
    for update;

    if not found then
      raise exception 'mechanics_target_not_found';
    end if;

    select *
      into v_template
    from public.rule_templates
    where id = v_level.template_id
    for update;

    if not found or v_template.campaign_id <> v_comp.campaign_id then
      raise exception 'mechanics_target_not_found';
    end if;

    if v_template.is_builtin then
      raise exception 'builtin_template_requires_developer_mode';
    end if;

    if coalesce(v_comp.target_snapshot->'mechanics','[]'::jsonb)
       <> coalesce(v_level.mechanics,'[]'::jsonb) then
      raise exception 'mechanics_target_conflict';
    end if;

    update public.rule_template_levels
    set mechanics = v_comp.mechanics
    where id = v_level.id;

    v_result := jsonb_build_object(
      'target_kind','rule_template_level',
      'target_id',v_level.id,
      'template_id',v_level.template_id,
      'level',v_level.level
    );
  else
    raise exception 'mechanics_target_kind_unsupported';
  end if;

  update public.ai_mechanics_compilations
  set status = 'applied',
      applied_at = now(),
      applied_result = v_result,
      updated_at = now()
  where id = v_comp.id;

  return v_result;
end;
$$;

revoke all on function public.apply_ai_mechanics_compilation_v1(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.apply_ai_mechanics_compilation_v1(uuid,uuid)
to service_role;
