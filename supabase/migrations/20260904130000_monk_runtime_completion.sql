-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkRuntimeCompletion.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:base=RUNTIME_READY;subclasses=UNCHANGED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Final native mechanics that CE can represent truthfully without inventing
-- scene state. Armor-dependent AC/speed remain exact rules prose until equipped
-- armor/shield facts are authoritative Character Engine state.

begin;

create or replace function private.complete_monk_base_runtime(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_monk uuid;
  v_save text;
begin
  select id into v_monk
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:monk' and is_active
  order by version desc,created_at desc limit 1;
  if v_monk is null then return; end if;

  foreach v_save in array array['strength','dexterity','constitution','intelligence','wisdom','charisma'] loop
    update public.rule_template_levels
    set mechanics=mechanics||jsonb_build_array(jsonb_build_object(
      'id','monk-disciplined-save-'||v_save,
      'type','grant','target','proficiency','key','savingThrow:'||v_save,
      'sourceKey','monk-disciplined-survivor','grantOperation','GRANT','priority',14,
      'payload',jsonb_build_object('rank',1)
    ))
    where template_id=v_monk and level=14
      and not exists(
        select 1 from jsonb_array_elements(coalesce(mechanics,'[]'::jsonb)) m
        where m->>'id'='monk-disciplined-save-'||v_save
      );
  end loop;

  update public.rule_template_levels
  set mechanics=mechanics||jsonb_build_array(
    jsonb_build_object('id','monk-body-mind-dex-add','type','numeric','target','abilities.dexterity','operation','ADD','value',4,'sourceKey','monk-body-and-mind','priority',20),
    jsonb_build_object('id','monk-body-mind-dex-cap','type','numeric','target','abilities.dexterity','operation','MAX','value',25,'sourceKey','monk-body-and-mind','priority',20),
    jsonb_build_object('id','monk-body-mind-wis-add','type','numeric','target','abilities.wisdom','operation','ADD','value',4,'sourceKey','monk-body-and-mind','priority',20),
    jsonb_build_object('id','monk-body-mind-wis-cap','type','numeric','target','abilities.wisdom','operation','MAX','value',25,'sourceKey','monk-body-and-mind','priority',20)
  )
  where template_id=v_monk and level=20
    and not exists(
      select 1 from jsonb_array_elements(coalesce(mechanics,'[]'::jsonb)) m
      where m->>'id'='monk-body-mind-dex-add'
    );

  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(
      case
        when m->>'id'='monk-body-mind-rules' then
          jsonb_set(m,'{payload,description}',to_jsonb('Ловкость и Мудрость монаха увеличиваются на 4 каждая, но не выше 25. Повышение применяется автоматически к значениям характеристик.'::text),true)
        else m
      end order by ord
    )
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
  ),'[]'::jsonb)
  where l.template_id=v_monk and l.level=20;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
    'native_saving_throw_proficiencies',true,
    'native_body_and_mind',true,
    'armor_dependent_passives_policy','rules_prose_until_authoritative_equipment_facts'
  ),updated_at=now()
  where id=v_monk;
end;
$$;

revoke all on function private.complete_monk_base_runtime(uuid) from public,anon,authenticated;
grant execute on function private.complete_monk_base_runtime(uuid) to service_role;

create or replace function private.complete_monk_base_runtime_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.complete_monk_base_runtime(new.id);
  return new;
end;
$$;

revoke all on function private.complete_monk_base_runtime_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzzzzz_campaigns_complete_monk_base_runtime on public.campaigns;
create trigger zzzzzzzzzzz_campaigns_complete_monk_base_runtime
after insert on public.campaigns
for each row execute function private.complete_monk_base_runtime_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.complete_monk_base_runtime(v_campaign.id);
  end loop;
end;
$block$;

commit;