-- Cheburashka stage 1: canonical inventory integrity and mutation RPCs.

-- 1) Normalize legacy category/slot vocabulary without losing the old labels.
with base as (
  select
    id,
    category as legacy_category,
    equipment_slot as legacy_slot,
    equipped as legacy_equipped,
    case category
      when 'armor' then 'equipment'
      when 'weapon' then 'equipment'
      when 'focus' then 'equipment'
      when 'artifact' then 'trinket'
      when 'gear' then 'other'
      when 'misc' then 'other'
      when 'equipment' then 'equipment'
      when 'consumable' then 'consumable'
      when 'tool' then 'tool'
      when 'book' then 'book'
      when 'trinket' then 'trinket'
      when 'quest' then 'quest'
      when 'material' then 'material'
      when 'currency' then 'currency'
      when 'container' then 'container'
      when 'other' then 'other'
      else 'other'
    end as normalized_category,
    case
      when equipment_slot = 'body' then 'chest'
      else equipment_slot
    end as normalized_slot
  from public.character_inventory_items
),
normalized as (
  select
    id,
    legacy_category,
    legacy_slot,
    legacy_equipped,
    normalized_category,
    case
      when normalized_category <> 'equipment' then null
      when normalized_slot in (
        'main_hand','off_hand','two_hands','head','neck','shoulders',
        'chest','hands','wrists','waist','legs','feet','back',
        'ring_left','ring_right','ammo','other'
      ) then normalized_slot
      when legacy_equipped then 'other'
      else null
    end as final_slot,
    case when normalized_category = 'equipment' then legacy_equipped else false end as final_equipped
  from base
)
update public.character_inventory_items item
set
  category = n.normalized_category,
  equipment_slot = n.final_slot,
  equipped = n.final_equipped,
  item_state = coalesce(item.item_state, '{}'::jsonb)
    || case
         when n.legacy_category is distinct from n.normalized_category
           then jsonb_build_object('legacy_category', n.legacy_category)
         else '{}'::jsonb
       end
    || case
         when n.legacy_slot is distinct from n.final_slot and n.legacy_slot is not null
           then jsonb_build_object('legacy_equipment_slot', n.legacy_slot)
         else '{}'::jsonb
       end
from normalized n
where item.id = n.id
  and (
    item.category is distinct from n.normalized_category
    or item.equipment_slot is distinct from n.final_slot
    or item.equipped is distinct from n.final_equipped
  );

-- A fixed slot can contain only one equipped instance. Keep the newest legacy
-- row equipped and mark the automatically displaced rows for auditability.
with ranked as (
  select
    id,
    row_number() over (
      partition by character_id, equipment_slot
      order by updated_at desc, created_at desc, id
    ) as position
  from public.character_inventory_items
  where equipped = true
    and equipment_slot is not null
    and equipment_slot <> 'other'
)
update public.character_inventory_items item
set
  equipped = false,
  item_state = coalesce(item.item_state, '{}'::jsonb)
    || jsonb_build_object('stage1_auto_unequipped_conflict', true)
from ranked
where item.id = ranked.id
  and ranked.position > 1;

-- 2) Tighten row invariants.
alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_quantity_check;

alter table public.character_inventory_items
  add constraint character_inventory_items_quantity_check
  check (quantity >= 1);

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_weight_check;

alter table public.character_inventory_items
  add constraint character_inventory_items_weight_check
  check (weight is null or weight >= 0);

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_category_check;

alter table public.character_inventory_items
  add constraint character_inventory_items_category_check
  check (category in (
    'equipment','consumable','tool','book','trinket',
    'quest','material','currency','container','other'
  ));

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_equipment_slot_check;

alter table public.character_inventory_items
  add constraint character_inventory_items_equipment_slot_check
  check (
    equipment_slot is null
    or equipment_slot in (
      'main_hand','off_hand','two_hands','head','neck','shoulders',
      'chest','hands','wrists','waist','legs','feet','back',
      'ring_left','ring_right','ammo','other'
    )
  );

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_equipment_state_check;

alter table public.character_inventory_items
  add constraint character_inventory_items_equipment_state_check
  check (
    (
      category = 'equipment'
      and (equipped = false or equipment_slot is not null)
    )
    or (
      category <> 'equipment'
      and equipped = false
      and equipment_slot is null
    )
  );

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_definition_pair_check;

