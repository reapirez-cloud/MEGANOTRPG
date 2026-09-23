-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 1: authoritative World Resolver.
-- One AI-world campaign decision key maps to one persisted server-owned random result.

create table if not exists public.ai_world_random_receipts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  decision_key text not null,
  decision_kind text not null default 'generic',
  sides integer not null,
  result integer not null,
  outcome_bands jsonb not null default '[]'::jsonb,
  matched_outcome_key text,
  matched_outcome jsonb,
  campaign_day integer,
  run_key text,
  target_scope text,
  target_id text,
  audit jsonb not null default '{}'::jsonb,
  request_fingerprint text not null,
  resolver_version smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint ai_world_random_receipts_decision_key_check
    check (length(btrim(decision_key)) between 1 and 240),
  constraint ai_world_random_receipts_decision_kind_check
    check (
      length(decision_kind) between 1 and 80
      and decision_kind ~ '^[a-z0-9][a-z0-9._:-]*$'
    ),
  constraint ai_world_random_receipts_sides_check
    check (sides between 1 and 1000000),
  constraint ai_world_random_receipts_result_check
    check (result between 1 and sides),
  constraint ai_world_random_receipts_bands_check
    check (jsonb_typeof(outcome_bands) = 'array'),
  constraint ai_world_random_receipts_audit_check
    check (jsonb_typeof(audit) = 'object'),
  constraint ai_world_random_receipts_campaign_day_check
    check (campaign_day is null or campaign_day >= 1),
  constraint ai_world_random_receipts_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  unique (campaign_id, decision_key)
);

comment on table public.ai_world_random_receipts is
  'Stage 1 World Resolver receipts. One AI-world campaign decision_key maps to one authoritative server-owned result.';
comment on column public.ai_world_random_receipts.outcome_bands is
  'Normalized ordered gapless outcome mapping committed before the roll; [] means an unbanded dN.';
comment on column public.ai_world_random_receipts.run_key is
  'Optional durable run reference reserved for later background-run linkage.';

alter table public.ai_world_random_receipts enable row level security;
revoke all on table public.ai_world_random_receipts from public, anon, authenticated, service_role;
grant select, insert on table public.ai_world_random_receipts to service_role;

create index if not exists ai_world_random_receipts_campaign_created_idx
  on public.ai_world_random_receipts(campaign_id, created_at desc);

create index if not exists ai_world_random_receipts_target_idx
  on public.ai_world_random_receipts(campaign_id, target_scope, target_id)
  where target_scope is not null;

create or replace function private.normalize_world_random_bands_v1(
  p_sides integer,
  p_bands jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_bands jsonb := coalesce(p_bands, '[]'::jsonb);
  v_item jsonb;
  v_key text;
  v_label text;
  v_description text;
  v_payload jsonb;
  v_min integer;
  v_max integer;
  v_expected_min integer := 1;
  v_seen_keys text[] := '{}'::text[];
  v_normalized jsonb := '[]'::jsonb;
begin
  if p_sides is null or p_sides < 1 or p_sides > 1000000 then
    raise exception using errcode = '22023',
      message = 'world_random_sides_out_of_bounds';
  end if;

  if jsonb_typeof(v_bands) <> 'array' then
    raise exception using errcode = '22023',
      message = 'world_random_bands_must_be_array';
  end if;

  if jsonb_array_length(v_bands) = 0 then
    return '[]'::jsonb;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(v_bands)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023',
        message = 'world_random_band_must_be_object';
    end if;

    v_key := btrim(coalesce(v_item->>'key', ''));
    if length(v_key) < 1 or length(v_key) > 120 then
      raise exception using errcode = '22023',
        message = 'world_random_band_key_invalid';
    end if;

    if v_key = any(v_seen_keys) then
      raise exception using errcode = '22023',
        message = 'world_random_band_key_duplicate';
    end if;

    if coalesce(v_item->>'min', '') !~ '^[0-9]+$'
       or coalesce(v_item->>'max', '') !~ '^[0-9]+$' then
      raise exception using errcode = '22023',
        message = 'world_random_band_bounds_invalid';
    end if;

    v_min := (v_item->>'min')::integer;
    v_max := (v_item->>'max')::integer;

    if v_min <> v_expected_min
       or v_max < v_min
       or v_max > p_sides then
      raise exception using errcode = '22023',
        message = 'world_random_bands_must_be_ordered_gapless_nonoverlapping';
    end if;

    v_label := nullif(btrim(coalesce(v_item->>'label', '')), '');
    v_description := nullif(btrim(coalesce(v_item->>'description', '')), '');

    if v_item ? 'payload' then
      if jsonb_typeof(v_item->'payload') <> 'object' then
        raise exception using errcode = '22023',
          message = 'world_random_band_payload_must_be_object';
      end if;
      v_payload := v_item->'payload';
    else
      v_payload := null;
    end if;

    v_normalized := v_normalized || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'key', v_key,
          'label', v_label,
          'description', v_description,
          'min', v_min,
          'max', v_max,
          'payload', v_payload
        )
      )
    );

    v_seen_keys := array_append(v_seen_keys, v_key);
    v_expected_min := v_max + 1;
  end loop;

  if v_expected_min <> p_sides + 1 then
    raise exception using errcode = '22023',
      message = 'world_random_bands_must_cover_all_results';
  end if;

  return v_normalized;
end;
$$;

revoke all on function private.normalize_world_random_bands_v1(integer, jsonb)
  from public, anon, authenticated;

create or replace function private.secure_world_roll_dn_v1(
  p_sides integer
)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_bytes bytea;
  v_value bigint;
  v_range constant bigint := 4294967296;
  v_limit bigint;
