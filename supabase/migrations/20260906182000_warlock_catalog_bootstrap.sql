-- CLASS_MIGRATION_SCOPE: infrastructure
-- CLASS_INTEGRATION_STRICT: class:warlock
-- CLASS_PACKAGE_TEST: tests/warlockOfficialPack.test.ts
-- CLASS_WORK_STATUS: warlock:catalog=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Clean Warlock 2024 catalog bootstrap. The legacy generic Warlock package was
-- deliberately retired; this creates only the new base class identity. No
-- subclass or Eldritch Invocation runtime is installed here.

begin;

create or replace function private.ensure_warlock_catalog_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_warlock uuid;
begin
  select id into v_warlock
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:warlock'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_warlock is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      catalog_key,catalog_revision,source_kind,source_label,is_builtin,
      mechanical_summary,author_description,author_comment,rules_meta
    ) values (
      p_campaign_id,
      'class',
      'warlock-core',
      'Колдун',
      'Колдун 2024 получает магию через договор: небольшой общий запас ячеек Магии договора восстанавливается после короткого или долгого отдыха, а высшие заклинания приходят через Таинственный арканум.',
      1,
      '[]'::jsonb,
      '[]'::jsonb,
      true,
      'class:warlock',
      'xphb-2024-warlock-catalog-v1',
      'official',
      'Player''s Handbook 2024',
      true,
      'Колдун 2024: Харизма, Магия договора, Магическая хитрость, Связь с покровителем, Таинственный арканум и Древнейший мастер. Инвокации и подклассы подключаются отдельными пакетами.',
      '',
      '',
      jsonb_build_object(
        'class_key','warlock',
        'class_identity','warlock',
        'source_book','XPHB',
        'rules_revision','2024',
        'hit_die',8,
        'spell_progression','pact_magic',
        'spellcasting_ability','charisma',
        'text_status','READY',
        'mechanics_status','PENDING_RUNTIME',
        'invocation_runtime_included',false,
        'subclass_runtime_included',false,
        'core_traits',jsonb_build_object(
          'hit_die','d8',
          'primary_ability','charisma',
          'saving_throws',jsonb_build_array('wisdom','charisma'),
          'armor_training',jsonb_build_array('light'),
          'weapon_training',jsonb_build_array('simple'),
          'skill_choice_count',2,
          'skill_choices',jsonb_build_array('arcana','deception','history','intimidation','investigation','nature','religion')
        )
      )
    );
  else
    update public.rule_templates
    set
      slug='warlock-core',
      name='Колдун',
      source_kind='official',
      source_label='Player''s Handbook 2024',
      is_builtin=true,
      catalog_revision=case
        when catalog_revision is null or catalog_revision='' then 'xphb-2024-warlock-catalog-v1'
        else catalog_revision
      end,
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'class_key','warlock',
        'class_identity','warlock',
        'source_book','XPHB',
        'rules_revision','2024',
        'hit_die',8,
        'spell_progression','pact_magic',
        'spellcasting_ability','charisma',
        'text_status','READY',
        'invocation_runtime_included',false,
        'subclass_runtime_included',false
      ),
      updated_at=now()
    where id=v_warlock;
  end if;
end;
$$;

revoke all on function private.ensure_warlock_catalog_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_warlock_catalog_v1(uuid) to service_role;

create or replace function private.ensure_warlock_catalog_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.ensure_warlock_catalog_v1(new.id);
  return new;
end;
$$;

revoke all on function private.ensure_warlock_catalog_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaab_campaigns_ensure_warlock_catalog_v1 on public.campaigns;
create trigger aaaaaaaab_campaigns_ensure_warlock_catalog_v1
after insert on public.campaigns
for each row execute function private.ensure_warlock_catalog_v1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.ensure_warlock_catalog_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;