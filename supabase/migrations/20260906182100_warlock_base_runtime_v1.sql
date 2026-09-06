-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:warlock
-- CLASS_PACKAGE_TEST: tests/warlockOfficialPack.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: warlock:base=RUNTIME_READY;invocations=PENDING;subclasses=UNCHANGED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Warlock 2024 base runtime. Eldritch Invocation acquisition/effects and all
-- subclasses are deliberately excluded. CE owns finite Pact Magic slots,
-- Magical Cunning, Contact Patron and four independent Mystic Arcanum uses.

begin;

create or replace function private.warlock_feature(
  p_id text,p_source_key text,p_key text,p_label text,p_description text,p_mechanic jsonb default '{}'::jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_id,'type','grant','target','feature','key',p_key,'sourceKey',p_source_key,'payload',jsonb_build_object('label',p_label,'description',p_description,'mechanic',coalesce(p_mechanic,'{}'::jsonb)));
$$;

create or replace function private.warlock_resource(
  p_id text,p_source_key text,p_key text,p_label text,p_max integer,p_recharge jsonb,p_priority integer default 0
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_id,'type','grant','target','resource','key',p_key,'sourceKey',p_source_key,'grantOperation','REPLACE','priority',p_priority,'payload',jsonb_build_object('max',p_max,'label',p_label,'initial','full','recharge',p_recharge));
$$;

create or replace function private.warlock_value(
  p_id text,p_source_key text,p_key text,p_label text,p_value integer,p_priority integer default 0
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_id,'type','grant','target','value','key',p_key,'sourceKey',p_source_key,'grantOperation','REPLACE','priority',p_priority,'payload',jsonb_build_object('label',p_label,'value',p_value));
$$;

create or replace function private.warlock_action(
  p_id text,p_source_key text,p_key text,p_label text,p_economy text,p_costs jsonb,p_effects jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_id,'type','action','sourceKey',p_source_key,'key',p_key,'label',p_label,'economy',p_economy,'range',jsonb_build_object('kind','self'),'resourceCosts',coalesce(p_costs,'[]'::jsonb),'effects',coalesce(p_effects,'[]'::jsonb),'tags',jsonb_build_array('warlock'),'presentation',jsonb_build_object('tone','violet','icon','✦','display','counter','priority',90));
$$;

