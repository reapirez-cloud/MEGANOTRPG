-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkSubclassBatch2.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:subclasses-batch2=RUNTIME_READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Precision pass for legacy-subclass compatibility with the rebuilt 2024 Monk.

begin;

create or replace function private.audit_monk_subclasses_batch2_precision_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_template uuid;
begin
  select id into v_template from public.rule_templates
  where campaign_id=p_campaign_id and kind='subclass' and catalog_key='subclass:monk:ascendant-dragon'
    and is_builtin is true and is_active
  order by version desc,created_at desc limit 1;

  if v_template is not null then
    update public.rule_template_levels l
    set mechanics=coalesce((
      select jsonb_agg(
        case
          when m->>'id'='dragon-ascendant-rules' then
            private.monk_subclass_feature(
              'dragon-ascendant-rules','monk:ascendant-dragon:ascendant','ascendant_aspect','Восходящий аспект',
              'Монах получает слепое зрение 10 футов. Когда он использует Дыхание дракона, он может потратить 1 Очко концентрации и усилить этот выдох: область становится 60-футовым конусом либо линией длиной 90 футов и шириной 5 футов, а урон равен четырём броскам текущего куба Боевых искусств вместо обычного урона Дыхания. Когда монах создаёт Аспект змея, выбранные видимые существа в ауре делают спасбросок Ловкости против СЛ концентрации; при провале получают 3к10 урона кислотой, холодом, огнём, электричеством или ядом по выбору монаха, при успехе — половину.'
            )
          else m
        end order by ord
      ) from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
    ),'[]'::jsonb) || case when l.level=17 then jsonb_build_array(
      private.monk_subclass_action(
        'dragon-augment-breath-action','monk:ascendant-dragon:ascendant','ascendant_aspect_augment_breath',
        'Восходящий аспект: усилить Дыхание','free',1,'[]'::jsonb,
        jsonb_build_array(jsonb_build_object(
          'kind','semantic','key','augment_dragon_breath','payload',jsonb_build_object(
            'cone_feet',60,'line_feet',90,'line_width_feet',5,
            'damage_dice','4 martial_arts_dice','save','dexterity','success','half'
          )
        )),
        '["subclass","requires-breath-of-the-dragon","replaces-normal-breath-damage"]'::jsonb
      )
    ) else '[]'::jsonb end
    where l.template_id=v_template;

    update public.rule_templates set
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'batch2_precision_audited',true,
        'ascendant_breath_uses_current_martial_arts_die',true,
        'ascendant_breath_upgrade_focus_cost',1
      ),updated_at=now()
    where id=v_template;
  end if;
end;
$$;

revoke all on function private.audit_monk_subclasses_batch2_precision_v1(uuid) from public,anon,authenticated;
grant execute on function private.audit_monk_subclasses_batch2_precision_v1(uuid) to service_role;

create or replace function private.audit_monk_subclasses_batch2_precision_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.audit_monk_subclasses_batch2_precision_v1(new.id);
  return new;
end;
$$;

revoke all on function private.audit_monk_subclasses_batch2_precision_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzzzzzzzz_campaigns_audit_monk_subclasses_batch2_precision on public.campaigns;
create trigger zzzzzzzzzzzzzz_campaigns_audit_monk_subclasses_batch2_precision
after insert on public.campaigns
for each row execute function private.audit_monk_subclasses_batch2_precision_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.audit_monk_subclasses_batch2_precision_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
