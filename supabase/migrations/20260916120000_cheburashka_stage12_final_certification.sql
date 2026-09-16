-- Inventory Stage 12: final security/concurrency/E2E certification hardening.
-- Keep the shared production client compatible while making every new authored
-- inventory row definition-backed before it can become canonical state.

create or replace function private.cheburashka_legacy_authored_profile_v1(
  p_category text,
  p_stack_mode text,
  p_quantity integer,
  p_weight numeric
)
returns jsonb
language plpgsql
immutable
set search_path=''
as $function$
declare
  v_category text := coalesce(nullif(btrim(p_category),''),'other');
  v_stack text := coalesce(nullif(btrim(p_stack_mode),''),'instance');
  v_quantity integer := greatest(1,coalesce(p_quantity,1));
  v_profile jsonb;
begin
  if v_stack='stack' then
    v_profile:=jsonb_build_object(
      'semantic_role','legacy.bulk.'||v_category,
      'packing_mode','bulk_stack',
      'footprint_mode','compact_1x1',
      'shape_mask',jsonb_build_array('1'),
      'shape_width',1,
      'shape_height',1,
      'rotatable',false,
      'stack_max',greatest(20,v_quantity)
    );
  else
    v_profile:=jsonb_build_object(
      'semantic_role',case when v_category='container' then 'container.legacy' else 'legacy.'||v_category end,
      'packing_mode','instance',
      'footprint_mode','compact_1x1',
      'shape_mask',jsonb_build_array('1'),
      'shape_width',1,
      'shape_height',1,
      'rotatable',false,
      'stack_max',null
    );
  end if;

  if p_weight is not null then
    v_profile:=v_profile||jsonb_build_object('weight_per_unit',p_weight);
  end if;

  if v_category='container' then
    v_profile:=v_profile||jsonb_build_object(
      'container_profile',jsonb_build_object(
        'internal_grid_width',6,
        'internal_grid_height',6,
        'cell_size_cm',5,
        'allow_nested_containers',true,
        'external_carry_slots',0,
        'specialized_capacity','[]'::jsonb
      )
    );
  end if;

  perform private.cheburashka_assert_inventory_profile_v1(v_profile);
  return v_profile;
end;
$function$;

revoke all on function private.cheburashka_legacy_authored_profile_v1(text,text,integer,numeric)
from public,anon,authenticated;

create or replace function private.cheburashka_bind_definition_on_authoring_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_campaign_id uuid;
  v_profile jsonb;
  v_definition_id uuid;
  v_definition_revision integer;
  v_input jsonb;
begin
  if new.definition_id is not null then
    return new;
  end if;

  -- Stage 11 intentionally preserved a small set of narrative rows. Gameplay
  -- changes must not silently redefine them; actual authoring changes may.
  if tg_op='UPDATE'
     and old.definition_id is null
     and coalesce((old.item_state->>'stage11_intentional_narrative')::boolean,false)
     and new.name is not distinct from old.name
     and new.weight is not distinct from old.weight
     and new.category is not distinct from old.category
     and new.equipment_slot is not distinct from old.equipment_slot
     and new.description is not distinct from old.description
     and new.mechanics is not distinct from old.mechanics
     and new.usage_mode is not distinct from old.usage_mode
     and new.charges_max is not distinct from old.charges_max
     and new.stack_mode is not distinct from old.stack_mode
  then
    return new;
  end if;

  if new.character_id is not null then
    select c.campaign_id into v_campaign_id
    from public.characters c
    where c.id=new.character_id;
  elsif new.world_storage_id is not null then
    select s.campaign_id into v_campaign_id
    from public.world_storages s
    where s.id=new.world_storage_id;
  elsif new.surface_id is not null then
    select s.campaign_id into v_campaign_id
    from public.scene_surfaces s
    where s.id=new.surface_id;
  end if;

  if v_campaign_id is null then
    raise exception 'Inventory authoring owner campaign cannot be resolved';
  end if;

  v_profile:=private.cheburashka_legacy_authored_profile_v1(
    new.category,new.stack_mode,new.quantity,new.weight
  );

  v_input:=jsonb_build_object(
    'name',new.name,
    'quantity',new.quantity,
    'weight',new.weight,
    'equipped',new.equipped,
    'category',new.category,
    'equipment_slot',new.equipment_slot,
    'image_url',new.image_url,
    'description',new.description,
    'mechanics',new.mechanics,
    'usage_mode',new.usage_mode,
    'charges_current',new.charges_current,
    'charges_max',new.charges_max,
    'stack_mode',new.stack_mode,
    'item_state',new.item_state
  );

  select r.definition_id,r.definition_revision
  into v_definition_id,v_definition_revision
  from private.cheburashka_resolve_authored_definition_v1(
    v_campaign_id,v_input,v_profile,new.id
  ) r;

  new.definition_id:=v_definition_id;
  new.definition_revision:=v_definition_revision;
  return new;
