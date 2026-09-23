-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 8: transactional scene-actor promotion.

alter table public.ai_scene_actors
  add column promoted_character_id uuid references public.characters(id) on delete restrict,
  add column promoted_at timestamptz,
  add column promotion_name text,
  add column promotion_source_message_id bigint references public.chat_messages(id) on delete set null;

create unique index ai_scene_actors_promoted_character_uidx
  on public.ai_scene_actors(promoted_character_id)
  where promoted_character_id is not null;

create index ai_scene_actors_promotion_source_message_fk_idx
  on public.ai_scene_actors(promotion_source_message_id)
  where promotion_source_message_id is not null;

alter table public.ai_scene_actors
  add constraint ai_scene_actors_promotion_state_check
  check (
    promoted_character_id is null
    or (
      runtime_state='archived'
      and promoted_at is not null
      and promotion_name is not null
    )
  );

CREATE OR REPLACE FUNCTION private.queue_ai_gm_npc_runtime_after_profile_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job_id uuid;
begin
  v_job_id := private.reserve_ai_gm_npc_runtime_build_v1(new.character_id);
  if v_job_id is not null
     and coalesce(current_setting('meganot.scene_actor_promotion',true),'off') <> 'on'
  then
    perform private.dispatch_ai_gm_npc_runtime_build_v1(v_job_id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.queue_ai_gm_npc_runtime_after_character_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job_id uuid;
begin
  if new.character_type <> 'npc'
     or new.publication_state <> 'campaign'
     or new.life_state <> 'alive'
  then
    return new;
  end if;

  v_job_id := private.reserve_ai_gm_npc_runtime_build_v1(new.id);
  if v_job_id is not null
     and coalesce(current_setting('meganot.scene_actor_promotion',true),'off') <> 'on'
  then
    perform private.dispatch_ai_gm_npc_runtime_build_v1(v_job_id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.resolve_ai_combat_actor_ref_v2(p_actor_ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ref jsonb;
  v_actor public.ai_scene_actors%rowtype;
begin
  v_ref := private.normalize_ai_combat_actor_ref_v1(p_actor_ref);

  if v_ref->>'kind'='npc' then
    return jsonb_build_object(
      'kind','npc',
      'id',v_ref->>'id',
      'redirected',false
    );
  end if;

  select * into v_actor
  from public.ai_scene_actors
  where id=(v_ref->>'id')::uuid;

  if v_actor.id is not null and v_actor.promoted_character_id is not null then
    return jsonb_build_object(
      'kind','npc',
      'id',v_actor.promoted_character_id,
      'redirected',true,
      'source_actor_id',v_actor.id
    );
  end if;

  return jsonb_build_object(
    'kind','scene_actor',
    'id',v_ref->>'id',
    'redirected',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_ai_combat_actor_ref_v1(p_actor_ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;
  return private.resolve_ai_combat_actor_ref_v2(p_actor_ref);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.promote_ai_scene_actor_to_npc_v1(p_actor_id uuid, p_personal_name text, p_discover_for_character_ids uuid[] DEFAULT '{}'::uuid[], p_source_message_id bigint DEFAULT NULL::bigint, p_requested_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor public.ai_scene_actors%rowtype;
  v_name text := btrim(coalesce(p_personal_name,''));
  v_requested_by uuid := p_requested_by;
  v_existing_name text;
  v_npc_id uuid;
  v_bestiary public.bestiary_catalog%rowtype;
  v_sheet jsonb;
  v_mechanic jsonb;
  v_npc_mechanics jsonb := '[]'::jsonb;
  v_resource public.ai_scene_actor_resources%rowtype;
  v_template_id uuid;
  v_template_slug text;
  v_runtime_job_id uuid;
  v_signature text;
  v_discover_id uuid;
  v_character_life_state text;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  if p_actor_id is null then
    raise exception using errcode='22023', message='scene_actor_promotion_actor_required';
  end if;

  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception using errcode='22023', message='scene_actor_personal_name_invalid';
  end if;

  if v_name ~ '(?:[[:space:]#№]|^)[0-9]+$' then
    raise exception using errcode='22023', message='scene_actor_personal_name_must_not_be_ordinal';
  end if;

  select * into v_actor
  from public.ai_scene_actors
  where id=p_actor_id
  for update;

  if v_actor.id is null then
    raise exception using errcode='P0002', message='scene_actor_not_found';
  end if;

  if not private.is_ai_world_campaign_v1(v_actor.campaign_id) then
    raise exception using errcode='42501', message='scene_actor_ai_world_only';
  end if;

  if lower(v_name)=lower(btrim(v_actor.display_label)) then
    raise exception using errcode='22023', message='scene_actor_personal_name_must_be_real_identity';
  end if;

  if v_actor.promoted_character_id is not null then
    select c.name into v_existing_name
    from public.characters c
    where c.id=v_actor.promoted_character_id;

    if lower(coalesce(v_actor.promotion_name,v_existing_name,'')) <> lower(v_name) then
      raise exception using errcode='22023', message='scene_actor_promotion_name_conflict';
    end if;

    return jsonb_build_object(
      'actor_id',v_actor.id,
      'npc_character_id',v_actor.promoted_character_id,
      'personal_name',coalesce(v_actor.promotion_name,v_existing_name),
      'source_bestiary_slug',v_actor.source_bestiary_slug,
      'replayed',true
    );
  end if;

  if v_requested_by is null then
    select cm.user_id into v_requested_by
    from public.campaign_members cm
    where cm.campaign_id=v_actor.campaign_id
      and (cm.is_owner=true or cm.role='gm')
    order by cm.is_owner desc,cm.created_at asc
    limit 1;
  elsif not exists(
    select 1
    from public.campaign_members cm
    where cm.campaign_id=v_actor.campaign_id
      and cm.user_id=v_requested_by
      and (cm.is_owner=true or cm.role='gm')
  ) then
    raise exception using errcode='42501', message='scene_actor_promotion_manager_required';
  end if;

  if v_requested_by is null then
    raise exception using errcode='42501', message='scene_actor_promotion_manager_missing';
  end if;

  if p_source_message_id is not null and not exists(
    select 1
    from public.chat_messages m
    where m.id=p_source_message_id
      and m.room_id=v_actor.room_id
  ) then
    raise exception using errcode='22023', message='scene_actor_promotion_source_message_invalid';
  end if;

  foreach v_discover_id in array coalesce(p_discover_for_character_ids,'{}'::uuid[])
  loop
    if not exists(
      select 1
      from public.characters c
      where c.id=v_discover_id
        and c.campaign_id=v_actor.campaign_id
        and c.character_type='pc'
        and c.publication_state='campaign'
    ) then
      raise exception using errcode='22023', message='scene_actor_promotion_discovery_character_invalid';
    end if;
  end loop;

  select * into v_bestiary
  from public.bestiary_catalog
  where slug=v_actor.source_bestiary_slug;

  if v_bestiary.id is null then
    raise exception using errcode='22023', message='scene_actor_promotion_bestiary_source_missing';
  end if;

  perform set_config('meganot.scene_actor_promotion','on',true);

  insert into public.characters(
    campaign_id,assigned_user_id,name,character_class,level,bio,avatar_url,
    character_type,visibility,visibility_mode,publication_state,life_state,created_by
  )
  values(
    v_actor.campaign_id,null,v_name,'NPC',1,'',null,
    'npc','campaign','discover','campaign','alive',v_requested_by
  )
  returning id into v_npc_id;

  v_sheet := coalesce(v_actor.sheet_snapshot,'{}'::jsonb);

  update public.character_sheets cs
  set
    race=left(coalesce(v_bestiary.name_en,''),160),
    strength=coalesce((v_sheet->>'strength')::integer,10),
    dexterity=coalesce((v_sheet->>'dexterity')::integer,10),
    constitution=coalesce((v_sheet->>'constitution')::integer,10),
    intelligence=coalesce((v_sheet->>'intelligence')::integer,10),
    wisdom=coalesce((v_sheet->>'wisdom')::integer,10),
    charisma=coalesce((v_sheet->>'charisma')::integer,10),
    armor_class=coalesce((v_sheet->>'armor_class')::integer,10),
    max_hp=v_actor.max_hp,
    current_hp=v_actor.current_hp,
    hit_dice=left(coalesce(v_sheet->>'hit_dice',v_bestiary.hit_dice,''),120),
    proficiency_bonus=coalesce((v_sheet->>'proficiency_bonus')::integer,2),
    speed=coalesce((v_sheet->>'speed')::integer,30),
    passive_perception=coalesce((v_sheet->>'passive_perception')::integer,10),
    saving_throw_proficiencies=coalesce(v_sheet->'saving_throw_proficiencies','[]'::jsonb),
    skill_proficiencies=coalesce(v_sheet->'skill_proficiencies','{}'::jsonb),
    senses=left(coalesce(v_sheet->>'senses',v_bestiary.senses::text,''),2000),
    languages=left(coalesce(v_sheet->>'languages',v_bestiary.languages,''),2000),
    runtime_facts=coalesce(cs.runtime_facts,'{}'::jsonb)||jsonb_build_object(
      'promotedFromSceneActorId',v_actor.id,
      'sceneActorSourceBestiarySlug',v_actor.source_bestiary_slug,
      'sceneActorSourceDigest',v_actor.source_digest,
      'sceneActorCompilerVersion',v_actor.compiler_version,
      'sceneActorConditions',v_actor.conditions,
      'sceneActorEffects',v_actor.effects,
      'sceneActorPromotedAt',now()
    ),
    updated_at=now()
  where cs.character_id=v_npc_id;

  insert into public.npc_profiles(
    character_id,campaign_id,background_simulation_scope,role,species,
    creature_type,size,challenge_rating,public_notes,gm_notes,tags,
    created_by,updated_by
  )
  values(
    v_npc_id,v_actor.campaign_id,'disabled','npc',
    left(coalesce(v_bestiary.name_en,v_actor.display_label,''),160),
    coalesce(nullif(lower(btrim(v_bestiary.creature_type)),''),'humanoid'),
    case when lower(coalesce(v_bestiary.size,'medium')) in
      ('tiny','small','medium','large','huge','gargantuan')
      then lower(v_bestiary.size) else 'medium' end,
    coalesce(v_bestiary.challenge_rating,0),
    '',
    left('Promoted from scene actor '||v_actor.id::text||
      '; bestiary='||v_actor.source_bestiary_slug||
      '; source_digest='||v_actor.source_digest,24000),
    array['scene-actor-promotion',left('bestiary:'||v_actor.source_bestiary_slug,80)]::text[],
    v_requested_by,v_requested_by
  );

  insert into public.character_world_state(
    character_id,campaign_id,location_id,campaign_day,day_period,updated_by
  )
  values(
    v_npc_id,v_actor.campaign_id,v_actor.location_id,
    v_actor.campaign_day,v_actor.day_period,v_requested_by
  )
  on conflict(character_id) do update set
    campaign_id=excluded.campaign_id,
    location_id=excluded.location_id,
    campaign_day=excluded.campaign_day,
    day_period=excluded.day_period,
    updated_by=excluded.updated_by,
    updated_at=now();

  if v_actor.location_id is not null then
    insert into public.location_npc_habitats(
      location_id,npc_character_id,campaign_id,created_by
    )
    values(v_actor.location_id,v_npc_id,v_actor.campaign_id,v_requested_by)
    on conflict(location_id,npc_character_id) do nothing;
  end if;

  foreach v_discover_id in array coalesce(p_discover_for_character_ids,'{}'::uuid[])
  loop
    insert into public.character_npc_discoveries(
      character_id,npc_character_id,discovered_by,source,source_message_id,last_interaction_at
    )
    values(
      v_discover_id,v_npc_id,v_requested_by,'ai_gm',
      p_source_message_id,now()
    )
    on conflict(character_id,npc_character_id) do update set
      discovered_by=excluded.discovered_by,
      source=excluded.source,
      source_message_id=coalesce(excluded.source_message_id,public.character_npc_discoveries.source_message_id),
      last_interaction_at=excluded.last_interaction_at;
  end loop;

  for v_mechanic in
    select value
    from jsonb_array_elements(coalesce(v_actor.mechanics_snapshot,'[]'::jsonb))
  loop
    v_npc_mechanics := v_npc_mechanics || jsonb_build_array(
      private.bestiary_runtime_mechanic_for_npc_v1(v_npc_id,v_mechanic)
    );
  end loop;

  v_template_slug := 'npc-runtime-'||replace(v_npc_id::text,'-','');

  insert into public.rule_templates(
    campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
    created_by,catalog_key,catalog_revision,source_kind,source_label,is_builtin,
    mechanical_summary,author_description,author_comment,rules_meta
  )
  values(
    v_actor.campaign_id,'class',v_template_slug,
    'NPC Runtime · '||left(v_name,120),
    'Canonical NPC runtime promoted from a Stage 4 scene-actor snapshot.',
    1,v_npc_mechanics,'[]'::jsonb,true,v_requested_by,
    'npc-runtime:'||v_npc_id::text,'stage8-promotion','custom',
    'AI GM Scene Actor Promotion',false,
    'Server-authoritative NPC mechanics preserved from scene actor.','','',
    jsonb_build_object(
      'npc_runtime_stage',6,
      'promotion_stage',8,
      'npc_character_id',v_npc_id,
      'source_scene_actor_id',v_actor.id,
      'bestiary_slug',v_actor.source_bestiary_slug,
      'source_digest',v_actor.source_digest,
      'compiler_version',v_actor.compiler_version
    )
  )
  returning id into v_template_id;

  insert into public.character_template_assignments(
    character_id,template_id,template_level,selected_choices,assigned_by
  )
  values(v_npc_id,v_template_id,1,'{}'::jsonb,v_requested_by);

  for v_resource in
    select *
    from public.ai_scene_actor_resources
    where actor_id=v_actor.id
    order by state_key
  loop
    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,updated_by
    )
    values(
      v_npc_id,
      'npc_runtime_'||v_resource.state_key,
      v_resource.current,
      v_resource.max_snapshot,
      v_resource.label,
      v_resource.recharge,
      v_requested_by
    )
    on conflict(character_id,state_key) do update set
      current=excluded.current,
      max_snapshot=excluded.max_snapshot,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=excluded.updated_by,
      updated_at=now();
  end loop;

  select b.last_job_id into v_runtime_job_id
  from public.npc_runtime_builds b
  where b.character_id=v_npc_id
  for update;

  if v_runtime_job_id is null then
    v_runtime_job_id := private.reserve_ai_gm_npc_runtime_build_v1(v_npc_id);
  end if;

  v_signature := private.ai_gm_npc_runtime_signature_v1(v_npc_id);

  update public.npc_runtime_builds
  set
    status='ready',
    source_bestiary_slug=v_actor.source_bestiary_slug,
    template_id=v_template_id,
    model_id=null,
    build_revision=greatest(build_revision,0)+1,
    build_payload=jsonb_build_object(
      'bestiary_slug',v_actor.source_bestiary_slug,
      'compiler','bestiary-runtime',
      'compiler_version',v_actor.compiler_version,
      'source_digest',v_actor.source_digest,
      'source_scene_actor_id',v_actor.id,
      'promotion_stage',8,
      'snapshot_preserved',true
    ),
    generated_at=now(),
    build_signature=v_signature,
    requested_signature=v_signature,
    updated_at=now()
  where character_id=v_npc_id;

  if v_runtime_job_id is not null then
    update public.agent_jobs
    set
      status='completed',
      completed_outputs=1,
      result=jsonb_build_object(
        'surface','npc_runtime_build_v1',
        'npc_character_id',v_npc_id,
        'template_id',v_template_id,
        'bestiary_slug',v_actor.source_bestiary_slug,
        'source_scene_actor_id',v_actor.id,
        'promotion_stage',8,
        'snapshot_preserved',true
      ),
      completed_at=now(),
      updated_at=now(),
      error_code=null,
      error_message=null
    where id=v_runtime_job_id
      and status in ('queued','running');
  end if;

  if v_actor.life_state='dead' then
    v_character_life_state := 'dead';
    update public.characters
    set life_state='dead',died_at=coalesce(died_at,now()),updated_at=now()
    where id=v_npc_id;
  else
    v_character_life_state := 'alive';
  end if;

  update public.ai_scene_actors
  set
    promoted_character_id=v_npc_id,
    promoted_at=now(),
    promotion_name=v_name,
    promotion_source_message_id=p_source_message_id,
    runtime_state='archived',
    archive_reason='promoted',
    archived_at=coalesce(archived_at,now()),
    revision=revision+1,
    updated_at=now()
  where id=v_actor.id
  returning * into v_actor;

  perform set_config('meganot.scene_actor_promotion','off',true);

  return jsonb_build_object(
    'actor_id',v_actor.id,
    'npc_character_id',v_npc_id,
    'personal_name',v_name,
    'source_bestiary_slug',v_actor.source_bestiary_slug,
    'source_digest',v_actor.source_digest,
    'compiler_version',v_actor.compiler_version,
    'current_hp',v_actor.current_hp,
    'max_hp',v_actor.max_hp,
    'life_state',v_character_life_state,
    'location_id',v_actor.location_id,
    'campaign_day',v_actor.campaign_day,
    'day_period',v_actor.day_period,
    'conditions',v_actor.conditions,
    'effects',v_actor.effects,
    'runtime_template_id',v_template_id,
    'replayed',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_ai_gm_actor_action_turn_v1(p_job_id uuid, p_actor_ref jsonb, p_mechanic_key text, p_target_character_id uuid DEFAULT NULL::uuid, p_option_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ref jsonb;
  v_mechanic_key text := btrim(coalesce(p_mechanic_key,''));
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  v_ref:=private.resolve_ai_combat_actor_ref_v2(p_actor_ref);

  if v_ref->>'kind'='npc' then
    if coalesce((v_ref->>'redirected')::boolean,false)
       and v_mechanic_key ~ '^(action|reaction|special):[0-9]+$'
    then
      v_mechanic_key :=
        'npc-runtime-'||
        split_part(v_mechanic_key,':',1)||'-'||
        split_part(v_mechanic_key,':',2);
    end if;

    return public.execute_ai_gm_npc_action_turn_v1(
      p_job_id,
      (v_ref->>'id')::uuid,
      v_mechanic_key,
      p_target_character_id,
      p_option_key
    )||jsonb_build_object(
      'actor_kind','npc',
      'actor_ref_redirected',coalesce((v_ref->>'redirected')::boolean,false),
      'source_scene_actor_id',v_ref->>'source_actor_id'
    );
  end if;

  if nullif(trim(coalesce(p_option_key,'')),'') is not null then
    raise exception 'scene_actor_action_option_not_supported';
  end if;

  return public.execute_ai_gm_scene_actor_action_turn_v1(
    p_job_id,(v_ref->>'id')::uuid,v_mechanic_key,p_target_character_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_ai_gm_actor_roll_v1(p_job_id uuid, p_actor_ref jsonb, p_request_type text, p_ability_key text, p_skill_key text, p_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ref jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  v_ref:=private.resolve_ai_combat_actor_ref_v2(p_actor_ref);

  if v_ref->>'kind'='npc' then
    return public.execute_ai_gm_npc_roll_v2(
      p_job_id,(v_ref->>'id')::uuid,p_request_type,p_ability_key,p_skill_key,p_label
    )||jsonb_build_object(
      'actor_kind','npc',
      'actor_ref_redirected',coalesce((v_ref->>'redirected')::boolean,false),
      'source_scene_actor_id',v_ref->>'source_actor_id'
    );
  end if;

  return public.execute_ai_gm_scene_actor_roll_v1(
    p_job_id,(v_ref->>'id')::uuid,p_request_type,p_ability_key,p_skill_key,p_label
  );
end;
$function$
;

revoke all on function private.resolve_ai_combat_actor_ref_v2(jsonb)
  from public,anon,authenticated;
revoke all on function public.resolve_ai_combat_actor_ref_v1(jsonb)
  from public,anon,authenticated;
revoke all on function public.promote_ai_scene_actor_to_npc_v1(uuid,text,uuid[],bigint,uuid)
  from public,anon,authenticated;

grant execute on function public.resolve_ai_combat_actor_ref_v1(jsonb)
  to service_role;
grant execute on function public.promote_ai_scene_actor_to_npc_v1(uuid,text,uuid[],bigint,uuid)
  to service_role;
