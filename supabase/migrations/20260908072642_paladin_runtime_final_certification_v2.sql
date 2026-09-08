-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:paladin
-- CLASS_WORK_STATUS: paladin:runtime=READY
begin;

create or replace function private.certify_paladin_runtime_final_v2(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_paladin uuid;
  v_trigger_enabled text;
  v_def text;
begin
  perform private.certify_paladin_runtime_final_v1(p_campaign_id);

  select t.id into v_paladin
  from public.rule_templates t
  where t.campaign_id=p_campaign_id and t.kind='class' and t.catalog_key='class:paladin' and t.is_active
  limit 1;
  if v_paladin is null then raise exception 'PALADIN_FINAL_V2_CLASS_MISSING:%',p_campaign_id; end if;

  select tg.tgenabled::text into v_trigger_enabled
  from pg_catalog.pg_trigger tg
  join pg_catalog.pg_class c on c.oid=tg.tgrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='character_template_assignments'
    and tg.tgname='character_template_assignments_sync_paladin_resources_v1' and not tg.tgisinternal;
  if coalesce(v_trigger_enabled,'D') not in ('O','A') then
    raise exception 'PALADIN_FINAL_V2_ASSIGNMENT_RESOURCE_TRIGGER_DISABLED:%',coalesce(v_trigger_enabled,'missing');
  end if;

  if to_regprocedure('private.sync_paladin_character_resource_states_v1(uuid)') is null then
    raise exception 'PALADIN_FINAL_V2_RESOURCE_SYNC_FUNCTION_MISSING';
  end if;
  v_def:=pg_catalog.pg_get_functiondef('private.sync_paladin_character_resource_states_v1(uuid)'::regprocedure);
  if position('lay_on_hands' in v_def)=0
     or position('glory_glorious_defense' in v_def)=0
     or position('s.charisma' in v_def)=0
     or position('recoveryRules' in v_def)=0 then
    raise exception 'PALADIN_FINAL_V2_RESOURCE_SYNC_CONTRACT_INCOMPLETE';
  end if;

  if not exists(
    select 1 from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_paladin and l.level=1
      and m.value->>'type'='resource' and m.value->>'key'='lay_on_hands'
      and m.value#>>'{max,kind}'='multiply'
      and m.value#>>'{max,factors,0,value}'='5'
      and m.value#>>'{max,factors,1,key}'='source.level'
  ) then raise exception 'PALADIN_FINAL_V2_LAY_ON_HANDS_FORMULA_INVALID:%',p_campaign_id; end if;

  if not exists(
    select 1 from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_paladin and l.level=11
      and m.value->>'type'='resource' and m.value->>'key'='channel_divinity'
      and m.value->>'max'='3'
      and exists(select 1 from jsonb_array_elements(coalesce(m.value->'recoveryRules','[]'::jsonb)) r(value)
                 where r.value->>'trigger'='short_rest' and r.value->>'restore'='amount' and r.value->>'amount'='1')
      and exists(select 1 from jsonb_array_elements(coalesce(m.value->'recoveryRules','[]'::jsonb)) r(value)
                 where r.value->>'trigger'='long_rest' and r.value->>'restore'='full')
  ) then raise exception 'PALADIN_FINAL_V2_CHANNEL_DIVINITY_RECOVERY_INVALID:%',p_campaign_id; end if;

  if not exists(
    select 1 from public.rule_templates t
    where t.id=v_paladin
      and coalesce((t.rules_meta->>'assignment_resource_sync_included')::boolean,false)
      and coalesce((t.rules_meta->>'feature_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'spell_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'subclass_runtime_included')::boolean,false)
      and coalesce((t.rules_meta->>'ui_chat_runtime_certified')::boolean,false)
  ) then raise exception 'PALADIN_FINAL_V2_META_CONTRACT_INCOMPLETE:%',p_campaign_id; end if;

  if not exists(
    select 1 from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id and l.level=15
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where t.campaign_id=p_campaign_id and t.catalog_key='subclass:paladin:glory' and t.is_active
      and m.value->>'id'='glory-glorious-defense-resource' and m.value->>'key'='glory_glorious_defense'
      and m.value#>>'{max,kind}'='max' and m.value#>>'{max,values,1,key}'='abilities.charisma.modifier'
  ) then raise exception 'PALADIN_FINAL_V2_GLORY_RESOURCE_DEFINITION_INVALID:%',p_campaign_id; end if;

  update public.rule_templates
  set catalog_revision='xphb-2024-paladin-runtime-final-v2',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','READY','class_work_status','READY','runtime_stage',4,
        'runtime_revision','xphb-2024-paladin-runtime-final-v2','runtime_certified_at','2026-09-08',
        'assignment_resource_sync_included',true,'full_runtime_smoke_revision','paladin-full-runtime-smoke-v2'
      ),updated_at=now()
  where id=v_paladin;

  update public.rule_templates t
  set rules_meta=coalesce(t.rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','READY','runtime_stage',4,
        'runtime_revision','xphb-2024-paladin-runtime-final-v2','runtime_certified_at','2026-09-08'
      ),updated_at=now()
  where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active and t.catalog_key like 'subclass:paladin:%';
end;
$function$;

revoke all on function private.certify_paladin_runtime_final_v2(uuid) from public,anon,authenticated;
grant execute on function private.certify_paladin_runtime_final_v2(uuid) to service_role;

create or replace function private.certify_paladin_runtime_final_v2_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.certify_paladin_runtime_final_v2(new.id);
  return new;
end;
$function$;
revoke all on function private.certify_paladin_runtime_final_v2_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaah_campaigns_certify_paladin_runtime_final_v2 on public.campaigns;
create trigger aaaaaaaah_campaigns_certify_paladin_runtime_final_v2
after insert on public.campaigns
for each row execute function private.certify_paladin_runtime_final_v2_after_campaign();

do $block$
declare r record;
begin
  for r in select id from public.campaigns loop perform private.certify_paladin_runtime_final_v2(r.id); end loop;
end;
$block$;

commit;