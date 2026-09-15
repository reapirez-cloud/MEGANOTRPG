-- Inventory Stage 5 completion: strict Chasovoy item authoring,
-- standard physical container library and safe legacy normalization.
--
-- Applied live as Supabase migration:
--   20260915184110_cheburashka_stage5_complete_authoring_library

create or replace function public.create_reference_definition_v2(
  p_campaign_id uuid,
  p_kind text,
  p_slug text,
  p_visibility text,
  p_status text,
  p_source_kind text,
  p_source_label text,
  p_external_id text,
  p_name text,
  p_summary text,
  p_rules_text text,
  p_mechanics jsonb,
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_campaign_id is null or not private.can_manage_campaign(p_campaign_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;
  if nullif(trim(coalesce(p_slug,'')),'') is null then
    raise exception 'Definition slug is required';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then
    raise exception 'Definition name is required';
  end if;

  if p_kind = 'item' then
    if not (v_data ? 'inventory_profile') then
      raise exception 'Item definition requires data.inventory_profile';
    end if;
    perform private.cheburashka_assert_inventory_profile_v1(v_data->'inventory_profile');
  end if;

  insert into public.reference_definitions(
    kind, scope, campaign_id, slug, visibility, status,
    source_kind, source_label, external_id, created_by
  )
  values(
    p_kind, 'campaign', p_campaign_id, lower(trim(p_slug)),
    coalesce(p_visibility,'campaign'), coalesce(p_status,'active'),
    coalesce(p_source_kind,'custom'),
    nullif(trim(coalesce(p_source_label,'')),''),
    nullif(trim(coalesce(p_external_id,'')),''),
    auth.uid()
  )
  returning id into v_id;

  insert into public.reference_definition_revisions(
    definition_id, revision, name, summary, rules_text,
    mechanics, data, created_by
  )
  values(
    v_id, 1, trim(p_name), trim(coalesce(p_summary,'')),
    trim(coalesce(p_rules_text,'')),
    coalesce(p_mechanics,'[]'::jsonb), v_data, auth.uid()
  );

  return v_id;
end;
$function$;

revoke execute on function public.create_reference_definition_v2(
  uuid,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb
) from public, anon;
grant execute on function public.create_reference_definition_v2(
  uuid,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb
) to authenticated;

create or replace function public.revise_reference_definition_v2(
  p_definition_id uuid,
  p_name text,
  p_summary text,
  p_rules_text text,
  p_mechanics jsonb,
  p_data jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_scope text;
  v_kind text;
  v_revision integer;
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
begin
  select campaign_id, scope, kind, current_revision
  into v_campaign_id, v_scope, v_kind, v_revision
  from public.reference_definitions
  where id = p_definition_id
  for update;

  if not found then raise exception 'Definition not found'; end if;
  if v_scope = 'system' then
    raise exception 'System definitions are immutable through campaign API';
  end if;
  if auth.uid() is null or not private.can_manage_campaign(v_campaign_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then
    raise exception 'Definition name is required';
  end if;

  if v_kind = 'item' then
    if not (v_data ? 'inventory_profile') then
      raise exception 'Item definition requires data.inventory_profile';
    end if;
    perform private.cheburashka_assert_inventory_profile_v1(v_data->'inventory_profile');
  end if;

  v_revision := v_revision + 1;

  insert into public.reference_definition_revisions(
    definition_id, revision, name, summary, rules_text,
    mechanics, data, created_by
  )
  values(
    p_definition_id, v_revision, trim(p_name),
    trim(coalesce(p_summary,'')), trim(coalesce(p_rules_text,'')),
    coalesce(p_mechanics,'[]'::jsonb), v_data, auth.uid()
  );

  update public.reference_definitions
  set current_revision = v_revision, updated_at = now()
  where id = p_definition_id;

  return v_revision;
end;
$function$;

revoke execute on function public.revise_reference_definition_v2(
  uuid,text,text,text,jsonb,jsonb
) from public, anon;
grant execute on function public.revise_reference_definition_v2(
  uuid,text,text,text,jsonb,jsonb
) to authenticated;

do $block$
declare
  v_row record;
  v_id uuid;
begin
  for v_row in
    select *
    from jsonb_to_recordset(
      '[
        {"slug":"container-simple-1x1","name":"Простая сумка 1×1","summary":"Минимальный контейнер на одну логическую ячейку. ГМ может выдать и переименовать экземпляр.","data":{"category":"container","quantity":1,"stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"container_profile":{"internal_grid_width":1,"internal_grid_height":1,"cell_size_cm":5,"allow_nested_containers":true,"external_carry_slots":0,"specialized_capacity":[]}}}},
        {"slug":"container-coin-purse","name":"Кошель","summary":"Небольшой готовый контейнер для монет и мелочей.","data":{"category":"container","quantity":1,"stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container.purse","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":20,"height":15,"depth":5},"container_profile":{"internal_grid_width":4,"internal_grid_height":3,"cell_size_cm":5,"allow_nested_containers":false,"external_carry_slots":0,"specialized_capacity":[]}}}},
        {"slug":"container-small-pouch","name":"Малый мешочек","summary":"Компактный готовый контейнер для небольших предметов.","data":{"category":"container","quantity":1,"stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container.pouch","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":25,"height":20,"depth":8},"container_profile":{"internal_grid_width":5,"internal_grid_height":4,"cell_size_cm":5,"allow_nested_containers":true,"external_carry_slots":0,"specialized_capacity":[]}}}},
        {"slug":"container-satchel","name":"Сумка","summary":"Обычная готовая сумка среднего размера.","data":{"category":"container","quantity":1,"stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container.bag","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":30,"height":25,"depth":12},"container_profile":{"internal_grid_width":6,"internal_grid_height":5,"cell_size_cm":5,"allow_nested_containers":true,"external_carry_slots":0,"specialized_capacity":[]}}}},
        {"slug":"container-travel-bag","name":"Дорожная сумка","summary":"Вместительная готовая сумка без изменения масштаба интерфейса.","data":{"category":"container","quantity":1,"stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container.travel_bag","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":40,"height":30,"depth":20},"container_profile":{"internal_grid_width":8,"internal_grid_height":6,"cell_size_cm":5,"allow_nested_containers":true,"external_carry_slots":0,"specialized_capacity":[]}}}},
        {"slug":"container-backpack","name":"Рюкзак","summary":"Стандартный рюкзак с внутренней сеткой 6×8.","data":{"category":"container","quantity":1,"stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container.backpack","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":30,"height":40,"depth":20},"container_profile":{"internal_grid_width":6,"internal_grid_height":8,"cell_size_cm":5,"allow_nested_containers":true,"external_carry_slots":0,"specialized_capacity":[]}}}},
        {"slug":"container-large-backpack","name":"Большой рюкзак","summary":"Большой готовый рюкзак с внутренней сеткой 8×10.","data":{"category":"container","quantity":1,"stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container.large_backpack","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":40,"height":50,"depth":25},"container_profile":{"internal_grid_width":8,"internal_grid_height":10,"cell_size_cm":5,"allow_nested_containers":true,"external_carry_slots":0,"specialized_capacity":[]}}}},
        {"slug":"container-sack","name":"Большой мешок","summary":"Мягкий вместительный контейнер с готовой сеткой 8×10.","data":{"category":"container","quantity":1,"stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container.sack","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":40,"height":50,"depth":30},"container_profile":{"internal_grid_width":8,"internal_grid_height":10,"cell_size_cm":5,"allow_nested_containers":true,"external_carry_slots":0,"specialized_capacity":[]}}}},
        {"slug":"container-quiver","name":"Колчан","summary":"Специализированный контейнер: до 50 обычных стрел.","data":{"category":"container","quantity":1,"stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container.quiver","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":15,"height":60,"depth":10},"container_profile":{"internal_grid_width":2,"internal_grid_height":6,"cell_size_cm":5,"allow_nested_containers":false,"external_carry_slots":0,"specialized_capacity":[{"semantic_role":"ammo.arrow","max_quantity":50}]}}}},
        {"slug":"container-small-chest","name":"Малый сундук","summary":"Небольшой жёсткий контейнер с готовой сеткой 10×6.","data":{"category":"container","quantity":1,"stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container.chest","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":50,"height":30,"depth":30},"container_profile":{"internal_grid_width":10,"internal_grid_height":6,"cell_size_cm":5,"allow_nested_containers":true,"external_carry_slots":0,"specialized_capacity":[]}}}},
        {"slug":"container-chest","name":"Сундук","summary":"Стандартный большой жёсткий контейнер с готовой сеткой 12×8.","data":{"category":"container","quantity":1,"stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container.chest.large","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":60,"height":40,"depth":40},"container_profile":{"internal_grid_width":12,"internal_grid_height":8,"cell_size_cm":5,"allow_nested_containers":true,"external_carry_slots":0,"specialized_capacity":[]}}}}
      ]'::jsonb
    ) as x(slug text, name text, summary text, data jsonb)
  loop
    select id into v_id
    from public.reference_definitions
    where kind = 'item'
      and scope = 'system'
      and campaign_id is null
      and slug = v_row.slug
    limit 1;

    if v_id is null then
      perform private.cheburashka_assert_inventory_profile_v1(v_row.data->'inventory_profile');

      insert into public.reference_definitions(
        kind, scope, campaign_id, slug, visibility, status,
        source_kind, source_label, external_id, created_by
      )
      values(
        'item','system',null,v_row.slug,'campaign','active','system',
        'MEGANOT standard container library',
        'inventory-stage5:' || v_row.slug,
        null
      )
      returning id into v_id;

      insert into public.reference_definition_revisions(
        definition_id, revision, name, summary, rules_text,
        mechanics, data, created_by
      )
      values(
        v_id, 1, v_row.name, v_row.summary, '',
        '[]'::jsonb, v_row.data, null
      );
    end if;
  end loop;
