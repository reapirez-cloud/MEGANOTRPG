create or replace function private.reject_direct_npc_identity_update_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(current_setting('meganot.npc_identity_versioned_write',true),'')<>'on' then
    raise exception using errcode='55000',message='npc_identity_direct_update_forbidden';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_direct_npc_identity_update_v1()
  from public,anon,authenticated;
