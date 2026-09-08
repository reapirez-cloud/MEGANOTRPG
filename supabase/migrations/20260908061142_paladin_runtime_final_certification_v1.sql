-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:paladin
-- CLASS_WORK_STATUS: paladin:runtime=READY
begin;

create or replace function private.certify_paladin_runtime_final_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_paladin uuid;
  v_bad integer;
  v_count integer;
begin
  select id into v_paladin
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:paladin' and is_active
  order by version desc,created_at desc
  limit 1;
  if v_paladin is null then raise exception 'PALADIN_FINAL_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id; end if;

  select count(*) into v_count
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:paladin' and is_active;
  if v_count<>1 then raise exception 'PALADIN_FINAL_ACTIVE_CLASS_COUNT:%:%',p_campaign_id,v_count; end if;

  if (select count(*) from public.rule_template_levels where template_id=v_paladin)<>20 then
    raise exception 'PALADIN_FINAL_BASE_LEVEL_ROWS_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1 from public.rule_templates t
    where t.id=v_paladin
      and coalesce((t.rules_meta->>'feature_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'spell_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'subclass_runtime_included')::boolean,false)
      and t.rules_meta->>'spellcasting_ability'='charisma'
      and t.rules_meta->>'spell_preparation_refresh'='long_rest'
      and coalesce((t.rules_meta->>'prepared_spell_replacement_limit')::integer,0)=1
      and coalesce((t.rules_meta->>'phb2024_subclass_count')::integer,0)=4
      and jsonb_typeof(t.rules_meta#>'{sheet_profile,spell_slots_by_level}')='object'
      and (t.rules_meta#>>'{sheet_profile,prepared_spells_by_level,20}')::integer=15
  ) then raise exception 'PALADIN_FINAL_BASE_RUNTIME_CONTRACT_INCOMPLETE:%',p_campaign_id; end if;

  if not exists(
    select 1 from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_paladin and m.value->>'id'='paladin-divine-smite-spell'
  ) or not exists(
    select 1 from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_paladin and m.value->>'id'='paladin-find-steed-spell'
  ) then raise exception 'PALADIN_FINAL_ALWAYS_PREPARED_CLASS_SPELLS_MISSING:%',p_campaign_id; end if;

  if not exists(
    select 1 from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_paladin and m.value->>'type'='resource' and m.value->>'key'='channel_divinity'
  ) then raise exception 'PALADIN_FINAL_CHANNEL_DIVINITY_LEDGER_MISSING:%',p_campaign_id; end if;

  with expected(catalog_key) as (
    values
      ('subclass:paladin:devotion'),
      ('subclass:paladin:glory'),
      ('subclass:paladin:ancients'),
      ('subclass:paladin:vengeance')
  )
  select count(*) into v_bad
  from expected e
  where not exists(
    select 1 from public.rule_templates t
    where t.campaign_id=p_campaign_id and t.kind='subclass' and t.catalog_key=e.catalog_key
      and t.parent_template_id=v_paladin and t.is_active and t.unlock_level=3
      and t.catalog_revision='xphb-2024-paladin-subclasses-stage4-v2'
  );
  if v_bad<>0 then raise exception 'PALADIN_FINAL_SUBCLASS_PACKAGE_MISSING:%:%',p_campaign_id,v_bad; end if;

  select count(*) into v_count
  from public.rule_templates t
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
    and t.catalog_key like 'subclass:paladin:%';
  if v_count<>4 then raise exception 'PALADIN_FINAL_ACTIVE_SUBCLASS_COUNT:%:%',p_campaign_id,v_count; end if;

  select count(*) into v_bad
  from public.rule_templates t
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
    and t.catalog_key like 'subclass:paladin:%'
    and (
      (select count(*) from public.rule_template_levels l where l.template_id=t.id)<>8
      or (select array_agg(l.level order by l.level) from public.rule_template_levels l where l.template_id=t.id)
         is distinct from array[3,5,7,9,13,15,17,20]
      or (select count(*) from public.rule_template_spell_links sl where sl.template_id=t.id)<>10
    );
  if v_bad<>0 then raise exception 'PALADIN_FINAL_SUBCLASS_LEVEL_OR_SPELL_COUNTS_INVALID:%:%',p_campaign_id,v_bad; end if;

  with expected(catalog_key,slug) as (
    values
      ('subclass:paladin:devotion','protection-from-evil-and-good'),('subclass:paladin:devotion','shield-of-faith'),
      ('subclass:paladin:devotion','aid'),('subclass:paladin:devotion','zone-of-truth'),
      ('subclass:paladin:devotion','beacon-of-hope'),('subclass:paladin:devotion','dispel-magic'),
      ('subclass:paladin:devotion','freedom-of-movement'),('subclass:paladin:devotion','guardian-of-faith'),
      ('subclass:paladin:devotion','commune'),('subclass:paladin:devotion','flame-strike'),
      ('subclass:paladin:glory','guiding-bolt'),('subclass:paladin:glory','heroism'),
      ('subclass:paladin:glory','enhance-ability'),('subclass:paladin:glory','magic-weapon'),
      ('subclass:paladin:glory','haste'),('subclass:paladin:glory','protection-from-energy'),
      ('subclass:paladin:glory','compulsion'),('subclass:paladin:glory','freedom-of-movement'),
      ('subclass:paladin:glory','legend-lore'),('subclass:paladin:glory','yolande-s-regal-presence'),
      ('subclass:paladin:ancients','ensnaring-strike'),('subclass:paladin:ancients','speak-with-animals'),
      ('subclass:paladin:ancients','misty-step'),('subclass:paladin:ancients','moonbeam'),
      ('subclass:paladin:ancients','plant-growth'),('subclass:paladin:ancients','protection-from-energy'),
      ('subclass:paladin:ancients','ice-storm'),('subclass:paladin:ancients','stoneskin'),
      ('subclass:paladin:ancients','commune-with-nature'),('subclass:paladin:ancients','tree-stride'),
      ('subclass:paladin:vengeance','bane'),('subclass:paladin:vengeance','hunter-s-mark'),
      ('subclass:paladin:vengeance','hold-person'),('subclass:paladin:vengeance','misty-step'),
      ('subclass:paladin:vengeance','haste'),('subclass:paladin:vengeance','protection-from-energy'),
      ('subclass:paladin:vengeance','banishment'),('subclass:paladin:vengeance','dimension-door'),
      ('subclass:paladin:vengeance','hold-monster'),('subclass:paladin:vengeance','scrying')
  )
  select count(*) into v_bad
  from expected e
  where not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_spell_links sl on sl.template_id=t.id
    where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
      and t.catalog_key=e.catalog_key and sl.catalog_slug=e.slug
  );
  if v_bad<>0 then raise exception 'PALADIN_FINAL_OATH_SPELL_LINKS_INCOMPLETE:%:%',p_campaign_id,v_bad; end if;

  select count(*) into v_bad
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
  cross join lateral jsonb_array_elements(coalesce(m.value#>'{payload,methods}','[]'::jsonb)) method(value)
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
    and t.catalog_key like 'subclass:paladin:%'
    and m.value->>'type'='spell'
    and (
      m.value#>>'{payload,preparation,mode}'<>'always_prepared'
      or method.value->>'kind'<>'class_spell'
      or method.value->>'ability'<>'charisma'
      or coalesce((method.value->>'requiresPrepared')::boolean,true)
      or exists(
        select 1
        from jsonb_array_elements(coalesce(method.value->'resourceOptions','[]'::jsonb)) o(value)
        cross join lateral jsonb_array_elements(coalesce(o.value->'costs','[]'::jsonb)) c(value)
        where c.value->>'key' !~ '^spell_slot_[1-5]$' or coalesce((c.value->>'amount')::integer,0)<>1
      )
    );
  if v_bad<>0 then raise exception 'PALADIN_FINAL_OATH_SPELL_RUNTIME_INVALID:%:%',p_campaign_id,v_bad; end if;

  with expected(catalog_key,mechanic_id) as (
    values
      ('subclass:paladin:devotion','devotion-sacred-weapon-action'),
      ('subclass:paladin:glory','glory-inspiring-smite-action'),
      ('subclass:paladin:glory','glory-peerless-athlete-action'),
      ('subclass:paladin:ancients','ancients-natures-wrath-action'),
      ('subclass:paladin:vengeance','vengeance-vow-enmity-action')
  )
  select count(*) into v_bad
  from expected e
  where not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
      and t.catalog_key=e.catalog_key and m.value->>'id'=e.mechanic_id
      and m.value->>'type'='action' and m.value->>'resourceKey'='channel_divinity'
      and coalesce((m.value->>'resourceCost')::integer,0)=1
  );
  if v_bad<>0 then raise exception 'PALADIN_FINAL_CHANNEL_DIVINITY_ACTIONS_INVALID:%:%',p_campaign_id,v_bad; end if;

  with expected(catalog_key,recharge_id,resource_key) as (
    values
      ('subclass:paladin:devotion','devotion-holy-nimbus-recharge','devotion_holy_nimbus'),
      ('subclass:paladin:glory','glory-living-legend-recharge','glory_living_legend'),
      ('subclass:paladin:ancients','ancients-elder-champion-recharge','ancients_elder_champion'),
      ('subclass:paladin:vengeance','vengeance-avenging-angel-recharge','vengeance_avenging_angel')
  )
  select count(*) into v_bad
  from expected e
  where not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=20
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
      and t.catalog_key=e.catalog_key and m.value->>'id'=e.recharge_id
      and m.value#>>'{costOptions,0,costs,0,key}'='spell_slot_5'
      and coalesce((m.value#>>'{costOptions,0,costs,0,amount}')::integer,0)=1
      and m.value#>>'{effects,0,kind}'='resource'
      and m.value#>>'{effects,0,key}'=e.resource_key
      and m.value#>>'{effects,0,operation}'='RESTORE'
      and coalesce((m.value#>>'{effects,0,amount}')::integer,0)=1
  );
  if v_bad<>0 then raise exception 'PALADIN_FINAL_CAPSTONE_RECHARGE_INVALID:%:%',p_campaign_id,v_bad; end if;

  select count(*) into v_bad
  from (
    select m.value->>'id' mechanic_id,count(*) n
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
      and t.catalog_key like 'subclass:paladin:%'
    group by t.catalog_key,m.value->>'id'
    having count(*)>1
  ) d;
  if v_bad<>0 then raise exception 'PALADIN_FINAL_DUPLICATE_SUBCLASS_MECHANICS:%:%',p_campaign_id,v_bad; end if;

  if not exists(
    select 1 from public.spell_catalog s
    where s.slug='yolande-s-regal-presence' and s.spell_level=5 and s.source='XPHB'
      and s.source_kind='official' and s.license='PROPRIETARY' and s.roll_mode='roll'
  ) then raise exception 'PALADIN_FINAL_YOLANDE_CATALOG_MISSING'; end if;

  if not pg_catalog.has_function_privilege('authenticated','public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.send_chat_template_spell_v2(uuid,uuid,text,text,text,text,jsonb,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.commit_character_template_choice_v2(uuid,text,jsonb)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.gena_commit_character_spell_preparation_v1(uuid,uuid,uuid[])','EXECUTE')
  then raise exception 'PALADIN_FINAL_UI_CHAT_RPC_PRIVILEGES_INCOMPLETE'; end if;

  if position('resourceAmount' in pg_get_functiondef('public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid)'::regprocedure))=0 then
    raise exception 'PALADIN_FINAL_VARIABLE_RESOURCE_CHAT_BRIDGE_MISSING';
  end if;

  update public.rule_templates
  set catalog_revision='xphb-2024-paladin-runtime-final-v1',
      rules_meta=(coalesce(rules_meta,'{}'::jsonb)-'stage4_deferred')||jsonb_build_object(
        'mechanics_status','READY',
        'runtime_stage',4,
        'runtime_revision','xphb-2024-paladin-runtime-final-v1',
        'runtime_certified_at','2026-09-08',
        'feature_runtime_included',true,
        'spell_runtime_included',true,
        'subclass_runtime_included',true,
        'phb2024_subclass_count',4,
        'ui_chat_runtime_certified',true,
        'persistent_resource_ledger','character_resource_states',
        'class_work_status','READY'
      ),
      updated_at=now()
  where id=v_paladin;

  update public.rule_templates t
  set rules_meta=coalesce(t.rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','READY',
        'runtime_stage',4,
        'runtime_revision','xphb-2024-paladin-runtime-final-v1',
        'runtime_certified_at','2026-09-08'
      ),
      updated_at=now()
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
    and t.catalog_key like 'subclass:paladin:%';
end;
$function$;

revoke all on function private.certify_paladin_runtime_final_v1(uuid) from public,anon,authenticated;
grant execute on function private.certify_paladin_runtime_final_v1(uuid) to service_role;

create or replace function private.certify_paladin_runtime_final_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.certify_paladin_runtime_final_v1(new.id);
  return new;
end;
$function$;
revoke all on function private.certify_paladin_runtime_final_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaag_campaigns_certify_paladin_runtime_final_v1 on public.campaigns;
create trigger aaaaaaaag_campaigns_certify_paladin_runtime_final_v1
after insert on public.campaigns
for each row execute function private.certify_paladin_runtime_final_v1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.certify_paladin_runtime_final_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;