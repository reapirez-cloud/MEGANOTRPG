-- CLASS_MIGRATION_SCOPE: infrastructure
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkOfficialPack.test.ts
-- CLASS_WORK_STATUS: monk:catalog=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Monk 2024 catalog bootstrap. This deliberately runs before the base runtime
-- migration so both existing and newly-created campaigns always have the
-- parent class row before level mechanics/subclasses are installed.

begin;

create or replace function private.ensure_monk_catalog_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_monk uuid;
begin
  select id into v_monk
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:monk'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_monk is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      catalog_key,catalog_revision,source_kind,source_label,is_builtin,
      mechanical_summary,author_description,author_comment,rules_meta
    ) values (
      p_campaign_id,
      'class',
      'monk-core',
      'Монах',
      'Воин, который превращает дисциплину тела и разума в оружие. Монах сражается без тяжёлых доспехов, использует Боевые искусства и Очки концентрации, а на 3 уровне выбирает монашескую традицию.',
      1,
      '[]'::jsonb,
      '[]'::jsonb,
      true,
      'class:monk',
      'xphb-2024-monk-catalog-v1',
      'official',
      'Player''s Handbook 2024',
      true,
      'Монах 2024: Боевые искусства, Очки концентрации, движение без доспехов и классовая прогрессия уровней 1–20 устанавливаются runtime-пакетом Character Engine.',
      'Монах не ждёт, пока сталь или магия решат проблему за него. Он годами превращает собственное тело в инструмент, который всегда при нём.',
      'У хорошего монаха оружие трудно отобрать. Обычно потому, что для этого пришлось бы отобрать самого монаха.',
      jsonb_build_object(
        'class_key','monk',
        'source_book','XPHB',
        'rules_revision','2024',
        'hit_die',8,
        'spell_progression',null,
        'spellcasting_ability',null,
        'text_status','READY',
        'mechanics_status','PENDING_RUNTIME',
        'core_traits',jsonb_build_object(
          'hit_die','d8',
          'primary_ability','dexterity_wisdom',
          'saving_throws',jsonb_build_array('strength','dexterity'),
          'armor_training','[]'::jsonb,
          'weapon_training',jsonb_build_array('simple','martial_weapons_with_light_property'),
          'skill_choice_count',2,
          'skill_choices',jsonb_build_array('acrobatics','athletics','history','insight','religion','stealth')
        )
      )
    );
  else
    update public.rule_templates
    set
      slug='monk-core',
      name='Монах',
      source_kind='official',
      source_label='Player''s Handbook 2024',
      is_builtin=true,
      catalog_revision=case
        when catalog_revision is null or catalog_revision='' then 'xphb-2024-monk-catalog-v1'
        else catalog_revision
      end,
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'class_key','monk','source_book','XPHB','rules_revision','2024','text_status','READY'
      ),
      updated_at=now()
    where id=v_monk;
  end if;
end;
$$;

revoke all on function private.ensure_monk_catalog_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_monk_catalog_v1(uuid) to service_role;

create or replace function private.ensure_monk_catalog_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.ensure_monk_catalog_v1(new.id);
  return new;
end;
$$;

revoke all on function private.ensure_monk_catalog_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaa_campaigns_ensure_monk_catalog_v1 on public.campaigns;
create trigger aaaaaaaa_campaigns_ensure_monk_catalog_v1
after insert on public.campaigns
for each row execute function private.ensure_monk_catalog_v1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.ensure_monk_catalog_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
