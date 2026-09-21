-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:rogue
-- CLASS_PACKAGE_TEST: tests/rogueRuntimeStage3Core.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: rogue:stage3=CORE_RUNTIME_READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Rogue Stage 3. Implements the defining 2024 Rogue gameplay slice through the
-- same rule_templates -> CE -> GENA action path used by other classes.
--
-- Scene truth intentionally remains with the GM where the application has no
-- authoritative target/turn/movement state.

begin;

create or replace function private.rogue_stage3_feature_v1(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_description text,
  p_mechanic jsonb
)
returns jsonb
language sql
immutable
set search_path=''
as $function$
  select jsonb_build_object(
    'id',p_id,
    'type','grant',
    'sourceKey',p_source_key,
    'target','feature',
    'key',p_key,
    'payload',jsonb_build_object(
      'label',p_label,
      'description',p_description,
      'mechanic',p_mechanic
    )
  );
$function$;

create or replace function private.rogue_stage3_action_v1(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_economy text,
  p_effects jsonb,
  p_tags jsonb default '[]'::jsonb,
  p_damage jsonb default '[]'::jsonb
)
returns jsonb
language sql
immutable
set search_path=''
as $function$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_id,
    'type','action',
    'sourceKey',p_source_key,
    'key',p_key,
    'label',p_label,
    'economy',p_economy,
    'range',jsonb_build_object('kind','self'),
    'effects',case when jsonb_array_length(coalesce(p_effects,'[]'::jsonb))>0 then p_effects else null end,
    'tags',coalesce(p_tags,'[]'::jsonb),
    'damage',case when jsonb_array_length(coalesce(p_damage,'[]'::jsonb))>0 then p_damage else null end,
    'presentation',jsonb_build_object('tone','neutral','icon','◆','priority',80)
  ));
$function$;

create or replace function private.rogue_stage3_bonus_dice_sacrifice_v1(
  p_cost integer,
  p_label text
)
returns jsonb
language sql
immutable
set search_path=''
as $function$
  select jsonb_build_object(
    'kind','semantic',
    'key','bonus_damage_dice_sacrifice',
    'payload',jsonb_build_object(
      'poolValueKey','rogue_sneak_attack_dice',
      'diceCost',greatest(1,p_cost),
      'dieSides',6,
      'label',p_label
    )
  );
$function$;

