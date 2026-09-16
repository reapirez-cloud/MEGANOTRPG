-- Cheburashka / Larisa Stage 8: persistent location-bound world storage.
-- One physical item row moves between character and world ownership; no copy ledger.

create table if not exists public.world_storages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  root_item_id uuid unique,
  storage_kind text not null default 'stash'
    check (storage_kind in ('stash','chest','crate','cache','other')),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text not null default '',
  visibility_mode text not null default 'campaign'
    check (visibility_mode in ('campaign','owner','gm')),
  access_mode text not null default 'shared'
    check (access_mode in ('shared','owner','gm')),
  owner_character_id uuid references public.characters(id) on delete set null,
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active','archived')),
  version bigint not null default 1 check (version >= 1),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_storages_owner_required_check check (
    (visibility_mode <> 'owner' and access_mode <> 'owner')
    or owner_character_id is not null
  ),
  constraint world_storages_shared_visible_check check (
    access_mode <> 'shared' or visibility_mode = 'campaign'
  )
);

create index if not exists world_storages_campaign_location_idx
  on public.world_storages(campaign_id, location_id, lifecycle_state, created_at);

create index if not exists world_storages_owner_idx
  on public.world_storages(owner_character_id)
  where owner_character_id is not null;

alter table public.character_inventory_items
  alter column character_id drop not null;

alter table public.character_inventory_items
  add column if not exists world_storage_id uuid
    references public.world_storages(id) on delete restrict;

create index if not exists character_inventory_items_world_storage_idx
  on public.character_inventory_items(world_storage_id, holder_item_id, sort_order, created_at)
  where world_storage_id is not null;

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_owner_scope_check;

alter table public.character_inventory_items
  add constraint character_inventory_items_owner_scope_check
  check (
    (character_id is not null and world_storage_id is null)
    or
    (character_id is null and world_storage_id is not null)
  );

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_world_state_check;

alter table public.character_inventory_items
  add constraint character_inventory_items_world_state_check
  check (
    world_storage_id is null
    or (
      equipped = false
      and placement_kind in ('root','grid','legacy')
      and placement_kind not in ('hand','external')
    )
  );

alter table public.world_storages
  drop constraint if exists world_storages_root_item_id_fkey;

alter table public.world_storages
  add constraint world_storages_root_item_id_fkey
  foreign key (root_item_id)
  references public.character_inventory_items(id)
  on delete restrict
  deferrable initially deferred;

comment on table public.world_storages is
  'Larisa-owned location/visibility/access metadata for persistent world storage. Physical root container and contents remain Cheburashka item rows.';

comment on column public.character_inventory_items.world_storage_id is
  'Stage 8 Cheburashka owner scope. Exactly one of character_id or world_storage_id is set.';

