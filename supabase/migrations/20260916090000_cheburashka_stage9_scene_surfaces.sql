-- Inventory Stage 9: game-scene membership + shared physical Surfaces.
-- No chat UI is introduced here. Larisa owns scene/surface access facts;
-- Cheburashka keeps one canonical physical item row.

create table if not exists public.scene_surfaces (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text not null default '',
  access_mode text not null default 'gm'
    check (access_mode in ('scene','selected','gm')),
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active','archived')),
  version bigint not null default 1 check (version >= 1),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scene_surfaces_room_idx
  on public.scene_surfaces(room_id,lifecycle_state,created_at);

create table if not exists public.scene_surface_character_access (
  surface_id uuid not null references public.scene_surfaces(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key(surface_id,character_id)
);

create index if not exists scene_surface_character_access_character_idx
  on public.scene_surface_character_access(character_id,surface_id);

-- A character has one current game scene. Closed/history rooms keep messages, not
-- current physical membership.
create unique index if not exists scene_participants_character_unique
  on public.scene_participants(character_id);

alter table public.character_inventory_items
  add column if not exists surface_id uuid
    references public.scene_surfaces(id) on delete restrict;

create index if not exists character_inventory_items_surface_idx
  on public.character_inventory_items(surface_id,holder_item_id,sort_order,created_at)
  where surface_id is not null;

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_owner_scope_check;
alter table public.character_inventory_items
  add constraint character_inventory_items_owner_scope_check
  check (
    ((character_id is not null)::int
      + (world_storage_id is not null)::int
      + (surface_id is not null)::int) = 1
  );

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_placement_kind_check;
alter table public.character_inventory_items
  add constraint character_inventory_items_placement_kind_check
  check (placement_kind in ('root','grid','hand','external','surface','legacy'));

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_placement_shape_check;
alter table public.character_inventory_items
  add constraint character_inventory_items_placement_shape_check
  check (
    (placement_kind='root' and holder_item_id is null and placement_index is null
      and grid_x is null and grid_y is null and grid_rotation=0)
    or
    (placement_kind='grid' and holder_item_id is not null and placement_index is null
      and grid_x is not null and grid_x>=0 and grid_y is not null and grid_y>=0)
    or
    (placement_kind='hand' and holder_item_id is null and placement_index in (0,1)
      and grid_x is null and grid_y is null and grid_rotation=0)
    or
    (placement_kind='external' and holder_item_id is null and placement_index is not null
      and placement_index>=0 and grid_x is null and grid_y is null and grid_rotation=0)
    or
    (placement_kind='surface' and holder_item_id is null and placement_index is null
      and grid_x is null and grid_y is null and grid_rotation=0)
    or
    (placement_kind='legacy' and holder_item_id is not null and placement_index is null
      and grid_x is null and grid_y is null and grid_rotation=0)
  );

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_world_state_check;
alter table public.character_inventory_items
  add constraint character_inventory_items_world_state_check
  check (
    world_storage_id is null
    or (
      character_id is null and surface_id is null and equipped=false
      and placement_kind in ('root','grid','legacy')
    )
  );

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_surface_state_check;
alter table public.character_inventory_items
  add constraint character_inventory_items_surface_state_check
  check (
    surface_id is null
    or (
      character_id is null and world_storage_id is null and equipped=false
      and (
        (holder_item_id is null and placement_kind='surface')
        or
        (holder_item_id is not null and placement_kind in ('grid','legacy'))
      )
    )
  );

create or replace function private.cheburashka_same_owner_scope_v2(
  p_left_character_id uuid,
  p_left_world_storage_id uuid,
  p_left_surface_id uuid,
  p_right_character_id uuid,
  p_right_world_storage_id uuid,
  p_right_surface_id uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select
    p_left_character_id is not distinct from p_right_character_id
    and p_left_world_storage_id is not distinct from p_right_world_storage_id
    and p_left_surface_id is not distinct from p_right_surface_id;
$function$;
revoke execute on function private.cheburashka_same_owner_scope_v2(uuid,uuid,uuid,uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function private.cheburashka_inventory_scope_campaign_v2(
  p_character_id uuid,
  p_world_storage_id uuid,
  p_surface_id uuid
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
  if (
    (p_character_id is not null)::int
    + (p_world_storage_id is not null)::int
    + (p_surface_id is not null)::int
  ) <> 1 then
    raise exception 'Inventory item must belong to exactly one owner scope';
  end if;

  if p_character_id is not null then
    select c.campaign_id into v_campaign_id
    from public.characters c where c.id=p_character_id;
  elsif p_world_storage_id is not null then
    select s.campaign_id into v_campaign_id
    from public.world_storages s where s.id=p_world_storage_id;
  else
    select s.campaign_id into v_campaign_id
    from public.scene_surfaces s where s.id=p_surface_id;
  end if;

  if v_campaign_id is null then raise exception 'Inventory owner scope not found'; end if;
  return v_campaign_id;
end;
$function$;
revoke execute on function private.cheburashka_inventory_scope_campaign_v2(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function private.cheburashka_assert_inventory_definition_scope_v3(
  p_character_id uuid,
  p_world_storage_id uuid,
  p_surface_id uuid,
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

  v_campaign_id := private.cheburashka_inventory_scope_campaign_v2(
    p_character_id,p_world_storage_id,p_surface_id
  );

  if p_definition_id is null then return; end if;

  select d.kind,d.scope,d.campaign_id
  into v_kind,v_scope,v_definition_campaign_id
  from public.reference_definitions d
  where d.id=p_definition_id;

  if not found then raise exception 'Inventory definition not found'; end if;
  if v_kind <> 'item' then
    raise exception 'Inventory instances can only reference item definitions';
  end if;
  if v_scope='campaign' and v_definition_campaign_id is distinct from v_campaign_id then
    raise exception 'Inventory definition belongs to another campaign';
  end if;
  if not exists(
    select 1 from public.reference_definition_revisions r
    where r.definition_id=p_definition_id and r.revision=p_definition_revision
  ) then
    raise exception 'Inventory definition revision not found';
  end if;
end;
$function$;
revoke execute on function private.cheburashka_assert_inventory_definition_scope_v3(uuid,uuid,uuid,uuid,integer)
from public,anon,authenticated;

create or replace function private.cheburashka_validate_inventory_definition_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.cheburashka_assert_inventory_definition_scope_v3(
    new.character_id,new.world_storage_id,new.surface_id,
    new.definition_id,new.definition_revision
  );
  return new;
end;
$function$;

drop trigger if exists character_inventory_items_validate_definition
on public.character_inventory_items;
create trigger character_inventory_items_validate_definition
before insert or update of character_id,world_storage_id,surface_id,definition_id,definition_revision
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
  v_holder_surface_id uuid;
  v_holder_category text;
  v_cycle boolean := false;
  v_max_depth integer := 0;
  v_overflow boolean := false;
begin
  if new.category <> 'container'
     and exists(select 1 from public.character_inventory_items child where child.holder_item_id=new.id) then
    raise exception 'Inventory holder with contents must remain a container';
  end if;

  if new.holder_item_id is null then return new; end if;

  select holder.character_id,holder.world_storage_id,holder.surface_id,holder.category
  into v_holder_character_id,v_holder_world_storage_id,v_holder_surface_id,v_holder_category
  from public.character_inventory_items holder
  where holder.id=new.holder_item_id;

  if not found then raise exception 'Inventory holder not found'; end if;

  if not private.cheburashka_same_owner_scope_v2(
    new.character_id,new.world_storage_id,new.surface_id,
    v_holder_character_id,v_holder_world_storage_id,v_holder_surface_id
  ) then
    raise exception 'Inventory holder must belong to the same owner scope';
  end if;

  if v_holder_category <> 'container' then
    raise exception 'Inventory holder must be a container';
  end if;

  with recursive chain as (
    select holder.id,holder.holder_item_id,1 depth
    from public.character_inventory_items holder where holder.id=new.holder_item_id
    union all
    select parent.id,parent.holder_item_id,chain.depth+1
    from public.character_inventory_items parent
    join chain on parent.id=chain.holder_item_id
    where chain.depth<17
  )
  select
    coalesce(bool_or(id=new.id),false),
    coalesce(max(depth),0),
    coalesce(bool_or(depth=17 and holder_item_id is not null),false)
  into v_cycle,v_max_depth,v_overflow
  from chain;

  if v_cycle then raise exception 'Inventory container cycle is not allowed'; end if;
  if v_overflow or v_max_depth>16 then
    raise exception 'Inventory container nesting depth exceeds 16';
  end if;
  return new;
end;
$function$;

drop trigger if exists character_inventory_items_validate_holder
on public.character_inventory_items;
create constraint trigger character_inventory_items_validate_holder
after insert or update of holder_item_id,character_id,world_storage_id,surface_id,category
on public.character_inventory_items
deferrable initially deferred
for each row execute function private.cheburashka_validate_inventory_holder_v1();

create or replace function private.cheburashka_legacy_holder_placement_compat_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.holder_item_id is not null
     and coalesce(new.placement_kind,'root')='root' then
    new.placement_kind := 'legacy';
    new.placement_index := null;
    new.grid_x := null;
    new.grid_y := null;
    new.grid_rotation := 0;
  elsif new.holder_item_id is null and new.placement_kind='legacy' then
    new.placement_kind := case when new.surface_id is not null then 'surface' else 'root' end;
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
before insert or update of holder_item_id,placement_kind,character_id,world_storage_id,surface_id
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
        (case when tg_op<>'INSERT' and old.character_id is not null then 'inventory:'||old.character_id::text end),
        (case when tg_op<>'DELETE' and new.character_id is not null then 'inventory:'||new.character_id::text end),
        (case when tg_op<>'INSERT' and old.world_storage_id is not null then 'world-storage:'||old.world_storage_id::text end),
        (case when tg_op<>'DELETE' and new.world_storage_id is not null then 'world-storage:'||new.world_storage_id::text end),
        (case when tg_op<>'INSERT' and old.surface_id is not null then 'surface:'||old.surface_id::text end),
        (case when tg_op<>'DELETE' and new.surface_id is not null then 'surface:'||new.surface_id::text end)
    ) locks(lock_key)
    where lock_key is not null
    order by lock_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_key,0));
  end loop;

  return case when tg_op='DELETE' then old else new end;
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
  v_item_surface uuid;
  v_container_profile jsonb;
  v_grid_width integer;
  v_grid_height integer;
  v_bounds_width integer;
  v_bounds_height integer;
  v_capacity integer;
  v_holder_character uuid;
  v_holder_world_storage uuid;
  v_holder_surface uuid;
  v_holder_category text;
begin
  select item.category,item.character_id,item.world_storage_id,item.surface_id
  into v_item_category,v_item_character,v_item_world_storage,v_item_surface
  from public.character_inventory_items item
  where item.id=p_item_id;

  if not found or v_item_character is distinct from p_character_id then
    raise exception 'Inventory item not found for this owner scope';
  end if;

  v_profile := private.cheburashka_inventory_profile_for_item_v1(p_item_id);

  if p_target_kind='root' then
    if v_item_surface is not null then
      raise exception 'Surface items use surface placement, not character root';
    end if;
    if p_holder_item_id is not null or p_grid_x is not null or p_grid_y is not null or p_slot_index is not null then
      raise exception 'Root inventory placement does not accept holder, grid coordinates or slot index';
    end if;
    return;
  end if;

  if p_target_kind='hand' then
    if v_item_character is null or v_item_world_storage is not null or v_item_surface is not null then
      raise exception 'Only character inventory items can occupy hand slots';
    end if;
    if p_holder_item_id is not null or p_grid_x is not null or p_grid_y is not null then
      raise exception 'Hand placement does not accept holder or grid coordinates';
    end if;
    if p_slot_index not in (0,1) then raise exception 'Inventory hand index must be 0 or 1'; end if;
    if exists(
      select 1 from public.character_inventory_items occupied
      where occupied.character_id=p_character_id
        and occupied.world_storage_id is null and occupied.surface_id is null
        and occupied.placement_kind='hand' and occupied.placement_index=p_slot_index
        and occupied.id<>p_item_id
    ) then raise exception 'Inventory hand slot is occupied'; end if;
    return;
  end if;

  if p_target_kind='external' then
    if v_item_character is null or v_item_world_storage is not null or v_item_surface is not null then
      raise exception 'Only character inventory items can occupy external carry slots';
    end if;
    if p_holder_item_id is not null or p_grid_x is not null or p_grid_y is not null then
      raise exception 'External carry placement does not accept holder or grid coordinates';
    end if;
    if p_slot_index is null or p_slot_index<0 then raise exception 'External carry slot index is required'; end if;
    v_capacity := private.cheburashka_external_carry_capacity_v1(p_character_id);
    if p_slot_index>=v_capacity then raise exception 'External carry slot is unavailable'; end if;
    if exists(
      select 1 from public.character_inventory_items occupied
      where occupied.character_id=p_character_id
        and occupied.world_storage_id is null and occupied.surface_id is null
        and occupied.placement_kind='external' and occupied.placement_index=p_slot_index
        and occupied.id<>p_item_id
    ) then raise exception 'External carry slot is occupied'; end if;
    return;
  end if;

  if p_target_kind<>'grid' then raise exception 'Unsupported inventory placement kind'; end if;
  if p_holder_item_id is null or p_grid_x is null or p_grid_y is null then
    raise exception 'Grid placement requires holder and coordinates';
  end if;
  if p_grid_x<0 or p_grid_y<0 then raise exception 'Inventory grid coordinates cannot be negative'; end if;
  if p_slot_index is not null then raise exception 'Grid placement does not accept carry slot index'; end if;

  select holder.character_id,holder.world_storage_id,holder.surface_id,holder.category
  into v_holder_character,v_holder_world_storage,v_holder_surface,v_holder_category
  from public.character_inventory_items holder
  where holder.id=p_holder_item_id;

  if not found then raise exception 'Inventory holder not found'; end if;
  if not private.cheburashka_same_owner_scope_v2(
    v_item_character,v_item_world_storage,v_item_surface,
    v_holder_character,v_holder_world_storage,v_holder_surface
  ) then raise exception 'Inventory holder must belong to the same owner scope'; end if;
  if v_holder_category<>'container' then raise exception 'Inventory holder must be a container'; end if;
  if p_holder_item_id=p_item_id then raise exception 'Inventory item cannot contain itself'; end if;

  v_container_profile := private.cheburashka_inventory_profile_for_item_v1(p_holder_item_id)->'container_profile';
  if v_container_profile is null or jsonb_typeof(v_container_profile)<>'object' then
    raise exception 'Inventory holder has no container profile';
  end if;
  if v_item_category='container'
     and coalesce((v_container_profile->>'allow_nested_containers')::boolean,true)=false then
    raise exception 'Inventory holder does not allow nested containers';
  end if;

  v_grid_width := (v_container_profile->>'internal_grid_width')::integer;
  v_grid_height := (v_container_profile->>'internal_grid_height')::integer;

  select coalesce(max(cell_x),-1)+1,coalesce(max(cell_y),-1)+1
  into v_bounds_width,v_bounds_height
  from private.cheburashka_inventory_shape_cells_v1(v_profile,p_rotation);

  if p_grid_x+v_bounds_width>v_grid_width or p_grid_y+v_bounds_height>v_grid_height then
    raise exception 'Inventory placement is out of bounds';
  end if;

  if exists(
    select 1
    from private.cheburashka_inventory_shape_cells_v1(v_profile,p_rotation) source_cell
    join public.character_inventory_items other
      on other.holder_item_id=p_holder_item_id
     and other.placement_kind='grid'
     and other.id<>p_item_id
    cross join lateral private.cheburashka_inventory_shape_cells_v1(
      private.cheburashka_inventory_profile_for_item_v1(other.id),
      other.grid_rotation
    ) other_cell
    where p_grid_x+source_cell.cell_x=other.grid_x+other_cell.cell_x
      and p_grid_y+source_cell.cell_y=other.grid_y+other_cell.cell_y
  ) then raise exception 'Inventory placement overlaps another item'; end if;
end;
$function$;

create or replace function private.cheburashka_assert_surface_item_v1(p_item_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_item public.character_inventory_items%rowtype;
  v_terminal public.character_inventory_items%rowtype;
begin
  select * into v_item from public.character_inventory_items where id=p_item_id;
  if not found or v_item.surface_id is null then return; end if;

  if v_item.character_id is not null or v_item.world_storage_id is not null or v_item.equipped then
    raise exception 'Surface item owner state is invalid';
  end if;

  if v_item.holder_item_id is null then
    if v_item.placement_kind<>'surface' then
      raise exception 'Top-level surface item must use surface placement';
    end if;
    return;
  end if;

  if v_item.placement_kind not in ('grid','legacy') then
    raise exception 'Contained surface item must use grid or legacy placement';
  end if;

  with recursive chain as (
    select i.* ,0 depth
    from public.character_inventory_items i where i.id=p_item_id
    union all
    select parent.*,chain.depth+1
    from public.character_inventory_items parent
    join chain on parent.id=chain.holder_item_id
    where chain.depth<17
  )
  select * into v_terminal
  from chain
  where holder_item_id is null
  order by depth desc
  limit 1;

  if v_terminal.id is null
     or v_terminal.surface_id is distinct from v_item.surface_id
     or v_terminal.placement_kind<>'surface' then
    raise exception 'Surface item must remain connected to a top-level item on the same surface';
  end if;
end;
$function$;
revoke execute on function private.cheburashka_assert_surface_item_v1(uuid)
from public,anon,authenticated;

create or replace function private.cheburashka_validate_surface_item_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op<>'DELETE' and new.surface_id is not null then
    perform private.cheburashka_assert_surface_item_v1(new.id);
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;
revoke execute on function private.cheburashka_validate_surface_item_v1()
from public,anon,authenticated;

drop trigger if exists character_inventory_items_validate_surface_tree
on public.character_inventory_items;
create constraint trigger character_inventory_items_validate_surface_tree
after insert or delete or update of character_id,world_storage_id,surface_id,holder_item_id,placement_kind,category
on public.character_inventory_items
deferrable initially deferred
for each row execute function private.cheburashka_validate_surface_item_v1();

create or replace function private.assert_scene_surface_v1(p_surface_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_surface public.scene_surfaces%rowtype;
  v_room public.chat_rooms%rowtype;
begin
  select * into v_surface from public.scene_surfaces where id=p_surface_id;
  if not found then return; end if;

  select * into v_room from public.chat_rooms where id=v_surface.room_id;
  if not found or v_room.room_type<>'scene' or v_room.campaign_id<>v_surface.campaign_id then
    raise exception 'Surface must belong to a scene in the same campaign';
  end if;

  if exists(
    select 1
    from public.scene_surface_character_access a
    left join public.characters c on c.id=a.character_id
    left join public.scene_participants p
      on p.room_id=v_surface.room_id and p.character_id=a.character_id
    where a.surface_id=v_surface.id
      and (c.campaign_id is distinct from v_surface.campaign_id or p.character_id is null)
  ) then
    raise exception 'Selected Surface access must reference current scene participants';
  end if;
end;
$function$;
revoke execute on function private.assert_scene_surface_v1(uuid)
from public,anon,authenticated;

create or replace function private.validate_scene_surface_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  perform private.assert_scene_surface_v1(case when tg_op='DELETE' then old.id else new.id end);
  return case when tg_op='DELETE' then old else new end;
end;
$function$;
revoke execute on function private.validate_scene_surface_v1()
from public,anon,authenticated;

drop trigger if exists scene_surfaces_validate_integrity on public.scene_surfaces;
create constraint trigger scene_surfaces_validate_integrity
after insert or update on public.scene_surfaces
deferrable initially deferred
for each row execute function private.validate_scene_surface_v1();

create or replace function private.validate_scene_surface_access_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  perform private.assert_scene_surface_v1(
    case when tg_op='DELETE' then old.surface_id else new.surface_id end
  );
  return case when tg_op='DELETE' then old else new end;
end;
$function$;
revoke execute on function private.validate_scene_surface_access_v1()
from public,anon,authenticated;

drop trigger if exists scene_surface_character_access_validate
on public.scene_surface_character_access;
create constraint trigger scene_surface_character_access_validate
after insert or update or delete on public.scene_surface_character_access
deferrable initially deferred
for each row execute function private.validate_scene_surface_access_v1();

create or replace function private.can_access_scene_surface_v1(
  p_surface_id uuid,
  p_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.scene_surfaces s
    join public.chat_rooms r on r.id=s.room_id
    join public.characters c on c.id=p_character_id and c.campaign_id=s.campaign_id
    where s.id=p_surface_id
      and s.lifecycle_state='active'
      and r.room_type='scene'
      and r.scene_state='active'
      and (
        private.can_manage_campaign(s.campaign_id,p_user_id)
        or (
          private.can_operate_character_resources(p_character_id,p_user_id)
          and exists(
            select 1 from public.scene_participants p
            where p.room_id=s.room_id and p.character_id=p_character_id
          )
          and (
            s.access_mode='scene'
            or (
              s.access_mode='selected'
              and exists(
                select 1 from public.scene_surface_character_access a
                where a.surface_id=s.id and a.character_id=p_character_id
              )
            )
          )
        )
      )
  );
$function$;
revoke execute on function private.can_access_scene_surface_v1(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function private.can_read_scene_surface_v1(
  p_surface_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.scene_surfaces s
    where s.id=p_surface_id
      and (
        private.can_manage_campaign(s.campaign_id,p_user_id)
        or (
          s.lifecycle_state='active'
          and private.can_access_scene_surface_v1(
            s.id,
            private.active_character_for_user(s.campaign_id,p_user_id),
            p_user_id
          )
        )
      )
  );
$function$;
revoke execute on function private.can_read_scene_surface_v1(uuid,uuid)
from public,anon,authenticated;

alter table public.scene_surfaces enable row level security;
alter table public.scene_surface_character_access enable row level security;

drop policy if exists scene_surfaces_read on public.scene_surfaces;
create policy scene_surfaces_read on public.scene_surfaces
for select to authenticated
using (private.can_read_scene_surface_v1(id,auth.uid()));

drop policy if exists scene_surface_character_access_read on public.scene_surface_character_access;
create policy scene_surface_character_access_read on public.scene_surface_character_access
for select to authenticated
using (
  private.can_read_scene_surface_v1(surface_id,auth.uid())
  or exists(
    select 1 from public.scene_surfaces s
    where s.id=surface_id and private.can_manage_campaign(s.campaign_id,auth.uid())
  )
);

revoke insert,update,delete on public.scene_surfaces from anon,authenticated;
revoke insert,update,delete on public.scene_surface_character_access from anon,authenticated;
grant select on public.scene_surfaces to authenticated;
grant select on public.scene_surface_character_access to authenticated;

drop policy if exists character_inventory_surface_read on public.character_inventory_items;
create policy character_inventory_surface_read on public.character_inventory_items
for select to authenticated
using (
  surface_id is not null
  and private.can_read_scene_surface_v1(surface_id,auth.uid())
);

-- Scene membership itself now grants scene read/write according to room_state.
create or replace function private.can_read_chat_room(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.chat_rooms r
    join public.campaign_members cm
      on cm.campaign_id=r.campaign_id and cm.user_id=p_user_id
    left join public.characters c on c.id=r.character_id
    where r.id=p_room_id
      and (
        r.room_type='flood'
        or (
          (cm.is_owner=true or cm.role='gm')
          and (r.room_type<>'character' or private.can_view_character(r.character_id,p_user_id))
        )
        or (
          r.room_type in ('scene','character')
          and r.open_to_campaign=true
          and (r.room_type<>'character' or private.can_view_character(r.character_id,p_user_id))
        )
        or (r.room_type='character' and c.assigned_user_id=p_user_id)
        or (
          r.room_type='scene'
          and exists(
            select 1
            from public.scene_participants p
            join public.characters actor on actor.id=p.character_id
            where p.room_id=r.id
              and actor.assigned_user_id=p_user_id
              and private.active_character_for_user(r.campaign_id,p_user_id)=actor.id
          )
        )
        or exists(
          select 1 from public.chat_room_members crm
          where crm.room_id=r.id and crm.user_id=p_user_id and crm.can_read=true
        )
      )
  );
$function$;

create or replace function private.can_write_chat_room(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.chat_rooms r
    join public.campaign_members cm
      on cm.campaign_id=r.campaign_id and cm.user_id=p_user_id
    left join public.characters c on c.id=r.character_id
    where r.id=p_room_id
      and r.is_read_only=false
      and r.room_state<>'closed'
      and (
        (cm.is_owner=true or cm.role='gm')
        or (
          r.room_state='open'
          and (
            r.room_type='flood'
            or (r.room_type='scene' and r.campaign_can_write=true)
            or (
              r.room_type='scene'
              and exists(
                select 1
                from public.scene_participants p
                join public.characters actor on actor.id=p.character_id
                where p.room_id=r.id
                  and actor.assigned_user_id=p_user_id
                  and private.active_character_for_user(r.campaign_id,p_user_id)=actor.id
              )
            )
            or (r.room_type='character' and c.assigned_user_id=p_user_id)
            or exists(
              select 1 from public.chat_room_members crm
              where crm.room_id=r.id and crm.user_id=p_user_id and crm.can_write=true
            )
          )
        )
      )
  );
$function$;

create or replace function public.create_game_scene_v1(
  p_campaign_id uuid,
  p_title text,
  p_slug text default null,
  p_location_id uuid default null,
  p_campaign_day integer default 1,
  p_day_period text default 'day',
  p_room_state text default 'open',
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.engine_command_receipts%rowtype;
  v_room_id uuid;
  v_slug text;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_campaign(p_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if btrim(coalesce(p_title,''))='' then raise exception 'Scene title is required'; end if;
  if p_campaign_day<1 then raise exception 'Campaign day must be positive'; end if;
  if p_day_period not in ('dawn','morning','day','late_day','evening','night','deep_night') then
    raise exception 'Unsupported day period';
  end if;
  if p_room_state not in ('open','gm_only') then raise exception 'Unsupported initial room state'; end if;
  if p_location_id is not null and not exists(
    select 1 from public.locations l where l.id=p_location_id and l.campaign_id=p_campaign_id
  ) then raise exception 'Location belongs to another campaign'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));

  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'larisa'
       or v_existing.command_kind<>'world.scene_create' then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  v_slug := coalesce(
    nullif(btrim(p_slug),''),
    'scene-'||replace(p_command_id::text,'-','')
  );

  insert into public.chat_rooms(
    campaign_id,slug,title,category,room_type,character_id,
    open_to_campaign,is_read_only,room_state,campaign_can_write,
    location_id,campaign_day,day_period,scene_state
  )
  values(
    p_campaign_id,v_slug,btrim(p_title),'game','scene',null,
    false,false,p_room_state,false,
    p_location_id,p_campaign_day,p_day_period,'active'
  )
  returning id into v_room_id;

  v_result := jsonb_build_object(
    'roomId',v_room_id,'campaignId',p_campaign_id,'locationId',p_location_id
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,p_campaign_id,'larisa','world.scene_create',v_room_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;
revoke all on function public.create_game_scene_v1(uuid,text,text,uuid,integer,text,text,uuid)
from public,anon;
grant execute on function public.create_game_scene_v1(uuid,text,text,uuid,integer,text,text,uuid)
to authenticated;

create or replace function public.move_character_to_scene_v1(
  p_character_id uuid,
  p_room_id uuid,
  p_sync_location boolean default true,
  p_sync_time boolean default true,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_room public.chat_rooms%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null or not private.can_manage_campaign(v_campaign_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  if p_room_id is not null then
    select * into v_room from public.chat_rooms
    where id=p_room_id and campaign_id=v_campaign_id and room_type='scene' and scene_state='active';
    if not found then raise exception 'Target active scene not found'; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('scene-character:'||p_character_id::text,0)
  );

  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'larisa'
       or v_existing.command_kind<>'world.scene_move_character'
       or v_existing.aggregate_id<>p_character_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  delete from public.scene_participants p
  using public.chat_rooms r
  where p.room_id=r.id
    and p.character_id=p_character_id
    and r.campaign_id=v_campaign_id
    and r.room_type='scene';

  if p_room_id is not null then
    insert into public.scene_participants(room_id,character_id,added_by)
    values(p_room_id,p_character_id,auth.uid());

    if p_sync_location or p_sync_time then
      insert into public.character_world_state(
        character_id,campaign_id,location_id,campaign_day,day_period,updated_at,updated_by
      )
      values(
        p_character_id,v_campaign_id,
        case when p_sync_location then v_room.location_id else null end,
        case when p_sync_time then v_room.campaign_day else 1 end,
        case when p_sync_time then v_room.day_period else 'day' end,
        now(),auth.uid()
      )
      on conflict(character_id) do update set
        location_id=case when p_sync_location then v_room.location_id else public.character_world_state.location_id end,
        campaign_day=case when p_sync_time then v_room.campaign_day else public.character_world_state.campaign_day end,
        day_period=case when p_sync_time then v_room.day_period else public.character_world_state.day_period end,
        updated_at=now(),updated_by=auth.uid();
    end if;
  end if;

  v_result := jsonb_build_object(
    'characterId',p_character_id,
    'roomId',p_room_id,
    'locationId',case when p_room_id is null then null else v_room.location_id end
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_campaign_id,'larisa','world.scene_move_character',
    p_character_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;
revoke all on function public.move_character_to_scene_v1(uuid,uuid,boolean,boolean,uuid)
from public,anon;
grant execute on function public.move_character_to_scene_v1(uuid,uuid,boolean,boolean,uuid)
to authenticated;

create or replace function public.set_scene_participants(
  p_room_id uuid,
  p_character_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id
  from public.chat_rooms
  where id=p_room_id and room_type='scene' and scene_state='active';

  if v_campaign_id is null or not private.can_manage_campaign(v_campaign_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  if exists(
    select 1
    from unnest(coalesce(p_character_ids,'{}'::uuid[])) x(id)
    left join public.characters c on c.id=x.id and c.campaign_id=v_campaign_id
    where c.id is null
  ) then raise exception 'Participant belongs to another campaign'; end if;

  -- Characters selected for this scene leave any other current scene first.
  delete from public.scene_participants p
  using public.chat_rooms r
  where p.room_id=r.id
    and r.campaign_id=v_campaign_id
    and r.room_type='scene'
    and p.character_id=any(coalesce(p_character_ids,'{}'::uuid[]))
    and p.room_id<>p_room_id;

  delete from public.scene_participants where room_id=p_room_id;

  insert into public.scene_participants(room_id,character_id,added_by)
  select p_room_id,x.id,auth.uid()
  from unnest(coalesce(p_character_ids,'{}'::uuid[])) x(id)
  on conflict do nothing;
end;
$function$;

create or replace function public.set_chat_room_state(p_room_id uuid,p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_room_type text;
begin
  if p_state not in ('open','gm_only','closed') then raise exception 'Unsupported room state'; end if;
  select campaign_id,room_type into v_campaign_id,v_room_type
  from public.chat_rooms where id=p_room_id;
  if not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;

  update public.chat_rooms
  set room_state=p_state,
      closed_at=case when p_state='closed' then now() else null end,
      scene_state=case
        when room_type='scene' and p_state='closed' then 'closed'
        when room_type='scene' then 'active'
        else scene_state
      end,
      updated_at=now()
  where id=p_room_id;

  if v_room_type='scene' and p_state='closed' then
    delete from public.scene_participants where room_id=p_room_id;
  end if;
end;
$function$;

create or replace function public.create_scene_surface_v1(
  p_room_id uuid,
  p_name text,
  p_description text default '',
  p_access_mode text default 'gm',
  p_character_ids uuid[] default '{}'::uuid[],
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.chat_rooms%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_surface_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'Surface name is required'; end if;
  if p_access_mode not in ('scene','selected','gm') then raise exception 'Unsupported Surface access mode'; end if;

  select * into v_room from public.chat_rooms
  where id=p_room_id and room_type='scene' and scene_state='active';

  if not found or not private.can_manage_campaign(v_room.campaign_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  if p_access_mode='selected' and cardinality(coalesce(p_character_ids,'{}'::uuid[]))=0 then
    raise exception 'Selected Surface access requires at least one character';
  end if;

  if exists(
    select 1
    from unnest(coalesce(p_character_ids,'{}'::uuid[])) x(id)
    left join public.scene_participants p
      on p.room_id=p_room_id and p.character_id=x.id
    where p.character_id is null
  ) then raise exception 'Selected Surface character is not a current scene participant'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'larisa'
       or v_existing.command_kind<>'world.surface_create' then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  insert into public.scene_surfaces(
    campaign_id,room_id,name,description,access_mode,created_by
  )
  values(v_room.campaign_id,p_room_id,btrim(p_name),coalesce(p_description,''),p_access_mode,auth.uid())
  returning id into v_surface_id;

  if p_access_mode='selected' then
    insert into public.scene_surface_character_access(surface_id,character_id,granted_by)
    select v_surface_id,x.id,auth.uid()
    from unnest(p_character_ids) x(id)
    on conflict do nothing;
  end if;

  v_result := jsonb_build_object(
    'surfaceId',v_surface_id,'roomId',p_room_id,'accessMode',p_access_mode
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_room.campaign_id,'larisa','world.surface_create',
    v_surface_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;
revoke all on function public.create_scene_surface_v1(uuid,text,text,text,uuid[],uuid)
from public,anon;
grant execute on function public.create_scene_surface_v1(uuid,text,text,text,uuid[],uuid)
to authenticated;

create or replace function public.update_scene_surface_v1(
  p_surface_id uuid,
  p_name text,
  p_description text,
  p_access_mode text,
  p_character_ids uuid[],
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_surface public.scene_surfaces%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'Surface name is required'; end if;
  if p_access_mode not in ('scene','selected','gm') then raise exception 'Unsupported Surface access mode'; end if;

  select * into v_surface from public.scene_surfaces where id=p_surface_id for update;
  if not found or not private.can_manage_campaign(v_surface.campaign_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;
  if v_surface.version<>p_expected_version then
    raise exception 'Surface version conflict: expected %, current %',p_expected_version,v_surface.version;
  end if;

  if p_access_mode='selected' and cardinality(coalesce(p_character_ids,'{}'::uuid[]))=0 then
    raise exception 'Selected Surface access requires at least one character';
  end if;

  if exists(
    select 1
    from unnest(coalesce(p_character_ids,'{}'::uuid[])) x(id)
    left join public.scene_participants p
      on p.room_id=v_surface.room_id and p.character_id=x.id
    where p.character_id is null
  ) then raise exception 'Selected Surface character is not a current scene participant'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('surface:'||p_surface_id::text,0)
  );
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'larisa'
       or v_existing.command_kind<>'world.surface_update'
       or v_existing.aggregate_id<>p_surface_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  delete from public.scene_surface_character_access where surface_id=p_surface_id;
  if p_access_mode='selected' then
    insert into public.scene_surface_character_access(surface_id,character_id,granted_by)
    select p_surface_id,x.id,auth.uid()
    from unnest(p_character_ids) x(id)
    on conflict do nothing;
  end if;

  update public.scene_surfaces s
  set name=btrim(p_name),
      description=coalesce(p_description,''),
      access_mode=p_access_mode,
      version=s.version+1,
      updated_at=now()
  where s.id=p_surface_id
  returning to_jsonb(s) into v_result;

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_surface.campaign_id,'larisa','world.surface_update',
    p_surface_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;
revoke all on function public.update_scene_surface_v1(uuid,text,text,text,uuid[],bigint,uuid)
from public,anon;
grant execute on function public.update_scene_surface_v1(uuid,text,text,text,uuid[],bigint,uuid)
to authenticated;

create or replace function public.set_scene_surface_archived_v1(
  p_surface_id uuid,
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
  v_surface public.scene_surfaces%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  select * into v_surface from public.scene_surfaces where id=p_surface_id for update;
  if not found or not private.can_manage_campaign(v_surface.campaign_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;
  if v_surface.version<>p_expected_version then
    raise exception 'Surface version conflict: expected %, current %',p_expected_version,v_surface.version;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('surface:'||p_surface_id::text,0)
  );
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'larisa'
       or v_existing.command_kind<>'world.surface_archive'
       or v_existing.aggregate_id<>p_surface_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  update public.scene_surfaces s
  set lifecycle_state=case when p_archived then 'archived' else 'active' end,
      version=s.version+1,updated_at=now()
  where s.id=p_surface_id
  returning to_jsonb(s) into v_result;

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_surface.campaign_id,'larisa','world.surface_archive',
    p_surface_id,v_result,auth.uid()
  );
  return v_result;
end;
$function$;
revoke all on function public.set_scene_surface_archived_v1(uuid,boolean,bigint,uuid)
from public,anon;
grant execute on function public.set_scene_surface_archived_v1(uuid,boolean,bigint,uuid)
to authenticated;

create or replace function public.list_accessible_scene_surfaces_v1(p_character_id uuid)
returns table(
  id uuid,
  campaign_id uuid,
  room_id uuid,
  name text,
  description text,
  access_mode text,
  lifecycle_state text,
  version bigint,
  item_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
begin
  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;
  if not (
    private.can_operate_character_resources(p_character_id,auth.uid())
    or private.can_manage_campaign(v_campaign_id,auth.uid())
  ) then raise exception 'Not allowed'; end if;

  return query
  select s.id,s.campaign_id,s.room_id,s.name,s.description,s.access_mode,
         s.lifecycle_state,s.version,
         (
           select count(*)
           from public.character_inventory_items i
           where i.surface_id=s.id and i.holder_item_id is null
         )::bigint
  from public.scene_surfaces s
  where s.campaign_id=v_campaign_id
    and s.lifecycle_state='active'
    and private.can_access_scene_surface_v1(s.id,p_character_id,auth.uid())
  order by s.created_at,s.id;
end;
$function$;
revoke all on function public.list_accessible_scene_surfaces_v1(uuid)
from public,anon;
grant execute on function public.list_accessible_scene_surfaces_v1(uuid)
to authenticated;

create or replace function public.list_scene_surface_items_v1(p_surface_id uuid)
returns table(item jsonb,inventory_profile jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_read_scene_surface_v1(p_surface_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  return query
  select to_jsonb(i),private.cheburashka_inventory_profile_for_item_v1(i.id)
  from public.character_inventory_items i
  where i.surface_id=p_surface_id
  order by
    case when i.holder_item_id is null then 0 else 1 end,
    i.sort_order,i.created_at,i.id;
end;
$function$;
revoke all on function public.list_scene_surface_items_v1(uuid)
from public,anon;
grant execute on function public.list_scene_surface_items_v1(uuid)
to authenticated;

create or replace function public.get_inventory_item_v2(p_item_id uuid)
returns table(item jsonb,inventory_profile jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_item public.character_inventory_items%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_item from public.character_inventory_items where id=p_item_id;
  if not found then return; end if;

  if v_item.character_id is not null then
    if not private.can_view_character(v_item.character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  elsif v_item.world_storage_id is not null then
    if not private.can_view_world_storage_v1(v_item.world_storage_id,auth.uid()) then raise exception 'Not allowed'; end if;
  elsif v_item.surface_id is not null then
    if not private.can_read_scene_surface_v1(v_item.surface_id,auth.uid()) then raise exception 'Not allowed'; end if;
  else
    raise exception 'Inventory item has no owner scope';
  end if;

  return query
  select to_jsonb(v_item),private.cheburashka_inventory_profile_for_item_v1(v_item.id);
end;
$function$;

create or replace function public.create_surface_inventory_item_v1(
  p_surface_id uuid,
  p_input jsonb,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_surface public.scene_surfaces%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_name text;
  v_quantity integer;
  v_weight numeric;
  v_category text;
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
  v_item_id uuid;
  v_after jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Inventory input must be an object'; end if;

  select * into v_surface from public.scene_surfaces
  where id=p_surface_id and lifecycle_state='active';

  if not found or not private.can_manage_campaign(v_surface.campaign_id,auth.uid()) then
    raise exception 'Only GM can create Surface items';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('surface:'||p_surface_id::text,0)
  );

  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'cheburashka'
       or v_existing.command_kind<>'inventory.surface_create' then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  v_name:=btrim(coalesce(p_input->>'name',''));
  v_quantity:=coalesce(nullif(p_input->>'quantity','')::integer,1);
  v_weight:=nullif(p_input->>'weight','')::numeric;
  v_category:=coalesce(nullif(btrim(p_input->>'category'),''),'other');
  v_image_url:=nullif(btrim(p_input->>'image_url'),'');
  v_description:=coalesce(p_input->>'description','');
  v_definition_id:=nullif(p_input->>'definition_id','')::uuid;
  v_definition_revision:=nullif(p_input->>'definition_revision','')::integer;
  v_mechanics:=coalesce(p_input->'mechanics','[]'::jsonb);
  v_usage_mode:=coalesce(
    nullif(btrim(p_input->>'usage_mode'),''),
    case when v_category='consumable' then 'quantity' else 'none' end
  );
  v_item_state:=coalesce(p_input->'item_state','{}'::jsonb);

  if v_name='' then raise exception 'Item name is required'; end if;
  if v_quantity<1 then raise exception 'Inventory quantity must be at least 1'; end if;
  if v_weight is not null and v_weight<0 then raise exception 'Inventory weight cannot be negative'; end if;
  if v_category not in ('equipment','consumable','tool','book','trinket','quest','material','currency','container','other') then
    raise exception 'Unsupported inventory category';
  end if;
  if jsonb_typeof(v_mechanics)<>'array' then raise exception 'Inventory mechanics must be an array'; end if;
  if jsonb_typeof(v_item_state)<>'object' then raise exception 'Inventory item state must be an object'; end if;
  if v_usage_mode not in ('none','quantity','charges') then raise exception 'Unsupported inventory usage mode'; end if;

  if v_usage_mode='charges' then
    v_charges_max:=greatest(1,coalesce(nullif(p_input->>'charges_max','')::integer,1));
    v_charges_current:=greatest(0,least(v_charges_max,coalesce(nullif(p_input->>'charges_current','')::integer,v_charges_max)));
  else
    v_charges_max:=null;
    v_charges_current:=null;
  end if;

  v_stack_mode:=private.cheburashka_inventory_stack_mode_v1(
    p_input->>'stack_mode',v_category,v_usage_mode,v_quantity
  );

  perform private.cheburashka_assert_inventory_definition_scope_v3(
    null,null,p_surface_id,v_definition_id,v_definition_revision
  );

  insert into public.character_inventory_items(
    character_id,world_storage_id,surface_id,name,quantity,weight,equipped,
    category,equipment_slot,image_url,description,definition_id,definition_revision,
    mechanics,usage_mode,charges_current,charges_max,item_state,stack_mode,
    holder_item_id,placement_kind,placement_index,grid_x,grid_y,grid_rotation
  )
  values(
    null,null,p_surface_id,v_name,v_quantity,v_weight,false,
    v_category,null,v_image_url,v_description,v_definition_id,v_definition_revision,
    v_mechanics,v_usage_mode,v_charges_current,v_charges_max,v_item_state,v_stack_mode,
    null,'surface',null,null,null,0
  )
  returning id,to_jsonb(character_inventory_items) into v_item_id,v_after;

  update public.scene_surfaces
  set version=version+1,updated_at=now()
  where id=p_surface_id;

  v_result:=jsonb_build_object(
    'itemId',v_item_id,
    'affectedCharacterIds','[]'::jsonb,
    'affectedSurfaceIds',jsonb_build_array(p_surface_id),
    'affectedSceneIds',jsonb_build_array(v_surface.room_id),
    'before',null,
    'after',v_after
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_surface.campaign_id,'cheburashka','inventory.surface_create',
    v_item_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;
revoke all on function public.create_surface_inventory_item_v1(uuid,jsonb,uuid)
from public,anon;
grant execute on function public.create_surface_inventory_item_v1(uuid,jsonb,uuid)
to authenticated;

create or replace function public.place_inventory_item_on_surface_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_surface_id uuid,
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
  v_surface public.scene_surfaces%rowtype;
  v_source public.character_inventory_items%rowtype;
  v_destination public.character_inventory_items%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_after jsonb:='null'::jsonb;
  v_destination_json jsonb:='null'::jsonb;
  v_result jsonb;
  v_subtree_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount<1 or p_amount>10000 then
    raise exception 'Inventory amount must be between 1 and 10000';
  end if;

  select * into v_surface from public.scene_surfaces
  where id=p_surface_id and lifecycle_state='active';
  if not found then raise exception 'Surface not found'; end if;

  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if not private.can_access_scene_surface_v1(p_surface_id,p_character_id,auth.uid()) then
    raise exception 'Character cannot access this Surface';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory:'||p_character_id::text,0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('surface:'||p_surface_id::text,0)
  );

  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'cheburashka'
       or v_existing.command_kind<>'inventory.place_surface'
       or v_existing.aggregate_id<>p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select * into v_source
  from public.character_inventory_items
  where id=p_item_id and character_id=p_character_id
    and world_storage_id is null and surface_id is null
  for update;

  if not found then raise exception 'Inventory item not found for source character'; end if;
  if v_source.version<>p_expected_version then
    raise exception 'Inventory version conflict: expected %, current %',p_expected_version,v_source.version;
  end if;
  if v_source.quantity<p_amount then raise exception 'Not enough item quantity'; end if;
  if coalesce(v_source.stack_mode,'instance')='instance' and p_amount<>v_source.quantity then
    raise exception 'Inventory instance cannot be split';
  end if;
  if v_source.equipped then
    raise exception 'Equipped inventory item requires a real unequip destination';
  end if;

  v_before:=to_jsonb(v_source);

  if v_source.quantity=p_amount then
    with recursive subtree as (
      select i.id from public.character_inventory_items i where i.id=p_item_id
      union all
      select child.id
      from public.character_inventory_items child
      join subtree on child.holder_item_id=subtree.id
    )
    select array_agg(id) into v_subtree_ids from subtree;

    perform 1 from public.character_inventory_items i
    where i.id=any(v_subtree_ids) order by i.id for update;

    update public.character_inventory_items i
    set character_id=null,world_storage_id=null,surface_id=p_surface_id,
        holder_item_id=null,placement_kind='surface',placement_index=null,
        grid_x=null,grid_y=null,grid_rotation=0,equipped=false
    where i.id=p_item_id
    returning * into v_destination;

    update public.character_inventory_items i
    set character_id=null,world_storage_id=null,surface_id=p_surface_id,equipped=false
    where i.id=any(v_subtree_ids) and i.id<>p_item_id;

    v_destination_json:=to_jsonb(v_destination);
  else
    update public.character_inventory_items i
    set quantity=i.quantity-p_amount
    where i.id=p_item_id
    returning to_jsonb(i) into v_after;

    insert into public.character_inventory_items(
      character_id,world_storage_id,surface_id,name,quantity,weight,equipped,
      image_url,description,sort_order,category,equipment_slot,mechanics,
      definition_id,definition_revision,usage_mode,charges_current,charges_max,
      item_state,stack_mode,holder_item_id,placement_kind,placement_index,
      grid_x,grid_y,grid_rotation
    )
    values(
      null,null,p_surface_id,v_source.name,p_amount,v_source.weight,false,
      v_source.image_url,v_source.description,v_source.sort_order,v_source.category,
      v_source.equipment_slot,v_source.mechanics,v_source.definition_id,
      v_source.definition_revision,v_source.usage_mode,v_source.charges_current,
      v_source.charges_max,v_source.item_state,v_source.stack_mode,
      null,'surface',null,null,null,0
    )
    returning * into v_destination;

    v_destination_json:=to_jsonb(v_destination);
  end if;

  update public.scene_surfaces
  set version=version+1,updated_at=now()
  where id=p_surface_id;

  v_result:=jsonb_build_object(
    'itemId',p_item_id,
    'affectedCharacterIds',jsonb_build_array(p_character_id),
    'affectedSurfaceIds',jsonb_build_array(p_surface_id),
    'affectedSceneIds',jsonb_build_array(v_surface.room_id),
    'before',v_before,'after',v_after,'destinationItem',v_destination_json
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_surface.campaign_id,'cheburashka','inventory.place_surface',
    p_item_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;
revoke all on function public.place_inventory_item_on_surface_v1(uuid,uuid,uuid,integer,bigint,uuid)
from public,anon;
grant execute on function public.place_inventory_item_on_surface_v1(uuid,uuid,uuid,integer,bigint,uuid)
to authenticated;

create or replace function public.take_inventory_item_from_surface_v1(
  p_surface_id uuid,
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
  v_surface public.scene_surfaces%rowtype;
  v_source public.character_inventory_items%rowtype;
  v_destination public.character_inventory_items%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_before jsonb;
  v_after jsonb:='null'::jsonb;
  v_destination_json jsonb:='null'::jsonb;
  v_result jsonb;
  v_subtree_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount<1 or p_amount>10000 then
    raise exception 'Inventory amount must be between 1 and 10000';
  end if;
  if p_target_kind not in ('root','grid','hand','external') then
    raise exception 'Unsupported inventory placement kind';
  end if;

  select * into v_surface from public.scene_surfaces
  where id=p_surface_id and lifecycle_state='active';
  if not found then raise exception 'Surface not found'; end if;

  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if not private.can_access_scene_surface_v1(p_surface_id,p_character_id,auth.uid()) then
    raise exception 'Character cannot access this Surface';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inventory:'||p_character_id::text,0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('surface:'||p_surface_id::text,0)
  );

  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'cheburashka'
       or v_existing.command_kind<>'inventory.take_surface'
       or v_existing.aggregate_id<>p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select * into v_source
  from public.character_inventory_items
  where id=p_item_id and surface_id=p_surface_id
    and character_id is null and world_storage_id is null
  for update;

  if not found then
    raise exception 'surface.item_already_taken';
  end if;
  if v_source.version<>p_expected_version then
    raise exception 'surface.item_stale';
  end if;
  if v_source.quantity<p_amount then raise exception 'Not enough item quantity'; end if;
  if coalesce(v_source.stack_mode,'instance')='instance' and p_amount<>v_source.quantity then
    raise exception 'Inventory instance cannot be split';
  end if;

  v_before:=to_jsonb(v_source);

  if v_source.quantity=p_amount then
    with recursive subtree as (
      select i.id from public.character_inventory_items i where i.id=p_item_id
      union all
      select child.id
      from public.character_inventory_items child
      join subtree on child.holder_item_id=subtree.id
    )
    select array_agg(id) into v_subtree_ids from subtree;

    perform 1 from public.character_inventory_items i
    where i.id=any(v_subtree_ids) order by i.id for update;

    update public.character_inventory_items i
    set character_id=p_character_id,world_storage_id=null,surface_id=null,
        holder_item_id=case when p_target_kind='grid' then p_holder_item_id else null end,
        placement_kind=p_target_kind,
        placement_index=case when p_target_kind in ('hand','external') then p_slot_index else null end,
        grid_x=case when p_target_kind='grid' then p_grid_x else null end,
        grid_y=case when p_target_kind='grid' then p_grid_y else null end,
        grid_rotation=case when p_target_kind='grid' then coalesce(p_rotation,0) else 0 end,
        equipped=false
    where i.id=p_item_id
    returning * into v_destination;

    update public.character_inventory_items i
    set character_id=p_character_id,world_storage_id=null,surface_id=null,equipped=false
    where i.id=any(v_subtree_ids) and i.id<>p_item_id;

    perform private.cheburashka_assert_spatial_placement_v1(
      p_character_id,p_item_id,p_target_kind,
      case when p_target_kind='grid' then p_holder_item_id else null end,
      case when p_target_kind='grid' then p_grid_x else null end,
      case when p_target_kind='grid' then p_grid_y else null end,
      case when p_target_kind='grid' then coalesce(p_rotation,0) else 0 end,
      case when p_target_kind in ('hand','external') then p_slot_index else null end
    );

    v_destination_json:=to_jsonb(v_destination);
  else
    update public.character_inventory_items i
    set quantity=i.quantity-p_amount
    where i.id=p_item_id
    returning to_jsonb(i) into v_after;

    insert into public.character_inventory_items(
      character_id,world_storage_id,surface_id,name,quantity,weight,equipped,
      image_url,description,sort_order,category,equipment_slot,mechanics,
      definition_id,definition_revision,usage_mode,charges_current,charges_max,
      item_state,stack_mode,holder_item_id,placement_kind,placement_index,
      grid_x,grid_y,grid_rotation
    )
    values(
      p_character_id,null,null,v_source.name,p_amount,v_source.weight,false,
      v_source.image_url,v_source.description,v_source.sort_order,v_source.category,
      v_source.equipment_slot,v_source.mechanics,v_source.definition_id,
      v_source.definition_revision,v_source.usage_mode,v_source.charges_current,
      v_source.charges_max,v_source.item_state,v_source.stack_mode,
      case when p_target_kind='grid' then p_holder_item_id else null end,
      p_target_kind,
      case when p_target_kind in ('hand','external') then p_slot_index else null end,
      case when p_target_kind='grid' then p_grid_x else null end,
      case when p_target_kind='grid' then p_grid_y else null end,
      case when p_target_kind='grid' then coalesce(p_rotation,0) else 0 end
    )
    returning * into v_destination;

    perform private.cheburashka_assert_spatial_placement_v1(
      p_character_id,v_destination.id,p_target_kind,
      case when p_target_kind='grid' then p_holder_item_id else null end,
      case when p_target_kind='grid' then p_grid_x else null end,
      case when p_target_kind='grid' then p_grid_y else null end,
      case when p_target_kind='grid' then coalesce(p_rotation,0) else 0 end,
      case when p_target_kind in ('hand','external') then p_slot_index else null end
    );

    v_destination_json:=to_jsonb(v_destination);
  end if;

  perform private.cheburashka_assert_character_external_capacity_v1(p_character_id);

  update public.scene_surfaces
  set version=version+1,updated_at=now()
  where id=p_surface_id;

  v_result:=jsonb_build_object(
    'itemId',p_item_id,
    'affectedCharacterIds',jsonb_build_array(p_character_id),
    'affectedSurfaceIds',jsonb_build_array(p_surface_id),
    'affectedSceneIds',jsonb_build_array(v_surface.room_id),
    'before',v_before,'after',v_after,'destinationItem',v_destination_json
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_surface.campaign_id,'cheburashka','inventory.take_surface',
    p_item_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;
revoke all on function public.take_inventory_item_from_surface_v1(uuid,uuid,uuid,integer,text,uuid,integer,integer,integer,integer,bigint,uuid)
from public,anon;
grant execute on function public.take_inventory_item_from_surface_v1(uuid,uuid,uuid,integer,text,uuid,integer,integer,integer,integer,bigint,uuid)
to authenticated;

-- Realtime only signals that clients should refetch canonical state. It never
-- decides who won a claim.
do $publication$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='scene_surfaces'
  ) then
    execute 'alter publication supabase_realtime add table public.scene_surfaces';
  end if;
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='scene_surface_character_access'
  ) then
    execute 'alter publication supabase_realtime add table public.scene_surface_character_access';
  end if;
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='scene_participants'
  ) then
    execute 'alter publication supabase_realtime add table public.scene_participants';
  end if;
end
$publication$;
