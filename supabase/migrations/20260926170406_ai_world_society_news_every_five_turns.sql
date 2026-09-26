begin;

-- Only a finalized player turn advances this counter. Chat messages, rolls,
-- NPC dialogue, failed jobs and replays do not count as another turn.
create table public.ai_world_news_progress (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  completed_turns bigint not null default 0 check (completed_turns >= 0)
);

create table public.ai_world_news_turn_receipts (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_message_id bigint not null,
  turn_number bigint not null check (turn_number > 0),
  job_id uuid not null,
  primary key (campaign_id, source_message_id),
  unique (campaign_id, turn_number),
  unique (job_id)
);

create table public.ai_world_news_cycles (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  end_turn_number bigint not null check (end_turn_number > 0 and end_turn_number % 5 = 0),
  final_job_id uuid references public.agent_jobs(id) on delete cascade,
  state text not null default 'queued' check (state in ('queued','running','published')),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  published_update_id uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (campaign_id, end_turn_number),
  unique (final_job_id)
);

create index ai_world_news_cycles_pending_idx
  on public.ai_world_news_cycles(campaign_id, end_turn_number)
  where state <> 'published';

alter table public.ai_world_news_progress enable row level security;
alter table public.ai_world_news_turn_receipts enable row level security;
alter table public.ai_world_news_cycles enable row level security;
revoke all on public.ai_world_news_progress, public.ai_world_news_turn_receipts,
  public.ai_world_news_cycles from public, anon, authenticated;
grant all on public.ai_world_news_progress, public.ai_world_news_turn_receipts,
  public.ai_world_news_cycles to service_role;

alter table public.campaign_updates
  add column ai_news_cycle_id uuid unique references public.ai_world_news_cycles(id) on delete cascade,
  add column ai_author_character_id uuid references public.characters(id) on delete set null,
  add column ai_author_label text,
  add column ai_news_evidence_kind text check (ai_news_evidence_kind in ('campaign_event','world_lore')),
  add column ai_news_evidence_id uuid,
  add constraint ai_news_evidence_pair check
    ((ai_news_evidence_kind is null) = (ai_news_evidence_id is null));

create unique index campaign_updates_ai_news_evidence_once_idx
  on public.campaign_updates(campaign_id,ai_news_evidence_kind,ai_news_evidence_id)
  where ai_news_cycle_id is not null and ai_news_evidence_id is not null;

create index campaign_updates_ai_author_character_idx
  on public.campaign_updates(ai_author_character_id)
  where ai_author_character_id is not null;

create or replace function private.queue_ai_world_news_from_completed_turn_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_source_id bigint;
  v_turn_number bigint;
begin
  if auth.role() is distinct from 'service_role'
     or new.status <> 'completed'
     or old.status = 'completed'
     or new.job_type <> 'conversation_turn'
     or new.input->>'surface' is distinct from 'game_chat_v1'
     or new.result->>'stage18_v3_finalized' is distinct from 'true'
     or coalesce(new.input->>'source_chat_message_id','') !~ '^[0-9]+$'
     or not exists (
       select 1 from public.ai_world_slots w where w.campaign_id = new.campaign_id
     )
  then
    return new;
  end if;

  v_source_id := (new.input->>'source_chat_message_id')::bigint;
  if not exists (
    select 1
    from public.chat_messages m
    join public.chat_rooms r on r.id = m.room_id
    join public.characters c on c.id = m.character_id
    where m.id = v_source_id and r.campaign_id = new.campaign_id
      and c.campaign_id = new.campaign_id and c.character_type = 'pc'
      and m.user_id = new.requested_by
  ) then
    return new;
  end if;

  insert into public.ai_world_news_progress(campaign_id, completed_turns)
  values (new.campaign_id, 0) on conflict (campaign_id) do nothing;
  -- Lock the campaign counter before checking the source receipt. Two rooms can
  -- finish at the same time without issuing duplicate fifth-turn cycles.
  perform 1 from public.ai_world_news_progress
  where campaign_id = new.campaign_id for update;
  if exists (
    select 1 from public.ai_world_news_turn_receipts
    where campaign_id = new.campaign_id and source_message_id = v_source_id
  ) then
    return new;
  end if;

  update public.ai_world_news_progress
  set completed_turns = completed_turns + 1
  where campaign_id = new.campaign_id
  returning completed_turns into v_turn_number;

  insert into public.ai_world_news_turn_receipts
    (campaign_id, source_message_id, turn_number, job_id)
  values (new.campaign_id, v_source_id, v_turn_number, new.id);

  if v_turn_number % 5 = 0 then
    insert into public.ai_world_news_cycles
      (campaign_id, end_turn_number, final_job_id)
    values (new.campaign_id, v_turn_number, new.id);
  end if;
  return new;
end;
$$;

create trigger queue_ai_world_news_from_completed_turn_v1
after update of status on public.agent_jobs
for each row execute function private.queue_ai_world_news_from_completed_turn_v1();

