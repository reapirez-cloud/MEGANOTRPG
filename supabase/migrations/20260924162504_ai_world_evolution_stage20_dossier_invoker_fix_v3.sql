create or replace function public.read_world_npc_dossier_v2(p_npc_character_id uuid)
returns jsonb
language plpgsql
stable
security invoker
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
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) is true then
    raise exception using errcode='42501',message='permanent_user_required';
  end if;

  v_base:=public.read_world_npc_dossier_v1(p_npc_character_id);

  select c.campaign_id
    into v_campaign_id
  from public.characters c
  where c.id=p_npc_character_id
    and c.character_type='npc'
    and c.publication_state='campaign';

  if v_campaign_id is null then
    raise exception 'NPC not found or unavailable';
  end if;

  v_can_manage:=jsonb_typeof(v_base->'manager')='object';

  select cm.active_character_id
    into v_active_character_id
  from public.campaign_members cm
  where cm.campaign_id=v_campaign_id
    and cm.user_id=v_user_id;

  if v_active_character_id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'observation_key',o.observation_key,
          'statement',o.statement,
          'confidence',o.confidence,
          'source_event_id',o.source_event_id,
          'discovered_at',o.discovered_at,
          'updated_at',o.updated_at
        )
        order by o.updated_at desc
      ),
      '[]'::jsonb
    )
    into v_observed
    from public.npc_identity_observations o
    where o.campaign_id=v_campaign_id
      and o.npc_character_id=p_npc_character_id
      and o.observer_character_id=v_active_character_id
      and o.state='active';
  end if;

  if v_can_manage then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'version',v.version,
          'change_kind',v.change_kind,
          'source_event_id',v.source_event_id,
          'source_kind',v.source_kind,
          'source_ref',v.source_ref,
          'fingerprint_hash',v.fingerprint_hash,
          'created_at',v.created_at
        )
        order by v.version desc
      ),
      '[]'::jsonb
    )
    into v_recent_versions
    from (
      select *
      from public.npc_identity_fingerprint_versions
      where character_id=p_npc_character_id
      order by version desc
      limit 8
    ) v;

    select jsonb_build_object(
      'version',f.current_version,
      'bootstrap_state',f.bootstrap_state,
      'fingerprint_hash',f.fingerprint_hash,
      'core',jsonb_build_object(
        'traits',f.traits,
        'weighted_values',f.weighted_values,
        'red_lines',f.red_lines,
        'long_term_desires',f.long_term_desires,
        'fears',f.fears,
        'loyalties',f.loyalties,
        'authority_attitude',f.authority_attitude,
        'risk_tolerance',f.risk_tolerance,
        'violence_threshold',f.violence_threshold,
        'pressure_behavior',f.pressure_behavior,
        'self_image',f.self_image,
        'social_style',f.social_style,
        'decision_priorities',f.decision_priorities
      ),
      'source_kind',f.source_kind,
      'source_ref',f.source_ref,
      'provenance',f.provenance,
      'last_major_event_id',f.last_major_event_id,
      'updated_at',f.updated_at,
      'recent_versions',v_recent_versions
    )
    into v_identity
    from public.npc_identity_fingerprints f
    where f.character_id=p_npc_character_id
      and f.campaign_id=v_campaign_id;

    v_base:=jsonb_set(
      v_base,
      '{manager}',
      coalesce(v_base->'manager','{}'::jsonb)
        || jsonb_build_object('identity_fingerprint',v_identity),
      true
    );
  end if;

  return v_base||jsonb_build_object(
    'observed_identity',coalesce(v_observed,'[]'::jsonb)
  );
end;
$$;

revoke all on function public.read_world_npc_dossier_v2(uuid)
  from public,anon;
grant execute on function public.read_world_npc_dossier_v2(uuid)
  to authenticated;

comment on function public.read_world_npc_dossier_v2(uuid) is
  'Stage 20 NPC dossier, SECURITY INVOKER. Dossier v1 establishes base visibility; campaign membership and Stage 20 identity/observations are then read under caller RLS. Anonymous sign-in users are rejected.';
