begin;

-- Artificer Stage 3: shared bounded choices + Chasovoy/Cheburashka item lifecycle.
-- Literary/Voss text is intentionally untouched.

-- Generic bounded-choice wrapper: existing choice count remains the maximum,
-- while allow_fewer permits 0..max (or minimum_count..max) selections.
do $rename$
begin
  if to_regprocedure('private.validate_template_choice_instances_exact_v2(jsonb,jsonb,integer,jsonb,text)') is null
     and to_regprocedure('private.validate_template_choice_instances_v2(jsonb,jsonb,integer,jsonb,text)') is not null then
    alter function private.validate_template_choice_instances_v2(jsonb,jsonb,integer,jsonb,text)
      rename to validate_template_choice_instances_exact_v2;
  end if;
end
$rename$;

create or replace function private.validate_template_choice_instances_v2(
  p_choice jsonb,
  p_instances jsonb,
  p_source_level integer,
  p_selected_choices jsonb,
  p_choice_key text
)
returns jsonb
language plpgsql
set search_path=''
as $function$
declare
  v_max integer:=1;
  v_min integer:=0;
  v_actual integer;
  v_pair record;
  v_adjusted jsonb;
  v_result jsonb;
begin
  if not coalesce((p_choice->>'allow_fewer')::boolean,false) then
    return private.validate_template_choice_instances_exact_v2(
      p_choice,p_instances,p_source_level,p_selected_choices,p_choice_key
    );
  end if;
  if jsonb_typeof(coalesce(p_instances,'null'::jsonb))<>'array' then
    raise exception 'CHOICE_INSTANCES_MUST_BE_ARRAY';
  end if;
  v_max:=greatest(1,coalesce((p_choice->>'count')::integer,1));
  if jsonb_typeof(coalesce(p_choice->'count_by_level','{}'::jsonb))='object' then
    for v_pair in select key,value from jsonb_each_text(p_choice->'count_by_level')
    loop
      if v_pair.key ~ '^[0-9]+$' and v_pair.key::integer<=p_source_level then
        v_max:=greatest(v_max,greatest(1,v_pair.value::integer));
      end if;
    end loop;
  end if;
  v_min:=greatest(0,least(v_max,coalesce((p_choice->>'minimum_count')::integer,0)));
  v_actual:=jsonb_array_length(p_instances);
  if v_actual<v_min or v_actual>v_max then
    raise exception 'CHOICE_COUNT_OUT_OF_BOUNDS:min=%:max=%:actual=%',v_min,v_max,v_actual;
  end if;
  if v_actual=0 then
    return jsonb_build_object('required_count',v_max,'instances','[]'::jsonb,'legacy_options','[]'::jsonb);
  end if;
  v_adjusted:=(p_choice-'count_by_level')||jsonb_build_object('count',v_actual,'allow_fewer',false);
  v_result:=private.validate_template_choice_instances_exact_v2(
    v_adjusted,p_instances,p_source_level,p_selected_choices,p_choice_key
  );
  return jsonb_set(v_result,'{required_count}',to_jsonb(v_max),true);
end;
$function$;

revoke all on function private.validate_template_choice_instances_v2(jsonb,jsonb,integer,jsonb,text)
from public,anon,authenticated;
grant execute on function private.validate_template_choice_instances_v2(jsonb,jsonb,integer,jsonb,text)
to service_role;

-- Chasovoy-backed canonical definitions for the explicit published plan tables.
do $plans$
declare
  v jsonb;
  v_id uuid;
  v_data jsonb;
