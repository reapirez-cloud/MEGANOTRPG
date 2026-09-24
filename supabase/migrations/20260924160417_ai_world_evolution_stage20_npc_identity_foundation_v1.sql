create table public.npc_identity_fingerprints (
  character_id uuid primary key references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  current_version integer not null default 1 check (current_version > 0),
  bootstrap_state text not null default 'stub'
    check (bootstrap_state in ('stub','seeded','evolved')),
  traits jsonb not null default '[]'::jsonb check (jsonb_typeof(traits)='array'),
  weighted_values jsonb not null default '[]'::jsonb check (jsonb_typeof(weighted_values)='array'),
  red_lines jsonb not null default '[]'::jsonb check (jsonb_typeof(red_lines)='array'),
  long_term_desires jsonb not null default '[]'::jsonb check (jsonb_typeof(long_term_desires)='array'),
  fears jsonb not null default '[]'::jsonb check (jsonb_typeof(fears)='array'),
  loyalties jsonb not null default '[]'::jsonb check (jsonb_typeof(loyalties)='array'),
  authority_attitude jsonb not null default '{}'::jsonb check (jsonb_typeof(authority_attitude)='object'),
  risk_tolerance smallint check (risk_tolerance between 0 and 5),
  violence_threshold smallint check (violence_threshold between 0 and 5),
  pressure_behavior jsonb not null default '[]'::jsonb check (jsonb_typeof(pressure_behavior)='array'),
  self_image text not null default '',
  social_style jsonb not null default '[]'::jsonb check (jsonb_typeof(social_style)='array'),
  decision_priorities jsonb not null default '[]'::jsonb check (jsonb_typeof(decision_priorities)='array'),
  source_kind text not null default 'bootstrap',
  source_ref text,
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance)='object'),
  fingerprint_hash text not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  last_major_event_id uuid references public.campaign_events(id) on delete set null,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_id,campaign_id)
);

create table public.npc_identity_fingerprint_versions (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version integer not null check (version > 0),
  change_kind text not null
    check (change_kind in ('bootstrap','bootstrap_refinement','major_event')),
  core jsonb not null check (jsonb_typeof(core)='object'),
  fingerprint_hash text not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  source_event_id uuid references public.campaign_events(id) on delete set null,
  source_kind text not null,
  source_ref text,
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance)='object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(character_id,version)
);

create table public.npc_identity_evolution_receipts (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  previous_version integer not null check (previous_version > 0),
  new_version integer not null check (new_version > previous_version),
  source_event_id uuid not null references public.campaign_events(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 1 and 1600),
  previous_fingerprint_hash text not null check (previous_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  new_fingerprint_hash text not null check (new_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance)='object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(character_id,new_version)
);

create table public.npc_identity_observations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  npc_character_id uuid not null references public.characters(id) on delete cascade,
  observer_character_id uuid not null references public.characters(id) on delete cascade,
  observation_key text not null check (observation_key ~ '^[a-z0-9][a-z0-9:_-]{0,79}$'),
  statement text not null check (char_length(btrim(statement)) between 1 and 800),
  confidence numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1),
  source_event_id uuid not null references public.campaign_events(id) on delete restrict,
  state text not null default 'active' check (state in ('active','retracted')),
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(npc_character_id,observer_character_id,observation_key)
);

create index npc_identity_fingerprints_campaign_idx
  on public.npc_identity_fingerprints(campaign_id,character_id);
create index npc_identity_versions_timeline_idx
  on public.npc_identity_fingerprint_versions(character_id,version desc);
create index npc_identity_versions_event_idx
  on public.npc_identity_fingerprint_versions(source_event_id)
  where source_event_id is not null;
create index npc_identity_evolution_event_idx
  on public.npc_identity_evolution_receipts(source_event_id);
create index npc_identity_observations_observer_idx
  on public.npc_identity_observations(observer_character_id,npc_character_id,state);
create index npc_identity_observations_npc_idx
  on public.npc_identity_observations(npc_character_id,state,updated_at desc);

alter table public.npc_identity_fingerprints enable row level security;
alter table public.npc_identity_fingerprint_versions enable row level security;
alter table public.npc_identity_evolution_receipts enable row level security;
alter table public.npc_identity_observations enable row level security;

create policy npc_identity_fingerprints_manager_read
on public.npc_identity_fingerprints
for select to authenticated
using ((select private.can_manage_character(character_id)));

create policy npc_identity_versions_manager_read
on public.npc_identity_fingerprint_versions
for select to authenticated
using ((select private.can_manage_character(character_id)));

create policy npc_identity_evolution_manager_read
on public.npc_identity_evolution_receipts
for select to authenticated
using ((select private.can_manage_character(character_id)));

