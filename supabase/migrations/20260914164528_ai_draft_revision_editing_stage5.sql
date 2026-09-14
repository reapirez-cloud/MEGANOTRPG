alter table public.ai_draft_revisions
  add column change_summary text not null default '',
  add column operations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(operations) = 'array');

update public.ai_draft_revisions
set change_summary = case
  when revision = 1 then 'Первичная версия AI-черновика.'
  else ''
end
where change_summary = '';

alter table public.ai_draft_revisions
  add constraint ai_draft_revisions_change_summary_len
  check (length(change_summary) <= 2000);
