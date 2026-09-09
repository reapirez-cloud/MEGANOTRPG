-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/sorcererStage6FullIntegration.test.ts
-- CLASS_WORK_STATUS: sorcerer:stage6_base=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Stage 6 closes the base Sorcerer player path: persistent 2024 spell choices,
-- canonical class-spell access, Innate Sorcery activation through GENA, and
-- conditional UI metadata for Sorcery Incarnate / Arcane Apotheosis.

begin;

create or replace function private.sorcerer_stage6_spell_mechanic_v1(p_slug text)
returns jsonb
language plpgsql
stable
set search_path=''
as $function$
declare
  v_spell public.spell_catalog%rowtype;
  v_method jsonb;
  v_resource_options jsonb := '[]'::jsonb;
  v_slot integer;
begin
  select * into v_spell
  from public.spell_catalog
  where slug=p_slug;

  if v_spell.id is null then
    raise exception 'SORCERER_STAGE6_SPELL_NOT_FOUND:%',p_slug;
  end if;
  if not exists(
    select 1 from public.spell_catalog_classes sc
    where sc.spell_id=v_spell.id and sc.class_key='sorcerer'
  ) then
    raise exception 'SORCERER_STAGE6_SPELL_NOT_ON_LIST:%',p_slug;
  end if;

  if v_spell.spell_level>0 then
    for v_slot in v_spell.spell_level..9 loop
      v_resource_options:=v_resource_options||jsonb_build_array(jsonb_build_object(
        'key','sorcerer-slot-'||v_slot,
        'castLevel',v_slot,
        'costs',jsonb_build_array(jsonb_build_object('key','spell_slot_'||v_slot,'amount',1))
      ));
    end loop;
  end if;

  v_method:=jsonb_build_object(
    'key','sorcerer-cast',
    'kind','class_spell',
    'ability','charisma',
    'requiresPrepared',false
  );
  if v_spell.spell_level>0 then
    v_method:=v_method||jsonb_build_object('resourceOptions',v_resource_options);
  end if;

  return jsonb_build_object(
    'id','sorcerer-base-spell-'||p_slug,
    'type','spell',
    'sourceKey','sorcerer-base:spellcasting',
    'key','spell:'||p_slug,
    'catalogSlug',p_slug,
    'variantKey','sorcerer-base:spellcasting:'||p_slug,
    'payload',jsonb_build_object(
      'spell',jsonb_build_object(
        'name',coalesce(nullif(v_spell.name_ru,''),v_spell.name_en),
        'level',v_spell.spell_level,
        'school',v_spell.school,
        'ritual',coalesce(v_spell.ritual,false)
      ),
      'preparation',jsonb_build_object('mode','always_prepared'),
      'methods',jsonb_build_array(v_method)
    )
  );
end;
$function$;

revoke all on function private.sorcerer_stage6_spell_mechanic_v1(text) from public,anon,authenticated;
grant execute on function private.sorcerer_stage6_spell_mechanic_v1(text) to service_role;

create or replace function private.sorcerer_stage6_innate_dc_bonus_v1(p_slug text)
returns jsonb
language sql
stable
set search_path=''
as $function$
  select jsonb_build_object(
    'id','sorcerer-base-innate-dc-'||p_slug,
    'type','numeric',
    'sourceKey','sorcerer-base:innate-sorcery',
    'target','spells.spell:'||p_slug||'.access.sorcerer-base:spellcasting:'||p_slug||'.method.sorcerer-cast.saveDc',
    'operation','ADD',
    'value',1,
    'condition',jsonb_build_object(
      'kind','state',
      'key','sorcerer.innate_sorcery_active',
      'operator','EQUALS',
      'value',true
    )
  );
$function$;

revoke all on function private.sorcerer_stage6_innate_dc_bonus_v1(text) from public,anon,authenticated;
grant execute on function private.sorcerer_stage6_innate_dc_bonus_v1(text) to service_role;

create or replace function private.sorcerer_stage6_spell_choice_v1(p_kind text)
returns jsonb
language plpgsql
stable
set search_path=''
as $function$
declare
  v_options jsonb:='[]'::jsonb;
  v_labels jsonb:='{}'::jsonb;
  v_unlocks jsonb:='{}'::jsonb;
  v_mechanics jsonb:='{}'::jsonb;
  r record;
  v_unlock integer;
