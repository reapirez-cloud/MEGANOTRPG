-- CLASS_MIGRATION_SCOPE: infrastructure
-- CLASS_INTEGRATION_STRICT: class:sorcerer
--
-- Stage 4: 2024 Metamagic choices plus atomic spell+modifier execution.
-- Choice acquisition remains generic Choice Runtime v2; spell execution remains
-- GENA + Shapoklyak resource state. No Sorcerer-only persistence table is added.

begin;

create or replace function private.character_template_selected_action_definition_v1(
  p_character_id uuid,
  p_mechanic_id text
)
returns jsonb
language sql
security definer
set search_path=''
as $function$
with assigned_raw as (
  select
    a.template_id,
    a.template_level,
    a.selected_choices,
    t.kind,
    t.version,
    t.unlock_level as template_unlock_level,
    t.parent_template_id,
    t.mechanics,
    t.choices,
    case
      when t.kind='subclass' then greatest(1,coalesce(parent.template_level,1))
      when t.kind='class' then greatest(1,coalesce(a.template_level,1))
      else greatest(1,coalesce(c.level,1))
    end as effective_level
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active
  join public.characters c on c.id=a.character_id
  left join public.character_template_assignments parent
    on parent.character_id=a.character_id and parent.template_id=t.parent_template_id
  where a.character_id=p_character_id
    and t.kind in ('class','subclass')
),
assigned as (
  select * from assigned_raw
  where kind<>'subclass'
     or effective_level>=greatest(1,coalesce(template_unlock_level,1))
),
choice_defs as (
  select a.*,0 as choice_unlock_level,d.value as definition
  from assigned a
  cross join lateral jsonb_array_elements(coalesce(a.choices,'[]'::jsonb)) d(value)
  union all
  select a.*,l.level,d.value
  from assigned a
  join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) d(value)
),
selected_options as (
  select
    d.*,
    s.option_key,
    s.ord,
    greatest(
      1,
      coalesce(
        (
          select e.value::integer
          from jsonb_each_text(coalesce(d.definition->'count_by_level','{}'::jsonb)) e(key,value)
          where e.key~'^[0-9]+$' and e.key::integer<=d.effective_level
          order by e.key::integer desc
          limit 1
        ),
        case
          when coalesce(d.definition->>'count','')~'^[0-9]+$'
            then (d.definition->>'count')::integer
          else null
        end,
        1
      )
    ) as allowed_count
  from choice_defs d
  cross join lateral jsonb_array_elements_text(
    case jsonb_typeof(d.selected_choices->(d.definition->>'key'))
      when 'array' then d.selected_choices->(d.definition->>'key')
      when 'string' then jsonb_build_array(d.selected_choices->>(d.definition->>'key'))
      else '[]'::jsonb
    end
  ) with ordinality s(option_key,ord)
  where nullif(trim(coalesce(d.definition->>'key','')),'') is not null
),
active_options as (
  select s.*
  from selected_options s
  where s.ord<=s.allowed_count
    and exists(
      select 1
      from jsonb_array_elements_text(coalesce(s.definition->'options','[]'::jsonb)) o(value)
      where o.value=s.option_key
    )
    and s.effective_level>=greatest(
      1,
      coalesce(
        case
          when coalesce(s.definition->'option_unlock_level'->>s.option_key,'')~'^[0-9]+$'
            then (s.definition->'option_unlock_level'->>s.option_key)::integer
          else null
        end,
        1
      )
    )
    and private.character_meets_choice_source_requirements_v1(
      p_character_id,
      coalesce(s.definition->'option_rules'->s.option_key->'source_requirements_any','[]'::jsonb)
    )
),
candidates as (
  select 0 as unlock_level,m.value as mechanic
  from assigned a
  cross join lateral jsonb_array_elements(coalesce(a.mechanics,'[]'::jsonb)) m(value)
  where m.value->>'id'=trim(p_mechanic_id)
  union all
  select l.level,m.value
  from assigned a
  join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
  where m.value->>'id'=trim(p_mechanic_id)
  union all
  select o.choice_unlock_level,m.value
  from active_options o
  cross join lateral jsonb_array_elements(
    coalesce(o.definition->'option_mechanics'->o.option_key,'[]'::jsonb)
  ) m(value)
  where m.value->>'id'=trim(p_mechanic_id)
  union all
  select g.level_key::integer,m.value
  from active_options o
  cross join lateral jsonb_each(
    coalesce(o.definition->'option_mechanics_by_level'->o.option_key,'{}'::jsonb)
  ) g(level_key,mechanics)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.mechanics)='array' then g.mechanics else '[]'::jsonb end
  ) m(value)
  where g.level_key~'^[0-9]+$'
    and g.level_key::integer<=o.effective_level
    and m.value->>'id'=trim(p_mechanic_id)
)
select mechanic
from candidates
where mechanic->>'type'='action'
order by unlock_level desc
limit 1;
$function$;

revoke all on function private.character_template_selected_action_definition_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function private.character_template_selected_action_definition_v1(uuid,text)
  to service_role;