create policy npc_identity_observations_manager_or_observer_read
on public.npc_identity_observations
for select to authenticated
using (
  (select private.can_manage_campaign(campaign_id,(select auth.uid())))
  or observer_character_id = (
    select private.active_character_for_user(campaign_id,(select auth.uid()))
  )
);

create or replace function private.npc_identity_string_array_v1(
  p_value jsonb,
  p_label text,
  p_max_items integer default 12,
  p_max_len integer default 600
)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v_item jsonb;
  v_text text;
  v_result jsonb := '[]'::jsonb;
  v_seen text[] := '{}'::text[];
begin
  if p_value is null or p_value='null'::jsonb then return v_result; end if;
  if jsonb_typeof(p_value)<>'array' then
    raise exception using errcode='22023',message='npc_identity_'||p_label||'_must_be_array';
  end if;
  if jsonb_array_length(p_value)>p_max_items then
    raise exception using errcode='22023',message='npc_identity_'||p_label||'_too_many_items';
  end if;
  for v_item in select value from jsonb_array_elements(p_value)
  loop
    if jsonb_typeof(v_item)<>'string' then
      raise exception using errcode='22023',message='npc_identity_'||p_label||'_item_must_be_string';
    end if;
    v_text:=btrim(v_item #>> '{}');
    if v_text='' then continue; end if;
    if char_length(v_text)>p_max_len then
      raise exception using errcode='22023',message='npc_identity_'||p_label||'_item_too_long';
    end if;
    if not (v_text=any(v_seen)) then
      v_result:=v_result||jsonb_build_array(v_text);
      v_seen:=array_append(v_seen,v_text);
    end if;
  end loop;
  return v_result;
end;
$$;

create or replace function private.normalize_npc_identity_core_v1(p_core jsonb)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v_allowed constant text[] := array[
    'traits','weighted_values','red_lines','long_term_desires','fears','loyalties',
    'authority_attitude','risk_tolerance','violence_threshold','pressure_behavior',
    'self_image','social_style','decision_priorities'
  ];
  v_values jsonb := '[]'::jsonb;
  v_red_lines jsonb := '[]'::jsonb;
  v_item jsonb; v_key text; v_label text; v_reason text;
  v_weight integer; v_hard boolean;
  v_authority jsonb; v_stance text; v_notes text;
  v_risk smallint; v_violence smallint; v_self_image text;
begin
  if p_core is null or jsonb_typeof(p_core)<>'object' then
    raise exception using errcode='22023',message='npc_identity_core_must_be_object';
  end if;
  if exists(select 1 from jsonb_object_keys(p_core) k where not (k=any(v_allowed))) then
    raise exception using errcode='22023',message='npc_identity_core_unknown_key';
  end if;

  if p_core ? 'weighted_values' then
    if jsonb_typeof(p_core->'weighted_values')<>'array'
       or jsonb_array_length(p_core->'weighted_values')>12 then
      raise exception using errcode='22023',message='npc_identity_weighted_values_invalid';
    end if;
    for v_item in select value from jsonb_array_elements(p_core->'weighted_values')
    loop
      if jsonb_typeof(v_item)<>'object' then
        raise exception using errcode='22023',message='npc_identity_weighted_value_must_be_object';
      end if;
      if exists(select 1 from jsonb_object_keys(v_item) k where k not in ('key','label','weight','reason')) then
        raise exception using errcode='22023',message='npc_identity_weighted_value_unknown_key';
      end if;
      v_key:=lower(btrim(coalesce(v_item->>'key','')));
      v_label:=btrim(coalesce(v_item->>'label',''));
      v_reason:=btrim(coalesce(v_item->>'reason',''));
      if v_key !~ '^[a-z0-9][a-z0-9:_-]{0,79}$' or v_label='' or char_length(v_label)>240 then
        raise exception using errcode='22023',message='npc_identity_weighted_value_identity_invalid';
      end if;
      if coalesce(v_item->>'weight','') !~ '^[0-5]$' then
        raise exception using errcode='22023',message='npc_identity_weighted_value_weight_invalid';
      end if;
      v_weight:=(v_item->>'weight')::integer;
      if char_length(v_reason)>600 then
        raise exception using errcode='22023',message='npc_identity_weighted_value_reason_too_long';
      end if;
      v_values:=v_values||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'key',v_key,'label',v_label,'weight',v_weight,'reason',nullif(v_reason,'')
      )));
    end loop;
  end if;

  if p_core ? 'red_lines' then
    if jsonb_typeof(p_core->'red_lines')<>'array'
       or jsonb_array_length(p_core->'red_lines')>12 then
      raise exception using errcode='22023',message='npc_identity_red_lines_invalid';
    end if;
    for v_item in select value from jsonb_array_elements(p_core->'red_lines')
    loop
      if jsonb_typeof(v_item)<>'object' then
        raise exception using errcode='22023',message='npc_identity_red_line_must_be_object';
      end if;
      if exists(select 1 from jsonb_object_keys(v_item) k where k not in ('key','label','hard','reason')) then
        raise exception using errcode='22023',message='npc_identity_red_line_unknown_key';
      end if;
      v_key:=lower(btrim(coalesce(v_item->>'key','')));
      v_label:=btrim(coalesce(v_item->>'label',''));
      v_reason:=btrim(coalesce(v_item->>'reason',''));
      if v_key !~ '^[a-z0-9][a-z0-9:_-]{0,79}$' or v_label='' or char_length(v_label)>240 then
        raise exception using errcode='22023',message='npc_identity_red_line_identity_invalid';
      end if;
      if v_item ? 'hard' and jsonb_typeof(v_item->'hard')<>'boolean' then
        raise exception using errcode='22023',message='npc_identity_red_line_hard_invalid';
      end if;
      v_hard:=coalesce((v_item->>'hard')::boolean,true);
      if char_length(v_reason)>600 then
        raise exception using errcode='22023',message='npc_identity_red_line_reason_too_long';
      end if;
      v_red_lines:=v_red_lines||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'key',v_key,'label',v_label,'hard',v_hard,'reason',nullif(v_reason,'')
      )));
    end loop;
  end if;

  v_authority:=coalesce(p_core->'authority_attitude','{}'::jsonb);
  if v_authority='null'::jsonb then v_authority:='{}'::jsonb; end if;
  if jsonb_typeof(v_authority)<>'object' then
    raise exception using errcode='22023',message='npc_identity_authority_attitude_must_be_object';
  end if;
  if exists(select 1 from jsonb_object_keys(v_authority) k where k not in ('stance','notes')) then
    raise exception using errcode='22023',message='npc_identity_authority_attitude_unknown_key';
  end if;
  v_stance:=btrim(coalesce(v_authority->>'stance',''));
  v_notes:=btrim(coalesce(v_authority->>'notes',''));
  if char_length(v_stance)>80 or char_length(v_notes)>800 then
    raise exception using errcode='22023',message='npc_identity_authority_attitude_too_long';
  end if;
  v_authority:=jsonb_strip_nulls(jsonb_build_object(
    'stance',nullif(v_stance,''),'notes',nullif(v_notes,'')
  ));

  if p_core ? 'risk_tolerance' and p_core->'risk_tolerance'<>'null'::jsonb then
    if coalesce(p_core->>'risk_tolerance','') !~ '^[0-5]$' then
      raise exception using errcode='22023',message='npc_identity_risk_tolerance_invalid';
    end if;
    v_risk:=(p_core->>'risk_tolerance')::smallint;
  end if;
  if p_core ? 'violence_threshold' and p_core->'violence_threshold'<>'null'::jsonb then
    if coalesce(p_core->>'violence_threshold','') !~ '^[0-5]$' then
      raise exception using errcode='22023',message='npc_identity_violence_threshold_invalid';
    end if;
    v_violence:=(p_core->>'violence_threshold')::smallint;
  end if;
  v_self_image:=btrim(coalesce(p_core->>'self_image',''));
  if char_length(v_self_image)>1200 then
    raise exception using errcode='22023',message='npc_identity_self_image_too_long';
  end if;

  return jsonb_build_object(
    'traits',private.npc_identity_string_array_v1(p_core->'traits','traits',12,300),
    'weighted_values',v_values,
    'red_lines',v_red_lines,
    'long_term_desires',private.npc_identity_string_array_v1(p_core->'long_term_desires','long_term_desires',12,600),
    'fears',private.npc_identity_string_array_v1(p_core->'fears','fears',12,600),
    'loyalties',private.npc_identity_string_array_v1(p_core->'loyalties','loyalties',12,600),
    'authority_attitude',v_authority,
    'risk_tolerance',v_risk,
    'violence_threshold',v_violence,
    'pressure_behavior',private.npc_identity_string_array_v1(p_core->'pressure_behavior','pressure_behavior',12,600),
    'self_image',v_self_image,
    'social_style',private.npc_identity_string_array_v1(p_core->'social_style','social_style',12,600),
    'decision_priorities',private.npc_identity_string_array_v1(p_core->'decision_priorities','decision_priorities',12,600)
  );