create or replace function private.cheburashka_same_owner_scope_v1(
  p_left_character_id uuid,
  p_left_world_storage_id uuid,
  p_right_character_id uuid,
  p_right_world_storage_id uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select
    p_left_character_id is not distinct from p_right_character_id
    and p_left_world_storage_id is not distinct from p_right_world_storage_id;
$function$;

revoke execute on function private.cheburashka_same_owner_scope_v1(uuid,uuid,uuid,uuid)
from public, anon, authenticated;

create or replace function private.cheburashka_inventory_scope_campaign_v1(
  p_character_id uuid,
  p_world_storage_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
begin
  if (p_character_id is null) = (p_world_storage_id is null) then
    raise exception 'Inventory item must belong to exactly one owner scope';
  end if;

  if p_character_id is not null then
    select character.campaign_id into v_campaign_id
    from public.characters character
    where character.id = p_character_id;
  else
    select storage.campaign_id into v_campaign_id
    from public.world_storages storage
    where storage.id = p_world_storage_id;
  end if;

  if v_campaign_id is null then
    raise exception 'Inventory owner scope not found';
  end if;

  return v_campaign_id;
end;
$function$;

revoke execute on function private.cheburashka_inventory_scope_campaign_v1(uuid,uuid)
from public, anon, authenticated;

create or replace function private.cheburashka_assert_inventory_definition_scope_v2(
  p_character_id uuid,
  p_world_storage_id uuid,
  p_definition_id uuid,
  p_definition_revision integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_kind text;
  v_scope text;
  v_definition_campaign_id uuid;
begin
  if (p_definition_id is null) <> (p_definition_revision is null) then
    raise exception 'Inventory definition id and revision must be provided together';
  end if;

  v_campaign_id := private.cheburashka_inventory_scope_campaign_v1(
    p_character_id,
    p_world_storage_id
  );

  if p_definition_id is null then
    return;
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
  if v_scope = 'campaign'
     and v_definition_campaign_id is distinct from v_campaign_id then
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
$function$;

revoke execute on function private.cheburashka_assert_inventory_definition_scope_v2(uuid,uuid,uuid,integer)
from public, anon, authenticated;

create or replace function private.cheburashka_validate_inventory_definition_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.cheburashka_assert_inventory_definition_scope_v2(
    new.character_id,
    new.world_storage_id,
    new.definition_id,
    new.definition_revision
  );
  return new;
end;
$function$;

drop trigger if exists character_inventory_items_validate_definition
on public.character_inventory_items;

create trigger character_inventory_items_validate_definition
before insert or update of character_id, world_storage_id, definition_id, definition_revision
on public.character_inventory_items
for each row execute function private.cheburashka_validate_inventory_definition_v1();

create or replace function private.cheburashka_validate_inventory_holder_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_holder_character_id uuid;
  v_holder_world_storage_id uuid;
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

  select holder.character_id, holder.world_storage_id, holder.category
  into v_holder_character_id, v_holder_world_storage_id, v_holder_category
  from public.character_inventory_items holder
  where holder.id = new.holder_item_id;

  if not found then
    raise exception 'Inventory holder not found';
  end if;

  if not private.cheburashka_same_owner_scope_v1(
    new.character_id,
    new.world_storage_id,
    v_holder_character_id,
    v_holder_world_storage_id
  ) then
    raise exception 'Inventory holder must belong to the same owner scope';
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

drop trigger if exists character_inventory_items_validate_holder
on public.character_inventory_items;

create constraint trigger character_inventory_items_validate_holder
after insert or update of holder_item_id, character_id, world_storage_id, category
on public.character_inventory_items
deferrable initially deferred
for each row execute function private.cheburashka_validate_inventory_holder_v1();

create or replace function private.cheburashka_legacy_holder_placement_compat_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
     and (
       new.character_id is distinct from old.character_id
       or new.world_storage_id is distinct from old.world_storage_id
     )
     and new.holder_item_id is null
     and coalesce(new.placement_kind, 'root') <> 'root' then
    new.placement_kind := 'root';
    new.placement_index := null;
    new.grid_x := null;
    new.grid_y := null;
    new.grid_rotation := 0;
  elsif new.holder_item_id is not null
     and coalesce(new.placement_kind, 'root') = 'root' then
    new.placement_kind := 'legacy';
    new.placement_index := null;
    new.grid_x := null;
    new.grid_y := null;
    new.grid_rotation := 0;
  elsif new.holder_item_id is null and new.placement_kind = 'legacy' then
    new.placement_kind := 'root';
    new.placement_index := null;
    new.grid_x := null;
    new.grid_y := null;
    new.grid_rotation := 0;
  end if;
  return new;
end;
$function$;

drop trigger if exists character_inventory_items_legacy_holder_placement_compat
on public.character_inventory_items;

create trigger character_inventory_items_legacy_holder_placement_compat
before insert or update of holder_item_id, placement_kind, character_id, world_storage_id
on public.character_inventory_items
for each row execute function private.cheburashka_legacy_holder_placement_compat_v1();

create or replace function private.cheburashka_lock_inventory_character_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_key text;
begin
  for v_key in
    select distinct lock_key
    from (
      values
        (case when tg_op <> 'INSERT' and old.character_id is not null
          then 'inventory:' || old.character_id::text end),
        (case when tg_op <> 'DELETE' and new.character_id is not null
          then 'inventory:' || new.character_id::text end),
        (case when tg_op <> 'INSERT' and old.world_storage_id is not null
          then 'world-storage:' || old.world_storage_id::text end),
        (case when tg_op <> 'DELETE' and new.world_storage_id is not null
          then 'world-storage:' || new.world_storage_id::text end)
    ) locks(lock_key)
    where lock_key is not null
    order by lock_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_key, 0)
    );
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
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
  v_item_character uuid;
  v_item_world_storage uuid;
  v_container_profile jsonb;
  v_grid_width integer;
  v_grid_height integer;
  v_bounds_width integer;
  v_bounds_height integer;
  v_capacity integer;
  v_holder_character uuid;
  v_holder_world_storage uuid;
  v_holder_category text;
begin
  select item.category, item.character_id, item.world_storage_id
  into v_item_category, v_item_character, v_item_world_storage
  from public.character_inventory_items item
  where item.id = p_item_id;

  if not found
     or v_item_character is distinct from p_character_id then
    raise exception 'Inventory item not found for this owner scope';
  end if;

  v_profile := private.cheburashka_inventory_profile_for_item_v1(p_item_id);

  if p_target_kind = 'root' then
    if p_holder_item_id is not null
       or p_grid_x is not null
       or p_grid_y is not null
       or p_slot_index is not null then
      raise exception 'Root inventory placement does not accept holder, grid coordinates or slot index';
    end if;
    return;
  end if;

  if p_target_kind = 'hand' then
    if v_item_character is null or v_item_world_storage is not null then
      raise exception 'World storage items cannot occupy character hand slots';
    end if;
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
        and occupied.world_storage_id is null
        and occupied.placement_kind = 'hand'
        and occupied.placement_index = p_slot_index
        and occupied.id <> p_item_id
    ) then
      raise exception 'Inventory hand slot is occupied';
    end if;
    return;
  end if;

  if p_target_kind = 'external' then
    if v_item_character is null or v_item_world_storage is not null then
      raise exception 'World storage items cannot occupy external carry slots';
    end if;
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
        and occupied.world_storage_id is null
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

  select holder.character_id, holder.world_storage_id, holder.category
  into v_holder_character, v_holder_world_storage, v_holder_category
  from public.character_inventory_items holder
  where holder.id = p_holder_item_id;

  if not found then
    raise exception 'Inventory holder not found';
  end if;
  if not private.cheburashka_same_owner_scope_v1(
    v_item_character,
    v_item_world_storage,
    v_holder_character,
    v_holder_world_storage
  ) then
    raise exception 'Inventory holder must belong to the same owner scope';
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