alter table public.character_inventory_items
  add constraint character_inventory_items_definition_pair_check
  check (
    (definition_id is null and definition_revision is null)
    or (definition_id is not null and definition_revision is not null)
  );

create unique index if not exists character_inventory_items_equipped_slot_unique
  on public.character_inventory_items(character_id, equipment_slot)
  where equipped = true
    and equipment_slot is not null
    and equipment_slot <> 'other';

-- 3) Definition references must always point to an item definition that is
-- valid for the holder's campaign. This also protects compatibility writes.
create or replace function private.cheburashka_assert_inventory_definition_v1(
  p_character_id uuid,
  p_definition_id uuid,
  p_definition_revision integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_campaign_id uuid;
  v_kind text;
  v_scope text;
  v_definition_campaign_id uuid;
begin
  if (p_definition_id is null) <> (p_definition_revision is null) then
    raise exception 'Inventory definition id and revision must be provided together';
  end if;

  if p_definition_id is null then
    return;
  end if;

  select character.campaign_id
  into v_character_campaign_id
  from public.characters character
  where character.id = p_character_id;

  if v_character_campaign_id is null then
    raise exception 'Character not found';
  end if;

  select definition.kind, definition.scope, definition.campaign_id
  into v_kind, v_scope, v_definition_campaign_id
  from public.reference_definitions definition
  where definition.id = p_definition_id;

  if not found then
    raise exception 'Inventory definition not found';
  end if;

  if v_kind <> 'item' then
    raise exception 'Inventory instances can only reference item definitions';
  end if;

  if v_scope = 'campaign' and v_definition_campaign_id is distinct from v_character_campaign_id then
    raise exception 'Inventory definition belongs to another campaign';
  end if;

  if not exists (
    select 1
    from public.reference_definition_revisions revision
    where revision.definition_id = p_definition_id
      and revision.revision = p_definition_revision
  ) then
    raise exception 'Inventory definition revision not found';
  end if;
end;
$$;

create or replace function private.cheburashka_validate_inventory_definition_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cheburashka_assert_inventory_definition_v1(
    new.character_id,
    new.definition_id,
    new.definition_revision
  );
  return new;
end;
$$;

drop trigger if exists character_inventory_items_validate_definition
  on public.character_inventory_items;

create trigger character_inventory_items_validate_definition
before insert or update of character_id, definition_id, definition_revision
on public.character_inventory_items
for each row
execute function private.cheburashka_validate_inventory_definition_v1();

revoke all on function private.cheburashka_assert_inventory_definition_v1(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function private.cheburashka_validate_inventory_definition_v1()
  from public, anon, authenticated;

-- 4) Idempotent GM create.
create or replace function public.create_inventory_item_v1(
  p_character_id uuid,
  p_input jsonb,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  v_after jsonb;
  v_item_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_command_id is null then
    raise exception 'Command id is required';
  end if;
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

  if v_campaign_id is null then
    raise exception 'Character not found';
  end if;

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

  if v_name = '' then
    raise exception 'Item name is required';
  end if;
  if v_quantity < 1 then
    raise exception 'Inventory quantity must be at least 1';
  end if;
  if v_weight is not null and v_weight < 0 then
    raise exception 'Inventory weight cannot be negative';
  end if;
  if v_category not in (
    'equipment','consumable','tool','book','trinket',
    'quest','material','currency','container','other'
  ) then
    raise exception 'Unsupported inventory category';
  end if;
  if v_slot is not null and v_slot not in (
    'main_hand','off_hand','two_hands','head','neck','shoulders',
    'chest','hands','wrists','waist','legs','feet','back',
    'ring_left','ring_right','ammo','other'
  ) then
    raise exception 'Unsupported equipment slot';
  end if;
  if v_equipped and v_slot is null then
    raise exception 'Equipment slot is required';
  end if;
  if jsonb_typeof(v_mechanics) <> 'array' then
    raise exception 'Inventory mechanics must be an array';
  end if;
  if jsonb_typeof(v_item_state) <> 'object' then
    raise exception 'Inventory item state must be an object';
  end if;
  if v_usage_mode not in ('none','quantity','charges') then
    raise exception 'Unsupported inventory usage mode';
  end if;

  if v_usage_mode = 'charges' then
    v_charges_max := greatest(1, coalesce(nullif(p_input->>'charges_max', '')::integer, 1));
    v_charges_current := greatest(
      0,
      least(
        v_charges_max,
        coalesce(nullif(p_input->>'charges_current', '')::integer, v_charges_max)
      )
    );
  else
    v_charges_max := null;
    v_charges_current := null;
  end if;

  perform private.cheburashka_assert_inventory_definition_v1(
    p_character_id,
    v_definition_id,
    v_definition_revision
  );

  insert into public.character_inventory_items(
    character_id,
    name,
    quantity,
    weight,
    equipped,
    category,
    equipment_slot,
    image_url,
    description,
    definition_id,
    definition_revision,
    mechanics,
    usage_mode,
    charges_current,
    charges_max,
    item_state
  )
  values (
    p_character_id,
    v_name,
    v_quantity,
    v_weight,
    v_equipped,
    v_category,
    v_slot,
    v_image_url,
    v_description,
    v_definition_id,
    v_definition_revision,
    v_mechanics,
    v_usage_mode,
    v_charges_current,
    v_charges_max,
    v_item_state
  )
  returning id, to_jsonb(character_inventory_items)
  into v_item_id, v_after;

  v_result := jsonb_build_object(
    'itemId', v_item_id,
    'affectedCharacterIds', jsonb_build_array(p_character_id),
    'before', null,
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
    'inventory.create',
    v_item_id,
    v_result,
    auth.uid()
  );

  return v_result;
end;
$$;

-- 5) Idempotent, optimistic GM update.
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
as $$
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
  v_after jsonb;
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

  if v_campaign_id is null then
    raise exception 'Character not found';
  end if;

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

  if v_name = '' then
    raise exception 'Item name is required';
  end if;
  if v_quantity < 1 then
    raise exception 'Inventory quantity must be at least 1';
  end if;
  if v_weight is not null and v_weight < 0 then
    raise exception 'Inventory weight cannot be negative';
  end if;
  if v_category not in (
    'equipment','consumable','tool','book','trinket',
    'quest','material','currency','container','other'
  ) then
    raise exception 'Unsupported inventory category';
  end if;
  if v_slot is not null and v_slot not in (
    'main_hand','off_hand','two_hands','head','neck','shoulders',
    'chest','hands','wrists','waist','legs','feet','back',
    'ring_left','ring_right','ammo','other'
  ) then
    raise exception 'Unsupported equipment slot';
  end if;
  if v_equipped and v_slot is null then
    raise exception 'Equipment slot is required';
  end if;
  if jsonb_typeof(v_mechanics) <> 'array' then
    raise exception 'Inventory mechanics must be an array';
  end if;
  if jsonb_typeof(v_item_state) <> 'object' then
    raise exception 'Inventory item state must be an object';
  end if;
  if v_usage_mode not in ('none','quantity','charges') then
    raise exception 'Unsupported inventory usage mode';
  end if;

  if v_usage_mode = 'charges' then
    v_charges_max := greatest(1, coalesce(nullif(p_input->>'charges_max', '')::integer, 1));
    v_charges_current := greatest(
      0,
      least(
        v_charges_max,
        coalesce(nullif(p_input->>'charges_current', '')::integer, v_charges_max)
      )
    );
  else
    v_charges_max := null;
    v_charges_current := null;
  end if;

  perform private.cheburashka_assert_inventory_definition_v1(
    p_character_id,
    v_definition_id,
    v_definition_revision
  );

  update public.character_inventory_items item
  set
    name = v_name,
    quantity = v_quantity,
    weight = v_weight,
    equipped = v_equipped,
    category = v_category,
    equipment_slot = v_slot,
    image_url = v_image_url,
    description = v_description,
    definition_id = v_definition_id,
    definition_revision = v_definition_revision,
    mechanics = v_mechanics,
    usage_mode = v_usage_mode,
    charges_current = v_charges_current,
    charges_max = v_charges_max,
    item_state = v_item_state
  where item.id = p_item_id
    and item.character_id = p_character_id
  returning to_jsonb(item)
  into v_after;

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
    'inventory.update',
    p_item_id,
    v_result,
    auth.uid()
  );

  return v_result;
