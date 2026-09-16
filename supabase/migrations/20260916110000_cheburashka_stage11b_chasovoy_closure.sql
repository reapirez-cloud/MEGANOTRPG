-- Inventory Stage 11B: close Chasovoy adoption and make authored inventory canonical.
-- New character/Surface items created through Cheburashka must resolve to a
-- Chasovoy definition. Exact reusable profiles reuse system definitions;
-- custom authored items receive an atomic campaign definition.

do $block$
declare
  v_row record;
  v_id uuid;
begin
  for v_row in
    select *
    from jsonb_to_recordset(
      '[
        {"slug":"gear-ring","name":"Кольцо","summary":"Обычное кольцо как маленький отдельный предмет.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"ring_left","inventory_profile":{"semantic_role":"gear.ring","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}},
        {"slug":"gear-belt","name":"Пояс","summary":"Обычный пояс как отдельный предмет экипировки.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"waist","inventory_profile":{"semantic_role":"gear.belt","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}},
        {"slug":"gear-headwear","name":"Головной убор","summary":"Обычный головной убор как отдельный предмет.","data":{"category":"equipment","stack_mode":"instance","usage_mode":"none","equipment_slot":"head","inventory_profile":{"semantic_role":"gear.headwear","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}},
        {"slug":"focus-amulet","name":"Амулет","summary":"Небольшой амулет или подвеска.","data":{"category":"other","stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"focus.amulet","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}},
        {"slug":"reference-letter","name":"Письмо","summary":"Отдельное письмо или небольшой пакет писем как narrative reference item.","data":{"category":"other","stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"reference.letter","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}},
        {"slug":"trinket-small","name":"Маленькая безделушка","summary":"Небольшой отдельный trinket.","data":{"category":"trinket","stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"trinket.small","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}},
        {"slug":"quest-key-bundle","name":"Связка ключей","summary":"Одна физическая связка, содержащая несколько индивидуальных ключей; это не bulk stack.","data":{"category":"other","stack_mode":"instance","usage_mode":"none","inventory_profile":{"semantic_role":"quest.key_bundle","packing_mode":"instance","footprint_mode":"compact_1x1","shape_mask":["1"],"shape_width":1,"shape_height":1,"rotatable":false,"stack_max":null}}}
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
      ) values (
        'item','system',null,v_row.slug,'campaign','active',
        'system','MEGANOT reusable inventory catalog',
        'inventory-stage11b:' || v_row.slug,null
      ) returning id into v_id;

      insert into public.reference_definition_revisions(
        definition_id,revision,name,summary,rules_text,mechanics,data,created_by
      ) values (
        v_id,1,v_row.name,v_row.summary,'','[]'::jsonb,v_row.data,null
      );
    end if;
  end loop;
end;
$block$;

create or replace function private.cheburashka_resolve_authored_definition_v1(
  p_campaign_id uuid,
  p_input jsonb,
  p_inventory_profile jsonb,
  p_command_id uuid
)
returns table(definition_id uuid, definition_revision integer)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_name text := btrim(coalesce(p_input->>'name',''));
  v_description text := coalesce(p_input->>'description','');
  v_category text := coalesce(nullif(btrim(p_input->>'category'),''),'other');
  v_quantity integer := coalesce(nullif(p_input->>'quantity','')::integer,1);
  v_usage_mode text;
  v_stack_mode text;
  v_slot text;
  v_mechanics jsonb := coalesce(p_input->'mechanics','[]'::jsonb);
  v_profile jsonb := p_inventory_profile;
  v_data jsonb;
  v_requested_id uuid := nullif(p_input->>'definition_id','')::uuid;
  v_requested_revision integer := nullif(p_input->>'definition_revision','')::integer;
  v_id uuid;
  v_revision integer;
begin
  if p_campaign_id is null then raise exception 'Campaign id is required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if v_name='' then raise exception 'Item name is required'; end if;
  if jsonb_typeof(v_mechanics)<>'array' then raise exception 'Inventory mechanics must be an array'; end if;

  v_usage_mode := coalesce(
    nullif(btrim(p_input->>'usage_mode'),''),
    case when v_category='consumable' then 'quantity' else 'none' end
  );
  v_stack_mode := private.cheburashka_inventory_stack_mode_v1(
    p_input->>'stack_mode',v_category,v_usage_mode,v_quantity
  );
  v_slot := case when v_category='equipment'
    then nullif(btrim(p_input->>'equipment_slot'),'')
    else null
  end;

  if (v_requested_id is null) <> (v_requested_revision is null) then
    raise exception 'Inventory definition id and revision must be provided together';
  end if;

  if v_profile is null and v_requested_id is not null then
    select r.data->'inventory_profile'
    into v_profile
    from public.reference_definitions d
    join public.reference_definition_revisions r
      on r.definition_id=d.id and r.revision=v_requested_revision
    where d.id=v_requested_id
      and d.kind='item'
      and (d.scope='system' or (d.scope='campaign' and d.campaign_id=p_campaign_id));
  end if;

  if v_profile is null or jsonb_typeof(v_profile)<>'object' then
    raise exception 'Inventory authoring requires a Chasovoy definition or inventory profile';
  end if;

  perform private.cheburashka_assert_inventory_profile_v1(v_profile);

  if (v_profile->>'packing_mode'='bulk_stack') is distinct from (v_stack_mode='stack') then
    raise exception 'Inventory profile packing mode does not match item stack mode';
  end if;

  v_data := jsonb_strip_nulls(jsonb_build_object(
    'category',v_category,
    'stack_mode',v_stack_mode,
    'usage_mode',v_usage_mode,
    'equipment_slot',v_slot,
    'inventory_profile',v_profile
  ));

  if v_requested_id is not null then
    select d.id,r.revision
    into v_id,v_revision
    from public.reference_definitions d
    join public.reference_definition_revisions r
      on r.definition_id=d.id and r.revision=v_requested_revision
    where d.id=v_requested_id
      and d.kind='item'
      and d.status<>'archived'
      and (d.scope='system' or (d.scope='campaign' and d.campaign_id=p_campaign_id))
      and r.data->'inventory_profile'=v_profile
      and coalesce(r.data->>'category','other')=v_category
      and coalesce(r.data->>'stack_mode',v_stack_mode)=v_stack_mode
      and coalesce(r.data->>'usage_mode',v_usage_mode)=v_usage_mode
      and coalesce(r.data->>'equipment_slot','')=coalesce(v_slot,'')
      and r.mechanics=v_mechanics
    limit 1;

    if v_id is not null then
      definition_id:=v_id; definition_revision:=v_revision; return next; return;
    end if;
  end if;

  select d.id,r.revision
  into v_id,v_revision
  from public.reference_definitions d
  join public.reference_definition_revisions r
    on r.definition_id=d.id and r.revision=d.current_revision
  where d.kind='item'
    and d.scope='system'
    and d.campaign_id is null
    and d.status='active'
    and r.data->'inventory_profile'=v_profile
    and coalesce(r.data->>'category','other')=v_category
    and coalesce(r.data->>'stack_mode',v_stack_mode)=v_stack_mode
    and coalesce(r.data->>'usage_mode',v_usage_mode)=v_usage_mode
    and coalesce(r.data->>'equipment_slot','')=coalesce(v_slot,'')
    and r.mechanics=v_mechanics
  order by d.slug
  limit 1;

  if v_id is not null then
    definition_id:=v_id; definition_revision:=v_revision; return next; return;
  end if;

  select d.id,r.revision
  into v_id,v_revision
  from public.reference_definitions d
  join public.reference_definition_revisions r
    on r.definition_id=d.id and r.revision=d.current_revision
  where d.kind='item'
    and d.scope='campaign'
    and d.campaign_id=p_campaign_id
    and d.status='active'
    and r.name=v_name
    and r.summary=v_description
    and r.data=v_data
    and r.mechanics=v_mechanics
  order by d.updated_at desc,d.id
  limit 1;

  if v_id is null then
    insert into public.reference_definitions(
      kind,scope,campaign_id,slug,visibility,status,
      source_kind,source_label,external_id,created_by
    ) values (
      'item','campaign',p_campaign_id,
      'inventory-' || p_command_id::text,
      'campaign','active','custom',
      'Cheburashka inventory authoring',
      'inventory-authoring:' || p_command_id::text,
      auth.uid()
    )
    returning id into v_id;

    insert into public.reference_definition_revisions(
      definition_id,revision,name,summary,rules_text,mechanics,data,created_by
    ) values (
      v_id,1,v_name,v_description,'',v_mechanics,v_data,auth.uid()
    );
    v_revision:=1;
  end if;

  definition_id:=v_id;
  definition_revision:=v_revision;
  return next;
end;
$function$;

revoke all on function private.cheburashka_resolve_authored_definition_v1(uuid,jsonb,jsonb,uuid)
from public,anon,authenticated;

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

  return public.create_inventory_item_v2(p_character_id,v_input,p_command_id);
end;
$function$;

revoke all on function public.create_inventory_item_v3(uuid,jsonb,jsonb,uuid)
from public,anon;
grant execute on function public.create_inventory_item_v3(uuid,jsonb,jsonb,uuid)
to authenticated;

create or replace function public.update_inventory_item_v3(
  p_character_id uuid,
  p_item_id uuid,
  p_input jsonb,
  p_inventory_profile jsonb default null,
  p_expected_version bigint default null,
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
  v_current_definition_id uuid;
  v_current_definition_revision integer;
  v_profile jsonb:=p_inventory_profile;
  v_definition_id uuid;
  v_definition_revision integer;
  v_input jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_expected_version is null or p_expected_version<1 then raise exception 'Expected inventory version is required'; end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Inventory input must be an object'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then
    raise exception 'Only GM can update inventory items';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));

  select * into v_existing
  from public.engine_command_receipts
  where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'cheburashka'
       or v_existing.command_kind<>'inventory.update'
       or v_existing.aggregate_id<>p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select c.campaign_id,i.definition_id,i.definition_revision
  into v_campaign_id,v_current_definition_id,v_current_definition_revision
  from public.character_inventory_items i
  join public.characters c on c.id=i.character_id
  where i.id=p_item_id and i.character_id=p_character_id;

  if v_campaign_id is null then raise exception 'Inventory item not found for this character'; end if;

  if v_profile is null and v_current_definition_id is not null then
    select r.data->'inventory_profile'
    into v_profile
    from public.reference_definition_revisions r
    where r.definition_id=v_current_definition_id
      and r.revision=v_current_definition_revision;
  end if;

  v_input:=p_input;
  if nullif(v_input->>'definition_id','') is null and v_current_definition_id is not null then
    v_input:=v_input || jsonb_build_object(
      'definition_id',v_current_definition_id,
      'definition_revision',v_current_definition_revision
    );
  end if;

  select r.definition_id,r.definition_revision
  into v_definition_id,v_definition_revision
  from private.cheburashka_resolve_authored_definition_v1(
    v_campaign_id,v_input,v_profile,p_command_id
  ) r;

  v_input:=v_input || jsonb_build_object(
    'definition_id',v_definition_id,
    'definition_revision',v_definition_revision
  );

  return public.update_inventory_item_v2(
    p_character_id,p_item_id,v_input,p_expected_version,p_command_id
  );
end;
$function$;

revoke all on function public.update_inventory_item_v3(uuid,uuid,jsonb,jsonb,bigint,uuid)
from public,anon;
grant execute on function public.update_inventory_item_v3(uuid,uuid,jsonb,jsonb,bigint,uuid)
to authenticated;

create or replace function public.create_surface_inventory_item_v2(
  p_surface_id uuid,
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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Inventory input must be an object'; end if;

  select campaign_id into v_campaign_id
  from public.scene_surfaces
  where id=p_surface_id and lifecycle_state='active';
  if v_campaign_id is null or not private.can_manage_campaign(v_campaign_id,auth.uid()) then
    raise exception 'Only GM can create Surface items';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));

  select * into v_existing
  from public.engine_command_receipts
  where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'cheburashka'
       or v_existing.command_kind<>'inventory.surface_create' then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select r.definition_id,r.definition_revision
  into v_definition_id,v_definition_revision
  from private.cheburashka_resolve_authored_definition_v1(
    v_campaign_id,p_input,p_inventory_profile,p_command_id
  ) r;

  v_input:=p_input || jsonb_build_object(
    'definition_id',v_definition_id,
    'definition_revision',v_definition_revision
  );

  return public.create_surface_inventory_item_v1(p_surface_id,v_input,p_command_id);
