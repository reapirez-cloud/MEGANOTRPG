do $$
declare
  v_def text;
  v_anchor text := E'  select * into v_intent\n  from public.ai_gm_post_turn_intent_receipts';
  v_insert text := E'  if v_commit.manager_user_id is null then\n    raise exception ''stage18_manager_user_required'';\n  end if;\n\n  -- Canonical world/quest RPCs authorize through auth.uid(). The post-turn\n  -- worker itself is service_role, so execute those RPCs as the real GM/owner\n  -- recorded on the immutable commit. The service-role claim remains intact.\n  perform set_config(''request.jwt.claim.sub'',v_commit.manager_user_id::text,true);\n\n  select * into v_intent\n  from public.ai_gm_post_turn_intent_receipts';
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='execute_ai_gm_post_turn_mutation_v3'
    and pg_get_function_identity_arguments(p.oid)=
      'p_intent_id uuid, p_commit_lease_token uuid, p_intent_lease_token uuid, p_tool_name text, p_args jsonb';

  if v_def is null then
    raise exception 'execute_ai_gm_post_turn_mutation_v3_not_found';
  end if;

  if position(
    'perform set_config(''request.jwt.claim.sub'',v_commit.manager_user_id::text,true);'
    in v_def
  )>0 then
    return;
  end if;

  if position(v_anchor in v_def)=0 then
    raise exception 'stage18_manager_identity_anchor_not_found';
  end if;

  v_def := replace(v_def,v_anchor,v_insert);
  execute v_def;
end;
$$;