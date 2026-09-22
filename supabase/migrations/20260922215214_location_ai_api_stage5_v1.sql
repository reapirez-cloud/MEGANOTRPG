CREATE OR REPLACE FUNCTION public.manage_world_discovery_v1(p_character_id uuid, p_entity_type text, p_entity_id uuid, p_discovered boolean DEFAULT true, p_source text DEFAULT 'ai_gm'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_character_campaign uuid;
  v_entity_campaign uuid;
  v_target_campaign uuid;
  v_entity_name text := '';
  v_source text := coalesce(nullif(left(btrim(p_source),80),''),'ai_gm');
  v_npc_type text;
  v_npc_publication text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select c.campaign_id into v_character_campaign
  from public.characters c where c.id=p_character_id;

  if v_character_campaign is null then
    raise exception 'Character not found';
  end if;

  if not private.can_manage_character(p_character_id,v_user_id) then
    raise exception 'Not allowed';
  end if;

  if p_entity_type='location' then
    select l.campaign_id,l.name
      into v_entity_campaign,v_entity_name
    from public.locations l
    where l.id=p_entity_id;

    if v_entity_campaign is null or v_entity_campaign<>v_character_campaign then
      raise exception 'Location must belong to the character campaign';
    end if;

    if not private.can_view_location(p_entity_id,v_user_id) then
      raise exception 'Location is unavailable';
    end if;

    if p_discovered then
      insert into public.character_location_discoveries(
        character_id,location_id,discovered_by,source
      ) values (
        p_character_id,p_entity_id,v_user_id,v_source
      )
      on conflict(character_id,location_id) do update set
        discovered_by=excluded.discovered_by,
        source=excluded.source;
    else
      delete from public.character_location_discoveries
      where character_id=p_character_id and location_id=p_entity_id;
    end if;

  elsif p_entity_type='npc' then
    select c.campaign_id,c.name,c.character_type,c.publication_state
      into v_entity_campaign,v_entity_name,v_npc_type,v_npc_publication
    from public.characters c
    where c.id=p_entity_id;

    if v_entity_campaign is null or v_entity_campaign<>v_character_campaign then
      raise exception 'NPC must belong to the character campaign';
    end if;

    if v_npc_type<>'npc' or v_npc_publication<>'campaign' then
      raise exception 'Target must be a published world NPC';
    end if;

    if not private.can_view_character(p_entity_id,v_user_id) then
      raise exception 'NPC is unavailable';
    end if;

    if p_discovered then
      insert into public.character_npc_discoveries(
        character_id,npc_character_id,discovered_by,source,last_interaction_at
      ) values (
        p_character_id,p_entity_id,v_user_id,v_source,now()
      )
      on conflict(character_id,npc_character_id) do update set
        discovered_by=excluded.discovered_by,
        source=excluded.source,
        last_interaction_at=excluded.last_interaction_at;
    else
      delete from public.character_npc_discoveries
      where character_id=p_character_id and npc_character_id=p_entity_id;
    end if;

  elsif p_entity_type='link' then
    select source.campaign_id,target.campaign_id,
           coalesce(nullif(link.label,''),target.name)
      into v_entity_campaign,v_target_campaign,v_entity_name
    from public.location_links link
    join public.location_sections section on section.id=link.section_id
    join public.locations source on source.id=section.location_id
    join public.locations target on target.id=link.target_location_id
    where link.id=p_entity_id;

    if v_entity_campaign is null
       or v_entity_campaign<>v_character_campaign
       or v_target_campaign<>v_character_campaign then
      raise exception 'Transition must belong to the character campaign';
    end if;

    if not private.can_view_location_link(p_entity_id,v_user_id) then
      raise exception 'Transition is unavailable';
    end if;

    if p_discovered then
      insert into public.character_location_link_discoveries(
        character_id,location_link_id,discovered_by,source
      ) values (
        p_character_id,p_entity_id,v_user_id,v_source
      )
      on conflict(character_id,location_link_id) do update set
        discovered_by=excluded.discovered_by,
        source=excluded.source;
    else
      delete from public.character_location_link_discoveries
      where character_id=p_character_id and location_link_id=p_entity_id;
    end if;
  else
    raise exception 'Unsupported discovery type';
  end if;

  return jsonb_build_object(
    'character_id',p_character_id,
    'entity_type',p_entity_type,
    'entity_id',p_entity_id,
    'entity_name',v_entity_name,
    'discovered',p_discovered,
    'source',v_source,
    'canonical_state_changed',true
  );
end;
$function$;

revoke all on function public.manage_world_discovery_v1(uuid,text,uuid,boolean,text)
from public,anon;
grant execute on function public.manage_world_discovery_v1(uuid,text,uuid,boolean,text)
to authenticated;

CREATE OR REPLACE FUNCTION public.set_world_discovery(p_character_id uuid, p_entity_type text, p_entity_id uuid, p_discovered boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.manage_world_discovery_v1(
    p_character_id,p_entity_type,p_entity_id,p_discovered,'manual'
  );
end;
$function$;

revoke all on function public.set_world_discovery(uuid,text,uuid,boolean)
from public,anon;
grant execute on function public.set_world_discovery(uuid,text,uuid,boolean)
to authenticated;

CREATE OR REPLACE FUNCTION public.move_character_world_v1(p_character_id uuid, p_location_id uuid, p_campaign_day integer DEFAULT NULL::integer, p_day_period text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_location_name text;
  v_location_state text;
  v_current_day integer := 1;
  v_current_period text := 'day';
  v_day integer;
  v_period text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select c.campaign_id into v_campaign_id
  from public.characters c
  where c.id=p_character_id;

  if v_campaign_id is null then
    raise exception 'Character not found';
  end if;

  if not private.can_manage_character(p_character_id,v_user_id) then
    raise exception 'Not allowed';
  end if;

  select coalesce(ws.campaign_day,1),coalesce(ws.day_period,'day')
    into v_current_day,v_current_period
  from public.character_world_state ws
  where ws.character_id=p_character_id;

  v_day := coalesce(p_campaign_day,v_current_day,1);
  v_period := coalesce(nullif(btrim(p_day_period),''),v_current_period,'day');

  if v_day<1 then
    raise exception 'Campaign day must be positive';
  end if;

  if v_period not in ('dawn','morning','day','late_day','evening','night','deep_night') then
    raise exception 'Unsupported day period';
  end if;

  if p_location_id is not null then
    select l.name,l.lifecycle_state
      into v_location_name,v_location_state
    from public.locations l
    where l.id=p_location_id
      and l.campaign_id=v_campaign_id;

    if v_location_name is null then
      raise exception 'Location must belong to the character campaign';
    end if;

    if v_location_state<>'active' then
      raise exception 'Cannot move character to archived location';
    end if;

    if not private.can_view_location(p_location_id,v_user_id) then
      raise exception 'Location is unavailable';
    end if;
  end if;

  perform public.set_character_world_position(
    p_character_id,p_location_id,v_day,v_period
  );

  return jsonb_build_object(
    'character_id',p_character_id,
    'location_id',p_location_id,
    'location_name',v_location_name,
    'campaign_day',v_day,
    'day_period',v_period,
    'location_discovered',p_location_id is not null,
    'canonical_state_changed',true
  );
end;
$function$;

revoke all on function public.move_character_world_v1(uuid,uuid,integer,text)
from public,anon;
grant execute on function public.move_character_world_v1(uuid,uuid,integer,text)
to authenticated;

CREATE OR REPLACE FUNCTION public.upsert_location_transition_v1(p_source_location_id uuid, p_target_location_id uuid, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_input jsonb := coalesce(p_input,'{}'::jsonb);
  v_source_campaign uuid;
  v_target_campaign uuid;
  v_source_name text;
  v_target_name text;
  v_source_state text;
  v_target_state text;
  v_link_id uuid;
  v_section_id uuid;
  v_requested_link_id uuid;
  v_visibility text := 'discover';
  v_label text;
  v_sort_order integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(v_input)<>'object' then
    raise exception 'Transition input must be an object';
  end if;

  if p_source_location_id=p_target_location_id then
    raise exception 'Transition source and target must differ';
  end if;

  select l.campaign_id,l.name,l.lifecycle_state
    into v_source_campaign,v_source_name,v_source_state
  from public.locations l
  where l.id=p_source_location_id;

  select l.campaign_id,l.name,l.lifecycle_state
    into v_target_campaign,v_target_name,v_target_state
  from public.locations l
  where l.id=p_target_location_id;

  if v_source_campaign is null or v_target_campaign is null
     or v_source_campaign<>v_target_campaign then
    raise exception 'Transition locations must belong to the same campaign';
  end if;

  if v_source_state<>'active' or v_target_state<>'active' then
    raise exception 'Transition locations must be active';
  end if;

  if not private.can_manage_location(p_source_location_id,v_user_id) then
    raise exception 'Source location is not manageable';
  end if;

  if not private.can_view_location(p_target_location_id,v_user_id) then
    raise exception 'Target location is unavailable';
  end if;

  if nullif(v_input->>'link_id','') is not null then
    begin
      v_requested_link_id := (v_input->>'link_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid link id';
    end;

    if not private.can_manage_location_link(v_requested_link_id,v_user_id) then
      raise exception 'Transition is not manageable';
    end if;

    select link.id,link.section_id
      into v_link_id,v_section_id
    from public.location_links link
    join public.location_sections section on section.id=link.section_id
    where link.id=v_requested_link_id
      and section.location_id=p_source_location_id;

    if v_link_id is null then
      raise exception 'Transition does not belong to source location';
    end if;
  else
    select link.id,link.section_id
      into v_link_id,v_section_id
    from public.location_links link
    join public.location_sections section on section.id=link.section_id
    where section.location_id=p_source_location_id
      and link.target_location_id=p_target_location_id
    order by link.created_at
    limit 1;
  end if;

  v_visibility := case
    when lower(btrim(coalesce(v_input->>'visibility_mode',''))) in ('always','discover','private')
      then lower(btrim(v_input->>'visibility_mode'))
    when v_link_id is not null
      then (select link.visibility_mode from public.location_links link where link.id=v_link_id)
    else 'discover'
  end;

  v_label := case
    when v_input ? 'label'
      then left(btrim(coalesce(v_input->>'label','')),240)
    when v_link_id is not null
      then (select link.label from public.location_links link where link.id=v_link_id)
    else ''
  end;
  if v_label='' then v_label := v_target_name; end if;

  v_sort_order := case
    when coalesce(v_input->>'sort_order','') ~ '^-?[0-9]+$'
      then (v_input->>'sort_order')::integer
    else null
  end;

  if v_section_id is null then
    select section.id into v_section_id
    from public.location_sections section
    where section.location_id=p_source_location_id
      and lower(btrim(section.title))='переходы'
    order by section.sort_order,section.created_at
    limit 1;

    if v_section_id is null then
      insert into public.location_sections(location_id,title,body,sort_order)
      select p_source_location_id,'Переходы','',
             coalesce(max(section.sort_order),0)+10
      from public.location_sections section
      where section.location_id=p_source_location_id
      returning id into v_section_id;
    end if;
  end if;

  if v_link_id is null then
    if v_sort_order is null then
      select coalesce(max(link.sort_order),0)+10
        into v_sort_order
      from public.location_links link
      where link.section_id=v_section_id;
    end if;

    insert into public.location_links(
      section_id,target_location_id,label,sort_order,visibility_mode,created_by
    ) values (
      v_section_id,p_target_location_id,v_label,v_sort_order,v_visibility,v_user_id
    )
    returning id into v_link_id;
  else
    update public.location_links link
    set target_location_id=p_target_location_id,
        label=v_label,
        visibility_mode=v_visibility,
        sort_order=coalesce(v_sort_order,link.sort_order)
    where link.id=v_link_id;
  end if;

  return (
    select jsonb_build_object(
      'id',link.id,
      'source_location_id',p_source_location_id,
      'source_location_name',v_source_name,
      'target_location_id',link.target_location_id,
      'target_location_name',target.name,
      'label',link.label,
      'visibility_mode',link.visibility_mode,
      'sort_order',link.sort_order,
      'directional',true,
      'canonical_state_changed',true
    )
    from public.location_links link
    join public.locations target on target.id=link.target_location_id
    where link.id=v_link_id
  );
end;
$function$;

revoke all on function public.upsert_location_transition_v1(uuid,uuid,jsonb)
from public,anon;
grant execute on function public.upsert_location_transition_v1(uuid,uuid,jsonb)
to authenticated;

CREATE OR REPLACE FUNCTION public.delete_location_transition_v1(p_link_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_source_id uuid;
  v_target_id uuid;
  v_label text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_location_link(p_link_id,v_user_id) then
    raise exception 'Transition is not manageable';
  end if;

  select section.location_id,link.target_location_id,link.label
    into v_source_id,v_target_id,v_label
  from public.location_links link
  join public.location_sections section on section.id=link.section_id
  where link.id=p_link_id;

  if v_source_id is null then
    raise exception 'Transition not found';
  end if;

  delete from public.location_links where id=p_link_id;

  return jsonb_build_object(
    'deleted',true,
    'link_id',p_link_id,
    'source_location_id',v_source_id,
    'target_location_id',v_target_id,
    'label',v_label,
    'canonical_state_changed',true
  );
end;
$function$;

revoke all on function public.delete_location_transition_v1(uuid)
from public,anon;
grant execute on function public.delete_location_transition_v1(uuid)
to authenticated;
