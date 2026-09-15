update public.character_inventory_items
set equipment_slot = case
  when item_state->>'legacy_category' = 'weapon' then 'main_hand'
  when item_state->>'legacy_category' = 'armor' then 'chest'
  when item_state->>'legacy_category' = 'focus' then 'other'
  else equipment_slot
end
where category = 'equipment'
  and equipment_slot is null
  and item_state->>'legacy_category' in ('weapon','armor','focus');