create function public.claim_ai_world_news_cycle_v1(p_campaign_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare v_cycle public.ai_world_news_cycles%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;

  select c.* into v_cycle
  from public.ai_world_news_cycles c
  where c.campaign_id = p_campaign_id
    and (c.state = 'queued' or (c.state = 'running' and c.lease_expires_at < now()))
    and not exists (
      select 1 from public.ai_gm_post_turn_commits pc
      where pc.parent_job_id = c.final_job_id and pc.state <> 'completed'
    )
  order by c.end_turn_number
  limit 1 for update skip locked;

  if v_cycle.id is null then return '{}'::jsonb; end if;
  update public.ai_world_news_cycles
  set state = 'running', lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '2 minutes', attempts = attempts + 1
  where id = v_cycle.id returning * into v_cycle;

  return jsonb_build_object('id',v_cycle.id,'campaign_id',v_cycle.campaign_id,
    'end_turn_number',v_cycle.end_turn_number,'lease_token',v_cycle.lease_token,
    'attempts',v_cycle.attempts);
end;
$$;

create function public.publish_ai_world_news_cycle_v1(
  p_cycle_id uuid, p_lease_token uuid, p_title text, p_body text,
  p_author_character_id uuid default null, p_author_label text default null,
  p_evidence_kind text default null, p_evidence_id uuid default null
)
returns uuid language plpgsql set search_path = '' as $$
declare
  v_cycle public.ai_world_news_cycles%rowtype;
  v_update_id uuid;
  v_label text := btrim(coalesce(p_author_label,''));
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select * into v_cycle from public.ai_world_news_cycles where id = p_cycle_id for update;
  if v_cycle.id is null then raise exception 'news_cycle_not_found'; end if;
  if v_cycle.state = 'published' then return v_cycle.published_update_id; end if;
  if v_cycle.state <> 'running' or v_cycle.lease_token is distinct from p_lease_token
     or v_cycle.lease_expires_at <= now() then
    raise exception 'news_cycle_lease_invalid';
  end if;
  if length(btrim(coalesce(p_title,''))) not between 4 and 120
     or length(btrim(coalesce(p_body,''))) not between 8 and 1200
     or length(v_label) > 100 then
    raise exception 'news_content_invalid';
  end if;
  if p_author_character_id is not null and not exists (
    select 1 from public.characters c
    where c.id = p_author_character_id and c.campaign_id = v_cycle.campaign_id
      and c.character_type = 'npc' and c.visibility = 'campaign'
      and c.publication_state = 'campaign'
      and c.life_state = 'alive'
      and (c.visibility_mode = 'always' or (
        c.visibility_mode = 'discover'
        and exists (
          select 1 from public.campaign_members m
          where m.campaign_id = v_cycle.campaign_id and m.active_character_id is not null
        )
        and not exists (
          select 1 from public.campaign_members m
          where m.campaign_id = v_cycle.campaign_id and m.active_character_id is not null
            and not exists (
              select 1 from public.character_npc_discoveries d
              where d.character_id = m.active_character_id and d.npc_character_id = c.id
            )
        )
      ))
  ) then
    raise exception 'news_author_not_public_npc';
  end if;
  if (p_evidence_kind is null) <> (p_evidence_id is null) then
    raise exception 'news_evidence_pair_invalid';
  end if;
  if p_evidence_kind = 'campaign_event' and not exists (
    select 1 from public.campaign_events e
    where e.id = p_evidence_id and e.campaign_id = v_cycle.campaign_id
      and e.visibility = 'campaign'
  ) then
    raise exception 'news_event_not_public';
  elsif p_evidence_kind = 'world_lore' and not exists (
    select 1 from public.world_lore_entries l
    where l.id = p_evidence_id and l.campaign_id = v_cycle.campaign_id
      and l.visibility = 'campaign'
  ) then
    raise exception 'news_lore_not_public';
  elsif p_evidence_kind is not null and p_evidence_kind not in ('campaign_event','world_lore') then
    raise exception 'news_evidence_kind_invalid';
  end if;

  insert into public.campaign_updates
    (campaign_id, kind, title, body, ai_news_cycle_id, ai_author_character_id,
     ai_author_label, ai_news_evidence_kind, ai_news_evidence_id)
  values
    (v_cycle.campaign_id, 'announcement', btrim(p_title), btrim(p_body),
     v_cycle.id, p_author_character_id, nullif(v_label,''),p_evidence_kind,p_evidence_id)
  returning id into v_update_id;

  update public.ai_world_news_cycles
  set state = 'published', published_update_id = v_update_id,
      lease_token = null, lease_expires_at = null, published_at = now(), last_error = null
  where id = v_cycle.id;
  return v_update_id;
end;
$$;

create function public.fail_ai_world_news_cycle_v1(
  p_cycle_id uuid, p_lease_token uuid, p_error text
)
returns void language plpgsql set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  update public.ai_world_news_cycles
  set state = 'queued', lease_token = null, lease_expires_at = null,
      last_error = left(p_error,500)
  where id = p_cycle_id and state = 'running' and lease_token = p_lease_token;
end;
$$;

revoke all on function public.claim_ai_world_news_cycle_v1(uuid),
  public.publish_ai_world_news_cycle_v1(uuid,uuid,text,text,uuid,text,text,uuid),
  public.fail_ai_world_news_cycle_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_ai_world_news_cycle_v1(uuid),
  public.publish_ai_world_news_cycle_v1(uuid,uuid,text,text,uuid,text,text,uuid),
  public.fail_ai_world_news_cycle_v1(uuid,uuid,text) to service_role;

commit;
