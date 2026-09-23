-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 11: commit-before-roll narrative branching.
-- Question + complete d100 bands are durably committed before World Resolver returns a result.

create table private.ai_random_decision_commits (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  decision_key text not null,
  question text not null,
  outcome_bands jsonb not null,
  campaign_day integer,
  run_key text not null,
  target_scope text not null,
  target_id text not null,
  caller_surface text not null
    check (caller_surface in ('background_flash','primary_gm')),
  reason text not null,
  request_fingerprint text not null,
  resolver_receipt_id uuid unique
    references public.ai_world_random_receipts(id) on delete restrict,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(campaign_id,decision_key),
  check (length(decision_key) between 1 and 240),
  check (length(question) between 1 and 1600),
  check (campaign_day is null or campaign_day>=1),
  check (length(run_key) between 1 and 240),
  check (target_scope in ('world','npc','location','scene_actor')),
  check (length(target_id) between 1 and 240),
  check (length(reason) between 1 and 1200),
  check (jsonb_typeof(outcome_bands)='array')
);

alter table private.ai_random_decision_commits enable row level security;
revoke all on table private.ai_random_decision_commits
  from public, anon, authenticated, service_role;

create policy ai_random_decision_commits_deny_client
on private.ai_random_decision_commits
for all
to anon, authenticated
using(false)
with check(false);

create index ai_random_decision_commits_run_idx
  on private.ai_random_decision_commits(campaign_id,run_key,created_at desc);