create or replace function public.send_chat_spell_with_template_modifiers_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_spell_mechanic_id text default null,
  p_method_key text default null,
  p_option_key text default null,
  p_spell_resource_costs jsonb default '[]'::jsonb,
  p_modifier_mechanic_ids text[] default array[]::text[],
  p_label text default null,
  p_payload jsonb default '{}'::jsonb,
  p_command_id uuid default gen_random_uuid()
)
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_message_id bigint;
  v_payload jsonb;
  v_fingerprint jsonb;
  v_modifier_id text;
  v_modifier jsonb;
  v_modifiers jsonb := '[]'::jsonb;
  v_seen text[] := array[]::text[];
  v_regular_modifier_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;

  select c.campaign_id into v_campaign_id
  from public.characters c
  where c.id=p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;

  if p_modifier_mechanic_ids is null then
    p_modifier_mechanic_ids := array[]::text[];
  end if;
  if cardinality(p_modifier_mechanic_ids)>3 then
    raise exception 'Too many spell modifiers';
  end if;

  v_fingerprint := jsonb_build_object(
    'roomId',p_room_id,
    'characterId',p_character_id,
    'spellMechanicId',nullif(trim(coalesce(p_spell_mechanic_id,'')),''),
    'methodKey',nullif(trim(coalesce(p_method_key,'')),''),
    'optionKey',nullif(trim(coalesce(p_option_key,'')),''),
    'spellResourceCosts',coalesce(p_spell_resource_costs,'[]'::jsonb),
    'modifierMechanicIds',to_jsonb(p_modifier_mechanic_ids),
    'label',p_label,
    'payload',coalesce(p_payload,'{}'::jsonb)
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing
  from public.engine_command_receipts
  where command_id=p_command_id;

  if found then
    if v_existing.created_by is distinct from auth.uid()
      or v_existing.campaign_id is distinct from v_campaign_id
      or v_existing.engine is distinct from 'gena'
      or v_existing.command_kind is distinct from 'spell.with_modifiers'
      or v_existing.aggregate_id is distinct from p_character_id
      or (v_existing.result->'fingerprint') is distinct from v_fingerprint
    then
      raise exception 'Command id is already used by another command';
    end if;
    return (v_existing.result->>'messageId')::bigint;
  end if;

  foreach v_modifier_id in array p_modifier_mechanic_ids loop
    v_modifier_id := trim(coalesce(v_modifier_id,''));
    if v_modifier_id='' then raise exception 'Modifier mechanic id is required'; end if;
    if v_modifier_id=any(v_seen) then raise exception 'Duplicate spell modifier'; end if;
    v_seen := array_append(v_seen,v_modifier_id);

    v_modifier := private.character_template_selected_action_definition_v1(
      p_character_id,v_modifier_id
    );
    if v_modifier is null then raise exception 'Spell modifier is unavailable'; end if;
    if not coalesce(v_modifier->'tags','[]'::jsonb) ? 'spell_modifier' then
      raise exception 'Action is not a spell modifier';
    end if;
    if exists(
      select 1
      from jsonb_array_elements(coalesce(v_modifier->'effects','[]'::jsonb)) e(value)
      where e.value->>'kind'<>'semantic'
    ) then
      raise exception 'Spell modifier may only carry semantic effects';
    end if;

    if not (coalesce(v_modifier->'tags','[]'::jsonb) ? 'metamagic_stack_exception') then
      v_regular_modifier_count := v_regular_modifier_count+1;
      if v_regular_modifier_count>1 then
        raise exception 'Only one ordinary spell modifier can be used on the same spell';
      end if;
    end if;

    perform public.use_character_template_resource_action(
      p_character_id,
      v_modifier_id,
      null
    );

    v_modifiers := v_modifiers || jsonb_build_array(jsonb_build_object(
      'mechanicId',v_modifier_id,
      'label',coalesce(nullif(v_modifier->>'label',''),v_modifier_id),
      'sourceKey',v_modifier->>'sourceKey',
      'effects',coalesce(v_modifier->'effects','[]'::jsonb)
    ));
  end loop;

  if nullif(trim(coalesce(p_spell_mechanic_id,'')),'') is not null then
    if nullif(trim(coalesce(p_method_key,'')),'') is null then
      raise exception 'Method is required for a template spell';
    end if;
    if coalesce(p_spell_resource_costs,'[]'::jsonb)<>'[]'::jsonb then
      raise exception 'Template spell costs must be resolved by the server';
    end if;

    perform public.use_character_template_spell_v1(
      p_character_id,
      trim(p_spell_mechanic_id),
      trim(p_method_key),
      nullif(trim(coalesce(p_option_key,'')),'')
    );
  else
    if p_spell_resource_costs is null then
      p_spell_resource_costs := '[]'::jsonb;
    end if;
    if jsonb_typeof(p_spell_resource_costs)<>'array' then
      raise exception 'Spell resource costs must be an array';
    end if;
    perform private.consume_character_resource_costs(
      p_character_id,
      p_spell_resource_costs,
      auth.uid()
    );
  end if;

  v_payload := coalesce(p_payload,'{}'::jsonb) || jsonb_build_object(
    'templateMechanicId',nullif(trim(coalesce(p_spell_mechanic_id,'')),''),
    'templateMethodKey',nullif(trim(coalesce(p_method_key,'')),''),
    'templateOptionKey',nullif(trim(coalesce(p_option_key,'')),''),
    'templateModifiers',v_modifiers
  );

  v_message_id := public.send_chat_event_v3(
    p_room_id,
    p_character_id,
    'spell',
    coalesce(nullif(trim(coalesce(p_label,'')),''),'Заклинание'),
    v_payload,
    '[]'::jsonb
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by
  ) values(
    p_command_id,
    v_campaign_id,
    p_character_id,
    'gena',
    'spell.with_modifiers',
    p_character_id,
    jsonb_build_object('messageId',v_message_id,'fingerprint',v_fingerprint),
    auth.uid()
  );

  return v_message_id;
end;
$function$;

revoke all on function public.send_chat_spell_with_template_modifiers_v1(
  uuid,uuid,text,text,text,jsonb,text[],text,jsonb,uuid
) from public,anon;
grant execute on function public.send_chat_spell_with_template_modifiers_v1(
  uuid,uuid,text,text,text,jsonb,text[],text,jsonb,uuid
) to authenticated,service_role;

commit;
