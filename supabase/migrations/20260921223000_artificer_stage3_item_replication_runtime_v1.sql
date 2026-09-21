-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:artificer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/artificerRuntimeStage3Replication.test.ts
-- CLASS_WORK_STATUS: artificer:stage3_core_item_replication=COMPLETE,artificer:mechanics=IN_PROGRESS_STAGE3_COMPLETE
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- Artificer Stage 3: generic item-plan runtime + Cheburashka lifecycle.
-- Scope: core Tinker's Magic and Replicate Magic Item infrastructure only.
-- Literary/Voss text remains intentionally deferred.

begin;

do $seed_tinkers$
declare v_row record; v_id uuid; v_data jsonb;
begin
  for v_row in
    select * from jsonb_to_recordset(
      '[{"slug":"gear-ball-bearings","name":"Ball Bearings","category":"other"},{"slug":"container-basket","name":"Basket","category":"container"},{"slug":"gear-bedroll","name":"Bedroll","category":"other"},{"slug":"gear-bell","name":"Bell","category":"other"},{"slug":"gear-blanket","name":"Blanket","category":"other"},{"slug":"gear-block-and-tackle","name":"Block and Tackle","category":"tool"},{"slug":"container-bucket","name":"Bucket","category":"container"},{"slug":"gear-caltrops","name":"Caltrops","category":"other"},{"slug":"gear-candle","name":"Candle","category":"other"},{"slug":"tool-crowbar","name":"Crowbar","category":"tool"},{"slug":"container-flask","name":"Flask","category":"container"},{"slug":"container-jug","name":"Jug","category":"container"},{"slug":"gear-lamp","name":"Lamp","category":"other"},{"slug":"gear-net","name":"Net","category":"other"},{"slug":"gear-oil-flask","name":"Oil","category":"other"},{"slug":"reference-paper","name":"Paper","category":"other"},{"slug":"reference-parchment","name":"Parchment","category":"other"},{"slug":"tool-pole","name":"Pole","category":"tool"},{"slug":"container-small-pouch","name":"Pouch","category":"container"},{"slug":"tool-rope","name":"Rope","category":"tool"},{"slug":"container-sack","name":"Sack","category":"container"},{"slug":"tool-shovel","name":"Shovel","category":"tool"},{"slug":"gear-string","name":"String","category":"other"},{"slug":"tool-tinderbox","name":"Tinderbox","category":"tool"},{"slug":"tool-torch","name":"Torch","category":"tool"},{"slug":"container-vial","name":"Vial","category":"container"}]'::jsonb
    ) as x(slug text,name text,category text)
  loop
    select d.id into v_id from public.reference_definitions d
    where d.kind='item' and d.scope='system' and d.campaign_id is null and d.slug=v_row.slug limit 1;
    if v_id is null then
      insert into public.reference_definitions(
        kind,scope,campaign_id,slug,visibility,status,source_kind,source_label,external_id,created_by
      ) values(
        'item','system',null,v_row.slug,'campaign','active','system',
        'MEGANOT reusable gear catalog','tinkers-magic:'||v_row.slug,null
      ) returning id into v_id;
      v_data:=jsonb_build_object(
        'category',v_row.category,'stack_mode','instance','usage_mode','none',
        'tinkers_magic',jsonb_build_object('eligible',true),
        'inventory_profile',jsonb_build_object(
          'semantic_role','gear.'||replace(v_row.slug,'-','.'),
          'packing_mode','instance','footprint_mode','compact_1x1',
          'shape_mask',jsonb_build_array('1'),'shape_width',1,'shape_height',1,
          'rotatable',false,'stack_max',null
        )
      );
      insert into public.reference_definition_revisions(
        definition_id,revision,name,summary,rules_text,mechanics,data,created_by
      ) values(v_id,1,v_row.name,'','','[]'::jsonb,v_data,null);
    else
      update public.reference_definition_revisions r
      set data=coalesce(r.data,'{}'::jsonb)
        || jsonb_build_object('tinkers_magic',jsonb_build_object('eligible',true))
      where r.definition_id=v_id
        and r.revision=(select current_revision from public.reference_definitions where id=v_id);
    end if;
  end loop;
end;
$seed_tinkers$;

