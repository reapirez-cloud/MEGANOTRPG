-- AI World Evolution Stage 22: versioned per-player director preferences.
-- Preferences steer future opportunities only. They never override canon, dice or NPC agency.

create table if not exists public.ai_player_director_preferences (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  combat smallint not null default 3 check (combat between 0 and 5),
  exploration smallint not null default 3 check (exploration between 0 and 5),
  investigation smallint not null default 3 check (investigation between 0 and 5),
  social_play smallint not null default 3 check (social_play between 0 and 5),
  romance smallint not null default 3 check (romance between 0 and 5),
  daily_life smallint not null default 3 check (daily_life between 0 and 5),
  horror smallint not null default 3 check (horror between 0 and 5),
  politics_intrigue smallint not null default 3 check (politics_intrigue between 0 and 5),
  economy_property smallint not null default 3 check (economy_property between 0 and 5),
  pacing smallint not null default 3 check (pacing between 0 and 5),
  free_text text not null default '' check (char_length(free_text) <= 1200),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.ai_player_director_preference_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version >= 1),
  combat smallint not null check (combat between 0 and 5),
  exploration smallint not null check (exploration between 0 and 5),
  investigation smallint not null check (investigation between 0 and 5),
  social_play smallint not null check (social_play between 0 and 5),
  romance smallint not null check (romance between 0 and 5),
  daily_life smallint not null check (daily_life between 0 and 5),
  horror smallint not null check (horror between 0 and 5),
  politics_intrigue smallint not null check (politics_intrigue between 0 and 5),
  economy_property smallint not null check (economy_property between 0 and 5),
  pacing smallint not null check (pacing between 0 and 5),
  free_text text not null default '' check (char_length(free_text) <= 1200),
  created_at timestamptz not null default now(),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance)='object'),
  unique (campaign_id, user_id, version)
);

alter table public.ai_player_director_preferences enable row level security;
alter table public.ai_player_director_preference_versions enable row level security;

create index if not exists ai_player_director_preference_versions_lookup_idx
  on public.ai_player_director_preference_versions(campaign_id,user_id,version desc);

revoke all on table public.ai_player_director_preferences from anon, authenticated;
grant select, insert, update on table public.ai_player_director_preferences to authenticated;

revoke all on table public.ai_player_director_preference_versions from anon, authenticated;
grant select on table public.ai_player_director_preference_versions to authenticated;

drop policy if exists ai_player_director_preferences_read_own
  on public.ai_player_director_preferences;
create policy ai_player_director_preferences_read_own
on public.ai_player_director_preferences
for select to authenticated
using (
  user_id=(select auth.uid())
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean),false) is false
  and (select private.is_ai_world_campaign_v1(campaign_id))
  and (select private.is_campaign_member(campaign_id,(select auth.uid())))
);

drop policy if exists ai_player_director_preferences_insert_own
  on public.ai_player_director_preferences;
create policy ai_player_director_preferences_insert_own
on public.ai_player_director_preferences
for insert to authenticated
with check (
  user_id=(select auth.uid())
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean),false) is false
  and (select private.is_ai_world_campaign_v1(campaign_id))
  and (select private.is_campaign_member(campaign_id,(select auth.uid())))
);

drop policy if exists ai_player_director_preferences_update_own
  on public.ai_player_director_preferences;
create policy ai_player_director_preferences_update_own
on public.ai_player_director_preferences
for update to authenticated
using (
  user_id=(select auth.uid())
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean),false) is false
  and (select private.is_ai_world_campaign_v1(campaign_id))
  and (select private.is_campaign_member(campaign_id,(select auth.uid())))
)
with check (
  user_id=(select auth.uid())
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean),false) is false
  and (select private.is_ai_world_campaign_v1(campaign_id))
  and (select private.is_campaign_member(campaign_id,(select auth.uid())))
);

drop policy if exists ai_player_director_preference_versions_read_own
  on public.ai_player_director_preference_versions;
