-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 10: fixed DeepSeek V4.1 Flash daily background worker.
-- Worker input is built only from Stage 9 selected IDs and authoritative rolls.

alter table public.ai_background_daily_runs
  add column worker_input_bytes integer not null default 0 check(worker_input_bytes>=0),
  add column worker_prompt_version smallint not null default 1 check(worker_prompt_version>=1),
  add column last_dispatch_at timestamptz,
  add column dispatch_request_id bigint;

create table private.ai_background_dispatch_config(
  singleton boolean primary key default true,
  project_url text,
  dispatch_token text not null default encode(gen_random_bytes(32),'hex'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint ai_background_dispatch_singleton_check check(singleton=true)
);
alter table private.ai_background_dispatch_config enable row level security;
revoke all on table private.ai_background_dispatch_config
  from public, anon, authenticated, service_role;

insert into private.ai_background_dispatch_config(singleton,project_url,enabled)
select true,cfg.project_url,cfg.enabled
from private.ai_gm_maintenance_dispatch_config cfg
where cfg.singleton=true
on conflict(singleton) do update set
  project_url=excluded.project_url,
  enabled=excluded.enabled,
  updated_at=now();

insert into private.ai_background_dispatch_config(singleton)
values(true)
on conflict(singleton) do nothing;

CREATE OR REPLACE FUNCTION private.ai_background_severity_meta_v1(p_roll integer)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_roll = 1 then jsonb_build_object('key','critical_negative','direction','negative','magnitude','critical')
    when p_roll between 2 and 5 then jsonb_build_object('key','severe_negative','direction','negative','magnitude','severe')
    when p_roll between 6 and 15 then jsonb_build_object('key','notable_negative','direction','negative','magnitude','notable')
    when p_roll between 16 and 35 then jsonb_build_object('key','minor_negative','direction','negative','magnitude','minor')
    when p_roll between 36 and 65 then jsonb_build_object('key','neutral','direction','neutral','magnitude','neutral')
    when p_roll between 66 and 85 then jsonb_build_object('key','minor_positive','direction','positive','magnitude','minor')
    when p_roll between 86 and 95 then jsonb_build_object('key','notable_positive','direction','positive','magnitude','notable')
    when p_roll between 96 and 99 then jsonb_build_object('key','severe_positive','direction','positive','magnitude','severe')
    when p_roll = 100 then jsonb_build_object('key','critical_positive','direction','positive','magnitude','critical')
    else null
  end
$function$;

CREATE OR REPLACE FUNCTION private.ai_background_roll_for_worker_v1(p_run_id uuid, p_scope text, p_entity_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'decision_key',r.decision_key,'result',r.result,'severity_key',r.matched_outcome_key,
    'direction',private.ai_background_severity_meta_v1(r.result)->>'direction',
    'magnitude',private.ai_background_severity_meta_v1(r.result)->>'magnitude'
  )
  from public.ai_background_rolls r
  where r.run_id=p_run_id and r.target_scope=p_scope and r.target_id=p_entity_id and r.sides=100
  order by r.created_at limit 1
$function$;

CREATE OR REPLACE FUNCTION private.ai_background_snapshot_for_worker_v1(p_campaign_id uuid, p_campaign_day integer, p_scope text, p_entity_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'through_game_day',s.through_game_day,'version',s.version,'summary',s.summary,'state',s.state
  )
  from public.ai_background_entity_snapshots s
  where s.campaign_id=p_campaign_id and s.entity_scope=p_scope and s.entity_id=p_entity_id
    and s.through_game_day<=p_campaign_day
  order by s.through_game_day desc,s.version desc limit 1
$function$;

CREATE OR REPLACE FUNCTION private.ai_background_recent_events_for_worker_v1(p_campaign_id uuid, p_campaign_day integer, p_scope text, p_entity_id text, p_limit integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.effective_game_day desc,e.created_at desc),'[]'::jsonb)
  from (
    select b.effective_game_day,b.event_kind,left(b.summary,1200) summary,b.importance,b.created_at
    from public.ai_background_events b
    where b.campaign_id=p_campaign_id and b.entity_scope=p_scope and b.entity_id=p_entity_id
      and b.effective_game_day<=p_campaign_day
    order by b.effective_game_day desc,b.created_at desc
    limit greatest(0,least(coalesce(p_limit,4),8))
  ) e
