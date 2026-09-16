-- Inventory Stage 11A: canonical reusable item catalog + conservative legacy adoption.
-- This migration never renames an instance, rewrites its mechanics, changes its
-- quantity/weight, or merges rows. It only adds immutable system definitions and
-- links exact, reviewed legacy rows to a compatible current definition.

do $block$
declare
  v_row record;
  v_id uuid;
begin
  for v_row in
    select *
    from jsonb_to_recordset(
      '[
        {"slug":"consumable-healing-potion-small","name":"Малое лечебное зелье","summary":"Отдельный флакон 1×1; зелья не стакаются.","data":{"category":"consumable","stack_mode":"instance","usage_mode":"quantity","inventory_profile":{"semantic_role":"consumable.potion","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}},
        {"slug":"reference-scroll","name":"Свиток","summary":"Отдельный свиток 1×1; не bulk-стак.","data":{"category":"consumable","stack_mode":"instance","usage_mode":"quantity","inventory_profile":{"semantic_role":"reference.scroll","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}},
        {"slug":"currency-copper-coin","name":"Медные монеты","summary":"Физические монеты одного номинала.","data":{"category":"currency","stack_mode":"stack","usage_mode":"none","denomination":"cp","inventory_profile":{"semantic_role":"currency.coin","packing_mode":"bulk_stack","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":100}}},
        {"slug":"currency-silver-coin","name":"Серебряные монеты","summary":"Физические монеты одного номинала.","data":{"category":"currency","stack_mode":"stack","usage_mode":"none","denomination":"sp","inventory_profile":{"semantic_role":"currency.coin","packing_mode":"bulk_stack","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":100}}},
        {"slug":"currency-gold-coin","name":"Золотые монеты","summary":"Физические монеты одного номинала.","data":{"category":"currency","stack_mode":"stack","usage_mode":"none","denomination":"gp","inventory_profile":{"semantic_role":"currency.coin","packing_mode":"bulk_stack","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":100}}},
        {"slug":"ammo-arrow","name":"Стрелы","summary":"Однородные стрелы; обычная связка до 20.","data":{"category":"material","stack_mode":"stack","usage_mode":"none","inventory_profile":{"semantic_role":"ammo.arrow","packing_mode":"bulk_stack","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":20}}},
        {"slug":"ammo-bolt","name":"Болты","summary":"Однородные арбалетные болты; обычная связка до 20.","data":{"category":"material","stack_mode":"stack","usage_mode":"none","inventory_profile":{"semantic_role":"ammo.bolt","packing_mode":"bulk_stack","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":20}}},
        {"slug":"ammo-bullet","name":"Пули","summary":"Однородные пули или патроны; обычная пачка до 20.","data":{"category":"material","stack_mode":"stack","usage_mode":"none","inventory_profile":{"semantic_role":"ammo.bullet","packing_mode":"bulk_stack","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":20}}},
        {"slug":"ingredient-herb","name":"Обычная трава","summary":"Однородный мелкий растительный ингредиент.","data":{"category":"material","stack_mode":"stack","usage_mode":"none","inventory_profile":{"semantic_role":"ingredient.herb","packing_mode":"bulk_stack","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":20}}},
        {"slug":"ingredient-powder","name":"Порошок","summary":"Однородная сыпучая масса или порошок.","data":{"category":"material","stack_mode":"stack","usage_mode":"none","inventory_profile":{"semantic_role":"ingredient.powder","packing_mode":"bulk_stack","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":20}}},
        {"slug":"material-ore-chunk","name":"Кусок руды","summary":"Отдельный кусок руды; ингредиент не означает stack.","data":{"category":"material","stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"material.ore_chunk","packing_mode":"instance","footprint_mode":"shape","shape_mask":["11","11"],"shape_width":2,"shape_height":2,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":10,"height":10,"depth":8}}}},
        {"slug":"material-ingot","name":"Слиток","summary":"Отдельный физический слиток.","data":{"category":"material","stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"material.ingot","packing_mode":"instance","footprint_mode":"shape","shape_mask":["11","11","11"],"shape_width":2,"shape_height":3,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":10,"height":15,"depth":5}}}},
        {"slug":"weapon-dagger","name":"Кинжал","summary":"Обычный кинжал как отдельный продолговатый предмет.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"main_hand","inventory_profile":{"semantic_role":"weapon.dagger","packing_mode":"instance","footprint_mode":"shape","shape_mask":["1","1","1","1","1"],"shape_width":1,"shape_height":5,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":5,"height":25,"depth":3}}}},
        {"slug":"weapon-longsword","name":"Длинный меч","summary":"Обычный длинный меч; физическая форма не зависит от боевой механики экземпляра.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"main_hand","inventory_profile":{"semantic_role":"weapon.sword","packing_mode":"instance","footprint_mode":"shape","shape_mask":["1","1","1","1","1","1","1","1","1","1","1","1","1","1","1","1","1","1"],"shape_width":1,"shape_height":18,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":5,"height":90,"depth":4},"weight_per_unit":1.36}}},
        {"slug":"weapon-club","name":"Дубина","summary":"Обычная дубина как отдельный продолговатый предмет.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"main_hand","inventory_profile":{"semantic_role":"weapon.club","packing_mode":"instance","footprint_mode":"shape","shape_mask":["1","1","1","1","1","1","1","1","1"],"shape_width":1,"shape_height":9,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":7,"height":45,"depth":7}}}},
        {"slug":"armor-shield","name":"Щит","summary":"Обычный щит с читаемой физической формой.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"off_hand","inventory_profile":{"semantic_role":"armor.shield","packing_mode":"instance","footprint_mode":"shape","shape_mask":["111111","111111","111111","111111","011110","001100"],"shape_width":6,"shape_height":6,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":30,"height":30,"depth":8}}}},
        {"slug":"armor-chain-mail","name":"Кольчуга","summary":"Обычная кольчуга как отдельный предмет экипировки.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"chest","inventory_profile":{"semantic_role":"armor.chain_mail","packing_mode":"instance","footprint_mode":"shape","shape_mask":["1111","1111","1111","1111","1111"],"shape_width":4,"shape_height":5,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":40,"height":50,"depth":12},"weight_per_unit":24.95}}},
        {"slug":"tool-rope","name":"Верёвка","summary":"Отдельная бухта верёвки.","data":{"category":"tool","stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"tool.rope","packing_mode":"instance","footprint_mode":"shape","shape_mask":["111","111","111"],"shape_width":3,"shape_height":3,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":15,"height":15,"depth":10}}}},
        {"slug":"tool-torch","name":"Факел","summary":"Отдельный продолговатый факел.","data":{"category":"tool","stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"tool.torch","packing_mode":"instance","footprint_mode":"shape","shape_mask":["1","1","1","1","1","1","1","1"],"shape_width":1,"shape_height":8,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":5,"height":40,"depth":5}}}},
        {"slug":"tool-kitchen-knife","name":"Кухонный нож","summary":"Обычный кухонный нож; физический профиль не задаёт боевую механику.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"main_hand","inventory_profile":{"semantic_role":"tool.kitchen_knife","packing_mode":"instance","footprint_mode":"shape","shape_mask":["1","1","1","1","1"],"shape_width":1,"shape_height":5,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":5,"height":25,"depth":2}}}},
        {"slug":"reference-book","name":"Книга","summary":"Обычная книга как отдельный предмет.","data":{"category":"book","stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"reference.book","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}},
        {"slug":"gear-bedroll","name":"Спальник","summary":"Свёрнутый спальник как отдельный объёмный предмет.","data":{"category":"other","stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"gear.bedroll","packing_mode":"instance","footprint_mode":"shape","shape_mask":["11","11","11","11","11","11","11","11"],"shape_width":2,"shape_height":8,"rotatable":true,"stack_max":null,"physical_dimensions_cm":{"width":10,"height":40,"depth":15}}}},
        {"slug":"gear-clothing","name":"Одежда","summary":"Обычный комплект одежды; конкретное название остаётся на экземпляре.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"chest","inventory_profile":{"semantic_role":"gear.clothing","packing_mode":"instance","footprint_mode":"shape","shape_mask":["111","111","111","111"],"shape_width":3,"shape_height":4,"rotatable":true,"stack_max":null}}},
        {"slug":"gear-cloak","name":"Плащ","summary":"Обычный плащ как отдельный предмет.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"chest","inventory_profile":{"semantic_role":"gear.cloak","packing_mode":"instance","footprint_mode":"shape","shape_mask":["111","111","111","111"],"shape_width":3,"shape_height":4,"rotatable":true,"stack_max":null}}},
        {"slug":"gear-gloves","name":"Перчатки","summary":"Пара перчаток как один экипируемый предмет.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"hands","inventory_profile":{"semantic_role":"gear.gloves","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}},
        {"slug":"focus-holy-symbol","name":"Священный символ","summary":"Обычный священный символ как отдельный небольшой предмет.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"other","inventory_profile":{"semantic_role":"focus.holy_symbol","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}},
        {"slug":"container-component-pouch","name":"Мешок компонентов","summary":"Обычный мешок компонентов с собственной внутренней сеткой.","data":{"category":"container","stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"container.component_pouch","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null,"container_profile":{"internal_grid_width":5,"internal_grid_height":4,"cell_size_cm":5,"allow_nested_containers":false,"external_carry_slots":0,"specialized_capacity":[]}}}},
        {"slug":"consumable-cigarette","name":"Сигареты","summary":"Однородные сигареты как физический bulk-стак.","data":{"category":"consumable","stack_mode":"stack","usage_mode":"quantity","inventory_profile":{"semantic_role":"consumable.cigarette","packing_mode":"bulk_stack","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":20,"weight_per_unit":0.01}}}
      ]'::jsonb
    ) as x(slug text, name text, summary text, data jsonb)
  loop
    select id into v_id
    from public.reference_definitions
    where kind='item' and scope='system' and campaign_id is null and slug=v_row.slug
    limit 1;

    if v_id is null then
      perform private.cheburashka_assert_inventory_profile_v1(v_row.data->'inventory_profile');

      insert into public.reference_definitions(
        kind,scope,campaign_id,slug,visibility,status,
        source_kind,source_label,external_id,created_by
      )
      values(
        'item','system',null,v_row.slug,'campaign','active',
        'system','MEGANOT reusable inventory catalog',
        'inventory-stage11a:' || v_row.slug,null
      )
      returning id into v_id;

      insert into public.reference_definition_revisions(
        definition_id,revision,name,summary,rules_text,mechanics,data,created_by
      )
      values(
        v_id,1,v_row.name,v_row.summary,'','[]'::jsonb,v_row.data,null
      );
    end if;
  end loop;