begin
  if p_sides is null or p_sides < 1 or p_sides > 1000000 then
    raise exception using errcode = '22023',
      message = 'world_random_sides_out_of_bounds';
  end if;

  v_limit := v_range - mod(v_range, p_sides::bigint);

  loop
    v_bytes := extensions.gen_random_bytes(4);
    v_value :=
        pg_catalog.get_byte(v_bytes, 0)::bigint * 16777216
      + pg_catalog.get_byte(v_bytes, 1)::bigint * 65536
      + pg_catalog.get_byte(v_bytes, 2)::bigint * 256
      + pg_catalog.get_byte(v_bytes, 3)::bigint;

    exit when v_value < v_limit;
  end loop;

  return (mod(v_value, p_sides::bigint) + 1)::integer;
end;
$$;

revoke all on function private.secure_world_roll_dn_v1(integer)
  from public, anon, authenticated;

create or replace function public.resolve_world_random_v1(
  p_campaign_id uuid,
  p_decision_key text,
  p_sides integer default 100,
  p_bands jsonb default '[]'::jsonb,
  p_decision_kind text default 'generic',
  p_campaign_day integer default null,
  p_run_key text default null,
  p_target_scope text default null,
  p_target_id text default null,
  p_audit jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_decision_key, ''));
  v_kind text := lower(btrim(coalesce(p_decision_kind, 'generic')));
  v_run_key text := nullif(btrim(coalesce(p_run_key, '')), '');
  v_target_scope text := nullif(btrim(coalesce(p_target_scope, '')), '');
  v_target_id text := nullif(btrim(coalesce(p_target_id, '')), '');
  v_audit jsonb := coalesce(p_audit, '{}'::jsonb);
  v_bands jsonb;
  v_semantics jsonb;
  v_fingerprint text;
  v_result integer;
  v_matched jsonb;
  v_existing public.ai_world_random_receipts%rowtype;
  v_created public.ai_world_random_receipts%rowtype;
begin
  if p_campaign_id is null then
    raise exception using errcode = '22023',
      message = 'world_random_campaign_required';
  end if;

  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode = '42501',
      message = 'world_random_ai_world_only';
  end if;

  if length(v_key) < 1 or length(v_key) > 240 then
    raise exception using errcode = '22023',
      message = 'world_random_decision_key_invalid';
  end if;

  if length(v_kind) < 1
     or length(v_kind) > 80
     or v_kind !~ '^[a-z0-9][a-z0-9._:-]*$' then
    raise exception using errcode = '22023',
      message = 'world_random_decision_kind_invalid';
  end if;

  if p_campaign_day is not null and p_campaign_day < 1 then
    raise exception using errcode = '22023',
      message = 'world_random_campaign_day_invalid';
  end if;

  if v_run_key is not null and length(v_run_key) > 240 then
    raise exception using errcode = '22023',
      message = 'world_random_run_key_invalid';
  end if;

  if v_target_scope is not null and length(v_target_scope) > 80 then
    raise exception using errcode = '22023',
      message = 'world_random_target_scope_invalid';
  end if;

  if v_target_id is not null and length(v_target_id) > 240 then
    raise exception using errcode = '22023',
      message = 'world_random_target_id_invalid';
  end if;

  if jsonb_typeof(v_audit) <> 'object' then
    raise exception using errcode = '22023',
      message = 'world_random_audit_must_be_object';
  end if;

  v_bands := private.normalize_world_random_bands_v1(p_sides, p_bands);

  v_semantics := jsonb_build_object(
    'sides', p_sides,
    'bands', v_bands,
    'decision_kind', v_kind,
    'campaign_day', p_campaign_day,
    'run_key', v_run_key,
    'target_scope', v_target_scope,
    'target_id', v_target_id
  );

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_semantics::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text || ':' || v_key, 0)
  );

  select *
    into v_existing
  from public.ai_world_random_receipts
  where campaign_id = p_campaign_id
    and decision_key = v_key;

  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '22023',
        message = 'world_random_decision_key_conflict';
    end if;

    return jsonb_build_object(
      'receipt', to_jsonb(v_existing) - 'request_fingerprint',
      'replayed', true
    );
  end if;

  v_result := private.secure_world_roll_dn_v1(p_sides);

  if jsonb_array_length(v_bands) > 0 then
    select value
      into v_matched
    from jsonb_array_elements(v_bands)
    where v_result between (value->>'min')::integer and (value->>'max')::integer
    limit 1;
  end if;

  insert into public.ai_world_random_receipts (
    campaign_id, decision_key, decision_kind, sides, result,
    outcome_bands, matched_outcome_key, matched_outcome,
    campaign_day, run_key, target_scope, target_id, audit, request_fingerprint
  ) values (
    p_campaign_id, v_key, v_kind, p_sides, v_result,
    v_bands, v_matched->>'key', v_matched,
    p_campaign_day, v_run_key, v_target_scope, v_target_id, v_audit, v_fingerprint
  )
  returning * into v_created;

  return jsonb_build_object(
    'receipt', to_jsonb(v_created) - 'request_fingerprint',
    'replayed', false
  );
end;
$$;

comment on function public.resolve_world_random_v1(
  uuid, text, integer, jsonb, text, integer, text, text, text, jsonb
) is
  'AI-world-only World Resolver. Persists one authoritative dN result per campaign_id + decision_key; validates outcome bands before rolling.';

revoke all on function public.resolve_world_random_v1(
  uuid, text, integer, jsonb, text, integer, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.resolve_world_random_v1(
  uuid, text, integer, jsonb, text, integer, text, text, text, jsonb
) to service_role;
