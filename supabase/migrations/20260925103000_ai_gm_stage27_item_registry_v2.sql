-- Stage 27 v2: semantic Item Registry before Cheburashka.
-- Junior classifies/searches by semantic identity; reusable definitions are
-- resolved or authored once, then concrete inventory is committed separately.

create table if not exists private.ai_item_definition_registry_v1 (
  definition_id uuid primary key references public.reference_definitions(id) on delete cascade,
  campaign_id uuid null references public.campaigns(id) on delete cascade,
  scope text not null check (scope in ('system','campaign')),
  semantic_key text not null,
  normalized_name text not null,
  category text not null,
  semantic_role text not null default 'other',
  aliases text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  denomination text null,
  source text not null default 'resolved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope='system' and campaign_id is null)
    or (scope='campaign' and campaign_id is not null)
  )
);

create unique index if not exists ai_item_registry_system_key_uidx
  on private.ai_item_definition_registry_v1(semantic_key)
  where scope='system';

create unique index if not exists ai_item_registry_campaign_key_uidx
  on private.ai_item_definition_registry_v1(campaign_id,semantic_key)
  where scope='campaign';

create index if not exists ai_item_registry_name_idx
  on private.ai_item_definition_registry_v1(normalized_name,category);

create index if not exists ai_item_registry_aliases_gin
  on private.ai_item_definition_registry_v1 using gin(aliases);

create index if not exists ai_item_registry_tags_gin
  on private.ai_item_definition_registry_v1 using gin(tags);