end;
$function$;

revoke all on function private.cheburashka_bind_definition_on_authoring_v1()
from public,anon,authenticated;

drop trigger if exists character_inventory_items_stage12_bind_definition
on public.character_inventory_items;

create trigger character_inventory_items_stage12_bind_definition
before insert or update of
  name,weight,category,equipment_slot,description,mechanics,usage_mode,
  charges_max,stack_mode,definition_id,definition_revision
on public.character_inventory_items
for each row
execute function private.cheburashka_bind_definition_on_authoring_v1();

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_definition_required_or_narrative_check;

alter table public.character_inventory_items
  add constraint character_inventory_items_definition_required_or_narrative_check
  check (
    definition_id is not null
    or coalesce((item_state->>'stage11_intentional_narrative')::boolean,false)
  );

-- RLS helpers deliberately expose only "current caller" predicates. The raw
-- two-argument authority helpers remain private implementation details.
create or replace function private.rls_can_view_character_v1(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select private.can_view_character(p_character_id,auth.uid());
$function$;

create or replace function private.rls_can_read_scene_surface_v1(p_surface_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select private.can_read_scene_surface_v1(p_surface_id,auth.uid());
$function$;

create or replace function private.rls_can_manage_campaign_v1(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select private.can_manage_campaign(p_campaign_id,auth.uid());
$function$;

create or replace function private.rls_can_view_world_storage_v1(p_world_storage_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select private.can_view_world_storage_v1(p_world_storage_id,auth.uid());
$function$;

create or replace function private.rls_can_read_trade_session_v1(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select private.can_read_trade_session_v1(p_session_id,auth.uid());
$function$;

revoke all on function private.rls_can_view_character_v1(uuid) from public,anon;
revoke all on function private.rls_can_read_scene_surface_v1(uuid) from public,anon;
revoke all on function private.rls_can_manage_campaign_v1(uuid) from public,anon;
revoke all on function private.rls_can_view_world_storage_v1(uuid) from public,anon;
revoke all on function private.rls_can_read_trade_session_v1(uuid) from public,anon;

grant execute on function private.rls_can_view_character_v1(uuid) to authenticated;
grant execute on function private.rls_can_read_scene_surface_v1(uuid) to authenticated;
grant execute on function private.rls_can_manage_campaign_v1(uuid) to authenticated;
grant execute on function private.rls_can_view_world_storage_v1(uuid) to authenticated;
grant execute on function private.rls_can_read_trade_session_v1(uuid) to authenticated;

alter function private.can_manage_campaign(uuid,uuid) set search_path='';

drop policy if exists character_inventory_read on public.character_inventory_items;
drop policy if exists character_inventory_surface_read on public.character_inventory_items;

create policy character_inventory_read
on public.character_inventory_items
for select
to authenticated
using (
  private.rls_can_view_character_v1(character_id)
  or (
    surface_id is not null
    and private.rls_can_read_scene_surface_v1(surface_id)
  )
);

drop policy if exists world_storages_read on public.world_storages;
create policy world_storages_read
on public.world_storages
for select
to authenticated
using (private.rls_can_view_world_storage_v1(id));

drop policy if exists scene_surfaces_read on public.scene_surfaces;
create policy scene_surfaces_read
on public.scene_surfaces
for select
to authenticated
using (private.rls_can_read_scene_surface_v1(id));

drop policy if exists scene_surface_character_access_read
on public.scene_surface_character_access;
create policy scene_surface_character_access_read
on public.scene_surface_character_access
for select
to authenticated
using (
  private.rls_can_read_scene_surface_v1(surface_id)
  or exists(
    select 1
    from public.scene_surfaces s
    where s.id=scene_surface_character_access.surface_id
      and private.rls_can_manage_campaign_v1(s.campaign_id)
  )
);

drop policy if exists trade_sessions_read on public.trade_sessions;
create policy trade_sessions_read
on public.trade_sessions
for select
to authenticated
using (private.rls_can_read_trade_session_v1(id));

drop policy if exists trade_visible_items_read on public.trade_visible_items;
create policy trade_visible_items_read
on public.trade_visible_items
for select
to authenticated
using (private.rls_can_read_trade_session_v1(session_id));

drop policy if exists trade_interest_marks_read on public.trade_interest_marks;
create policy trade_interest_marks_read
on public.trade_interest_marks
for select
to authenticated
using (private.rls_can_read_trade_session_v1(session_id));

drop policy if exists trade_offer_lines_read on public.trade_offer_lines;
create policy trade_offer_lines_read
on public.trade_offer_lines
for select
to authenticated
using (private.rls_can_read_trade_session_v1(session_id));

drop policy if exists trade_messages_read on public.trade_messages;
create policy trade_messages_read
on public.trade_messages
for select
to authenticated
using (private.rls_can_read_trade_session_v1(session_id));

drop policy if exists trade_events_read on public.trade_events;
create policy trade_events_read
on public.trade_events
for select
to authenticated
using (private.rls_can_read_trade_session_v1(session_id));

-- Direct writes stay sealed. Authenticated clients mutate through canonical RPCs.
revoke insert,update,delete on table public.character_inventory_items from anon,authenticated;
revoke insert,update,delete on table public.world_storages from anon,authenticated;
revoke insert,update,delete on table public.scene_surfaces from anon,authenticated;
revoke insert,update,delete on table public.scene_surface_character_access from anon,authenticated;
revoke insert,update,delete on table public.trade_sessions from anon,authenticated;
revoke insert,update,delete on table public.trade_offer_lines from anon,authenticated;
revoke insert,update,delete on table public.trade_visible_items from anon,authenticated;
revoke insert,update,delete on table public.trade_interest_marks from anon,authenticated;
revoke insert,update,delete on table public.trade_messages from anon,authenticated;
revoke insert,update,delete on table public.trade_events from anon,authenticated;

-- v1 stays executable only where the still-deployed main client needs it.
-- v2 create/update were transitional internal bridges and no current client calls them.
revoke execute on function public.create_inventory_item_v2(uuid,jsonb,uuid)
from public,anon,authenticated;
revoke execute on function public.update_inventory_item_v2(uuid,uuid,jsonb,bigint,uuid)
from public,anon,authenticated;

-- Foreign-key indexes reported by the live Supabase advisor.
create index if not exists character_inventory_items_definition_revision_idx
  on public.character_inventory_items(definition_id,definition_revision)
  where definition_id is not null;
create index if not exists scene_surfaces_campaign_id_idx
  on public.scene_surfaces(campaign_id);
create index if not exists trade_events_actor_character_id_idx
  on public.trade_events(actor_character_id)
  where actor_character_id is not null;
create index if not exists trade_interest_marks_interested_character_id_idx
  on public.trade_interest_marks(interested_character_id);
create index if not exists trade_interest_marks_item_id_idx
  on public.trade_interest_marks(item_id);
create index if not exists trade_messages_actor_character_id_idx
  on public.trade_messages(actor_character_id)
  where actor_character_id is not null;
create index if not exists trade_offer_lines_owner_character_id_idx
  on public.trade_offer_lines(owner_character_id);
create index if not exists trade_sessions_campaign_id_idx
  on public.trade_sessions(campaign_id);
create index if not exists trade_sessions_side_a_character_id_idx
  on public.trade_sessions(side_a_character_id);
create index if not exists trade_sessions_side_b_character_id_idx
  on public.trade_sessions(side_b_character_id);
create index if not exists trade_visible_items_item_id_idx
  on public.trade_visible_items(item_id);
create index if not exists trade_visible_items_owner_character_id_idx
  on public.trade_visible_items(owner_character_id);
create index if not exists world_storages_location_id_idx
  on public.world_storages(location_id);
