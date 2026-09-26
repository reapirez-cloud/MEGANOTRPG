-- Physical capacity for new character items. Existing root items remain visible as
-- legacy unplaced rows until their owner assigns a bag or a hand.
-- Coin quantity uses one physical slot per denomination and retains mass.

create or replace function private.cheburashka_grant_equipment_slot_v1(p_definition jsonb, p_card jsonb)
returns text language sql stable set search_path = '' as $function$
  select coalesce(
    nullif(p_definition->>'equipment_slot',''),
    nullif(p_card->>'equipment_slot',''),
    case
      when p_definition->'inventory_profile'->>'semantic_role' like 'weapon.%' then 'main_hand'
      when p_definition->'inventory_profile'->>'semantic_role' in ('gear.clothing','gear.cloak') then 'chest'
      when p_definition->'inventory_profile'->>'semantic_role' like 'armor.%' then 'chest'
      when p_definition->'inventory_profile'->>'semantic_role' = 'gear.headwear' then 'head'
      when p_definition->'inventory_profile'->>'semantic_role' = 'gear.gloves' then 'hands'
      when p_definition->'inventory_profile'->>'semantic_role' = 'gear.boots' then 'feet'
      when p_definition->'inventory_profile'->>'semantic_role' = 'gear.belt' then 'waist'
      when p_definition->'inventory_profile'->>'semantic_role' = 'gear.ring' then 'ring_left'
      else null end
  );
$function$;
revoke all on function private.cheburashka_grant_equipment_slot_v1(jsonb,jsonb) from public,anon,authenticated;

-- Older direct create endpoints bypass physical placement. The supported v3
-- wrapper still calls v2 internally under its authenticated, checked context.
revoke execute on function public.create_inventory_item_v1(uuid,jsonb,uuid) from authenticated;
revoke execute on function public.create_inventory_item_v2(uuid,jsonb,uuid) from authenticated;

