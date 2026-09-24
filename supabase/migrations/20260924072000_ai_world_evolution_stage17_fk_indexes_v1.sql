-- Stage 17 follow-up: cover receipt foreign keys used by cleanup/audit paths.

create index if not exists ai_player_intent_adjudications_room_idx
  on public.ai_player_intent_adjudications (room_id);

create index if not exists ai_player_intent_adjudications_source_message_idx
  on public.ai_player_intent_adjudications (source_message_id);
