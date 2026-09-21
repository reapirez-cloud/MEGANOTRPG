-- One-off hard purge requested for character "Вита Морр".
-- This keeps the player account / campaign membership, but removes the character
-- and character-owned / character-attributed state. It aborts if the name is
-- missing or ambiguous.

do $purge_vita_morr$
declare
  v_id uuid;
  v_count integer;
  v_storage_ids uuid[];
begin
  select count(*)
    into v_count
  from public.characters
  where lower(btrim(name)) = lower(btrim('Вита Морр'));

  if v_count = 0 then
    raise exception 'Вита Морр not found';
  end if;

  if v_count <> 1 then
    raise exception 'Expected exactly one Вита Морр, found %', v_count;
  end if;

  select id
    into v_id
  from public.characters
  where lower(btrim(name)) = lower(btrim('Вита Морр'))
  limit 1;

  -- Generic media links are not protected by a character FK.
  delete from public.media_bindings
  where target_id = v_id
    and target_type in ('character', 'campaign_gallery');

  -- Trade owns several RESTRICT relations to characters/items.
  delete from public.trade_sessions
  where side_a_character_id = v_id
     or side_b_character_id = v_id;

  delete from public.trade_offer_lines
  where owner_character_id = v_id;

  delete from public.trade_messages
  where actor_character_id = v_id;

  delete from public.trade_visible_items
  where owner_character_id = v_id;

  delete from public.trade_interest_marks
  where interested_character_id = v_id;

  delete from public.trade_events
  where actor_character_id = v_id;

  -- Character-owned world storage can otherwise conflict with SET NULL +
  -- owner-required checks and inventory RESTRICT relations.
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_storage_ids
  from public.world_storages
  where owner_character_id = v_id;

  update public.world_storages
  set root_item_id = null
  where id = any(v_storage_ids);

  -- Inventory has a self-RESTRICT holder FK. Flatten only the rows that will be
  -- removed, then delete the complete character/storage scopes.
  update public.character_inventory_items
  set holder_item_id = null,
      placement_kind = case when surface_id is not null then 'surface' else 'root' end,
      placement_index = null,
      grid_x = null,
      grid_y = null,
      grid_rotation = 0,
      equipped = false
  where character_id = v_id
     or world_storage_id = any(v_storage_ids);

  delete from public.character_inventory_items
  where character_id = v_id
     or world_storage_id = any(v_storage_ids);

  delete from public.world_storages
  where id = any(v_storage_ids);

  -- Keep the user/campaign membership, only clear the active-character pointer.
  update public.campaign_members
  set active_character_id = null
  where active_character_id = v_id;

  -- Remove the character from shared array-valued visibility/participant state.
  update public.campaign_events
  set participant_character_ids = array_remove(participant_character_ids, v_id),
      visible_character_ids = array_remove(visible_character_ids, v_id)
  where v_id = any(coalesce(participant_character_ids, '{}'::uuid[]))
     or v_id = any(coalesce(visible_character_ids, '{}'::uuid[]));

  update public.campaign_memory_facts
  set visible_character_ids = array_remove(visible_character_ids, v_id)
  where v_id = any(coalesce(visible_character_ids, '{}'::uuid[]));

  update public.campaign_memory_summaries
  set visible_character_ids = array_remove(visible_character_ids, v_id)
  where v_id = any(coalesce(visible_character_ids, '{}'::uuid[]));

  -- Character chat identity/history and personal room.
  delete from public.chat_messages where character_id = v_id;
  delete from public.chat_rooms where character_id = v_id;

  -- Direct character-owned / attributed rows.
  delete from public.achievements where character_id = v_id;
  delete from public.character_spell_legacy_archive where character_id = v_id;
  delete from public.character_short_rest_sessions where character_id = v_id;
  delete from public.character_preparation_records where character_id = v_id;
  delete from public.character_preparation_sessions where character_id = v_id;
  delete from public.wizard_cantrip_replacement_uses where character_id = v_id;
  delete from public.wizard_spell_mastery_replacements where character_id = v_id;
  delete from public.wizard_memorize_spell_uses where character_id = v_id;
  delete from public.wizard_spellbook_level_grants where character_id = v_id;
  delete from public.character_spell_options where character_id = v_id;
  delete from public.character_source_suppressions where character_id = v_id;
  delete from public.character_resource_states where character_id = v_id;
  delete from public.character_template_assignments where character_id = v_id;
  delete from public.scene_surface_character_access where character_id = v_id;
  delete from public.scene_participants where character_id = v_id;
  delete from public.character_location_link_discoveries where character_id = v_id;
  delete from public.character_npc_discoveries
  where character_id = v_id or npc_character_id = v_id;
  delete from public.character_location_discoveries where character_id = v_id;
  delete from public.character_world_state where character_id = v_id;
  delete from public.location_npc_habitats where npc_character_id = v_id;
  delete from public.chat_actor_bindings where character_id = v_id;
  delete from public.gm_npc_notes where character_id = v_id;
  delete from public.notifications where actor_character_id = v_id;
  delete from public.feed_comments where character_id = v_id;
  delete from public.feed_reactions where character_id = v_id;
  delete from public.feed_items where character_id = v_id;
  delete from public.campaign_art_items where character_id = v_id;
  delete from public.character_diary_posts where character_id = v_id;
  delete from public.character_features where character_id = v_id;
  delete from public.character_spells where character_id = v_id;
  delete from public.character_sheets where character_id = v_id;
  delete from public.engine_command_receipts where actor_character_id = v_id;
  delete from public.campaign_events where actor_character_id = v_id;

  -- Canonical row last. Remaining FK actions can only cascade/set-null.
  delete from public.characters
  where id = v_id;

  -- Hard assertions for the non-FK/generic references we explicitly cleaned.
  if exists (
    select 1
    from public.characters
    where lower(btrim(name)) = lower(btrim('Вита Морр'))
  ) then
    raise exception 'Вита Морр still exists after purge';
  end if;

  if exists (
    select 1
    from public.character_spell_legacy_archive
    where character_id = v_id
  ) then
    raise exception 'Legacy spell archive still references Вита Морр';
  end if;

  if exists (
    select 1
    from public.media_bindings
    where target_id = v_id
      and target_type in ('character', 'campaign_gallery')
  ) then
    raise exception 'Media bindings still reference Вита Морр';
  end if;

  if exists (
    select 1
    from public.campaign_events
    where v_id = any(coalesce(participant_character_ids, '{}'::uuid[]))
       or v_id = any(coalesce(visible_character_ids, '{}'::uuid[]))
  ) then
    raise exception 'Campaign event arrays still reference Вита Морр';
  end if;

  if exists (
    select 1
    from public.campaign_memory_facts
    where v_id = any(coalesce(visible_character_ids, '{}'::uuid[]))
  ) or exists (
    select 1
    from public.campaign_memory_summaries
    where v_id = any(coalesce(visible_character_ids, '{}'::uuid[]))
  ) then
    raise exception 'Campaign memory visibility still references Вита Морр';
  end if;
end
$purge_vita_morr$;
