create or replace function private.can_read_campaign_memory_scope(
  p_campaign_id uuid,
  p_visibility text,
  p_room_id uuid,
  p_visible_user_ids uuid[],
  p_visible_character_ids uuid[],
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'private'
as $$
  select
    private.is_campaign_member(p_campaign_id, p_user_id)
    and case p_visibility
      when 'campaign' then true
      when 'gm' then private.is_campaign_manager(p_campaign_id, p_user_id)
      when 'room' then
        p_room_id is not null
        and private.can_read_chat_room(p_room_id, p_user_id)
      when 'users' then
        p_user_id = any(coalesce(p_visible_user_ids, '{}'::uuid[]))
      when 'characters' then exists (
        select 1
        from unnest(coalesce(p_visible_character_ids, '{}'::uuid[])) as visible(character_id)
        where private.can_view_character(visible.character_id, p_user_id)
      )
      else false
    end;
$$;

create table public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_type text not null,
  source_kind text not null,
  source_id text not null,
  room_id uuid references public.chat_rooms(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  actor_character_id uuid references public.characters(id) on delete set null,
  participant_character_ids uuid[] not null default '{}'::uuid[],
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  importance smallint not null default 1
    check (importance between 0 and 5),
  visibility text not null default 'campaign'
    check (visibility in ('campaign','gm','room','users','characters')),
  visible_user_ids uuid[] not null default '{}'::uuid[],
  visible_character_ids uuid[] not null default '{}'::uuid[],
  confidence numeric(4,3) not null default 1
    check (confidence between 0 and 1),
  provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance) = 'object'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (length(btrim(event_type)) between 1 and 120),
  check (length(btrim(source_kind)) between 1 and 80),
  check (length(source_id) between 1 and 240),
  check (length(summary) <= 6000),
  unique (campaign_id, source_kind, source_id)
);

create index campaign_events_timeline_idx
  on public.campaign_events (campaign_id, occurred_at desc, created_at desc);
create index campaign_events_room_timeline_idx
  on public.campaign_events (room_id, occurred_at desc)
  where room_id is not null;
create index campaign_events_location_timeline_idx
  on public.campaign_events (campaign_id, location_id, occurred_at desc)
  where location_id is not null;
create index campaign_events_type_timeline_idx
  on public.campaign_events (campaign_id, event_type, occurred_at desc);
create index campaign_events_participants_idx
  on public.campaign_events using gin (participant_character_ids);

alter table public.campaign_events enable row level security;

create policy campaign_events_read_visible
on public.campaign_events
for select
to authenticated
using (
  private.can_read_campaign_memory_scope(
    campaign_id,
    visibility,
    room_id,
    visible_user_ids,
    visible_character_ids,
    (select auth.uid())
  )
);

revoke all on public.campaign_events from public, anon, authenticated;
grant select on public.campaign_events to authenticated;
grant select, insert, update, delete on public.campaign_events to service_role;

create table public.campaign_memory_facts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  fact_key text,
  subject_type text,
  subject_id text,
  predicate text,
  statement text not null,
  structured_value jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active','superseded','retracted')),
  superseded_by uuid references public.campaign_memory_facts(id) on delete set null,
  confidence numeric(4,3) not null default 0.800
    check (confidence between 0 and 1),
  source_event_ids uuid[] not null default '{}'::uuid[],
  visibility text not null default 'gm'
    check (visibility in ('campaign','gm','room','users','characters')),
  room_id uuid references public.chat_rooms(id) on delete cascade,
  visible_user_ids uuid[] not null default '{}'::uuid[],
  visible_character_ids uuid[] not null default '{}'::uuid[],
  provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fact_key is null or length(fact_key) <= 180),
  check (subject_type is null or length(subject_type) <= 80),
  check (subject_id is null or length(subject_id) <= 180),
  check (predicate is null or length(predicate) <= 120),
  check (length(statement) between 1 and 6000)
);

create index campaign_memory_facts_active_idx
  on public.campaign_memory_facts (campaign_id, updated_at desc)
  where status = 'active';
create index campaign_memory_facts_key_idx
  on public.campaign_memory_facts (campaign_id, fact_key, updated_at desc)
  where fact_key is not null;
