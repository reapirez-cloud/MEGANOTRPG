-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkSubclassBatch2.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:subclasses-batch2=RUNTIME_READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

create or replace function private.audit_monk_subclasses_batch2_choice_labels_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_template uuid;
  v_weapon_labels jsonb := '{
    "weapon:club":"Дубинка","weapon:dagger":"Кинжал","weapon:greatclub":"Большая дубинка","weapon:handaxe":"Ручной топор","weapon:javelin":"Метательное копьё","weapon:light_hammer":"Лёгкий молот","weapon:mace":"Булава","weapon:quarterstaff":"Боевой посох","weapon:sickle":"Серп","weapon:spear":"Копьё","weapon:battleaxe":"Боевой топор","weapon:flail":"Цеп","weapon:longsword":"Длинный меч","weapon:morningstar":"Моргенштерн","weapon:rapier":"Рапира","weapon:scimitar":"Скимитар","weapon:shortsword":"Короткий меч","weapon:trident":"Трезубец","weapon:war_pick":"Боевой клевец","weapon:warhammer":"Боевой молот","weapon:whip":"Кнут","weapon:dart":"Дротик","weapon:light_crossbow":"Лёгкий арбалет","weapon:shortbow":"Короткий лук","weapon:sling":"Праща","weapon:blowgun":"Духовая трубка","weapon:hand_crossbow":"Ручной арбалет","weapon:longbow":"Длинный лук"
  }'::jsonb;
  v_tool_labels jsonb := '{"tool:calligraphers_supplies":"Принадлежности каллиграфа","tool:painters_supplies":"Принадлежности художника"}'::jsonb;
  v_language_labels jsonb := '{"draconic":"Драконий","dwarvish":"Дварфский","elvish":"Эльфийский","giant":"Великаний","gnomish":"Гномий","goblin":"Гоблинский","halfling":"Полуросличий","orc":"Орочий","abyssal":"Бездны","celestial":"Небесный","deep_speech":"Глубинная речь","infernal":"Инфернальный","primordial":"Первичный","sylvan":"Сильван","undercommon":"Подземный общий"}'::jsonb;
begin
  select id into v_template from public.rule_templates
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key='subclass:monk:kensei' and is_builtin is true and is_active
  order by version desc,created_at desc limit 1;

  if v_template is not null then
    update public.rule_template_levels l
    set choices=coalesce((
      select jsonb_agg(
        case
          when c->>'key' in ('kensei_melee_weapon','kensei_ranged_weapon','kensei_extra_weapon') then jsonb_set(c,'{option_labels}',v_weapon_labels,true)
          when c->>'key'='kensei_brush_tool' then jsonb_set(c,'{option_labels}',v_tool_labels,true)
          else c
        end order by ord
      ) from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality q(c,ord)
    ),'[]'::jsonb)
    where l.template_id=v_template;
  end if;

  select id into v_template from public.rule_templates
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key='subclass:monk:ascendant-dragon' and is_builtin is true and is_active
  order by version desc,created_at desc limit 1;

  if v_template is not null then
    update public.rule_template_levels l
    set choices=coalesce((
      select jsonb_agg(
        case when c->>'key'='ascendant_dragon_language' then jsonb_set(c,'{option_labels}',v_language_labels,true) else c end
        order by ord
      ) from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality q(c,ord)
    ),'[]'::jsonb)
    where l.template_id=v_template;
  end if;
end;
$$;

revoke all on function private.audit_monk_subclasses_batch2_choice_labels_v1(uuid) from public,anon,authenticated;
grant execute on function private.audit_monk_subclasses_batch2_choice_labels_v1(uuid) to service_role;

create or replace function private.audit_monk_subclasses_batch2_choice_labels_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.audit_monk_subclasses_batch2_choice_labels_v1(new.id);
  return new;
end;
$$;

revoke all on function private.audit_monk_subclasses_batch2_choice_labels_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzzzzzzzzz_campaigns_audit_monk_subclasses_batch2_choice_labels on public.campaigns;
create trigger zzzzzzzzzzzzzzz_campaigns_audit_monk_subclasses_batch2_choice_labels
after insert on public.campaigns
for each row execute function private.audit_monk_subclasses_batch2_choice_labels_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.audit_monk_subclasses_batch2_choice_labels_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
