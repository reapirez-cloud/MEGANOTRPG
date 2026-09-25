-- GPT-5.6 Luna junior-worker option + Stage 27 inventory profile normalization.
-- Luna is intentionally junior-only in the UI/runtime registry and is forced to
-- reasoning_effort=high by the Edge gateway/runtime code.

insert into public.ai_models (
  provider_key, model_key, display_name, enabled, is_base,
  gm_selectable, user_selectable,
  supports_tools, supports_json, supports_streaming, supports_vision,
  context_window, cost_tier, reasoning_tier, latency_tier,
  model_kind, access_scope
)
values (
  'openai-compatible',
  'gpt-5.6-luna',
  'GPT-5.6 Luna',
  true, false,
  false, false,
  true, true, true, true,
  1000000, 1, 5, 1,
  'agent', 'campaign'
)
on conflict (model_key) do update set
  provider_key=excluded.provider_key,
  display_name=excluded.display_name,
  enabled=true,
  is_base=false,
  gm_selectable=false,
  user_selectable=false,
  supports_tools=true,
  supports_json=true,
  supports_streaming=true,
  supports_vision=true,
  context_window=1000000,
  cost_tier=excluded.cost_tier,
  reasoning_tier=excluded.reasoning_tier,
  latency_tier=excluded.latency_tier,
  model_kind='agent',
  access_scope='campaign',
  updated_at=now();

create or replace function private.can_select_campaign_junior_model_v1(
  p_model_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.ai_models m
    where m.id=p_model_id
      and m.enabled=true
      and m.model_kind='agent'
      and m.access_scope='campaign'
      and m.supports_tools=true
      and m.supports_json=true
      and (
        m.model_key='gpt-5.6-luna'
        or m.gm_selectable=true
        or m.user_selectable=true
        or m.is_base=true
      )
  );
$$;

create or replace function private.is_ai_gm_junior_model_key_v1(
  p_model_key text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.ai_models m
    where m.model_key=lower(btrim(coalesce(p_model_key,'')))
      and m.enabled=true
      and m.model_kind='agent'
      and m.access_scope='campaign'
      and m.model_key in (
        'deepseek-v4.1-flash',
        'mimo-v2.5-pro',
        'gpt-5.6-luna'
      )
      and m.supports_tools=true
      and m.supports_json=true
  );
$$;

create or replace function private.ai_gm_junior_model_key_v1(
  p_campaign_id uuid
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    (
      select m.model_key
      from public.ai_agent_settings s
      join public.ai_models m on m.id=s.selected_model_id
      where s.campaign_id=p_campaign_id
        and s.agent_key='junior'
        and m.enabled=true
        and m.model_kind='agent'
        and m.access_scope='campaign'
        and m.model_key in (
          'deepseek-v4.1-flash',
          'mimo-v2.5-pro',
          'gpt-5.6-luna'
        )
        and m.supports_tools=true
        and m.supports_json=true
      limit 1
    ),
    'deepseek-v4.1-flash'
  );
$$;

create or replace function private.ai_gm_normalize_inventory_profile_v1(
  p_profile jsonb,
  p_semantic_role text,
  p_category text
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path=''
as $$
declare
  v_profile jsonb :=
    case when jsonb_typeof(p_profile)='object' then p_profile else '{}'::jsonb end;
  v_role text := left(lower(btrim(coalesce(p_semantic_role,''))),80);
  v_packing text;
  v_footprint text;
  v_stack_max numeric;
  v_has_complete_shape boolean;
begin
  if v_role='' then v_role:='other'; end if;

  v_packing:=lower(btrim(coalesce(v_profile->>'packing_mode','')));
  if v_packing not in ('instance','bulk_stack') then
    v_packing:=case
      when lower(btrim(coalesce(p_category,'')))='currency' then 'bulk_stack'
      else 'instance'
    end;
  end if;

  if v_packing='bulk_stack' then
    begin
      v_stack_max:=(v_profile->>'stack_max')::numeric;
    exception when others then
      v_stack_max:=null;
    end;
    if v_stack_max is null
       or v_stack_max < 2
       or trunc(v_stack_max)<>v_stack_max
       or v_stack_max > 100000
    then
      v_stack_max:=100;
    end if;

    return v_profile || jsonb_build_object(
      'semantic_role',v_role,
      'packing_mode','bulk_stack',
      'footprint_mode','compact_1x1',
      'shape_mask',jsonb_build_array('1'),
      'shape_width',1,
      'shape_height',1,
      'rotatable',false,
      'stack_max',v_stack_max::integer
    );
  end if;

  v_footprint:=lower(btrim(coalesce(v_profile->>'footprint_mode','')));
  v_has_complete_shape :=
    v_footprint='shape'
    and jsonb_typeof(v_profile->'shape_width')='number'
    and jsonb_typeof(v_profile->'shape_height')='number'
    and jsonb_typeof(v_profile->'shape_mask')='array'
    and jsonb_typeof(v_profile->'rotatable')='boolean';

  if v_has_complete_shape then
    return (v_profile - 'stack_max') || jsonb_build_object(
      'semantic_role',v_role,
      'packing_mode','instance',
      'footprint_mode','shape'
    );
  end if;

  return (v_profile - 'stack_max') || jsonb_build_object(
    'semantic_role',v_role,
    'packing_mode','instance',
    'footprint_mode','compact_1x1',
    'shape_mask',jsonb_build_array('1'),
    'shape_width',1,
    'shape_height',1,
    'rotatable',false
  );
end;
$$;

revoke all on function private.ai_gm_normalize_inventory_profile_v1(jsonb,text,text)
  from public,anon,authenticated;
grant execute on function private.ai_gm_normalize_inventory_profile_v1(jsonb,text,text)
  to service_role;

do $patch$
declare
  v_def text;
  v_old text := E'    if v_profile is null then\n      raise exception using errcode=''22023'',message=''item_resolver_profile_required_for_new_definition'';\n    end if;\n    perform private.cheburashka_assert_inventory_profile_v1(v_profile);';
  v_new text := E'    v_profile:=private.ai_gm_normalize_inventory_profile_v1(\n      v_profile,v_semantic_role,v_category\n    );\n    perform private.cheburashka_assert_inventory_profile_v1(v_profile);';
begin
  select pg_get_functiondef(
    'public.ai_gm_resolve_item_definition_v1(uuid,uuid,jsonb)'::regprocedure
  ) into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'ai_gm_resolve_item_definition_v1 patch anchor not found';
  end if;

  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end;
$patch$;

comment on function private.ai_gm_normalize_inventory_profile_v1(jsonb,text,text) is
  'Normalizes incomplete AI-authored inventory profiles into a valid Chasovoy baseline before strict validation. Semantic role is sourced from the top-level item card; complete explicit shape profiles are preserved.';