create index campaign_memory_facts_sources_idx
  on public.campaign_memory_facts using gin (source_event_ids);

alter table public.campaign_memory_facts enable row level security;

create policy campaign_memory_facts_read_visible
on public.campaign_memory_facts
for select
to authenticated
using (
  private.can_read_campaign_memory_scope(
    campaign_id,
    visibility,
    room_id,
    visible_user_ids,
    visible_character_ids,
    (select auth.uid())
  )
);

revoke all on public.campaign_memory_facts from public, anon, authenticated;
grant select on public.campaign_memory_facts to authenticated;
grant select, insert, update, delete on public.campaign_memory_facts to service_role;

create table public.campaign_memory_summaries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  summary text not null,
  period_start timestamptz,
  period_end timestamptz,
  key_event_ids uuid[] not null default '{}'::uuid[],
  visibility text not null default 'gm'
    check (visibility in ('campaign','gm','room','users','characters')),
  room_id uuid references public.chat_rooms(id) on delete cascade,
  visible_user_ids uuid[] not null default '{}'::uuid[],
  visible_character_ids uuid[] not null default '{}'::uuid[],
  model_id uuid references public.ai_models(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(title)) between 1 and 240),
  check (length(summary) between 1 and 16000),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create index campaign_memory_summaries_period_idx
  on public.campaign_memory_summaries (campaign_id, period_end desc, created_at desc);
create index campaign_memory_summaries_events_idx
  on public.campaign_memory_summaries using gin (key_event_ids);

alter table public.campaign_memory_summaries enable row level security;

create policy campaign_memory_summaries_read_visible
on public.campaign_memory_summaries
for select
to authenticated
using (
  private.can_read_campaign_memory_scope(
    campaign_id,
    visibility,
    room_id,
    visible_user_ids,
    visible_character_ids,
    (select auth.uid())
  )
);

revoke all on public.campaign_memory_summaries from public, anon, authenticated;
grant select on public.campaign_memory_summaries to authenticated;
grant select, insert, update, delete on public.campaign_memory_summaries to service_role;

create or replace function private.sync_campaign_memory_chat_event()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
declare
  v_message public.chat_messages%rowtype;
  v_room public.chat_rooms%rowtype;
  v_summary text;
begin
  if tg_op = 'DELETE' then
    delete from public.campaign_events
    where source_kind = 'chat_message'
      and source_id = old.id::text;
    return old;
  end if;

  v_message := new;

  select *
    into v_room
  from public.chat_rooms
  where id = v_message.room_id;

  if v_room.id is null or v_room.category <> 'game' then
    delete from public.campaign_events
    where source_kind = 'chat_message'
      and source_id = v_message.id::text;
    return new;
  end if;

  v_summary := left(
    case
      when nullif(btrim(coalesce(v_message.body, '')), '') is not null
        then coalesce(nullif(btrim(v_message.author_name), ''), 'Участник') || ': ' || btrim(v_message.body)
      when v_message.attachment_kind = 'image'
        then coalesce(nullif(btrim(v_message.author_name), ''), 'Участник') || ': [изображение]'
      when v_message.event_kind is not null
        then coalesce(nullif(btrim(v_message.author_name), ''), 'Участник') || ': ' || v_message.event_kind
      else coalesce(nullif(btrim(v_message.author_name), ''), 'Участник')
    end,
    6000
  );

  insert into public.campaign_events (
    campaign_id,
    event_type,
    source_kind,
    source_id,
    room_id,
    location_id,
    actor_character_id,
    participant_character_ids,
    summary,
    payload,
    importance,
    visibility,
    confidence,
    provenance,
    occurred_at
  )
  values (
    v_room.campaign_id,
    case
      when v_message.event_kind is null then 'chat.message'
      else 'gameplay.' || v_message.event_kind
    end,
    'chat_message',
    v_message.id::text,
    v_room.id,
    v_room.location_id,
    v_message.character_id,
    case
      when v_message.character_id is null then '{}'::uuid[]
      else array[v_message.character_id]::uuid[]
    end,
    v_summary,
    jsonb_build_object(
      'message_id', v_message.id,
      'event_kind', v_message.event_kind,
      'event_payload', coalesce(v_message.event_payload, '{}'::jsonb),
      'attachment_kind', v_message.attachment_kind,
      'room_type', v_room.room_type,
      'room_title', v_room.title,
      'campaign_day', v_room.campaign_day,
      'day_period', v_room.day_period,
      'edited_at', v_message.edited_at
    ),
    case when v_message.event_kind is null then 1 else 2 end,
    'room',
    1,
    jsonb_build_object(
      'table', 'chat_messages',
      'message_id', v_message.id,
      'client_id', v_message.client_id
    ),
    v_message.created_at
  )
  on conflict (campaign_id, source_kind, source_id)
  do update set
    event_type = excluded.event_type,
    room_id = excluded.room_id,
    location_id = excluded.location_id,
    actor_character_id = excluded.actor_character_id,
    participant_character_ids = excluded.participant_character_ids,
    summary = excluded.summary,
    payload = excluded.payload,
    importance = excluded.importance,
    visibility = excluded.visibility,
    confidence = excluded.confidence,
    provenance = excluded.provenance,
    occurred_at = excluded.occurred_at;

  return new;
