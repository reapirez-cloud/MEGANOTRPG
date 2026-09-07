-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:warlock
-- CLASS_PACKAGE_TEST: tests/warlockReadyStage4SupplementalSpellAccess.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- READY-plan Stage 4 repair. Supplemental patron expanded spell lists are legacy
-- spell-list additions, not always-prepared grants. Eligibility is authored as a
-- generic cross-template Choice Runtime requirement and enforced in UI/parser,
-- choice persistence, Pact Magic casting, and generic template-spell execution.

begin;

insert into public.spell_catalog(
  slug,name_en,name_ru,spell_level,school,casting_time,spell_range,area,duration,
  components,concentration,ritual,check_type,damage,effect_summary,upcast,notes,
  rules_text,source,source_kind,license,roll_mode,roll_recipe
) values
  ('wrathful-smite','Wrathful Smite','Гневная кара',1,'Evocation','Бонусное действие','На себя','','Концентрация, до 1 минуты',array['V'],true,false,'','','','','',null,'Player''s Handbook (legacy)','official',null,'contextual',null),
  ('branding-smite','Branding Smite','Клеймящая кара',2,'Evocation','Бонусное действие','На себя','','Концентрация, до 1 минуты',array['V'],true,false,'','','','','',null,'Player''s Handbook (legacy)','official',null,'contextual',null),
  ('staggering-smite','Staggering Smite','Ошеломляющая кара',4,'Evocation','Бонусное действие','На себя','','Концентрация, до 1 минуты',array['V'],true,false,'','','','','',null,'Player''s Handbook (legacy)','official',null,'contextual',null),
  ('banishing-smite','Banishing Smite','Изгоняющая кара',5,'Abjuration','Бонусное действие','На себя','','Концентрация, до 1 минуты',array['V'],true,false,'','','','','',null,'Player''s Handbook (legacy)','official',null,'contextual',null),
  ('bigbys-hand','Bigby''s Hand','Рука Бигби',5,'Evocation','Действие','120 футов','','Концентрация, до 1 минуты',array['V','S','M'],true,false,'','','','','',null,'Player''s Handbook (legacy)','official',null,'contextual',null),
  ('feign-death','Feign Death','Притворная смерть',3,'Necromancy','Действие','Касание','','1 час',array['V','S','M'],false,true,'','','','','',null,'Player''s Handbook (legacy)','official',null,'link',null)
on conflict(slug) do nothing;

