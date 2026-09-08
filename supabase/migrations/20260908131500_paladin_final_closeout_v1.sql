-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:paladin
-- CLASS_WORK_STATUS: paladin:CLOSED
-- Final closeout: remove stale deferred-stage metadata after the full class,
-- 15-oath runtime, UI/chat path, source reconciliation and smoke suite are certified.
begin;

update public.rule_templates
set rules_meta =
      (coalesce(rules_meta, '{}'::jsonb) - 'stage4_deferred')
      || jsonb_build_object(
        'runtime_stage', 5,
        'mechanics_status', 'READY',
        'class_work_status', 'READY',
        'feature_runtime_included', true,
        'spell_runtime_included', true,
        'subclass_runtime_included', true,
        'ui_chat_runtime_certified', true,
        'closeout_status', 'CLOSED',
        'closeout_revision', 'paladin-final-closeout-v1',
        'closed_at', '2026-09-08'
      ),
    updated_at = now()
where kind = 'class'
  and catalog_key = 'class:paladin'
  and is_active = true;

do $cert$
declare
  v_paladin record;
  v_oath_count integer;
  v_not_ready integer;
begin
  if not exists (
    select 1
    from public.rule_templates
    where kind = 'class'
      and catalog_key = 'class:paladin'
      and is_active = true
  ) then
    raise exception 'PALADIN_CLOSEOUT_CLASS_MISSING';
  end if;

  for v_paladin in
    select id, campaign_id, rules_meta
    from public.rule_templates
    where kind = 'class'
      and catalog_key = 'class:paladin'
      and is_active = true
  loop
    if v_paladin.rules_meta ? 'stage4_deferred' then
      raise exception 'PALADIN_CLOSEOUT_STALE_DEFERRED:%', v_paladin.campaign_id;
    end if;

    if coalesce(v_paladin.rules_meta->>'runtime_stage', '') <> '5'
       or coalesce(v_paladin.rules_meta->>'mechanics_status', '') <> 'READY'
       or coalesce(v_paladin.rules_meta->>'class_work_status', '') <> 'READY'
       or coalesce(v_paladin.rules_meta->>'closeout_status', '') <> 'CLOSED'
       or coalesce((v_paladin.rules_meta->>'feature_runtime_included')::boolean, false) is not true
       or coalesce((v_paladin.rules_meta->>'spell_runtime_included')::boolean, false) is not true
       or coalesce((v_paladin.rules_meta->>'subclass_runtime_included')::boolean, false) is not true
       or coalesce((v_paladin.rules_meta->>'ui_chat_runtime_certified')::boolean, false) is not true
    then
      raise exception 'PALADIN_CLOSEOUT_CLASS_STATUS_INVALID:%', v_paladin.campaign_id;
    end if;

    select count(*)
      into v_oath_count
    from public.rule_templates s
    where s.kind = 'subclass'
      and s.parent_template_id = v_paladin.id
      and s.catalog_key like 'subclass:paladin:%'
      and s.is_active = true;

    if v_oath_count <> 15 then
      raise exception 'PALADIN_CLOSEOUT_OATH_COUNT:%:%', v_paladin.campaign_id, v_oath_count;
    end if;

    select count(*)
      into v_not_ready
    from public.rule_templates s
    where s.kind = 'subclass'
      and s.parent_template_id = v_paladin.id
      and s.catalog_key like 'subclass:paladin:%'
      and s.is_active = true
      and (
        coalesce(s.rules_meta->>'runtime_stage', '') <> '5'
        or coalesce(s.rules_meta->>'mechanics_status', '') <> 'READY'
        or coalesce(s.rules_meta->>'runtime_revision', '') <> 'paladin-full-15-oaths-final-v3'
      );

    if v_not_ready <> 0 then
      raise exception 'PALADIN_CLOSEOUT_OATH_NOT_READY:%:%', v_paladin.campaign_id, v_not_ready;
    end if;
  end loop;
end;
$cert$;

commit;