create or replace function private.cheburashka_place_new_character_item_v1(p_character_id uuid,p_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_item public.character_inventory_items%rowtype;
  v_bag record;
  v_hand integer;
  v_command_id uuid;
begin
  select * into v_item from public.character_inventory_items
  where id=p_item_id and character_id=p_character_id for update;
  if v_item.id is null then raise exception 'Inventory item not found'; end if;
  if v_item.equipped or v_item.holder_item_id is not null
     or v_item.placement_kind in ('hand','external','grid') then return; end if;

  -- A legacy root bag can still be used while its owner rehouses old items.
  -- Never create another unlimited root row to make room.
  for v_bag in
    select bag.id from public.character_inventory_items bag
    where bag.character_id=p_character_id and bag.category='container'
      and bag.id<>p_item_id
      and (v_item.category<>'container' or
        coalesce((private.cheburashka_inventory_profile_for_item_v1(bag.id)
          ->'container_profile'->>'allow_nested_containers')::boolean,true))
      and (bag.placement_kind in ('hand','external','grid','legacy','root') or bag.equipped)
      and (select count(*) from public.character_inventory_items child
           where child.holder_item_id=bag.id and child.character_id=p_character_id)
          < private.cheburashka_simple_container_capacity_v1(bag.id)
    order by case when bag.placement_kind in ('hand','external') or bag.equipped then 0
                  when bag.placement_kind in ('grid','legacy') then 1 else 2 end,
             bag.created_at,bag.id
  loop
    v_command_id:=md5(p_item_id::text||'|auto-bag|'||v_bag.id::text)::uuid;
    perform public.move_inventory_item_simple_v1(
      p_character_id,p_item_id,v_bag.id,v_item.version,v_command_id);
    return;
  end loop;

  for v_hand in 0..1 loop
    if not exists(select 1 from public.character_inventory_items occupied
      where occupied.character_id=p_character_id and occupied.placement_kind='hand'
        and occupied.placement_index=v_hand and occupied.id<>p_item_id) then
      v_command_id:=md5(p_item_id::text||'|auto-hand|'||v_hand::text)::uuid;
      perform public.move_inventory_item_v3(p_character_id,p_item_id,'hand',null,null,null,0,
        v_hand,v_item.version,v_command_id);
      return;
    end if;
  end loop;
  raise exception using errcode='22023',
    message='inventory_no_free_slot: Нет свободной ячейки в сумке или руке. Предмет не добавлен.';
end;
$function$;
revoke all on function private.cheburashka_place_new_character_item_v1(uuid,uuid) from public,anon,authenticated;

-- Repair only known semantic roles, without guessing an arbitrary item's anatomy.
update public.character_inventory_items i
set equipment_slot=private.cheburashka_grant_equipment_slot_v1(r.data,'{}'::jsonb)
from public.reference_definition_revisions r
where i.definition_id=r.definition_id and i.definition_revision=r.revision
  and i.category='equipment' and i.equipment_slot is null
  and private.cheburashka_grant_equipment_slot_v1(r.data,'{}'::jsonb) is not null;
update public.character_inventory_items set weight=0.01
where category='currency' and weight is null;

-- Keep a durable audit/alias for old stack ids. Only unreferenced, identical
-- legacy root coins are folded; any stack with state or a live relation stays.
create table if not exists private.cheburashka_legacy_coin_merge_v1 (
  old_item_id uuid primary key,
  surviving_item_id uuid not null,
  old_quantity integer not null check (old_quantity > 0),
  merged_at timestamptz not null default now()
);
alter table private.cheburashka_legacy_coin_merge_v1 enable row level security;
revoke all on private.cheburashka_legacy_coin_merge_v1 from public,anon,authenticated;

do $merge$
declare
  v_group record;
  v_survivor public.character_inventory_items%rowtype;
  v_duplicate public.character_inventory_items%rowtype;
begin
  for v_group in
    select character_id,definition_id,definition_revision
    from public.character_inventory_items
    where category='currency' and stack_mode='stack'
      and character_id is not null and definition_id is not null
      and holder_item_id is null and placement_kind='root'
    group by character_id,definition_id,definition_revision
    having count(*)>1
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('inventory:' || v_group.character_id::text,0));
    select * into v_survivor
    from public.character_inventory_items i
    where i.character_id=v_group.character_id
      and i.definition_id=v_group.definition_id
      and i.definition_revision=v_group.definition_revision
      and i.category='currency' and i.stack_mode='stack'
      and i.holder_item_id is null and i.placement_kind='root'
    order by i.created_at,i.id limit 1 for update;

    for v_duplicate in
      select i.* from public.character_inventory_items i
      where i.character_id=v_group.character_id
        and i.definition_id=v_group.definition_id
        and i.definition_revision=v_group.definition_revision
        and i.category='currency' and i.stack_mode='stack'
        and i.holder_item_id is null and i.placement_kind='root'
        and i.id<>v_survivor.id and i.item_state='{}'::jsonb
        and not exists(select 1 from public.character_inventory_items child where child.holder_item_id=i.id)
        and not exists(select 1 from public.character_assets a where a.inventory_item_id=i.id)
        and not exists(select 1 from public.trade_visible_items t where t.item_id=i.id)
        and not exists(select 1 from public.trade_interest_marks t where t.item_id=i.id)
        and not exists(select 1 from public.world_storages w where w.root_item_id=i.id)
      order by i.created_at,i.id for update
    loop
      if v_survivor.quantity::bigint+v_duplicate.quantity::bigint>2147483647 then exit; end if;
      insert into private.cheburashka_legacy_coin_merge_v1(old_item_id,surviving_item_id,old_quantity)
      values(v_duplicate.id,v_survivor.id,v_duplicate.quantity);
      update public.character_inventory_items
      set quantity=quantity+v_duplicate.quantity,weight=coalesce(weight,0.01)
      where id=v_survivor.id
      returning * into v_survivor;
      delete from public.character_inventory_items where id=v_duplicate.id;
    end loop;
  end loop;
end;
$merge$;

