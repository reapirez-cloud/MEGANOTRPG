-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/sorcererFontOfMagicStage3.test.ts
-- CLASS_WORK_STATUS: sorcerer:stage3_font_of_magic=READY
--
-- Stage 3: 2024 Font of Magic spell-slot creation.
-- A created slot is represented as a generic temporary maximum bonus on the
-- canonical spell-slot ledger. It is spendable by the normal casting path,
-- survives ordinary CE/resource re-sync, and expires on Long Rest.
-- The 2024 rule does not add the legacy slot -> Sorcery Point conversion.

begin;

alter table public.character_resource_states
  add column if not exists temporary_max_bonus integer not null default 0;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.character_resource_states'::regclass
      and conname='character_resource_states_temporary_max_bonus_check'
  ) then
    alter table public.character_resource_states
      add constraint character_resource_states_temporary_max_bonus_check
      check (temporary_max_bonus >= 0 and temporary_max_bonus <= max_snapshot);
  end if;
end;
$block$;

comment on column public.character_resource_states.temporary_max_bonus is
  'Generic temporary increase already included in max_snapshot. Stage 3 Font of Magic uses it for created spell slots; Long Rest removes it.';

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
  else
    raise exception 'Unsupported resource effect operation: %',v_operation;
  end if;
end;
$function$;

