-- CLASS_MIGRATION_SCOPE: infrastructure
-- Generic CE spell-slot bridge: sheet profile compatibility + single-ledger consumption.

create or replace function public.apply_class_template_sheet_profile(
  p_character_id uuid,
  p_template_id uuid,
  p_template_level integer
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_template public.rule_templates%rowtype;
  v_profile jsonb;
  v_slots_profile jsonb;
  v_target_slots jsonb;
  v_existing_slots jsonb;
  v_next_slots jsonb := '{}'::jsonb;
  v_level integer;
  v_max integer;
  v_used integer;
  v_index integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;

  select t.* into v_template
  from public.rule_templates t
  join public.characters c on c.campaign_id=t.campaign_id
  where t.id=p_template_id and c.id=p_character_id and t.kind='class';
  if v_template.id is null then raise exception 'Class template not found'; end if;

  v_profile := v_template.rules_meta->'sheet_profile';
  if v_profile is null or jsonb_typeof(v_profile)<>'object' then return; end if;

  v_slots_profile := v_profile->'spell_slots_by_level';
  if jsonb_typeof(v_slots_profile)='array' then
    v_index := greatest(1,least(30,p_template_level))-1;
    v_target_slots := v_slots_profile->v_index;
  elsif jsonb_typeof(v_slots_profile)='object' then
    v_target_slots := v_slots_profile->greatest(1,least(30,p_template_level))::text;
  else
    v_target_slots := '{}'::jsonb;
  end if;
  if v_target_slots is null or jsonb_typeof(v_target_slots)<>'object' then
    v_target_slots := '{}'::jsonb;
  end if;

  select coalesce(spell_slots,'{}'::jsonb) into v_existing_slots
  from public.character_sheets where character_id=p_character_id;
  if v_existing_slots is null then raise exception 'Character sheet not found'; end if;

  for v_level in 1..9 loop
    v_max := greatest(0,coalesce((v_target_slots->>v_level::text)::integer,0));
    v_used := greatest(0,least(v_max,coalesce((v_existing_slots->v_level::text->>'used')::integer,0)));
    v_next_slots := v_next_slots || jsonb_build_object(v_level::text,jsonb_build_object('max',v_max,'used',v_used));
  end loop;

  update public.character_sheets set
    spellcasting_enabled=coalesce((v_profile->>'spellcasting_enabled')::boolean,spellcasting_enabled),
    spellcasting_ability=coalesce(nullif(v_profile->>'spellcasting_ability',''),spellcasting_ability),
    spell_slots=v_next_slots,
    updated_at=now()
  where character_id=p_character_id;
end;
$function$;

create or replace function private.sync_spell_slot_sheet_from_ledger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_level integer;
  v_payload jsonb;
begin
  if new.state_key !~ '^spell_slot_[1-9]$' then
    return new;
  end if;

  v_level := substring(new.state_key from '([1-9])$')::integer;
  v_payload := jsonb_build_object(
    'max', greatest(0,new.max_snapshot),
    'used', greatest(0,new.max_snapshot-new.current)
  );

  update public.character_sheets
  set spell_slots=jsonb_set(coalesce(spell_slots,'{}'::jsonb),array[v_level::text],v_payload,true),
      updated_at=now()
  where character_id=new.character_id
    and (coalesce(spell_slots,'{}'::jsonb)->v_level::text) is distinct from v_payload;

  return new;
end;
$function$;

revoke all on function private.sync_spell_slot_sheet_from_ledger_v1() from public,anon,authenticated;

drop trigger if exists character_resource_states_sync_spell_slot_sheet_v1 on public.character_resource_states;
create trigger character_resource_states_sync_spell_slot_sheet_v1
after insert or update of current,max_snapshot on public.character_resource_states
for each row execute function private.sync_spell_slot_sheet_from_ledger_v1();

create or replace function public.cast_prepared_spell(p_room_id uuid, p_spell_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  v_character_id uuid;
  v_spell public.character_spells%rowtype;
  v_slots jsonb;
  v_key text;
  v_state_key text;
  v_max integer;
  v_used integer;
  v_remaining integer;
  v_ledger_current integer;
  v_ledger_max integer;
  v_body text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_write_chat_room(p_room_id,auth.uid()) then raise exception 'Нет права писать в этот чат'; end if;

  select cm.active_character_id into v_character_id
  from public.chat_rooms r
  join public.campaign_members cm on cm.campaign_id=r.campaign_id and cm.user_id=auth.uid()
  where r.id=p_room_id;
  if v_character_id is null then raise exception 'Для заклинания нужен активный персонаж'; end if;

  select * into v_spell from public.character_spells s
  where s.id=p_spell_id and s.character_id=v_character_id;
  if v_spell.id is null then raise exception 'Заклинание не принадлежит активному персонажу'; end if;
  if not v_spell.prepared then raise exception 'Заклинание не подготовлено'; end if;

  if v_spell.cast_mode='slot' then
    if v_spell.slot_level is null then raise exception 'Для заклинания не выбран уровень ячейки'; end if;
    if v_spell.slot_level<v_spell.spell_level then raise exception 'Уровень ячейки ниже уровня заклинания'; end if;

    v_key := v_spell.slot_level::text;
    v_state_key := 'spell_slot_'||v_key;

    select current,max_snapshot into v_ledger_current,v_ledger_max
    from public.character_resource_states
    where character_id=v_character_id and state_key=v_state_key
    for update;

    if v_ledger_max is not null then
      if v_ledger_current<=0 then raise exception 'Ячейки % уровня закончились',v_spell.slot_level; end if;
      update public.character_resource_states
      set current=current-1,updated_by=auth.uid(),updated_at=now()
      where character_id=v_character_id and state_key=v_state_key;
      v_remaining := v_ledger_current-1;
      v_max := v_ledger_max;
    else
      select cs.spell_slots into v_slots from public.character_sheets cs
      where cs.character_id=v_character_id for update;
      v_max := coalesce((v_slots->v_key->>'max')::integer,0);
      v_used := coalesce((v_slots->v_key->>'used')::integer,0);
      if v_max<=0 then raise exception 'У персонажа нет ячеек % уровня',v_spell.slot_level; end if;
      if v_used>=v_max then raise exception 'Ячейки % уровня закончились',v_spell.slot_level; end if;
      v_used := v_used+1;
      v_remaining := v_max-v_used;
      update public.character_sheets
      set spell_slots=jsonb_set(coalesce(spell_slots,'{}'::jsonb),array[v_key],jsonb_build_object('max',v_max,'used',v_used),true),updated_at=now()
      where character_id=v_character_id;
    end if;

    v_body := '✨ '||v_spell.name||' — ячейка '||v_spell.slot_level||' ур. ('||v_remaining||'/'||v_max||' осталось)';
  else
    v_body := '✨ '||v_spell.name||' — кантрип';
  end if;

  insert into public.chat_messages(room_id,body) values(p_room_id,v_body);
  return v_body;
end;
$function$;

revoke all on function public.cast_prepared_spell(uuid,uuid) from public,anon;
grant execute on function public.cast_prepared_spell(uuid,uuid) to authenticated,service_role;