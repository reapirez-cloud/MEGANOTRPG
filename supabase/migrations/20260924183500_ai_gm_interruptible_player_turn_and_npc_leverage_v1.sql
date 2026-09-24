
alter table public.chat_messages
  drop constraint if exists chat_messages_turn_component_check;
alter table public.chat_messages
  add constraint chat_messages_turn_component_check
  check (
    turn_component is null
    or turn_component in ('action','bonus_action','reaction','movement','description')
  );

alter table public.player_turn_drafts
  add column if not exists plan_entries jsonb not null default '[]'::jsonb,
  add column if not exists execution_state text not null default 'draft',
  add column if not exists execution_cursor integer not null default 0,
  add column if not exists executed_message_ids bigint[] not null default '{}'::bigint[],
  add column if not exists executed_reaction_command_ids uuid[] not null default '{}'::uuid[],
  add column if not exists declaration_message_id bigint references public.chat_messages(id) on delete set null,
  add column if not exists interruption_reason text,
  add column if not exists interrupted_at timestamptz;

alter table public.player_turn_drafts
  drop constraint if exists player_turn_drafts_plan_entries_check;
alter table public.player_turn_drafts
  add constraint player_turn_drafts_plan_entries_check
  check (
    jsonb_typeof(plan_entries)='array'
    and jsonb_array_length(plan_entries)<=64
  );

alter table public.player_turn_drafts
  drop constraint if exists player_turn_drafts_execution_state_check;
alter table public.player_turn_drafts
  add constraint player_turn_drafts_execution_state_check
  check (execution_state in ('draft','pending','executing','completed','interrupted','cancelled'));

alter table public.player_turn_drafts
  drop constraint if exists player_turn_drafts_execution_cursor_check;
alter table public.player_turn_drafts
  add constraint player_turn_drafts_execution_cursor_check
  check (execution_cursor>=0);

create index if not exists player_turn_drafts_execution_idx
  on public.player_turn_drafts(room_id,execution_state,updated_at desc)
  where status='submitted';