CREATE OR REPLACE FUNCTION private.ai_random_decision_target_valid_v1(p_campaign_id uuid, p_run_key text, p_caller_surface text, p_target_scope text, p_target_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_target_uuid uuid;
  v_run_uuid uuid;
  v_run public.ai_background_daily_runs%rowtype;
begin
  if p_target_scope='world' and p_target_id<>p_campaign_id::text then
    return false;
  end if;

  if p_target_scope<>'world' then
    begin
      v_target_uuid:=p_target_id::uuid;
    exception when invalid_text_representation then
      return false;
    end;
  end if;

  begin
    v_run_uuid:=p_run_key::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if p_caller_surface='background_flash' then
    select * into v_run
    from public.ai_background_daily_runs
    where id=v_run_uuid and campaign_id=p_campaign_id;

    if v_run.id is null then return false; end if;
    if p_target_scope='world' then return true; end if;
    if p_target_scope='npc' then
      return v_target_uuid=any(v_run.selected_npc_ids);
    elsif p_target_scope='location' then
      return v_target_uuid=any(v_run.selected_location_ids);
    end if;
    return false;
  end if;

  if p_caller_surface='primary_gm' then
    if not exists(
      select 1 from public.agent_jobs j
      where j.id=v_run_uuid
        and j.campaign_id=p_campaign_id
        and j.agent_key='voss'
        and j.job_type='conversation_turn'
    ) then
      return false;
    end if;

    if p_target_scope='world' then return true; end if;
    if p_target_scope='npc' then
      return exists(
        select 1 from public.characters c
        where c.id=v_target_uuid and c.campaign_id=p_campaign_id
          and c.character_type='npc' and c.publication_state='campaign'
      );
    elsif p_target_scope='location' then
      return exists(
        select 1 from public.locations l
        where l.id=v_target_uuid and l.campaign_id=p_campaign_id
          and l.lifecycle_state='active'
      );
    elsif p_target_scope='scene_actor' then
      return exists(
        select 1 from public.ai_scene_actors a
        where a.id=v_target_uuid and a.campaign_id=p_campaign_id
          and a.runtime_state='active'
      );
    end if;
  end if;

  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.commit_random_decision_v1(p_campaign_id uuid, p_decision_key text, p_question text, p_bands jsonb, p_campaign_day integer, p_run_key text, p_target_scope text, p_target_id text, p_caller_surface text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key text:=btrim(coalesce(p_decision_key,''));
  v_question text:=btrim(coalesce(p_question,''));
  v_run_key text:=btrim(coalesce(p_run_key,''));
  v_scope text:=lower(btrim(coalesce(p_target_scope,'')));
  v_target_id text:=btrim(coalesce(p_target_id,''));
  v_surface text:=lower(btrim(coalesce(p_caller_surface,'')));
  v_reason text:=btrim(coalesce(p_reason,''));
  v_bands jsonb;
  v_band jsonb;
  v_semantics jsonb;
  v_fingerprint text;
  v_existing private.ai_random_decision_commits%rowtype;
  v_created private.ai_random_decision_commits%rowtype;
begin
  if p_campaign_id is null or not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501',message='random_decision_ai_world_only';
  end if;
  if length(v_key)<1 or length(v_key)>240
     or v_key !~ '^narrative:[a-z0-9._:-]+$'
  then
    raise exception using errcode='22023',message='random_decision_key_invalid';
  end if;
  if length(v_question)<1 or length(v_question)>1600 then
    raise exception using errcode='22023',message='random_decision_question_invalid';
  end if;
  if p_campaign_day is not null and p_campaign_day<1 then
    raise exception using errcode='22023',message='random_decision_campaign_day_invalid';
  end if;
  if length(v_run_key)<1 or length(v_run_key)>240 then
    raise exception using errcode='22023',message='random_decision_run_key_invalid';
  end if;
  if v_surface not in ('background_flash','primary_gm') then
    raise exception using errcode='22023',message='random_decision_surface_invalid';
  end if;
  if v_scope not in ('world','npc','location','scene_actor') then
    raise exception using errcode='22023',message='random_decision_target_scope_invalid';
  end if;
  if length(v_target_id)<1 or length(v_target_id)>240 then
    raise exception using errcode='22023',message='random_decision_target_id_invalid';
  end if;
  if length(v_reason)<1 or length(v_reason)>1200 then
    raise exception using errcode='22023',message='random_decision_reason_invalid';
  end if;

  v_bands:=private.normalize_world_random_bands_v1(100,p_bands);
  if jsonb_array_length(v_bands)<2 or jsonb_array_length(v_bands)>8 then
    raise exception using errcode='22023',message='random_decision_band_count_invalid';
  end if;

  for v_band in select value from jsonb_array_elements(v_bands)
  loop
    if coalesce(v_band->>'key','') !~ '^[a-z0-9][a-z0-9._:-]*$'
       or length(coalesce(v_band->>'description',''))<1
       or length(v_band->>'description')>1200
    then
      raise exception using errcode='22023',message='random_decision_band_semantics_invalid';
    end if;
  end loop;

  if not private.ai_random_decision_target_valid_v1(
    p_campaign_id,v_run_key,v_surface,v_scope,v_target_id
  ) then
    raise exception using errcode='22023',message='random_decision_target_not_allowed';
  end if;

  v_semantics:=jsonb_build_object(
    'question',v_question,'bands',v_bands,'campaign_day',p_campaign_day,
    'run_key',v_run_key,'target_scope',v_scope,'target_id',v_target_id,
    'caller_surface',v_surface,'reason',v_reason
  );
  v_fingerprint:=pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_semantics::text,'UTF8'),'sha256'),'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text||':'||v_key,0)
  );

  select * into v_existing
  from private.ai_random_decision_commits
  where campaign_id=p_campaign_id and decision_key=v_key;

  if found then
    if v_existing.request_fingerprint<>v_fingerprint then
      raise exception using errcode='22023',message='random_decision_key_conflict';
    end if;
    return jsonb_build_object(
      'commit_id',v_existing.id,'decision_key',v_existing.decision_key,
      'question',v_existing.question,'outcome_bands',v_existing.outcome_bands,
      'resolved',v_existing.resolver_receipt_id is not null,'replayed',true
    );
  end if;

  insert into private.ai_random_decision_commits(
    campaign_id,decision_key,question,outcome_bands,campaign_day,run_key,
    target_scope,target_id,caller_surface,reason,request_fingerprint
  ) values (
    p_campaign_id,v_key,v_question,v_bands,p_campaign_day,v_run_key,
    v_scope,v_target_id,v_surface,v_reason,v_fingerprint
  )
  returning * into v_created;

  return jsonb_build_object(
    'commit_id',v_created.id,'decision_key',v_created.decision_key,
    'question',v_created.question,'outcome_bands',v_created.outcome_bands,
    'resolved',false,'replayed',false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_committed_random_decision_v1(p_commit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_commit private.ai_random_decision_commits%rowtype;
  v_result jsonb;
  v_receipt jsonb;
begin
  if p_commit_id is null then
    raise exception using errcode='22023',message='random_decision_commit_required';
  end if;

  select * into v_commit
  from private.ai_random_decision_commits
  where id=p_commit_id
  for update;

  if v_commit.id is null then
    raise exception using errcode='P0002',message='random_decision_commit_not_found';
  end if;
  if not private.is_ai_world_campaign_v1(v_commit.campaign_id) then
    raise exception using errcode='42501',message='random_decision_ai_world_only';
  end if;

  if v_commit.resolver_receipt_id is not null then
    select to_jsonb(r)-'request_fingerprint' into v_receipt
    from public.ai_world_random_receipts r
    where r.id=v_commit.resolver_receipt_id;

    if v_receipt is null then
      raise exception using errcode='55000',message='random_decision_receipt_missing';
    end if;

    return jsonb_build_object(
      'commit_id',v_commit.id,'decision_key',v_commit.decision_key,
      'question',v_commit.question,'outcome_bands',v_commit.outcome_bands,
      'receipt',v_receipt,'replayed',true
    );
  end if;

  v_result:=public.resolve_world_random_v1(
    p_campaign_id=>v_commit.campaign_id,
    p_decision_key=>v_commit.decision_key,
    p_sides=>100,
    p_bands=>v_commit.outcome_bands,
    p_decision_kind=>'narrative.branch',
    p_campaign_day=>v_commit.campaign_day,
    p_run_key=>v_commit.run_key,
    p_target_scope=>v_commit.target_scope,
    p_target_id=>v_commit.target_id,
    p_audit=>jsonb_build_object(
      'stage',11,'caller_surface',v_commit.caller_surface,
      'commit_id',v_commit.id,'question',v_commit.question,'reason',v_commit.reason
    )
  );
  v_receipt:=v_result->'receipt';

  update private.ai_random_decision_commits
  set resolver_receipt_id=(v_receipt->>'id')::uuid,resolved_at=now()
  where id=v_commit.id
  returning * into v_commit;

  return jsonb_build_object(
    'commit_id',v_commit.id,'decision_key',v_commit.decision_key,
    'question',v_commit.question,'outcome_bands',v_commit.outcome_bands,
    'receipt',v_receipt,
    'replayed',coalesce((v_result->>'replayed')::boolean,false)
  );
end;
$function$;


revoke all on function private.ai_random_decision_target_valid_v1(uuid,text,text,text,text)
  from public, anon, authenticated;

revoke all on function public.commit_random_decision_v1(
  uuid,text,text,jsonb,integer,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.commit_random_decision_v1(
  uuid,text,text,jsonb,integer,text,text,text,text,text
) to service_role;

revoke all on function public.resolve_committed_random_decision_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_committed_random_decision_v1(uuid)
  to service_role;
