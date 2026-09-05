begin;

-- The canonical completion migrations intentionally replace subclass level mechanics.
-- Merge the pre-repair structured layer back on top without weakening canonical
-- resource costs, choice option mechanics, spell data, or finite-resource grants.
do $$
declare
  r record;
  v_canonical jsonb;
  v_snapshot jsonb;
  v_preserved jsonb;
  v_extra jsonb;
begin
  for r in
    select template_id, level, mechanics
    from private.fighter_runtime_repair_snapshot
    order by template_id, level
  loop
    v_snapshot := coalesce(r.mechanics,'[]'::jsonb);

    select coalesce(l.mechanics,'[]'::jsonb)
      into v_canonical
    from public.rule_template_levels l
    where l.template_id=r.template_id and l.level=r.level;

    if v_canonical is null then
      continue;
    end if;

    -- Keep canonical executable mechanics. For matching feature grants/actions,
    -- restore only the newer narrative/presentation fields from the snapshot.
    select coalesce(jsonb_agg(
      case
        when c.m->>'type'='grant' and c.m->>'target'='feature' and s.m is not null then
          jsonb_strip_nulls(
            c.m
            || case when s.m ? 'payload' then jsonb_build_object('payload',s.m->'payload') else '{}'::jsonb end
            || case when s.m ? 'presentation' then jsonb_build_object('presentation',s.m->'presentation') else '{}'::jsonb end
          )
        when c.m->>'type'='action' and s.m is not null then
          jsonb_strip_nulls(
            c.m
            || case when s.m ? 'label' then jsonb_build_object('label',s.m->'label') else '{}'::jsonb end
            || case when s.m ? 'presentation' then jsonb_build_object('presentation',s.m->'presentation') else '{}'::jsonb end
          )
        else c.m
      end
      order by c.ord
    ),'[]'::jsonb)
    into v_preserved
    from jsonb_array_elements(v_canonical) with ordinality c(m,ord)
    left join lateral (
      select sm.m
      from jsonb_array_elements(v_snapshot) with ordinality sm(m,ord)
      where coalesce(sm.m->>'type','')=coalesce(c.m->>'type','')
        and nullif(sm.m->>'sourceKey','') is not null
        and sm.m->>'sourceKey'=c.m->>'sourceKey'
        and (
          c.m->>'type'<>'grant'
          or coalesce(sm.m->>'target','')=coalesce(c.m->>'target','')
        )
      order by sm.ord
      limit 1
    ) s on true;

    -- Keep newer structured mechanics that the canonical pack does not represent.
    select coalesce(jsonb_agg(s.m order by s.ord),'[]'::jsonb)
      into v_extra
    from jsonb_array_elements(v_snapshot) with ordinality s(m,ord)
    where not exists (
      select 1
      from jsonb_array_elements(v_canonical) c(m)
      where (
        nullif(s.m->>'id','') is not null
        and c.m->>'id'=s.m->>'id'
      ) or (
        coalesce(c.m->>'type','')=coalesce(s.m->>'type','')
        and nullif(s.m->>'sourceKey','') is not null
        and c.m->>'sourceKey'=s.m->>'sourceKey'
        and (
          s.m->>'type'<>'grant'
          or coalesce(c.m->>'target','')=coalesce(s.m->>'target','')
        )
      )
    );

    update public.rule_template_levels
    set mechanics=coalesce(v_preserved,'[]'::jsonb)||coalesce(v_extra,'[]'::jsonb)
    where template_id=r.template_id and level=r.level;
  end loop;
end $$;

-- Restore current template names/rules metadata and mark this mechanical layer audited.
with snap as (
  select distinct on (template_id)
    template_id, template_name, rules_meta, mechanical_summary
  from private.fighter_runtime_repair_snapshot
  order by template_id, level
)
update public.rule_templates t
set name=coalesce(s.template_name,t.name),
    mechanical_summary=coalesce(s.mechanical_summary,t.mechanical_summary),
    rules_meta=coalesce(t.rules_meta,'{}'::jsonb)
      || coalesce(s.rules_meta,'{}'::jsonb)
      || jsonb_build_object(
        'mechanics_authority','AUDITED',
        'fighter_runtime_repaired',true,
        'fighter_runtime_repair_revision','2026-09-05'
      ),
    updated_at=now()
from snap s
where t.id=s.template_id;

-- Base Fighter choices were also lost by the structured regeneration. Restore the
-- class/subclass and ASI decisions in the same level-aware schema used by the UI.
do $$
declare
  v_fighter uuid;
  v_subclasses jsonb;
  v_level integer;
  v_choice jsonb;
begin
  select id into v_fighter
  from public.rule_templates
  where catalog_key='class:fighter' and kind='class' and is_active
  order by version desc limit 1;

  if v_fighter is not null then
    select coalesce(jsonb_agg(id::text order by name),'[]'::jsonb)
      into v_subclasses
    from public.rule_templates
    where parent_template_id=v_fighter and kind='subclass' and is_active;

    v_choice := jsonb_build_object(
      'key','select_subclass','label','Подкласс воина','target','subclass',
      'options',v_subclasses,'count',1,'min',1,'max',1,'required',true,'uniqueWithinChoice',true
    );

    update public.rule_template_levels l
    set choices=(
      select coalesce(jsonb_agg(c order by ord) filter(where c->>'key'<>'select_subclass'),'[]'::jsonb)
      from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality q(c,ord)
    )||jsonb_build_array(v_choice)
    where l.template_id=v_fighter and l.level=3;

    foreach v_level in array array[4,6,8,12,14,16,19] loop
      v_choice := jsonb_build_object(
        'key','ability_score_improvement','label','Увеличение характеристик','target','ability',
        'options',jsonb_build_array('STR','DEX','CON','INT','WIS','CHA'),
        'count',2,'min',1,'max',2,'required',true,'uniqueWithinChoice',false,
        'constraints',jsonb_build_object(
          'maxScore',20,'allowSameOptionTwice',true,
          'allowedModes',jsonb_build_array('+2','+1/+1')
        )
      );
      update public.rule_template_levels l
      set choices=(
        select coalesce(jsonb_agg(c order by ord) filter(where c->>'key'<>'ability_score_improvement'),'[]'::jsonb)
        from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality q(c,ord)
      )||jsonb_build_array(v_choice)
      where l.template_id=v_fighter and l.level=v_level;
    end loop;
  end if;
end $$;

-- The copied canonical migrations use late campaign triggers to backfill old data.
-- They are useful for this repair pass but conflict with the newer structured
-- generator on future campaigns, so remove only those two legacy triggers.
drop trigger if exists zzzzzzz_campaigns_fighter_completion on public.campaigns;
drop trigger if exists zzzzzzzz_campaigns_fighter_psi_runtime on public.campaigns;

drop table if exists private.fighter_runtime_repair_snapshot;

commit;
