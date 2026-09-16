-- Inventory Stage 10: GENA trade session mechanics.
-- UI is deliberately out of scope. This migration exposes a stable RPC/read
-- contract that any future Trade presentation can connect to.

create table if not exists public.trade_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  side_a_character_id uuid not null references public.characters(id) on delete restrict,
  side_b_character_id uuid not null references public.characters(id) on delete restrict,
  state text not null default 'open'
    check (state in ('open','committed','cancelled')),
  revision bigint not null default 1 check (revision >= 1),
  accepted_a_revision bigint,
  accepted_b_revision bigint,
  last_failure_code text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz,
  cancelled_at timestamptz,
  constraint trade_sessions_distinct_sides_check check (
    side_a_character_id <> side_b_character_id
  )
);

create unique index if not exists trade_sessions_one_open_pair_per_room_idx
  on public.trade_sessions(
    room_id,
    least(side_a_character_id::text, side_b_character_id::text),
    greatest(side_a_character_id::text, side_b_character_id::text)
  )
  where state='open';

create index if not exists trade_sessions_room_state_idx
  on public.trade_sessions(room_id,state,created_at);

create table if not exists public.trade_visible_items (
  session_id uuid not null references public.trade_sessions(id) on delete cascade,
  owner_character_id uuid not null references public.characters(id) on delete cascade,
  item_id uuid not null references public.character_inventory_items(id) on delete cascade,
  visibility_kind text not null
    check (visibility_kind in ('item','container','assortment')),
  visibility_group text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key(session_id,item_id)
);

create index if not exists trade_visible_items_owner_idx
  on public.trade_visible_items(session_id,owner_character_id,visibility_kind);