create or replace function private.cheburashka_assert_spatial_item_v1(p_item_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_item public.character_inventory_items%rowtype;
  v_child public.character_inventory_items%rowtype;
begin
  select *
  into v_item
  from public.character_inventory_items item
  where item.id = p_item_id;

  if not found then
    return;
  end if;

  if v_item.placement_kind = 'grid' then
    perform private.cheburashka_assert_spatial_placement_v1(
      v_item.character_id,
      v_item.id,
      'grid',
      v_item.holder_item_id,
      v_item.grid_x,
      v_item.grid_y,
      v_item.grid_rotation,
      null
    );
  elsif v_item.placement_kind = 'hand' then
    perform private.cheburashka_assert_spatial_placement_v1(
      v_item.character_id,
      v_item.id,
      'hand',
      null,
      null,
      null,
      0,
      v_item.placement_index
    );
  elsif v_item.placement_kind = 'external' then
    perform private.cheburashka_assert_spatial_placement_v1(
      v_item.character_id,
      v_item.id,
      'external',
      null,
      null,
      null,
      0,
      v_item.placement_index
    );
  end if;

  for v_child in
    select child.*
    from public.character_inventory_items child
    where child.holder_item_id = v_item.id
      and child.placement_kind = 'grid'
    order by child.id
  loop
    perform private.cheburashka_assert_spatial_placement_v1(
      v_child.character_id,
      v_child.id,
      'grid',
      v_child.holder_item_id,
      v_child.grid_x,
      v_child.grid_y,
      v_child.grid_rotation,
      null
    );
  end loop;

  perform private.cheburashka_assert_character_external_capacity_v1(v_item.character_id);
end;
$function$;

create or replace function private.cheburashka_assert_world_storage_tree_v1(
  p_item_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_item public.character_inventory_items%rowtype;
  v_root_item_id uuid;
  v_reaches_root boolean := false;
  v_escaped boolean := false;
begin
  select * into v_item
  from public.character_inventory_items item
  where item.id = p_item_id;

  if not found or v_item.world_storage_id is null then
    return;
  end if;

  select storage.root_item_id
  into v_root_item_id
  from public.world_storages storage
  where storage.id = v_item.world_storage_id;

  if not found or v_root_item_id is null then
    raise exception 'World storage has no root container';
  end if;

  if v_item.id = v_root_item_id then
    if v_item.character_id is not null
       or v_item.holder_item_id is not null
       or v_item.placement_kind <> 'root'
       or v_item.category <> 'container' then
      raise exception 'World storage root must be a root container in its storage scope';
    end if;
    return;
  end if;

  with recursive chain as (
    select item.id, item.holder_item_id, item.world_storage_id, 0 as depth
    from public.character_inventory_items item
    where item.id = p_item_id

    union all

    select parent.id, parent.holder_item_id, parent.world_storage_id, chain.depth + 1
    from public.character_inventory_items parent
    join chain on parent.id = chain.holder_item_id
    where chain.depth < 17
  )
  select
    coalesce(bool_or(id = v_root_item_id), false),
    coalesce(bool_or(
      world_storage_id is distinct from v_item.world_storage_id
      or (holder_item_id is null and id <> v_root_item_id)
    ), false)
  into v_reaches_root, v_escaped
  from chain;

  if not v_reaches_root or v_escaped then
    raise exception 'World storage item must remain connected to the storage root container';
  end if;
end;
$function$;

revoke execute on function private.cheburashka_assert_world_storage_tree_v1(uuid)
from public, anon, authenticated;

create or replace function private.cheburashka_validate_world_storage_item_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op <> 'DELETE' and new.world_storage_id is not null then
    perform private.cheburashka_assert_world_storage_tree_v1(new.id);
  end if;
  if tg_op = 'UPDATE'
     and old.world_storage_id is not null
     and old.world_storage_id is distinct from new.world_storage_id then
    if exists (
      select 1 from public.character_inventory_items item
      where item.id = old.id and item.world_storage_id = old.world_storage_id
    ) then
      perform private.cheburashka_assert_world_storage_tree_v1(old.id);
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke execute on function private.cheburashka_validate_world_storage_item_v1()
from public, anon, authenticated;

drop trigger if exists character_inventory_items_validate_world_storage_tree
on public.character_inventory_items;

create constraint trigger character_inventory_items_validate_world_storage_tree
after insert or delete or update of character_id, world_storage_id, holder_item_id, placement_kind, category
on public.character_inventory_items
deferrable initially deferred
for each row execute function private.cheburashka_validate_world_storage_item_v1();

create or replace function private.cheburashka_assert_world_storage_v1(
  p_world_storage_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_storage public.world_storages%rowtype;
  v_root public.character_inventory_items%rowtype;
  v_location_campaign uuid;
  v_owner_campaign uuid;
begin
  select * into v_storage
  from public.world_storages storage
  where storage.id = p_world_storage_id;

  if not found then
    return;
  end if;

  select location.campaign_id into v_location_campaign
  from public.locations location
  where location.id = v_storage.location_id;

  if v_location_campaign is null
     or v_location_campaign <> v_storage.campaign_id then
    raise exception 'World storage location must belong to the same campaign';
  end if;

  if v_storage.owner_character_id is not null then
    select character.campaign_id into v_owner_campaign
    from public.characters character
    where character.id = v_storage.owner_character_id;
    if v_owner_campaign is null or v_owner_campaign <> v_storage.campaign_id then
      raise exception 'World storage owner must belong to the same campaign';
    end if;
  end if;

  if v_storage.root_item_id is null then
    raise exception 'World storage root container is required';
  end if;

  select * into v_root
  from public.character_inventory_items item
  where item.id = v_storage.root_item_id;

  if not found
     or v_root.world_storage_id is distinct from v_storage.id
     or v_root.character_id is not null
     or v_root.category <> 'container'
     or v_root.holder_item_id is not null
     or v_root.placement_kind <> 'root'
     or v_root.equipped then
    raise exception 'World storage root container is invalid';
  end if;
end;
$function$;

revoke execute on function private.cheburashka_assert_world_storage_v1(uuid)
from public, anon, authenticated;

create or replace function private.cheburashka_validate_world_storage_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  perform private.cheburashka_assert_world_storage_v1(
    case when tg_op = 'DELETE' then old.id else new.id end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke execute on function private.cheburashka_validate_world_storage_v1()
from public, anon, authenticated;

drop trigger if exists world_storages_validate_integrity
on public.world_storages;

create constraint trigger world_storages_validate_integrity
after insert or update
on public.world_storages
deferrable initially deferred
for each row execute function private.cheburashka_validate_world_storage_v1();

create or replace function private.can_view_world_storage_v1(
  p_world_storage_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.world_storages storage
    where storage.id = p_world_storage_id
      and storage.lifecycle_state = 'active'
      and private.is_campaign_member(storage.campaign_id, p_user_id)
      and private.can_view_location(storage.location_id, p_user_id)
      and (
        private.can_manage_campaign(storage.campaign_id, p_user_id)
        or storage.visibility_mode = 'campaign'
        or (
          storage.visibility_mode = 'owner'
          and storage.owner_character_id is not null
          and private.can_operate_character_resources(storage.owner_character_id, p_user_id)
        )
      )
  );
$function$;

revoke execute on function private.can_view_world_storage_v1(uuid,uuid)
from public, anon, authenticated;

create or replace function private.can_operate_world_storage_v1(
  p_world_storage_id uuid,
  p_actor_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.world_storages storage
    where storage.id = p_world_storage_id
      and storage.lifecycle_state = 'active'
      and (
        private.can_manage_campaign(storage.campaign_id, p_user_id)
        or (
          p_actor_character_id is not null
          and private.can_operate_character_resources(p_actor_character_id, p_user_id)
          and exists (
            select 1
            from public.characters actor
            join public.character_world_state world_state
              on world_state.character_id = actor.id
            where actor.id = p_actor_character_id
              and actor.campaign_id = storage.campaign_id
              and world_state.location_id = storage.location_id
          )
          and private.can_view_location(storage.location_id, p_user_id)
          and (
            storage.visibility_mode = 'campaign'
            or (
              storage.visibility_mode = 'owner'
              and storage.owner_character_id = p_actor_character_id
            )
          )
          and (
            storage.access_mode = 'shared'
            or (
              storage.access_mode = 'owner'
              and storage.owner_character_id = p_actor_character_id
            )
          )
        )
      )
  );
$function$;

revoke execute on function private.can_operate_world_storage_v1(uuid,uuid,uuid)
from public, anon, authenticated;

alter table public.world_storages enable row level security;

drop policy if exists world_storages_read on public.world_storages;
create policy world_storages_read
on public.world_storages
for select
to authenticated
using (private.can_view_world_storage_v1(id, auth.uid()));

revoke insert, update, delete on public.world_storages from anon, authenticated;
grant select on public.world_storages to authenticated;

create or replace function public.list_world_storages_v1(
  p_campaign_id uuid,
  p_location_id uuid default null
)
returns table(
  id uuid,
  campaign_id uuid,
  location_id uuid,
  root_item_id uuid,
  storage_kind text,
  name text,
  description text,
  visibility_mode text,
  access_mode text,
  owner_character_id uuid,
  lifecycle_state text,
  version bigint,
  item_count bigint,
  can_operate boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_character_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not private.is_campaign_member(p_campaign_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  v_actor_character_id := private.active_character_for_user(p_campaign_id, auth.uid());

  return query
  select
    storage.id,
    storage.campaign_id,
    storage.location_id,
    storage.root_item_id,
    storage.storage_kind,
    storage.name,
    storage.description,
    storage.visibility_mode,
    storage.access_mode,
    storage.owner_character_id,
    storage.lifecycle_state,
    storage.version,
    (
      select count(*)
      from public.character_inventory_items item
      where item.world_storage_id = storage.id
        and item.id <> storage.root_item_id
    )::bigint,
    private.can_operate_world_storage_v1(
      storage.id,
      v_actor_character_id,
      auth.uid()
    )
  from public.world_storages storage
  where storage.campaign_id = p_campaign_id
    and storage.lifecycle_state = 'active'
    and (p_location_id is null or storage.location_id = p_location_id)
    and private.can_view_world_storage_v1(storage.id, auth.uid())
  order by storage.created_at, storage.id;
end;
$function$;

revoke all on function public.list_world_storages_v1(uuid,uuid)
from public, anon;
grant execute on function public.list_world_storages_v1(uuid,uuid)
to authenticated;

create or replace function public.list_world_storage_items_v1(
  p_world_storage_id uuid
)
returns table(
  item jsonb,
  inventory_profile jsonb,
  is_root boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_root_item_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not private.can_view_world_storage_v1(p_world_storage_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  select storage.root_item_id into v_root_item_id
  from public.world_storages storage
  where storage.id = p_world_storage_id;

  return query
  select
    to_jsonb(inventory_item),
    private.cheburashka_inventory_profile_for_item_v1(inventory_item.id),
    inventory_item.id = v_root_item_id
  from public.character_inventory_items inventory_item
  where inventory_item.world_storage_id = p_world_storage_id
  order by
    case when inventory_item.id = v_root_item_id then 0 else 1 end,
    inventory_item.sort_order,
    inventory_item.created_at,
    inventory_item.id;
end;
$function$;

revoke all on function public.list_world_storage_items_v1(uuid)
from public, anon;
grant execute on function public.list_world_storage_items_v1(uuid)
to authenticated;

create or replace function public.get_inventory_item_v2(
  p_item_id uuid
)
returns table(
  item jsonb,
  inventory_profile jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_item public.character_inventory_items%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_item
  from public.character_inventory_items inventory_item
  where inventory_item.id = p_item_id;

  if not found then
    return;
  end if;

  if v_item.character_id is not null then
    if not private.can_view_character(v_item.character_id, auth.uid()) then
      raise exception 'Not allowed';
    end if;
  elsif v_item.world_storage_id is not null then
    if not private.can_view_world_storage_v1(v_item.world_storage_id, auth.uid()) then
      raise exception 'Not allowed';
    end if;
  else
    raise exception 'Inventory item has no owner scope';
  end if;

  return query
  select to_jsonb(v_item),
         private.cheburashka_inventory_profile_for_item_v1(v_item.id);
end;
$function$;

revoke all on function public.get_inventory_item_v2(uuid)
from public, anon;
grant execute on function public.get_inventory_item_v2(uuid)
to authenticated;

create or replace function public.create_world_storage_v1(
  p_location_id uuid,
  p_storage_kind text,
  p_name text,
  p_description text,
  p_visibility_mode text,
  p_access_mode text,
  p_owner_character_id uuid,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_is_manager boolean;
  v_existing public.engine_command_receipts%rowtype;
  v_storage_id uuid;
  v_root_item_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if btrim(coalesce(p_name,'')) = '' then raise exception 'World storage name is required'; end if;
  if p_storage_kind not in ('stash','chest','crate','cache','other') then
    raise exception 'Unsupported world storage kind';
  end if;
  if p_visibility_mode not in ('campaign','owner','gm') then
    raise exception 'Unsupported world storage visibility';
  end if;
  if p_access_mode not in ('shared','owner','gm') then
    raise exception 'Unsupported world storage access mode';
  end if;

  select location.campaign_id into v_campaign_id
  from public.locations location
  where location.id = p_location_id
    and location.lifecycle_state = 'active';

  if v_campaign_id is null then raise exception 'Location not found'; end if;

  v_is_manager := private.can_manage_campaign(v_campaign_id, auth.uid());

  if not v_is_manager then
    if p_owner_character_id is null
       or not private.can_operate_character_resources(p_owner_character_id, auth.uid()) then
      raise exception 'Player stash requires the active owned character';
    end if;
    if p_visibility_mode <> 'owner' or p_access_mode <> 'owner' then
      raise exception 'Player-created stash must be owner-only';
    end if;
    if not exists (
      select 1
      from public.characters actor
      join public.character_world_state world_state
        on world_state.character_id = actor.id
      where actor.id = p_owner_character_id
        and actor.campaign_id = v_campaign_id
        and world_state.location_id = p_location_id
    ) then
      raise exception 'Character must be at the storage location';
    end if;
  end if;

  if p_owner_character_id is not null and not exists (
    select 1 from public.characters owner_character
    where owner_character.id = p_owner_character_id
      and owner_character.campaign_id = v_campaign_id
  ) then
    raise exception 'World storage owner belongs to another campaign';
  end if;

  if p_access_mode = 'shared' and p_visibility_mode <> 'campaign' then
    raise exception 'Shared storage must be campaign-visible';
  end if;
  if (p_access_mode = 'owner' or p_visibility_mode = 'owner')
     and p_owner_character_id is null then
    raise exception 'Owner-only storage requires an owner character';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text, 0)
  );

  select * into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;

  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'larisa'
       or v_existing.command_kind <> 'world.storage_create' then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  insert into public.world_storages(
    campaign_id, location_id, storage_kind, name, description,
    visibility_mode, access_mode, owner_character_id, created_by
  )
  values(
    v_campaign_id, p_location_id, p_storage_kind, btrim(p_name),
    coalesce(p_description,''), p_visibility_mode, p_access_mode,
    p_owner_character_id, auth.uid()
  )
  returning id into v_storage_id;

  insert into public.character_inventory_items(
    character_id, world_storage_id, name, quantity, weight, equipped,
    category, equipment_slot, image_url, description, mechanics,
    usage_mode, charges_current, charges_max, stack_mode,
    holder_item_id, placement_kind, placement_index,
    grid_x, grid_y, grid_rotation, item_state
  )
  values(
    null, v_storage_id, btrim(p_name), 1, null, false,
    'container', null, null, coalesce(p_description,''), '[]'::jsonb,
    'none', null, null, 'instance',
    null, 'root', null, null, null, 0,
    jsonb_build_object('world_storage_root', true)
  )
  returning id into v_root_item_id;

  update public.world_storages storage
  set root_item_id = v_root_item_id,
      updated_at = now()
  where storage.id = v_storage_id;

  v_result := jsonb_build_object(
    'storageId', v_storage_id,
    'rootItemId', v_root_item_id,
    'locationId', p_location_id,
    'campaignId', v_campaign_id
  );

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind,
    aggregate_id, result, created_by
  )
  values(
    p_command_id, v_campaign_id, 'larisa', 'world.storage_create',
    v_storage_id, v_result, auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.create_world_storage_v1(uuid,text,text,text,text,text,uuid,uuid)
from public, anon;
grant execute on function public.create_world_storage_v1(uuid,text,text,text,text,text,uuid,uuid)
to authenticated;

create or replace function public.update_world_storage_v1(
  p_world_storage_id uuid,
  p_name text,
  p_description text,
  p_visibility_mode text,
  p_access_mode text,
  p_owner_character_id uuid,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_storage public.world_storages%rowtype;
  v_is_manager boolean;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if btrim(coalesce(p_name,'')) = '' then raise exception 'World storage name is required'; end if;
  if p_visibility_mode not in ('campaign','owner','gm')
     or p_access_mode not in ('shared','owner','gm') then
    raise exception 'Unsupported world storage policy';
  end if;

  select * into v_storage
  from public.world_storages storage
  where storage.id = p_world_storage_id
  for update;

  if not found then raise exception 'World storage not found'; end if;
  if v_storage.version <> p_expected_version then
    raise exception 'World storage version conflict: expected %, current %',
      p_expected_version, v_storage.version;
  end if;

  v_is_manager := private.can_manage_campaign(v_storage.campaign_id, auth.uid());

  if not v_is_manager then
    if v_storage.owner_character_id is null
       or not private.can_operate_world_storage_v1(
         v_storage.id, v_storage.owner_character_id, auth.uid()
       ) then
      raise exception 'Not allowed';
    end if;
    if p_owner_character_id is distinct from v_storage.owner_character_id
       or p_visibility_mode <> 'owner'
       or p_access_mode <> 'owner' then
      raise exception 'Player cannot change stash ownership or sharing policy';
    end if;
  end if;

  if p_owner_character_id is not null and not exists (
    select 1 from public.characters owner_character
    where owner_character.id = p_owner_character_id
      and owner_character.campaign_id = v_storage.campaign_id
  ) then
    raise exception 'World storage owner belongs to another campaign';
  end if;

  if p_access_mode = 'shared' and p_visibility_mode <> 'campaign' then
    raise exception 'Shared storage must be campaign-visible';
  end if;
  if (p_access_mode = 'owner' or p_visibility_mode = 'owner')
     and p_owner_character_id is null then
    raise exception 'Owner-only storage requires an owner character';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('world-storage:' || p_world_storage_id::text, 0)
  );

  select * into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;
  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'larisa'
       or v_existing.command_kind <> 'world.storage_update'
       or v_existing.aggregate_id <> p_world_storage_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  update public.world_storages storage
  set name = btrim(p_name),
      description = coalesce(p_description,''),
      visibility_mode = p_visibility_mode,
      access_mode = p_access_mode,
      owner_character_id = p_owner_character_id,
      version = storage.version + 1,
      updated_at = now()
  where storage.id = p_world_storage_id
  returning to_jsonb(storage) into v_result;

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind,
    aggregate_id, result, created_by
  )
  values(
    p_command_id, v_storage.campaign_id, 'larisa', 'world.storage_update',
    p_world_storage_id, v_result, auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.update_world_storage_v1(uuid,text,text,text,text,uuid,bigint,uuid)
from public, anon;
grant execute on function public.update_world_storage_v1(uuid,text,text,text,text,uuid,bigint,uuid)
to authenticated;

create or replace function public.move_world_storage_v1(
  p_world_storage_id uuid,
  p_location_id uuid,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_storage public.world_storages%rowtype;
  v_target_campaign uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_storage
  from public.world_storages storage
  where storage.id = p_world_storage_id
  for update;

  if not found then raise exception 'World storage not found'; end if;
  if not private.can_manage_campaign(v_storage.campaign_id, auth.uid()) then
    raise exception 'Only GM can move world storage';
  end if;
  if v_storage.version <> p_expected_version then
    raise exception 'World storage version conflict: expected %, current %',
      p_expected_version, v_storage.version;
  end if;

  select location.campaign_id into v_target_campaign
  from public.locations location
  where location.id = p_location_id
    and location.lifecycle_state = 'active';

  if v_target_campaign is null
     or v_target_campaign <> v_storage.campaign_id then
    raise exception 'Target location belongs to another campaign or is unavailable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('world-storage:' || p_world_storage_id::text, 0)
  );

  select * into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;
  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'larisa'
       or v_existing.command_kind <> 'world.storage_move'
       or v_existing.aggregate_id <> p_world_storage_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  update public.world_storages storage
  set location_id = p_location_id,
      version = storage.version + 1,
      updated_at = now()
  where storage.id = p_world_storage_id;

  v_result := jsonb_build_object(
    'storageId', p_world_storage_id,
    'fromLocationId', v_storage.location_id,
    'toLocationId', p_location_id
  );

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind,
    aggregate_id, result, created_by
  )
  values(
    p_command_id, v_storage.campaign_id, 'larisa', 'world.storage_move',
    p_world_storage_id, v_result, auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.move_world_storage_v1(uuid,uuid,bigint,uuid)
from public, anon;
grant execute on function public.move_world_storage_v1(uuid,uuid,bigint,uuid)
to authenticated;

create or replace function public.set_world_storage_archived_v1(
  p_world_storage_id uuid,
  p_archived boolean,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_storage public.world_storages%rowtype;
  v_allowed boolean;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_storage
  from public.world_storages storage
  where storage.id = p_world_storage_id
  for update;

  if not found then raise exception 'World storage not found'; end if;
  if v_storage.version <> p_expected_version then
    raise exception 'World storage version conflict: expected %, current %',
      p_expected_version, v_storage.version;
  end if;

  v_allowed := private.can_manage_campaign(v_storage.campaign_id, auth.uid())
    or (
      v_storage.owner_character_id is not null
      and private.can_operate_world_storage_v1(
        v_storage.id, v_storage.owner_character_id, auth.uid()
      )
    );

  if not v_allowed then raise exception 'Not allowed'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('world-storage:' || p_world_storage_id::text, 0)
  );

  select * into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;
  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'larisa'
       or v_existing.command_kind <> 'world.storage_archive'
       or v_existing.aggregate_id <> p_world_storage_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  update public.world_storages storage
  set lifecycle_state = case when p_archived then 'archived' else 'active' end,
      version = storage.version + 1,
      updated_at = now()
  where storage.id = p_world_storage_id;

  v_result := jsonb_build_object(
    'storageId', p_world_storage_id,
    'archived', p_archived,
    'locationId', v_storage.location_id
  );

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind,
    aggregate_id, result, created_by
  )
  values(
    p_command_id, v_storage.campaign_id, 'larisa', 'world.storage_archive',
    p_world_storage_id, v_result, auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.set_world_storage_archived_v1(uuid,boolean,bigint,uuid)
from public, anon;
grant execute on function public.set_world_storage_archived_v1(uuid,boolean,bigint,uuid)
to authenticated;

create or replace function public.store_inventory_item_in_world_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_world_storage_id uuid,
  p_amount integer,
  p_grid_x integer,
  p_grid_y integer,
  p_rotation integer,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_storage public.world_storages%rowtype;
  v_source public.character_inventory_items%rowtype;
  v_destination public.character_inventory_items%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_after jsonb := 'null'::jsonb;
  v_destination_json jsonb := 'null'::jsonb;
  v_result jsonb;
  v_subtree_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    raise exception 'Inventory amount must be between 1 and 10000';
  end if;

  select * into v_storage
  from public.world_storages storage
  where storage.id = p_world_storage_id
    and storage.lifecycle_state = 'active';

  if not found then raise exception 'World storage not found'; end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;
  if not private.can_operate_world_storage_v1(
    p_world_storage_id, p_character_id, auth.uid()
  ) then
    raise exception 'Character cannot access this world storage';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory:' || p_character_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('world-storage:' || p_world_storage_id::text, 0)
  );

  select * into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;
  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.store_world'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select * into v_source
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id
    and item.world_storage_id is null
  for update;

  if not found then raise exception 'Inventory item not found for source character'; end if;
  if v_source.version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',
      p_expected_version, v_source.version;
  end if;
  if v_source.quantity < p_amount then raise exception 'Not enough item quantity'; end if;
  if coalesce(v_source.stack_mode,'instance') = 'instance'
     and p_amount <> v_source.quantity then
    raise exception 'Inventory instance cannot be split';
  end if;
  if v_source.equipped then
    raise exception 'Equipped inventory item requires a real unequip destination';
  end if;

  v_before := to_jsonb(v_source);

  if v_source.quantity = p_amount then
    with recursive subtree as (
      select item.id
      from public.character_inventory_items item
      where item.id = p_item_id
      union all
      select child.id
      from public.character_inventory_items child
      join subtree on child.holder_item_id = subtree.id
    )
    select array_agg(id) into v_subtree_ids from subtree;

    perform 1
    from public.character_inventory_items item
    where item.id = any(v_subtree_ids)
    order by item.id
    for update;

    update public.character_inventory_items item
    set character_id = null,
        world_storage_id = p_world_storage_id,
        equipped = false
    where item.id = any(v_subtree_ids);

    update public.character_inventory_items item
    set holder_item_id = v_storage.root_item_id,
        placement_kind = 'grid',
        placement_index = null,
        grid_x = p_grid_x,
        grid_y = p_grid_y,
        grid_rotation = coalesce(p_rotation,0)
    where item.id = p_item_id
    returning * into v_destination;

    perform private.cheburashka_assert_spatial_placement_v1(
      null, p_item_id, 'grid', v_storage.root_item_id,
      p_grid_x, p_grid_y, coalesce(p_rotation,0), null
    );
    perform private.cheburashka_assert_specialized_capacity_v1(v_storage.root_item_id);
    v_destination_json := to_jsonb(v_destination);
  else
    update public.character_inventory_items item
    set quantity = item.quantity - p_amount
    where item.id = p_item_id
    returning to_jsonb(item) into v_after;

    insert into public.character_inventory_items(
      character_id, world_storage_id, name, quantity, weight, equipped,
      image_url, description, sort_order, category, equipment_slot,
      mechanics, definition_id, definition_revision, usage_mode,
      charges_current, charges_max, item_state, stack_mode,
      holder_item_id, placement_kind, placement_index,
      grid_x, grid_y, grid_rotation
    )
    values(
      null, p_world_storage_id, v_source.name, p_amount, v_source.weight, false,
      v_source.image_url, v_source.description, v_source.sort_order,
      v_source.category, v_source.equipment_slot, v_source.mechanics,
      v_source.definition_id, v_source.definition_revision, v_source.usage_mode,
      v_source.charges_current, v_source.charges_max, v_source.item_state,
      v_source.stack_mode, v_storage.root_item_id, 'grid', null,
      p_grid_x, p_grid_y, coalesce(p_rotation,0)
    )
    returning * into v_destination;

    perform private.cheburashka_assert_spatial_placement_v1(
      null, v_destination.id, 'grid', v_storage.root_item_id,
      p_grid_x, p_grid_y, coalesce(p_rotation,0), null
    );
    perform private.cheburashka_assert_specialized_capacity_v1(v_storage.root_item_id);
    v_destination_json := to_jsonb(v_destination);
  end if;

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(p_character_id),
    'affectedWorldStorageIds', jsonb_build_array(p_world_storage_id),
    'affectedLocationIds', jsonb_build_array(v_storage.location_id),
    'before', v_before,
    'after', v_after,
    'destinationItem', v_destination_json
  );

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind,
    aggregate_id, result, created_by
  )
  values(
    p_command_id, v_storage.campaign_id, 'cheburashka', 'inventory.store_world',
    p_item_id, v_result, auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.store_inventory_item_in_world_v1(uuid,uuid,uuid,integer,integer,integer,integer,bigint,uuid)
from public, anon;
grant execute on function public.store_inventory_item_in_world_v1(uuid,uuid,uuid,integer,integer,integer,integer,bigint,uuid)
to authenticated;

create or replace function public.take_inventory_item_from_world_v1(
  p_world_storage_id uuid,
  p_item_id uuid,
  p_character_id uuid,
  p_amount integer,
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
  v_storage public.world_storages%rowtype;
  v_source public.character_inventory_items%rowtype;
  v_destination public.character_inventory_items%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_after jsonb := 'null'::jsonb;
  v_destination_json jsonb := 'null'::jsonb;
  v_result jsonb;
  v_subtree_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    raise exception 'Inventory amount must be between 1 and 10000';
  end if;
  if p_target_kind not in ('root','grid','hand','external') then
    raise exception 'Unsupported inventory placement kind';
  end if;

  select * into v_storage
  from public.world_storages storage
  where storage.id = p_world_storage_id
    and storage.lifecycle_state = 'active';

  if not found then raise exception 'World storage not found'; end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;
  if not private.can_operate_world_storage_v1(
    p_world_storage_id, p_character_id, auth.uid()
  ) then
    raise exception 'Character cannot access this world storage';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory:' || p_character_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('world-storage:' || p_world_storage_id::text, 0)
  );

  select * into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;
  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'cheburashka'
       or v_existing.command_kind <> 'inventory.take_world'
       or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  if p_item_id = v_storage.root_item_id then
    raise exception 'World storage root container cannot be taken as contents';
  end if;

  select * into v_source
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.world_storage_id = p_world_storage_id
    and item.character_id is null
  for update;

  if not found then raise exception 'Inventory item not found in world storage'; end if;
  if v_source.version <> p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',
      p_expected_version, v_source.version;
  end if;
  if v_source.quantity < p_amount then raise exception 'Not enough item quantity'; end if;
  if coalesce(v_source.stack_mode,'instance') = 'instance'
     and p_amount <> v_source.quantity then
    raise exception 'Inventory instance cannot be split';
  end if;

  v_before := to_jsonb(v_source);

  if v_source.quantity = p_amount then
    with recursive subtree as (
      select item.id
      from public.character_inventory_items item
      where item.id = p_item_id
      union all
      select child.id
      from public.character_inventory_items child
      join subtree on child.holder_item_id = subtree.id
    )
    select array_agg(id) into v_subtree_ids from subtree;

    perform 1
    from public.character_inventory_items item
    where item.id = any(v_subtree_ids)
    order by item.id
    for update;

    update public.character_inventory_items item
    set character_id = p_character_id,
        world_storage_id = null,
        equipped = false
    where item.id = any(v_subtree_ids);

    update public.character_inventory_items item
    set holder_item_id = case when p_target_kind = 'grid' then p_holder_item_id else null end,
        placement_kind = p_target_kind,
        placement_index = case when p_target_kind in ('hand','external') then p_slot_index else null end,
        grid_x = case when p_target_kind = 'grid' then p_grid_x else null end,
        grid_y = case when p_target_kind = 'grid' then p_grid_y else null end,
        grid_rotation = case when p_target_kind = 'grid' then coalesce(p_rotation,0) else 0 end
    where item.id = p_item_id
    returning * into v_destination;

    perform private.cheburashka_assert_spatial_placement_v1(
      p_character_id, p_item_id, p_target_kind,
      case when p_target_kind = 'grid' then p_holder_item_id else null end,
      case when p_target_kind = 'grid' then p_grid_x else null end,
      case when p_target_kind = 'grid' then p_grid_y else null end,
      case when p_target_kind = 'grid' then coalesce(p_rotation,0) else 0 end,
      case when p_target_kind in ('hand','external') then p_slot_index else null end
    );
    v_destination_json := to_jsonb(v_destination);
  else
    update public.character_inventory_items item
    set quantity = item.quantity - p_amount
    where item.id = p_item_id
    returning to_jsonb(item) into v_after;

    insert into public.character_inventory_items(
      character_id, world_storage_id, name, quantity, weight, equipped,
      image_url, description, sort_order, category, equipment_slot,
      mechanics, definition_id, definition_revision, usage_mode,
      charges_current, charges_max, item_state, stack_mode,
      holder_item_id, placement_kind, placement_index,
      grid_x, grid_y, grid_rotation
    )
    values(
      p_character_id, null, v_source.name, p_amount, v_source.weight, false,
      v_source.image_url, v_source.description, v_source.sort_order,
      v_source.category, v_source.equipment_slot, v_source.mechanics,
      v_source.definition_id, v_source.definition_revision, v_source.usage_mode,
      v_source.charges_current, v_source.charges_max, v_source.item_state,
      v_source.stack_mode,
      case when p_target_kind = 'grid' then p_holder_item_id else null end,
      p_target_kind,
      case when p_target_kind in ('hand','external') then p_slot_index else null end,
      case when p_target_kind = 'grid' then p_grid_x else null end,
      case when p_target_kind = 'grid' then p_grid_y else null end,
      case when p_target_kind = 'grid' then coalesce(p_rotation,0) else 0 end
    )
    returning * into v_destination;

    perform private.cheburashka_assert_spatial_placement_v1(
      p_character_id, v_destination.id, p_target_kind,
      case when p_target_kind = 'grid' then p_holder_item_id else null end,
      case when p_target_kind = 'grid' then p_grid_x else null end,
      case when p_target_kind = 'grid' then p_grid_y else null end,
      case when p_target_kind = 'grid' then coalesce(p_rotation,0) else 0 end,
      case when p_target_kind in ('hand','external') then p_slot_index else null end
    );
    v_destination_json := to_jsonb(v_destination);
  end if;

  perform private.cheburashka_assert_character_external_capacity_v1(p_character_id);

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(p_character_id),
    'affectedWorldStorageIds', jsonb_build_array(p_world_storage_id),
    'affectedLocationIds', jsonb_build_array(v_storage.location_id),
    'before', v_before,
    'after', v_after,
    'destinationItem', v_destination_json
  );

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind,
    aggregate_id, result, created_by
  )
  values(
    p_command_id, v_storage.campaign_id, 'cheburashka', 'inventory.take_world',
    p_item_id, v_result, auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.take_inventory_item_from_world_v1(uuid,uuid,uuid,integer,text,uuid,integer,integer,integer,integer,bigint,uuid)
from public, anon;
grant execute on function public.take_inventory_item_from_world_v1(uuid,uuid,uuid,integer,text,uuid,integer,integer,integer,integer,bigint,uuid)
to authenticated;