create or replace function private.normalize_player_turn_plan_entry_v1(
  p_character_id uuid,
  p_entry jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
volatile
as $$
declare
  v_kind text;
  v_label text;
  v_economy text;
  v_command_id uuid;
  v_trigger text;
  v_description text;
begin
  if p_entry is null or jsonb_typeof(p_entry)<>'object' then
    raise exception 'player_turn_plan_entry_object_required';
  end if;

  v_kind:=btrim(coalesce(p_entry->>'kind',''));
  if v_kind='movement' then
    v_description:=left(btrim(coalesce(p_entry->>'description','')),1000);
    if v_description='' then
      raise exception 'player_turn_movement_description_required';
    end if;
    begin
      v_command_id:=nullif(btrim(coalesce(p_entry->>'commandId','')),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'player_turn_plan_command_id_invalid';
    end;
    if v_command_id is null then v_command_id:=gen_random_uuid(); end if;
    return jsonb_build_object(
      'kind','movement',
      'label','Перемещение',
      'economy','movement',
      'description',v_description,
      'commandId',v_command_id::text
    );
  end if;

  if v_kind not in (
    'template_action','template_roll','template_spell','spell_with_modifiers',
    'inventory_event','inventory_roll','raw_event','raw_roll'
  ) then
    raise exception 'unsupported_player_turn_plan_entry_kind:%',v_kind;
  end if;

  v_label:=left(btrim(coalesce(p_entry->>'label','')),240);
  if v_label='' then raise exception 'player_turn_plan_entry_label_required'; end if;

  v_economy:=private.player_turn_entry_economy_v1(p_character_id,p_entry);
  if v_economy not in ('action','bonus_action','reaction') then
    v_economy:='action';
  end if;

  begin
    v_command_id:=nullif(btrim(coalesce(p_entry->>'commandId','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception 'player_turn_plan_command_id_invalid';
  end;
  if v_command_id is null then v_command_id:=gen_random_uuid(); end if;

  v_trigger:=left(btrim(coalesce(p_entry->>'triggerCondition','')),600);

  return p_entry
    || jsonb_build_object(
      'kind',v_kind,
      'label',v_label,
      'economy',v_economy,
      'commandId',v_command_id::text
    )
    || case
      when v_economy='reaction'
        then jsonb_build_object('triggerCondition',v_trigger)
      else '{}'::jsonb
    end;
end;
$$;

create or replace function private.normalize_player_turn_plan_v1(
  p_character_id uuid,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
volatile
as $$
declare
  v_entries jsonb:=coalesce(p_entries,'[]'::jsonb);
  v_result jsonb:='[]'::jsonb;
  v_entry jsonb;
  v_normalized jsonb;
  v_seen uuid[]:='{}'::uuid[];
  v_command_id uuid;
begin
  if jsonb_typeof(v_entries)<>'array' then
    raise exception 'player_turn_plan_must_be_array';
  end if;
  if jsonb_array_length(v_entries)>64 then
    raise exception 'player_turn_plan_too_large';
  end if;

  for v_entry in select value from jsonb_array_elements(v_entries)
  loop
    v_normalized:=private.normalize_player_turn_plan_entry_v1(p_character_id,v_entry);
    v_command_id:=(v_normalized->>'commandId')::uuid;
    if v_command_id=any(v_seen) then
      raise exception 'duplicate_player_turn_plan_command_id';
    end if;
    v_seen:=array_append(v_seen,v_command_id);
    v_result:=v_result||jsonb_build_array(v_normalized);
  end loop;

  return v_result;
end;
$$;

create or replace function public.save_player_turn_draft_v3(
  p_room_id uuid,
  p_character_id uuid,
  p_plan_entries jsonb default '[]'::jsonb,
  p_description text default '',
  p_expected_revision integer default null,
  p_audience_scope text default 'scene',
  p_recipient_character_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=(select auth.uid());
  v_campaign_id uuid;
  v_existing public.player_turn_drafts%rowtype;
  v_row public.player_turn_drafts%rowtype;
  v_plan jsonb;
  v_audience jsonb;
  v_scope text;
  v_recipients uuid[];
begin
  v_campaign_id:=private.assert_player_turn_actor_v1(p_room_id,p_character_id,v_user_id);
  v_plan:=private.normalize_player_turn_plan_v1(p_character_id,p_plan_entries);

  v_audience:=private.normalize_player_turn_audience_stage12_v1(
    v_campaign_id,p_character_id,p_audience_scope,p_recipient_character_ids
  );
  v_scope:=v_audience->>'audience_scope';
  select coalesce(array_agg(value::uuid),'{}'::uuid[])
  into v_recipients
  from jsonb_array_elements_text(
    coalesce(v_audience->'recipient_character_ids','[]'::jsonb)
  );

  if v_scope='direct_pc' and jsonb_array_length(v_plan)>0 then
    raise exception 'direct_pc_dialogue_cannot_include_gameplay_components';
  end if;

  select * into v_existing
  from public.player_turn_drafts d
  where d.room_id=p_room_id
    and d.character_id=p_character_id
    and d.user_id=v_user_id
    and d.status='draft'
  for update;

  if v_existing.id is null then
    if p_expected_revision is not null then
      raise exception 'Turn draft changed; reload it';
    end if;

    insert into public.player_turn_drafts(
      campaign_id,room_id,character_id,user_id,
      action_entry,bonus_action_entry,movement,component_order,
      plan_entries,description,audience_scope,recipient_character_ids,
      execution_state,execution_cursor,executed_message_ids,
      executed_reaction_command_ids
    )
    values(
      v_campaign_id,p_room_id,p_character_id,v_user_id,
      null,null,null,'{}'::text[],
      v_plan,left(coalesce(p_description,''),5000),v_scope,v_recipients,
      'draft',0,'{}'::bigint[],'{}'::uuid[]
    )
    returning * into v_row;
  else
    if p_expected_revision is not null and v_existing.revision<>p_expected_revision then
      raise exception 'Turn draft changed; reload it';
    end if;

    update public.player_turn_drafts
    set action_entry=null,
        bonus_action_entry=null,
        movement=null,
        component_order='{}'::text[],
        plan_entries=v_plan,
        description=left(coalesce(p_description,''),5000),
        audience_scope=v_scope,
        recipient_character_ids=v_recipients,
        execution_state='draft',
        execution_cursor=0,
        executed_message_ids='{}'::bigint[],
        executed_reaction_command_ids='{}'::uuid[],
        declaration_message_id=null,
        interruption_reason=null,
        interrupted_at=null,
        revision=revision+1,
        updated_at=now()
    where id=v_existing.id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.submit_player_turn_stage12_v2(
  p_draft_id uuid,
  p_expected_revision integer,
  p_turn_command_id uuid,
  p_recipient_character_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=(select auth.uid());
  v_draft public.player_turn_drafts%rowtype;
  v_campaign_id uuid;
  v_recipients uuid[]:=coalesce(p_recipient_character_ids,'{}'::uuid[]);
  v_audience jsonb;
  v_scope text;
  v_body text;
  v_labels text[];
  v_trigger_message_id bigint;
  v_result jsonb;
  v_existing_receipt public.engine_command_receipts%rowtype;
  v_public_plan jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_turn_command_id is null then raise exception 'Turn command id is required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_turn_command_id::text,0)
  );

  select * into v_existing_receipt
  from public.engine_command_receipts
  where command_id=p_turn_command_id;

  if v_existing_receipt.command_id is not null then
    if v_existing_receipt.created_by is distinct from v_user_id
       or v_existing_receipt.engine is distinct from 'gena'
       or v_existing_receipt.command_kind is distinct from 'player.turn.v2'
       or v_existing_receipt.result->>'draft_id' is distinct from p_draft_id::text
    then
      raise exception 'Turn command id is already used by another command';
    end if;
    return v_existing_receipt.result;
  end if;

  select * into v_draft
  from public.player_turn_drafts d
  where d.id=p_draft_id
  for update;

  if v_draft.id is null then raise exception 'player_turn_draft_not_found'; end if;
  if v_draft.user_id<>v_user_id then raise exception 'Turn draft belongs to another user'; end if;
  if v_draft.status<>'draft' then raise exception 'Turn draft is not active'; end if;
  if v_draft.revision<>p_expected_revision then raise exception 'Turn draft changed; reload it'; end if;

  v_campaign_id:=private.assert_player_turn_actor_v1(
    v_draft.room_id,v_draft.character_id,v_user_id
  );

  v_audience:=private.normalize_player_turn_audience_stage12_v1(
    v_campaign_id,v_draft.character_id,
    case when cardinality(v_recipients)>0 then 'direct_pc' else v_draft.audience_scope end,
    case when cardinality(v_recipients)>0 then v_recipients else v_draft.recipient_character_ids end
  );
  v_scope:=v_audience->>'audience_scope';
  select coalesce(array_agg(value::uuid),'{}'::uuid[])
  into v_recipients
  from jsonb_array_elements_text(coalesce(v_audience->'recipient_character_ids','[]'::jsonb));

  if v_scope='direct_pc' and jsonb_array_length(v_draft.plan_entries)>0 then
    raise exception 'direct_pc_dialogue_cannot_include_gameplay_components';
  end if;
  if jsonb_array_length(v_draft.plan_entries)=0 and btrim(v_draft.description)='' then
    raise exception 'Turn is empty';
  end if;

  select coalesce(array_agg(left(value->>'label',120) order by ord),'{}'::text[])
  into v_labels
  from jsonb_array_elements(v_draft.plan_entries) with ordinality e(value,ord);

  v_body:=case
    when btrim(v_draft.description)<>'' then left(btrim(v_draft.description),4000)
    when cardinality(v_labels)>0 then left('Заявляет ход: '||array_to_string(v_labels,' → '),4000)
    else 'Ход персонажа'
  end;

  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'command_id',value->>'commandId',
      'kind',value->>'kind',
      'label',value->>'label',
      'economy',value->>'economy',
      'description',nullif(value->>'description',''),
      'trigger_condition',nullif(value->>'triggerCondition','')
    )) order by ord
  ),'[]'::jsonb)
  into v_public_plan
  from jsonb_array_elements(v_draft.plan_entries) with ordinality e(value,ord);

  insert into public.chat_messages(
    room_id,character_id,body,
    audience_scope,recipient_character_ids,
    turn_command_id,turn_component,turn_order,event_payload
  )
  values(
    v_draft.room_id,v_draft.character_id,v_body,
    v_scope,v_recipients,
    p_turn_command_id,'description',0,
    jsonb_build_object(
      'player_turn_plan',jsonb_build_object(
        'draft_id',v_draft.id,
        'turn_command_id',p_turn_command_id,
        'execution_state',
          case when jsonb_array_length(v_draft.plan_entries)>0 then 'pending' else 'completed' end,
        'execution_cursor',0,
        'entries',v_public_plan,
        'executed_message_ids','[]'::jsonb
      )
    )
  )
  returning id into v_trigger_message_id;

  v_result:=jsonb_build_object(
    'draft_id',v_draft.id,
    'campaign_id',v_campaign_id,
    'room_id',v_draft.room_id,
    'character_id',v_draft.character_id,
    'turn_command_id',p_turn_command_id,
    'message_ids',jsonb_build_array(v_trigger_message_id),
    'trigger_message_id',v_trigger_message_id,
    'declaration_only',true,
    'plan_entry_count',jsonb_array_length(v_draft.plan_entries),
    'audience_scope',v_scope,
    'recipient_character_ids',to_jsonb(v_recipients)
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,actor_character_id,engine,command_kind,
    aggregate_id,result,created_by
  )
  values(
    p_turn_command_id,v_campaign_id,v_draft.character_id,
    'gena','player.turn.v2',v_draft.character_id,v_result,v_user_id
  );

  update public.player_turn_drafts
  set status='submitted',
      turn_command_id=p_turn_command_id,
      submission_result=v_result,
      declaration_message_id=v_trigger_message_id,
      execution_state=case
        when jsonb_array_length(plan_entries)>0 then 'pending'
        else 'completed'
      end,
      submitted_at=now(),
      updated_at=now()
  where id=v_draft.id;

  return v_result;
end;
$$;

create or replace function private.assert_player_turn_entry_slot_v1(
  p_character_id uuid,
  p_component text,
  p_entry jsonb
)
returns void
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_kind text:=coalesce(p_entry->>'kind','');
  v_economy text:=lower(btrim(coalesce(p_entry->>'economy','')));
  v_action_def jsonb;
  v_spell_key text;
  v_casting_time text;
  v_expected_component text;
begin
  if p_component not in ('action','bonus_action','reaction') then
    raise exception 'Unsupported player turn action component';
  end if;

  if v_kind in ('template_action','template_roll') then
    v_action_def:=private.character_template_selected_action_definition_v1(
      p_character_id,nullif(btrim(p_entry->>'mechanicId'),'')
    );
    if v_action_def is null then raise exception 'Turn template action is unavailable'; end if;
    v_economy:=lower(btrim(coalesce(v_action_def->>'economy','action')));
  elsif v_kind in ('template_spell','spell_with_modifiers')
     or (v_kind='raw_event' and coalesce(p_entry->>'eventKind','')='spell')
  then
    v_spell_key:=nullif(btrim(p_entry->'payload'->>'spellKey'),'');
    if v_spell_key is not null then
      select lower(btrim(coalesce(sc.casting_time,''))) into v_casting_time
      from public.spell_catalog sc where sc.slug=v_spell_key limit 1;
      if v_casting_time is not null and v_casting_time<>'' then
        if v_casting_time like '%reaction%' or v_casting_time like '%реакц%' then
          v_economy:='reaction';
        elsif v_casting_time like '%bonus%' or v_casting_time like '%бонус%' then
          v_economy:='bonus_action';
        else
          v_economy:='action';
        end if;
      end if;
    end if;
  end if;

  v_expected_component:=case
    when v_economy like '%reaction%' or v_economy like '%реакц%' then 'reaction'
    when v_economy='bonus_action' or v_economy like '%bonus%' or v_economy like '%бонус%' then 'bonus_action'
    else 'action'
  end;

  if p_component<>v_expected_component then
    raise exception 'Queued entry does not match its action economy';
  end if;
end;
$$;

create or replace function private.ai_gm_player_turn_runtime_claims_v1(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_user_id is null then raise exception 'player_turn_runtime_user_required'; end if;
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',p_user_id::text,'role','authenticated','is_anonymous',false)::text,
    true
  );
end;
$$;

create or replace function private.player_turn_plan_projection_v1(
  p_draft public.player_turn_drafts
)
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_entries jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'command_id',value->>'commandId',
      'kind',value->>'kind',
      'label',value->>'label',
      'economy',value->>'economy',
      'description',nullif(value->>'description',''),
      'trigger_condition',nullif(value->>'triggerCondition','')
    )) order by ord
  ),'[]'::jsonb)
  into v_entries
  from jsonb_array_elements(p_draft.plan_entries) with ordinality e(value,ord);

  return jsonb_build_object(
    'draft_id',p_draft.id,
    'turn_command_id',p_draft.turn_command_id,
    'execution_state',p_draft.execution_state,
    'execution_cursor',p_draft.execution_cursor,
    'entries',v_entries,
    'executed_message_ids',to_jsonb(p_draft.executed_message_ids),
    'executed_reaction_command_ids',to_jsonb(p_draft.executed_reaction_command_ids),
    'interruption_reason',p_draft.interruption_reason
  );
