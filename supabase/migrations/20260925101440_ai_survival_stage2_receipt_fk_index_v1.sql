
create index if not exists ai_survival_turn_receipts_source_message_idx
  on private.ai_survival_turn_receipts_v1(source_message_id);