create or replace function public.move_inventory_item_simple_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_holder_item_id uuid,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_version bigint;
  v_item_category text;
  v_holder_character uuid;
  v_holder_category text;
  v_holder_profile jsonb;
  v_capacity integer;
  v_occupied integer;
  v_cycle boolean := false;
  v_overflow boolean := false;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_command_id is null then
    raise exception 'Command id is required';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'Expected inventory version is required';
  end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  select character.campaign_id
  into v_campaign_id
  from public.characters character
  where character.id = p_character_id;

  if v_campaign_id is null then
    raise exception 'Character not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory-simple:' || p_character_id::text, 0)
  );

  select *
  into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.move'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  perform 1
  from public.character_inventory_items item
  where item.character_id = p_character_id
  order by item.id
  for update;

  select to_jsonb(item), item.version, item.category
  into v_before, v_version, v_item_category
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id;

  if v_before is null then
    raise exception 'Inventory item not found for this character';
  end if;
  if v_version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',
      p_expected_version, v_version;
  end if;

  if p_holder_item_id = p_item_id then
    raise exception 'Inventory item cannot contain itself';
  end if;

  if p_holder_item_id is null then
    raise exception using errcode='22023',message='inventory_no_root_storage: Выберите сумку или свободную руку';
  else
    select
      holder.character_id,
      holder.category,
      private.cheburashka_inventory_profile_for_item_v1(holder.id)
    into v_holder_character, v_holder_category, v_holder_profile
    from public.character_inventory_items holder
    where holder.id = p_holder_item_id;

    if v_holder_character is null then
      raise exception 'Inventory holder not found';
    end if;
    if v_holder_character <> p_character_id then
      raise exception 'Inventory holder must belong to the same character';
    end if;
    if v_holder_category <> 'container' then
      raise exception 'Inventory holder must be a container';
    end if;

    if v_item_category = 'container'
       and coalesce(
         (v_holder_profile->'container_profile'->>'allow_nested_containers')::boolean,
         true
       ) = false then
      raise exception 'Inventory holder does not allow nested containers';
    end if;

    with recursive chain as (
      select holder.id, holder.holder_item_id, 1 as depth
      from public.character_inventory_items holder
      where holder.id = p_holder_item_id

      union all

      select parent.id, parent.holder_item_id, chain.depth + 1
      from public.character_inventory_items parent
      join chain on parent.id = chain.holder_item_id
      where chain.depth < 17
    )
    select
      coalesce(bool_or(id = p_item_id), false),
      coalesce(bool_or(depth = 17 and holder_item_id is not null), false)
    into v_cycle, v_overflow
    from chain;

    if v_cycle then
      raise exception 'Inventory container cycle is not allowed';
    end if;
    if v_overflow then
      raise exception 'Inventory container nesting depth exceeds 16';
    end if;

    v_capacity := private.cheburashka_simple_container_capacity_v1(p_holder_item_id);

    select count(*)::integer
    into v_occupied
    from public.character_inventory_items child
    where child.character_id = p_character_id
      and child.holder_item_id = p_holder_item_id
      and child.id <> p_item_id;

    if v_occupied >= v_capacity then
      raise exception 'Inventory container is full';
    end if;
  end if;

  update public.character_inventory_items item
  set
    holder_item_id = p_holder_item_id,
    equipped = case
      when p_holder_item_id is null then item.equipped
      else false
    end,
    placement_kind = case
      when p_holder_item_id is null then 'root'
      else 'legacy'
    end,
    placement_index = null,
    grid_x = null,
    grid_y = null,
    grid_rotation = 0
  where item.id = p_item_id
    and item.character_id = p_character_id
  returning to_jsonb(item)
  into v_after;

  if p_holder_item_id is not null then
    perform private.cheburashka_assert_specialized_capacity_v1(p_holder_item_id);
  end if;
  perform private.cheburashka_assert_character_external_capacity_v1(p_character_id);

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(p_character_id),
    'before', v_before,
    'after', v_after
  );

  insert into public.engine_command_receipts(
    command_id,
    campaign_id,
    engine,
    command_kind,
    aggregate_id,
    result,
    created_by
  )
  values (
    p_command_id,
    v_campaign_id,
    'cheburashka',
    'inventory.move',
    p_item_id,
    v_result,
    auth.uid()
  );

  return v_result;
end;
$function$;

create or replace function private.cheburashka_assert_spatial_placement_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_target_kind text,
  p_holder_item_id uuid,
  p_grid_x integer,
  p_grid_y integer,
  p_rotation integer,
  p_slot_index integer
)
returns void
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_profile jsonb;
  v_item_category text;
  v_container_profile jsonb;
  v_grid_width integer;
  v_grid_height integer;
  v_bounds_width integer;
  v_bounds_height integer;
  v_capacity integer;
  v_holder_character uuid;
  v_holder_category text;
