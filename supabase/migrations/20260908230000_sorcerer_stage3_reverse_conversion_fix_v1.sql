-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/sorcererMetamagicStage4.test.ts
-- CLASS_WORK_STATUS: sorcerer:stage3_reverse_conversion=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Forward-only correction to Stage 3. The 2024 Font of Magic rule still allows
-- a spell slot to be converted into Sorcery Points equal to the slot's level.
-- The conversion requires no action. The earlier Stage 3 metadata incorrectly
-- marked that direction as absent.

begin;

create or replace function private.ensure_sorcerer_stage3_reverse_conversion_fix_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sorcerer uuid;
  v_mechanics jsonb;
  v_unlock integer;
  v_slot integer;
begin
  perform private.ensure_sorcerer_font_of_magic_stage3_v1(p_campaign_id);

  select id into v_sorcerer
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:sorcerer'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_sorcerer is null then
    raise exception 'SORCERER_STAGE3_REVERSE_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  for v_unlock,v_slot in
    select * from (values
      (2,1),(3,2),(5,3),(7,4),(9,5),(11,6),(13,7),(15,8),(17,9)
    ) as conversion(unlock_level,slot_level)
  loop
    select coalesce(mechanics,'[]'::jsonb) into v_mechanics
    from public.rule_template_levels
    where template_id=v_sorcerer and level=v_unlock;

    v_mechanics := coalesce((
      select jsonb_agg(value order by ordinality)
      from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
      where value->>'id'<>('sorcerer-font-convert-slot-'||v_slot::text)
    ),'[]'::jsonb);

    v_mechanics := v_mechanics || jsonb_build_array(jsonb_build_object(
      'id','sorcerer-font-convert-slot-'||v_slot::text,
      'type','action',
      'sourceKey','font-of-magic',
      'key','font_of_magic_convert_slot_'||v_slot::text,
      'label','Преобразовать ячейку '||v_slot::text||' уровня в Очки чародейства',
      'economy','special',
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','spell_slot_'||v_slot::text,'amount',1
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','resource',
        'key','sorcery_points',
        'operation','RESTORE',
        'amount',v_slot
      )),
      'tags',jsonb_build_array('class','sorcerer','font_of_magic','spell_slot_conversion','no_action_required')
    ));

    update public.rule_template_levels
    set mechanics=v_mechanics
    where template_id=v_sorcerer and level=v_unlock;
  end loop;

  update public.rule_template_levels
  set mechanics=(
    select coalesce(jsonb_agg(
      case when value->>'id'='sorcerer-font-of-magic-feature-l2'
        then jsonb_set(
          value,
          '{payload,description}',
          to_jsonb('Со 2 уровня у вас есть Очки чародейства. Максимум очков равен вашему уровню чародея, все потраченные Очки восстанавливаются после долгого отдыха. Бонусным действием вы можете тратить Очки чародейства для создания ячеек 1–5 уровня по таблице Источника магии. Без действия вы также можете потратить одну имеющуюся ячейку заклинаний и восстановить Очки чародейства в количестве, равном уровню этой ячейки; запас не может превысить свой максимум.'::text),
          true
        )
        else value
      end
      order by ordinality
    ),'[]'::jsonb)
    from jsonb_array_elements(coalesce(rule_template_levels.mechanics,'[]'::jsonb)) with ordinality e(value,ordinality)
  )
  where template_id=v_sorcerer and level=2;

  update public.rule_templates
  set catalog_revision='xphb-2024-sorcerer-stage3-font-of-magic-v2',
      rules_meta=coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
        'runtime_revision','xphb-2024-sorcerer-stage3-font-of-magic-v2',
        'font_of_magic_reverse_conversion_runtime',true,
        'font_of_magic_reverse_conversion_action_required',false,
        'font_of_magic_reverse_conversion_levels',jsonb_build_array(1,2,3,4,5,6,7,8,9),
        'stage3_reverse_conversion_correction',true
      ),
      updated_at=now()
  where id=v_sorcerer;
end;
$function$;

revoke all on function private.ensure_sorcerer_stage3_reverse_conversion_fix_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_sorcerer_stage3_reverse_conversion_fix_v1(uuid) to service_role;

create or replace function private.ensure_sorcerer_stage3_reverse_conversion_fix_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_sorcerer_stage3_reverse_conversion_fix_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_sorcerer_stage3_reverse_conversion_fix_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaaf_campaigns_ensure_sorcerer_font_of_magic_stage3_v1 on public.campaigns;
drop trigger if exists aaaaaaaag_campaigns_ensure_sorcerer_stage3_reverse_conversion_fix_v1 on public.campaigns;
create trigger aaaaaaaag_campaigns_ensure_sorcerer_stage3_reverse_conversion_fix_v1
after insert on public.campaigns
for each row execute function private.ensure_sorcerer_stage3_reverse_conversion_fix_v1_after_campaign();

do $apply$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_sorcerer_stage3_reverse_conversion_fix_v1(r.id);
  end loop;
end;
$apply$;

commit;
