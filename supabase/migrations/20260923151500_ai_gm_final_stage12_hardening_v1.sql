-- AI GM Stage 12 hardening: direct-PC turns cannot hide gameplay components,
-- and lightweight NPC possessions materialize only through an explicit boundary.

create or replace function public.submit_player_turn_stage12_v1(
  p_draft_id uuid,
  p_expected_revision integer,
  p_turn_command_id uuid,
  p_recipient_character_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_trigger_message_id bigint;
  v_audience jsonb;
  v_draft public.player_turn_drafts%rowtype;
  v_recipients uuid[] := coalesce(p_recipient_character_ids,'{}'::uuid[]);
begin
  select * into v_draft
  from public.player_turn_drafts d
  where d.id=p_draft_id
  for update;

  if v_draft.id is null then
    raise exception 'player_turn_draft_not_found';
  end if;

  if cardinality(v_recipients)>0
     and (
       v_draft.action_entry is not null
       or v_draft.bonus_action_entry is not null
       or v_draft.movement is not null
     )
  then
    raise exception 'direct_pc_dialogue_cannot_include_gameplay_components';
  end if;

  v_result:=public.submit_player_turn_v1(
    p_draft_id,
    p_expected_revision,
    p_turn_command_id
  );

  v_trigger_message_id:=nullif(v_result->>'trigger_message_id','')::bigint;
  if v_trigger_message_id is null then
    raise exception 'player_turn_trigger_message_missing';
  end if;

  v_audience:=public.set_chat_message_audience_v1(
    v_trigger_message_id,
    v_recipients
  );

  return v_result||jsonb_build_object(
    'audience_scope',v_audience->>'audience_scope',
    'recipient_character_ids',coalesce(
      v_audience->'recipient_character_ids',
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.submit_player_turn_stage12_v1(
  uuid,integer,uuid,uuid[]
) from public,anon;
grant execute on function public.submit_player_turn_stage12_v1(
  uuid,integer,uuid,uuid[]
) to authenticated,service_role;

create or replace function public.materialize_npc_text_inventory_item_v1(
  p_campaign_id uuid,
  p_npc_character_id uuid,
  p_inventory_index integer,
  p_target_character_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.npc_profiles%rowtype;
  v_entry jsonb;
  v_target uuid := coalesce(p_target_character_id,p_npc_character_id);
  v_existing_item_id uuid;
  v_item_id uuid;
  v_name text;
  v_description text;
  v_category text;
  v_quantity integer;
  v_weight numeric;
  v_state jsonb;
begin
  if auth.role()<>'service_role' then
    if v_user_id is null
       or not private.can_manage_campaign(p_campaign_id,v_user_id)
    then
      raise exception 'campaign_manager_required';
    end if;
  end if;

  if p_inventory_index is null or p_inventory_index<0 then
    raise exception 'npc_inventory_index_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'npc-text-inventory:'||p_npc_character_id::text||':'||p_inventory_index::text,
      0
    )
  );

  select p.* into v_profile
  from public.npc_profiles p
  join public.characters c on c.id=p.character_id
  where p.campaign_id=p_campaign_id
    and p.character_id=p_npc_character_id
    and c.character_type='npc'
    and c.publication_state='campaign'
  for update;

  if v_profile.character_id is null then
    raise exception 'npc_profile_not_found';
  end if;

  if p_inventory_index>=jsonb_array_length(v_profile.inventory_data) then
    raise exception 'npc_inventory_index_invalid';
  end if;

  v_entry:=v_profile.inventory_data->p_inventory_index;
  if jsonb_typeof(v_entry)<>'object' then
    raise exception 'npc_inventory_entry_invalid';
  end if;

  begin
    v_existing_item_id:=nullif(v_entry->>'materialized_inventory_item_id','')::uuid;
  exception when others then
    v_existing_item_id:=null;
  end;

  if v_existing_item_id is not null
     and exists(
       select 1 from public.character_inventory_items i
       where i.id=v_existing_item_id
     )
  then
    return jsonb_build_object(
      'character_id',p_npc_character_id,
      'inventory_index',p_inventory_index,
      'physical_item_id',v_existing_item_id,
      'target_character_id',nullif(v_entry->>'materialized_character_id','')::uuid,
      'already_materialized',true
    );
  end if;

  if not exists(
    select 1
    from public.characters c
    where c.id=v_target
      and c.campaign_id=p_campaign_id
      and c.life_state='alive'
      and c.publication_state='campaign'
  ) then
    raise exception 'materialization_target_not_found';
  end if;

  v_name:=left(
    coalesce(
      nullif(btrim(v_entry->>'name'),''),
      nullif(btrim(v_entry->>'label'),''),
      ''
    ),
    240
  );
  if v_name='' then
    raise exception 'npc_inventory_item_name_required';
  end if;

  v_description:=left(coalesce(v_entry->>'description',''),6000);
  v_category:=lower(coalesce(nullif(btrim(v_entry->>'category'),''),'other'));
  if v_category not in (
    'equipment','consumable','tool','book','trinket',
    'quest','material','currency','container','other'
  ) then
    v_category:='other';
  end if;

  v_quantity:=case
    when coalesce(v_entry->>'quantity','') ~ '^[0-9]+$'
      then greatest(1,least(999999,(v_entry->>'quantity')::integer))
    else 1
  end;

  v_weight:=case
    when coalesce(v_entry->>'weight','') ~ '^[0-9]+([.][0-9]+)?$'
      then greatest(0,(v_entry->>'weight')::numeric)
    else null
  end;

  v_state:=jsonb_build_object(
    'source_kind','npc_text_inventory',
    'source_npc_character_id',p_npc_character_id,
    'source_inventory_index',p_inventory_index
  );

  insert into public.character_inventory_items(
    character_id,name,quantity,weight,description,category,
    equipped,mechanics,usage_mode,item_state,stack_mode,
    placement_kind,grid_rotation
  )
  values(
    v_target,v_name,v_quantity,v_weight,v_description,v_category,
    false,'[]'::jsonb,'none',v_state,
    case when v_quantity>1 then 'stack' else 'instance' end,
    'root',0
  )
  returning id into v_item_id;

  v_entry:=v_entry||jsonb_build_object(
    'materialized_inventory_item_id',v_item_id,
    'materialized_character_id',v_target,
    'materialized_at',now(),
    'transferred',v_target<>p_npc_character_id
  );

  update public.npc_profiles p
  set inventory_data=jsonb_set(
        p.inventory_data,
        array[p_inventory_index::text],
        v_entry,
        false
      ),
      updated_at=now(),
      updated_by=coalesce(v_user_id,p.updated_by)
  where p.character_id=p_npc_character_id
    and p.campaign_id=p_campaign_id;

  return jsonb_build_object(
    'character_id',p_npc_character_id,
    'inventory_index',p_inventory_index,
    'physical_item_id',v_item_id,
    'target_character_id',v_target,
    'already_materialized',false,
    'transferred',v_target<>p_npc_character_id
  );
end;
$$;

revoke all on function public.materialize_npc_text_inventory_item_v1(
  uuid,uuid,integer,uuid
) from public,anon;
grant execute on function public.materialize_npc_text_inventory_item_v1(
  uuid,uuid,integer,uuid
) to authenticated,service_role;

comment on function public.materialize_npc_text_inventory_item_v1(
  uuid,uuid,integer,uuid
) is
  'Explicit Stage 12 boundary: materializes one lightweight NPC possession into Cheburashka only when mechanics or transfer require a physical item.';
