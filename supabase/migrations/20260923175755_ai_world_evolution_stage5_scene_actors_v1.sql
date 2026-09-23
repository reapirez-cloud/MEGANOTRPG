-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 5: ephemeral bestiary-backed scene actors.
-- Anonymous encounter actors are runtime rows, never temporary characters.

create table public.ai_scene_actors (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  source_bestiary_slug text not null check (length(btrim(source_bestiary_slug)) between 1 and 180),
  source_digest text not null check (source_digest ~ '^[0-9a-f]{64}$'),
  compiler_version integer not null check (compiler_version >= 1),
  display_label text not null check (length(btrim(display_label)) between 1 and 160),
  runtime_ordinal integer not null check (runtime_ordinal >= 1),
  spawn_key text not null check (length(btrim(spawn_key)) between 1 and 240),
  spawn_fingerprint text not null check (spawn_fingerprint ~ '^[0-9a-f]{64}$'),
  sheet_snapshot jsonb not null check (jsonb_typeof(sheet_snapshot) = 'object'),
  mechanics_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(mechanics_snapshot) = 'array'),
  current_hp integer not null check (current_hp >= 0),
  max_hp integer not null check (max_hp >= 1),
  life_state text not null default 'alive' check (life_state in ('alive','dead','fled')),
  conditions jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  effects jsonb not null default '[]'::jsonb check (jsonb_typeof(effects) = 'array'),
  runtime_state text not null default 'active' check (runtime_state in ('active','archived')),
  campaign_day integer not null check (campaign_day >= 1),
  day_period text not null check (day_period in ('dawn','morning','day','late_day','evening','night','deep_night')),
  revision bigint not null default 0 check (revision >= 0),
  archive_reason text,
  spawned_at timestamptz not null default now(),
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, campaign_id),
  unique (campaign_id, room_id, spawn_key, runtime_ordinal),
  check (current_hp <= max_hp),
  check ((runtime_state='active' and archived_at is null) or runtime_state='archived')
);

comment on table public.ai_scene_actors is
  'AI-world ephemeral encounter actors. Each row is one mechanically independent bestiary-backed instance and is not a character identity.';

create table public.ai_scene_actor_resources (
  actor_id uuid not null,
  campaign_id uuid not null,
  state_key text not null check (state_key ~ '^[a-z][a-z0-9_:-]{0,159}$'),
  current integer not null check (current >= 0),
  max_snapshot integer not null check (max_snapshot >= 1),
  label text not null default '' check (length(label) <= 160),
  recharge jsonb not null default '{}'::jsonb check (jsonb_typeof(recharge) = 'object'),
  usage jsonb not null default '{}'::jsonb check (jsonb_typeof(usage) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (actor_id, state_key),
  foreign key (actor_id, campaign_id)
    references public.ai_scene_actors(id, campaign_id)
    on delete cascade,
  check (current <= max_snapshot)
);

comment on table public.ai_scene_actor_resources is
  'Per-instance mutable resources for ephemeral scene actors. Sibling actors never share a resource row.';

create index ai_scene_actors_campaign_room_active_idx
  on public.ai_scene_actors(campaign_id, room_id, runtime_state, spawned_at, runtime_ordinal);
create index ai_scene_actors_room_fk_idx on public.ai_scene_actors(room_id);
create index ai_scene_actors_location_fk_idx on public.ai_scene_actors(location_id) where location_id is not null;
create index ai_scene_actors_source_idx on public.ai_scene_actors(source_bestiary_slug);
create index ai_scene_actor_resources_actor_campaign_fk_idx
  on public.ai_scene_actor_resources(actor_id, campaign_id);

alter table public.ai_scene_actors enable row level security;
alter table public.ai_scene_actor_resources enable row level security;

revoke all on table public.ai_scene_actors from public, anon, authenticated, service_role;
revoke all on table public.ai_scene_actor_resources from public, anon, authenticated, service_role;
grant select on table public.ai_scene_actors to service_role;
grant select on table public.ai_scene_actor_resources to service_role;

create or replace function private.guard_ai_scene_actor_ai_world_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_ai_world_campaign_v1(new.campaign_id) then
    raise exception using errcode='42501', message='ai_scene_actor_ai_world_only';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_ai_scene_actor_ai_world_v1()
  from public, anon, authenticated;

create trigger ai_scene_actors_ai_world_guard
before insert or update on public.ai_scene_actors
for each row execute function private.guard_ai_scene_actor_ai_world_v1();

create trigger ai_scene_actor_resources_ai_world_guard
before insert or update on public.ai_scene_actor_resources
for each row execute function private.guard_ai_scene_actor_ai_world_v1();

create or replace function private.ai_scene_actor_json_v1(p_actor public.ai_scene_actors)
returns jsonb language sql stable security definer set search_path=''
as $$
  select (
    to_jsonb(p_actor)
    || jsonb_build_object(
      'resources',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'state_key',r.state_key,
          'current',r.current,
          'max',r.max_snapshot,
          'label',r.label,
          'recharge',r.recharge,
          'usage',r.usage
        ) order by r.state_key)
        from public.ai_scene_actor_resources r
        where r.actor_id=p_actor.id
      ),'[]'::jsonb)
    )
  ) - 'spawn_fingerprint';
