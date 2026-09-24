
create index if not exists ai_player_director_preferences_user_fk_idx
  on public.ai_player_director_preferences(user_id);

create index if not exists ai_player_director_preference_versions_user_fk_idx
  on public.ai_player_director_preference_versions(user_id);
