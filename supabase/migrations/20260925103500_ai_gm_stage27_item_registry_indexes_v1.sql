-- Stage 27 item-registry follow-up: cover receipt FKs used by deletes/audits.
create index if not exists ai_gm_inventory_delta_character_idx
  on private.ai_gm_inventory_delta_receipts_v1(character_id);

create index if not exists ai_gm_inventory_delta_definition_idx
  on private.ai_gm_inventory_delta_receipts_v1(definition_id)
  where definition_id is not null;