-- Re-syncs replace the persistent/base maximum but preserve an active temporary
-- maximum bonus and the already-spent deficit. This keeps created slots alive
-- across sheet/profile recalculation and level synchronization.
create or replace function public.sync_character_resource_states(p_character_id uuid, p_resources jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_item jsonb;
  v_state_key text;
  v_current integer;
  v_max integer;
  v_label text;
  v_recharge jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if p_resources is null then return; end if;
  if jsonb_typeof(p_resources)<>'array' then raise exception 'Resources must be an array'; end if;

  for v_item in select value from jsonb_array_elements(p_resources) loop
    v_state_key := trim(coalesce(v_item->>'stateKey',''));
    v_max := greatest(0,least(100000,coalesce((v_item->>'max')::integer,0)));
    v_current := greatest(0,least(v_max,coalesce((v_item->>'current')::integer,v_max)));
    v_label := left(trim(coalesce(v_item->>'label',v_state_key)),160);
    v_recharge := v_item->'recharge';
    if v_state_key='' then continue; end if;
    if not private.ce_persistent_recharge_valid(v_recharge) then
      raise exception 'Resource % is not a persistent CE ledger; only short rest, long rest, or dawn recovery is allowed', v_state_key;
    end if;

    insert into public.character_resource_states(character_id,state_key,current,max_snapshot,label,recharge,updated_by)
    values(p_character_id,v_state_key,v_current,v_max,v_label,v_recharge,auth.uid())
    on conflict(character_id,state_key) do update set
      current=greatest(
        0,
        excluded.max_snapshot + public.character_resource_states.temporary_max_bonus
          - greatest(0,public.character_resource_states.max_snapshot-public.character_resource_states.current)
      ),
      max_snapshot=excluded.max_snapshot + public.character_resource_states.temporary_max_bonus,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=auth.uid(),
      updated_at=now();
  end loop;
end;
$function$;

-- Normal recovery happens first. A Long Rest then removes every temporary max
-- bonus and caps current to the persistent/base maximum. Spell slots therefore
-- refill normally and every Font-created slot disappears exactly at Long Rest.
create or replace function public.recover_character_resources(p_character_id uuid, p_trigger text)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Only GM or owner can restore resources'; end if;
  if p_trigger not in ('short_rest','long_rest','dawn','manual') then raise exception 'Unsupported recovery trigger'; end if;

  update public.character_resource_states s set
    current = coalesce(
      (
        select case
          when coalesce(rule->>'restore','full')='amount'
            then least(s.max_snapshot,s.current+greatest(0,coalesce((rule->>'amount')::integer,0)))
          else s.max_snapshot
        end
        from jsonb_array_elements(coalesce(s.recharge->'rules','[]'::jsonb)) with ordinality as rr(rule,ord)
        where rule->>'trigger'=p_trigger
        order by ord
        limit 1
      ),
      case
        when exists(
          select 1
          from jsonb_array_elements_text(coalesce(s.recharge->'triggers','[]'::jsonb)) t(value)
          where t.value=p_trigger
        ) then case
          when coalesce(s.recharge->>'restore','full')='amount'
            then least(s.max_snapshot,s.current+greatest(0,coalesce((s.recharge->>'amount')::integer,0)))
          else s.max_snapshot
        end
        else s.current
      end
    ),
    updated_by=auth.uid(),
    updated_at=now()
  where s.character_id=p_character_id
    and (
      exists(
        select 1
        from jsonb_array_elements(coalesce(s.recharge->'rules','[]'::jsonb)) rr(rule)
        where rule->>'trigger'=p_trigger
      )
      or exists(
        select 1
        from jsonb_array_elements_text(coalesce(s.recharge->'triggers','[]'::jsonb)) t(value)
        where t.value=p_trigger
      )
    );

  if p_trigger='long_rest' then
    update public.character_resource_states
    set current=least(current,max_snapshot-temporary_max_bonus),
        max_snapshot=max_snapshot-temporary_max_bonus,
        temporary_max_bonus=0,
        updated_by=auth.uid(),
        updated_at=now()
    where character_id=p_character_id
      and temporary_max_bonus>0;
  end if;
end;
$function$;

create or replace function private.ensure_sorcerer_font_of_magic_stage3_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sorcerer uuid;
  v_mechanics jsonb;
  v_unlock integer;
  v_slot integer;
  v_cost integer;
  v_sheet_profile jsonb;
begin
  perform private.ensure_sorcerer_resource_runtime_stage2_v1(p_campaign_id);

  select id into v_sorcerer
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:sorcerer'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_sorcerer is null then
    raise exception 'SORCERER_STAGE3_ACTIVE_CLASS_NOT_FOUND:%',p_campaign_id;
  end if;

  for v_unlock,v_slot,v_cost in
    select * from (values
      (2,1,2),
      (3,2,3),
      (5,3,5),
      (7,4,6),
      (9,5,7)
    ) as conversion(unlock_level,slot_level,sorcery_point_cost)
  loop
    select coalesce(mechanics,'[]'::jsonb) into v_mechanics
    from public.rule_template_levels
    where template_id=v_sorcerer and level=v_unlock;

    v_mechanics := coalesce((
      select jsonb_agg(value order by ordinality)
      from jsonb_array_elements(v_mechanics) with ordinality e(value,ordinality)
      where value->>'id'<>('sorcerer-font-create-slot-'||v_slot::text)
    ),'[]'::jsonb);

    v_mechanics := v_mechanics || jsonb_build_array(jsonb_build_object(
      'id','sorcerer-font-create-slot-'||v_slot::text,
      'type','action',
      'sourceKey','font-of-magic',
      'key','font_of_magic_create_slot_'||v_slot::text,
      'label','Создать ячейку '||v_slot::text||' уровня',
      'economy','bonus_action',
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','sorcery_points','amount',v_cost
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','resource',
        'key','spell_slot_'||v_slot::text,
        'operation','GRANT_TEMPORARY_MAX',
        'amount',1
      )),
      'tags',jsonb_build_array('class','sorcerer','font_of_magic','spell_slot')
    ));

    update public.rule_template_levels
    set mechanics=v_mechanics
    where template_id=v_sorcerer and level=v_unlock;
  end loop;

  v_sheet_profile := jsonb_build_object(
    'spellcasting_enabled',true,
    'spellcasting_ability','charisma',
    'spell_list','sorcerer',
    'spell_slots_by_level',jsonb_build_array(
      jsonb_build_object('1',2),
      jsonb_build_object('1',3),
      jsonb_build_object('1',4,'2',2),
      jsonb_build_object('1',4,'2',3),
      jsonb_build_object('1',4,'2',3,'3',2),
      jsonb_build_object('1',4,'2',3,'3',3),
      jsonb_build_object('1',4,'2',3,'3',3,'4',1),
      jsonb_build_object('1',4,'2',3,'3',3,'4',2),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',1),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',2),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',2,'6',1),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',2,'6',1),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',2,'6',1,'7',1),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',2,'6',1,'7',1),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',2,'6',1,'7',1,'8',1),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',2,'6',1,'7',1,'8',1),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',2,'6',1,'7',1,'8',1,'9',1),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',3,'6',1,'7',1,'8',1,'9',1),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',3,'6',2,'7',1,'8',1,'9',1),
      jsonb_build_object('1',4,'2',3,'3',3,'4',3,'5',3,'6',2,'7',2,'8',1,'9',1)
    )
  );

  update public.rule_templates
  set catalog_revision='xphb-2024-sorcerer-stage3-font-of-magic-v1',
      rules_meta=coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object(
        'mechanics_status','IN_PROGRESS_STAGE3_FONT_OF_MAGIC_READY',
        'runtime_stage',3,
        'runtime_revision','xphb-2024-sorcerer-stage3-font-of-magic-v1',
        'resource_runtime_included',true,
        'font_of_magic_conversion_runtime',true,
        'font_of_magic_slot_creation_costs',jsonb_build_object('1',2,'2',3,'3',5,'4',6,'5',7),
        'font_of_magic_slot_creation_unlocks',jsonb_build_object('1',2,'2',3,'3',5,'4',7,'5',9),
        'font_of_magic_reverse_conversion_runtime',false,
        'temporary_resource_max_runtime',true,
        'spell_slot_runtime_included',true,
        'spell_runtime_included',false,
        'metamagic_runtime_included',false,
        'subclass_runtime_included',false,
        'sheet_profile',v_sheet_profile
      ),
      updated_at=now()
  where id=v_sorcerer;
