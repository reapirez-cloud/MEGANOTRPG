-- CLASS_MIGRATION_SCOPE: presentation
-- CLASS_WORK_STATUS: sorcerer:text=READY_AUTHORING_SCOPE;mechanics=READY
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

do $block$
declare r record;
begin
  for r in
    select rt.id,rt.campaign_id
    from public.rule_templates rt
    where rt.kind='subclass'
      and rt.catalog_key='subclass:sorcerer:clockwork-sorcery'
      and rt.is_active
  loop
    update public.rule_template_levels l
    set mechanics=(
      select coalesce(jsonb_agg(
        case
          when m.value->>'id'='clockwork-bastion' then
            jsonb_set(
              m.value,
              '{payload,description}',
              to_jsonb('Действием потратьте от 1 до 5 Очков чародейства и создайте вокруг существа в 30 футах столько d8 защиты; когда цель получает урон, она может потратить любое число этих костей и уменьшить урон на выпавшую сумму. Созданные кости существуют до окончания долгого отдыха или пока вы не примените эту способность снова.'::text),
              true
            )
          else m.value
        end
        order by m.ord
      ),'[]'::jsonb)
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality m(value,ord)
    )
    where l.template_id=r.id and l.level=6;

    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=r.id
        and l.level=6
        and m.value->>'id'='clockwork-bastion'
        and m.value->'payload'->>'description'=
          'Действием потратьте от 1 до 5 Очков чародейства и создайте вокруг существа в 30 футах столько d8 защиты; когда цель получает урон, она может потратить любое число этих костей и уменьшить урон на выпавшую сумму. Созданные кости существуют до окончания долгого отдыха или пока вы не примените эту способность снова.'
    ) then
      raise exception 'SORCERER_STAGE7_CLOCKWORK_BASTION_TEXT_PATCH_FAILED:%',r.campaign_id;
    end if;
  end loop;
end;
$block$;

commit;