create table if not exists public.trade_interest_marks (
  session_id uuid not null references public.trade_sessions(id) on delete cascade,
  interested_character_id uuid not null references public.characters(id) on delete cascade,
  item_id uuid not null references public.character_inventory_items(id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key(session_id,interested_character_id,item_id)
);

create table if not exists public.trade_offer_lines (
  session_id uuid not null references public.trade_sessions(id) on delete cascade,
  owner_character_id uuid not null references public.characters(id) on delete restrict,
  item_id uuid not null references public.character_inventory_items(id) on delete restrict,
  quantity integer not null check (quantity >= 1 and quantity <= 10000),
  item_version bigint not null check (item_version >= 1),
  integrity_fingerprint text not null,
  added_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(session_id,item_id)
);

create index if not exists trade_offer_lines_owner_idx
  on public.trade_offer_lines(session_id,owner_character_id);

create table if not exists public.trade_messages (
  id uuid primary key,
  session_id uuid not null references public.trade_sessions(id) on delete cascade,
  actor_character_id uuid not null references public.characters(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists trade_messages_session_idx
  on public.trade_messages(session_id,created_at,id);

create table if not exists public.trade_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.trade_sessions(id) on delete cascade,
  event_type text not null,
  revision bigint not null,
  actor_character_id uuid references public.characters(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists trade_events_session_idx
  on public.trade_events(session_id,created_at,id);

comment on table public.trade_sessions is
  'GENA-owned two-character trade session state. Inventory ownership remains Cheburashka.';
comment on table public.trade_offer_lines is
  'Offer references canonical Cheburashka items/quantities. It never owns or reserves item rows.';
comment on table public.trade_messages is
  'Lightweight trade-scoped discussion history. It is not the main chat and owns no inventory.';

create or replace function private.can_act_character_trade_side_v1(
  p_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.characters c
    where c.id=p_character_id
      and (
        (c.character_type='pc' and c.assigned_user_id=p_user_id)
        or
        (c.character_type='npc' and private.can_manage_campaign(c.campaign_id,p_user_id))
      )
  );
$function$;
revoke execute on function private.can_act_character_trade_side_v1(uuid,uuid)
from public,anon,authenticated;

create or replace function private.can_act_trade_side_v1(
  p_session_id uuid,
  p_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.trade_sessions s
    where s.id=p_session_id
      and p_character_id in (s.side_a_character_id,s.side_b_character_id)
      and private.can_act_character_trade_side_v1(p_character_id,p_user_id)
  );
$function$;
revoke execute on function private.can_act_trade_side_v1(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function private.can_read_trade_session_v1(
  p_session_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.trade_sessions s
    where s.id=p_session_id
      and (
        private.can_manage_campaign(s.campaign_id,p_user_id)
        or private.can_act_character_trade_side_v1(s.side_a_character_id,p_user_id)
        or private.can_act_character_trade_side_v1(s.side_b_character_id,p_user_id)
      )
  );
$function$;
revoke execute on function private.can_read_trade_session_v1(uuid,uuid)
from public,anon,authenticated;

create or replace function private.trade_other_side_v1(
  p_session_id uuid,
  p_character_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when s.side_a_character_id=p_character_id then s.side_b_character_id
    when s.side_b_character_id=p_character_id then s.side_a_character_id
    else null
  end
  from public.trade_sessions s
  where s.id=p_session_id;
$function$;
revoke execute on function private.trade_other_side_v1(uuid,uuid)
from public,anon,authenticated;

create or replace function private.trade_record_event_v1(
  p_session_id uuid,
  p_event_type text,
  p_revision bigint,
  p_actor_character_id uuid,
  p_payload jsonb,
  p_created_by uuid
)
returns void
language sql
set search_path = ''
as $function$
  insert into public.trade_events(
    session_id,event_type,revision,actor_character_id,payload,created_by
  )
  values(
    p_session_id,p_event_type,p_revision,p_actor_character_id,
    coalesce(p_payload,'{}'::jsonb),p_created_by
  );
$function$;
revoke execute on function private.trade_record_event_v1(uuid,text,bigint,uuid,jsonb,uuid)
from public,anon,authenticated;

create or replace function private.trade_bump_revision_v1(
  p_session_id uuid,
  p_failure_code text default null
)
returns bigint
language plpgsql
set search_path = ''
as $function$
declare
  v_revision bigint;
begin
  update public.trade_sessions s
  set revision=s.revision+1,
      accepted_a_revision=null,
      accepted_b_revision=null,
      last_failure_code=p_failure_code,
      updated_at=now()
  where s.id=p_session_id
  returning revision into v_revision;

  if v_revision is null then raise exception 'Trade session not found'; end if;
  return v_revision;
end;
$function$;
revoke execute on function private.trade_bump_revision_v1(uuid,text)
from public,anon,authenticated;

create or replace function private.cheburashka_trade_item_fingerprint_v1(
  p_item_id uuid,
  p_amount integer
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  with recursive subtree as (
    select
      i.id,i.holder_item_id,i.character_id,i.world_storage_id,i.surface_id,
      i.quantity,i.version,i.equipped,i.placement_kind,i.category,0 depth
    from public.character_inventory_items i
    where i.id=p_item_id

    union all

    select
      child.id,child.holder_item_id,child.character_id,child.world_storage_id,
      child.surface_id,child.quantity,child.version,child.equipped,
      child.placement_kind,child.category,subtree.depth+1
    from public.character_inventory_items child
    join subtree on child.holder_item_id=subtree.id
    where subtree.depth<16
  )
  select md5(
    'amount='||coalesce(p_amount::text,'')||';'||
    coalesce(string_agg(
      id::text||'|'||
      coalesce(holder_item_id::text,'')||'|'||
      coalesce(character_id::text,'')||'|'||
      coalesce(world_storage_id::text,'')||'|'||
      coalesce(surface_id::text,'')||'|'||
      quantity::text||'|'||version::text||'|'||
      equipped::text||'|'||placement_kind||'|'||category,
      ';' order by depth,id::text
    ),'')
  )
  from subtree;
$function$;
revoke execute on function private.cheburashka_trade_item_fingerprint_v1(uuid,integer)
from public,anon,authenticated;

create or replace function private.trade_offer_overlap_v1(
  p_session_id uuid,
  p_owner_character_id uuid,
  p_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with recursive ancestors as (
    select i.id,i.holder_item_id
    from public.character_inventory_items i
    where i.id=p_item_id
    union all
    select parent.id,parent.holder_item_id
    from public.character_inventory_items parent
    join ancestors child on parent.id=child.holder_item_id
  ),
  descendants as (
    select i.id
    from public.character_inventory_items i
    where i.id=p_item_id
    union all
    select child.id
    from public.character_inventory_items child
    join descendants parent on child.holder_item_id=parent.id
  )
  select exists(
    select 1
    from public.trade_offer_lines line
    where line.session_id=p_session_id
      and line.owner_character_id=p_owner_character_id
      and line.item_id<>p_item_id
      and (
        line.item_id in (select id from ancestors)
        or line.item_id in (select id from descendants)
      )
  );
$function$;
revoke execute on function private.trade_offer_overlap_v1(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function private.trade_item_visible_to_side_v1(
  p_session_id uuid,
  p_viewer_character_id uuid,
  p_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with recursive visible_tree as (
    select
      grant_row.item_id as id,
      grant_row.item_id as source_id,
      grant_row.visibility_kind,
      0 depth
    from public.trade_visible_items grant_row
    where grant_row.session_id=p_session_id
      and grant_row.owner_character_id=private.trade_other_side_v1(
        p_session_id,p_viewer_character_id
      )

    union all

    select
      child.id,
      visible_tree.source_id,
      visible_tree.visibility_kind,
      visible_tree.depth+1
    from public.character_inventory_items child
    join visible_tree on child.holder_item_id=visible_tree.id
    where visible_tree.visibility_kind='container'
      and visible_tree.depth<16
  )
  select
    exists(select 1 from visible_tree where id=p_item_id)
    or exists(
      select 1
      from public.trade_offer_lines line
      where line.session_id=p_session_id
        and line.owner_character_id=private.trade_other_side_v1(
          p_session_id,p_viewer_character_id
        )
        and line.item_id=p_item_id
    );
$function$;
revoke execute on function private.trade_item_visible_to_side_v1(uuid,uuid,uuid)
from public,anon,authenticated;

alter table public.trade_sessions enable row level security;
alter table public.trade_visible_items enable row level security;
alter table public.trade_interest_marks enable row level security;
alter table public.trade_offer_lines enable row level security;
alter table public.trade_messages enable row level security;
alter table public.trade_events enable row level security;

drop policy if exists trade_sessions_read on public.trade_sessions;
create policy trade_sessions_read on public.trade_sessions
for select to authenticated
using (private.can_read_trade_session_v1(id,auth.uid()));

drop policy if exists trade_visible_items_read on public.trade_visible_items;
create policy trade_visible_items_read on public.trade_visible_items
for select to authenticated
using (private.can_read_trade_session_v1(session_id,auth.uid()));

drop policy if exists trade_interest_marks_read on public.trade_interest_marks;
create policy trade_interest_marks_read on public.trade_interest_marks
for select to authenticated
using (private.can_read_trade_session_v1(session_id,auth.uid()));

drop policy if exists trade_offer_lines_read on public.trade_offer_lines;
create policy trade_offer_lines_read on public.trade_offer_lines
for select to authenticated
using (private.can_read_trade_session_v1(session_id,auth.uid()));

drop policy if exists trade_messages_read on public.trade_messages;
create policy trade_messages_read on public.trade_messages
for select to authenticated
using (private.can_read_trade_session_v1(session_id,auth.uid()));

drop policy if exists trade_events_read on public.trade_events;
create policy trade_events_read on public.trade_events
for select to authenticated
using (private.can_read_trade_session_v1(session_id,auth.uid()));

revoke insert,update,delete on
  public.trade_sessions,
  public.trade_visible_items,
  public.trade_interest_marks,
  public.trade_offer_lines,
  public.trade_messages,
  public.trade_events
from anon,authenticated;

grant select on
  public.trade_sessions,
  public.trade_visible_items,
  public.trade_interest_marks,
  public.trade_offer_lines,
  public.trade_messages,
  public.trade_events
to authenticated;

create or replace function public.create_trade_session_v1(
  p_room_id uuid,
  p_side_a_character_id uuid,
  p_side_b_character_id uuid,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.chat_rooms%rowtype;
  v_a public.characters%rowtype;
  v_b public.characters%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_session_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_side_a_character_id=p_side_b_character_id then
    raise exception 'Trade requires two distinct characters';
  end if;

  select * into v_room from public.chat_rooms where id=p_room_id;
  if not found then raise exception 'Trade room not found'; end if;

  if not private.can_write_chat_room(p_room_id,auth.uid())
     and not private.can_manage_campaign(v_room.campaign_id,auth.uid()) then
    raise exception 'Not allowed to start trade in this room';
  end if;

  select * into v_a from public.characters where id=p_side_a_character_id;
  select * into v_b from public.characters where id=p_side_b_character_id;

  if v_a.id is null or v_b.id is null
     or v_a.campaign_id<>v_room.campaign_id
     or v_b.campaign_id<>v_room.campaign_id then
    raise exception 'Trade characters and room must belong to the same campaign';
  end if;

  if v_a.character_type='npc' and v_b.character_type='npc' then
    raise exception 'Trade requires at least one PC side';
  end if;

  if not (
    private.can_act_character_trade_side_v1(v_a.id,auth.uid())
    or private.can_act_character_trade_side_v1(v_b.id,auth.uid())
    or private.can_manage_campaign(v_room.campaign_id,auth.uid())
  ) then
    raise exception 'User cannot act for either trade side';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trade-room:'||p_room_id::text,0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text,0)
  );

  select * into v_existing
  from public.engine_command_receipts
  where command_id=p_command_id;

  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'trade.create' then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  insert into public.trade_sessions(
    campaign_id,room_id,side_a_character_id,side_b_character_id,created_by
  )
  values(
    v_room.campaign_id,p_room_id,p_side_a_character_id,p_side_b_character_id,auth.uid()
  )
  returning id into v_session_id;

  perform private.trade_record_event_v1(
    v_session_id,'trade.created',1,null,
    jsonb_build_object(
      'roomId',p_room_id,
      'sideACharacterId',p_side_a_character_id,
      'sideBCharacterId',p_side_b_character_id
    ),
    auth.uid()
  );

  v_result:=jsonb_build_object(
    'sessionId',v_session_id,
    'roomId',p_room_id,
    'revision',1,
    'state','open'
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by
  )
  values(
    p_command_id,v_room.campaign_id,'gena','trade.create',
    v_session_id,v_result,auth.uid()
  );

  return v_result;
end;
$function$;
revoke all on function public.create_trade_session_v1(uuid,uuid,uuid,uuid)
from public,anon;
grant execute on function public.create_trade_session_v1(uuid,uuid,uuid,uuid)
to authenticated;

create or replace function public.set_trade_visibility_v1(
  p_session_id uuid,
  p_owner_character_id uuid,
  p_item_id uuid,
  p_visible boolean,
  p_visibility_kind text default 'item',
  p_visibility_group text default null,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.trade_sessions%rowtype;
  v_item public.character_inventory_items%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_visibility_kind not in ('item','container','assortment') then
    raise exception 'Unsupported trade visibility kind';
  end if;

  select * into v_session from public.trade_sessions
  where id=p_session_id for update;

  if not found or v_session.state<>'open' then raise exception 'Trade session is not open'; end if;
  if not private.can_act_trade_side_v1(p_session_id,p_owner_character_id,auth.uid()) then
    raise exception 'Not allowed to control this trade side';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trade:'||p_session_id::text,0)
  );

  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'trade.visibility'
       or v_existing.aggregate_id<>p_session_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  if p_visible then
    select * into v_item
    from public.character_inventory_items
    where id=p_item_id
      and character_id=p_owner_character_id
      and world_storage_id is null
      and surface_id is null;

    if not found then raise exception 'Trade-visible item is not owned by this side'; end if;
    if p_visibility_kind='container' and v_item.category<>'container' then
      raise exception 'Container visibility requires a container item';
    end if;

    insert into public.trade_visible_items(
      session_id,owner_character_id,item_id,visibility_kind,visibility_group,created_by
    )
    values(
      p_session_id,p_owner_character_id,p_item_id,p_visibility_kind,
      nullif(btrim(coalesce(p_visibility_group,'')),''),auth.uid()
    )
    on conflict(session_id,item_id) do update set
      owner_character_id=excluded.owner_character_id,
      visibility_kind=excluded.visibility_kind,
      visibility_group=excluded.visibility_group,
      created_by=excluded.created_by,
      created_at=now();
  else
    delete from public.trade_visible_items
    where session_id=p_session_id
      and owner_character_id=p_owner_character_id
      and item_id=p_item_id;

    delete from public.trade_interest_marks
    where session_id=p_session_id
      and item_id=p_item_id;
  end if;

  v_result:=jsonb_build_object(
    'sessionId',p_session_id,
    'itemId',p_item_id,
    'visible',p_visible,
    'visibilityKind',p_visibility_kind
  );

  perform private.trade_record_event_v1(
    p_session_id,
    case when p_visible then 'visibility.added' else 'visibility.removed' end,
    v_session.revision,
    p_owner_character_id,
    v_result,
    auth.uid()
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by,
    actor_character_id
  )
  values(
    p_command_id,v_session.campaign_id,'gena','trade.visibility',
    p_session_id,v_result,auth.uid(),p_owner_character_id
  );

  return v_result;
end;
$function$;
revoke all on function public.set_trade_visibility_v1(uuid,uuid,uuid,boolean,text,text,uuid)
from public,anon;
grant execute on function public.set_trade_visibility_v1(uuid,uuid,uuid,boolean,text,text,uuid)
to authenticated;

create or replace function public.set_trade_interest_v1(
  p_session_id uuid,
  p_interested_character_id uuid,
  p_item_id uuid,
  p_interested boolean,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.trade_sessions%rowtype;
  v_item public.character_inventory_items%rowtype;
  v_other uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  select * into v_session from public.trade_sessions
  where id=p_session_id for update;

  if not found or v_session.state<>'open' then raise exception 'Trade session is not open'; end if;
  if not private.can_act_trade_side_v1(p_session_id,p_interested_character_id,auth.uid()) then
    raise exception 'Not allowed to act for this trade side';
  end if;

  v_other:=private.trade_other_side_v1(p_session_id,p_interested_character_id);
  if v_other is null then raise exception 'Trade side not found'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trade:'||p_session_id::text,0)
  );

  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'trade.interest'
       or v_existing.aggregate_id<>p_session_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  if p_interested then
    select * into v_item
    from public.character_inventory_items
    where id=p_item_id
      and character_id=v_other
      and world_storage_id is null
      and surface_id is null;

    if not found then raise exception 'Wanted item is not owned by the other trade side'; end if;
    if not private.trade_item_visible_to_side_v1(
      p_session_id,p_interested_character_id,p_item_id
    ) then
      raise exception 'Wanted item is not trade-visible to this side';
    end if;

    insert into public.trade_interest_marks(
      session_id,interested_character_id,item_id,created_by
    )
    values(p_session_id,p_interested_character_id,p_item_id,auth.uid())
    on conflict do nothing;
  else
    delete from public.trade_interest_marks
    where session_id=p_session_id
      and interested_character_id=p_interested_character_id
      and item_id=p_item_id;
  end if;

  v_result:=jsonb_build_object(
    'sessionId',p_session_id,
    'interestedCharacterId',p_interested_character_id,
    'itemId',p_item_id,
    'interested',p_interested
  );

  perform private.trade_record_event_v1(
    p_session_id,
    case when p_interested then 'interest.added' else 'interest.removed' end,
    v_session.revision,
    p_interested_character_id,
    v_result,
    auth.uid()
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by,
    actor_character_id
  )
  values(
    p_command_id,v_session.campaign_id,'gena','trade.interest',
    p_session_id,v_result,auth.uid(),p_interested_character_id
  );

  return v_result;
end;
$function$;
revoke all on function public.set_trade_interest_v1(uuid,uuid,uuid,boolean,uuid)
from public,anon;
grant execute on function public.set_trade_interest_v1(uuid,uuid,uuid,boolean,uuid)
to authenticated;

create or replace function public.set_trade_offer_line_v1(
  p_session_id uuid,
  p_owner_character_id uuid,
  p_item_id uuid,
  p_quantity integer,
  p_expected_session_revision bigint,
  p_expected_item_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.trade_sessions%rowtype;
  v_item public.character_inventory_items%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_new_revision bigint;
  v_fingerprint text;
  v_result jsonb;
begin
  if p_quantity is null or p_quantity<0 or p_quantity>10000 then
    raise exception 'Trade offer quantity must be between 0 and 10000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trade:'||p_session_id::text,0)
  );

  select * into v_session
  from public.trade_sessions
  where id=p_session_id
  for update;

  if not found or v_session.state<>'open' then raise exception 'Trade session is not open'; end if;
  if v_session.revision<>p_expected_session_revision then
    raise exception 'trade.revision_stale';
  end if;
  if not private.can_act_trade_side_v1(p_session_id,p_owner_character_id,auth.uid()) then
    raise exception 'Not allowed to control this trade side';
  end if;

  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'trade.offer_mutate'
       or v_existing.aggregate_id<>p_session_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  if p_quantity=0 then
    delete from public.trade_offer_lines
    where session_id=p_session_id
      and owner_character_id=p_owner_character_id
      and item_id=p_item_id;

    if not found then raise exception 'Trade offer line not found'; end if;
  else
    select * into v_item
    from public.character_inventory_items
    where id=p_item_id
      and character_id=p_owner_character_id
      and world_storage_id is null
      and surface_id is null
    for update;

    if not found then raise exception 'trade.offer_item_moved'; end if;
    if v_item.version<>p_expected_item_version then raise exception 'trade.offer_item_stale'; end if;
    if v_item.equipped then raise exception 'Equipped item cannot enter trade offer'; end if;
    if v_item.quantity<p_quantity then raise exception 'Not enough item quantity for trade offer'; end if;
    if coalesce(v_item.stack_mode,'instance')='instance' and p_quantity<>v_item.quantity then
      raise exception 'Inventory instance cannot be split';
    end if;
    if private.trade_offer_overlap_v1(p_session_id,p_owner_character_id,p_item_id) then
      raise exception 'trade.offer_subtree_overlap';
    end if;

    v_fingerprint:=private.cheburashka_trade_item_fingerprint_v1(p_item_id,p_quantity);

    insert into public.trade_offer_lines(
      session_id,owner_character_id,item_id,quantity,item_version,
      integrity_fingerprint,added_by
    )
    values(
      p_session_id,p_owner_character_id,p_item_id,p_quantity,v_item.version,
      v_fingerprint,auth.uid()
    )
    on conflict(session_id,item_id) do update set
      owner_character_id=excluded.owner_character_id,
      quantity=excluded.quantity,
      item_version=excluded.item_version,
      integrity_fingerprint=excluded.integrity_fingerprint,
      added_by=excluded.added_by,
      updated_at=now();
  end if;

  v_new_revision:=private.trade_bump_revision_v1(p_session_id,null);

  v_result:=jsonb_build_object(
    'sessionId',p_session_id,
    'itemId',p_item_id,
    'ownerCharacterId',p_owner_character_id,
    'quantity',p_quantity,
    'revision',v_new_revision,
    'acceptancesReset',true
  );

  perform private.trade_record_event_v1(
    p_session_id,
    case when p_quantity=0 then 'offer.removed' else 'offer.changed' end,
    v_new_revision,p_owner_character_id,v_result,auth.uid()
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by,
    actor_character_id
  )
  values(
    p_command_id,v_session.campaign_id,'gena','trade.offer_mutate',
    p_session_id,v_result,auth.uid(),p_owner_character_id
  );

  return v_result;
end;
$function$;
revoke all on function public.set_trade_offer_line_v1(uuid,uuid,uuid,integer,bigint,bigint,uuid)
from public,anon;
grant execute on function public.set_trade_offer_line_v1(uuid,uuid,uuid,integer,bigint,bigint,uuid)
to authenticated;

create or replace function public.post_trade_message_v1(
  p_session_id uuid,
  p_actor_character_id uuid,
  p_body text,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.trade_sessions%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_message_id uuid;
  v_result jsonb;
begin
  if btrim(coalesce(p_body,''))='' or char_length(btrim(p_body))>4000 then
    raise exception 'Trade message must contain 1..4000 characters';
  end if;

  select * into v_session from public.trade_sessions where id=p_session_id;
  if not found or v_session.state<>'open' then raise exception 'Trade session is not open'; end if;
  if not private.can_act_trade_side_v1(p_session_id,p_actor_character_id,auth.uid()) then
    raise exception 'Not allowed to speak for this trade side';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_command_id::text,0)
  );

  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'trade.message'
       or v_existing.aggregate_id<>p_session_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  v_message_id:=p_command_id;
  insert into public.trade_messages(
    id,session_id,actor_character_id,body,created_by
  )
  values(
    v_message_id,p_session_id,p_actor_character_id,btrim(p_body),auth.uid()
  );

  v_result:=jsonb_build_object(
    'sessionId',p_session_id,
    'messageId',v_message_id,
    'actorCharacterId',p_actor_character_id
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by,
    actor_character_id
  )
  values(
    p_command_id,v_session.campaign_id,'gena','trade.message',
    p_session_id,v_result,auth.uid(),p_actor_character_id
  );

  return v_result;
end;
$function$;
revoke all on function public.post_trade_message_v1(uuid,uuid,text,uuid)
from public,anon;
grant execute on function public.post_trade_message_v1(uuid,uuid,text,uuid)
to authenticated;

create or replace function public.cancel_trade_v1(
  p_session_id uuid,
  p_actor_character_id uuid,
  p_expected_revision bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.trade_sessions%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trade:'||p_session_id::text,0)
  );

  select * into v_session from public.trade_sessions
  where id=p_session_id for update;

  if not found or v_session.state<>'open' then raise exception 'Trade session is not open'; end if;
  if v_session.revision<>p_expected_revision then raise exception 'trade.revision_stale'; end if;
  if not (
    private.can_act_trade_side_v1(p_session_id,p_actor_character_id,auth.uid())
    or private.can_manage_campaign(v_session.campaign_id,auth.uid())
  ) then raise exception 'Not allowed to cancel trade'; end if;

  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'trade.cancel'
       or v_existing.aggregate_id<>p_session_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  update public.trade_sessions s
  set state='cancelled',
      accepted_a_revision=null,
      accepted_b_revision=null,
      cancelled_at=now(),
      updated_at=now()
  where id=p_session_id;

  v_result:=jsonb_build_object(
    'sessionId',p_session_id,
    'state','cancelled',
    'revision',v_session.revision
  );

  perform private.trade_record_event_v1(
    p_session_id,'trade.cancelled',v_session.revision,
    p_actor_character_id,v_result,auth.uid()
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,created_by,
    actor_character_id
  )
  values(
    p_command_id,v_session.campaign_id,'gena','trade.cancel',
    p_session_id,v_result,auth.uid(),p_actor_character_id
  );

  return v_result;
end;
$function$;
revoke all on function public.cancel_trade_v1(uuid,uuid,bigint,uuid)
from public,anon;
grant execute on function public.cancel_trade_v1(uuid,uuid,bigint,uuid)
to authenticated;

create or replace function public.get_trade_session_v1(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_session public.trade_sessions%rowtype;
begin
  if not private.can_read_trade_session_v1(p_session_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  select * into v_session from public.trade_sessions where id=p_session_id;
  if not found then return null; end if;

  return jsonb_build_object(
    'id',v_session.id,
    'campaignId',v_session.campaign_id,
    'roomId',v_session.room_id,
    'sideACharacterId',v_session.side_a_character_id,
    'sideBCharacterId',v_session.side_b_character_id,
    'state',v_session.state,
    'revision',v_session.revision,
    'acceptedARevision',v_session.accepted_a_revision,
    'acceptedBRevision',v_session.accepted_b_revision,
    'lastFailureCode',v_session.last_failure_code,
    'canActA',private.can_act_trade_side_v1(v_session.id,v_session.side_a_character_id,auth.uid()),
    'canActB',private.can_act_trade_side_v1(v_session.id,v_session.side_b_character_id,auth.uid()),
    'createdAt',v_session.created_at,
    'committedAt',v_session.committed_at,
    'cancelledAt',v_session.cancelled_at
  );
end;
$function$;
revoke all on function public.get_trade_session_v1(uuid)
from public,anon;
grant execute on function public.get_trade_session_v1(uuid)
to authenticated;

create or replace function public.list_trade_sessions_for_room_v1(p_room_id uuid)
returns table(session jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  return query
  select jsonb_build_object(
    'id',s.id,
    'roomId',s.room_id,
    'sideACharacterId',s.side_a_character_id,
    'sideBCharacterId',s.side_b_character_id,
    'state',s.state,
    'revision',s.revision,
    'acceptedARevision',s.accepted_a_revision,
    'acceptedBRevision',s.accepted_b_revision,
    'lastFailureCode',s.last_failure_code,
    'createdAt',s.created_at,
    'committedAt',s.committed_at,
    'cancelledAt',s.cancelled_at
  )
  from public.trade_sessions s
  where s.room_id=p_room_id
    and private.can_read_trade_session_v1(s.id,auth.uid())
  order by s.created_at,s.id;
end;
$function$;
revoke all on function public.list_trade_sessions_for_room_v1(uuid)
from public,anon;
grant execute on function public.list_trade_sessions_for_room_v1(uuid)
to authenticated;

create or replace function public.list_trade_own_inventory_v1(
  p_session_id uuid,
  p_side_character_id uuid
)
returns table(item jsonb,inventory_profile jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.can_act_trade_side_v1(p_session_id,p_side_character_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  return query
  select to_jsonb(i),private.cheburashka_inventory_profile_for_item_v1(i.id)
  from public.character_inventory_items i
  where i.character_id=p_side_character_id
    and i.world_storage_id is null
    and i.surface_id is null
  order by i.sort_order,i.created_at,i.id;
end;
$function$;
revoke all on function public.list_trade_own_inventory_v1(uuid,uuid)
from public,anon;
grant execute on function public.list_trade_own_inventory_v1(uuid,uuid)
to authenticated;

create or replace function public.list_trade_visible_inventory_v1(
  p_session_id uuid,
  p_viewer_character_id uuid
)
returns table(
  item jsonb,
  inventory_profile jsonb,
  visibility_kind text,
  visibility_group text,
  source_item_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_other uuid;
begin
  if not private.can_act_trade_side_v1(p_session_id,p_viewer_character_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  v_other:=private.trade_other_side_v1(p_session_id,p_viewer_character_id);
  if v_other is null then raise exception 'Trade side not found'; end if;

  return query
  with recursive visible as (
    select
      grant_row.item_id id,
      grant_row.item_id source_id,
      grant_row.visibility_kind,
      grant_row.visibility_group,
      0 depth
    from public.trade_visible_items grant_row
    where grant_row.session_id=p_session_id
      and grant_row.owner_character_id=v_other

    union all

    select
      child.id,
      visible.source_id,
      visible.visibility_kind,
      visible.visibility_group,
      visible.depth+1
    from public.character_inventory_items child
    join visible on child.holder_item_id=visible.id
    where visible.visibility_kind='container'
      and visible.depth<16
  ),
  distinct_visible as (
    select distinct on (id)
      id,source_id,visibility_kind,visibility_group
    from visible
    order by id,
      case visibility_kind when 'item' then 1 when 'assortment' then 2 else 3 end
  )
  select
    to_jsonb(i),
    private.cheburashka_inventory_profile_for_item_v1(i.id),
    dv.visibility_kind,
    dv.visibility_group,
    dv.source_id
  from distinct_visible dv
  join public.character_inventory_items i on i.id=dv.id
  where i.character_id=v_other
    and i.world_storage_id is null
    and i.surface_id is null
  order by i.sort_order,i.created_at,i.id;
end;
$function$;
revoke all on function public.list_trade_visible_inventory_v1(uuid,uuid)
from public,anon;
grant execute on function public.list_trade_visible_inventory_v1(uuid,uuid)
to authenticated;

create or replace function public.list_trade_offer_v1(p_session_id uuid)
returns table(
  owner_character_id uuid,
  item_id uuid,
  quantity integer,
  offered_item_version bigint,
  current_item jsonb,
  inventory_profile jsonb,
  stale boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.can_read_trade_session_v1(p_session_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  return query
  select
    line.owner_character_id,
    line.item_id,
    line.quantity,
    line.item_version,
    case when i.id is null then null else to_jsonb(i) end,
    case when i.id is null then null else private.cheburashka_inventory_profile_for_item_v1(i.id) end,
    (
      i.id is null
      or i.character_id is distinct from line.owner_character_id
      or i.world_storage_id is not null
      or i.surface_id is not null
      or i.version<>line.item_version
      or i.quantity<line.quantity
      or private.cheburashka_trade_item_fingerprint_v1(line.item_id,line.quantity)
         is distinct from line.integrity_fingerprint
    )
  from public.trade_offer_lines line
  left join public.character_inventory_items i on i.id=line.item_id
  where line.session_id=p_session_id
  order by line.owner_character_id,line.created_at,line.item_id;
end;
$function$;
revoke all on function public.list_trade_offer_v1(uuid)
from public,anon;
grant execute on function public.list_trade_offer_v1(uuid)
to authenticated;

create or replace function public.list_trade_interest_v1(p_session_id uuid)
returns table(
  interested_character_id uuid,
  item_id uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.can_read_trade_session_v1(p_session_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  return query
  select i.interested_character_id,i.item_id,i.created_at
  from public.trade_interest_marks i
  where i.session_id=p_session_id
  order by i.created_at,i.item_id;
end;
$function$;
revoke all on function public.list_trade_interest_v1(uuid)
from public,anon;
grant execute on function public.list_trade_interest_v1(uuid)
to authenticated;

create or replace function public.list_trade_thread_v1(p_session_id uuid)
returns table(
  id uuid,
  actor_character_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.can_read_trade_session_v1(p_session_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  return query
  select m.id,m.actor_character_id,m.body,m.created_at
  from public.trade_messages m
  where m.session_id=p_session_id
  order by m.created_at,m.id;
end;
$function$;
revoke all on function public.list_trade_thread_v1(uuid)
from public,anon;
grant execute on function public.list_trade_thread_v1(uuid)
to authenticated;

create or replace function public.list_trade_history_v1(p_session_id uuid)
returns table(
  id uuid,
  event_type text,
  revision bigint,
  actor_character_id uuid,
  payload jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.can_read_trade_session_v1(p_session_id,auth.uid()) then
    raise exception 'Not allowed';
  end if;

  return query
  select e.id,e.event_type,e.revision,e.actor_character_id,e.payload,e.created_at
  from public.trade_events e
  where e.session_id=p_session_id
  order by e.created_at,e.id;
end;
$function$;
revoke all on function public.list_trade_history_v1(uuid)
from public,anon;
grant execute on function public.list_trade_history_v1(uuid)
to authenticated;

do $publication$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='trade_sessions'
  ) then execute 'alter publication supabase_realtime add table public.trade_sessions'; end if;

  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='trade_offer_lines'
  ) then execute 'alter publication supabase_realtime add table public.trade_offer_lines'; end if;

  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='trade_visible_items'
  ) then execute 'alter publication supabase_realtime add table public.trade_visible_items'; end if;

  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='trade_interest_marks'
  ) then execute 'alter publication supabase_realtime add table public.trade_interest_marks'; end if;

  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='trade_messages'
  ) then execute 'alter publication supabase_realtime add table public.trade_messages'; end if;
end
$publication$;
