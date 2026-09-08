-- CLASS_MIGRATION_SCOPE: runtime
-- CLASS_INTEGRATION_STRICT: class:paladin
begin;

insert into public.spell_catalog(
  slug,name_en,name_ru,spell_level,school,casting_time,spell_range,area,duration,components,
  concentration,ritual,check_type,damage,effect_summary,upcast,notes,source,source_kind,license,
  sort_order,author_description,author_comment,roll_mode,roll_recipe
) values (
  'yolande-s-regal-presence','Yolande''s Regal Presence','Царственное присутствие Йоланды',5,'Enchantment',
  'Бонусное действие','На себя','Эманация 10 футов','Концентрация, до 1 минуты',array['В']::text[],true,false,
  'Спасбросок Мудрости','4d6 психического',
  'Выбранные существа, входящие в эманацию или заканчивающие там ход, совершают спасбросок Мудрости. При провале получают 4d6 психического урона и падают Ничком; при успехе получают половину урона без состояния Ничком.',
  'Урон увеличивается на 1d6 за каждый уровень ячейки выше 5.',
  'После успешного спасброска существо невосприимчиво к заклинанию до конца его длительности. Феи совершают спасбросок с Помехой.',
  'XPHB','official','PROPRIETARY',0,
  'Давит присутствием так убедительно, что противник сначала преклоняет колени, а уже потом разбирается, почему у него болит голова.',
  'Королевская осанка полезна. Особенно когда она наносит 4d6.','roll',
  '{"sequences":[{"key":"main","resolution":{"kind":"save","ability":"wisdom","dc":{"kind":"reference","key":"save_dc"},"onSuccess":"half"},"effects":[{"kind":"damage","dice":"4d6","damageType":"psychic"},{"kind":"condition","condition":"prone","on":"failed_save"}]}]}'::jsonb
)
on conflict(slug) do update set
  name_en=excluded.name_en,
  name_ru=coalesce(nullif(public.spell_catalog.name_ru,''),excluded.name_ru),
  spell_level=excluded.spell_level,school=excluded.school,casting_time=excluded.casting_time,
  spell_range=excluded.spell_range,area=excluded.area,duration=excluded.duration,components=excluded.components,
  concentration=excluded.concentration,ritual=excluded.ritual,check_type=excluded.check_type,damage=excluded.damage,
  effect_summary=excluded.effect_summary,upcast=excluded.upcast,notes=excluded.notes,source='XPHB',source_kind='official',
  license='PROPRIETARY',roll_mode=excluded.roll_mode,roll_recipe=excluded.roll_recipe,updated_at=now();

create or replace function private.paladin_stage4_spell_mechanic_v2(p_slug text,p_source_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_spell public.spell_catalog%rowtype;
  v_options jsonb;
begin
  select * into v_spell from public.spell_catalog where slug=p_slug;
  if v_spell.id is null then raise exception 'PALADIN_STAGE4_SPELL_NOT_FOUND:%',p_slug; end if;
  if v_spell.spell_level<1 or v_spell.spell_level>5 then raise exception 'PALADIN_STAGE4_SPELL_LEVEL_INVALID:%:%',p_slug,v_spell.spell_level; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'key','slot-'||g::text,
    'label','Ячейка '||g::text||' уровня',
    'costs',jsonb_build_array(jsonb_build_object('key','spell_slot_'||g::text,'amount',1)),
    'castLevel',g
  ) order by g),'[]'::jsonb)
  into v_options
  from generate_series(v_spell.spell_level,5) g;

  return jsonb_build_object(
    'id','paladin-oath-spell-'||replace(p_source_key,':','-')||'-'||p_slug,
    'key','spell:'||p_slug,
    'type','spell',
    'sourceKey',p_source_key,
    'variantKey',p_source_key||':'||p_slug,
    'catalogSlug',p_slug,
    'payload',jsonb_build_object(
      'spell',jsonb_build_object('name',coalesce(nullif(v_spell.name_ru,''),v_spell.name_en),'level',v_spell.spell_level,'school',v_spell.school,'ritual',v_spell.ritual),
      'methods',jsonb_build_array(jsonb_build_object('key',p_source_key||'-access','kind','class_spell','ability','charisma','resourceOptions',v_options,'requiresPrepared',false)),
      'preparation',jsonb_build_object('mode','always_prepared')
    )
  );
