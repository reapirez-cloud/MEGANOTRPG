-- Cheburashka Stage 7: kilograms, load integrity and authoritative specialized capacity.
-- Canonical inventory mass unit is kilogram. Legacy non-null item weights were stored
-- using the old D&D-facing pound values and are converted once with an audit marker.

comment on column public.character_inventory_items.weight is
  'Canonical per-unit item mass in kilograms. Stack mass = weight * quantity. NULL means unknown, never zero.';

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_weight_nonnegative,
  add constraint character_inventory_items_weight_nonnegative
    check (weight is null or weight >= 0);

update public.character_inventory_items item
set
  weight = round(item.weight * 0.45359237, 3),
  item_state = jsonb_set(
    jsonb_set(
      coalesce(item.item_state, '{}'::jsonb),
      '{stage7_weight_unit}',
      '"kg"'::jsonb,
      true
    ),
    '{stage7_weight_migrated_from}',
    '"legacy_lb"'::jsonb,
    true
  ),
  version = item.version + 1,
  updated_at = now()
where item.weight is not null
  and coalesce(item.item_state->>'stage7_weight_unit', '') <> 'kg';

-- Chasovoy revisions are immutable. Convert legacy definition-level weight by
-- creating a new revision rather than rewriting history. Existing issued items
-- remain pinned to their old definition revision but already have canonical kg
-- mass on the Cheburashka instance.
do $block$
declare
  v_row record;
  v_kg numeric;
  v_data jsonb;
  v_profile jsonb;
  v_revision integer;
begin
  for v_row in
    select
      definition.id,
      definition.current_revision,
      revision.name,
      revision.summary,
      revision.rules_text,
      revision.mechanics,
      revision.data,
      revision.created_by
    from public.reference_definitions definition
    join public.reference_definition_revisions revision
      on revision.definition_id = definition.id
     and revision.revision = definition.current_revision
    where definition.kind = 'item'
      and jsonb_typeof(revision.data->'weight') = 'number'
      and coalesce(revision.data->>'weight_unit', '') <> 'kg'
  loop
    v_kg := round((v_row.data->>'weight')::numeric * 0.45359237, 3);
    v_data := jsonb_set(v_row.data, '{weight}', to_jsonb(v_kg), true);
    v_data := jsonb_set(v_data, '{weight_unit}', '"kg"'::jsonb, true);
    v_profile := v_data->'inventory_profile';

    if v_profile is not null and jsonb_typeof(v_profile) = 'object' then
      v_profile := jsonb_set(v_profile, '{weight_per_unit}', to_jsonb(v_kg), true);
      perform private.cheburashka_assert_inventory_profile_v1(v_profile);
      v_data := jsonb_set(v_data, '{inventory_profile}', v_profile, true);
    end if;

    v_revision := v_row.current_revision + 1;

    insert into public.reference_definition_revisions(
      definition_id, revision, name, summary, rules_text,
      mechanics, data, created_by
    )
    values(
      v_row.id, v_revision, v_row.name, v_row.summary, v_row.rules_text,
      v_row.mechanics, v_data, v_row.created_by
    );

    update public.reference_definitions
    set current_revision = v_revision, updated_at = now()
    where id = v_row.id;
  end loop;
end;
$block$;

create or replace function private.cheburashka_assert_specialized_capacity_v1(
  p_holder_item_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_container jsonb;
  v_rule jsonb;
  v_role text;
  v_max integer;
  v_quantity bigint;
begin
  if p_holder_item_id is null then return; end if;

  v_container :=
    private.cheburashka_inventory_profile_for_item_v1(p_holder_item_id)
    -> 'container_profile';

  if v_container is null or jsonb_typeof(v_container) <> 'object' then
    return;
  end if;

  for v_rule in
    select value
    from jsonb_array_elements(
      coalesce(v_container->'specialized_capacity', '[]'::jsonb)
    )
  loop
    v_role := btrim(coalesce(v_rule->>'semantic_role', ''));
    v_max := coalesce((v_rule->>'max_quantity')::integer, 0);
    if v_role = '' or v_max < 1 then
      continue;
    end if;

    select coalesce(sum(child.quantity), 0)
    into v_quantity
    from public.character_inventory_items child
    where child.holder_item_id = p_holder_item_id
      and child.placement_kind in ('grid', 'legacy')
      and private.cheburashka_inventory_profile_for_item_v1(child.id)
          ->> 'semantic_role' = v_role;

    if v_quantity > v_max then
      raise exception
        'Specialized inventory capacity exceeded: role %, quantity %, max %',
        v_role, v_quantity, v_max;
    end if;
  end loop;
end;
$function$;

revoke execute
on function private.cheburashka_assert_specialized_capacity_v1(uuid)
from public, anon, authenticated;

-- Every inventory mutation takes the same per-character lock used by the
-- versioned RPCs. This closes races from any future/internal write path before
-- the deferred specialized-capacity check observes final transaction state.
create or replace function private.cheburashka_lock_inventory_character_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_character_id uuid;
begin
  v_character_id := case when tg_op = 'DELETE' then old.character_id else new.character_id end;
  if v_character_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('inventory:' || v_character_id::text, 0)
    );
  end if;

  if tg_op = 'UPDATE'
     and old.character_id is distinct from new.character_id
     and old.character_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('inventory:' || old.character_id::text, 0)
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke execute
on function private.cheburashka_lock_inventory_character_v1()
from public, anon, authenticated;

drop trigger if exists character_inventory_items_stage7_character_lock
on public.character_inventory_items;

create trigger character_inventory_items_stage7_character_lock
before insert or update or delete
on public.character_inventory_items
for each row
execute function private.cheburashka_lock_inventory_character_v1();

create or replace function private.cheburashka_validate_specialized_capacity_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT' then
    if old.holder_item_id is not null then
      perform private.cheburashka_assert_specialized_capacity_v1(old.holder_item_id);
    end if;
    if old.category = 'container' then
      perform private.cheburashka_assert_specialized_capacity_v1(old.id);
    end if;
  end if;

  if tg_op <> 'DELETE' then
    if new.holder_item_id is not null then
      perform private.cheburashka_assert_specialized_capacity_v1(new.holder_item_id);
    end if;
    if new.category = 'container' then
      perform private.cheburashka_assert_specialized_capacity_v1(new.id);
    end if;
  end if;

  return null;
end;
$function$;

revoke execute
on function private.cheburashka_validate_specialized_capacity_v1()
from public, anon, authenticated;

drop trigger if exists character_inventory_items_validate_specialized_capacity
on public.character_inventory_items;

create constraint trigger character_inventory_items_validate_specialized_capacity
after insert or update or delete
on public.character_inventory_items
deferrable initially deferred
for each row
execute function private.cheburashka_validate_specialized_capacity_v1();
