begin;

-- PRESENTATION ONLY: terminology correction after Druid text closure.
-- D&D size Tiny = «Крошечный», not «Маленький».

update public.rule_template_levels rtl
set mechanics = (
  select coalesce(jsonb_agg(
    case
      when mechanic->>'type' = 'grant'
       and mechanic->>'target' = 'feature'
       and mechanic->>'id' = 'stars-star-map-rules'
      then jsonb_set(
        mechanic,
        '{payload,description}',
        to_jsonb(replace(mechanic->'payload'->>'description', 'Маленький предмет', 'Крошечный предмет')),
        true
      )
      else mechanic
    end
    order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(rtl.mechanics, '[]'::jsonb)) with ordinality as items(mechanic, ord)
),
updated_at = now()
where rtl.level = 3
  and rtl.template_id in (
    select id from public.rule_templates
    where is_active and catalog_key = 'subclass:druid:stars'
  );

commit;
