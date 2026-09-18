alter table public.character_features
  drop constraint character_features_kind_check;

alter table public.character_features
  add constraint character_features_kind_check
  check (
    kind = any (
      array[
        'feat'::text,
        'class_feature'::text,
        'racial_trait'::text,
        'feature'::text,
        'other'::text,
        'background_feature'::text,
        'effect'::text
      ]
    )
  );
