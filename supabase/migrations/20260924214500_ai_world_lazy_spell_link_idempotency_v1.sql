-- The rule_template_levels spell-contract trigger already materializes
-- rule_template_spell_links from cloned mechanics. Keep source-link copying only
-- as a gap filler so the lazy bundle stays idempotent.

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
    and p.proname='ensure_ai_world_class_bundle_v1'
    and pg_get_function_identity_arguments(p.oid)='p_campaign_id uuid, p_source_class_id uuid';

  if v_oid is null then
    raise exception 'ensure_ai_world_class_bundle_v1 not found';
  end if;

  v_def:=pg_get_functiondef(v_oid);

  v_next:=replace(
    v_def,
    'where l.template_id=v_source_class.id;',
    'where l.template_id=v_source_class.id
    on conflict on constraint rule_template_spell_links_pkey do nothing;'
  );
  if v_next=v_def then
    raise exception 'class spell-link patch target not found';
  end if;
  v_def:=v_next;

  v_next:=replace(
    v_def,
    'where l.template_id=v_source_subclass.id;',
    'where l.template_id=v_source_subclass.id
      on conflict on constraint rule_template_spell_links_pkey do nothing;'
  );
  if v_next=v_def then
    raise exception 'subclass spell-link patch target not found';
  end if;

  execute v_next;
end;
$patch$;