end;
$block$;

-- Stage 11A safe exact adoption begins.
with adoption(item_name, category, slug) as (
  values
    ('рюкзак','container','container-backpack'),
    ('рюкзак с травами','container','container-backpack'),
    ('сумка','container','container-satchel'),
    ('кожаный кошелёк с монетами','container','container-coin-purse'),
    ('кошелёк с мелочью и расписками','container','container-coin-purse'),
    ('мешок компонентов','container','container-component-pouch'),
    ('безымянная книга','other','reference-book'),
    ('книга митры','book','reference-book'),
    ('чёрная книга некроманта','book','reference-book'),
    ('спальник','other','gear-bedroll'),
    ('священный символ','equipment','focus-holy-symbol'),
    ('дубина стражника','equipment','weapon-club'),
    ('кухонный нож','equipment','tool-kitchen-knife'),
    ('меч, который должен был быть палочкой','equipment','weapon-longsword'),
    ('кольчуга факультета стальных нервов','equipment','armor-chain-mail'),
    ('перчатки','equipment','gear-gloves'),
    ('походный плащ','equipment','gear-cloak'),
    ('белые одежды священника','equipment','gear-clothing'),
    ('женское платье','equipment','gear-clothing'),
    ('красивое женское платье','equipment','gear-clothing'),
    ('изношенная одежда','equipment','gear-clothing'),
    ('сюртук, который когда-то застёгивался','equipment','gear-clothing'),
    ('эльфийская рубашка и штаны','equipment','gear-clothing'),
    ('порошок от похмелья','consumable','ingredient-powder'),
    ('сигареты «дымный змей»','consumable','consumable-cigarette')
),
resolved as (
  select adoption.item_name, adoption.category, d.id as definition_id, d.current_revision
  from adoption
  join public.reference_definitions d
    on d.kind='item'
   and d.scope='system'
   and d.campaign_id is null
   and d.status='active'
   and d.slug=adoption.slug
)
update public.character_inventory_items item
set
  definition_id=resolved.definition_id,
  definition_revision=resolved.current_revision,
  version=item.version+1,
  updated_at=now(),
  item_state=(coalesce(item.item_state,'{}'::jsonb) - 'stage5_stack_review_required')
    || jsonb_build_object(
      'stage11_adopted',true,
      'stage11_adoption_kind','exact_reviewed_name'
    )
from resolved
where item.definition_id is null
  and lower(btrim(item.name))=resolved.item_name
  and item.category=resolved.category;
-- Stage 11A safe exact adoption ends.
