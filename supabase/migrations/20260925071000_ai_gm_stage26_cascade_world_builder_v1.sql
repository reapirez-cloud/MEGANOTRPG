-- AI GM Stage 26: cascade world builder + control-panel permission closure.

grant execute on function private.ai_gm_behavior_profile_json_v1(text)
  to authenticated, service_role;

alter table public.locations
  add column if not exists archetype text not null default 'site',
  add column if not exists scale text not null default 'site',
  add column if not exists structure_roles text[] not null default '{}'::text[],
  add column if not exists structure_state text not null default 'stub',
  add column if not exists coverage_manifest jsonb not null default '{}'::jsonb,
  add column if not exists structured_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='locations_archetype_check'
      and conrelid='public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_archetype_check
      check (archetype in (
        'world','region','city','town','village','district','neighborhood',
        'road','forest','wilderness','port','building','tavern','inn','shop',
        'temple','manor','castle','dungeon','cave','room','site','other'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='locations_scale_check'
      and conrelid='public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_scale_check
      check (scale in (
        'world','region','settlement','district','site','building','room','detail'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='locations_structure_state_check'
      and conrelid='public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_structure_state_check
      check (structure_state in ('stub','materialized','detailed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='locations_coverage_manifest_object_check'
      and conrelid='public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_coverage_manifest_object_check
      check (jsonb_typeof(coverage_manifest)='object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='locations_structure_roles_size_check'
      and conrelid='public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_structure_roles_size_check
      check (cardinality(structure_roles) <= 16);
  end if;
end
$$;

create index if not exists locations_structure_parent_idx
  on public.locations(campaign_id,parent_location_id,lifecycle_state,structure_state);

create index if not exists locations_structure_name_idx
  on public.locations(campaign_id,parent_location_id,lower(btrim(name)))
  where lifecycle_state='active';

create or replace function public.ai_gm_materialize_location_cascade_v1(
  p_campaign_id uuid,
  p_actor_user_id uuid,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  v_input jsonb := coalesce(p_input,'{}'::jsonb);
  v_location public.locations%rowtype;
  v_child_location public.locations%rowtype;
  v_location_id uuid;
  v_parent_location_id uuid;
  v_source_location_id uuid;
  v_move_character_id uuid;
  v_name text;
  v_archetype text;
  v_scale text;
  v_visibility text;
  v_background_scope text;
  v_structure_roles text[] := '{}'::text[];
  v_children jsonb;
  v_child jsonb;
  v_child_name text;
  v_child_archetype text;
  v_child_scale text;
  v_child_visibility text;
  v_child_scope text;
  v_child_roles text[];
  v_child_ids uuid[] := '{}'::uuid[];
  v_required_roles text[] := '{}'::text[];
  v_covered_roles text[] := '{}'::text[];
  v_required_role text;
  v_coverage jsonb := '{}'::jsonb;
  v_omitted jsonb := '{}'::jsonb;
  v_movement jsonb;
  v_campaign_day integer;
  v_day_period text;
  v_child_count integer := 0;
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501', message='service_role_required';
  end if;
  if p_campaign_id is null or p_actor_user_id is null then
    raise exception using errcode='22023', message='campaign_actor_required';
  end if;
  if jsonb_typeof(v_input) <> 'object' then
    raise exception using errcode='22023', message='cascade_input_must_be_object';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501', message='cascade_ai_world_only';
  end if;
  if not private.is_campaign_manager(p_campaign_id,p_actor_user_id) then
    raise exception using errcode='42501', message='campaign_manager_required';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);

  if nullif(v_input->>'location_id','') is not null then
    begin v_location_id := (v_input->>'location_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode='22023', message='cascade_location_id_invalid';
    end;
  end if;
  if nullif(v_input->>'parent_location_id','') is not null then
    begin v_parent_location_id := (v_input->>'parent_location_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode='22023', message='cascade_parent_location_id_invalid';
    end;
  end if;
  if nullif(v_input->>'source_location_id','') is not null then
    begin v_source_location_id := (v_input->>'source_location_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode='22023', message='cascade_source_location_id_invalid';
    end;
  end if;
  if nullif(v_input->>'move_character_id','') is not null then
    begin v_move_character_id := (v_input->>'move_character_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode='22023', message='cascade_move_character_id_invalid';
    end;
  end if;

  v_name := left(btrim(coalesce(v_input->>'name','')),160);
  v_archetype := lower(btrim(coalesce(v_input->>'archetype','')));
  v_scale := lower(btrim(coalesce(v_input->>'scale','')));
  v_visibility := lower(btrim(coalesce(v_input->>'visibility_mode','discover')));
  v_background_scope := lower(btrim(coalesce(v_input->>'background_simulation_scope','entity')));

  if v_archetype not in (
    'world','region','city','town','village','district','neighborhood',
    'road','forest','wilderness','port','building','tavern','inn','shop',
    'temple','manor','castle','dungeon','cave','room','site','other'
  ) then raise exception using errcode='22023', message='cascade_archetype_invalid'; end if;
  if v_scale not in (
    'world','region','settlement','district','site','building','room','detail'
  ) then raise exception using errcode='22023', message='cascade_scale_invalid'; end if;
  if v_visibility not in ('always','discover','private') then
    raise exception using errcode='22023', message='cascade_visibility_invalid';
  end if;
  if v_background_scope not in ('entity','detail','disabled') then
    raise exception using errcode='22023', message='cascade_background_scope_invalid';
  end if;

  if v_input ? 'structure_roles' then
    if jsonb_typeof(v_input->'structure_roles') <> 'array' then
      raise exception using errcode='22023', message='cascade_structure_roles_invalid';
    end if;
    select coalesce(array_agg(distinct lower(left(btrim(value),64))), '{}'::text[])
      into v_structure_roles
    from jsonb_array_elements_text(v_input->'structure_roles') t(value)
    where btrim(value)<>'';
  end if;

  if v_parent_location_id is not null and not exists(
    select 1 from public.locations l
    where l.id=v_parent_location_id and l.campaign_id=p_campaign_id
      and l.lifecycle_state='active'
  ) then
    raise exception using errcode='22023', message='cascade_parent_location_unavailable';
  end if;
  if v_source_location_id is not null and not exists(
    select 1 from public.locations l
    where l.id=v_source_location_id and l.campaign_id=p_campaign_id
      and l.lifecycle_state='active'
  ) then
    raise exception using errcode='22023', message='cascade_source_location_unavailable';
  end if;

  if v_location_id is not null then
    select * into v_location from public.locations l
    where l.id=v_location_id and l.campaign_id=p_campaign_id
      and l.lifecycle_state='active'
    for update;
    if v_location.id is null then
      raise exception using errcode='22023', message='cascade_location_unavailable';
    end if;
    if v_parent_location_id is null then
      v_parent_location_id := v_location.parent_location_id;
    end if;
    if v_name='' then v_name := v_location.name; end if;
  else
    if v_name='' then
      raise exception using errcode='22023', message='cascade_location_name_required';
    end if;
    select * into v_location from public.locations l
    where l.campaign_id=p_campaign_id
      and l.parent_location_id is not distinct from v_parent_location_id
      and lower(btrim(l.name))=lower(v_name)
      and l.lifecycle_state='active'
    order by l.created_at limit 1 for update;

    if v_location.id is null then
      insert into public.locations(
        campaign_id,parent_location_id,name,summary,description,image_url,
        visibility_mode,background_simulation_scope,lifecycle_state,created_by,
        archetype,scale,structure_roles,structure_state,coverage_manifest
      ) values (
        p_campaign_id,v_parent_location_id,v_name,
        left(coalesce(v_input->>'summary',''),2000),
        left(coalesce(v_input->>'description',''),12000),
        null,v_visibility,v_background_scope,'active',p_actor_user_id,
        v_archetype,v_scale,v_structure_roles,'stub','{}'::jsonb
      ) returning * into v_location;
    end if;
    v_location_id := v_location.id;
  end if;

  update public.locations l
  set parent_location_id=v_parent_location_id,
      name=v_name,
      summary=case when v_input ? 'summary'
        then left(coalesce(v_input->>'summary',''),2000) else l.summary end,
      description=case when v_input ? 'description'
        then left(coalesce(v_input->>'description',''),12000) else l.description end,
      visibility_mode=v_visibility,
      background_simulation_scope=v_background_scope,
      archetype=v_archetype,
      scale=v_scale,
      structure_roles=v_structure_roles,
      updated_at=now()
  where l.id=v_location_id
  returning * into v_location;

  v_children := coalesce(v_input->'children','[]'::jsonb);
  if jsonb_typeof(v_children) <> 'array' then
    raise exception using errcode='22023', message='cascade_children_must_be_array';
  end if;
  v_child_count := jsonb_array_length(v_children);
  if v_child_count > 24 then
    raise exception using errcode='22023', message='cascade_child_count_invalid';
  end if;

  for v_child in select value from jsonb_array_elements(v_children)
  loop
    if jsonb_typeof(v_child) <> 'object' or v_child ? 'children' then
      raise exception using errcode='22023', message='cascade_nested_children_forbidden';
    end if;

    v_child_name := left(btrim(coalesce(v_child->>'name','')),160);
    v_child_archetype := lower(btrim(coalesce(v_child->>'archetype','site')));
    v_child_scale := lower(btrim(coalesce(v_child->>'scale','site')));
    v_child_visibility := lower(btrim(coalesce(v_child->>'visibility_mode','discover')));
    v_child_scope := lower(btrim(coalesce(
      v_child->>'background_simulation_scope',
      case when v_child_scale in ('room','detail') then 'detail' else 'entity' end
    )));

    if v_child_name='' then
      raise exception using errcode='22023', message='cascade_child_name_required';
    end if;
    if v_child_archetype not in (
      'world','region','city','town','village','district','neighborhood',
      'road','forest','wilderness','port','building','tavern','inn','shop',
      'temple','manor','castle','dungeon','cave','room','site','other'
    ) then raise exception using errcode='22023', message='cascade_child_archetype_invalid'; end if;
    if v_child_scale not in (
      'world','region','settlement','district','site','building','room','detail'
    ) then raise exception using errcode='22023', message='cascade_child_scale_invalid'; end if;
    if v_child_visibility not in ('always','discover','private') then
      raise exception using errcode='22023', message='cascade_child_visibility_invalid';
    end if;
    if v_child_scope not in ('entity','detail','disabled') then
      raise exception using errcode='22023', message='cascade_child_background_scope_invalid';
    end if;
    if v_child ? 'structure_roles'
       and jsonb_typeof(v_child->'structure_roles') <> 'array'
    then
      raise exception using errcode='22023', message='cascade_child_structure_roles_invalid';
    end if;

    select coalesce(array_agg(distinct lower(left(btrim(value),64))), '{}'::text[])
      into v_child_roles
    from jsonb_array_elements_text(coalesce(v_child->'structure_roles','[]'::jsonb)) t(value)
    where btrim(value)<>'';

    select * into v_child_location from public.locations l
    where l.campaign_id=p_campaign_id and l.parent_location_id=v_location_id
      and lower(btrim(l.name))=lower(v_child_name) and l.lifecycle_state='active'
    order by l.created_at limit 1 for update;

    if v_child_location.id is null then
      insert into public.locations(
        campaign_id,parent_location_id,name,summary,description,image_url,
        visibility_mode,background_simulation_scope,lifecycle_state,created_by,
        archetype,scale,structure_roles,structure_state,coverage_manifest,structured_at
      ) values (
        p_campaign_id,v_location_id,v_child_name,
        left(coalesce(v_child->>'summary',''),2000),
        left(coalesce(v_child->>'description',''),12000),
        null,v_child_visibility,v_child_scope,'active',p_actor_user_id,
        v_child_archetype,v_child_scale,v_child_roles,
        case when v_child_scale in ('room','detail') then 'materialized' else 'stub' end,
        case when v_child_scale in ('room','detail')
          then jsonb_build_object(
            'coverage_complete',true,'cascade_depth',0,'leaf',true,
            'required_roles','[]'::jsonb,'covered_roles','[]'::jsonb
          )
          else '{}'::jsonb end,
        case when v_child_scale in ('room','detail') then now() else null end
      ) returning * into v_child_location;
    else
      update public.locations l
      set summary=case when l.summary='' and v_child ? 'summary'
            then left(coalesce(v_child->>'summary',''),2000) else l.summary end,
          description=case when l.description='' and v_child ? 'description'
            then left(coalesce(v_child->>'description',''),12000) else l.description end,
          visibility_mode=v_child_visibility,
          background_simulation_scope=v_child_scope,
          archetype=v_child_archetype,
          scale=v_child_scale,
          structure_roles=v_child_roles,
          structure_state=case
            when v_child_scale in ('room','detail') and l.structure_state='stub'
              then 'materialized'
            else l.structure_state end,
          coverage_manifest=case
            when v_child_scale in ('room','detail') and l.structure_state='stub'
              then jsonb_build_object(
                'coverage_complete',true,'cascade_depth',0,'leaf',true,
                'required_roles','[]'::jsonb,'covered_roles','[]'::jsonb
              )
            else l.coverage_manifest end,
          structured_at=case
            when v_child_scale in ('room','detail') and l.structure_state='stub'
              then coalesce(l.structured_at,now())
            else l.structured_at end,
          updated_at=now()
      where l.id=v_child_location.id
      returning * into v_child_location;
    end if;

    v_child_ids := array_append(v_child_ids,v_child_location.id);
    perform public.upsert_location_transition_v1(
      v_location_id,v_child_location.id,
      jsonb_build_object('label',v_child_location.name,'visibility_mode','discover')
    );
    perform public.upsert_location_transition_v1(
      v_child_location.id,v_location_id,
      jsonb_build_object('label',v_location.name,'visibility_mode','discover')
    );
  end loop;

  v_required_roles := case v_archetype
    when 'city' then array['residential','commerce','governance','security','transit','services']
    when 'town' then array['residential','commerce','governance','security','transit']
    when 'village' then array['residential','livelihood','community','transit']
    when 'port' then array['docks','storage','commerce','security','transit']
    when 'tavern' then array['public_hall','service','storage']
    when 'inn' then array['public_hall','service','storage','guest_area']
    when 'temple' then array['worship','service']
    when 'castle' then array['defense','command_or_residential','service']
    when 'dungeon' then array['entry','major_branch']
    when 'cave' then array['entry','major_branch']
    when 'forest' then array['entry_or_edge','interior','route']
    else '{}'::text[] end;

  select coalesce(array_agg(distinct role order by role), '{}'::text[])
    into v_covered_roles
  from public.locations l
  cross join lateral unnest(l.structure_roles) role
  where l.campaign_id=p_campaign_id and l.parent_location_id=v_location_id
    and l.lifecycle_state='active';

  v_coverage := coalesce(v_input->'coverage_manifest','{}'::jsonb);
  if jsonb_typeof(v_coverage) <> 'object' then
    raise exception using errcode='22023', message='cascade_coverage_manifest_invalid';
  end if;
  if v_coverage ? 'omitted_roles'
     and jsonb_typeof(v_coverage->'omitted_roles') <> 'object'
  then
    raise exception using errcode='22023', message='cascade_omitted_roles_invalid';
  end if;
  v_omitted := coalesce(v_coverage->'omitted_roles','{}'::jsonb);

  foreach v_required_role in array v_required_roles
  loop
    if not (v_required_role = any(v_covered_roles)) then
      if not (
        v_omitted ? v_required_role
        and btrim(coalesce(v_omitted->>v_required_role,'')) <> ''
      ) then
        raise exception using errcode='22023',
          message='cascade_required_role_missing:'||v_required_role;
      end if;
    end if;
  end loop;

  v_coverage := v_coverage || jsonb_build_object(
    'coverage_complete',true,
    'cascade_depth',1,
    'required_roles',to_jsonb(v_required_roles),
    'covered_roles',to_jsonb(v_covered_roles),
    'direct_child_ids',to_jsonb(v_child_ids),
    'direct_child_count',coalesce(array_length(v_child_ids,1),0),
    'structured_by','stage26_cascade'
  );

  update public.locations l
  set structure_state='materialized',
      coverage_manifest=v_coverage,
      structured_at=coalesce(l.structured_at,now()),
      updated_at=now()
  where l.id=v_location_id
  returning * into v_location;

  if v_source_location_id is not null and v_source_location_id <> v_location_id then
    perform public.upsert_location_transition_v1(
      v_source_location_id,v_location_id,
      jsonb_build_object('label',v_location.name,'visibility_mode','discover')
    );
    perform public.upsert_location_transition_v1(
      v_location_id,v_source_location_id,
      jsonb_build_object(
        'label',(select l.name from public.locations l where l.id=v_source_location_id),
        'visibility_mode','discover'
      )
    );
  end if;

  if v_move_character_id is not null then
    if not exists(
      select 1 from public.characters c
      where c.id=v_move_character_id and c.campaign_id=p_campaign_id
        and c.life_state='alive'
    ) then
      raise exception using errcode='22023', message='cascade_move_character_unavailable';
    end if;
    v_campaign_day := case
      when coalesce(v_input->>'campaign_day','') ~ '^[0-9]+$'
        then (v_input->>'campaign_day')::integer else null end;
    v_day_period := nullif(btrim(coalesce(v_input->>'day_period','')),'');
    v_movement := public.move_character_world_v1(
      v_move_character_id,v_location_id,v_campaign_day,v_day_period
    );
  end if;

  return jsonb_build_object(
    'location',jsonb_build_object(
      'id',v_location.id,'parent_location_id',v_location.parent_location_id,
      'name',v_location.name,'archetype',v_location.archetype,
      'scale',v_location.scale,'structure_state',v_location.structure_state,
      'coverage_manifest',v_location.coverage_manifest
    ),
    'children',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',l.id,'name',l.name,'archetype',l.archetype,'scale',l.scale,
        'structure_roles',to_jsonb(l.structure_roles),
        'structure_state',l.structure_state
      ) order by l.sort_order,l.name),'[]'::jsonb)
      from public.locations l
      where l.campaign_id=p_campaign_id and l.parent_location_id=v_location_id
        and l.lifecycle_state='active'
    ),
    'movement',v_movement,
    'canonical_state_changed',true,
    'cascade_depth',1
  );
end;
$function$;

revoke all on function public.ai_gm_materialize_location_cascade_v1(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.ai_gm_materialize_location_cascade_v1(uuid,uuid,jsonb)
  to service_role;

comment on function public.ai_gm_materialize_location_cascade_v1(uuid,uuid,jsonb) is
  'Stage 26 service-only one-level location cascade: create/reuse target, direct children, structural coverage, transitions and optional PC movement.';