end;
$$;

-- 6) Idempotent, optimistic GM remove.
create or replace function public.remove_inventory_item_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_current_version bigint;
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
  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM can remove inventory items';
  end if;

  select character.campaign_id
  into v_campaign_id
  from public.characters character
  where character.id = p_character_id;

  if v_campaign_id is null then
    raise exception 'Character not found';
  end if;

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
       or v_existing.command_kind <> 'inventory.remove'
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

  delete from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id;

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(p_character_id),
    'before', v_before,
    'after', null
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
    'inventory.remove',
    p_item_id,
    v_result,
    auth.uid()
  );

  return v_result;
end;
$$;

-- 7) Idempotent, optimistic equip/unequip. The result includes every
-- automatically displaced instance so the engine event is complete.
create or replace function public.set_inventory_item_equipped_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_equipped boolean,
  p_equipment_slot text,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_category text;
  v_current_slot text;
  v_slot text;
  v_current_version bigint;
  v_related_changes jsonb := '[]'::jsonb;
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
  if not (
    private.can_manage_character(p_character_id, auth.uid())
    or private.is_assigned_character(p_character_id, auth.uid())
  ) then
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
    pg_catalog.hashtextextended(p_command_id::text, 0)
  );

  select *
  into v_existing
  from public.engine_command_receipts receipt
  where receipt.command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.set_equipped'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select
    to_jsonb(item),
    item.category,
    item.equipment_slot,
    item.version
  into
    v_before,
    v_category,
    v_current_slot,
    v_current_version
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

  v_slot := coalesce(nullif(btrim(p_equipment_slot), ''), v_current_slot);

  if p_equipped and v_category <> 'equipment' then
    raise exception 'Only equipment items can be equipped';
  end if;
  if p_equipped and v_slot is null then
    raise exception 'Equipment slot is required';
  end if;
  if p_equipped and v_slot not in (
    'main_hand','off_hand','two_hands','head','neck','shoulders',
    'chest','hands','wrists','waist','legs','feet','back',
    'ring_left','ring_right','ammo','other'
  ) then
    raise exception 'Unsupported equipment slot';
  end if;

  if p_equipped then
    with conflicts as (
      select
        item.id,
        to_jsonb(item) as before_row
      from public.character_inventory_items item
      where item.character_id = p_character_id
        and item.id <> p_item_id
        and item.equipped = true
        and (
          item.equipment_slot = v_slot
          or (
            v_slot = 'two_hands'
            and item.equipment_slot in ('main_hand','off_hand')
          )
          or (
            v_slot in ('main_hand','off_hand')
            and item.equipment_slot = 'two_hands'
          )
        )
      for update
    ),
    updated as (
      update public.character_inventory_items item
      set equipped = false
      from conflicts conflict
      where item.id = conflict.id
      returning jsonb_build_object(
        'before', conflict.before_row,
        'after', to_jsonb(item)
      ) as change
    )
    select coalesce(jsonb_agg(change), '[]'::jsonb)
    into v_related_changes
    from updated;
  end if;

  update public.character_inventory_items item
  set
    equipped = p_equipped,
    equipment_slot = case when p_equipped then v_slot else item.equipment_slot end
  where item.id = p_item_id
    and item.character_id = p_character_id
  returning to_jsonb(item)
  into v_after;

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(p_character_id),
    'before', v_before,
    'after', v_after,
    'relatedChanges', v_related_changes
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
    'inventory.set_equipped',
    p_item_id,
    v_result,
    auth.uid()
  );

  return v_result;