end;
$function$;

revoke all on function private.ensure_sorcerer_font_of_magic_stage3_v1(uuid) from public,anon,authenticated;
grant execute on function private.ensure_sorcerer_font_of_magic_stage3_v1(uuid) to service_role;

-- Stage 3 guarantees that the canonical spell-slot ledger exists for Sorcerer
-- assignments. The same rows are consumed by normal casting and mirrored to the
-- character sheet by the existing generic spell-slot trigger.
create or replace function private.sync_sorcerer_spell_slots_stage3_v1(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_template_id uuid;
  v_level integer;
  v_profile jsonb;
  v_target jsonb;
  v_slot integer;
  v_base_max integer;
  v_actor uuid:=auth.uid();
begin
  select t.id,greatest(1,least(20,coalesce(a.template_level,1)))
  into v_template_id,v_level
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id
    and t.kind='class'
    and t.catalog_key='class:sorcerer'
  order by a.assigned_at,a.id
  limit 1;

  if v_template_id is null then return; end if;

  select rules_meta->'sheet_profile' into v_profile
  from public.rule_templates where id=v_template_id;
  if v_profile is null or jsonb_typeof(v_profile)<>'object' then
    raise exception 'SORCERER_STAGE3_SHEET_PROFILE_MISSING:%',v_template_id;
  end if;

  v_target := v_profile->'spell_slots_by_level'->(v_level-1);
  if v_target is null or jsonb_typeof(v_target)<>'object' then
    raise exception 'SORCERER_STAGE3_SLOT_PROFILE_MISSING:%:%',v_template_id,v_level;
  end if;

  for v_slot in 1..9 loop
    v_base_max:=greatest(0,coalesce((v_target->>v_slot::text)::integer,0));

    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,updated_by
    ) values(
      p_character_id,
      'spell_slot_'||v_slot::text,
      v_base_max,
      v_base_max,
      'Ячейки заклинаний '||v_slot::text||' уровня',
      jsonb_build_object('triggers',jsonb_build_array('long_rest'),'restore','full'),
      v_actor
    )
    on conflict(character_id,state_key) do update set
      current=greatest(
        0,
        excluded.max_snapshot + public.character_resource_states.temporary_max_bonus
          - greatest(0,public.character_resource_states.max_snapshot-public.character_resource_states.current)
      ),
      max_snapshot=excluded.max_snapshot + public.character_resource_states.temporary_max_bonus,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=v_actor,
      updated_at=now();
  end loop;
end;
$function$;

revoke all on function private.sync_sorcerer_spell_slots_stage3_v1(uuid) from public,anon,authenticated;
grant execute on function private.sync_sorcerer_spell_slots_stage3_v1(uuid) to service_role;

create or replace function private.sync_sorcerer_stage3_v1_after_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.sync_sorcerer_spell_slots_stage3_v1(coalesce(new.character_id,old.character_id));
  return coalesce(new,old);
end;
$function$;

revoke all on function private.sync_sorcerer_stage3_v1_after_assignment() from public,anon,authenticated;

drop trigger if exists character_template_assignments_sync_sorcerer_spell_slots_stage3_v1 on public.character_template_assignments;
create trigger character_template_assignments_sync_sorcerer_spell_slots_stage3_v1
after insert or update of template_id,template_level,selected_choices or delete
on public.character_template_assignments
for each row execute function private.sync_sorcerer_stage3_v1_after_assignment();

create or replace function private.ensure_sorcerer_font_of_magic_stage3_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_sorcerer_font_of_magic_stage3_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_sorcerer_font_of_magic_stage3_v1_after_campaign() from public,anon,authenticated;

drop trigger if exists aaaaaaaae_campaigns_ensure_sorcerer_resource_runtime_stage2_v1 on public.campaigns;
drop trigger if exists aaaaaaaaf_campaigns_ensure_sorcerer_font_of_magic_stage3_v1 on public.campaigns;
create trigger aaaaaaaaf_campaigns_ensure_sorcerer_font_of_magic_stage3_v1
after insert on public.campaigns
for each row execute function private.ensure_sorcerer_font_of_magic_stage3_v1_after_campaign();

do $block$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_sorcerer_font_of_magic_stage3_v1(r.id);
  end loop;

  for r in
    select distinct a.character_id
    from public.character_template_assignments a
    join public.rule_templates t on t.id=a.template_id
    where t.kind='class' and t.catalog_key='class:sorcerer' and t.is_active
  loop
    perform private.sync_sorcerer_spell_slots_stage3_v1(r.character_id);
  end loop;
end;
$block$;

commit;
