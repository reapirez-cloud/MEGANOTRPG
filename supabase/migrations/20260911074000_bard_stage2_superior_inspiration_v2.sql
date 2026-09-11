-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:bard
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/bardResourceRuntimeStage2.test.ts
-- CLASS_WORK_STATUS: bard:stage2_inspiration=READY,bard:mechanics=PENDING_STAGE3
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Forward-only Stage 2 closure.
-- Adds one generic resource operation that can guarantee a minimum current value,
-- temporarily extending capacity only when the ordinary maximum is too small.
-- Superior Inspiration uses it to reach two uses even when CHA modifier is +1.

begin;

create or replace function private.apply_character_runtime_resource_effect(
  p_character_id uuid,
  p_state_key text,
  p_operation text,
  p_amount integer,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_current integer;
  v_max integer;
  v_label text;
  v_operation text:=upper(coalesce(p_operation,''));
begin
  select s.current,
         s.max_snapshot,
         coalesce(nullif(s.label,''),p_state_key)
  into v_current,v_max,v_label
  from public.character_resource_states s
  where s.character_id=p_character_id
    and s.state_key=p_state_key
  for update;

  if v_max is null then
    raise exception 'Ресурс не синхронизирован: %',p_state_key;
  end if;

  if v_operation='RESTORE' then
    if v_current>=v_max and p_amount>0 then
      raise exception 'Ресурс уже заполнен: %',v_label;
    end if;
    update public.character_resource_states
    set current=least(max_snapshot,current+greatest(0,p_amount)),
        updated_by=p_actor,
        updated_at=now()
    where character_id=p_character_id and state_key=p_state_key;
  elsif v_operation='SPEND' then
    if v_current<greatest(0,p_amount) then
      raise exception 'Недостаточно ресурса: %',v_label;
    end if;
    update public.character_resource_states
    set current=current-greatest(0,p_amount),
        updated_by=p_actor,
        updated_at=now()
    where character_id=p_character_id and state_key=p_state_key;
  elsif v_operation='SET' then
    update public.character_resource_states
    set current=greatest(0,least(max_snapshot,greatest(0,p_amount))),
        updated_by=p_actor,
        updated_at=now()
    where character_id=p_character_id and state_key=p_state_key;
  elsif v_operation='GRANT_TEMPORARY_MAX' then
    if p_amount < 0 then
      raise exception 'Temporary maximum bonus must be non-negative';
    end if;
    if p_amount = 0 then
      return;
    end if;
    if v_max > 100000-p_amount then
      raise exception 'Temporary maximum bonus exceeds resource limit: %',v_label;
    end if;
    update public.character_resource_states
    set current=current+p_amount,
        max_snapshot=max_snapshot+p_amount,
        temporary_max_bonus=temporary_max_bonus+p_amount,
        updated_by=p_actor,
        updated_at=now()
    where character_id=p_character_id and state_key=p_state_key;
  elsif v_operation='ENSURE_MINIMUM' then
    if p_amount < 0 then
      raise exception 'Minimum resource value must be non-negative';
    end if;
    if p_amount > 100000 then
      raise exception 'Minimum resource value exceeds resource limit: %',v_label;
    end if;
    if v_current>=p_amount then
      return;
    end if;
    update public.character_resource_states
    set current=p_amount,
        max_snapshot=greatest(max_snapshot,p_amount),
        temporary_max_bonus=temporary_max_bonus+greatest(0,p_amount-max_snapshot),
        updated_by=p_actor,
        updated_at=now()
    where character_id=p_character_id and state_key=p_state_key;
  else
    raise exception 'Unsupported resource effect operation: %',v_operation;
  end if;
end;
$function$;

revoke all on function private.apply_character_runtime_resource_effect(uuid,text,text,integer,uuid)
from public,anon,authenticated;
grant execute on function private.apply_character_runtime_resource_effect(uuid,text,text,integer,uuid)
to service_role;

create or replace function private.sync_bard_character_resource_states_stage2_v1(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_bard_template_id uuid;
  v_bard_level integer;
  v_resource record;
  v_max_numeric numeric;
  v_max integer;
  v_recharge jsonb;
  v_actor uuid:=auth.uid();
begin
  select t.id,greatest(1,coalesce(a.template_level,1))
  into v_bard_template_id,v_bard_level
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id
    and t.kind='class'
    and t.catalog_key='class:bard'
  order by a.assigned_at,a.id
  limit 1;

  if v_bard_template_id is null then
    delete from public.character_resource_states
    where character_id=p_character_id
      and state_key='bardic_inspiration';
    return;
  end if;

  for v_resource in
    select distinct on (m.value->>'key')
      m.value->>'key' as state_key,
      m.value as mechanic,
      l.level as unlock_level
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=v_bard_template_id
      and l.level<=v_bard_level
      and m.value->>'type'='resource'
      and m.value->>'key'='bardic_inspiration'
    order by m.value->>'key',
             l.level desc,
             coalesce((m.value->>'priority')::integer,0) desc
  loop
    if jsonb_typeof(v_resource.mechanic->'max')='number' then
      v_max_numeric:=(v_resource.mechanic->>'max')::numeric;
    else
      v_max_numeric:=private.evaluate_character_template_numeric_expression(
        p_character_id,
        v_resource.mechanic->'max'
      );
    end if;

    if v_max_numeric is null
       or v_max_numeric<0
       or trunc(v_max_numeric)<>v_max_numeric
       or v_max_numeric>100000
    then
      raise exception 'BARD_STAGE2_RESOURCE_MAX_INVALID:%:%',
        v_resource.state_key,v_max_numeric;
    end if;
    v_max:=v_max_numeric::integer;

    v_recharge:=jsonb_build_object(
      'triggers',coalesce(v_resource.mechanic->'recharge','[]'::jsonb),
      'restore',coalesce(nullif(v_resource.mechanic->>'restore',''),'full')
    );
    if not private.ce_persistent_recharge_valid(v_recharge) then
      raise exception 'BARD_STAGE2_RESOURCE_RECHARGE_INVALID:%:%',
        v_resource.state_key,v_recharge;
    end if;

    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,updated_by
    ) values(
      p_character_id,
      v_resource.state_key,
      v_max,
      v_max,
      left(coalesce(nullif(v_resource.mechanic->>'label',''),v_resource.state_key),160),
      v_recharge,
      v_actor
    )
    on conflict(character_id,state_key) do update set
      current=greatest(
        0,
        excluded.max_snapshot
          + case
              when excluded.max_snapshot>=2 then 0
              else public.character_resource_states.temporary_max_bonus
            end
          - greatest(
              0,
              public.character_resource_states.max_snapshot
                - public.character_resource_states.current
            )
      ),
      max_snapshot=
        excluded.max_snapshot
          + case
              when excluded.max_snapshot>=2 then 0
              else public.character_resource_states.temporary_max_bonus
            end,
      temporary_max_bonus=
        case
          when excluded.max_snapshot>=2 then 0
          else public.character_resource_states.temporary_max_bonus
        end,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=v_actor,
      updated_at=now();
  end loop;

  delete from public.character_resource_states s
  where s.character_id=p_character_id
    and s.state_key='bardic_inspiration'
    and not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=v_bard_template_id
        and l.level<=v_bard_level
        and m.value->>'type'='resource'
        and m.value->>'key'=s.state_key
    );