do $seed_plans$
declare v_row record; v_id uuid; v_data jsonb;
begin
  for v_row in
    select * from jsonb_to_recordset(
      '[
{"unlock":2,"name":"Alchemy Jug","slug":"artificer-plan-alchemy-jug"},
{"unlock":2,"name":"Bag of Holding","slug":"artificer-plan-bag-of-holding"},
{"unlock":2,"name":"Cap of Water Breathing","slug":"artificer-plan-cap-of-water-breathing"},
{"unlock":2,"name":"Goggles of Night","slug":"artificer-plan-goggles-of-night"},
{"unlock":2,"name":"Manifold Tool","slug":"artificer-plan-manifold-tool"},
{"unlock":2,"name":"Repeating Shot","slug":"artificer-plan-repeating-shot"},
{"unlock":2,"name":"Returning Weapon","slug":"artificer-plan-returning-weapon"},
{"unlock":2,"name":"Rope of Climbing","slug":"artificer-plan-rope-of-climbing"},
{"unlock":2,"name":"Sending Stones","slug":"artificer-plan-sending-stones"},
{"unlock":2,"name":"Shield +1","slug":"artificer-plan-shield-plus1"},
{"unlock":2,"name":"Wand of Magic Detection","slug":"artificer-plan-wand-of-magic-detection"},
{"unlock":2,"name":"Wand of Secrets","slug":"artificer-plan-wand-of-secrets"},
{"unlock":2,"name":"Wand of the War Mage +1","slug":"artificer-plan-wand-of-the-war-mage-plus1"},
{"unlock":2,"name":"Weapon +1","slug":"artificer-plan-weapon-plus1"},
{"unlock":2,"name":"Wraps of Unarmed Power +1","slug":"artificer-plan-wraps-of-unarmed-power-plus1"},
{"unlock":6,"name":"Armor +1","slug":"artificer-plan-armor-plus1"},
{"unlock":6,"name":"Boots of Elvenkind","slug":"artificer-plan-boots-of-elvenkind"},
{"unlock":6,"name":"Boots of the Winding Path","slug":"artificer-plan-boots-of-the-winding-path"},
{"unlock":6,"name":"Cloak of Elvenkind","slug":"artificer-plan-cloak-of-elvenkind"},
{"unlock":6,"name":"Cloak of the Manta Ray","slug":"artificer-plan-cloak-of-the-manta-ray"},
{"unlock":6,"name":"Eyes of Charming","slug":"artificer-plan-eyes-of-charming"},
{"unlock":6,"name":"Eyes of Minute Seeing","slug":"artificer-plan-eyes-of-minute-seeing"},
{"unlock":6,"name":"Gloves of Thievery","slug":"artificer-plan-gloves-of-thievery"},
{"unlock":6,"name":"Lantern of Revealing","slug":"artificer-plan-lantern-of-revealing"},
{"unlock":6,"name":"Mind Sharpener","slug":"artificer-plan-mind-sharpener"},
{"unlock":6,"name":"Necklace of Adaptation","slug":"artificer-plan-necklace-of-adaptation"},
{"unlock":6,"name":"Pipes of Haunting","slug":"artificer-plan-pipes-of-haunting"},
{"unlock":6,"name":"Radiant Weapon","slug":"artificer-plan-radiant-weapon"},
{"unlock":6,"name":"Repulsion Shield","slug":"artificer-plan-repulsion-shield"},
{"unlock":6,"name":"Ring of Swimming","slug":"artificer-plan-ring-of-swimming"},
{"unlock":6,"name":"Ring of Water Walking","slug":"artificer-plan-ring-of-water-walking"},
{"unlock":6,"name":"Sentinel Shield","slug":"artificer-plan-sentinel-shield"},
{"unlock":6,"name":"Spell-Refueling Ring","slug":"artificer-plan-spell-refueling-ring"},
{"unlock":6,"name":"Wand of Magic Missiles","slug":"artificer-plan-wand-of-magic-missiles"},
{"unlock":6,"name":"Wand of Web","slug":"artificer-plan-wand-of-web"},
{"unlock":6,"name":"Weapon of Warning","slug":"artificer-plan-weapon-of-warning"},
{"unlock":10,"name":"Armor of Resistance","slug":"artificer-plan-armor-of-resistance"},
{"unlock":10,"name":"Dagger of Venom","slug":"artificer-plan-dagger-of-venom"},
{"unlock":10,"name":"Elven Chain","slug":"artificer-plan-elven-chain"},
{"unlock":10,"name":"Ring of Feather Falling","slug":"artificer-plan-ring-of-feather-falling"},
{"unlock":10,"name":"Ring of Jumping","slug":"artificer-plan-ring-of-jumping"},
{"unlock":10,"name":"Ring of Mind Shielding","slug":"artificer-plan-ring-of-mind-shielding"},
{"unlock":10,"name":"Shield +2","slug":"artificer-plan-shield-plus2"},
{"unlock":10,"name":"Wand of the War Mage +2","slug":"artificer-plan-wand-of-the-war-mage-plus2"},
{"unlock":10,"name":"Weapon +2","slug":"artificer-plan-weapon-plus2"},
{"unlock":10,"name":"Wraps of Unarmed Power +2","slug":"artificer-plan-wraps-of-unarmed-power-plus2"},
{"unlock":14,"name":"Armor +2","slug":"artificer-plan-armor-plus2"},
{"unlock":14,"name":"Arrow-Catching Shield","slug":"artificer-plan-arrow-catching-shield"},
{"unlock":14,"name":"Flame Tongue","slug":"artificer-plan-flame-tongue"},
{"unlock":14,"name":"Ring of Free Action","slug":"artificer-plan-ring-of-free-action"},
{"unlock":14,"name":"Ring of Protection","slug":"artificer-plan-ring-of-protection"},
{"unlock":14,"name":"Ring of the Ram","slug":"artificer-plan-ring-of-the-ram"}]'::jsonb
    ) as x(unlock integer,name text,slug text)
  loop
    select d.id into v_id from public.reference_definitions d
    where d.kind='item' and d.scope='system' and d.campaign_id is null and d.slug=v_row.slug limit 1;
    v_data:=jsonb_build_object(
      'category','other','stack_mode','instance','usage_mode','none',
      'replication_plan',jsonb_build_object('eligible',true,'unlock_level',v_row.unlock,'explicit_plan',true),
      'magic_item',jsonb_build_object('replicated_identity',true),
      'inventory_profile',jsonb_build_object(
        'semantic_role','magic_item.replication_plan','packing_mode','instance',
        'footprint_mode','compact_1x1','shape_mask',jsonb_build_array('1'),
        'shape_width',1,'shape_height',1,'rotatable',false,'stack_max',null
      )
    );
    if v_id is null then
      insert into public.reference_definitions(
        kind,scope,campaign_id,slug,visibility,status,source_kind,source_label,external_id,created_by
      ) values(
        'item','system',null,v_row.slug,'campaign','active','official',
        'Eberron: Forge of the Artificer (2025)','efota-2025:replicate:'||v_row.slug,null
      ) returning id into v_id;
      insert into public.reference_definition_revisions(
        definition_id,revision,name,summary,rules_text,mechanics,data,created_by
      ) values(v_id,1,v_row.name,'','','[]'::jsonb,v_data,null);
    else
      update public.reference_definition_revisions r
      set data=coalesce(r.data,'{}'::jsonb)||v_data
      where r.definition_id=v_id
        and r.revision=(select current_revision from public.reference_definitions where id=v_id);
    end if;
  end loop;
end;
$seed_plans$;

