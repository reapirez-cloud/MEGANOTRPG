-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI world fresh-slot bootstrap v1.
--
-- AI-world campaigns are deliberately fiction-empty at first open. The old
-- public.campaigns AFTER INSERT trigger stack only installs/certifies rule
-- catalog data, so running ~60 historical installers for every empty AI slot is
-- both slow and increasingly brittle.
--
-- This migration:
--   1. skips that legacy catalog trigger stack only for ai-world-* campaigns;
--   2. exposes a bounded class list from the best certified non-AI built-in catalog;
--   3. lazily clones only the chosen class + its subclasses into the AI campaign;
--   4. normalizes legacy subclass_spell method kinds to the current class_spell
--      contract while cloning;
--   5. keeps open_ai_world_slot_v2 fiction-empty and fast.

create or replace function private.ai_world_normalize_rule_json_v1(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_type text;
  v_result jsonb;
begin
  if p_value is null then
    return null;
  end if;

  v_type:=jsonb_typeof(p_value);

  if v_type='array' then
    select coalesce(
      jsonb_agg(private.ai_world_normalize_rule_json_v1(e.value) order by e.ord),
      '[]'::jsonb
    )
    into v_result
    from jsonb_array_elements(p_value) with ordinality e(value,ord);
    return v_result;
  end if;

  if v_type='object' then
    select coalesce(
      jsonb_object_agg(
        e.key,
        case
          when e.key='kind' and e.value='"subclass_spell"'::jsonb
            then '"class_spell"'::jsonb
          else private.ai_world_normalize_rule_json_v1(e.value)
        end
      ),
      '{}'::jsonb
    )
    into v_result
    from jsonb_each(p_value) e;
    return v_result;
  end if;

  return p_value;
end;
$function$;

revoke all on function private.ai_world_normalize_rule_json_v1(jsonb)
  from public,anon,authenticated;

create or replace function private.ai_world_rules_source_campaign_v1()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select t.campaign_id
  from public.rule_templates t
  where t.is_builtin=true
    and t.is_active=true
    and not exists(
      select 1
      from public.ai_world_slots s
      where s.campaign_id=t.campaign_id
    )
  group by t.campaign_id
  having count(*) filter(where t.kind='class') >= 10
  order by
    count(*) filter(where t.kind='class') desc,
    count(*) desc,
    t.campaign_id
  limit 1
$function$;

revoke all on function private.ai_world_rules_source_campaign_v1()
  from public,anon,authenticated;
grant execute on function private.ai_world_rules_source_campaign_v1()
  to service_role;

create or replace function public.list_ai_world_class_templates_v1(
  p_campaign_id uuid
)
returns table(id uuid,name text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_source_campaign_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if not exists(
    select 1
    from public.ai_world_slots s
    where s.campaign_id=p_campaign_id
      and s.owner_user_id=v_user_id
  ) then
    raise exception 'ai_world_owner_required';
  end if;

  v_source_campaign_id:=private.ai_world_rules_source_campaign_v1();
  if v_source_campaign_id is null then
    raise exception 'ai_world_rules_source_missing';
  end if;

  return query
  select t.id,t.name
  from public.rule_templates t
  where t.campaign_id=v_source_campaign_id
    and t.kind='class'
    and t.is_builtin=true
    and t.is_active=true
  order by t.name,t.catalog_key,t.id;
end;
$function$;

revoke all on function public.list_ai_world_class_templates_v1(uuid)
  from public,anon;
grant execute on function public.list_ai_world_class_templates_v1(uuid)
  to authenticated;

create or replace function private.ensure_ai_world_class_bundle_v1(
  p_campaign_id uuid,
  p_source_class_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_campaign_id uuid;
  v_source_class public.rule_templates%rowtype;
  v_local_class_id uuid;
  v_source_subclass record;
  v_local_subclass_id uuid;
begin
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_world_campaign_required';
  end if;

  v_source_campaign_id:=private.ai_world_rules_source_campaign_v1();
  if v_source_campaign_id is null then
    raise exception 'ai_world_rules_source_missing';
  end if;

  select *
    into v_source_class
  from public.rule_templates t
  where t.id=p_source_class_id
    and t.campaign_id=v_source_campaign_id
    and t.kind='class'
    and t.is_builtin=true
    and t.is_active=true;

  if v_source_class.id is null then
    raise exception 'ai_world_source_class_required';
  end if;

  select t.id
    into v_local_class_id
  from public.rule_templates t
  where t.campaign_id=p_campaign_id
    and t.kind='class'
    and t.catalog_key=v_source_class.catalog_key
    and t.is_active=true
  order by t.version desc,t.created_at desc
  limit 1;

  if v_local_class_id is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
      created_by,parent_template_id,unlock_level,catalog_key,catalog_revision,
      source_kind,source_label,is_builtin,mechanical_summary,author_description,
      author_comment,rules_meta
    )
    values(
      p_campaign_id,
      v_source_class.kind,
      v_source_class.slug,
      v_source_class.name,
      v_source_class.description,
      v_source_class.version,
      private.ai_world_normalize_rule_json_v1(v_source_class.mechanics),
      private.ai_world_normalize_rule_json_v1(v_source_class.choices),
      true,
      null,
      null,
      v_source_class.unlock_level,
      v_source_class.catalog_key,
      v_source_class.catalog_revision,
      v_source_class.source_kind,
      v_source_class.source_label,
      true,
      v_source_class.mechanical_summary,
      v_source_class.author_description,
      v_source_class.author_comment,
      v_source_class.rules_meta
    )
    returning id into v_local_class_id;

    insert into public.rule_template_levels(
      template_id,level,mechanics,choices
    )
    select
      v_local_class_id,
      l.level,
      private.ai_world_normalize_rule_json_v1(l.mechanics),
      private.ai_world_normalize_rule_json_v1(l.choices)
    from public.rule_template_levels l
    where l.template_id=v_source_class.id
    order by l.level;

    insert into public.rule_template_spell_links(
      template_id,template_level,mechanic_id,spell_id,
      source_kind,access_category,catalog_slug
    )
    select
      v_local_class_id,
      l.template_level,
      l.mechanic_id,
      l.spell_id,
      l.source_kind,
      l.access_category,
      l.catalog_slug
    from public.rule_template_spell_links l
    where l.template_id=v_source_class.id;
  end if;

  for v_source_subclass in
    select t.*
    from public.rule_templates t
    where t.campaign_id=v_source_campaign_id
      and t.kind='subclass'
      and t.parent_template_id=v_source_class.id
      and t.is_builtin=true
      and t.is_active=true
    order by t.catalog_key,t.version,t.id
  loop
    select t.id
      into v_local_subclass_id
    from public.rule_templates t
    where t.campaign_id=p_campaign_id
      and t.kind='subclass'
      and t.catalog_key=v_source_subclass.catalog_key
      and t.is_active=true
    order by t.version desc,t.created_at desc
    limit 1;

    if v_local_subclass_id is null then
      insert into public.rule_templates(
        campaign_id,kind,slug,name,description,version,mechanics,choices,is_active,
        created_by,parent_template_id,unlock_level,catalog_key,catalog_revision,
        source_kind,source_label,is_builtin,mechanical_summary,author_description,
        author_comment,rules_meta
      )
      values(
        p_campaign_id,
        v_source_subclass.kind,
        v_source_subclass.slug,
        v_source_subclass.name,
        v_source_subclass.description,
        v_source_subclass.version,
        private.ai_world_normalize_rule_json_v1(v_source_subclass.mechanics),
        private.ai_world_normalize_rule_json_v1(v_source_subclass.choices),
        true,
        null,
        v_local_class_id,
        v_source_subclass.unlock_level,
        v_source_subclass.catalog_key,
        v_source_subclass.catalog_revision,
        v_source_subclass.source_kind,
        v_source_subclass.source_label,
        true,
        v_source_subclass.mechanical_summary,
        v_source_subclass.author_description,
        v_source_subclass.author_comment,
        v_source_subclass.rules_meta
      )
      returning id into v_local_subclass_id;

      insert into public.rule_template_levels(
        template_id,level,mechanics,choices
      )
      select
        v_local_subclass_id,
        l.level,
        private.ai_world_normalize_rule_json_v1(l.mechanics),
        private.ai_world_normalize_rule_json_v1(l.choices)
      from public.rule_template_levels l
      where l.template_id=v_source_subclass.id
      order by l.level;

      insert into public.rule_template_spell_links(
        template_id,template_level,mechanic_id,spell_id,
        source_kind,access_category,catalog_slug
      )
      select
        v_local_subclass_id,
        l.template_level,
        l.mechanic_id,
        l.spell_id,
        l.source_kind,
        l.access_category,
        l.catalog_slug
      from public.rule_template_spell_links l
      where l.template_id=v_source_subclass.id;
    end if;
  end loop;

  return v_local_class_id;
end;
$function$;

revoke all on function private.ensure_ai_world_class_bundle_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function private.ensure_ai_world_class_bundle_v1(uuid,uuid)
  to service_role;

-- Every existing user trigger on campaigns is a historical rule catalog /
-- certification trigger. AI-world campaigns use the lazy catalog above.
do $guard$
declare
  r record;
  v_def text;
  v_new_def text;
begin
  for r in
    select t.tgname,t.oid
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal
      and n.nspname='public'
      and c.relname='campaigns'
    order by t.tgname
  loop
    v_def:=pg_get_triggerdef(r.oid);

    if v_def !~ ' AFTER INSERT ON public\.campaigns ' then
      raise exception 'unexpected_campaign_trigger_shape:%:%',r.tgname,v_def;
    end if;

    if v_def ~ ' WHEN ' then
      continue;
    end if;

    v_new_def:=replace(
      v_def,
      ' FOR EACH ROW EXECUTE FUNCTION ',
      ' FOR EACH ROW WHEN ((new.slug !~~ ''ai-world-%''::text)) EXECUTE FUNCTION '
    );

    if v_new_def=v_def then
      raise exception 'campaign_trigger_guard_patch_failed:%',r.tgname;
    end if;

    execute format('drop trigger %I on public.campaigns',r.tgname);
    execute v_new_def;
  end loop;
end;
$guard$;

create or replace function public.create_ai_world_player_character_v1(
  p_campaign_id uuid,
  p_name text,
  p_class_template_id uuid,
  p_level integer default 1,
  p_bio text default ''
)
returns table(
  character_id uuid,
  room_id uuid,
  active_character_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_slot public.ai_world_slots%rowtype;
  v_requested_class public.rule_templates%rowtype;
  v_class public.rule_templates%rowtype;
  v_local_class_id uuid;
  v_character_id uuid;
  v_room_id uuid;
  v_level integer := greatest(1,least(coalesce(p_level,1),30));
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_campaign_id is null then
    raise exception 'campaign_required';
  end if;

  select *
    into v_slot
  from public.ai_world_slots s
  where s.campaign_id=p_campaign_id
    and s.owner_user_id=v_user_id
  for update;

  if v_slot.id is null then
    raise exception 'ai_world_owner_required';
  end if;

  if nullif(btrim(coalesce(p_name,'')),'') is null then
    raise exception 'character_name_required';
  end if;

  if char_length(btrim(p_name))>120 then
    raise exception 'character_name_too_long';
  end if;

  select *
    into v_requested_class
  from public.rule_templates t
  where t.id=p_class_template_id
    and t.kind='class'
    and t.is_active=true;

  if v_requested_class.id is null then
    raise exception 'ai_world_class_required';
  end if;

  if v_requested_class.campaign_id=p_campaign_id then
    v_local_class_id:=v_requested_class.id;
  else
    v_local_class_id:=private.ensure_ai_world_class_bundle_v1(
      p_campaign_id,
      p_class_template_id
    );
  end if;

  select *
    into v_class
  from public.rule_templates t
  where t.id=v_local_class_id
    and t.campaign_id=p_campaign_id
    and t.kind='class'
    and t.is_active=true;

  if v_class.id is null then
    raise exception 'ai_world_local_class_missing';
  end if;

  update public.campaign_members
  set role='player',
      is_owner=true
  where campaign_id=p_campaign_id
    and user_id=v_user_id;

  if not found then
    raise exception 'campaign_membership_required';
  end if;

  v_character_id:=public.create_campaign_character_v2(
    p_campaign_id,
    btrim(p_name),
    v_class.name,
    v_level,
    btrim(coalesce(p_bio,'')),
    null,
    v_user_id,
    'pc',
    'campaign',
    'always'
  );

  perform public.assign_character_template_v2(
    v_character_id,
    v_class.id,
    v_level,
    '{}'::jsonb
  );

  perform public.set_campaign_active_character(
    p_campaign_id,
    v_user_id,
    v_character_id
  );

  select r.id
    into v_room_id
  from public.chat_rooms r
  where r.campaign_id=p_campaign_id
    and r.character_id=v_character_id
    and r.room_type='character'
  order by r.created_at
  limit 1;

  if v_room_id is null then
    v_room_id:=private.ensure_character_chat_room(v_character_id);
  end if;

  if v_room_id is null then
    raise exception 'ai_world_character_room_missing';
  end if;

  return query
  select v_character_id,v_room_id,v_character_id;
end;
$function$;

revoke all on function public.create_ai_world_player_character_v1(
  uuid,text,uuid,integer,text
) from public,anon;
grant execute on function public.create_ai_world_player_character_v1(
  uuid,text,uuid,integer,text
) to authenticated;

comment on function public.list_ai_world_class_templates_v1(uuid) is
  'Lists canonical built-in class templates that may be lazily cloned into an owned AI-world campaign.';
comment on function private.ensure_ai_world_class_bundle_v1(uuid,uuid) is
  'Idempotently clones one canonical built-in class, its subclasses, levels and spell links into an AI-world campaign.';
