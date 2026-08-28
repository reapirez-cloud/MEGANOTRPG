begin;

create or replace function private.druid_patch_feature(
  p_mechanics jsonb,
  p_source_key text,
  p_description text,
  p_mechanic jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    case
      when m->>'type'='grant'
       and m->>'target'='feature'
       and coalesce(m->>'sourceKey','')=p_source_key
      then jsonb_set(
        jsonb_set(m,'{payload,description}',to_jsonb(p_description),true),
        '{payload,mechanic}',coalesce(p_mechanic,'{}'::jsonb),true
      )
      else m
    end
    order by ord
  ),'[]'::jsonb)
  from jsonb_array_elements(coalesce(p_mechanics,'[]'::jsonb)) with ordinality as x(m,ord);
$$;

create or replace function private.normalize_druid_base(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id uuid;
  v_choice jsonb;
begin
  select id into v_template_id
  from public.rule_templates
  where campaign_id=p_campaign_id and is_active and catalog_key='class:druid'
  order by version desc
  limit 1;

  if v_template_id is null then return; end if;

  update public.rule_templates
  set rules_meta = coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
        'ce_rule_dependencies',true,
        'druid_rules_complete',true
      ),
      updated_at=now()
  where id=v_template_id;

  -- Primal Order: the Magician branch carries its dependent skill selection in CE-visible rule data.
  update public.rule_templates t
  set choices=(
    select coalesce(jsonb_agg(
      case when c->>'key'='druid-primal-order' then
        jsonb_set(c,'{option_mechanics,primal-order:magician}',jsonb_build_array(
          jsonb_build_object(
            'id','druid-order-magician-detail',
            'type','grant','target','feature','key','class:druid:primal-order:magician',
            'sourceKey','primal-order',
            'payload',jsonb_build_object(
              'label','Первобытный путь: Маг',
              'description','Друид знает на один заговор друида больше. Кроме того, при выборе этого пути выбери Магию или Природу: к проверкам выбранного навыка добавляется модификатор Мудрости, минимум +1.',
              'mechanic',jsonb_build_object(
                'version',1,
                'kind','choice_bonus',
                'extraDruidCantrips',1,
                'dependentChoice',jsonb_build_object(
                  'key','primal-order-magician-skill',
                  'options',jsonb_build_array('arcana','nature'),
                  'bonus',jsonb_build_object('reference','abilities.wisdom.modifier','minimum',1)
                )
              )
            )
          )
        ),true)
      else c end
      order by ord
    ),'[]'::jsonb)
    from jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) with ordinality as q(c,ord)
  ), updated_at=now()
  where t.id=v_template_id;

  -- Wild Shape is the project rule itself: two uses, Beast HP, action entry, both uses on either rest.
  update public.rule_template_levels l
  set mechanics=private.druid_patch_feature(
    l.mechanics,'wild-shape',
    'Действием друид превращается в виденного ранее зверя, подходящего по пределу CR. У формы собственный запас HP и физические параметры зверя. Форма длится до половины уровня друида часов; друид может закончить её бонусным действием, а также возвращается в обычный облик при 0 HP, потере сознания или смерти. Доступно 2 использования, оба восстанавливаются после короткого или долгого отдыха.',
    jsonb_build_object(
      'version',1,'kind','transformation',
      'activation',jsonb_build_object('economy','action'),
      'cost',jsonb_build_object('resource','wild_shape','amount',1),
      'uses',2,
      'recharge',jsonb_build_array('short_rest','long_rest'),
      'duration',jsonb_build_object('hoursFormula','floor(source.level/2)'),
      'formHitPoints','beast_stat_block',
      'retain',jsonb_build_array('personality','alignment','intelligence','wisdom','charisma','class_features','skill_proficiencies','saving_throw_proficiencies'),
      'endsOn',jsonb_build_array('manual_bonus_action','zero_form_hp','unconscious','death'),
      'spellcasting',jsonb_build_object('allowed',false,'upgradeSource','beast-spells')
    )
  ), updated_at=now()
  where l.template_id=v_template_id and l.level=2;

  -- Wild Companion already has the real spell access; add the exact class feature under the same source.
  update public.rule_template_levels l
  set mechanics=(
    select coalesce(jsonb_agg(m order by ord) filter (where m->>'id'<>'druid-wild-companion-rules'),'[]'::jsonb)
    from jsonb_array_elements(l.mechanics) with ordinality x(m,ord)
  ) || jsonb_build_array(
    jsonb_build_object(
      'id','druid-wild-companion-rules','type','grant','target','feature','key','class:druid:wild-companion','sourceKey','wild-companion',
      'payload',jsonb_build_object(
        'label','Дикий спутник',
        'description','Магическим действием друид творит «Поиск фамильяра» без материальных компонентов, тратя либо 1 использование Дикой формы, либо подходящую ячейку. Такой фамильяр имеет тип Фея и исчезает после следующего долгого отдыха друида.',
        'mechanic',jsonb_build_object(
          'version',1,'kind','alternate_spell_payment','spell','find-familiar','activation','magic_action',
          'costOptions',jsonb_build_array(
            jsonb_build_object('resource','wild_shape','amount',1),
            jsonb_build_object('resourceFamily','spell_slot','minimumLevel',1,'amount',1)
          ),
          'materialComponents','ignored','familiarCreatureType','fey','expires','long_rest'
        )
      )
    )
  ), updated_at=now()
  where l.template_id=v_template_id and l.level=2;

  -- Level 7 is a real persistent choice. The level 15 upgrade is emitted from the same saved option.
  v_choice := jsonb_build_object(
    'key','druid-elemental-fury','count',1,'label','Стихийная ярость','target','trait',
    'options',jsonb_build_array('elemental-fury:potent-spellcasting','elemental-fury:primal-strike'),
    'option_labels',jsonb_build_object(
      'elemental-fury:potent-spellcasting','Могущественные заклинания',
      'elemental-fury:primal-strike','Первобытный удар'
    ),
    'option_mechanics',jsonb_build_object(
      'elemental-fury:potent-spellcasting',jsonb_build_array(
        jsonb_build_object(
          'id','druid-elemental-fury-potent','type','grant','target','feature','key','class:druid:elemental-fury:potent-spellcasting',
          'payload',jsonb_build_object(
            'label','Могущественные заклинания',
            'description','К урону любого заговора друида добавляется модификатор Мудрости.',
            'mechanic',jsonb_build_object('version',1,'kind','spell_damage_modifier','spellList','druid','spellLevel',0,'modifier',jsonb_build_object('reference','abilities.wisdom.modifier'))
          )
        )
      ),
      'elemental-fury:primal-strike',jsonb_build_array(
        jsonb_build_object(
          'id','druid-elemental-fury-primal','type','grant','target','feature','key','class:druid:elemental-fury:primal-strike',
          'payload',jsonb_build_object(
            'label','Первобытный удар',
            'description','Один раз на каждом своём ходу после попадания оружием или атакой звериной формы цель получает ещё 1к8 урона. При попадании выбирается холод, огонь, электричество или звук.',
            'mechanic',jsonb_build_object(
              'version',1,'kind','triggered_extra_damage','frequency','once_per_turn','trigger','hit_with_weapon_or_wild_shape_beast_attack',
              'dice',jsonb_build_object('count',1,'sides',8),'damageChoice',jsonb_build_array('cold','fire','lightning','thunder')
            )
          )
        )
      )
    ),
    'option_mechanics_by_level',jsonb_build_object(
      'elemental-fury:potent-spellcasting',jsonb_build_object('15',jsonb_build_array(
        jsonb_build_object(
          'id','druid-elemental-fury-potent-l15','type','grant','target','feature','key','class:druid:elemental-fury:potent-spellcasting',
          'grantOperation','REPLACE','priority',15,
          'payload',jsonb_build_object(
            'label','Могущественные заклинания',
            'description','К урону любого заговора друида добавляется модификатор Мудрости. Если дальность заговора не меньше 10 футов, она увеличивается ещё на 300 футов.',
            'mechanic',jsonb_build_object(
              'version',1,'kind','spell_damage_and_range_modifier','spellList','druid','spellLevel',0,
              'damageModifier',jsonb_build_object('reference','abilities.wisdom.modifier'),
              'rangeIncrease',jsonb_build_object('minimumBaseRangeFeet',10,'addFeet',300)
            )
          )
        )
      )),
      'elemental-fury:primal-strike',jsonb_build_object('15',jsonb_build_array(
        jsonb_build_object(
          'id','druid-elemental-fury-primal-l15','type','grant','target','feature','key','class:druid:elemental-fury:primal-strike',
          'grantOperation','REPLACE','priority',15,
          'payload',jsonb_build_object(
            'label','Первобытный удар',
            'description','Один раз на каждом своём ходу после попадания оружием или атакой звериной формы цель получает ещё 2к8 урона. При попадании выбирается холод, огонь, электричество или звук.',
            'mechanic',jsonb_build_object(
              'version',1,'kind','triggered_extra_damage','frequency','once_per_turn','trigger','hit_with_weapon_or_wild_shape_beast_attack',
              'dice',jsonb_build_object('count',2,'sides',8),'damageChoice',jsonb_build_array('cold','fire','lightning','thunder')
            )
          )
        )
      ))
    )
  );

  update public.rule_template_levels l
  set choices=(
    select coalesce(jsonb_agg(c order by ord) filter (where c->>'key'<>'druid-elemental-fury'),'[]'::jsonb)
    from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality q(c,ord)
  ) || jsonb_build_array(v_choice), updated_at=now()
  where l.template_id=v_template_id and l.level=7;

  update public.rule_template_levels l
  set mechanics=private.druid_patch_feature(
    l.mechanics,'elemental-fury',
    'На 7 уровне один раз выбирается одна из двух веток Стихийной ярости. Выбор сохраняется; на 15 уровне усиливается именно выбранная ветка без нового выбора.',
    jsonb_build_object('version',1,'kind','persistent_choice','choiceKey','druid-elemental-fury','upgradeLevel',15)
  ), updated_at=now()
  where l.template_id=v_template_id and l.level=7;

  update public.rule_template_levels l
  set mechanics=private.druid_patch_feature(
    l.mechanics,'elemental-fury',
    'На 15 уровне автоматически усиливается ветка Стихийной ярости, выбранная на 7 уровне; новый выбор не совершается.',
    jsonb_build_object('version',1,'kind','choice_upgrade','choiceKey','druid-elemental-fury','dependsOnChoiceLevel',7)
  ), updated_at=now()
  where l.template_id=v_template_id and l.level=15;

  update public.rule_template_levels l
  set mechanics=private.druid_patch_feature(
    l.mechanics,'beast-spells',
    'В Дикой форме друид может творить заклинания. Исключение: заклинание нельзя сотворить в форме, если у него есть материальный компонент с указанной стоимостью или расходуемый материальный компонент.',
    jsonb_build_object('version',1,'kind','spellcasting_permission','dependsOn',jsonb_build_array('wild_shape_active'),'allow',true,'forbidMaterialWithCost',true,'forbidConsumedMaterial',true)
  ), updated_at=now()
  where l.template_id=v_template_id and l.level=18;

  update public.rule_template_levels l
  set mechanics=private.druid_patch_feature(
    l.mechanics,'archdruid',
    'При броске инициативы, если использований Дикой формы не осталось, друид возвращает 1 использование. Раз за долгий отдых без действия можно превратить любое число оставшихся использований Дикой формы в одну ячейку: каждое использование даёт 2 уровня ячейки. Кроме того, тело друида стареет в десять раз медленнее.',
    jsonb_build_object(
      'version',1,'kind','capstone',
      'initiativeRecovery',jsonb_build_object('whenResourceZero','wild_shape','restore',1),
      'conversion',jsonb_build_object('resource','wild_shape','spellSlotLevelsPerUse',2,'frequency','once_per_long_rest','economy','none'),
      'agingRate',0.1
    )
  ), updated_at=now()
  where l.template_id=v_template_id and l.level=20;
end;
$$;

-- Keep future campaigns and existing campaigns on the same normalized Druid base.
create or replace function private.install_rule_catalog(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.install_builtin_rule_catalog(p_campaign_id);
  perform private.install_official_class_catalog(p_campaign_id);
  perform private.install_official_subclass_catalog(p_campaign_id);
  perform private.normalize_druid_base(p_campaign_id);
end;
$$;

DO $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.normalize_druid_base(r.id);
  end loop;
end $$;

commit;
