-- Compatibility bridge for the Monk batch installer.
-- The canonical base completion function is private.complete_monk_base_runtime(uuid).

begin;

create or replace function private.complete_monk_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.complete_monk_base_runtime(p_campaign_id);
end;
$$;

revoke all on function private.complete_monk_runtime_v1(uuid) from public,anon,authenticated;
grant execute on function private.complete_monk_runtime_v1(uuid) to service_role;

commit;
