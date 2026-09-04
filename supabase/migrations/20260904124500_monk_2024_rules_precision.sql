-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkOfficialPack.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:base=RUNTIME_READY;subclasses=UNCHANGED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Precision audit against the 2024 Monk rules. This changes only base-class
-- rows and keeps subclass packages untouched.

begin;

create or replace function private.apply_monk_2024_rules_precision(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_monk uuid;
begin
  select id into v_monk
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:monk' and is_active
  order by version desc,created_at desc limit 1;
  if v_monk is null then return; end if;

  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(
      case m->>'id'
        when 'monk-martial-arts-rules' then jsonb_set(m,'{payload,description}',to_jsonb('Пока монах безоружен или держит только монашеское оружие и не носит доспех либо щит, действуют Боевые искусства. Монашеское оружие — простое рукопашное оружие и воинское рукопашное оружие со свойством Лёгкое. Безоружный удар можно сделать бонусным действием. Вместо обычного урона безоружного удара или монашеского оружия можно использовать куб Боевых искусств. Для бросков атаки и урона ими можно применять Ловкость вместо Силы; для СЛ Захвата и Толчка безоружным ударом также можно применять Ловкость вместо Силы.'::text),true)
        when 'monk-deflect-attacks-rules' then jsonb_set(m,'{payload,description}',to_jsonb('Когда бросок атаки попадает по монаху и урон включает дробящий, колющий или рубящий тип, монах может реакцией уменьшить общий урон этой атаки на 1к10 + модификатор Ловкости + уровень монаха. Если урон снижен до 0, можно потратить 1 Очко концентрации: для рукопашной атаки выбрать видимое существо в 5 футах, для дальней — видимое существо в 60 футах, не находящееся за полным укрытием. Цель делает спасбросок Ловкости; при провале получает урон, равный двум броскам куба Боевых искусств + модификатор Ловкости, того же типа, что исходная атака.'::text),true)
        when 'monk-stunning-strike-rules' then jsonb_set(m,'{payload,description}',to_jsonb('Один раз за ход, когда монах попадает по существу монашеским оружием или безоружным ударом, он может потратить 1 Очко концентрации. Цель делает спасбросок Телосложения против СЛ концентрации. При провале цель Ошеломлена до начала следующего хода монаха. При успехе её Скорость уменьшается вдвое до начала следующего хода монаха, а следующий бросок атаки по ней до этого момента совершается с преимуществом.'::text),true)
        when 'monk-heightened-focus' then jsonb_set(m,'{payload,description}',to_jsonb('Усиленная концентрация улучшает три базовых приёма. Шквал ударов за 1 Очко концентрации делает три безоружных удара вместо двух. Платная Терпеливая оборона дополнительно даёт временные HP, равные двум броскам куба Боевых искусств. При платном Шаге ветра можно выбрать согласное существо Большого размера или меньше в 5 футах: до конца хода оно перемещается вместе с монахом, и это перемещение не провоцирует атаки по возможности.'::text),true)
        when 'monk-self-restoration' then jsonb_set(m,'{payload,description}',to_jsonb('В конце каждого своего хода монах может снять с себя одно из состояний: Очарован, Испуган или Отравлен. Кроме того, отсутствие еды и питья не даёт монаху уровни Истощения.'::text),true)
        when 'monk-acrobatic-movement' then jsonb_set(m,'{payload,description}',to_jsonb('Пока монах не носит доспех и щит, в свой ход он может перемещаться по вертикальным поверхностям и по жидкостям, не падая во время этого перемещения.'::text),true)
        when 'monk-disciplined-survivor-action' then jsonb_set(m,'{economy}',to_jsonb('free'::text),true)
        when 'monk-deflect-redirect' then jsonb_set(m,'{economy}',to_jsonb('free'::text),true)
        else m
      end order by ord
    )
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
  ),'[]'::jsonb)
  where l.template_id=v_monk;

  update public.rule_template_levels
  set mechanics=mechanics||jsonb_build_array(jsonb_build_object(
    'id','monk-focus-save-dc-l2',
    'type','grant','target','value','key','monk_focus_save_dc','sourceKey','monk-focus',
    'grantOperation','REPLACE','priority',2,
    'payload',jsonb_build_object(
      'label','СЛ концентрации',
      'value',jsonb_build_object(
        'kind','add','terms',jsonb_build_array(
          jsonb_build_object('kind','literal','value',8),
          jsonb_build_object('kind','reference','key','abilities.wisdom.modifier'),
          jsonb_build_object('kind','reference','key','core.proficiencyBonus')
        )
      )
    )
  ))
  where template_id=v_monk and level=2
    and not exists(
      select 1 from jsonb_array_elements(coalesce(mechanics,'[]'::jsonb)) m
      where m->>'id'='monk-focus-save-dc-l2'
    );

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
    'rules_precision_source','D&D 2024 Basic Rules Monk',
    'rules_precision_audited',true
  ),updated_at=now()
  where id=v_monk;
end;
$$;

revoke all on function private.apply_monk_2024_rules_precision(uuid) from public,anon,authenticated;
grant execute on function private.apply_monk_2024_rules_precision(uuid) to service_role;

create or replace function private.apply_monk_2024_rules_precision_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.apply_monk_2024_rules_precision(new.id);
  return new;
end;
$$;

revoke all on function private.apply_monk_2024_rules_precision_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzzzz_campaigns_apply_monk_2024_rules_precision on public.campaigns;
create trigger zzzzzzzzzz_campaigns_apply_monk_2024_rules_precision
after insert on public.campaigns
for each row execute function private.apply_monk_2024_rules_precision_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.apply_monk_2024_rules_precision(v_campaign.id);
  end loop;
end;
$block$;

commit;