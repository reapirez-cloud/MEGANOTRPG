-- CLASS_MIGRATION_SCOPE: infrastructure
-- Repair future campaign bootstrap for Paladin final closeout.
--
-- The historical closeout migration updated only campaigns that already existed
-- at migration time. New campaigns created later (including fresh AI-world
-- slots) therefore reached the final Paladin certification trigger without
-- ui_chat_runtime_certified / assignment_resource_sync_included and the INSERT
-- was aborted with PALADIN_V3_BASE_CONTRACT_INCOMPLETE.
--
-- Trigger ordering matters. PostgreSQL fires same-event triggers by name:
--   ...i  extended oaths
--   ...j  localization
--   ...jj closeout metadata (this migration)
--   ...k  final certification
--
-- This does not create world content. It only marks capabilities already
-- installed globally and finalizes the per-campaign Paladin rule template.

create or replace function private.apply_paladin_final_closeout_v1(
  p_campaign_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_paladin uuid;
  v_oath_count integer;
  v_not_ready integer;
begin
  select t.id
    into v_paladin
  from public.rule_templates t
  where t.campaign_id=p_campaign_id
    and t.kind='class'
    and t.catalog_key='class:paladin'
    and t.is_active
  order by t.version desc,t.created_at desc
  limit 1;

  if v_paladin is null then
    raise exception 'PALADIN_CLOSEOUT_CLASS_MISSING:%',p_campaign_id;
  end if;

  select count(*)
    into v_oath_count
  from public.rule_templates s
  where s.campaign_id=p_campaign_id
    and s.kind='subclass'
    and s.parent_template_id=v_paladin
    and s.catalog_key like 'subclass:paladin:%'
    and s.is_active;

  if v_oath_count<>15 then
    raise exception 'PALADIN_CLOSEOUT_OATH_COUNT:%:%',p_campaign_id,v_oath_count;
  end if;

  select count(*)
    into v_not_ready
  from public.rule_templates s
  where s.campaign_id=p_campaign_id
    and s.kind='subclass'
    and s.parent_template_id=v_paladin
    and s.catalog_key like 'subclass:paladin:%'
    and s.is_active
    and (
      coalesce(s.rules_meta->>'runtime_stage','')<>'5'
      or coalesce(s.rules_meta->>'mechanics_status','')<>'READY'
      or coalesce(s.rules_meta->>'runtime_revision','')<>'paladin-full-15-oaths-final-v3'
    );

  if v_not_ready<>0 then
    raise exception 'PALADIN_CLOSEOUT_OATH_NOT_READY:%:%',p_campaign_id,v_not_ready;
  end if;

  update public.rule_templates
  set rules_meta =
        (coalesce(rules_meta,'{}'::jsonb)-'stage4_deferred')
        || jsonb_build_object(
          'runtime_stage',5,
          'mechanics_status','READY',
          'class_work_status','READY',
          'feature_runtime_included',true,
          'spell_runtime_included',true,
          'subclass_runtime_included',true,
          'assignment_resource_sync_included',true,
          'ui_chat_runtime_certified',true,
          'closeout_status','CLOSED',
          'closeout_revision','paladin-final-closeout-v1',
          'closed_at','2026-09-08'
        ),
      updated_at=now()
  where id=v_paladin;
end;
$function$;

revoke all on function private.apply_paladin_final_closeout_v1(uuid)
  from public,anon,authenticated;
grant execute on function private.apply_paladin_final_closeout_v1(uuid)
  to service_role;

create or replace function private.apply_paladin_final_closeout_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.apply_paladin_final_closeout_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.apply_paladin_final_closeout_v1_after_campaign()
  from public,anon,authenticated;

drop trigger if exists aaaaaaaajj_campaigns_apply_paladin_final_closeout_v1
  on public.campaigns;

create trigger aaaaaaaajj_campaigns_apply_paladin_final_closeout_v1
after insert on public.campaigns
for each row
execute function private.apply_paladin_final_closeout_v1_after_campaign();

-- Normalize existing campaigns as well. This is idempotent.
do $closeout$
declare
  r record;
begin
  for r in select id from public.campaigns loop
    perform private.apply_paladin_final_closeout_v1(r.id);
  end loop;
end;
$closeout$;
