-- CLASS_MIGRATION_SCOPE: runtime
-- CLASS_INTEGRATION_STRICT: class:paladin
begin;

create or replace function private.sync_paladin_character_resource_states_v1(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_campaign_id uuid;
  v_paladin_template_id uuid;
  v_paladin_level integer;
  v_resource record;
  v_max_numeric numeric;
  v_max integer;
  v_recharge jsonb;
  v_actor uuid := auth.uid();
  v_charisma integer;
begin
  select c.campaign_id into v_campaign_id
  from public.characters c
  where c.id=p_character_id;
  if v_campaign_id is null then return; end if;

  select t.id,greatest(1,coalesce(a.template_level,1))
  into v_paladin_template_id,v_paladin_level
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id
    and t.kind='class'
    and t.catalog_key='class:paladin'
  order by a.assigned_at,a.id
  limit 1;

  if v_paladin_template_id is null then
    delete from public.character_resource_states s
    where s.character_id=p_character_id
      and s.state_key !~ '^spell_slot_[0-9]+$'
      and s.state_key in (
        select distinct m.value->>'key'
        from public.rule_templates t
        left join public.rule_template_levels l on l.template_id=t.id
        cross join lateral jsonb_array_elements(
          case when l.id is null then coalesce(t.mechanics,'[]'::jsonb) else coalesce(l.mechanics,'[]'::jsonb) end
        ) m(value)
        where t.campaign_id=v_campaign_id
          and t.is_active
          and (t.catalog_key='class:paladin' or t.catalog_key like 'subclass:paladin:%')
          and m.value->>'type'='resource'
          and nullif(m.value->>'key','') is not null
      );
    return;
  end if;

  for v_resource in
    with assigned as (
      select t.id template_id,t.mechanics,0 unlock_level,v_paladin_level effective_level
      from public.rule_templates t
      where t.id=v_paladin_template_id
      union all
      select st.id,st.mechanics,0,v_paladin_level
      from public.character_template_assignments sa
      join public.rule_templates st on st.id=sa.template_id and st.is_active
      where sa.character_id=p_character_id
        and st.kind='subclass'
        and st.parent_template_id=v_paladin_template_id
    ), resource_mechanics as (
      select a.template_id,a.unlock_level,m.value mechanic
      from assigned a
      cross join lateral jsonb_array_elements(coalesce(a.mechanics,'[]'::jsonb)) m(value)
      where m.value->>'type'='resource'
      union all
      select a.template_id,l.level,m.value
      from assigned a
      join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where m.value->>'type'='resource'
    )
    select distinct on (mechanic->>'key')
      mechanic->>'key' state_key,
      mechanic,
      unlock_level
    from resource_mechanics
    where nullif(mechanic->>'key','') is not null
    order by mechanic->>'key',unlock_level desc,coalesce((mechanic->>'priority')::integer,0) desc
  loop
    if v_resource.state_key='lay_on_hands' then
      v_max_numeric:=5*v_paladin_level;
    elsif v_resource.state_key='glory_glorious_defense' then
      select s.charisma into v_charisma
      from public.character_sheets s
      where s.character_id=p_character_id;
      if v_charisma is null then
        raise exception 'PALADIN_GLORY_CHARISMA_NOT_FOUND:%',p_character_id;
      end if;
      v_max_numeric:=greatest(1,floor((v_charisma-10)::numeric/2));
    elsif jsonb_typeof(v_resource.mechanic->'max')='number' then
      v_max_numeric:=(v_resource.mechanic->>'max')::numeric;
    else
      v_max_numeric:=private.evaluate_character_template_numeric_expression(p_character_id,v_resource.mechanic->'max');
    end if;

    if v_max_numeric is null or v_max_numeric<0 or trunc(v_max_numeric)<>v_max_numeric or v_max_numeric>100000 then
      raise exception 'PALADIN_RESOURCE_MAX_INVALID:%:%',v_resource.state_key,v_max_numeric;
    end if;
    v_max:=v_max_numeric::integer;

    if jsonb_typeof(v_resource.mechanic->'recoveryRules')='array'
       and jsonb_array_length(v_resource.mechanic->'recoveryRules')>0 then
      v_recharge:=jsonb_build_object('rules',v_resource.mechanic->'recoveryRules');
    else
      v_recharge:=jsonb_build_object(
        'triggers',coalesce(v_resource.mechanic->'recharge','[]'::jsonb),
        'restore',coalesce(nullif(v_resource.mechanic->>'restore',''),'full')
      );
    end if;

    if not private.ce_persistent_recharge_valid(v_recharge) then
      raise exception 'PALADIN_RESOURCE_RECHARGE_INVALID:%:%',v_resource.state_key,v_recharge;
    end if;

    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,updated_by
    ) values (
      p_character_id,v_resource.state_key,v_max,v_max,
      left(coalesce(nullif(v_resource.mechanic->>'label',''),v_resource.state_key),160),
      v_recharge,v_actor
    )
    on conflict(character_id,state_key) do update set
      current=greatest(0,excluded.max_snapshot-greatest(0,public.character_resource_states.max_snapshot-public.character_resource_states.current)),
      max_snapshot=excluded.max_snapshot,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=v_actor,
      updated_at=now();
  end loop;

  delete from public.character_resource_states s
  where s.character_id=p_character_id
    and s.state_key !~ '^spell_slot_[0-9]+$'
    and s.state_key in (
      select distinct m.value->>'key'
      from public.rule_templates t
      join public.rule_template_levels l on l.template_id=t.id
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where t.campaign_id=v_campaign_id
        and t.is_active
        and (t.catalog_key='class:paladin' or t.catalog_key like 'subclass:paladin:%')
        and m.value->>'type'='resource'
        and nullif(m.value->>'key','') is not null
    )
    and not exists (
      with assigned as (
        select t.id template_id,v_paladin_level effective_level
        from public.rule_templates t where t.id=v_paladin_template_id
        union all
        select st.id,v_paladin_level
        from public.character_template_assignments sa
        join public.rule_templates st on st.id=sa.template_id and st.is_active
        where sa.character_id=p_character_id and st.kind='subclass' and st.parent_template_id=v_paladin_template_id
      )
      select 1
      from assigned a
      join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where m.value->>'type'='resource' and m.value->>'key'=s.state_key
    );
end;
$function$;

do $cert$
declare v_bad integer;
begin
  select count(*) into v_bad
  from information_schema.columns
  where table_schema='public' and table_name='character_sheets' and column_name='charisma';
  if v_bad<>1 then raise exception 'PALADIN_GLORY_CHARISMA_COLUMN_MISSING'; end if;
  if position('glory_glorious_defense' in pg_get_functiondef('private.sync_paladin_character_resource_states_v1(uuid)'::regprocedure))=0
     or position('s.charisma' in pg_get_functiondef('private.sync_paladin_character_resource_states_v1(uuid)'::regprocedure))=0 then
    raise exception 'PALADIN_GLORY_RESOURCE_MAX_BRIDGE_NOT_INSTALLED';
  end if;
end;
$cert$;

commit;