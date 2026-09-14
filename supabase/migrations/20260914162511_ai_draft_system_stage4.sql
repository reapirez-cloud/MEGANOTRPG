create table public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  thread_id uuid references public.ai_threads(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  agent_key text not null default 'voss',
  draft_type text not null
    check (draft_type in ('bundle','location','character','definition')),
  title text not null,
  summary text not null default '',
  status text not null default 'review'
    check (status in ('review','archived')),
  schema_version integer not null default 1
    check (schema_version = 1),
  current_revision integer not null default 1
    check (current_revision >= 1),
  content jsonb not null
    check (jsonb_typeof(content) = 'object'),
  validation_warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(validation_warnings) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(agent_key)) between 1 and 64),
  check (length(btrim(title)) between 1 and 160),
  check (length(summary) <= 4000)
);

create index ai_drafts_campaign_updated_idx
  on public.ai_drafts (campaign_id, status, updated_at desc);

create index ai_drafts_creator_updated_idx
  on public.ai_drafts (created_by, updated_at desc);

create table public.ai_draft_revisions (
  draft_id uuid not null references public.ai_drafts(id) on delete cascade,
  revision integer not null check (revision >= 1),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  validation_warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(validation_warnings) = 'array'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (draft_id, revision)
);

alter table public.ai_drafts enable row level security;
alter table public.ai_draft_revisions enable row level security;

create policy ai_drafts_manager_read
on public.ai_drafts
for select
to authenticated
using (
  private.is_campaign_manager(campaign_id, (select auth.uid()))
);

create policy ai_draft_revisions_manager_read
on public.ai_draft_revisions
for select
to authenticated
using (
  exists (
    select 1
    from public.ai_drafts d
    where d.id = ai_draft_revisions.draft_id
      and private.is_campaign_manager(d.campaign_id, (select auth.uid()))
  )
);

revoke all on public.ai_drafts from public, anon, authenticated;
revoke all on public.ai_draft_revisions from public, anon, authenticated;

grant select on public.ai_drafts to authenticated;
grant select on public.ai_draft_revisions to authenticated;

grant select, insert, update, delete on public.ai_drafts to service_role;
grant select, insert, update, delete on public.ai_draft_revisions to service_role;