create or replace function private.warlock_supplemental_spell_source_requirements_v1(p_slug text)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select coalesce(jsonb_agg(v.requirement order by v.ord),'[]'::jsonb)
  from (values
    (1,'shield',jsonb_build_object('catalog_key','subclass:warlock:hexblade')),
    (2,'wrathful-smite',jsonb_build_object('catalog_key','subclass:warlock:hexblade')),
    (3,'blur',jsonb_build_object('catalog_key','subclass:warlock:hexblade')),
    (4,'branding-smite',jsonb_build_object('catalog_key','subclass:warlock:hexblade')),
    (5,'blink',jsonb_build_object('catalog_key','subclass:warlock:hexblade')),
    (6,'elemental-weapon',jsonb_build_object('catalog_key','subclass:warlock:hexblade')),
    (7,'phantasmal-killer',jsonb_build_object('catalog_key','subclass:warlock:hexblade')),
    (8,'staggering-smite',jsonb_build_object('catalog_key','subclass:warlock:hexblade')),
    (9,'banishing-smite',jsonb_build_object('catalog_key','subclass:warlock:hexblade')),
    (10,'cone-of-cold',jsonb_build_object('catalog_key','subclass:warlock:hexblade')),

    (20,'create-or-destroy-water',jsonb_build_object('catalog_key','subclass:warlock:fathomless')),
    (21,'thunderwave',jsonb_build_object('catalog_key','subclass:warlock:fathomless')),
    (22,'gust-of-wind',jsonb_build_object('catalog_key','subclass:warlock:fathomless')),
    (23,'silence',jsonb_build_object('catalog_key','subclass:warlock:fathomless')),
    (24,'lightning-bolt',jsonb_build_object('catalog_key','subclass:warlock:fathomless')),
    (25,'sleet-storm',jsonb_build_object('catalog_key','subclass:warlock:fathomless')),
    (26,'control-water',jsonb_build_object('catalog_key','subclass:warlock:fathomless')),
    (27,'summon-elemental',jsonb_build_object('catalog_key','subclass:warlock:fathomless')),
    (28,'bigbys-hand',jsonb_build_object('catalog_key','subclass:warlock:fathomless')),
    (29,'cone-of-cold',jsonb_build_object('catalog_key','subclass:warlock:fathomless')),

    (40,'detect-evil-and-good',jsonb_build_object('catalog_key','subclass:warlock:genie')),
    (41,'phantasmal-force',jsonb_build_object('catalog_key','subclass:warlock:genie')),
    (42,'create-food-and-water',jsonb_build_object('catalog_key','subclass:warlock:genie')),
    (43,'phantasmal-killer',jsonb_build_object('catalog_key','subclass:warlock:genie')),
    (44,'creation',jsonb_build_object('catalog_key','subclass:warlock:genie')),
    (45,'wish',jsonb_build_object('catalog_key','subclass:warlock:genie')),
    (50,'sanctuary',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','dao')),
    (51,'spike-growth',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','dao')),
    (52,'meld-into-stone',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','dao')),
    (53,'stone-shape',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','dao')),
    (54,'wall-of-stone',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','dao')),
    (60,'thunderwave',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','djinni')),
    (61,'gust-of-wind',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','djinni')),
    (62,'wind-wall',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','djinni')),
    (63,'greater-invisibility',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','djinni')),
    (64,'seeming',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','djinni')),
    (70,'burning-hands',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','efreeti')),
    (71,'scorching-ray',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','efreeti')),
    (72,'fireball',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','efreeti')),
    (73,'fire-shield',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','efreeti')),
    (74,'flame-strike',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','efreeti')),
    (80,'fog-cloud',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','marid')),
    (81,'blur',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','marid')),
    (82,'sleet-storm',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','marid')),
    (83,'control-water',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','marid')),
    (84,'cone-of-cold',jsonb_build_object('catalog_key','subclass:warlock:genie','choice_key','warlock_genie_patron_kind','choice_option','marid')),

    (100,'bane',jsonb_build_object('catalog_key','subclass:warlock:undead')),
    (101,'false-life',jsonb_build_object('catalog_key','subclass:warlock:undead')),
    (102,'blindness-deafness',jsonb_build_object('catalog_key','subclass:warlock:undead')),
    (103,'phantasmal-force',jsonb_build_object('catalog_key','subclass:warlock:undead')),
    (104,'phantom-steed',jsonb_build_object('catalog_key','subclass:warlock:undead')),
    (105,'speak-with-dead',jsonb_build_object('catalog_key','subclass:warlock:undead')),
    (106,'death-ward',jsonb_build_object('catalog_key','subclass:warlock:undead')),
    (107,'greater-invisibility',jsonb_build_object('catalog_key','subclass:warlock:undead')),
    (108,'antilife-shell',jsonb_build_object('catalog_key','subclass:warlock:undead')),
    (109,'cloudkill',jsonb_build_object('catalog_key','subclass:warlock:undead')),

    (120,'false-life',jsonb_build_object('catalog_key','subclass:warlock:undying')),
    (121,'ray-of-sickness',jsonb_build_object('catalog_key','subclass:warlock:undying')),
    (122,'blindness-deafness',jsonb_build_object('catalog_key','subclass:warlock:undying')),
    (123,'silence',jsonb_build_object('catalog_key','subclass:warlock:undying')),
    (124,'feign-death',jsonb_build_object('catalog_key','subclass:warlock:undying')),
    (125,'speak-with-dead',jsonb_build_object('catalog_key','subclass:warlock:undying')),
    (126,'aura-of-life',jsonb_build_object('catalog_key','subclass:warlock:undying')),
    (127,'death-ward',jsonb_build_object('catalog_key','subclass:warlock:undying')),
    (128,'contagion',jsonb_build_object('catalog_key','subclass:warlock:undying')),
    (129,'legend-lore',jsonb_build_object('catalog_key','subclass:warlock:undying'))
  ) as v(ord,slug,requirement)
  where v.slug=p_slug;
$$;

create or replace function private.character_meets_choice_source_requirements_v1(
  p_character_id uuid,
  p_requirements jsonb
) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_requirement jsonb;
begin
  if p_requirements is null or jsonb_typeof(p_requirements)<>'array' or jsonb_array_length(p_requirements)=0 then
    return true;
  end if;

  for v_requirement in select value from jsonb_array_elements(p_requirements) loop
    if exists(
      select 1
      from public.character_template_assignments a
      join public.rule_templates t on t.id=a.template_id and t.is_active
      left join public.character_template_assignments parent
        on parent.character_id=a.character_id and parent.template_id=t.parent_template_id
      where a.character_id=p_character_id
        and t.catalog_key=v_requirement->>'catalog_key'
        and (
          t.kind<>'subclass'
          or greatest(1,coalesce(parent.template_level,1))>=greatest(1,coalesce(t.unlock_level,1))
        )
        and (
          nullif(v_requirement->>'choice_key','') is null
          or case jsonb_typeof(a.selected_choices->(v_requirement->>'choice_key'))
            when 'array' then exists(
              select 1 from jsonb_array_elements_text(a.selected_choices->(v_requirement->>'choice_key')) x(value)
              where nullif(v_requirement->>'choice_option','') is null or x.value=v_requirement->>'choice_option'
            )
            when 'string' then nullif(a.selected_choices->>(v_requirement->>'choice_key'),'') is not null
              and (nullif(v_requirement->>'choice_option','') is null or a.selected_choices->>(v_requirement->>'choice_key')=v_requirement->>'choice_option')
            else false
          end
        )
    ) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function private.validate_character_choice_source_requirements_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template public.rule_templates%rowtype;
  v_parent_level integer;
  v_source_level integer;
  v_definition jsonb;
  v_choice_key text;
  v_selected jsonb;
  v_option text;
  v_requirements jsonb;
begin
  select * into v_template from public.rule_templates where id=new.template_id;
  if v_template.id is null then return new; end if;

  if v_template.kind='subclass' then
    select template_level into v_parent_level
    from public.character_template_assignments
    where character_id=new.character_id and template_id=v_template.parent_template_id;
    v_source_level:=greatest(1,coalesce(v_parent_level,1));
  else
    v_source_level:=greatest(1,coalesce(new.template_level,1));
  end if;

  for v_definition in
    select d.value
    from jsonb_array_elements(coalesce(v_template.choices,'[]'::jsonb)) d(value)
    union all
    select d.value
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) d(value)
    where l.template_id=new.template_id and l.level<=v_source_level
  loop
    v_choice_key:=nullif(trim(coalesce(v_definition->>'key','')),'');
    if v_choice_key is null then continue; end if;
    v_selected:=new.selected_choices->v_choice_key;
    if jsonb_typeof(v_selected)='string' then v_selected:=jsonb_build_array(v_selected #>> '{}'); end if;
    if jsonb_typeof(v_selected)<>'array' then continue; end if;

    for v_option in select value from jsonb_array_elements_text(v_selected) loop
      v_requirements:=coalesce(v_definition->'option_rules'->v_option->'source_requirements_any','[]'::jsonb);
      if jsonb_typeof(v_requirements)='array' and jsonb_array_length(v_requirements)>0
         and not private.character_meets_choice_source_requirements_v1(new.character_id,v_requirements) then
        raise exception 'CHOICE_SOURCE_REQUIREMENT_UNMET:%:%',v_choice_key,v_option;
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

revoke all on function private.character_meets_choice_source_requirements_v1(uuid,jsonb) from public,anon,authenticated;
revoke all on function private.validate_character_choice_source_requirements_v1() from public,anon,authenticated;

drop trigger if exists character_choice_source_requirements_v1 on public.character_template_assignments;
create trigger character_choice_source_requirements_v1
before insert or update of selected_choices on public.character_template_assignments
for each row execute function private.validate_character_choice_source_requirements_v1();

create or replace function private.warlock_pact_spell_mechanic_v2(
  p_slug text,p_cast_level integer,p_priority integer,p_operation text default 'GRANT'
) returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_spell public.spell_catalog%rowtype;
  v_method jsonb;
  v_cast_level integer;
  v_is_base boolean;
  v_requirements jsonb;
begin
  select * into v_spell from public.spell_catalog where slug=p_slug;
  if v_spell.id is null then raise exception 'WARLOCK_PACT_SPELL_NOT_FOUND:%',p_slug; end if;

  select exists(select 1 from public.spell_catalog_classes sc where sc.spell_id=v_spell.id and sc.class_key='warlock') into v_is_base;
  v_requirements:=private.warlock_supplemental_spell_source_requirements_v1(p_slug);
  if not v_is_base and jsonb_array_length(v_requirements)=0 then
    raise exception 'WARLOCK_PACT_SPELL_NOT_ON_LIST:%',p_slug;
  end if;

  v_cast_level:=case when v_spell.spell_level=0 then 0 else greatest(v_spell.spell_level,greatest(1,coalesce(p_cast_level,v_spell.spell_level))) end;
  v_method:=jsonb_build_object(
    'key',case when v_spell.spell_level=0 then 'warlock-cantrip' else 'warlock-pact-'||v_cast_level end,
    'kind','pact_magic','ability','charisma',
    'saveDc',jsonb_build_object('kind','add','terms',jsonb_build_array(
      jsonb_build_object('kind','literal','value',8),jsonb_build_object('kind','reference','key','core.proficiencyBonus'),jsonb_build_object('kind','reference','key','abilities.charisma.modifier'))),
    'attackBonus',jsonb_build_object('kind','add','terms',jsonb_build_array(
      jsonb_build_object('kind','reference','key','core.proficiencyBonus'),jsonb_build_object('kind','reference','key','abilities.charisma.modifier'))),
    'requiresPrepared',false
  );
  if v_spell.spell_level>0 then
    v_method:=v_method||jsonb_build_object('resourceOptions',jsonb_build_array(jsonb_build_object(
      'key','warlock-pact-'||v_cast_level,'castLevel',v_cast_level,'costs',jsonb_build_array(jsonb_build_object('key','warlock_pact_slots','amount',1))
    )));
  end if;

  return jsonb_build_object(
    'id','warlock-base-pact-spell-'||p_slug||'-l'||greatest(1,p_priority),'type','spell','sourceKey','warlock-base:pact-magic',
    'key','spell:'||p_slug,'catalogSlug',p_slug,'variantKey','warlock-base:pact-magic:'||p_slug,
    'grantOperation',upper(coalesce(nullif(btrim(p_operation),''),'GRANT')),'priority',greatest(1,p_priority),
    'payload',jsonb_build_object('spell',jsonb_build_object('name',coalesce(nullif(v_spell.name_ru,''),v_spell.name_en),'level',v_spell.spell_level,'school',v_spell.school,'ritual',coalesce(v_spell.ritual,false)),
      'preparation',jsonb_build_object('mode','always_prepared'),'methods',jsonb_build_array(v_method))
  );
end;
$$;

create or replace function private.warlock_pact_magic_choice_v2(p_kind text)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_options jsonb:='[]'::jsonb;
  v_labels jsonb:='{}'::jsonb;
  v_unlocks jsonb:='{}'::jsonb;
  v_mechanics jsonb:='{}'::jsonb;
  v_by_level jsonb:='{}'::jsonb;
  v_rules jsonb:='{}'::jsonb;
  r record;
  v_unlock integer;
  v_entry jsonb;
begin
  if p_kind not in ('cantrip','prepared') then raise exception 'WARLOCK_PACT_CHOICE_KIND_INVALID:%',p_kind; end if;

  for r in
    select s.slug,s.spell_level,coalesce(nullif(s.name_ru,''),s.name_en) label,
      exists(select 1 from public.spell_catalog_classes sc where sc.spell_id=s.id and sc.class_key='warlock') is_base,
      private.warlock_supplemental_spell_source_requirements_v1(s.slug) source_requirements
    from public.spell_catalog s
    where (
      exists(select 1 from public.spell_catalog_classes sc where sc.spell_id=s.id and sc.class_key='warlock')
      or jsonb_array_length(private.warlock_supplemental_spell_source_requirements_v1(s.slug))>0
    ) and ((p_kind='cantrip' and s.spell_level=0) or (p_kind='prepared' and s.spell_level between 1 and 5))
    order by s.spell_level,coalesce(nullif(s.name_ru,''),s.name_en),s.slug
  loop
    v_options:=v_options||jsonb_build_array(r.slug);
    v_labels:=jsonb_set(v_labels,array[r.slug],to_jsonb(r.label),true);
    if not r.is_base and jsonb_array_length(r.source_requirements)>0 then
      v_rules:=jsonb_set(v_rules,array[r.slug],jsonb_build_object('source_requirements_any',r.source_requirements),true);
    end if;

    if p_kind='cantrip' then
      v_mechanics:=jsonb_set(v_mechanics,array[r.slug],jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,0,1,'GRANT')),true);
    else
      v_unlock:=case r.spell_level when 1 then 1 when 2 then 3 when 3 then 5 when 4 then 7 else 9 end;
      v_unlocks:=jsonb_set(v_unlocks,array[r.slug],to_jsonb(v_unlock),true);
      v_mechanics:=jsonb_set(v_mechanics,array[r.slug],jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,r.spell_level,1,'GRANT')),true);
      v_entry:=jsonb_build_object(
        '3',jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,greatest(2,r.spell_level),3,'REPLACE')),
        '5',jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,greatest(3,r.spell_level),5,'REPLACE')),
        '7',jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,greatest(4,r.spell_level),7,'REPLACE')),
        '9',jsonb_build_array(private.warlock_pact_spell_mechanic_v2(r.slug,5,9,'REPLACE'))
      );
      v_by_level:=jsonb_set(v_by_level,array[r.slug],v_entry,true);
    end if;
  end loop;

  if jsonb_array_length(v_options)=0 then raise exception 'WARLOCK_PACT_CHOICE_EMPTY:%',p_kind; end if;
  if p_kind='cantrip' then
    return jsonb_build_object('key','warlock_pact_magic_cantrips','label','Магия договора: кантрипы','target','trait','count',2,
      'count_by_level',jsonb_build_object('1',2,'4',3,'10',4),'options',v_options,'option_labels',v_labels,'option_rules',v_rules,
      'option_mechanics',v_mechanics,'selection_mode','player_once','replacement_policy','on_level_change','replacement_limit',1,'required',true,'resolved_as','class_spell');
  end if;
  return jsonb_build_object('key','warlock_pact_magic_spells','label','Магия договора: подготовленные заклинания','target','trait','count',2,
    'count_by_level',jsonb_build_object('1',2,'2',3,'3',4,'4',5,'5',6,'6',7,'7',8,'8',9,'9',10,'11',11,'13',12,'15',13,'17',14,'19',15),
    'options',v_options,'option_labels',v_labels,'option_unlock_level',v_unlocks,'option_rules',v_rules,'option_mechanics',v_mechanics,
    'option_mechanics_by_level',v_by_level,'selection_mode','player_once','replacement_policy','on_level_change','replacement_limit',1,'required',true,'resolved_as','class_spell');
end;
$$;

create or replace function public.cast_warlock_pact_spell_v1(p_character_id uuid,p_spell_catalog_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_spell_level integer;
  v_spell_slug text;
  v_spell_id uuid;
  v_slot_level integer;
  v_selected jsonb:='[]'::jsonb;
  v_state public.character_resource_states%rowtype;
  v_is_base boolean;
  v_requirements jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;

  select a.* into v_assignment from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id
  where a.character_id=p_character_id and t.kind='class' and t.catalog_key='class:warlock' and t.is_active
  order by t.version desc limit 1;
  if v_assignment.id is null then raise exception 'Active Warlock class assignment not found'; end if;

  select s.id,s.spell_level,s.slug into v_spell_id,v_spell_level,v_spell_slug from public.spell_catalog s where s.id=p_spell_catalog_id;
  if v_spell_level is null or v_spell_level<1 or v_spell_level>5 then raise exception 'Spell is not an eligible Pact Magic spell'; end if;
  select exists(select 1 from public.spell_catalog_classes sc where sc.spell_id=v_spell_id and sc.class_key='warlock') into v_is_base;
  v_requirements:=private.warlock_supplemental_spell_source_requirements_v1(v_spell_slug);
  if not v_is_base and (jsonb_array_length(v_requirements)=0 or not private.character_meets_choice_source_requirements_v1(p_character_id,v_requirements)) then
    raise exception 'Spell is not available from the active Warlock patron';
  end if;

  v_selected:=coalesce(v_assignment.selected_choices->'warlock_pact_magic_spells','[]'::jsonb);
  if jsonb_typeof(v_selected)='string' then v_selected:=jsonb_build_array(v_selected #>> '{}'); end if;
  if jsonb_typeof(v_selected)<>'array' then v_selected:='[]'::jsonb; end if;
  if not exists(select 1 from jsonb_array_elements_text(v_selected) x(value) where x.value=v_spell_slug) then
    raise exception 'Warlock spell is not selected by Pact Magic';
  end if;

  v_slot_level:=private.character_runtime_value_snapshot(p_character_id,'warlock_pact_slot_level')::integer;
  if v_spell_level>v_slot_level then raise exception 'Pact Magic slot level is too low'; end if;
  select * into v_state from public.character_resource_states where character_id=p_character_id and state_key='warlock_pact_slots' for update;
  if v_state.state_key is null then raise exception 'Pact Magic resource is not synchronized'; end if;
  if v_state.current<1 then raise exception 'Pact Magic slots are exhausted'; end if;
  update public.character_resource_states set current=current-1,updated_at=now(),updated_by=auth.uid()
  where character_id=p_character_id and state_key='warlock_pact_slots';
  return jsonb_build_object('spellCatalogId',p_spell_catalog_id,'castLevel',v_slot_level,'remaining',v_state.current-1,'max',v_state.max_snapshot);
end;
$$;

create or replace function private.warlock_stage4_spell_mechanic_v1(
  p_slug text,p_source_key text,p_resource_key text,p_method_key text,p_cast_level integer,p_include_pact_method boolean default false
) returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_spell public.spell_catalog%rowtype;
  v_methods jsonb;
  v_free_method jsonb;
  v_pact_method jsonb;
  v_is_base boolean;
  v_requirements jsonb;
begin
  select * into v_spell from public.spell_catalog where slug=p_slug;
  if v_spell.id is null then raise exception 'WARLOCK_STAGE4_SPELL_NOT_FOUND:%',p_slug; end if;
  select exists(select 1 from public.spell_catalog_classes sc where sc.spell_id=v_spell.id and sc.class_key='warlock') into v_is_base;
  v_requirements:=private.warlock_supplemental_spell_source_requirements_v1(p_slug);
  if not v_is_base and jsonb_array_length(v_requirements)=0 then raise exception 'WARLOCK_STAGE4_SPELL_NOT_ON_WARLOCK_LIST:%',p_slug; end if;
  if v_spell.spell_level<>p_cast_level then raise exception 'WARLOCK_STAGE4_SPELL_LEVEL_MISMATCH:%:expected=%:actual=%',p_slug,p_cast_level,v_spell.spell_level; end if;

  v_free_method:=jsonb_build_object('key',p_method_key,'kind','class_feature','ability','charisma','requiresPrepared',false,
    'resourceOptions',jsonb_build_array(jsonb_build_object('key',p_method_key,'castLevel',p_cast_level,'costs',jsonb_build_array(jsonb_build_object('key',p_resource_key,'amount',1)))));
  v_methods:=jsonb_build_array(v_free_method);
  if p_include_pact_method then
    v_pact_method:=jsonb_build_object('key','warlock-pact-5','kind','pact_magic','ability','charisma','requiresPrepared',false,
      'resourceOptions',jsonb_build_array(jsonb_build_object('key','warlock-pact-5','castLevel',5,'costs',jsonb_build_array(jsonb_build_object('key','warlock_pact_slots','amount',1)))));
    v_methods:=jsonb_build_array(v_pact_method)||v_methods;
  end if;
  return jsonb_build_object('id','warlock-stage4-spell-'||replace(replace(p_source_key,':','-'),'_','-')||'-'||p_slug,'type','spell','sourceKey',p_source_key,
    'key','spell:'||p_slug,'catalogSlug',p_slug,'variantKey',p_source_key||':'||p_slug,
    'payload',jsonb_build_object('spell',jsonb_strip_nulls(jsonb_build_object('name',coalesce(nullif(v_spell.name_ru,''),v_spell.name_en),'level',v_spell.spell_level,'school',nullif(v_spell.school,''),'ritual',coalesce(v_spell.ritual,false))),
      'preparation',jsonb_build_object('mode','always_prepared'),'methods',v_methods));
end;
$$;

create or replace function private.warlock_mystic_arcanum_choice_stage4_v1(p_spell_level integer)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_options jsonb:='[]'::jsonb;
  v_labels jsonb:='{}'::jsonb;
  v_mechanics jsonb:='{}'::jsonb;
  v_rules jsonb:='{}'::jsonb;
  v_key text:='warlock_mystic_arcanum_'||p_spell_level;
  v_source_key text:='warlock-base:mystic-arcanum-'||p_spell_level;
  r record;
begin
  if p_spell_level not in (6,7,8,9) then raise exception 'WARLOCK_STAGE4_ARCANUM_LEVEL_INVALID:%',p_spell_level; end if;
  for r in
    select s.slug,coalesce(nullif(s.name_ru,''),s.name_en) label,
      exists(select 1 from public.spell_catalog_classes sc where sc.spell_id=s.id and sc.class_key='warlock') is_base,
      private.warlock_supplemental_spell_source_requirements_v1(s.slug) source_requirements
    from public.spell_catalog s
    where s.spell_level=p_spell_level and (
      exists(select 1 from public.spell_catalog_classes sc where sc.spell_id=s.id and sc.class_key='warlock')
      or jsonb_array_length(private.warlock_supplemental_spell_source_requirements_v1(s.slug))>0
    )
    order by coalesce(nullif(s.name_ru,''),s.name_en),s.slug
  loop
    v_options:=v_options||jsonb_build_array(r.slug);
    v_labels:=jsonb_set(v_labels,array[r.slug],to_jsonb(r.label),true);
    if not r.is_base and jsonb_array_length(r.source_requirements)>0 then
      v_rules:=jsonb_set(v_rules,array[r.slug],jsonb_build_object('source_requirements_any',r.source_requirements),true);
    end if;
    v_mechanics:=jsonb_set(v_mechanics,array[r.slug],jsonb_build_array(private.warlock_stage4_spell_mechanic_v1(r.slug,v_source_key,v_key,'mystic-arcanum-'||p_spell_level,p_spell_level,false)),true);
  end loop;
  if jsonb_array_length(v_options)=0 then raise exception 'WARLOCK_STAGE4_ARCANUM_LIST_EMPTY:%',p_spell_level; end if;
  return jsonb_build_object('key',v_key,'label','Таинственный арканум: заклинание '||p_spell_level||' уровня','target','trait','count',1,
    'options',v_options,'option_labels',v_labels,'option_rules',v_rules,'option_mechanics',v_mechanics,'selection_mode','player_once',
    'replacement_policy','on_level_change','replacement_limit',1,'required',true,'resolved_as','class_spell');
end;
$$;

create or replace function public.use_character_template_spell_v1(p_character_id uuid,p_mechanic_id text,p_method_key text,p_option_key text default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template_id uuid; v_template_kind text; v_template_version integer; v_mechanic jsonb; v_source_key text; v_root_source_id text; v_source_id text; v_choice_key text; v_choice_option text;
  v_payload jsonb; v_method jsonb; v_option jsonb; v_cost jsonb; v_costs jsonb:='[]'::jsonb; v_key text; v_variant text; v_state_key text; v_amount integer; v_current integer; v_max integer; v_label text; v_recharge jsonb; v_preparation_mode text; v_requires_prepared boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if nullif(trim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;
  if nullif(trim(coalesce(p_method_key,'')),'') is null then raise exception 'Spell method is required'; end if;

  with assigned_raw as (
    select a.template_id,a.template_level,a.selected_choices,t.kind,t.version,t.unlock_level template_unlock_level,t.parent_template_id,t.mechanics,t.choices,
      case when t.kind='subclass' then greatest(1,coalesce(parent.template_level,1)) when t.kind='class' then greatest(1,coalesce(a.template_level,1)) else greatest(1,coalesce(c.level,1)) end effective_level
    from public.character_template_assignments a join public.rule_templates t on t.id=a.template_id and t.is_active join public.characters c on c.id=a.character_id
    left join public.character_template_assignments parent on parent.character_id=a.character_id and parent.template_id=t.parent_template_id
    where a.character_id=p_character_id and t.kind in ('class','subclass')
  ), assigned as (select * from assigned_raw where kind<>'subclass' or effective_level>=greatest(1,coalesce(template_unlock_level,1))),
  choice_defs as (
    select a.*,0 choice_unlock_level,d.value definition from assigned a cross join lateral jsonb_array_elements(coalesce(a.choices,'[]'::jsonb)) d(value)
    union all
    select a.*,l.level,d.value from assigned a join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) d(value)
  ), selected_options as (
    select d.*,s.option_key,s.ord,greatest(1,coalesce((select e.value::integer from jsonb_each_text(coalesce(d.definition->'count_by_level','{}'::jsonb)) e(key,value) where e.key~'^[0-9]+$' and e.key::integer<=d.effective_level order by e.key::integer desc limit 1),case when coalesce(d.definition->>'count','')~'^[0-9]+$' then (d.definition->>'count')::integer else null end,1)) allowed_count
    from choice_defs d cross join lateral jsonb_array_elements_text(case jsonb_typeof(d.selected_choices->(d.definition->>'key')) when 'array' then d.selected_choices->(d.definition->>'key') when 'string' then jsonb_build_array(d.selected_choices->>(d.definition->>'key')) else '[]'::jsonb end) with ordinality s(option_key,ord)
    where nullif(trim(coalesce(d.definition->>'key','')),'') is not null
  ), active_options as (
    select s.* from selected_options s where s.ord<=s.allowed_count
      and exists(select 1 from jsonb_array_elements_text(coalesce(s.definition->'options','[]'::jsonb)) o(value) where o.value=s.option_key)
      and s.effective_level>=greatest(1,coalesce(case when coalesce(s.definition->'option_unlock_level'->>s.option_key,'')~'^[0-9]+$' then (s.definition->'option_unlock_level'->>s.option_key)::integer else null end,1))
      and private.character_meets_choice_source_requirements_v1(p_character_id,coalesce(s.definition->'option_rules'->s.option_key->'source_requirements_any','[]'::jsonb))
  ), candidates as (
    select a.template_id,a.kind,a.version,0 unlock_level,m.value mechanic,null::text choice_key,null::text choice_option from assigned a cross join lateral jsonb_array_elements(coalesce(a.mechanics,'[]'::jsonb)) m(value) where m.value->>'id'=trim(p_mechanic_id)
    union all select a.template_id,a.kind,a.version,l.level,m.value,null::text,null::text from assigned a join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value) where m.value->>'id'=trim(p_mechanic_id)
    union all select o.template_id,o.kind,o.version,o.choice_unlock_level,m.value,o.definition->>'key',o.option_key from active_options o cross join lateral jsonb_array_elements(coalesce(o.definition->'option_mechanics'->o.option_key,'[]'::jsonb)) m(value) where m.value->>'id'=trim(p_mechanic_id)
    union all select o.template_id,o.kind,o.version,g.level_key::integer,m.value,o.definition->>'key',o.option_key from active_options o cross join lateral jsonb_each(coalesce(o.definition->'option_mechanics_by_level'->o.option_key,'{}'::jsonb)) g(level_key,mechanics) cross join lateral jsonb_array_elements(case when jsonb_typeof(g.mechanics)='array' then g.mechanics else '[]'::jsonb end) m(value) where g.level_key~'^[0-9]+$' and g.level_key::integer<=o.effective_level and m.value->>'id'=trim(p_mechanic_id)
  ) select template_id,kind,version,mechanic,choice_key,choice_option into v_template_id,v_template_kind,v_template_version,v_mechanic,v_choice_key,v_choice_option from candidates order by unlock_level desc limit 1;

  if v_template_id is null or v_mechanic is null then raise exception 'Class spell is unavailable'; end if;
  if coalesce(v_mechanic->>'type','')<>'spell' then raise exception 'Mechanic is not a spell'; end if;
  v_root_source_id:='template:'||v_template_kind||':'||v_template_id::text||':v'||v_template_version::text;
  if v_choice_key is not null and v_choice_option is not null then v_source_id:=v_root_source_id||':choice:'||v_choice_key||':'||v_choice_option;
  else v_source_key:=coalesce(nullif(trim(v_mechanic->>'sourceKey'),''),'mechanic:'||trim(p_mechanic_id)); v_source_id:=v_root_source_id||':source:'||v_source_key; end if;
  if exists(select 1 from public.character_source_suppressions s where s.character_id=p_character_id and s.source_id in(v_root_source_id,v_source_id)) then raise exception 'Class spell is disabled'; end if;

  v_payload:=coalesce(v_mechanic->'payload','{}'::jsonb); v_preparation_mode:=coalesce(v_payload->'preparation'->>'mode','');
  select value into v_method from jsonb_array_elements(coalesce(v_payload->'methods','[]'::jsonb)) where value->>'key'=trim(p_method_key) limit 1;
  if v_method is null then raise exception 'Spell method is unavailable'; end if;
  v_requires_prepared:=coalesce((v_method->>'requiresPrepared')::boolean,true);
  if v_requires_prepared and v_preparation_mode='prepared' then raise exception 'Prepared class-spell access requires resolved preparation state'; end if;
  if jsonb_array_length(coalesce(v_method->'resourceOptions','[]'::jsonb))>0 then
    select value into v_option from jsonb_array_elements(v_method->'resourceOptions') where value->>'key'=coalesce(p_option_key,'') limit 1;
    if v_option is null then raise exception 'Выбери ячейку или способ оплаты'; end if;
    for v_cost in select value from jsonb_array_elements(coalesce(v_option->'costs','[]'::jsonb)) loop
      v_key:=trim(coalesce(v_cost->>'key','')); v_variant:=coalesce(nullif(trim(v_cost->>'variantKey'),''),'default'); v_state_key:=case when v_variant='default' then v_key else v_key||'::'||v_variant end; v_amount:=greatest(1,coalesce((v_cost->>'amount')::integer,0));
      select current,max_snapshot,label,recharge into v_current,v_max,v_label,v_recharge from public.character_resource_states where character_id=p_character_id and state_key=v_state_key;
      if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if;
      v_costs:=v_costs||jsonb_build_array(jsonb_build_object('stateKey',v_state_key,'amount',v_amount,'current',v_current,'max',v_max,'label',coalesce(nullif(v_label,''),v_state_key),'recharge',v_recharge));
    end loop;
  elsif p_option_key is not null and nullif(trim(p_option_key),'') is not null then raise exception 'This spell method has no payment option'; end if;
  perform private.consume_character_resource_costs(p_character_id,v_costs,auth.uid());
end;
$$;

-- Regenerate only the affected Warlock choice surfaces for existing campaigns.
do $$
declare
  v_campaign record;
  v_warlock uuid;
  v_level integer;
  v_spell_level integer;
  v_choice jsonb;
  v_keep jsonb;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_warlock_pact_magic_selection_v2(v_campaign.id);

    select id into v_warlock from public.rule_templates
    where campaign_id=v_campaign.id and kind='class' and catalog_key='class:warlock' and is_active
    order by version desc,created_at desc limit 1;
    if v_warlock is null then continue; end if;

    foreach v_level in array array[11,13,15,17] loop
      v_spell_level:=case v_level when 11 then 6 when 13 then 7 when 15 then 8 else 9 end;
      v_choice:=private.warlock_mystic_arcanum_choice_stage4_v1(v_spell_level);
      insert into public.rule_template_levels(template_id,level,mechanics,choices)
      values(v_warlock,v_level,'[]'::jsonb,jsonb_build_array(v_choice)) on conflict(template_id,level) do nothing;
      select coalesce(jsonb_agg(c.value order by c.ord),'[]'::jsonb) into v_keep
      from jsonb_array_elements(coalesce((select choices from public.rule_template_levels where template_id=v_warlock and level=v_level),'[]'::jsonb)) with ordinality c(value,ord)
      where coalesce(c.value->>'key','')<>'warlock_mystic_arcanum_'||v_spell_level;
      update public.rule_template_levels set choices=v_keep||jsonb_build_array(v_choice) where template_id=v_warlock and level=v_level;
    end loop;

    update public.rule_templates set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
      'supplemental_patron_spell_access',true,
      'supplemental_patron_spell_access_revision','warlock-ready-stage4-source-gated-spells-v1'
    ),updated_at=now() where id=v_warlock;
  end loop;
end;
$$;

update public.rule_templates
set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
  'expanded_spell_access_runtime',true,
  'expanded_spell_access_policy','source_gated_warlock_selection'
),updated_at=now()
where is_active and catalog_key in (
  'subclass:warlock:hexblade','subclass:warlock:fathomless','subclass:warlock:genie','subclass:warlock:undead','subclass:warlock:undying'
);

-- Fail closed if any required legacy spell seed is still missing.
do $$
declare v_missing text;
begin
  select string_agg(slug,', ' order by slug) into v_missing
  from (values ('wrathful-smite'),('branding-smite'),('staggering-smite'),('banishing-smite'),('bigbys-hand'),('feign-death')) v(slug)
  where not exists(select 1 from public.spell_catalog s where s.slug=v.slug);
  if v_missing is not null then raise exception 'WARLOCK_READY_STAGE4_MISSING_SPELLS:%',v_missing; end if;
end;
$$;

commit;
