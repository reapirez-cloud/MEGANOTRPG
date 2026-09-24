-- CLASS_MIGRATION_SCOPE: infrastructure
-- Correct the future-campaign Paladin bridge introduced by v1.
--
-- The bridge must run before final certification, therefore it must not require
-- runtime_stage=5 on oath templates: final certification itself is what
-- certifies those oath templates and writes stage 5 metadata.
--
-- Only capabilities that are already globally installed are bridged here:
-- assignment resource synchronization and the existing UI/chat runtime.

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
    raise exception 'PALADIN_PRECERT_CLASS_MISSING:%',p_campaign_id;
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
    raise exception 'PALADIN_PRECERT_OATH_COUNT:%:%',p_campaign_id,v_oath_count;
  end if;

  update public.rule_templates
  set rules_meta =
        coalesce(rules_meta,'{}'::jsonb)
        || jsonb_build_object(
          'assignment_resource_sync_included',true,
          'ui_chat_runtime_certified',true
        ),
      updated_at=now()
  where id=v_paladin;
end;
$function$;

revoke all on function private.apply_paladin_final_closeout_v1(uuid)
  from public,anon,authenticated;
grant execute on function private.apply_paladin_final_closeout_v1(uuid)
  to service_role;
