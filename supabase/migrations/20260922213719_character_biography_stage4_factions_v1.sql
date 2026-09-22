create table public.factions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  summary text not null default '',
  description text not null default '',
  image_url text,
  player_visible boolean not null default true,
  state text not null default 'active',
  tags text[] not null default '{}'::text[],
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint factions_name_not_blank check (length(btrim(name)) > 0),
  constraint factions_state_check check (state in ('active','archived'))
);

create unique index factions_campaign_name_unique
  on public.factions(campaign_id, lower(btrim(name)));
create index factions_campaign_state_idx
  on public.factions(campaign_id, state, lower(name));

create table public.faction_memberships (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  faction_id uuid not null references public.factions(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  membership_role text not null default 'member',
  rank_label text not null default '',
  is_primary boolean not null default false,
  player_visible boolean not null default true,
  state text not null default 'active',
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faction_memberships_role_not_blank check (length(btrim(membership_role)) > 0),
  constraint faction_memberships_state_check check (state in ('active','ended')),
  constraint faction_memberships_end_consistency check ((state='active' and ended_at is null) or state='ended'),
  constraint faction_memberships_pair_unique unique (campaign_id,faction_id,character_id)
);

create index faction_memberships_faction_idx on public.faction_memberships(faction_id,state);
create index faction_memberships_character_idx on public.faction_memberships(character_id,state);
create index faction_memberships_player_active_idx
  on public.faction_memberships(character_id,updated_at desc)
  where player_visible and state='active';

create table public.character_faction_reputations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  faction_id uuid not null references public.factions(id) on delete cascade,
  standing_kind text not null default 'neutral',
  public_label text not null default '',
  reputation_score smallint not null default 0,
  player_note text not null default '',
  gm_note text not null default '',
  player_visible boolean not null default true,
  state text not null default 'active',
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint character_faction_reputations_standing_not_blank check (length(btrim(standing_kind)) > 0),
  constraint character_faction_reputations_score_range check (reputation_score between -100 and 100),
  constraint character_faction_reputations_state_check check (state in ('active','ended')),
  constraint character_faction_reputations_end_consistency check ((state='active' and ended_at is null) or state='ended'),
  constraint character_faction_reputations_pair_unique unique (campaign_id,character_id,faction_id)
);

create index character_faction_reputations_character_idx
  on public.character_faction_reputations(character_id,state);
create index character_faction_reputations_faction_idx
  on public.character_faction_reputations(faction_id,state);
create index character_faction_reputations_player_active_idx
  on public.character_faction_reputations(character_id,updated_at desc)
  where player_visible and state='active';

create trigger factions_touch_updated_at
before update on public.factions
for each row execute function private.biography_touch_updated_at_v1();
create trigger faction_memberships_touch_updated_at
before update on public.faction_memberships
for each row execute function private.biography_touch_updated_at_v1();
create trigger character_faction_reputations_touch_updated_at
before update on public.character_faction_reputations
for each row execute function private.biography_touch_updated_at_v1();

CREATE OR REPLACE FUNCTION private.validate_faction_membership_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_character_campaign uuid;
  v_faction_campaign uuid;
begin
  select c.campaign_id into v_character_campaign
  from public.characters c
  where c.id = new.character_id;

  select f.campaign_id into v_faction_campaign
  from public.factions f
  where f.id = new.faction_id;

  if v_character_campaign is null or v_faction_campaign is null then
    raise exception 'Faction membership character or faction not found';
  end if;

  if new.campaign_id <> v_character_campaign
     or new.campaign_id <> v_faction_campaign then
    raise exception 'Faction membership entities must belong to the same campaign';
  end if;

  if new.state = 'ended' and new.ended_at is null then
    new.ended_at := now();
    new.is_primary := false;
  elsif new.state = 'active' then
    new.ended_at := null;
  end if;

  return new;
end;
$function$;
revoke all on function private.validate_faction_membership_v1() from public,anon,authenticated;
create trigger faction_memberships_validate
before insert or update on public.faction_memberships
for each row execute function private.validate_faction_membership_v1();

CREATE OR REPLACE FUNCTION private.validate_character_faction_reputation_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_character_campaign uuid;
  v_faction_campaign uuid;
