
-- AI Survival Stage 2: slower survival pacing, authoritative d20 pressure,
-- atomic food/sleep/rest mechanics and bounded exertion depletion.

alter table private.character_survival_runtime
  drop constraint if exists character_survival_runtime_satiety_remainder_check,
  drop constraint if exists character_survival_runtime_alertness_remainder_check;

alter table private.character_survival_runtime
  add constraint character_survival_runtime_satiety_remainder_check
    check (satiety_remainder >= 0 and satiety_remainder < 2880),
  add constraint character_survival_runtime_alertness_remainder_check
    check (alertness_remainder >= 0 and alertness_remainder < 4320);

create or replace function private.tick_character_survival_v1(
  p_campaign_id uuid,
  p_character_id uuid,
  p_elapsed_minutes integer,
  p_deplete_alertness boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime private.character_survival_runtime%rowtype;
  v_satiety_total bigint;
  v_alertness_total bigint;
  v_satiety_drop integer;
  v_alertness_drop integer;
begin
  if coalesce(p_elapsed_minutes,0) < 0 or p_elapsed_minutes > 10080 then
    raise exception using errcode='22023',message='survival_elapsed_minutes_out_of_range';
  end if;

  perform private.ensure_character_survival_state_v1(p_campaign_id,p_character_id);

  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    return private.resolve_character_survival_pressure_v1(p_character_id);
  end if;

  select * into v_runtime
  from private.character_survival_runtime
  where character_id=p_character_id
  for update;

  -- Satiety: 100 -> 0 after 48 hours without food.
  -- Integer remainder keeps small scene increments lossless.
  v_satiety_total :=
    v_runtime.satiety_remainder::bigint + p_elapsed_minutes::bigint * 100;
  v_satiety_drop := (v_satiety_total / 2880)::integer;

  update private.character_survival_runtime
  set satiety_remainder=(v_satiety_total % 2880)::integer,
      updated_at=now()
  where character_id=p_character_id;

  update public.character_resource_states
  set current=greatest(0,current-v_satiety_drop),
      updated_at=now(),
      updated_by=null
  where character_id=p_character_id
    and state_key='survival_satiety';

  if p_deplete_alertness then
    -- Alertness: 100 -> 0 after 72 hours continuously awake.
    v_alertness_total :=
      v_runtime.alertness_remainder::bigint + p_elapsed_minutes::bigint * 100;
    v_alertness_drop := (v_alertness_total / 4320)::integer;

    update private.character_survival_runtime
    set alertness_remainder=(v_alertness_total % 4320)::integer,
        updated_at=now()
    where character_id=p_character_id;

    update public.character_resource_states
    set current=greatest(0,current-v_alertness_drop),
        updated_at=now(),
        updated_by=null
    where character_id=p_character_id
      and state_key='survival_alertness';
  end if;

  return private.resolve_character_survival_pressure_v1(p_character_id);
end
$$;

alter table public.location_links
  add column if not exists travel_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.location_links'::regclass
      and conname='location_links_travel_minutes_check'
  ) then
    alter table public.location_links
      add constraint location_links_travel_minutes_check
      check (travel_minutes is null or (travel_minutes between 1 and 10080));
  end if;
end
$$;

