-- Cheburashka stage 3: explicit stack/instance semantics.

alter table public.character_inventory_items
  add column if not exists stack_mode text;

create or replace function private.cheburashka_inventory_stack_mode_v1(
  p_requested text,
  p_category text,
  p_usage_mode text,
  p_quantity integer
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_requested text := nullif(btrim(coalesce(p_requested, '')), '');
  v_mode text;
  v_forced boolean :=
    coalesce(p_usage_mode, 'none') = 'charges'
    or coalesce(p_category, 'other') in ('equipment', 'container', 'quest');
begin
  if v_requested is not null and v_requested not in ('stack', 'instance') then
    raise exception 'Unsupported inventory stack mode';
  end if;

  v_mode := case
    when v_forced then 'instance'
    else coalesce(v_requested, 'stack')
  end;

  if coalesce(p_quantity, 0) < 1 then
    raise exception 'Inventory quantity must be at least 1';
  end if;

  if v_mode = 'instance' and p_quantity <> 1 then
    raise exception 'Inventory instance quantity must be 1';
  end if;

  return v_mode;
end;
$function$;

revoke execute
on function private.cheburashka_inventory_stack_mode_v1(text, text, text, integer)
from public, anon, authenticated;

with unsafe as (
  select item.*
  from public.character_inventory_items item
  where item.quantity > 1
    and (
      item.usage_mode = 'charges'
      or item.category in ('equipment', 'container', 'quest')
    )
)
insert into public.character_inventory_items(
  character_id,name,quantity,weight,equipped,image_url,description,sort_order,
  category,equipment_slot,mechanics,definition_id,definition_revision,
  usage_mode,charges_current,charges_max,item_state,stack_mode
)
select
  item.character_id,item.name,1,item.weight,false,item.image_url,item.description,
  item.sort_order,item.category,item.equipment_slot,item.mechanics,
  item.definition_id,item.definition_revision,item.usage_mode,
  item.charges_current,item.charges_max,item.item_state,'instance'
from unsafe item
cross join lateral generate_series(2, item.quantity) copy_no;

update public.character_inventory_items item
set
  quantity = case
    when item.usage_mode = 'charges'
      or item.category in ('equipment', 'container', 'quest')
    then 1
    else item.quantity
  end,
  stack_mode = case
    when item.usage_mode = 'charges'
      or item.category in ('equipment', 'container', 'quest')
    then 'instance'
    else 'stack'
  end
where item.stack_mode is null;

alter table public.character_inventory_items
  alter column stack_mode set default 'stack',
  alter column stack_mode set not null;

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_stack_mode_check,
  add constraint character_inventory_items_stack_mode_check
    check (stack_mode in ('stack', 'instance')),
  drop constraint if exists character_inventory_items_instance_quantity_check,
  add constraint character_inventory_items_instance_quantity_check
    check (stack_mode = 'stack' or quantity = 1),
  drop constraint if exists character_inventory_items_forced_instance_check,
  add constraint character_inventory_items_forced_instance_check
    check (
      stack_mode = 'instance'
      or (
        usage_mode <> 'charges'
        and category not in ('equipment', 'container', 'quest')
      )
    );

create or replace function private.cheburashka_enforce_inventory_stack_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.stack_mode := private.cheburashka_inventory_stack_mode_v1(
    new.stack_mode,
    new.category,
    new.usage_mode,
    new.quantity
  );
  return new;
end;
$function$;

revoke execute
on function private.cheburashka_enforce_inventory_stack_v1()
from public, anon, authenticated;

drop trigger if exists character_inventory_items_enforce_stack
on public.character_inventory_items;

create trigger character_inventory_items_enforce_stack
before insert or update of quantity, category, usage_mode, stack_mode
on public.character_inventory_items
for each row
execute function private.cheburashka_enforce_inventory_stack_v1();

create or replace function public.create_inventory_item_v1(
  p_character_id uuid,
  p_input jsonb,
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
  v_name text;
  v_quantity integer;
  v_weight numeric;
  v_category text;
  v_equipped boolean;
  v_slot text;
  v_image_url text;
  v_description text;
  v_definition_id uuid;
  v_definition_revision integer;
  v_mechanics jsonb;
  v_usage_mode text;
  v_charges_current integer;
  v_charges_max integer;
  v_item_state jsonb;
  v_stack_mode text;
  v_after jsonb;
  v_item_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'Inventory input must be an object';
  end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM can create inventory items';
  end if;

  select character.campaign_id
  into v_campaign_id
  from public.characters character
  where character.id = p_character_id;

  if v_campaign_id is null then raise exception 'Character not found'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text, 0)
  );

  select *
  into v_existing
  from public.engine_command_receipts receipt
  where receipt.command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.create'
       or (v_existing.result->'affectedCharacterIds'->>0)::uuid <> p_character_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  v_name := btrim(coalesce(p_input->>'name', ''));
  v_quantity := coalesce(nullif(p_input->>'quantity', '')::integer, 1);
  v_weight := nullif(p_input->>'weight', '')::numeric;
  v_category := coalesce(nullif(btrim(p_input->>'category'), ''), 'other');
  v_equipped := case
    when v_category = 'equipment' then coalesce((p_input->>'equipped')::boolean, false)
    else false
  end;
  v_slot := case
    when v_category = 'equipment' then nullif(btrim(p_input->>'equipment_slot'), '')
    else null
  end;
  v_image_url := nullif(btrim(p_input->>'image_url'), '');
  v_description := coalesce(p_input->>'description', '');
  v_definition_id := nullif(p_input->>'definition_id', '')::uuid;
  v_definition_revision := nullif(p_input->>'definition_revision', '')::integer;
  v_mechanics := coalesce(p_input->'mechanics', '[]'::jsonb);
  v_usage_mode := coalesce(
    nullif(btrim(p_input->>'usage_mode'), ''),
    case when v_category = 'consumable' then 'quantity' else 'none' end
  );
  v_item_state := coalesce(p_input->'item_state', '{}'::jsonb);

  if v_name = '' then raise exception 'Item name is required'; end if;
  if v_quantity < 1 then raise exception 'Inventory quantity must be at least 1'; end if;
  if v_weight is not null and v_weight < 0 then raise exception 'Inventory weight cannot be negative'; end if;
  if v_category not in (
    'equipment','consumable','tool','book','trinket',
    'quest','material','currency','container','other'
  ) then raise exception 'Unsupported inventory category'; end if;
  if v_slot is not null and v_slot not in (
    'main_hand','off_hand','two_hands','head','neck','shoulders',
    'chest','hands','wrists','waist','legs','feet','back',
    'ring_left','ring_right','ammo','other'
  ) then raise exception 'Unsupported equipment slot'; end if;
  if v_equipped and v_slot is null then raise exception 'Equipment slot is required'; end if;
  if jsonb_typeof(v_mechanics) <> 'array' then raise exception 'Inventory mechanics must be an array'; end if;
  if jsonb_typeof(v_item_state) <> 'object' then raise exception 'Inventory item state must be an object'; end if;
  if v_usage_mode not in ('none','quantity','charges') then raise exception 'Unsupported inventory usage mode'; end if;

  if v_usage_mode = 'charges' then
    v_charges_max := greatest(
      1,
      coalesce(nullif(p_input->>'charges_max', '')::integer, 1)
    );
    v_charges_current := greatest(
      0,
      least(
        v_charges_max,
        coalesce(
          nullif(p_input->>'charges_current', '')::integer,
          v_charges_max
        )
      )
    );
  else
    v_charges_max := null;
    v_charges_current := null;
  end if;

  v_stack_mode := private.cheburashka_inventory_stack_mode_v1(
    p_input->>'stack_mode',
    v_category,
    v_usage_mode,
    v_quantity
  );

  perform private.cheburashka_assert_inventory_definition_v1(
    p_character_id,
    v_definition_id,
    v_definition_revision
  );

  insert into public.character_inventory_items(
    character_id,name,quantity,weight,equipped,category,equipment_slot,
    image_url,description,definition_id,definition_revision,mechanics,
    usage_mode,charges_current,charges_max,item_state,stack_mode
  )
  values (
    p_character_id,v_name,v_quantity,v_weight,v_equipped,v_category,v_slot,
    v_image_url,v_description,v_definition_id,v_definition_revision,v_mechanics,
    v_usage_mode,v_charges_current,v_charges_max,v_item_state,v_stack_mode
  )
  returning id, to_jsonb(character_inventory_items)
  into v_item_id, v_after;

  v_result := jsonb_build_object(
    'itemId',v_item_id,
    'affectedCharacterIds',jsonb_build_array(p_character_id),
    'before',null,
    'after',v_after
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  )
  values (
    p_command_id,v_campaign_id,'cheburashka','inventory.create',
    v_item_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;

revoke all
on function public.create_inventory_item_v1(uuid, jsonb, uuid)
from public, anon;

grant execute
on function public.create_inventory_item_v1(uuid, jsonb, uuid)
to authenticated;

create or replace function public.update_inventory_item_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_input jsonb,
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
  v_current_version bigint;
  v_name text;
  v_quantity integer;
  v_weight numeric;
  v_category text;
  v_equipped boolean;
  v_slot text;
  v_image_url text;
  v_description text;
  v_definition_id uuid;
  v_definition_revision integer;
  v_mechanics jsonb;
  v_usage_mode text;
  v_charges_current integer;
  v_charges_max integer;
  v_item_state jsonb;
  v_stack_mode text;
  v_after jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'Expected inventory version is required';
  end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'Inventory input must be an object';
  end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM can update inventory items';
  end if;

  select character.campaign_id
  into v_campaign_id
  from public.characters character
  where character.id = p_character_id;

  if v_campaign_id is null then raise exception 'Character not found'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text, 0)
  );

  select *
  into v_existing
  from public.engine_command_receipts receipt
  where receipt.command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.update'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select to_jsonb(item), item.version
  into v_before, v_current_version
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id
  for update;

  if v_before is null then
    raise exception 'Inventory item not found for this character';
  end if;
  if v_current_version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',
      p_expected_version, v_current_version;
  end if;

  v_name := btrim(coalesce(p_input->>'name', ''));
  v_quantity := coalesce(nullif(p_input->>'quantity', '')::integer, 1);
  v_weight := nullif(p_input->>'weight', '')::numeric;
  v_category := coalesce(nullif(btrim(p_input->>'category'), ''), 'other');
  v_equipped := case
    when v_category = 'equipment' then coalesce((p_input->>'equipped')::boolean, false)
    else false
  end;
  v_slot := case
    when v_category = 'equipment' then nullif(btrim(p_input->>'equipment_slot'), '')
    else null
  end;
  v_image_url := nullif(btrim(p_input->>'image_url'), '');
  v_description := coalesce(p_input->>'description', '');
  v_definition_id := nullif(p_input->>'definition_id', '')::uuid;
  v_definition_revision := nullif(p_input->>'definition_revision', '')::integer;
  v_mechanics := coalesce(p_input->'mechanics', '[]'::jsonb);
  v_usage_mode := coalesce(
    nullif(btrim(p_input->>'usage_mode'), ''),
    case when v_category = 'consumable' then 'quantity' else 'none' end
  );
  v_item_state := coalesce(p_input->'item_state', '{}'::jsonb);

  if v_name = '' then raise exception 'Item name is required'; end if;
  if v_quantity < 1 then raise exception 'Inventory quantity must be at least 1'; end if;
  if v_weight is not null and v_weight < 0 then raise exception 'Inventory weight cannot be negative'; end if;
  if v_category not in (
    'equipment','consumable','tool','book','trinket',
    'quest','material','currency','container','other'
  ) then raise exception 'Unsupported inventory category'; end if;
  if v_slot is not null and v_slot not in (
    'main_hand','off_hand','two_hands','head','neck','shoulders',
    'chest','hands','wrists','waist','legs','feet','back',
    'ring_left','ring_right','ammo','other'
  ) then raise exception 'Unsupported equipment slot'; end if;
  if v_equipped and v_slot is null then raise exception 'Equipment slot is required'; end if;
  if jsonb_typeof(v_mechanics) <> 'array' then raise exception 'Inventory mechanics must be an array'; end if;
  if jsonb_typeof(v_item_state) <> 'object' then raise exception 'Inventory item state must be an object'; end if;
  if v_usage_mode not in ('none','quantity','charges') then raise exception 'Unsupported inventory usage mode'; end if;

  if v_usage_mode = 'charges' then
    v_charges_max := greatest(
      1,
      coalesce(nullif(p_input->>'charges_max', '')::integer, 1)
    );
    v_charges_current := greatest(
      0,
      least(
        v_charges_max,
        coalesce(
          nullif(p_input->>'charges_current', '')::integer,
          v_charges_max
        )
      )
    );
  else
    v_charges_max := null;
    v_charges_current := null;
  end if;

  v_stack_mode := private.cheburashka_inventory_stack_mode_v1(
    coalesce(p_input->>'stack_mode', v_before->>'stack_mode'),
    v_category,
    v_usage_mode,
    v_quantity
  );

  perform private.cheburashka_assert_inventory_definition_v1(
    p_character_id,
    v_definition_id,
    v_definition_revision
  );

  update public.character_inventory_items item
  set
    name=v_name,
    quantity=v_quantity,
    weight=v_weight,
    equipped=v_equipped,
    category=v_category,
    equipment_slot=v_slot,
    image_url=v_image_url,
    description=v_description,
    definition_id=v_definition_id,
    definition_revision=v_definition_revision,
    mechanics=v_mechanics,
    usage_mode=v_usage_mode,
    charges_current=v_charges_current,
    charges_max=v_charges_max,
    item_state=v_item_state,
    stack_mode=v_stack_mode
  where item.id=p_item_id
    and item.character_id=p_character_id
  returning to_jsonb(item)
  into v_after;

  v_result := jsonb_build_object(
    'itemId',p_item_id,
    'affectedCharacterIds',jsonb_build_array(p_character_id),
    'before',v_before,
    'after',v_after
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  )
  values (
    p_command_id,v_campaign_id,'cheburashka','inventory.update',
    p_item_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;

revoke all
on function public.update_inventory_item_v1(uuid, uuid, jsonb, bigint, uuid)
from public, anon;

grant execute
on function public.update_inventory_item_v1(uuid, uuid, jsonb, bigint, uuid)
to authenticated;

create or replace function public.transfer_inventory_item_v2(
  p_from_character_id uuid,
  p_to_character_id uuid,
  p_item_id uuid,
  p_amount integer,
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
  v_target_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_after jsonb := 'null'::jsonb;
  v_destination jsonb;
  v_quantity integer;
  v_stack_mode text;
  v_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'Expected inventory version is required';
  end if;
  if p_from_character_id = p_to_character_id then
    raise exception 'Characters must be different';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    raise exception 'Inventory amount must be between 1 and 10000';
  end if;
  if not private.can_manage_character(p_from_character_id, auth.uid())
     or not private.can_manage_character(p_to_character_id, auth.uid()) then
    raise exception 'Only GM can transfer inventory between characters';
  end if;

  select campaign_id
  into v_campaign_id
  from public.characters
  where id=p_from_character_id;

  select campaign_id
  into v_target_campaign_id
  from public.characters
  where id=p_to_character_id;

  if v_campaign_id is null
     or v_target_campaign_id is null
     or v_campaign_id <> v_target_campaign_id then
    raise exception 'Characters must belong to the same campaign';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text,0)
  );

  select *
  into v_existing
  from public.engine_command_receipts
  where command_id=p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.transfer'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select to_jsonb(item), item.quantity, item.stack_mode, item.version
  into v_before, v_quantity, v_stack_mode, v_version
  from public.character_inventory_items item
  where item.id=p_item_id
    and item.character_id=p_from_character_id
  for update;

  if v_before is null then
    raise exception 'Inventory item not found for source character';
  end if;
  if v_version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',
      p_expected_version,v_version;
  end if;
  if v_quantity < p_amount then raise exception 'Not enough item quantity'; end if;
  if v_stack_mode = 'instance' and p_amount <> v_quantity then
    raise exception 'Inventory instance cannot be split';
  end if;

  if v_quantity = p_amount then
    update public.character_inventory_items item
    set
      character_id=p_to_character_id,
      equipped=false
    where item.id=p_item_id
    returning to_jsonb(item)
    into v_destination;
  else
    update public.character_inventory_items item
    set quantity=item.quantity-p_amount
    where item.id=p_item_id
    returning to_jsonb(item)
    into v_after;

    insert into public.character_inventory_items(
      character_id,name,quantity,weight,equipped,image_url,description,sort_order,
      category,equipment_slot,mechanics,definition_id,definition_revision,
      usage_mode,charges_current,charges_max,item_state,stack_mode
    )
    select
      p_to_character_id,item.name,p_amount,item.weight,false,item.image_url,
      item.description,item.sort_order,item.category,item.equipment_slot,
      item.mechanics,item.definition_id,item.definition_revision,item.usage_mode,
      item.charges_current,item.charges_max,item.item_state,item.stack_mode
    from public.character_inventory_items item
    where item.id=p_item_id
    returning to_jsonb(character_inventory_items)
    into v_destination;
  end if;

  v_result := jsonb_build_object(
    'itemId',p_item_id,
    'affectedCharacterIds',
      jsonb_build_array(p_from_character_id,p_to_character_id),
    'before',v_before,
    'after',v_after,
    'destinationItem',v_destination
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  )
  values (
    p_command_id,v_campaign_id,'cheburashka','inventory.transfer',
    p_item_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;

revoke all
on function public.transfer_inventory_item_v2(uuid, uuid, uuid, integer, bigint, uuid)
from public, anon;

grant execute
on function public.transfer_inventory_item_v2(uuid, uuid, uuid, integer, bigint, uuid)
to authenticated;