begin
  for v in select value from jsonb_array_elements('[{"level":2,"key":"alchemy-jug","name":"Alchemy Jug","attunement":false,"rarity":"uncommon"},{"level":2,"key":"bag-of-holding","name":"Bag of Holding","attunement":false,"rarity":"uncommon"},{"level":2,"key":"cap-of-water-breathing","name":"Cap of Water Breathing","attunement":false,"rarity":"uncommon"},{"level":2,"key":"common-magic-item","name":"Common magic item","attunement":false,"rarity":"common"},{"level":2,"key":"goggles-of-night","name":"Goggles of Night","attunement":false,"rarity":"uncommon"},{"level":2,"key":"manifold-tool","name":"Manifold Tool","attunement":true,"rarity":"uncommon"},{"level":2,"key":"repeating-shot","name":"Repeating Shot","attunement":true,"rarity":"uncommon"},{"level":2,"key":"returning-weapon","name":"Returning Weapon","attunement":false,"rarity":"uncommon"},{"level":2,"key":"rope-of-climbing","name":"Rope of Climbing","attunement":false,"rarity":"uncommon"},{"level":2,"key":"sending-stones","name":"Sending Stones","attunement":false,"rarity":"uncommon"},{"level":2,"key":"shield-plus-1","name":"Shield +1","attunement":false,"rarity":"uncommon"},{"level":2,"key":"wand-of-magic-detection","name":"Wand of Magic Detection","attunement":false,"rarity":"uncommon"},{"level":2,"key":"wand-of-secrets","name":"Wand of Secrets","attunement":false,"rarity":"uncommon"},{"level":2,"key":"wand-of-the-war-mage-plus-1","name":"Wand of the War Mage +1","attunement":true,"rarity":"uncommon"},{"level":2,"key":"weapon-plus-1","name":"Weapon +1","attunement":false,"rarity":"uncommon"},{"level":2,"key":"wraps-of-unarmed-power-plus-1","name":"Wraps of Unarmed Power +1","attunement":false,"rarity":"uncommon"},{"level":6,"key":"armor-plus-1","name":"Armor +1","attunement":false,"rarity":"uncommon"},{"level":6,"key":"boots-of-elvenkind","name":"Boots of Elvenkind","attunement":false,"rarity":"uncommon"},{"level":6,"key":"boots-of-the-winding-path","name":"Boots of the Winding Path","attunement":true,"rarity":"uncommon"},{"level":6,"key":"cloak-of-elvenkind","name":"Cloak of Elvenkind","attunement":true,"rarity":"uncommon"},{"level":6,"key":"cloak-of-the-manta-ray","name":"Cloak of the Manta Ray","attunement":true,"rarity":"uncommon"},{"level":6,"key":"dazzling-weapon","name":"Dazzling Weapon","attunement":true,"rarity":"uncommon"},{"level":6,"key":"eyes-of-charming","name":"Eyes of Charming","attunement":true,"rarity":"uncommon"},{"level":6,"key":"eyes-of-minute-seeing","name":"Eyes of Minute Seeing","attunement":false,"rarity":"uncommon"},{"level":6,"key":"gloves-of-thievery","name":"Gloves of Thievery","attunement":false,"rarity":"uncommon"},{"level":6,"key":"helm-of-awareness","name":"Helm of Awareness","attunement":false,"rarity":"uncommon"},{"level":6,"key":"lantern-of-revealing","name":"Lantern of Revealing","attunement":false,"rarity":"uncommon"},{"level":6,"key":"mind-sharpener","name":"Mind Sharpener","attunement":true,"rarity":"uncommon"},{"level":6,"key":"necklace-of-adaptation","name":"Necklace of Adaptation","attunement":true,"rarity":"uncommon"},{"level":6,"key":"pipes-of-haunting","name":"Pipes of Haunting","attunement":false,"rarity":"uncommon"},{"level":6,"key":"repulsion-shield","name":"Repulsion Shield","attunement":false,"rarity":"uncommon"},{"level":6,"key":"ring-of-swimming","name":"Ring of Swimming","attunement":false,"rarity":"uncommon"},{"level":6,"key":"ring-of-water-walking","name":"Ring of Water Walking","attunement":false,"rarity":"uncommon"},{"level":6,"key":"sentinel-shield","name":"Sentinel Shield","attunement":false,"rarity":"uncommon"},{"level":6,"key":"spell-refueling-ring","name":"Spell-Refueling Ring","attunement":true,"rarity":"uncommon"},{"level":6,"key":"wand-of-magic-missiles","name":"Wand of Magic Missiles","attunement":false,"rarity":"uncommon"},{"level":6,"key":"wand-of-web","name":"Wand of Web","attunement":true,"rarity":"uncommon"},{"level":6,"key":"weapon-of-warning","name":"Weapon of Warning","attunement":true,"rarity":"uncommon"},{"level":10,"key":"armor-of-resistance","name":"Armor of Resistance","attunement":true,"rarity":"rare"},{"level":10,"key":"dagger-of-venom","name":"Dagger of Venom","attunement":false,"rarity":"rare"},{"level":10,"key":"elven-chain","name":"Elven Chain","attunement":false,"rarity":"rare"},{"level":10,"key":"ring-of-feather-falling","name":"Ring of Feather Falling","attunement":true,"rarity":"rare"},{"level":10,"key":"ring-of-jumping","name":"Ring of Jumping","attunement":true,"rarity":"uncommon"},{"level":10,"key":"ring-of-mind-shielding","name":"Ring of Mind Shielding","attunement":true,"rarity":"uncommon"},{"level":10,"key":"shield-plus-2","name":"Shield +2","attunement":false,"rarity":"rare"},{"level":10,"key":"uncommon-wondrous-item","name":"Uncommon Wondrous Item","attunement":false,"rarity":"uncommon"},{"level":10,"key":"wand-of-the-war-mage-plus-2","name":"Wand of the War Mage +2","attunement":true,"rarity":"rare"},{"level":10,"key":"weapon-plus-2","name":"Weapon +2","attunement":false,"rarity":"rare"},{"level":10,"key":"wraps-of-unarmed-power-plus-2","name":"Wraps of Unarmed Power +2","attunement":false,"rarity":"rare"},{"level":14,"key":"armor-plus-2","name":"Armor +2","attunement":false,"rarity":"rare"},{"level":14,"key":"arrow-catching-shield","name":"Arrow-Catching Shield","attunement":true,"rarity":"rare"},{"level":14,"key":"flame-tongue","name":"Flame Tongue","attunement":true,"rarity":"rare"},{"level":14,"key":"rare-wondrous-item","name":"Rare Wondrous Item","attunement":false,"rarity":"rare"},{"level":14,"key":"ring-of-free-action","name":"Ring of Free Action","attunement":true,"rarity":"rare"},{"level":14,"key":"ring-of-protection","name":"Ring of Protection","attunement":true,"rarity":"rare"},{"level":14,"key":"ring-of-the-ram","name":"Ring of the Ram","attunement":true,"rarity":"rare"}]'::jsonb)
  loop
    select id into v_id
    from public.reference_definitions
    where kind='item' and scope='system' and campaign_id is null
      and slug='artificer-plan-'||(v->>'key')
    limit 1;

    v_data:=jsonb_build_object(
      'category','other',
      'stack_mode','instance',
      'usage_mode','none',
      'inventory_profile',jsonb_build_object(
        'semantic_role','magic_item.replica',
        'packing_mode','instance',
        'footprint_mode','compact_1x1',
        'shape_mask',jsonb_build_array('1'),
        'shape_width',1,'shape_height',1,'rotatable',false,'stack_max',null
      ),
      'attunement',jsonb_build_object('required',coalesce((v->>'attunement')::boolean,false)),
      'magic_item',jsonb_build_object('rarity',v->>'rarity','replicated',true),
      'replication_plan',jsonb_build_object(
        'eligible',true,
        'unlock_level',(v->>'level')::integer,
        'category','published_plan',
        'plan_key',v->>'key',
        'selector_family',(v->>'key') in ('common-magic-item','uncommon-wondrous-item','rare-wondrous-item')
      )
    );

    if v_id is null then
      insert into public.reference_definitions(
        kind,scope,campaign_id,slug,visibility,status,source_kind,source_label,external_id,created_by
      ) values(
        'item','system',null,'artificer-plan-'||(v->>'key'),'campaign','active','official',
        'Eberron: Forge of the Artificer (2025)','artificer-plan:'||(v->>'key'),null
      ) returning id into v_id;
      insert into public.reference_definition_revisions(
        definition_id,revision,name,summary,rules_text,mechanics,data,created_by
      ) values(
        v_id,1,v->>'name','','','[]'::jsonb,v_data,null
      );
    else
      update public.reference_definition_revisions
      set name=v->>'name',summary='',rules_text='',data=v_data
      where definition_id=v_id and revision=(
        select current_revision from public.reference_definitions where id=v_id
      );
      update public.reference_definitions set status='active',source_kind='official',
        source_label='Eberron: Forge of the Artificer (2025)',updated_at=now()
      where id=v_id;
    end if;
  end loop;
