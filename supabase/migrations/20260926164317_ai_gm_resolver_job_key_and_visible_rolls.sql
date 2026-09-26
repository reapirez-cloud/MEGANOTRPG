-- CLASS_MIGRATION_SCOPE: infrastructure
-- Keep job UUID authorization separate from narrative discovery-pool identity.
-- Publish the actual server d100 and original committed odds to the room.

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
    -- The day/location/category discovery pool is deliberately shared across
    -- distinct GM jobs. Its first committed bands remain authoritative; a
    -- later proposal must reuse them rather than reroll or rewrite odds.
    if v_existing.request_fingerprint<>v_fingerprint
       and not (
         v_surface='primary_gm'
         and v_existing.caller_surface='primary_gm'
         and v_key ~ '^narrative:primary_gm:day:[0-9]+:(world|npc|location|scene_actor):[0-9a-f-]+:(valuables|supplies|tracks|hidden_places|creatures|other):discovery_pool$'
         and v_existing.campaign_day is not distinct from p_campaign_day
         and v_existing.target_scope=v_scope
         and v_existing.target_id=v_target_id
       )
    then
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

create unique index if not exists chat_messages_ai_gm_random_decision_job_key_idx
on public.chat_messages (turn_command_id, ((event_payload->>'decisionKey')))
where event_kind='roll' and event_payload->>'kind'='narrative_resolver';

create or replace function public.publish_ai_gm_random_decision_v1(
  p_job_id uuid, p_commit_id uuid
) returns bigint
language plpgsql security definer set search_path=''
as $function$
declare
  v_job public.agent_jobs%rowtype;
  v_commit private.ai_random_decision_commits%rowtype;
  v_receipt public.ai_world_random_receipts%rowtype;
  v_room_id uuid;
  v_manager_id uuid;
  v_message_id bigint;
begin
  select * into v_job from public.agent_jobs where id=p_job_id;
  select * into v_commit from private.ai_random_decision_commits where id=p_commit_id;
  if v_job.id is null or v_commit.id is null
     or v_job.campaign_id<>v_commit.campaign_id
     or v_job.agent_key<>'voss' or v_job.job_type<>'conversation_turn'
     or v_commit.caller_surface<>'primary_gm'
     or v_commit.resolver_receipt_id is null
  then
    raise exception using errcode='22023',message='random_decision_publication_not_allowed';
  end if;

  begin
    v_room_id:=(v_job.input->>'room_id')::uuid;
    v_manager_id:=(v_job.input->>'manager_user_id')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='random_decision_publication_job_invalid';
  end;
  if v_room_id is null or v_manager_id is null or not exists(
    select 1 from public.chat_rooms r
    where r.id=v_room_id and r.campaign_id=v_job.campaign_id
  ) then
    raise exception using errcode='22023',message='random_decision_publication_room_invalid';
  end if;

  select * into v_receipt from public.ai_world_random_receipts
  where id=v_commit.resolver_receipt_id and campaign_id=v_job.campaign_id;
  if v_receipt.id is null then
    raise exception using errcode='22023',message='random_decision_publication_receipt_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_job_id::text||':'||v_commit.decision_key,0)
  );
  select id into v_message_id from public.chat_messages
  where turn_command_id=p_job_id and event_kind='roll'
    and event_payload->>'kind'='narrative_resolver'
    and event_payload->>'decisionKey'=v_commit.decision_key;
  if v_message_id is not null then return v_message_id; end if;

  perform pg_catalog.set_config('meganot.ai_gm_runtime','on',true);
  insert into public.chat_messages(
    room_id,client_id,user_id,character_id,author_name,body,
    event_kind,event_payload,turn_command_id
  ) values (
    v_room_id,v_manager_id,v_manager_id,null,'Рассказчик',
    'Случайное решение: '||left(v_commit.question,1600),
    'roll',jsonb_build_object(
      'kind','narrative_resolver',
      'label',v_commit.question,
      'decisionKey',v_commit.decision_key,
      'd100',v_receipt.result,
      'outcomeBands',v_commit.outcome_bands,
      'matchedOutcome',v_receipt.matched_outcome,
      'matchedOutcomeKey',v_receipt.matched_outcome_key,
      'discoveryPool',v_commit.decision_key like 'narrative:primary_gm:day:%:discovery_pool',
      'reused',v_commit.run_key<>p_job_id::text
    ),p_job_id
  ) returning id into v_message_id;
  return v_message_id;
end;
$function$;

revoke all on function public.publish_ai_gm_random_decision_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.publish_ai_gm_random_decision_v1(uuid,uuid)
  to service_role;
