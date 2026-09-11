-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:bard
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/bardSpellRuntimeStage3.test.ts
-- CLASS_WORK_STATUS: bard:stage3_spells=READY,bard:mechanics=PENDING_STAGE4
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Bard Stage 3 promotes the audited 2024 spell contract into executable runtime.
-- It uses persistent Choice Runtime v2 selections plus the canonical shared
-- spell_slot_1..9 ledgers. No Bard-owned spell or slot table is introduced.

begin;

create or replace function private.bard_stage3_spell_mechanic_v1(p_slug text)
returns jsonb
language plpgsql
stable
set search_path=''
as $function$
declare
  v_spell public.spell_catalog%rowtype;
  v_method jsonb;
  v_payload jsonb;
begin
  select * into v_spell
  from public.spell_catalog
  where slug=p_slug;

  if not found then
    raise exception 'BARD_STAGE3_SPELL_NOT_FOUND:%',p_slug;
  end if;

  v_method:=jsonb_build_object(
    'key','bard-cast',
    'kind','class_spell',
    'ability','charisma',
    'saveDc',jsonb_build_object(
      'kind','add',
      'terms',jsonb_build_array(
        jsonb_build_object('kind','literal','value',8),
        jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
        jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
      )
    ),
    'attackBonus',jsonb_build_object(
      'kind','add',
      'terms',jsonb_build_array(
        jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
        jsonb_build_object('kind','reference','key','abilities.charisma.modifier')
      )
    ),
    'requiresPrepared',false
  );

  if v_spell.spell_level>0 then
    v_method:=v_method||jsonb_build_object(
      'resourceOptions',private.class_spell_slot_options(v_spell.spell_level)
    );
  end if;

  v_payload:=jsonb_build_object(
    'spell',jsonb_build_object(
      'name',coalesce(nullif(v_spell.name_ru,''),nullif(v_spell.name_en,''),v_spell.slug),
      'level',v_spell.spell_level,
      'school',v_spell.school,
      'ritual',coalesce(v_spell.ritual,false)
    ),
    'methods',jsonb_build_array(v_method),
    'preparation',jsonb_build_object(
      'mode',case when v_spell.spell_level=0 then 'not_required' else 'always_prepared' end
    )
  );

  return jsonb_build_object(
    'id','bard-stage3-spell-'||v_spell.slug,
    'key','spell:'||v_spell.slug,
    'type','spell',
    'payload',v_payload,
    'priority',1,
    'sourceKey','bard-stage3:spellcasting',
    'variantKey','bard:spellcasting:'||v_spell.slug,
    'catalogSlug',v_spell.slug,
    'grantOperation','GRANT'
  );
end;
$function$;

revoke all on function private.bard_stage3_spell_mechanic_v1(text)
from public,anon,authenticated;
grant execute on function private.bard_stage3_spell_mechanic_v1(text)
to service_role;

create or replace function private.bard_stage3_spell_unlock_level_v1(p_spell_level integer)
returns integer
language sql
immutable
set search_path=''
as $function$
  select case p_spell_level
    when 0 then 1
    when 1 then 1
    when 2 then 3
    when 3 then 5
    when 4 then 7
    when 5 then 9
    when 6 then 11
    when 7 then 13
    when 8 then 15
    when 9 then 17
    else 99
  end
$function$;

revoke all on function private.bard_stage3_spell_unlock_level_v1(integer)
from public,anon,authenticated;
grant execute on function private.bard_stage3_spell_unlock_level_v1(integer)
to service_role;

