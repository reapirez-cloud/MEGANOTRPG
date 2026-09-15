-- Cheburashka stage 4: real inventory holders / nested containers.

alter table public.character_inventory_items
  add column if not exists holder_item_id uuid;

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_holder_item_id_fkey,
  add constraint character_inventory_items_holder_item_id_fkey
    foreign key (holder_item_id)
    references public.character_inventory_items(id)
    on delete restrict;

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_holder_not_self_check,
  add constraint character_inventory_items_holder_not_self_check
    check (holder_item_id is null or holder_item_id <> id),
  drop constraint if exists character_inventory_items_contained_not_equipped_check,
  add constraint character_inventory_items_contained_not_equipped_check
    check (holder_item_id is null or equipped = false);

create index if not exists character_inventory_items_holder_idx
  on public.character_inventory_items(holder_item_id)
  where holder_item_id is not null;

create index if not exists character_inventory_items_character_holder_sort_idx
  on public.character_inventory_items(character_id, holder_item_id, sort_order, created_at);

create or replace function private.cheburashka_validate_inventory_holder_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_holder_character_id uuid;
  v_holder_category text;
  v_cycle boolean := false;
  v_max_depth integer := 0;
  v_overflow boolean := false;
begin
  if new.category <> 'container'
     and exists (
       select 1
       from public.character_inventory_items child
       where child.holder_item_id = new.id
     ) then
    raise exception 'Inventory holder with contents must remain a container';
  end if;

  if new.holder_item_id is null then
    return new;
  end if;

  select holder.character_id, holder.category
  into v_holder_character_id, v_holder_category
  from public.character_inventory_items holder
  where holder.id = new.holder_item_id;

  if v_holder_character_id is null then
    raise exception 'Inventory holder not found';
  end if;
  if v_holder_character_id <> new.character_id then
    raise exception 'Inventory holder must belong to the same character';
  end if;
  if v_holder_category <> 'container' then
    raise exception 'Inventory holder must be a container';
  end if;

  with recursive chain as (
    select holder.id, holder.holder_item_id, 1 as depth
    from public.character_inventory_items holder
    where holder.id = new.holder_item_id

    union all

    select parent.id, parent.holder_item_id, chain.depth + 1
    from public.character_inventory_items parent
    join chain on parent.id = chain.holder_item_id
    where chain.depth < 17
  )
  select
    coalesce(bool_or(id = new.id), false),
    coalesce(max(depth), 0),
    coalesce(bool_or(depth = 17 and holder_item_id is not null), false)
  into v_cycle, v_max_depth, v_overflow
  from chain;

  if v_cycle then
    raise exception 'Inventory container cycle is not allowed';
  end if;
  if v_overflow or v_max_depth > 16 then
    raise exception 'Inventory container nesting depth exceeds 16';
  end if;

  return new;
end;
$function$;

revoke execute
on function private.cheburashka_validate_inventory_holder_v1()
from public, anon, authenticated;

drop trigger if exists character_inventory_items_validate_holder
on public.character_inventory_items;

create constraint trigger character_inventory_items_validate_holder
after insert or update of holder_item_id, character_id, category
on public.character_inventory_items
deferrable initially deferred
for each row
execute function private.cheburashka_validate_inventory_holder_v1();