end;
$$;

create trigger sync_campaign_memory_chat_event
after insert or update or delete
on public.chat_messages
for each row execute function private.sync_campaign_memory_chat_event();

create or replace function private.sync_campaign_memory_update_event()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.campaign_events
    where campaign_id = old.campaign_id
      and source_kind = 'campaign_update'
      and source_id = old.id::text;
    return old;
  end if;

  insert into public.campaign_events (
    campaign_id,
    event_type,
    source_kind,
    source_id,
    summary,
    payload,
    importance,
    visibility,
    confidence,
    provenance,
    occurred_at
  )
  values (
    new.campaign_id,
    'campaign.update.' || coalesce(nullif(btrim(new.kind), ''), 'update'),
    'campaign_update',
    new.id::text,
    left(
      coalesce(nullif(btrim(new.title), ''), 'Обновление') ||
      case
        when nullif(btrim(coalesce(new.body, '')), '') is null then ''
        else E'\n' || btrim(new.body)
      end,
      6000
    ),
    jsonb_build_object(
      'kind', new.kind,
      'title', new.title
    ),
    3,
    'campaign',
    1,
    jsonb_build_object(
      'table', 'campaign_updates',
      'update_id', new.id
    ),
    coalesce(new.published_at, new.created_at)
  )
  on conflict (campaign_id, source_kind, source_id)
  do update set
    event_type = excluded.event_type,
    summary = excluded.summary,
    payload = excluded.payload,
    importance = excluded.importance,
    visibility = excluded.visibility,
    confidence = excluded.confidence,
    provenance = excluded.provenance,
    occurred_at = excluded.occurred_at;

  return new;
end;
$$;

create trigger sync_campaign_memory_update_event
after insert or update or delete
on public.campaign_updates
for each row execute function private.sync_campaign_memory_update_event();

create or replace function private.sync_campaign_memory_ai_apply_event()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
declare
  v_title text;
begin
  if new.status <> 'succeeded' then
    return new;
  end if;

  select title into v_title
  from public.ai_drafts
  where id = new.draft_id;

  insert into public.campaign_events (
    campaign_id,
    event_type,
    source_kind,
    source_id,
    summary,
    payload,
    importance,
    visibility,
    confidence,
    provenance,
    occurred_at
  )
  values (
    new.campaign_id,
    'ai.content_applied',
    'ai_draft_apply',
    new.id::text,
    left(
      'GM применил AI Draft' ||
      case when nullif(btrim(coalesce(v_title, '')), '') is null then '' else ': ' || v_title end,
      6000
    ),
    jsonb_build_object(
      'draft_id', new.draft_id,
      'draft_revision', new.draft_revision,
      'entity_map', new.entity_map,
      'completed_steps', jsonb_array_length(new.completed_steps)
    ),
    2,
    'gm',
    1,
    jsonb_build_object(
      'table', 'ai_draft_apply_runs',
      'apply_run_id', new.id
    ),
    new.updated_at
  )
  on conflict (campaign_id, source_kind, source_id)
  do update set
    summary = excluded.summary,
    payload = excluded.payload,
    occurred_at = excluded.occurred_at;

  return new;