create or replace function private.reference_item_plan_unlock_level_v1(p_definition_id uuid)
returns integer language plpgsql stable security definer set search_path=''
as $function$
declare v_data jsonb; v_explicit integer; v_rarity text; v_type text; v_cursed boolean;
begin
  select r.data into v_data
  from public.reference_definitions d
  join public.reference_definition_revisions r on r.definition_id=d.id and r.revision=d.current_revision
  where d.id=p_definition_id and d.kind='item' and d.status='active';
  if v_data is null then return null; end if;
  if coalesce((v_data#>>'{replication_plan,eligible}')::boolean,false) then
    v_explicit:=nullif(v_data#>>'{replication_plan,unlock_level}','')::integer;
    if v_explicit between 1 and 20 then return v_explicit; end if;
  end if;
  v_rarity:=lower(coalesce(v_data#>>'{magic_item,rarity}',''));
  v_type:=lower(coalesce(v_data#>>'{magic_item,item_type}',''));
  v_cursed:=coalesce((v_data#>>'{magic_item,cursed}')::boolean,false);
  if v_cursed then return null; end if;
  if v_rarity='common' and v_type not in ('potion','scroll') then return 2; end if;
  if v_rarity='uncommon' and v_type='wondrous' then return 10; end if;
  if v_rarity='rare' and v_type='wondrous' then return 14; end if;
  return null;
end;
$function$;
revoke all on function private.reference_item_plan_unlock_level_v1(uuid) from public,anon,authenticated;
grant execute on function private.reference_item_plan_unlock_level_v1(uuid) to service_role;

create or replace function private.reference_item_plan_option_valid_v1(
  p_character_id uuid,p_option text,p_source_level integer,p_category text default null
)
returns boolean language plpgsql stable security definer set search_path=''
as $function$
declare v_campaign uuid; v_definition uuid; v_unlock integer; v_category text;
begin
  select campaign_id into v_campaign from public.characters where id=p_character_id;
  if v_campaign is null or p_option !~ '^refdef:[0-9a-fA-F-]{36}$' then return false; end if;
  begin v_definition:=substring(p_option from 8)::uuid; exception when others then return false; end;
  select private.reference_item_plan_unlock_level_v1(d.id),coalesce(r.data#>>'{replication_plan,category}','')
  into v_unlock,v_category
  from public.reference_definitions d
  join public.reference_definition_revisions r on r.definition_id=d.id and r.revision=d.current_revision
  where d.id=v_definition and d.kind='item' and d.status='active'
    and (d.scope='system' or (d.scope='campaign' and d.campaign_id=v_campaign));
  if v_unlock is null or v_unlock>greatest(1,p_source_level) then return false; end if;
  if nullif(btrim(coalesce(p_category,'')),'') is not null and v_category<>p_category then return false; end if;
  return true;
end;
$function$;
revoke all on function private.reference_item_plan_option_valid_v1(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function private.reference_item_plan_option_valid_v1(uuid,text,integer,text) to service_role;

create or replace function private.cheburashka_safe_delete_item_v1(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_before jsonb;
begin
  select to_jsonb(i) into v_before from public.character_inventory_items i where i.id=p_item_id for update;
  if v_before is null then return null; end if;
  update public.character_inventory_items child
  set holder_item_id=null,
      placement_kind=case when child.character_id is not null and child.world_storage_id is null and child.surface_id is null then 'root' else child.placement_kind end,
      placement_index=null,grid_x=null,grid_y=null,grid_rotation=0,
      version=child.version+1,updated_at=now()
  where child.holder_item_id=p_item_id;
  delete from public.character_inventory_items where id=p_item_id;
  return v_before;
end;
$function$;
revoke all on function private.cheburashka_safe_delete_item_v1(uuid) from public,anon,authenticated;
grant execute on function private.cheburashka_safe_delete_item_v1(uuid) to service_role;

create or replace function private.cheburashka_create_defined_item_system_v1(
  p_character_id uuid,p_definition_id uuid,p_item_state jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
  v_campaign uuid; v_revision integer; v_name text; v_summary text; v_mechanics jsonb; v_data jsonb;
  v_state jsonb; v_category text; v_usage text; v_stack text; v_slot text; v_item_id uuid; v_attune_required boolean;
begin
  if p_item_state is null or jsonb_typeof(p_item_state)<>'object' then raise exception 'SYSTEM_ITEM_STATE_INVALID'; end if;
  select campaign_id into v_campaign from public.characters where id=p_character_id;
  if v_campaign is null then raise exception 'CHARACTER_NOT_FOUND'; end if;
  select d.current_revision,r.name,r.summary,r.mechanics,r.data
  into v_revision,v_name,v_summary,v_mechanics,v_data
  from public.reference_definitions d
  join public.reference_definition_revisions r on r.definition_id=d.id and r.revision=d.current_revision
  where d.id=p_definition_id and d.kind='item' and d.status='active'
    and (d.scope='system' or (d.scope='campaign' and d.campaign_id=v_campaign));
  if v_revision is null then raise exception 'ITEM_DEFINITION_NOT_AVAILABLE'; end if;
  perform private.cheburashka_assert_inventory_definition_v1(p_character_id,p_definition_id,v_revision);
  v_category:=coalesce(nullif(v_data->>'category',''),'other');
  v_usage:=coalesce(nullif(v_data->>'usage_mode',''),'none');
  v_stack:=coalesce(nullif(v_data->>'stack_mode',''),'instance');
  v_slot:=case when v_category='equipment' then nullif(v_data->>'equipment_slot','') else null end;
  v_attune_required:=coalesce((v_data#>>'{magic_item,requires_attunement}')::boolean,false);
  v_state:=coalesce(v_data->'item_state','{}'::jsonb)
    || case when v_attune_required then jsonb_build_object('attunement',jsonb_build_object('required',true,'attuned',false)) else '{}'::jsonb end
    || p_item_state;
  insert into public.character_inventory_items(
    character_id,name,quantity,weight,equipped,category,equipment_slot,image_url,description,
    definition_id,definition_revision,mechanics,usage_mode,charges_current,charges_max,item_state,stack_mode
  ) values(
    p_character_id,v_name,greatest(1,coalesce((v_data->>'quantity')::integer,1)),
    nullif(v_data->>'weight','')::numeric,false,v_category,v_slot,nullif(v_data->>'image_url',''),
    coalesce(v_summary,''),p_definition_id,v_revision,coalesce(v_mechanics,'[]'::jsonb),v_usage,
    case when v_usage='charges' then greatest(0,coalesce((v_data->>'charges_current')::integer,(v_data->>'charges_max')::integer,1)) else null end,
    case when v_usage='charges' then greatest(1,coalesce((v_data->>'charges_max')::integer,1)) else null end,
    v_state,v_stack
  ) returning id into v_item_id;
  return v_item_id;
end;
$function$;
revoke all on function private.cheburashka_create_defined_item_system_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.cheburashka_create_defined_item_system_v1(uuid,uuid,jsonb) to service_role;

create or replace function private.cheburashka_expire_inventory_items_v1(p_creator_character_id uuid,p_trigger text)
returns integer language plpgsql security definer set search_path=''
as $function$
declare v_row record; v_changed integer:=0;
begin
  if p_trigger not in ('short_rest','long_rest','dawn','manual') then raise exception 'UNSUPPORTED_ITEM_LIFECYCLE_TRIGGER'; end if;
  for v_row in
    select i.id from public.character_inventory_items i
    where i.item_state#>>'{system_source,creator_character_id}'=p_creator_character_id::text
      and (
        i.item_state#>>'{lifecycle,expire_on}'=p_trigger
        or exists(
          select 1 from jsonb_array_elements_text(
            case when jsonb_typeof(i.item_state#>'{lifecycle,expire_on}')='array'
              then i.item_state#>'{lifecycle,expire_on}' else '[]'::jsonb end
          ) x(value) where x.value=p_trigger
        )
      )
    order by i.created_at,i.id
  loop
    perform private.cheburashka_safe_delete_item_v1(v_row.id);
    v_changed:=v_changed+1;
  end loop;
  return v_changed;
end;
$function$;
revoke all on function private.cheburashka_expire_inventory_items_v1(uuid,text) from public,anon,authenticated;
grant execute on function private.cheburashka_expire_inventory_items_v1(uuid,text) to service_role;

create or replace function private.character_attunement_capacity_v1(p_character_id uuid)
returns integer language sql stable security definer set search_path=''
as $function$
  select greatest(0,least(12,coalesce(nullif(cs.runtime_facts->>'attunement_capacity','')::integer,3)))
  from public.character_sheets cs where cs.character_id=p_character_id
$function$;
revoke all on function private.character_attunement_capacity_v1(uuid) from public,anon,authenticated;
grant execute on function private.character_attunement_capacity_v1(uuid) to service_role;

create or replace function private.cheburashka_set_item_attuned_v1(
  p_character_id uuid,p_item_id uuid,p_attuned boolean,p_actor uuid
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_item public.character_inventory_items%rowtype; v_required boolean; v_capacity integer; v_count integer;
  v_att jsonb; v_after jsonb;
begin
  select * into v_item from public.character_inventory_items
  where id=p_item_id and character_id=p_character_id and world_storage_id is null and surface_id is null for update;
  if v_item.id is null then raise exception 'ATTUNEMENT_ITEM_NOT_HELD'; end if;
  v_att:=coalesce(v_item.item_state->'attunement','{}'::jsonb);
  v_required:=coalesce((v_att->>'required')::boolean,false);
  if coalesce(p_attuned,false) and not v_required then return to_jsonb(v_item); end if;
  if coalesce(p_attuned,false) and coalesce((v_att->>'attuned')::boolean,false)=false then
    v_capacity:=coalesce(private.character_attunement_capacity_v1(p_character_id),3);
    select count(*) into v_count from public.character_inventory_items i
    where i.character_id=p_character_id and coalesce((i.item_state#>>'{attunement,attuned}')::boolean,false);
    if v_count>=v_capacity then raise exception 'ATTUNEMENT_CAPACITY_REACHED:%',v_capacity; end if;
  end if;
  v_att:=v_att || jsonb_build_object(
    'attuned',coalesce(p_attuned,false),
    'attuned_by',case when coalesce(p_attuned,false) then to_jsonb(p_actor) else 'null'::jsonb end,
    'attuned_at',case when coalesce(p_attuned,false) then to_jsonb(now()) else 'null'::jsonb end
  );
  update public.character_inventory_items
  set item_state=jsonb_set(coalesce(item_state,'{}'::jsonb),'{attunement}',v_att,true),
      version=version+1,updated_at=now()
  where id=p_item_id returning to_jsonb(character_inventory_items) into v_after;
  return v_after;
end;
$function$;
revoke all on function private.cheburashka_set_item_attuned_v1(uuid,uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function private.cheburashka_set_item_attuned_v1(uuid,uuid,boolean,uuid) to service_role;

create or replace function public.set_inventory_item_attuned_v1(
  p_character_id uuid,p_item_id uuid,p_attuned boolean,p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_version bigint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (private.can_manage_character(p_character_id,auth.uid()) or private.is_assigned_character(p_character_id,auth.uid()))
    then raise exception 'ATTUNEMENT_PERMISSION_DENIED'; end if;
  select version into v_version from public.character_inventory_items
  where id=p_item_id and character_id=p_character_id for update;
  if v_version is null then raise exception 'ATTUNEMENT_ITEM_NOT_HELD'; end if;
  if p_expected_version is null or p_expected_version<>v_version then
    raise exception 'Inventory version conflict: expected %, current %',p_expected_version,v_version;
  end if;
  return private.cheburashka_set_item_attuned_v1(p_character_id,p_item_id,coalesce(p_attuned,false),auth.uid());
end;
$function$;
revoke all on function public.set_inventory_item_attuned_v1(uuid,uuid,boolean,bigint) from public,anon;
grant execute on function public.set_inventory_item_attuned_v1(uuid,uuid,boolean,bigint) to authenticated,service_role;

create or replace function private.cheburashka_clear_attunement_on_holder_change_v1()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_att jsonb;
begin
  if old.character_id is not distinct from new.character_id
     and old.world_storage_id is not distinct from new.world_storage_id
     and old.surface_id is not distinct from new.surface_id then return new; end if;
  v_att:=new.item_state->'attunement';
  if v_att is not null and coalesce((v_att->>'attuned')::boolean,false) then
    v_att:=(v_att-'attuned_by'-'attuned_at')||jsonb_build_object('attuned',false);
    new.item_state:=jsonb_set(coalesce(new.item_state,'{}'::jsonb),'{attunement}',v_att,true);
  end if;
  return new;
end;
$function$;
revoke all on function private.cheburashka_clear_attunement_on_holder_change_v1() from public,anon,authenticated;
drop trigger if exists character_inventory_items_clear_attunement_on_holder_change_v1 on public.character_inventory_items;
create trigger character_inventory_items_clear_attunement_on_holder_change_v1
before update of character_id,world_storage_id,surface_id on public.character_inventory_items
for each row execute function private.cheburashka_clear_attunement_on_holder_change_v1();

create or replace function private.cheburashka_expire_items_on_preparation_open_v1()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if tg_op='INSERT' then
    if new.is_open then perform private.cheburashka_expire_inventory_items_v1(new.character_id,'long_rest'); end if;
  elsif new.is_open and (old.generation is distinct from new.generation or old.is_open is distinct from new.is_open) then
    perform private.cheburashka_expire_inventory_items_v1(new.character_id,'long_rest');
  end if;
  return new;
end;
$function$;
revoke all on function private.cheburashka_expire_items_on_preparation_open_v1() from public,anon,authenticated;
drop trigger if exists character_preparation_sessions_expire_inventory_lifecycle_v1 on public.character_preparation_sessions;
create trigger character_preparation_sessions_expire_inventory_lifecycle_v1
after insert or update of generation,is_open on public.character_preparation_sessions
for each row execute function private.cheburashka_expire_items_on_preparation_open_v1();

create or replace function public.artificer_create_tinkers_magic_item_v1(
  p_character_id uuid,p_definition_id uuid,p_command_id uuid default gen_random_uuid()
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_campaign uuid; v_assignment public.character_template_assignments%rowtype; v_level integer;
  v_int integer; v_max integer; v_current integer; v_item_id uuid; v_item jsonb;
  v_existing public.engine_command_receipts%rowtype; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_command_id is null then raise exception 'COMMAND_ID_REQUIRED'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'TINKERS_MAGIC_PERMISSION_DENIED'; end if;
  select campaign_id into v_campaign from public.characters where id=p_character_id;
  if v_campaign is null then raise exception 'CHARACTER_NOT_FOUND'; end if;
  select a.* into v_assignment
  from public.character_template_assignments a join public.rule_templates t on t.id=a.template_id
  where a.character_id=p_character_id and t.kind='class' and t.catalog_key='class:artificer' and t.is_active
  order by a.assigned_at,a.id limit 1;
  if v_assignment.id is null then raise exception 'ACTIVE_ARTIFICER_ASSIGNMENT_REQUIRED'; end if;
  v_level:=greatest(1,coalesce(v_assignment.template_level,1));
  if not exists(
    select 1 from public.reference_definitions d
    join public.reference_definition_revisions r on r.definition_id=d.id and r.revision=d.current_revision
    where d.id=p_definition_id and d.kind='item' and d.status='active'
      and (d.scope='system' or d.campaign_id=v_campaign)
      and coalesce((r.data#>>'{tinkers_magic,eligible}')::boolean,false)
  ) then raise exception 'TINKERS_MAGIC_ITEM_INELIGIBLE'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid() or v_existing.engine<>'gena'
       or v_existing.command_kind<>'artificer.tinkers_magic.create'
    then raise exception 'COMMAND_ID_ALREADY_USED'; end if;
    return v_existing.result;
  end if;

  select intelligence into v_int from public.character_sheets where character_id=p_character_id;
  if v_int is null then raise exception 'CHARACTER_SHEET_REQUIRED'; end if;
  v_max:=greatest(1,floor((v_int-10)::numeric/2)::integer);
  insert into public.character_resource_states(character_id,state_key,current,max_snapshot,label,recharge,updated_by)
  values(p_character_id,'tinkers_magic',v_max,v_max,'Tinker''s Magic','{"triggers":["long_rest"],"restore":"full"}'::jsonb,auth.uid())
  on conflict(character_id,state_key) do update set
    current=greatest(0,least(v_max,v_max-greatest(0,public.character_resource_states.max_snapshot-public.character_resource_states.current))),
    max_snapshot=v_max,label='Tinker''s Magic',recharge='{"triggers":["long_rest"],"restore":"full"}'::jsonb,
    updated_by=auth.uid(),updated_at=now();

  select current into v_current from public.character_resource_states
  where character_id=p_character_id and state_key='tinkers_magic' for update;
  if coalesce(v_current,0)<1 then raise exception 'TINKERS_MAGIC_USES_EXHAUSTED'; end if;
  update public.character_resource_states set current=current-1,updated_by=auth.uid(),updated_at=now()
  where character_id=p_character_id and state_key='tinkers_magic';

  v_item_id:=private.cheburashka_create_defined_item_system_v1(
    p_character_id,p_definition_id,
    jsonb_build_object(
      'system_source',jsonb_build_object(
        'kind','artificer_tinkers_magic','creator_character_id',p_character_id,
        'assignment_id',v_assignment.id,'source_key','tinkers-magic'
      ),
      'lifecycle',jsonb_build_object('expire_on',jsonb_build_array('long_rest'))
    )
  );
  select to_jsonb(i) into v_item from public.character_inventory_items i where i.id=v_item_id;
  v_result:=jsonb_build_object(
    'itemId',v_item_id,'affectedCharacterIds',jsonb_build_array(p_character_id),
    'after',v_item,'resourceStateKey','tinkers_magic'
  );
  insert into public.engine_command_receipts(command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by)
  values(p_command_id,v_campaign,'gena','artificer.tinkers_magic.create',v_item_id,v_result,auth.uid());
  return v_result;
end;
$function$;
revoke all on function public.artificer_create_tinkers_magic_item_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.artificer_create_tinkers_magic_item_v1(uuid,uuid,uuid) to authenticated,service_role;

create or replace function public.reconcile_character_template_item_plan_loadout_v1(
  p_assignment_id uuid,p_choice_key text,p_plan_options text[] default '{}'::text[],
  p_attune_options text[] default '{}'::text[],p_command_id uuid default gen_random_uuid()
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype; v_template public.rule_templates%rowtype;
  v_character public.characters%rowtype; v_session public.character_preparation_sessions%rowtype;
  v_choice jsonb; v_provider jsonb; v_level integer; v_known jsonb; v_required integer;
  v_max_active integer:=0; v_pair record; v_option text; v_definition uuid; v_existing_item uuid;
  v_created uuid[]:='{}'::uuid[]; v_retained uuid[]:='{}'::uuid[]; v_removed uuid[]:='{}'::uuid[];
  v_attuned uuid[]:='{}'::uuid[]; v_oldest uuid; v_count integer; v_item uuid; v_item_state jsonb;
  v_existing_receipt public.engine_command_receipts%rowtype; v_result jsonb; v_task_key text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_command_id is null then raise exception 'COMMAND_ID_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_choice_key,'')),'') is null then raise exception 'CHOICE_KEY_REQUIRED'; end if;
  select * into v_assignment from public.character_template_assignments where id=p_assignment_id for update;
  if v_assignment.id is null then raise exception 'TEMPLATE_ASSIGNMENT_NOT_FOUND'; end if;
  select * into v_template from public.rule_templates where id=v_assignment.template_id and is_active;
  if v_template.id is null then raise exception 'ACTIVE_TEMPLATE_NOT_FOUND'; end if;
  select * into v_character from public.characters where id=v_assignment.character_id;
  if v_character.id is null then raise exception 'CHARACTER_NOT_FOUND'; end if;
  if v_character.assigned_user_id is distinct from auth.uid() then raise exception 'GENA_ASSIGNED_PLAYER_REQUIRED'; end if;
  select * into v_session from public.character_preparation_sessions
  where character_id=v_character.id and is_open for update;
  if v_session.character_id is null then raise exception 'ITEM_PLAN_LONG_REST_WINDOW_CLOSED'; end if;
  v_level:=coalesce(private.character_template_source_level(v_assignment.id),1);

  select q.choice into v_choice from (
    select 0 as level,c.choice from jsonb_array_elements(coalesce(v_template.choices,'[]'::jsonb)) c(choice)
    union all
    select l.level,c.choice from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(choice)
    where l.template_id=v_template.id and l.level<=v_level
  ) q where q.choice->>'key'=p_choice_key order by q.level desc limit 1;
  if v_choice is null then raise exception 'ITEM_PLAN_CHOICE_NOT_UNLOCKED'; end if;
  v_provider:=v_choice->'option_provider';
  if coalesce(v_provider->>'kind','')<>'reference_item_plans' then raise exception 'ITEM_PLAN_PROVIDER_REQUIRED'; end if;

  v_known:=coalesce(v_assignment.selected_choices->p_choice_key,'[]'::jsonb);
  if jsonb_typeof(v_known)='string' then v_known:=jsonb_build_array(v_known); end if;
  if jsonb_typeof(v_known)<>'array' then raise exception 'ITEM_PLAN_KNOWN_STATE_INVALID'; end if;
  v_required:=greatest(1,coalesce((v_choice->>'count')::integer,1));
  for v_pair in select key,value from jsonb_each_text(coalesce(v_choice->'count_by_level','{}'::jsonb)) loop
    if v_pair.key~'^[0-9]+$' and v_pair.key::integer<=v_level then v_required:=greatest(v_required,v_pair.value::integer); end if;
  end loop;
  if jsonb_array_length(v_known)<v_required then raise exception 'ITEM_PLAN_KNOWN_CHOICE_INCOMPLETE'; end if;
  for v_pair in select key,value from jsonb_each_text(coalesce(v_provider->'active_count_by_level','{}'::jsonb)) loop
    if v_pair.key~'^[0-9]+$' and v_pair.key::integer<=v_level then v_max_active:=greatest(v_max_active,v_pair.value::integer); end if;
  end loop;
  if v_max_active<1 then raise exception 'ITEM_PLAN_ACTIVE_LIMIT_MISSING'; end if;

  if coalesce(array_length(p_plan_options,1),0)>v_max_active then raise exception 'ITEM_PLAN_REQUEST_EXCEEDS_ACTIVE_LIMIT:%',v_max_active; end if;
  if (select count(*) from unnest(coalesce(p_plan_options,'{}'::text[])) x)
     <> (select count(distinct x) from unnest(coalesce(p_plan_options,'{}'::text[])) x)
  then raise exception 'ITEM_PLAN_REQUEST_DUPLICATE'; end if;
  if exists(select 1 from unnest(coalesce(p_attune_options,'{}'::text[])) x
    where not (x=any(coalesce(p_plan_options,'{}'::text[]))))
  then raise exception 'ITEM_PLAN_ATTUNE_NOT_REQUESTED'; end if;

  v_task_key:='item_plan_loadout:'||p_choice_key;
  if exists(
    select 1 from public.character_preparation_records r
    where r.character_id=v_character.id and r.generation=v_session.generation
      and r.assignment_id=v_assignment.id and r.task_key=v_task_key
  ) then raise exception 'ITEM_PLAN_LOADOUT_ALREADY_RECONCILED_THIS_REST'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing_receipt from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing_receipt.created_by<>auth.uid() or v_existing_receipt.engine<>'gena'
       or v_existing_receipt.command_kind<>'template.item_plan.reconcile'
       or v_existing_receipt.aggregate_id<>v_assignment.id
    then raise exception 'COMMAND_ID_ALREADY_USED'; end if;
    return v_existing_receipt.result;
  end if;

  for v_pair in
    select i.id::text as key,coalesce(i.item_state#>>'{system_source,option}','') as value
    from public.character_inventory_items i
    where i.item_state#>>'{system_source,kind}'='template_item_plan'
      and i.item_state#>>'{system_source,assignment_id}'=v_assignment.id::text
      and i.item_state#>>'{system_source,choice_key}'=p_choice_key
      and (
        not exists(select 1 from jsonb_array_elements_text(v_known) k(value)
          where k.value=i.item_state#>>'{system_source,option}')
        or not private.reference_item_plan_option_valid_v1(
          v_character.id,i.item_state#>>'{system_source,option}',v_level,null
        )
      )
  loop
    v_item:=v_pair.key::uuid; perform private.cheburashka_safe_delete_item_v1(v_item);
    v_removed:=array_append(v_removed,v_item);
  end loop;

  foreach v_option in array coalesce(p_plan_options,'{}'::text[]) loop
    if not exists(select 1 from jsonb_array_elements_text(v_known) k(value) where k.value=v_option)
      then raise exception 'ITEM_PLAN_NOT_KNOWN:%',v_option; end if;
    if not private.reference_item_plan_option_valid_v1(v_character.id,v_option,v_level,null)
      then raise exception 'ITEM_PLAN_NOT_ELIGIBLE:%',v_option; end if;
    v_definition:=substring(v_option from 8)::uuid;
    select i.id into v_existing_item from public.character_inventory_items i
    where i.item_state#>>'{system_source,kind}'='template_item_plan'
      and i.item_state#>>'{system_source,assignment_id}'=v_assignment.id::text
      and i.item_state#>>'{system_source,choice_key}'=p_choice_key
      and i.item_state#>>'{system_source,option}'=v_option
    order by i.created_at,i.id limit 1;
    if v_existing_item is not null then
      v_retained:=array_append(v_retained,v_existing_item);
      if v_option=any(coalesce(p_attune_options,'{}'::text[]))
         and exists(select 1 from public.character_inventory_items i where i.id=v_existing_item and i.character_id=v_character.id)
      then
        v_item_state:=private.cheburashka_set_item_attuned_v1(v_character.id,v_existing_item,true,auth.uid());
        if coalesce((v_item_state#>>'{item_state,attunement,attuned}')::boolean,false)
           or coalesce((v_item_state#>>'{attunement,attuned}')::boolean,false)
        then v_attuned:=array_append(v_attuned,v_existing_item); end if;
      end if;
      continue;
    end if;

    select count(*) into v_count from public.character_inventory_items i
    where i.item_state#>>'{system_source,kind}'='template_item_plan'
      and i.item_state#>>'{system_source,assignment_id}'=v_assignment.id::text
      and i.item_state#>>'{system_source,choice_key}'=p_choice_key;
    while v_count>=v_max_active loop
      select i.id into v_oldest from public.character_inventory_items i
      where i.item_state#>>'{system_source,kind}'='template_item_plan'
        and i.item_state#>>'{system_source,assignment_id}'=v_assignment.id::text
        and i.item_state#>>'{system_source,choice_key}'=p_choice_key
      order by i.created_at,i.id limit 1;
      exit when v_oldest is null;
      perform private.cheburashka_safe_delete_item_v1(v_oldest);
      v_removed:=array_append(v_removed,v_oldest); v_count:=v_count-1;
    end loop;

    v_item:=private.cheburashka_create_defined_item_system_v1(
      v_character.id,v_definition,
      jsonb_build_object(
        'system_source',jsonb_build_object(
          'kind','template_item_plan','creator_character_id',v_character.id,
          'assignment_id',v_assignment.id,'choice_key',p_choice_key,'option',v_option
        ),
        'lifecycle',jsonb_build_object('owner_death','expire_after_1d4_days_via_tobik_or_gm')
      )
    );
    v_created:=array_append(v_created,v_item);
    if v_option=any(coalesce(p_attune_options,'{}'::text[])) then
      v_item_state:=private.cheburashka_set_item_attuned_v1(v_character.id,v_item,true,auth.uid());
      if coalesce((v_item_state#>>'{item_state,attunement,attuned}')::boolean,false)
         or coalesce((v_item_state#>>'{attunement,attuned}')::boolean,false)
      then v_attuned:=array_append(v_attuned,v_item); end if;
    end if;
  end loop;

  v_result:=jsonb_build_object(
    'assignmentId',v_assignment.id,'choiceKey',p_choice_key,'generation',v_session.generation,
    'maxActive',v_max_active,'requested',to_jsonb(coalesce(p_plan_options,'{}'::text[])),
    'created',to_jsonb(v_created),'retained',to_jsonb(v_retained),'removed',to_jsonb(v_removed),'attuned',to_jsonb(v_attuned)
  );
  insert into public.character_preparation_records(
    character_id,generation,assignment_id,task_key,input_value,resolved_value,created_by
  ) values(
    v_character.id,v_session.generation,v_assignment.id,v_task_key,
    coalesce(array_length(p_plan_options,1),0),v_result,auth.uid()
  );
  insert into public.engine_command_receipts(command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by)
  values(p_command_id,v_character.campaign_id,'gena','template.item_plan.reconcile',v_assignment.id,v_result,auth.uid());
  return v_result;
end;
$function$;
revoke all on function public.reconcile_character_template_item_plan_loadout_v1(uuid,text,text[],text[],uuid) from public,anon;
grant execute on function public.reconcile_character_template_item_plan_loadout_v1(uuid,text,text[],text[],uuid)
to authenticated,service_role;

create or replace function private.reconcile_template_item_plan_known_choices_v1(p_assignment_id uuid)
returns integer language plpgsql security definer set search_path=''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype; v_character uuid; v_level integer;
  v_row record; v_choice jsonb; v_known jsonb; v_changed integer:=0;
begin
  select * into v_assignment from public.character_template_assignments where id=p_assignment_id;
  if v_assignment.id is null then
    for v_row in select i.id from public.character_inventory_items i
      where i.item_state#>>'{system_source,kind}'='template_item_plan'
        and i.item_state#>>'{system_source,assignment_id}'=p_assignment_id::text
    loop perform private.cheburashka_safe_delete_item_v1(v_row.id); v_changed:=v_changed+1; end loop;
    return v_changed;
  end if;
  v_character:=v_assignment.character_id;
  v_level:=coalesce(private.character_template_source_level(v_assignment.id),1);
  for v_row in
    select i.id,i.item_state#>>'{system_source,choice_key}' as choice_key,
           i.item_state#>>'{system_source,option}' as option
    from public.character_inventory_items i
    where i.item_state#>>'{system_source,kind}'='template_item_plan'
      and i.item_state#>>'{system_source,assignment_id}'=p_assignment_id::text
  loop
    select q.choice into v_choice from (
      select 0 as level,c.choice from public.rule_templates t
      cross join lateral jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) c(choice)
      where t.id=v_assignment.template_id
      union all
      select l.level,c.choice from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(choice)
      where l.template_id=v_assignment.template_id and l.level<=v_level
    ) q where q.choice->>'key'=v_row.choice_key order by q.level desc limit 1;
    v_known:=coalesce(v_assignment.selected_choices->v_row.choice_key,'[]'::jsonb);
    if jsonb_typeof(v_known)='string' then v_known:=jsonb_build_array(v_known); end if;
    if v_choice is null or coalesce(v_choice#>>'{option_provider,kind}','')<>'reference_item_plans'
       or jsonb_typeof(v_known)<>'array'
       or not exists(select 1 from jsonb_array_elements_text(v_known) k(value) where k.value=v_row.option)
       or not private.reference_item_plan_option_valid_v1(v_character,v_row.option,v_level,null)
    then
      perform private.cheburashka_safe_delete_item_v1(v_row.id); v_changed:=v_changed+1;
    end if;
  end loop;
  return v_changed;
end;
$function$;
revoke all on function private.reconcile_template_item_plan_known_choices_v1(uuid) from public,anon,authenticated;
grant execute on function private.reconcile_template_item_plan_known_choices_v1(uuid) to service_role;

create or replace function private.reconcile_template_item_plan_known_choices_trigger_v1()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  perform private.reconcile_template_item_plan_known_choices_v1(coalesce(new.id,old.id));
  return coalesce(new,old);
end;
$function$;
revoke all on function private.reconcile_template_item_plan_known_choices_trigger_v1() from public,anon,authenticated;
drop trigger if exists character_template_assignments_reconcile_item_plans_v1 on public.character_template_assignments;
create trigger character_template_assignments_reconcile_item_plans_v1
after update of selected_choices,template_level or delete on public.character_template_assignments
for each row execute function private.reconcile_template_item_plan_known_choices_trigger_v1();

create or replace function private.ensure_artificer_stage3_item_runtime_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare
  v_artificer uuid; v_options jsonb; v_labels jsonb; v_unlocks jsonb; v_plan_choice jsonb;
  v_level1 jsonb; v_level2 jsonb; v_tinker_feature jsonb; v_tinker_resource jsonb;
  v_tinker_action jsonb; v_replicate_feature jsonb;
begin
  select id into v_artificer from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:artificer' and is_active
  order by updated_at desc,id limit 1;
  if v_artificer is null then return; end if;
  select
    coalesce(jsonb_agg(to_jsonb('refdef:'||d.id::text) order by private.reference_item_plan_unlock_level_v1(d.id),r.name,d.id),'[]'::jsonb),
    coalesce(jsonb_object_agg('refdef:'||d.id::text,r.name),'{}'::jsonb),
    coalesce(jsonb_object_agg('refdef:'||d.id::text,private.reference_item_plan_unlock_level_v1(d.id)),'{}'::jsonb)
  into v_options,v_labels,v_unlocks
  from public.reference_definitions d
  join public.reference_definition_revisions r on r.definition_id=d.id and r.revision=d.current_revision
  where d.kind='item' and d.status='active'
    and (d.scope='system' or (d.scope='campaign' and d.campaign_id=p_campaign_id))
    and private.reference_item_plan_unlock_level_v1(d.id) between 2 and 14;
  if jsonb_array_length(v_options)<52 then raise exception 'ARTIFICER_STAGE3_PLAN_CATALOG_INCOMPLETE:%',jsonb_array_length(v_options); end if;

  v_plan_choice:=jsonb_build_object(
    'key','artificer_replication_plans','label','Replicate Magic Item Plans','target','trait',
    'count',4,'count_by_level',jsonb_build_object('2',4,'6',5,'10',6,'14',7,'18',8),
    'selection_mode','player_once','replacement_policy','on_level_change','replacement_limit',1,
    'required',true,'resolved_as','reference_item_plan','options',v_options,'option_labels',v_labels,
    'option_unlock_level',v_unlocks,
    'option_provider',jsonb_build_object(
      'kind','reference_item_plans',
      'active_count_by_level',jsonb_build_object('2',2,'6',3,'10',4,'14',5,'18',6)
    )
  );
  v_tinker_feature:=jsonb_build_object(
    'id','artificer-tinkers-magic-feature-l1','type','grant','sourceKey','tinkers-magic',
    'target','feature','key','class:artificer:tinkers-magic:l1',
    'payload',jsonb_build_object(
      'label','Tinker''s Magic',
      'description','You know Mending. As a Magic action while holding Tinker''s Tools, create one eligible mundane item in an unoccupied space within 5 feet. It lasts until your next Long Rest. You can create a number of these items equal to your Intelligence modifier, minimum one, and all uses return on a Long Rest.'
    )
  );
  v_tinker_resource:=jsonb_build_object(
    'id','artificer-tinkers-magic-resource','type','resource','sourceKey','tinkers-magic',
    'key','tinkers_magic','label','Tinker''s Magic',
    'max',jsonb_build_object('kind','max','values',jsonb_build_array(
      jsonb_build_object('kind','literal','value',1),
      jsonb_build_object('kind','reference','key','abilities.intelligence.modifier')
    )),
    'recharge',jsonb_build_array('long_rest'),'restore','full','initial','full'
  );
  v_tinker_action:=jsonb_build_object(
    'id','artificer-tinkers-magic-create','type','action','sourceKey','tinkers-magic',
    'key','artificer:tinkers-magic:create','label','Tinker''s Magic','economy','magic_action',
    'range',jsonb_build_object('kind','ranged','normal',5,'unit','feet'),
    'resourceCosts',jsonb_build_array(jsonb_build_object('key','tinkers_magic','amount',1)),
    'requirements',jsonb_build_array(jsonb_build_object(
      'kind','grant','target','proficiency','key','tool:tinkers-tools','enforcement','engine'
    )),
    'effects',jsonb_build_array(jsonb_build_object(
      'kind','semantic','key','inventory.create_temporary_item_from_definition',
      'payload',jsonb_build_object('eligibility','tinkers_magic')
    )),
    'tags',jsonb_build_array('class_feature','inventory','temporary_item')
  );
  v_replicate_feature:=jsonb_build_object(
    'id','artificer-replicate-magic-item-feature-l2','type','grant','sourceKey','replicate-magic-item',
    'target','feature','key','class:artificer:replicate-magic-item:l2',
    'payload',jsonb_build_object(
      'label','Replicate Magic Item',
      'description','At Artificer level 2 you know four eligible magic-item plans. Your known-plan count rises to five at 6, six at 10, seven at 14, and eight at 18. When you gain an Artificer level, you may replace one known plan. At the end of a Long Rest you may create replicated items from different known plans, up to two active items at level 2, three at 6, four at 10, five at 14, and six at 18. Creating beyond the limit removes the oldest replicated item.'
    )
  );

  select mechanics into v_level1 from public.rule_template_levels where template_id=v_artificer and level=1 for update;
  if v_level1 is null then raise exception 'ARTIFICER_STAGE3_LEVEL1_MISSING'; end if;
  v_level1:=coalesce((
    select jsonb_agg(m.value order by m.ord)
    from jsonb_array_elements(v_level1) with ordinality m(value,ord)
    where m.value->>'id' not in ('artificer-tinkers-magic-feature-l1','artificer-tinkers-magic-resource','artificer-tinkers-magic-create')
  ),'[]'::jsonb)||jsonb_build_array(v_tinker_feature,v_tinker_resource,v_tinker_action);
  update public.rule_template_levels set mechanics=v_level1 where template_id=v_artificer and level=1;

  select mechanics into v_level2 from public.rule_template_levels where template_id=v_artificer and level=2 for update;
  if v_level2 is null then raise exception 'ARTIFICER_STAGE3_LEVEL2_MISSING'; end if;
  v_level2:=coalesce((
    select jsonb_agg(m.value order by m.ord)
    from jsonb_array_elements(v_level2) with ordinality m(value,ord)
    where m.value->>'id'<>'artificer-replicate-magic-item-feature-l2'
  ),'[]'::jsonb)||jsonb_build_array(v_replicate_feature);
  update public.rule_template_levels
  set mechanics=v_level2,
      choices=coalesce((
        select jsonb_agg(c.value order by c.ord)
        from jsonb_array_elements(coalesce(choices,'[]'::jsonb)) with ordinality c(value,ord)
        where c.value->>'key'<>'artificer_replication_plans'
      ),'[]'::jsonb)||jsonb_build_array(v_plan_choice)
  where template_id=v_artificer and level=2;

  update public.rule_templates
  set catalog_revision='efota-2025-artificer-stage3-item-replication-v1',
      author_description='',author_comment='',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','IN_PROGRESS_STAGE3_CORE_ITEM_RUNTIME_READY','runtime_stage',3,
        'runtime_revision','efota-2025-artificer-stage3-item-replication-v1',
        'stage3_core_item_runtime_certified',true,'base_item_runtime_pending_stage3',false,
        'tinkers_magic_item_runtime',true,'replicate_magic_item_runtime',true,
        'replication_plan_choice_key','artificer_replication_plans',
        'replication_plan_count_by_level',jsonb_build_object('2',4,'6',5,'10',6,'14',7,'18',8),
        'replicated_item_count_by_level',jsonb_build_object('2',2,'6',3,'10',4,'14',5,'18',6),
        'attunement_runtime','generic_cheburashka_item_state_v1',
        'remaining_base_runtime_pending_stage4',true,'next_stage','artificer_remaining_base_runtime'
      ),updated_at=now()
  where id=v_artificer;
end;
$function$;
revoke all on function private.ensure_artificer_stage3_item_runtime_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_artificer_stage3_item_runtime_v1(uuid) to service_role;

create or replace function private.ensure_artificer_stage3_item_runtime_after_campaign_v1()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin perform private.ensure_artificer_stage3_item_runtime_v1(new.id); return new; end;
$function$;
revoke all on function private.ensure_artificer_stage3_item_runtime_after_campaign_v1() from public,anon,authenticated;
drop trigger if exists o_campaigns_ensure_artificer_stage3_item_runtime_v1 on public.campaigns;
create trigger o_campaigns_ensure_artificer_stage3_item_runtime_v1
after insert on public.campaigns for each row execute function private.ensure_artificer_stage3_item_runtime_after_campaign_v1();

do $apply$
declare r record;
begin for r in select id from public.campaigns loop perform private.ensure_artificer_stage3_item_runtime_v1(r.id); end loop; end;
$apply$;

do $cert$
declare r record; v_choice jsonb; v_count integer;
begin
  for r in select t.id,t.campaign_id,t.catalog_revision,t.rules_meta
    from public.rule_templates t where t.kind='class' and t.catalog_key='class:artificer' and t.is_active
  loop
    if r.catalog_revision<>'efota-2025-artificer-stage3-item-replication-v1'
      then raise exception 'ARTIFICER_STAGE3_BAD_REVISION:%',r.campaign_id; end if;
    if coalesce((r.rules_meta->>'runtime_stage')::integer,0)<>3
       or r.rules_meta->>'mechanics_status'<>'IN_PROGRESS_STAGE3_CORE_ITEM_RUNTIME_READY'
       or not coalesce((r.rules_meta->>'stage3_core_item_runtime_certified')::boolean,false)
    then raise exception 'ARTIFICER_STAGE3_BAD_STATUS:%',r.campaign_id; end if;
    if not exists(
      select 1 from public.rule_template_levels l cross join lateral jsonb_array_elements(l.mechanics) m(value)
      where l.template_id=r.id and l.level=1 and m.value->>'id'='artificer-tinkers-magic-resource'
        and m.value->>'key'='tinkers_magic'
    ) then raise exception 'ARTIFICER_STAGE3_TINKER_RESOURCE_MISSING:%',r.campaign_id; end if;
    if not exists(
      select 1 from public.rule_template_levels l cross join lateral jsonb_array_elements(l.mechanics) m(value)
      where l.template_id=r.id and l.level=1 and m.value->>'id'='artificer-tinkers-magic-create'
        and m.value->>'type'='action'
    ) then raise exception 'ARTIFICER_STAGE3_TINKER_ACTION_MISSING:%',r.campaign_id; end if;
    select c.value into v_choice
    from public.rule_template_levels l cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
    where l.template_id=r.id and l.level=2 and c.value->>'key'='artificer_replication_plans' limit 1;
    if v_choice is null
       or (v_choice->>'count')::integer<>4
       or (v_choice->'count_by_level'->>'6')::integer<>5
       or (v_choice->'count_by_level'->>'10')::integer<>6
       or (v_choice->'count_by_level'->>'14')::integer<>7
       or (v_choice->'count_by_level'->>'18')::integer<>8
       or (v_choice#>>'{option_provider,active_count_by_level,2}')::integer<>2
       or (v_choice#>>'{option_provider,active_count_by_level,6}')::integer<>3
       or (v_choice#>>'{option_provider,active_count_by_level,10}')::integer<>4
       or (v_choice#>>'{option_provider,active_count_by_level,14}')::integer<>5
       or (v_choice#>>'{option_provider,active_count_by_level,18}')::integer<>6
       or jsonb_array_length(v_choice->'options')<52
    then raise exception 'ARTIFICER_STAGE3_PLAN_CHOICE_INVALID:%',r.campaign_id; end if;
    select count(*) into v_count from public.rule_template_levels where template_id=r.id;
    if v_count<>20 then raise exception 'ARTIFICER_STAGE3_LEVEL_COUNT_INVALID:%:%',r.campaign_id,v_count; end if;
  end loop;
  if exists(
    select 1 from public.rule_templates
    where kind='class' and catalog_key='class:artificer' and is_active and rules_meta->>'mechanics_status'='READY'
  ) then raise exception 'ARTIFICER_STAGE3_MUST_NOT_WRITE_READY'; end if;
end;
$cert$;

commit;