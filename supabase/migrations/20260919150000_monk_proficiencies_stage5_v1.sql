-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkOfficialPack.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: monk:proficiencies=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- Character Proficiencies Stage 5: restore canonical base proficiency grants
-- from the already-authored rules_meta.core_traits contract.

begin;

create or replace function private.ensure_monk_proficiencies_stage5_v1(
  p_campaign_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_monk uuid;
begin
  perform private.ensure_monk_catalog_v1(p_campaign_id);

  select id into v_monk
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:monk'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_monk is null then return; end if;

  update public.rule_templates t
  set mechanics =
      coalesce(t.mechanics,'[]'::jsonb)
      || case when not exists (
        select 1 from jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m
        where m->>'type'='grant' and m->>'target'='proficiency'
          and m->>'key'='weapon:simple'
      ) then jsonb_build_array(jsonb_build_object(
        'id','monk-stage5-weapon-simple',
        'type','grant',
        'target','proficiency',
        'key','weapon:simple',
        'sourceKey','weapon-simple',
        'payload',jsonb_build_object('rank',1,'label','Простое оружие')
      )) else '[]'::jsonb end
      || case when not exists (
        select 1 from jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m
        where m->>'type'='grant' and m->>'target'='proficiency'
          and m->>'key'='weapon:martial-light'
      ) then jsonb_build_array(jsonb_build_object(
        'id','monk-stage5-weapon-martial-light',
        'type','grant',
        'target','proficiency',
        'key','weapon:martial-light',
        'sourceKey','weapon-martial-light',
        'payload',jsonb_build_object(
          'rank',1,
          'label','Воинское оружие со свойством «Лёгкое»'
        )
      )) else '[]'::jsonb end
      || case when not exists (
        select 1 from jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m
        where m->>'type'='grant' and m->>'target'='proficiency'
          and m->>'key'='savingThrow:strength'
      ) then jsonb_build_array(jsonb_build_object(
        'id','monk-stage5-save-strength',
        'type','grant',
        'target','proficiency',
        'key','savingThrow:strength',
        'sourceKey','saving-throw-strength',
        'payload',jsonb_build_object('rank',1,'label','Спасбросок: Сила')
      )) else '[]'::jsonb end
      || case when not exists (
        select 1 from jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m
        where m->>'type'='grant' and m->>'target'='proficiency'
          and m->>'key'='savingThrow:dexterity'
      ) then jsonb_build_array(jsonb_build_object(
        'id','monk-stage5-save-dexterity',
        'type','grant',
        'target','proficiency',
        'key','savingThrow:dexterity',
        'sourceKey','saving-throw-dexterity',
        'payload',jsonb_build_object('rank',1,'label','Спасбросок: Ловкость')
      )) else '[]'::jsonb end,
      rules_meta=coalesce(t.rules_meta,'{}'::jsonb)||jsonb_build_object(
        'proficiency_stage5_status','READY',
        'proficiency_stage5_revision','monk-proficiencies-stage5-v1'
      ),
      updated_at=now()
  where t.id=v_monk;
end;
$$;

revoke all on function private.ensure_monk_proficiencies_stage5_v1(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_monk_proficiencies_stage5_v1(uuid)
to service_role;

create or replace function private.ensure_monk_proficiencies_stage5_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.ensure_monk_proficiencies_stage5_v1(new.id);
  return new;
end;
$$;

revoke all on function private.ensure_monk_proficiencies_stage5_v1_after_campaign()
from public,anon,authenticated;

drop trigger if exists zzzzz_monk_proficiencies_stage5_v1 on public.campaigns;
create trigger zzzzz_monk_proficiencies_stage5_v1
after insert on public.campaigns
for each row execute function private.ensure_monk_proficiencies_stage5_v1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.ensure_monk_proficiencies_stage5_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
