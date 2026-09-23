-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 4: shared actor-neutral Bestiary Runtime Compiler.
-- Canonical Stage-6 NPC materialization consumes this compiler rather than
-- independently parsing the bestiary row.

CREATE OR REPLACE FUNCTION private.bestiary_runtime_dice_v1(p_dice text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v text := replace(lower(trim(coalesce(p_dice,''))),' ','');
  m text[]; v_count integer; v_sides integer; v_mod integer;
begin
  if v ~ '^[0-9]+$' then
    return jsonb_build_object('count',0,'sides',0,'modifier',v::integer);
  end if;
  m := regexp_match(v,'^([0-9]+)d([0-9]+)([+-][0-9]+)?$');
  if m is null then return jsonb_build_object('count',0,'sides',0,'modifier',0); end if;
  v_count := greatest(0,least(m[1]::integer,40));
  v_sides := greatest(0,least(m[2]::integer,1000));
  v_mod := coalesce(nullif(m[3],''),'0')::integer;
  return jsonb_build_object('count',v_count,'sides',v_sides,'modifier',v_mod);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.bestiary_runtime_compiled_mechanic_v1(p_kind text, p_ordinal integer, p_action jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_kind text := lower(trim(coalesce(p_kind,'')));
  v_label text; v_desc text; v_attack_bonus integer;
  v_damage jsonb; v_dice jsonb; v_dc jsonb; v_usage jsonb;
  v_resource jsonb := null; v_resource_max integer; v_recharge jsonb; v_runtime jsonb;
begin
  if v_kind not in ('action','reaction','special') or p_ordinal < 1 then
    raise exception 'bestiary_runtime_mechanic_identity_invalid';
  end if;
  v_label := left(coalesce(nullif(trim(p_action->>'name'),''),'Bestiary ability'),160);
  v_desc := left(coalesce(p_action->>'desc',''),4000);
  v_attack_bonus := case
    when coalesce(p_action->>'attack_bonus','') ~ '^-?[0-9]+$'
      then greatest(-100,least((p_action->>'attack_bonus')::integer,100))
    else null end;
  v_damage := case when jsonb_typeof(p_action->'damage')='array'
    then coalesce((p_action->'damage')->0,'{}'::jsonb) else '{}'::jsonb end;
  v_dice := private.bestiary_runtime_dice_v1(v_damage->>'damage_dice');
  v_dc := case when jsonb_typeof(p_action->'dc')='object' then p_action->'dc' else '{}'::jsonb end;
  v_usage := case when jsonb_typeof(p_action->'usage')='object' then p_action->'usage' else '{}'::jsonb end;

  if v_usage <> '{}'::jsonb then
    if lower(coalesce(v_usage->>'type',''))='per day' then
      v_resource_max := greatest(1,least(
        case when coalesce(v_usage->>'times','') ~ '^[0-9]+$'
          then (v_usage->>'times')::integer else 1 end,100));
      v_recharge := '{"triggers":["long_rest"],"restore":"full"}'::jsonb;
    else
      v_resource_max := 1;
      v_recharge := '{"triggers":["special"],"restore":"full"}'::jsonb;
    end if;
    v_resource := jsonb_build_object(
      'key',v_kind||'_'||p_ordinal::text||'_uses',
      'max',v_resource_max,'label',v_label,'recharge',v_recharge,'usage',v_usage
    );
  end if;

  v_runtime := jsonb_strip_nulls(jsonb_build_object(
    'kind',case when v_attack_bonus is not null then 'attack'
      when v_dc <> '{}'::jsonb then 'save_action' else 'action' end,
    'attackBonus',v_attack_bonus,
    'rollD20',v_attack_bonus is not null,
    'diceCount',coalesce((v_dice->>'count')::integer,0),
    'diceSides',coalesce((v_dice->>'sides')::integer,0),
    'diceModifier',coalesce((v_dice->>'modifier')::integer,0),
    'damageType',nullif(v_damage#>>'{damage_type,index}',''),
    'damageComponents',coalesce(p_action->'damage','[]'::jsonb),
    'saveDc',case when coalesce(v_dc->>'dc_value','') ~ '^[0-9]+$'
      then (v_dc->>'dc_value')::integer else null end,
    'saveAbility',nullif(v_dc#>>'{dc_type,index}',''),
    'description',v_desc,'usage',v_usage
  ));

  return jsonb_strip_nulls(jsonb_build_object(
    'kind',v_kind,'ordinal',p_ordinal,'stable_key',v_kind||':'||p_ordinal::text,
    'label',v_label,
    'economy',case when v_kind='reaction' then 'reaction' else 'action' end,
    'runtime',v_runtime,'resource',v_resource
  ));
end;
$function$
;

CREATE OR REPLACE FUNCTION private.compile_bestiary_runtime_v1(p_bestiary_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_b public.bestiary_catalog%rowtype;
  v_slug text := lower(trim(coalesce(p_bestiary_slug,'')));
  v_speed integer := 30;
  v_save_profs jsonb := '[]'::jsonb; v_skill_profs jsonb := '{}'::jsonb;
  v_prof jsonb; v_prof_index text; v_skill_key text; v_skill_ability text;
  v_skill_score integer; v_skill_base integer; v_prof_value integer; v_skill_rank integer;
  v_save_key text; v_mechanics jsonb := '[]'::jsonb; v_resources jsonb := '[]'::jsonb;
  v_action jsonb; v_compiled_mechanic jsonb; v_ord bigint; v_source_digest text;
begin
  if v_slug='' then raise exception 'bestiary_runtime_slug_required'; end if;
  select * into v_b from public.bestiary_catalog where slug=v_slug limit 1;
  if v_b.id is null then raise exception 'bestiary_runtime_source_not_found'; end if;
  if coalesce(v_b.speed->>'walk','') ~ '[0-9]+' then
    v_speed := (regexp_match(v_b.speed->>'walk','([0-9]+)'))[1]::integer;
  end if;

  for v_prof in select value from jsonb_array_elements(coalesce(v_b.proficiencies,'[]'::jsonb))
  loop
    v_prof_index := lower(coalesce(v_prof#>>'{proficiency,index}',''));
    if v_prof_index like 'saving-throw-%' then
      v_save_key := case replace(v_prof_index,'saving-throw-','')
        when 'str' then 'strength' when 'dex' then 'dexterity' when 'con' then 'constitution'
        when 'int' then 'intelligence' when 'wis' then 'wisdom' when 'cha' then 'charisma'
        else null end;
      if v_save_key is not null and not (v_save_profs ? v_save_key) then
        v_save_profs := v_save_profs || jsonb_build_array(v_save_key);
      end if;
    elsif v_prof_index like 'skill-%' then
      v_skill_key := replace(v_prof_index,'skill-','');
      v_skill_ability := case v_skill_key
        when 'acrobatics' then 'dexterity' when 'animal-handling' then 'wisdom'
        when 'arcana' then 'intelligence' when 'athletics' then 'strength'
        when 'deception' then 'charisma' when 'history' then 'intelligence'
        when 'insight' then 'wisdom' when 'intimidation' then 'charisma'
        when 'investigation' then 'intelligence' when 'medicine' then 'wisdom'
        when 'nature' then 'intelligence' when 'perception' then 'wisdom'
        when 'performance' then 'charisma' when 'persuasion' then 'charisma'
        when 'religion' then 'intelligence' when 'sleight-of-hand' then 'dexterity'
        when 'stealth' then 'dexterity' when 'survival' then 'wisdom' else null end;
      v_skill_key := replace(v_skill_key,'-','_');
      v_skill_score := case v_skill_ability
        when 'strength' then coalesce((v_b.abilities->>'strength')::integer,10)
        when 'dexterity' then coalesce((v_b.abilities->>'dexterity')::integer,10)
        when 'constitution' then coalesce((v_b.abilities->>'constitution')::integer,10)
        when 'intelligence' then coalesce((v_b.abilities->>'intelligence')::integer,10)
        when 'wisdom' then coalesce((v_b.abilities->>'wisdom')::integer,10)
        when 'charisma' then coalesce((v_b.abilities->>'charisma')::integer,10)
        else 10 end;
      v_skill_base := floor((v_skill_score-10)::numeric/2)::integer;
      v_prof_value := case when coalesce(v_prof->>'value','') ~ '^-?[0-9]+$'
        then (v_prof->>'value')::integer else v_skill_base end;
      v_skill_rank := case when coalesce(v_b.proficiency_bonus,0) <= 0 then 0
        else greatest(0,least(2,round(
          (v_prof_value-v_skill_base)::numeric / v_b.proficiency_bonus
        )::integer)) end;
      if v_skill_ability is not null and v_skill_rank > 0 then
        v_skill_profs := v_skill_profs || jsonb_build_object(v_skill_key,v_skill_rank);
      end if;
    end if;
  end loop;

  for v_action,v_ord in
    select value,ordinality from jsonb_array_elements(coalesce(v_b.actions,'[]'::jsonb)) with ordinality
  loop
    v_compiled_mechanic := private.bestiary_runtime_compiled_mechanic_v1('action',v_ord::integer,v_action);
    v_mechanics := v_mechanics || jsonb_build_array(v_compiled_mechanic);
    if v_compiled_mechanic ? 'resource' then
      v_resources := v_resources || jsonb_build_array(v_compiled_mechanic->'resource');
    end if;
  end loop;
  for v_action,v_ord in
    select value,ordinality from jsonb_array_elements(coalesce(v_b.reactions,'[]'::jsonb)) with ordinality
  loop
    v_compiled_mechanic := private.bestiary_runtime_compiled_mechanic_v1('reaction',v_ord::integer,v_action);
    v_mechanics := v_mechanics || jsonb_build_array(v_compiled_mechanic);
    if v_compiled_mechanic ? 'resource' then
      v_resources := v_resources || jsonb_build_array(v_compiled_mechanic->'resource');
    end if;
  end loop;
  for v_action,v_ord in
    select value,ordinality
    from jsonb_array_elements(coalesce(v_b.special_abilities,'[]'::jsonb)) with ordinality
    where jsonb_typeof(value->'usage')='object'
  loop
    v_compiled_mechanic := private.bestiary_runtime_compiled_mechanic_v1('special',v_ord::integer,v_action);
    v_mechanics := v_mechanics || jsonb_build_array(v_compiled_mechanic);
    if v_compiled_mechanic ? 'resource' then
      v_resources := v_resources || jsonb_build_array(v_compiled_mechanic->'resource');
    end if;
  end loop;

  v_source_digest := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'slug',v_b.slug,'abilities',v_b.abilities,'armor_class',v_b.armor_class,
      'hit_points',v_b.hit_points,'hit_dice',v_b.hit_dice,
      'proficiency_bonus',v_b.proficiency_bonus,'speed',v_b.speed,
      'senses',v_b.senses,'languages',v_b.languages,'proficiencies',v_b.proficiencies,
      'actions',v_b.actions,'reactions',v_b.reactions,'special_abilities',v_b.special_abilities
    )::text,'UTF8'),'sha256'),'hex');

  return jsonb_build_object(
    'compiler','bestiary-runtime','compiler_version',1,
    'source_bestiary_slug',v_b.slug,'source_digest',v_source_digest,
    'sheet',jsonb_build_object(
      'strength',greatest(1,least(coalesce((v_b.abilities->>'strength')::integer,10),40)),
      'dexterity',greatest(1,least(coalesce((v_b.abilities->>'dexterity')::integer,10),40)),
      'constitution',greatest(1,least(coalesce((v_b.abilities->>'constitution')::integer,10),40)),
      'intelligence',greatest(1,least(coalesce((v_b.abilities->>'intelligence')::integer,10),40)),
      'wisdom',greatest(1,least(coalesce((v_b.abilities->>'wisdom')::integer,10),40)),
      'charisma',greatest(1,least(coalesce((v_b.abilities->>'charisma')::integer,10),40)),
      'armor_class',greatest(0,least(coalesce(v_b.armor_class,10),50)),
      'max_hp',greatest(1,least(coalesce(v_b.hit_points,1),100000)),
      'hit_dice',left(coalesce(v_b.hit_dice,''),120),
      'proficiency_bonus',greatest(0,least(coalesce(v_b.proficiency_bonus,2),20)),
      'speed',greatest(0,least(v_speed,1000)),
      'passive_perception',greatest(0,least(coalesce((v_b.senses->>'passive_perception')::integer,10),60)),
      'saving_throw_proficiencies',v_save_profs,'skill_proficiencies',v_skill_profs,
      'senses',left(coalesce(v_b.senses::text,''),2000),
      'languages',left(coalesce(v_b.languages,''),2000)
    ),
    'mechanics',v_mechanics,'resources',v_resources,
    'special_abilities',coalesce(v_b.special_abilities,'[]'::jsonb),
    'counts',jsonb_build_object(
      'actions',jsonb_array_length(coalesce(v_b.actions,'[]'::jsonb)),
      'reactions',jsonb_array_length(coalesce(v_b.reactions,'[]'::jsonb)),
      'compiled_mechanics',jsonb_array_length(v_mechanics),
      'resources',jsonb_array_length(v_resources)
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.compile_bestiary_runtime_v1(p_bestiary_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  return private.compile_bestiary_runtime_v1(p_bestiary_slug);
end;
$function$
;

revoke all on function private.bestiary_runtime_dice_v1(text)
  from public, anon, authenticated;
revoke all on function private.bestiary_runtime_compiled_mechanic_v1(text, integer, jsonb)
  from public, anon, authenticated;
revoke all on function private.compile_bestiary_runtime_v1(text)
  from public, anon, authenticated;
revoke all on function public.compile_bestiary_runtime_v1(text)
  from public, anon, authenticated;
grant execute on function public.compile_bestiary_runtime_v1(text)
  to service_role;

CREATE OR REPLACE FUNCTION private.npc_runtime_dice_v1(p_dice text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select private.bestiary_runtime_dice_v1(p_dice); $function$
;

CREATE OR REPLACE FUNCTION private.bestiary_runtime_mechanic_for_npc_v1(p_npc_id uuid, p_compiled jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_kind text := p_compiled->>'kind';
  v_ordinal integer := (p_compiled->>'ordinal')::integer;
  v_resource jsonb := p_compiled->'resource';
  v_resource_costs jsonb := '[]'::jsonb;
begin
  if v_resource is not null then
    v_resource_costs := jsonb_build_array(jsonb_build_object(
      'key','npc_runtime_'||(v_resource->>'key'),'amount',1
    ));
  end if;
  return jsonb_build_object(
    'id','npc-runtime-'||v_kind||'-'||v_ordinal::text,
    'key','npc_runtime_'||v_kind||'_'||v_ordinal::text,
    'type','action','label',p_compiled->>'label','economy',p_compiled->>'economy',
    'sourceKey','npc-runtime:'||p_npc_id::text,'resourceCosts',v_resource_costs,
    'npcRuntime',coalesce(p_compiled->'runtime','{}'::jsonb)
  );
end;
$function$
;

revoke all on function private.npc_runtime_dice_v1(text)
  from public, anon, authenticated;
revoke all on function private.bestiary_runtime_mechanic_for_npc_v1(uuid, jsonb)
  from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_ai_gm_npc_runtime_build_v1(p_job_id uuid, p_bestiary_slug text, p_model_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.agent_jobs%rowtype;
  v_npc public.characters%rowtype;
  v_profile public.npc_profiles%rowtype;
  v_bestiary public.bestiary_catalog%rowtype;
  v_template_id uuid;
  v_slug text;
  v_mechanics jsonb := '[]'::jsonb;
  v_action jsonb;
  v_ord bigint;
  v_usage jsonb;
  v_resource_key text;
  v_resource_max integer;
  v_recharge jsonb;
  v_save_profs jsonb := '[]'::jsonb;
  v_skill_profs jsonb := '{}'::jsonb;
  v_prof jsonb;
  v_prof_index text;
  v_skill_key text;
  v_skill_ability text;
  v_skill_score integer;
  v_skill_base integer;
  v_prof_value integer;
  v_skill_rank integer;
  v_save_key text;
  v_speed integer := 30;
  v_compiled jsonb;
  v_compiled_sheet jsonb;
  v_compiled_mechanic jsonb;
  v_compiled_resource jsonb;
  v_source_slug text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='npc_runtime_build'
    and input->>'surface'='npc_runtime_build_v1'
  for update;

  if v_job.id is null then raise exception 'npc_runtime_job_not_found'; end if;

  if v_job.status='completed' then
    return v_job.result;
  end if;

  if v_job.status not in ('queued','running') then
    raise exception 'npc_runtime_job_not_active';
  end if;

  select * into v_npc
  from public.characters
  where id=(v_job.input->>'npc_character_id')::uuid
    and campaign_id=v_job.campaign_id
    and character_type='npc'
    and publication_state='campaign'
    and life_state='alive';

  if v_npc.id is null then raise exception 'npc_runtime_character_not_found'; end if;

  select * into v_profile
  from public.npc_profiles
  where character_id=v_npc.id;

  v_compiled := private.compile_bestiary_runtime_v1(p_bestiary_slug);
  v_source_slug := v_compiled->>'source_bestiary_slug';
  v_compiled_sheet := coalesce(v_compiled->'sheet','{}'::jsonb);

  update public.character_sheets cs
  set
    strength=(v_compiled_sheet->>'strength')::integer,
    dexterity=(v_compiled_sheet->>'dexterity')::integer,
    constitution=(v_compiled_sheet->>'constitution')::integer,
    intelligence=(v_compiled_sheet->>'intelligence')::integer,
    wisdom=(v_compiled_sheet->>'wisdom')::integer,
    charisma=(v_compiled_sheet->>'charisma')::integer,
    armor_class=(v_compiled_sheet->>'armor_class')::integer,
    max_hp=(v_compiled_sheet->>'max_hp')::integer,
    current_hp=least(greatest(0,coalesce(cs.current_hp,(v_compiled_sheet->>'max_hp')::integer)),(v_compiled_sheet->>'max_hp')::integer),
    hit_dice=left(coalesce(v_compiled_sheet->>'hit_dice',''),120),
    proficiency_bonus=(v_compiled_sheet->>'proficiency_bonus')::integer,
    speed=(v_compiled_sheet->>'speed')::integer,
    passive_perception=(v_compiled_sheet->>'passive_perception')::integer,
    saving_throw_proficiencies=coalesce(v_compiled_sheet->'saving_throw_proficiencies','[]'::jsonb),
    skill_proficiencies=coalesce(v_compiled_sheet->'skill_proficiencies','{}'::jsonb),
    senses=left(coalesce(v_compiled_sheet->>'senses',''),2000),
    languages=left(coalesce(v_compiled_sheet->>'languages',''),2000),
    runtime_facts=coalesce(cs.runtime_facts,'{}'::jsonb) || jsonb_build_object(
      'npcRuntimeStage',6,
      'bestiaryRuntimeCompilerVersion',v_compiled->'compiler_version',
      'npcRuntimeBestiarySlug',v_source_slug,
      'npcRuntimeBestiaryDigest',v_compiled->>'source_digest',
      'npcRuntimeBuiltAt',now()
    ),
    updated_at=now()
  where cs.character_id=v_npc.id;

  for v_compiled_mechanic in
    select value from jsonb_array_elements(coalesce(v_compiled->'mechanics','[]'::jsonb))
  loop
    v_mechanics := v_mechanics || jsonb_build_array(
      private.bestiary_runtime_mechanic_for_npc_v1(v_npc.id,v_compiled_mechanic)
    );
  end loop;

  for v_compiled_resource in
    select value from jsonb_array_elements(coalesce(v_compiled->'resources','[]'::jsonb))
  loop
    v_resource_key := 'npc_runtime_'||(v_compiled_resource->>'key');
    v_resource_max := greatest(1,coalesce((v_compiled_resource->>'max')::integer,1));
    v_recharge := coalesce(v_compiled_resource->'recharge','{"triggers":["special"],"restore":"full"}'::jsonb);
    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,updated_by
    ) values(
      v_npc.id,v_resource_key,v_resource_max,v_resource_max,
      left(coalesce(v_compiled_resource->>'label','NPC ability'),160),
      v_recharge,v_job.requested_by
    )
    on conflict(character_id,state_key) do update set
      current=least(public.character_resource_states.current,excluded.max_snapshot),
      max_snapshot=excluded.max_snapshot,label=excluded.label,recharge=excluded.recharge,
      updated_by=excluded.updated_by,updated_at=now();
  end loop;

  v_slug := 'npc-runtime-'||replace(v_npc.id::text,'-','');

  select id into v_template_id
  from public.rule_templates
  where campaign_id=v_npc.campaign_id
    and kind='class'
    and slug=v_slug
  for update;

  if v_template_id is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      created_by,catalog_key,catalog_revision,source_kind,source_label,is_builtin,
      mechanical_summary,author_description,author_comment,rules_meta
    )
    values(
      v_npc.campaign_id,'class',v_slug,
      'NPC Runtime · '||left(v_npc.name,120),
      'Canonical Stage 6 NPC runtime generated from bestiary source.',
      1,v_mechanics,'[]'::jsonb,true,v_job.requested_by,
      'npc-runtime:'||v_npc.id::text,'stage6','custom',
      'AI GM NPC Runtime',false,
      'Server-authoritative NPC mechanics.','', '',
      jsonb_build_object(
        'npc_runtime_stage',6,
        'npc_character_id',v_npc.id,
        'bestiary_slug',v_source_slug
      )
    )
    returning id into v_template_id;
  else
    update public.rule_templates
    set
      name='NPC Runtime · '||left(v_npc.name,120),
      mechanics=v_mechanics,
      version=version+1,
      is_active=true,
      catalog_revision='stage6',
      rules_meta=jsonb_build_object(
        'npc_runtime_stage',6,
        'npc_character_id',v_npc.id,
        'bestiary_slug',v_source_slug
      ),
      updated_at=now()
    where id=v_template_id;
  end if;

  insert into public.character_template_assignments(
    character_id,template_id,template_level,selected_choices,assigned_by
  )
  values(
    v_npc.id,v_template_id,greatest(1,v_npc.level),'{}'::jsonb,v_job.requested_by
  )
  on conflict(character_id,template_id) do update set
    template_level=excluded.template_level,
    selected_choices='{}'::jsonb,
    assigned_by=excluded.assigned_by,
    updated_at=now();

  update public.npc_runtime_builds
  set
    status='ready',
    source_bestiary_slug=v_source_slug,
    template_id=v_template_id,
    model_id=p_model_id,
    build_revision=build_revision+1,
    last_job_id=p_job_id,
    build_payload=jsonb_build_object(
      'bestiary_slug',v_source_slug,
      'compiler','bestiary-runtime',
      'compiler_version',v_compiled->'compiler_version',
      'source_digest',v_compiled->>'source_digest',
      'action_count',coalesce((v_compiled#>>'{counts,actions}')::integer,0),
      'reaction_count',coalesce((v_compiled#>>'{counts,reactions}')::integer,0),
      'special_abilities',coalesce(v_compiled->'special_abilities','[]'::jsonb)
    ),
    generated_at=now(),
    updated_at=now()
  where character_id=v_npc.id;

  update public.agent_jobs
  set
    status='completed',
    completed_outputs=1,
    result=jsonb_build_object(
      'surface','npc_runtime_build_v1',
      'npc_character_id',v_npc.id,
      'template_id',v_template_id,
      'bestiary_slug',v_source_slug,
      'model_id',p_model_id,
      'runtime_stage',6
    ),
    completed_at=now(),
    updated_at=now(),
    error_code=null,
    error_message=null
  where id=p_job_id;

  return jsonb_build_object(
    'npc_character_id',v_npc.id,
    'template_id',v_template_id,
    'bestiary_slug',v_source_slug,
    'runtime_stage',6
  );
end;
$function$
;

comment on function public.compile_bestiary_runtime_v1(text) is
  'Service-only shared Bestiary Runtime Compiler. Returns versioned actor-neutral sheet/mechanics/resources/recharge data derived exclusively from bestiary_catalog.';
