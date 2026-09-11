-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:bard
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/bardResourceRuntimeStage2.test.ts
-- CLASS_WORK_STATUS: bard:stage2_inspiration=READY,bard:mechanics=PENDING_STAGE3
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Stage 2 owns the persistent Bardic Inspiration ledger and actions only.
-- Bard spell preparation/slot creation remains Stage 3; Font of Inspiration
-- consumes any canonical shared spell-slot resource that already exists.
-- Initiative is not an authoritative app event yet, so Superior Inspiration is
-- a structured GM-confirmed free action rather than fake automatic turn state.

begin;

create or replace function private.ensure_bard_resource_runtime_stage2_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_bard uuid;
  v_mechanics jsonb;
  v_font_options jsonb := '[]'::jsonb;
  v_slot integer;
  v_bardic_max jsonb := jsonb_build_object(
    'kind','max',
    'values',jsonb_build_array(
      jsonb_build_object('kind','literal','value',1),
      jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
    )
  );
begin
  perform private.ensure_bard_catalog_stage1_v1(p_campaign_id);

  select id into v_bard
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:bard'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_bard is null then
    raise exception 'BARD_STAGE2_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  for v_slot in 1..9 loop
    v_font_options:=v_font_options||jsonb_build_array(jsonb_build_object(
      'key','slot-'||v_slot::text,
      'label','Ячейка '||v_slot::text||' уровня',
      'costs',jsonb_build_array(jsonb_build_object(
        'key','spell_slot_'||v_slot::text,
        'amount',1
      ))
    ));
  end loop;

  -- Level 1: canonical Inspiration pool, die value and resource-backed grant action.
  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels
  where template_id=v_bard and level=1;

  v_mechanics:=coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
    where value->>'sourceKey'<>'bardic-inspiration'
      and coalesce(value->>'id','') not in (
        'bard-inspiration-resource-l1',
        'bard-inspiration-die-l1',
        'bard-inspiration-grant-action-l1'
      )
  ),'[]'::jsonb);

  v_mechanics:=v_mechanics||jsonb_build_array(
    jsonb_build_object(
      'id','bard-bardic-inspiration-feature-l1',
      'type','grant',
      'sourceKey','bardic-inspiration',
      'target','feature',
      'key','class:bard:bardic-inspiration:l1',
      'payload',jsonb_build_object(
        'label','Вдохновение барда',
        'description','Бонусным действием выберите другое существо в пределах 60 футов, которое видит или слышит вас. Оно получает одну кость Вдохновения барда на 1 час; одновременно у существа может быть только одна такая кость. После провала D20-теста существо может бросить кость и прибавить результат, после чего кость расходуется. Число применений равно модификатору Харизмы, минимум 1; все потраченные применения возвращаются после долгого отдыха. Кость равна к6, становится к8 на 5-м, к10 на 10-м и к12 на 15-м уровне барда.'
      )
    ),
    jsonb_build_object(
      'id','bard-inspiration-resource-l1',
      'type','resource',
      'sourceKey','bardic-inspiration',
      'key','bardic_inspiration',
      'label','Вдохновение барда',
      'max',v_bardic_max,
      'recharge',jsonb_build_array('long_rest'),
      'initial','full',
      'presentation',jsonb_build_object(
        'icon','◆','tone','violet','display','pips','priority',90
      )
    ),
    jsonb_build_object(
      'id','bard-inspiration-die-l1',
      'type','grant',
      'sourceKey','bardic-inspiration',
      'target','value',
      'key','bardic_inspiration_die_sides',
      'grantOperation','REPLACE',
      'priority',1,
      'payload',jsonb_build_object('label','Кость Вдохновения барда','value',6)
    ),
    jsonb_build_object(
      'id','bard-inspiration-grant-action-l1',
      'type','action',
      'sourceKey','bardic-inspiration',
      'key','bardic_inspiration_grant',
      'label','Дать Вдохновение барда',
      'economy','bonus_action',
      'range',jsonb_build_object('kind','ranged','normal',60,'unit','feet'),
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','bardic_inspiration','amount',1
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic',
        'key','grant_bardic_inspiration_die',
        'payload',jsonb_build_object(
          'target','other_creature',
          'target_must_see_or_hear_bard',true,
          'duration_minutes',60,
          'one_die_per_creature',true,
          'use_after_failed_d20_test',true,
          'die_value_key','bardic_inspiration_die_sides',
          'target_state_persistence','gm_adjudicated'
        )
      )),
      'tags',jsonb_build_array(
        'class','bard','bardic-inspiration','target-effect-gm-adjudicated'
      ),
      'presentation',jsonb_build_object(
        'icon','◆','tone','violet','priority',90
      )
    )
  );

  update public.rule_template_levels
  set mechanics=v_mechanics
  where template_id=v_bard and level=1;

  -- Level 5: Font changes recharge to Short/Long Rest and can trade any real
  -- shared spell slot for one expended Inspiration use.
  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels
  where template_id=v_bard and level=5;

  v_mechanics:=coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
    where value->>'sourceKey'<>'font-of-inspiration'
      and coalesce(value->>'id','') not in (
        'bard-inspiration-resource-l5',
        'bard-inspiration-die-l5'
      )
  ),'[]'::jsonb);

  v_mechanics:=v_mechanics||jsonb_build_array(
    jsonb_build_object(
      'id','bard-font-of-inspiration-feature-l5',
      'type','grant',
      'sourceKey','font-of-inspiration',
      'target','feature',
      'key','class:bard:font-of-inspiration:l5',
      'payload',jsonb_build_object(
        'label','Источник вдохновения',
        'description','Все потраченные применения Вдохновения барда теперь возвращаются после короткого или долгого отдыха. Кроме того, вы можете без действия потратить одну ячейку заклинаний любого уровня, чтобы вернуть одно потраченное применение Вдохновения барда.'
      )
    ),
    jsonb_build_object(
      'id','bard-font-of-inspiration-action-l5',
      'type','action',
      'sourceKey','font-of-inspiration',
      'key','font_of_inspiration_restore',
      'label','Источник вдохновения: вернуть применение',
      'economy','special',
      'costOptions',v_font_options,
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','resource',
        'key','bardic_inspiration',
        'operation','RESTORE',
        'amount',1
      )),
      'tags',jsonb_build_array(
        'class','bard','font-of-inspiration','no-action','shared-spell-slot-ledger'
      ),
      'presentation',jsonb_build_object(
        'icon','✦','tone','violet','priority',89
      )
    ),
    jsonb_build_object(
      'id','bard-inspiration-resource-l5',
      'type','resource',
      'sourceKey','bardic-inspiration',
      'key','bardic_inspiration',
      'label','Вдохновение барда',
      'max',v_bardic_max,
      'recharge',jsonb_build_array('short_rest','long_rest'),
      'initial','full',
      'grantOperation','REPLACE',
      'priority',5,
      'presentation',jsonb_build_object(
        'icon','◆','tone','violet','display','pips','priority',90
      )
    ),
    jsonb_build_object(
      'id','bard-inspiration-die-l5',
      'type','grant',
      'sourceKey','bardic-inspiration',
      'target','value',
      'key','bardic_inspiration_die_sides',
      'grantOperation','REPLACE',
      'priority',5,
      'payload',jsonb_build_object('label','Кость Вдохновения барда','value',8)
    )
  );

  update public.rule_template_levels
  set mechanics=v_mechanics
  where template_id=v_bard and level=5;

  -- Higher-level die progression.
  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels
  where template_id=v_bard and level=10;

  v_mechanics:=coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
    where coalesce(value->>'id','')<>'bard-inspiration-die-l10'
  ),'[]'::jsonb)
  ||jsonb_build_array(jsonb_build_object(
    'id','bard-inspiration-die-l10',
    'type','grant',
    'sourceKey','bardic-inspiration',
    'target','value',
    'key','bardic_inspiration_die_sides',
    'grantOperation','REPLACE',
    'priority',10,
    'payload',jsonb_build_object('label','Кость Вдохновения барда','value',10)
  ));

  update public.rule_template_levels
  set mechanics=v_mechanics
  where template_id=v_bard and level=10;

  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels
  where template_id=v_bard and level=15;

  v_mechanics:=coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
    where coalesce(value->>'id','')<>'bard-inspiration-die-l15'
  ),'[]'::jsonb)
  ||jsonb_build_array(jsonb_build_object(
    'id','bard-inspiration-die-l15',
    'type','grant',
    'sourceKey','bardic-inspiration',
    'target','value',
    'key','bardic_inspiration_die_sides',
    'grantOperation','REPLACE',
    'priority',15,
    'payload',jsonb_build_object('label','Кость Вдохновения барда','value',12)
  ));

  update public.rule_template_levels
  set mechanics=v_mechanics
  where template_id=v_bard and level=15;

  -- Level 18: initiative is still a table/GM-confirmed event in the current
  -- engine, matching the existing Monk boundary. The action is structured and
  -- server-owned, but is not fired by fake initiative state.
  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels
  where template_id=v_bard and level=18;

  v_mechanics:=coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
    where value->>'sourceKey'<>'superior-inspiration'
  ),'[]'::jsonb);

  v_mechanics:=v_mechanics||jsonb_build_array(
    jsonb_build_object(
      'id','bard-superior-inspiration-feature-l18',
      'type','grant',
      'sourceKey','superior-inspiration',
      'target','feature',
      'key','class:bard:superior-inspiration:l18',
      'payload',jsonb_build_object(
        'label','Превосходное вдохновение',
        'description','Когда вы бросаете инициативу и у вас меньше двух доступных применений Вдохновения барда, вы возвращаете потраченные применения, пока доступных применений не станет два. Текущее приложение не владеет событием инициативы, поэтому применение подтверждается за столом.'
      )
    ),
    jsonb_build_object(
      'id','bard-superior-inspiration-action-l18',
      'type','action',
      'sourceKey','superior-inspiration',
      'key','superior_inspiration',
      'label','Превосходное вдохновение',
      'economy','free',
      'range',jsonb_build_object('kind','self'),
      'requirements',jsonb_build_array(
        jsonb_build_object(
          'kind','resource',
          'key','bardic_inspiration',
          'minimum',0,
          'maximum',1,
          'enforcement','engine',
          'label','Доступно только если применений Вдохновения барда меньше двух'
        )
      ),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','resource',
        'key','bardic_inspiration',
        'operation','SET',
        'amount',2
      )),
      'tags',jsonb_build_array(
        'class','bard','initiative-trigger','gm-confirmed'
      ),
      'presentation',jsonb_build_object(
        'icon','◆','tone','violet','priority',91
      )
    )
  );

  update public.rule_template_levels
  set mechanics=v_mechanics
  where template_id=v_bard and level=18;

  update public.rule_templates
  set catalog_revision='xphb-2024-bard-stage2-inspiration-v1',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','IN_PROGRESS_STAGE2_INSPIRATION_READY',
        'runtime_stage',2,
        'runtime_revision','xphb-2024-bard-stage2-inspiration-v1',
        'resource_runtime_included',true,
        'bardic_inspiration_runtime',true,
        'bardic_inspiration_die_value_key','bardic_inspiration_die_sides',
        'font_of_inspiration_runtime',true,
        'font_of_inspiration_shared_spell_slot_ledger',true,
        'superior_inspiration_runtime','structured_gm_confirmed',
        'superior_inspiration_automatic_initiative_hook',false,
        'spell_runtime_included',false,
        'subclass_runtime_included',false,
        'sheet_profile_deferred',true,
        'next_stage','bard_spell_runtime',
        'resource_contracts',jsonb_build_object(
          'bardic_inspiration',jsonb_build_object(
            'unlocks_at',1,
            'max',v_bardic_max,
            'die_by_level',jsonb_build_object('1',6,'5',8,'10',10,'15',12),
            'recharge_levels_1_4',jsonb_build_array('long_rest'),
            'recharge_from_level_5',jsonb_build_array('short_rest','long_rest'),
            'runtime_status','active'
          )
        )
      ),
      updated_at=now()
  where id=v_bard;
