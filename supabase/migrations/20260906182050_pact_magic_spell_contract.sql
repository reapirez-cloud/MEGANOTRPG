-- Generic spell-contract extension for non-standard CE resource-backed casting.
-- Ordinary class_spell methods remain locked to canonical spell_slot_N resources.
-- pact_magic and class_feature are explicit semantic method kinds handled by the
-- existing generic use_character_template_spell_v1 resource executor.

begin;

create or replace function private.assert_class_spell_contract_json(p_value jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_entry record;
  v_method jsonb;
  v_option jsonb;
  v_cost jsonb;
  v_slug text;
  v_level integer;
  v_payload_level integer;
  v_kind text;
  v_key text;
  v_amount integer;
begin
  if p_value is null then return; end if;
  if jsonb_typeof(p_value)='array' then
    for v_entry in select value from jsonb_array_elements(p_value) loop
      perform private.assert_class_spell_contract_json(v_entry.value);
    end loop;
    return;
  end if;
  if jsonb_typeof(p_value)<>'object' then return; end if;

  if coalesce(p_value->>'type','')='spell' then
    v_slug := coalesce(nullif(p_value->>'catalogSlug',''),regexp_replace(p_value->>'key','^spell:',''));
    select spell_level into v_level from public.spell_catalog where slug=v_slug;
    if v_level is null then
      raise exception 'Class spell % is not linked to spell_catalog',v_slug;
    end if;

    v_payload_level := coalesce((p_value#>>'{payload,spell,level}')::integer,-1);
    if v_payload_level<>v_level then
      raise exception 'Class spell % level % disagrees with spell_catalog level %',v_slug,v_payload_level,v_level;
    end if;

    for v_method in
      select value from jsonb_array_elements(coalesce(p_value#>'{payload,methods}','[]'::jsonb))
    loop
      v_kind := coalesce(v_method->>'kind','');
      if v_kind not in ('class_spell','pact_magic','class_feature') then
        raise exception 'Class spell % uses unsupported method kind %',v_slug,v_kind;
      end if;

      for v_option in
        select value from jsonb_array_elements(coalesce(v_method->'resourceOptions','[]'::jsonb))
      loop
        if v_kind='pact_magic' and jsonb_array_length(coalesce(v_option->'costs','[]'::jsonb))=0 then
          raise exception 'Pact Magic spell % must spend a CE resource',v_slug;
        end if;

        for v_cost in select value from jsonb_array_elements(coalesce(v_option->'costs','[]'::jsonb))
        loop
          v_key := trim(coalesce(v_cost->>'key',''));
          v_amount := greatest(0,coalesce((v_cost->>'amount')::integer,0));
          if v_key='' or v_amount<1 then
            raise exception 'Class spell % contains an invalid resource cost',v_slug;
          end if;

          if v_kind='class_spell' and v_key !~ '^spell_slot_[1-9]$' then
            raise exception 'Class spell % must spend ordinary spell slots',v_slug;
          end if;

          if v_kind='pact_magic' and v_key ~ '^spell_slot_[1-9]$' then
            raise exception 'Pact Magic spell % must not spend ordinary spell slots',v_slug;
          end if;
        end loop;
      end loop;
    end loop;
  end if;

  for v_entry in select key,value from jsonb_each(p_value) loop
    perform private.assert_class_spell_contract_json(v_entry.value);
  end loop;
end;
$function$;

revoke all on function private.assert_class_spell_contract_json(jsonb) from public,anon,authenticated;
grant execute on function private.assert_class_spell_contract_json(jsonb) to service_role;

commit;