-- Canonical shared spell-slot ledger synchronizer for Bard assignments.
create or replace function private.sync_bard_spell_slots_stage3_v1(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_template_id uuid;
  v_level integer;
  v_profile jsonb;
  v_target jsonb;
  v_slot integer;
  v_base_max integer;
  v_actor uuid:=auth.uid();
begin
  select t.id,greatest(1,least(20,coalesce(a.template_level,1)))
  into v_template_id,v_level
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id
    and t.kind='class'
    and t.catalog_key='class:bard'
  order by a.assigned_at,a.id
  limit 1;

  if v_template_id is null then return; end if;

  select rules_meta->'sheet_profile' into v_profile
  from public.rule_templates
  where id=v_template_id;

  if v_profile is null or jsonb_typeof(v_profile)<>'object' then
    raise exception 'BARD_STAGE3_SHEET_PROFILE_MISSING:%',v_template_id;
  end if;

  v_target:=v_profile->'spell_slots_by_level'->v_level::text;
  if v_target is null or jsonb_typeof(v_target)<>'object' then
    raise exception 'BARD_STAGE3_SLOT_PROFILE_MISSING:%:%',v_template_id,v_level;
  end if;

  for v_slot in 1..9 loop
    v_base_max:=greatest(0,coalesce((v_target->>v_slot::text)::integer,0));

    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,updated_by
    ) values(
      p_character_id,
      'spell_slot_'||v_slot::text,
      v_base_max,
      v_base_max,
      'Ячейки заклинаний '||v_slot::text||' уровня',
      jsonb_build_object('triggers',jsonb_build_array('long_rest'),'restore','full'),
      v_actor
    )
    on conflict(character_id,state_key) do update set
      current=greatest(
        0,
        excluded.max_snapshot+public.character_resource_states.temporary_max_bonus
          -greatest(
            0,
            public.character_resource_states.max_snapshot-public.character_resource_states.current
          )
      ),
      max_snapshot=excluded.max_snapshot+public.character_resource_states.temporary_max_bonus,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=v_actor,
      updated_at=now();
  end loop;
end;
$function$;

revoke all on function private.sync_bard_spell_slots_stage3_v1(uuid)
from public,anon,authenticated;
grant execute on function private.sync_bard_spell_slots_stage3_v1(uuid)
to service_role;

-- Stage 3 installer runs only after the slot helper exists.
create or replace function private.ensure_bard_spell_runtime_stage3_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_bard uuid;
  v_choices jsonb;
  v_mechanics jsonb;
  v_cantrip_choice jsonb;
  v_spell_choice jsonb;
  v_cantrip_options jsonb;
  v_cantrip_labels jsonb;
  v_cantrip_mechanics jsonb;
  v_cantrip_unlocks jsonb;
  v_spell_options jsonb;
  v_spell_labels jsonb;
  v_spell_mechanics jsonb;
  v_spell_unlocks jsonb;
  v_spell_slots_by_level jsonb;
  v_prepared_by_level jsonb;
  v_cantrips_by_level jsonb;
  v_sheet_profile jsonb;
  r record;
