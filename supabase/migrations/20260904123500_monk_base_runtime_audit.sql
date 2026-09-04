-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:monk
-- CLASS_PACKAGE_TEST: tests/monkOfficialPack.test.ts
--
-- Normalize the Monk pack to the current StoredMechanic contract and keep
-- implementation language out of player-facing feature text.

begin;

create or replace function private.audit_monk_base_runtime_v1(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_monk uuid;
begin
  select id into v_monk
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:monk' and is_active
  order by version desc,created_at desc limit 1;
  if v_monk is null then return; end if;

  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(
      case
        when m->>'type'='grant' and m->>'target'='resource' then
          jsonb_strip_nulls(jsonb_build_object(
            'id',m->>'id',
            'type','resource',
            'sourceKey',m->>'sourceKey',
            'grantOperation',coalesce(m->>'grantOperation','REPLACE'),
            'priority',case when m ? 'priority' then (m->>'priority')::integer else null end,
            'key',m->>'key',
            'label',m#>>'{payload,label}',
            'max',m#>'{payload,max}',
            'recharge',case when m->>'key'='monk_focus'
              then '["short_rest","long_rest"]'::jsonb
              else '["long_rest"]'::jsonb end,
            'initial','full',
            'presentation',jsonb_build_object('tone','amber','icon','◆','display','pips','priority',85)
          ))
        when m->>'id'='monk-uncanny-metabolism-rules' then
          jsonb_set(m,'{payload,description}',to_jsonb('При броске инициативы монах может восстановить все потраченные Очки концентрации и HP в количестве, равном броску куба Боевых искусств + уровень монаха. После использования способность недоступна до долгого отдыха. Активация восстанавливает весь запас концентрации; лечение применяется по тому же правилу.'::text),true)
        when m->>'id'='monk-subclass-unlock' then
          jsonb_set(m,'{payload,description}',to_jsonb('На 3 уровне монах выбирает подкласс. Особенности выбранного подкласса открываются на уровнях, указанных в его собственной прогрессии.'::text),true)
        when m->>'id'='monk-perfect-focus' then
          jsonb_set(m,'{payload,description}',to_jsonb('При броске инициативы, если Невероятный метаболизм не используется и у монаха меньше 4 Очков концентрации, его запас становится равен 4. Эта проверка выполняется только в момент фактического броска инициативы.'::text),true)
        when m->>'id'='monk-body-mind-rules' then
          jsonb_set(m,'{payload,description}',to_jsonb('Ловкость и Мудрость монаха увеличиваются на 4 каждая; максимум каждой из этих характеристик становится 25. Повышение применяется к текущим значениям характеристик с новым пределом 25.'::text),true)
        else m
      end order by ord
    )
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
  ),'[]'::jsonb)
  where l.template_id=v_monk;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
    'stored_mechanic_contract','current',
    'player_facing_meta_audited',true
  ),updated_at=now()
  where id=v_monk;
end;
$$;

revoke all on function private.audit_monk_base_runtime_v1(uuid) from public,anon,authenticated;
grant execute on function private.audit_monk_base_runtime_v1(uuid) to service_role;

create or replace function private.audit_monk_base_runtime_v1_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.audit_monk_base_runtime_v1(new.id);
  return new;
end;
$$;

revoke all on function private.audit_monk_base_runtime_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzzz_campaigns_audit_monk_base_runtime_v1 on public.campaigns;
create trigger zzzzzzzzz_campaigns_audit_monk_base_runtime_v1
after insert on public.campaigns
for each row execute function private.audit_monk_base_runtime_v1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.audit_monk_base_runtime_v1(v_campaign.id);
  end loop;
end;
$block$;

commit;