$$;

revoke all on function private.ai_scene_actor_json_v1(public.ai_scene_actors)
  from public, anon, authenticated;

create or replace function public.spawn_ai_scene_actors_v1(
  p_campaign_id uuid,
  p_room_id uuid,
  p_spawn_key text,
  p_bestiary_slug text,
  p_display_label text,
  p_count integer default 1
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_room public.chat_rooms%rowtype;
  v_location_campaign_id uuid;
  v_compiled jsonb;
  v_sheet jsonb;
  v_resources jsonb;
  v_slug text := lower(btrim(coalesce(p_bestiary_slug,'')));
  v_label text := btrim(coalesce(p_display_label,''));
  v_spawn_key text := btrim(coalesce(p_spawn_key,''));
  v_fingerprint text;
  v_semantics jsonb;
  v_existing_count integer;
  v_existing_fingerprint text;
  v_actor public.ai_scene_actors%rowtype;
  v_resource jsonb;
  v_ordinal integer;
  v_result jsonb := '[]'::jsonb;
  v_max_hp integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_campaign_id is null or p_room_id is null then
    raise exception using errcode='22023', message='ai_scene_actor_scope_required';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501', message='ai_scene_actor_ai_world_only';
  end if;
  if length(v_spawn_key) < 1 or length(v_spawn_key) > 240
     or length(v_slug) < 1 or length(v_slug) > 180
     or length(v_label) < 1 or length(v_label) > 160
     or p_count is null or p_count < 1 or p_count > 20 then
    raise exception using errcode='22023', message='ai_scene_actor_spawn_input_invalid';
  end if;
  if v_label ~ '(?:[[:space:]#№]|^)[0-9]+$' then
    raise exception using errcode='22023', message='ai_scene_actor_label_must_not_embed_ordinal';
  end if;

  select * into v_room
  from public.chat_rooms
  where id=p_room_id and campaign_id=p_campaign_id
  for share;

  if v_room.id is null
     or v_room.category <> 'game'
     or v_room.scene_state <> 'active'
     or v_room.room_state = 'closed' then
    raise exception using errcode='22023', message='ai_scene_actor_room_not_active';
  end if;

  if v_room.location_id is not null then
    select l.campaign_id into v_location_campaign_id
    from public.locations l
    where l.id=v_room.location_id and l.lifecycle_state='active';
    if v_location_campaign_id is distinct from p_campaign_id then
      raise exception using errcode='22023', message='ai_scene_actor_room_location_invalid';
    end if;
  end if;

  v_compiled := private.compile_bestiary_runtime_v1(v_slug);
  v_sheet := coalesce(v_compiled->'sheet','{}'::jsonb);
  v_resources := coalesce(v_compiled->'resources','[]'::jsonb);
  v_max_hp := coalesce((v_sheet->>'max_hp')::integer,0);
  if v_max_hp < 1 then
    raise exception using errcode='22023', message='ai_scene_actor_compiled_hp_invalid';
  end if;

  v_semantics := jsonb_build_object(
    'campaign_id',p_campaign_id,'room_id',p_room_id,'location_id',v_room.location_id,
    'campaign_day',v_room.campaign_day,'day_period',v_room.day_period,
    'bestiary_slug',v_compiled->>'source_bestiary_slug',
    'source_digest',v_compiled->>'source_digest',
    'compiler_version',v_compiled->'compiler_version',
    'display_label',v_label,'count',p_count
  );
  v_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_semantics::text,'UTF8'),'sha256'),'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_campaign_id::text || ':scene-actor:' || p_room_id::text || ':' || v_spawn_key,0
    )
  );

  select count(*),min(spawn_fingerprint)
    into v_existing_count,v_existing_fingerprint
  from public.ai_scene_actors
  where campaign_id=p_campaign_id and room_id=p_room_id and spawn_key=v_spawn_key;

  if v_existing_count > 0 then
    if v_existing_count <> p_count
       or v_existing_fingerprint is distinct from v_fingerprint
       or exists (
         select 1 from public.ai_scene_actors
         where campaign_id=p_campaign_id and room_id=p_room_id and spawn_key=v_spawn_key
           and spawn_fingerprint<>v_fingerprint
       ) then
      raise exception using errcode='22023', message='ai_scene_actor_spawn_key_conflict';
    end if;

    select coalesce(
      jsonb_agg(private.ai_scene_actor_json_v1(a) order by a.runtime_ordinal),
      '[]'::jsonb
    )
    into v_result
    from public.ai_scene_actors a
    where a.campaign_id=p_campaign_id and a.room_id=p_room_id and a.spawn_key=v_spawn_key;

    return jsonb_build_object('actors',v_result,'replayed',true);
  end if;

  for v_ordinal in 1..p_count loop
    insert into public.ai_scene_actors(
      campaign_id,room_id,location_id,source_bestiary_slug,source_digest,
      compiler_version,display_label,runtime_ordinal,spawn_key,spawn_fingerprint,
      sheet_snapshot,mechanics_snapshot,current_hp,max_hp,campaign_day,day_period
    )
    values(
      p_campaign_id,p_room_id,v_room.location_id,v_compiled->>'source_bestiary_slug',
      v_compiled->>'source_digest',(v_compiled->>'compiler_version')::integer,
      v_label,v_ordinal,v_spawn_key,v_fingerprint,v_sheet,
      coalesce(v_compiled->'mechanics','[]'::jsonb),
      v_max_hp,v_max_hp,v_room.campaign_day,v_room.day_period
    )
    returning * into v_actor;

    for v_resource in select value from jsonb_array_elements(v_resources)
    loop
      insert into public.ai_scene_actor_resources(
        actor_id,campaign_id,state_key,current,max_snapshot,label,recharge,usage
      )
      values(
        v_actor.id,p_campaign_id,v_resource->>'key',
        greatest(0,(v_resource->>'max')::integer),
        greatest(1,(v_resource->>'max')::integer),
        left(coalesce(v_resource->>'label',''),160),
        coalesce(v_resource->'recharge','{}'::jsonb),
        coalesce(v_resource->'usage','{}'::jsonb)
      );
    end loop;

    v_result := v_result || jsonb_build_array(private.ai_scene_actor_json_v1(v_actor));
  end loop;

  return jsonb_build_object('actors',v_result,'replayed',false);
