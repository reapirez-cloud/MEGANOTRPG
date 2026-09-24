create or replace function private.ai_background_npc_context_v1(
  p_run_id uuid,
  p_campaign_id uuid,
  p_campaign_day integer,
  p_npc_id uuid
)
returns jsonb
language sql
stable
set search_path=''
as $$
  select jsonb_build_object(
    'entity_scope','npc',
    'entity_id',c.id,
    'name',left(c.name,160),
    'character_class',left(c.character_class,120),
    'level',c.level,
    'life_state',c.life_state,
    'profile',jsonb_build_object(
      'role',left(coalesce(np.role,''),120),
      'species',left(coalesce(np.species,''),160),
      'occupation',left(coalesce(np.occupation,''),240),
      'faction_text',left(coalesce(np.faction,''),240),
      'demeanor',left(coalesce(np.demeanor,''),1200),
      'motivation',left(coalesce(np.motivation,''),1800),
      'public_notes',left(coalesce(np.public_notes,''),1200),
      'gm_notes',left(coalesce(np.gm_notes,''),1800),
      'tags',coalesce(to_jsonb(np.tags),'[]'::jsonb)
    ),
    'identity_fingerprint',
      case when identity.character_id is null then null
      else jsonb_build_object(
        'version',identity.current_version,
        'bootstrap_state',identity.bootstrap_state,
        'fingerprint_hash',identity.fingerprint_hash,
        'core',private.npc_identity_core_from_current_v1(identity.character_id),
        'last_major_event_id',identity.last_major_event_id
      ) end,
    'world_state',case when cws.character_id is null then null else jsonb_build_object(
      'location_id',cws.location_id,
      'campaign_day',cws.campaign_day,
      'day_period',cws.day_period
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
          case when cr.subject_character_id=p_npc_id
            then cr.target_character_id else cr.subject_character_id end other_character_id,
          left(oc.name,160) other_name,cr.relationship_kind,
          left(cr.public_label,240) public_label,cr.attitude_score,
          left(cr.gm_note,1000) gm_note,cr.updated_at
        from public.character_relationships cr
        join public.characters oc
          on oc.id=case when cr.subject_character_id=p_npc_id
            then cr.target_character_id else cr.subject_character_id end
        where cr.campaign_id=p_campaign_id
          and cr.state='active'
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
            (select qc.role from public.quest_characters qc
              where qc.quest_id=q.id and qc.character_id=p_npc_id limit 1),
            (select 'target'::text from public.quest_targets qt
              where qt.quest_id=q.id and qt.npc_character_id=p_npc_id limit 1)
          ) link_role,
          q.updated_at
        from public.quests q
        where q.campaign_id=p_campaign_id and q.status in ('active','draft')
          and (
            exists(select 1 from public.quest_characters qc
              where qc.quest_id=q.id and qc.character_id=p_npc_id)
            or exists(select 1 from public.quest_targets qt
              where qt.quest_id=q.id and qt.npc_character_id=p_npc_id)
          )
        order by q.updated_at desc limit 8
      ) qctx
    ),'[]'::jsonb)
  )
  from public.characters c
  left join public.npc_profiles np
    on np.character_id=c.id and np.campaign_id=c.campaign_id
  left join public.npc_identity_fingerprints identity
    on identity.character_id=c.id and identity.campaign_id=c.campaign_id
  left join public.character_world_state cws
    on cws.character_id=c.id and cws.campaign_id=c.campaign_id
  left join public.locations l
    on l.id=cws.location_id and l.campaign_id=c.campaign_id
  where c.id=p_npc_id and c.campaign_id=p_campaign_id
    and c.character_type='npc' and c.publication_state='campaign'
$$;

revoke all on function private.ai_background_npc_context_v1(uuid,uuid,integer,uuid)
  from public,anon,authenticated;

create or replace function public.read_world_npc_dossier_v2(p_npc_character_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_can_manage boolean := false;
  v_active_character_id uuid;
  v_base jsonb;
  v_identity jsonb := null;
  v_observed jsonb := '[]'::jsonb;
  v_recent_versions jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select c.campaign_id into v_campaign_id
  from public.characters c
  where c.id=p_npc_character_id
    and c.character_type='npc'
    and c.publication_state='campaign';

  if v_campaign_id is null then raise exception 'NPC not found or unavailable'; end if;

  v_base:=public.read_world_npc_dossier_v1(p_npc_character_id);
  v_can_manage:=private.can_manage_campaign(v_campaign_id,v_user_id);
  v_active_character_id:=private.active_character_for_user(v_campaign_id,v_user_id);

  if v_active_character_id is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'observation_key',o.observation_key,'statement',o.statement,
        'confidence',o.confidence,'source_event_id',o.source_event_id,
        'discovered_at',o.discovered_at,'updated_at',o.updated_at
      ) order by o.updated_at desc
    ),'[]'::jsonb)
    into v_observed
    from public.npc_identity_observations o
    where o.campaign_id=v_campaign_id
      and o.npc_character_id=p_npc_character_id
      and o.observer_character_id=v_active_character_id
      and o.state='active';
  end if;

  if v_can_manage then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'version',v.version,'change_kind',v.change_kind,
        'source_event_id',v.source_event_id,'source_kind',v.source_kind,
        'source_ref',v.source_ref,'fingerprint_hash',v.fingerprint_hash,
        'created_at',v.created_at
      ) order by v.version desc
    ),'[]'::jsonb)
    into v_recent_versions
    from (
      select * from public.npc_identity_fingerprint_versions
      where character_id=p_npc_character_id
      order by version desc limit 8
    ) v;

    select jsonb_build_object(
      'version',f.current_version,'bootstrap_state',f.bootstrap_state,
      'fingerprint_hash',f.fingerprint_hash,
      'core',private.npc_identity_core_from_current_v1(f.character_id),
      'source_kind',f.source_kind,'source_ref',f.source_ref,
      'provenance',f.provenance,'last_major_event_id',f.last_major_event_id,
      'updated_at',f.updated_at,'recent_versions',v_recent_versions
    )
    into v_identity
    from public.npc_identity_fingerprints f
    where f.character_id=p_npc_character_id and f.campaign_id=v_campaign_id;

    v_base:=jsonb_set(
      v_base,'{manager}',
      coalesce(v_base->'manager','{}'::jsonb)
        || jsonb_build_object('identity_fingerprint',v_identity),
      true
    );
  end if;

  return v_base||jsonb_build_object('observed_identity',coalesce(v_observed,'[]'::jsonb));
end;
$$;

revoke all on function public.read_world_npc_dossier_v2(uuid) from public,anon;
grant execute on function public.read_world_npc_dossier_v2(uuid) to authenticated;

comment on function public.read_world_npc_dossier_v2(uuid) is
  'Stage 20 NPC dossier. Players receive only their character-specific observed identity traits; GM/Admin additionally receive the private canonical current identity fingerprint and version metadata.';

alter publication supabase_realtime
  add table public.npc_identity_fingerprints,
            public.npc_identity_observations;
