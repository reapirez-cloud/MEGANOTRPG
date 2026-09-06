-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:warlock
-- CLASS_PACKAGE_TEST: tests/warlockOfficialPack.test.ts
-- CLASS_RESOURCE_POLICY: pact-short-long-rest-v1
-- CLASS_WORK_STATUS: warlock:base=RUNTIME_READY;invocations=PENDING;subclasses=UNCHANGED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Warlock 2024 base runtime. This package intentionally excludes Eldritch
-- Invocation acquisition/effects and every subclass. CE owns finite Pact Magic
-- slots, Magical Cunning, Contact Patron free use and Mystic Arcanum uses.

begin;

create or replace function private.warlock_feature(
  p_id text,p_source_key text,p_key text,p_label text,p_description text,p_mechanic jsonb default '{}'::jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','feature','key',p_key,'sourceKey',p_source_key,
    'payload',jsonb_build_object('label',p_label,'description',p_description,'mechanic',coalesce(p_mechanic,'{}'::jsonb))
  );
$$;

create or replace function private.warlock_resource(
  p_id text,p_source_key text,p_key text,p_label text,p_max integer,p_recharge jsonb,
  p_priority integer default 0,p_operation text default 'REPLACE'
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','resource','key',p_key,'sourceKey',p_source_key,
    'grantOperation',p_operation,'priority',p_priority,
    'payload',jsonb_build_object('max',p_max,'label',p_label,'initial','full','recharge',p_recharge)
  );
$$;

create or replace function private.warlock_value(
  p_id text,p_source_key text,p_key text,p_label text,p_value integer,p_priority integer default 0
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','value','key',p_key,'sourceKey',p_source_key,
    'grantOperation','REPLACE','priority',p_priority,
    'payload',jsonb_build_object('label',p_label,'value',p_value)
  );
$$;

create or replace function private.warlock_action(
  p_id text,p_source_key text,p_key text,p_label text,p_economy text,
  p_costs jsonb default '[]'::jsonb,p_effects jsonb default '[]'::jsonb,p_tags jsonb default '[]'::jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_id,'type','action','sourceKey',p_source_key,'key',p_key,'label',p_label,'economy',p_economy,
    'range',jsonb_build_object('kind','self'),
    'resourceCosts',case when jsonb_array_length(coalesce(p_costs,'[]'::jsonb))>0 then p_costs else null end,
    'effects',case when jsonb_array_length(coalesce(p_effects,'[]'::jsonb))>0 then p_effects else null end,
    'tags',coalesce(p_tags,'[]'::jsonb),
    'presentation',jsonb_build_object('tone','violet','icon','✦','display','counter','priority',90)
  ));
$$;

create or replace function private.warlock_spell(
  p_id text,p_source_key text,p_key text,p_catalog_slug text,p_variant_key text,p_name text,p_level integer,p_payload jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','spell','sourceKey',p_source_key,'key',p_key,'catalogSlug',p_catalog_slug,
    'variantKey',p_variant_key,'payload',p_payload
  );
$$;

