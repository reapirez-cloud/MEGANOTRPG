-- Stage 23 advisor closure: cover the updated_by foreign key.
create index if not exists ai_gm_content_settings_updated_by_idx
on public.ai_gm_content_settings(updated_by)
where updated_by is not null;