create or replace function private.warlock_set_level(p_template_id uuid,p_level integer,p_mechanics jsonb,p_choices jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_old_m jsonb:='[]'::jsonb;
  v_old_c jsonb:='[]'::jsonb;
  v_keep_m jsonb:='[]'::jsonb;
  v_keep_c jsonb:='[]'::jsonb;
begin
  select coalesce(mechanics,'[]'::jsonb),coalesce(choices,'[]'::jsonb) into v_old_m,v_old_c
  from public.rule_template_levels where template_id=p_template_id and level=p_level;
  if not found then
    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(p_template_id,p_level,coalesce(p_mechanics,'[]'::jsonb),coalesce(p_choices,'[]'::jsonb));
    return;
  end if;
  select coalesce(jsonb_agg(e.value),'[]'::jsonb) into v_keep_m
  from jsonb_array_elements(v_old_m) e(value) where coalesce(e.value->>'sourceKey','') not like 'warlock-base:%';
  select coalesce(jsonb_agg(e.value),'[]'::jsonb) into v_keep_c
  from jsonb_array_elements(v_old_c) e(value) where coalesce(e.value->>'key','') not like 'warlock_mystic_arcanum_%';
  update public.rule_template_levels
  set mechanics=v_keep_m||coalesce(p_mechanics,'[]'::jsonb),choices=v_keep_c||coalesce(p_choices,'[]'::jsonb)
  where template_id=p_template_id and level=p_level;
end;
$$;

create or replace function private.apply_warlock_base_runtime_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_warlock uuid;
  v_level integer;
  v_slots integer;
  v_slot_level integer;
  v_cantrips integer;
  v_prepared integer;
  v_cunning_restore integer;
  v_spell_level integer;
  v_key text;
  v_m jsonb;
  v_c jsonb;
  v_pact_recharge jsonb:='{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb;
  v_long_recharge jsonb:='{"triggers":["long_rest"],"restore":"full"}'::jsonb;
begin
  perform private.ensure_warlock_catalog_v1(p_campaign_id);
  select id into v_warlock from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:warlock' and is_active
  order by version desc,created_at desc limit 1;
  if v_warlock is null then return; end if;

  update public.rule_templates set
    catalog_revision='xphb-2024-warlock-base-runtime-v1',
    mechanical_summary='Колдун 2024: отдельные ячейки Магии договора восстанавливаются после короткого или долгого отдыха; Магическая хитрость, Связь с покровителем и Таинственные арканумы используют CE-ресурсы.',
    rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
      'warlock_base_runtime',true,'runtime_revision','xphb-2024-warlock-base-runtime-v1','mechanics_status','BASE_RUNTIME_READY',
      'spell_progression','pact_magic','spellcasting_ability','charisma','pact_magic_resource','warlock_pact_slots',
      'mystic_arcanum_runtime',true,'invocation_runtime_included',false,'subclass_runtime_included',false,'source_book','XPHB','rules_revision','2024'
    ),updated_at=now()
  where id=v_warlock;

  for v_level in 1..20 loop
    v_slots:=case when v_level=1 then 1 when v_level<=10 then 2 when v_level<=16 then 3 else 4 end;
    v_slot_level:=case when v_level<=2 then 1 when v_level<=4 then 2 when v_level<=6 then 3 when v_level<=8 then 4 else 5 end;
    v_cantrips:=case when v_level<=3 then 2 when v_level<=9 then 3 else 4 end;
    v_prepared:=case v_level
      when 1 then 2 when 2 then 3 when 3 then 4 when 4 then 5 when 5 then 6 when 6 then 7 when 7 then 8 when 8 then 9
      when 9 then 10 when 10 then 10 when 11 then 11 when 12 then 11 when 13 then 12 when 14 then 12 when 15 then 13
      when 16 then 13 when 17 then 14 when 18 then 14 when 19 then 15 else 15 end;
    v_cunning_restore:=case when v_level>=20 then v_slots else ((v_slots+1)/2) end;

    v_m:=jsonb_build_array(
      private.warlock_resource('warlock-base-pact-slots-l'||v_level,'warlock-base:pact-magic','warlock_pact_slots','Ячейки Магии договора',v_slots,v_pact_recharge,v_level),
      private.warlock_value('warlock-base-pact-slot-level-l'||v_level,'warlock-base:pact-magic','warlock_pact_slot_level','Уровень ячейки Магии договора',v_slot_level,v_level),
      private.warlock_value('warlock-base-cantrips-l'||v_level,'warlock-base:pact-magic','warlock_cantrip_count','Кантрипы колдуна',v_cantrips,v_level),
      private.warlock_value('warlock-base-prepared-l'||v_level,'warlock-base:pact-magic','warlock_prepared_spell_limit','Подготовленные заклинания колдуна',v_prepared,v_level)
    );
    v_c:='[]'::jsonb;

    if v_level>=2 then
      v_m:=v_m||jsonb_build_array(private.warlock_value('warlock-base-cunning-restore-l'||v_level,'warlock-base:magical-cunning','warlock_magical_cunning_restore','Ячейки, возвращаемые Магической хитростью',v_cunning_restore,v_level));
    end if;

    if v_level=1 then
      v_m:=v_m||jsonb_build_array(private.warlock_feature('warlock-base-pact-magic-rules','warlock-base:pact-magic','pact_magic','Магия договора','Харизма — характеристика заклинаний. Все ячейки Магии договора одного уровня; заклинание 1–5 уровня тратит одну ячейку и сотворяется текущим уровнем ячейки колдуна. Потраченные ячейки восстанавливаются после короткого или долгого отдыха.',jsonb_build_object('ability','charisma','resource_key','warlock_pact_slots','slot_level_value','warlock_pact_slot_level','prepared_limit_value','warlock_prepared_spell_limit','cantrip_count_value','warlock_cantrip_count')));
    end if;

    if v_level=2 then
      v_m:=v_m||jsonb_build_array(
        private.warlock_resource('warlock-base-magical-cunning-use','warlock-base:magical-cunning','warlock_magical_cunning','Магическая хитрость',1,v_long_recharge,2),
        private.warlock_feature('warlock-base-magical-cunning-rules','warlock-base:magical-cunning','magical_cunning','Магическая хитрость','После 1 минуты сосредоточения восстанавливается половина максимума ячеек Магии договора с округлением вверх, минимум 1. Использование восстанавливается после долгого отдыха.',jsonb_build_object('activation','1_minute_ritual','restore_value','warlock_magical_cunning_restore')),
        private.warlock_action('warlock-base-magical-cunning-action','warlock-base:magical-cunning','warlock_magical_cunning','Магическая хитрость','1_minute_ritual',jsonb_build_array(jsonb_build_object('key','warlock_magical_cunning','amount',1)),jsonb_build_array(jsonb_build_object('kind','resource','key','warlock_pact_slots','operation','RESTORE','amount',jsonb_build_object('kind','reference','key','values.warlock_magical_cunning_restore'))))
      );
    end if;

    if v_level=9 then
      v_m:=v_m||jsonb_build_array(
        private.warlock_resource('warlock-base-contact-patron-use','warlock-base:contact-patron','warlock_contact_patron','Связь с покровителем',1,v_long_recharge,9),
        private.warlock_feature('warlock-base-contact-patron-rules','warlock-base:contact-patron','contact_patron','Связь с покровителем','«Контакт с иным планом» всегда подготовлен. Один раз между долгими отдыхами его можно сотворить без ячейки для связи с покровителем; спасбросок Интеллекта автоматически успешен.',jsonb_build_object('spell_slug','contact-other-plane','always_prepared',true,'automatic_intelligence_save_success',true)),
        private.warlock_action('warlock-base-contact-patron-action','warlock-base:contact-patron','warlock_contact_patron','Связь с покровителем','magic_action',jsonb_build_array(jsonb_build_object('key','warlock_contact_patron','amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','cast_spell','payload',jsonb_build_object('spell_slug','contact-other-plane','slot_cost',0,'automatic_intelligence_save_success',true))))
      );
    end if;

    if v_level in (11,13,15,17) then
      v_spell_level:=case v_level when 11 then 6 when 13 then 7 when 15 then 8 else 9 end;
      v_key:='warlock_mystic_arcanum_'||v_spell_level;
      v_m:=v_m||jsonb_build_array(
        private.warlock_resource('warlock-base-arcanum-'||v_spell_level||'-use','warlock-base:mystic-arcanum-'||v_spell_level,v_key,'Таинственный арканум '||v_spell_level||' уровня',1,v_long_recharge,v_level),
        private.warlock_feature('warlock-base-arcanum-'||v_spell_level||'-rules','warlock-base:mystic-arcanum-'||v_spell_level,'mystic_arcanum_'||v_spell_level,'Таинственный арканум ('||v_spell_level||' уровень)','Выберите одно заклинание колдуна соответствующего уровня. Оно всегда подготовлено, сотворяется один раз без ячейки и восстанавливается после долгого отдыха. При получении уровня колдуна выбор можно заменить заклинанием того же уровня.',jsonb_build_object('spell_level',v_spell_level,'resource_key',v_key,'replacement','on_warlock_level_gain')),
        private.warlock_action('warlock-base-arcanum-'||v_spell_level||'-action','warlock-base:mystic-arcanum-'||v_spell_level,'warlock_mystic_arcanum_'||v_spell_level||'_cast','Таинственный арканум '||v_spell_level,'magic_action',jsonb_build_array(jsonb_build_object('key',v_key,'amount',1)),jsonb_build_array(jsonb_build_object('kind','semantic','key','cast_selected_spell','payload',jsonb_build_object('choice_key',v_key,'spell_level',v_spell_level,'slot_cost',0))))
      );
      v_c:=jsonb_build_array(jsonb_build_object(
        'key',v_key,'label','Таинственный арканум: заклинание '||v_spell_level||' уровня','target','trait','count',1,
        'options',jsonb_build_array('spell'),'option_labels',jsonb_build_object('spell','Выбрать заклинание колдуна '||v_spell_level||' уровня'),
        'selection_mode','player_once','replacement_policy','on_level_change',
        'option_rules',jsonb_build_object('spell',jsonb_build_object('selector',jsonb_build_object('key','warlock_spell_level_'||v_spell_level)))
      ));
    end if;

    if v_level=20 then
      v_m:=v_m||jsonb_build_array(private.warlock_feature('warlock-base-eldritch-master-rules','warlock-base:eldritch-master','eldritch_master','Древнейший мастер','Магическая хитрость теперь восстанавливает все потраченные ячейки Магии договора. Ритуал остаётся минутным и восстанавливается после долгого отдыха.',jsonb_build_object('upgrades','magical_cunning','restore','all_pact_slots')));
    end if;

    perform private.warlock_set_level(v_warlock,v_level,v_m,v_c);
  end loop;
