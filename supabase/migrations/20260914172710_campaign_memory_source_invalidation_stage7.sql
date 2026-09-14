alter table public.campaign_memory_summaries
  add column status text not null default 'active'
    check (status in ('active','invalidated')),
  add column invalidated_at timestamptz;

create index campaign_memory_summaries_active_idx
  on public.campaign_memory_summaries (campaign_id, period_end desc, created_at desc)
  where status = 'active';

create or replace function private.invalidate_campaign_memory_from_event()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
declare
  v_event_id uuid;
  v_reason text;
begin
  v_event_id := case when tg_op = 'DELETE' then old.id else new.id end;
  v_reason := case
    when tg_op = 'DELETE' then 'source_event_deleted'
    else 'source_event_changed'
  end;

  update public.campaign_memory_facts
  set status = 'retracted',
      provenance = provenance || jsonb_build_object(
        'invalidation_reason', v_reason,
        'invalidated_source_event_id', v_event_id
      ),
      updated_at = now()
  where status = 'active'
    and source_event_ids @> array[v_event_id]::uuid[];

  update public.campaign_memory_summaries
  set status = 'invalidated',
      invalidated_at = now(),
      updated_at = now()
  where status = 'active'
    and key_event_ids @> array[v_event_id]::uuid[];

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger invalidate_campaign_memory_from_event
after update of summary, payload or delete
on public.campaign_events
for each row execute function private.invalidate_campaign_memory_from_event();