end;
$function$;
revoke all on function private.paladin_stage4_spell_mechanic_v2(text,text) from public,anon,authenticated;
grant execute on function private.paladin_stage4_spell_mechanic_v2(text,text) to service_role;

create or replace function private.paladin_stage4_upsert_subclass_v2(
  p_campaign_id uuid,p_catalog_key text,p_slug text,p_name text,p_summary text,p_author_description text,p_author_comment text
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_parent uuid;
  v_id uuid;
begin
  select id into v_parent
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:paladin' and is_active
  order by version desc,created_at desc limit 1;
  if v_parent is null then raise exception 'PALADIN_STAGE4_PARENT_NOT_FOUND:%',p_campaign_id; end if;

  select id into v_id
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key=p_catalog_key
  order by (catalog_revision='xphb-2024-paladin-subclasses-stage4-v2') desc,version desc,created_at desc limit 1;

  if v_id is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,parent_template_id,unlock_level,
      catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,author_description,author_comment,rules_meta
    ) values (
      p_campaign_id,'subclass',p_slug,p_name,p_summary,1,'[]'::jsonb,'[]'::jsonb,true,v_parent,3,
      p_catalog_key,'xphb-2024-paladin-subclasses-stage4-v2','official','Player''s Handbook 2024',true,
      p_summary,p_author_description,p_author_comment,
      '{"class_key":"paladin","parent_catalog_key":"class:paladin","rules_revision":"2024","runtime_stage":4,"runtime_revision":"xphb-2024-paladin-subclasses-stage4-v2","mechanics_status":"READY_STAGE4","spellcasting_ability":"charisma","oath_spells_always_prepared":true}'::jsonb
    ) returning id into v_id;
  else
    update public.rule_templates set
      slug=p_slug,name=p_name,
      description=case when btrim(coalesce(description,''))='' then p_summary else description end,
      parent_template_id=v_parent,unlock_level=3,catalog_revision='xphb-2024-paladin-subclasses-stage4-v2',
      source_kind='official',source_label='Player''s Handbook 2024',is_builtin=true,is_active=true,
      mechanical_summary=case when btrim(coalesce(mechanical_summary,''))='' then p_summary else mechanical_summary end,
      author_description=case when btrim(coalesce(author_description,''))='' then p_author_description else author_description end,
      author_comment=case when btrim(coalesce(author_comment,''))='' then p_author_comment else author_comment end,
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||'{"class_key":"paladin","parent_catalog_key":"class:paladin","rules_revision":"2024","runtime_stage":4,"runtime_revision":"xphb-2024-paladin-subclasses-stage4-v2","mechanics_status":"READY_STAGE4","spellcasting_ability":"charisma","oath_spells_always_prepared":true}'::jsonb,
      updated_at=now()
    where id=v_id;
  end if;

  update public.rule_templates set is_active=false,updated_at=now()
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key=p_catalog_key and id<>v_id and is_active;
  return v_id;
end;
$function$;
revoke all on function private.paladin_stage4_upsert_subclass_v2(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.paladin_stage4_upsert_subclass_v2(uuid,text,text,text,text,text,text) to service_role;

create or replace function private.paladin_stage4_set_level_v2(p_template_id uuid,p_level integer,p_mechanics jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  insert into public.rule_template_levels(template_id,level,mechanics,choices)
  values(p_template_id,p_level,coalesce(p_mechanics,'[]'::jsonb),'[]'::jsonb)
  on conflict(template_id,level) do update set mechanics=excluded.mechanics,choices=excluded.choices;
end;
$function$;
revoke all on function private.paladin_stage4_set_level_v2(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function private.paladin_stage4_set_level_v2(uuid,integer,jsonb) to service_role;

commit;