end;
$$;

-- Backward-compatible wrapper for the currently deployed UI. New code uses
-- set_inventory_item_equipped_v1 with explicit holder/version/command id.
create or replace function public.set_character_inventory_equipped(
  p_item_id uuid,
  p_equipped boolean,
  p_equipment_slot text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_id uuid;
  v_version bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select item.character_id, item.version
  into v_character_id, v_version
  from public.character_inventory_items item
  where item.id = p_item_id;

  if v_character_id is null then
    raise exception 'Inventory item not found';
  end if;

  perform public.set_inventory_item_equipped_v1(
    v_character_id,
    p_item_id,
    p_equipped,
    p_equipment_slot,
    v_version,
    gen_random_uuid()
  );
end;
$$;

-- 8) Preserve Chasovoy provenance when a stack is split during transfer.
create or replace function public.transfer_inventory_item_v1(
  p_from_character_id uuid,
  p_to_character_id uuid,
  p_item_id uuid,
  p_amount integer default 1,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_target_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_after jsonb := 'null'::jsonb;
  v_destination jsonb;
  v_quantity integer;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_command_id is null then
    raise exception 'Command id is required';
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

  select campaign_id into v_campaign_id
  from public.characters
  where id = p_from_character_id;

  select campaign_id into v_target_campaign_id
  from public.characters
  where id = p_to_character_id;

  if v_campaign_id is null
     or v_target_campaign_id is null
     or v_campaign_id <> v_target_campaign_id then
    raise exception 'Characters must belong to the same campaign';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text, 0)
  );

  select *
  into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.transfer'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select to_jsonb(item), item.quantity
  into v_before, v_quantity
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_from_character_id
  for update;

  if v_before is null then
    raise exception 'Inventory item not found for source character';
  end if;
  if v_quantity < p_amount then
    raise exception 'Not enough item quantity';
  end if;

  if v_quantity = p_amount then
    update public.character_inventory_items item
    set
      character_id = p_to_character_id,
      equipped = false
    where item.id = p_item_id
    returning to_jsonb(item)
    into v_destination;
  else
    update public.character_inventory_items item
    set quantity = item.quantity - p_amount
    where item.id = p_item_id
    returning to_jsonb(item)
    into v_after;

    insert into public.character_inventory_items(
      character_id,
      name,
      quantity,
      weight,
      equipped,
      image_url,
      description,
      sort_order,
      category,
      equipment_slot,
      mechanics,
      definition_id,
      definition_revision,
      usage_mode,
      charges_current,
      charges_max,
      item_state
    )
    select
      p_to_character_id,
      item.name,
      p_amount,
      item.weight,
      false,
      item.image_url,
      item.description,
      item.sort_order,
      item.category,
      item.equipment_slot,
      item.mechanics,
      item.definition_id,
      item.definition_revision,
      item.usage_mode,
      item.charges_current,
      item.charges_max,
      item.item_state
    from public.character_inventory_items item
    where item.id = p_item_id
    returning to_jsonb(character_inventory_items)
    into v_destination;
  end if;

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(
      p_from_character_id,
      p_to_character_id
    ),
    'before', v_before,
    'after', v_after,
    'destinationItem', v_destination
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
    'inventory.transfer',
    p_item_id,
    v_result,
    auth.uid()
  );

  return v_result;