end;
$function$;

revoke all on function public.create_surface_inventory_item_v2(uuid,jsonb,jsonb,uuid)
from public,anon;
grant execute on function public.create_surface_inventory_item_v2(uuid,jsonb,jsonb,uuid)
to authenticated;

-- Reviewed archetype adoption. If a concrete row has unique mechanics the
-- resolver creates a campaign definition; plain rows reuse the system archetype.
do $block$
declare
  v_item record;
  v_profile jsonb;
  v_definition_id uuid;
  v_definition_revision integer;
  v_input jsonb;
begin
  for v_item in
    select
      i.*,
      c.campaign_id,
      x.slug as archetype_slug
    from public.character_inventory_items i
    join public.characters c on c.id=i.character_id
    join (
      values
        ('кольцо киски','equipment','gear-ring'),
        ('кошкомеч','equipment','weapon-longsword'),
        ('кошкоперчатки','equipment','gear-gloves'),
        ('кошкопояс силы','equipment','gear-belt'),
        ('крышка от волшебного котла','equipment','armor-shield'),
        ('нож для писем','equipment','weapon-dagger'),
        ('рыбный кинжал','equipment','weapon-dagger'),
        ('фуражка офицера гг армии','equipment','gear-headwear'),
        ('чёрный плащ с серебряными нитками','equipment','gear-cloak'),
        ('амулет духов','other','focus-amulet'),
        ('письма','other','reference-letter'),
        ('сорок третье письмо из академии','other','reference-letter'),
        ('напёрсток','other','trinket-small'),
        ('кроличья лапка','trinket','trinket-small')
    ) as x(item_name,category,slug)
      on lower(btrim(i.name))=x.item_name and i.category=x.category
    where i.definition_id is null
      and i.character_id is not null
  loop
    select r.data->'inventory_profile'
    into v_profile
    from public.reference_definitions d
    join public.reference_definition_revisions r
      on r.definition_id=d.id and r.revision=d.current_revision
    where d.kind='item' and d.scope='system' and d.campaign_id is null
      and d.slug=v_item.archetype_slug and d.status='active'
    limit 1;

    if v_profile is null then
      raise exception 'Missing Stage 11 archetype %',v_item.archetype_slug;
    end if;

    v_input:=jsonb_build_object(
      'name',v_item.name,
      'quantity',v_item.quantity,
      'weight',v_item.weight,
      'equipped',v_item.equipped,
      'category',v_item.category,
      'equipment_slot',v_item.equipment_slot,
      'image_url',v_item.image_url,
      'description',v_item.description,
      'mechanics',v_item.mechanics,
      'usage_mode',v_item.usage_mode,
      'charges_current',v_item.charges_current,
      'charges_max',v_item.charges_max,
      'stack_mode',v_item.stack_mode,
      'item_state',v_item.item_state
    );

    select r.definition_id,r.definition_revision
    into v_definition_id,v_definition_revision
    from private.cheburashka_resolve_authored_definition_v1(
      v_item.campaign_id,v_input,v_profile,v_item.id
    ) r;

    update public.character_inventory_items
    set definition_id=v_definition_id,
        definition_revision=v_definition_revision,
        version=version+1,
        updated_at=now(),
        item_state=coalesce(item_state,'{}'::jsonb)
          || jsonb_build_object('stage11_adopted',true,'stage11_adoption_kind','reviewed_archetype')
    where id=v_item.id;
  end loop;
