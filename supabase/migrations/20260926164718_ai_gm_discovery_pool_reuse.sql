-- CLASS_MIGRATION_SCOPE: infrastructure
-- Read only the already committed pool after validating the active GM job.
-- The model's next proposal cannot rewrite or reroll the original odds.
create or replace function public.lookup_ai_gm_discovery_pool_v1(
  p_campaign_id uuid, p_job_id uuid, p_decision_key text,
  p_campaign_day integer, p_target_scope text, p_target_id text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_commit private.ai_random_decision_commits%rowtype;
begin
  if p_job_id is null or not private.ai_random_decision_target_valid_v1(
    p_campaign_id,p_job_id::text,'primary_gm',p_target_scope,p_target_id
  ) then
    raise exception using errcode='22023',message='random_decision_target_not_allowed';
  end if;
  if p_decision_key !~ '^narrative:primary_gm:day:[0-9]+:(world|npc|location|scene_actor):[0-9a-f-]+:(valuables|supplies|tracks|hidden_places|creatures|other):discovery_pool$'
     or p_decision_key not like 'narrative:primary_gm:day:'||p_campaign_day::text||':'||p_target_scope||':'||p_target_id||':%:discovery_pool'
  then
    raise exception using errcode='22023',message='random_decision_key_invalid';
  end if;
  select * into v_commit from private.ai_random_decision_commits
  where campaign_id=p_campaign_id and decision_key=p_decision_key
    and caller_surface='primary_gm' and campaign_day=p_campaign_day
    and target_scope=p_target_scope and target_id=p_target_id;
  if v_commit.id is null then return null; end if;
  return jsonb_build_object(
    'commit_id',v_commit.id,'question',v_commit.question,
    'outcome_bands',v_commit.outcome_bands
  );
end;
$function$;

revoke all on function public.lookup_ai_gm_discovery_pool_v1(
  uuid,uuid,text,integer,text,text
) from public,anon,authenticated;
grant execute on function public.lookup_ai_gm_discovery_pool_v1(
  uuid,uuid,text,integer,text,text
) to service_role;
