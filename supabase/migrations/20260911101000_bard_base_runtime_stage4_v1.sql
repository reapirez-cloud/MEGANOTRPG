-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:bard
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/bardBaseRuntimeStage4.test.ts
-- CLASS_WORK_STATUS: bard:stage4_base=READY,bard:mechanics=PENDING_STAGE5
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Bard Stage 4 closes the remaining 2024 base-class mechanics that the current
-- engine can own: Expertise, Jack of All Trades, Countercharm and Words of
-- Creation. ASI/Epic Boon are represented as structured generic feat-choice
-- hooks; the repository still has no first-class feat source/allocation runtime,
-- so this migration deliberately does not invent a Bard-only feat picker.

begin;

create or replace function private.character_skill_proficiency_rank_for_choice_v1(
  p_character_id uuid,
  p_skill_key text,
  p_exclude_assignment_id uuid default null,
  p_exclude_choice_key text default null
)
returns integer
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_skill text;
  v_rank integer := 0;
  v_assignment record;
  v_source_level integer;
  v_choice jsonb;
  v_choice_key text;
  v_selected jsonb;
  v_legacy jsonb;
  v_option text;
  v_mechanic jsonb;
  v_mechanic_rank integer;
begin
  if p_skill_key !~ '^skill:[a-z_]+$' then
    return 0;
  end if;
  v_skill:=substring(p_skill_key from 7);

  select greatest(0,least(2,coalesce((s.skill_proficiencies->>v_skill)::integer,0)))
  into v_rank
  from public.character_sheets s
  where s.character_id=p_character_id;
  v_rank:=coalesce(v_rank,0);

  for v_assignment in
    select
      a.id as assignment_id,
      a.selected_choices,
      t.id as template_id,
      t.mechanics as template_mechanics,
      t.choices as template_choices
    from public.character_template_assignments a
    join public.rule_templates t on t.id=a.template_id and t.is_active
    where a.character_id=p_character_id
  loop
    v_source_level:=private.character_template_source_level(v_assignment.assignment_id);
    if v_source_level is null then
      continue;
    end if;

    for v_mechanic in
      select m.value
      from jsonb_array_elements(coalesce(v_assignment.template_mechanics,'[]'::jsonb)) m(value)
      union all
      select m.value
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=v_assignment.template_id
        and l.level<=v_source_level
    loop
      if v_mechanic->>'type'='grant'
         and v_mechanic->>'target'='proficiency'
         and v_mechanic->>'key'=p_skill_key
      then
        v_mechanic_rank:=greatest(1,least(2,coalesce((v_mechanic->'payload'->>'rank')::integer,1)));
        v_rank:=greatest(v_rank,v_mechanic_rank);
      end if;
    end loop;

    for v_choice in
      select c.value
      from jsonb_array_elements(coalesce(v_assignment.template_choices,'[]'::jsonb)) c(value)
      union all
      select c.value
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
      where l.template_id=v_assignment.template_id
        and l.level<=v_source_level
    loop
      v_choice_key:=nullif(btrim(coalesce(v_choice->>'key','')),'');
      if v_choice_key is null then
        continue;
      end if;
      if v_assignment.assignment_id is not distinct from p_exclude_assignment_id
         and v_choice_key is not distinct from p_exclude_choice_key
      then
        continue;
      end if;

      v_selected:=coalesce(
        v_assignment.selected_choices #> array['_choice_runtime_v2','choices',v_choice_key,'instances'],
        '[]'::jsonb
      );
      if jsonb_typeof(v_selected)<>'array' or jsonb_array_length(v_selected)=0 then
        v_legacy:=coalesce(v_assignment.selected_choices,'{}'::jsonb)->v_choice_key;
        if jsonb_typeof(v_legacy)='string' then
          v_selected:=jsonb_build_array(jsonb_build_object('option',v_legacy #>> '{}'));
        elsif jsonb_typeof(v_legacy)='array' then
          select coalesce(jsonb_agg(jsonb_build_object('option',x.value)),'[]'::jsonb)
          into v_selected
          from jsonb_array_elements_text(v_legacy) x(value);
        else
          v_selected:='[]'::jsonb;
        end if;
      end if;

      for v_option in
        select case
          when jsonb_typeof(i.value)='string' then i.value #>> '{}'
          else coalesce(i.value->>'option','')
        end
        from jsonb_array_elements(v_selected) i(value)
      loop
        if v_option=p_skill_key and v_choice->>'target'='proficiency' then
          v_rank:=greatest(v_rank,1);
        end if;

        for v_mechanic in
          select m.value
          from jsonb_array_elements(
            coalesce(v_choice->'option_mechanics'->v_option,'[]'::jsonb)
          ) m(value)
          union all
          select m.value
          from jsonb_array_elements(
            coalesce(v_choice->'option_rules'->v_option->'mechanics','[]'::jsonb)
          ) m(value)
        loop
          if v_mechanic->>'type'='grant'
             and v_mechanic->>'target'='proficiency'
             and v_mechanic->>'key'=p_skill_key
          then
            v_mechanic_rank:=greatest(1,least(2,coalesce((v_mechanic->'payload'->>'rank')::integer,1)));
            v_rank:=greatest(v_rank,v_mechanic_rank);
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  return greatest(0,least(2,v_rank));
end;
$function$;

revoke all on function private.character_skill_proficiency_rank_for_choice_v1(uuid,text,uuid,text)
from public,anon,authenticated;
grant execute on function private.character_skill_proficiency_rank_for_choice_v1(uuid,text,uuid,text)
to service_role;

create or replace function private.validate_choice_option_provider_v1(
  p_character_id uuid,
  p_assignment_id uuid,
  p_choice_key text,
  p_choice jsonb,
  p_before jsonb,
  p_instances jsonb
)
returns void
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_provider jsonb:=p_choice->'option_provider';
  v_kind text;
  v_min integer;
  v_max integer;
  v_instance jsonb;
  v_option text;
  v_rank integer;
  v_already_stored boolean;
begin
  if v_provider is null or jsonb_typeof(v_provider)<>'object' then
    return;
  end if;

  v_kind:=coalesce(v_provider->>'kind','');
  if v_kind='skill_proficiencies' then
    v_min:=greatest(0,least(2,coalesce((v_provider->>'minimum_rank')::integer,1)));
    v_max:=greatest(v_min,least(2,coalesce((v_provider->>'maximum_rank')::integer,2)));

    for v_instance in select value from jsonb_array_elements(coalesce(p_instances,'[]'::jsonb))
    loop
      v_option:=case
        when jsonb_typeof(v_instance)='string' then v_instance #>> '{}'
        else coalesce(v_instance->>'option','')
      end;
      if v_option='' then
        continue;
      end if;

      select exists(
        select 1
        from jsonb_array_elements(coalesce(p_before,'[]'::jsonb)) b(value)
        where case
          when jsonb_typeof(b.value)='string' then b.value #>> '{}'
          else coalesce(b.value->>'option','')
        end=v_option
      ) into v_already_stored;

      if v_already_stored then
        continue;
      end if;

      if v_option !~ '^skill:[a-z_]+$' then
        raise exception 'CHOICE_PROVIDER_SKILL_OPTION_INVALID:%',v_option;
      end if;

      v_rank:=private.character_skill_proficiency_rank_for_choice_v1(
        p_character_id,
        v_option,
        p_assignment_id,
        p_choice_key
      );
      if v_rank<v_min or v_rank>v_max then
        raise exception 'CHOICE_PROVIDER_SKILL_PROFICIENCY_INELIGIBLE:option=%:rank=%:min=%:max=%',
          v_option,v_rank,v_min,v_max;
      end if;
    end loop;
    return;
  end if;

  raise exception 'CHOICE_OPTION_PROVIDER_UNSUPPORTED:%',v_kind;
end;
$function$;

revoke all on function private.validate_choice_option_provider_v1(uuid,uuid,text,jsonb,jsonb,jsonb)
from public,anon,authenticated;
grant execute on function private.validate_choice_option_provider_v1(uuid,uuid,text,jsonb,jsonb,jsonb)
to service_role;

-- Insert generic provider validation in front of the existing Choice Runtime v2
-- core without replacing the public replacement-group policy wrapper.
alter function private.commit_character_template_choice_v2_core_stage4(uuid,text,jsonb)
  rename to commit_character_template_choice_v2_core_stage4_provider_base_v1;

revoke all on function private.commit_character_template_choice_v2_core_stage4_provider_base_v1(uuid,text,jsonb)
from public,anon,authenticated,service_role;

create or replace function private.commit_character_template_choice_v2_core_stage4(
  p_assignment_id uuid,
  p_choice_key text,
  p_instances jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_source_level integer;
  v_choice jsonb;
  v_before jsonb:='[]'::jsonb;
  v_legacy jsonb;
begin
  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id;
  if v_assignment.id is null then
    raise exception 'TEMPLATE_ASSIGNMENT_NOT_FOUND';
  end if;

  select * into v_template
  from public.rule_templates
  where id=v_assignment.template_id and is_active=true;
  if v_template.id is null then
    raise exception 'ACTIVE_TEMPLATE_NOT_FOUND';
  end if;

  v_source_level:=private.character_template_source_level(v_assignment.id);
  if v_source_level is null then
    raise exception 'CHOICE_SOURCE_NOT_UNLOCKED';
  end if;

  select q.choice into v_choice
  from (
    select 0 as level,c.choice
    from jsonb_array_elements(coalesce(v_template.choices,'[]'::jsonb)) c(choice)
    union all
    select l.level,c.choice
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(choice)
    where l.template_id=v_template.id and l.level<=v_source_level
  ) q
  where q.choice->>'key'=btrim(p_choice_key)
  order by q.level desc
  limit 1;

  if v_choice is null then
    raise exception 'CHOICE_NOT_UNLOCKED';
  end if;

  v_before:=coalesce(
    coalesce(v_assignment.selected_choices,'{}'::jsonb)
      #> array['_choice_runtime_v2','choices',btrim(p_choice_key),'instances'],
    '[]'::jsonb
  );
  if jsonb_typeof(v_before)<>'array' or jsonb_array_length(v_before)=0 then
    v_legacy:=coalesce(v_assignment.selected_choices,'{}'::jsonb)->btrim(p_choice_key);
    if jsonb_typeof(v_legacy)='string' then
      v_before:=jsonb_build_array(jsonb_build_object('option',v_legacy #>> '{}'));
    elsif jsonb_typeof(v_legacy)='array' then
      select coalesce(jsonb_agg(jsonb_build_object('option',x.value)),'[]'::jsonb)
      into v_before
      from jsonb_array_elements_text(v_legacy) x(value);
    else
      v_before:='[]'::jsonb;
    end if;
  end if;

  perform private.validate_choice_option_provider_v1(
    v_assignment.character_id,
    v_assignment.id,
    btrim(p_choice_key),
    v_choice,
    v_before,
    p_instances
  );

  return private.commit_character_template_choice_v2_core_stage4_provider_base_v1(
    p_assignment_id,
    p_choice_key,
    p_instances
  );
end;
$function$;

revoke all on function private.commit_character_template_choice_v2_core_stage4(uuid,text,jsonb)
from public,anon,authenticated,service_role;

create or replace function private.ensure_bard_base_runtime_stage4_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_bard uuid;
  v_level integer;
  v_mechanics jsonb;
  v_choices jsonb;
  v_skill text;
  v_skill_slug text;
  v_expertise_mechanics jsonb:='{}'::jsonb;
  v_expertise_choice jsonb;
  v_skill_options jsonb:=jsonb_build_array(
    'skill:acrobatics','skill:animal_handling','skill:arcana','skill:athletics',
    'skill:deception','skill:history','skill:insight','skill:intimidation',
    'skill:investigation','skill:medicine','skill:nature','skill:perception',
    'skill:performance','skill:persuasion','skill:religion','skill:sleight_of_hand',
    'skill:stealth','skill:survival'
  );
  v_skill_labels jsonb:=jsonb_build_object(
    'skill:acrobatics','Акробатика',
    'skill:animal_handling','Уход за животными',
    'skill:arcana','Магия',
    'skill:athletics','Атлетика',
    'skill:deception','Обман',
    'skill:history','История',
    'skill:insight','Проницательность',
    'skill:intimidation','Запугивание',
    'skill:investigation','Расследование',
    'skill:medicine','Медицина',
    'skill:nature','Природа',
    'skill:perception','Восприятие',
    'skill:performance','Выступление',
    'skill:persuasion','Убеждение',
    'skill:religion','Религия',
    'skill:sleight_of_hand','Ловкость рук',
    'skill:stealth','Скрытность',
    'skill:survival','Выживание'
  );
begin
  perform private.ensure_bard_spell_runtime_stage3_v1(p_campaign_id);

  select id into v_bard
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:bard'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_bard is null then
    raise exception 'BARD_STAGE4_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  for v_skill in select value from jsonb_array_elements_text(v_skill_options)
  loop
    v_skill_slug:=replace(v_skill,':','-');
    v_expertise_mechanics:=v_expertise_mechanics||jsonb_build_object(
      v_skill,
      jsonb_build_array(jsonb_build_object(
        'id','bard-expertise-'||v_skill_slug,
        'type','grant',
        'sourceKey','expertise',
        'target','proficiency',
        'key',v_skill,
        'payload',jsonb_build_object('rank',2)
      ))
    );
  end loop;

  v_expertise_choice:=jsonb_build_object(
    'key','bard_expertise',
    'label','Экспертиза барда',
    'target','proficiency',
    'count',2,
    'count_by_level',jsonb_build_object('2',2,'9',4),
    'selection_mode','player_once',
    'required',true,
    'options',v_skill_options,
    'option_labels',v_skill_labels,
    'option_provider',jsonb_build_object(
      'kind','skill_proficiencies',
      'minimum_rank',1,
      'maximum_rank',1
    ),
    'option_mechanics',v_expertise_mechanics
  );

  select coalesce(choices,'[]'::jsonb),coalesce(mechanics,'[]'::jsonb)
  into v_choices,v_mechanics
  from public.rule_template_levels
  where template_id=v_bard and level=2
  for update;

  v_choices:=coalesce((
    select jsonb_agg(c.value order by c.ord)
    from jsonb_array_elements(v_choices) with ordinality c(value,ord)
    where c.value->>'key'<>'bard_expertise'
  ),'[]'::jsonb);

  v_mechanics:=coalesce((
    select jsonb_agg(m.value order by m.ord)
    from jsonb_array_elements(v_mechanics) with ordinality m(value,ord)
    where m.value->>'sourceKey' not in ('expertise','jack-of-all-trades')
  ),'[]'::jsonb);

  v_mechanics:=v_mechanics||jsonb_build_array(
    jsonb_build_object(
      'id','bard-expertise-feature-l2',
      'type','grant',
      'sourceKey','expertise',
      'target','feature',
      'key','class:bard:expertise:l2',
      'payload',jsonb_build_object(
        'label','Экспертиза',
        'description','На 2 уровне выберите два навыка, которыми вы владеете: бонус мастерства для их проверок удваивается. На 9 уровне выберите ещё два навыка, которыми вы владеете.',
        'mechanic',jsonb_build_object(
          'kind','expertise_choice',
          'choice_key','bard_expertise',
          'count_by_level',jsonb_build_object('2',2,'9',4)
        )
      )
    ),
    jsonb_build_object(
      'id','bard-jack-of-all-trades-feature-l2',
      'type','grant',
      'sourceKey','jack-of-all-trades',
      'target','feature',
      'key','class:bard:jack-of-all-trades:l2',
      'payload',jsonb_build_object(
        'label','Мастер на все руки',
        'description','Если проверка характеристики использует навык, которым вы не владеете, и бонус мастерства иначе не добавляется к этой проверке, добавьте половину бонуса мастерства с округлением вниз.',
        'mechanic',jsonb_build_object(
          'kind','untrained_skill_proficiency_fraction',
          'numerator',1,
          'denominator',2,
          'round','down'
        )
      )
    ),
    jsonb_build_object(
      'id','bard-jack-of-all-trades-permission-l2',
      'type','grant',
      'sourceKey','jack-of-all-trades',
      'target','permission',
      'key','skill_check:untrained_proficiency_fraction',
      'payload',jsonb_build_object(
        'numerator',1,
        'denominator',2,
        'round','down'
      )
    )
  );

  update public.rule_template_levels
  set choices=v_choices||jsonb_build_array(v_expertise_choice),
      mechanics=v_mechanics
  where template_id=v_bard and level=2;

  -- Level 7 Countercharm: reaction economy is table-adjudicated; the exact
  -- trigger/effect is structured without inventing failed-save scene state.
  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels
  where template_id=v_bard and level=7
  for update;

  v_mechanics:=coalesce((
    select jsonb_agg(m.value order by m.ord)
    from jsonb_array_elements(v_mechanics) with ordinality m(value,ord)
    where m.value->>'sourceKey'<>'countercharm'
  ),'[]'::jsonb);

  v_mechanics:=v_mechanics||jsonb_build_array(
    jsonb_build_object(
      'id','bard-countercharm-feature-l7',
      'type','grant',
      'sourceKey','countercharm',
      'target','feature',
      'key','class:bard:countercharm:l7',
      'payload',jsonb_build_object(
        'label','Контрочарование',
        'description','Если вы или существо в пределах 30 футов от вас проваливает спасбросок против эффекта, накладывающего состояние Очарован или Испуган, вы можете реакцией заставить цель перебросить спасбросок; новый бросок совершается с преимуществом.',
        'mechanic',jsonb_build_object(
          'kind','failed_save_reroll',
          'range_feet',30,
          'conditions',jsonb_build_array('charmed','frightened'),
          'reroll_advantage',true,
          'activation','reaction',
          'trigger_adjudication','table'
        )
      )
    ),
    jsonb_build_object(
      'id','bard-countercharm-action-l7',
      'type','action',
      'sourceKey','countercharm',
      'key','countercharm',
      'label','Контрочарование',
      'economy','reaction',
      'range',jsonb_build_object('kind','area','shape','emanation','size',30,'unit','feet'),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic',
        'key','reroll_failed_save_with_advantage',
        'payload',jsonb_build_object(
          'target','self_or_creature',
          'failed_save_applies_condition',jsonb_build_array('charmed','frightened'),
          'advantage',true
        )
      )),
      'tags',jsonb_build_array('class','bard','countercharm','failed-save','table-adjudicated')
    )
  );

  update public.rule_template_levels
  set mechanics=v_mechanics
  where template_id=v_bard and level=7;

  -- ASI levels: the repository has no first-class feat/allocation source yet.
  -- Keep exact structured hooks on the shared mechanical-rule path; do not add
  -- a Bard-specific picker that would later have to be deleted.
  for v_level in select unnest(array[4,8,12,16])
  loop
    select coalesce(mechanics,'[]'::jsonb) into v_mechanics
    from public.rule_template_levels
    where template_id=v_bard and level=v_level
    for update;

    v_mechanics:=coalesce((
      select jsonb_agg(m.value order by m.ord)
      from jsonb_array_elements(v_mechanics) with ordinality m(value,ord)
      where m.value->>'sourceKey'<>'ability-score-improvement'
    ),'[]'::jsonb);

    v_mechanics:=v_mechanics||jsonb_build_array(jsonb_build_object(
      'id','bard-ability-score-improvement-feature-l'||v_level::text,
      'type','grant',
      'sourceKey','ability-score-improvement',
      'target','feature',
      'key','class:bard:ability-score-improvement:l'||v_level::text,
      'payload',jsonb_build_object(
        'label','Улучшение характеристик',
        'description','Получите талант «Улучшение характеристик» либо другой талант, требованиям которого соответствуете.',
        'mechanic',jsonb_build_object(
          'kind','feat_choice',
          'choice_count',1,
          'source_level',v_level,
          'allowed','ability_score_improvement_or_qualified_feat',
          'runtime_owner','generic_feat_source_pending'
        )
      )
    ));

    update public.rule_template_levels
    set mechanics=v_mechanics
    where template_id=v_bard and level=v_level;
  end loop;

  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels
  where template_id=v_bard and level=19
  for update;

  v_mechanics:=coalesce((
    select jsonb_agg(m.value order by m.ord)
    from jsonb_array_elements(v_mechanics) with ordinality m(value,ord)
    where m.value->>'sourceKey'<>'epic-boon'
  ),'[]'::jsonb)
  ||jsonb_build_array(jsonb_build_object(
    'id','bard-epic-boon-feature-l19',
    'type','grant',
    'sourceKey','epic-boon',
    'target','feature',
    'key','class:bard:epic-boon:l19',
    'payload',jsonb_build_object(
      'label','Эпический дар',
      'description','Получите талант категории «Эпический дар» либо другой талант, требованиям которого соответствуете. Рекомендуется «Дар воспоминания заклинаний».',
      'mechanic',jsonb_build_object(
        'kind','feat_choice',
        'choice_count',1,
        'source_level',19,
        'allowed','epic_boon_or_qualified_feat',
        'recommended','boon-of-spell-recall',
        'runtime_owner','generic_feat_source_pending'
      )
    )
  ));

  update public.rule_template_levels
  set mechanics=v_mechanics
  where template_id=v_bard and level=19;

  -- Level 20 Words of Creation: both spells are separate always-prepared CE
  -- accesses, so they never consume the 22-spell persistent Bard quota.
  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels
  where template_id=v_bard and level=20
  for update;

  v_mechanics:=coalesce((
    select jsonb_agg(m.value order by m.ord)
    from jsonb_array_elements(v_mechanics) with ordinality m(value,ord)
    where m.value->>'sourceKey'<>'words-of-creation'
      and m.value->>'id' not in (
        'bard-stage4-words-power-word-heal',
        'bard-stage4-words-power-word-kill'
      )
  ),'[]'::jsonb);

  v_mechanics:=v_mechanics||jsonb_build_array(
    jsonb_build_object(
      'id','bard-words-of-creation-feature-l20',
      'type','grant',
      'sourceKey','words-of-creation',
      'target','feature',
      'key','class:bard:words-of-creation:l20',
      'payload',jsonb_build_object(
        'label','Слова созидания',
        'description','«Слово силы: Исцеление» и «Слово силы: Смерть» всегда подготовлены. Когда вы накладываете любое из этих заклинаний, вы можете выбрать второе существо целью этого же заклинания, если оно находится в пределах 10 футов от первой цели.',
        'mechanic',jsonb_build_object(
          'kind','spell_second_target_option',
          'spell_keys',jsonb_build_array('spell:power-word-heal','spell:power-word-kill'),
          'second_target_within_feet_of_first',10,
          'target_adjudication','table'
        )
      )
    ),
    jsonb_set(
      jsonb_set(
        private.bard_stage3_spell_mechanic_v1('power-word-heal'),
        '{id}',
        to_jsonb('bard-stage4-words-power-word-heal'::text),
        false
      ),
      '{sourceKey}',
      to_jsonb('words-of-creation'::text),
      false
    ),
    jsonb_set(
      jsonb_set(
        private.bard_stage3_spell_mechanic_v1('power-word-kill'),
        '{id}',
        to_jsonb('bard-stage4-words-power-word-kill'::text),
        false
      ),
      '{sourceKey}',
      to_jsonb('words-of-creation'::text),
      false
    )
  );

  update public.rule_template_levels
  set mechanics=v_mechanics
  where template_id=v_bard and level=20;

  perform private.sync_rule_template_spell_links(v_bard);

  update public.rule_templates
  set catalog_revision='xphb-2024-bard-stage4-base-runtime-v1',
      mechanical_summary='К8 здоровья; Харизма; Вдохновение барда; полный заклинатель; Экспертиза; Мастер на все руки; Контрочарование; Тайны магии; Превосходное вдохновение; Слова созидания.',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','IN_PROGRESS_STAGE4_BASE_RUNTIME_READY',
        'runtime_stage',4,
        'runtime_revision','xphb-2024-bard-stage4-base-runtime-v1',
        'feature_runtime_included',true,
        'expertise_runtime',true,
        'expertise_choice_key','bard_expertise',
        'expertise_dynamic_provider','skill_proficiencies',
        'jack_of_all_trades_runtime',true,
        'jack_of_all_trades_initiative',false,
        'countercharm_runtime','structured_table_adjudicated',
        'words_of_creation_runtime',true,
        'words_of_creation_always_prepared',jsonb_build_array('power-word-heal','power-word-kill'),
        'feat_choice_hooks',true,
        'feat_source_runtime_present',false,
        'feat_runtime_boundary','generic_feat_source_pending',
        'subclass_runtime_included',false,
        'next_stage','bard_subclasses'
      ),
      updated_at=now()
  where id=v_bard;
end;
$function$;

revoke all on function private.ensure_bard_base_runtime_stage4_v1(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_bard_base_runtime_stage4_v1(uuid)
to service_role;

create or replace function private.ensure_bard_base_runtime_stage4_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_bard_base_runtime_stage4_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_bard_base_runtime_stage4_v1_after_campaign()
from public,anon,authenticated;

drop trigger if exists aaaaaaaai_campaigns_ensure_bard_spell_runtime_stage3_v1
on public.campaigns;
drop trigger if exists aaaaaaaaj_campaigns_ensure_bard_base_runtime_stage4_v1
on public.campaigns;

create trigger aaaaaaaaj_campaigns_ensure_bard_base_runtime_stage4_v1
after insert on public.campaigns
for each row execute function private.ensure_bard_base_runtime_stage4_v1_after_campaign();

do $apply$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_bard_base_runtime_stage4_v1(r.id);
  end loop;
end;
$apply$;

do $cert$
declare
  r record;
  v_choice jsonb;
  v_counter_action jsonb;
  v_words_links integer;
  v_asi_count integer;
begin
  for r in
    select rt.id,rt.campaign_id,rt.catalog_revision,rt.rules_meta
    from public.rule_templates rt
    where rt.kind='class'
      and rt.catalog_key='class:bard'
      and rt.is_active
  loop
    if r.catalog_revision<>'xphb-2024-bard-stage4-base-runtime-v1' then
      raise exception 'BARD_STAGE4_BAD_REVISION:%:%',r.campaign_id,r.catalog_revision;
    end if;

    select c.value into v_choice
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
    where l.template_id=r.id
      and l.level=2
      and c.value->>'key'='bard_expertise';

    if v_choice is null
       or (v_choice->>'count')::integer<>2
       or (v_choice->'count_by_level'->>'9')::integer<>4
       or jsonb_array_length(v_choice->'options')<>18
       or v_choice->'option_provider'->>'kind'<>'skill_proficiencies'
       or (v_choice->'option_provider'->>'minimum_rank')::integer<>1
       or (v_choice->'option_provider'->>'maximum_rank')::integer<>1
    then
      raise exception 'BARD_STAGE4_EXPERTISE_CHOICE_INVALID:%',r.campaign_id;
    end if;

    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=r.id
        and l.level=2
        and m.value->>'key'='skill_check:untrained_proficiency_fraction'
        and m.value->'payload'->>'numerator'='1'
        and m.value->'payload'->>'denominator'='2'
    ) then
      raise exception 'BARD_STAGE4_JACK_RUNTIME_MISSING:%',r.campaign_id;
    end if;

    select m.value into v_counter_action
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=r.id
      and l.level=7
      and m.value->>'id'='bard-countercharm-action-l7';

    if v_counter_action is null
       or v_counter_action->>'economy'<>'reaction'
       or (v_counter_action->'range'->>'size')::integer<>30
       or v_counter_action->'effects'->0->>'key'<>'reroll_failed_save_with_advantage'
    then
      raise exception 'BARD_STAGE4_COUNTERCHARM_INVALID:%',r.campaign_id;
    end if;

    select count(*) into v_words_links
    from public.rule_template_spell_links l
    where l.template_id=r.id
      and l.template_level=20
      and l.catalog_slug in ('power-word-heal','power-word-kill');
    if v_words_links<>2 then
      raise exception 'BARD_STAGE4_WORDS_SPELL_LINKS_INVALID:%:%',r.campaign_id,v_words_links;
    end if;

    select count(*) into v_asi_count
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=r.id
      and l.level in (4,8,12,16)
      and m.value->>'sourceKey'='ability-score-improvement'
      and m.value->'payload'->'mechanic'->>'kind'='feat_choice';
    if v_asi_count<>4 then
      raise exception 'BARD_STAGE4_ASI_HOOKS_INVALID:%:%',r.campaign_id,v_asi_count;
    end if;

    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=r.id
        and l.level=19
        and m.value->>'sourceKey'='epic-boon'
        and m.value->'payload'->'mechanic'->>'kind'='feat_choice'
    ) then
      raise exception 'BARD_STAGE4_EPIC_BOON_HOOK_INVALID:%',r.campaign_id;
    end if;
  end loop;
end;
$cert$;

commit;