begin
  if p_kind not in('cantrip','prepared') then
    raise exception 'SORCERER_STAGE6_CHOICE_KIND_INVALID:%',p_kind;
  end if;

  for r in
    select s.slug,s.spell_level,coalesce(nullif(s.name_ru,''),s.name_en) as label
    from public.spell_catalog s
    where exists(
      select 1 from public.spell_catalog_classes sc
      where sc.spell_id=s.id and sc.class_key='sorcerer'
    )
      and ((p_kind='cantrip' and s.spell_level=0) or (p_kind='prepared' and s.spell_level between 1 and 9))
    order by s.spell_level,coalesce(nullif(s.name_ru,''),s.name_en),s.slug
  loop
    v_options:=v_options||jsonb_build_array(r.slug);
    v_labels:=jsonb_set(v_labels,array[r.slug],to_jsonb(r.label),true);
    v_mechanics:=jsonb_set(
      v_mechanics,array[r.slug],
      jsonb_build_array(
        private.sorcerer_stage6_spell_mechanic_v1(r.slug),
        private.sorcerer_stage6_innate_dc_bonus_v1(r.slug)
      ),true
    );

    if p_kind='prepared' then
      v_unlock:=case r.spell_level
        when 1 then 1 when 2 then 3 when 3 then 5 when 4 then 7 when 5 then 9
        when 6 then 11 when 7 then 13 when 8 then 15 else 17 end;
      v_unlocks:=jsonb_set(v_unlocks,array[r.slug],to_jsonb(v_unlock),true);
    end if;
  end loop;

  if jsonb_array_length(v_options)=0 then
    raise exception 'SORCERER_STAGE6_CHOICE_EMPTY:%',p_kind;
  end if;

  if p_kind='cantrip' then
    return jsonb_build_object(
      'key','sorcerer_spellcasting_cantrips',
      'label','Сотворение заклинаний: заговоры',
      'target','trait',
      'count',4,
      'count_by_level',jsonb_build_object('1',4,'4',5,'10',6),
      'options',v_options,
      'option_labels',v_labels,
      'option_mechanics',v_mechanics,
      'selection_mode','player_once',
      'replacement_policy','on_level_change',
      'replacement_limit',1,
      'required',true,
      'resolved_as','class_spell'
    );
  end if;

  return jsonb_build_object(
    'key','sorcerer_spellcasting_spells',
    'label','Сотворение заклинаний: подготовленные заклинания',
    'target','trait',
    'count',2,
    'count_by_level',jsonb_build_object(
      '1',2,'2',4,'3',6,'4',7,'5',9,'6',10,'7',11,'8',12,'9',14,'10',15,
      '11',16,'13',17,'15',18,'17',19,'18',20,'19',21,'20',22
    ),
    'options',v_options,
    'option_labels',v_labels,
    'option_unlock_level',v_unlocks,
    'option_mechanics',v_mechanics,
    'selection_mode','player_once',
    'replacement_policy','on_level_change',
    'replacement_limit',1,
    'required',true,
    'resolved_as','class_spell'
  );
end;
$function$;

revoke all on function private.sorcerer_stage6_spell_choice_v1(text) from public,anon,authenticated;
grant execute on function private.sorcerer_stage6_spell_choice_v1(text) to service_role;

create or replace function private.sorcerer_stage6_metamagic_upgrade_v1(
  p_action jsonb,
  p_priority integer,
  p_free_first boolean
)
returns jsonb
language sql
immutable
set search_path=''
as $function$
  select p_action||jsonb_build_object(
    'grantOperation','REPLACE',
    'priority',p_priority,
    'condition',jsonb_build_object(
      'kind','state','key','sorcerer.innate_sorcery_active','operator','EQUALS','value',true
    ),
    'tags',coalesce(p_action->'tags','[]'::jsonb)
      ||jsonb_build_array('metamagic_two_active')
      ||case when p_free_first then jsonb_build_array('metamagic_free_first_active') else '[]'::jsonb end
  );
$function$;