create table if not exists private.ai_gm_inventory_delta_receipts_v1 (
  command_id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_message_id bigint not null,
  character_id uuid not null references public.characters(id) on delete cascade,
  action text not null check (action in ('grant','consume','remove')),
  definition_id uuid null references public.reference_definitions(id) on delete set null,
  item_id uuid null,
  quantity integer not null check (quantity >= 1),
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_gm_inventory_delta_source_idx
  on private.ai_gm_inventory_delta_receipts_v1(campaign_id,source_message_id,character_id);

create or replace function private.ai_item_normalize_v1(p_text text)
returns text
language sql
immutable
set search_path=''
as $$
  select lower(regexp_replace(btrim(coalesce(p_text,'')), '[[:space:]]+', ' ', 'g'))
$$;

create or replace function private.ai_item_semantic_key_v1(
  p_category text,
  p_semantic_role text,
  p_name text,
  p_currency_key text,
  p_identity_key text
)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when nullif(lower(btrim(coalesce(p_currency_key,''))),'') is not null
      then 'currency:' || lower(btrim(p_currency_key))
    when nullif(lower(btrim(coalesce(p_identity_key,''))),'') is not null
      then 'identity:' || private.ai_item_normalize_v1(p_identity_key)
    else concat_ws(
      ':',
      coalesce(nullif(lower(btrim(coalesce(p_category,''))),''),'other'),
      coalesce(nullif(lower(btrim(coalesce(p_semantic_role,''))),''),'other'),
      private.ai_item_normalize_v1(p_name)
    )
  end
$$;

create or replace function private.ai_item_registry_upsert_v1(
  p_definition_id uuid,
  p_semantic_key text,
  p_normalized_name text,
  p_category text,
  p_semantic_role text,
  p_aliases text[],
  p_tags text[],
  p_denomination text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_def public.reference_definitions%rowtype;
  v_existing uuid;
begin
  select * into v_def
  from public.reference_definitions d
  where d.id=p_definition_id and d.kind='item' and d.status='active';

  if v_def.id is null then
    raise exception using errcode='22023',message='item_registry_definition_unavailable';
  end if;

  begin
    insert into private.ai_item_definition_registry_v1(
      definition_id,campaign_id,scope,semantic_key,normalized_name,
      category,semantic_role,aliases,tags,denomination,source,updated_at
    ) values (
      v_def.id,v_def.campaign_id,v_def.scope,p_semantic_key,p_normalized_name,
      p_category,p_semantic_role,coalesce(p_aliases,'{}'::text[]),
      coalesce(p_tags,'{}'::text[]),nullif(lower(btrim(coalesce(p_denomination,''))),''),
      coalesce(nullif(p_source,''),'resolved'),now()
    )
    on conflict (definition_id) do update
    set semantic_key=excluded.semantic_key,
        normalized_name=excluded.normalized_name,
        category=excluded.category,
        semantic_role=excluded.semantic_role,
        aliases=excluded.aliases,
        tags=excluded.tags,
        denomination=excluded.denomination,
        source=excluded.source,
        updated_at=now();
    return v_def.id;
  exception when unique_violation then
    select r.definition_id into v_existing
    from private.ai_item_definition_registry_v1 r
    where r.semantic_key=p_semantic_key
      and (
        (v_def.scope='system' and r.scope='system')
        or
        (v_def.scope='campaign' and r.scope='campaign' and r.campaign_id=v_def.campaign_id)
      )
    limit 1;
    if v_existing is null then raise; end if;
    return v_existing;
  end;
end;
$$;

-- Complete the standard D&D denomination library once, without campaign copies.
do $$
declare
  v record;
  v_id uuid;
begin
  for v in
    select *
    from (values
      ('currency-electrum-coin','Электрумные монеты','ep'),
      ('currency-platinum-coin','Платиновые монеты','pp')
    ) as x(slug,name,denomination)
  loop
    select d.id into v_id
    from public.reference_definitions d
    join public.reference_definition_revisions r
      on r.definition_id=d.id and r.revision=d.current_revision
    where d.kind='item' and d.scope='system' and d.status='active'
      and lower(coalesce(r.data->>'denomination',''))=v.denomination
    limit 1;

    if v_id is null then
      insert into public.reference_definitions(
        kind,scope,campaign_id,slug,visibility,status,source_kind,
        source_label,external_id,current_revision,created_by
      ) values (
        'item','system',null,v.slug,'campaign','active','system',
        'MEGANOT D&D currency',v.slug,1,null
      ) returning id into v_id;

      insert into public.reference_definition_revisions(
        definition_id,revision,name,summary,rules_text,mechanics,data,created_by
      ) values (
        v_id,1,v.name,'Физические монеты одного номинала.','','[]'::jsonb,
        jsonb_build_object(
          'category','currency',
          'stack_mode','stack',
          'usage_mode','none',
          'denomination',v.denomination,
          'inventory_profile',jsonb_build_object(
            'semantic_role','currency.coin',
            'packing_mode','bulk_stack',
            'footprint_mode','compact_1x1',
            'shape_width',1,
            'shape_height',1,
            'rotatable',false,
            'shape_mask',jsonb_build_array('1'),
            'stack_max',100
          )
        ),
        null
      );
    end if;
  end loop;
end
$$;

create or replace function public.ai_gm_resolve_item_definition_v1(
  p_campaign_id uuid,
  p_actor_user_id uuid,
  p_request jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  v_req jsonb := coalesce(p_request,'{}'::jsonb);
  v_definition_id uuid;
  v_def public.reference_definitions%rowtype;
  v_rev public.reference_definition_revisions%rowtype;
  v_name text;
  v_norm text;
  v_category text;
  v_semantic_role text;
  v_currency_key text;
  v_identity_key text;
  v_semantic_key text;
  v_summary text;
  v_usage_mode text;
  v_stack_mode text;
  v_aliases text[] := '{}'::text[];
  v_tags text[] := '{}'::text[];
  v_profile jsonb;
  v_mechanics jsonb := '[]'::jsonb;
  v_data jsonb;
  v_slug text;
  v_allow_create boolean := coalesce((v_req->>'allow_create')::boolean,true);
  v_unique boolean := coalesce((v_req->>'unique_identity')::boolean,false);
  v_created boolean := false;
  v_source text := 'existing';
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501',message='service_role_required';
  end if;
  if p_campaign_id is null or p_actor_user_id is null then
    raise exception using errcode='22023',message='item_resolver_identity_required';
  end if;
  if jsonb_typeof(v_req)<>'object' then
    raise exception using errcode='22023',message='item_resolver_request_invalid';
  end if;
  if not private.is_campaign_manager(p_campaign_id,p_actor_user_id) then
    raise exception using errcode='42501',message='campaign_manager_required';
  end if;

  perform set_config('request.jwt.claim.sub',p_actor_user_id::text,true);

  v_name := left(btrim(coalesce(v_req->>'canonical_name',v_req->>'name','')),160);
  v_norm := private.ai_item_normalize_v1(v_name);
  v_category := lower(btrim(coalesce(v_req->>'category','other')));
  v_semantic_role := lower(btrim(coalesce(v_req->>'semantic_role','other')));
  v_currency_key := lower(btrim(coalesce(v_req->>'currency_key','')));
  v_identity_key := lower(btrim(coalesce(v_req->>'identity_key','')));
  v_summary := left(btrim(coalesce(v_req->>'summary',v_req->>'description','')),4000);
  v_usage_mode := lower(btrim(coalesce(v_req->>'usage_mode','none')));
  v_profile := case when jsonb_typeof(v_req->'inventory_profile')='object'
    then v_req->'inventory_profile' else null end;
  v_mechanics := coalesce(v_req->'mechanics','[]'::jsonb);

  if v_currency_key<>'' and v_currency_key not in ('cp','sp','ep','gp','pp') then
    raise exception using errcode='22023',message='item_resolver_currency_invalid';
  end if;
  if v_category not in (
    'equipment','consumable','tool','book','trinket','quest',
    'material','currency','container','other'
  ) then
    raise exception using errcode='22023',message='item_resolver_category_invalid';
  end if;
  if jsonb_typeof(v_mechanics)<>'array' then
    raise exception using errcode='22023',message='item_resolver_mechanics_invalid';
  end if;

  if v_req ? 'aliases' then
    if jsonb_typeof(v_req->'aliases')<>'array' then
      raise exception using errcode='22023',message='item_resolver_aliases_invalid';
    end if;
    select coalesce(array_agg(distinct private.ai_item_normalize_v1(value)
      order by private.ai_item_normalize_v1(value)),'{}'::text[])
    into v_aliases
    from jsonb_array_elements_text(v_req->'aliases') a(value)
    where private.ai_item_normalize_v1(value)<>'';
  end if;

  if v_req ? 'tags' then
    if jsonb_typeof(v_req->'tags')<>'array' then
      raise exception using errcode='22023',message='item_resolver_tags_invalid';
    end if;
    select coalesce(array_agg(distinct lower(btrim(value))
      order by lower(btrim(value))),'{}'::text[])
    into v_tags
    from jsonb_array_elements_text(v_req->'tags') t(value)
    where btrim(value)<>'';
  end if;

  begin
    v_definition_id := nullif(btrim(coalesce(v_req->>'definition_id','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='item_resolver_definition_id_invalid';
  end;

  if v_definition_id is not null then
    select d.* into v_def
    from public.reference_definitions d
    where d.id=v_definition_id
      and d.kind='item'
      and d.status='active'
      and (d.scope='system' or d.campaign_id=p_campaign_id)
    limit 1;
    if v_def.id is null then
      raise exception using errcode='22023',message='item_resolver_explicit_definition_unavailable';
    end if;
    v_source:='explicit';
  end if;

  if v_def.id is null and v_currency_key<>'' then
    select d.* into v_def
    from public.reference_definitions d
    join public.reference_definition_revisions r
      on r.definition_id=d.id and r.revision=d.current_revision
    where d.kind='item' and d.status='active' and d.scope='system'
      and lower(coalesce(r.data->>'denomination',''))=v_currency_key
    order by d.slug
    limit 1;
    if v_def.id is not null then v_source:='currency'; end if;
  end if;

  if v_name='' and v_def.id is null and v_currency_key='' then
    raise exception using errcode='22023',message='item_resolver_name_required';
  end if;

  if v_currency_key='cp' then v_name:='Медные монеты';
  elsif v_currency_key='sp' then v_name:='Серебряные монеты';
  elsif v_currency_key='ep' then v_name:='Электрумные монеты';
  elsif v_currency_key='gp' then v_name:='Золотые монеты';
  elsif v_currency_key='pp' then v_name:='Платиновые монеты';
  end if;
  v_norm:=private.ai_item_normalize_v1(v_name);
  if v_currency_key<>'' then
    v_category:='currency';
    v_semantic_role:='currency.coin';
  end if;

  v_semantic_key:=private.ai_item_semantic_key_v1(
    v_category,v_semantic_role,v_name,v_currency_key,v_identity_key
  );

  if v_def.id is null then
    select d.* into v_def
    from private.ai_item_definition_registry_v1 reg
    join public.reference_definitions d on d.id=reg.definition_id
    where reg.semantic_key=v_semantic_key and d.status='active'
      and (
        (v_unique and reg.scope='campaign' and reg.campaign_id=p_campaign_id)
        or (not v_unique and reg.scope='system')
        or (not v_unique and reg.scope='campaign' and reg.campaign_id=p_campaign_id)
      )
    order by case
      when v_unique and reg.scope='campaign' then 0
      when not v_unique and reg.scope='system' then 0
      else 1 end,
      reg.updated_at
    limit 1;
    if v_def.id is not null then v_source:='registry_key'; end if;
  end if;

  if v_def.id is null and v_norm<>'' then
    select d.* into v_def
    from public.reference_definitions d
    join public.reference_definition_revisions r
      on r.definition_id=d.id and r.revision=d.current_revision
    where d.kind='item' and d.status='active'
      and (d.scope='system' or d.campaign_id=p_campaign_id)
      and private.ai_item_normalize_v1(r.name)=v_norm
      and (v_category='other'
        or coalesce(nullif(lower(r.data->>'category'),''),'other')=v_category)
      and (v_semantic_role='other'
        or coalesce(lower(r.data->'inventory_profile'->>'semantic_role'),'other')=v_semantic_role
        or coalesce(lower(r.data->'catalog'->>'semantic_role'),'other')=v_semantic_role)
    order by case
      when v_unique and d.scope='campaign' then 0
      when not v_unique and d.scope='system' then 0
      else 1 end,
      d.updated_at desc
    limit 1;
    if v_def.id is not null then v_source:='exact_name'; end if;
  end if;

  if v_def.id is null and v_norm<>'' then
    select d.* into v_def
    from private.ai_item_definition_registry_v1 reg
    join public.reference_definitions d on d.id=reg.definition_id
    where d.status='active'
      and reg.aliases @> array[v_norm]
      and (reg.scope='system'
        or (reg.scope='campaign' and reg.campaign_id=p_campaign_id))
      and (v_category='other' or reg.category=v_category)
    order by case when d.scope='system' and not v_unique then 0 else 1 end,
      reg.updated_at desc
    limit 1;
    if v_def.id is not null then v_source:='alias'; end if;
  end if;

  if v_def.id is null and not v_allow_create then
    return jsonb_build_object(
      'state','not_found','semantic_key',v_semantic_key,
      'normalized_name',v_norm,'category',v_category,
      'semantic_role',v_semantic_role,'aliases',to_jsonb(v_aliases),
      'tags',to_jsonb(v_tags),'created',false,'reused',false
    );
  end if;

  if v_def.id is null then
    if v_profile is null then
      raise exception using errcode='22023',message='item_resolver_profile_required_for_new_definition';
    end if;
    perform private.cheburashka_assert_inventory_profile_v1(v_profile);
    v_stack_mode:=case when v_profile->>'packing_mode'='bulk_stack'
      then 'stack' else 'instance' end;
    if v_usage_mode not in ('none','quantity','charges') then
      raise exception using errcode='22023',message='item_resolver_usage_mode_invalid';
    end if;

    v_slug:='ai-item-' || md5(v_semantic_key);

    select d.* into v_def
    from public.reference_definitions d
    where d.kind='item' and d.scope='campaign'
      and d.campaign_id=p_campaign_id and d.slug=v_slug and d.status='active'
    limit 1;

    if v_def.id is null then
      v_data:=jsonb_build_object(
        'category',v_category,'stack_mode',v_stack_mode,
        'usage_mode',v_usage_mode,'inventory_profile',v_profile,
        'catalog',jsonb_build_object(
          'semantic_key',v_semantic_key,'semantic_role',v_semantic_role,
          'aliases',to_jsonb(v_aliases),'tags',to_jsonb(v_tags),
          'normalized_name',v_norm,'source','ai_gm_stage27'
        )
      );
      v_definition_id:=public.create_reference_definition_v2(
        p_campaign_id,'item',v_slug,'campaign','active','custom',
        'AI GM item registry','ai-item:'||v_semantic_key,
        v_name,v_summary,'',v_mechanics,v_data
      );
      select * into v_def
      from public.reference_definitions d where d.id=v_definition_id;
      v_created:=true;
      v_source:='authored';
    else
      v_source:='stable_slug';
    end if;
  end if;

  select * into v_rev
  from public.reference_definition_revisions r
  where r.definition_id=v_def.id and r.revision=v_def.current_revision;
  if v_rev.definition_id is null then
    raise exception using errcode='22023',message='item_resolver_revision_missing';
  end if;

  if v_category='other' then
    v_category:=coalesce(nullif(lower(v_rev.data->>'category'),''),'other');
  end if;
  if v_semantic_role='other' then
    v_semantic_role:=coalesce(
      nullif(lower(v_rev.data->'inventory_profile'->>'semantic_role'),''),
      nullif(lower(v_rev.data->'catalog'->>'semantic_role'),''),
      'other'
    );
  end if;
  if v_currency_key='' then
    v_currency_key:=lower(coalesce(v_rev.data->>'denomination',''));
  end if;
  v_norm:=private.ai_item_normalize_v1(v_rev.name);
  v_semantic_key:=private.ai_item_semantic_key_v1(
    v_category,v_semantic_role,v_rev.name,v_currency_key,v_identity_key
  );

  v_definition_id:=private.ai_item_registry_upsert_v1(
    v_def.id,v_semantic_key,v_norm,v_category,v_semantic_role,
    array(select distinct x from unnest(v_aliases || array[v_norm]) x where x<>''),
    v_tags,v_currency_key,v_source
  );

  if v_definition_id is distinct from v_def.id then
    select * into v_def from public.reference_definitions d where d.id=v_definition_id;
    select * into v_rev
    from public.reference_definition_revisions r
    where r.definition_id=v_def.id and r.revision=v_def.current_revision;
    v_created:=false;
    v_source:='registry_canonical';
  end if;

  return jsonb_build_object(
    'state','resolved','definition_id',v_def.id,
    'definition_revision',v_def.current_revision,'scope',v_def.scope,
    'slug',v_def.slug,'name',v_rev.name,'summary',v_rev.summary,
    'category',coalesce(nullif(lower(v_rev.data->>'category'),''),v_category),
    'semantic_role',coalesce(
      nullif(lower(v_rev.data->'inventory_profile'->>'semantic_role'),''),
      nullif(lower(v_rev.data->'catalog'->>'semantic_role'),''),
      v_semantic_role
    ),
    'stack_mode',coalesce(v_rev.data->>'stack_mode','instance'),
    'usage_mode',coalesce(v_rev.data->>'usage_mode','none'),
    'inventory_profile',v_rev.data->'inventory_profile',
    'semantic_key',v_semantic_key,'resolution_source',v_source,
    'created',v_created,'reused',not v_created
  );
end;
$$;

create or replace function public.ai_gm_commit_inventory_delta_v1(
  p_campaign_id uuid,
  p_actor_user_id uuid,
  p_source_message_id bigint,
  p_args jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  v_args jsonb := coalesce(p_args,'{}'::jsonb);
  v_action text := lower(btrim(coalesce(v_args->>'action','')));
  v_character_id uuid;
  v_item_id uuid;
  v_item jsonb := coalesce(v_args->'item','{}'::jsonb);
  v_quantity integer;
  v_definition_id uuid;
  v_definition_revision integer;
  v_resolution jsonb;
  v_rev public.reference_definition_revisions%rowtype;
  v_stack_mode text;
  v_usage_mode text;
  v_category text;
  v_stack_max integer;
  v_remaining integer;
  v_chunk integer;
  v_step integer := 0;
  v_existing public.character_inventory_items%rowtype;
  v_command_id uuid;
  v_subcommand_id uuid;
  v_semantic_key text;
  v_input jsonb;
  v_op jsonb;
  v_results jsonb := '[]'::jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_receipt private.ai_gm_inventory_delta_receipts_v1%rowtype;
  v_result jsonb;
begin
  if v_role is distinct from 'service_role' then
    raise exception using errcode='42501',message='service_role_required';
  end if;
  if p_campaign_id is null or p_actor_user_id is null or p_source_message_id is null then
    raise exception using errcode='22023',message='inventory_executor_identity_required';
  end if;
  if jsonb_typeof(v_args)<>'object' then
    raise exception using errcode='22023',message='inventory_executor_args_must_be_object';
  end if;
  if v_action not in ('grant','consume','remove') then
    raise exception using errcode='22023',message='inventory_executor_action_invalid';
  end if;

  begin
    v_character_id:=nullif(btrim(coalesce(v_args->>'character_id','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='inventory_executor_character_id_invalid';
  end;
  if v_character_id is null then
    raise exception using errcode='22023',message='inventory_executor_character_id_required';
  end if;
  if not exists(
    select 1 from public.characters c
    where c.id=v_character_id and c.campaign_id=p_campaign_id
  ) then
    raise exception using errcode='22023',message='inventory_executor_character_unavailable';
  end if;
  if not private.is_campaign_manager(p_campaign_id,p_actor_user_id) then
    raise exception using errcode='42501',message='campaign_manager_required';
  end if;

  perform set_config('request.jwt.claim.sub',p_actor_user_id::text,true);

  if v_action='grant' then
    if jsonb_typeof(v_item)<>'object' then
      raise exception using errcode='22023',message='inventory_executor_item_invalid';
    end if;
    v_quantity:=coalesce(
      nullif(v_item->>'quantity','')::integer,
      nullif(v_args->>'quantity','')::integer,1
    );
    if v_quantity<1 or v_quantity>100000 then
      raise exception using errcode='22023',message='inventory_executor_quantity_invalid';
    end if;

    v_resolution:=public.ai_gm_resolve_item_definition_v1(
      p_campaign_id,p_actor_user_id,v_item || jsonb_build_object('allow_create',true)
    );
    if v_resolution->>'state'<>'resolved' then
      raise exception using errcode='22023',message='inventory_executor_definition_not_resolved';
    end if;

    v_definition_id:=(v_resolution->>'definition_id')::uuid;
    v_definition_revision:=(v_resolution->>'definition_revision')::integer;
    select * into v_rev
    from public.reference_definition_revisions r
    where r.definition_id=v_definition_id and r.revision=v_definition_revision;
    if v_rev.definition_id is null then
      raise exception using errcode='22023',message='inventory_executor_definition_revision_missing';
    end if;

    v_stack_mode:=coalesce(v_rev.data->>'stack_mode','instance');
    v_usage_mode:=coalesce(v_rev.data->>'usage_mode','none');
    v_category:=coalesce(v_rev.data->>'category','other');
    v_stack_max:=case when v_stack_mode='stack'
      then coalesce(nullif(v_rev.data->'inventory_profile'->>'stack_max','')::integer,100000)
      else 1 end;

    v_semantic_key:=concat_ws(
      '|','stage27',p_campaign_id::text,p_source_message_id::text,'grant',
      v_character_id::text,v_definition_id::text,v_definition_revision::text,v_quantity::text
    );
    v_command_id:=md5(v_semantic_key)::uuid;

    select * into v_receipt
    from private.ai_gm_inventory_delta_receipts_v1 r
    where r.command_id=v_command_id;
    if v_receipt.command_id is not null then
      return v_receipt.result || jsonb_build_object('replayed',true);
    end if;

    v_remaining:=v_quantity;

    if v_stack_mode='stack' then
      for v_existing in
        select * from public.character_inventory_items i
        where i.character_id=v_character_id
          and i.definition_id=v_definition_id
          and i.definition_revision=v_definition_revision
          and i.stack_mode='stack'
          and i.quantity < v_stack_max
        order by i.created_at,i.id
        for update
      loop
        exit when v_remaining<=0;
        v_chunk:=least(v_remaining,v_stack_max-v_existing.quantity);
        if v_chunk<=0 then continue; end if;
        v_step:=v_step+1;
        v_subcommand_id:=md5(v_command_id::text||'|update|'||v_step::text)::uuid;
        v_op:=public.update_inventory_item_v3(
          v_character_id,v_existing.id,
          jsonb_build_object('quantity',v_existing.quantity+v_chunk),
          null,v_existing.version,v_subcommand_id
        );
        v_results:=v_results || jsonb_build_array(v_op);
        v_ids:=v_ids || jsonb_build_array(coalesce(v_op->>'itemId',v_op->'after'->>'id'));
        v_remaining:=v_remaining-v_chunk;
      end loop;

      while v_remaining>0 loop
        v_chunk:=least(v_remaining,v_stack_max);
        v_step:=v_step+1;
        v_subcommand_id:=md5(v_command_id::text||'|create|'||v_step::text)::uuid;
        v_input:=jsonb_build_object(
          'name',v_rev.name,'quantity',v_chunk,'category',v_category,
          'definition_id',v_definition_id,
          'definition_revision',v_definition_revision,
          'stack_mode','stack','usage_mode',v_usage_mode
        );
        if jsonb_typeof(v_item->'item_state')='object' then
          v_input:=v_input||jsonb_build_object('item_state',v_item->'item_state');
        end if;
        v_op:=public.create_inventory_item_v3(
          v_character_id,v_input,null,v_subcommand_id
        );
        v_results:=v_results || jsonb_build_array(v_op);
        v_ids:=v_ids || jsonb_build_array(coalesce(v_op->>'itemId',v_op->'after'->>'id'));
        v_remaining:=v_remaining-v_chunk;
      end loop;
    else
      while v_remaining>0 loop
        v_step:=v_step+1;
        v_subcommand_id:=md5(v_command_id::text||'|instance|'||v_step::text)::uuid;
        v_input:=jsonb_build_object(
          'name',v_rev.name,'quantity',1,'category',v_category,
          'definition_id',v_definition_id,
          'definition_revision',v_definition_revision,
          'stack_mode','instance','usage_mode',v_usage_mode
        );
        if jsonb_typeof(v_item->'item_state')='object' then
          v_input:=v_input||jsonb_build_object('item_state',v_item->'item_state');
        end if;
        v_op:=public.create_inventory_item_v3(
          v_character_id,v_input,null,v_subcommand_id
        );
        v_results:=v_results || jsonb_build_array(v_op);
        v_ids:=v_ids || jsonb_build_array(coalesce(v_op->>'itemId',v_op->'after'->>'id'));
        v_remaining:=v_remaining-1;
      end loop;
    end if;

    v_result:=jsonb_build_object(
      'action','grant','character_id',v_character_id,'quantity',v_quantity,
      'definition',v_resolution,'definition_id',v_definition_id,
      'definition_revision',v_definition_revision,'command_id',v_command_id,
      'inventory_results',v_results,
      'inventory_result',coalesce(v_results->0,'{}'::jsonb),
      'resolved_item_ids',v_ids,'canonical_state_changed',true,'replayed',false
    );

    insert into private.ai_gm_inventory_delta_receipts_v1(
      command_id,campaign_id,source_message_id,character_id,action,
      definition_id,item_id,quantity,result
    ) values (
      v_command_id,p_campaign_id,p_source_message_id,v_character_id,'grant',
      v_definition_id,null,v_quantity,v_result
    );
    return v_result;
  end if;

  begin
    v_item_id:=nullif(btrim(coalesce(v_args->>'item_id','')),'')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='inventory_executor_item_id_invalid';
  end;
  if v_item_id is null then
    raise exception using errcode='22023',message='inventory_executor_item_id_required';
  end if;

  if v_action='consume' then
    v_quantity:=coalesce(nullif(v_args->>'quantity','')::integer,1);
    if v_quantity<1 then
      raise exception using errcode='22023',message='inventory_executor_consume_quantity_invalid';
    end if;
  else
    select quantity into v_quantity
    from public.character_inventory_items i
    where i.id=v_item_id and i.character_id=v_character_id;
    if v_quantity is null then
      raise exception using errcode='22023',message='inventory_executor_item_not_found';
    end if;
  end if;

  v_semantic_key:=concat_ws(
    '|','stage27',p_campaign_id::text,p_source_message_id::text,v_action,
    v_character_id::text,v_item_id::text,v_quantity::text
  );
  v_command_id:=md5(v_semantic_key)::uuid;

  select * into v_receipt
  from private.ai_gm_inventory_delta_receipts_v1 r
  where r.command_id=v_command_id;
  if v_receipt.command_id is not null then
    return v_receipt.result || jsonb_build_object('replayed',true);
  end if;

  select * into v_existing
  from public.character_inventory_items i
  where i.id=v_item_id and i.character_id=v_character_id
  for update;
  if v_existing.id is null then
    raise exception using errcode='22023',message='inventory_executor_item_not_found';
  end if;
  if v_quantity>v_existing.quantity then
    raise exception using errcode='22023',message='inventory_executor_consume_quantity_invalid';
  end if;

  v_subcommand_id:=md5(v_command_id::text||'|mutate')::uuid;
  if v_action='remove' or v_quantity=v_existing.quantity then
    v_op:=public.remove_inventory_item_v1(
      v_character_id,v_item_id,v_existing.version,v_subcommand_id
    );
  else
    v_op:=public.update_inventory_item_v3(
      v_character_id,v_item_id,
      jsonb_build_object('quantity',v_existing.quantity-v_quantity),
      null,v_existing.version,v_subcommand_id
    );
  end if;

  v_result:=jsonb_build_object(
    'action',v_action,'character_id',v_character_id,'item_id',v_item_id,
    'quantity',v_quantity,'command_id',v_command_id,'inventory_result',v_op,
    'inventory_results',jsonb_build_array(v_op),
    'resolved_item_ids',jsonb_build_array(v_item_id),
    'canonical_state_changed',true,'replayed',false
  );

  insert into private.ai_gm_inventory_delta_receipts_v1(
    command_id,campaign_id,source_message_id,character_id,action,
    definition_id,item_id,quantity,result
  ) values (
    v_command_id,p_campaign_id,p_source_message_id,v_character_id,v_action,
    v_existing.definition_id,v_item_id,v_quantity,v_result
  );

  return v_result;
end;
$$;

revoke all on function public.ai_gm_resolve_item_definition_v1(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.ai_gm_resolve_item_definition_v1(uuid,uuid,jsonb)
  to service_role;

revoke all on function public.ai_gm_commit_inventory_delta_v1(uuid,uuid,bigint,jsonb)
  from public,anon,authenticated;
grant execute on function public.ai_gm_commit_inventory_delta_v1(uuid,uuid,bigint,jsonb)
  to service_role;