create or replace function private.warlock_set_level(
  p_template_id uuid,p_level integer,p_mechanics jsonb,p_choices jsonb
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_existing_mechanics jsonb := '[]'::jsonb;
  v_existing_choices jsonb := '[]'::jsonb;
  v_kept_mechanics jsonb := '[]'::jsonb;
  v_kept_choices jsonb := '[]'::jsonb;
begin
  select coalesce(mechanics,'[]'::jsonb),coalesce(choices,'[]'::jsonb)
  into v_existing_mechanics,v_existing_choices
  from public.rule_template_levels
  where template_id=p_template_id and level=p_level;

  if not found then
    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(p_template_id,p_level,coalesce(p_mechanics,'[]'::jsonb),coalesce(p_choices,'[]'::jsonb));
    return;
  end if;

  select coalesce(jsonb_agg(x.value),'[]'::jsonb)
  into v_kept_mechanics
  from jsonb_array_elements(v_existing_mechanics) x(value)
  where coalesce(x.value->>'sourceKey','') not like 'warlock-base:%';

  select coalesce(jsonb_agg(x.value),'[]'::jsonb)
  into v_kept_choices
  from jsonb_array_elements(v_existing_choices) x(value)
  where coalesce(x.value->>'key','') not like 'warlock_mystic_arcanum_%';

  update public.rule_template_levels
  set mechanics=v_kept_mechanics||coalesce(p_mechanics,'[]'::jsonb),
      choices=v_kept_choices||coalesce(p_choices,'[]'::jsonb)
  where template_id=p_template_id and level=p_level;
end;
$$;

create or replace function private.apply_warlock_base_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_warlock uuid;
  v_level integer;
  v_slots integer;
  v_slot_level integer;
  v_cantrips integer;
  v_prepared integer;
  v_cunning_restore integer;
  v_mechanics jsonb;
  v_choices jsonb;
  v_pact_recharge jsonb := '{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb;
  v_long_recharge jsonb := '{"triggers":["long_rest"],"restore":"full"}'::jsonb;
begin
  perform private.ensure_warlock_catalog_v1(p_campaign_id);

  select id into v_warlock
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:warlock' and is_active
  order by version desc,created_at desc limit 1;
  if v_warlock is null then return; end if;

  update public.rule_templates set
    catalog_revision='xphb-2024-warlock-base-runtime-v1',
    mechanical_summary='Колдун 2024: Магия договора использует отдельный конечный пул одинаковых ячеек, восстанавливаемый коротким или долгим отдыхом. Магическая хитрость, Связь с покровителем и четыре Таинственных арканума имеют собственные CE-ресурсы. Инвокации и подклассы не входят в этот пакет.',
    rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
      'warlock_base_runtime',true,
      'runtime_revision','xphb-2024-warlock-base-runtime-v1',
      'mechanics_status','BASE_RUNTIME_READY',
      'resource_ledger_runtime',true,
      'spell_progression','pact_magic',
      'spellcasting_ability','charisma',
      'pact_magic_resource','warlock_pact_slots',
      'mystic_arcanum_runtime',true,
      'invocation_runtime_included',false,
      'subclass_runtime_included',false,
      'source_book','XPHB','rules_revision','2024'
    ),updated_at=now()
  where id=v_warlock;

  for v_level in 1..20 loop
    v_slots := case when v_level=1 then 1 when v_level<=10 then 2 when v_level<=16 then 3 else 4 end;
    v_slot_level := case when v_level<=2 then 1 when v_level<=4 then 2 when v_level<=6 then 3 when v_level<=8 then 4 else 5 end;
    v_cantrips := case when v_level<=3 then 2 when v_level<=9 then 3 else 4 end;
    v_prepared := case v_level
      when 1 then 2 when 2 then 3 when 3 then 4 when 4 then 5 when 5 then 6
      when 6 then 7 when 7 then 8 when 8 then 9 when 9 then 10 when 10 then 10
      when 11 then 11 when 12 then 11 when 13 then 12 when 14 then 12 when 15 then 13
      when 16 then 13 when 17 then 14 when 18 then 14 when 19 then 15 else 15 end;
    v_cunning_restore := case when v_level>=20 then v_slots else ((v_slots+1)/2) end;

    v_mechanics := jsonb_build_array(
      private.warlock_resource('warlock-base-pact-slots-l'||v_level,'warlock-base:pact-magic','warlock_pact_slots','Ячейки Магии договора',v_slots,v_pact_recharge,v_level,'REPLACE'),
      private.warlock_value('warlock-base-pact-slot-level-l'||v_level,'warlock-base:pact-magic','warlock_pact_slot_level','Уровень ячейки Магии договора',v_slot_level,v_level),
      private.warlock_value('warlock-base-cantrips-l'||v_level,'warlock-base:pact-magic','warlock_cantrip_count','Кантрипы колдуна',v_cantrips,v_level),
      private.warlock_value('warlock-base-prepared-l'||v_level,'warlock-base:pact-magic','warlock_prepared_spell_limit','Подготовленные заклинания колдуна',v_prepared,v_level)
    );
    v_choices := '[]'::jsonb;

    if v_level>=2 then
      v_mechanics := v_mechanics||jsonb_build_array(
        private.warlock_value('warlock-base-cunning-restore-l'||v_level,'warlock-base:magical-cunning','warlock_magical_cunning_restore','Ячейки, возвращаемые Магической хитростью',v_cunning_restore,v_level)
      );
    end if;

    case v_level
      when 1 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.warlock_feature(
            'warlock-base-pact-magic-rules','warlock-base:pact-magic','pact_magic','Магия договора',
            'Харизма — базовая характеристика заклинаний колдуна. Все ячейки Магии договора одного уровня; заклинание 1–5 уровня, сотворённое через Магию договора, тратит одну такую ячейку и использует текущий уровень ячейки колдуна. Все потраченные ячейки восстанавливаются после короткого или долгого отдыха.',
            jsonb_build_object('ability','charisma','resource_key','warlock_pact_slots','slot_level_value','warlock_pact_slot_level','prepared_limit_value','warlock_prepared_spell_limit','cantrip_count_value','warlock_cantrip_count')
          )
        );
      when 2 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.warlock_resource('warlock-base-magical-cunning-uses','warlock-base:magical-cunning','warlock_magical_cunning','Магическая хитрость',1,v_long_recharge,2,'REPLACE'),
          private.warlock_feature(
            'warlock-base-magical-cunning-rules','warlock-base:magical-cunning','magical_cunning','Магическая хитрость',
            'После 1 минуты сосредоточения колдун восстанавливает половину максимального числа ячеек Магии договора, округляя вверх (минимум 1). Использование восстанавливается после долгого отдыха.',
            jsonb_build_object('activation','1_minute_ritual','restore_resource','warlock_pact_slots','restore_value','warlock_magical_cunning_restore','recharge','long_rest')
          ),
          private.warlock_action(
            'warlock-base-magical-cunning-action','warlock-base:magical-cunning','warlock_magical_cunning','Магическая хитрость','1_minute_ritual',
            jsonb_build_array(jsonb_build_object('key','warlock_magical_cunning','amount',1)),
            jsonb_build_array(jsonb_build_object('kind','resource','key','warlock_pact_slots','operation','RESTORE','amount',jsonb_build_object('kind','reference','key','values.warlock_magical_cunning_restore'))),
            jsonb_build_array('warlock','pact_magic','restoration')
          )
        );
      when 9 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.warlock_resource('warlock-base-contact-patron-use','warlock-base:contact-patron','warlock_contact_patron','Связь с покровителем: бесплатное сотворение',1,v_long_recharge,9,'REPLACE'),
          private.warlock_feature(
            'warlock-base-contact-patron-rules','warlock-base:contact-patron','contact_patron','Связь с покровителем',
            '«Контакт с иным планом» всегда подготовлен. Один раз между долгими отдыхами колдун может сотворить его без ячейки, чтобы связаться с покровителем, и автоматически преуспевает в предусмотренном заклинанием спасброске Интеллекта.',
            jsonb_build_object('spell_slug','contact-other-plane','always_prepared',true,'free_resource','warlock_contact_patron','automatic_intelligence_save_success',true)
          ),
          private.warlock_spell(
            'warlock-base-contact-other-plane','warlock-base:contact-patron','spell:contact-other-plane','contact-other-plane','warlock-contact-patron','Контакт с иным планом',5,
            jsonb_build_object(
              'spell',jsonb_build_object('name','Контакт с иным планом','level',5,'ritual',true),
              'preparation',jsonb_build_object('mode','always_prepared'),
              'methods',jsonb_build_array(
                jsonb_build_object('key','warlock-pact-magic','kind','class_spell','ability','charisma','requiresPrepared',false,'resourceOptions',jsonb_build_array(jsonb_build_object('key','pact-slot','castLevel',5,'costs',jsonb_build_array(jsonb_build_object('key','warlock_pact_slots','amount',1))))),
                jsonb_build_object('key','warlock-contact-patron','kind','class_feature','ability','charisma','requiresPrepared',false,'resourceOptions',jsonb_build_array(jsonb_build_object('key','free-contact','castLevel',5,'costs',jsonb_build_array(jsonb_build_object('key','warlock_contact_patron','amount',1)))))
              )
            )
          )
        );
      when 11 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.warlock_resource('warlock-base-arcanum-6-use','warlock-base:mystic-arcanum-6','warlock_mystic_arcanum_6','Таинственный арканум 6 уровня',1,v_long_recharge,11,'REPLACE'),
          private.warlock_feature('warlock-base-arcanum-6-rules','warlock-base:mystic-arcanum-6','mystic_arcanum_6','Таинственный арканум (6 уровень)','Выберите одно заклинание колдуна 6 уровня. Оно всегда подготовлено и может быть сотворено один раз без ячейки; использование восстанавливается после долгого отдыха. При получении уровня колдуна этот выбор можно заменить другим заклинанием колдуна 6 уровня.',jsonb_build_object('spell_level',6,'resource_key','warlock_mystic_arcanum_6','replacement','on_warlock_level_gain'))
        );
        v_choices:=jsonb_build_array(jsonb_build_object(
          'key','warlock_mystic_arcanum_6','label','Таинственный арканум: заклинание 6 уровня','target','trait','count',1,'options',jsonb_build_array('spell'),
          'option_labels',jsonb_build_object('spell','Выбрать заклинание колдуна 6 уровня'),'selection_mode','player_once','replacement_policy','on_level_change',
          'option_rules',jsonb_build_object('spell',jsonb_build_object('selector',jsonb_build_object('key','warlock_spell_level_6')))
        ));
      when 13 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.warlock_resource('warlock-base-arcanum-7-use','warlock-base:mystic-arcanum-7','warlock_mystic_arcanum_7','Таинственный арканум 7 уровня',1,v_long_recharge,13,'REPLACE'),
          private.warlock_feature('warlock-base-arcanum-7-rules','warlock-base:mystic-arcanum-7','mystic_arcanum_7','Таинственный арканум (7 уровень)','Выберите одно заклинание колдуна 7 уровня. Оно всегда подготовлено и может быть сотворено один раз без ячейки; использование восстанавливается после долгого отдыха. При получении уровня колдуна этот выбор можно заменить другим заклинанием колдуна 7 уровня.',jsonb_build_object('spell_level',7,'resource_key','warlock_mystic_arcanum_7','replacement','on_warlock_level_gain'))
        );
        v_choices:=jsonb_build_array(jsonb_build_object(
          'key','warlock_mystic_arcanum_7','label','Таинственный арканум: заклинание 7 уровня','target','trait','count',1,'options',jsonb_build_array('spell'),
          'option_labels',jsonb_build_object('spell','Выбрать заклинание колдуна 7 уровня'),'selection_mode','player_once','replacement_policy','on_level_change',
          'option_rules',jsonb_build_object('spell',jsonb_build_object('selector',jsonb_build_object('key','warlock_spell_level_7')))
        ));
      when 15 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.warlock_resource('warlock-base-arcanum-8-use','warlock-base:mystic-arcanum-8','warlock_mystic_arcanum_8','Таинственный арканум 8 уровня',1,v_long_recharge,15,'REPLACE'),
          private.warlock_feature('warlock-base-arcanum-8-rules','warlock-base:mystic-arcanum-8','mystic_arcanum_8','Таинственный арканум (8 уровень)','Выберите одно заклинание колдуна 8 уровня. Оно всегда подготовлено и может быть сотворено один раз без ячейки; использование восстанавливается после долгого отдыха. При получении уровня колдуна этот выбор можно заменить другим заклинанием колдуна 8 уровня.',jsonb_build_object('spell_level',8,'resource_key','warlock_mystic_arcanum_8','replacement','on_warlock_level_gain'))
        );
        v_choices:=jsonb_build_array(jsonb_build_object(
          'key','warlock_mystic_arcanum_8','label','Таинственный арканум: заклинание 8 уровня','target','trait','count',1,'options',jsonb_build_array('spell'),
          'option_labels',jsonb_build_object('spell','Выбрать заклинание колдуна 8 уровня'),'selection_mode','player_once','replacement_policy','on_level_change',
          'option_rules',jsonb_build_object('spell',jsonb_build_object('selector',jsonb_build_object('key','warlock_spell_level_8')))
        ));
      when 17 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.warlock_resource('warlock-base-arcanum-9-use','warlock-base:mystic-arcanum-9','warlock_mystic_arcanum_9','Таинственный арканум 9 уровня',1,v_long_recharge,17,'REPLACE'),
          private.warlock_feature('warlock-base-arcanum-9-rules','warlock-base:mystic-arcanum-9','mystic_arcanum_9','Таинственный арканум (9 уровень)','Выберите одно заклинание колдуна 9 уровня. Оно всегда подготовлено и может быть сотворено один раз без ячейки; использование восстанавливается после долгого отдыха. При получении уровня колдуна этот выбор можно заменить другим заклинанием колдуна 9 уровня.',jsonb_build_object('spell_level',9,'resource_key','warlock_mystic_arcanum_9','replacement','on_warlock_level_gain'))
        );
        v_choices:=jsonb_build_array(jsonb_build_object(
          'key','warlock_mystic_arcanum_9','label','Таинственный арканум: заклинание 9 уровня','target','trait','count',1,'options',jsonb_build_array('spell'),
          'option_labels',jsonb_build_object('spell','Выбрать заклинание колдуна 9 уровня'),'selection_mode','player_once','replacement_policy','on_level_change',
          'option_rules',jsonb_build_object('spell',jsonb_build_object('selector',jsonb_build_object('key','warlock_spell_level_9')))
        ));
      when 20 then
        v_mechanics:=v_mechanics||jsonb_build_array(
          private.warlock_feature(
            'warlock-base-eldritch-master-rules','warlock-base:eldritch-master','eldritch_master','Древнейший мастер',
            'На 20 уровне Магическая хитрость восстанавливает все потраченные ячейки Магии договора вместо половины. Ритуал по-прежнему занимает 1 минуту, а само использование восстанавливается после долгого отдыха.',
            jsonb_build_object('upgrades','magical_cunning','restore','all_pact_slots','activation','1_minute_ritual','recharge','long_rest')
          )
        );
      else null;
    end case;

    perform private.warlock_set_level(v_warlock,v_level,v_mechanics,v_choices);
  end loop;
end;
$$;

revoke all on function private.apply_warlock_base_runtime_v1(uuid) from public,anon,authenticated;
grant execute on function private.apply_warlock_base_runtime_v1(uuid) to service_role;

create or replace function private.apply_warlock_base_runtime_v1_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.apply_warlock_base_runtime_v1(new.id);
  return new;
end;
$$;

revoke all on function private.apply_warlock_base_runtime_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzb_campaigns_apply_warlock_base_runtime_v1 on public.campaigns;
create trigger zzzzzzzb_campaigns_apply_warlock_base_runtime_v1
after insert on public.campaigns
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