$function$;

CREATE OR REPLACE FUNCTION private.ai_background_npc_context_v1(p_run_id uuid, p_campaign_id uuid, p_campaign_day integer, p_npc_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'entity_scope','npc','entity_id',c.id,'name',left(c.name,160),
    'character_class',left(c.character_class,120),'level',c.level,'life_state',c.life_state,
    'profile',jsonb_build_object(
      'role',left(np.role,120),'species',left(np.species,160),
      'occupation',left(np.occupation,240),'faction_text',left(np.faction,240),
      'demeanor',left(np.demeanor,1200),'motivation',left(np.motivation,1800),
      'public_notes',left(np.public_notes,1200),'gm_notes',left(np.gm_notes,1800),
      'tags',to_jsonb(np.tags)
    ),
    'world_state',case when cws.character_id is null then null else jsonb_build_object(
      'location_id',cws.location_id,'campaign_day',cws.campaign_day,'day_period',cws.day_period
    ) end,
    'location',case when l.id is null then null else jsonb_build_object(
      'id',l.id,'name',left(l.name,180),'summary',left(l.summary,1000)
    ) end,
    'roll',private.ai_background_roll_for_worker_v1(p_run_id,'npc',p_npc_id::text),
    'current_snapshot',private.ai_background_snapshot_for_worker_v1(
      p_campaign_id,p_campaign_day,'npc',p_npc_id::text
    ),
    'recent_events',private.ai_background_recent_events_for_worker_v1(
      p_campaign_id,p_campaign_day,'npc',p_npc_id::text,4
    ),
    'relationships',coalesce((
      select jsonb_agg(to_jsonb(rel) order by rel.updated_at desc)
      from (
        select
          case when cr.subject_character_id=p_npc_id then cr.target_character_id else cr.subject_character_id end other_character_id,
          left(oc.name,160) other_name,cr.relationship_kind,left(cr.public_label,240) public_label,
          cr.attitude_score,left(cr.gm_note,1000) gm_note,cr.updated_at
        from public.character_relationships cr
        join public.characters oc
          on oc.id=case when cr.subject_character_id=p_npc_id then cr.target_character_id else cr.subject_character_id end
        where cr.campaign_id=p_campaign_id and cr.state='active'
          and (cr.subject_character_id=p_npc_id or cr.target_character_id=p_npc_id)
        order by cr.updated_at desc limit 8
      ) rel
    ),'[]'::jsonb),
    'factions',coalesce((
      select jsonb_agg(to_jsonb(fmctx) order by fmctx.is_primary desc,fmctx.started_at desc)
      from (
        select fm.faction_id,left(f.name,180) faction_name,left(f.summary,900) faction_summary,
          fm.membership_role,left(fm.rank_label,180) rank_label,fm.is_primary,fm.started_at
        from public.faction_memberships fm
        join public.factions f on f.id=fm.faction_id
        where fm.campaign_id=p_campaign_id and fm.character_id=p_npc_id
          and fm.state='active' and f.state='active'
        order by fm.is_primary desc,fm.started_at desc limit 6
      ) fmctx
    ),'[]'::jsonb),
    'quest_constraints',coalesce((
      select jsonb_agg(to_jsonb(qctx) order by qctx.updated_at desc)
      from (
        select distinct q.id quest_id,q.quest_key,left(q.title,240) title,q.status,
          left(q.player_brief,900) player_brief,
          coalesce(
            (select qc.role from public.quest_characters qc where qc.quest_id=q.id and qc.character_id=p_npc_id limit 1),
            (select 'target'::text from public.quest_targets qt where qt.quest_id=q.id and qt.npc_character_id=p_npc_id limit 1)
          ) link_role,
          q.updated_at
        from public.quests q
        where q.campaign_id=p_campaign_id and q.status in ('active','draft')
          and (
            exists(select 1 from public.quest_characters qc where qc.quest_id=q.id and qc.character_id=p_npc_id)
            or exists(select 1 from public.quest_targets qt where qt.quest_id=q.id and qt.npc_character_id=p_npc_id)
          )
        order by q.updated_at desc limit 8
      ) qctx
    ),'[]'::jsonb)
  )
  from public.characters c
  join public.npc_profiles np on np.character_id=c.id and np.campaign_id=c.campaign_id
  left join public.character_world_state cws on cws.character_id=c.id and cws.campaign_id=c.campaign_id
  left join public.locations l on l.id=cws.location_id and l.campaign_id=c.campaign_id
  where c.id=p_npc_id and c.campaign_id=p_campaign_id and c.character_type='npc'
