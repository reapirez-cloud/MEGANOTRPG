-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:rogue
-- CLASS_PACKAGE_TEST: tests/rogueRuntimeStage2Foundation.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: rogue:stage2=FOUNDATION_READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Rogue Stage 2. Rebuilds the active Rogue on the same rule_templates -> Choice
-- Runtime -> CE -> GENA architecture as the other current classes. This migration
-- does not install subclass runtime and does not claim Rogue READY.

begin;

-- ---------------------------------------------------------------------------
-- Generic weapon-proficiency option provider.
-- ---------------------------------------------------------------------------

create or replace function private.weapon_proficiency_covers_choice_v1(
  p_proficiency_key text,
  p_weapon_key text
)
returns boolean
language plpgsql
immutable
set search_path=''
as $function$
declare
  v_simple text[] := array[
    'weapon:club','weapon:dagger','weapon:greatclub','weapon:handaxe',
    'weapon:javelin','weapon:light-hammer','weapon:mace','weapon:quarterstaff',
    'weapon:sickle','weapon:spear','weapon:dart','weapon:light-crossbow',
    'weapon:shortbow','weapon:sling'
  ];
  v_martial text[] := array[
    'weapon:battleaxe','weapon:flail','weapon:glaive','weapon:greataxe',
    'weapon:greatsword','weapon:halberd','weapon:lance','weapon:longsword',
    'weapon:maul','weapon:morningstar','weapon:pike','weapon:rapier',
    'weapon:scimitar','weapon:shortsword','weapon:trident','weapon:war-pick',
    'weapon:warhammer','weapon:whip','weapon:blowgun','weapon:hand-crossbow',
    'weapon:heavy-crossbow','weapon:longbow','weapon:musket','weapon:pistol'
  ];
  v_martial_light text[] := array['weapon:scimitar','weapon:shortsword','weapon:hand-crossbow'];
  v_martial_finesse text[] := array['weapon:rapier','weapon:scimitar','weapon:shortsword','weapon:whip'];
begin
  if nullif(btrim(coalesce(p_proficiency_key,'')),'') is null
     or nullif(btrim(coalesce(p_weapon_key,'')),'') is null then
    return false;
  end if;

  if p_proficiency_key=p_weapon_key then return true; end if;
  if p_proficiency_key='weapon:simple' then return p_weapon_key=any(v_simple); end if;
  if p_proficiency_key='weapon:martial' then return p_weapon_key=any(v_martial); end if;
  if p_proficiency_key='weapon:martial-light' then return p_weapon_key=any(v_martial_light); end if;
  if p_proficiency_key='weapon:martial-finesse' then return p_weapon_key=any(v_martial_finesse); end if;
  if p_proficiency_key='weapon:martial-finesse-or-light' then
    return p_weapon_key=any(v_martial_light) or p_weapon_key=any(v_martial_finesse);
  end if;
  return false;
end;
$function$;

revoke all on function private.weapon_proficiency_covers_choice_v1(text,text)
from public,anon,authenticated;