begin
  select item.category into v_item_category
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id;

  if v_item_category is null then
    raise exception 'Inventory item not found for this character';
  end if;

  v_profile := private.cheburashka_inventory_profile_for_item_v1(p_item_id);

  if p_target_kind = 'root' then
    raise exception using errcode='22023',message='inventory_no_root_storage: Выберите сумку или свободную руку';
  end if;

  if p_target_kind = 'hand' then
    if p_holder_item_id is not null or p_grid_x is not null or p_grid_y is not null then
      raise exception 'Hand placement does not accept holder or grid coordinates';
    end if;
    if p_slot_index not in (0,1) then
      raise exception 'Inventory hand index must be 0 or 1';
    end if;
    if exists (
      select 1
      from public.character_inventory_items occupied
      where occupied.character_id = p_character_id
        and occupied.placement_kind = 'hand'
        and occupied.placement_index = p_slot_index
        and occupied.id <> p_item_id
    ) then
      raise exception 'Inventory hand slot is occupied';
    end if;
    return;
  end if;

  if p_target_kind = 'external' then
    if p_holder_item_id is not null or p_grid_x is not null or p_grid_y is not null then
      raise exception 'External carry placement does not accept holder or grid coordinates';
    end if;
    if p_slot_index is null or p_slot_index < 0 then
      raise exception 'External carry slot index is required';
    end if;
    v_capacity := private.cheburashka_external_carry_capacity_v1(p_character_id);
    if p_slot_index >= v_capacity then
      raise exception 'External carry slot is unavailable';
    end if;
    if exists (
      select 1
      from public.character_inventory_items occupied
      where occupied.character_id = p_character_id
        and occupied.placement_kind = 'external'
        and occupied.placement_index = p_slot_index
        and occupied.id <> p_item_id
    ) then
      raise exception 'External carry slot is occupied';
    end if;
    return;
  end if;

  if p_target_kind <> 'grid' then
    raise exception 'Unsupported inventory placement kind';
  end if;

  if p_holder_item_id is null or p_grid_x is null or p_grid_y is null then
    raise exception 'Grid placement requires holder and coordinates';
  end if;
  if p_grid_x < 0 or p_grid_y < 0 then
    raise exception 'Inventory grid coordinates cannot be negative';
  end if;
  if p_slot_index is not null then
    raise exception 'Grid placement does not accept carry slot index';
  end if;

  select holder.character_id, holder.category
  into v_holder_character, v_holder_category
  from public.character_inventory_items holder
  where holder.id = p_holder_item_id;

  if v_holder_character is null then
    raise exception 'Inventory holder not found';
  end if;
  if v_holder_character <> p_character_id then
    raise exception 'Inventory holder must belong to the same character';
  end if;
  if v_holder_category <> 'container' then
    raise exception 'Inventory holder must be a container';
  end if;
  if p_holder_item_id = p_item_id then
    raise exception 'Inventory item cannot contain itself';
  end if;

  v_container_profile :=
    private.cheburashka_inventory_profile_for_item_v1(p_holder_item_id)->'container_profile';

  if v_container_profile is null or jsonb_typeof(v_container_profile) <> 'object' then
    raise exception 'Inventory holder has no container profile';
  end if;

  if v_item_category = 'container'
     and coalesce((v_container_profile->>'allow_nested_containers')::boolean, true) = false then
    raise exception 'Inventory holder does not allow nested containers';
  end if;

  v_grid_width := (v_container_profile->>'internal_grid_width')::integer;
  v_grid_height := (v_container_profile->>'internal_grid_height')::integer;

  select coalesce(max(cell_x), -1) + 1, coalesce(max(cell_y), -1) + 1
  into v_bounds_width, v_bounds_height
  from private.cheburashka_inventory_shape_cells_v1(v_profile, p_rotation);

  if p_grid_x + v_bounds_width > v_grid_width
     or p_grid_y + v_bounds_height > v_grid_height then
    raise exception 'Inventory placement is out of bounds';
  end if;

  if exists (
    select 1
    from private.cheburashka_inventory_shape_cells_v1(v_profile, p_rotation) source_cell
    join public.character_inventory_items other
      on other.holder_item_id = p_holder_item_id
     and other.placement_kind = 'grid'
     and other.id <> p_item_id
    cross join lateral private.cheburashka_inventory_shape_cells_v1(
      private.cheburashka_inventory_profile_for_item_v1(other.id),
      other.grid_rotation
    ) other_cell
    where p_grid_x + source_cell.cell_x = other.grid_x + other_cell.cell_x
      and p_grid_y + source_cell.cell_y = other.grid_y + other_cell.cell_y
  ) then
    raise exception 'Inventory placement overlaps another item';
  end if;
end;
$function$;

