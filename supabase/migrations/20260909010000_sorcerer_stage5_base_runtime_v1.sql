-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/sorcererBaseRuntimeStage5.test.ts
-- CLASS_WORK_STATUS: sorcerer:stage5=READY

begin;

create or replace function private.sorcerer_effective_level_v1(p_character_id uuid)
returns integer
language sql
stable
security definer
set search_path=''
as $function$
  select coalesce(max(greatest(1,a.template_level)),0)
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id
    and t.kind='class'
    and t.catalog_key='class:sorcerer';
$function$;

create or replace function private.sorcerer_innate_sorcery_active_v1(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select coalesce(
    (
      select case
        when jsonb_typeof(s.runtime_facts->'sorcerer.innate_sorcery_expires_at_epoch')='number'
          then ((s.runtime_facts->>'sorcerer.innate_sorcery_expires_at_epoch')::numeric > extract(epoch from statement_timestamp()))
        else false
      end
      from public.character_sheets s
      where s.character_id=p_character_id
    ),
    false
  );
$function$;

create or replace function public.use_sorcerer_innate_sorcery_v1(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_level integer;
  v_innate_current integer;
  v_sp_current integer;
  v_payment text;
  v_expires numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;

  v_level:=private.sorcerer_effective_level_v1(p_character_id);
  if v_level<1 then raise exception 'Sorcerer class is unavailable'; end if;

  perform 1 from public.character_sheets where character_id=p_character_id for update;
  select current into v_innate_current
  from public.character_resource_states
  where character_id=p_character_id and state_key='innate_sorcery'
  for update;
  if v_innate_current is null then raise exception 'Innate Sorcery resource is not synchronized'; end if;

  if v_innate_current>0 then
    perform private.consume_character_resource_costs(
      p_character_id,
      jsonb_build_array(jsonb_build_object('stateKey','innate_sorcery','amount',1)),
      auth.uid()
    );
    v_payment:='innate_sorcery';
  else
    if v_level<7 then raise exception 'Innate Sorcery has no uses remaining'; end if;
    select current into v_sp_current
    from public.character_resource_states
    where character_id=p_character_id and state_key='sorcery_points'
    for update;
    if coalesce(v_sp_current,0)<2 then raise exception 'Not enough Sorcery Points'; end if;
    perform private.consume_character_resource_costs(
      p_character_id,
      jsonb_build_array(jsonb_build_object('stateKey','sorcery_points','amount',2)),
      auth.uid()
    );
    v_payment:='sorcery_points';
  end if;

  v_expires:=extract(epoch from clock_timestamp()+interval '1 minute');
  perform private.apply_character_runtime_state_effect(
    p_character_id,
    jsonb_build_object(
      'kind','state',
      'key','sorcerer.innate_sorcery_expires_at_epoch',
      'operation','SET',
      'value',v_expires
    )
  );

  return jsonb_build_object(
    'active',true,
    'payment',v_payment,
    'expiresAtEpoch',v_expires,
    'saveDcBonus',1,
    'spellAttackAdvantage',true,
    'maxMetamagicOptions',case when v_level>=7 then 2 else 1 end,
    'arcaneApotheosis',v_level>=20
  );
end;
$function$;

revoke all on function public.use_sorcerer_innate_sorcery_v1(uuid) from public;
grant execute on function public.use_sorcerer_innate_sorcery_v1(uuid) to authenticated;

create or replace function public.send_chat_spell_with_template_modifiers_v2(
  p_room_id uuid,
  p_character_id uuid,
  p_spell_mechanic_id text default null,
  p_method_key text default null,
  p_option_key text default null,
  p_spell_resource_costs jsonb default '[]'::jsonb,
  p_modifier_mechanic_ids text[] default array[]::text[],
  p_label text default null,
  p_payload jsonb default '{}'::jsonb,
  p_command_id uuid default gen_random_uuid()
)
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_message_id bigint;
  v_payload jsonb;
  v_fingerprint jsonb;
  v_modifier_id text;
  v_modifier jsonb;
  v_modifiers jsonb:='[]'::jsonb;
  v_seen text[]:=array[]::text[];
  v_regular_modifier_count integer:=0;
  v_level integer;
  v_innate_active boolean;
  v_free_used boolean:=false;
  v_free_this_modifier boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;

  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;

  v_level:=private.sorcerer_effective_level_v1(p_character_id);
  v_innate_active:=v_level>=1 and private.sorcerer_innate_sorcery_active_v1(p_character_id);
  if p_modifier_mechanic_ids is null then p_modifier_mechanic_ids:=array[]::text[]; end if;

  if v_innate_active and v_level>=7 then
    if cardinality(p_modifier_mechanic_ids)>2 then raise exception 'Sorcery Incarnate allows at most two Metamagic options'; end if;
  elsif cardinality(p_modifier_mechanic_ids)>3 then
    raise exception 'Too many spell modifiers';
  end if;

  v_fingerprint:=jsonb_build_object(
    'roomId',p_room_id,'characterId',p_character_id,
    'spellMechanicId',nullif(trim(coalesce(p_spell_mechanic_id,'')),''),
    'methodKey',nullif(trim(coalesce(p_method_key,'')),''),
    'optionKey',nullif(trim(coalesce(p_option_key,'')),''),
    'spellResourceCosts',coalesce(p_spell_resource_costs,'[]'::jsonb),
    'modifierMechanicIds',to_jsonb(p_modifier_mechanic_ids),
    'label',p_label,'payload',coalesce(p_payload,'{}'::jsonb),
    'sorcererStage5',jsonb_build_object('level',v_level,'innateActive',v_innate_active)
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by is distinct from auth.uid()
      or v_existing.campaign_id is distinct from v_campaign_id
      or v_existing.engine is distinct from 'gena'
      or v_existing.command_kind is distinct from 'spell.with_modifiers.v2'
      or v_existing.aggregate_id is distinct from p_character_id
      or (v_existing.result->'fingerprint') is distinct from v_fingerprint
    then raise exception 'Command id is already used by another command'; end if;
    return (v_existing.result->>'messageId')::bigint;
  end if;

  foreach v_modifier_id in array p_modifier_mechanic_ids loop
    v_modifier_id:=trim(coalesce(v_modifier_id,''));
    if v_modifier_id='' then raise exception 'Modifier mechanic id is required'; end if;
    if v_modifier_id=any(v_seen) then raise exception 'Duplicate spell modifier'; end if;
    v_seen:=array_append(v_seen,v_modifier_id);

    v_modifier:=private.character_template_selected_action_definition_v1(p_character_id,v_modifier_id);
    if v_modifier is null then raise exception 'Spell modifier is unavailable'; end if;
    if not coalesce(v_modifier->'tags','[]'::jsonb) ? 'spell_modifier' then raise exception 'Action is not a spell modifier'; end if;
    if exists(
      select 1 from jsonb_array_elements(coalesce(v_modifier->'effects','[]'::jsonb)) e(value)
      where e.value->>'kind'<>'semantic'
    ) then raise exception 'Spell modifier may only carry semantic effects'; end if;

    if not (coalesce(v_modifier->'tags','[]'::jsonb) ? 'metamagic_stack_exception') then
      v_regular_modifier_count:=v_regular_modifier_count+1;
      if not (v_innate_active and v_level>=7) and v_regular_modifier_count>1 then
        raise exception 'Only one ordinary spell modifier can be used on the same spell';
      end if;
    end if;

    v_free_this_modifier:=v_innate_active and v_level>=20 and not v_free_used;
    if v_free_this_modifier then
      v_free_used:=true;
    else
      perform public.use_character_template_resource_action(p_character_id,v_modifier_id,null);
    end if;

    v_modifiers:=v_modifiers||jsonb_build_array(jsonb_build_object(
      'mechanicId',v_modifier_id,
      'label',coalesce(nullif(v_modifier->>'label',''),v_modifier_id),
      'sourceKey',v_modifier->>'sourceKey',
      'effects',coalesce(v_modifier->'effects','[]'::jsonb),
      'sorceryPointCostWaived',v_free_this_modifier,
      'waiverCadence',case when v_free_this_modifier then 'once_per_turn_gm_adjudicated' else null end
    ));
  end loop;

  if nullif(trim(coalesce(p_spell_mechanic_id,'')),'') is not null then
    if nullif(trim(coalesce(p_method_key,'')),'') is null then raise exception 'Method is required for a template spell'; end if;
    if coalesce(p_spell_resource_costs,'[]'::jsonb)<>'[]'::jsonb then raise exception 'Template spell costs must be resolved by the server'; end if;
    perform public.use_character_template_spell_v1(
      p_character_id,trim(p_spell_mechanic_id),trim(p_method_key),nullif(trim(coalesce(p_option_key,'')),'')
    );
  else
    if p_spell_resource_costs is null then p_spell_resource_costs:='[]'::jsonb; end if;
    if jsonb_typeof(p_spell_resource_costs)<>'array' then raise exception 'Spell resource costs must be an array'; end if;
    perform private.consume_character_resource_costs(p_character_id,p_spell_resource_costs,auth.uid());
  end if;

  v_payload:=coalesce(p_payload,'{}'::jsonb)||jsonb_build_object(
    'templateMechanicId',nullif(trim(coalesce(p_spell_mechanic_id,'')),''),
    'templateMethodKey',nullif(trim(coalesce(p_method_key,'')),''),
    'templateOptionKey',nullif(trim(coalesce(p_option_key,'')),''),
    'templateModifiers',v_modifiers,
    'innateSorcery',case when v_innate_active then jsonb_build_object(
      'active',true,'saveDcBonus',1,'spellAttackAdvantage',true,
      'maxMetamagicOptions',case when v_level>=7 then 2 else 1 end,
      'arcaneApotheosis',v_level>=20,
      'freeMetamagicCadence',case when v_level>=20 then 'once_per_turn_gm_adjudicated' else null end
    ) else jsonb_build_object('active',false) end
  );

  v_message_id:=public.send_chat_event_v3(
    p_room_id,p_character_id,'spell',coalesce(nullif(trim(coalesce(p_label,'')),''),'Заклинание'),v_payload,'[]'::jsonb
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_campaign_id,p_character_id,'gena','spell.with_modifiers.v2',p_character_id,
    jsonb_build_object('messageId',v_message_id,'fingerprint',v_fingerprint),auth.uid()
  );
  return v_message_id;
end;
$function$;

revoke all on function public.send_chat_spell_with_template_modifiers_v2(uuid,uuid,text,text,text,jsonb,text[],text,jsonb,uuid) from public;
grant execute on function public.send_chat_spell_with_template_modifiers_v2(uuid,uuid,text,text,text,jsonb,text[],text,jsonb,uuid) to authenticated;

create or replace function private.ensure_sorcerer_stage5_base_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sorcerer uuid;
begin
  perform private.ensure_sorcerer_stage4_metamagic_runtime_v1(p_campaign_id);
  select id into v_sorcerer
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:sorcerer' and is_active
  order by version desc,created_at desc limit 1;
  if v_sorcerer is null then raise exception 'SORCERER_STAGE5_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id; end if;

  update public.rule_templates
  set catalog_revision='xphb-2024-sorcerer-stage5-base-runtime-v1',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'runtime_revision','xphb-2024-sorcerer-stage5-base-runtime-v1',
        'runtime_stage',5,
        'mechanics_status','STAGE5_BASE_RUNTIME',
        'innate_sorcery_runtime',jsonb_build_object(
          'active_fact','sorcerer.innate_sorcery_expires_at_epoch',
          'duration_seconds',60,
          'save_dc_bonus',1,
          'spell_attack_advantage',true
        ),
        'sorcery_incarnate_runtime',jsonb_build_object(
          'unlock_level',7,
          'fallback_activation_sorcery_points',2,
          'max_metamagic_while_innate_active',2
        ),
        'arcane_apotheosis_runtime',jsonb_build_object(
          'unlock_level',20,
          'free_metamagic_while_innate_active',1,
          'cadence','once_per_turn_gm_adjudicated'
        ),
        'stage5_base_runtime_included',true,
        'stage6_ui_full_integration_pending',true
      )
  where id=v_sorcerer;

  update public.rule_template_levels
  set mechanics=(
    select coalesce(jsonb_agg(m.value order by m.ord),'[]'::jsonb)
    from jsonb_array_elements(coalesce(mechanics,'[]'::jsonb)) with ordinality m(value,ord)
    where not (
      (level=7 and m.value->>'id'='class:sorcerer:sorcery-incarnate:l7')
      or (level=20 and m.value->>'id'='class:sorcerer:arcane-apotheosis:l20')
    )
  ) || case
    when level=7 then jsonb_build_array(jsonb_build_object(
      'id','class:sorcerer:sorcery-incarnate:l7','type','grant','target','feature','key','class:sorcerer:sorcery-incarnate:l7',
      'payload',jsonb_build_object(
        'runtime','structured','innateFallbackSorceryPoints',2,'maxMetamagicWhileInnateActive',2,
        'activationRpc','use_sorcerer_innate_sorcery_v1','castRpc','send_chat_spell_with_template_modifiers_v2'
      ),
      'sourceKey','feature:sorcery-incarnate'
    ))
    when level=20 then jsonb_build_array(jsonb_build_object(
      'id','class:sorcerer:arcane-apotheosis:l20','type','grant','target','feature','key','class:sorcerer:arcane-apotheosis:l20',
      'payload',jsonb_build_object(
        'runtime','structured','freeMetamagicWhileInnateActive',1,'cadence','once_per_turn_gm_adjudicated',
        'castRpc','send_chat_spell_with_template_modifiers_v2'
      ),
      'sourceKey','feature:arcane-apotheosis'
    ))
    else '[]'::jsonb end
  where template_id=v_sorcerer and level in(7,20);
end;
$function$;

do $block$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_sorcerer_stage5_base_runtime_v1(r.id);
  end loop;
end;
$block$;

create or replace function private.install_sorcerer_stage5_for_new_campaign_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_sorcerer_stage5_base_runtime_v1(new.id);
  return new;
end;
$function$;

drop trigger if exists trg_install_sorcerer_stage4_metamagic_for_campaign on public.campaigns;
drop trigger if exists trg_install_sorcerer_stage5_base_for_campaign on public.campaigns;
create trigger trg_install_sorcerer_stage5_base_for_campaign
after insert on public.campaigns
for each row execute function private.install_sorcerer_stage5_for_new_campaign_v1();

commit;
