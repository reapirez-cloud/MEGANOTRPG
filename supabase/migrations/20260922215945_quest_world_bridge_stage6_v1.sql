CREATE OR REPLACE FUNCTION public.materialize_quest_target_v1(p_quest_id uuid, p_target_key text, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_input jsonb := coalesce(p_input,'{}'::jsonb);
  v_quest public.quests%rowtype;
  v_target public.quest_targets%rowtype;
  v_entity_id uuid;
  v_existing_id uuid;
  v_npc_result jsonb;
  v_name text;
  v_parent_id uuid;
  v_visibility text;
  v_sort_order integer := 0;
  v_item_data jsonb := '{}'::jsonb;
  v_item_mechanics jsonb := '[]'::jsonb;
  v_slug text;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if jsonb_typeof(v_input) <> 'object' then
    raise exception 'quest_target_materialization_input_invalid';
  end if;

  select * into v_quest
  from public.quests q
  where q.id=p_quest_id
  for update;

  if not found then
    raise exception 'quest_not_found';
  end if;

  if not private.can_manage_quest(p_quest_id,v_user_id) then
    raise exception 'quest_target_materialization_denied';
  end if;

  if v_quest.status not in ('draft','active') then
    raise exception 'quest_target_materialization_closed_quest';
  end if;

  select * into v_target
  from public.quest_targets qt
  where qt.quest_id=p_quest_id
    and qt.target_key=btrim(coalesce(p_target_key,''))
  for update;

  if not found then
    raise exception 'quest_target_not_found';
  end if;

  v_existing_id := case v_target.target_kind
    when 'location' then v_target.location_id
    when 'npc' then v_target.npc_character_id
    when 'item' then v_target.item_definition_id
    else null
  end;

  if v_existing_id is not null then
    return jsonb_build_object(
      'ok',true,
      'created',false,
      'already_bound',true,
      'quest_id',p_quest_id,
      'target_id',v_target.id,
      'target_key',v_target.target_key,
      'target_kind',v_target.target_kind,
      'entity_id',v_existing_id,
      'binding_state',v_target.binding_state,
      'plan',public.read_quest_plan_v1(p_quest_id)
    );
  end if;

  if v_target.target_kind='location' then
    v_name := nullif(left(btrim(coalesce(v_input->>'name','')),160),'');
    if v_name is null then
      raise exception 'quest_location_name_required';
    end if;

    v_visibility := lower(btrim(coalesce(v_input->>'visibility_mode','discover')));
    if v_visibility not in ('always','discover') then
      raise exception 'quest_location_visibility_invalid';
    end if;

    if nullif(v_input->>'parent_location_id','') is not null then
      begin
        v_parent_id := (v_input->>'parent_location_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'quest_location_parent_invalid';
      end;

      if not exists(
        select 1 from public.locations l
        where l.id=v_parent_id
          and l.campaign_id=v_quest.campaign_id
          and l.lifecycle_state='active'
      ) or not private.can_view_location(v_parent_id,v_user_id) then
        raise exception 'quest_location_parent_unavailable';
      end if;
    end if;

    if coalesce(v_input->>'sort_order','') ~ '^-?[0-9]+$' then
      v_sort_order := greatest(-100000,least((v_input->>'sort_order')::integer,100000));
    end if;

    insert into public.locations(
      campaign_id,parent_location_id,name,summary,description,image_url,
      sort_order,visibility_mode,lifecycle_state,created_by
    ) values (
      v_quest.campaign_id,
      v_parent_id,
      v_name,
      left(btrim(coalesce(v_input->>'summary','')),3000),
      left(btrim(coalesce(v_input->>'description','')),16000),
      nullif(left(btrim(coalesce(v_input->>'image_url','')),2000),''),
      v_sort_order,
      v_visibility,
      'active',
      v_user_id
    )
    returning id into v_entity_id;

    update public.quest_targets
    set location_id=v_entity_id
    where id=v_target.id;

  elsif v_target.target_kind='npc' then
    if nullif(btrim(coalesce(v_input->>'name','')),'') is null then
      raise exception 'quest_npc_name_required';
    end if;

    v_npc_result := public.create_world_npc_v1(v_quest.campaign_id,v_input);
    v_entity_id := nullif(v_npc_result->>'npc_id','')::uuid;

    if v_entity_id is null then
      raise exception 'quest_npc_materialization_failed';
    end if;

    update public.quest_targets
    set npc_character_id=v_entity_id
    where id=v_target.id;

  elsif v_target.target_kind='item' then
    v_name := nullif(left(btrim(coalesce(v_input->>'name','')),240),'');
    if v_name is null then
      raise exception 'quest_item_name_required';
    end if;

    if jsonb_typeof(v_input->'data')='object' then
      v_item_data := v_input->'data';
    end if;
    if jsonb_typeof(v_input->'mechanics')='array' then
      v_item_mechanics := v_input->'mechanics';
    end if;

    if not (v_item_data ? 'inventory_profile') then
      raise exception 'quest_item_inventory_profile_required';
    end if;

    v_visibility := lower(btrim(coalesce(v_input->>'visibility','gm')));
    if v_visibility not in ('gm','campaign') then
      raise exception 'quest_item_visibility_invalid';
    end if;

    v_slug := 'quest-target-' || replace(v_target.id::text,'-','');

    v_entity_id := public.create_reference_definition_v2(
      v_quest.campaign_id,
      'item',
      v_slug,
      v_visibility,
      'active',
      'quest_materialization',
      coalesce(nullif(left(btrim(coalesce(v_input->>'source_label','')),240),''),v_target.placeholder_label),
      'quest_target:' || v_target.id::text,
      v_name,
      left(btrim(coalesce(v_input->>'summary','')),6000),
      left(btrim(coalesce(v_input->>'rules_text','')),24000),
      v_item_mechanics,
      v_item_data
    );

    update public.quest_targets
    set item_definition_id=v_entity_id
    where id=v_target.id;

  else
    raise exception 'quest_target_kind_unsupported';
  end if;

  select * into v_target
  from public.quest_targets qt
  where qt.id=v_target.id;

  if v_target.binding_state<>'bound' then
    raise exception 'quest_target_materialization_binding_failed';
  end if;

  perform private.resolve_quest_v1(p_quest_id);

  return jsonb_build_object(
    'ok',true,
    'created',true,
    'already_bound',false,
    'quest_id',p_quest_id,
    'target_id',v_target.id,
    'target_key',v_target.target_key,
    'target_kind',v_target.target_kind,
    'placeholder_label',v_target.placeholder_label,
    'entity_id',v_entity_id,
    'binding_state',v_target.binding_state,
    'plan',public.read_quest_plan_v1(p_quest_id)
  );
end;
$function$;

revoke all on function public.materialize_quest_target_v1(uuid,text,jsonb)
from public,anon,authenticated;
grant execute on function public.materialize_quest_target_v1(uuid,text,jsonb)
to authenticated,service_role;

comment on function public.materialize_quest_target_v1(uuid,text,jsonb) is
  'GM/Admin atomic Quest↔World bridge. Materializes one unbound quest target into a canonical location, published world NPC, or campaign item definition, binds it, and reruns the resolver in the same transaction.';
