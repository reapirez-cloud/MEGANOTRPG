begin;

-- Legacy structured Fighter subclass spells used `subclass_spell`, while the
-- current authoritative spell contract requires every template spell method to
-- use `class_spell`. Normalize them before the canonical Fighter completion
-- pass preserves those spell mechanics.
update public.rule_template_levels l
set mechanics=(
  select coalesce(jsonb_agg(
    case
      when m->>'type'='spell' and jsonb_typeof(m#>'{payload,methods}')='array' then
        jsonb_set(
          m,
          '{payload,methods}',
          (
            select coalesce(jsonb_agg(jsonb_set(method,'{kind}','"class_spell"'::jsonb,true) order by method_ord),'[]'::jsonb)
            from jsonb_array_elements(m#>'{payload,methods}') with ordinality mm(method,method_ord)
          ),
          true
        )
      else m
    end
    order by ord
  ),'[]'::jsonb)
  from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
)
where exists (
  select 1
  from public.rule_templates t
  where t.id=l.template_id
    and (t.catalog_key='class:fighter' or t.catalog_key like 'subclass:fighter:%')
)
and exists (
  select 1
  from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
  cross join lateral jsonb_array_elements(coalesce(m#>'{payload,methods}','[]'::jsonb)) method
  where m->>'type'='spell' and method->>'kind'<>'class_spell'
);

update public.rule_templates t
set mechanics=(
  select coalesce(jsonb_agg(
    case
      when m->>'type'='spell' and jsonb_typeof(m#>'{payload,methods}')='array' then
        jsonb_set(
          m,
          '{payload,methods}',
          (
            select coalesce(jsonb_agg(jsonb_set(method,'{kind}','"class_spell"'::jsonb,true) order by method_ord),'[]'::jsonb)
            from jsonb_array_elements(m#>'{payload,methods}') with ordinality mm(method,method_ord)
          ),
          true
        )
      else m
    end
    order by ord
  ),'[]'::jsonb)
  from jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
)
where (t.catalog_key='class:fighter' or t.catalog_key like 'subclass:fighter:%')
and exists (
  select 1
  from jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) m
  cross join lateral jsonb_array_elements(coalesce(m#>'{payload,methods}','[]'::jsonb)) method
  where m->>'type'='spell' and method->>'kind'<>'class_spell'
);

commit;
