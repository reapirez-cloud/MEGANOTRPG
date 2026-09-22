create table if not exists public.ai_world_slots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  slot_index smallint not null check (slot_index between 1 and 5),
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, slot_index)
);

alter table public.ai_world_slots enable row level security;

revoke all on table public.ai_world_slots from anon;
grant select, insert, update, delete on table public.ai_world_slots to authenticated;

drop policy if exists ai_world_slots_owner_read on public.ai_world_slots;
create policy ai_world_slots_owner_read
on public.ai_world_slots
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists ai_world_slots_owner_insert on public.ai_world_slots;
create policy ai_world_slots_owner_insert
on public.ai_world_slots
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

drop policy if exists ai_world_slots_owner_update on public.ai_world_slots;
create policy ai_world_slots_owner_update
on public.ai_world_slots
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

drop policy if exists ai_world_slots_owner_delete on public.ai_world_slots;
create policy ai_world_slots_owner_delete
on public.ai_world_slots
for delete
to authenticated
using ((select auth.uid()) = owner_user_id);

create index if not exists ai_world_slots_owner_user_id_idx
  on public.ai_world_slots(owner_user_id);
