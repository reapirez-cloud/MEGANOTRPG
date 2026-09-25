
create or replace function public.upsert_location_transition_v1(
  p_source_location_id uuid,
  p_target_location_id uuid,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
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
  v_travel_minutes integer;
  v_has_travel_minutes boolean := v_input ? 'travel_minutes';
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

  if v_has_travel_minutes then
    if jsonb_typeof(v_input->'travel_minutes')='null' then
      v_travel_minutes := null;
    elsif coalesce(v_input->>'travel_minutes','') ~ '^[0-9]+$' then
      v_travel_minutes := (v_input->>'travel_minutes')::integer;
      if v_travel_minutes<1 or v_travel_minutes>10080 then
        raise exception 'Transition travel_minutes must be between 1 and 10080';
      end if;
    else
      raise exception 'Transition travel_minutes must be an integer or null';
    end if;
  elsif v_link_id is not null then
    select link.travel_minutes into v_travel_minutes
    from public.location_links link where link.id=v_link_id;
  else
    v_travel_minutes := null;
  end if;

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
      section_id,target_location_id,label,sort_order,visibility_mode,created_by,
      travel_minutes
    ) values (
      v_section_id,p_target_location_id,v_label,v_sort_order,v_visibility,v_user_id,
      v_travel_minutes
    )
    returning id into v_link_id;
  else
    update public.location_links link
    set target_location_id=p_target_location_id,
        label=v_label,
        visibility_mode=v_visibility,
        sort_order=coalesce(v_sort_order,link.sort_order),
        travel_minutes=case
          when v_has_travel_minutes then v_travel_minutes
          else link.travel_minutes
        end
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
      'travel_minutes',link.travel_minutes,
      'directional',true,
      'canonical_state_changed',true
    )
    from public.location_links link
    join public.locations target on target.id=link.target_location_id
    where link.id=v_link_id
  );
end;
$$;
