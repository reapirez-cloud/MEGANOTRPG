-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/clericFinalReconciliation.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: cleric:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

-- Production can legitimately contain the later Cleric runtime/L20 migrations
-- without the older final reconciliation: part of the historical chain was
-- deployed under different migration versions. Re-assert only the Cleric-local
-- pieces that are missing in that state. Do not rewrite old migrations and do
-- not replace shared resolver/resource functions here.

create or replace function private.cleric_prod_upsert_level_mechanic(
  p_catalog_key text,
  p_level integer,
  p_mechanic jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_template uuid; v_id text:=p_mechanic->>'id';
begin
  select id into v_template
  from public.rule_templates
  where catalog_key=p_catalog_key and is_active
  order by version desc,updated_at desc
  limit 1;

  if v_template is null or nullif(v_id,'') is null then return; end if;

  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(m order by ord)
    from (
      select m,ord
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(m,ord)
      where m->>'id'<>v_id
      union all
      select p_mechanic,1000000::bigint
    ) x
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=p_level;
end;
$$;

create or replace function private.cleric_prod_upsert_level_choice(
  p_catalog_key text,
  p_level integer,
  p_choice jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_template uuid; v_key text:=p_choice->>'key';
begin
  select id into v_template
  from public.rule_templates
  where catalog_key=p_catalog_key and is_active
  order by version desc,updated_at desc
  limit 1;

  if v_template is null or nullif(v_key,'') is null then return; end if;

  update public.rule_template_levels l
  set choices=coalesce((
    select jsonb_agg(c order by ord)
    from (
      select c,ord
      from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality e(c,ord)
      where c->>'key'<>v_key
      union all
      select p_choice,1000000::bigint
    ) x
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=p_level;
end;
$$;

create or replace function private.cleric_prod_cantrip_choice(
  p_choice_key text,
  p_label text,
  p_class_key text,
  p_source_key text,
  p_requires_choice_key text default null,
  p_requires_choice_option text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_options jsonb; v_labels jsonb; v_mechanics jsonb; v_choice jsonb;
begin
  select
    jsonb_agg(to_jsonb('spell:'||s.slug) order by coalesce(nullif(s.name_ru,''),s.name_en),s.slug),
    jsonb_object_agg('spell:'||s.slug,coalesce(nullif(s.name_ru,''),s.name_en)),
    jsonb_object_agg(
      'spell:'||s.slug,
      jsonb_build_array(jsonb_build_object(
        'id','cleric-prod-'||p_choice_key||'-'||s.slug,
        'type','spell',
        'key','spell:'||s.slug,
        'catalogSlug',s.slug,
        'variantKey',p_choice_key||':'||s.slug,
        'sourceKey',p_source_key,
        'payload',jsonb_build_object(
          'spell',jsonb_strip_nulls(jsonb_build_object(
            'name',coalesce(nullif(s.name_ru,''),s.name_en),
            'level',0,
            'school',s.school,
            'ritual',coalesce(s.ritual,false)
          )),
          'preparation',jsonb_build_object('mode','not_required'),
          'methods',jsonb_build_array(jsonb_build_object(
            'key',p_choice_key||':'||s.slug,
            'kind','class_spell',
            'ability','wisdom',
            'requiresPrepared',false
          ))
        )
      ))
    )
  into v_options,v_labels,v_mechanics
  from public.spell_catalog s
  where s.spell_level=0
    and exists(
      select 1
      from public.spell_catalog_classes sc
      where sc.spell_id=s.id and sc.class_key=p_class_key
    );

  if v_options is null or jsonb_array_length(v_options)=0 then
    raise exception 'No cantrips found for class %',p_class_key;
  end if;

  v_choice:=jsonb_build_object(
    'key',p_choice_key,
    'label',p_label,
    'target','trait',
    'count',1,
    'options',v_options,
    'option_labels',v_labels,
    'option_mechanics',v_mechanics
  );

  if p_requires_choice_key is not null and p_requires_choice_option is not null then
    v_choice:=v_choice || jsonb_build_object(
      'requires_choice',jsonb_build_object(
        'key',p_requires_choice_key,
        'option',p_requires_choice_option
      )
    );
  end if;

  return v_choice;
end;
$$;

-- Divine Order persisted values are prefixed. Historical production definitions
-- still had unprefixed label/mechanics maps, making an already selected order
-- look selected while resolving no CE mechanics. Keep assignment values intact
-- and make the definition maps use the exact persisted identities.
update public.rule_templates t
set choices=coalesce((
  select jsonb_agg(
    case when choice->>'key'='cleric-divine-order' then
      choice || jsonb_build_object(
        'option_labels',jsonb_build_object(
          'divine-order:protector','Защитник',
          'divine-order:thaumaturge','Чудотворец'
        ),
        'option_mechanics',jsonb_build_object(
          'divine-order:protector',coalesce(
            choice->'option_mechanics'->'divine-order:protector',
            choice->'option_mechanics'->'protector',
            jsonb_build_array(
              jsonb_build_object(
                'id','cleric-divine-order-protector-weapons',
                'type','grant','target','proficiency','key','category:martial_weapons',
                'payload',jsonb_build_object('rank',1,'label','Воинское оружие'),
                'sourceKey','divine-order:protector'
              ),
              jsonb_build_object(
                'id','cleric-divine-order-protector-armor',
                'type','grant','target','proficiency','key','category:heavy_armor',
                'payload',jsonb_build_object('rank',1,'label','Тяжёлая броня'),
                'sourceKey','divine-order:protector'
              )
            )
          ),
          'divine-order:thaumaturge',coalesce(
            choice->'option_mechanics'->'divine-order:thaumaturge',
            choice->'option_mechanics'->'thaumaturge',
            jsonb_build_array(jsonb_build_object(
              'id','cleric-divine-order-thaumaturge-rules',
              'type','grant','target','feature',
              'key','class:cleric:divine-order:thaumaturge',
              'sourceKey','divine-order:thaumaturge',
              'payload',jsonb_build_object(
                'label','Чудотворец',
                'description','Даёт ещё один заговор жреца. К проверкам Интеллекта (Магия или Религия) добавляется модификатор Мудрости, минимум +1.',
                'mechanic',jsonb_build_object(
                  'kind','check_bonus',
                  'skills',jsonb_build_array('arcana','religion'),
                  'ability','intelligence',
                  'bonusAbilityModifier','wisdom',
                  'minimumBonus',1,
                  'extraClericCantrips',1
                )
              )
            ))
          )
        )
      )
    else choice end
    order by ord
  )
  from jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) with ordinality e(choice,ord)
),'[]'::jsonb),
updated_at=now(),
rules_meta=coalesce(t.rules_meta,'{}'::jsonb) || jsonb_build_object(
  'class_work_status',
  coalesce(t.rules_meta->'class_work_status','{}'::jsonb)
    || jsonb_build_object('text','READY','mechanics','IN_PROGRESS')
)
where t.catalog_key='class:cleric' and t.is_active;

-- Thaumaturge's extra Cleric cantrip is a real persistent child choice. It is
-- inert unless the selected Divine Order is Thaumaturge.
update public.rule_templates t
set choices=coalesce((
  select jsonb_agg(c order by ord)
  from (
    select c,ord
    from jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) with ordinality e(c,ord)
    where c->>'key'<>'cleric-thaumaturge-cantrip'
    union all
    select private.cleric_prod_cantrip_choice(
      'cleric-thaumaturge-cantrip',
      'Чудотворец · дополнительный заговор',
      'cleric',
      'divine-order:thaumaturge',
      'cleric-divine-order',
      'divine-order:thaumaturge'
    ),1000000::bigint
  ) x
),'[]'::jsonb),updated_at=now()
where t.catalog_key='class:cleric' and t.is_active;

-- Nature Domain historically retained the prose card but production missed the
-- actual level-1 package. The subclass itself still unlocks at Cleric level 3;
-- these historical level-1 rows become active only after that root gate opens.
select private.cleric_prod_upsert_level_mechanic(
  'subclass:cleric:nature-domain',1,
  jsonb_build_object(
    'id','cleric-nature-heavy-runtime',
    'type','grant','target','proficiency','key','category:heavy_armor',
    'payload',jsonb_build_object('rank',1,'label','Тяжёлая броня'),
    'sourceKey','nature-domain-l1-1'
  )
);

select private.cleric_prod_upsert_level_choice(
  'subclass:cleric:nature-domain',1,
  jsonb_build_object(
    'key','nature-domain-skill',
    'label','Домен природы · навык',
    'target','proficiency',
    'count',1,
    'options',jsonb_build_array('skill:animal_handling','skill:nature','skill:survival'),
    'option_labels',jsonb_build_object(
      'skill:animal_handling','Уход за животными',
      'skill:nature','Природа',
      'skill:survival','Выживание'
    )
  )
);

select private.cleric_prod_upsert_level_choice(
  'subclass:cleric:nature-domain',1,
  private.cleric_prod_cantrip_choice(
    'nature-domain-cantrip',
    'Домен природы · заговор Друида',
    'druid',
    'nature-domain-l1-1'
  )
);

update public.rule_template_levels l
set choices=coalesce((
  select jsonb_agg(c order by ord)
  from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality e(c,ord)
  where c->>'key' not in ('cleric-nature-skill','cleric-nature-cantrip')
),'[]'::jsonb)
where l.template_id in (
  select id from public.rule_templates
  where is_active and catalog_key='subclass:cleric:nature-domain'
) and l.level=1;

-- These deliberate activations have no finite counter of their own. Expose the
-- action without inventing a fake resource; target/duration execution remains
-- governed by the exact feature text.
select private.cleric_prod_upsert_level_mechanic(
  'subclass:cleric:forge-domain',1,
  jsonb_build_object(
    'id','cleric-forge-blessing-action','type','action',
    'key','forge_blessing_of_the_forge','label','Благословение кузни',
    'economy','special','sourceKey','forge-domain-l1-1',
    'tags',jsonb_build_array('class','subclass','after:long-rest')
  )
);

select private.cleric_prod_upsert_level_mechanic(
  'subclass:cleric:trickery-domain',3,
  jsonb_build_object(
    'id','cleric-trickery-blessing-action','type','action',
    'key','trickery_blessing_of_the_trickster','label','Благословение обманщика',
    'economy','magic_action','sourceKey','trickery-domain-l3-1',
    'tags',jsonb_build_array('class','subclass','duration:1h')
  )
);

select private.cleric_prod_upsert_level_mechanic(
  'subclass:cleric:twilight-domain',1,
  jsonb_build_object(
    'id','cleric-twilight-vigilant-action','type','action',
    'key','twilight_vigilant_blessing','label','Бдительное благословение',
    'economy','action','sourceKey','twilight-domain-l1-1',
    'tags',jsonb_build_array('class','subclass','initiative')
  )
);

-- Divine Spark's prose already had the correct 7/13/18 scaling, while the
-- structured action still advertised a static 1d8 formula. Keep resource
-- accounting native and store the branch/save/scaling as an honest semantic
-- effect for renderers/executors without pretending CE observes the target.
update public.rule_template_levels l
set mechanics=coalesce((
  select jsonb_agg(
    case when m->>'id'='cleric-divine-spark' then
      jsonb_set(
        jsonb_set(
          m,
          '{tags}',
          coalesce((
            select jsonb_agg(tag order by tag_ord)
            from jsonb_array_elements(coalesce(m->'tags','[]'::jsonb)) with ordinality t(tag,tag_ord)
            where tag#>>'{}'<>'formula:1d8+wisdom'
          ),'[]'::jsonb),
          true
        ),
        '{effects}',
        coalesce((
          select jsonb_agg(effect order by effect_ord)
          from jsonb_array_elements(coalesce(m->'effects','[]'::jsonb)) with ordinality x(effect,effect_ord)
          where not (effect->>'kind'='semantic' and effect->>'key'='divine_spark')
        ),'[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
          'kind','semantic',
          'key','divine_spark',
          'payload',jsonb_build_object(
            'modes',jsonb_build_array('healing','damage'),
            'abilityModifier','wisdom',
            'saveAbility','constitution',
            'saveDc','cleric_spell_save_dc',
            'halfDamageOnSave',true,
            'damageTypes',jsonb_build_array('necrotic','radiant'),
            'diceByClericLevel',jsonb_build_object(
              '2','1d8','7','2d8','13','3d8','18','4d8'
            )
          )
        )),
        true
      )
    else m end
    order by ord
  )
  from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(m,ord)
),'[]'::jsonb)
where l.template_id in (
  select id from public.rule_templates where is_active and catalog_key='class:cleric'
)
and exists(
  select 1 from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
  where m->>'id'='cleric-divine-spark'
);

-- Rebuild relational spell links when that optional production helper exists.
do $$
declare r record;
begin
  if to_regprocedure('private.sync_rule_template_spell_links(uuid)') is not null then
    for r in
      select id from public.rule_templates
      where is_active and (catalog_key='class:cleric' or catalog_key like 'subclass:cleric:%')
    loop
      execute 'select private.sync_rule_template_spell_links($1)' using r.id;
    end loop;
  end if;
end $$;

-- Fail forward if the deployed package is still split-brain.
do $$
declare v_domains integer; v_bad integer;
begin
  select count(*) into v_domains
  from public.rule_templates
  where is_active and kind='subclass' and catalog_key like 'subclass:cleric:%';
  if v_domains<>14 then
    raise exception 'Cleric production reconciliation expected 14 active domains, got %',v_domains;
  end if;

  select count(*) into v_bad
  from public.rule_templates
  where is_active and kind='subclass' and catalog_key like 'subclass:cleric:%'
    and unlock_level<>3;
  if v_bad>0 then
    raise exception 'Cleric domain root unlock must remain Cleric level 3';
  end if;

  select count(*) into v_bad
  from public.rule_templates t
  cross join lateral jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) c(choice)
  where t.is_active and t.catalog_key='class:cleric'
    and c.choice->>'key'='cleric-divine-order'
    and (
      not (c.choice->'option_labels' ? 'divine-order:protector')
      or not (c.choice->'option_labels' ? 'divine-order:thaumaturge')
      or not (c.choice->'option_mechanics' ? 'divine-order:protector')
      or not (c.choice->'option_mechanics' ? 'divine-order:thaumaturge')
    );
  if v_bad>0 then
    raise exception 'Cleric Divine Order maps are still inconsistent';
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    cross join lateral jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) c(choice)
    where t.is_active and t.catalog_key='class:cleric'
      and c.choice->>'key'='cleric-thaumaturge-cantrip'
      and c.choice->'requires_choice'->>'key'='cleric-divine-order'
      and c.choice->'requires_choice'->>'option'='divine-order:thaumaturge'
  ) then
    raise exception 'Thaumaturge dependent cantrip choice is missing';
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.is_active and t.catalog_key='subclass:cleric:nature-domain'
      and l.level=1 and m->>'id'='cleric-nature-heavy-runtime'
  ) then
    raise exception 'Nature Domain heavy-armor grant is missing';
  end if;

  select count(distinct c.choice->>'key') into v_bad
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(choice)
  where t.is_active and t.catalog_key='subclass:cleric:nature-domain'
    and l.level=1 and c.choice->>'key' in ('nature-domain-skill','nature-domain-cantrip');
  if v_bad<>2 then
    raise exception 'Nature Domain level-1 choices are incomplete';
  end if;

  select count(distinct m->>'key') into v_bad
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
  where t.is_active and m->>'type'='action' and m->>'key' in (
    'forge_blessing_of_the_forge',
    'trickery_blessing_of_the_trickster',
    'twilight_vigilant_blessing'
  );
  if v_bad<>3 then
    raise exception 'Cleric resource-free action reconciliation incomplete';
  end if;

  if not exists(
    select 1
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    cross join lateral jsonb_array_elements(coalesce(m->'effects','[]'::jsonb)) effect
    where t.is_active and t.catalog_key='class:cleric'
      and m->>'id'='cleric-divine-spark'
      and effect->>'kind'='semantic' and effect->>'key'='divine_spark'
      and effect#>>'{payload,diceByClericLevel,7}'='2d8'
      and effect#>>'{payload,diceByClericLevel,13}'='3d8'
      and effect#>>'{payload,diceByClericLevel,18}'='4d8'
  ) then
    raise exception 'Divine Spark structured scaling is incomplete';
  end if;
end $$;

drop function private.cleric_prod_cantrip_choice(text,text,text,text,text,text);
drop function private.cleric_prod_upsert_level_choice(text,integer,jsonb);
drop function private.cleric_prod_upsert_level_mechanic(text,integer,jsonb);

commit;