create or replace function public.send_chat_roll_v5(
  p_room_id uuid,
  p_character_id uuid,
  p_label text,
  p_kind text,
  p_modifier integer default 0,
  p_roll_d20 boolean default true,
  p_dice_count integer default 0,
  p_dice_sides integer default 0,
  p_dice_modifier integer default 0,
  p_d20_floor integer default 1,
  p_resource_costs jsonb default '[]'::jsonb,
  p_d20_mode text default 'normal',
  p_d20_sources jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested_mode text := lower(btrim(coalesce(p_d20_mode,'normal')));
  v_effective_mode text := 'normal';
  v_survival jsonb := '{}'::jsonb;
  v_survival_mode text := 'normal';
  v_survival_modifier integer := 0;
  v_effective_modifier integer := p_modifier;
  v_d20_raw integer;
  v_d20_raw_a integer;
  v_d20_raw_b integer;
  v_d20 integer;
  v_d20_rolls integer[] := '{}';
  v_total integer;
  v_roll integer;
  v_rolls integer[] := '{}';
  v_dice_total integer := 0;
  v_id bigint;
  i integer;
  v_payload jsonb;
  v_sources jsonb := coalesce(p_d20_sources,'[]'::jsonb);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_write_chat_room(p_room_id,auth.uid()) then
    raise exception 'Нет права писать в этот чат';
  end if;
  if length(trim(coalesce(p_label,'')))=0 then raise exception 'Roll label is required'; end if;
  if p_modifier < -500 or p_modifier > 500 or p_dice_modifier < -500 or p_dice_modifier > 500 then
    raise exception 'Modifier is out of range';
  end if;
  if p_dice_count < 0 or p_dice_count > 40 then raise exception 'Dice count is out of range'; end if;
  if p_dice_count > 0 and (p_dice_sides < 2 or p_dice_sides > 1000) then
    raise exception 'Die sides are out of range';
  end if;
  if not p_roll_d20 and p_dice_count=0 then raise exception 'Roll must contain at least one die'; end if;
  if p_d20_floor < 1 or p_d20_floor > 20 then raise exception 'D20 floor is out of range'; end if;
  if not p_roll_d20 and p_d20_floor<>1 then raise exception 'D20 floor requires a d20 roll'; end if;
  if v_requested_mode not in ('normal','advantage','disadvantage') then
    raise exception 'D20 mode is invalid';
  end if;
  if jsonb_typeof(v_sources)<>'array' then
    raise exception 'D20 sources must be an array';
  end if;

  perform private.consume_character_resource_costs(
    p_character_id,
    coalesce(p_resource_costs,'[]'::jsonb),
    auth.uid()
  );

  if p_roll_d20 then
    v_survival := private.resolve_character_survival_pressure_v1(p_character_id);
    v_survival_mode := coalesce(v_survival#>>'{roll,mode}','normal');
    v_survival_modifier := coalesce((v_survival#>>'{roll,flat_penalty}')::integer,0);
    v_effective_modifier := p_modifier + v_survival_modifier;

    -- Standard advantage/disadvantage cancellation. Survival disadvantage is
    -- one source no matter whether hunger, fatigue, or both caused it.
    if v_survival_mode='disadvantage' then
      if v_requested_mode='advantage' then
        v_effective_mode := 'normal';
      else
        v_effective_mode := 'disadvantage';
      end if;
    else
      v_effective_mode := v_requested_mode;
    end if;

    v_d20_raw_a:=floor(random()*20+1)::integer;
    if v_effective_mode='normal' then
      v_d20_raw:=v_d20_raw_a;
      v_d20_rolls:=array[v_d20_raw_a];
    else
      v_d20_raw_b:=floor(random()*20+1)::integer;
      v_d20_rolls:=array[v_d20_raw_a,v_d20_raw_b];
      v_d20_raw:=case
        when v_effective_mode='advantage' then greatest(v_d20_raw_a,v_d20_raw_b)
        else least(v_d20_raw_a,v_d20_raw_b)
      end;
    end if;

    v_d20:=greatest(v_d20_raw,p_d20_floor);
    v_total:=v_d20+v_effective_modifier;
  end if;

  if p_dice_count>0 then
    for i in 1..p_dice_count loop
      v_roll:=floor(random()*p_dice_sides+1)::integer;
      v_rolls:=array_append(v_rolls,v_roll);
      v_dice_total:=v_dice_total+v_roll;
    end loop;
    v_dice_total:=v_dice_total+p_dice_modifier;
  end if;

  v_payload:=jsonb_build_object(
      'label',trim(p_label),
      'kind',coalesce(nullif(trim(p_kind),''),'roll'),
      'modifier',case when p_roll_d20 then v_effective_modifier else p_modifier end,
      'baseModifier',p_modifier,
      'survivalModifier',case when p_roll_d20 then v_survival_modifier else 0 end,
      'rollD20',p_roll_d20
    )
    || case when p_roll_d20 then jsonb_build_object(
      'd20Raw',v_d20_raw,
      'd20Rolls',to_jsonb(v_d20_rolls),
      'd20ModeRequested',v_requested_mode,
      'd20Mode',v_effective_mode,
      'd20',v_d20,
      'd20Floor',p_d20_floor,
      'modifierSources',
        v_sources || coalesce(v_survival#>'{roll,sources}','[]'::jsonb),
      'survivalPressure',v_survival,
      'total',v_total
    ) else '{}'::jsonb end
    || case when p_dice_count>0 then jsonb_build_object(
      'effect',jsonb_build_object(
        'count',p_dice_count,
        'sides',p_dice_sides,
        'rolls',to_jsonb(v_rolls),
        'modifier',p_dice_modifier,
        'total',v_dice_total
      )
    ) else '{}'::jsonb end
    || case when jsonb_array_length(coalesce(p_resource_costs,'[]'::jsonb))>0
      then jsonb_build_object('resourceCosts',p_resource_costs)
      else '{}'::jsonb
    end;

  insert into public.chat_messages(
    room_id,character_id,body,event_kind,event_payload
  ) values(
    p_room_id,p_character_id,'','roll',v_payload
  )
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.send_chat_roll_v5(
  uuid,uuid,text,text,integer,boolean,integer,integer,integer,integer,jsonb,text,jsonb
) from public, anon;
grant execute on function public.send_chat_roll_v5(
  uuid,uuid,text,text,integer,boolean,integer,integer,integer,integer,jsonb,text,jsonb
) to authenticated, service_role;

create or replace function public.send_chat_roll_v4(
  p_room_id uuid,
  p_character_id uuid,
  p_label text,
  p_kind text,
  p_modifier integer default 0,
  p_roll_d20 boolean default true,
  p_dice_count integer default 0,
  p_dice_sides integer default 0,
  p_dice_modifier integer default 0,
  p_d20_floor integer default 1,
  p_resource_costs jsonb default '[]'::jsonb
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select public.send_chat_roll_v5(
    p_room_id,p_character_id,p_label,p_kind,p_modifier,p_roll_d20,
    p_dice_count,p_dice_sides,p_dice_modifier,p_d20_floor,p_resource_costs,
    'normal','[]'::jsonb
  )
$$;

create table if not exists private.ai_survival_turn_receipts_v1 (
  command_id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_message_id bigint not null references public.chat_messages(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  arguments jsonb not null check (jsonb_typeof(arguments)='object'),
  result jsonb not null check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  unique(campaign_id,source_message_id,character_id)
);

create index if not exists ai_survival_turn_receipts_character_idx
  on private.ai_survival_turn_receipts_v1(character_id,created_at desc);

create or replace function public.ai_gm_commit_survival_turn_v1(
  p_campaign_id uuid,
  p_actor_user_id uuid,
  p_source_message_id bigint,
  p_args jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  v_args jsonb := coalesce(p_args,'{}'::jsonb);
  v_character_id uuid;
  v_world public.character_world_state%rowtype;
  v_room_id uuid;
  v_elapsed integer;
  v_reason text;
  v_extra_satiety integer;
  v_extra_alertness integer;
  v_sleep_minutes integer;
  v_awake_minutes integer;
  v_rest_type text;
  v_from_minute bigint;
  v_to_minute bigint;
  v_dawn_crossings integer := 0;
  v_pressure jsonb;
  v_food jsonb;
  v_food_item_id uuid;
  v_food_quantity integer;
  v_food_restore integer;
  v_food_results jsonb := '[]'::jsonb;
  v_food_result jsonb;
  v_seen_food_ids uuid[] := '{}'::uuid[];
  v_sleep_restore integer := 0;
  v_command_id uuid;
  v_existing private.ai_survival_turn_receipts_v1%rowtype;
  v_result jsonb;
  i integer;
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501',message='service_role_required';
  end if;
  if p_campaign_id is null or p_actor_user_id is null or p_source_message_id is null then
    raise exception using errcode='22023',message='survival_turn_identity_required';
  end if;
  if jsonb_typeof(v_args)<>'object' then
    raise exception using errcode='22023',message='survival_turn_args_invalid';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501',message='survival_turn_ai_world_only';
  end if;
  if not private.is_campaign_manager(p_campaign_id,p_actor_user_id) then
    raise exception using errcode='42501',message='campaign_manager_required';
  end if;

  begin
    v_character_id:=nullif(btrim(coalesce(v_args->>'character_id','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='survival_turn_character_invalid';
  end;
  if v_character_id is null or not exists(
    select 1 from public.characters c
    where c.id=v_character_id and c.campaign_id=p_campaign_id
      and c.character_type='pc' and c.life_state='alive'
  ) then
    raise exception using errcode='22023',message='survival_turn_character_unavailable';
  end if;

  v_elapsed:=coalesce(nullif(v_args->>'elapsed_minutes','')::integer,0);
  v_reason:=lower(btrim(coalesce(v_args->>'time_reason','scene')));
  v_extra_satiety:=coalesce(nullif(v_args->>'extra_satiety_depletion','')::integer,0);
  v_extra_alertness:=coalesce(nullif(v_args->>'extra_alertness_depletion','')::integer,0);
  v_sleep_minutes:=coalesce(nullif(v_args->>'sleep_minutes','')::integer,0);
  v_rest_type:=lower(btrim(coalesce(v_args->>'rest_type','none')));

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

  v_command_id:=md5(
    'ai-survival-v1|'||p_campaign_id::text||'|'||
    p_source_message_id::text||'|'||v_character_id::text
  )::uuid;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_command_id::text,0)
  );

  select * into v_existing
  from private.ai_survival_turn_receipts_v1
  where command_id=v_command_id;

  if v_existing.command_id is not null then
    return v_existing.result || jsonb_build_object('replayed',true);
  end if;

  perform set_config('request.jwt.claim.sub',p_actor_user_id::text,true);
  perform private.ensure_character_survival_state_v1(p_campaign_id,v_character_id);

  select * into v_world
  from public.character_world_state
  where campaign_id=p_campaign_id and character_id=v_character_id
  for update;

  if v_world.character_id is null then
    raise exception using errcode='22023',message='survival_turn_world_state_missing';
  end if;

  select m.room_id into v_room_id
  from public.chat_messages m
  join public.chat_rooms r on r.id=m.room_id and r.campaign_id=p_campaign_id
  where m.id=p_source_message_id;

  if v_room_id is null then
    raise exception using errcode='22023',message='survival_turn_source_message_unavailable';
  end if;

  v_from_minute:=v_world.campaign_minute;
  v_to_minute:=v_from_minute+v_elapsed;
  v_awake_minutes:=greatest(0,v_elapsed-v_sleep_minutes);

  update public.character_world_state
  set campaign_minute=v_to_minute,updated_at=now(),updated_by=null
  where character_id=v_character_id and campaign_id=p_campaign_id;

  update public.chat_rooms
  set campaign_minute=greatest(campaign_minute,v_to_minute),updated_at=now()
  where id=v_room_id and campaign_id=p_campaign_id;

  if v_awake_minutes>0 then
    perform private.tick_character_survival_v1(
      p_campaign_id,v_character_id,v_awake_minutes,true
    );
  end if;
  if v_sleep_minutes>0 then
    perform private.tick_character_survival_v1(
      p_campaign_id,v_character_id,v_sleep_minutes,false
    );
  end if;

  -- Heavy exertion is a bounded semantic AI decision. It can only deplete.
  if v_extra_satiety>0 then
    update public.character_resource_states
    set current=greatest(0,current-v_extra_satiety),
        updated_at=now(),updated_by=null
    where character_id=v_character_id and state_key='survival_satiety';
  end if;
  if v_extra_alertness>0 then
    update public.character_resource_states
    set current=greatest(0,current-v_extra_alertness),
        updated_at=now(),updated_by=null
    where character_id=v_character_id and state_key='survival_alertness';
  end if;

  if v_args ? 'food' then
    if jsonb_typeof(v_args->'food')<>'array'
       or jsonb_array_length(v_args->'food')>8 then
      raise exception using errcode='22023',message='survival_turn_food_invalid';
    end if;

    for v_food in select value from jsonb_array_elements(v_args->'food')
    loop
      if jsonb_typeof(v_food)<>'object' then
        raise exception using errcode='22023',message='survival_turn_food_entry_invalid';
      end if;
      begin
        v_food_item_id:=nullif(btrim(coalesce(v_food->>'item_id','')),'')::uuid;
      exception when invalid_text_representation then
        raise exception using errcode='22023',message='survival_turn_food_item_invalid';
      end;
      v_food_quantity:=coalesce(nullif(v_food->>'quantity','')::integer,1);
      v_food_restore:=coalesce(nullif(v_food->>'satiety_restore','')::integer,0);

      if v_food_item_id is null
         or v_food_quantity<1 or v_food_quantity>100
         or v_food_restore<0 or v_food_restore>100 then
        raise exception using errcode='22023',message='survival_turn_food_entry_invalid';
      end if;
      if v_food_item_id=any(v_seen_food_ids) then
        raise exception using errcode='22023',message='survival_turn_food_item_duplicate';
      end if;
      v_seen_food_ids:=array_append(v_seen_food_ids,v_food_item_id);

      if not exists(
        select 1 from public.character_inventory_items i
        where i.id=v_food_item_id and i.character_id=v_character_id
          and i.quantity>=v_food_quantity
      ) then
        raise exception using errcode='22023',message='survival_turn_food_not_in_inventory';
      end if;

      v_food_result:=public.ai_gm_commit_inventory_delta_v1(
        p_campaign_id,p_actor_user_id,p_source_message_id,
        jsonb_build_object(
          'action','consume',
          'character_id',v_character_id,
          'item_id',v_food_item_id,
          'quantity',v_food_quantity
        )
      );

      update public.character_resource_states
      set current=least(max_snapshot,current+v_food_restore),
          updated_at=now(),updated_by=null
      where character_id=v_character_id and state_key='survival_satiety';

      v_food_results:=v_food_results||jsonb_build_array(
        jsonb_build_object(
          'item_id',v_food_item_id,
          'quantity',v_food_quantity,
          'satiety_restore',v_food_restore,
          'inventory_result',v_food_result
        )
      );
    end loop;
  end if;

  if v_sleep_minutes>0 then
    -- Eight hours of actual sleep can fully restore alertness from empty.
    v_sleep_restore:=floor(v_sleep_minutes::numeric*100/480)::integer;
    update public.character_resource_states
    set current=least(max_snapshot,current+v_sleep_restore),
        updated_at=now(),updated_by=null
    where character_id=v_character_id and state_key='survival_alertness';
  end if;

  if v_rest_type='short_rest' then
    perform public.grant_character_short_rest(v_character_id);
  elsif v_rest_type='long_rest' then
    perform public.grant_character_long_rest(v_character_id);
  end if;

  v_dawn_crossings:=greatest(
    0,
    (
      floor((v_to_minute-300)::numeric/1440)
      - floor((v_from_minute-300)::numeric/1440)
    )::integer
  );

  if v_dawn_crossings>0 then
    for i in 1..v_dawn_crossings loop
      perform public.recover_character_resources(v_character_id,'dawn');
    end loop;
  end if;

  v_pressure:=private.resolve_character_survival_pressure_v1(v_character_id);

  v_result:=jsonb_build_object(
    'character_id',v_character_id,
    'elapsed_minutes',v_elapsed,
    'time_reason',v_reason,
    'from_minute',v_from_minute,
    'to_minute',v_to_minute,
    'campaign_day',private.ai_campaign_day_from_minute_v1(v_to_minute),
    'day_period',private.ai_day_period_from_campaign_minute_v1(v_to_minute),
    'extra_satiety_depletion',v_extra_satiety,
    'extra_alertness_depletion',v_extra_alertness,
    'sleep_minutes',v_sleep_minutes,
    'sleep_restore',v_sleep_restore,
    'rest_type',v_rest_type,
    'dawn_crossings',v_dawn_crossings,
    'food',v_food_results,
    'survival',v_pressure,
    'canonical_state_changed',true,
    'replayed',false
  );

  insert into private.ai_survival_turn_receipts_v1(
    command_id,campaign_id,source_message_id,character_id,arguments,result
  ) values (
    v_command_id,p_campaign_id,p_source_message_id,v_character_id,v_args,v_result
  );

  return v_result;
end
$$;

revoke all on function public.ai_gm_commit_survival_turn_v1(
  uuid,uuid,bigint,jsonb
) from public, anon, authenticated;
grant execute on function public.ai_gm_commit_survival_turn_v1(
  uuid,uuid,bigint,jsonb
) to service_role;

comment on function public.ai_gm_commit_survival_turn_v1(uuid,uuid,bigint,jsonb) is
  'AI-world atomic survival mutation: exact time, bounded exertion, food consumption, sleep/rest and dawn recovery.';