create or replace function public.move_inventory_item_v1(
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
  v_current_holder uuid;
  v_version bigint;
  v_holder_character uuid;
  v_holder_category text;
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
    pg_catalog.hashtextextended(p_command_id::text, 0)
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

  select to_jsonb(item), item.holder_item_id, item.version
  into v_before, v_current_holder, v_version
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id
  for update;

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

  if p_holder_item_id is not null then
    select holder.character_id, holder.category
    into v_holder_character, v_holder_category
    from public.character_inventory_items holder
    where holder.id = p_holder_item_id
    for update;

    if v_holder_character is null then
      raise exception 'Inventory holder not found';
    end if;
    if v_holder_character <> p_character_id then
      raise exception 'Inventory holder must belong to the same character';
    end if;
    if v_holder_category <> 'container' then
      raise exception 'Inventory holder must be a container';
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
  end if;

  if v_current_holder is not distinct from p_holder_item_id then
    v_after := v_before;
  else
    update public.character_inventory_items item
    set
      holder_item_id = p_holder_item_id,
      equipped = case
        when p_holder_item_id is null then item.equipped
        else false
      end
    where item.id = p_item_id
      and item.character_id = p_character_id
    returning to_jsonb(item)
    into v_after;
  end if;

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

revoke all
on function public.move_inventory_item_v1(uuid, uuid, uuid, bigint, uuid)
from public, anon;

grant execute
on function public.move_inventory_item_v1(uuid, uuid, uuid, bigint, uuid)
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
  v_category text;
  v_version bigint;
  v_descendants_before jsonb := '[]'::jsonb;
  v_related_changes jsonb := '[]'::jsonb;
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

  select
    to_jsonb(item),
    item.quantity,
    item.stack_mode,
    item.category,
    item.version
  into
    v_before,
    v_quantity,
    v_stack_mode,
    v_category,
    v_version
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_from_character_id
  for update;

  if v_before is null then
    raise exception 'Inventory item not found for source character';
  end if;
  if v_version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',
      p_expected_version, v_version;
  end if;
  if v_quantity < p_amount then
    raise exception 'Not enough item quantity';
  end if;
  if v_stack_mode = 'instance' and p_amount <> v_quantity then
    raise exception 'Inventory instance cannot be split';
  end if;

  if v_quantity = p_amount then
    if v_category = 'container' then
      with recursive descendants as (
        select child.id
        from public.character_inventory_items child
        where child.holder_item_id = p_item_id

        union all

        select child.id
        from public.character_inventory_items child
        join descendants parent on child.holder_item_id = parent.id
      )
      select coalesce(
        jsonb_agg(to_jsonb(item) order by item.created_at, item.id),
        '[]'::jsonb
      )
      into v_descendants_before
      from public.character_inventory_items item
      join descendants subtree on subtree.id = item.id;

      perform item.id
      from public.character_inventory_items item
      where item.id in (
        with recursive descendants as (
          select child.id
          from public.character_inventory_items child
          where child.holder_item_id = p_item_id

          union all

          select child.id
          from public.character_inventory_items child
          join descendants parent on child.holder_item_id = parent.id
        )
        select id from descendants
      )
      for update;
    end if;

    update public.character_inventory_items item
    set
      character_id = p_to_character_id,
      holder_item_id = null,
      equipped = false
    where item.id = p_item_id
    returning to_jsonb(item)
    into v_destination;

    if v_category = 'container' then
      update public.character_inventory_items item
      set
        character_id = p_to_character_id,
        equipped = false
      where item.id in (
        with recursive descendants as (
          select child.id
          from public.character_inventory_items child
          where child.holder_item_id = p_item_id

          union all

          select child.id
          from public.character_inventory_items child
          join descendants parent on child.holder_item_id = parent.id
        )
        select id from descendants
      );

      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'before', before_row.value,
            'after', to_jsonb(current_item)
          )
          order by current_item.created_at, current_item.id
        ),
        '[]'::jsonb
      )
      into v_related_changes
      from jsonb_array_elements(v_descendants_before) before_row(value)
      join public.character_inventory_items current_item
        on current_item.id = (before_row.value->>'id')::uuid;
    end if;
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
      item_state,
      stack_mode,
      holder_item_id
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
      item.item_state,
      item.stack_mode,
      null
    from public.character_inventory_items item
    where item.id = p_item_id
    returning to_jsonb(character_inventory_items)
    into v_destination;
  end if;

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds',
      jsonb_build_array(p_from_character_id, p_to_character_id),
    'before', v_before,
    'after', v_after,
    'destinationItem', v_destination,
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
    'inventory.transfer',
    p_item_id,
    v_result,
    auth.uid()
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