end;
$$;

revoke all on function private.apply_warlock_base_runtime_v1(uuid) from public,anon,authenticated;
grant execute on function private.apply_warlock_base_runtime_v1(uuid) to service_role;

create or replace function public.cast_warlock_pact_spell_v1(p_character_id uuid,p_spell_catalog_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_level integer;
  v_spell_level integer;
  v_slot_level integer;
  v_state public.character_resource_states%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  select greatest(1,coalesce(a.template_level,1)) into v_level
  from public.character_template_assignments a join public.rule_templates t on t.id=a.template_id
  where a.character_id=p_character_id and t.kind='class' and t.catalog_key='class:warlock' and t.is_active
  order by t.version desc limit 1;
  if v_level is null then raise exception 'Active Warlock class assignment not found'; end if;
  select s.spell_level into v_spell_level
  from public.spell_catalog s join public.spell_catalog_classes sc on sc.spell_id=s.id and sc.class_key='warlock'
  where s.id=p_spell_catalog_id;
  if v_spell_level is null or v_spell_level<1 or v_spell_level>5 then raise exception 'Spell is not an eligible Pact Magic spell'; end if;
  if not exists(select 1 from public.character_spells cs where cs.character_id=p_character_id and cs.catalog_spell_id=p_spell_catalog_id and cs.prepared) then raise exception 'Warlock spell is not prepared'; end if;
  v_slot_level:=case when v_level<=2 then 1 when v_level<=4 then 2 when v_level<=6 then 3 when v_level<=8 then 4 else 5 end;
  if v_spell_level>v_slot_level then raise exception 'Pact Magic slot level is too low'; end if;
  select * into v_state from public.character_resource_states where character_id=p_character_id and state_key='warlock_pact_slots' for update;
  if v_state.state_key is null then raise exception 'Pact Magic resource is not synchronized'; end if;
  if v_state.current<1 then raise exception 'Pact Magic slots are exhausted'; end if;
  update public.character_resource_states set current=current-1,updated_at=now(),updated_by=auth.uid()
  where character_id=p_character_id and state_key='warlock_pact_slots';
  return jsonb_build_object('spellCatalogId',p_spell_catalog_id,'castLevel',v_slot_level,'remaining',v_state.current-1,'max',v_state.max_snapshot);
end;
$$;
revoke all on function public.cast_warlock_pact_spell_v1(uuid,uuid) from public,anon;
grant execute on function public.cast_warlock_pact_spell_v1(uuid,uuid) to authenticated,service_role;

create or replace function private.apply_warlock_base_runtime_v1_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.apply_warlock_base_runtime_v1(new.id);
  return new;
end;
$$;
revoke all on function private.apply_warlock_base_runtime_v1_after_campaign() from public,anon,authenticated;
drop trigger if exists zzzzzzzb_campaigns_apply_warlock_base_runtime_v1 on public.campaigns;
create trigger zzzzzzzb_campaigns_apply_warlock_base_runtime_v1 after insert on public.campaigns
for each row execute function private.apply_warlock_base_runtime_v1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.apply_warlock_base_runtime_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;