create policy ai_player_director_preference_versions_read_own
on public.ai_player_director_preference_versions
for select to authenticated
using (
  user_id=(select auth.uid())
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean),false) is false
  and (select private.is_ai_world_campaign_v1(campaign_id))
  and (select private.is_campaign_member(campaign_id,(select auth.uid())))
);

create or replace function private.version_ai_player_director_preference_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' then
    new.user_id := (select auth.uid());
    new.version := 1;
    new.updated_at := now();
    return new;
  end if;

  new.campaign_id := old.campaign_id;
  new.user_id := old.user_id;
  new.updated_at := now();

  if row(
    new.combat,new.exploration,new.investigation,new.social_play,new.romance,
    new.daily_life,new.horror,new.politics_intrigue,new.economy_property,
    new.pacing,new.free_text
  ) is distinct from row(
    old.combat,old.exploration,old.investigation,old.social_play,old.romance,
    old.daily_life,old.horror,old.politics_intrigue,old.economy_property,
    old.pacing,old.free_text
  ) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;

  return new;
end;
$$;

create or replace function private.capture_ai_player_director_preference_version_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='UPDATE' and new.version=old.version then
    return new;
  end if;

  insert into public.ai_player_director_preference_versions(
    campaign_id,user_id,version,
    combat,exploration,investigation,social_play,romance,daily_life,horror,
    politics_intrigue,economy_property,pacing,free_text,created_at,provenance
  ) values (
    new.campaign_id,new.user_id,new.version,
    new.combat,new.exploration,new.investigation,new.social_play,new.romance,
    new.daily_life,new.horror,new.politics_intrigue,new.economy_property,
    new.pacing,new.free_text,now(),
    jsonb_build_object(
      'source','current-row-trigger',
      'actor_user_id',(select auth.uid())
    )
  )
  on conflict(campaign_id,user_id,version) do nothing;

  return new;
end;
$$;

drop trigger if exists version_ai_player_director_preference_v1
  on public.ai_player_director_preferences;
create trigger version_ai_player_director_preference_v1
before insert or update
on public.ai_player_director_preferences
for each row
execute function private.version_ai_player_director_preference_v1();

drop trigger if exists capture_ai_player_director_preference_version_v1
  on public.ai_player_director_preferences;
create trigger capture_ai_player_director_preference_version_v1
after insert or update
on public.ai_player_director_preferences
for each row
execute function private.capture_ai_player_director_preference_version_v1();

revoke all on function private.version_ai_player_director_preference_v1()
  from public,anon,authenticated;
revoke all on function private.capture_ai_player_director_preference_version_v1()
  from public,anon,authenticated;