begin
  select c.campaign_id into v_character_campaign
  from public.characters c
  where c.id = new.character_id;

  select f.campaign_id into v_faction_campaign
  from public.factions f
  where f.id = new.faction_id;

  if v_character_campaign is null or v_faction_campaign is null then
    raise exception 'Faction reputation character or faction not found';
  end if;

  if new.campaign_id <> v_character_campaign
     or new.campaign_id <> v_faction_campaign then
    raise exception 'Faction reputation entities must belong to the same campaign';
  end if;

  if new.state = 'ended' and new.ended_at is null then
    new.ended_at := now();
  elsif new.state = 'active' then
    new.ended_at := null;
  end if;

  return new;
end;
$function$;
revoke all on function private.validate_character_faction_reputation_v1() from public,anon,authenticated;
create trigger character_faction_reputations_validate
before insert or update on public.character_faction_reputations
for each row execute function private.validate_character_faction_reputation_v1();

alter table public.factions enable row level security;
alter table public.faction_memberships enable row level security;
alter table public.character_faction_reputations enable row level security;

revoke all on table public.factions from anon;
revoke all on table public.faction_memberships from anon;
revoke all on table public.character_faction_reputations from anon;
grant select,insert,update,delete on table public.factions to authenticated;
grant select,insert,update,delete on table public.faction_memberships to authenticated;
grant select,insert,update,delete on table public.character_faction_reputations to authenticated;

create policy factions_manager_read on public.factions for select to authenticated
using ((select private.can_manage_campaign(campaign_id)));
create policy factions_manager_insert on public.factions for insert to authenticated
with check ((select private.can_manage_campaign(campaign_id)));
create policy factions_manager_update on public.factions for update to authenticated
using ((select private.can_manage_campaign(campaign_id)))
with check ((select private.can_manage_campaign(campaign_id)));
create policy factions_manager_delete on public.factions for delete to authenticated
using ((select private.can_manage_campaign(campaign_id)));

create policy faction_memberships_manager_read on public.faction_memberships for select to authenticated
using ((select private.can_manage_campaign(campaign_id)) and (select private.can_manage_character(character_id)));
create policy faction_memberships_manager_insert on public.faction_memberships for insert to authenticated
with check ((select private.can_manage_campaign(campaign_id)) and (select private.can_manage_character(character_id)));
create policy faction_memberships_manager_update on public.faction_memberships for update to authenticated
using ((select private.can_manage_campaign(campaign_id)) and (select private.can_manage_character(character_id)))
with check ((select private.can_manage_campaign(campaign_id)) and (select private.can_manage_character(character_id)));
create policy faction_memberships_manager_delete on public.faction_memberships for delete to authenticated
using ((select private.can_manage_campaign(campaign_id)) and (select private.can_manage_character(character_id)));

create policy character_faction_reputations_manager_read on public.character_faction_reputations for select to authenticated
using ((select private.can_manage_campaign(campaign_id)) and (select private.can_manage_character(character_id)));
create policy character_faction_reputations_manager_insert on public.character_faction_reputations for insert to authenticated
with check ((select private.can_manage_campaign(campaign_id)) and (select private.can_manage_character(character_id)));
create policy character_faction_reputations_manager_update on public.character_faction_reputations for update to authenticated
using ((select private.can_manage_campaign(campaign_id)) and (select private.can_manage_character(character_id)))
with check ((select private.can_manage_campaign(campaign_id)) and (select private.can_manage_character(character_id)));
create policy character_faction_reputations_manager_delete on public.character_faction_reputations for delete to authenticated
using ((select private.can_manage_campaign(campaign_id)) and (select private.can_manage_character(character_id)));

