
-- AI Survival Stage 4: cooperative exact time, revision-scoped receipts,
-- reversible food/rest/survival snapshots, and regenerate-safe idempotency.

alter table private.ai_survival_turn_receipts_v1
  add column if not exists revision_id uuid,
  add column if not exists participant_character_ids uuid[] not null default '{}'::uuid[],
  add column if not exists before_state jsonb not null default '{}'::jsonb,
  add column if not exists after_state jsonb not null default '{}'::jsonb,
  add column if not exists rolled_back_at timestamptz;

alter table private.ai_survival_turn_receipts_v1
  drop constraint if exists ai_survival_turn_receipts_v1_campaign_id_source_message_id__key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='private.ai_survival_turn_receipts_v1'::regclass
      and conname='ai_survival_turn_receipts_v1_revision_id_fkey'
  ) then
    alter table private.ai_survival_turn_receipts_v1
      add constraint ai_survival_turn_receipts_v1_revision_id_fkey
      foreign key (revision_id)
      references private.ai_gm_turn_revisions(id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='private.ai_survival_turn_receipts_v1'::regclass
      and conname='ai_survival_turn_receipts_v1_before_state_check'
  ) then
    alter table private.ai_survival_turn_receipts_v1
      add constraint ai_survival_turn_receipts_v1_before_state_check
      check (jsonb_typeof(before_state)='object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='private.ai_survival_turn_receipts_v1'::regclass
      and conname='ai_survival_turn_receipts_v1_after_state_check'
  ) then
    alter table private.ai_survival_turn_receipts_v1
      add constraint ai_survival_turn_receipts_v1_after_state_check
      check (jsonb_typeof(after_state)='object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='private.ai_survival_turn_receipts_v1'::regclass
      and conname='ai_survival_turn_receipts_v1_participants_check'
  ) then
    alter table private.ai_survival_turn_receipts_v1
      add constraint ai_survival_turn_receipts_v1_participants_check
      check (
        cardinality(participant_character_ids) between 1 and 16
        and character_id=any(participant_character_ids)
      );
  end if;
end
$$;

alter table private.ai_survival_turn_receipts_v1
  alter column revision_id set not null;

create unique index if not exists ai_survival_turn_receipts_revision_character_uidx
  on private.ai_survival_turn_receipts_v1(revision_id,character_id);

create index if not exists ai_survival_turn_receipts_revision_idx
  on private.ai_survival_turn_receipts_v1(revision_id);

alter table private.ai_gm_turn_effects
  drop constraint if exists ai_gm_turn_effects_effect_kind_check;

alter table private.ai_gm_turn_effects
  add constraint ai_gm_turn_effects_effect_kind_check
  check (
    effect_kind = any(array[
      'chat_message'::text,
      'campaign_event'::text,
      'pending_roll_request'::text,
      'engine_receipt'::text,
      'recovery_receipt'::text,
      'runtime_mechanic'::text,
      'survival_turn'::text
    ])
  );

CREATE OR REPLACE FUNCTION private.ai_survival_capture_snapshot_v1(p_campaign_id uuid, p_room_id uuid, p_character_ids uuid[], p_inventory_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'room',
      coalesce((
        select jsonb_build_object(
          'id',r.id,
          'campaign_minute',r.campaign_minute,
          'campaign_day',r.campaign_day,
          'day_period',r.day_period
        )
        from public.chat_rooms r
        where r.id=p_room_id and r.campaign_id=p_campaign_id
      ),'{}'::jsonb),
    'world',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'character_id',ws.character_id,
            'location_id',ws.location_id,
            'campaign_minute',ws.campaign_minute,
            'campaign_day',ws.campaign_day,
            'day_period',ws.day_period
          )
          order by ws.character_id
        )
        from public.character_world_state ws
        where ws.campaign_id=p_campaign_id
          and ws.character_id=any(coalesce(p_character_ids,'{}'::uuid[]))
      ),'[]'::jsonb),
    'resources',
      coalesce((
        select jsonb_agg(to_jsonb(rs) order by rs.character_id,rs.state_key)
        from public.character_resource_states rs
        where rs.character_id=any(coalesce(p_character_ids,'{}'::uuid[]))
      ),'[]'::jsonb),
    'survival_runtime',
      coalesce((
        select jsonb_agg(to_jsonb(sr) order by sr.character_id)
        from private.character_survival_runtime sr
        where sr.campaign_id=p_campaign_id
          and sr.character_id=any(coalesce(p_character_ids,'{}'::uuid[]))
      ),'[]'::jsonb),
    'sheets',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'character_id',cs.character_id,
            'current_hp',cs.current_hp,
            'temp_hp',cs.temp_hp,
            'death_save_successes',cs.death_save_successes,
            'death_save_failures',cs.death_save_failures,
            'spell_slots',cs.spell_slots,
            'spell_change_unlocked',cs.spell_change_unlocked
          )
          order by cs.character_id
        )
        from public.character_sheets cs
        where cs.character_id=any(coalesce(p_character_ids,'{}'::uuid[]))
      ),'[]'::jsonb),
    'short_rest_sessions',
      coalesce((
        select jsonb_agg(to_jsonb(s) order by s.character_id)
        from public.character_short_rest_sessions s
        where s.character_id=any(coalesce(p_character_ids,'{}'::uuid[]))
      ),'[]'::jsonb),
    'preparation_sessions',
      coalesce((
        select jsonb_agg(to_jsonb(s) order by s.character_id)
        from public.character_preparation_sessions s
        where s.character_id=any(coalesce(p_character_ids,'{}'::uuid[]))
      ),'[]'::jsonb),
    'inventory',
      coalesce((
        select jsonb_agg(to_jsonb(i) order by i.id)
        from public.character_inventory_items i
        where i.id=any(coalesce(p_inventory_ids,'{}'::uuid[]))
      ),'[]'::jsonb)
  )