begin
  perform private.ensure_bard_stage2_superior_inspiration_v2(p_campaign_id);

  select id into v_bard
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:bard'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_bard is null then
    raise exception 'BARD_STAGE3_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  select
    rules_meta->'spellcasting_contract'->'spell_slots_by_level',
    rules_meta->'spellcasting_contract'->'prepared_spells_by_level',
    rules_meta->'spellcasting_contract'->'cantrips_by_level'
  into v_spell_slots_by_level,v_prepared_by_level,v_cantrips_by_level
  from public.rule_templates
  where id=v_bard;

  if jsonb_typeof(v_spell_slots_by_level)<>'object'
     or jsonb_typeof(v_prepared_by_level)<>'object'
     or jsonb_typeof(v_cantrips_by_level)<>'object'
  then
    raise exception 'BARD_STAGE3_INERT_SPELL_CONTRACT_MISSING:%',v_bard;
  end if;

  select
    coalesce(jsonb_agg(s.slug order by s.sort_order,coalesce(s.name_ru,s.name_en),s.slug),'[]'::jsonb),
    coalesce(jsonb_object_agg(s.slug,coalesce(nullif(s.name_ru,''),nullif(s.name_en,''),s.slug)),'{}'::jsonb),
    coalesce(jsonb_object_agg(s.slug,jsonb_build_array(private.bard_stage3_spell_mechanic_v1(s.slug))),'{}'::jsonb),
    coalesce(jsonb_object_agg(s.slug,1),'{}'::jsonb)
  into v_cantrip_options,v_cantrip_labels,v_cantrip_mechanics,v_cantrip_unlocks
  from public.spell_catalog s
  where s.spell_level=0
    and exists(
      select 1 from public.spell_catalog_classes c
      where c.spell_id=s.id and c.class_key='bard'
    );

  select
    coalesce(jsonb_agg(s.slug order by s.spell_level,s.sort_order,coalesce(s.name_ru,s.name_en),s.slug),'[]'::jsonb),
    coalesce(jsonb_object_agg(s.slug,coalesce(nullif(s.name_ru,''),nullif(s.name_en,''),s.slug)),'{}'::jsonb),
    coalesce(jsonb_object_agg(s.slug,jsonb_build_array(private.bard_stage3_spell_mechanic_v1(s.slug))),'{}'::jsonb),
    coalesce(jsonb_object_agg(
      s.slug,
      case
        when exists(
          select 1 from public.spell_catalog_classes bard_link
          where bard_link.spell_id=s.id and bard_link.class_key='bard'
        )
          then private.bard_stage3_spell_unlock_level_v1(s.spell_level)
        else greatest(10,private.bard_stage3_spell_unlock_level_v1(s.spell_level))
      end
    ),'{}'::jsonb)
  into v_spell_options,v_spell_labels,v_spell_mechanics,v_spell_unlocks
  from public.spell_catalog s
  where s.spell_level between 1 and 9
    and exists(
      select 1 from public.spell_catalog_classes c
      where c.spell_id=s.id
        and c.class_key in ('bard','cleric','druid','wizard')
    );

  if jsonb_array_length(v_cantrip_options)=0
     or jsonb_array_length(v_spell_options)=0
  then
    raise exception 'BARD_STAGE3_EMPTY_SPELL_CATALOG:%',p_campaign_id;
  end if;

  v_cantrip_choice:=jsonb_build_object(
    'key','bard_cantrips','label','Заговоры барда','target','spell',
    'count',2,
    'count_by_level',jsonb_build_object('1',2,'4',3,'10',4),
    'selection_mode','player_once',
    'replacement_policy','on_level_change','replacement_limit',1,
    'options',v_cantrip_options,'option_labels',v_cantrip_labels,
    'option_unlock_level',v_cantrip_unlocks,'option_mechanics',v_cantrip_mechanics
  );

  v_spell_choice:=jsonb_build_object(
    'key','bard_prepared_spells','label','Подготовленные заклинания барда','target','spell',
    'count',4,
    'count_by_level',jsonb_build_object(
      '1',4,'2',5,'3',6,'4',7,'5',9,'6',10,'7',11,'8',12,'9',14,'10',15,
      '11',16,'12',16,'13',17,'14',17,'15',18,'16',18,'17',19,'18',20,'19',21,'20',22
    ),
    'selection_mode','player_once',
    'replacement_policy','on_level_change','replacement_limit',1,
    'options',v_spell_options,'option_labels',v_spell_labels,
    'option_unlock_level',v_spell_unlocks,'option_mechanics',v_spell_mechanics
  );

  select coalesce(choices,'[]'::jsonb),coalesce(mechanics,'[]'::jsonb)
  into v_choices,v_mechanics
  from public.rule_template_levels
  where template_id=v_bard and level=1
  for update;

  v_choices:=(
    select coalesce(jsonb_agg(c.value order by c.ord),'[]'::jsonb)
    from jsonb_array_elements(v_choices) with ordinality c(value,ord)
    where c.value->>'key' not in ('bard_cantrips','bard_prepared_spells')
  );

  v_mechanics:=(
    select coalesce(jsonb_agg(
      case
        when m.value->>'id'='bard-spellcasting-feature-l1' then
          jsonb_set(
            m.value,'{payload,description}',
            to_jsonb('Бард использует Харизму для своих заклинаний. Заговоры выбираются только из списка Барда и могут заменяться по одному при получении уровня барда. Список заклинаний 1+ сохраняется между отдыхами; при получении уровня барда можно заменить одно подготовленное заклинание. С 10 уровня Тайны магии позволяют новые и заменяемые заклинания 1+ выбирать из списков Барда, Жреца, Друида и Волшебника. Музыкальный инструмент можно использовать как фокусировку.'::text),
            true
          )
        else m.value
      end order by m.ord
    ),'[]'::jsonb)
    from jsonb_array_elements(v_mechanics) with ordinality m(value,ord)
    where m.value->>'id'<>'bard-spellcasting-focus-l1'
  );

  v_mechanics:=v_mechanics||jsonb_build_array(jsonb_build_object(
    'id','bard-spellcasting-focus-l1','type','grant','sourceKey','spellcasting',
    'target','permission','key','spellcasting_focus:musical_instrument',
    'payload',jsonb_build_object(
      'label','Фокусировка: музыкальный инструмент',
      'description','Музыкальный инструмент можно использовать как фокусировку для заклинаний барда.'
    )
  ));

  update public.rule_template_levels
  set choices=v_choices||jsonb_build_array(v_cantrip_choice,v_spell_choice),
      mechanics=v_mechanics
  where template_id=v_bard and level=1;

  v_sheet_profile:=jsonb_build_object(
    'spellcasting_enabled',true,
    'spellcasting_ability','charisma',
    'spell_list','bard',
    'spellcasting_focus','musical_instrument',
    'spell_slots_by_level',v_spell_slots_by_level,
    'prepared_spells_by_level',v_prepared_by_level,
    'cantrips_by_level',v_cantrips_by_level
  );

  update public.rule_templates
  set catalog_revision='xphb-2024-bard-stage3-spell-runtime-v1',
      mechanical_summary='К8 здоровья; Харизма; Вдохновение барда; полный заклинатель 1–20; постоянные заговоры и подготовленные заклинания; с 10 уровня Тайны магии расширяют выбор заклинаний 1+ на списки Барда, Жреца, Друида и Волшебника.',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','IN_PROGRESS_STAGE3_SPELL_RUNTIME_READY',
        'runtime_stage',3,
        'runtime_revision','xphb-2024-bard-stage3-spell-runtime-v1',
        'resource_runtime_included',true,
        'bardic_inspiration_runtime',true,
        'spell_slot_runtime_included',true,
        'spell_runtime_included',true,
        'spellcasting_ability','charisma',
        'spell_progression','full_caster',
        'spell_selection_mode','persistent_on_level_change',
        'prepared_spell_replacement_limit',1,
        'cantrip_replacement_limit',1,
        'magical_secrets_runtime',true,
        'magical_secrets_unlock_level',10,
        'magical_secrets_lists',jsonb_build_array('bard','cleric','druid','wizard'),
        'magical_secrets_cantrips',false,
        'spellcasting_focus','musical_instrument',
        'sheet_profile_deferred',false,
        'sheet_profile',v_sheet_profile,
        'subclass_runtime_included',false,
        'next_stage','bard_remaining_base_mechanics',
        'spellcasting_contract',
          coalesce(rules_meta->'spellcasting_contract','{}'::jsonb)
            ||jsonb_build_object('runtime_status','active')
      ),
      updated_at=now()
  where id=v_bard;

  perform private.sync_rule_template_spell_links(v_bard);

  for r in
    select distinct a.character_id
    from public.character_template_assignments a
    where a.template_id=v_bard
  loop
    perform private.sync_bard_spell_slots_stage3_v1(r.character_id);
    update public.character_sheets
    set spellcasting_enabled=true,
        spellcasting_ability=case
          when nullif(spellcasting_ability,'') is null then 'charisma'
          else spellcasting_ability
        end,
        updated_at=now()
    where character_id=r.character_id;
  end loop;
