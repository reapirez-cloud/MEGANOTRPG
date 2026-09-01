-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardBaseClosure.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: wizard:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Final base-Wizard UX/runtime closure for Gena rest windows.
-- Rest resources recover when the GM grants the rest. Player-facing choices then
-- remain available until the assigned player sends the first ordinary chat line.
-- Buttons/RPCs do not emit chat text and therefore do not close their own window.

begin;

create table if not exists public.wizard_cantrip_replacement_uses (
  character_id uuid not null references public.characters(id) on delete cascade,
  long_rest_generation bigint not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  primary key(character_id,long_rest_generation)
);

alter table public.wizard_cantrip_replacement_uses enable row level security;
revoke all on public.wizard_cantrip_replacement_uses from anon,authenticated;
grant select on public.wizard_cantrip_replacement_uses to authenticated;

drop policy if exists wizard_cantrip_replacement_uses_read on public.wizard_cantrip_replacement_uses;
create policy wizard_cantrip_replacement_uses_read
on public.wizard_cantrip_replacement_uses
for select to authenticated
using (private.can_view_character(character_id,auth.uid()));

create or replace function public.replace_character_wizard_cantrip_v1(
  p_character_id uuid,
  p_old_character_spell_id uuid,
  p_new_spell_catalog_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_level integer;
  v_session public.character_preparation_sessions%rowtype;
  v_old public.character_spells%rowtype;
  v_new public.spell_catalog%rowtype;
  v_new_character_spell_id uuid;
begin
  perform private.gena_assert_assigned_player(p_character_id);
  v_level:=private.character_wizard_level(p_character_id);
  if coalesce(v_level,0)<1 then raise exception 'Wizard cantrip replacement requires the active Wizard class'; end if;

  select * into v_session
  from public.character_preparation_sessions
  where character_id=p_character_id
  for update;
  if v_session.character_id is null or not v_session.is_open then
    raise exception 'Wizard cantrip replacement is available only after a granted Long Rest';
  end if;
  if exists(
    select 1 from public.wizard_cantrip_replacement_uses use_row
    where use_row.character_id=p_character_id
      and use_row.long_rest_generation=v_session.generation
  ) then raise exception 'Wizard cantrip replacement was already used after this Long Rest'; end if;

  select * into v_old
  from public.character_spells
  where id=p_old_character_spell_id and character_id=p_character_id
  for update;
  if v_old.id is null or v_old.spell_level<>0 or v_old.cast_mode<>'cantrip' then
    raise exception 'Choose a known cantrip to replace';
  end if;
  if v_old.catalog_spell_id is null or not exists(
    select 1 from public.spell_catalog_classes class_link
    where class_link.spell_id=v_old.catalog_spell_id and class_link.class_key='wizard'
  ) then raise exception 'The replaced cantrip must belong to the Wizard spell list'; end if;

  select * into v_new from public.spell_catalog where id=p_new_spell_catalog_id;
  if v_new.id is null then raise exception 'Catalog cantrip not found'; end if;
  if v_new.spell_level<>0 then raise exception 'The replacement must be a cantrip'; end if;
  if not exists(
    select 1 from public.spell_catalog_classes class_link
    where class_link.spell_id=v_new.id and class_link.class_key='wizard'
  ) then raise exception 'The replacement cantrip must belong to the Wizard spell list'; end if;
  if v_new.id=v_old.catalog_spell_id then raise exception 'Choose a different Wizard cantrip'; end if;
  if exists(
    select 1 from public.character_spells spell
    where spell.character_id=p_character_id and spell.catalog_spell_id=v_new.id
  ) then raise exception 'The character already knows this cantrip'; end if;

  delete from public.character_spells where id=v_old.id;
  insert into public.character_spells(character_id,catalog_spell_id,prepared)
  values(p_character_id,v_new.id,false)
  returning id into v_new_character_spell_id;

  insert into public.wizard_cantrip_replacement_uses(
    character_id,long_rest_generation,changed_by,changed_at
  ) values(p_character_id,v_session.generation,auth.uid(),now());

  return jsonb_build_object(
    'characterId',p_character_id,
    'longRestGeneration',v_session.generation,
    'removedCharacterSpellId',v_old.id,
    'removedSpellCatalogId',v_old.catalog_spell_id,
    'newCharacterSpellId',v_new_character_spell_id,
    'newSpellCatalogId',v_new.id
  );
end;
$function$;

revoke all on function public.replace_character_wizard_cantrip_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.replace_character_wizard_cantrip_v1(uuid,uuid,uuid) to authenticated;

-- One ordinary player line means the player has left the post-rest choice phase.
-- Mechanical chat events do not close it because they have event_kind set.
create or replace function private.close_character_rest_windows_from_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.character_id is null
     or new.user_id is null
     or new.event_kind is not null
     or nullif(btrim(coalesce(new.body,'')),'') is null then
    return new;
  end if;
  if not exists(
    select 1 from public.characters c
    where c.id=new.character_id
      and c.character_type='pc'
      and c.assigned_user_id=new.user_id
  ) then return new; end if;

  update public.character_short_rest_sessions
  set is_open=false,closed_at=now(),updated_at=now()
  where character_id=new.character_id and is_open=true;

  update public.character_preparation_sessions
  set is_open=false,closed_at=now(),closed_by_message_id=new.id,updated_at=now()
  where character_id=new.character_id and is_open=true;

  return new;
end;
$function$;

revoke all on function private.close_character_rest_windows_from_chat() from public,anon,authenticated;

drop trigger if exists close_character_rest_windows_on_player_text on public.chat_messages;
create trigger close_character_rest_windows_on_player_text
after insert on public.chat_messages
for each row execute function private.close_character_rest_windows_from_chat();

create or replace function private.apply_wizard_base_closure(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_wizard uuid;
  v_preparations jsonb;
begin
  select id into v_wizard
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:wizard'
    and is_builtin=true
    and is_active=true
  order by version desc,created_at desc
  limit 1;
  if v_wizard is null then return; end if;

  select coalesce(jsonb_agg(entry order by ord),'[]'::jsonb)
  into v_preparations
  from jsonb_array_elements(coalesce((select rules_meta->'post_rest_preparations' from public.rule_templates where id=v_wizard),'[]'::jsonb))
       with ordinality items(entry,ord)
  where coalesce(entry->>'key','')<>'wizard-cantrip-replacement-notice';

  update public.rule_templates
  set rules_meta=(coalesce(rules_meta,'{}'::jsonb)
      || jsonb_build_object(
        'core_traits',coalesce(rules_meta->'core_traits','{}'::jsonb)
          || jsonb_build_object('starting_equipment','[]'::jsonb),
        'post_rest_preparations',coalesce(v_preparations,'[]'::jsonb),
        'manual_resolution_policy',coalesce(rules_meta->'manual_resolution_policy','{}'::jsonb)
          || jsonb_build_object(
            'cantrip_progression','gm_sheet_edit',
            'cantrip_long_rest_replacement','gena_popup_rpc',
            'scholar','player_choice_then_gm_expertise_edit',
            'asi_epic_boon','generic_or_gm_sheet_edit'
          ),
        'gena_rest_window_policy','ordinary_player_text_closes_all_post_rest_choices'
      )),
      updated_at=now()
  where id=v_wizard;

  update public.rule_template_levels l
  set mechanics=(
    select coalesce(jsonb_agg(
      case
        when mechanic#>>'{payload,label}'='Заклинания'
          and mechanic#>>'{payload,description}' like '%Маленький предмет%'
        then jsonb_set(
          mechanic,
          '{payload,description}',
          to_jsonb(replace(mechanic#>>'{payload,description}','Маленький предмет','Крошечный предмет')),
          false
        )
        else mechanic
      end order by ord
    ),'[]'::jsonb)
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality entries(mechanic,ord)
  )
  where l.template_id=v_wizard;
end;
$function$;

revoke all on function private.apply_wizard_base_closure(uuid) from public,anon,authenticated;
grant execute on function private.apply_wizard_base_closure(uuid) to service_role;

create or replace function private.apply_wizard_base_closure_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.apply_wizard_base_closure(new.id);
  return new;
end;
$function$;

revoke all on function private.apply_wizard_base_closure_after_campaign() from public,anon,authenticated;

drop trigger if exists zzzzzzzz_campaigns_apply_wizard_base_closure on public.campaigns;
create trigger zzzzzzzz_campaigns_apply_wizard_base_closure
after insert on public.campaigns
for each row execute function private.apply_wizard_base_closure_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.apply_wizard_base_closure(v_campaign.id);
  end loop;
end;
$block$;

commit;
