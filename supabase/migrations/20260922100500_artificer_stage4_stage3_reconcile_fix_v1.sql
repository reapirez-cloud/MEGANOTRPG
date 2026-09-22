-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:artificer
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/artificerRuntimeStage4Base.test.ts
-- CLASS_WORK_STATUS: artificer:stage4_stage3_reconcile=COMPLETE,artificer:mechanics=IN_PROGRESS_STAGE4_COMPLETE
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- Stage-4 release gate: repair the Stage-3 replica reconciliation expression
-- discovered by the transactional live smoke. The previous unparenthesized
-- jsonb operator/concatenation expression could parse refdef:* as JSON.

begin;

create or replace function private.artificer_stage3_reconcile_replicated_items_v1(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_level integer;
  v_known jsonb;
  v_desired jsonb;
  v_instance jsonb;
  v_option text;
  v_def uuid;
  v_attune boolean;
  v_requires_attunement boolean;
  v_max integer;
  v_item uuid;
begin
  select a.* into v_assignment
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  where a.character_id=p_character_id and t.kind='class' and t.catalog_key='class:artificer'
  order by a.assigned_at,a.id limit 1;
  if v_assignment.id is null then return; end if;

  v_level:=greatest(1,coalesce(v_assignment.template_level,1));
  if v_level<2 then return; end if;

  v_max:=case
    when v_level>=18 then 6
    when v_level>=14 then 5
    when v_level>=10 then 4
    when v_level>=6 then 3
    else 2
  end;

  v_known:=private.artificer_stage3_choice_instances_v1(
    v_assignment.selected_choices,'artificer_replication_plans'
  );
  v_desired:=private.artificer_stage3_choice_instances_v1(
    v_assignment.selected_choices,'artificer_replication_loadout'
  );

  if jsonb_array_length(v_desired)>v_max then
    raise exception 'ARTIFICER_REPLICATION_LOADOUT_OVER_CAP:%',v_max;
  end if;

  for v_item in
    select i.id
    from public.character_inventory_items i
    where i.item_state->>'origin_assignment_id'=v_assignment.id::text
      and i.item_state->>'origin_feature'='replicate-magic-item'
      and not exists(
        select 1
        from jsonb_array_elements(v_desired) d(value)
        where d.value->>'option'=('refdef:'||(i.item_state->>'plan_definition_id'))
      )
  loop
    update public.character_inventory_items
    set holder_item_id=null,
        placement_kind='root',
        placement_index=null,
        grid_x=null,
        grid_y=null,
        updated_at=now()
    where holder_item_id=v_item;

    delete from public.character_inventory_items where id=v_item;
  end loop;

  for v_instance in select value from jsonb_array_elements(v_desired)
  loop
    v_option:=v_instance->>'option';
    if v_option !~ '^refdef:[0-9a-fA-F-]{36}$' then
      raise exception 'ARTIFICER_REPLICATION_OPTION_INVALID:%',v_option;
    end if;

    v_def:=substring(v_option from 8)::uuid;

    if not exists(
      select 1
      from jsonb_array_elements(v_known) k(value)
      where k.value->>'option'=v_option
    ) then
      raise exception 'ARTIFICER_REPLICATION_PLAN_NOT_KNOWN:%',v_option;
    end if;

    if exists(
      select 1
      from public.character_inventory_items i
      where i.item_state->>'origin_assignment_id'=v_assignment.id::text
        and i.item_state->>'origin_feature'='replicate-magic-item'
        and i.item_state->>'plan_definition_id'=v_def::text
    ) then
      continue;
    end if;

    v_attune:=coalesce((v_instance#>>'{config,attune}')::boolean,false);

    select coalesce((rr.data#>>'{attunement,required}')::boolean,false)
    into v_requires_attunement
    from public.reference_definitions d
    join public.reference_definition_revisions rr
      on rr.definition_id=d.id and rr.revision=d.current_revision
    where d.id=v_def and d.kind='item' and d.status='active';

    if v_attune and not coalesce(v_requires_attunement,false) then
      raise exception 'ARTIFICER_REPLICATION_ATTUNEMENT_NOT_REQUIRED:%',v_option;
    end if;

    v_item:=private.cheburashka_create_definition_instance_v1(
      p_character_id,
      v_def,
      jsonb_build_object(
        'class_created',true,
        'creator_character_id',p_character_id,
        'origin_assignment_id',v_assignment.id,
        'origin_feature','replicate-magic-item',
        'plan_definition_id',v_def,
        'created_at',now()
      )
      || case
        when v_attune then jsonb_build_object(
          'attunement',jsonb_build_object(
            'attuned_to_character_id',p_character_id,
            'attuned_at',now(),
            'instant_creation',true
          )
        )
        else '{}'::jsonb
      end
    );
  end loop;
end;
$function$;

revoke all on function private.artificer_stage3_reconcile_replicated_items_v1(uuid)
from public,anon,authenticated;
grant execute on function private.artificer_stage3_reconcile_replicated_items_v1(uuid)
to service_role;

commit;