create or replace function public.read_my_ai_director_preferences_v1(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_pref public.ai_player_director_preferences%rowtype;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_director_preferences_ai_world_only';
  end if;
  if not private.is_campaign_member(p_campaign_id,v_user_id) then
    raise exception 'campaign_membership_required';
  end if;

  select * into v_pref
  from public.ai_player_director_preferences p
  where p.campaign_id=p_campaign_id and p.user_id=v_user_id;

  return jsonb_build_object(
    'ai_world',true,
    'configured',v_pref.campaign_id is not null,
    'version',coalesce(v_pref.version,0),
    'interests',jsonb_build_object(
      'combat',coalesce(v_pref.combat,3),
      'exploration',coalesce(v_pref.exploration,3),
      'investigation',coalesce(v_pref.investigation,3),
      'social_play',coalesce(v_pref.social_play,3),
      'romance',coalesce(v_pref.romance,3),
      'daily_life',coalesce(v_pref.daily_life,3),
      'horror',coalesce(v_pref.horror,3),
      'politics_intrigue',coalesce(v_pref.politics_intrigue,3),
      'economy_property',coalesce(v_pref.economy_property,3),
      'pacing',coalesce(v_pref.pacing,3)
    ),
    'free_text',coalesce(v_pref.free_text,''),
    'updated_at',v_pref.updated_at,
    'contract',jsonb_build_object(
      'meaning','future_opportunity_preferences_only',
      'never_overrides_canon',true,
      'never_overrides_dice',true,
      'never_overrides_npc_agency',true
    )
  );
end;
$$;

create or replace function public.set_my_ai_director_preferences_v1(
  p_campaign_id uuid,
  p_combat smallint,
  p_exploration smallint,
  p_investigation smallint,
  p_social_play smallint,
  p_romance smallint,
  p_daily_life smallint,
  p_horror smallint,
  p_politics_intrigue smallint,
  p_economy_property smallint,
  p_pacing smallint,
  p_free_text text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_free_text text := btrim(coalesce(p_free_text,''));
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_director_preferences_ai_world_only';
  end if;
  if not private.is_campaign_member(p_campaign_id,v_user_id) then
    raise exception 'campaign_membership_required';
  end if;

  if p_combat not between 0 and 5
     or p_exploration not between 0 and 5
     or p_investigation not between 0 and 5
     or p_social_play not between 0 and 5
     or p_romance not between 0 and 5
     or p_daily_life not between 0 and 5
     or p_horror not between 0 and 5
     or p_politics_intrigue not between 0 and 5
     or p_economy_property not between 0 and 5
     or p_pacing not between 0 and 5
  then raise exception 'ai_director_preference_dimension_out_of_range';
  end if;

  if char_length(v_free_text)>1200 then
    raise exception 'ai_director_preference_text_too_long';
  end if;

  insert into public.ai_player_director_preferences(
    campaign_id,user_id,
    combat,exploration,investigation,social_play,romance,daily_life,horror,
    politics_intrigue,economy_property,pacing,free_text
  ) values (
    p_campaign_id,v_user_id,
    p_combat,p_exploration,p_investigation,p_social_play,p_romance,p_daily_life,p_horror,
    p_politics_intrigue,p_economy_property,p_pacing,v_free_text
  )
  on conflict(campaign_id,user_id) do update set
    combat=excluded.combat,
    exploration=excluded.exploration,
    investigation=excluded.investigation,
    social_play=excluded.social_play,
    romance=excluded.romance,
    daily_life=excluded.daily_life,
    horror=excluded.horror,
    politics_intrigue=excluded.politics_intrigue,
    economy_property=excluded.economy_property,
    pacing=excluded.pacing,
    free_text=excluded.free_text;

  return public.read_my_ai_director_preferences_v1(p_campaign_id);
end;
$$;

revoke all on function public.read_my_ai_director_preferences_v1(uuid)
  from public,anon;
grant execute on function public.read_my_ai_director_preferences_v1(uuid)
  to authenticated,service_role;

revoke all on function public.set_my_ai_director_preferences_v1(
  uuid,smallint,smallint,smallint,smallint,smallint,smallint,smallint,smallint,smallint,smallint,text
) from public,anon;
grant execute on function public.set_my_ai_director_preferences_v1(
  uuid,smallint,smallint,smallint,smallint,smallint,smallint,smallint,smallint,smallint,smallint,text
) to authenticated,service_role;

create or replace function public.read_ai_gm_director_preferences_v1(
  p_campaign_id uuid,
  p_participant_user_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_ids uuid[];
  v_count integer;
  v_configured integer;
  v_participants jsonb;
  v_dimensions jsonb;
  v_version_vector jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_director_preferences_ai_world_only';
  end if;

  select coalesce(array_agg(x.user_id order by x.user_id),'{}'::uuid[])
  into v_ids
  from (
    select distinct u as user_id
    from unnest(coalesce(p_participant_user_ids,'{}'::uuid[])) u
    where u is not null
    order by u
    limit 16
  ) x;

  v_count := cardinality(v_ids);

  select
    count(*)::integer,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id',p.user_id,
        'version',p.version,
        'interests',jsonb_build_object(
          'combat',p.combat,
          'exploration',p.exploration,
          'investigation',p.investigation,
          'social_play',p.social_play,
          'romance',p.romance,
          'daily_life',p.daily_life,
          'horror',p.horror,
          'politics_intrigue',p.politics_intrigue,
          'economy_property',p.economy_property,
          'pacing',p.pacing
        ),
        'free_text',left(p.free_text,600)
      )
      order by p.user_id
    ),'[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_build_object('user_id',p.user_id,'version',p.version)
      order by p.user_id
    ),'[]'::jsonb)
  into v_configured,v_participants,v_version_vector
  from public.ai_player_director_preferences p
  where p.campaign_id=p_campaign_id
    and p.user_id=any(v_ids);

  if v_configured=0 then
    v_dimensions := '{}'::jsonb;
  else
    select jsonb_build_object(
      'combat',jsonb_build_object('mean',round(avg(combat)::numeric,2),'min',min(combat),'max',max(combat),'spread',max(combat)-min(combat)),
      'exploration',jsonb_build_object('mean',round(avg(exploration)::numeric,2),'min',min(exploration),'max',max(exploration),'spread',max(exploration)-min(exploration)),
      'investigation',jsonb_build_object('mean',round(avg(investigation)::numeric,2),'min',min(investigation),'max',max(investigation),'spread',max(investigation)-min(investigation)),
      'social_play',jsonb_build_object('mean',round(avg(social_play)::numeric,2),'min',min(social_play),'max',max(social_play),'spread',max(social_play)-min(social_play)),
      'romance',jsonb_build_object('mean',round(avg(romance)::numeric,2),'min',min(romance),'max',max(romance),'spread',max(romance)-min(romance)),
      'daily_life',jsonb_build_object('mean',round(avg(daily_life)::numeric,2),'min',min(daily_life),'max',max(daily_life),'spread',max(daily_life)-min(daily_life)),
      'horror',jsonb_build_object('mean',round(avg(horror)::numeric,2),'min',min(horror),'max',max(horror),'spread',max(horror)-min(horror)),
      'politics_intrigue',jsonb_build_object('mean',round(avg(politics_intrigue)::numeric,2),'min',min(politics_intrigue),'max',max(politics_intrigue),'spread',max(politics_intrigue)-min(politics_intrigue)),
      'economy_property',jsonb_build_object('mean',round(avg(economy_property)::numeric,2),'min',min(economy_property),'max',max(economy_property),'spread',max(economy_property)-min(economy_property)),
      'pacing',jsonb_build_object('mean',round(avg(pacing)::numeric,2),'min',min(pacing),'max',max(pacing),'spread',max(pacing)-min(pacing))
    )
    into v_dimensions
    from public.ai_player_director_preferences p
    where p.campaign_id=p_campaign_id
      and p.user_id=any(v_ids);
  end if;

  return jsonb_build_object(
    'enabled',true,
    'scope','physically_present_player_users',
    'participant_count',v_count,
    'configured_count',v_configured,
    'aggregation_rule','equal_weight_mean_of_configured_participants',
    'conflict_rule','preserve_range_and_alternate_plausible_future_opportunities',
    'dimensions',v_dimensions,
    'participants',v_participants,
    'version_vector',v_version_vector,
    'contract',jsonb_build_object(
      'future_opportunities_only',true,
      'existing_canon_immutable',true,
      'resolved_rolls_immutable',true,
      'npc_identity_and_consent_immutable',true,
      'already_triggered_encounters_immutable',true
    )
  );
end;
$$;

revoke all on function public.read_ai_gm_director_preferences_v1(uuid,uuid[])
  from public,anon,authenticated;
grant execute on function public.read_ai_gm_director_preferences_v1(uuid,uuid[])
  to service_role;

comment on table public.ai_player_director_preferences is
  'Stage 22 current per-player AI-world director preferences. Values are opportunity-selection wishes, never canon.';
comment on table public.ai_player_director_preference_versions is
  'Stage 22 immutable semantic versions captured from the current director preference row.';
comment on function public.read_ai_gm_director_preferences_v1(uuid,uuid[]) is
  'Stage 22 bounded service projection for physically participating player users. Equal-weight merge preserves min/max conflict and never grants canonical authority.';