end;
$$;

create or replace function public.list_ai_scene_actors_v1(
  p_campaign_id uuid,p_room_id uuid,p_include_archived boolean default false
)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='42501', message='ai_scene_actor_ai_world_only';
  end if;
  if not exists(
    select 1 from public.chat_rooms r
    where r.id=p_room_id and r.campaign_id=p_campaign_id
  ) then
    raise exception using errcode='22023', message='ai_scene_actor_room_not_found';
  end if;

  select coalesce(
    jsonb_agg(private.ai_scene_actor_json_v1(a)
      order by a.spawned_at,a.spawn_key,a.runtime_ordinal),
    '[]'::jsonb
  )
  into v_result
  from public.ai_scene_actors a
  where a.campaign_id=p_campaign_id and a.room_id=p_room_id
    and (coalesce(p_include_archived,false) or a.runtime_state='active');

  return v_result;
end;
$$;

create or replace function public.set_ai_scene_actor_runtime_v1(
  p_actor_id uuid,
  p_expected_revision bigint,
  p_current_hp integer default null,
  p_life_state text default null,
  p_conditions jsonb default null,
  p_effects jsonb default null,
  p_resource_currents jsonb default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_actor public.ai_scene_actors%rowtype;
  v_new_hp integer;
  v_new_life text;
  v_conditions jsonb;
  v_effects jsonb;
  v_resources jsonb := p_resource_currents;
  v_key text;
  v_current_text text;
  v_current integer;
  v_resource public.ai_scene_actor_resources%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_actor_id is null or p_expected_revision is null then
    raise exception using errcode='22023', message='ai_scene_actor_runtime_input_invalid';
  end if;

  select * into v_actor from public.ai_scene_actors where id=p_actor_id for update;
  if v_actor.id is null then
    raise exception using errcode='P0002', message='ai_scene_actor_not_found';
  end if;
  if not private.is_ai_world_campaign_v1(v_actor.campaign_id) then
    raise exception using errcode='42501', message='ai_scene_actor_ai_world_only';
  end if;
  if v_actor.runtime_state <> 'active' then
    raise exception using errcode='22023', message='ai_scene_actor_archived';
  end if;
  if v_actor.revision <> p_expected_revision then
    raise exception using errcode='40001', message='ai_scene_actor_revision_conflict';
  end if;

  v_new_hp := coalesce(p_current_hp,v_actor.current_hp);
  if v_new_hp < 0 or v_new_hp > v_actor.max_hp then
    raise exception using errcode='22023', message='ai_scene_actor_hp_invalid';
  end if;
  v_new_life := coalesce(nullif(lower(btrim(p_life_state)),''),v_actor.life_state);
  if v_new_life not in ('alive','dead','fled') then
    raise exception using errcode='22023', message='ai_scene_actor_life_state_invalid';
  end if;
  if v_new_hp=0 then v_new_life:='dead';
  elsif v_new_life='dead' then v_new_hp:=0;
  end if;

  v_conditions := coalesce(p_conditions,v_actor.conditions);
  v_effects := coalesce(p_effects,v_actor.effects);
  if jsonb_typeof(v_conditions)<>'array' or jsonb_typeof(v_effects)<>'array' then
    raise exception using errcode='22023', message='ai_scene_actor_effect_state_invalid';
  end if;

  if v_resources is not null then
    if jsonb_typeof(v_resources)<>'object' then
      raise exception using errcode='22023', message='ai_scene_actor_resource_patch_invalid';
    end if;

    for v_key,v_current_text in select key,value from jsonb_each_text(v_resources)
    loop
      if v_current_text !~ '^[0-9]+$' then
        raise exception using errcode='22023', message='ai_scene_actor_resource_current_invalid';
      end if;
      v_current := v_current_text::integer;

      select * into v_resource
      from public.ai_scene_actor_resources
      where actor_id=v_actor.id and state_key=v_key
      for update;

      if v_resource.actor_id is null or v_current<0 or v_current>v_resource.max_snapshot then
        raise exception using errcode='22023', message='ai_scene_actor_resource_current_invalid';
      end if;

      update public.ai_scene_actor_resources
      set current=v_current,updated_at=now()
      where actor_id=v_actor.id and state_key=v_key;
    end loop;
  end if;

  update public.ai_scene_actors
  set current_hp=v_new_hp,life_state=v_new_life,conditions=v_conditions,effects=v_effects,
      revision=revision+1,updated_at=now()
  where id=v_actor.id
  returning * into v_actor;

  return private.ai_scene_actor_json_v1(v_actor);
end;
$$;

create or replace function public.archive_ai_scene_actor_v1(
  p_actor_id uuid,p_reason text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_actor public.ai_scene_actors%rowtype;
  v_reason text := nullif(left(btrim(coalesce(p_reason,'')),500),'');
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;

  select * into v_actor from public.ai_scene_actors where id=p_actor_id for update;
  if v_actor.id is null then
    raise exception using errcode='P0002', message='ai_scene_actor_not_found';
  end if;
  if not private.is_ai_world_campaign_v1(v_actor.campaign_id) then
    raise exception using errcode='42501', message='ai_scene_actor_ai_world_only';
  end if;

  if v_actor.runtime_state='archived' then
    return jsonb_build_object('actor',private.ai_scene_actor_json_v1(v_actor),'replayed',true);
  end if;

  update public.ai_scene_actors
  set runtime_state='archived',archive_reason=v_reason,archived_at=now(),
      revision=revision+1,updated_at=now()
  where id=v_actor.id
  returning * into v_actor;

  return jsonb_build_object('actor',private.ai_scene_actor_json_v1(v_actor),'replayed',false);
end;
$$;

revoke all on function public.spawn_ai_scene_actors_v1(uuid,uuid,text,text,text,integer)
  from public, anon, authenticated;
revoke all on function public.list_ai_scene_actors_v1(uuid,uuid,boolean)
  from public, anon, authenticated;
revoke all on function public.set_ai_scene_actor_runtime_v1(uuid,bigint,integer,text,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.archive_ai_scene_actor_v1(uuid,text)
  from public, anon, authenticated;

grant execute on function public.spawn_ai_scene_actors_v1(uuid,uuid,text,text,text,integer)
  to service_role;
grant execute on function public.list_ai_scene_actors_v1(uuid,uuid,boolean)
  to service_role;
grant execute on function public.set_ai_scene_actor_runtime_v1(uuid,bigint,integer,text,jsonb,jsonb,jsonb)
  to service_role;
grant execute on function public.archive_ai_scene_actor_v1(uuid,text)
  to service_role;