end;
$$;

-- New SECURITY DEFINER RPCs are authenticated APIs, not anonymous endpoints.
revoke all on function public.create_inventory_item_v1(uuid, jsonb, uuid)
  from public, anon;
grant execute on function public.create_inventory_item_v1(uuid, jsonb, uuid)
  to authenticated;

revoke all on function public.update_inventory_item_v1(uuid, uuid, jsonb, bigint, uuid)
  from public, anon;
grant execute on function public.update_inventory_item_v1(uuid, uuid, jsonb, bigint, uuid)
  to authenticated;

revoke all on function public.remove_inventory_item_v1(uuid, uuid, bigint, uuid)
  from public, anon;
grant execute on function public.remove_inventory_item_v1(uuid, uuid, bigint, uuid)
  to authenticated;

revoke all on function public.set_inventory_item_equipped_v1(uuid, uuid, boolean, text, bigint, uuid)
  from public, anon;
grant execute on function public.set_inventory_item_equipped_v1(uuid, uuid, boolean, text, bigint, uuid)
  to authenticated;

revoke all on function public.set_character_inventory_equipped(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_character_inventory_equipped(uuid, boolean, text)
  to authenticated;

revoke all on function public.transfer_inventory_item_v1(uuid, uuid, uuid, integer, uuid)
  from public, anon;
grant execute on function public.transfer_inventory_item_v1(uuid, uuid, uuid, integer, uuid)
  to authenticated;
