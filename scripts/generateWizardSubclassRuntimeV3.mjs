import fs from "node:fs"

import {
  WIZARD_SUBCLASS_RUNTIME_REVISION,
  wizardSubclassRuntimeBundles,
} from "../src/rule-templates/wizardSubclassMechanics.ts"

const target = process.argv[2]
if (!target) throw new Error("Migration target path is required")

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`
const subclasses = wizardSubclassRuntimeBundles.filter((bundle) => bundle.template.kind === "subclass")

const calls = subclasses.map((bundle) => {
  const levels = new Map(bundle.levels.map((row) => [row.level, row]))
  return `  perform private.upsert_wizard_subclass_runtime_v3(
    p_campaign_id, v_wizard,
    ${quote(bundle.template.slug)}, ${quote(bundle.template.catalog_key)}, ${quote(bundle.template.name)},
    ${quote(bundle.template.description)}, ${quote(bundle.template.mechanical_summary)},
    ${quote(bundle.template.source_label)}, ${quote(bundle.template.rules_meta.rules_revision)},
    ${json(levels.get(3)?.mechanics ?? [])}, ${json(levels.get(3)?.choices ?? [])},
    ${json(levels.get(6)?.mechanics ?? [])}, ${json(levels.get(6)?.choices ?? [])},
    ${json(levels.get(10)?.mechanics ?? [])}, ${json(levels.get(10)?.choices ?? [])},
    ${json(levels.get(14)?.mechanics ?? [])}, ${json(levels.get(14)?.choices ?? [])}
  );`
}).join("\n\n")

const sql = `-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardSubclassRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: wizard:text=READY;mechanics=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- Generated from src/rule-templates/wizardSubclassMechanics.ts.

begin;

create or replace function private.upsert_wizard_subclass_runtime_v3(
  p_campaign_id uuid,
  p_parent_template_id uuid,
  p_slug text,
  p_catalog_key text,
  p_name text,
  p_description text,
  p_mechanical_summary text,
  p_source_label text,
  p_rules_revision text,
  p_level_3 jsonb,
  p_choices_3 jsonb,
  p_level_6 jsonb,
  p_choices_6 jsonb,
  p_level_10 jsonb,
  p_choices_10 jsonb,
  p_level_14 jsonb,
  p_choices_14 jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_template uuid;
begin
  select id into v_template
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='subclass'
    and catalog_key=p_catalog_key
    and is_builtin is true
  order by is_active desc, version desc, created_at desc
  limit 1;

  if v_template is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,
      catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,
      author_description,author_comment,rules_meta,created_by,is_active
    ) values (
      p_campaign_id,'subclass',p_slug,p_name,p_description,1,'[]'::jsonb,'[]'::jsonb,p_parent_template_id,3,
      p_catalog_key,${quote(WIZARD_SUBCLASS_RUNTIME_REVISION)},'official',p_source_label,true,p_mechanical_summary,
      '','',jsonb_build_object(
        'base_class','class:wizard',
        'rules_revision',p_rules_revision,
        'mechanics_status','READY',
        'feature_levels',jsonb_build_array(3,6,10,14),
        'chat_template_actions',true,
        'chat_template_spells',true
      ),null,true
    ) returning id into v_template;
  else
    update public.rule_templates
    set slug=p_slug,
        name=p_name,
        description=p_description,
        mechanics='[]'::jsonb,
        choices='[]'::jsonb,
        parent_template_id=p_parent_template_id,
        unlock_level=3,
        catalog_revision=${quote(WIZARD_SUBCLASS_RUNTIME_REVISION)},
        source_kind='official',
        source_label=p_source_label,
        is_builtin=true,
        mechanical_summary=p_mechanical_summary,
        author_description='',
        author_comment='',
        rules_meta=jsonb_build_object(
          'base_class','class:wizard',
          'rules_revision',p_rules_revision,
          'mechanics_status','READY',
          'feature_levels',jsonb_build_array(3,6,10,14),
          'chat_template_actions',true,
          'chat_template_spells',true
        ),
        is_active=true,
        updated_at=now()
    where id=v_template;
  end if;

  delete from public.rule_template_levels where template_id=v_template;
  insert into public.rule_template_levels(template_id,level,mechanics,choices) values
    (v_template,3,p_level_3,p_choices_3),
    (v_template,6,p_level_6,p_choices_6),
    (v_template,10,p_level_10,p_choices_10),
    (v_template,14,p_level_14,p_choices_14);
end;
$function$;

create or replace function private.install_wizard_subclass_runtime_v3(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_wizard uuid;
begin
  perform private.install_wizard_2024_text_pack(p_campaign_id);
  perform private.install_wizard_2024_mechanics_v1(p_campaign_id);

  select id into v_wizard
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:wizard'
    and is_builtin is true
  order by is_active desc, version desc, created_at desc
  limit 1;
  if v_wizard is null then raise exception 'Built-in Wizard was not installed'; end if;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'subclasses_included',true,
        'subclass_supported_count',13,
        'subclass_mechanics_status','READY',
        'subclass_runtime_revision',${quote(WIZARD_SUBCLASS_RUNTIME_REVISION)}
      ),
      updated_at=now()
  where id=v_wizard;

${calls}
end;
$function$;

-- Power Surge is the first official pool whose rest rule sets an exact value.
-- This remains a generic resource primitive and is not Wizard-specific behavior.
create or replace function public.recover_character_resources(p_character_id uuid, p_trigger text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_state record;
  v_rule jsonb;
  v_restore text;
  v_amount integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Only GM or owner can restore resources'; end if;
  if p_trigger not in ('short_rest','long_rest','dawn') then raise exception 'Unsupported persistent recovery trigger'; end if;

  for v_state in
    select state_key,current,max_snapshot,recharge
    from public.character_resource_states
    where character_id=p_character_id
    for update
  loop
    v_rule := null;
    if v_state.recharge ? 'rules' then
      select value into v_rule
      from jsonb_array_elements(v_state.recharge->'rules')
      where value->>'trigger'=p_trigger
      limit 1;
    elsif exists(
      select 1
      from jsonb_array_elements_text(coalesce(v_state.recharge->'triggers','[]'::jsonb)) t(value)
      where t.value=p_trigger
    ) then
      v_rule := v_state.recharge;
    end if;

    if v_rule is null then continue; end if;
    v_restore := coalesce(v_rule->>'restore','full');
    if v_restore='amount' then
      v_amount := greatest(0,coalesce((v_rule->>'amount')::integer,0));
      update public.character_resource_states
      set current=least(max_snapshot,current+v_amount),updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_state.state_key;
    elsif v_restore='set' then
      v_amount := greatest(0,coalesce((v_rule->>'amount')::integer,0));
      update public.character_resource_states
      set current=least(max_snapshot,v_amount),updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_state.state_key;
    else
      update public.character_resource_states
      set current=max_snapshot,updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_state.state_key;
    end if;
  end loop;

  perform private.recover_character_runtime_facts(p_character_id,p_trigger);
end;
$function$;

create or replace function private.install_wizard_subclass_runtime_for_new_campaign_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.install_wizard_subclass_runtime_v3(new.id);
  return new;
end;
$function$;

drop trigger if exists zzzzz_campaigns_install_wizard_2024_subclass_runtime on public.campaigns;
create trigger zzzzz_campaigns_install_wizard_2024_subclass_runtime
after insert on public.campaigns
for each row execute function private.install_wizard_subclass_runtime_for_new_campaign_v3();

do $do$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_wizard_subclass_runtime_v3(v_campaign.id);
  end loop;
end
$do$;

commit;
`

fs.writeFileSync(target, sql)