CREATE OR REPLACE FUNCTION public.upsert_faction_v1(p_campaign_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_input jsonb := coalesce(p_input, '{}'::jsonb);
  v_faction_id uuid;
  v_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_campaign(p_campaign_id, v_user_id) then
    raise exception 'Only GM or owner can manage factions';
  end if;

  if jsonb_typeof(v_input) <> 'object' then
    raise exception 'Faction input must be an object';
  end if;

  if nullif(v_input->>'faction_id','') is not null then
    begin
      v_faction_id := (v_input->>'faction_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid faction id';
    end;
  end if;

  v_name := nullif(btrim(coalesce(v_input->>'name','')), '');

  if v_faction_id is not null then
    if not exists (
      select 1 from public.factions f
      where f.id = v_faction_id and f.campaign_id = p_campaign_id
    ) then
      raise exception 'Faction not found';
    end if;

    update public.factions f
    set
      name = case when v_input ? 'name'
        then coalesce(nullif(left(btrim(coalesce(v_input->>'name','')),160),''), f.name)
        else f.name end,
      summary = case when v_input ? 'summary'
        then left(btrim(coalesce(v_input->>'summary','')),3000) else f.summary end,
      description = case when v_input ? 'description'
        then left(btrim(coalesce(v_input->>'description','')),16000) else f.description end,
      image_url = case when v_input ? 'image_url'
        then nullif(left(btrim(coalesce(v_input->>'image_url','')),2000),'') else f.image_url end,
      player_visible = case when v_input ? 'player_visible'
        then coalesce((v_input->>'player_visible')::boolean, f.player_visible) else f.player_visible end,
      state = case when v_input ? 'state'
        and lower(btrim(coalesce(v_input->>'state',''))) in ('active','archived')
        then lower(btrim(v_input->>'state')) else f.state end,
      tags = case when jsonb_typeof(v_input->'tags') = 'array'
        then array(select distinct left(btrim(value),80)
                   from jsonb_array_elements_text(v_input->'tags')
                   where btrim(value) <> '')
        else f.tags end,
      updated_by = v_user_id,
      updated_at = now()
    where f.id = v_faction_id;
  else
    if v_name is null then
      raise exception 'Faction name is required';
    end if;

    select f.id into v_faction_id
    from public.factions f
    where f.campaign_id = p_campaign_id
      and lower(btrim(f.name)) = lower(v_name)
    limit 1;

    if v_faction_id is null then
      insert into public.factions(
        campaign_id,name,summary,description,image_url,player_visible,state,tags,created_by,updated_by
      ) values (
        p_campaign_id,
        left(v_name,160),
        left(btrim(coalesce(v_input->>'summary','')),3000),
        left(btrim(coalesce(v_input->>'description','')),16000),
        nullif(left(btrim(coalesce(v_input->>'image_url','')),2000),''),
        coalesce((v_input->>'player_visible')::boolean,true),
        case when lower(btrim(coalesce(v_input->>'state','active'))) in ('active','archived')
          then lower(btrim(coalesce(v_input->>'state','active'))) else 'active' end,
        case when jsonb_typeof(v_input->'tags') = 'array'
          then array(select distinct left(btrim(value),80)
                     from jsonb_array_elements_text(v_input->'tags')
                     where btrim(value) <> '')
          else '{}'::text[] end,
        v_user_id,
        v_user_id
      )
      returning id into v_faction_id;
    else
      update public.factions f
      set
        summary = case when v_input ? 'summary'
          then left(btrim(coalesce(v_input->>'summary','')),3000) else f.summary end,
        description = case when v_input ? 'description'
          then left(btrim(coalesce(v_input->>'description','')),16000) else f.description end,
        image_url = case when v_input ? 'image_url'
          then nullif(left(btrim(coalesce(v_input->>'image_url','')),2000),'') else f.image_url end,
        player_visible = case when v_input ? 'player_visible'
          then coalesce((v_input->>'player_visible')::boolean,f.player_visible) else f.player_visible end,
        state = case when v_input ? 'state'
          and lower(btrim(coalesce(v_input->>'state',''))) in ('active','archived')
          then lower(btrim(v_input->>'state')) else f.state end,
        updated_by = v_user_id,
        updated_at = now()
      where f.id = v_faction_id;
    end if;
  end if;

  return (
    select jsonb_build_object(
      'id', f.id,
      'name', f.name,
      'summary', f.summary,
      'description', f.description,
      'image_url', f.image_url,
      'player_visible', f.player_visible,
      'state', f.state,
      'tags', to_jsonb(f.tags),
      'canonical_state_changed', true
    )
    from public.factions f
    where f.id = v_faction_id
  );
end;
$function$;
revoke all on function public.upsert_faction_v1(uuid,jsonb) from public,anon;
grant execute on function public.upsert_faction_v1(uuid,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.set_faction_membership_v1(p_character_id uuid, p_faction_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_input jsonb := coalesce(p_input,'{}'::jsonb);
  v_campaign_id uuid;
  v_character_type text;
  v_faction_name text;
  v_membership_id uuid;
  v_primary boolean := false;
  v_state text := 'active';
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select c.campaign_id,c.character_type into v_campaign_id,v_character_type
  from public.characters c where c.id=p_character_id;

  if v_campaign_id is null
     or not private.can_manage_character(p_character_id,v_user_id)
     or not private.can_manage_campaign(v_campaign_id,v_user_id) then
    raise exception 'Not allowed';
  end if;

  select f.name into v_faction_name
  from public.factions f
  where f.id=p_faction_id and f.campaign_id=v_campaign_id;

  if v_faction_name is null then raise exception 'Faction not found'; end if;

  if jsonb_typeof(v_input) <> 'object' then
    raise exception 'Membership input must be an object';
  end if;

  v_primary := coalesce((v_input->>'is_primary')::boolean,false);
  v_state := case when lower(btrim(coalesce(v_input->>'state','active')))='ended'
    then 'ended' else 'active' end;

  if v_primary and v_state='active' then
    update public.faction_memberships
    set is_primary=false, updated_by=v_user_id, updated_at=now()
    where campaign_id=v_campaign_id
      and character_id=p_character_id
      and faction_id<>p_faction_id
      and is_primary;
  end if;

  insert into public.faction_memberships(
    campaign_id,faction_id,character_id,membership_role,rank_label,
    is_primary,player_visible,state,started_at,ended_at,created_by,updated_by
  ) values (
    v_campaign_id,p_faction_id,p_character_id,
    coalesce(nullif(left(btrim(coalesce(v_input->>'membership_role','')),120),''),'member'),
    left(btrim(coalesce(v_input->>'rank_label','')),240),
    v_primary,
    coalesce((v_input->>'player_visible')::boolean,true),
    v_state,
    now(),
    case when v_state='ended' then now() else null end,
    v_user_id,v_user_id
  )
  on conflict (campaign_id,faction_id,character_id)
  do update set
    membership_role = case when v_input ? 'membership_role'
      then coalesce(nullif(left(btrim(coalesce(v_input->>'membership_role','')),120),''),public.faction_memberships.membership_role)
      else public.faction_memberships.membership_role end,
    rank_label = case when v_input ? 'rank_label'
      then left(btrim(coalesce(v_input->>'rank_label','')),240)
      else public.faction_memberships.rank_label end,
    is_primary = case when v_input ? 'is_primary' then v_primary else public.faction_memberships.is_primary end,
    player_visible = case when v_input ? 'player_visible'
      then coalesce((v_input->>'player_visible')::boolean,public.faction_memberships.player_visible)
      else public.faction_memberships.player_visible end,
    state = case when v_input ? 'state' then v_state else public.faction_memberships.state end,
    ended_at = case
      when v_input ? 'state' and v_state='ended' then now()
      when v_input ? 'state' and v_state='active' then null
      else public.faction_memberships.ended_at end,
    updated_by=v_user_id,
    updated_at=now()
  returning id into v_membership_id;

  if v_character_type='npc' then
    if v_state='active' and (
      v_primary
      or not exists (
        select 1 from public.faction_memberships fm
        where fm.campaign_id=v_campaign_id
          and fm.character_id=p_character_id
          and fm.state='active'
          and fm.is_primary
          and fm.faction_id<>p_faction_id
      )
    ) then
      update public.npc_profiles
      set faction=v_faction_name, updated_by=v_user_id, updated_at=now()
      where character_id=p_character_id;
    elsif v_state='ended' then
      update public.npc_profiles np
      set faction=coalesce((
        select f.name
        from public.faction_memberships fm
        join public.factions f on f.id=fm.faction_id
        where fm.character_id=p_character_id
          and fm.state='active'
        order by fm.is_primary desc,fm.updated_at desc
        limit 1
      ),''),
      updated_by=v_user_id,
      updated_at=now()
      where np.character_id=p_character_id;
    end if;
  end if;

  return (
    select jsonb_build_object(
      'id',fm.id,
      'character_id',fm.character_id,
      'faction_id',fm.faction_id,
      'faction_name',f.name,
      'membership_role',fm.membership_role,
      'rank_label',fm.rank_label,
      'is_primary',fm.is_primary,
      'player_visible',fm.player_visible,
      'state',fm.state,
      'canonical_state_changed',true
    )
    from public.faction_memberships fm
    join public.factions f on f.id=fm.faction_id
    where fm.id=v_membership_id
  );
end;
$function$;
revoke all on function public.set_faction_membership_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.set_faction_membership_v1(uuid,uuid,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.set_character_faction_reputation_v1(p_character_id uuid, p_faction_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_input jsonb := coalesce(p_input,'{}'::jsonb);
  v_campaign_id uuid;
  v_reputation_id uuid;
  v_score integer := 0;
  v_state text := 'active';
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select c.campaign_id into v_campaign_id
  from public.characters c where c.id=p_character_id;

  if v_campaign_id is null
     or not private.can_manage_character(p_character_id,v_user_id)
     or not private.can_manage_campaign(v_campaign_id,v_user_id) then
    raise exception 'Not allowed';
  end if;

  if not exists (
    select 1 from public.factions f
    where f.id=p_faction_id and f.campaign_id=v_campaign_id
  ) then
    raise exception 'Faction not found';
  end if;

  if jsonb_typeof(v_input) <> 'object' then
    raise exception 'Reputation input must be an object';
  end if;

  v_score := case when coalesce(v_input->>'reputation_score','') ~ '^-?[0-9]+$'
    then greatest(-100,least((v_input->>'reputation_score')::integer,100))
    else 0 end;
  v_state := case when lower(btrim(coalesce(v_input->>'state','active')))='ended'
    then 'ended' else 'active' end;

  insert into public.character_faction_reputations(
    campaign_id,character_id,faction_id,standing_kind,public_label,reputation_score,
    player_note,gm_note,player_visible,state,started_at,ended_at,created_by,updated_by
  ) values (
    v_campaign_id,p_character_id,p_faction_id,
    coalesce(nullif(left(btrim(coalesce(v_input->>'standing_kind','')),120),''),'neutral'),
    left(btrim(coalesce(v_input->>'public_label','')),240),
    v_score,
    left(btrim(coalesce(v_input->>'player_note','')),6000),
    left(btrim(coalesce(v_input->>'gm_note','')),12000),
    coalesce((v_input->>'player_visible')::boolean,true),
    v_state,
    now(),
    case when v_state='ended' then now() else null end,
    v_user_id,v_user_id
  )
  on conflict (campaign_id,character_id,faction_id)
  do update set
    standing_kind = case when v_input ? 'standing_kind'
      then coalesce(nullif(left(btrim(coalesce(v_input->>'standing_kind','')),120),''),public.character_faction_reputations.standing_kind)
      else public.character_faction_reputations.standing_kind end,
    public_label = case when v_input ? 'public_label'
      then left(btrim(coalesce(v_input->>'public_label','')),240)
      else public.character_faction_reputations.public_label end,
    reputation_score = case when v_input ? 'reputation_score'
      then v_score else public.character_faction_reputations.reputation_score end,
    player_note = case when v_input ? 'player_note'
      then left(btrim(coalesce(v_input->>'player_note','')),6000)
      else public.character_faction_reputations.player_note end,
    gm_note = case when v_input ? 'gm_note'
      then left(btrim(coalesce(v_input->>'gm_note','')),12000)
      else public.character_faction_reputations.gm_note end,
    player_visible = case when v_input ? 'player_visible'
      then coalesce((v_input->>'player_visible')::boolean,public.character_faction_reputations.player_visible)
      else public.character_faction_reputations.player_visible end,
    state = case when v_input ? 'state' then v_state else public.character_faction_reputations.state end,
    ended_at = case
      when v_input ? 'state' and v_state='ended' then now()
      when v_input ? 'state' and v_state='active' then null
      else public.character_faction_reputations.ended_at end,
    updated_by=v_user_id,
    updated_at=now()
  returning id into v_reputation_id;

  return (
    select jsonb_build_object(
      'id',r.id,
      'character_id',r.character_id,
      'faction_id',r.faction_id,
      'faction_name',f.name,
      'standing_kind',r.standing_kind,
      'public_label',r.public_label,
      'reputation_score',r.reputation_score,
      'player_note',r.player_note,
      'gm_note',r.gm_note,
      'player_visible',r.player_visible,
      'state',r.state,
      'updated_at',r.updated_at,
      'canonical_state_changed',true
    )
    from public.character_faction_reputations r
    join public.factions f on f.id=r.faction_id
    where r.id=v_reputation_id
  );
end;
$function$;
revoke all on function public.set_character_faction_reputation_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.set_character_faction_reputation_v1(uuid,uuid,jsonb) to authenticated;

insert into public.factions(campaign_id,name,summary,player_visible,state,created_by,updated_by)
select distinct np.campaign_id,btrim(np.faction),'',true,'active',np.created_by,np.updated_by
from public.npc_profiles np
where btrim(np.faction)<>''
on conflict do nothing;

insert into public.faction_memberships(
  campaign_id,faction_id,character_id,membership_role,rank_label,is_primary,
  player_visible,state,started_at,created_by,updated_by
)
select np.campaign_id,f.id,np.character_id,'member',btrim(np.occupation),
       true,true,'active',coalesce(np.created_at,now()),np.created_by,np.updated_by
from public.npc_profiles np
join public.factions f
  on f.campaign_id=np.campaign_id
 and lower(btrim(f.name))=lower(btrim(np.faction))
where btrim(np.faction)<>''
on conflict do nothing;

CREATE OR REPLACE FUNCTION public.read_character_biography_v1(p_character_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_character record;
  v_history jsonb := '{}'::jsonb;
  v_relationships jsonb := '[]'::jsonb;
  v_assets jsonb := '[]'::jsonb;
  v_faction_reputations jsonb := '[]'::jsonb;
  v_faction_memberships jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  if not private.can_read_character_knowledge(p_character_id,v_user_id) then
    raise exception 'Not allowed';
  end if;

  select c.id,c.campaign_id,c.name,c.bio,c.avatar_url,c.character_class,
         c.level,c.character_type,c.life_state
  into v_character
  from public.characters c
  where c.id=p_character_id;

  if v_character.id is null then raise exception 'Character not found'; end if;

  select jsonb_build_object(
    'bio',coalesce(v_character.bio,''),
    'background',coalesce(cs.background,''),
    'alignment',coalesce(cs.alignment,''),
    'personality_traits',coalesce(cs.personality_traits,''),
    'ideals',coalesce(cs.ideals,''),
    'bonds',coalesce(cs.bonds,''),
    'flaws',coalesce(cs.flaws,''),
    'backstory',coalesce(cs.backstory,''),
    'notes',coalesce(cs.notes,'')
  )
  into v_history
  from public.character_sheets cs
  where cs.character_id=p_character_id;

  if v_history is null then
    v_history := jsonb_build_object(
      'bio',coalesce(v_character.bio,''),'background','','alignment','',
      'personality_traits','','ideals','','bonds','','flaws','','backstory','','notes',''
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'direction',case when r.subject_character_id=p_character_id then 'from_character' else 'toward_character' end,
    'counterpart_character_id',case when r.subject_character_id=p_character_id then r.target_character_id else r.subject_character_id end,
    'counterpart_name',counterpart.name,
    'counterpart_avatar_url',counterpart.avatar_url,
    'counterpart_character_type',counterpart.character_type,
    'counterpart_life_state',counterpart.life_state,
    'relationship_kind',r.relationship_kind,
    'public_label',r.public_label,
    'attitude_score',r.attitude_score,
    'player_note',r.player_note,
    'state',r.state,
    'started_at',r.started_at,
    'ended_at',r.ended_at,
    'updated_at',r.updated_at
  ) order by case when r.state='active' then 0 else 1 end,r.updated_at desc),'[]'::jsonb)
  into v_relationships
  from public.character_relationships r
  join public.characters counterpart on counterpart.id=
    case when r.subject_character_id=p_character_id then r.target_character_id else r.subject_character_id end
  where (r.subject_character_id=p_character_id or r.target_character_id=p_character_id)
    and r.player_visible
    and private.can_view_character(counterpart.id,v_user_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'asset_kind',a.asset_kind,'ownership_kind',a.ownership_kind,
    'display_name',a.display_name,'description',a.description,'state',a.state,
    'location_id',a.location_id,'location_name',l.name,
    'npc_character_id',a.npc_character_id,'npc_name',npc.name,
    'inventory_item_id',a.inventory_item_id,'inventory_item_name',item.name,
    'world_storage_id',a.world_storage_id,'world_storage_name',storage.name,
    'acquired_at',a.acquired_at,'ended_at',a.ended_at,'updated_at',a.updated_at
  ) order by case when a.state='active' then 0 else 1 end,a.updated_at desc),'[]'::jsonb)
  into v_assets
  from public.character_assets a
  left join public.locations l on l.id=a.location_id
  left join public.characters npc on npc.id=a.npc_character_id
  left join public.character_inventory_items item on item.id=a.inventory_item_id
  left join public.world_storages storage on storage.id=a.world_storage_id
  where a.owner_character_id=p_character_id
    and a.player_visible
    and (a.location_id is null or private.can_view_location(a.location_id,v_user_id))
    and (a.npc_character_id is null or private.can_view_character(a.npc_character_id,v_user_id))
    and (a.world_storage_id is null or private.can_view_world_storage_v1(a.world_storage_id,v_user_id))
    and (
      a.inventory_item_id is null
      or item.character_id=p_character_id
      or (item.world_storage_id is not null and private.can_view_world_storage_v1(item.world_storage_id,v_user_id))
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'faction_id',f.id,'faction_name',f.name,'faction_summary',f.summary,
    'standing_kind',r.standing_kind,'public_label',r.public_label,
    'reputation_score',r.reputation_score,'player_note',r.player_note,
    'state',r.state,'updated_at',r.updated_at
  ) order by r.reputation_score desc,lower(f.name)),'[]'::jsonb)
  into v_faction_reputations
  from public.character_faction_reputations r
  join public.factions f on f.id=r.faction_id
  where r.character_id=p_character_id
    and r.player_visible
    and r.state='active'
    and f.player_visible
    and f.state='active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'faction_id',f.id,'faction_name',f.name,'faction_summary',f.summary,
    'membership_role',m.membership_role,'rank_label',m.rank_label,
    'is_primary',m.is_primary,'state',m.state,'updated_at',m.updated_at
  ) order by m.is_primary desc,lower(f.name)),'[]'::jsonb)
  into v_faction_memberships
  from public.faction_memberships m
  join public.factions f on f.id=m.faction_id
  where m.character_id=p_character_id
    and m.player_visible
    and m.state='active'
    and f.player_visible
    and f.state='active';

  return jsonb_build_object(
    'character',jsonb_build_object(
      'id',v_character.id,'name',v_character.name,'avatar_url',v_character.avatar_url,
      'character_class',v_character.character_class,'level',v_character.level,
      'character_type',v_character.character_type,'life_state',v_character.life_state
    ),
    'history',v_history,
    'relationships',v_relationships,
    'assets',v_assets,
    'faction_reputations',v_faction_reputations,
    'faction_memberships',v_faction_memberships
  );
