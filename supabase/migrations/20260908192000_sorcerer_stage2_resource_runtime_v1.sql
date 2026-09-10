-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/sorcererResourceRuntimeStage2.test.ts
-- CLASS_WORK_STATUS: sorcerer:stage2_resource=READY
--
-- Stage 2: persistent Sorcerer resource accounting only. Font of Magic slot
-- conversion and Metamagic execution remain outside this migration.

begin;

create or replace function private.ensure_sorcerer_resource_runtime_stage2_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sorcerer uuid;
  v_mechanics jsonb;
  v_level integer;
  v_restore integer;
begin
  perform private.ensure_sorcerer_catalog_stage1_v2(p_campaign_id);

  select id into v_sorcerer
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:sorcerer'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_sorcerer is null then
    raise exception 'SORCERER_STAGE2_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  -- Level 1: Innate Sorcery gets a real persistent use pool and a spendable action.
  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels where template_id=v_sorcerer and level=1;

  v_mechanics := coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
    where value->>'sourceKey'<>'innate-sorcery'
  ),'[]'::jsonb);

  v_mechanics := v_mechanics || jsonb_build_array(
    jsonb_build_object(
      'id','sorcerer-innate-sorcery-feature-l1','type','grant','sourceKey','innate-sorcery',
      'target','feature','key','class:sorcerer:innate-sorcery:l1',
      'payload',jsonb_build_object(
        'label','Врождённое чародейство',
        'description','Бонусным действием вы высвобождаете врождённую магию на 1 минуту. Пока эффект действует, Сл спасброска ваших заклинаний чародея увеличивается на 1, а броски атаки заклинаниями чародея совершаются с преимуществом. Использований: 2; все потраченные использования восстанавливаются после долгого отдыха.'
      )
    ),
    jsonb_build_object(
      'id','sorcerer-innate-sorcery-resource','type','resource','sourceKey','innate-sorcery',
      'key','innate_sorcery','label','Врождённое чародейство','max',2,
      'recharge',jsonb_build_array('long_rest'),'initial','full'
    ),
    jsonb_build_object(
      'id','sorcerer-innate-sorcery-action','type','action','sourceKey','innate-sorcery',
      'key','innate_sorcery','label','Врождённое чародейство','economy','bonus_action',
      'resourceCosts',jsonb_build_array(jsonb_build_object('key','innate_sorcery','amount',1)),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic','key','activate_innate_sorcery',
        'payload',jsonb_build_object('duration_minutes',1,'sorcerer_spell_save_dc_bonus',1,'sorcerer_spell_attack_advantage',true)
      )),
      'tags',jsonb_build_array('class','sorcerer')
    )
  );

  update public.rule_template_levels set mechanics=v_mechanics
  where template_id=v_sorcerer and level=1;

  -- Level 2: Sorcery Points are one CE resource whose maximum follows Sorcerer level.
  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels where template_id=v_sorcerer and level=2;

  v_mechanics := coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
    where value->>'sourceKey'<>'font-of-magic'
      and not (value->>'type'='resource' and value->>'key'='sorcery_points')
  ),'[]'::jsonb);

  v_mechanics := v_mechanics || jsonb_build_array(
    jsonb_build_object(
      'id','sorcerer-font-of-magic-feature-l2','type','grant','sourceKey','font-of-magic',
      'target','feature','key','class:sorcerer:font-of-magic:l2',
      'payload',jsonb_build_object(
        'label','Источник магии',
        'description','Со 2 уровня у вас есть Очки чародейства. Максимум очков равен вашему уровню чародея, и все потраченные Очки чародейства восстанавливаются после долгого отдыха. Способы расходования этого запаса определяются отдельными способностями класса.'
      )
    ),
    jsonb_build_object(
      'id','sorcerer-sorcery-points-resource','type','resource','sourceKey','font-of-magic',
      'key','sorcery_points','label','Очки чародейства',
      'max',jsonb_build_object('kind','reference','key','source.level'),
      'recharge',jsonb_build_array('long_rest'),'initial','full'
    )
  );

  update public.rule_template_levels set mechanics=v_mechanics
  where template_id=v_sorcerer and level=2;

  -- Level 5: one Short Rest restoration opportunity per Long Rest.
  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels where template_id=v_sorcerer and level=5;

  v_mechanics := coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
    where value->>'sourceKey'<>'sorcerous-restoration'
  ),'[]'::jsonb);

  v_mechanics := v_mechanics || jsonb_build_array(
    jsonb_build_object(
      'id','sorcerer-restoration-feature-l5','type','grant','sourceKey','sorcerous-restoration',
      'target','feature','key','class:sorcerer:sorcerous-restoration:l5',
      'payload',jsonb_build_object(
        'label','Чародейское восстановление',
        'description','Когда вы заканчиваете короткий отдых, вы можете восстановить потраченные Очки чародейства в количестве не больше половины вашего уровня чародея с округлением вниз. После такого восстановления способность нельзя использовать снова до окончания долгого отдыха.'
      )
    ),
    jsonb_build_object(
      'id','sorcerer-restoration-use-resource','type','resource','sourceKey','sorcerous-restoration',
      'key','sorcerous_restoration','label','Чародейское восстановление','max',1,
      'recharge',jsonb_build_array('long_rest'),'initial','full'
    ),
    jsonb_build_object(
      'id','sorcerer-restoration-amount-l5','type','grant','sourceKey','sorcerous-restoration',
      'target','value','key','sorcerous_restoration_amount','grantOperation','REPLACE','priority',5,
      'payload',jsonb_build_object('label','Возврат Очков чародейства','value',2)
    ),
    jsonb_build_object(
      'id','sorcerer-restoration-action','type','action','sourceKey','sorcerous-restoration',
      'key','sorcerous_restoration','label','Чародейское восстановление','economy','special',
      'resourceCosts',jsonb_build_array(jsonb_build_object('key','sorcerous_restoration','amount',1)),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','resource','key','sorcery_points','operation','RESTORE',
        'amount',jsonb_build_object('kind','reference','key','values.sorcerous_restoration_amount')
      )),
      'tags',jsonb_build_array('class','sorcerer','short_rest')
    )
  );

  update public.rule_template_levels set mechanics=v_mechanics
  where template_id=v_sorcerer and level=5;

  -- Restoration amount grows with class level; priority selects the latest value.
  for v_level,v_restore in
    select * from (values
      (7,3),(9,4),(11,5),(13,6),(15,7),(17,8),(19,9),(20,10)
    ) as progression(level,amount)
  loop
    select coalesce(mechanics,'[]'::jsonb) into v_mechanics
    from public.rule_template_levels where template_id=v_sorcerer and level=v_level;

    v_mechanics := coalesce((
      select jsonb_agg(value order by ordinality)
      from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
      where value->>'id'<>('sorcerer-restoration-amount-l' || v_level::text)
    ),'[]'::jsonb);

    v_mechanics := v_mechanics || jsonb_build_array(jsonb_build_object(
      'id','sorcerer-restoration-amount-l' || v_level::text,
      'type','grant','sourceKey','sorcerous-restoration','target','value',
      'key','sorcerous_restoration_amount','grantOperation','REPLACE','priority',v_level,
      'payload',jsonb_build_object('label','Возврат Очков чародейства','value',v_restore)
    ));

    update public.rule_template_levels set mechanics=v_mechanics
    where template_id=v_sorcerer and level=v_level;
  end loop;

  update public.rule_templates
  set catalog_revision='xphb-2024-sorcerer-stage2-resource-v1',
      rules_meta=coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
        'mechanics_status','IN_PROGRESS_STAGE2_RESOURCE_READY',
        'runtime_stage',2,
        'runtime_revision','xphb-2024-sorcerer-stage2-resource-v1',
        'resource_runtime_included',true,
        'innate_sorcery_resource_runtime',true,
        'sorcery_points_runtime',true,
        'sorcerous_restoration_runtime',true,
        'font_of_magic_conversion_runtime',false,
        'metamagic_runtime_included',false,
        'spell_runtime_included',false,
        'subclass_runtime_included',false,
        'resource_contracts',jsonb_build_object(
          'innate_sorcery',jsonb_build_object('unlocks_at',1,'max',2,'recharge',jsonb_build_array('long_rest'),'runtime_status','active'),
          'sorcery_points',jsonb_build_object('unlocks_at',2,'max',jsonb_build_object('kind','reference','key','source.level'),'recharge',jsonb_build_array('long_rest'),'runtime_status','active'),
          'sorcerous_restoration',jsonb_build_object('unlocks_at',5,'max',1,'recharge',jsonb_build_array('long_rest'),'runtime_status','active')
        )
      ),
      updated_at=now()
  where id=v_sorcerer;