create or replace function public.send_chat_sorcerer_innate_sorcery_v1(
  p_room_id uuid,
  p_character_id uuid,
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
  v_activation jsonb;
  v_payload jsonb;
  v_fingerprint jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;

  select campaign_id into v_campaign_id from public.characters where id=p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;

  v_fingerprint:=jsonb_build_object(
    'roomId',p_room_id,'characterId',p_character_id,
    'label',p_label,'payload',coalesce(p_payload,'{}'::jsonb)
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by is distinct from auth.uid()
      or v_existing.campaign_id is distinct from v_campaign_id
      or v_existing.engine is distinct from 'gena'
      or v_existing.command_kind is distinct from 'sorcerer.innate_sorcery.activate'
      or v_existing.aggregate_id is distinct from p_character_id
      or (v_existing.result->'fingerprint') is distinct from v_fingerprint
    then raise exception 'Command id is already used by another command'; end if;
    return (v_existing.result->>'messageId')::bigint;
  end if;

  v_activation:=public.use_sorcerer_innate_sorcery_v1(p_character_id);
  v_payload:=coalesce(p_payload,'{}'::jsonb)||jsonb_build_object(
    'mechanicId','sorcerer-innate-sorcery-action',
    'activation',v_activation,
    'detail','Врождённое чародейство активно 1 минуту.'
  );

  v_message_id:=public.send_chat_event_v3(
    p_room_id,p_character_id,'action',
    coalesce(nullif(trim(coalesce(p_label,'')),''),'Врождённое чародейство'),
    v_payload,'[]'::jsonb
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,v_campaign_id,p_character_id,'gena','sorcerer.innate_sorcery.activate',p_character_id,
    jsonb_build_object('messageId',v_message_id,'fingerprint',v_fingerprint,'activation',v_activation),auth.uid()
  );
  return v_message_id;
end;
$function$;

revoke all on function public.send_chat_sorcerer_innate_sorcery_v1(uuid,uuid,text,jsonb,uuid) from public;
grant execute on function public.send_chat_sorcerer_innate_sorcery_v1(uuid,uuid,text,jsonb,uuid) to authenticated;

create or replace function private.ensure_sorcerer_stage6_full_integration_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sorcerer uuid;
  v_cantrips jsonb;
  v_spells jsonb;
  v_keep jsonb:='[]'::jsonb;
  v_metamagic jsonb;
  v_by_level jsonb;
  v_option text;
  v_base_action jsonb;
  v_option_levels jsonb;
begin
  perform private.ensure_sorcerer_stage5_base_runtime_v1(p_campaign_id);

  select id into v_sorcerer
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:sorcerer' and is_active
  order by version desc,created_at desc limit 1;
  if v_sorcerer is null then raise exception 'SORCERER_STAGE6_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id; end if;

  v_cantrips:=private.sorcerer_stage6_spell_choice_v1('cantrip');
  v_spells:=private.sorcerer_stage6_spell_choice_v1('prepared');
  perform private.assert_class_spell_contract_json(v_cantrips);
  perform private.assert_class_spell_contract_json(v_spells);

  insert into public.rule_template_levels(template_id,level,mechanics,choices)
  values(v_sorcerer,1,'[]'::jsonb,'[]'::jsonb)
  on conflict(template_id,level) do nothing;

  update public.rule_template_levels
  set choices=coalesce((
    select jsonb_agg(c.value order by c.ord)
    from jsonb_array_elements(coalesce(rule_template_levels.choices,'[]'::jsonb)) with ordinality c(value,ord)
    where coalesce(c.value->>'key','') not in('sorcerer_spellcasting_cantrips','sorcerer_spellcasting_spells')
  ),'[]'::jsonb)
  where template_id=v_sorcerer;

  select coalesce(choices,'[]'::jsonb) into v_keep
  from public.rule_template_levels where template_id=v_sorcerer and level=1;
  update public.rule_template_levels
  set choices=v_keep||jsonb_build_array(v_cantrips,v_spells)
  where template_id=v_sorcerer and level=1;

  -- At level 7 the action remains one CE identity, but either a normal use or
  -- two Sorcery Points can make it available. The server chooses the actual
  -- payment atomically and owns the one-minute activation state.
  update public.rule_template_levels
  set mechanics=coalesce((
    select jsonb_agg(m.value order by m.ord)
    from jsonb_array_elements(coalesce(rule_template_levels.mechanics,'[]'::jsonb)) with ordinality m(value,ord)
    where m.value->>'id'<>'sorcerer-innate-sorcery-action'
  ),'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
    'id','sorcerer-innate-sorcery-action',
    'type','action',
    'key','innate_sorcery',
    'sourceKey','innate-sorcery',
    'label','Врождённое чародейство',
    'economy','bonus_action',
    'grantOperation','REPLACE',
    'priority',7,
    'costOptions',jsonb_build_array(
      jsonb_build_object('key','innate-use','label','Использование Врождённого чародейства','costs',jsonb_build_array(jsonb_build_object('key','innate_sorcery','amount',1))),
      jsonb_build_object('key','sorcery-incarnate','label','Воплощение чародейства: 2 ОЧ','costs',jsonb_build_array(jsonb_build_object('key','sorcery_points','amount',2)))
    ),
    'effects',jsonb_build_array(jsonb_build_object('kind','semantic','key','activate_innate_sorcery','payload',jsonb_build_object('duration_minutes',1,'server_rpc','send_chat_sorcerer_innate_sorcery_v1'))),
    'tags',jsonb_build_array('class','sorcerer','server_selects_payment')
  ))
  where template_id=v_sorcerer and level=7;

  -- When the timer is active, Choice Runtime emits conditional REPLACE actions
  -- carrying UI capability tags. No second Metamagic engine is created.
  select c.value into v_metamagic
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
  where l.template_id=v_sorcerer and l.level=2 and c.value->>'key'='sorcerer_metamagic'
  limit 1;

  if v_metamagic is not null then
    v_by_level:=coalesce(v_metamagic->'option_mechanics_by_level','{}'::jsonb);
    for v_option in select jsonb_array_elements_text(coalesce(v_metamagic->'options','[]'::jsonb)) loop
      select m.value into v_base_action
      from jsonb_array_elements(coalesce(v_metamagic->'option_mechanics'->v_option,'[]'::jsonb)) m(value)
      where m.value->>'type'='action'
      limit 1;
      if v_base_action is null then continue; end if;

      v_option_levels:=coalesce(v_by_level->v_option,'{}'::jsonb);
      v_option_levels:=jsonb_set(v_option_levels,'{7}',jsonb_build_array(private.sorcerer_stage6_metamagic_upgrade_v1(v_base_action,7,false)),true);
      v_option_levels:=jsonb_set(v_option_levels,'{20}',jsonb_build_array(private.sorcerer_stage6_metamagic_upgrade_v1(v_base_action,20,true)),true);
      v_by_level:=jsonb_set(v_by_level,array[v_option],v_option_levels,true);
    end loop;

    v_metamagic:=jsonb_set(v_metamagic,'{option_mechanics_by_level}',v_by_level,true);
    update public.rule_template_levels
    set choices=(
      select coalesce(jsonb_agg(case when c.value->>'key'='sorcerer_metamagic' then v_metamagic else c.value end order by c.ord),'[]'::jsonb)
      from jsonb_array_elements(coalesce(rule_template_levels.choices,'[]'::jsonb)) with ordinality c(value,ord)
    )
    where template_id=v_sorcerer and level=2;
  end if;

  update public.rule_templates
  set catalog_revision='xphb-2024-sorcerer-stage6-spell-runtime-v1',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'runtime_revision','xphb-2024-sorcerer-stage6-spell-runtime-v1',
        'runtime_stage',6,
        'mechanics_status','STAGE6_BASE_SPELL_RUNTIME_READY',
        'spell_runtime_included',true,
        'spellcasting_ability','charisma',
        'spell_choice_runtime',true,
        'spell_choice_replacement_policy','on_sorcerer_level_gain',
        'spell_choice_replacement_limit',1,
        'cantrip_choice_key','sorcerer_spellcasting_cantrips',
        'prepared_spell_choice_key','sorcerer_spellcasting_spells',
        'innate_sorcery_gena_rpc','send_chat_sorcerer_innate_sorcery_v1',
        'metamagic_cast_rpc','send_chat_spell_with_template_modifiers_v2',
        'stage6_ui_full_integration_pending',false,
        'base_class_runtime_complete',true,
        'subclass_runtime_included',false
      ),
      updated_at=now()
  where id=v_sorcerer;
end;
$function$;

revoke all on function private.ensure_sorcerer_stage6_full_integration_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_sorcerer_stage6_full_integration_v1(uuid) to service_role;

create or replace function private.install_sorcerer_stage6_for_new_campaign_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_sorcerer_stage6_full_integration_v1(new.id);
  return new;
end;
$function$;

drop trigger if exists trg_install_sorcerer_stage5_base_for_campaign on public.campaigns;
drop trigger if exists trg_install_sorcerer_stage6_full_integration_for_campaign on public.campaigns;
create trigger trg_install_sorcerer_stage6_full_integration_for_campaign
after insert on public.campaigns
for each row execute function private.install_sorcerer_stage6_for_new_campaign_v1();

do $block$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_sorcerer_stage6_full_integration_v1(r.id);
  end loop;
end;
$block$;

commit;