create or replace function private.character_has_weapon_proficiency_for_choice_v1(
  p_character_id uuid,
  p_weapon_key text,
  p_exclude_assignment_id uuid default null,
  p_exclude_choice_key text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_assignment record;
  v_source_level integer;
  v_choice jsonb;
  v_choice_key text;
  v_selected jsonb;
  v_legacy jsonb;
  v_option text;
  v_mechanic jsonb;
begin
  if p_weapon_key !~ '^weapon:[a-z0-9-]+$' then return false; end if;

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
    if v_source_level is null then continue; end if;

    for v_mechanic in
      select m.value
      from jsonb_array_elements(coalesce(v_assignment.template_mechanics,'[]'::jsonb)) m(value)
      union all
      select m.value
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=v_assignment.template_id and l.level<=v_source_level
    loop
      if v_mechanic->>'type'='grant'
         and v_mechanic->>'target'='proficiency'
         and private.weapon_proficiency_covers_choice_v1(v_mechanic->>'key',p_weapon_key)
      then
        return true;
      end if;
    end loop;

    for v_choice in
      select c.value
      from jsonb_array_elements(coalesce(v_assignment.template_choices,'[]'::jsonb)) c(value)
      union all
      select c.value
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
      where l.template_id=v_assignment.template_id and l.level<=v_source_level
    loop
      v_choice_key:=nullif(btrim(coalesce(v_choice->>'key','')),'');
      if v_choice_key is null then continue; end if;
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
        if v_choice->>'target'='proficiency'
           and private.weapon_proficiency_covers_choice_v1(v_option,p_weapon_key)
        then
          return true;
        end if;

        for v_mechanic in
          select m.value
          from jsonb_array_elements(coalesce(v_choice->'option_mechanics'->v_option,'[]'::jsonb)) m(value)
          union all
          select m.value
          from jsonb_array_elements(coalesce(v_choice->'option_rules'->v_option->'mechanics','[]'::jsonb)) m(value)
        loop
          if v_mechanic->>'type'='grant'
             and v_mechanic->>'target'='proficiency'
             and private.weapon_proficiency_covers_choice_v1(v_mechanic->>'key',p_weapon_key)
          then
            return true;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  return false;
end;
$function$;

revoke all on function private.character_has_weapon_proficiency_for_choice_v1(uuid,text,uuid,text)
from public,anon,authenticated;
grant execute on function private.character_has_weapon_proficiency_for_choice_v1(uuid,text,uuid,text)
to service_role;

-- Extend the existing source-agnostic provider validator. Skill behavior is kept
-- byte-for-byte in semantics; weapon validation is a second generic provider.
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
  if v_provider is null or jsonb_typeof(v_provider)<>'object' then return; end if;

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
      if v_option='' then continue; end if;

      select exists(
        select 1 from jsonb_array_elements(coalesce(p_before,'[]'::jsonb)) b(value)
        where case
          when jsonb_typeof(b.value)='string' then b.value #>> '{}'
          else coalesce(b.value->>'option','')
        end=v_option
      ) into v_already_stored;
      if v_already_stored then continue; end if;

      if v_option !~ '^skill:[a-z_]+$' then
        raise exception 'CHOICE_PROVIDER_SKILL_OPTION_INVALID:%',v_option;
      end if;

      v_rank:=private.character_skill_proficiency_rank_for_choice_v1(
        p_character_id,v_option,p_assignment_id,p_choice_key
      );
      if v_rank<v_min or v_rank>v_max then
        raise exception 'CHOICE_PROVIDER_SKILL_PROFICIENCY_INELIGIBLE:option=%:rank=%:min=%:max=%',
          v_option,v_rank,v_min,v_max;
      end if;
    end loop;
    return;
  end if;

  if v_kind='weapon_proficiencies' then
    for v_instance in select value from jsonb_array_elements(coalesce(p_instances,'[]'::jsonb))
    loop
      v_option:=case
        when jsonb_typeof(v_instance)='string' then v_instance #>> '{}'
        else coalesce(v_instance->>'option','')
      end;
      if v_option='' then continue; end if;

      select exists(
        select 1 from jsonb_array_elements(coalesce(p_before,'[]'::jsonb)) b(value)
        where case
          when jsonb_typeof(b.value)='string' then b.value #>> '{}'
          else coalesce(b.value->>'option','')
        end=v_option
      ) into v_already_stored;
      if v_already_stored then continue; end if;

      if v_option !~ '^weapon:[a-z0-9-]+$' then
        raise exception 'CHOICE_PROVIDER_WEAPON_OPTION_INVALID:%',v_option;
      end if;

      if not private.character_has_weapon_proficiency_for_choice_v1(
        p_character_id,v_option,p_assignment_id,p_choice_key
      ) then
        raise exception 'CHOICE_PROVIDER_WEAPON_PROFICIENCY_INELIGIBLE:%',v_option;
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

-- Rest-refresh choices previously bypassed dynamic provider validation. Fix the
-- generic bridge so every long/short-rest choice receives the same server check.
create or replace function public.commit_character_template_rest_choice_v1(
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
  v_character public.characters%rowtype;
  v_source_level integer;
  v_choice jsonb;
  v_refresh text;
  v_short_open boolean:=false;
  v_long_open boolean:=false;
  v_before jsonb:='[]'::jsonb;
  v_legacy jsonb;
  v_validation jsonb;
  v_instances jsonb;
  v_legacy_options jsonb;
  v_required integer;
  v_value jsonb;
  v_next jsonb;
  v_runtime jsonb;
  v_runtime_choices jsonb;
  v_entry jsonb;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_choice_key,'')),'') is null then raise exception 'CHOICE_KEY_REQUIRED'; end if;

  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id
  for update;
  if v_assignment.id is null then raise exception 'TEMPLATE_ASSIGNMENT_NOT_FOUND'; end if;

  select * into v_template
  from public.rule_templates
  where id=v_assignment.template_id and is_active=true;
  if v_template.id is null then raise exception 'ACTIVE_TEMPLATE_NOT_FOUND'; end if;

  select * into v_character
  from public.characters
  where id=v_assignment.character_id;
  if v_character.id is null then raise exception 'CHARACTER_NOT_FOUND'; end if;

  if coalesce(v_character.assigned_user_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid()
     and not private.can_manage_character(v_character.id,auth.uid())
  then
    raise exception 'CHOICE_PERMISSION_DENIED';
  end if;

  v_source_level:=private.character_template_source_level(v_assignment.id);
  if v_source_level is null then raise exception 'CHOICE_SOURCE_NOT_UNLOCKED'; end if;

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
  where q.choice->>'key'=p_choice_key
  order by q.level desc
  limit 1;

  if v_choice is null then raise exception 'CHOICE_NOT_UNLOCKED'; end if;
  if coalesce(v_choice->>'selection_mode','manager')<>'player_once' then
    raise exception 'CHOICE_NOT_PLAYER_RESOLVABLE';
  end if;

  v_refresh:=coalesce(v_choice->>'refresh','');
  if v_refresh not in ('short_rest','long_rest','short_or_long_rest') then
    raise exception 'CHOICE_REST_REFRESH_UNSUPPORTED:%',v_refresh;
  end if;

  select exists(
    select 1 from public.character_short_rest_sessions s
    where s.character_id=v_character.id and s.is_open=true
  ) into v_short_open;
  v_long_open:=private.is_character_preparation_open(v_character.id);

  if v_refresh='short_rest' and not v_short_open then raise exception 'CHOICE_SHORT_REST_WINDOW_CLOSED'; end if;
  if v_refresh='long_rest' and not v_long_open then raise exception 'CHOICE_LONG_REST_WINDOW_CLOSED'; end if;
  if v_refresh='short_or_long_rest' and not (v_short_open or v_long_open) then
    raise exception 'CHOICE_REST_WINDOW_CLOSED';
  end if;

  v_before:=coalesce(
    coalesce(v_assignment.selected_choices,'{}'::jsonb)
      #> array['_choice_runtime_v2','choices',p_choice_key,'instances'],
    '[]'::jsonb
  );
  if jsonb_typeof(v_before)<>'array' or jsonb_array_length(v_before)=0 then
    v_legacy:=coalesce(v_assignment.selected_choices,'{}'::jsonb)->p_choice_key;
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
    p_choice_key,
    v_choice,
    v_before,
    p_instances
  );

  v_validation:=private.validate_template_choice_instances_v2(
    v_choice,p_instances,v_source_level,
    coalesce(v_assignment.selected_choices,'{}'::jsonb),p_choice_key
  );
  v_instances:=v_validation->'instances';
  v_legacy_options:=v_validation->'legacy_options';
  v_required:=(v_validation->>'required_count')::integer;
  v_value:=case when v_required=1 then v_legacy_options->0 else v_legacy_options end;

  v_next:=jsonb_set(coalesce(v_assignment.selected_choices,'{}'::jsonb),array[p_choice_key],v_value,true);
  v_runtime:=coalesce(v_next->'_choice_runtime_v2','{}'::jsonb);
  if jsonb_typeof(v_runtime)<>'object' then v_runtime:='{}'::jsonb; end if;
  v_runtime:=jsonb_set(v_runtime,'{version}',to_jsonb(2),true);
  v_runtime_choices:=coalesce(v_runtime->'choices','{}'::jsonb);
  if jsonb_typeof(v_runtime_choices)<>'object' then v_runtime_choices:='{}'::jsonb; end if;

  v_entry:=jsonb_build_object(
    'source_level',v_source_level,
    'instances',v_instances,
    'refresh',v_refresh,
    'updated_at',to_jsonb(now())
  );
  v_runtime_choices:=jsonb_set(v_runtime_choices,array[p_choice_key],v_entry,true);
  v_runtime:=jsonb_set(v_runtime,'{choices}',v_runtime_choices,true);
  v_next:=jsonb_set(v_next,'{_choice_runtime_v2}',v_runtime,true);

  update public.character_template_assignments
  set selected_choices=v_next,updated_at=now()
  where id=v_assignment.id
  returning updated_at into v_updated_at;

  return jsonb_build_object(
    'assignment_id',v_assignment.id,
    'choice_key',p_choice_key,
    'source_level',v_source_level,
    'refresh',v_refresh,
    'instances',v_instances,
    'selected_choices',v_next,
    'updated_at',v_updated_at
  );
