-- CLASS_MIGRATION_SCOPE: infrastructure
-- Preserve the rebuilt Monk family during legacy builtin pruning and install the
-- clean 2024 Monk base-class text package for every new campaign.

begin;

create or replace function private.prune_removed_builtin_class_catalog(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assigned integer;
begin
  select count(*)
    into v_assigned
  from public.character_template_assignments assignment
  join public.rule_templates template on template.id = assignment.template_id
  left join public.rule_templates parent on parent.id = template.parent_template_id
  join public.characters character on character.id = assignment.character_id
  where character.campaign_id = p_campaign_id
    and (
      (
        template.kind = 'class'
        and template.is_builtin is true
        and template.catalog_key not in ('class:fighter', 'class:druid', 'class:cleric', 'class:wizard', 'class:monk')
      )
      or (
        template.kind = 'subclass'
        and parent.kind = 'class'
        and parent.is_builtin is true
        and parent.catalog_key not in ('class:fighter', 'class:druid', 'class:cleric', 'class:wizard', 'class:monk')
      )
    );

  if v_assigned > 0 then
    raise exception
      'Refusing legacy class prune: % assignment(s) still point at removed builtin classes/subclasses',
      v_assigned;
  end if;

  delete from public.rule_templates subclass
  using public.rule_templates parent
  where subclass.campaign_id = p_campaign_id
    and subclass.kind = 'subclass'
    and subclass.parent_template_id = parent.id
    and parent.campaign_id = p_campaign_id
    and parent.kind = 'class'
    and parent.is_builtin is true
    and parent.catalog_key not in ('class:fighter', 'class:druid', 'class:cleric', 'class:wizard', 'class:monk');

  delete from public.rule_templates
  where campaign_id = p_campaign_id
    and kind = 'class'
    and is_builtin is true
    and catalog_key not in ('class:fighter', 'class:druid', 'class:cleric', 'class:wizard', 'class:monk');

  if exists (
    select 1
    from public.rule_templates
    where campaign_id = p_campaign_id
      and kind = 'class'
      and is_builtin is true
      and catalog_key not in ('class:fighter', 'class:druid', 'class:cleric', 'class:wizard', 'class:monk')
  ) then
    raise exception 'Legacy builtin classes remain after campaign bootstrap prune';
  end if;
end;
$$;

create or replace function private.install_monk_2024_text_pack_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.install_monk_2024_text_pack(new.id);
  return new;
end;
$$;

-- The deliberately-last prune trigger is named with many more z characters, so
-- this installer runs before it and the allowlist above keeps class:monk alive.
drop trigger if exists zzzzz_campaigns_install_monk_2024_text_pack on public.campaigns;
create trigger zzzzz_campaigns_install_monk_2024_text_pack
after insert on public.campaigns
for each row execute function private.install_monk_2024_text_pack_after_campaign();

-- Reconcile existing campaigns after widening the rebuilt-class allowlist.
do $$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_monk_2024_text_pack(v_campaign.id);
    perform private.prune_removed_builtin_class_catalog(v_campaign.id);
  end loop;
end
$$;

commit;
