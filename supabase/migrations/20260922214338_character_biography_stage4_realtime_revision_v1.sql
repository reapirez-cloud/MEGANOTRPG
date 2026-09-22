create table public.character_biography_revisions (
  character_id uuid primary key references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  revision bigint not null default 1,
  change_kind text not null default 'biography',
  updated_at timestamptz not null default now(),
  constraint character_biography_revisions_revision_check check (revision > 0),
  constraint character_biography_revisions_kind_not_blank check (length(btrim(change_kind)) > 0)
);

create index character_biography_revisions_campaign_idx
  on public.character_biography_revisions(campaign_id,updated_at desc);

alter table public.character_biography_revisions enable row level security;
revoke all on table public.character_biography_revisions from anon;
grant select on table public.character_biography_revisions to authenticated;

create policy character_biography_revisions_read
on public.character_biography_revisions
for select
to authenticated
using ((select private.can_read_character_knowledge(character_id)));

CREATE OR REPLACE FUNCTION private.bump_character_biography_revision_v1(p_campaign_id uuid, p_character_id uuid, p_change_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_campaign_id is null or p_character_id is null then
    return;
  end if;

  insert into public.character_biography_revisions(
    character_id,campaign_id,revision,change_kind,updated_at
  ) values (
    p_character_id,p_campaign_id,1,
    coalesce(nullif(left(btrim(p_change_kind),120),''),'biography'),
    now()
  )
  on conflict (character_id)
  do update set
    campaign_id=excluded.campaign_id,
    revision=public.character_biography_revisions.revision+1,
    change_kind=excluded.change_kind,
    updated_at=now();
end;
$function$;
revoke all on function private.bump_character_biography_revision_v1(uuid,uuid,text)
from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.emit_character_biography_revision_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_campaign_id uuid;
  v_character_id uuid;
  v_other_character_id uuid;
  v_faction_id uuid;
  v_row record;
begin
  if tg_table_name = 'character_relationships' then
    if tg_op = 'DELETE' then
      v_campaign_id := old.campaign_id;
      v_character_id := old.subject_character_id;
      v_other_character_id := old.target_character_id;
    else
      v_campaign_id := new.campaign_id;
      v_character_id := new.subject_character_id;
      v_other_character_id := new.target_character_id;
    end if;

    perform private.bump_character_biography_revision_v1(
      v_campaign_id,v_character_id,'relationship'
    );
    perform private.bump_character_biography_revision_v1(
      v_campaign_id,v_other_character_id,'relationship'
    );

  elsif tg_table_name = 'character_assets' then
    if tg_op = 'DELETE' then
      v_campaign_id := old.campaign_id;
      v_character_id := old.owner_character_id;
    else
      v_campaign_id := new.campaign_id;
      v_character_id := new.owner_character_id;
    end if;

    perform private.bump_character_biography_revision_v1(
      v_campaign_id,v_character_id,'asset'
    );

  elsif tg_table_name = 'character_faction_reputations' then
    if tg_op = 'DELETE' then
      v_campaign_id := old.campaign_id;
      v_character_id := old.character_id;
    else
      v_campaign_id := new.campaign_id;
      v_character_id := new.character_id;
    end if;

    perform private.bump_character_biography_revision_v1(
      v_campaign_id,v_character_id,'faction_reputation'
    );

  elsif tg_table_name = 'faction_memberships' then
    if tg_op = 'DELETE' then
      v_campaign_id := old.campaign_id;
      v_character_id := old.character_id;
    else
      v_campaign_id := new.campaign_id;
      v_character_id := new.character_id;
    end if;

    perform private.bump_character_biography_revision_v1(
      v_campaign_id,v_character_id,'faction_membership'
    );

  elsif tg_table_name = 'factions' and tg_op = 'UPDATE' then
    v_campaign_id := new.campaign_id;
    v_faction_id := new.id;

    for v_row in
      select distinct x.character_id
      from (
        select m.character_id
        from public.faction_memberships m
        where m.faction_id=v_faction_id
        union
        select r.character_id
        from public.character_faction_reputations r
        where r.faction_id=v_faction_id
      ) x
    loop
      perform private.bump_character_biography_revision_v1(
        v_campaign_id,v_row.character_id,'faction'
      );
    end loop;
  end if;

  return coalesce(new,old);
end;
$function$;
revoke all on function private.emit_character_biography_revision_v1()
from public,anon,authenticated;

create trigger character_relationships_biography_revision
after insert or update or delete on public.character_relationships
for each row execute function private.emit_character_biography_revision_v1();

create trigger character_assets_biography_revision
after insert or update or delete on public.character_assets
for each row execute function private.emit_character_biography_revision_v1();

create trigger character_faction_reputations_biography_revision
after insert or update or delete on public.character_faction_reputations
for each row execute function private.emit_character_biography_revision_v1();

create trigger faction_memberships_biography_revision
after insert or update or delete on public.faction_memberships
for each row execute function private.emit_character_biography_revision_v1();

create trigger factions_biography_revision
after update on public.factions
for each row execute function private.emit_character_biography_revision_v1();

insert into public.character_biography_revisions(character_id,campaign_id,revision,change_kind)
select c.id,c.campaign_id,1,'bootstrap'
from public.characters c
where exists (
  select 1 from public.character_relationships r
  where r.subject_character_id=c.id or r.target_character_id=c.id
)
or exists (
  select 1 from public.character_assets a
  where a.owner_character_id=c.id
)
or exists (
  select 1 from public.character_faction_reputations fr
  where fr.character_id=c.id
)
or exists (
  select 1 from public.faction_memberships fm
  where fm.character_id=c.id
)
on conflict (character_id) do nothing;

alter publication supabase_realtime
add table public.character_biography_revisions;