end;
$function$;

revoke all on function private.ensure_sorcerer_resource_runtime_stage2_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_sorcerer_resource_runtime_stage2_v1(uuid) to service_role;

create or replace function private.sync_sorcerer_character_resource_states_stage2_v1(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_campaign_id uuid;
  v_sorcerer_template_id uuid;
  v_sorcerer_level integer;
  v_resource record;
  v_max_numeric numeric;
  v_max integer;
  v_recharge jsonb;
  v_actor uuid := auth.uid();
begin
  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null then return; end if;

  select t.id,greatest(1,coalesce(a.template_level,1))
  into v_sorcerer_template_id,v_sorcerer_level
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id and t.kind='class' and t.catalog_key='class:sorcerer'
  order by a.assigned_at,a.id limit 1;

  if v_sorcerer_template_id is null then
    delete from public.character_resource_states
    where character_id=p_character_id
      and state_key in ('innate_sorcery','sorcery_points','sorcerous_restoration');
    return;
  end if;

  for v_resource in
    select distinct on (m.value->>'key')
      m.value->>'key' state_key,m.value mechanic,l.level unlock_level
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_sorcerer_template_id
      and l.level<=v_sorcerer_level
      and m.value->>'type'='resource'
      and nullif(m.value->>'key','') is not null
    order by m.value->>'key',l.level desc,coalesce((m.value->>'priority')::integer,0) desc
  loop
    if v_resource.state_key='sorcery_points' then
      v_max_numeric:=v_sorcerer_level;
    elsif jsonb_typeof(v_resource.mechanic->'max')='number' then
      v_max_numeric:=(v_resource.mechanic->>'max')::numeric;
    else
      v_max_numeric:=private.evaluate_character_template_numeric_expression(p_character_id,v_resource.mechanic->'max');
    end if;

    if v_max_numeric is null or v_max_numeric<0 or trunc(v_max_numeric)<>v_max_numeric or v_max_numeric>100000 then
      raise exception 'SORCERER_STAGE2_RESOURCE_MAX_INVALID:%:%',v_resource.state_key,v_max_numeric;
    end if;
    v_max:=v_max_numeric::integer;

    v_recharge:=jsonb_build_object(
      'triggers',coalesce(v_resource.mechanic->'recharge','[]'::jsonb),
      'restore',coalesce(nullif(v_resource.mechanic->>'restore',''),'full')
    );
    if not private.ce_persistent_recharge_valid(v_recharge) then
      raise exception 'SORCERER_STAGE2_RESOURCE_RECHARGE_INVALID:%:%',v_resource.state_key,v_recharge;
    end if;

    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,updated_by
    ) values(
      p_character_id,v_resource.state_key,v_max,v_max,
      left(coalesce(nullif(v_resource.mechanic->>'label',''),v_resource.state_key),160),v_recharge,v_actor
    )
    on conflict(character_id,state_key) do update set
      current=greatest(0,excluded.max_snapshot-greatest(0,public.character_resource_states.max_snapshot-public.character_resource_states.current)),
      max_snapshot=excluded.max_snapshot,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=v_actor,
      updated_at=now();
  end loop;

  delete from public.character_resource_states s
  where s.character_id=p_character_id
    and s.state_key in ('innate_sorcery','sorcery_points','sorcerous_restoration')
    and not exists (
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=v_sorcerer_template_id
        and l.level<=v_sorcerer_level
        and m.value->>'type'='resource'
        and m.value->>'key'=s.state_key
    );
