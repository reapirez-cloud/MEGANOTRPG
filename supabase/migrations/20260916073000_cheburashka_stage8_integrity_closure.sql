-- Stage 8 integrity closure: keep Larisa storage metadata aligned with the
-- physical Cheburashka root container. The world storage row remains the
-- authority for location/visibility/access; the root item mirrors human-facing
-- name/description only.

update public.character_inventory_items item
set name = storage.name,
    description = storage.description,
    version = item.version + 1,
    updated_at = now()
from public.world_storages storage
where storage.root_item_id = item.id
  and (
    item.name is distinct from storage.name
    or item.description is distinct from storage.description
  );

create or replace function public.update_world_storage_v1(
  p_world_storage_id uuid,
  p_name text,
  p_description text,
  p_visibility_mode text,
  p_access_mode text,
  p_owner_character_id uuid,
  p_expected_version bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_storage public.world_storages%rowtype;
  v_is_manager boolean;
  v_existing public.engine_command_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if btrim(coalesce(p_name,'')) = '' then raise exception 'World storage name is required'; end if;
  if p_visibility_mode not in ('campaign','owner','gm')
     or p_access_mode not in ('shared','owner','gm') then
    raise exception 'Unsupported world storage policy';
  end if;

  select * into v_storage
  from public.world_storages storage
  where storage.id = p_world_storage_id
  for update;

  if not found then raise exception 'World storage not found'; end if;
  if v_storage.version <> p_expected_version then
    raise exception 'World storage version conflict: expected %, current %',
      p_expected_version, v_storage.version;
  end if;

  v_is_manager := private.can_manage_campaign(v_storage.campaign_id, auth.uid());

  if not v_is_manager then
    if v_storage.owner_character_id is null
       or not private.can_operate_world_storage_v1(
         v_storage.id, v_storage.owner_character_id, auth.uid()
       ) then
      raise exception 'Not allowed';
    end if;
    if p_owner_character_id is distinct from v_storage.owner_character_id
       or p_visibility_mode <> 'owner'
       or p_access_mode <> 'owner' then
      raise exception 'Player cannot change stash ownership or sharing policy';
    end if;
  end if;

  if p_owner_character_id is not null and not exists (
    select 1 from public.characters owner_character
    where owner_character.id = p_owner_character_id
      and owner_character.campaign_id = v_storage.campaign_id
  ) then
    raise exception 'World storage owner belongs to another campaign';
  end if;

  if p_access_mode = 'shared' and p_visibility_mode <> 'campaign' then
    raise exception 'Shared storage must be campaign-visible';
  end if;
  if (p_access_mode = 'owner' or p_visibility_mode = 'owner')
     and p_owner_character_id is null then
    raise exception 'Owner-only storage requires an owner character';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('world-storage:' || p_world_storage_id::text, 0)
  );

  select * into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;
  if found then
    if v_existing.created_by <> auth.uid()
       or v_existing.engine <> 'larisa'
       or v_existing.command_kind <> 'world.storage_update'
       or v_existing.aggregate_id <> p_world_storage_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  update public.world_storages storage
  set name = btrim(p_name),
      description = coalesce(p_description,''),
      visibility_mode = p_visibility_mode,
      access_mode = p_access_mode,
      owner_character_id = p_owner_character_id,
      version = storage.version + 1,
      updated_at = now()
  where storage.id = p_world_storage_id
  returning to_jsonb(storage) into v_result;

  update public.character_inventory_items item
  set name = btrim(p_name),
      description = coalesce(p_description,''),
      version = item.version + 1,
      updated_at = now()
  where item.id = v_storage.root_item_id
    and item.world_storage_id = p_world_storage_id
    and item.character_id is null;

  if not found then
    raise exception 'World storage root container not found';
  end if;

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind,
    aggregate_id, result, created_by
  )
  values(
    p_command_id, v_storage.campaign_id, 'larisa', 'world.storage_update',
    p_world_storage_id, v_result, auth.uid()
  );

  return v_result;
end;
$function$;

revoke all on function public.update_world_storage_v1(uuid,text,text,text,text,uuid,bigint,uuid)
from public, anon;
grant execute on function public.update_world_storage_v1(uuid,text,text,text,text,uuid,bigint,uuid)
to authenticated;
