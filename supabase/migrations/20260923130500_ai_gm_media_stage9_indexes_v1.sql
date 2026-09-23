-- AI GM Stage 9 follow-up: cover foreign-key lookup paths flagged by Supabase advisors.

create index if not exists ai_gm_media_lifecycle_source_character_idx
  on private.ai_gm_media_lifecycle(source_character_id)
  where source_character_id is not null;

create index if not exists ai_gm_media_publications_room_idx
  on private.ai_gm_media_publications(room_id);

create index if not exists ai_gm_media_publications_message_idx
  on private.ai_gm_media_publications(message_id)
  where message_id is not null;