$function$;

CREATE OR REPLACE FUNCTION private.ai_background_location_context_v1(p_run_id uuid, p_campaign_id uuid, p_campaign_day integer, p_location_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'entity_scope','location','entity_id',l.id,'name',left(l.name,180),
    'summary',left(l.summary,1600),'description',left(l.description,2600),
    'parent_location_id',l.parent_location_id,'visibility_mode',l.visibility_mode,
    'roll',private.ai_background_roll_for_worker_v1(p_run_id,'location',p_location_id::text),
    'current_snapshot',private.ai_background_snapshot_for_worker_v1(
      p_campaign_id,p_campaign_day,'location',p_location_id::text
    ),
    'recent_events',private.ai_background_recent_events_for_worker_v1(
      p_campaign_id,p_campaign_day,'location',p_location_id::text,4
    ),
    'quest_constraints',coalesce((
      select jsonb_agg(to_jsonb(qctx) order by qctx.updated_at desc)
      from (
        select distinct q.id quest_id,q.quest_key,left(q.title,240) title,q.status,
          left(q.player_brief,900) player_brief,left(qt.internal_note,1200) target_internal_note,q.updated_at
        from public.quests q
        join public.quest_targets qt on qt.quest_id=q.id
        where q.campaign_id=p_campaign_id and q.status in ('active','draft') and qt.location_id=p_location_id
        order by q.updated_at desc limit 8
      ) qctx
    ),'[]'::jsonb)
  )
  from public.locations l
  where l.id=p_location_id and l.campaign_id=p_campaign_id
$function$;