create or replace function public.move_inventory_item_v3(
  p_character_id uuid,
  p_item_id uuid,
  p_target_kind text,
  p_holder_item_id uuid,
  p_grid_x integer,
  p_grid_y integer,
  p_rotation integer,
  p_slot_index integer,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_equipped boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select item.equipped
  into v_equipped
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id;

  if not found then
    raise exception 'Inventory item not found for this character';
  end if;

  if p_target_kind = 'root' then
    raise exception using errcode='22023',message='inventory_no_root_storage: Выберите сумку или свободную руку';
  end if;

  return public.move_inventory_item_v2(
    p_character_id,
    p_item_id,
    p_target_kind,
    p_holder_item_id,
    p_grid_x,
    p_grid_y,
    p_rotation,
    p_slot_index,
    p_expected_version,
    p_command_id
  );
end;
$function$;

create or replace function public.create_inventory_item_v3(
  p_character_id uuid,
  p_input jsonb,
  p_inventory_profile jsonb default null,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_definition_id uuid;
  v_definition_revision integer;
  v_input jsonb;
  v_result jsonb;
  v_definition_data jsonb;
  v_slot text;
  v_item_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Inventory input must be an object'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then
    raise exception 'Only GM can create inventory items';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));

  select * into v_existing
  from public.engine_command_receipts
  where command_id=p_command_id;

  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'cheburashka'
       or v_existing.command_kind<>'inventory.create'
       or (v_existing.result->'affectedCharacterIds'->>0)::uuid<>p_character_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select campaign_id into v_campaign_id
  from public.characters
  where id=p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;

  select r.definition_id,r.definition_revision
  into v_definition_id,v_definition_revision
  from private.cheburashka_resolve_authored_definition_v1(
    v_campaign_id,p_input,p_inventory_profile,p_command_id
  ) r;

  v_input:=p_input || jsonb_build_object(
    'definition_id',v_definition_id,
    'definition_revision',v_definition_revision
  );

  select data into v_definition_data
  from public.reference_definition_revisions
  where definition_id=v_definition_id and revision=v_definition_revision;
  if coalesce(v_input->>'category',v_definition_data->>'category')='equipment' then
    v_slot:=private.cheburashka_grant_equipment_slot_v1(v_definition_data,v_input);
    if v_slot is null then
      raise exception using errcode='22023',
        message='inventory_equipment_slot_required: Укажите слот экипировки';
    end if;
    v_input:=v_input || jsonb_build_object('equipment_slot',v_slot);
  end if;
  if coalesce(v_input->>'category',v_definition_data->>'category')='currency'
     and nullif(v_input->>'weight','') is null then
    v_input:=v_input || jsonb_build_object('weight',0.01);
  end if;

  v_result:=public.create_inventory_item_v2(p_character_id,v_input,p_command_id);
  v_item_id:=coalesce(
    (select m.surviving_item_id from private.cheburashka_legacy_coin_merge_v1 m
      where m.old_item_id=(v_result->>'itemId')::uuid),
    (v_result->>'itemId')::uuid
  );
  perform private.cheburashka_place_new_character_item_v1(
    p_character_id,v_item_id);
  select to_jsonb(i) into v_input from public.character_inventory_items i
  where i.id=v_item_id;
  return v_result || jsonb_build_object('itemId',v_item_id,'after',v_input);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ai_gm_commit_inventory_delta_v1(p_campaign_id uuid, p_actor_user_id uuid, p_source_message_id bigint, p_args jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  v_args jsonb := coalesce(p_args,'{}'::jsonb);
  v_action text := lower(btrim(coalesce(v_args->>'action','')));
  v_character_id uuid;
  v_item_id uuid;
  v_item jsonb := coalesce(v_args->'item','{}'::jsonb);
  v_quantity integer;
  v_definition_id uuid;
  v_definition_revision integer;
  v_resolution jsonb;
  v_rev public.reference_definition_revisions%rowtype;
  v_stack_mode text;
  v_usage_mode text;
  v_category text;
  v_stack_max integer;
  v_remaining integer;
  v_chunk integer;
  v_step integer := 0;
  v_existing public.character_inventory_items%rowtype;
  v_command_id uuid;
  v_subcommand_id uuid;
  v_semantic_key text;
  v_input jsonb;
  v_op jsonb;
  v_results jsonb := '[]'::jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_receipt private.ai_gm_inventory_delta_receipts_v1%rowtype;
  v_result jsonb;
  v_batch_delta jsonb;
  v_batch_result jsonb;
  v_batch_results jsonb := '[]'::jsonb;
  v_batch_ids jsonb := '[]'::jsonb;
  v_batch_first_inventory_result jsonb := null;
  v_batch_changed boolean := false;
  v_batch_all_replayed boolean := true;
  v_batch_character_id text;
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501',message='service_role_required';
  end if;
  if p_campaign_id is null or p_actor_user_id is null or p_source_message_id is null then
    raise exception using errcode='22023',message='inventory_executor_identity_required';
  end if;
  if jsonb_typeof(v_args)<>'object' then
    raise exception using errcode='22023',message='inventory_executor_args_must_be_object';
  end if;
  if v_action='batch' then
    if jsonb_typeof(v_args->'deltas')<>'array'
       or jsonb_array_length(v_args->'deltas')<1
       or jsonb_array_length(v_args->'deltas')>16
    then
      raise exception using errcode='22023',message='inventory_executor_batch_deltas_invalid';
    end if;

    v_batch_character_id:=btrim(coalesce(v_args->>'character_id',''));
    if v_batch_character_id='' then
      raise exception using errcode='22023',message='inventory_executor_character_id_required';
    end if;

    for v_batch_delta in
      select value from jsonb_array_elements(v_args->'deltas')
    loop
      if jsonb_typeof(v_batch_delta)<>'object'
         or v_batch_delta ? 'deltas'
         or lower(btrim(coalesce(v_batch_delta->>'action',''))) not in ('grant','consume','remove')
      then
        raise exception using errcode='22023',message='inventory_executor_batch_delta_invalid';
      end if;

      if btrim(coalesce(v_batch_delta->>'character_id',''))='' then
        v_batch_delta:=v_batch_delta || jsonb_build_object(
          'character_id',v_batch_character_id
        );
      elsif btrim(v_batch_delta->>'character_id')<>v_batch_character_id then
        raise exception using errcode='22023',message='inventory_executor_batch_character_mismatch';
      end if;

      v_batch_result:=public.ai_gm_commit_inventory_delta_v1(
        p_campaign_id,p_actor_user_id,p_source_message_id,v_batch_delta
      );
      v_batch_results:=v_batch_results || jsonb_build_array(v_batch_result);
      v_batch_ids:=v_batch_ids || coalesce(v_batch_result->'resolved_item_ids','[]'::jsonb);
      v_batch_changed:=v_batch_changed
        or coalesce((v_batch_result->>'canonical_state_changed')::boolean,false);
      v_batch_all_replayed:=v_batch_all_replayed
        and coalesce((v_batch_result->>'replayed')::boolean,false);

      if v_batch_first_inventory_result is null then
        v_batch_first_inventory_result:=coalesce(
          v_batch_result->'inventory_result',
          '{}'::jsonb
        );
      end if;
    end loop;

    return jsonb_build_object(
      'action','batch',
      'character_id',v_batch_character_id,
      'delta_results',v_batch_results,
      'inventory_results',v_batch_results,
      'inventory_result',coalesce(v_batch_first_inventory_result,'{}'::jsonb),
      'resolved_item_ids',v_batch_ids,
      'canonical_state_changed',v_batch_changed,
      'replayed',v_batch_all_replayed
    );
  end if;

  if v_action not in ('grant','consume','remove') then
    raise exception using errcode='22023',message='inventory_executor_action_invalid';
  end if;

  begin
    v_character_id:=nullif(btrim(coalesce(v_args->>'character_id','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='inventory_executor_character_id_invalid';
  end;
  if v_character_id is null then
    raise exception using errcode='22023',message='inventory_executor_character_id_required';
  end if;
  if not exists(
    select 1 from public.characters c
    where c.id=v_character_id and c.campaign_id=p_campaign_id
  ) then
    raise exception using errcode='22023',message='inventory_executor_character_unavailable';
  end if;
  if not private.is_campaign_manager(p_campaign_id,p_actor_user_id) then
    raise exception using errcode='42501',message='campaign_manager_required';
  end if;

  perform set_config('request.jwt.claim.sub',p_actor_user_id::text,true);

  if v_action='grant' then
    if jsonb_typeof(v_item)<>'object' then
      raise exception using errcode='22023',message='inventory_executor_item_invalid';
    end if;
    v_quantity:=coalesce(
      nullif(v_item->>'quantity','')::integer,
      nullif(v_args->>'quantity','')::integer,1
    );
    if v_quantity<1 or v_quantity>100000 then
      raise exception using errcode='22023',message='inventory_executor_quantity_invalid';
    end if;

    v_resolution:=public.ai_gm_resolve_item_definition_v1(
      p_campaign_id,p_actor_user_id,v_item || jsonb_build_object('allow_create',true)
    );
    if v_resolution->>'state'<>'resolved' then
      raise exception using errcode='22023',message='inventory_executor_definition_not_resolved';
    end if;

    v_definition_id:=(v_resolution->>'definition_id')::uuid;
    v_definition_revision:=(v_resolution->>'definition_revision')::integer;
    select * into v_rev
    from public.reference_definition_revisions r
    where r.definition_id=v_definition_id and r.revision=v_definition_revision;
    if v_rev.definition_id is null then
      raise exception using errcode='22023',message='inventory_executor_definition_revision_missing';
    end if;

    v_stack_mode:=coalesce(v_rev.data->>'stack_mode','instance');
    v_usage_mode:=coalesce(v_rev.data->>'usage_mode','none');
    v_category:=coalesce(v_rev.data->>'category','other');
    v_stack_max:=case when v_category='currency' then 2147483647
      when v_stack_mode='stack'
      then coalesce(nullif(v_rev.data->'inventory_profile'->>'stack_max','')::integer,100000)
      else 1 end;

    if v_category='equipment' and
       private.cheburashka_grant_equipment_slot_v1(v_rev.data,v_item) is null then
      raise exception using errcode='22023',
        message='inventory_equipment_slot_required: Укажите подходящий слот экипировки';
    end if;

    v_semantic_key:=concat_ws(
      '|','stage27',p_campaign_id::text,p_source_message_id::text,'grant',
      v_character_id::text,v_definition_id::text,v_definition_revision::text,v_quantity::text
    );
    v_command_id:=md5(v_semantic_key)::uuid;

    select * into v_receipt
    from private.ai_gm_inventory_delta_receipts_v1 r
    where r.command_id=v_command_id;
    if v_receipt.command_id is not null then
      return v_receipt.result || jsonb_build_object('replayed',true);
    end if;

    v_remaining:=v_quantity;

    if v_stack_mode='stack' then
      for v_existing in
        select * from public.character_inventory_items i
        where i.character_id=v_character_id
          and i.definition_id=v_definition_id
          and i.definition_revision=v_definition_revision
          and i.stack_mode='stack'
          and i.quantity < v_stack_max
        order by i.created_at,i.id
        for update
      loop
        exit when v_remaining<=0;
        if v_existing.placement_kind='root' and v_existing.holder_item_id is null then
          perform private.cheburashka_place_new_character_item_v1(v_character_id,v_existing.id);
          select * into v_existing from public.character_inventory_items where id=v_existing.id;
        end if;
        v_chunk:=least(v_remaining,v_stack_max-v_existing.quantity);
        if v_chunk<=0 then continue; end if;
        v_step:=v_step+1;
        v_subcommand_id:=md5(v_command_id::text||'|update|'||v_step::text)::uuid;
        v_op:=public.update_inventory_item_v2(
          v_character_id,v_existing.id,
          to_jsonb(v_existing) || jsonb_build_object(
            'quantity',v_existing.quantity+v_chunk,
            'weight',case when v_category='currency' then coalesce(v_existing.weight,0.01)
              else v_existing.weight end
          ),
          v_existing.version,v_subcommand_id
        );
        v_results:=v_results || jsonb_build_array(v_op);
        v_ids:=v_ids || jsonb_build_array(coalesce(v_op->>'itemId',v_op->'after'->>'id'));
        v_remaining:=v_remaining-v_chunk;
      end loop;

      while v_remaining>0 loop
        v_chunk:=least(v_remaining,v_stack_max);
        v_step:=v_step+1;
        v_subcommand_id:=md5(v_command_id::text||'|create|'||v_step::text)::uuid;
        v_input:=jsonb_build_object(
          'name',v_rev.name,'quantity',v_chunk,'category',v_category,
          'definition_id',v_definition_id,
          'definition_revision',v_definition_revision,
          'stack_mode','stack','usage_mode',v_usage_mode,
          'weight',case when v_category='currency' then 0.01 else null end,
          'equipment_slot',case when v_category='equipment' then
            private.cheburashka_grant_equipment_slot_v1(v_rev.data,v_item) else null end
        );
        if jsonb_typeof(v_item->'item_state')='object' then
          v_input:=v_input||jsonb_build_object('item_state',v_item->'item_state');
        end if;
        v_op:=public.create_inventory_item_v3(
          v_character_id,v_input,null,v_subcommand_id
        );
        v_results:=v_results || jsonb_build_array(v_op);
        v_ids:=v_ids || jsonb_build_array(coalesce(v_op->>'itemId',v_op->'after'->>'id'));
        v_remaining:=v_remaining-v_chunk;
      end loop;
    else
      while v_remaining>0 loop
        v_step:=v_step+1;
        v_subcommand_id:=md5(v_command_id::text||'|instance|'||v_step::text)::uuid;
        v_input:=jsonb_build_object(
          'name',v_rev.name,'quantity',1,'category',v_category,
          'definition_id',v_definition_id,
          'definition_revision',v_definition_revision,
          'stack_mode','instance','usage_mode',v_usage_mode,
          'equipment_slot',case when v_category='equipment' then
            private.cheburashka_grant_equipment_slot_v1(v_rev.data,v_item) else null end
        );
        if jsonb_typeof(v_item->'item_state')='object' then
          v_input:=v_input||jsonb_build_object('item_state',v_item->'item_state');
        end if;
        v_op:=public.create_inventory_item_v3(
          v_character_id,v_input,null,v_subcommand_id
        );
        v_results:=v_results || jsonb_build_array(v_op);
        v_ids:=v_ids || jsonb_build_array(coalesce(v_op->>'itemId',v_op->'after'->>'id'));
        v_remaining:=v_remaining-1;
      end loop;
    end if;

    v_result:=jsonb_build_object(
      'action','grant','character_id',v_character_id,'quantity',v_quantity,
      'definition',v_resolution,'definition_id',v_definition_id,
      'definition_revision',v_definition_revision,'command_id',v_command_id,
      'inventory_results',v_results,
      'inventory_result',coalesce(v_results->0,'{}'::jsonb),
      'resolved_item_ids',v_ids,'canonical_state_changed',true,'replayed',false
    );

    insert into private.ai_gm_inventory_delta_receipts_v1(
      command_id,campaign_id,source_message_id,character_id,action,
      definition_id,item_id,quantity,result
    ) values (
      v_command_id,p_campaign_id,p_source_message_id,v_character_id,'grant',
      v_definition_id,null,v_quantity,v_result
    );
    return v_result;
  end if;

  begin
    v_item_id:=nullif(btrim(coalesce(v_args->>'item_id','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='inventory_executor_item_id_invalid';
  end;
  if v_item_id is null then
    raise exception using errcode='22023',message='inventory_executor_item_id_required';
  end if;
  v_item_id:=coalesce(
    (select m.surviving_item_id from private.cheburashka_legacy_coin_merge_v1 m
      where m.old_item_id=v_item_id),
    v_item_id
  );

  if v_action='consume' then
    v_quantity:=coalesce(nullif(v_args->>'quantity','')::integer,1);
    if v_quantity<1 then
      raise exception using errcode='22023',message='inventory_executor_consume_quantity_invalid';
    end if;
  else
    select quantity into v_quantity
    from public.character_inventory_items i
    where i.id=v_item_id and i.character_id=v_character_id;
    if v_quantity is null then
      raise exception using errcode='22023',message='inventory_executor_item_not_found';
    end if;
  end if;

  v_semantic_key:=concat_ws(
    '|','stage27',p_campaign_id::text,p_source_message_id::text,v_action,
    v_character_id::text,v_item_id::text,v_quantity::text
  );
  v_command_id:=md5(v_semantic_key)::uuid;

  select * into v_receipt
  from private.ai_gm_inventory_delta_receipts_v1 r
  where r.command_id=v_command_id;
  if v_receipt.command_id is not null then
    return v_receipt.result || jsonb_build_object('replayed',true);
  end if;

  select * into v_existing
  from public.character_inventory_items i
  where i.id=v_item_id and i.character_id=v_character_id
  for update;
  if v_existing.id is null then
    raise exception using errcode='22023',message='inventory_executor_item_not_found';
  end if;
  if v_quantity>v_existing.quantity then
    raise exception using errcode='22023',message='inventory_executor_consume_quantity_invalid';
  end if;

  v_subcommand_id:=md5(v_command_id::text||'|mutate')::uuid;
  if v_action='remove' or v_quantity=v_existing.quantity then
    v_op:=public.remove_inventory_item_v1(
      v_character_id,v_item_id,v_existing.version,v_subcommand_id
    );
  else
    v_op:=public.update_inventory_item_v2(
      v_character_id,v_item_id,
      to_jsonb(v_existing) || jsonb_build_object(
        'quantity',v_existing.quantity-v_quantity
      ),
      v_existing.version,v_subcommand_id
    );
  end if;

  v_result:=jsonb_build_object(
    'action',v_action,'character_id',v_character_id,'item_id',v_item_id,
    'quantity',v_quantity,'command_id',v_command_id,'inventory_result',v_op,
    'inventory_results',jsonb_build_array(v_op),
    'resolved_item_ids',jsonb_build_array(v_item_id),
    'canonical_state_changed',true,'replayed',false
  );

  insert into private.ai_gm_inventory_delta_receipts_v1(
    command_id,campaign_id,source_message_id,character_id,action,
    definition_id,item_id,quantity,result
  ) values (
    v_command_id,p_campaign_id,p_source_message_id,v_character_id,v_action,
    v_existing.definition_id,v_item_id,v_quantity,v_result
  );

  return v_result;
end;
$function$;


CREATE OR REPLACE FUNCTION public.fail_ai_gm_post_turn_intent_v3(p_intent_id uuid, p_intent_lease_token uuid, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_intent public.ai_gm_post_turn_intent_receipts%rowtype;
  v_next text;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;

  select * into v_intent
  from public.ai_gm_post_turn_intent_receipts
  where id=p_intent_id
  for update;

  if v_intent.id is null then raise exception 'stage18_intent_not_found'; end if;
  if v_intent.state='completed' or v_intent.state='skipped' then
    return to_jsonb(v_intent);
  end if;
  if v_intent.state<>'running' or v_intent.lease_token is distinct from p_intent_lease_token then
    raise exception 'stage18_intent_lease_invalid';
  end if;

  v_next := case when p_error like 'inventory_no_free_slot:%'
    or p_error like 'inventory_no_root_storage:%'
    then 'failed'
    when v_intent.attempts<v_intent.max_attempts then 'pending' else 'failed' end;

  update public.ai_gm_post_turn_intent_receipts
  set state=v_next,
      lease_token=null,
      lease_expires_at=null,
      last_error=left(coalesce(p_error,'stage18_intent_failed'),500),
      updated_at=now()
  where id=p_intent_id
  returning * into v_intent;

  return to_jsonb(v_intent);
end;
$function$;

revoke all on function public.ai_gm_commit_inventory_delta_v1(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.ai_gm_commit_inventory_delta_v1(uuid,uuid,bigint,jsonb) to service_role;
