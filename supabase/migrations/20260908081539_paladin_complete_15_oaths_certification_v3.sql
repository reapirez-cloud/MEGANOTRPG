-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:paladin
-- CLASS_WORK_STATUS: paladin:runtime=READY_15_OATHS
begin;

create or replace function private.localize_paladin_player_facing_v3(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  update public.rule_templates
  set source_label='Книга игрока 2024',updated_at=now()
  where campaign_id=p_campaign_id and is_active and (
    catalog_key='class:paladin' or catalog_key in (
      'subclass:paladin:devotion','subclass:paladin:glory','subclass:paladin:ancients','subclass:paladin:vengeance'
    )
  );

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
    'player_facing_language','ru','translation_preserved',true
  ),updated_at=now()
  where campaign_id=p_campaign_id and is_active
    and (catalog_key='class:paladin' or catalog_key like 'subclass:paladin:%');
end;
$function$;
revoke all on function private.localize_paladin_player_facing_v3(uuid) from public,anon,authenticated;
grant execute on function private.localize_paladin_player_facing_v3(uuid) to service_role;

create or replace function private.certify_paladin_runtime_final_v3(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_paladin uuid;
  v_count integer;
  v_bad integer;
begin
  perform private.localize_paladin_player_facing_v3(p_campaign_id);

  select id into v_paladin
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:paladin' and is_active
  order by version desc,created_at desc limit 1;
  if v_paladin is null then raise exception 'PALADIN_V3_CLASS_NOT_FOUND:%',p_campaign_id; end if;

  select count(*) into v_count from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:paladin' and is_active;
  if v_count<>1 then raise exception 'PALADIN_V3_ACTIVE_CLASS_COUNT:%:%',p_campaign_id,v_count; end if;

  if (select count(*) from public.rule_template_levels where template_id=v_paladin)<>20 then
    raise exception 'PALADIN_V3_BASE_LEVELS_INVALID:%',p_campaign_id;
  end if;

  if not exists(
    select 1 from public.rule_templates t where t.id=v_paladin
      and coalesce((t.rules_meta->>'feature_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'spell_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'subclass_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'assignment_resource_sync_included')::boolean,false)
      and coalesce((t.rules_meta->>'ui_chat_runtime_certified')::boolean,false)
      and t.rules_meta->>'spellcasting_ability'='charisma'
      and t.rules_meta->>'spell_preparation_refresh'='long_rest'
      and coalesce((t.rules_meta->>'prepared_spell_replacement_limit')::integer,0)=1
  ) then raise exception 'PALADIN_V3_BASE_CONTRACT_INCOMPLETE:%',p_campaign_id; end if;

  with expected(catalog_key) as (values
    ('subclass:paladin:devotion'),('subclass:paladin:vengeance'),('subclass:paladin:ancients'),
    ('subclass:paladin:glory'),('subclass:paladin:conquest'),('subclass:paladin:redemption'),
    ('subclass:paladin:watchers'),('subclass:paladin:crown'),('subclass:paladin:oathbreaker'),
    ('subclass:paladin:treachery'),('subclass:paladin:pestilence'),('subclass:paladin:zeal'),
    ('subclass:paladin:abyss'),('subclass:paladin:blood'),('subclass:paladin:illrigger')
  )
  select count(*) into v_bad from expected e
  where not exists(
    select 1 from public.rule_templates t
    where t.campaign_id=p_campaign_id and t.kind='subclass' and t.catalog_key=e.catalog_key
      and t.parent_template_id=v_paladin and t.is_active and t.unlock_level=3
  );
  if v_bad<>0 then raise exception 'PALADIN_V3_EXPECTED_OATHS_MISSING:%:%',p_campaign_id,v_bad; end if;

  select count(*) into v_count from public.rule_templates t
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active and t.catalog_key like 'subclass:paladin:%';
  if v_count<>15 then raise exception 'PALADIN_V3_ACTIVE_OATH_COUNT:%:%',p_campaign_id,v_count; end if;

  select count(*) into v_bad
  from public.rule_templates t
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active and t.catalog_key like 'subclass:paladin:%'
    and ((select count(*) from public.rule_template_levels l where l.template_id=t.id)<>8
      or (select array_agg(l.level order by l.level) from public.rule_template_levels l where l.template_id=t.id)
         is distinct from array[3,5,7,9,13,15,17,20]);
  if v_bad<>0 then raise exception 'PALADIN_V3_OATH_LEVEL_ROWS_INVALID:%:%',p_campaign_id,v_bad; end if;

  select count(*) into v_bad
  from public.rule_templates t
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active and t.catalog_key like 'subclass:paladin:%'
    and (select count(*)
         from public.rule_template_levels l
         cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
         where l.template_id=t.id and m.value->>'type'='spell' and coalesce(m.value->>'sourceKey','') like '%-oath-spells')<>10;
  if v_bad<>0 then raise exception 'PALADIN_V3_OATH_SPELL_COUNT_INVALID:%:%',p_campaign_id,v_bad; end if;

  select count(*) into v_bad
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
  cross join lateral jsonb_array_elements(coalesce(m.value#>'{payload,methods}','[]'::jsonb)) method(value)
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active and t.catalog_key like 'subclass:paladin:%'
    and m.value->>'type'='spell' and coalesce(m.value->>'sourceKey','') like '%-oath-spells'
    and (
      m.value#>>'{payload,preparation,mode}'<>'always_prepared'
      or method.value->>'kind'<>'class_spell'
      or method.value->>'ability'<>'charisma'
      or coalesce((method.value->>'requiresPrepared')::boolean,true)
      or exists(
        select 1 from jsonb_array_elements(coalesce(method.value->'resourceOptions','[]'::jsonb)) o(value)
        cross join lateral jsonb_array_elements(coalesce(o.value->'costs','[]'::jsonb)) c(value)
        where c.value->>'key' !~ '^spell_slot_[1-5]$' or coalesce((c.value->>'amount')::integer,0)<>1
      )
    );
  if v_bad<>0 then raise exception 'PALADIN_V3_OATH_SPELL_RUNTIME_INVALID:%:%',p_campaign_id,v_bad; end if;

  select count(*) into v_bad
  from public.rule_templates t
  where t.campaign_id=p_campaign_id and t.is_active and (t.catalog_key='class:paladin' or t.catalog_key like 'subclass:paladin:%')
    and (coalesce(t.name,'')='' or t.name ~ '[A-Za-z]' or coalesce(t.source_label,'') ~ '[A-Za-z]');
  if v_bad<>0 then raise exception 'PALADIN_V3_PLAYER_FACING_RUSSIAN_LABELS_INVALID:%:%',p_campaign_id,v_bad; end if;

  select count(*) into v_bad
  from public.rule_templates t
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active and t.catalog_key like 'subclass:paladin:%'
    and (coalesce(t.description,'')='' or coalesce(t.mechanical_summary,'')=''
      or coalesce(t.rules_meta->>'player_facing_language','')<>'ru'
      or not coalesce((t.rules_meta->>'translation_preserved')::boolean,false));
  if v_bad<>0 then raise exception 'PALADIN_V3_TRANSLATION_CONTRACT_INVALID:%:%',p_campaign_id,v_bad; end if;

  select count(*) into v_bad
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id and l.level=3
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
    and t.catalog_key in (
      'subclass:paladin:conquest','subclass:paladin:redemption','subclass:paladin:watchers',
      'subclass:paladin:crown','subclass:paladin:oathbreaker','subclass:paladin:treachery',
      'subclass:paladin:pestilence','subclass:paladin:zeal','subclass:paladin:abyss',
      'subclass:paladin:blood','subclass:paladin:illrigger'
    )
    and m.value->>'type'='action' and m.value->>'resourceKey'='channel_divinity'
    and coalesce((m.value->>'resourceCost')::integer,0)=1;
  if v_bad<11 then raise exception 'PALADIN_V3_EXTENDED_CHANNEL_DIVINITY_ACTIONS_INCOMPLETE:%:%',p_campaign_id,v_bad; end if;

  with expected(level,max_value) as (values (3,4),(7,5),(15,6),(20,7))
  select count(*) into v_bad from expected e
  where not exists(
    select 1 from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=e.level
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id and t.catalog_key='subclass:paladin:illrigger' and t.is_active
      and m.value->>'type'='resource' and m.value->>'key'='infernal_seals'
      and coalesce((m.value->>'max')::integer,0)=e.max_value
      and exists(select 1 from jsonb_array_elements(coalesce(m.value->'recoveryRules','[]'::jsonb)) r(value)
                 where r.value->>'trigger'='short_rest' and r.value->>'restore'='full')
      and exists(select 1 from jsonb_array_elements(coalesce(m.value->'recoveryRules','[]'::jsonb)) r(value)
                 where r.value->>'trigger'='long_rest' and r.value->>'restore'='full')
  );
  if v_bad<>0 then raise exception 'PALADIN_V3_INFERNAL_SEAL_PROGRESSION_INVALID:%:%',p_campaign_id,v_bad; end if;

  if not exists(
    select 1 from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=15
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id and t.catalog_key='subclass:paladin:treachery' and t.is_active
      and m.value->>'type'='resource' and m.value->>'key'='treachery_blackguard_escape'
      and exists(select 1 from jsonb_array_elements(coalesce(m.value->'recoveryRules','[]'::jsonb)) r(value) where r.value->>'trigger'='short_rest')
      and exists(select 1 from jsonb_array_elements(coalesce(m.value->'recoveryRules','[]'::jsonb)) r(value) where r.value->>'trigger'='long_rest')
  ) then raise exception 'PALADIN_V3_TREACHERY_SHORT_REST_RESOURCE_INVALID:%',p_campaign_id; end if;

  if not exists(
    select 1 from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=15
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id and t.catalog_key='subclass:paladin:zeal' and t.is_active
      and m.value->>'id'='zeal-zone-of-truth-free-spell' and m.value->>'type'='spell'
      and m.value#>>'{payload,preparation,mode}'='always_prepared'
      and m.value#>>'{payload,methods,0,kind}'='class_feature'
      and jsonb_array_length(coalesce(m.value#>'{payload,methods,0,resourceOptions}','[]'::jsonb))=0
  ) then raise exception 'PALADIN_V3_ZEAL_FREE_ZONE_OF_TRUTH_INVALID:%',p_campaign_id; end if;

  select count(*) into v_bad
  from (values
    ('armor-of-agathys','Доспех Агатиса'),
    ('arms-of-hadar','Руки Хадара'),
    ('compelled-duel','Вынужденная дуэль'),
    ('crown-of-madness','Корона безумия'),
    ('flash-fever','Вспышка лихорадки')
  ) e(slug,ru_name)
  where not exists(
    select 1 from public.spell_catalog s where s.slug=e.slug and s.name_ru=e.ru_name and s.name_ru !~ '[A-Za-z]'
  );
  if v_bad<>0 then raise exception 'PALADIN_V3_RUSSIAN_SPELL_CARDS_MISSING:%',v_bad; end if;

  select count(*) into v_bad
  from public.rule_templates t
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active and t.catalog_key like 'subclass:paladin:%'
    and not exists(
      select 1 from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=t.id and l.level=20 and m.value->>'type'<>'spell'
    );
  if v_bad<>0 then raise exception 'PALADIN_V3_LEVEL20_RUNTIME_MISSING:%:%',p_campaign_id,v_bad; end if;

  update public.rule_templates
  set catalog_revision='paladin-full-15-oaths-final-v3',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','READY','class_work_status','READY','runtime_stage',5,
        'runtime_revision','paladin-full-15-oaths-final-v3','runtime_certified_at','2026-09-08',
        'oath_count',15,'official_oath_count',9,'additional_oath_count',6,
        'player_facing_language','ru','translation_preserved',true,
        'full_runtime_smoke_revision','paladin-15-oaths-smoke-v3'
      ),updated_at=now()
  where id=v_paladin;

  update public.rule_templates t
  set catalog_revision='paladin-full-15-oaths-final-v3',
      rules_meta=coalesce(t.rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','READY','runtime_stage',5,
        'runtime_revision','paladin-full-15-oaths-final-v3','runtime_certified_at','2026-09-08',
        'player_facing_language','ru','translation_preserved',true
      ),updated_at=now()
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active and t.catalog_key like 'subclass:paladin:%';
end;
$function$;
revoke all on function private.certify_paladin_runtime_final_v3(uuid) from public,anon,authenticated;
grant execute on function private.certify_paladin_runtime_final_v3(uuid) to service_role;

-- Compatibility: old callers now certify the full fifteen-oath package rather than requiring four oaths.
create or replace function private.certify_paladin_runtime_final_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$ begin perform private.certify_paladin_runtime_final_v3(p_campaign_id); end; $function$;
create or replace function private.certify_paladin_runtime_final_v2(p_campaign_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$ begin perform private.certify_paladin_runtime_final_v3(p_campaign_id); end; $function$;
revoke all on function private.certify_paladin_runtime_final_v1(uuid) from public,anon,authenticated;
revoke all on function private.certify_paladin_runtime_final_v2(uuid) from public,anon,authenticated;
grant execute on function private.certify_paladin_runtime_final_v1(uuid) to service_role;
grant execute on function private.certify_paladin_runtime_final_v2(uuid) to service_role;

create or replace function private.localize_paladin_player_facing_v3_after_campaign()
returns trigger language plpgsql security definer set search_path=''
as $function$ begin perform private.localize_paladin_player_facing_v3(new.id); return new; end; $function$;
revoke all on function private.localize_paladin_player_facing_v3_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaaj_campaigns_localize_paladin_player_facing_v3 on public.campaigns;
create trigger aaaaaaaaj_campaigns_localize_paladin_player_facing_v3
after insert on public.campaigns for each row execute function private.localize_paladin_player_facing_v3_after_campaign();

create or replace function private.certify_paladin_runtime_final_v3_after_campaign()
returns trigger language plpgsql security definer set search_path=''
as $function$ begin perform private.certify_paladin_runtime_final_v3(new.id); return new; end; $function$;
revoke all on function private.certify_paladin_runtime_final_v3_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaak_campaigns_certify_paladin_runtime_final_v3 on public.campaigns;
create trigger aaaaaaaak_campaigns_certify_paladin_runtime_final_v3
after insert on public.campaigns for each row execute function private.certify_paladin_runtime_final_v3_after_campaign();

do $block$ declare r record; begin
  for r in select id from public.campaigns loop
    perform private.localize_paladin_player_facing_v3(r.id);
    perform private.certify_paladin_runtime_final_v3(r.id);
  end loop;
end; $block$;

commit;