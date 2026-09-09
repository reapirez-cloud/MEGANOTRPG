-- CLASS_MIGRATION_SCOPE: infrastructure
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_WORK_STATUS: sorcerer:stage5=IN_PROGRESS

begin;

-- Stage 5 originally names the predecessor by runtime purpose. Keep the
-- historical Stage 4 installer immutable and expose a tiny compatibility name.
create or replace function private.ensure_sorcerer_stage4_metamagic_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_sorcerer_metamagic_stage4_v1(p_campaign_id);
end;
$function$;

revoke all on function private.ensure_sorcerer_stage4_metamagic_runtime_v1(uuid)
  from public,anon,authenticated;
grant execute on function private.ensure_sorcerer_stage4_metamagic_runtime_v1(uuid)
  to service_role;

commit;
