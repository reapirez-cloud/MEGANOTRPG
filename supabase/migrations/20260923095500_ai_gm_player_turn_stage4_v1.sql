-- AI GM Stage 4: durable player turn draft + atomic submit.
--
-- Selecting an action/spell/attack only writes a draft. The authoritative
-- gameplay RPCs are executed only inside submit_player_turn_v1, in one
-- PostgreSQL transaction. The final plain-text turn message is inserted last;
-- the client launches AI GM only from that message after successful commit.

alter table public.chat_messages
  add column if not exists turn_command_id uuid;

alter table public.chat_messages
  add column if not exists turn_component text;

alter table public.chat_messages
  add column if not exists turn_order smallint;

alter table public.chat_messages
  drop constraint if exists chat_messages_turn_order_check;

alter table public.chat_messages
  add constraint chat_messages_turn_order_check
  check (turn_order is null or turn_order >= 0);

alter table public.chat_messages
  drop constraint if exists chat_messages_turn_component_check;

alter table public.chat_messages
  add constraint chat_messages_turn_component_check
  check (
    turn_component is null
    or turn_component in ('action','bonus_action','movement','description')
  );

create index if not exists chat_messages_turn_command_idx
  on public.chat_messages (turn_command_id, id)
  where turn_command_id is not null;

create table if not exists public.player_turn_drafts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft','submitted','cancelled')),
  revision integer not null default 1 check (revision >= 1),
  action_entry jsonb,
  bonus_action_entry jsonb,
  movement jsonb,
  component_order text[] not null default array[]::text[],
  description text not null default '',
  turn_command_id uuid,
  submission_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint player_turn_drafts_action_object
    check (action_entry is null or jsonb_typeof(action_entry) = 'object'),
  constraint player_turn_drafts_bonus_object
    check (bonus_action_entry is null or jsonb_typeof(bonus_action_entry) = 'object'),
  constraint player_turn_drafts_movement_object
    check (movement is null or jsonb_typeof(movement) = 'object'),
  constraint player_turn_drafts_component_order_check
    check (
      component_order <@ array['action','bonus_action','movement']::text[]
      and cardinality(component_order) <= 3
    ),
  constraint player_turn_drafts_description_length
    check (char_length(description) <= 5000)
);

create unique index if not exists player_turn_drafts_one_open_per_actor
  on public.player_turn_drafts (room_id, character_id, user_id)
  where status = 'draft';

create unique index if not exists player_turn_drafts_turn_command_unique
  on public.player_turn_drafts (turn_command_id)
  where turn_command_id is not null;

create index if not exists player_turn_drafts_user_updated_idx
  on public.player_turn_drafts (user_id, updated_at desc);

alter table public.player_turn_drafts enable row level security;

drop policy if exists player_turn_drafts_read_own
  on public.player_turn_drafts;

create policy player_turn_drafts_read_own
on public.player_turn_drafts
for select
to authenticated
using (user_id = auth.uid());

revoke insert, update, delete on public.player_turn_drafts
  from public, anon, authenticated;
grant select on public.player_turn_drafts to authenticated;
grant all on public.player_turn_drafts to service_role;

create or replace function private.assert_player_turn_actor_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_campaign_id uuid;
begin
  if p_user_id is null then
    raise exception 'Authentication required';
  end if;

  select r.campaign_id
    into v_campaign_id
  from public.chat_rooms r
  where r.id = p_room_id
    and r.category = 'game'
    and r.room_state = 'open'
    and r.is_read_only = false
    and r.scene_state = 'active';

  if v_campaign_id is null then
    raise exception 'Player turn requires an active game room';
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.id = p_character_id
      and c.campaign_id = v_campaign_id
      and c.character_type = 'pc'
      and c.life_state = 'alive'
      and c.assigned_user_id = p_user_id
  ) then
    raise exception 'Player turn requires your live PC';
  end if;

  if not private.can_write_chat_room(p_room_id, p_user_id) then
    raise exception 'Нет права писать в этот чат';
  end if;

  return v_campaign_id;
