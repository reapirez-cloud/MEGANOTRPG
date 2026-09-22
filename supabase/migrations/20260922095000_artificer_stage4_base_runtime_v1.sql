-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:artificer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/artificerRuntimeStage4Base.test.ts
-- CLASS_WORK_STATUS: artificer:stage4_remaining_base_runtime=COMPLETE,artificer:mechanics=IN_PROGRESS_STAGE4_COMPLETE
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Artificer Stage 4: close the remaining 2025 base-class runtime without
-- introducing a parallel inventory, spell-slot, HP, or resource owner.

begin;

-- ---------------------------------------------------------------------------
-- 1. Canonical system-item charge metadata used by Magic Item Tinker.
--    System definitions are immutable through campaign APIs, so a forward
--    migration appends a new Chasovoy revision and advances current_revision.
-- ---------------------------------------------------------------------------

do $patch_charged_items$
declare
  v_row record;
  v_max integer;
  v_next integer;
  v_data jsonb;
begin
  for v_row in
    select d.id,d.current_revision,r.name,r.summary,r.rules_text,r.mechanics,r.data,r.created_by
    from public.reference_definitions d
    join public.reference_definition_revisions r
      on r.definition_id=d.id and r.revision=d.current_revision
    where d.kind='item'
      and d.scope='system'
      and d.status='active'
      and coalesce((r.data#>>'{replication_plan,eligible}')::boolean,false)
      and r.name in (
        'Wand of Magic Detection',
        'Wand of Secrets',
        'Eyes of Charming',
        'Pipes of Haunting',
        'Dazzling Weapon',
        'Mind Sharpener',
        'Repulsion Shield',
        'Wand of Magic Missiles',
        'Wand of Web',
        'Ring of the Ram'
      )
      -- Ignore retired duplicate plan shells that have no canonical rarity.
      and nullif(r.data#>>'{magic_item,rarity}','') is not null
  loop
    v_max := case v_row.name
      when 'Wand of Magic Detection' then 3
      when 'Wand of Secrets' then 3
      when 'Eyes of Charming' then 3
      when 'Pipes of Haunting' then 3
      when 'Dazzling Weapon' then 4
      when 'Mind Sharpener' then 4
      when 'Repulsion Shield' then 4
      when 'Wand of Magic Missiles' then 7
      when 'Wand of Web' then 7
      when 'Ring of the Ram' then 3
      else null
    end;

    if v_max is null then
      continue;
    end if;

    if coalesce(v_row.data->>'usage_mode','none')='charges'
       and coalesce((v_row.data->>'charges_max')::integer,0)=v_max then
      continue;
    end if;

    v_next := v_row.current_revision + 1;
    v_data := jsonb_set(
      jsonb_set(coalesce(v_row.data,'{}'::jsonb),'{usage_mode}','"charges"'::jsonb,true),
      '{charges_max}',to_jsonb(v_max),true
    );

    insert into public.reference_definition_revisions(
      definition_id,revision,name,summary,rules_text,mechanics,data,created_by
    ) values(
      v_row.id,v_next,v_row.name,v_row.summary,v_row.rules_text,
      coalesce(v_row.mechanics,'[]'::jsonb),v_data,v_row.created_by
    );

    update public.reference_definitions
    set current_revision=v_next,updated_at=now()
    where id=v_row.id;
  end loop;
end
$patch_charged_items$;

-- ---------------------------------------------------------------------------
-- 2. Shared Stage-4 Artificer helpers.
-- ---------------------------------------------------------------------------

create or replace function private.artificer_stage4_int_modifier_v1(p_character_id uuid)
returns integer
language sql
stable
security definer
set search_path=''
as $function$
  select greatest(
    -5,
    least(
      10,
      floor((coalesce(s.intelligence,10)-10)::numeric/2)::integer
    )
  )
  from public.character_sheets s
  where s.character_id=p_character_id
$function$;

revoke all on function private.artificer_stage4_int_modifier_v1(uuid) from public,anon,authenticated;
grant execute on function private.artificer_stage4_int_modifier_v1(uuid) to service_role;

create or replace function private.artificer_stage4_item_rarity_v1(p_definition_id uuid)
returns text
language sql
stable
security definer
set search_path=''
as $function$
  with current_item as (
    select r.name,lower(nullif(r.data#>>'{magic_item,rarity}','')) rarity
    from public.reference_definitions d
    join public.reference_definition_revisions r
      on r.definition_id=d.id and r.revision=d.current_revision
    where d.id=p_definition_id and d.kind='item'
  )
  select coalesce(
    (select rarity from current_item where rarity is not null),
    (
      select lower(nullif(r2.data#>>'{magic_item,rarity}',''))
      from current_item c
      join public.reference_definition_revisions r2 on r2.name=c.name
      join public.reference_definitions d2
        on d2.id=r2.definition_id and d2.current_revision=r2.revision
      where d2.kind='item'
        and d2.status='active'
        and nullif(r2.data#>>'{magic_item,rarity}','') is not null
      order by case when d2.scope='system' then 0 else 1 end,d2.updated_at desc
      limit 1
    )
  )
$function$;

revoke all on function private.artificer_stage4_item_rarity_v1(uuid) from public,anon,authenticated;
grant execute on function private.artificer_stage4_item_rarity_v1(uuid) to service_role;

create or replace function private.artificer_stage4_attunement_capacity_v1(p_character_id uuid)
returns integer
language sql
stable
security definer
set search_path=''
as $function$
  select case
    when a.class_level>=18 then 6
    when a.class_level>=14 then 5
    when a.class_level>=10 then 4
    else 3
  end
  from private.artificer_stage3_class_assignment_v1(p_character_id) a
$function$;

revoke all on function private.artificer_stage4_attunement_capacity_v1(uuid) from public,anon,authenticated;
grant execute on function private.artificer_stage4_attunement_capacity_v1(uuid) to service_role;

create or replace function private.artificer_stage4_assert_attunement_capacity_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_attuned_to uuid;
  v_capacity integer;
  v_existing integer;
begin
  if new.character_id is null then
    return new;
  end if;

  begin
    v_attuned_to:=nullif(new.item_state#>>'{attunement,attuned_to_character_id}','')::uuid;
  exception when invalid_text_representation then
    raise exception 'ATTUNEMENT_CHARACTER_INVALID';
  end;

  if v_attuned_to is null then
    return new;
  end if;

  if v_attuned_to<>new.character_id then
    raise exception 'ATTUNEMENT_OWNER_MISMATCH';
  end if;

  v_capacity:=private.artificer_stage4_attunement_capacity_v1(new.character_id);
  if v_capacity is null then
    return new;
  end if;

  select count(*) into v_existing
  from public.character_inventory_items i
  where i.character_id=new.character_id
    and i.id<>new.id
    and i.item_state#>>'{attunement,attuned_to_character_id}'=new.character_id::text;

  if v_existing>=v_capacity then
    raise exception 'ARTIFICER_ATTUNEMENT_CAP_REACHED:%',v_capacity;
  end if;

  return new;
end;
$function$;

revoke all on function private.artificer_stage4_assert_attunement_capacity_v1() from public,anon,authenticated;

drop trigger if exists character_inventory_items_artificer_attunement_capacity_v1
on public.character_inventory_items;
create trigger character_inventory_items_artificer_attunement_capacity_v1
before insert or update of character_id,item_state
on public.character_inventory_items
for each row execute function private.artificer_stage4_assert_attunement_capacity_v1();

-- Resource rows are persisted server-side so feature RPCs work even before a
-- client has performed a CE resource sync.
create or replace function private.artificer_stage4_upsert_resource_v1(
  p_character_id uuid,
  p_state_key text,
  p_label text,
  p_max integer,
  p_recharge jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
begin
  insert into public.character_resource_states(
    character_id,state_key,current,max_snapshot,label,recharge,updated_by
  ) values(
    p_character_id,p_state_key,greatest(0,p_max),greatest(0,p_max),
    p_label,coalesce(p_recharge,'{}'::jsonb),v_actor
  )
  on conflict(character_id,state_key) do update set
    current=greatest(
      0,
      least(
        excluded.max_snapshot,
        excluded.max_snapshot
          - greatest(
              0,
              public.character_resource_states.max_snapshot
                - public.character_resource_states.current
            )
      )
    ),
    max_snapshot=excluded.max_snapshot,
    temporary_max_bonus=0,
    label=excluded.label,
    recharge=excluded.recharge,
    updated_by=v_actor,
    updated_at=now();
end;
$function$;

revoke all on function private.artificer_stage4_upsert_resource_v1(uuid,text,text,integer,jsonb)
from public,anon,authenticated;
grant execute on function private.artificer_stage4_upsert_resource_v1(uuid,text,text,integer,jsonb)
to service_role;

create or replace function private.artificer_stage4_sync_resources_v1(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assignment uuid;
  v_level integer;
  v_int_mod integer;
  v_flash_max integer;
  v_flash_recharge jsonb;
begin
  select assignment_id,class_level into v_assignment,v_level
  from private.artificer_stage3_class_assignment_v1(p_character_id);

  if v_assignment is null then
    delete from public.character_resource_states
    where character_id=p_character_id
      and state_key in (
        'artificer_magic_item_drain',
        'artificer_magic_item_transmute',
        'artificer_flash_of_genius'
      );
    return;
  end if;

  if v_level>=6 then
    perform private.artificer_stage4_upsert_resource_v1(
      p_character_id,
      'artificer_magic_item_drain',
      'Drain Magic Item',
      1,
      jsonb_build_object('triggers',jsonb_build_array('long_rest'),'restore','full')
    );
    perform private.artificer_stage4_upsert_resource_v1(
      p_character_id,
      'artificer_magic_item_transmute',
      'Transmute Magic Item',
      1,
      jsonb_build_object('triggers',jsonb_build_array('long_rest'),'restore','full')
    );
  else
    delete from public.character_resource_states
    where character_id=p_character_id
      and state_key in ('artificer_magic_item_drain','artificer_magic_item_transmute');
  end if;

  if v_level>=7 then
    v_int_mod:=coalesce(private.artificer_stage4_int_modifier_v1(p_character_id),0);
    v_flash_max:=greatest(1,v_int_mod);
    v_flash_recharge:=case
      when v_level>=14 then
        jsonb_build_object(
          'rules',jsonb_build_array(
            jsonb_build_object('trigger','short_rest','restore','amount','amount',1),
            jsonb_build_object('trigger','long_rest','restore','full')
          )
        )
      else
        jsonb_build_object('triggers',jsonb_build_array('long_rest'),'restore','full')
    end;

    perform private.artificer_stage4_upsert_resource_v1(
      p_character_id,
      'artificer_flash_of_genius',
      'Flash of Genius',
      v_flash_max,
      v_flash_recharge
    );
  else
    delete from public.character_resource_states
    where character_id=p_character_id and state_key='artificer_flash_of_genius';
  end if;
end;
$function$;

revoke all on function private.artificer_stage4_sync_resources_v1(uuid)
from public,anon,authenticated;
grant execute on function private.artificer_stage4_sync_resources_v1(uuid) to service_role;

create or replace function private.artificer_stage4_sync_resources_after_assignment_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.artificer_stage4_sync_resources_v1(coalesce(new.character_id,old.character_id));
  return coalesce(new,old);
end;
$function$;

revoke all on function private.artificer_stage4_sync_resources_after_assignment_v1()
from public,anon,authenticated;

drop trigger if exists character_template_assignments_artificer_stage4_resources_v1
on public.character_template_assignments;
create trigger character_template_assignments_artificer_stage4_resources_v1
after insert or update of template_id,template_level,selected_choices or delete
on public.character_template_assignments
for each row execute function private.artificer_stage4_sync_resources_after_assignment_v1();

create or replace function private.artificer_stage4_sync_resources_after_sheet_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='INSERT' or new.intelligence is distinct from old.intelligence then
    perform private.artificer_stage4_sync_resources_v1(new.character_id);
  end if;
  return new;
end;
$function$;

revoke all on function private.artificer_stage4_sync_resources_after_sheet_v1()
from public,anon,authenticated;

drop trigger if exists character_sheets_artificer_stage4_resources_v1
on public.character_sheets;
create trigger character_sheets_artificer_stage4_resources_v1
after insert or update of intelligence
on public.character_sheets
for each row execute function private.artificer_stage4_sync_resources_after_sheet_v1();

-- ---------------------------------------------------------------------------
-- 3. Magic Item Tinker: Charge / Drain / Transmute.
-- ---------------------------------------------------------------------------

create or replace function private.cheburashka_restore_item_charges_v1(
  p_item_id uuid,
  p_amount integer,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_item public.character_inventory_items%rowtype;
  v_after jsonb;
begin
  select * into v_item
  from public.character_inventory_items
  where id=p_item_id
  for update;

  if v_item.id is null then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
  if p_expected_version is null or v_item.version<>p_expected_version then
    raise exception 'INVENTORY_VERSION_CONFLICT';
  end if;
  if v_item.usage_mode<>'charges' or v_item.charges_max is null or v_item.charges_current is null then
    raise exception 'ITEM_HAS_NO_CHARGE_LEDGER';
  end if;
  if v_item.charges_current>=v_item.charges_max then
    raise exception 'ITEM_CHARGES_ALREADY_FULL';
  end if;

  update public.character_inventory_items
  set charges_current=least(charges_max,charges_current+greatest(0,p_amount)),
      version=version+1,
      updated_at=now()
  where id=p_item_id
  returning to_jsonb(character_inventory_items) into v_after;

  return v_after;
end;
$function$;

revoke all on function private.cheburashka_restore_item_charges_v1(uuid,integer,bigint)
from public,anon,authenticated;
grant execute on function private.cheburashka_restore_item_charges_v1(uuid,integer,bigint)
to service_role;

create or replace function public.artificer_charge_magic_item_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_slot_level integer,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assignment uuid;
  v_level integer;
  v_campaign uuid;
  v_item public.character_inventory_items%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_fingerprint jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_command_id is null then raise exception 'COMMAND_ID_REQUIRED'; end if;
  if p_slot_level not between 1 and 5 then raise exception 'ARTIFICER_SLOT_LEVEL_INVALID'; end if;

  select c.campaign_id into v_campaign from public.characters c where c.id=p_character_id;
  select assignment_id,class_level into v_assignment,v_level
  from private.artificer_stage3_class_assignment_v1(p_character_id);
  if v_assignment is null or v_level<6 then raise exception 'ARTIFICER_MAGIC_ITEM_TINKER_UNAVAILABLE'; end if;

  v_fingerprint:=jsonb_build_object(
    'characterId',p_character_id,'itemId',p_item_id,'slotLevel',p_slot_level,
    'expectedVersion',p_expected_version
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by is distinct from auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'artificer.charge_magic_item'
       or v_existing.aggregate_id<>p_character_id
       or v_existing.result->'fingerprint' is distinct from v_fingerprint then
      raise exception 'COMMAND_ID_REUSED';
    end if;
    return v_existing.result->'payload';
  end if;

  select * into v_item
  from public.character_inventory_items i
  where i.id=p_item_id
  for update;

  if v_item.id is null then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
  if v_item.version<>p_expected_version then raise exception 'INVENTORY_VERSION_CONFLICT'; end if;
  if v_item.item_state->>'origin_assignment_id'<>v_assignment::text
     or v_item.item_state->>'origin_feature'<>'replicate-magic-item' then
    raise exception 'ARTIFICER_ITEM_NOT_REPLICATED_BY_CHARACTER';
  end if;
  if v_item.usage_mode<>'charges' then raise exception 'ARTIFICER_ITEM_HAS_NO_CHARGES'; end if;

  perform private.apply_character_runtime_resource_effect(
    p_character_id,'spell_slot_'||p_slot_level::text,'SPEND',1,auth.uid()
  );
  v_result:=private.cheburashka_restore_item_charges_v1(
    p_item_id,p_slot_level,p_expected_version
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_campaign,p_character_id,'gena','artificer.charge_magic_item',
    p_character_id,
    jsonb_build_object('fingerprint',v_fingerprint,'payload',jsonb_build_object(
      'item',v_result,'slotLevelSpent',p_slot_level
    )),
    auth.uid()
  );

  return jsonb_build_object('item',v_result,'slotLevelSpent',p_slot_level);
end;
$function$;

revoke all on function public.artificer_charge_magic_item_v1(uuid,uuid,integer,bigint,uuid)
from public,anon;
grant execute on function public.artificer_charge_magic_item_v1(uuid,uuid,integer,bigint,uuid)
to authenticated;

create or replace function public.artificer_drain_magic_item_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assignment uuid;
  v_level integer;
  v_campaign uuid;
  v_item public.character_inventory_items%rowtype;
  v_rarity text;
  v_slot_level integer;
  v_existing public.engine_command_receipts%rowtype;
  v_fingerprint jsonb;
  v_before jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_command_id is null then raise exception 'COMMAND_ID_REQUIRED'; end if;

  select c.campaign_id into v_campaign from public.characters c where c.id=p_character_id;
  select assignment_id,class_level into v_assignment,v_level
  from private.artificer_stage3_class_assignment_v1(p_character_id);
  if v_assignment is null or v_level<6 then raise exception 'ARTIFICER_MAGIC_ITEM_TINKER_UNAVAILABLE'; end if;

  v_fingerprint:=jsonb_build_object(
    'characterId',p_character_id,'itemId',p_item_id,'expectedVersion',p_expected_version
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by is distinct from auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'artificer.drain_magic_item'
       or v_existing.aggregate_id<>p_character_id
       or v_existing.result->'fingerprint' is distinct from v_fingerprint then
      raise exception 'COMMAND_ID_REUSED';
    end if;
    return v_existing.result->'payload';
  end if;

  select * into v_item from public.character_inventory_items where id=p_item_id for update;
  if v_item.id is null then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
  if v_item.version<>p_expected_version then raise exception 'INVENTORY_VERSION_CONFLICT'; end if;
  if v_item.item_state->>'origin_assignment_id'<>v_assignment::text
     or v_item.item_state->>'origin_feature'<>'replicate-magic-item' then
    raise exception 'ARTIFICER_ITEM_NOT_REPLICATED_BY_CHARACTER';
  end if;

  v_rarity:=private.artificer_stage4_item_rarity_v1(v_item.definition_id);
  v_slot_level:=case
    when v_rarity='common' then 1
    when v_rarity in ('uncommon','rare') then 2
    else null
  end;
  if v_slot_level is null then raise exception 'ARTIFICER_DRAIN_RARITY_UNSUPPORTED:%',coalesce(v_rarity,'unknown'); end if;

  perform private.apply_character_runtime_resource_effect(
    p_character_id,'artificer_magic_item_drain','SPEND',1,auth.uid()
  );
  perform private.apply_character_runtime_resource_effect(
    p_character_id,'spell_slot_'||v_slot_level::text,'GRANT_TEMPORARY_MAX',1,auth.uid()
  );
  v_before:=private.cheburashka_safe_delete_item_v1(p_item_id);

  v_result:=jsonb_build_object(
    'dismissedItem',v_before,
    'temporarySlotLevel',v_slot_level,
    'expiresOn','long_rest'
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_campaign,p_character_id,'gena','artificer.drain_magic_item',
    p_character_id,jsonb_build_object('fingerprint',v_fingerprint,'payload',v_result),auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.artificer_drain_magic_item_v1(uuid,uuid,bigint,uuid)
from public,anon;
grant execute on function public.artificer_drain_magic_item_v1(uuid,uuid,bigint,uuid)
to authenticated;

create or replace function private.artificer_stage4_transmute_item_v1(
  p_item_id uuid,
  p_new_definition_id uuid,
  p_expected_version bigint,
  p_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_item public.character_inventory_items%rowtype;
  v_def public.reference_definitions%rowtype;
  v_rev public.reference_definition_revisions%rowtype;
  v_after jsonb;
  v_provenance jsonb;
  v_category text;
  v_usage text;
begin
  select * into v_item from public.character_inventory_items where id=p_item_id for update;
  if v_item.id is null then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
  if v_item.version<>p_expected_version then raise exception 'INVENTORY_VERSION_CONFLICT'; end if;

  select * into v_def
  from public.reference_definitions
  where id=p_new_definition_id and kind='item' and status='active';
  if v_def.id is null then raise exception 'ARTIFICER_TRANSMUTE_DEFINITION_NOT_FOUND'; end if;

  select * into v_rev
  from public.reference_definition_revisions
  where definition_id=v_def.id and revision=v_def.current_revision;
  if v_rev.definition_id is null then raise exception 'ARTIFICER_TRANSMUTE_REVISION_NOT_FOUND'; end if;

  v_category:=coalesce(nullif(v_rev.data->>'category',''),'other');
  v_usage:=coalesce(nullif(v_rev.data->>'usage_mode',''),'none');

  -- A container can be transmuted too. Its contents are detached before the
  -- item's definition changes so no hidden inventory tree is destroyed.
  update public.character_inventory_items child
  set holder_item_id=null,
      placement_kind=case
        when child.character_id is not null and child.world_storage_id is null and child.surface_id is null then 'root'
        else child.placement_kind
      end,
      placement_index=null,grid_x=null,grid_y=null,grid_rotation=0,
      version=child.version+1,updated_at=now()
  where child.holder_item_id=p_item_id;

  v_provenance:=jsonb_build_object(
    'class_created',true,
    'creator_character_id',v_item.item_state->>'creator_character_id',
    'origin_assignment_id',p_assignment_id,
    'origin_feature','replicate-magic-item',
    'plan_definition_id',p_new_definition_id,
    'created_at',coalesce(v_item.item_state->'created_at',to_jsonb(now()))
  );
  if v_item.item_state ? 'lifecycle' then
    v_provenance:=v_provenance||jsonb_build_object('lifecycle',v_item.item_state->'lifecycle');
  end if;

  update public.character_inventory_items
  set name=v_rev.name,
      description=coalesce(v_rev.summary,''),
      definition_id=v_def.id,
      definition_revision=v_rev.revision,
      mechanics=coalesce(v_rev.mechanics,'[]'::jsonb),
      category=v_category,
      equipment_slot=null,
      equipped=false,
      usage_mode=v_usage,
      charges_max=case when v_usage='charges' then greatest(1,coalesce((v_rev.data->>'charges_max')::integer,1)) else null end,
      charges_current=case when v_usage='charges' then greatest(1,coalesce((v_rev.data->>'charges_max')::integer,1)) else null end,
      item_state=coalesce(v_rev.data->'item_state','{}'::jsonb)||v_provenance,
      stack_mode=coalesce(nullif(v_rev.data->>'stack_mode',''),'instance'),
      version=version+1,
      updated_at=now()
  where id=p_item_id
  returning to_jsonb(character_inventory_items) into v_after;

  return v_after;
end;
$function$;

revoke all on function private.artificer_stage4_transmute_item_v1(uuid,uuid,bigint,uuid)
from public,anon,authenticated;
grant execute on function private.artificer_stage4_transmute_item_v1(uuid,uuid,bigint,uuid)
to service_role;

create or replace function public.artificer_transmute_magic_item_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_new_definition_id uuid,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_level integer;
  v_campaign uuid;
  v_item public.character_inventory_items%rowtype;
  v_new_def public.reference_definitions%rowtype;
  v_new_rev public.reference_definition_revisions%rowtype;
  v_known jsonb;
  v_loadout jsonb;
  v_new_loadout jsonb;
  v_old_option text;
  v_new_option text;
  v_selected jsonb;
  v_existing public.engine_command_receipts%rowtype;
  v_fingerprint jsonb;
  v_after jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_command_id is null then raise exception 'COMMAND_ID_REQUIRED'; end if;

  select c.campaign_id into v_campaign from public.characters c where c.id=p_character_id;
  select a.* into v_assignment
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id and t.kind='class' and t.catalog_key='class:artificer'
  order by a.assigned_at,a.id
  limit 1;
  if v_assignment.id is null then raise exception 'ARTIFICER_ASSIGNMENT_NOT_FOUND'; end if;
  v_level:=greatest(1,coalesce(v_assignment.template_level,1));
  if v_level<6 then raise exception 'ARTIFICER_MAGIC_ITEM_TINKER_UNAVAILABLE'; end if;

  v_fingerprint:=jsonb_build_object(
    'characterId',p_character_id,'itemId',p_item_id,
    'newDefinitionId',p_new_definition_id,'expectedVersion',p_expected_version
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by is distinct from auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'artificer.transmute_magic_item'
       or v_existing.aggregate_id<>p_character_id
       or v_existing.result->'fingerprint' is distinct from v_fingerprint then
      raise exception 'COMMAND_ID_REUSED';
    end if;
    return v_existing.result->'payload';
  end if;

  select * into v_item from public.character_inventory_items where id=p_item_id for update;
  if v_item.id is null then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
  if v_item.version<>p_expected_version then raise exception 'INVENTORY_VERSION_CONFLICT'; end if;
  if v_item.item_state->>'origin_assignment_id'<>v_assignment.id::text
     or v_item.item_state->>'origin_feature'<>'replicate-magic-item' then
    raise exception 'ARTIFICER_ITEM_NOT_REPLICATED_BY_CHARACTER';
  end if;
  if v_item.definition_id=p_new_definition_id then raise exception 'ARTIFICER_TRANSMUTE_REQUIRES_DIFFERENT_PLAN'; end if;

  select * into v_new_def
  from public.reference_definitions
  where id=p_new_definition_id and kind='item' and status='active';
  if v_new_def.id is null then raise exception 'ARTIFICER_TRANSMUTE_DEFINITION_NOT_FOUND'; end if;
  select * into v_new_rev
  from public.reference_definition_revisions
  where definition_id=v_new_def.id and revision=v_new_def.current_revision;
  if not coalesce((v_new_rev.data#>>'{replication_plan,eligible}')::boolean,false) then
    raise exception 'ARTIFICER_TRANSMUTE_PLAN_NOT_ELIGIBLE';
  end if;
  if greatest(1,coalesce((v_new_rev.data#>>'{replication_plan,unlock_level}')::integer,1))>v_level then
    raise exception 'ARTIFICER_TRANSMUTE_PLAN_LEVEL_LOCKED';
  end if;

  v_known:=private.artificer_stage3_choice_instances_v1(
    v_assignment.selected_choices,'artificer_replication_plans'
  );
  v_new_option:='refdef:'||p_new_definition_id::text;
  if not exists(
    select 1 from jsonb_array_elements(v_known) k(value)
    where k.value->>'option'=v_new_option
  ) then
    raise exception 'ARTIFICER_TRANSMUTE_PLAN_NOT_KNOWN';
  end if;

  if exists(
    select 1
    from public.character_inventory_items i
    where i.id<>p_item_id
      and i.item_state->>'origin_assignment_id'=v_assignment.id::text
      and i.item_state->>'origin_feature'='replicate-magic-item'
      and i.item_state->>'plan_definition_id'=p_new_definition_id::text
  ) then
    raise exception 'ARTIFICER_TRANSMUTE_PLAN_ALREADY_ACTIVE';
  end if;

  v_old_option:='refdef:'||v_item.definition_id::text;
  v_loadout:=private.artificer_stage3_choice_instances_v1(
    v_assignment.selected_choices,'artificer_replication_loadout'
  );
  if not exists(
    select 1 from jsonb_array_elements(v_loadout) x(value)
    where x.value->>'option'=v_old_option
  ) then
    raise exception 'ARTIFICER_TRANSMUTE_ACTIVE_PLAN_NOT_IN_LOADOUT';
  end if;

  select coalesce(
    jsonb_agg(
      case
        when x.value->>'option'=v_old_option then
          jsonb_set(
            jsonb_set(x.value,'{option}',to_jsonb(v_new_option),true),
            '{config,attune}','false'::jsonb,true
          )
        else x.value
      end
      order by x.ord
    ),
    '[]'::jsonb
  )
  into v_new_loadout
  from jsonb_array_elements(v_loadout) with ordinality x(value,ord);

  perform private.apply_character_runtime_resource_effect(
    p_character_id,'artificer_magic_item_transmute','SPEND',1,auth.uid()
  );

  v_after:=private.artificer_stage4_transmute_item_v1(
    p_item_id,p_new_definition_id,p_expected_version,v_assignment.id
  );

  v_selected:=coalesce(v_assignment.selected_choices,'{}'::jsonb);
  if jsonb_typeof(v_selected#>'{_choice_runtime_v2,choices,artificer_replication_loadout}')='object' then
    v_selected:=jsonb_set(
      v_selected,
      '{_choice_runtime_v2,choices,artificer_replication_loadout,instances}',
      v_new_loadout,
      true
    );
  else
    v_selected:=jsonb_set(
      v_selected,
      '{artificer_replication_loadout}',
      (
        select coalesce(jsonb_agg(x.value->>'option' order by x.ord),'[]'::jsonb)
        from jsonb_array_elements(v_new_loadout) with ordinality x(value,ord)
      ),
      true
    );
  end if;

  update public.character_template_assignments
  set selected_choices=v_selected,updated_at=now()
  where id=v_assignment.id;

  insert into public.engine_command_receipts(
    command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_campaign,p_character_id,'gena','artificer.transmute_magic_item',
    p_character_id,
    jsonb_build_object('fingerprint',v_fingerprint,'payload',jsonb_build_object('item',v_after)),
    auth.uid()
  );

  return jsonb_build_object('item',v_after);
end;
$function$;

revoke all on function public.artificer_transmute_magic_item_v1(uuid,uuid,uuid,bigint,uuid)
from public,anon;
grant execute on function public.artificer_transmute_magic_item_v1(uuid,uuid,uuid,bigint,uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Spell-Storing Item.
-- ---------------------------------------------------------------------------

create or replace function public.artificer_store_spell_item_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_spell_catalog_id uuid,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assignment uuid;
  v_template uuid;
  v_level integer;
  v_campaign uuid;
  v_int_mod integer;
  v_uses integer;
  v_item public.character_inventory_items%rowtype;
  v_spell public.spell_catalog%rowtype;
  v_semantic_role text;
  v_is_replica boolean;
  v_eligible_item boolean;
  v_existing public.engine_command_receipts%rowtype;
  v_fingerprint jsonb;
  v_after jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_command_id is null then raise exception 'COMMAND_ID_REQUIRED'; end if;

  select c.campaign_id into v_campaign from public.characters c where c.id=p_character_id;
  select a.assignment_id,a.class_level into v_assignment,v_level
  from private.artificer_stage3_class_assignment_v1(p_character_id) a;
  if v_assignment is null or v_level<11 then raise exception 'ARTIFICER_SPELL_STORING_ITEM_UNAVAILABLE'; end if;

  select a.template_id into v_template
  from public.character_template_assignments a
  where a.id=v_assignment;

  v_fingerprint:=jsonb_build_object(
    'characterId',p_character_id,'itemId',p_item_id,
    'spellCatalogId',p_spell_catalog_id,'expectedVersion',p_expected_version
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by is distinct from auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'artificer.store_spell_item'
       or v_existing.aggregate_id<>p_character_id
       or v_existing.result->'fingerprint' is distinct from v_fingerprint then
      raise exception 'COMMAND_ID_REUSED';
    end if;
    return v_existing.result->'payload';
  end if;

  -- This feature is chosen when the Artificer finishes a Long Rest.
  if not exists(
    select 1 from public.character_preparation_sessions s
    where s.character_id=p_character_id and s.is_open
  ) then
    raise exception 'ARTIFICER_SPELL_STORING_REQUIRES_LONG_REST_WINDOW';
  end if;

  select * into v_item
  from public.character_inventory_items
  where id=p_item_id and character_id=p_character_id
  for update;
  if v_item.id is null then raise exception 'ARTIFICER_SPELL_STORING_ITEM_NOT_HELD'; end if;
  if v_item.version<>p_expected_version then raise exception 'INVENTORY_VERSION_CONFLICT'; end if;

  select r.data#>>'{inventory_profile,semantic_role}' into v_semantic_role
  from public.reference_definition_revisions r
  where r.definition_id=v_item.definition_id and r.revision=v_item.definition_revision;

  v_is_replica:=v_item.item_state->>'origin_assignment_id'=v_assignment::text
    and v_item.item_state->>'origin_feature'='replicate-magic-item';

  v_eligible_item:=v_is_replica
    or coalesce(v_semantic_role,'') like 'weapon.%'
    or v_item.equipment_slot in ('main_hand','two_hands')
    or coalesce((v_item.item_state->>'artificer_spellcasting_focus')::boolean,false);

  if not v_eligible_item then
    raise exception 'ARTIFICER_SPELL_STORING_ITEM_NOT_WEAPON_OR_FOCUS';
  end if;

  select * into v_spell
  from public.spell_catalog s
  where s.id=p_spell_catalog_id;
  if v_spell.id is null then raise exception 'SPELL_NOT_FOUND'; end if;
  if v_spell.spell_level not between 1 and 3 then
    raise exception 'ARTIFICER_SPELL_STORING_LEVEL_INVALID';
  end if;
  if coalesce(v_spell.material_consumed,false) then
    raise exception 'ARTIFICER_SPELL_STORING_CONSUMED_MATERIAL_FORBIDDEN';
  end if;
  if lower(trim(coalesce(v_spell.casting_time,''))) not in (
    'action','1 action','действие','1 действие'
  ) then
    raise exception 'ARTIFICER_SPELL_STORING_ACTION_TIME_REQUIRED';
  end if;
  if not exists(
    select 1
    from public.rule_template_spell_links l
    where l.template_id=v_template and l.spell_id=v_spell.id
  ) then
    raise exception 'ARTIFICER_SPELL_STORING_NOT_ARTIFICER_SPELL';
  end if;

  v_int_mod:=coalesce(private.artificer_stage4_int_modifier_v1(p_character_id),0);
  v_uses:=greatest(2,2*v_int_mod);

  -- Reusing the feature ends the previous stored spell, wherever it is in the
  -- creator's currently held inventory.
  update public.character_inventory_items i
  set item_state=coalesce(i.item_state,'{}'::jsonb)-'artificer_spell_storing',
      version=i.version+1,
      updated_at=now()
  where i.id<>p_item_id
    and i.item_state#>>'{artificer_spell_storing,creator_character_id}'=p_character_id::text;

  update public.character_inventory_items
  set item_state=jsonb_set(
        coalesce(item_state,'{}'::jsonb),
        '{artificer_spell_storing}',
        jsonb_build_object(
          'creator_character_id',p_character_id,
          'creator_assignment_id',v_assignment,
          'spell_catalog_id',v_spell.id,
          'spell_name',coalesce(nullif(v_spell.name_ru,''),v_spell.name_en),
          'spell_level',v_spell.spell_level,
          'casting_ability','intelligence',
          'uses_current',v_uses,
          'uses_max',v_uses,
          'stored_at',now()
        ),
        true
      ),
      version=version+1,
      updated_at=now()
  where id=p_item_id
  returning to_jsonb(character_inventory_items) into v_after;

  insert into public.engine_command_receipts(
    command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_campaign,p_character_id,'gena','artificer.store_spell_item',
    p_character_id,
    jsonb_build_object('fingerprint',v_fingerprint,'payload',jsonb_build_object('item',v_after)),
    auth.uid()
  );

  return jsonb_build_object('item',v_after);
end;
$function$;

revoke all on function public.artificer_store_spell_item_v1(uuid,uuid,uuid,bigint,uuid)
from public,anon;
grant execute on function public.artificer_store_spell_item_v1(uuid,uuid,uuid,bigint,uuid)
to authenticated;

create or replace function public.artificer_use_spell_storing_item_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_item_id uuid,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_campaign uuid;
  v_item public.character_inventory_items%rowtype;
  v_state jsonb;
  v_creator uuid;
  v_spell public.spell_catalog%rowtype;
  v_creator_sheet public.character_sheets%rowtype;
  v_uses integer;
  v_message_id bigint;
  v_existing public.engine_command_receipts%rowtype;
  v_fingerprint jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if not private.can_write_chat_room(p_room_id,auth.uid()) then
    raise exception 'CHAT_WRITE_NOT_ALLOWED';
  end if;
  if p_command_id is null then raise exception 'COMMAND_ID_REQUIRED'; end if;

  select c.campaign_id into v_campaign from public.characters c where c.id=p_character_id;
  v_fingerprint:=jsonb_build_object(
    'roomId',p_room_id,'characterId',p_character_id,'itemId',p_item_id,
    'expectedVersion',p_expected_version
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by is distinct from auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'artificer.use_spell_storing_item'
       or v_existing.aggregate_id<>p_character_id
       or v_existing.result->'fingerprint' is distinct from v_fingerprint then
      raise exception 'COMMAND_ID_REUSED';
    end if;
    return v_existing.result->'payload';
  end if;

  select * into v_item
  from public.character_inventory_items
  where id=p_item_id and character_id=p_character_id
  for update;
  if v_item.id is null then raise exception 'ARTIFICER_STORED_SPELL_ITEM_NOT_HELD'; end if;
  if v_item.version<>p_expected_version then raise exception 'INVENTORY_VERSION_CONFLICT'; end if;

  v_state:=v_item.item_state->'artificer_spell_storing';
  if v_state is null or jsonb_typeof(v_state)<>'object' then
    raise exception 'ARTIFICER_STORED_SPELL_MISSING';
  end if;
  v_uses:=coalesce((v_state->>'uses_current')::integer,0);
  if v_uses<=0 then raise exception 'ARTIFICER_STORED_SPELL_EXHAUSTED'; end if;

  v_creator:=(v_state->>'creator_character_id')::uuid;
  select * into v_spell from public.spell_catalog
  where id=(v_state->>'spell_catalog_id')::uuid;
  if v_spell.id is null then raise exception 'ARTIFICER_STORED_SPELL_DEFINITION_MISSING'; end if;
  select * into v_creator_sheet from public.character_sheets where character_id=v_creator;
  if v_creator_sheet.character_id is null then raise exception 'ARTIFICER_STORED_SPELL_CREATOR_SHEET_MISSING'; end if;

  update public.character_inventory_items
  set item_state=jsonb_set(
        item_state,
        '{artificer_spell_storing,uses_current}',
        to_jsonb(v_uses-1),
        true
      ),
      version=version+1,
      updated_at=now()
  where id=p_item_id;

  v_message_id:=public.send_chat_event_v3(
    p_room_id,
    p_character_id,
    'spell',
    coalesce(nullif(v_spell.name_ru,''),v_spell.name_en),
    jsonb_build_object(
      'spellCatalogId',v_spell.id,
      'spellLevel',v_spell.spell_level,
      'sourceKind','artificer_spell_storing_item',
      'sourceItemId',p_item_id,
      'creatorCharacterId',v_creator,
      'castingAbility','intelligence',
      'spellSaveDc',v_creator_sheet.spell_save_dc,
      'spellAttackBonus',v_creator_sheet.spell_attack_bonus,
      'concentration',v_spell.concentration,
      'usesRemaining',v_uses-1
    ),
    '[]'::jsonb
  );

  v_result:=jsonb_build_object(
    'messageId',v_message_id,
    'spellCatalogId',v_spell.id,
    'usesRemaining',v_uses-1,
    'itemVersion',p_expected_version+1
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_campaign,p_character_id,'gena','artificer.use_spell_storing_item',
    p_character_id,jsonb_build_object('fingerprint',v_fingerprint,'payload',v_result),auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.artificer_use_spell_storing_item_v1(uuid,uuid,uuid,bigint,uuid)
from public,anon;
grant execute on function public.artificer_use_spell_storing_item_v1(uuid,uuid,uuid,bigint,uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Soul of Artifice and conditional Short-Rest recovery.
-- ---------------------------------------------------------------------------

create or replace function private.shapoklyak_set_current_hp_system_v1(
  p_character_id uuid,
  p_current_hp integer,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_after jsonb;
begin
  if p_current_hp<0 then raise exception 'HP_MUST_BE_NONNEGATIVE'; end if;

  update public.character_sheets
  set current_hp=least(max_hp,p_current_hp),
      death_save_successes=case when p_current_hp>0 then 0 else death_save_successes end,
      death_save_failures=case when p_current_hp>0 then 0 else death_save_failures end,
      updated_at=now()
  where character_id=p_character_id
  returning jsonb_build_object(
    'characterId',character_id,
    'currentHp',current_hp,
    'maxHp',max_hp,
    'tempHp',temp_hp,
    'actor',p_actor
  ) into v_after;

  if v_after is null then raise exception 'CHARACTER_SHEET_NOT_FOUND'; end if;
  return v_after;
end;
$function$;

revoke all on function private.shapoklyak_set_current_hp_system_v1(uuid,integer,uuid)
from public,anon,authenticated;
grant execute on function private.shapoklyak_set_current_hp_system_v1(uuid,integer,uuid)
to service_role;

create or replace function public.artificer_soul_of_artifice_cheat_death_v1(
  p_character_id uuid,
  p_item_ids uuid[],
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assignment uuid;
  v_level integer;
  v_campaign uuid;
  v_sheet public.character_sheets%rowtype;
  v_item_id uuid;
  v_item public.character_inventory_items%rowtype;
  v_rarity text;
  v_count integer:=0;
  v_unique_count integer;
  v_existing public.engine_command_receipts%rowtype;
  v_fingerprint jsonb;
  v_hp jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_command_id is null then raise exception 'COMMAND_ID_REQUIRED'; end if;
  if p_item_ids is null or cardinality(p_item_ids)=0 then raise exception 'ARTIFICER_CHEAT_DEATH_ITEMS_REQUIRED'; end if;

  select c.campaign_id into v_campaign from public.characters c where c.id=p_character_id;
  select assignment_id,class_level into v_assignment,v_level
  from private.artificer_stage3_class_assignment_v1(p_character_id);
  if v_assignment is null or v_level<20 then raise exception 'ARTIFICER_SOUL_OF_ARTIFICE_UNAVAILABLE'; end if;

  select count(distinct x) into v_unique_count from unnest(p_item_ids) x;
  if v_unique_count<>cardinality(p_item_ids) then raise exception 'ARTIFICER_CHEAT_DEATH_DUPLICATE_ITEM'; end if;

  v_fingerprint:=jsonb_build_object(
    'characterId',p_character_id,
    'itemIds',to_jsonb(p_item_ids)
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by is distinct from auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'artificer.soul_of_artifice_cheat_death'
       or v_existing.aggregate_id<>p_character_id
       or v_existing.result->'fingerprint' is distinct from v_fingerprint then
      raise exception 'COMMAND_ID_REUSED';
    end if;
    return v_existing.result->'payload';
  end if;

  select * into v_sheet from public.character_sheets
  where character_id=p_character_id
  for update;
  if v_sheet.character_id is null then raise exception 'CHARACTER_SHEET_NOT_FOUND'; end if;
  if v_sheet.current_hp<>0 then raise exception 'ARTIFICER_CHEAT_DEATH_REQUIRES_ZERO_HP'; end if;

  foreach v_item_id in array p_item_ids loop
    select * into v_item from public.character_inventory_items where id=v_item_id for update;
    if v_item.id is null then raise exception 'ARTIFICER_CHEAT_DEATH_ITEM_NOT_FOUND:%',v_item_id; end if;
    if v_item.item_state->>'origin_assignment_id'<>v_assignment::text
       or v_item.item_state->>'origin_feature'<>'replicate-magic-item' then
      raise exception 'ARTIFICER_CHEAT_DEATH_ITEM_NOT_REPLICATED:%',v_item_id;
    end if;

    v_rarity:=private.artificer_stage4_item_rarity_v1(v_item.definition_id);
    if v_rarity not in ('uncommon','rare') then
      raise exception 'ARTIFICER_CHEAT_DEATH_RARITY_INVALID:%:%',v_item_id,coalesce(v_rarity,'unknown');
    end if;
    v_count:=v_count+1;
  end loop;

  foreach v_item_id in array p_item_ids loop
    perform private.cheburashka_safe_delete_item_v1(v_item_id);
  end loop;

  v_hp:=private.shapoklyak_set_current_hp_system_v1(
    p_character_id,20*v_count,auth.uid()
  );

  v_result:=jsonb_build_object(
    'dismissedItemCount',v_count,
    'healing',20*v_count,
    'hp',v_hp
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_campaign,p_character_id,'gena','artificer.soul_of_artifice_cheat_death',
    p_character_id,jsonb_build_object('fingerprint',v_fingerprint,'payload',v_result),auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.artificer_soul_of_artifice_cheat_death_v1(uuid,uuid[],uuid)
from public,anon;
grant execute on function public.artificer_soul_of_artifice_cheat_death_v1(uuid,uuid[],uuid)
to authenticated;

create or replace function private.artificer_stage4_magical_guidance_after_short_rest_v1(
  p_character_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_level integer;
begin
  select class_level into v_level
  from private.artificer_stage3_class_assignment_v1(p_character_id);
  if coalesce(v_level,0)<20 then return; end if;

  if exists(
    select 1
    from public.character_inventory_items i
    where i.character_id=p_character_id
      and i.item_state#>>'{attunement,attuned_to_character_id}'=p_character_id::text
  ) then
    update public.character_resource_states
    set current=max_snapshot,
        updated_by=auth.uid(),
        updated_at=now()
    where character_id=p_character_id
      and state_key='artificer_flash_of_genius';
  end if;
end;
$function$;

revoke all on function private.artificer_stage4_magical_guidance_after_short_rest_v1(uuid)
from public,anon,authenticated;
grant execute on function private.artificer_stage4_magical_guidance_after_short_rest_v1(uuid)
to service_role;

-- Preserve the canonical short-rest flow and add only Artificer synchronization
-- plus level-20 conditional full Flash recovery.
create or replace function public.grant_character_short_rest(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_campaign_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null then raise exception 'Персонаж не найден'; end if;
  if not private.can_manage_campaign(v_campaign_id,auth.uid()) then
    raise exception 'Только GM или владелец может дать отдых';
  end if;

  perform private.artificer_stage4_sync_resources_v1(p_character_id);
  perform public.recover_character_resources(p_character_id,'short_rest');
  perform private.artificer_stage4_magical_guidance_after_short_rest_v1(p_character_id);

  insert into public.character_short_rest_sessions(
    character_id,generation,is_open,opened_at,opened_by,closed_at,updated_at
  ) values (
    p_character_id,1,true,now(),auth.uid(),null,now()
  )
  on conflict(character_id) do update set
    generation=public.character_short_rest_sessions.generation+1,
    is_open=true,
    opened_at=now(),
    opened_by=auth.uid(),
    closed_at=null,
    updated_at=now();
end;
$function$;

-- Preserve Stage-3 Tinker's Magic lifecycle and add Stage-4 resource sync.
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

  perform private.artificer_stage4_sync_resources_v1(p_character_id);
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

-- ---------------------------------------------------------------------------
-- 6. Replace Stage-2 placeholders with CE-native base-class mechanics.
--    Parameterized item actions expose semantic CE actions; the RPCs above own
--    the authoritative cross-owner mutations.
-- ---------------------------------------------------------------------------

do $install_stage4$
declare
  r record;
  v_level public.rule_template_levels%rowtype;
  v_mechanics jsonb;
  v_int_formula jsonb;
  v_flash_recharge jsonb;
begin
  v_int_formula:=jsonb_build_object(
    'kind','max',
    'values',jsonb_build_array(
      jsonb_build_object('kind','literal','value',1),
      jsonb_build_object('kind','reference','key','abilities.intelligence.modifier')
    )
  );

  for r in
    select * from public.rule_templates
    where kind='class' and catalog_key='class:artificer' and is_active
  loop
    -- Level 6: Magic Item Tinker.
    select * into v_level from public.rule_template_levels where template_id=r.id and level=6;
    v_mechanics:=coalesce((
      select jsonb_agg(x.value order by x.ord)
      from jsonb_array_elements(coalesce(v_level.mechanics,'[]'::jsonb)) with ordinality x(value,ord)
      where x.value->>'sourceKey'<>'magic-item-tinker'
    ),'[]'::jsonb);

    v_mechanics:=v_mechanics||jsonb_build_array(
      jsonb_build_object(
        'id','artificer-magic-item-tinker-feature-l6','type','grant','sourceKey','magic-item-tinker',
        'target','feature','key','class:artificer:magic-item-tinker:l6',
        'payload',jsonb_build_object(
          'label','Magic Item Tinker',
          'description','Charge, Drain, and Transmute operate on Replicate Magic Item instances through the shared GENA/Cheburashka/spell-slot runtime.'
        )
      ),
      jsonb_build_object(
        'id','artificer-magic-item-drain-resource','type','resource','sourceKey','magic-item-tinker',
        'key','artificer_magic_item_drain','label','Drain Magic Item',
        'max',1,'recharge',jsonb_build_array('long_rest'),'restore','full','initial','full'
      ),
      jsonb_build_object(
        'id','artificer-magic-item-transmute-resource','type','resource','sourceKey','magic-item-tinker',
        'key','artificer_magic_item_transmute','label','Transmute Magic Item',
        'max',1,'recharge',jsonb_build_array('long_rest'),'restore','full','initial','full'
      ),
      jsonb_build_object(
        'id','artificer-magic-item-charge-action','type','action','sourceKey','magic-item-tinker',
        'key','class:artificer:magic-item-tinker:charge','label','Charge Magic Item',
        'economy','bonus_action',
        'effects',jsonb_build_array(jsonb_build_object(
          'kind','semantic','key','artificer_charge_replicated_item',
          'payload',jsonb_build_object('rpc','artificer_charge_magic_item_v1','restoredCharges','spentSlotLevel')
        )),
        'tags',jsonb_build_array('artificer','inventory','spell_slot','parameterized')
      ),
      jsonb_build_object(
        'id','artificer-magic-item-drain-action','type','action','sourceKey','magic-item-tinker',
        'key','class:artificer:magic-item-tinker:drain','label','Drain Magic Item',
        'economy','bonus_action',
        'effects',jsonb_build_array(jsonb_build_object(
          'kind','semantic','key','artificer_drain_replicated_item',
          'payload',jsonb_build_object('rpc','artificer_drain_magic_item_v1','temporarySlotExpiry','long_rest')
        )),
        'tags',jsonb_build_array('artificer','inventory','spell_slot','parameterized')
      ),
      jsonb_build_object(
        'id','artificer-magic-item-transmute-action','type','action','sourceKey','magic-item-tinker',
        'key','class:artificer:magic-item-tinker:transmute','label','Transmute Magic Item',
        'economy','magic_action',
        'effects',jsonb_build_array(jsonb_build_object(
          'kind','semantic','key','artificer_transmute_replicated_item',
          'payload',jsonb_build_object('rpc','artificer_transmute_magic_item_v1')
        )),
        'tags',jsonb_build_array('artificer','inventory','choice','parameterized')
      )
    );
    update public.rule_template_levels set mechanics=v_mechanics where id=v_level.id;

    -- Level 7: Flash of Genius.
    select * into v_level from public.rule_template_levels where template_id=r.id and level=7;
    v_mechanics:=coalesce((
      select jsonb_agg(x.value order by x.ord)
      from jsonb_array_elements(coalesce(v_level.mechanics,'[]'::jsonb)) with ordinality x(value,ord)
      where x.value->>'sourceKey'<>'flash-of-genius'
    ),'[]'::jsonb);
    v_mechanics:=v_mechanics||jsonb_build_array(
      jsonb_build_object(
        'id','artificer-flash-of-genius-feature-l7','type','grant','sourceKey','flash-of-genius',
        'target','feature','key','class:artificer:flash-of-genius:l7',
        'payload',jsonb_build_object(
          'label','Flash of Genius',
          'description','Reaction after a failed ability check or saving throw; add the Artificer Intelligence modifier.'
        )
      ),
      jsonb_build_object(
        'id','artificer-flash-of-genius-resource','type','resource','sourceKey','flash-of-genius',
        'key','artificer_flash_of_genius','label','Flash of Genius',
        'max',v_int_formula,'recharge',jsonb_build_array('long_rest'),'restore','full','initial','full'
      ),
      jsonb_build_object(
        'id','artificer-flash-of-genius-action','type','action','sourceKey','flash-of-genius',
        'key','class:artificer:flash-of-genius:reaction','label','Flash of Genius',
        'economy','reaction','resourceKey','artificer_flash_of_genius','resourceCost',1,
        'effects',jsonb_build_array(jsonb_build_object(
          'kind','semantic','key','failed_check_or_save_bonus',
          'payload',jsonb_build_object('bonus','intelligence_modifier','sceneLegality','gm')
        )),
        'tags',jsonb_build_array('artificer','reaction','failed_roll')
      )
    );
    update public.rule_template_levels set mechanics=v_mechanics where id=v_level.id;

    -- Level 10: attunement capacity 4.
    select * into v_level from public.rule_template_levels where template_id=r.id and level=10;
    v_mechanics:=coalesce((
      select jsonb_agg(x.value order by x.ord)
      from jsonb_array_elements(coalesce(v_level.mechanics,'[]'::jsonb)) with ordinality x(value,ord)
      where x.value->>'sourceKey'<>'magic-item-adept'
    ),'[]'::jsonb);
    v_mechanics:=v_mechanics||jsonb_build_array(
      jsonb_build_object(
        'id','artificer-magic-item-adept-feature-l10','type','grant','sourceKey','magic-item-adept',
        'target','feature','key','class:artificer:magic-item-adept:l10',
        'payload',jsonb_build_object('label','Magic Item Adept','description','Attunement capacity increases to four.')
      ),
      jsonb_build_object(
        'id','artificer-attunement-capacity-4','type','numeric','sourceKey','magic-item-adept',
        'target','values.artificer_attunement_capacity','operation','SET','value',4,'priority',10
      )
    );
    update public.rule_template_levels set mechanics=v_mechanics where id=v_level.id;

    -- Level 11: Spell-Storing Item.
    select * into v_level from public.rule_template_levels where template_id=r.id and level=11;
    v_mechanics:=coalesce((
      select jsonb_agg(x.value order by x.ord)
      from jsonb_array_elements(coalesce(v_level.mechanics,'[]'::jsonb)) with ordinality x(value,ord)
      where x.value->>'sourceKey'<>'spell-storing-item'
    ),'[]'::jsonb);
    v_mechanics:=v_mechanics||jsonb_build_array(
      jsonb_build_object(
        'id','artificer-spell-storing-item-feature-l11','type','grant','sourceKey','spell-storing-item',
        'target','feature','key','class:artificer:spell-storing-item:l11',
        'payload',jsonb_build_object(
          'label','Spell-Storing Item',
          'description','After a Long Rest, bind an eligible level 1–3 Artificer spell to a weapon/focus. Any holder can use the stored spell with the creator spellcasting ability.'
        )
      ),
      jsonb_build_object(
        'id','artificer-spell-storing-item-action','type','action','sourceKey','spell-storing-item',
        'key','class:artificer:spell-storing-item:store','label','Spell-Storing Item',
        'economy','long_rest_setup',
        'effects',jsonb_build_array(jsonb_build_object(
          'kind','semantic','key','bind_spell_to_item',
          'payload',jsonb_build_object(
            'storeRpc','artificer_store_spell_item_v1',
            'useRpc','artificer_use_spell_storing_item_v1',
            'spellLevels',jsonb_build_array(1,2,3),
            'materialConsumedAllowed',false
          )
        )),
        'tags',jsonb_build_array('artificer','inventory','spell','parameterized')
      )
    );
    update public.rule_template_levels set mechanics=v_mechanics where id=v_level.id;

    -- Level 14: Advanced Artifice, cap 5 and +1 Flash on Short Rest.
    select * into v_level from public.rule_template_levels where template_id=r.id and level=14;
    v_mechanics:=coalesce((
      select jsonb_agg(x.value order by x.ord)
      from jsonb_array_elements(coalesce(v_level.mechanics,'[]'::jsonb)) with ordinality x(value,ord)
      where x.value->>'sourceKey'<>'advanced-artifice'
        and not (x.value->>'sourceKey'='flash-of-genius' and x.value->>'type'='resource')
    ),'[]'::jsonb);
    v_flash_recharge:=jsonb_build_object(
      'rules',jsonb_build_array(
        jsonb_build_object('trigger','short_rest','restore','amount','amount',1),
        jsonb_build_object('trigger','long_rest','restore','full')
      )
    );
    v_mechanics:=v_mechanics||jsonb_build_array(
      jsonb_build_object(
        'id','artificer-advanced-artifice-feature-l14','type','grant','sourceKey','advanced-artifice',
        'target','feature','key','class:artificer:advanced-artifice:l14',
        'payload',jsonb_build_object(
          'label','Advanced Artifice',
          'description','Attunement capacity increases to five. Refreshed Genius restores one expended Flash of Genius use after a Short Rest.'
        )
      ),
      jsonb_build_object(
        'id','artificer-attunement-capacity-5','type','numeric','sourceKey','advanced-artifice',
        'target','values.artificer_attunement_capacity','operation','SET','value',5,'priority',14
      ),
      jsonb_build_object(
        'id','artificer-flash-of-genius-resource-l14','type','resource','sourceKey','flash-of-genius',
        'key','artificer_flash_of_genius','label','Flash of Genius',
        'max',v_int_formula,
        'recoveryRules',jsonb_build_array(
          jsonb_build_object('trigger','short_rest','restore','amount','amount',1),
          jsonb_build_object('trigger','long_rest','restore','full')
        ),
        'recharge',jsonb_build_array('short_rest','long_rest'),
        'restore','full','initial','full','priority',14,'grantOperation','REPLACE'
      )
    );
    update public.rule_template_levels set mechanics=v_mechanics where id=v_level.id;

    -- Level 18: cap 6.
    select * into v_level from public.rule_template_levels where template_id=r.id and level=18;
    v_mechanics:=coalesce((
      select jsonb_agg(x.value order by x.ord)
      from jsonb_array_elements(coalesce(v_level.mechanics,'[]'::jsonb)) with ordinality x(value,ord)
      where x.value->>'sourceKey'<>'magic-item-master'
    ),'[]'::jsonb);
    v_mechanics:=v_mechanics||jsonb_build_array(
      jsonb_build_object(
        'id','artificer-magic-item-master-feature-l18','type','grant','sourceKey','magic-item-master',
        'target','feature','key','class:artificer:magic-item-master:l18',
        'payload',jsonb_build_object('label','Magic Item Master','description','Attunement capacity increases to six.')
      ),
      jsonb_build_object(
        'id','artificer-attunement-capacity-6','type','numeric','sourceKey','magic-item-master',
        'target','values.artificer_attunement_capacity','operation','SET','value',6,'priority',18
      )
    );
    update public.rule_template_levels set mechanics=v_mechanics where id=v_level.id;

    -- Level 20: Soul of Artifice.
    select * into v_level from public.rule_template_levels where template_id=r.id and level=20;
    v_mechanics:=coalesce((
      select jsonb_agg(x.value order by x.ord)
      from jsonb_array_elements(coalesce(v_level.mechanics,'[]'::jsonb)) with ordinality x(value,ord)
      where x.value->>'sourceKey'<>'soul-of-artifice'
    ),'[]'::jsonb);
    v_mechanics:=v_mechanics||jsonb_build_array(
      jsonb_build_object(
        'id','artificer-soul-of-artifice-feature-l20','type','grant','sourceKey','soul-of-artifice',
        'target','feature','key','class:artificer:soul-of-artifice:l20',
        'payload',jsonb_build_object(
          'label','Soul of Artifice',
          'description','Cheat Death dismisses Uncommon/Rare replicated items at 0 HP for 20 HP each. Magical Guidance fully restores Flash of Genius after a Short Rest while attuned to a magic item.'
        )
      ),
      jsonb_build_object(
        'id','artificer-soul-of-artifice-cheat-death-action','type','action','sourceKey','soul-of-artifice',
        'key','class:artificer:soul-of-artifice:cheat-death','label','Cheat Death',
        'economy','triggered',
        'requirements',jsonb_build_array(jsonb_build_object(
          'kind','condition','condition',jsonb_build_object(
            'kind','state','key','current_hp','operator','EQUALS','value',0
          ),'enforcement','gm','label','When you drop to 0 HP'
        )),
        'effects',jsonb_build_array(jsonb_build_object(
          'kind','semantic','key','artificer_cheat_death',
          'payload',jsonb_build_object('rpc','artificer_soul_of_artifice_cheat_death_v1','hpPerItem',20)
        )),
        'tags',jsonb_build_array('artificer','zero_hp','inventory','parameterized')
      ),
      jsonb_build_object(
        'id','artificer-soul-of-artifice-magical-guidance','type','grant','sourceKey','soul-of-artifice',
        'target','feature','key','class:artificer:soul-of-artifice:magical-guidance',
        'payload',jsonb_build_object(
          'label','Magical Guidance',
          'description','After a Short Rest, if attuned to at least one magic item, restore all Flash of Genius uses.'
        )
      )
    );
    update public.rule_template_levels set mechanics=v_mechanics where id=v_level.id;

    update public.rule_templates
    set catalog_revision='efota-2025-artificer-stage4-base-runtime-v1',
        rules_meta=coalesce(r.rules_meta,'{}'::jsonb)||jsonb_build_object(
          'mechanics_status','IN_PROGRESS_STAGE4_BASE_READY',
          'runtime_stage',4,
          'runtime_revision','efota-2025-artificer-stage4-base-runtime-v1',
          'remaining_base_runtime_pending_stage4',false,
          'base_runtime_complete',true,
          'magic_item_tinker_runtime',true,
          'flash_of_genius_runtime',true,
          'attunement_capacity_runtime',true,
          'spell_storing_item_runtime',true,
          'soul_of_artifice_runtime',true,
          'subclass_runtime_included',false,
          'next_stage','artificer_subclass_wave_1'
        ),
        author_description='',
        author_comment='',
        updated_at=now()
    where id=r.id;

    perform private.artificer_stage4_sync_resources_v1(a.character_id)
    from public.character_template_assignments a
    where a.template_id=r.id;
  end loop;
end
$install_stage4$;

-- Fail closed on the live Stage-4 package shape.
do $cert$
declare
  r record;
  v_count integer;
begin
  for r in
    select * from public.rule_templates
    where kind='class' and catalog_key='class:artificer' and is_active
  loop
    if r.catalog_revision<>'efota-2025-artificer-stage4-base-runtime-v1'
       or coalesce((r.rules_meta->>'runtime_stage')::integer,0)<>4
       or r.rules_meta->>'mechanics_status'<>'IN_PROGRESS_STAGE4_BASE_READY'
       or not coalesce((r.rules_meta->>'base_runtime_complete')::boolean,false)
    then
      raise exception 'ARTIFICER_STAGE4_STATUS_INVALID:%',r.campaign_id;
    end if;

    select count(*) into v_count
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=r.id
      and m.value#>>'{payload,mechanic,runtime_stage}'='pending_stage4';
    if v_count<>0 then
      raise exception 'ARTIFICER_STAGE4_PLACEHOLDERS_REMAIN:%:%',r.campaign_id,v_count;
    end if;

    select count(*) into v_count
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=r.id
      and m.value->>'id' in (
        'artificer-magic-item-charge-action',
        'artificer-magic-item-drain-action',
        'artificer-magic-item-transmute-action',
        'artificer-flash-of-genius-action',
        'artificer-spell-storing-item-action',
        'artificer-soul-of-artifice-cheat-death-action'
      );
    if v_count<>6 then
      raise exception 'ARTIFICER_STAGE4_ACTION_SET_INVALID:%:%',r.campaign_id,v_count;
    end if;

    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=r.id and l.level=18
        and m.value->>'id'='artificer-attunement-capacity-6'
    ) then
      raise exception 'ARTIFICER_STAGE4_ATTUNEMENT_CAP_MISSING:%',r.campaign_id;
    end if;
  end loop;
end
$cert$;

commit;