end
$plans$;

-- PHB mundane definitions specifically exposed by Tinker's Magic.
do $tinker$
declare
  v jsonb;
  v_id uuid;
  v_data jsonb;
begin
  for v in select value from jsonb_array_elements('[{"key":"ball-bearings","name":"Ball Bearings"},{"key":"basket","name":"Basket"},{"key":"bedroll","name":"Bedroll"},{"key":"bell","name":"Bell"},{"key":"blanket","name":"Blanket"},{"key":"block-and-tackle","name":"Block and Tackle"},{"key":"bottle-glass","name":"Bottle, Glass"},{"key":"bucket","name":"Bucket"},{"key":"caltrops","name":"Caltrops"},{"key":"candle","name":"Candle"},{"key":"crowbar","name":"Crowbar"},{"key":"flask","name":"Flask"},{"key":"grappling-hook","name":"Grappling Hook"},{"key":"hunting-trap","name":"Hunting Trap"},{"key":"jug","name":"Jug"},{"key":"lamp","name":"Lamp"},{"key":"manacles","name":"Manacles"},{"key":"net","name":"Net"},{"key":"oil","name":"Oil"},{"key":"paper","name":"Paper"},{"key":"parchment","name":"Parchment"},{"key":"pole","name":"Pole"},{"key":"pouch","name":"Pouch"},{"key":"rope","name":"Rope"},{"key":"sack","name":"Sack"},{"key":"shovel","name":"Shovel"},{"key":"spikes-iron","name":"Spikes, Iron"},{"key":"string","name":"String"},{"key":"tinderbox","name":"Tinderbox"},{"key":"torch","name":"Torch"},{"key":"vial","name":"Vial"}]'::jsonb)
  loop
    select id into v_id
    from public.reference_definitions
    where kind='item' and scope='system' and campaign_id is null
      and slug='artificer-tinker-'||(v->>'key')
    limit 1;

    v_data:=jsonb_build_object(
      'category','other','stack_mode','instance','usage_mode','none',
      'inventory_profile',jsonb_build_object(
        'semantic_role','tinkers_magic.gear',
        'packing_mode','instance',
        'footprint_mode','compact_1x1',
        'shape_mask',jsonb_build_array('1'),
        'shape_width',1,'shape_height',1,'rotatable',false,'stack_max',null
      ),
      'tinkers_magic',jsonb_build_object('eligible',true,'item_key',v->>'key')
    );

    if v_id is null then
      insert into public.reference_definitions(
        kind,scope,campaign_id,slug,visibility,status,source_kind,source_label,external_id,created_by
      ) values(
        'item','system',null,'artificer-tinker-'||(v->>'key'),'campaign','active','official',
        'Player''s Handbook gear via Eberron: Forge of the Artificer (2025)',
        'artificer-tinker:'||(v->>'key'),null
      ) returning id into v_id;
      insert into public.reference_definition_revisions(
        definition_id,revision,name,summary,rules_text,mechanics,data,created_by
      ) values(v_id,1,v->>'name','','','[]'::jsonb,v_data,null);
    else
      update public.reference_definition_revisions
      set name=v->>'name',summary='',rules_text='',data=v_data
      where definition_id=v_id and revision=(
        select current_revision from public.reference_definitions where id=v_id
      );
    end if;
  end loop;
end
$tinker$;

create or replace function private.character_choice_has_option_v1(
  p_selected jsonb,p_choice_key text,p_option text
)
returns boolean
language sql
immutable
set search_path=''
as $$
  select exists(
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(p_selected->p_choice_key,'null'::jsonb))='array'
          then p_selected->p_choice_key
        when jsonb_typeof(coalesce(p_selected->p_choice_key,'null'::jsonb))='string'
          then jsonb_build_array(p_selected->p_choice_key)
        else '[]'::jsonb
      end
    ) x(value)
    where x.value #>> '{}'=p_option
  )
  or exists(
    select 1
    from jsonb_array_elements(coalesce(
      p_selected#>array['_choice_runtime_v2','choices',p_choice_key,'instances'],
      '[]'::jsonb
    )) x(value)
    where case when jsonb_typeof(x.value)='string' then x.value #>> '{}' else x.value->>'option' end=p_option
  );
$$;

revoke all on function private.character_choice_has_option_v1(jsonb,text,text)
from public,anon,authenticated;
grant execute on function private.character_choice_has_option_v1(jsonb,text,text) to service_role;

-- Extend the generic provider with "options already selected in another choice".
create or replace function private.validate_choice_option_provider_v1(
  p_character_id uuid,p_assignment_id uuid,p_choice_key text,p_choice jsonb,p_before jsonb,p_instances jsonb
)
returns void language plpgsql stable security definer set search_path=''
as $function$
declare
  v_provider jsonb:=p_choice->'option_provider'; v_kind text; v_min integer; v_max integer;
  v_instance jsonb; v_option text; v_rank integer; v_source_level integer; v_already_stored boolean;
  v_assignment public.character_template_assignments%rowtype;
  v_source_choice_key text;