end;
$block$;

-- Bring existing Chasovoy item definitions under the Stage 5 profile contract
-- without changing their executable mechanics.
do $block$
declare
  v_row record;
  v_profile jsonb;
  v_new_revision integer;
begin
  for v_row in
    select
      d.id, d.slug, d.current_revision,
      r.name, r.summary, r.rules_text, r.mechanics, r.data
    from public.reference_definitions d
    join public.reference_definition_revisions r
      on r.definition_id = d.id
     and r.revision = d.current_revision
    where d.kind = 'item'
      and d.scope = 'campaign'
      and not (r.data ? 'inventory_profile')
  loop
    v_profile := case
      when v_row.slug = 'wizard-spellbook' then
        '{"semantic_role":"reference.book","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":22,"height":30,"depth":5}}'::jsonb
      when v_row.slug = 'ai-569f3cff-flame-sword-frog-curse' then
        '{"semantic_role":"weapon.sword","packing_mode":"instance","footprint_mode":"shape","shape_mask":["1","1","1","1","1","1","1","1","1","1","1","1","1","1","1","1","1","1"],"shape_width":1,"shape_height":18,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":5,"height":90,"depth":3}}'::jsonb
      when v_row.slug like 'острый-кухонный-нож-%' then
        '{"semantic_role":"weapon.knife","packing_mode":"instance","footprint_mode":"shape","shape_mask":["1","1","1","1","1"],"shape_width":1,"shape_height":5,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":5,"height":25,"depth":2}}'::jsonb
      when v_row.slug like 'зубочистка-%' then
        '{"semantic_role":"tool.small","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"physical_dimensions_cm":{"width":1,"height":7,"depth":1}}'::jsonb
      when v_row.slug like 'пиво-%' then
        '{"semantic_role":"consumable.drink","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}'::jsonb
      else
        jsonb_build_object(
          'semantic_role', coalesce(nullif(v_row.data->>'category',''),'other'),
          'packing_mode','instance',
          'footprint_mode','compact_1x1',
          'shape_mask',jsonb_build_array('1'),
          'shape_width',1,
          'shape_height',1,
          'rotatable',false,
          'stack_max',null,
          'profile_review_required',true
        )
    end;

    perform private.cheburashka_assert_inventory_profile_v1(v_profile);
    v_new_revision := v_row.current_revision + 1;

    insert into public.reference_definition_revisions(
      definition_id, revision, name, summary, rules_text,
      mechanics, data, created_by
    )
    values(
      v_row.id, v_new_revision, v_row.name, v_row.summary,
      v_row.rules_text, v_row.mechanics,
      v_row.data || jsonb_build_object(
        'inventory_profile', v_profile,
        'stack_mode',
        case when v_profile->>'packing_mode' = 'bulk_stack'
          then 'stack'
          else 'instance'
        end
      ),
      null
    );

    update public.reference_definitions
    set current_revision = v_new_revision, updated_at = now()
    where id = v_row.id;
  end loop;
end;
$block$;

-- A quantity-one stack contains no interchangeable multiplicity, so it is safe
-- to normalize to an instance without losing data.
update public.character_inventory_items
set
  stack_mode = 'instance',
  version = version + 1,
  updated_at = now(),
  item_state = jsonb_set(
    coalesce(item_state,'{}'::jsonb),
    '{stage5_singleton_normalized}',
    'true'::jsonb,
    true
  )
where stack_mode = 'stack'
  and quantity = 1;

-- Multi-quantity legacy stacks are intentionally preserved. Stage 11 owns
-- full legacy adoption into Chasovoy and may review/split them with context.
update public.character_inventory_items
set
  item_state = jsonb_set(
    coalesce(item_state,'{}'::jsonb),
    '{stage5_stack_review_required}',
    'true'::jsonb,
    true
  ),
  updated_at = now()
where stack_mode = 'stack'
  and quantity > 1
  and definition_id is null;