end;
$$;

create or replace function private.npc_identity_hash_v1(p_core jsonb)
returns text language sql immutable set search_path=''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(private.normalize_npc_identity_core_v1(p_core)::text,'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function private.npc_identity_core_from_current_v1(p_character_id uuid)
returns jsonb language sql stable set search_path=''
as $$
  select jsonb_build_object(
    'traits',f.traits,'weighted_values',f.weighted_values,'red_lines',f.red_lines,
    'long_term_desires',f.long_term_desires,'fears',f.fears,'loyalties',f.loyalties,
    'authority_attitude',f.authority_attitude,'risk_tolerance',f.risk_tolerance,
    'violence_threshold',f.violence_threshold,'pressure_behavior',f.pressure_behavior,
    'self_image',f.self_image,'social_style',f.social_style,
    'decision_priorities',f.decision_priorities
  )
  from public.npc_identity_fingerprints f
  where f.character_id=p_character_id
$$;

create or replace function private.reject_direct_npc_identity_update_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if coalesce(current_setting('meganot.npc_identity_versioned_write',true),'')<>'on' then
    raise exception using errcode='55000',message='npc_identity_direct_update_forbidden';
  end if;
  return new;
end;
$$;

create trigger npc_identity_fingerprints_versioned_update_only
before update on public.npc_identity_fingerprints
for each row execute function private.reject_direct_npc_identity_update_v1();

create or replace function private.reject_npc_identity_version_update_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  raise exception using errcode='55000',message='npc_identity_version_immutable';
end;
$$;

create trigger npc_identity_versions_immutable
before update on public.npc_identity_fingerprint_versions
for each row execute function private.reject_npc_identity_version_update_v1();

create or replace function private.write_npc_identity_version_v1(
  p_character_id uuid,p_core jsonb,p_change_kind text,p_bootstrap_state text,
  p_source_kind text,p_source_ref text default null,p_source_event_id uuid default null,
  p_provenance jsonb default '{}'::jsonb,p_created_by uuid default null,
  p_allow_same_hash boolean default false
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_character public.characters%rowtype;
  v_current public.npc_identity_fingerprints%rowtype;
  v_core jsonb; v_hash text; v_version integer; v_prev_setting text;
begin
  if p_change_kind not in ('bootstrap','bootstrap_refinement','major_event') then
    raise exception using errcode='22023',message='npc_identity_change_kind_invalid';
  end if;
  if p_bootstrap_state not in ('stub','seeded','evolved') then
    raise exception using errcode='22023',message='npc_identity_bootstrap_state_invalid';
  end if;
  if btrim(coalesce(p_source_kind,''))='' or char_length(p_source_kind)>120 then
    raise exception using errcode='22023',message='npc_identity_source_kind_invalid';
  end if;
  if p_provenance is null or jsonb_typeof(p_provenance)<>'object'
     or pg_catalog.octet_length(p_provenance::text)>12000 then
    raise exception using errcode='22023',message='npc_identity_provenance_invalid';
  end if;

  select * into v_character from public.characters c
  where c.id=p_character_id and c.character_type='npc' and c.publication_state='campaign'
  for update;
  if v_character.id is null then
    raise exception using errcode='22023',message='npc_identity_persistent_npc_required';
  end if;

  v_core:=private.normalize_npc_identity_core_v1(p_core);
  v_hash:=private.npc_identity_hash_v1(v_core);
  select * into v_current from public.npc_identity_fingerprints f
  where f.character_id=p_character_id for update;

  if v_current.character_id is not null and v_current.fingerprint_hash=v_hash and not p_allow_same_hash then
    return jsonb_build_object(
      'character_id',v_current.character_id,'campaign_id',v_current.campaign_id,
      'version',v_current.current_version,'fingerprint_hash',v_current.fingerprint_hash,
      'changed',false
    );
  end if;

  v_version:=coalesce(v_current.current_version,0)+1;
  v_prev_setting:=current_setting('meganot.npc_identity_versioned_write',true);
  perform set_config('meganot.npc_identity_versioned_write','on',true);

  insert into public.npc_identity_fingerprints(
    character_id,campaign_id,current_version,bootstrap_state,
    traits,weighted_values,red_lines,long_term_desires,fears,loyalties,
    authority_attitude,risk_tolerance,violence_threshold,pressure_behavior,
    self_image,social_style,decision_priorities,source_kind,source_ref,provenance,
    fingerprint_hash,last_major_event_id,created_by,updated_by
  ) values (
    p_character_id,v_character.campaign_id,v_version,p_bootstrap_state,
    v_core->'traits',v_core->'weighted_values',v_core->'red_lines',
    v_core->'long_term_desires',v_core->'fears',v_core->'loyalties',
    v_core->'authority_attitude',nullif(v_core->>'risk_tolerance','')::smallint,
    nullif(v_core->>'violence_threshold','')::smallint,v_core->'pressure_behavior',
    coalesce(v_core->>'self_image',''),v_core->'social_style',v_core->'decision_priorities',
    left(btrim(p_source_kind),120),nullif(left(btrim(coalesce(p_source_ref,'')),500),''),
    p_provenance,v_hash,case when p_change_kind='major_event' then p_source_event_id else null end,
    p_created_by,p_created_by
  )
  on conflict(character_id) do update set
    campaign_id=excluded.campaign_id,current_version=excluded.current_version,
    bootstrap_state=excluded.bootstrap_state,traits=excluded.traits,
    weighted_values=excluded.weighted_values,red_lines=excluded.red_lines,
    long_term_desires=excluded.long_term_desires,fears=excluded.fears,
    loyalties=excluded.loyalties,authority_attitude=excluded.authority_attitude,
    risk_tolerance=excluded.risk_tolerance,violence_threshold=excluded.violence_threshold,
    pressure_behavior=excluded.pressure_behavior,self_image=excluded.self_image,
    social_style=excluded.social_style,decision_priorities=excluded.decision_priorities,
    source_kind=excluded.source_kind,source_ref=excluded.source_ref,
    provenance=excluded.provenance,fingerprint_hash=excluded.fingerprint_hash,
    last_major_event_id=case
      when p_change_kind='major_event' then p_source_event_id
      else public.npc_identity_fingerprints.last_major_event_id
    end,
    updated_by=excluded.updated_by,updated_at=now();

  insert into public.npc_identity_fingerprint_versions(
    character_id,campaign_id,version,change_kind,core,fingerprint_hash,
    source_event_id,source_kind,source_ref,provenance,created_by
  ) values (
    p_character_id,v_character.campaign_id,v_version,p_change_kind,v_core,v_hash,
    p_source_event_id,left(btrim(p_source_kind),120),
    nullif(left(btrim(coalesce(p_source_ref,'')),500),''),
    p_provenance,p_created_by
  );

  perform set_config('meganot.npc_identity_versioned_write',coalesce(v_prev_setting,''),true);
  return jsonb_build_object(
    'character_id',p_character_id,'campaign_id',v_character.campaign_id,
    'version',v_version,'fingerprint_hash',v_hash,'changed',true
  );
end;
$$;

create or replace function private.ensure_npc_identity_after_character_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.character_type='npc' and new.publication_state='campaign'
     and not exists(select 1 from public.npc_identity_fingerprints f where f.character_id=new.id)
  then
    perform private.write_npc_identity_version_v1(
      new.id,
      jsonb_build_object(
        'traits','[]'::jsonb,'weighted_values','[]'::jsonb,'red_lines','[]'::jsonb,
        'long_term_desires','[]'::jsonb,'fears','[]'::jsonb,'loyalties','[]'::jsonb,
        'authority_attitude','{}'::jsonb,'risk_tolerance',null,'violence_threshold',null,
        'pressure_behavior','[]'::jsonb,'self_image','','social_style','[]'::jsonb,
        'decision_priorities','[]'::jsonb
      ),
      'bootstrap','stub','character_bootstrap',new.id::text,null,
      jsonb_strip_nulls(jsonb_build_object(
        'stage',20,'character_name',left(new.name,160),
        'character_class',left(coalesce(new.character_class,''),120),
        'explicit_bio',nullif(left(btrim(coalesce(new.bio,'')),1200),'')
      )),
      new.created_by,false
    );
  end if;
  return new;
end;
$$;

create trigger ensure_npc_identity_after_character_v1
after insert or update of character_type,publication_state on public.characters
for each row execute function private.ensure_npc_identity_after_character_v1();

create or replace function private.seed_npc_identity_after_profile_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_current public.npc_identity_fingerprints%rowtype;
  v_core jsonb; v_traits jsonb; v_desires jsonb; v_loyalties jsonb; v_social jsonb;
begin
  select * into v_current from public.npc_identity_fingerprints
  where character_id=new.character_id for update;
  if v_current.character_id is null or v_current.bootstrap_state<>'stub' then return new; end if;
  if btrim(coalesce(new.demeanor,''))='' and btrim(coalesce(new.motivation,''))=''
     and btrim(coalesce(new.faction,''))='' then return new; end if;

  v_core:=private.npc_identity_core_from_current_v1(new.character_id);
  v_traits:=coalesce(v_core->'traits','[]'::jsonb);
  v_desires:=coalesce(v_core->'long_term_desires','[]'::jsonb);
  v_loyalties:=coalesce(v_core->'loyalties','[]'::jsonb);
  v_social:=coalesce(v_core->'social_style','[]'::jsonb);
  if btrim(coalesce(new.demeanor,''))<>'' then
    v_traits:=v_traits||jsonb_build_array(left(btrim(new.demeanor),300));
    v_social:=v_social||jsonb_build_array(left(btrim(new.demeanor),600));
  end if;
  if btrim(coalesce(new.motivation,''))<>'' then
    v_desires:=v_desires||jsonb_build_array(left(btrim(new.motivation),600));
  end if;
  if btrim(coalesce(new.faction,''))<>'' then
    v_loyalties:=v_loyalties||jsonb_build_array(left('Связь с фракцией: '||btrim(new.faction),600));
  end if;
  v_core:=v_core||jsonb_build_object(
    'traits',v_traits,'long_term_desires',v_desires,'loyalties',v_loyalties,'social_style',v_social
  );

  perform private.write_npc_identity_version_v1(
    new.character_id,v_core,'bootstrap_refinement','seeded',
    'npc_profile_seed',new.character_id::text,null,
    jsonb_build_object(
      'stage',20,'source','explicit_npc_profile_fields',
      'used_fields',jsonb_build_array('demeanor','motivation','faction')
    ),
    new.created_by,false
  );
  return new;
end;
$$;

create trigger seed_npc_identity_after_profile_v1
after insert on public.npc_profiles
for each row execute function private.seed_npc_identity_after_profile_v1();

create or replace function private.bootstrap_promoted_npc_identity_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_current public.npc_identity_fingerprints%rowtype;
  v_core jsonb; v_created_by uuid; v_commands jsonb;
  v_damage_count integer; v_damage_total integer;
begin
  if old.promoted_character_id is not null or new.promoted_character_id is null then return new; end if;
  select * into v_current from public.npc_identity_fingerprints
  where character_id=new.promoted_character_id for update;
  if v_current.character_id is null or v_current.bootstrap_state='evolved' then return new; end if;

  select c.created_by into v_created_by from public.characters c where c.id=new.promoted_character_id;
  select coalesce(jsonb_agg(
    jsonb_build_object('command_kind',x.command_kind,'created_at',x.created_at)
    order by x.created_at
  ),'[]'::jsonb)
  into v_commands
  from (
    select r.command_kind,r.created_at
    from public.ai_scene_actor_command_receipts r
    where r.actor_id=new.id order by r.created_at limit 12
  ) x;

  select count(*),coalesce(sum(r.applied_damage),0)
  into v_damage_count,v_damage_total
  from public.ai_scene_actor_damage_receipts r where r.actor_id=new.id;

  v_core:=private.npc_identity_core_from_current_v1(new.promoted_character_id);
  perform private.write_npc_identity_version_v1(
    new.promoted_character_id,v_core,'bootstrap_refinement','seeded',
    'scene_actor_promotion',new.id::text,null,
    jsonb_build_object(
      'stage',20,'source_kind','scene_actor_promotion','scene_actor_id',new.id,
      'source_bestiary_slug',new.source_bestiary_slug,'source_digest',new.source_digest,
      'display_label',new.display_label,'promotion_name',new.promotion_name,
      'promotion_source_message_id',new.promotion_source_message_id,
      'observed_command_kinds',v_commands,'damage_receipt_count',v_damage_count,
      'recorded_damage_total',v_damage_total,
      'inference_policy','conservative_no_unobserved_biography'
    ),
    v_created_by,true
  );
  return new;
end;
$$;

create trigger bootstrap_promoted_npc_identity_v1
after update of promoted_character_id on public.ai_scene_actors
for each row execute function private.bootstrap_promoted_npc_identity_v1();

create or replace function public.read_ai_npc_identity_fingerprints_v1(
  p_campaign_id uuid,p_npc_ids uuid[]
)
returns jsonb language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'character_id',f.character_id,'campaign_id',f.campaign_id,
      'version',f.current_version,'bootstrap_state',f.bootstrap_state,
      'fingerprint_hash',f.fingerprint_hash,
      'core',private.npc_identity_core_from_current_v1(f.character_id),
      'source_kind',f.source_kind,'source_ref',f.source_ref,
      'provenance',f.provenance,'last_major_event_id',f.last_major_event_id,
      'updated_at',f.updated_at
    ) order by f.character_id
  ),'[]'::jsonb)
  from public.npc_identity_fingerprints f
  join public.characters c
    on c.id=f.character_id and c.campaign_id=f.campaign_id
   and c.character_type='npc' and c.publication_state='campaign'
  where f.campaign_id=p_campaign_id
    and f.character_id=any(coalesce(p_npc_ids,'{}'::uuid[]))