begin
  if v_provider is null or jsonb_typeof(v_provider)<>'object' then return; end if;
  v_kind:=coalesce(v_provider->>'kind','');
  v_source_level:=coalesce(private.character_template_source_level(p_assignment_id),1);
  select * into v_assignment from public.character_template_assignments where id=p_assignment_id;

  for v_instance in select value from jsonb_array_elements(coalesce(p_instances,'[]'::jsonb))
  loop
    v_option:=case when jsonb_typeof(v_instance)='string' then v_instance #>> '{}' else coalesce(v_instance->>'option','') end;
    if v_option='' then continue; end if;
    select exists(
      select 1 from jsonb_array_elements(coalesce(p_before,'[]'::jsonb)) b(value)
      where case when jsonb_typeof(b.value)='string' then b.value #>> '{}' else coalesce(b.value->>'option','') end=v_option
    ) into v_already_stored;
    if v_already_stored then continue; end if;

    if v_kind='skill_proficiencies' then
      v_min:=greatest(0,least(2,coalesce((v_provider->>'minimum_rank')::integer,1)));
      v_max:=greatest(v_min,least(2,coalesce((v_provider->>'maximum_rank')::integer,2)));
      if v_option !~ '^skill:[a-z_]+$' then raise exception 'CHOICE_PROVIDER_SKILL_OPTION_INVALID:%',v_option; end if;
      v_rank:=private.character_skill_proficiency_rank_for_choice_v1(p_character_id,v_option,p_assignment_id,p_choice_key);
      if v_rank<v_min or v_rank>v_max then raise exception 'CHOICE_PROVIDER_SKILL_PROFICIENCY_INELIGIBLE:%',v_option; end if;
      continue;
    end if;
    if v_kind='weapon_proficiencies' then
      if v_option !~ '^weapon:[a-z0-9-]+$' then raise exception 'CHOICE_PROVIDER_WEAPON_OPTION_INVALID:%',v_option; end if;
      if not private.character_has_weapon_proficiency_for_choice_v1(p_character_id,v_option,p_assignment_id,p_choice_key) then
        raise exception 'CHOICE_PROVIDER_WEAPON_PROFICIENCY_INELIGIBLE:%',v_option;
      end if;
      continue;
    end if;
    if v_kind='unproficient_skill_or_tool' then
      if v_option ~ '^skill:[a-z_]+$' then
        v_rank:=private.character_skill_proficiency_rank_for_choice_v1(p_character_id,v_option,p_assignment_id,p_choice_key);
        if v_rank>0 then raise exception 'CHOICE_PROVIDER_ALREADY_PROFICIENT:%',v_option; end if;
      elsif v_option ~ '^tool:[a-z0-9:-]+$' then
        if private.character_has_tool_proficiency_for_choice_v1(p_character_id,v_option,p_assignment_id,p_choice_key) then
          raise exception 'CHOICE_PROVIDER_ALREADY_PROFICIENT:%',v_option;
        end if;
      else raise exception 'CHOICE_PROVIDER_SKILL_OR_TOOL_OPTION_INVALID:%',v_option;
      end if;
      continue;
    end if;
    if v_kind='reference_item_plans' then
      if not private.reference_item_plan_option_valid_v1(p_character_id,v_option,v_source_level,nullif(v_provider->>'category','')) then
        raise exception 'CHOICE_PROVIDER_REFERENCE_ITEM_PLAN_INELIGIBLE:%',v_option;
      end if;
      continue;
    end if;
    if v_kind='selected_reference_item_plans' then
      v_source_choice_key:=nullif(btrim(coalesce(v_provider->>'source_choice_key','')),'');
      if v_source_choice_key is null then raise exception 'CHOICE_PROVIDER_SOURCE_CHOICE_REQUIRED'; end if;
      if not private.character_choice_has_option_v1(coalesce(v_assignment.selected_choices,'{}'::jsonb),v_source_choice_key,v_option) then
        raise exception 'CHOICE_PROVIDER_REFERENCE_ITEM_PLAN_NOT_KNOWN:%',v_option;
      end if;
      continue;
    end if;
    raise exception 'CHOICE_OPTION_PROVIDER_UNSUPPORTED:%',v_kind;
  end loop;
end;
$function$;

revoke all on function private.validate_choice_option_provider_v1(uuid,uuid,text,jsonb,jsonb,jsonb)
from public,anon,authenticated;
grant execute on function private.validate_choice_option_provider_v1(uuid,uuid,text,jsonb,jsonb,jsonb)
to service_role;