end;
$function$;

revoke all on function private.sync_sorcerer_character_resource_states_stage2_v1(uuid) from public,anon,authenticated;
grant execute on function private.sync_sorcerer_character_resource_states_stage2_v1(uuid) to service_role;

create or replace function private.sync_sorcerer_character_resource_states_stage2_v1_after_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.sync_sorcerer_character_resource_states_stage2_v1(coalesce(new.character_id,old.character_id));
  return coalesce(new,old);
end;
$function$;

revoke all on function private.sync_sorcerer_character_resource_states_stage2_v1_after_assignment() from public,anon,authenticated;

drop trigger if exists character_template_assignments_sync_sorcerer_resources_stage2_v1 on public.character_template_assignments;
create trigger character_template_assignments_sync_sorcerer_resources_stage2_v1
after insert or update of template_id,template_level,selected_choices or delete
on public.character_template_assignments
for each row execute function private.sync_sorcerer_character_resource_states_stage2_v1_after_assignment();

create or replace function private.ensure_sorcerer_resource_runtime_stage2_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_sorcerer_resource_runtime_stage2_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_sorcerer_resource_runtime_stage2_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaad_campaigns_ensure_sorcerer_catalog_stage1_v2 on public.campaigns;
drop trigger if exists aaaaaaaae_campaigns_ensure_sorcerer_resource_runtime_stage2_v1 on public.campaigns;
create trigger aaaaaaaae_campaigns_ensure_sorcerer_resource_runtime_stage2_v1
after insert on public.campaigns
for each row execute function private.ensure_sorcerer_resource_runtime_stage2_v1_after_campaign();

do $block$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_sorcerer_resource_runtime_stage2_v1(r.id);
  end loop;

  for r in
    select distinct a.character_id
    from public.character_template_assignments a
    join public.rule_templates t on t.id=a.template_id
    where t.kind='class' and t.catalog_key='class:sorcerer' and t.is_active
  loop
    perform private.sync_sorcerer_character_resource_states_stage2_v1(r.character_id);
  end loop;
end;
$block$;

commit;