end;
$function$;

revoke all on function private.ensure_bard_spell_runtime_stage3_v1(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_bard_spell_runtime_stage3_v1(uuid)
to service_role;

create or replace function private.sync_bard_spell_slots_stage3_v1_after_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.sync_bard_spell_slots_stage3_v1(coalesce(new.character_id,old.character_id));
  return coalesce(new,old);
end;
$function$;

revoke all on function private.sync_bard_spell_slots_stage3_v1_after_assignment()
from public,anon,authenticated;

drop trigger if exists character_template_assignments_sync_bard_spell_slots_stage3_v1
on public.character_template_assignments;

create trigger character_template_assignments_sync_bard_spell_slots_stage3_v1
after insert or update of template_id,template_level,selected_choices or delete
on public.character_template_assignments
for each row execute function private.sync_bard_spell_slots_stage3_v1_after_assignment();

create or replace function private.ensure_bard_spell_runtime_stage3_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_bard_spell_runtime_stage3_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_bard_spell_runtime_stage3_v1_after_campaign()
from public,anon,authenticated;

drop trigger if exists aaaaaaaah_campaigns_ensure_bard_stage2_superior_inspiration_v2
on public.campaigns;
drop trigger if exists aaaaaaaai_campaigns_ensure_bard_spell_runtime_stage3_v1
on public.campaigns;

create trigger aaaaaaaai_campaigns_ensure_bard_spell_runtime_stage3_v1
after insert on public.campaigns
for each row execute function private.ensure_bard_spell_runtime_stage3_v1_after_campaign();

do $apply$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_bard_spell_runtime_stage3_v1(r.id);
  end loop;
end;
$apply$;

do $cert$
declare
  r record;
  v_cantrip_count integer;
  v_bard_levelled_count integer;
  v_union_levelled_count integer;
  v_link_count integer;
  v_choice jsonb;
  v_non_bard_bad integer;
begin
  select count(*) into v_cantrip_count
  from public.spell_catalog s
  where s.spell_level=0
    and exists(
      select 1 from public.spell_catalog_classes c
      where c.spell_id=s.id and c.class_key='bard'
    );

  select count(*) into v_bard_levelled_count
  from public.spell_catalog s
  where s.spell_level between 1 and 9
    and exists(
      select 1 from public.spell_catalog_classes c
      where c.spell_id=s.id and c.class_key='bard'
    );

  select count(*) into v_union_levelled_count
  from public.spell_catalog s
  where s.spell_level between 1 and 9
    and exists(
      select 1 from public.spell_catalog_classes c
      where c.spell_id=s.id and c.class_key in ('bard','cleric','druid','wizard')
    );

  for r in
    select rt.id,rt.campaign_id,rt.catalog_revision,rt.rules_meta,l.choices
    from public.rule_templates rt
    join public.rule_template_levels l on l.template_id=rt.id and l.level=1
    where rt.kind='class'
      and rt.catalog_key='class:bard'
      and rt.is_active
  loop
    if r.catalog_revision<>'xphb-2024-bard-stage3-spell-runtime-v1' then
      raise exception 'BARD_STAGE3_BAD_REVISION:%:%',r.campaign_id,r.catalog_revision;
    end if;

    if coalesce((r.rules_meta->'sheet_profile'->>'spellcasting_enabled')::boolean,false)<>true
       or r.rules_meta->'sheet_profile'->>'spellcasting_ability'<>'charisma'
       or r.rules_meta->'sheet_profile'->>'spellcasting_focus'<>'musical_instrument'
    then
      raise exception 'BARD_STAGE3_SHEET_PROFILE_INVALID:%',r.campaign_id;
    end if;

    select c.value into v_choice
    from jsonb_array_elements(coalesce(r.choices,'[]'::jsonb)) c(value)
    where c.value->>'key'='bard_cantrips';

    if v_choice is null
       or jsonb_array_length(v_choice->'options')<>v_cantrip_count
       or (v_choice->'count_by_level'->>'1')::integer<>2
       or (v_choice->'count_by_level'->>'4')::integer<>3
       or (v_choice->'count_by_level'->>'10')::integer<>4
       or (v_choice->>'replacement_limit')::integer<>1
    then
      raise exception 'BARD_STAGE3_CANTRIP_CHOICE_INVALID:%',r.campaign_id;
    end if;

    select c.value into v_choice
    from jsonb_array_elements(coalesce(r.choices,'[]'::jsonb)) c(value)
    where c.value->>'key'='bard_prepared_spells';

    if v_choice is null
       or jsonb_array_length(v_choice->'options')<>v_union_levelled_count
       or (v_choice->'count_by_level'->>'1')::integer<>4
       or (v_choice->'count_by_level'->>'10')::integer<>15
       or (v_choice->'count_by_level'->>'20')::integer<>22
       or (v_choice->>'replacement_limit')::integer<>1
    then
      raise exception 'BARD_STAGE3_PREPARED_CHOICE_INVALID:%',r.campaign_id;
    end if;

    select count(*) into v_non_bard_bad
    from public.spell_catalog s
    where s.spell_level between 1 and 9
      and not exists(
        select 1 from public.spell_catalog_classes b
        where b.spell_id=s.id and b.class_key='bard'
      )
      and exists(
        select 1 from public.spell_catalog_classes x
        where x.spell_id=s.id and x.class_key in ('cleric','druid','wizard')
      )
      and coalesce((v_choice->'option_unlock_level'->>s.slug)::integer,0)
          <>greatest(10,private.bard_stage3_spell_unlock_level_v1(s.spell_level));

    if v_non_bard_bad>0 then
      raise exception 'BARD_STAGE3_MAGICAL_SECRETS_GATE_INVALID:%:%',r.campaign_id,v_non_bard_bad;
    end if;

    select count(*) into v_link_count
    from public.rule_template_spell_links
    where template_id=r.id;

    if v_link_count<>v_cantrip_count+v_union_levelled_count then
      raise exception 'BARD_STAGE3_LINK_PARITY_INVALID:%:%:%',
        r.campaign_id,v_link_count,v_cantrip_count+v_union_levelled_count;
    end if;

    if coalesce((r.rules_meta->>'magical_secrets_cantrips')::boolean,true)<>false then
      raise exception 'BARD_STAGE3_MAGICAL_SECRETS_CANTRIP_SCOPE_INVALID:%',r.campaign_id;
    end if;
  end loop;
end;
$cert$;

commit;