end;
$function$;
revoke all on function public.read_character_biography_v1(uuid) from public,anon;
grant execute on function public.read_character_biography_v1(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.read_character_biography_manager_v1(p_character_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_character record;
  v_sheet jsonb := '{}'::jsonb;
  v_relationships jsonb := '[]'::jsonb;
  v_assets jsonb := '[]'::jsonb;
  v_faction_reputations jsonb := '[]'::jsonb;
  v_faction_memberships jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,v_user_id) then raise exception 'Not allowed'; end if;

  select c.id,c.campaign_id,c.name,c.bio,c.avatar_url,c.character_class,
         c.level,c.character_type,c.life_state,c.visibility_mode,c.publication_state
  into v_character
  from public.characters c
  where c.id=p_character_id;

  if v_character.id is null then raise exception 'Character not found'; end if;

  select coalesce(jsonb_build_object(
    'race',cs.race,'background',cs.background,'alignment',cs.alignment,
    'personality_traits',cs.personality_traits,'ideals',cs.ideals,
    'bonds',cs.bonds,'flaws',cs.flaws,'backstory',cs.backstory,'notes',cs.notes
  ),'{}'::jsonb)
  into v_sheet
  from public.character_sheets cs
  where cs.character_id=p_character_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'subject_character_id',r.subject_character_id,'target_character_id',r.target_character_id,
    'direction',case when r.subject_character_id=p_character_id then 'from_character' else 'toward_character' end,
    'counterpart_character_id',case when r.subject_character_id=p_character_id then r.target_character_id else r.subject_character_id end,
    'counterpart_name',counterpart.name,'counterpart_avatar_url',counterpart.avatar_url,
    'counterpart_character_type',counterpart.character_type,'counterpart_life_state',counterpart.life_state,
    'relationship_kind',r.relationship_kind,'public_label',r.public_label,
    'attitude_score',r.attitude_score,'player_note',r.player_note,'gm_note',r.gm_note,
    'player_visible',r.player_visible,'state',r.state,'started_at',r.started_at,
    'ended_at',r.ended_at,'created_by',r.created_by,'updated_by',r.updated_by,
    'created_at',r.created_at,'updated_at',r.updated_at
  ) order by case when r.state='active' then 0 else 1 end,r.updated_at desc),'[]'::jsonb)
  into v_relationships
  from public.character_relationships r
  join public.characters counterpart on counterpart.id=
    case when r.subject_character_id=p_character_id then r.target_character_id else r.subject_character_id end
  where (r.subject_character_id=p_character_id or r.target_character_id=p_character_id)
    and private.can_view_character(counterpart.id,v_user_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'asset_kind',a.asset_kind,'ownership_kind',a.ownership_kind,
    'display_name',a.display_name,'description',a.description,'state',a.state,
    'location_id',a.location_id,'location_name',l.name,
    'npc_character_id',a.npc_character_id,'npc_name',npc.name,
    'inventory_item_id',a.inventory_item_id,'inventory_item_name',item.name,
    'world_storage_id',a.world_storage_id,'world_storage_name',storage.name,
    'custom_data',a.custom_data,'player_visible',a.player_visible,
    'acquired_at',a.acquired_at,'ended_at',a.ended_at,
    'created_by',a.created_by,'updated_by',a.updated_by,
    'created_at',a.created_at,'updated_at',a.updated_at
  ) order by case when a.state='active' then 0 else 1 end,a.updated_at desc),'[]'::jsonb)
  into v_assets
  from public.character_assets a
  left join public.locations l on l.id=a.location_id
  left join public.characters npc on npc.id=a.npc_character_id
  left join public.character_inventory_items item on item.id=a.inventory_item_id
  left join public.world_storages storage on storage.id=a.world_storage_id
  where a.owner_character_id=p_character_id
    and (a.location_id is null or private.can_view_location(a.location_id,v_user_id))
    and (a.npc_character_id is null or private.can_view_character(a.npc_character_id,v_user_id))
    and (a.world_storage_id is null or private.can_view_world_storage_v1(a.world_storage_id,v_user_id));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'faction_id',f.id,'faction_name',f.name,'faction_summary',f.summary,
    'standing_kind',r.standing_kind,'public_label',r.public_label,
    'reputation_score',r.reputation_score,'player_note',r.player_note,'gm_note',r.gm_note,
    'player_visible',r.player_visible,'state',r.state,'started_at',r.started_at,
    'ended_at',r.ended_at,'created_by',r.created_by,'updated_by',r.updated_by,
    'created_at',r.created_at,'updated_at',r.updated_at
  ) order by case when r.state='active' then 0 else 1 end,r.reputation_score desc,lower(f.name)),'[]'::jsonb)
  into v_faction_reputations
  from public.character_faction_reputations r
  join public.factions f on f.id=r.faction_id
  where r.character_id=p_character_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'faction_id',f.id,'faction_name',f.name,'faction_summary',f.summary,
    'membership_role',m.membership_role,'rank_label',m.rank_label,'is_primary',m.is_primary,
    'player_visible',m.player_visible,'state',m.state,'started_at',m.started_at,'ended_at',m.ended_at,
    'created_by',m.created_by,'updated_by',m.updated_by,'created_at',m.created_at,'updated_at',m.updated_at
  ) order by case when m.state='active' then 0 else 1 end,m.is_primary desc,lower(f.name)),'[]'::jsonb)
  into v_faction_memberships
  from public.faction_memberships m
  join public.factions f on f.id=m.faction_id
  where m.character_id=p_character_id;

  return jsonb_build_object(
    'character',jsonb_build_object(
      'id',v_character.id,'campaign_id',v_character.campaign_id,'name',v_character.name,
      'avatar_url',v_character.avatar_url,'character_class',v_character.character_class,
      'level',v_character.level,'character_type',v_character.character_type,
      'life_state',v_character.life_state,'visibility_mode',v_character.visibility_mode,
      'publication_state',v_character.publication_state,'bio',coalesce(v_character.bio,'')
    ),
    'sheet',coalesce(v_sheet,'{}'::jsonb),
    'relationships',v_relationships,
    'assets',v_assets,
    'faction_reputations',v_faction_reputations,
    'faction_memberships',v_faction_memberships
  );
end;
$function$;
revoke all on function public.read_character_biography_manager_v1(uuid) from public,anon;
grant execute on function public.read_character_biography_manager_v1(uuid) to authenticated;

alter publication supabase_realtime add table public.factions;
alter publication supabase_realtime add table public.faction_memberships;
alter publication supabase_realtime add table public.character_faction_reputations;
alter publication supabase_realtime add table public.character_assets;