CREATE OR REPLACE FUNCTION public.prepare_ai_background_daily_worker_v1(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run public.ai_background_daily_runs%rowtype;
  v_input jsonb; v_npcs jsonb; v_locations jsonb; v_world_roll jsonb; v_world_snapshot jsonb;
  v_input_bytes integer; v_missing_rolls integer;
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service_role_required'; end if;
  if p_run_id is null then raise exception using errcode='22023',message='ai_background_worker_run_required'; end if;

  select * into v_run from public.ai_background_daily_runs where id=p_run_id for update;
  if v_run.id is null then raise exception using errcode='P0002',message='ai_background_run_not_found'; end if;
  if not private.is_ai_world_campaign_v1(v_run.campaign_id) then
    raise exception using errcode='42501',message='ai_background_ai_world_only';
  end if;
  if v_run.candidate_resolved_at is null then
    raise exception using errcode='55000',message='ai_background_candidates_not_resolved';
  end if;
  if v_run.worker_model<>'deepseek-v4.1-flash' then
    raise exception using errcode='22023',message='ai_background_worker_model_must_be_flash';
  end if;

  if v_run.status='completed' then
    return jsonb_build_object(
      'run_id',v_run.id,'campaign_id',v_run.campaign_id,'campaign_day',v_run.campaign_day,
      'worker_input',v_run.worker_input,'worker_output',v_run.worker_output,
      'input_bytes',v_run.worker_input_bytes,'replayed',true,'completed',true
    );
  end if;

  if v_run.status='running' and v_run.started_at is not null and v_run.started_at>now()-interval '2 minutes' then
    return jsonb_build_object(
      'run_id',v_run.id,'campaign_id',v_run.campaign_id,'campaign_day',v_run.campaign_day,
      'busy',true,'replayed',true,'completed',false
    );
  end if;

  if v_run.worker_input<>'{}'::jsonb then
    v_input:=v_run.worker_input; v_input_bytes:=v_run.worker_input_bytes;
  else
    v_world_roll:=private.ai_background_roll_for_worker_v1(v_run.id,'world',v_run.campaign_id::text);
    if v_world_roll is null then raise exception using errcode='55000',message='ai_background_world_roll_missing'; end if;

    select count(*) into v_missing_rolls
    from unnest(v_run.selected_npc_ids) x(id)
    where private.ai_background_roll_for_worker_v1(v_run.id,'npc',x.id::text) is null;
    if v_missing_rolls>0 then raise exception using errcode='55000',message='ai_background_selected_npc_roll_missing'; end if;

    select count(*) into v_missing_rolls
    from unnest(v_run.selected_location_ids) x(id)
    where private.ai_background_roll_for_worker_v1(v_run.id,'location',x.id::text) is null;
    if v_missing_rolls>0 then raise exception using errcode='55000',message='ai_background_selected_location_roll_missing'; end if;

    select coalesce(jsonb_agg(ctx order by ord),'[]'::jsonb) into v_npcs
    from (
      select u.ord,private.ai_background_npc_context_v1(v_run.id,v_run.campaign_id,v_run.campaign_day,u.id) ctx
      from unnest(v_run.selected_npc_ids) with ordinality u(id,ord)
    ) x;
    if exists(select 1 from jsonb_array_elements(v_npcs) j(value) where j.value is null or j.value='null'::jsonb) then
      raise exception using errcode='55000',message='ai_background_selected_npc_context_missing';
    end if;

    select coalesce(jsonb_agg(ctx order by ord),'[]'::jsonb) into v_locations
    from (
      select u.ord,private.ai_background_location_context_v1(v_run.id,v_run.campaign_id,v_run.campaign_day,u.id) ctx
      from unnest(v_run.selected_location_ids) with ordinality u(id,ord)
    ) x;
    if exists(select 1 from jsonb_array_elements(v_locations) j(value) where j.value is null or j.value='null'::jsonb) then
      raise exception using errcode='55000',message='ai_background_selected_location_context_missing';
    end if;

    v_world_snapshot:=private.ai_background_snapshot_for_worker_v1(v_run.campaign_id,v_run.campaign_day,'world',v_run.campaign_id::text);

    v_input:=jsonb_build_object(
      'surface','ai_background_daily_v1','prompt_version',1,'run_id',v_run.id,
      'campaign_id',v_run.campaign_id,'campaign_day',v_run.campaign_day,
      'rules',jsonb_build_object(
        'randomness_owner','world_resolver','supplied_rolls_locked',true,
        'candidate_selection_locked',true,'rejected_candidates_visible',false,
        'neutral_may_have_no_lasting_event',true,'canonical_mutation_allowed',false,
        'snapshot_write_allowed',false
      ),
      'world',jsonb_build_object(
        'campaign',(
          select jsonb_build_object(
            'id',c.id,'title',left(c.title,240),'summary',left(c.summary,2200),
            'rules_summary',left(c.rules_summary,1800)
          ) from public.campaigns c where c.id=v_run.campaign_id
        ),
        'roll',v_world_roll,'current_snapshot',v_world_snapshot,
        'recent_events',private.ai_background_recent_events_for_worker_v1(
          v_run.campaign_id,v_run.campaign_day,'world',v_run.campaign_id::text,6
        )
      ),
      'selected_npcs',v_npcs,'selected_locations',v_locations
    );

    v_input_bytes:=pg_catalog.octet_length(v_input::text);
    if v_input_bytes>180000 then
      raise exception using errcode='54000',message='ai_background_worker_input_budget_exceeded',
        detail=format('bytes=%s limit=180000',v_input_bytes);
    end if;
  end if;

  update public.ai_background_daily_runs
  set status='running',worker_input=v_input,worker_input_bytes=v_input_bytes,worker_prompt_version=1,
      started_at=now(),completed_at=null,failed_at=null,failure_code=null,failure_detail=null,updated_at=now()
  where id=v_run.id returning * into v_run;

  return jsonb_build_object(
    'run_id',v_run.id,'campaign_id',v_run.campaign_id,'campaign_day',v_run.campaign_day,
    'worker_model',v_run.worker_model,'worker_input',v_run.worker_input,
    'input_bytes',v_run.worker_input_bytes,'replayed',false,'completed',false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_ai_background_worker_item_v1(p_run_id uuid, p_item jsonb, p_expected_scope text, p_expected_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_roll public.ai_background_rolls%rowtype; v_expected jsonb; v_summary text; v_kind text;
  v_lasting boolean; v_importance integer; v_effect jsonb; v_state jsonb;
begin
  if jsonb_typeof(p_item)<>'object' then raise exception using errcode='22023',message='ai_background_worker_item_must_be_object'; end if;
  select * into v_roll from public.ai_background_rolls
  where run_id=p_run_id and target_scope=p_expected_scope and target_id=p_expected_id and sides=100
  order by created_at limit 1;
  if v_roll.id is null then raise exception using errcode='22023',message='ai_background_worker_item_roll_missing'; end if;

  v_expected:=private.ai_background_severity_meta_v1(v_roll.result);
  if coalesce(p_item->>'entity_scope','')<>p_expected_scope
     or coalesce(p_item->>'entity_id','')<>p_expected_id
     or coalesce(p_item->>'roll_result','') !~ '^[0-9]+$'
     or (p_item->>'roll_result')::integer<>v_roll.result
     or coalesce(p_item->>'severity_key','')<>coalesce(v_roll.matched_outcome_key,'')
     or coalesce(p_item->>'direction','')<>coalesce(v_expected->>'direction','')
     or coalesce(p_item->>'magnitude','')<>coalesce(v_expected->>'magnitude','')
  then raise exception using errcode='22023',message='ai_background_worker_supplied_roll_violation'; end if;

  if jsonb_typeof(p_item->'lasting_change')<>'boolean' then
    raise exception using errcode='22023',message='ai_background_worker_lasting_change_invalid';
  end if;
  v_lasting:=(p_item->>'lasting_change')::boolean;
  if v_roll.matched_outcome_key<>'neutral' and v_lasting is not true then
    raise exception using errcode='22023',message='ai_background_worker_non_neutral_must_be_lasting';
  end if;

  v_summary:=btrim(coalesce(p_item->>'summary',''));
  if length(v_summary)<1 or length(v_summary)>1800 then
    raise exception using errcode='22023',message='ai_background_worker_summary_invalid';
  end if;

  v_kind:=lower(btrim(coalesce(p_item->>'event_kind','')));
  if v_lasting and (length(v_kind)<1 or length(v_kind)>120 or v_kind !~ '^[a-z][a-z0-9._:-]{0,119}$') then
    raise exception using errcode='22023',message='ai_background_worker_event_kind_invalid';
  end if;
  if not v_lasting then v_kind:='none'; end if;

  if coalesce(p_item->>'importance','') !~ '^[0-5]$' then
    raise exception using errcode='22023',message='ai_background_worker_importance_invalid';
  end if;
  v_importance:=(p_item->>'importance')::integer;

  if jsonb_typeof(p_item->'effect_payload')<>'object' or jsonb_typeof(p_item->'proposed_state')<>'object' then
    raise exception using errcode='22023',message='ai_background_worker_effect_payload_invalid';
  end if;
  v_effect:=p_item->'effect_payload'; v_state:=p_item->'proposed_state';

  return jsonb_build_object(
    'entity_scope',p_expected_scope,'entity_id',p_expected_id,'roll_result',v_roll.result,
    'severity_key',v_roll.matched_outcome_key,'direction',v_expected->>'direction',
    'magnitude',v_expected->>'magnitude','lasting_change',v_lasting,'event_kind',v_kind,
    'summary',v_summary,'importance',v_importance,'effect_payload',v_effect,'proposed_state',v_state
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_ai_background_daily_worker_v1(p_run_id uuid, p_output jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run public.ai_background_daily_runs%rowtype; v_world jsonb; v_entities jsonb; v_item jsonb; v_norm jsonb;
  v_norm_entities jsonb:='[]'::jsonb; v_seen text[]:='{}'::text[]; v_key text; v_scope text; v_id text;
  v_expected_count integer; v_event_result jsonb; v_event_ids uuid[]:='{}'::uuid[]; v_event_id uuid; v_output jsonb;
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service_role_required'; end if;
  if p_run_id is null or jsonb_typeof(p_output)<>'object' then
    raise exception using errcode='22023',message='ai_background_worker_output_invalid';
  end if;

  select * into v_run from public.ai_background_daily_runs where id=p_run_id for update;
  if v_run.id is null then raise exception using errcode='P0002',message='ai_background_run_not_found'; end if;
  if not private.is_ai_world_campaign_v1(v_run.campaign_id) then
    raise exception using errcode='42501',message='ai_background_ai_world_only';
  end if;
  if v_run.status='completed' then
    return jsonb_build_object('run_id',v_run.id,'status','completed','worker_output',v_run.worker_output,'replayed',true);
  end if;
  if v_run.status<>'running' then raise exception using errcode='55000',message='ai_background_worker_run_not_running'; end if;
  if pg_catalog.octet_length(p_output::text)>180000 then raise exception using errcode='54000',message='ai_background_worker_output_budget_exceeded'; end if;

  v_world:=p_output->'world'; v_entities:=p_output->'entities';
  if jsonb_typeof(v_world)<>'object' or jsonb_typeof(v_entities)<>'array' then
    raise exception using errcode='22023',message='ai_background_worker_output_shape_invalid';
  end if;

  v_world:=private.validate_ai_background_worker_item_v1(v_run.id,v_world,'world',v_run.campaign_id::text);

  v_expected_count:=v_run.selected_npc_count+v_run.selected_location_count;
  if jsonb_array_length(v_entities)<>v_expected_count then
    raise exception using errcode='22023',message='ai_background_worker_entity_result_count_mismatch';
  end if;

  for v_item in select value from jsonb_array_elements(v_entities)
  loop
    v_scope:=lower(btrim(coalesce(v_item->>'entity_scope',''))); v_id:=btrim(coalesce(v_item->>'entity_id',''));
    if v_scope='npc' then
      if v_id !~ '^[0-9a-fA-F-]{36}$' or not ((v_id::uuid)=any(v_run.selected_npc_ids)) then
        raise exception using errcode='22023',message='ai_background_worker_rejected_or_unknown_npc';
      end if;
    elsif v_scope='location' then
      if v_id !~ '^[0-9a-fA-F-]{36}$' or not ((v_id::uuid)=any(v_run.selected_location_ids)) then
        raise exception using errcode='22023',message='ai_background_worker_rejected_or_unknown_location';
      end if;
    else
      raise exception using errcode='22023',message='ai_background_worker_entity_scope_invalid';
    end if;

    v_key:=v_scope||':'||lower(v_id);
    if v_key=any(v_seen) then raise exception using errcode='22023',message='ai_background_worker_duplicate_entity_result'; end if;
    v_seen:=array_append(v_seen,v_key);
    v_norm:=private.validate_ai_background_worker_item_v1(v_run.id,v_item,v_scope,v_id);
    v_norm_entities:=v_norm_entities||jsonb_build_array(v_norm);
  end loop;

  if exists(select 1 from unnest(v_run.selected_npc_ids) x(id) where not ('npc:'||lower(x.id::text)=any(v_seen)))
     or exists(select 1 from unnest(v_run.selected_location_ids) x(id) where not ('location:'||lower(x.id::text)=any(v_seen)))
  then raise exception using errcode='22023',message='ai_background_worker_selected_entity_missing'; end if;

  if (v_world->>'lasting_change')::boolean then
    v_event_result:=public.append_ai_background_event_v1(
      v_run.id,'stage10:world','world',v_run.campaign_id::text,v_world->>'event_kind',v_world->>'summary',
      (v_world->'effect_payload')||jsonb_build_object(
        'roll_result',(v_world->>'roll_result')::integer,'severity_key',v_world->>'severity_key',
        'direction',v_world->>'direction','magnitude',v_world->>'magnitude',
        'proposed_state',v_world->'proposed_state','worker_model',v_run.worker_model,'stage',10
      ),
      (v_world->>'importance')::smallint
    );
    v_event_id:=(v_event_result->'event'->>'id')::uuid; v_event_ids:=array_append(v_event_ids,v_event_id);
  end if;

  for v_item in select value from jsonb_array_elements(v_norm_entities)
  loop
    if (v_item->>'lasting_change')::boolean then
      v_event_result:=public.append_ai_background_event_v1(
        v_run.id,'stage10:'||(v_item->>'entity_scope')||':'||(v_item->>'entity_id'),
        v_item->>'entity_scope',v_item->>'entity_id',v_item->>'event_kind',v_item->>'summary',
        (v_item->'effect_payload')||jsonb_build_object(
          'roll_result',(v_item->>'roll_result')::integer,'severity_key',v_item->>'severity_key',
          'direction',v_item->>'direction','magnitude',v_item->>'magnitude',
          'proposed_state',v_item->'proposed_state','worker_model',v_run.worker_model,'stage',10
        ),
        (v_item->>'importance')::smallint
      );
      v_event_id:=(v_event_result->'event'->>'id')::uuid; v_event_ids:=array_append(v_event_ids,v_event_id);
    end if;
  end loop;

  v_output:=jsonb_build_object(
    'surface','ai_background_daily_v1','prompt_version',v_run.worker_prompt_version,
    'world',v_world,'entities',v_norm_entities,'event_ids',to_jsonb(v_event_ids)
  );

  update public.ai_background_daily_runs
  set status='completed',worker_output=v_output,completed_at=now(),failed_at=null,failure_code=null,failure_detail=null,
      audit=coalesce(audit,'{}'::jsonb)||jsonb_build_object(
        'stage10',jsonb_build_object(
          'worker_model',worker_model,'input_bytes',worker_input_bytes,
          'result_count',1+v_expected_count,'lasting_event_count',cardinality(v_event_ids),'completed_at',now()
        )
      ),
      updated_at=now()
  where id=v_run.id returning * into v_run;

  return jsonb_build_object(
    'run_id',v_run.id,'status',v_run.status,'event_ids',to_jsonb(v_event_ids),
    'worker_output',v_run.worker_output,'replayed',false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fail_ai_background_daily_worker_v1(p_run_id uuid, p_failure_code text, p_failure_detail text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_run public.ai_background_daily_runs%rowtype;
  v_code text:=lower(btrim(coalesce(p_failure_code,'ai_background_worker_failed')));
  v_detail text:=left(coalesce(p_failure_detail,''),1200);
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service_role_required'; end if;
  if p_run_id is null then raise exception using errcode='22023',message='ai_background_worker_run_required'; end if;
  if length(v_code)<1 or length(v_code)>120 or v_code !~ '^[a-z0-9][a-z0-9._:-]*$' then v_code:='ai_background_worker_failed'; end if;

  select * into v_run from public.ai_background_daily_runs where id=p_run_id for update;
  if v_run.id is null then raise exception using errcode='P0002',message='ai_background_run_not_found'; end if;
  if not private.is_ai_world_campaign_v1(v_run.campaign_id) then
    raise exception using errcode='42501',message='ai_background_ai_world_only';
  end if;
  if v_run.status='completed' then return jsonb_build_object('run_id',v_run.id,'status','completed','ignored',true); end if;

  update public.ai_background_daily_runs
  set status='failed',failure_code=v_code,failure_detail=v_detail,failed_at=now(),updated_at=now()
  where id=v_run.id returning * into v_run;
  return jsonb_build_object('run_id',v_run.id,'status',v_run.status,'failure_code',v_run.failure_code);
end;
$function$;

CREATE OR REPLACE FUNCTION public.verify_ai_background_dispatch_v1(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(
    select 1 from private.ai_background_dispatch_config cfg
    where cfg.singleton=true and cfg.enabled=true and p_token is not null
      and length(p_token)>=32 and cfg.dispatch_token=p_token
  )
$function$;

CREATE OR REPLACE FUNCTION private.dispatch_ai_background_daily_run_v1(p_run_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run public.ai_background_daily_runs%rowtype;
  v_config private.ai_background_dispatch_config%rowtype;
  v_request_id bigint;
begin
  if p_run_id is null then return null; end if;
  select * into v_run from public.ai_background_daily_runs where id=p_run_id for update;
  if v_run.id is null or v_run.candidate_resolved_at is null or v_run.status not in ('queued','failed') then return null; end if;
  if v_run.last_dispatch_at is not null and v_run.last_dispatch_at>now()-interval '30 seconds' then return null; end if;

  select * into v_config from private.ai_background_dispatch_config where singleton=true;
  if v_config.singleton is null or v_config.enabled is not true
     or nullif(btrim(v_config.project_url),'') is null or nullif(btrim(v_config.dispatch_token),'') is null
  then return null; end if;

  select net.http_post(
    url:=rtrim(v_config.project_url,'/')||'/functions/v1/ai-world-background',
    body:=jsonb_build_object('runId',v_run.id::text,'dispatchToken',v_config.dispatch_token),
    headers:=jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds:=90000
  ) into v_request_id;

  if v_request_id is not null then
    update public.ai_background_daily_runs
    set last_dispatch_at=now(),dispatch_request_id=v_request_id,updated_at=now()
    where id=v_run.id;
  end if;
  return v_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_ai_background_daily_run_v1(p_run_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service_role_required'; end if;
  return private.dispatch_ai_background_daily_run_v1(p_run_id);
end;
$function$;

CREATE OR REPLACE FUNCTION private.dispatch_ai_background_after_candidates_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.candidate_resolved_at is not null and old.candidate_resolved_at is null and new.status='queued' then
    perform private.dispatch_ai_background_daily_run_v1(new.id);
  end if;
  return new;
end;
$function$;


revoke all on function private.ai_background_severity_meta_v1(integer)
  from public, anon, authenticated;
revoke all on function private.ai_background_roll_for_worker_v1(uuid,text,text)
  from public, anon, authenticated;
revoke all on function private.ai_background_snapshot_for_worker_v1(uuid,integer,text,text)
  from public, anon, authenticated;
revoke all on function private.ai_background_recent_events_for_worker_v1(uuid,integer,text,text,integer)
  from public, anon, authenticated;
revoke all on function private.ai_background_npc_context_v1(uuid,uuid,integer,uuid)
  from public, anon, authenticated;
revoke all on function private.ai_background_location_context_v1(uuid,uuid,integer,uuid)
  from public, anon, authenticated;
revoke all on function private.validate_ai_background_worker_item_v1(uuid,jsonb,text,text)
  from public, anon, authenticated;
revoke all on function private.dispatch_ai_background_daily_run_v1(uuid)
  from public, anon, authenticated;
revoke all on function private.dispatch_ai_background_after_candidates_v1()
  from public, anon, authenticated;

revoke all on function public.prepare_ai_background_daily_worker_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_ai_background_daily_worker_v1(uuid)
  to service_role;

revoke all on function public.complete_ai_background_daily_worker_v1(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_ai_background_daily_worker_v1(uuid,jsonb)
  to service_role;

revoke all on function public.fail_ai_background_daily_worker_v1(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.fail_ai_background_daily_worker_v1(uuid,text,text)
  to service_role;

revoke all on function public.verify_ai_background_dispatch_v1(text)
  from public, anon, authenticated;
grant execute on function public.verify_ai_background_dispatch_v1(text)
  to service_role;

revoke all on function public.dispatch_ai_background_daily_run_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.dispatch_ai_background_daily_run_v1(uuid)
  to service_role;

comment on function public.prepare_ai_background_daily_worker_v1(uuid) is
  'Stage 10 service-role worker claim. Builds and persists bounded input exclusively from Stage 9 selected IDs plus authoritative rolls and narrow canon; rejected candidate ledger is not read.';
comment on function public.complete_ai_background_daily_worker_v1(uuid,jsonb) is
  'Stage 10 strict completion boundary. Requires exactly one result per supplied world/entity roll, rejects unselected IDs and roll/severity substitution, and appends immutable lasting events only.';

create trigger ai_background_daily_runs_dispatch_stage10
after update of candidate_resolved_at on public.ai_background_daily_runs
for each row
execute function private.dispatch_ai_background_after_candidates_v1();