-- Generic Cheburashka constructor from an immutable Chasovoy definition.
create or replace function private.cheburashka_create_definition_instance_v1(
  p_character_id uuid,p_definition_id uuid,p_item_state jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_revision public.reference_definition_revisions%rowtype;
  v_definition public.reference_definitions%rowtype;
  v_item_id uuid;
  v_data jsonb;
begin
  select * into v_definition from public.reference_definitions
  where id=p_definition_id and kind='item' and status='active';
  if v_definition.id is null then raise exception 'INVENTORY_DEFINITION_NOT_FOUND'; end if;
  select * into v_revision from public.reference_definition_revisions
  where definition_id=v_definition.id and revision=v_definition.current_revision;
  if v_revision.definition_id is null then raise exception 'INVENTORY_DEFINITION_REVISION_NOT_FOUND'; end if;
  v_data:=coalesce(v_revision.data,'{}'::jsonb);

  insert into public.character_inventory_items(
    character_id,name,quantity,weight,equipped,category,equipment_slot,image_url,description,
    definition_id,definition_revision,mechanics,usage_mode,charges_current,charges_max,item_state,stack_mode
  ) values(
    p_character_id,v_revision.name,1,null,false,
    coalesce(nullif(v_data->>'category',''),'other'),null,null,coalesce(v_revision.summary,''),
    v_definition.id,v_revision.revision,coalesce(v_revision.mechanics,'[]'::jsonb),
    coalesce(nullif(v_data->>'usage_mode',''),'none'),
    case when v_data->>'usage_mode'='charges' then coalesce((v_data->>'charges_max')::integer,1) else null end,
    case when v_data->>'usage_mode'='charges' then coalesce((v_data->>'charges_max')::integer,1) else null end,
    coalesce(p_item_state,'{}'::jsonb),
    coalesce(nullif(v_data->>'stack_mode',''),'instance')
  ) returning id into v_item_id;
  return v_item_id;
end;
$function$;

revoke all on function private.cheburashka_create_definition_instance_v1(uuid,uuid,jsonb)
from public,anon,authenticated;
grant execute on function private.cheburashka_create_definition_instance_v1(uuid,uuid,jsonb) to service_role;

create or replace function private.artificer_stage3_class_assignment_v1(p_character_id uuid)
returns table(assignment_id uuid,class_level integer)
language sql stable security definer set search_path=''
as $$
  select a.id,greatest(1,coalesce(a.template_level,1))
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id and t.kind='class' and t.catalog_key='class:artificer'
  order by a.assigned_at,a.id limit 1
$$;
revoke all on function private.artificer_stage3_class_assignment_v1(uuid) from public,anon,authenticated;
grant execute on function private.artificer_stage3_class_assignment_v1(uuid) to service_role;

create or replace function private.artificer_stage3_tinkers_max_v1(p_character_id uuid)
returns integer language sql stable security definer set search_path=''
as $$
  select greatest(1,floor((coalesce(cs.intelligence,10)-10)::numeric/2)::integer)
  from public.character_sheets cs where cs.character_id=p_character_id
$$;
revoke all on function private.artificer_stage3_tinkers_max_v1(uuid) from public,anon,authenticated;
grant execute on function private.artificer_stage3_tinkers_max_v1(uuid) to service_role;

create or replace function private.artificer_stage3_sync_tinkers_resource_v1(p_character_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_max integer; v_old_max integer; v_old_current integer; v_actor uuid:=auth.uid();
begin
  if not exists(select 1 from private.artificer_stage3_class_assignment_v1(p_character_id) a where a.class_level>=1) then
    delete from public.character_resource_states where character_id=p_character_id and state_key='artificer_tinkers_magic';
    return;
  end if;
  v_max:=coalesce(private.artificer_stage3_tinkers_max_v1(p_character_id),1);
  select max_snapshot,current into v_old_max,v_old_current
  from public.character_resource_states
  where character_id=p_character_id and state_key='artificer_tinkers_magic' for update;
  insert into public.character_resource_states(character_id,state_key,current,max_snapshot,label,recharge,updated_by)
  values(p_character_id,'artificer_tinkers_magic',v_max,v_max,'Tinker''s Magic',
    '{"triggers":["long_rest"],"restore":"full"}'::jsonb,v_actor)
  on conflict(character_id,state_key) do update set
    max_snapshot=excluded.max_snapshot,
    current=case when v_old_max is null then excluded.max_snapshot
      else greatest(0,least(excluded.max_snapshot,excluded.max_snapshot-greatest(0,v_old_max-v_old_current))) end,
    label=excluded.label,recharge=excluded.recharge,updated_by=v_actor,updated_at=now();
end;
$function$;
revoke all on function private.artificer_stage3_sync_tinkers_resource_v1(uuid) from public,anon,authenticated;
grant execute on function private.artificer_stage3_sync_tinkers_resource_v1(uuid) to service_role;

create or replace function public.create_tinkers_magic_item_v1(
  p_character_id uuid,p_definition_id uuid,p_command_id uuid default gen_random_uuid()
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_assignment uuid; v_level integer; v_current integer; v_item uuid; v_result jsonb; v_data jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (private.can_manage_character(p_character_id,auth.uid()) or private.is_assigned_character(p_character_id,auth.uid())) then
    raise exception 'NOT_ALLOWED';
  end if;
  select assignment_id,class_level into v_assignment,v_level from private.artificer_stage3_class_assignment_v1(p_character_id);
  if v_assignment is null or v_level<1 then raise exception 'ARTIFICER_TINKERS_MAGIC_UNAVAILABLE'; end if;
  select r.data into v_data
  from public.reference_definitions d join public.reference_definition_revisions r
    on r.definition_id=d.id and r.revision=d.current_revision
  where d.id=p_definition_id and d.kind='item' and d.status='active';
  if not coalesce((v_data#>>'{tinkers_magic,eligible}')::boolean,false) then
    raise exception 'ARTIFICER_TINKERS_MAGIC_ITEM_INELIGIBLE';
  end if;

  perform private.artificer_stage3_sync_tinkers_resource_v1(p_character_id);
  select current into v_current from public.character_resource_states
  where character_id=p_character_id and state_key='artificer_tinkers_magic' for update;
  if coalesce(v_current,0)<1 then raise exception 'ARTIFICER_TINKERS_MAGIC_EXHAUSTED'; end if;
  update public.character_resource_states set current=current-1,updated_by=auth.uid(),updated_at=now()
  where character_id=p_character_id and state_key='artificer_tinkers_magic';

  v_item:=private.cheburashka_create_definition_instance_v1(
    p_character_id,p_definition_id,
    jsonb_build_object(
      'class_created',true,'creator_character_id',p_character_id,'origin_assignment_id',v_assignment,
      'origin_feature','tinkers-magic','expires_on_creator_long_rest',true,'command_id',p_command_id
    )
  );
  select jsonb_build_object('itemId',v_item,'characterId',p_character_id,'feature','tinkers-magic') into v_result;
  return v_result;
end;
$function$;
revoke all on function public.create_tinkers_magic_item_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.create_tinkers_magic_item_v1(uuid,uuid,uuid) to authenticated;

-- Generic attunement state lives on the Cheburashka item instance. The class-specific
-- slot-count improvements are Stage 4; Stage 3 establishes state/projection semantics.
create or replace function public.set_inventory_item_attuned_v1(
  p_character_id uuid,p_item_id uuid,p_attuned boolean,p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_item public.character_inventory_items%rowtype; v_requires boolean; v_after jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (private.can_manage_character(p_character_id,auth.uid()) or private.is_assigned_character(p_character_id,auth.uid())) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into v_item from public.character_inventory_items
  where id=p_item_id and character_id=p_character_id and world_storage_id is null and surface_id is null for update;
  if v_item.id is null then raise exception 'INVENTORY_ITEM_NOT_HELD'; end if;
  if v_item.version<>p_expected_version then raise exception 'INVENTORY_VERSION_CONFLICT'; end if;
  select coalesce((r.data#>>'{attunement,required}')::boolean,false) into v_requires
  from public.reference_definition_revisions r
  where r.definition_id=v_item.definition_id and r.revision=v_item.definition_revision;
  if p_attuned and not coalesce(v_requires,false) then raise exception 'ITEM_DOES_NOT_REQUIRE_ATTUNEMENT'; end if;
  update public.character_inventory_items set
    item_state=case when p_attuned then
      jsonb_set(coalesce(item_state,'{}'::jsonb),'{attunement}',
        jsonb_build_object('attuned_to_character_id',p_character_id,'attuned_at',now()),true)
      else coalesce(item_state,'{}'::jsonb)-'attunement' end,
    version=version+1,updated_at=now()
  where id=p_item_id returning to_jsonb(character_inventory_items) into v_after;
  return v_after;
end;
$function$;
revoke all on function public.set_inventory_item_attuned_v1(uuid,uuid,boolean,bigint) from public,anon;
grant execute on function public.set_inventory_item_attuned_v1(uuid,uuid,boolean,bigint) to authenticated;

create or replace function private.artificer_stage3_choice_instances_v1(p_selected jsonb,p_choice_key text)
returns jsonb language sql immutable set search_path=''
as $$
  select case
    when jsonb_typeof(coalesce(p_selected#>array['_choice_runtime_v2','choices',p_choice_key,'instances'],'null'::jsonb))='array'
      then p_selected#>array['_choice_runtime_v2','choices',p_choice_key,'instances']
    when jsonb_typeof(coalesce(p_selected->p_choice_key,'null'::jsonb))='array'
      then (select coalesce(jsonb_agg(jsonb_build_object('option',x.value)),'[]'::jsonb)
            from jsonb_array_elements_text(p_selected->p_choice_key) x(value))
    when jsonb_typeof(coalesce(p_selected->p_choice_key,'null'::jsonb))='string'
      then jsonb_build_array(jsonb_build_object('option',p_selected->>p_choice_key))
    else '[]'::jsonb end
$$;

revoke all on function private.artificer_stage3_choice_instances_v1(jsonb,text) from public,anon,authenticated;
grant execute on function private.artificer_stage3_choice_instances_v1(jsonb,text) to service_role;

create or replace function private.artificer_stage3_reconcile_replicated_items_v1(p_character_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_level integer;
  v_known jsonb;
  v_desired jsonb;
  v_instance jsonb;
  v_option text;
  v_def uuid;
  v_attune boolean;
  v_max integer;
  v_item uuid;
begin
  select a.* into v_assignment
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id and t.kind='class' and t.catalog_key='class:artificer'
  order by a.assigned_at,a.id limit 1;
  if v_assignment.id is null then return; end if;
  v_level:=greatest(1,coalesce(v_assignment.template_level,1));
  if v_level<2 then return; end if;
  v_max:=case when v_level>=18 then 6 when v_level>=14 then 5 when v_level>=10 then 4 when v_level>=6 then 3 else 2 end;
  v_known:=private.artificer_stage3_choice_instances_v1(v_assignment.selected_choices,'artificer_replication_plans');
  v_desired:=private.artificer_stage3_choice_instances_v1(v_assignment.selected_choices,'artificer_replication_loadout');

  if jsonb_array_length(v_desired)>v_max then raise exception 'ARTIFICER_REPLICATION_LOADOUT_OVER_CAP:%',v_max; end if;

  -- Remove replicas whose desired plan is no longer selected. Contents are detached first.
  for v_item in
    select i.id
    from public.character_inventory_items i
    where i.item_state->>'origin_assignment_id'=v_assignment.id::text
      and i.item_state->>'origin_feature'='replicate-magic-item'
      and not exists(
        select 1 from jsonb_array_elements(v_desired) d(value)
        where d.value->>'option'='refdef:'||i.item_state->>'plan_definition_id'
      )
  loop
    update public.character_inventory_items set holder_item_id=null,placement_kind='root',
      placement_index=null,grid_x=null,grid_y=null,updated_at=now()
    where holder_item_id=v_item;
    delete from public.character_inventory_items where id=v_item;
  end loop;

  for v_instance in select value from jsonb_array_elements(v_desired)
  loop
    v_option:=v_instance->>'option';
    if v_option !~ '^refdef:[0-9a-fA-F-]{36}$' then raise exception 'ARTIFICER_REPLICATION_OPTION_INVALID:%',v_option; end if;
    v_def:=substring(v_option from 8)::uuid;
    if not exists(select 1 from jsonb_array_elements(v_known) k(value) where k.value->>'option'=v_option) then
      raise exception 'ARTIFICER_REPLICATION_PLAN_NOT_KNOWN:%',v_option;
    end if;
    if exists(
      select 1 from public.character_inventory_items i
      where i.item_state->>'origin_assignment_id'=v_assignment.id::text
        and i.item_state->>'origin_feature'='replicate-magic-item'
        and i.item_state->>'plan_definition_id'=v_def::text
    ) then continue; end if;

    v_attune:=coalesce((v_instance#>>'{config,attune}')::boolean,false);
    v_item:=private.cheburashka_create_definition_instance_v1(
      p_character_id,v_def,
      jsonb_build_object(
        'class_created',true,'creator_character_id',p_character_id,'origin_assignment_id',v_assignment.id,
        'origin_feature','replicate-magic-item','plan_definition_id',v_def,'created_at',now()
      ) || case when v_attune then jsonb_build_object(
        'attunement',jsonb_build_object('attuned_to_character_id',p_character_id,'attuned_at',now(),'instant_creation',true)
      ) else '{}'::jsonb end
    );
  end loop;
end;
$function$;

revoke all on function private.artificer_stage3_reconcile_replicated_items_v1(uuid) from public,anon,authenticated;
grant execute on function private.artificer_stage3_reconcile_replicated_items_v1(uuid) to service_role;

create or replace function private.artificer_stage3_assignment_reconcile_v1()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  perform private.artificer_stage3_sync_tinkers_resource_v1(coalesce(new.character_id,old.character_id));
  perform private.artificer_stage3_reconcile_replicated_items_v1(coalesce(new.character_id,old.character_id));
  return coalesce(new,old);
end;
$function$;
revoke all on function private.artificer_stage3_assignment_reconcile_v1() from public,anon,authenticated;

drop trigger if exists character_template_assignments_artificer_stage3_reconcile_v1
on public.character_template_assignments;
create trigger character_template_assignments_artificer_stage3_reconcile_v1
after insert or update of template_id,template_level,selected_choices or delete
on public.character_template_assignments
for each row execute function private.artificer_stage3_assignment_reconcile_v1();

create or replace function private.artificer_stage3_expire_tinkers_magic_items_v1(p_creator_character_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_item uuid;
begin
  for v_item in
    select id from public.character_inventory_items
    where item_state->>'origin_feature'='tinkers-magic'
      and item_state->>'creator_character_id'=p_creator_character_id::text
  loop
    update public.character_inventory_items set holder_item_id=null,placement_kind='root',
      placement_index=null,grid_x=null,grid_y=null,updated_at=now()
    where holder_item_id=v_item;
    delete from public.character_inventory_items where id=v_item;
  end loop;
end;
$function$;
revoke all on function private.artificer_stage3_expire_tinkers_magic_items_v1(uuid) from public,anon,authenticated;
grant execute on function private.artificer_stage3_expire_tinkers_magic_items_v1(uuid) to service_role;

-- Preserve the current canonical long-rest flow, adding only creator-owned temporary-item expiry.
create or replace function public.grant_character_long_rest(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_campaign_id uuid;
  v_restored_slots jsonb;
  v_spell_preparation boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null then raise exception 'Персонаж не найден'; end if;
  if not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Только GM или владелец может дать отдых'; end if;

  update public.character_short_rest_sessions
  set is_open=false,closed_at=now(),updated_at=now()
  where character_id=p_character_id and is_open=true;

  perform private.artificer_stage3_expire_tinkers_magic_items_v1(p_character_id);

  select coalesce(jsonb_object_agg(key,jsonb_build_object('max',greatest(coalesce((value->>'max')::integer,0),0),'used',0)),'{}'::jsonb)
  into v_restored_slots
  from jsonb_each(coalesce((select cs.spell_slots from public.character_sheets cs where cs.character_id=p_character_id),'{}'::jsonb));

  v_spell_preparation:=private.character_has_long_rest_spell_preparation(p_character_id);
  update public.character_sheets set
    current_hp=max_hp,temp_hp=0,death_save_successes=0,death_save_failures=0,
    spell_slots=coalesce(v_restored_slots,'{}'::jsonb),
    spell_change_unlocked=v_spell_preparation,updated_at=now()
  where character_id=p_character_id;

  perform public.recover_character_resources(p_character_id,'long_rest');
  perform private.artificer_stage3_sync_tinkers_resource_v1(p_character_id);

  insert into public.character_preparation_sessions(
    character_id,generation,is_open,opened_at,opened_by,closed_at,closed_by_message_id,updated_at
  ) values(p_character_id,1,true,now(),auth.uid(),null,null,now())
  on conflict(character_id) do update set
    generation=public.character_preparation_sessions.generation+1,is_open=true,opened_at=now(),
    opened_by=auth.uid(),closed_at=null,closed_by_message_id=null,updated_at=now();
end;
$function$;

-- Install Stage 3 choices/mechanics on every active Artificer package.
do $class$
declare
  r record;
  v_plan_options jsonb;
  v_labels jsonb;
  v_unlocks jsonb;
  v_l1 public.rule_template_levels%rowtype;
  v_l2 public.rule_template_levels%rowtype;
  v_mechanics jsonb;
  v_choices jsonb;
begin
  select coalesce(jsonb_agg('refdef:'||d.id::text order by (rr.data#>>'{replication_plan,unlock_level}')::int,rr.name),'[]'::jsonb),
         coalesce(jsonb_object_agg('refdef:'||d.id::text,rr.name),'{}'::jsonb),
         coalesce(jsonb_object_agg('refdef:'||d.id::text,(rr.data#>>'{replication_plan,unlock_level}')::int),'{}'::jsonb)
  into v_plan_options,v_labels,v_unlocks
  from public.reference_definitions d
  join public.reference_definition_revisions rr on rr.definition_id=d.id and rr.revision=d.current_revision
  where d.kind='item' and d.scope='system' and d.status='active'
    and d.external_id like 'artificer-plan:%'
    and coalesce((rr.data#>>'{replication_plan,eligible}')::boolean,false);

  for r in select * from public.rule_templates
    where kind='class' and catalog_key='class:artificer' and is_active
  loop
    select * into v_l1 from public.rule_template_levels where template_id=r.id and level=1;
    select * into v_l2 from public.rule_template_levels where template_id=r.id and level=2;

    v_mechanics:=coalesce(v_l1.mechanics,'[]'::jsonb);
    if not exists(select 1 from jsonb_array_elements(v_mechanics) m(value) where m.value->>'id'='artificer-tinkers-magic-resource') then
      v_mechanics:=v_mechanics||jsonb_build_array(
        jsonb_build_object(
          'id','artificer-tinkers-magic-resource','type','resource','sourceKey','tinkers-magic',
          'key','artificer_tinkers_magic','label','Tinker''s Magic',
          'max',jsonb_build_object('kind','max','values',jsonb_build_array(
            jsonb_build_object('kind','literal','value',1),
            jsonb_build_object('kind','reference','key','abilities.intelligence.modifier')
          )),
          'recharge',jsonb_build_array('long_rest'),'restore','full','initial','full'
        ),
        jsonb_build_object(
          'id','artificer-tinkers-magic-create','type','action','sourceKey','tinkers-magic',
          'key','class:artificer:tinkers-magic:create','label','Tinker''s Magic',
          'economy','magic_action','resourceKey','artificer_tinkers_magic','resourceCost',1,
          'tags',jsonb_build_array('artificer','inventory','tinkers_magic')
        )
      );
    end if;
    update public.rule_template_levels set mechanics=v_mechanics where id=v_l1.id;

    v_choices:=coalesce(v_l2.choices,'[]'::jsonb);
    v_choices:=(
      select coalesce(jsonb_agg(x.value order by x.ord),'[]'::jsonb)
      from jsonb_array_elements(v_choices) with ordinality x(value,ord)
      where x.value->>'key' not in ('artificer_replication_plans','artificer_replication_loadout')
    );
    v_choices:=v_choices||jsonb_build_array(
      jsonb_build_object(
        'key','artificer_replication_plans','label','Replicate Magic Item Plans','target','trait',
        'count',4,'count_by_level',jsonb_build_object('2',4,'6',5,'10',6,'14',7,'18',8),
        'selection_mode','player_once','replacement_policy','on_level_change','replacement_limit',1,
        'options',v_plan_options,'option_labels',v_labels,'option_unlock_level',v_unlocks,
        'option_provider',jsonb_build_object('kind','reference_item_plans'),'required',true
      ),
      jsonb_build_object(
        'key','artificer_replication_loadout','label','Replicated Magic Items','target','trait',
        'count',2,'count_by_level',jsonb_build_object('2',2,'6',3,'10',4,'14',5,'18',6),
        'selection_mode','player_once','refresh','long_rest','replacement_policy','preparation',
        'allow_fewer',true,'minimum_count',0,
        'options',v_plan_options,'option_labels',v_labels,'option_unlock_level',v_unlocks,
        'option_provider',jsonb_build_object('kind','selected_reference_item_plans','source_choice_key','artificer_replication_plans'),
        'required',false
      )
    );
    update public.rule_template_levels set choices=v_choices where id=v_l2.id;

    update public.rule_templates set
      catalog_revision='efota-2025-artificer-stage3-item-replication-v1',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','IN_PROGRESS_STAGE3_ITEM_REPLICATION_READY',
        'runtime_stage',3,
        'runtime_revision','efota-2025-artificer-stage3-item-replication-v1',
        'base_item_runtime_pending_stage3',false,
        'tinkers_magic_item_runtime',true,
        'replicate_magic_item_runtime',true,
        'replication_plan_count',(select count(*) from public.reference_definitions d join public.reference_definition_revisions rr on rr.definition_id=d.id and rr.revision=d.current_revision where d.external_id like 'artificer-plan:%' and coalesce((rr.data#>>'{replication_plan,eligible}')::boolean,false)),
        'replication_plan_progression',jsonb_build_object('2',4,'6',5,'10',6,'14',7,'18',8),
        'replicated_item_cap_progression',jsonb_build_object('2',2,'6',3,'10',4,'14',5,'18',6),
        'attunement_state_runtime',true,
        'remaining_base_runtime_pending_stage4',true,
        'next_stage','artificer_remaining_base_runtime'
      ),
      updated_at=now()
    where id=r.id;

    perform private.artificer_stage3_sync_tinkers_resource_v1(a.character_id)
    from public.character_template_assignments a where a.template_id=r.id;
    perform private.artificer_stage3_reconcile_replicated_items_v1(a.character_id)
    from public.character_template_assignments a where a.template_id=r.id;
  end loop;
end
$class$;

-- Future Stage 2 installers should immediately receive Stage 3 after campaign creation.
create or replace function private.ensure_artificer_stage3_item_runtime_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare r record;
begin
  for r in select a.character_id
    from public.character_template_assignments a
    join public.rule_templates t on t.id=a.template_id
    where t.campaign_id=p_campaign_id and t.kind='class' and t.catalog_key='class:artificer' and t.is_active
  loop
    perform private.artificer_stage3_sync_tinkers_resource_v1(r.character_id);
    perform private.artificer_stage3_reconcile_replicated_items_v1(r.character_id);
  end loop;
end;
$function$;
revoke all on function private.ensure_artificer_stage3_item_runtime_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_artificer_stage3_item_runtime_v1(uuid) to service_role;

-- Fail closed on Stage 3 package shape.
do $cert$
declare r record; v_count integer; v_choice jsonb;
begin
  select count(*) into v_count
  from public.reference_definitions d join public.reference_definition_revisions rr
    on rr.definition_id=d.id and rr.revision=d.current_revision
  where d.external_id like 'artificer-plan:%'
    and coalesce((rr.data#>>'{replication_plan,eligible}')::boolean,false);
  if v_count<>56 then raise exception 'ARTIFICER_STAGE3_PLAN_COUNT_INVALID:%',v_count; end if;

  select count(*) into v_count
  from public.reference_definitions d join public.reference_definition_revisions rr
    on rr.definition_id=d.id and rr.revision=d.current_revision
  where d.external_id like 'artificer-tinker:%'
    and coalesce((rr.data#>>'{tinkers_magic,eligible}')::boolean,false);
  if v_count<>31 then raise exception 'ARTIFICER_STAGE3_TINKER_ITEM_COUNT_INVALID:%',v_count; end if;

  for r in select * from public.rule_templates
    where kind='class' and catalog_key='class:artificer' and is_active
  loop
    if r.catalog_revision<>'efota-2025-artificer-stage3-item-replication-v1'
       or coalesce((r.rules_meta->>'runtime_stage')::integer,0)<>3
       or r.rules_meta->>'mechanics_status'<>'IN_PROGRESS_STAGE3_ITEM_REPLICATION_READY'
    then raise exception 'ARTIFICER_STAGE3_STATUS_INVALID:%',r.campaign_id; end if;

    select c.value into v_choice
    from public.rule_template_levels l cross join lateral jsonb_array_elements(l.choices) c(value)
    where l.template_id=r.id and l.level=2 and c.value->>'key'='artificer_replication_plans';
    if v_choice is null or (v_choice->'count_by_level'->>'18')::int<>8 then
      raise exception 'ARTIFICER_STAGE3_PLAN_CHOICE_INVALID:%',r.campaign_id; end if;

    select c.value into v_choice
    from public.rule_template_levels l cross join lateral jsonb_array_elements(l.choices) c(value)
    where l.template_id=r.id and l.level=2 and c.value->>'key'='artificer_replication_loadout';
    if v_choice is null or (v_choice->'count_by_level'->>'18')::int<>6
       or not coalesce((v_choice->>'allow_fewer')::boolean,false)
       or v_choice#>>'{option_provider,kind}'<>'selected_reference_item_plans'
    then raise exception 'ARTIFICER_STAGE3_LOADOUT_CHOICE_INVALID:%',r.campaign_id; end if;

    if not exists(
      select 1 from public.rule_template_levels l cross join lateral jsonb_array_elements(l.mechanics) m(value)
      where l.template_id=r.id and l.level=1 and m.value->>'id'='artificer-tinkers-magic-resource'
    ) then raise exception 'ARTIFICER_STAGE3_TINKERS_RESOURCE_MISSING:%',r.campaign_id; end if;
  end loop;
end
$cert$;

commit;
