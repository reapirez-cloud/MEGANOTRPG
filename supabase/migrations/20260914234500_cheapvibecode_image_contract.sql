-- CheapVibeCode image contract: GPT Image 2 jobs expose one or two final variants.
-- Existing production data was checked before applying this migration: no job or
-- generated asset currently uses variant/output index 3.

alter table public.agent_jobs
  drop constraint if exists agent_jobs_output_count_check;

alter table public.agent_jobs
  add constraint agent_jobs_output_count_check check (
    requested_outputs between 1 and 2
    and completed_outputs between 0 and requested_outputs
  );

alter table public.media_assets
  drop constraint if exists media_assets_dimensions_check;

alter table public.media_assets
  add constraint media_assets_dimensions_check check (
    width > 0
    and height > 0
    and variant_index between 1 and 2
  );

create or replace function public.reserve_agent_image_job_v1(
  p_campaign_id uuid,
  p_user_id uuid,
  p_thread_id uuid,
  p_input jsonb,
  p_requested_outputs smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_role text;
  v_is_owner boolean;
  v_used integer;
begin
  if p_requested_outputs not between 1 and 2 then
    raise exception 'image_variants_must_be_1_to_2';
  end if;

  select cm.role, cm.is_owner
    into v_role, v_is_owner
  from public.campaign_members cm
  where cm.campaign_id = p_campaign_id
    and cm.user_id = p_user_id;

  if not found then
    raise exception 'campaign_access_denied';
  end if;

  if v_role <> 'gm' and coalesce(v_is_owner, false) = false then
    perform pg_advisory_xact_lock(
      hashtextextended(p_user_id::text || ':' || current_date::text, 0)
    );

    select coalesce(sum(j.requested_outputs), 0)::integer
      into v_used
    from public.agent_jobs j
    where j.requested_by = p_user_id
      and j.job_type = 'image_generate'
      and j.created_at >= date_trunc('day', now())
      and j.status in ('queued','running','waiting_for_user','completed');

    if v_used + p_requested_outputs > 10 then
      raise exception 'player_image_quota_exceeded';
    end if;
  end if;

  insert into public.agent_jobs (
    campaign_id,
    thread_id,
    requested_by,
    agent_key,
    job_type,
    status,
    input,
    requested_outputs
  ) values (
    p_campaign_id,
    p_thread_id,
    p_user_id,
    'voss',
    'image_generate',
    'queued',
    coalesce(p_input, '{}'::jsonb),
    p_requested_outputs
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.reserve_agent_image_job_v1(
  uuid, uuid, uuid, jsonb, smallint
) from public, anon, authenticated;

grant execute on function public.reserve_agent_image_job_v1(
  uuid, uuid, uuid, jsonb, smallint
) to service_role;