end;
$function$;

revoke all on function private.sync_bard_character_resource_states_stage2_v1(uuid)
from public,anon,authenticated;
grant execute on function private.sync_bard_character_resource_states_stage2_v1(uuid)
to service_role;

create or replace function private.ensure_bard_stage2_superior_inspiration_v2(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_bard uuid;
  v_mechanics jsonb;
begin
  perform private.ensure_bard_resource_runtime_stage2_v1(p_campaign_id);

  select id into v_bard
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:bard'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_bard is null then
    raise exception 'BARD_STAGE2_V2_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  select coalesce(mechanics,'[]'::jsonb) into v_mechanics
  from public.rule_template_levels
  where template_id=v_bard and level=18;

  v_mechanics:=coalesce((
    select jsonb_agg(
      case
        when value->>'id'='bard-superior-inspiration-action-l18' then
          jsonb_set(
            jsonb_set(
              value,
              '{effects,0,operation}',
              to_jsonb('ENSURE_MINIMUM'::text),
              false
            ),
            '{tags}',
            '["class","bard","initiative-trigger","table-adjudicated"]'::jsonb,
            true
          )
        else value
      end
      order by ordinality
    )
    from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
  ),'[]'::jsonb);

  if not exists(
    select 1
    from jsonb_array_elements(v_mechanics) m(value)
    where value->>'id'='bard-superior-inspiration-action-l18'
      and value->'effects'->0->>'operation'='ENSURE_MINIMUM'
  ) then
    raise exception 'BARD_STAGE2_V2_SUPERIOR_ACTION_PATCH_FAILED:%',v_bard;
  end if;

  update public.rule_template_levels
  set mechanics=v_mechanics
  where template_id=v_bard and level=18;

  update public.rule_templates
  set catalog_revision='xphb-2024-bard-stage2-inspiration-v2',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_status','IN_PROGRESS_STAGE2_INSPIRATION_READY',
        'runtime_stage',2,
        'runtime_revision','xphb-2024-bard-stage2-inspiration-v2',
        'superior_inspiration_runtime','structured_table_adjudicated',
        'superior_inspiration_minimum_uses',2,
        'superior_inspiration_temporary_capacity',true,
        'temporary_resource_max_runtime',true,
        'spell_runtime_included',false,
        'subclass_runtime_included',false,
        'sheet_profile_deferred',true,
        'next_stage','bard_spell_runtime'
      ),
      updated_at=now()
  where id=v_bard;
end;
$function$;

revoke all on function private.ensure_bard_stage2_superior_inspiration_v2(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_bard_stage2_superior_inspiration_v2(uuid)
to service_role;

create or replace function private.ensure_bard_stage2_superior_inspiration_v2_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_bard_stage2_superior_inspiration_v2(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_bard_stage2_superior_inspiration_v2_after_campaign()
from public,anon,authenticated;

drop trigger if exists aaaaaaaag_campaigns_ensure_bard_resource_runtime_stage2_v1
on public.campaigns;
drop trigger if exists aaaaaaaah_campaigns_ensure_bard_stage2_superior_inspiration_v2
on public.campaigns;

create trigger aaaaaaaah_campaigns_ensure_bard_stage2_superior_inspiration_v2
after insert on public.campaigns
for each row execute function private.ensure_bard_stage2_superior_inspiration_v2_after_campaign();

do $apply$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_bard_stage2_superior_inspiration_v2(r.id);
  end loop;

  for r in
    select distinct a.character_id
    from public.character_template_assignments a
    join public.rule_templates t on t.id=a.template_id
    where t.kind='class'
      and t.catalog_key='class:bard'
      and t.is_active
  loop
    perform private.sync_bard_character_resource_states_stage2_v1(r.character_id);
  end loop;
end;
$apply$;

commit;
