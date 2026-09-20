-- Stage 3: GM Workshop canonical definition lifecycle and runtime provenance.

alter table public.character_features
  add column if not exists source_definition_id uuid,
  add column if not exists source_definition_revision integer,
  add column if not exists source_definition_kind text;

alter table public.character_features
  drop constraint if exists character_features_source_definition_revision_fkey;
alter table public.character_features
  add constraint character_features_source_definition_revision_fkey
  foreign key (source_definition_id, source_definition_revision)
  references public.reference_definition_revisions(definition_id, revision)
  on delete restrict;

alter table public.character_features
  drop constraint if exists character_features_source_definition_pair_check;
alter table public.character_features
  add constraint character_features_source_definition_pair_check
  check (
    (source_definition_id is null and source_definition_revision is null and source_definition_kind is null)
    or
    (
      source_definition_id is not null
      and source_definition_revision is not null
      and source_definition_kind in ('feature','feat','condition')
    )
  ) not valid;
alter table public.character_features
  validate constraint character_features_source_definition_pair_check;

create index if not exists character_features_source_definition_idx
  on public.character_features(source_definition_id, source_definition_revision);

create or replace function public.publish_reference_definition_draft_v1(
  p_definition_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_draft public.reference_definitions%rowtype;
  v_draft_revision public.reference_definition_revisions%rowtype;
  v_target public.reference_definitions%rowtype;
  v_target_id uuid;
  v_target_revision integer;
  v_revises_raw text;
  v_clean_data jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_draft
  from public.reference_definitions
  where id = p_definition_id
  for update;

  if v_draft.id is null then raise exception 'Definition not found'; end if;
  if v_draft.scope <> 'campaign' then
    raise exception 'System definitions cannot be published through campaign API';
  end if;
  if not private.can_manage_campaign(v_draft.campaign_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;
  if v_draft.status <> 'draft' then
    raise exception 'Only draft definitions can be published';
  end if;

  select *
  into v_draft_revision
  from public.reference_definition_revisions
  where definition_id = v_draft.id
    and revision = v_draft.current_revision;

  if v_draft_revision.definition_id is null then
    raise exception 'Draft revision not found';
  end if;

  v_revises_raw := nullif(trim(coalesce(v_draft_revision.data->>'revises_definition_id', '')), '');
  if v_revises_raw is not null then
    begin
      v_target_id := v_revises_raw::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid revises_definition_id';
    end;
  end if;

  if v_target_id is null then
    update public.reference_definitions
    set status = 'active',
        visibility = 'campaign',
        updated_at = now()
    where id = v_draft.id;
    return v_draft.id;
  end if;

  select *
  into v_target
  from public.reference_definitions
  where id = v_target_id
  for update;

  if v_target.id is null then raise exception 'Target definition not found'; end if;
  if v_target.scope <> 'campaign'
     or v_target.campaign_id is distinct from v_draft.campaign_id then
    raise exception 'Target definition belongs to another campaign';
  end if;
  if v_target.kind <> v_draft.kind then
    raise exception 'Target definition kind mismatch';
  end if;
  if v_target.status <> 'active' then
    raise exception 'Target definition must be active';
  end if;

  v_target_revision := v_target.current_revision + 1;
  v_clean_data := coalesce(v_draft_revision.data, '{}'::jsonb)
    - 'revises_definition_id'
    - 'revises_definition_revision';

  insert into public.reference_definition_revisions(
    definition_id, revision, name, summary, rules_text, mechanics, data, created_by
  )
  values(
    v_target.id, v_target_revision, v_draft_revision.name,
    v_draft_revision.summary, v_draft_revision.rules_text,
    v_draft_revision.mechanics, v_clean_data, auth.uid()
  );

  update public.reference_definitions
  set current_revision = v_target_revision,
      updated_at = now()
  where id = v_target.id;

  update public.reference_definitions
  set status = 'archived',
      visibility = 'gm',
      source_label = coalesce(source_label, 'Applied revision draft'),
      updated_at = now()
  where id = v_draft.id;

  return v_target.id;
end;
$function$;

revoke all on function public.publish_reference_definition_draft_v1(uuid)
  from public, anon;
grant execute on function public.publish_reference_definition_draft_v1(uuid)
  to authenticated;
