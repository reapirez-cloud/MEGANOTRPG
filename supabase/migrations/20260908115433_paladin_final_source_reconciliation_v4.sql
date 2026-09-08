begin;

create or replace function private.reconcile_paladin_sources_v4(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  update public.rule_templates
  set source_kind='custom',
      source_label='Тестовые материалы',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'source_category','playtest',
        'source_reconciliation_revision','paladin-final-source-reconciliation-v4'
      ),
      updated_at=now()
  where campaign_id=p_campaign_id
    and kind='subclass'
    and catalog_key='subclass:paladin:treachery'
    and is_active;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'official_oath_count',9,
        'additional_oath_count',6,
        'source_reconciliation_revision','paladin-final-source-reconciliation-v4'
      ),
      updated_at=now()
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:paladin'
    and is_active;
end;
$function$;

revoke all on function private.reconcile_paladin_sources_v4(uuid) from public,anon,authenticated;
grant execute on function private.reconcile_paladin_sources_v4(uuid) to service_role;

create or replace function private.reconcile_paladin_sources_v4_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.reconcile_paladin_sources_v4(new.id);
  return new;
end;
$function$;

revoke all on function private.reconcile_paladin_sources_v4_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaal_campaigns_reconcile_paladin_sources_v4 on public.campaigns;
create trigger aaaaaaaal_campaigns_reconcile_paladin_sources_v4
after insert on public.campaigns
for each row execute function private.reconcile_paladin_sources_v4_after_campaign();

do $block$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.reconcile_paladin_sources_v4(r.id);
  end loop;
end;
$block$;

commit;