$$;

create or replace function public.evolve_npc_identity_fingerprint_v1(
  p_npc_character_id uuid,p_expected_version integer,p_core jsonb,
  p_source_event_id uuid,p_reason text,p_provenance jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_current public.npc_identity_fingerprints%rowtype;
  v_event public.campaign_events%rowtype;
  v_result jsonb; v_previous_hash text; v_reason text:=btrim(coalesce(p_reason,''));
  v_required text[]:=array[
    'traits','weighted_values','red_lines','long_term_desires','fears','loyalties',
    'authority_attitude','risk_tolerance','violence_threshold','pressure_behavior',
    'self_image','social_style','decision_priorities'
  ];
begin
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='npc_identity_expected_version_invalid';
  end if;
  if v_reason='' or char_length(v_reason)>1600 then
    raise exception using errcode='22023',message='npc_identity_evolution_reason_invalid';
  end if;
  if p_core is null or jsonb_typeof(p_core)<>'object' or not (p_core ?& v_required) then
    raise exception using errcode='22023',message='npc_identity_evolution_full_core_required';
  end if;
  if p_provenance is null or jsonb_typeof(p_provenance)<>'object'
     or pg_catalog.octet_length(p_provenance::text)>12000 then
    raise exception using errcode='22023',message='npc_identity_evolution_provenance_invalid';
  end if;

  select * into v_current from public.npc_identity_fingerprints
  where character_id=p_npc_character_id for update;
  if v_current.character_id is null then
    raise exception using errcode='P0002',message='npc_identity_not_found';
  end if;
  if v_current.current_version<>p_expected_version then
    raise exception using errcode='40001',message='npc_identity_version_conflict';
  end if;

  select * into v_event from public.campaign_events
  where id=p_source_event_id and campaign_id=v_current.campaign_id for share;
  if v_event.id is null then
    raise exception using errcode='22023',message='npc_identity_major_event_not_found';
  end if;
  if v_event.importance<4 then
    raise exception using errcode='22023',message='npc_identity_major_event_importance_required';
  end if;
  if v_event.actor_character_id is distinct from p_npc_character_id
     and not (p_npc_character_id=any(v_event.participant_character_ids)) then
    raise exception using errcode='22023',message='npc_identity_major_event_must_involve_npc';
  end if;

  v_previous_hash:=v_current.fingerprint_hash;
  v_result:=private.write_npc_identity_version_v1(
    p_npc_character_id,p_core,'major_event','evolved',
    'major_canonical_event',p_source_event_id::text,p_source_event_id,
    p_provenance||jsonb_build_object(
      'stage',20,'reason',left(v_reason,1600),'event_type',v_event.event_type,
      'event_summary',left(v_event.summary,1200),'event_importance',v_event.importance
    ),
    null,false
  );
  if coalesce((v_result->>'changed')::boolean,false)=false then
    raise exception using errcode='22023',message='npc_identity_major_event_requires_identity_change';
  end if;

  insert into public.npc_identity_evolution_receipts(
    character_id,campaign_id,previous_version,new_version,source_event_id,
    reason,previous_fingerprint_hash,new_fingerprint_hash,provenance
  ) values (
    p_npc_character_id,v_current.campaign_id,p_expected_version,
    (v_result->>'version')::integer,p_source_event_id,left(v_reason,1600),
    v_previous_hash,v_result->>'fingerprint_hash',p_provenance
  );
  return v_result||jsonb_build_object('change_kind','major_event','source_event_id',p_source_event_id);
end;
$$;

create or replace function public.record_npc_identity_observation_v1(
  p_npc_character_id uuid,p_observer_character_id uuid,p_observation_key text,
  p_statement text,p_confidence numeric,p_source_event_id uuid
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_campaign_id uuid;
  v_key text:=lower(btrim(coalesce(p_observation_key,'')));
  v_statement text:=btrim(coalesce(p_statement,''));
  v_event public.campaign_events%rowtype;
  v_row public.npc_identity_observations%rowtype;
begin
  if v_key !~ '^[a-z0-9][a-z0-9:_-]{0,79}$' then
    raise exception using errcode='22023',message='npc_identity_observation_key_invalid';
  end if;
  if v_statement='' or char_length(v_statement)>800 then
    raise exception using errcode='22023',message='npc_identity_observation_statement_invalid';
  end if;
  if p_confidence is null or p_confidence<0 or p_confidence>1 then
    raise exception using errcode='22023',message='npc_identity_observation_confidence_invalid';
  end if;

  select c.campaign_id into v_campaign_id from public.characters c
  where c.id=p_npc_character_id and c.character_type='npc' and c.publication_state='campaign';
  if v_campaign_id is null then
    raise exception using errcode='22023',message='npc_identity_observation_npc_invalid';
  end if;
  if not exists(select 1 from public.characters c
    where c.id=p_observer_character_id and c.campaign_id=v_campaign_id
      and c.character_type='pc' and c.publication_state='campaign') then
    raise exception using errcode='22023',message='npc_identity_observation_observer_invalid';
  end if;

  select * into v_event from public.campaign_events
  where id=p_source_event_id and campaign_id=v_campaign_id;
  if v_event.id is null
     or (v_event.actor_character_id is distinct from p_npc_character_id
         and not (p_npc_character_id=any(v_event.participant_character_ids)))
     or (v_event.actor_character_id is distinct from p_observer_character_id
         and not (p_observer_character_id=any(v_event.participant_character_ids))) then
    raise exception using errcode='22023',message='npc_identity_observation_event_invalid';
  end if;

  insert into public.npc_identity_observations(
    campaign_id,npc_character_id,observer_character_id,observation_key,
    statement,confidence,source_event_id,state
  ) values (
    v_campaign_id,p_npc_character_id,p_observer_character_id,v_key,
    left(v_statement,800),p_confidence,p_source_event_id,'active'
  )
  on conflict(npc_character_id,observer_character_id,observation_key) do update set
    statement=excluded.statement,confidence=excluded.confidence,
    source_event_id=excluded.source_event_id,state='active',updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

revoke all on function private.npc_identity_string_array_v1(jsonb,text,integer,integer) from public,anon,authenticated;
revoke all on function private.normalize_npc_identity_core_v1(jsonb) from public,anon,authenticated;
revoke all on function private.npc_identity_hash_v1(jsonb) from public,anon,authenticated;
revoke all on function private.npc_identity_core_from_current_v1(uuid) from public,anon,authenticated;
revoke all on function private.reject_direct_npc_identity_update_v1() from public,anon,authenticated;
revoke all on function private.reject_npc_identity_version_update_v1() from public,anon,authenticated;
revoke all on function private.write_npc_identity_version_v1(uuid,jsonb,text,text,text,text,uuid,jsonb,uuid,boolean) from public,anon,authenticated;
revoke all on function private.ensure_npc_identity_after_character_v1() from public,anon,authenticated;
revoke all on function private.seed_npc_identity_after_profile_v1() from public,anon,authenticated;
revoke all on function private.bootstrap_promoted_npc_identity_v1() from public,anon,authenticated;

revoke all on function public.read_ai_npc_identity_fingerprints_v1(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.read_ai_npc_identity_fingerprints_v1(uuid,uuid[]) to service_role;
revoke all on function public.evolve_npc_identity_fingerprint_v1(uuid,integer,jsonb,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.evolve_npc_identity_fingerprint_v1(uuid,integer,jsonb,uuid,text,jsonb) to service_role;
revoke all on function public.record_npc_identity_observation_v1(uuid,uuid,text,text,numeric,uuid) from public,anon,authenticated;
grant execute on function public.record_npc_identity_observation_v1(uuid,uuid,text,text,numeric,uuid) to service_role;

do $$
declare r record;
begin
  for r in
    select c.id,c.created_by,c.name,c.character_class,c.bio
    from public.characters c
    where c.character_type='npc' and c.publication_state='campaign'
      and not exists(select 1 from public.npc_identity_fingerprints f where f.character_id=c.id)
  loop
    perform private.write_npc_identity_version_v1(
      r.id,
      jsonb_build_object(
        'traits','[]'::jsonb,'weighted_values','[]'::jsonb,'red_lines','[]'::jsonb,
        'long_term_desires','[]'::jsonb,'fears','[]'::jsonb,'loyalties','[]'::jsonb,
        'authority_attitude','{}'::jsonb,'risk_tolerance',null,'violence_threshold',null,
        'pressure_behavior','[]'::jsonb,'self_image','','social_style','[]'::jsonb,
        'decision_priorities','[]'::jsonb
      ),
      'bootstrap','stub','stage20_backfill',r.id::text,null,
      jsonb_strip_nulls(jsonb_build_object(
        'stage',20,'character_name',left(r.name,160),
        'character_class',left(coalesce(r.character_class,''),120),
        'explicit_bio',nullif(left(btrim(coalesce(r.bio,'')),1200),'')
      )),
      r.created_by,false
    );
  end loop;
end;
$$;

comment on table public.npc_identity_fingerprints is
  'Stage 20 current stable NPC identity core. Mutable mood, HP, location and relationship state belong elsewhere.';
comment on table public.npc_identity_fingerprint_versions is
  'Stage 20 immutable version history for persistent NPC identity fingerprints.';
comment on table public.npc_identity_evolution_receipts is
  'Stage 20 proof that a stable identity changed only through a major canonical event.';
comment on table public.npc_identity_observations is
  'Player-specific observed NPC traits, deliberately separate from the GM-private canonical fingerprint.';