end;
$$;

create or replace function private.sync_player_turn_declaration_message_v1(
  p_draft public.player_turn_drafts
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_draft.declaration_message_id is null then return; end if;
  update public.chat_messages
  set event_payload=coalesce(event_payload,'{}'::jsonb)
    || jsonb_build_object(
      'player_turn_plan',
      private.player_turn_plan_projection_v1(p_draft)
    )
  where id=p_draft.declaration_message_id;
end;
$$;

create or replace function public.execute_ai_gm_player_turn_next_v1(
  p_job_id uuid,
  p_entry_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_service_role boolean:=(select auth.role())='service_role';
  v_job public.agent_jobs%rowtype;
  v_source public.chat_messages%rowtype;
  v_draft public.player_turn_drafts%rowtype;
  v_entry jsonb;
  v_ord integer;
  v_next_entry jsonb;
  v_next_ord integer;
  v_component text;
  v_message_id bigint;
  v_message public.chat_messages%rowtype;
  v_more boolean:=false;
begin
  if not v_service_role then raise exception 'service_role_required'; end if;

  select * into v_job from public.agent_jobs
  where id=p_job_id and job_type='conversation_turn' and input->>'surface'='game_chat_v1'
  for update;
  if v_job.id is null then raise exception 'ai_gm_turn_not_found'; end if;

  select * into v_source from public.chat_messages
  where id=nullif(v_job.input->>'source_chat_message_id','')::bigint
  for update;
  if v_source.id is null or v_source.turn_command_id is null then
    raise exception 'player_turn_declaration_source_required';
  end if;

  select * into v_draft from public.player_turn_drafts
  where turn_command_id=v_source.turn_command_id
    and declaration_message_id=v_source.id
    and status='submitted'
  for update;
  if v_draft.id is null then raise exception 'player_turn_plan_not_found'; end if;
  if v_draft.execution_state in ('interrupted','cancelled') then
    raise exception 'player_turn_plan_closed';
  end if;

  for v_entry,v_ord in
    select value,ord::integer
    from jsonb_array_elements(v_draft.plan_entries) with ordinality e(value,ord)
    where ord::integer>v_draft.execution_cursor
    order by ord
  loop
    if coalesce(v_entry->>'economy','')='reaction' then
      continue;
    end if;
    v_next_entry:=v_entry;
    v_next_ord:=v_ord;
    exit;
  end loop;

  if v_next_entry is null then
    update public.player_turn_drafts
    set execution_state='completed',updated_at=now()
    where id=v_draft.id
    returning * into v_draft;
    perform private.sync_player_turn_declaration_message_v1(v_draft);
    return jsonb_build_object(
      'status','completed',
      'plan',private.player_turn_plan_projection_v1(v_draft)
    );
  end if;

  if (v_next_entry->>'commandId')::uuid<>p_entry_command_id then
    raise exception 'player_turn_next_entry_mismatch:%',v_next_entry->>'commandId';
  end if;

  perform private.ai_gm_player_turn_runtime_claims_v1(v_draft.user_id);

  if v_next_entry->>'kind'='movement' then
    v_message_id:=public.send_chat_event_v3(
      v_draft.room_id,v_draft.character_id,'action','Перемещение',
      jsonb_build_object(
        'detail',v_next_entry->>'description',
        'turnCommandId',v_draft.turn_command_id,
        'turnComponent','movement',
        'turnOrder',v_next_ord
      ),
      '[]'::jsonb
    );
    update public.chat_messages
    set turn_command_id=v_draft.turn_command_id,
        turn_component='movement',
        turn_order=v_next_ord
    where id=v_message_id;
  else
    v_component:=case
      when v_next_entry->>'economy'='bonus_action' then 'bonus_action'
      else 'action'
    end;
    v_message_id:=private.execute_player_turn_entry_v1(
      v_draft.room_id,v_draft.character_id,v_draft.turn_command_id,
      v_component,v_next_ord,v_next_entry
    );
  end if;

  update public.player_turn_drafts
  set execution_cursor=v_next_ord,
      execution_state='executing',
      executed_message_ids=array_append(executed_message_ids,v_message_id),
      updated_at=now()
  where id=v_draft.id
  returning * into v_draft;

  select exists(
    select 1
    from jsonb_array_elements(v_draft.plan_entries) with ordinality e(value,ord)
    where ord::integer>v_draft.execution_cursor
      and coalesce(value->>'economy','')<>'reaction'
  ) into v_more;

  if not v_more then
    update public.player_turn_drafts
    set execution_state='completed',updated_at=now()
    where id=v_draft.id
    returning * into v_draft;
  end if;

  perform private.sync_player_turn_declaration_message_v1(v_draft);
  select * into v_message from public.chat_messages where id=v_message_id;

  return jsonb_build_object(
    'status','executed',
    'entry_command_id',p_entry_command_id,
    'entry_order',v_next_ord,
    'entry',jsonb_strip_nulls(jsonb_build_object(
      'kind',v_next_entry->>'kind',
      'label',v_next_entry->>'label',
      'economy',v_next_entry->>'economy',
      'description',nullif(v_next_entry->>'description','')
    )),
    'message_id',v_message_id,
    'event_kind',v_message.event_kind,
    'event_payload',coalesce(v_message.event_payload,'{}'::jsonb),
    'message_body',v_message.body,
    'more_sequential_entries',v_more,
    'plan',private.player_turn_plan_projection_v1(v_draft)
  );
end;
$$;

create or replace function public.execute_ai_gm_player_turn_reaction_v1(
  p_job_id uuid,
  p_entry_command_id uuid,
  p_trigger_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_service_role boolean:=(select auth.role())='service_role';
  v_job public.agent_jobs%rowtype;
  v_source public.chat_messages%rowtype;
  v_draft public.player_turn_drafts%rowtype;
  v_entry jsonb;
  v_ord integer;
  v_message_id bigint;
  v_reason text:=left(btrim(coalesce(p_trigger_reason,'')),600);
  v_message public.chat_messages%rowtype;
begin
  if not v_service_role then raise exception 'service_role_required'; end if;
  if v_reason='' then raise exception 'player_reaction_trigger_reason_required'; end if;

  select * into v_job from public.agent_jobs
  where id=p_job_id and job_type='conversation_turn' and input->>'surface'='game_chat_v1'
  for update;
  if v_job.id is null then raise exception 'ai_gm_turn_not_found'; end if;

  select * into v_source from public.chat_messages
  where id=nullif(v_job.input->>'source_chat_message_id','')::bigint;
  if v_source.id is null or v_source.turn_command_id is null then
    raise exception 'player_turn_declaration_source_required';
  end if;

  select * into v_draft from public.player_turn_drafts
  where turn_command_id=v_source.turn_command_id
    and declaration_message_id=v_source.id
    and status='submitted'
  for update;
  if v_draft.id is null then raise exception 'player_turn_plan_not_found'; end if;
  if v_draft.execution_state in ('interrupted','cancelled') then
    raise exception 'player_turn_plan_closed';
  end if;
  if cardinality(v_draft.executed_reaction_command_ids)>0 then
    raise exception 'player_reaction_already_spent_this_turn';
  end if;

  select value,ord::integer into v_entry,v_ord
  from jsonb_array_elements(v_draft.plan_entries) with ordinality e(value,ord)
  where (value->>'commandId')::uuid=p_entry_command_id
    and value->>'economy'='reaction'
  limit 1;

  if v_entry is null then raise exception 'declared_player_reaction_not_found'; end if;

  perform private.ai_gm_player_turn_runtime_claims_v1(v_draft.user_id);
  v_message_id:=private.execute_player_turn_entry_v1(
    v_draft.room_id,v_draft.character_id,v_draft.turn_command_id,
    'reaction',v_ord,v_entry
  );

  update public.chat_messages
  set event_payload=coalesce(event_payload,'{}'::jsonb)
    || jsonb_build_object('declaredReactionTrigger',v_reason)
  where id=v_message_id;

  update public.player_turn_drafts
  set executed_reaction_command_ids=array_append(
        executed_reaction_command_ids,p_entry_command_id
      ),
      executed_message_ids=array_append(executed_message_ids,v_message_id),
      updated_at=now()
  where id=v_draft.id
  returning * into v_draft;

  perform private.sync_player_turn_declaration_message_v1(v_draft);
  select * into v_message from public.chat_messages where id=v_message_id;

  return jsonb_build_object(
    'status','reaction_executed',
    'entry_command_id',p_entry_command_id,
    'trigger_reason',v_reason,
    'message_id',v_message_id,
    'event_kind',v_message.event_kind,
    'event_payload',coalesce(v_message.event_payload,'{}'::jsonb),
    'plan',private.player_turn_plan_projection_v1(v_draft)
  );
end;
$$;

create or replace function public.settle_ai_gm_player_turn_plan_v1(
  p_job_id uuid,
  p_reason text default 'gm_returned_control'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_service_role boolean:=(select auth.role())='service_role';
  v_job public.agent_jobs%rowtype;
  v_source public.chat_messages%rowtype;
  v_draft public.player_turn_drafts%rowtype;
  v_more boolean:=false;
  v_reason text:=left(btrim(coalesce(p_reason,'gm_returned_control')),600);
begin
  if not v_service_role then raise exception 'service_role_required'; end if;

  select * into v_job from public.agent_jobs where id=p_job_id;
  if v_job.id is null then return jsonb_build_object('status','no_job'); end if;
  select * into v_source from public.chat_messages
  where id=nullif(v_job.input->>'source_chat_message_id','')::bigint;
  if v_source.id is null or v_source.turn_command_id is null then
    return jsonb_build_object('status','not_a_declared_turn');
  end if;

  select * into v_draft from public.player_turn_drafts
  where turn_command_id=v_source.turn_command_id
    and declaration_message_id=v_source.id
    and status='submitted'
  for update;
  if v_draft.id is null then return jsonb_build_object('status','plan_missing'); end if;
  if v_draft.execution_state in ('completed','interrupted','cancelled') then
    return jsonb_build_object(
      'status',v_draft.execution_state,
      'plan',private.player_turn_plan_projection_v1(v_draft)
    );
  end if;

  select exists(
    select 1 from jsonb_array_elements(v_draft.plan_entries) with ordinality e(value,ord)
    where ord::integer>v_draft.execution_cursor
      and coalesce(value->>'economy','')<>'reaction'
  ) into v_more;

  update public.player_turn_drafts
  set execution_state=case when v_more then 'interrupted' else 'completed' end,
      interruption_reason=case when v_more then v_reason else null end,
      interrupted_at=case when v_more then now() else null end,
      updated_at=now()
  where id=v_draft.id
  returning * into v_draft;

  perform private.sync_player_turn_declaration_message_v1(v_draft);
  return jsonb_build_object(
    'status',v_draft.execution_state,
    'plan',private.player_turn_plan_projection_v1(v_draft)
  );
end;
$$;

create or replace function public.refine_npc_identity_bootstrap_v2(
  p_npc_character_id uuid,
  p_expected_version integer,
  p_proposed_core jsonb,
  p_reason text,
  p_provenance jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_service_role boolean:=(select auth.role())='service_role';
  v_current public.npc_identity_fingerprints%rowtype;
  v_existing jsonb;
  v_proposed jsonb;
  v_merged jsonb;
  v_reason text:=left(btrim(coalesce(p_reason,'')),1200);
  v_result jsonb;
begin
  if not v_service_role then raise exception 'service_role_required'; end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'npc_identity_expected_version_invalid';
  end if;
  if v_reason='' then raise exception 'npc_identity_refinement_reason_required'; end if;

  select * into v_current
  from public.npc_identity_fingerprints
  where character_id=p_npc_character_id
  for update;

  if v_current.character_id is null then raise exception 'npc_identity_not_found'; end if;
  if v_current.current_version<>p_expected_version then
    raise exception 'npc_identity_refinement_version_mismatch';
  end if;
  if v_current.bootstrap_state not in ('stub','seeded') then
    return jsonb_build_object(
      'changed',false,
      'reason','identity_already_evolved',
      'version',v_current.current_version,
      'core',private.npc_identity_core_from_current_v1(p_npc_character_id)
    );
  end if;

  v_existing:=private.npc_identity_core_from_current_v1(p_npc_character_id);
  v_proposed:=private.normalize_npc_identity_core_v1(p_proposed_core);

  v_merged:=jsonb_build_object(
    'traits',case when jsonb_array_length(v_existing->'traits')=0 then v_proposed->'traits' else v_existing->'traits' end,
    'weighted_values',case when jsonb_array_length(v_existing->'weighted_values')=0 then v_proposed->'weighted_values' else v_existing->'weighted_values' end,
    'red_lines',case when jsonb_array_length(v_existing->'red_lines')=0 then v_proposed->'red_lines' else v_existing->'red_lines' end,
    'long_term_desires',case when jsonb_array_length(v_existing->'long_term_desires')=0 then v_proposed->'long_term_desires' else v_existing->'long_term_desires' end,
    'fears',case when jsonb_array_length(v_existing->'fears')=0 then v_proposed->'fears' else v_existing->'fears' end,
    'loyalties',case when jsonb_array_length(v_existing->'loyalties')=0 then v_proposed->'loyalties' else v_existing->'loyalties' end,
    'authority_attitude',case when v_existing->'authority_attitude'='{}'::jsonb then v_proposed->'authority_attitude' else v_existing->'authority_attitude' end,
    'risk_tolerance',case when v_existing->'risk_tolerance'='null'::jsonb then v_proposed->'risk_tolerance' else v_existing->'risk_tolerance' end,
    'violence_threshold',case when v_existing->'violence_threshold'='null'::jsonb then v_proposed->'violence_threshold' else v_existing->'violence_threshold' end,
    'pressure_behavior',case when jsonb_array_length(v_existing->'pressure_behavior')=0 then v_proposed->'pressure_behavior' else v_existing->'pressure_behavior' end,
    'self_image',case when btrim(coalesce(v_existing->>'self_image',''))='' then to_jsonb(v_proposed->>'self_image') else v_existing->'self_image' end,
    'social_style',case when jsonb_array_length(v_existing->'social_style')=0 then v_proposed->'social_style' else v_existing->'social_style' end,
    'decision_priorities',case when jsonb_array_length(v_existing->'decision_priorities')=0 then v_proposed->'decision_priorities' else v_existing->'decision_priorities' end
  );

  v_result:=private.write_npc_identity_version_v1(
    p_npc_character_id,v_merged,'bootstrap_refinement','seeded',
    'ai_social_identity_refinement',p_npc_character_id::text,null,
    coalesce(p_provenance,'{}'::jsonb)
      || jsonb_build_object(
        'stage','social_resistance_hardening',
        'refinement_policy','fill_missing_stable_dimensions_only',
        'current_player_tactic_excluded',true,
        'reason',v_reason
      ),
    null,false
  );

  return v_result||jsonb_build_object(
    'refinement_policy','fill_missing_stable_dimensions_only'
  );
end;
$$;

revoke all on function private.normalize_player_turn_plan_entry_v1(uuid,jsonb)
  from public,anon,authenticated;
revoke all on function private.normalize_player_turn_plan_v1(uuid,jsonb)
  from public,anon,authenticated;
revoke all on function private.ai_gm_player_turn_runtime_claims_v1(uuid)
  from public,anon,authenticated;
revoke all on function private.player_turn_plan_projection_v1(public.player_turn_drafts)
  from public,anon,authenticated;
revoke all on function private.sync_player_turn_declaration_message_v1(public.player_turn_drafts)
  from public,anon,authenticated;

revoke all on function public.save_player_turn_draft_v3(
  uuid,uuid,jsonb,text,integer,text,uuid[]
) from public,anon;
grant execute on function public.save_player_turn_draft_v3(
  uuid,uuid,jsonb,text,integer,text,uuid[]
) to authenticated;

revoke all on function public.submit_player_turn_stage12_v2(
  uuid,integer,uuid,uuid[]
) from public,anon;
grant execute on function public.submit_player_turn_stage12_v2(
  uuid,integer,uuid,uuid[]
) to authenticated;

revoke all on function public.execute_ai_gm_player_turn_next_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.execute_ai_gm_player_turn_next_v1(uuid,uuid)
  to service_role;

revoke all on function public.execute_ai_gm_player_turn_reaction_v1(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.execute_ai_gm_player_turn_reaction_v1(uuid,uuid,text)
  to service_role;

revoke all on function public.settle_ai_gm_player_turn_plan_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.settle_ai_gm_player_turn_plan_v1(uuid,text)
  to service_role;

revoke all on function public.refine_npc_identity_bootstrap_v2(
  uuid,integer,jsonb,text,jsonb
) from public,anon,authenticated;
grant execute on function public.refine_npc_identity_bootstrap_v2(
  uuid,integer,jsonb,text,jsonb
) to service_role;

comment on column public.player_turn_drafts.plan_entries is
  'Ordered declarative player plan. Entries spend no resources and roll no dice until AI GM advances that exact entry after final Send.';
comment on column public.player_turn_drafts.execution_state is
  'Two-phase player turn state: draft -> pending/executing -> completed or interrupted.';
comment on function public.submit_player_turn_stage12_v2(uuid,integer,uuid,uuid[]) is
  'Seals a player plan and emits one AI trigger message without executing abilities, rolls, resources, movement or reactions.';
comment on function public.execute_ai_gm_player_turn_next_v1(uuid,uuid) is
  'AI GM service boundary: executes only the next declared non-reaction entry, so the world can interrupt between entries.';
comment on function public.execute_ai_gm_player_turn_reaction_v1(uuid,uuid,text) is
  'Executes one declared reaction only after the AI GM observes its trigger.';
comment on function public.refine_npc_identity_bootstrap_v2(uuid,integer,jsonb,text,jsonb) is
  'Fills only missing stable NPC identity dimensions before important social adjudication; never tailors an existing trait to the player tactic.';
