-- CLASS_MIGRATION_SCOPE: infrastructure
-- Scope the tail of install_official_class_catalog to the campaign being
-- installed. The legacy function updated Druid templates across every campaign,
-- so creating a fresh campaign could touch an older campaign's legacy spell
-- mechanics and fail the current class-spell contract.

do $patch$
declare
  v_oid oid;
  v_def text;
  v_next text;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='install_official_class_catalog'
    and pg_get_function_identity_arguments(p.oid)='p_campaign_id uuid';

  if v_oid is null then
    raise exception 'install_official_class_catalog(uuid) not found';
  end if;

  v_def:=pg_get_functiondef(v_oid);

  v_next:=replace(
    v_def,
    'where t.catalog_key=''class:druid'';',
    'where t.campaign_id=p_campaign_id and t.catalog_key=''class:druid'';'
  );
  if v_next=v_def then
    raise exception 'class:druid campaign scope patch target not found';
  end if;
  v_def:=v_next;

  v_next:=replace(
    v_def,
    'where l.template_id=t.id and t.catalog_key in (''class:druid'',''subclass:druid:moon'');',
    'where l.template_id=t.id and t.campaign_id=p_campaign_id and t.catalog_key in (''class:druid'',''subclass:druid:moon'');'
  );
  if v_next=v_def then
    raise exception 'Druid level campaign scope patch target not found';
  end if;
  v_def:=v_next;

  execute v_def;
end;
$patch$;