end;
$function$;

revoke all on function private.ensure_bard_resource_runtime_stage2_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_bard_resource_runtime_stage2_v1(uuid) to service_role;

create or replace function private.sync_bard_character_resource_states_stage2_v1(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_bard_template_id uuid;
  v_bard_level integer;
  v_resource record;
  v_max_numeric numeric;
  v_max integer;
  v_recharge jsonb;
  v_actor uuid:=auth.uid();
begin
  select t.id,greatest(1,coalesce(a.template_level,1))
  into v_bard_template_id,v_bard_level
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id
    and t.kind='class'
    and t.catalog_key='class:bard'
  order by a.assigned_at,a.id
  limit 1;

  if v_bard_template_id is null then
    delete from public.character_resource_states
    where character_id=p_character_id
      and state_key='bardic_inspiration';
    return;
  end if;

  for v_resource in
    select distinct on (m.value->>'key')
      m.value->>'key' as state_key,
      m.value as mechanic,
      l.level as unlock_level
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_bard_template_id
      and l.level<=v_bard_level
      and m.value->>'type'='resource'
      and m.value->>'key'='bardic_inspiration'
    order by m.value->>'key',
             l.level desc,
             coalesce((m.value->>'priority')::integer,0) desc
  loop
    if jsonb_typeof(v_resource.mechanic->'max')='number' then
      v_max_numeric:=(v_resource.mechanic->>'max')::numeric;
    else
      v_max_numeric:=private.evaluate_character_template_numeric_expression(
        p_character_id,
        v_resource.mechanic->'max'
      );
    end if;

    if v_max_numeric is null
       or v_max_numeric<0
       or trunc(v_max_numeric)<>v_max_numeric
       or v_max_numeric>100000
    then
      raise exception 'BARD_STAGE2_RESOURCE_MAX_INVALID:%:%',
        v_resource.state_key,v_max_numeric;
    end if;
    v_max:=v_max_numeric::integer;

    v_recharge:=jsonb_build_object(
      'triggers',coalesce(v_resource.mechanic->'recharge','[]'::jsonb),
      'restore',coalesce(nullif(v_resource.mechanic->>'restore',''),'full')
    );
    if not private.ce_persistent_recharge_valid(v_recharge) then
      raise exception 'BARD_STAGE2_RESOURCE_RECHARGE_INVALID:%:%',
        v_resource.state_key,v_recharge;
    end if;

    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,updated_by
    ) values(
      p_character_id,
      v_resource.state_key,
      v_max,
      v_max,
      left(coalesce(nullif(v_resource.mechanic->>'label',''),v_resource.state_key),160),
      v_recharge,
      v_actor
    )
    on conflict(character_id,state_key) do update set
      current=greatest(
        0,
        excluded.max_snapshot
          - greatest(
              0,
              public.character_resource_states.max_snapshot
                - public.character_resource_states.current
            )
      ),
      max_snapshot=excluded.max_snapshot,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=v_actor,
      updated_at=now();
  end loop;

  delete from public.character_resource_states s
  where s.character_id=p_character_id
    and s.state_key='bardic_inspiration'
    and not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=v_bard_template_id
        and l.level<=v_bard_level
        and m.value->>'type'='resource'
        and m.value->>'key'=s.state_key
    );