end;
$function$;

revoke all on function public.commit_character_template_rest_choice_v1(uuid,text,jsonb)
from public,anon;
grant execute on function public.commit_character_template_rest_choice_v1(uuid,text,jsonb)
to authenticated,service_role;

comment on function public.commit_character_template_rest_choice_v1(uuid,text,jsonb) is
'Generic Choice Runtime v2 rest refresh with server-side dynamic option-provider validation.';

-- ---------------------------------------------------------------------------
-- Rogue Stage 2 catalog/runtime foundation.
-- ---------------------------------------------------------------------------

create or replace function private.rogue_stage2_feature_v1(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_description text,
  p_mechanic jsonb default '{}'::jsonb
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
      'mechanic',coalesce(p_mechanic,'{}'::jsonb)
    )
  );
$function$;

create or replace function private.rogue_stage2_value_v1(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_value integer,
  p_priority integer
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
    'target','value',
    'key',p_key,
    'grantOperation','REPLACE',
    'priority',p_priority,
    'payload',jsonb_build_object('label',p_label,'value',p_value)
  );
$function$;

create or replace function private.ensure_rogue_stage2_foundation_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rogue uuid;
  v_level integer;
  v_level_mechanics jsonb;
  v_level_choices jsonb;
  v_feature jsonb;
  v_weapon text;
  v_weapon_slug text;
  v_mastery text;
  v_label text;
  v_base jsonb;
  v_root_choices jsonb;
  v_expertise_mechanics jsonb:='{}'::jsonb;
  v_mastery_mechanics jsonb:='{}'::jsonb;
  v_skill_options jsonb:=jsonb_build_array(
    'skill:acrobatics','skill:animal_handling','skill:arcana','skill:athletics',
    'skill:deception','skill:history','skill:insight','skill:intimidation',
    'skill:investigation','skill:medicine','skill:nature','skill:perception',
    'skill:performance','skill:persuasion','skill:religion','skill:sleight_of_hand',
    'skill:stealth','skill:survival'
  );
  v_skill_labels jsonb:=jsonb_build_object(
    'skill:acrobatics','Акробатика','skill:animal_handling','Уход за животными',
    'skill:arcana','Магия','skill:athletics','Атлетика','skill:deception','Обман',
    'skill:history','История','skill:insight','Проницательность',
    'skill:intimidation','Запугивание','skill:investigation','Расследование',
    'skill:medicine','Медицина','skill:nature','Природа','skill:perception','Восприятие',
    'skill:performance','Выступление','skill:persuasion','Убеждение',
    'skill:religion','Религия','skill:sleight_of_hand','Ловкость рук',
    'skill:stealth','Скрытность','skill:survival','Выживание'
  );
  v_rogue_skill_options jsonb:=jsonb_build_array(
    'skill:acrobatics','skill:athletics','skill:deception','skill:insight',
    'skill:intimidation','skill:investigation','skill:perception',
    'skill:persuasion','skill:sleight_of_hand','skill:stealth'
  );
  v_language_options jsonb:=jsonb_build_array(
    'common','dwarvish','elvish','giant','gnomish','goblin','halfling','orc',
    'abyssal','celestial','deep-speech','draconic','infernal','primordial',
    'sylvan','undercommon'
  );
  v_language_labels jsonb:=jsonb_build_object(
    'common','Общий','dwarvish','Дварфский','elvish','Эльфийский','giant','Великаний',
    'gnomish','Гномий','goblin','Гоблинский','halfling','Полуросликов','orc','Орочий',
    'abyssal','Бездны','celestial','Небесный','deep-speech','Глубинная речь',
    'draconic','Драконий','infernal','Инфернальный','primordial','Первичный',
    'sylvan','Сильван','undercommon','Подземный общий'
  );
  v_weapon_options jsonb:=jsonb_build_array(
    'weapon:club','weapon:dagger','weapon:greatclub','weapon:handaxe',
    'weapon:javelin','weapon:light-hammer','weapon:mace','weapon:quarterstaff',
    'weapon:sickle','weapon:spear','weapon:dart','weapon:light-crossbow',
    'weapon:shortbow','weapon:sling','weapon:battleaxe','weapon:flail',
    'weapon:glaive','weapon:greataxe','weapon:greatsword','weapon:halberd',
    'weapon:lance','weapon:longsword','weapon:maul','weapon:morningstar',
    'weapon:pike','weapon:rapier','weapon:scimitar','weapon:shortsword',
    'weapon:trident','weapon:war-pick','weapon:warhammer','weapon:whip',
    'weapon:blowgun','weapon:hand-crossbow','weapon:heavy-crossbow',
    'weapon:longbow','weapon:musket','weapon:pistol'
  );
  v_weapon_labels jsonb:=jsonb_build_object(
    'weapon:club','Дубинка','weapon:dagger','Кинжал','weapon:greatclub','Большая дубинка',
    'weapon:handaxe','Ручной топор','weapon:javelin','Метательное копьё',
    'weapon:light-hammer','Лёгкий молот','weapon:mace','Булава',
    'weapon:quarterstaff','Боевой посох','weapon:sickle','Серп','weapon:spear','Копьё',
    'weapon:dart','Дротик','weapon:light-crossbow','Лёгкий арбалет',
    'weapon:shortbow','Короткий лук','weapon:sling','Праща',
    'weapon:battleaxe','Боевой топор','weapon:flail','Цеп','weapon:glaive','Глефа',
    'weapon:greataxe','Секира','weapon:greatsword','Двуручный меч',
    'weapon:halberd','Алебарда','weapon:lance','Копьё всадника',
    'weapon:longsword','Длинный меч','weapon:maul','Молот',
    'weapon:morningstar','Моргенштерн','weapon:pike','Пика','weapon:rapier','Рапира',
    'weapon:scimitar','Скимитар','weapon:shortsword','Короткий меч',
    'weapon:trident','Трезубец','weapon:war-pick','Боевая кирка',
    'weapon:warhammer','Боевой молот','weapon:whip','Кнут',
    'weapon:blowgun','Духовая трубка','weapon:hand-crossbow','Ручной арбалет',
    'weapon:heavy-crossbow','Тяжёлый арбалет','weapon:longbow','Длинный лук',
    'weapon:musket','Мушкет','weapon:pistol','Пистолет'
  );
  v_weapon_masteries jsonb:=jsonb_build_object(
    'weapon:club','slow','weapon:dagger','nick','weapon:greatclub','push',
    'weapon:handaxe','vex','weapon:javelin','slow','weapon:light-hammer','nick',
    'weapon:mace','sap','weapon:quarterstaff','topple','weapon:sickle','nick',
    'weapon:spear','sap','weapon:dart','vex','weapon:light-crossbow','slow',
    'weapon:shortbow','vex','weapon:sling','slow','weapon:battleaxe','topple',
    'weapon:flail','sap','weapon:glaive','graze','weapon:greataxe','cleave',
    'weapon:greatsword','graze','weapon:halberd','cleave','weapon:lance','topple',
    'weapon:longsword','sap','weapon:maul','topple','weapon:morningstar','sap',
    'weapon:pike','push','weapon:rapier','vex','weapon:scimitar','nick',
    'weapon:shortsword','vex','weapon:trident','topple','weapon:war-pick','sap',
    'weapon:warhammer','push','weapon:whip','slow','weapon:blowgun','vex',
    'weapon:hand-crossbow','vex','weapon:heavy-crossbow','push',
    'weapon:longbow','slow','weapon:musket','slow','weapon:pistol','vex'
  );
  v_features jsonb:='[
    {"level":1,"key":"sneak-attack","name":"Скрытая атака","description":"Один раз за ход при подходящем попадании оружием со свойством Finesse или Ranged можно добавить урон Скрытой атаки. Урон растёт от 1к6 на 1 уровне до 10к6 на 19 уровне; преимущество, союзник рядом с целью и отсутствие помехи определяются по точным условиям способности."},
    {"level":1,"key":"expertise","name":"Компетентность","description":"Выберите два навыка, которыми владеете, и удвойте для них бонус мастерства. На 6 уровне выберите ещё два."},
    {"level":1,"key":"thieves-cant","name":"Воровской жаргон","description":"Вы знаете Воровской жаргон и дополнительно изучаете ещё один язык по выбору."},
    {"level":1,"key":"weapon-mastery","name":"Оружейное мастерство","description":"Выберите два вида оружия, которыми владеете, и используйте их свойства Weapon Mastery. После долгого отдыха выбор можно заменить."},
    {"level":2,"key":"cunning-action","name":"Хитрое действие","description":"Бонусным действием можно совершить Рывок, Отход или Скрыться."},
    {"level":3,"key":"steady-aim","name":"Точный прицел","description":"Бонусным действием можно получить преимущество на следующую атаку этого хода, если до этого не перемещались; после применения Скорость становится 0 до конца хода."},
    {"level":3,"key":"rogue-subclass","name":"Подкласс разбойника","description":"На 3 уровне выберите подкласс Разбойника; способности выбранного подкласса открываются на указанных для него уровнях Разбойника."},
    {"level":4,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Получите талант «Улучшение характеристик» либо другой доступный талант по общим правилам."},
    {"level":5,"key":"cunning-strike","name":"Хитрый удар","description":"При нанесении урона Скрытой атакой можно отказаться от части её кубов урона ради одного эффекта Хитрого удара, оплачивая указанную стоимость эффекта."},
    {"level":5,"key":"uncanny-dodge","name":"Невероятное уклонение","description":"Реакцией можно вдвое уменьшить урон от видимого попадания атакой. Сценическую допустимость подтверждает мастер."},
    {"level":6,"key":"expertise","name":"Компетентность","description":"На 6 уровне общий постоянный выбор Компетентности расширяется с двух навыков до четырёх."},
    {"level":7,"key":"evasion","name":"Увёртливость","description":"При спасброске Ловкости для половины урона вы получаете 0 урона при успехе и половину при провале; черта не работает в состоянии Недееспособен."},
    {"level":7,"key":"reliable-talent","name":"Надёжный талант","description":"Когда вы совершаете проверку характеристики, использующую навык или инструмент, которым владеете, результат к20 9 или ниже считается равным 10."},
    {"level":8,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Получите талант «Улучшение характеристик» либо другой доступный талант по общим правилам."},
    {"level":9,"key":"subclass","name":"Способность подкласса","description":"Выбранный подкласс получает следующую способность на 9 уровне Разбойника."},
    {"level":10,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Получите талант «Улучшение характеристик» либо другой доступный талант по общим правилам."},
    {"level":11,"key":"improved-cunning-strike","name":"Улучшенный хитрый удар","description":"При Скрытой атаке можно применить до двух эффектов Хитрого удара, оплачивая стоимость каждого отдельно."},
    {"level":12,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Получите талант «Улучшение характеристик» либо другой доступный талант по общим правилам."},
    {"level":13,"key":"subclass","name":"Способность подкласса","description":"Выбранный подкласс получает следующую способность на 13 уровне Разбойника."},
    {"level":14,"key":"devious-strikes","name":"Коварные удары","description":"Каталог Хитрого удара расширяется эффектами Daze, Obscure и Knock Out с их точной стоимостью в кубах Скрытой атаки."},
    {"level":15,"key":"slippery-mind","name":"Скользкий ум","description":"Вы получаете владение спасбросками Мудрости и Харизмы."},
    {"level":16,"key":"ability-score-improvement","name":"Улучшение характеристик","description":"Получите талант «Улучшение характеристик» либо другой доступный талант по общим правилам."},
    {"level":17,"key":"subclass","name":"Способность подкласса","description":"Выбранный подкласс получает следующую способность на 17 уровне Разбойника."},
    {"level":18,"key":"elusive","name":"Неуловимый","description":"Броски атак не могут иметь преимущество против вас, пока вы не Недееспособны."},
    {"level":19,"key":"epic-boon","name":"Эпический дар","description":"Получите эпический дар либо другой талант, требованиям которого соответствуете."},
    {"level":20,"key":"stroke-of-luck","name":"Мастерский удар","description":"Когда вы проваливаете D20 Test, можно считать результат к20 равным 20. После использования способность восстанавливается после короткого или долгого отдыха."}
  ]'::jsonb;
begin
  if p_campaign_id is null then return; end if;

  -- Expertise uses the same generic provider/runtime pattern as Bard.
  for v_feature in select value from jsonb_array_elements(v_skill_options)
  loop
    v_weapon_slug:=replace(v_feature #>> '{}',':','-');
    v_expertise_mechanics:=v_expertise_mechanics||jsonb_build_object(
      v_feature #>> '{}',
      jsonb_build_array(jsonb_build_object(
        'id','rogue-expertise-'||v_weapon_slug,
        'type','grant',
        'sourceKey','expertise',
        'target','proficiency',
        'key',v_feature #>> '{}',
        'payload',jsonb_build_object('rank',2)
      ))
    );
  end loop;

  -- Weapon Mastery emits the same structured feature shape already used by the
  -- current Paladin runtime. Provider validation decides which weapons are legal.
  for v_weapon in select value from jsonb_array_elements_text(v_weapon_options)
  loop
    v_weapon_slug:=substring(v_weapon from 8);
    v_mastery:=v_weapon_masteries->>v_weapon;
    v_label:=v_weapon_labels->>v_weapon;
    v_mastery_mechanics:=v_mastery_mechanics||jsonb_build_object(
      v_weapon,
      jsonb_build_array(jsonb_build_object(
        'id','rogue-weapon-mastery-'||v_weapon_slug,
        'type','grant',
        'sourceKey','weapon-mastery',
        'target','feature',
        'key','class:rogue:weapon-mastery:'||v_weapon_slug,
        'payload',jsonb_build_object(
          'label','Мастерство: '||v_label,
          'weaponKey',v_weapon_slug,
          'mastery',v_mastery,
          'runtime',jsonb_build_object(
            'kind','weapon_mastery',
            'weaponKey',v_weapon_slug,
            'mastery',v_mastery
          )
        )
      ))
    );
  end loop;

  v_base:=jsonb_build_array(
    private.rogue_stage2_feature_v1(
      'rogue-hit-die','hit-die','class:rogue:hit-die','Кость здоровья: к8',
      'Разбойник использует к8 как кость здоровья класса.',
      jsonb_build_object('hitDie',8)
    ),
    jsonb_build_object(
      'id','rogue-save-dexterity','type','grant','sourceKey','saving-throw-dexterity',
      'target','proficiency','key','savingThrow:dexterity',
      'payload',jsonb_build_object('rank',1,'label','Спасбросок: Ловкость')
    ),
    jsonb_build_object(
      'id','rogue-save-intelligence','type','grant','sourceKey','saving-throw-intelligence',
      'target','proficiency','key','savingThrow:intelligence',
      'payload',jsonb_build_object('rank',1,'label','Спасбросок: Интеллект')
    ),
    jsonb_build_object(
      'id','rogue-armor-light','type','grant','sourceKey','armor-light',
      'target','proficiency','key','armor:light',
      'payload',jsonb_build_object('rank',1,'label','Лёгкие доспехи')
    ),
    jsonb_build_object(
      'id','rogue-weapon-simple','type','grant','sourceKey','weapon-simple',
      'target','proficiency','key','weapon:simple',
      'payload',jsonb_build_object('rank',1,'label','Простое оружие')
    ),
    jsonb_build_object(
      'id','rogue-weapon-martial-finesse-light','type','grant',
      'sourceKey','weapon-martial-finesse-or-light','target','proficiency',
      'key','weapon:martial-finesse-or-light',
      'payload',jsonb_build_object(
        'rank',1,
        'label','Воинское оружие со свойством «Фехтовальное» или «Лёгкое»'
      )
    ),
    jsonb_build_object(
      'id','rogue-thieves-tools','type','grant','sourceKey','thieves-tools',
      'target','proficiency','key','tool:thieves-tools',
      'payload',jsonb_build_object('rank',1,'label','Воровские инструменты')
    ),
    jsonb_build_object(
      'id','rogue-thieves-cant-language','type','grant','sourceKey','thieves-cant',
      'target','language','key','thieves-cant',
      'payload',jsonb_build_object('label','Воровской жаргон')
    )
  );

  v_root_choices:=jsonb_build_array(
    jsonb_build_object(
      'key','rogue-skills',
      'label','Навыки: Разбойник',
      'target','proficiency',
      'count',4,
      'selection_mode','player_once',
      'required',true,
      'options',v_rogue_skill_options,
      'option_labels',v_skill_labels
    ),
    jsonb_build_object(
      'key','rogue-extra-language',
      'label','Дополнительный язык',
      'target','language',
      'count',1,
      'selection_mode','player_once',
      'required',true,
      'options',v_language_options,
      'option_labels',v_language_labels
    )
  );

  select id into v_rogue
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and (catalog_key='class:rogue' or slug='rogue-core')
  order by (catalog_key='class:rogue') desc,is_active desc,version desc,created_at desc
  limit 1;

  if v_rogue is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      catalog_key,catalog_revision,source_kind,source_label,is_builtin,
      mechanical_summary,author_description,author_comment,rules_meta
    ) values (
      p_campaign_id,'class','rogue-core','Разбойник',
      'Специалист по навыкам, скрытым атакам, мобильности и точному использованию уязвимых моментов.',
      1,v_base,v_root_choices,true,
      'class:rogue','xphb-2024-rogue-stage2-foundation-v1',
      'official','Player''s Handbook 2024',true,
      'К8 здоровья; Ловкость; спасброски Ловкости и Интеллекта; лёгкая броня; простое оружие и воинское оружие Finesse/Light; четыре навыка; Воровские инструменты; Компетентность; два Weapon Mastery; структурная прогрессия 1–20.',
      '','',
      jsonb_build_object(
        'class_key','rogue',
        'class_identity','rogue',
        'source_book','XPHB',
        'rules_revision','2024',
        'hit_die',8,
        'text_status','READY',
        'mechanics_status','IN_PROGRESS_STAGE2_FOUNDATION_READY',
        'runtime_stage',2,
        'runtime_revision','xphb-2024-rogue-stage2-foundation-v1',
        'reference_only_until_final_certification',true,
        'feature_runtime_included','foundation_only',
        'expertise_runtime',true,
        'expertise_choice_key','rogue_expertise',
        'expertise_dynamic_provider','skill_proficiencies',
        'weapon_mastery_choice_runtime',true,
        'weapon_mastery_choice_key','rogue_weapon_mastery',
        'weapon_mastery_dynamic_provider','weapon_proficiencies',
        'sneak_attack_progression_runtime',true,
        'subclass_unlock_level',3,
        'subclass_runtime_included',false,
        'core_gameplay_runtime_pending_stage3',true,
        'remaining_base_runtime_pending_stage4',true,
        'next_stage','rogue_core_gameplay_runtime',
        'core_traits',jsonb_build_object(
          'hit_die','d8',
          'primary_ability','dexterity',
          'saving_throws',jsonb_build_array('dexterity','intelligence'),
          'armor_training',jsonb_build_array('light'),
          'weapon_training',jsonb_build_array('simple','martial_finesse_or_light'),
          'tool_training',jsonb_build_array('thieves-tools'),
          'skill_choice_count',4
        )
      )
    ) returning id into v_rogue;
  else
    update public.rule_templates
    set
      slug='rogue-core',
      name='Разбойник',
      description='Специалист по навыкам, скрытым атакам, мобильности и точному использованию уязвимых моментов.',
      mechanics=v_base,
      choices=v_root_choices,
      catalog_key='class:rogue',
      catalog_revision='xphb-2024-rogue-stage2-foundation-v1',
      source_kind='official',
      source_label='Player''s Handbook 2024',
      is_builtin=true,
      is_active=true,
      mechanical_summary='К8 здоровья; Ловкость; спасброски Ловкости и Интеллекта; лёгкая броня; простое оружие и воинское оружие Finesse/Light; четыре навыка; Воровские инструменты; Компетентность; два Weapon Mastery; структурная прогрессия 1–20.',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'class_key','rogue','class_identity','rogue','source_book','XPHB',
        'rules_revision','2024','hit_die',8,'text_status','READY',
        'mechanics_status','IN_PROGRESS_STAGE2_FOUNDATION_READY',
        'runtime_stage',2,
        'runtime_revision','xphb-2024-rogue-stage2-foundation-v1',
        'reference_only_until_final_certification',true,
        'feature_runtime_included','foundation_only',
        'expertise_runtime',true,'expertise_choice_key','rogue_expertise',
        'expertise_dynamic_provider','skill_proficiencies',
        'weapon_mastery_choice_runtime',true,'weapon_mastery_choice_key','rogue_weapon_mastery',
        'weapon_mastery_dynamic_provider','weapon_proficiencies',
        'sneak_attack_progression_runtime',true,'subclass_unlock_level',3,
        'subclass_runtime_included',false,'core_gameplay_runtime_pending_stage3',true,
        'remaining_base_runtime_pending_stage4',true,'next_stage','rogue_core_gameplay_runtime',
        'core_traits',jsonb_build_object(
          'hit_die','d8','primary_ability','dexterity',
          'saving_throws',jsonb_build_array('dexterity','intelligence'),
          'armor_training',jsonb_build_array('light'),
          'weapon_training',jsonb_build_array('simple','martial_finesse_or_light'),
          'tool_training',jsonb_build_array('thieves-tools'),'skill_choice_count',4
        )
      ),
      updated_at=now()
    where id=v_rogue;
  end if;

  -- One active class identity only.
  update public.rule_templates
  set is_active=false,updated_at=now()
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:rogue'
    and id<>v_rogue
    and is_active;

  -- Stage 2 deliberately exposes no executable subclass package. This also
  -- neutralizes the retired historical catalog (including Scion of the Three)
  -- if an older campaign bootstrap recreates it before this trigger runs.
  update public.rule_templates
  set is_active=false,updated_at=now()
  where campaign_id=p_campaign_id
    and kind='subclass'
    and is_active
    and (
      parent_template_id=v_rogue
      or catalog_key like 'subclass:rogue:%'
      or slug like 'rogue-%'
    );

  for v_level in 1..20 loop
    v_level_mechanics:='[]'::jsonb;
    v_level_choices:='[]'::jsonb;

    for v_feature in
      select value from jsonb_array_elements(v_features)
      where (value->>'level')::integer=v_level
    loop
      v_level_mechanics:=v_level_mechanics||jsonb_build_array(
        private.rogue_stage2_feature_v1(
          'rogue-'||(v_feature->>'key')||'-feature-l'||v_level::text,
          v_feature->>'key',
          'class:rogue:'||(v_feature->>'key')||':l'||v_level::text,
          v_feature->>'name',
          v_feature->>'description',
          case
            when v_feature->>'key'='expertise' then jsonb_build_object(
              'kind','expertise_choice','choice_key','rogue_expertise',
              'count_by_level',jsonb_build_object('1',2,'6',4)
            )
            when v_feature->>'key'='weapon-mastery' then jsonb_build_object(
              'kind','weapon_mastery_choice','choice_key','rogue_weapon_mastery','count',2
            )
            when v_feature->>'key'='rogue-subclass' then jsonb_build_object(
              'kind','subclass_unlock','unlock_level',3,'runtime_owner','shared_template_hierarchy'
            )
            when v_feature->>'key'='ability-score-improvement' then jsonb_build_object(
              'kind','feat_choice','choice_count',1,'source_level',v_level,
              'allowed','ability_score_improvement_or_qualified_feat',
              'runtime_owner','generic_feat_source_pending'
            )
            when v_feature->>'key'='epic-boon' then jsonb_build_object(
              'kind','feat_choice','choice_count',1,'source_level',19,
              'allowed','epic_boon_or_qualified_feat',
              'runtime_owner','generic_feat_source_pending'
            )
            else jsonb_build_object('runtime_stage','pending')
          end
        )
      );
    end loop;

    if v_level in (1,3,5,7,9,11,13,15,17,19) then
      v_level_mechanics:=v_level_mechanics||jsonb_build_array(
        private.rogue_stage2_value_v1(
          'rogue-sneak-attack-dice-l'||v_level::text,
          'sneak-attack',
          'rogue_sneak_attack_dice',
          'Кости Скрытой атаки',
          ((v_level+1)/2)::integer,
          v_level
        ),
        private.rogue_stage2_value_v1(
          'rogue-sneak-attack-die-sides-l'||v_level::text,
          'sneak-attack',
          'rogue_sneak_attack_die_sides',
          'Граней кости Скрытой атаки',
          6,
          v_level
        )
      );
    end if;

    if v_level=1 then
      v_level_choices:=jsonb_build_array(
        jsonb_build_object(
          'key','rogue_expertise',
          'label','Компетентность',
          'target','proficiency',
          'count',2,
          'count_by_level',jsonb_build_object('1',2,'6',4),
          'selection_mode','player_once',
          'required',true,
          'options',v_skill_options,
          'option_labels',v_skill_labels,
          'option_provider',jsonb_build_object(
            'kind','skill_proficiencies','minimum_rank',1,'maximum_rank',1
          ),
          'option_mechanics',v_expertise_mechanics
        ),
        jsonb_build_object(
          'key','rogue_weapon_mastery',
          'label','Оружейное мастерство',
          'target','trait',
          'count',2,
          'selection_mode','player_once',
          'required',true,
          'refresh','long_rest',
          'options',v_weapon_options,
          'option_labels',v_weapon_labels,
          'option_provider',jsonb_build_object('kind','weapon_proficiencies'),
          'option_mechanics',v_mastery_mechanics
        )
      );
    end if;

    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(v_rogue,v_level,v_level_mechanics,v_level_choices)
    on conflict(template_id,level) do update
    set mechanics=excluded.mechanics,choices=excluded.choices;
  end loop;

  delete from public.rule_template_levels
  where template_id=v_rogue and (level<1 or level>20);
end;
$function$;

revoke all on function private.ensure_rogue_stage2_foundation_v1(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_rogue_stage2_foundation_v1(uuid)
to service_role;

create or replace function private.ensure_rogue_stage2_foundation_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_rogue_stage2_foundation_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_rogue_stage2_foundation_v1_after_campaign()
from public,anon,authenticated;

-- Historical official class/subclass installers use campaign* names. "m_" runs
-- after them, while leaving lexical room for later Rogue stages to run after us.
drop trigger if exists m_campaigns_ensure_rogue_stage2_foundation_v1 on public.campaigns;
create trigger m_campaigns_ensure_rogue_stage2_foundation_v1
after insert on public.campaigns
for each row execute function private.ensure_rogue_stage2_foundation_v1_after_campaign();

do $apply$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_rogue_stage2_foundation_v1(r.id);
  end loop;
end;
$apply$;

-- Fail closed: Stage 2 is complete only if the foundation is structurally exact.
do $cert$
declare
  r record;
  v_count integer;
  v_choice jsonb;
  v_bad integer;
  v_expected record;
begin
  for r in
    select id,campaign_id,catalog_revision,rules_meta
    from public.rule_templates
    where kind='class' and catalog_key='class:rogue' and is_active
  loop
    if r.catalog_revision<>'xphb-2024-rogue-stage2-foundation-v1' then
      raise exception 'ROGUE_STAGE2_BAD_REVISION:%:%',r.campaign_id,r.catalog_revision;
    end if;
    if r.rules_meta->>'mechanics_status'<>'IN_PROGRESS_STAGE2_FOUNDATION_READY'
       or coalesce((r.rules_meta->>'runtime_stage')::integer,0)<>2
       or coalesce((r.rules_meta->>'subclass_runtime_included')::boolean,true)
    then
      raise exception 'ROGUE_STAGE2_BAD_STATUS:%',r.campaign_id;
    end if;

    select count(*) into v_count from public.rule_template_levels where template_id=r.id;
    if v_count<>20 then raise exception 'ROGUE_STAGE2_LEVEL_COUNT:%:%',r.campaign_id,v_count; end if;

    select count(*) into v_bad
    from (values
      ('savingThrow:dexterity'),('savingThrow:intelligence'),('armor:light'),
      ('weapon:simple'),('weapon:martial-finesse-or-light'),('tool:thieves-tools')
    ) x(key)
    where not exists(
      select 1 from jsonb_array_elements(coalesce(
        (select mechanics from public.rule_templates where id=r.id),'[]'::jsonb
      )) m(value)
      where m.value->>'type'='grant'
        and m.value->>'target'='proficiency'
        and m.value->>'key'=x.key
    );
    if v_bad<>0 then raise exception 'ROGUE_STAGE2_BASE_PROFICIENCY_GAP:%:%',r.campaign_id,v_bad; end if;

    select c.value into v_choice
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
    where l.template_id=r.id and l.level=1 and c.value->>'key'='rogue_expertise'
    limit 1;
    if v_choice is null
       or v_choice->>'selection_mode'<>'player_once'
       or (v_choice->>'count')::integer<>2
       or (v_choice->'count_by_level'->>'6')::integer<>4
       or v_choice#>>'{option_provider,kind}'<>'skill_proficiencies'
    then
      raise exception 'ROGUE_STAGE2_EXPERTISE_INVALID:%',r.campaign_id;
    end if;

    select c.value into v_choice
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(value)
    where l.template_id=r.id and l.level=1 and c.value->>'key'='rogue_weapon_mastery'
    limit 1;
    if v_choice is null
       or (v_choice->>'count')::integer<>2
       or v_choice->>'refresh'<>'long_rest'
       or v_choice#>>'{option_provider,kind}'<>'weapon_proficiencies'
       or jsonb_array_length(v_choice->'options')<>38
    then
      raise exception 'ROGUE_STAGE2_WEAPON_MASTERY_INVALID:%',r.campaign_id;
    end if;

    for v_expected in
      select * from (values
        (1,1),(3,2),(5,3),(7,4),(9,5),(11,6),(13,7),(15,8),(17,9),(19,10)
      ) as x(level,dice_count)
    loop
      if not exists(
        select 1
        from public.rule_template_levels l
        cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
        where l.template_id=r.id
          and l.level=v_expected.level
          and m.value->>'type'='grant'
          and m.value->>'target'='value'
          and m.value->>'key'='rogue_sneak_attack_dice'
          and (m.value#>>'{payload,value}')::integer=v_expected.dice_count
      ) then
        raise exception 'ROGUE_STAGE2_SNEAK_ATTACK_PROGRESSION:%:%',r.campaign_id,v_expected.level;
      end if;
    end loop;

    select count(*) into v_bad
    from public.rule_templates s
    where s.campaign_id=r.campaign_id
      and s.kind='subclass'
      and s.is_active
      and (s.parent_template_id=r.id or s.catalog_key like 'subclass:rogue:%' or s.slug like 'rogue-%');
    if v_bad<>0 then raise exception 'ROGUE_STAGE2_SUBCLASS_RUNTIME_LEAK:%:%',r.campaign_id,v_bad; end if;

    if exists(
      select 1 from public.rule_templates s
      where s.campaign_id=r.campaign_id
        and s.catalog_key='subclass:rogue:scion-of-the-three'
        and s.is_active
    ) then
      raise exception 'ROGUE_STAGE2_RETIRED_SCION_ACTIVE:%',r.campaign_id;
    end if;
  end loop;

  select count(*) into v_bad
  from (
    select campaign_id,count(*) n
    from public.rule_templates
    where kind='class' and catalog_key='class:rogue' and is_active
    group by campaign_id
    having count(*)<>1
  ) q;
  if v_bad<>0 then raise exception 'ROGUE_STAGE2_DUPLICATE_ACTIVE_CLASS:%',v_bad; end if;
end;
$cert$;

commit;