end;
$$;

create trigger sync_campaign_memory_ai_apply_event
after insert or update of status, entity_map, completed_steps
on public.ai_draft_apply_runs
for each row execute function private.sync_campaign_memory_ai_apply_event();

insert into public.campaign_events (
  campaign_id,
  event_type,
  source_kind,
  source_id,
  room_id,
  location_id,
  actor_character_id,
  participant_character_ids,
  summary,
  payload,
  importance,
  visibility,
  confidence,
  provenance,
  occurred_at
)
select
  r.campaign_id,
  case when m.event_kind is null then 'chat.message' else 'gameplay.' || m.event_kind end,
  'chat_message',
  m.id::text,
  r.id,
  r.location_id,
  m.character_id,
  case when m.character_id is null then '{}'::uuid[] else array[m.character_id]::uuid[] end,
  left(
    case
      when nullif(btrim(coalesce(m.body, '')), '') is not null
        then coalesce(nullif(btrim(m.author_name), ''), 'Участник') || ': ' || btrim(m.body)
      when m.attachment_kind = 'image'
        then coalesce(nullif(btrim(m.author_name), ''), 'Участник') || ': [изображение]'
      when m.event_kind is not null
        then coalesce(nullif(btrim(m.author_name), ''), 'Участник') || ': ' || m.event_kind
      else coalesce(nullif(btrim(m.author_name), ''), 'Участник')
    end,
    6000
  ),
  jsonb_build_object(
    'message_id', m.id,
    'event_kind', m.event_kind,
    'event_payload', coalesce(m.event_payload, '{}'::jsonb),
    'attachment_kind', m.attachment_kind,
    'room_type', r.room_type,
    'room_title', r.title,
    'campaign_day', r.campaign_day,
    'day_period', r.day_period,
    'edited_at', m.edited_at
  ),
  case when m.event_kind is null then 1 else 2 end,
  'room',
  1,
  jsonb_build_object('table', 'chat_messages', 'message_id', m.id, 'client_id', m.client_id),
  m.created_at
from public.chat_messages m
join public.chat_rooms r on r.id = m.room_id
where r.category = 'game'
on conflict (campaign_id, source_kind, source_id) do nothing;

insert into public.campaign_events (
  campaign_id,
  event_type,
  source_kind,
  source_id,
  summary,
  payload,
  importance,
  visibility,
  confidence,
  provenance,
  occurred_at
)
select
  u.campaign_id,
  'campaign.update.' || coalesce(nullif(btrim(u.kind), ''), 'update'),
  'campaign_update',
  u.id::text,
  left(
    coalesce(nullif(btrim(u.title), ''), 'Обновление') ||
    case when nullif(btrim(coalesce(u.body, '')), '') is null then '' else E'\n' || btrim(u.body) end,
    6000
  ),
  jsonb_build_object('kind', u.kind, 'title', u.title),
  3,
  'campaign',
  1,
  jsonb_build_object('table', 'campaign_updates', 'update_id', u.id),
  coalesce(u.published_at, u.created_at)
from public.campaign_updates u
on conflict (campaign_id, source_kind, source_id) do nothing;

insert into public.campaign_events (
  campaign_id,
  event_type,
  source_kind,
  source_id,
  summary,
  payload,
  importance,
  visibility,
  confidence,
  provenance,
  occurred_at
)
select
  a.campaign_id,
  'ai.content_applied',
  'ai_draft_apply',
  a.id::text,
  left(
    'GM применил AI Draft' ||
    case when nullif(btrim(coalesce(d.title, '')), '') is null then '' else ': ' || d.title end,
    6000
  ),
  jsonb_build_object(
    'draft_id', a.draft_id,
    'draft_revision', a.draft_revision,
    'entity_map', a.entity_map,
    'completed_steps', jsonb_array_length(a.completed_steps)
  ),
  2,
  'gm',
  1,
  jsonb_build_object('table', 'ai_draft_apply_runs', 'apply_run_id', a.id),
  a.updated_at
from public.ai_draft_apply_runs a
left join public.ai_drafts d on d.id = a.draft_id
where a.status = 'succeeded'
on conflict (campaign_id, source_kind, source_id) do nothing;