end;
$function$;

revoke all on function private.sync_bard_character_resource_states_stage2_v1(uuid) from public,anon,authenticated;
grant execute on function private.sync_bard_character_resource_states_stage2_v1(uuid) to service_role;

create or replace function private.sync_bard_character_resource_states_stage2_v1_after_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.sync_bard_character_resource_states_stage2_v1(
    coalesce(new.character_id,old.character_id)
  );
  return coalesce(new,old);
end;
$function$;

revoke all on function private.sync_bard_character_resource_states_stage2_v1_after_assignment() from public,anon,authenticated;

drop trigger if exists character_template_assignments_sync_bard_resources_stage2_v1
on public.character_template_assignments;

create trigger character_template_assignments_sync_bard_resources_stage2_v1
after insert or update of template_id,template_level,selected_choices or delete
on public.character_template_assignments
for each row execute function private.sync_bard_character_resource_states_stage2_v1_after_assignment();

create or replace function private.sync_bard_character_resource_states_stage2_v1_after_sheet()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.sync_bard_character_resource_states_stage2_v1(new.character_id);
  return new;
end;
$function$;

revoke all on function private.sync_bard_character_resource_states_stage2_v1_after_sheet() from public,anon,authenticated;

drop trigger if exists character_sheets_sync_bard_resources_stage2_v1
on public.character_sheets;

create trigger character_sheets_sync_bard_resources_stage2_v1
after insert or update of charisma
on public.character_sheets
for each row execute function private.sync_bard_character_resource_states_stage2_v1_after_sheet();

create or replace function private.ensure_bard_resource_runtime_stage2_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_bard_resource_runtime_stage2_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_bard_resource_runtime_stage2_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaaf_campaigns_ensure_bard_catalog_stage1_v1 on public.campaigns;
drop trigger if exists aaaaaaaag_campaigns_ensure_bard_resource_runtime_stage2_v1 on public.campaigns;

create trigger aaaaaaaag_campaigns_ensure_bard_resource_runtime_stage2_v1
after insert on public.campaigns
for each row execute function private.ensure_bard_resource_runtime_stage2_v1_after_campaign();

do $block$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_bard_resource_runtime_stage2_v1(r.id);
  end loop;

  for r in
    select distinct a.character_id
    from public.character_template_assignments a
    join public.rule_templates t on t.id=a.template_id
    where t.kind='class'
      and t.catalog_key='class:bard'
      and t.is_active
  loop
    perform private.sync_bard_character_resource_states_stage2_v1(r.character_id);
  end loop;
end;
$block$;

commit;