create or replace function private.rogue_stage3_upsert_level_mechanic_v1(
  p_template_id uuid,
  p_level integer,
  p_mechanic jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id text:=p_mechanic->>'id';
  v_next jsonb;
begin
  if p_template_id is null then raise exception 'ROGUE_STAGE3_TEMPLATE_REQUIRED'; end if;
  if p_level<1 or p_level>20 then raise exception 'ROGUE_STAGE3_LEVEL_INVALID:%',p_level; end if;
  if nullif(btrim(coalesce(v_id,'')),'') is null then raise exception 'ROGUE_STAGE3_MECHANIC_ID_REQUIRED'; end if;

  insert into public.rule_template_levels(template_id,level,mechanics,choices)
  values(p_template_id,p_level,jsonb_build_array(p_mechanic),'[]'::jsonb)
  on conflict(template_id,level) do update
  set mechanics=(
    select coalesce(jsonb_agg(m.value order by m.ord),'[]'::jsonb)
    from (
      select value,ord
      from jsonb_array_elements(coalesce(public.rule_template_levels.mechanics,'[]'::jsonb))
        with ordinality x(value,ord)
      where value->>'id'<>v_id
      union all
      select p_mechanic,1000000::bigint
    ) m
  );
end;
$function$;

create or replace function private.rogue_stage3_rider_effect_v1(
  p_key text,
  p_save_ability text default null,
  p_on_fail jsonb default '{}'::jsonb,
  p_extra jsonb default '{}'::jsonb
)
returns jsonb
language sql
immutable
set search_path=''
as $function$
  select jsonb_build_object(
    'kind','semantic',
    'key','bonus_damage_rider',
    'payload',
      jsonb_build_object(
        'riderKey',p_key,
        'saveAbility',p_save_ability,
        'saveDcValueKey',case when p_save_ability is null then null else 'rogue_cunning_strike_save_dc' end,
        'onFail',coalesce(p_on_fail,'{}'::jsonb)
      ) || coalesce(p_extra,'{}'::jsonb)
  );
$function$;

create or replace function private.rogue_stage3_combo_action_v1(
  p_id text,
  p_key text,
  p_label text,
  p_cost integer,
  p_first_effect jsonb,
  p_second_effect jsonb
)
returns jsonb
language sql
immutable
set search_path=''
as $function$
  select private.rogue_stage3_action_v1(
    p_id,
    'improved-cunning-strike',
    p_key,
    p_label || ' (−' || p_cost::text || 'к6)',
    'triggered',
    jsonb_build_array(
      private.rogue_stage3_bonus_dice_sacrifice_v1(p_cost,p_label),
      jsonb_build_object(
        'kind','semantic',
        'key','bonus_damage_rider_combination',
        'payload',jsonb_build_object('maxRiders',2,'distinct',true)
      ),
      p_first_effect,
      p_second_effect
    ),
    jsonb_build_array('rogue','sneak_attack','cunning_strike','cunning_strike_combo','gm_scene_requirement')
  );
$function$;

revoke all on function private.rogue_stage3_feature_v1(text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function private.rogue_stage3_action_v1(text,text,text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.rogue_stage3_bonus_dice_sacrifice_v1(integer,text) from public,anon,authenticated;
revoke all on function private.rogue_stage3_upsert_level_mechanic_v1(uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function private.rogue_stage3_rider_effect_v1(text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.rogue_stage3_combo_action_v1(text,text,text,integer,jsonb,jsonb) from public,anon,authenticated;

create or replace function private.ensure_rogue_stage3_core_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rogue uuid;
  v_poison jsonb;
  v_trip jsonb;
  v_withdraw jsonb;
  v_daze jsonb;
  v_obscure jsonb;
  v_knockout jsonb;
begin
  select id into v_rogue
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:rogue'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_rogue is null then
    raise exception 'ROGUE_STAGE3_CLASS_MISSING:%',p_campaign_id;
  end if;

  if not exists(
    select 1
    from public.rule_templates
    where id=v_rogue
      and catalog_revision='xphb-2024-rogue-stage2-foundation-v1'
  ) and not exists(
    select 1
    from public.rule_templates
    where id=v_rogue
      and catalog_revision='xphb-2024-rogue-stage3-core-runtime-v1'
  ) then
    raise exception 'ROGUE_STAGE3_REQUIRES_STAGE2:%',p_campaign_id;
  end if;

  v_poison:=private.rogue_stage3_rider_effect_v1(
    'poison',
    'constitution',
    jsonb_build_object(
      'condition','poisoned',
      'duration','1_minute',
      'repeatSave','end_of_each_target_turn',
      'endOnSuccess',true
    ),
    jsonb_build_object(
      'requiresCarriedItemTag','poisoners_kit',
      'requirementEnforcement','gm'
    )
  );
  v_trip:=private.rogue_stage3_rider_effect_v1(
    'trip',
    'dexterity',
    jsonb_build_object('condition','prone'),
    jsonb_build_object('targetSizeMaximum','large','requirementEnforcement','gm')
  );
  v_withdraw:=private.rogue_stage3_rider_effect_v1(
    'withdraw',
    null,
    jsonb_build_object(),
    jsonb_build_object(
      'movement','half_speed',
      'provokesOpportunityAttacks',false
    )
  );
  v_daze:=private.rogue_stage3_rider_effect_v1(
    'daze',
    'constitution',
    jsonb_build_object(
      'nextTurnChoiceLimit',1,
      'allowed',jsonb_build_array('move','action','bonus_action')
    )
  );
  v_obscure:=private.rogue_stage3_rider_effect_v1(
    'obscure',
    'dexterity',
    jsonb_build_object(
      'condition','blinded',
      'duration','until_end_of_target_next_turn'
    )
  );
  v_knockout:=private.rogue_stage3_rider_effect_v1(
    'knock_out',
    'constitution',
    jsonb_build_object(
      'condition','unconscious',
      'duration','1_minute',
      'endOnDamage',true,
      'repeatSave','end_of_each_target_turn',
      'endOnSuccess',true
    )
  );

  -- Level 1: Sneak Attack is an actual CE/GENA bonus-damage roll. Target,
  -- Advantage/ally and once-per-turn legality remain scene adjudication.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,1,
    private.rogue_stage3_feature_v1(
      'rogue-sneak-attack-feature-l1',
      'sneak-attack',
      'class:rogue:sneak-attack:l1',
      'Скрытая атака',
      'Один раз за ход, когда вы попадаете по существу атакой подходящим оружием со свойством Finesse или Ranged, добавьте урон Скрытой атаки при Преимуществе либо при наличии дееспособного союзника в 5 футах от цели и отсутствии Помехи. Дополнительный урон имеет тот же тип, что и урон оружия.',
      jsonb_build_object(
        'kind','bonus_damage',
        'diceValueKey','rogue_sneak_attack_dice',
        'dieSides',6,
        'damageType','same_as_weapon',
        'cadence','once_per_turn',
        'weaponPropertiesAny',jsonb_build_array('finesse','ranged'),
        'sceneEligibility','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,1,
    private.rogue_stage3_action_v1(
      'rogue-sneak-attack-action',
      'sneak-attack',
      'rogue_sneak_attack',
      'Скрытая атака',
      'triggered',
      jsonb_build_array(
        jsonb_build_object(
          'kind','semantic',
          'key','bonus_damage_trigger',
          'payload',jsonb_build_object(
            'cadence','once_per_turn',
            'weaponPropertiesAny',jsonb_build_array('finesse','ranged'),
            'advantageOrAdjacentAlly',true,
            'disadvantageForbiddenForAllyPath',true,
            'sceneEligibility','gm'
          )
        )
      ),
      jsonb_build_array('rogue','sneak_attack','bonus_damage','gm_scene_requirement'),
      jsonb_build_array(
        jsonb_build_object(
          'key','sneak_attack',
          'damageType','same_as_weapon',
          'count',jsonb_build_object('kind','reference','key','values.rogue_sneak_attack_dice'),
          'sides',6
        )
      )
    )
  );

  -- Level 2: the old executable shape is retained, now under the current exact rule.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,2,
    private.rogue_stage3_feature_v1(
      'rogue-cunning-action-feature-l2',
      'cunning-action',
      'class:rogue:cunning-action:l2',
      'Хитрое действие',
      'На своём ходу вы можете бонусным действием совершить одно из трёх действий: Рывок, Отход или Скрыться.',
      jsonb_build_object(
        'kind','action_options',
        'economy','bonus_action',
        'options',jsonb_build_array('dash','disengage','hide')
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,2,
    private.rogue_stage3_action_v1(
      'rogue-cunning-action-dash','cunning-action','cunning_dash',
      'Хитрое действие: Рывок','bonus_action',
      jsonb_build_array(jsonb_build_object('kind','semantic','key','movement_action','payload',jsonb_build_object('action','dash'))),
      jsonb_build_array('rogue','cunning_action','movement')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,2,
    private.rogue_stage3_action_v1(
      'rogue-cunning-action-disengage','cunning-action','cunning_disengage',
      'Хитрое действие: Отход','bonus_action',
      jsonb_build_array(jsonb_build_object('kind','semantic','key','movement_action','payload',jsonb_build_object('action','disengage'))),
      jsonb_build_array('rogue','cunning_action','movement')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,2,
    private.rogue_stage3_action_v1(
      'rogue-cunning-action-hide','cunning-action','cunning_hide',
      'Хитрое действие: Скрыться','bonus_action',
      jsonb_build_array(jsonb_build_object('kind','semantic','key','skill_action','payload',jsonb_build_object('action','hide'))),
      jsonb_build_array('rogue','cunning_action','skill')
    )
  );

  -- Level 3: movement/turn state is deliberately semantic, not persisted.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,3,
    private.rogue_stage3_feature_v1(
      'rogue-steady-aim-feature-l3',
      'steady-aim',
      'class:rogue:steady-aim:l3',
      'Точный прицел',
      'Бонусным действием получите Преимущество на следующий бросок атаки текущего хода. Использовать способность можно только если вы ещё не перемещались в этом ходу; после применения ваша Скорость становится 0 до конца текущего хода.',
      jsonb_build_object(
        'kind','scene_action',
        'economy','bonus_action',
        'precondition','no_movement_this_turn',
        'nextAttackAdvantage',true,
        'speedUntilTurnEnd',0,
        'sceneEligibility','gm'
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,3,
    private.rogue_stage3_action_v1(
      'rogue-steady-aim-action','steady-aim','rogue_steady_aim',
      'Точный прицел','bonus_action',
      jsonb_build_array(
        jsonb_build_object(
          'kind','semantic','key','scene_precondition',
          'payload',jsonb_build_object('condition','no_movement_this_turn','adjudication','gm')
        ),
        jsonb_build_object(
          'kind','semantic','key','next_attack_advantage',
          'payload',jsonb_build_object('duration','current_turn')
        ),
        jsonb_build_object(
          'kind','semantic','key','speed_override',
          'payload',jsonb_build_object('value',0,'duration','until_end_of_current_turn')
        )
      ),
      jsonb_build_array('rogue','steady_aim','gm_scene_requirement')
    )
  );

  -- Level 5: shared save DC value and exact three base riders.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,5,
    jsonb_build_object(
      'id','rogue-cunning-strike-save-dc',
      'type','grant',
      'sourceKey','cunning-strike',
      'target','value',
      'key','rogue_cunning_strike_save_dc',
      'grantOperation','REPLACE',
      'priority',5,
      'payload',jsonb_build_object(
        'label','СЛ Хитрого удара',
        'value',jsonb_build_object(
          'kind','add',
          'terms',jsonb_build_array(
            jsonb_build_object('kind','literal','value',8),
            jsonb_build_object('kind','reference','key','abilities.dexterity.modifier'),
            jsonb_build_object('kind','reference','key','core.proficiencyBonus')
          )
        )
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,5,
    private.rogue_stage3_feature_v1(
      'rogue-cunning-strike-feature-l5',
      'cunning-strike',
      'class:rogue:cunning-strike:l5',
      'Хитрый удар',
      'Когда вы наносите урон Скрытой атакой, до броска дополнительных костей можете отказаться от указанного числа к6 и применить один эффект: Отравление, Подножка или Отступление. СЛ спасброска равна 8 + модификатор Ловкости + бонус мастерства.',
      jsonb_build_object(
        'kind','bonus_damage_riders',
        'poolValueKey','rogue_sneak_attack_dice',
        'dieSides',6,
        'saveDcValueKey','rogue_cunning_strike_save_dc',
        'maxRiders',1,
        'options',jsonb_build_array(
          jsonb_build_object('key','poison','diceCost',1),
          jsonb_build_object('key','trip','diceCost',1),
          jsonb_build_object('key','withdraw','diceCost',1)
        )
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,5,
    private.rogue_stage3_action_v1(
      'rogue-cunning-strike-poison','cunning-strike','rogue_cunning_strike_poison',
      'Хитрый удар: Отравление (−1к6)','triggered',
      jsonb_build_array(
        private.rogue_stage3_bonus_dice_sacrifice_v1(1,'Отравление'),
        v_poison
      ),
      jsonb_build_array('rogue','sneak_attack','cunning_strike','poison','gm_scene_requirement')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,5,
    private.rogue_stage3_action_v1(
      'rogue-cunning-strike-trip','cunning-strike','rogue_cunning_strike_trip',
      'Хитрый удар: Подножка (−1к6)','triggered',
      jsonb_build_array(
        private.rogue_stage3_bonus_dice_sacrifice_v1(1,'Подножка'),
        v_trip
      ),
      jsonb_build_array('rogue','sneak_attack','cunning_strike','trip','gm_scene_requirement')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,5,
    private.rogue_stage3_action_v1(
      'rogue-cunning-strike-withdraw','cunning-strike','rogue_cunning_strike_withdraw',
      'Хитрый удар: Отступление (−1к6)','triggered',
      jsonb_build_array(
        private.rogue_stage3_bonus_dice_sacrifice_v1(1,'Отступление'),
        v_withdraw
      ),
      jsonb_build_array('rogue','sneak_attack','cunning_strike','withdraw','gm_scene_requirement')
    )
  );

  -- Level 11: exact two-rider semantics and all distinct base pairs.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,11,
    private.rogue_stage3_feature_v1(
      'rogue-improved-cunning-strike-feature-l11',
      'improved-cunning-strike',
      'class:rogue:improved-cunning-strike:l11',
      'Улучшенный хитрый удар',
      'Когда вы наносите урон Скрытой атакой, можете применить до двух разных эффектов Хитрого удара, заплатив стоимость в к6 отдельно за каждый выбранный эффект.',
      jsonb_build_object(
        'kind','bonus_damage_rider_limit',
        'maxRiders',2,
        'distinct',true,
        'costsAdd',true,
        'poolValueKey','rogue_sneak_attack_dice'
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,11,
    private.rogue_stage3_combo_action_v1(
      'rogue-cunning-strike-combo-poison-trip',
      'rogue_cunning_strike_combo_poison_trip',
      'Хитрый удар: Отравление + Подножка',
      2,v_poison,v_trip
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,11,
    private.rogue_stage3_combo_action_v1(
      'rogue-cunning-strike-combo-poison-withdraw',
      'rogue_cunning_strike_combo_poison_withdraw',
      'Хитрый удар: Отравление + Отступление',
      2,v_poison,v_withdraw
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,11,
    private.rogue_stage3_combo_action_v1(
      'rogue-cunning-strike-combo-trip-withdraw',
      'rogue_cunning_strike_combo_trip_withdraw',
      'Хитрый удар: Подножка + Отступление',
      2,v_trip,v_withdraw
    )
  );

  -- Level 14: three Devious Strikes plus combinations whose summed cost is
  -- payable by the Sneak Attack pool at the level they become available.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,14,
    private.rogue_stage3_feature_v1(
      'rogue-devious-strikes-feature-l14',
      'devious-strikes',
      'class:rogue:devious-strikes:l14',
      'Коварные удары',
      'К вариантам Хитрого удара добавляются Оглушение чувств (2к6), Затемнение зрения (3к6) и Нокаут (6к6). Они используют ту же СЛ: 8 + модификатор Ловкости + бонус мастерства.',
      jsonb_build_object(
        'kind','bonus_damage_rider_catalog_extension',
        'options',jsonb_build_array(
          jsonb_build_object('key','daze','diceCost',2),
          jsonb_build_object('key','obscure','diceCost',3),
          jsonb_build_object('key','knock_out','diceCost',6)
        )
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,14,
    private.rogue_stage3_action_v1(
      'rogue-devious-strike-daze','devious-strikes','rogue_devious_strike_daze',
      'Коварный удар: Оглушение чувств (−2к6)','triggered',
      jsonb_build_array(
        private.rogue_stage3_bonus_dice_sacrifice_v1(2,'Оглушение чувств'),
        v_daze
      ),
      jsonb_build_array('rogue','sneak_attack','cunning_strike','devious_strike','daze')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,14,
    private.rogue_stage3_action_v1(
      'rogue-devious-strike-obscure','devious-strikes','rogue_devious_strike_obscure',
      'Коварный удар: Затемнение зрения (−3к6)','triggered',
      jsonb_build_array(
        private.rogue_stage3_bonus_dice_sacrifice_v1(3,'Затемнение зрения'),
        v_obscure
      ),
      jsonb_build_array('rogue','sneak_attack','cunning_strike','devious_strike','obscure')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,14,
    private.rogue_stage3_action_v1(
      'rogue-devious-strike-knockout','devious-strikes','rogue_devious_strike_knockout',
      'Коварный удар: Нокаут (−6к6)','triggered',
      jsonb_build_array(
        private.rogue_stage3_bonus_dice_sacrifice_v1(6,'Нокаут'),
        v_knockout
      ),
      jsonb_build_array('rogue','sneak_attack','cunning_strike','devious_strike','knock_out')
    )
  );

  -- Base + Devious pairs, all payable by Rogue 14's 7d6 pool.
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_rogue,14,private.rogue_stage3_combo_action_v1('rogue-combo-poison-daze','rogue_cunning_combo_poison_daze','Хитрый удар: Отравление + Оглушение чувств',3,v_poison,v_daze));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_rogue,14,private.rogue_stage3_combo_action_v1('rogue-combo-poison-obscure','rogue_cunning_combo_poison_obscure','Хитрый удар: Отравление + Затемнение зрения',4,v_poison,v_obscure));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_rogue,14,private.rogue_stage3_combo_action_v1('rogue-combo-poison-knockout','rogue_cunning_combo_poison_knockout','Хитрый удар: Отравление + Нокаут',7,v_poison,v_knockout));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_rogue,14,private.rogue_stage3_combo_action_v1('rogue-combo-trip-daze','rogue_cunning_combo_trip_daze','Хитрый удар: Подножка + Оглушение чувств',3,v_trip,v_daze));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_rogue,14,private.rogue_stage3_combo_action_v1('rogue-combo-trip-obscure','rogue_cunning_combo_trip_obscure','Хитрый удар: Подножка + Затемнение зрения',4,v_trip,v_obscure));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_rogue,14,private.rogue_stage3_combo_action_v1('rogue-combo-trip-knockout','rogue_cunning_combo_trip_knockout','Хитрый удар: Подножка + Нокаут',7,v_trip,v_knockout));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_rogue,14,private.rogue_stage3_combo_action_v1('rogue-combo-withdraw-daze','rogue_cunning_combo_withdraw_daze','Хитрый удар: Отступление + Оглушение чувств',3,v_withdraw,v_daze));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_rogue,14,private.rogue_stage3_combo_action_v1('rogue-combo-withdraw-obscure','rogue_cunning_combo_withdraw_obscure','Хитрый удар: Отступление + Затемнение зрения',4,v_withdraw,v_obscure));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_rogue,14,private.rogue_stage3_combo_action_v1('rogue-combo-withdraw-knockout','rogue_cunning_combo_withdraw_knockout','Хитрый удар: Отступление + Нокаут',7,v_withdraw,v_knockout));
  perform private.rogue_stage3_upsert_level_mechanic_v1(v_rogue,14,private.rogue_stage3_combo_action_v1('rogue-combo-daze-obscure','rogue_cunning_combo_daze_obscure','Хитрый удар: Оглушение чувств + Затемнение зрения',5,v_daze,v_obscure));

  -- Expensive Devious + Devious pairs become visible only once the class has
  -- enough Sneak Attack dice to pay their exact summed cost.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,15,
    private.rogue_stage3_combo_action_v1(
      'rogue-combo-daze-knockout','rogue_cunning_combo_daze_knockout',
      'Хитрый удар: Оглушение чувств + Нокаут',8,v_daze,v_knockout
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,17,
    private.rogue_stage3_combo_action_v1(
      'rogue-combo-obscure-knockout','rogue_cunning_combo_obscure_knockout',
      'Хитрый удар: Затемнение зрения + Нокаут',9,v_obscure,v_knockout
    )
  );

  update public.rule_templates
  set
    catalog_revision='xphb-2024-rogue-stage3-core-runtime-v1',
    mechanical_summary='Разбойник 2024: базовый CE-пакет, постоянные выборы, Скрытая атака 1к6→10к6, Хитрое действие, Точный прицел и полный каталог Хитрых/Коварных ударов; сценические условия не подменяются скрытым состоянием.',
    rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
      'mechanics_status','IN_PROGRESS_STAGE3_CORE_RUNTIME_READY',
      'runtime_stage',3,
      'runtime_revision','xphb-2024-rogue-stage3-core-runtime-v1',
      'reference_only_until_final_certification',true,
      'sneak_attack_runtime',true,
      'cunning_action_runtime',true,
      'steady_aim_structured_runtime',true,
      'cunning_strike_runtime',true,
      'improved_cunning_strike_runtime',true,
      'devious_strikes_runtime',true,
      'bonus_damage_dice_sacrifice_semantic','bonus_damage_dice_sacrifice',
      'remaining_base_runtime_pending_stage4',true,
      'subclass_runtime_included',false,
      'next_stage','rogue_remaining_base_runtime'
    ),
    updated_at=now()
  where id=v_rogue;
end;
$function$;

revoke all on function private.ensure_rogue_stage3_core_runtime_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_rogue_stage3_core_runtime_v1(uuid) to service_role;

create or replace function private.ensure_rogue_stage3_core_runtime_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_rogue_stage3_core_runtime_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_rogue_stage3_core_runtime_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists n_campaigns_ensure_rogue_stage3_core_runtime_v1 on public.campaigns;
create trigger n_campaigns_ensure_rogue_stage3_core_runtime_v1
after insert on public.campaigns
for each row execute function private.ensure_rogue_stage3_core_runtime_v1_after_campaign();

do $apply$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_rogue_stage3_core_runtime_v1(r.id);
  end loop;
end;
$apply$;

do $cert$
declare
  r record;
  v_count integer;
  v_bad integer;
begin
  for r in
    select id,campaign_id,catalog_revision,rules_meta
    from public.rule_templates
    where kind='class' and catalog_key='class:rogue' and is_active
  loop
    if r.catalog_revision<>'xphb-2024-rogue-stage3-core-runtime-v1' then
      raise exception 'ROGUE_STAGE3_BAD_REVISION:%:%',r.campaign_id,r.catalog_revision;
    end if;
    if r.rules_meta->>'mechanics_status'<>'IN_PROGRESS_STAGE3_CORE_RUNTIME_READY'
       or coalesce((r.rules_meta->>'runtime_stage')::integer,0)<>3
       or coalesce((r.rules_meta->>'subclass_runtime_included')::boolean,true)
    then
      raise exception 'ROGUE_STAGE3_BAD_STATUS:%',r.campaign_id;
    end if;

    select count(*) into v_count
    from public.rule_template_levels
    where template_id=r.id;
    if v_count<>20 then raise exception 'ROGUE_STAGE3_LEVEL_COUNT:%:%',r.campaign_id,v_count; end if;

    select count(*) into v_bad
    from (values
      ('rogue-sneak-attack-action'),
      ('rogue-cunning-action-dash'),
      ('rogue-cunning-action-disengage'),
      ('rogue-cunning-action-hide'),
      ('rogue-steady-aim-action'),
      ('rogue-cunning-strike-poison'),
      ('rogue-cunning-strike-trip'),
      ('rogue-cunning-strike-withdraw'),
      ('rogue-devious-strike-daze'),
      ('rogue-devious-strike-obscure'),
      ('rogue-devious-strike-knockout')
    ) expected(id)
    where not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=r.id and m.value->>'id'=expected.id and m.value->>'type'='action'
    );
    if v_bad<>0 then raise exception 'ROGUE_STAGE3_ACTION_GAP:%:%',r.campaign_id,v_bad; end if;

    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=r.id and l.level=5
        and m.value->>'id'='rogue-cunning-strike-save-dc'
        and m.value->>'target'='value'
    ) then
      raise exception 'ROGUE_STAGE3_SAVE_DC_MISSING:%',r.campaign_id;
    end if;

    select count(*) into v_count
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    cross join lateral jsonb_array_elements(coalesce(m.value->'effects','[]'::jsonb)) e(value)
    where l.template_id=r.id
      and m.value->>'type'='action'
      and e.value->>'kind'='semantic'
      and e.value->>'key'='bonus_damage_dice_sacrifice';
    if v_count<18 then raise exception 'ROGUE_STAGE3_DICE_SACRIFICE_ACTION_COUNT:%:%',r.campaign_id,v_count; end if;

    if exists(
      select 1
      from public.rule_templates s
      where s.campaign_id=r.campaign_id
        and s.kind='subclass'
        and s.is_active
        and (s.parent_template_id=r.id or s.catalog_key like 'subclass:rogue:%' or s.slug like 'rogue-%')
    ) then
      raise exception 'ROGUE_STAGE3_SUBCLASS_RUNTIME_LEAK:%',r.campaign_id;
    end if;
  end loop;
end;
$cert$;

commit;