end;
$$;

create or replace function private.normalize_player_turn_entry_v1(
  p_entry jsonb,
  p_slot text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
volatile
as $$
declare
  v_kind text;
  v_command_id uuid;
  v_label text;
begin
  if p_entry is null then
    return null;
  end if;

  if jsonb_typeof(p_entry) <> 'object' then
    raise exception 'Turn entry must be an object';
  end if;

  if p_slot not in ('action','bonus_action') then
    raise exception 'Invalid turn slot';
  end if;

  v_kind := trim(coalesce(p_entry ->> 'kind', ''));
  if v_kind not in (
    'template_action',
    'template_roll',
    'template_spell',
    'spell_with_modifiers',
    'inventory_event',
    'inventory_roll',
    'raw_event',
    'raw_roll'
  ) then
    raise exception 'Unsupported turn entry kind: %', v_kind;
  end if;

  v_label := trim(coalesce(p_entry ->> 'label', ''));
  if v_label = '' then
    raise exception 'Turn entry label is required';
  end if;

  begin
    v_command_id := nullif(trim(coalesce(p_entry ->> 'commandId', '')), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Turn entry command id is invalid';
  end;

  if v_command_id is null then
    v_command_id := gen_random_uuid();
  end if;

  return p_entry
    || jsonb_build_object(
      'kind', v_kind,
      'label', left(v_label, 240),
      'slot', p_slot,
      'commandId', v_command_id::text
    );
end;
$$;

create or replace function private.normalize_player_turn_movement_v1(
  p_movement jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
immutable
as $$
declare
  v_description text;
begin
  if p_movement is null then
    return null;
  end if;

  if jsonb_typeof(p_movement) <> 'object' then
    raise exception 'Movement must be an object';
  end if;

  v_description := left(
    trim(coalesce(p_movement ->> 'description', '')),
    1000
  );

  if v_description = '' then
    return null;
  end if;

  return jsonb_build_object('description', v_description);
end;
$$;

create or replace function private.normalize_player_turn_order_v1(
  p_action_entry jsonb,
  p_bonus_action_entry jsonb,
  p_movement jsonb,
  p_requested text[]
)
returns text[]
language plpgsql
security definer
set search_path = ''
immutable
as $$
declare
  v_requested text[] := coalesce(p_requested, array[]::text[]);
  v_result text[] := array[]::text[];
  v_component text;
begin
  foreach v_component in array v_requested loop
    if v_component not in ('action','bonus_action','movement') then
      raise exception 'Unsupported player turn component: %', v_component;
    end if;
    if v_component = any(v_result) then
      raise exception 'Duplicate player turn component: %', v_component;
    end if;
    if v_component = 'action' and p_action_entry is null then
      continue;
    elsif v_component = 'bonus_action' and p_bonus_action_entry is null then
      continue;
    elsif v_component = 'movement' and p_movement is null then
      continue;
    end if;
    v_result := array_append(v_result, v_component);
  end loop;

  if p_action_entry is not null and not ('action' = any(v_result)) then
    v_result := array_append(v_result, 'action');
  end if;
  if p_bonus_action_entry is not null and not ('bonus_action' = any(v_result)) then
    v_result := array_append(v_result, 'bonus_action');
  end if;
  if p_movement is not null and not ('movement' = any(v_result)) then
    v_result := array_append(v_result, 'movement');
  end if;

  return v_result;
end;
$$;

create or replace function public.save_player_turn_draft_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_action_entry jsonb default null,
  p_bonus_action_entry jsonb default null,
  p_movement jsonb default null,
  p_component_order text[] default null,
  p_description text default '',
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_existing public.player_turn_drafts%rowtype;
  v_row public.player_turn_drafts%rowtype;
  v_action jsonb;
  v_bonus jsonb;
  v_movement jsonb;
  v_component_order text[];
begin
  v_campaign_id :=
    private.assert_player_turn_actor_v1(
      p_room_id,
      p_character_id,
      v_user_id
    );

  v_action :=
    private.normalize_player_turn_entry_v1(p_action_entry, 'action');
  v_bonus :=
    private.normalize_player_turn_entry_v1(p_bonus_action_entry, 'bonus_action');
  v_movement :=
    private.normalize_player_turn_movement_v1(p_movement);
  v_component_order := private.normalize_player_turn_order_v1(
    v_action,
    v_bonus,
    v_movement,
    p_component_order
  );

  select *
    into v_existing
  from public.player_turn_drafts d
  where d.room_id = p_room_id
    and d.character_id = p_character_id
    and d.user_id = v_user_id
    and d.status = 'draft'
  for update;

  if v_existing.id is null then
    if p_expected_revision is not null then
      raise exception 'Turn draft changed; reload it';
    end if;

    insert into public.player_turn_drafts (
      campaign_id,
      room_id,
      character_id,
      user_id,
      action_entry,
      bonus_action_entry,
      movement,
      component_order,
      description
    )
    values (
      v_campaign_id,
      p_room_id,
      p_character_id,
      v_user_id,
      v_action,
      v_bonus,
      v_movement,
      v_component_order,
      left(coalesce(p_description, ''), 5000)
    )
    returning * into v_row;
  else
    if p_expected_revision is not null
       and v_existing.revision <> p_expected_revision
    then
      raise exception 'Turn draft changed; reload it';
    end if;

    update public.player_turn_drafts
    set action_entry = v_action,
        bonus_action_entry = v_bonus,
        movement = v_movement,
        component_order = v_component_order,
        description = left(coalesce(p_description, ''), 5000),
        revision = revision + 1,
        updated_at = now()
    where id = v_existing.id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.get_player_turn_draft_v1(
  p_room_id uuid,
  p_character_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.player_turn_drafts%rowtype;
begin
  perform private.assert_player_turn_actor_v1(
    p_room_id,
    p_character_id,
    v_user_id
  );

  select *
    into v_row
  from public.player_turn_drafts d
  where d.room_id = p_room_id
    and d.character_id = p_character_id
    and d.user_id = v_user_id
    and d.status = 'draft'
  order by d.updated_at desc
  limit 1;

  if v_row.id is null then
    return null;
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.cancel_player_turn_draft_v1(
  p_draft_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.player_turn_drafts
  set status = 'cancelled',
      updated_at = now()
  where id = p_draft_id
    and user_id = auth.uid()
    and status = 'draft';

  return found;
end;
$$;

create or replace function private.execute_player_turn_entry_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_turn_command_id uuid,
  p_component text,
  p_turn_order integer,
  p_entry jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_command_id uuid;
  v_message_id bigint;
  v_payload jsonb;
  v_modifier_ids text[];
begin
  if p_entry is null then
    return null;
  end if;

  v_kind := p_entry ->> 'kind';
  v_command_id := (p_entry ->> 'commandId')::uuid;
  v_payload :=
    coalesce(p_entry -> 'payload', '{}'::jsonb)
    || jsonb_build_object(
      'turnCommandId', p_turn_command_id,
      'turnComponent', p_component
    );

  if v_kind = 'template_action' then
    v_message_id := public.send_chat_template_action_v2(
      p_room_id,
      p_character_id,
      p_entry ->> 'mechanicId',
      nullif(p_entry ->> 'optionKey', ''),
      p_entry ->> 'label',
      v_payload,
      v_command_id
    );
  elsif v_kind = 'template_roll' then
    v_message_id := public.send_chat_template_roll_v2(
      p_room_id,
      p_character_id,
      p_entry ->> 'mechanicId',
      nullif(p_entry ->> 'optionKey', ''),
      p_entry ->> 'label',
      coalesce(nullif(p_entry ->> 'rollKind', ''), 'action'),
      coalesce((p_entry ->> 'modifier')::integer, 0),
      coalesce((p_entry ->> 'rollD20')::boolean, false),
      coalesce((p_entry ->> 'diceCount')::integer, 0),
      coalesce((p_entry ->> 'diceSides')::integer, 0),
      coalesce((p_entry ->> 'diceModifier')::integer, 0),
      v_command_id
    );
  elsif v_kind = 'template_spell' then
    v_message_id := public.send_chat_template_spell_v2(
      p_room_id,
      p_character_id,
      p_entry ->> 'mechanicId',
      p_entry ->> 'methodKey',
      nullif(p_entry ->> 'optionKey', ''),
      p_entry ->> 'label',
      v_payload,
      v_command_id
    );
  elsif v_kind = 'spell_with_modifiers' then
    select coalesce(array_agg(value), array[]::text[])
      into v_modifier_ids
    from jsonb_array_elements_text(
      coalesce(p_entry -> 'modifierMechanicIds', '[]'::jsonb)
    );

    v_message_id := public.send_chat_spell_with_template_modifiers_v2(
      p_room_id,
      p_character_id,
      nullif(p_entry ->> 'spellMechanicId', ''),
      nullif(p_entry ->> 'methodKey', ''),
      nullif(p_entry ->> 'optionKey', ''),
      coalesce(p_entry -> 'spellResourceCosts', '[]'::jsonb),
      v_modifier_ids,
      p_entry ->> 'label',
      v_payload,
      v_command_id
    );
  elsif v_kind = 'inventory_event' then
    v_message_id := public.send_chat_inventory_event_v1(
      p_room_id,
      p_character_id,
      (p_entry ->> 'itemId')::uuid,
      greatest(1, coalesce((p_entry ->> 'itemAmount')::integer, 1)),
      p_entry ->> 'label',
      v_payload,
      coalesce(p_entry -> 'resourceCosts', '[]'::jsonb),
      v_command_id
    );
  elsif v_kind = 'inventory_roll' then
    v_message_id := public.send_chat_inventory_roll_v1(
      p_room_id,
      p_character_id,
      (p_entry ->> 'itemId')::uuid,
      greatest(1, coalesce((p_entry ->> 'itemAmount')::integer, 1)),
      p_entry ->> 'label',
      coalesce(nullif(p_entry ->> 'rollKind', ''), 'action'),
      coalesce((p_entry ->> 'modifier')::integer, 0),
      coalesce((p_entry ->> 'rollD20')::boolean, false),
      coalesce((p_entry ->> 'diceCount')::integer, 0),
      coalesce((p_entry ->> 'diceSides')::integer, 0),
      coalesce((p_entry ->> 'diceModifier')::integer, 0),
      coalesce(p_entry -> 'resourceCosts', '[]'::jsonb),
      v_command_id
    );
  elsif v_kind = 'raw_event' then
    v_message_id := public.send_chat_event_v3(
      p_room_id,
      p_character_id,
      coalesce(nullif(p_entry ->> 'eventKind', ''), 'action'),
      p_entry ->> 'label',
      v_payload,
      coalesce(p_entry -> 'resourceCosts', '[]'::jsonb)
    );
  elsif v_kind = 'raw_roll' then
    v_message_id := public.send_chat_roll_v4(
      p_room_id,
      p_character_id,
      p_entry ->> 'label',
      coalesce(nullif(p_entry ->> 'rollKind', ''), 'action'),
      coalesce((p_entry ->> 'modifier')::integer, 0),
      coalesce((p_entry ->> 'rollD20')::boolean, true),
      coalesce((p_entry ->> 'diceCount')::integer, 0),
      coalesce((p_entry ->> 'diceSides')::integer, 0),
      coalesce((p_entry ->> 'diceModifier')::integer, 0),
      coalesce((p_entry ->> 'd20Floor')::integer, 1),
      coalesce(p_entry -> 'resourceCosts', '[]'::jsonb)
    );
  else
    raise exception 'Unsupported queued turn entry kind: %', v_kind;
  end if;

  update public.chat_messages
  set turn_command_id = p_turn_command_id,
      turn_component = p_component,
      turn_order = p_turn_order,
      event_payload = coalesce(event_payload, '{}'::jsonb)
        || jsonb_build_object(
          'turnCommandId', p_turn_command_id,
          'turnComponent', p_component,
          'turnOrder', p_turn_order
        )
  where id = v_message_id;

  return v_message_id;
end;
$$;

create or replace function public.submit_player_turn_v1(
  p_draft_id uuid,
  p_expected_revision integer,
  p_turn_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.player_turn_drafts%rowtype;
  v_campaign_id uuid;
  v_action_message_id bigint;
  v_bonus_message_id bigint;
  v_movement_message_id bigint;
  v_trigger_message_id bigint;
  v_message_ids bigint[] := array[]::bigint[];
  v_movement_text text;
  v_description text;
  v_summary_parts text[] := array[]::text[];
  v_final_body text;
  v_result jsonb;
  v_component text;
  v_turn_order integer := 0;
  v_existing_receipt public.engine_command_receipts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_turn_command_id is null then
    raise exception 'Turn command id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_turn_command_id::text, 0)
  );

  select *
    into v_existing_receipt
  from public.engine_command_receipts
  where command_id = p_turn_command_id;

  if v_existing_receipt.command_id is not null then
    if v_existing_receipt.created_by is distinct from auth.uid()
       or v_existing_receipt.engine is distinct from 'gena'
       or v_existing_receipt.command_kind is distinct from 'player.turn.v1'
    then
      raise exception 'Turn command id is already used by another command';
    end if;
    return v_existing_receipt.result;
  end if;

  select *
    into v_draft
  from public.player_turn_drafts
  where id = p_draft_id
  for update;

  if v_draft.id is null then
    raise exception 'Turn draft not found';
  end if;

  if v_draft.user_id <> auth.uid() then
    raise exception 'Turn draft belongs to another user';
  end if;

  if v_draft.status = 'submitted' then
    if v_draft.turn_command_id <> p_turn_command_id then
      raise exception 'Turn draft was submitted by another command';
    end if;
    return v_draft.submission_result;
  end if;

  if v_draft.status <> 'draft' then
    raise exception 'Turn draft is not active';
  end if;

  if v_draft.revision <> p_expected_revision then
    raise exception 'Turn draft changed; reload it';
  end if;

  v_campaign_id := private.assert_player_turn_actor_v1(
    v_draft.room_id,
    v_draft.character_id,
    auth.uid()
  );

  if v_draft.action_entry is null
     and v_draft.bonus_action_entry is null
     and v_draft.movement is null
     and trim(v_draft.description) = ''
  then
    raise exception 'Turn is empty';
  end if;

  foreach v_component in array v_draft.component_order loop
    v_turn_order := v_turn_order + 1;

    if v_component = 'action' and v_draft.action_entry is not null then
      v_action_message_id := private.execute_player_turn_entry_v1(
        v_draft.room_id,
        v_draft.character_id,
        p_turn_command_id,
        'action',
        v_turn_order,
        v_draft.action_entry
      );
      v_message_ids := array_append(v_message_ids, v_action_message_id);
      v_summary_parts := array_append(
        v_summary_parts,
        coalesce(v_draft.action_entry ->> 'label', 'Действие')
      );

    elsif v_component = 'bonus_action'
       and v_draft.bonus_action_entry is not null
    then
      v_bonus_message_id := private.execute_player_turn_entry_v1(
        v_draft.room_id,
        v_draft.character_id,
        p_turn_command_id,
        'bonus_action',
        v_turn_order,
        v_draft.bonus_action_entry
      );
      v_message_ids := array_append(v_message_ids, v_bonus_message_id);
      v_summary_parts := array_append(
        v_summary_parts,
        'Бонус: ' || coalesce(
          v_draft.bonus_action_entry ->> 'label',
          'бонусное действие'
        )
      );

    elsif v_component = 'movement' and v_draft.movement is not null then
      v_movement_text :=
        trim(coalesce(v_draft.movement ->> 'description', ''));

      if v_movement_text <> '' then
        v_movement_message_id := public.send_chat_event_v3(
          v_draft.room_id,
          v_draft.character_id,
          'action',
          'Перемещение',
          jsonb_build_object(
            'detail', v_movement_text,
            'turnCommandId', p_turn_command_id,
            'turnComponent', 'movement',
            'turnOrder', v_turn_order
          ),
          '[]'::jsonb
        );

        update public.chat_messages
        set turn_command_id = p_turn_command_id,
            turn_component = 'movement',
            turn_order = v_turn_order
        where id = v_movement_message_id;

        v_message_ids := array_append(
          v_message_ids,
          v_movement_message_id
        );
        v_summary_parts := array_append(
          v_summary_parts,
          'Движение: ' || v_movement_text
        );
      end if;
    end if;
  end loop;

  v_description := trim(v_draft.description);
  v_final_body := case
    when v_description <> '' then v_description
    else 'Ход: ' || array_to_string(v_summary_parts, ' · ')
  end;

  insert into public.chat_messages (
    room_id,
    character_id,
    body,
    turn_command_id,
    turn_component,
    turn_order
  )
  values (
    v_draft.room_id,
    v_draft.character_id,
    left(v_final_body, 4000),
    p_turn_command_id,
    'description',
    v_turn_order + 1
  )
  returning id into v_trigger_message_id;

  v_message_ids := array_append(v_message_ids, v_trigger_message_id);

  v_result := jsonb_build_object(
    'draft_id', v_draft.id,
    'campaign_id', v_campaign_id,
    'room_id', v_draft.room_id,
    'character_id', v_draft.character_id,
    'turn_command_id', p_turn_command_id,
    'message_ids', to_jsonb(v_message_ids),
    'action_message_id', v_action_message_id,
    'bonus_action_message_id', v_bonus_message_id,
    'movement_message_id', v_movement_message_id,
    'trigger_message_id', v_trigger_message_id
  );

  insert into public.engine_command_receipts (
    command_id,
    campaign_id,
    actor_character_id,
    engine,
    command_kind,
    aggregate_id,
    result,
    created_by
  )
  values (
    p_turn_command_id,
    v_campaign_id,
    v_draft.character_id,
    'gena',
    'player.turn.v1',
    v_draft.character_id,
    v_result,
    auth.uid()
  );

  update public.player_turn_drafts
  set status = 'submitted',
      turn_command_id = p_turn_command_id,
      submission_result = v_result,
      submitted_at = now(),
      updated_at = now()
  where id = v_draft.id;

  return v_result;
end;
$$;

revoke all on function public.save_player_turn_draft_v1(
  uuid,uuid,jsonb,jsonb,jsonb,text[],text,integer
) from public, anon;
revoke all on function public.get_player_turn_draft_v1(
  uuid,uuid
) from public, anon;
revoke all on function public.cancel_player_turn_draft_v1(
  uuid
) from public, anon;
revoke all on function public.submit_player_turn_v1(
  uuid,integer,uuid
) from public, anon;

grant execute on function public.save_player_turn_draft_v1(
  uuid,uuid,jsonb,jsonb,jsonb,text[],text,integer
) to authenticated;
grant execute on function public.get_player_turn_draft_v1(
  uuid,uuid
) to authenticated;
grant execute on function public.cancel_player_turn_draft_v1(
  uuid
) to authenticated;
grant execute on function public.submit_player_turn_v1(
  uuid,integer,uuid
) to authenticated;

comment on table public.player_turn_drafts is
  'Stage 4 durable player turn queue. Selecting entries never spends resources or emits gameplay chat; submit executes the full turn atomically.';

comment on function public.submit_player_turn_v1(uuid,integer,uuid) is
  'Stage 4 authoritative submit: executes queued action/bonus/movement in one transaction and inserts one final plain text message for AI GM reaction.';