$function$;

CREATE OR REPLACE FUNCTION private.rollback_ai_survival_receipt_v1(p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_receipt private.ai_survival_turn_receipts_v1%rowtype;
  v_before jsonb;
  v_row jsonb;
  v_character_ids uuid[];
  v_character_id uuid;
  v_item_id uuid;
begin
  select * into v_receipt
  from private.ai_survival_turn_receipts_v1 r
  where r.command_id=p_command_id
  for update;

  if v_receipt.command_id is null then
    raise exception using errcode='22023',message='survival_rollback_receipt_not_found';
  end if;

  if v_receipt.rolled_back_at is not null then
    return jsonb_build_object(
      'command_id',v_receipt.command_id,
      'revision_id',v_receipt.revision_id,
      'rolled_back',true,
      'replayed',true
    );
  end if;

  v_before:=coalesce(v_receipt.before_state,'{}'::jsonb);
  v_character_ids:=coalesce(v_receipt.participant_character_ids,'{}'::uuid[]);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ai-survival-rollback:'||v_receipt.revision_id::text,
      0
    )
  );

  perform set_config('meganot.party_time_sync','on',true);

  if nullif(v_before#>>'{room,id}','') is not null then
    update public.chat_rooms r
    set campaign_minute=(v_before#>>'{room,campaign_minute}')::bigint,
        updated_at=now()
    where r.id=(v_before#>>'{room,id}')::uuid
      and r.campaign_id=v_receipt.campaign_id;
  end if;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'world','[]'::jsonb))
  loop
    update public.character_world_state ws
    set campaign_minute=(v_row->>'campaign_minute')::bigint,
        updated_at=now(),
        updated_by=null
    where ws.campaign_id=v_receipt.campaign_id
      and ws.character_id=(v_row->>'character_id')::uuid;
  end loop;

  -- Restore the exact resource set that existed before the turn.
  delete from public.character_resource_states rs
  where rs.character_id=any(v_character_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_before->'resources','[]'::jsonb)) e
      where (e->>'character_id')::uuid=rs.character_id
        and e->>'state_key'=rs.state_key
    );

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'resources','[]'::jsonb))
  loop
    insert into public.character_resource_states(
      character_id,state_key,current,max_snapshot,label,recharge,
      updated_by,created_at,updated_at,temporary_max_bonus
    ) values (
      (v_row->>'character_id')::uuid,
      v_row->>'state_key',
      (v_row->>'current')::integer,
      (v_row->>'max_snapshot')::integer,
      coalesce(v_row->>'label',''),
      coalesce(v_row->'recharge','{}'::jsonb),
      nullif(v_row->>'updated_by','')::uuid,
      coalesce((v_row->>'created_at')::timestamptz,now()),
      now(),
      coalesce((v_row->>'temporary_max_bonus')::integer,0)
    )
    on conflict(character_id,state_key) do update set
      current=excluded.current,
      max_snapshot=excluded.max_snapshot,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=excluded.updated_by,
      temporary_max_bonus=excluded.temporary_max_bonus,
      updated_at=now();
  end loop;

  delete from private.character_survival_runtime sr
  where sr.campaign_id=v_receipt.campaign_id
    and sr.character_id=any(v_character_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_before->'survival_runtime','[]'::jsonb)) e
      where (e->>'character_id')::uuid=sr.character_id
    );

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'survival_runtime','[]'::jsonb))
  loop
    insert into private.character_survival_runtime(
      character_id,campaign_id,satiety_remainder,alertness_remainder,
      created_at,updated_at
    ) values (
      (v_row->>'character_id')::uuid,
      (v_row->>'campaign_id')::uuid,
      coalesce((v_row->>'satiety_remainder')::integer,0),
      coalesce((v_row->>'alertness_remainder')::integer,0),
      coalesce((v_row->>'created_at')::timestamptz,now()),
      now()
    )
    on conflict(character_id) do update set
      campaign_id=excluded.campaign_id,
      satiety_remainder=excluded.satiety_remainder,
      alertness_remainder=excluded.alertness_remainder,
      updated_at=now();
  end loop;

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'sheets','[]'::jsonb))
  loop
    update public.character_sheets cs
    set current_hp=(v_row->>'current_hp')::integer,
        temp_hp=coalesce((v_row->>'temp_hp')::integer,0),
        death_save_successes=coalesce((v_row->>'death_save_successes')::integer,0),
        death_save_failures=coalesce((v_row->>'death_save_failures')::integer,0),
        spell_slots=coalesce(v_row->'spell_slots','{}'::jsonb),
        spell_change_unlocked=coalesce((v_row->>'spell_change_unlocked')::boolean,false),
        updated_at=now()
    where cs.character_id=(v_row->>'character_id')::uuid;
  end loop;

  -- Rest session rows may have been created by this turn. Remove only rows that
  -- did not exist in the before snapshot, then restore the previous rows.
  delete from public.character_short_rest_sessions s
  where s.character_id=any(v_character_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_before->'short_rest_sessions','[]'::jsonb)) e
      where (e->>'character_id')::uuid=s.character_id
    );

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'short_rest_sessions','[]'::jsonb))
  loop
    insert into public.character_short_rest_sessions(
      character_id,generation,is_open,opened_at,opened_by,closed_at,updated_at
    ) values (
      (v_row->>'character_id')::uuid,
      (v_row->>'generation')::bigint,
      (v_row->>'is_open')::boolean,
      nullif(v_row->>'opened_at','')::timestamptz,
      nullif(v_row->>'opened_by','')::uuid,
      nullif(v_row->>'closed_at','')::timestamptz,
      now()
    )
    on conflict(character_id) do update set
      generation=excluded.generation,
      is_open=excluded.is_open,
      opened_at=excluded.opened_at,
      opened_by=excluded.opened_by,
      closed_at=excluded.closed_at,
      updated_at=now();
  end loop;

  delete from public.character_preparation_sessions s
  where s.character_id=any(v_character_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(v_before->'preparation_sessions','[]'::jsonb)) e
      where (e->>'character_id')::uuid=s.character_id
    );

  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'preparation_sessions','[]'::jsonb))
  loop
    insert into public.character_preparation_sessions(
      character_id,generation,is_open,opened_at,opened_by,closed_at,
      closed_by_message_id,updated_at
    ) values (
      (v_row->>'character_id')::uuid,
      (v_row->>'generation')::bigint,
      (v_row->>'is_open')::boolean,
      nullif(v_row->>'opened_at','')::timestamptz,
      nullif(v_row->>'opened_by','')::uuid,
      nullif(v_row->>'closed_at','')::timestamptz,
      nullif(v_row->>'closed_by_message_id','')::bigint,
      now()
    )
    on conflict(character_id) do update set
      generation=excluded.generation,
      is_open=excluded.is_open,
      opened_at=excluded.opened_at,
      opened_by=excluded.opened_by,
      closed_at=excluded.closed_at,
      closed_by_message_id=excluded.closed_by_message_id,
      updated_at=now();
  end loop;

  -- Food can delete a stack row, and long rest can expire artificer items.
  -- Restore root/parent items before children so holder FKs stay valid.
  for v_row in
    select value
    from jsonb_array_elements(coalesce(v_before->'inventory','[]'::jsonb))
    order by
      case when nullif(value->>'holder_item_id','') is null then 0 else 1 end,
      value->>'id'
  loop
    v_item_id:=(v_row->>'id')::uuid;

    if exists(select 1 from public.character_inventory_items i where i.id=v_item_id) then
      update public.character_inventory_items i
      set character_id=nullif(v_row->>'character_id','')::uuid,
          name=v_row->>'name',
          quantity=(v_row->>'quantity')::integer,
          weight=nullif(v_row->>'weight','')::numeric,
          equipped=(v_row->>'equipped')::boolean,
          image_url=nullif(v_row->>'image_url',''),
          description=coalesce(v_row->>'description',''),
          sort_order=(v_row->>'sort_order')::integer,
          category=v_row->>'category',
          equipment_slot=nullif(v_row->>'equipment_slot',''),
          mechanics=coalesce(v_row->'mechanics','[]'::jsonb),
          definition_id=nullif(v_row->>'definition_id','')::uuid,
          definition_revision=nullif(v_row->>'definition_revision','')::integer,
          usage_mode=v_row->>'usage_mode',
          charges_current=nullif(v_row->>'charges_current','')::integer,
          charges_max=nullif(v_row->>'charges_max','')::integer,
          item_state=coalesce(v_row->'item_state','{}'::jsonb),
          stack_mode=v_row->>'stack_mode',
          holder_item_id=nullif(v_row->>'holder_item_id','')::uuid,
          placement_kind=v_row->>'placement_kind',
          placement_index=nullif(v_row->>'placement_index','')::integer,
          grid_x=nullif(v_row->>'grid_x','')::integer,
          grid_y=nullif(v_row->>'grid_y','')::integer,
          grid_rotation=(v_row->>'grid_rotation')::smallint,
          world_storage_id=nullif(v_row->>'world_storage_id','')::uuid,
          surface_id=nullif(v_row->>'surface_id','')::uuid
      where i.id=v_item_id;
    else
      insert into public.character_inventory_items(
        id,character_id,name,quantity,weight,equipped,image_url,description,
        sort_order,created_at,updated_at,category,equipment_slot,mechanics,
        definition_id,definition_revision,usage_mode,charges_current,charges_max,
        item_state,version,stack_mode,holder_item_id,placement_kind,
        placement_index,grid_x,grid_y,grid_rotation,world_storage_id,surface_id
      ) values (
        v_item_id,
        nullif(v_row->>'character_id','')::uuid,
        v_row->>'name',
        (v_row->>'quantity')::integer,
        nullif(v_row->>'weight','')::numeric,
        (v_row->>'equipped')::boolean,
        nullif(v_row->>'image_url',''),
        coalesce(v_row->>'description',''),
        (v_row->>'sort_order')::integer,
        coalesce((v_row->>'created_at')::timestamptz,now()),
        now(),
        v_row->>'category',
        nullif(v_row->>'equipment_slot',''),
        coalesce(v_row->'mechanics','[]'::jsonb),
        nullif(v_row->>'definition_id','')::uuid,
        nullif(v_row->>'definition_revision','')::integer,
        v_row->>'usage_mode',
        nullif(v_row->>'charges_current','')::integer,
        nullif(v_row->>'charges_max','')::integer,
        coalesce(v_row->'item_state','{}'::jsonb),
        coalesce((v_row->>'version')::bigint,1),
        v_row->>'stack_mode',
        nullif(v_row->>'holder_item_id','')::uuid,
        v_row->>'placement_kind',
        nullif(v_row->>'placement_index','')::integer,
        nullif(v_row->>'grid_x','')::integer,
        nullif(v_row->>'grid_y','')::integer,
        (v_row->>'grid_rotation')::smallint,
        nullif(v_row->>'world_storage_id','')::uuid,
        nullif(v_row->>'surface_id','')::uuid
      );
    end if;
  end loop;

  perform set_config('meganot.party_time_sync','off',true);

  update private.ai_survival_turn_receipts_v1
  set rolled_back_at=now()
  where command_id=v_receipt.command_id;

  return jsonb_build_object(
    'command_id',v_receipt.command_id,
    'revision_id',v_receipt.revision_id,
    'participant_character_ids',to_jsonb(v_character_ids),
    'rolled_back',true,
    'replayed',false
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.ai_survival_effect_rollback_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.effect_kind='survival_turn'
     and old.rolled_back_at is null
     and new.rolled_back_at is not null
  then
    perform private.rollback_ai_survival_receipt_v1(old.effect_ref::uuid);
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.ai_gm_commit_survival_turn_v2(p_campaign_id uuid, p_actor_user_id uuid, p_source_message_id bigint, p_args jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  v_revision private.ai_gm_turn_revisions%rowtype;
  v_args jsonb := coalesce(p_args,'{}'::jsonb);
  v_intent_instruction text;
  v_character_id uuid;
  v_room_id uuid;
  v_participant_ids uuid[] := '{}'::uuid[];
  v_rest_ids uuid[] := '{}'::uuid[];
  v_inventory_ids uuid[] := '{}'::uuid[];
  v_food_ids uuid[] := '{}'::uuid[];
  v_tinker_ids uuid[] := '{}'::uuid[];
  v_child_ids uuid[] := '{}'::uuid[];
  v_elapsed integer;
  v_reason text;
  v_extra_satiety integer;
  v_extra_alertness integer;
  v_sleep_minutes integer;
  v_rest_type text;
  v_shared_sleep boolean := false;
  v_shared_rest boolean := false;
  v_shared_exertion boolean := false;
  v_base_minute bigint;
  v_to_minute bigint;
  v_room_before_minute bigint;
  v_dawn_crossings integer := 0;
  v_command_id uuid;
  v_existing private.ai_survival_turn_receipts_v1%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_pressure jsonb;
  v_participant_results jsonb := '[]'::jsonb;
  v_food jsonb;
  v_food_item_id uuid;
  v_food_quantity integer;
  v_food_restore integer;
  v_food_results jsonb := '[]'::jsonb;
  v_item public.character_inventory_items%rowtype;
  v_item_result jsonb;
  v_subcommand_id uuid;
  v_awake_minutes integer;
  v_sleep_restore integer;
  v_count integer;
  v_id uuid;
  i integer;
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501',message='service_role_required';
  end if;
  if p_campaign_id is null or p_actor_user_id is null or p_source_message_id is null then
    raise exception using errcode='22023',message='survival_turn_identity_required';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501',message='survival_turn_ai_world_only';
  end if;
  if not private.is_campaign_manager(p_campaign_id,p_actor_user_id) then
    raise exception using errcode='42501',message='campaign_manager_required';
  end if;

  select * into v_revision
  from private.ai_gm_turn_revisions r
  where r.source_message_id=p_source_message_id
    and r.campaign_id=p_campaign_id
    and r.state='active'
  order by r.revision_no desc
  limit 1
  for update;

  if v_revision.id is null then
    raise exception using errcode='22023',message='survival_turn_active_revision_required';
  end if;

  -- The junior is not trusted to choose scope. Prefer the immutable intent
  -- authored by the primary runtime. Tool arguments are only a transport.
  select i.instruction into v_intent_instruction
  from public.ai_gm_post_turn_intent_receipts i
  join public.ai_gm_post_turn_commits c on c.id=i.commit_id
  where c.parent_job_id=v_revision.job_id
    and c.campaign_id=p_campaign_id
    and c.source_message_id=p_source_message_id
    and i.intent_key='survival_turn'
  order by i.intent_index
  limit 1;

  if nullif(btrim(coalesce(v_intent_instruction,'')),'') is not null then
    begin
      v_args:=coalesce((v_intent_instruction::jsonb)->'arguments','{}'::jsonb);
    exception when others then
      raise exception using errcode='22023',message='survival_turn_immutable_intent_invalid';
    end;
  end if;

  if jsonb_typeof(v_args)<>'object' then
    raise exception using errcode='22023',message='survival_turn_args_invalid';
  end if;

  select m.character_id,m.room_id
  into v_character_id,v_room_id
  from public.chat_messages m
  join public.chat_rooms r on r.id=m.room_id and r.campaign_id=p_campaign_id
  where m.id=p_source_message_id;

  if v_character_id is null or v_room_id is null then
    raise exception using errcode='22023',message='survival_turn_source_message_unavailable';
  end if;

  if not exists(
    select 1 from public.characters c
    where c.id=v_character_id and c.campaign_id=p_campaign_id
      and c.character_type='pc' and c.life_state='alive'
  ) then
    raise exception using errcode='22023',message='survival_turn_character_unavailable';
  end if;

  begin
    if jsonb_typeof(v_args->'participant_character_ids')='array' then
      select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[])
      into v_participant_ids
      from jsonb_array_elements_text(v_args->'participant_character_ids');
    end if;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='survival_turn_participant_invalid';
  end;

  if cardinality(v_participant_ids)=0 then
    v_participant_ids:=array[v_character_id];
  elsif not (v_character_id=any(v_participant_ids)) then
    v_participant_ids:=array_append(v_participant_ids,v_character_id);
  end if;

  if cardinality(v_participant_ids)>16 then
    raise exception using errcode='22023',message='survival_turn_participant_limit';
  end if;

  select count(*)::integer into v_count
  from public.characters c
  where c.campaign_id=p_campaign_id
    and c.id=any(v_participant_ids)
    and c.character_type='pc'
    and c.life_state='alive';

  if v_count<>cardinality(v_participant_ids) then
    raise exception using errcode='22023',message='survival_turn_participant_scope_invalid';
  end if;

  v_elapsed:=coalesce(nullif(v_args->>'elapsed_minutes','')::integer,0);
  v_reason:=lower(btrim(coalesce(v_args->>'time_reason','scene')));
  v_extra_satiety:=coalesce(nullif(v_args->>'extra_satiety_depletion','')::integer,0);
  v_extra_alertness:=coalesce(nullif(v_args->>'extra_alertness_depletion','')::integer,0);
  v_sleep_minutes:=coalesce(nullif(v_args->>'sleep_minutes','')::integer,0);
  v_rest_type:=lower(btrim(coalesce(v_args->>'rest_type','none')));
  v_shared_sleep:=coalesce((v_args->>'shared_sleep')::boolean,false);
  v_shared_rest:=coalesce((v_args->>'shared_rest')::boolean,false);
  v_shared_exertion:=coalesce((v_args->>'shared_exertion')::boolean,false);

  if v_reason not in ('scene','long_action','travel','sleep','rest') then
    raise exception using errcode='22023',message='survival_turn_time_reason_invalid';
  end if;
  if v_elapsed<0 or v_elapsed>10080 then
    raise exception using errcode='22023',message='survival_turn_elapsed_invalid';
  end if;
  if v_reason='scene' and v_elapsed>5 then
    raise exception using errcode='22023',message='survival_turn_scene_exceeds_five_minutes';
  end if;
  if v_extra_satiety<0 or v_extra_satiety>25
     or v_extra_alertness<0 or v_extra_alertness>25 then
    raise exception using errcode='22023',message='survival_turn_exertion_out_of_range';
  end if;
  if v_sleep_minutes<0 or v_sleep_minutes>1440 then
    raise exception using errcode='22023',message='survival_turn_sleep_invalid';
  end if;
  if v_sleep_minutes>v_elapsed then
    raise exception using errcode='22023',message='survival_turn_sleep_exceeds_elapsed';
  end if;
  if v_rest_type not in ('none','short_rest','long_rest') then
    raise exception using errcode='22023',message='survival_turn_rest_type_invalid';
  end if;

  if v_rest_type='short_rest' and v_elapsed<60 then
    v_elapsed:=60;
  elsif v_rest_type='long_rest' and v_elapsed<480 then
    v_elapsed:=480;
    v_sleep_minutes:=greatest(v_sleep_minutes,480);
  end if;

  v_rest_ids:=case
    when v_rest_type<>'none' and v_shared_rest then v_participant_ids
    when v_rest_type<>'none' then array[v_character_id]
    else '{}'::uuid[]
  end;

  if v_rest_type='long_rest' and v_shared_rest then
    v_shared_sleep:=true;
  end if;

  -- Lock all participant clocks in stable order, then converge the shared scene
  -- on the latest participant minute before applying this turn's elapsed time.
  perform 1
  from public.character_world_state ws
  where ws.campaign_id=p_campaign_id
    and ws.character_id=any(v_participant_ids)
  order by ws.character_id
  for update;

  select count(*)::integer,max(ws.campaign_minute)
  into v_count,v_base_minute
  from public.character_world_state ws
  where ws.campaign_id=p_campaign_id
    and ws.character_id=any(v_participant_ids);

  if v_count<>cardinality(v_participant_ids) or v_base_minute is null then
    raise exception using errcode='22023',message='survival_turn_world_state_missing';
  end if;

  select r.campaign_minute into v_room_before_minute
  from public.chat_rooms r
  where r.id=v_room_id and r.campaign_id=p_campaign_id
  for update;

  v_to_minute:=v_base_minute+v_elapsed;

  -- Resolve food item ids before snapshotting them.
  if v_args ? 'food' then
    if jsonb_typeof(v_args->'food')<>'array'
       or jsonb_array_length(v_args->'food')>8 then
      raise exception using errcode='22023',message='survival_turn_food_invalid';
    end if;

    for v_food in select value from jsonb_array_elements(v_args->'food')
    loop
      begin
        v_food_item_id:=nullif(btrim(coalesce(v_food->>'item_id','')),'')::uuid;
      exception when invalid_text_representation then
        raise exception using errcode='22023',message='survival_turn_food_item_invalid';
      end;
      if v_food_item_id is null then
        raise exception using errcode='22023',message='survival_turn_food_item_invalid';
      end if;
      if v_food_item_id=any(v_food_ids) then
        raise exception using errcode='22023',message='survival_turn_food_item_duplicate';
      end if;
      v_food_ids:=array_append(v_food_ids,v_food_item_id);
    end loop;
  end if;

  -- Long-rest artificer cleanup may delete creator-owned temporary items even
  -- when another entity currently carries them. Snapshot those rows and their
  -- direct children so rollback can reconstruct exact holder relationships.
  if v_rest_type='long_rest' and cardinality(v_rest_ids)>0 then
    select coalesce(array_agg(i.id order by i.id),'{}'::uuid[])
    into v_tinker_ids
    from public.character_inventory_items i
    where i.item_state->>'origin_feature'='tinkers-magic'
      and exists(
        select 1 from unnest(v_rest_ids) cid
        where i.item_state->>'creator_character_id'=cid::text
      );

    if cardinality(v_tinker_ids)>0 then
      select coalesce(array_agg(i.id order by i.id),'{}'::uuid[])
      into v_child_ids
      from public.character_inventory_items i
      where i.holder_item_id=any(v_tinker_ids);
    end if;
  end if;

  select coalesce(array_agg(distinct x order by x),'{}'::uuid[])
  into v_inventory_ids
  from unnest(
    coalesce(v_food_ids,'{}'::uuid[])
    || coalesce(v_tinker_ids,'{}'::uuid[])
    || coalesce(v_child_ids,'{}'::uuid[])
  ) x;

  v_before:=private.ai_survival_capture_snapshot_v1(
    p_campaign_id,v_room_id,v_participant_ids,v_inventory_ids
  );

  v_command_id:=md5(
    'ai-survival-v2|'||v_revision.id::text||'|'||v_character_id::text
  )::uuid;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_command_id::text,0)
  );

  select * into v_existing
  from private.ai_survival_turn_receipts_v1 r
  where r.revision_id=v_revision.id
    and r.character_id=v_character_id;

  if v_existing.command_id is not null then
    return v_existing.result || jsonb_build_object(
      'replayed',true,
      'rolled_back',v_existing.rolled_back_at is not null
    );
  end if;

  perform set_config('request.jwt.claim.sub',p_actor_user_id::text,true);
  perform set_config('meganot.party_time_sync','on',true);

  foreach v_id in array v_participant_ids
  loop
    perform private.ensure_character_survival_state_v1(p_campaign_id,v_id);
  end loop;

  update public.character_world_state ws
  set campaign_minute=v_to_minute,
      updated_at=now(),
      updated_by=null
  where ws.campaign_id=p_campaign_id
    and ws.character_id=any(v_participant_ids);

  update public.chat_rooms r
  set campaign_minute=greatest(r.campaign_minute,v_to_minute),
      updated_at=now()
  where r.id=v_room_id and r.campaign_id=p_campaign_id;

  foreach v_id in array v_participant_ids
  loop
    if v_sleep_minutes>0
       and (v_id=v_character_id or v_shared_sleep)
    then
      v_awake_minutes:=greatest(0,v_elapsed-v_sleep_minutes);
      if v_awake_minutes>0 then
        perform private.tick_character_survival_v1(
          p_campaign_id,v_id,v_awake_minutes,true
        );
      end if;
      perform private.tick_character_survival_v1(
        p_campaign_id,v_id,v_sleep_minutes,false
      );

      v_sleep_restore:=floor(v_sleep_minutes::numeric*100/480)::integer;
      update public.character_resource_states rs
      set current=least(rs.max_snapshot,rs.current+v_sleep_restore),
          updated_at=now(),
          updated_by=null
      where rs.character_id=v_id
        and rs.state_key='survival_alertness';
    else
      if v_elapsed>0 then
        perform private.tick_character_survival_v1(
          p_campaign_id,v_id,v_elapsed,true
        );
      end if;
    end if;

    if v_id=v_character_id or v_shared_exertion then
      if v_extra_satiety>0 then
        update public.character_resource_states rs
        set current=greatest(0,rs.current-v_extra_satiety),
            updated_at=now(),updated_by=null
        where rs.character_id=v_id
          and rs.state_key='survival_satiety';
      end if;
      if v_extra_alertness>0 then
        update public.character_resource_states rs
        set current=greatest(0,rs.current-v_extra_alertness),
            updated_at=now(),updated_by=null
        where rs.character_id=v_id
          and rs.state_key='survival_alertness';
      end if;
    end if;
  end loop;

  -- Food belongs to the source PC only. Consume directly with revision-scoped
  -- engine command ids so regenerate after rollback cannot replay an old
  -- Stage-27 inventory receipt keyed only by source_message_id.
  if v_args ? 'food' then
    for v_food in select value from jsonb_array_elements(v_args->'food')
    loop
      v_food_item_id:=(v_food->>'item_id')::uuid;
      v_food_quantity:=coalesce(nullif(v_food->>'quantity','')::integer,1);
      v_food_restore:=coalesce(nullif(v_food->>'satiety_restore','')::integer,0);

      if v_food_quantity<1 or v_food_quantity>100
         or v_food_restore<0 or v_food_restore>100 then
        raise exception using errcode='22023',message='survival_turn_food_entry_invalid';
      end if;

      select * into v_item
      from public.character_inventory_items i
      where i.id=v_food_item_id
        and i.character_id=v_character_id
      for update;

      if v_item.id is null or v_item.quantity<v_food_quantity then
        raise exception using errcode='22023',message='survival_turn_food_not_in_inventory';
      end if;

      v_subcommand_id:=md5(
        v_command_id::text||'|food|'||v_food_item_id::text
      )::uuid;

      if v_food_quantity=v_item.quantity then
        v_item_result:=public.remove_inventory_item_v1(
          v_character_id,v_food_item_id,v_item.version,v_subcommand_id
        );
      else
        v_item_result:=public.update_inventory_item_v3(
          v_character_id,
          v_food_item_id,
          jsonb_build_object('quantity',v_item.quantity-v_food_quantity),
          null,
          v_item.version,
          v_subcommand_id
        );
      end if;

      update public.character_resource_states rs
      set current=least(rs.max_snapshot,rs.current+v_food_restore),
          updated_at=now(),updated_by=null
      where rs.character_id=v_character_id
        and rs.state_key='survival_satiety';

      v_food_results:=v_food_results||jsonb_build_array(
        jsonb_build_object(
          'item_id',v_food_item_id,
          'quantity',v_food_quantity,
          'satiety_restore',v_food_restore,
          'inventory_result',v_item_result
        )
      );
    end loop;
  end if;

  if v_rest_type<>'none' then
    foreach v_id in array v_rest_ids
    loop
      if v_rest_type='short_rest' then
        perform public.grant_character_short_rest(v_id);
      else
        perform public.grant_character_long_rest(v_id);
      end if;
    end loop;
  end if;

  v_dawn_crossings:=greatest(
    0,
    (
      floor((v_to_minute-300)::numeric/1440)
      - floor((v_base_minute-300)::numeric/1440)
    )::integer
  );

  if v_dawn_crossings>0 then
    foreach v_id in array v_participant_ids
    loop
      for i in 1..v_dawn_crossings loop
        perform public.recover_character_resources(v_id,'dawn');
      end loop;
    end loop;
  end if;

  perform set_config('meganot.party_time_sync','off',true);

  foreach v_id in array v_participant_ids
  loop
    v_pressure:=private.resolve_character_survival_pressure_v1(v_id);
    v_participant_results:=v_participant_results||jsonb_build_array(
      jsonb_build_object(
        'character_id',v_id,
        'survival',v_pressure
      )
    );
  end loop;

  v_after:=private.ai_survival_capture_snapshot_v1(
    p_campaign_id,v_room_id,v_participant_ids,v_inventory_ids
  );

  v_pressure:=private.resolve_character_survival_pressure_v1(v_character_id);

  v_result:=jsonb_build_object(
    'command_id',v_command_id,
    'revision_id',v_revision.id,
    'character_id',v_character_id,
    'participant_character_ids',to_jsonb(v_participant_ids),
    'elapsed_minutes',v_elapsed,
    'time_reason',v_reason,
    'from_minute',v_base_minute,
    'to_minute',v_to_minute,
    'campaign_day',private.ai_campaign_day_from_minute_v1(v_to_minute),
    'day_period',private.ai_day_period_from_campaign_minute_v1(v_to_minute),
    'extra_satiety_depletion',v_extra_satiety,
    'extra_alertness_depletion',v_extra_alertness,
    'shared_exertion',v_shared_exertion,
    'sleep_minutes',v_sleep_minutes,
    'shared_sleep',v_shared_sleep,
    'rest_type',v_rest_type,
    'shared_rest',v_shared_rest,
    'dawn_crossings',v_dawn_crossings,
    'food',v_food_results,
    'survival',v_pressure,
    'participants',v_participant_results,
    'canonical_state_changed',true,
    'replayed',false
  );

  insert into private.ai_survival_turn_receipts_v1(
    command_id,campaign_id,source_message_id,character_id,revision_id,
    participant_character_ids,arguments,result,before_state,after_state
  ) values (
    v_command_id,p_campaign_id,p_source_message_id,v_character_id,v_revision.id,
    v_participant_ids,v_args,v_result,v_before,v_after
  );

  insert into private.ai_gm_turn_effects(
    revision_id,effect_kind,effect_ref,reversible,payload
  ) values (
    v_revision.id,
    'survival_turn',
    v_command_id::text,
    true,
    jsonb_build_object(
      'command_id',v_command_id,
      'source_message_id',p_source_message_id,
      'participant_character_ids',to_jsonb(v_participant_ids),
      'from_minute',v_base_minute,
      'to_minute',v_to_minute,
      'elapsed_minutes',v_elapsed
    )
  )
  on conflict(revision_id,effect_kind,effect_ref) do update set
    reversible=true,
    payload=excluded.payload,
    rolled_back_at=null;

  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.ai_gm_commit_survival_turn_v1(p_campaign_id uuid, p_actor_user_id uuid, p_source_message_id bigint, p_args jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.ai_gm_commit_survival_turn_v2(
    p_campaign_id,p_actor_user_id,p_source_message_id,p_args
  )
$function$;

revoke all on function private.ai_survival_capture_snapshot_v1(uuid,uuid,uuid[],uuid[])
  from public, anon, authenticated;
grant execute on function private.ai_survival_capture_snapshot_v1(uuid,uuid,uuid[],uuid[])
  to service_role;

revoke all on function private.rollback_ai_survival_receipt_v1(uuid)
  from public, anon, authenticated;
grant execute on function private.rollback_ai_survival_receipt_v1(uuid)
  to service_role;

revoke all on function public.ai_gm_commit_survival_turn_v2(uuid,uuid,bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.ai_gm_commit_survival_turn_v2(uuid,uuid,bigint,jsonb)
  to service_role;

revoke all on function public.ai_gm_commit_survival_turn_v1(uuid,uuid,bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.ai_gm_commit_survival_turn_v1(uuid,uuid,bigint,jsonb)
  to service_role;

drop trigger if exists ai_gm_turn_effects_survival_rollback_v1
  on private.ai_gm_turn_effects;

create trigger ai_gm_turn_effects_survival_rollback_v1
before update of rolled_back_at
on private.ai_gm_turn_effects
for each row
execute function private.ai_survival_effect_rollback_trigger_v1();