end;
$block$;

-- A key ring is a single physical object. Preserve the legacy "4 keys" fact as
-- explicit bundle state instead of pretending four non-interchangeable keys are
-- a homogeneous stack.
with def as (
  select id,current_revision
  from public.reference_definitions
  where kind='item' and scope='system' and campaign_id is null
    and slug='quest-key-bundle' and status='active'
  limit 1
)
update public.character_inventory_items item
set quantity=1,
    stack_mode='instance',
    definition_id=def.id,
    definition_revision=def.current_revision,
    version=item.version+1,
    updated_at=now(),
    item_state=(coalesce(item.item_state,'{}'::jsonb) - 'stage5_stack_review_required')
      || jsonb_build_object(
        'stage11_adopted',true,
        'stage11_adoption_kind','reviewed_bundle',
        'bundle_unit','key',
        'bundle_count',item.quantity
      )
from def
where item.definition_id is null
  and lower(btrim(item.name))='связка ключей от лекарского домика'
  and item.quantity=4
  and item.stack_mode='stack';

-- Anything still unlinked after reviewed archetype migration is intentionally a
-- unique/underspecified narrative instance. This is an explicit classification,
-- not forgotten migration debt.
update public.character_inventory_items
set item_state=coalesce(item_state,'{}'::jsonb)
      || jsonb_build_object(
        'stage11_intentional_narrative',true,
        'stage11_definition_review','intentionally_unlinked'
      ),
    updated_at=now()
where definition_id is null;
