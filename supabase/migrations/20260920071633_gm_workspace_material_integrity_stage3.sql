alter table public.gm_workspace_folders
  add constraint gm_workspace_folders_identity_unique
  unique (id, campaign_id, workspace_user_id);

alter table public.gm_workspace_folders
  drop constraint gm_workspace_folders_parent_id_fkey;

alter table public.gm_workspace_folders
  add constraint gm_workspace_folders_parent_workspace_fkey
  foreign key (parent_id, campaign_id, workspace_user_id)
  references public.gm_workspace_folders(id, campaign_id, workspace_user_id)
  on delete restrict;

alter table public.gm_workspace_files
  drop constraint gm_workspace_files_folder_id_fkey;

alter table public.gm_workspace_files
  add constraint gm_workspace_files_folder_workspace_fkey
  foreign key (folder_id, campaign_id, workspace_user_id)
  references public.gm_workspace_folders(id, campaign_id, workspace_user_id)
  on delete restrict;

create or replace function public.reorder_gm_workspace_folder_v1(
  p_folder_id uuid,
  p_direction text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_folder public.gm_workspace_folders%rowtype;
  v_ids uuid[];
  v_index integer;
  v_target integer;
  v_temp uuid;
  v_position integer;
  v_direction text := lower(trim(coalesce(p_direction, '')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_direction not in ('up', 'down') then raise exception 'Direction must be up or down'; end if;

  select * into v_folder
  from public.gm_workspace_folders
  where id = p_folder_id
  for update;

  if v_folder.id is null then raise exception 'Folder not found'; end if;

  if not private.can_access_gm_workspace(
    v_folder.campaign_id,
    v_folder.workspace_user_id,
    auth.uid()
  ) then
    raise exception 'Not allowed';
  end if;

  perform id
  from public.gm_workspace_folders
  where campaign_id = v_folder.campaign_id
    and workspace_user_id = v_folder.workspace_user_id
    and parent_id is not distinct from v_folder.parent_id
  for update;

  select array_agg(id order by sort_order, name, id)
  into v_ids
  from public.gm_workspace_folders
  where campaign_id = v_folder.campaign_id
    and workspace_user_id = v_folder.workspace_user_id
    and parent_id is not distinct from v_folder.parent_id;

  v_index := array_position(v_ids, p_folder_id);
  if v_index is null then raise exception 'Folder is not in its sibling set'; end if;

  v_target := case when v_direction = 'up' then v_index - 1 else v_index + 1 end;
  if v_target < 1 or v_target > coalesce(array_length(v_ids, 1), 0) then return; end if;

  v_temp := v_ids[v_index];
  v_ids[v_index] := v_ids[v_target];
  v_ids[v_target] := v_temp;

  for v_position in 1..array_length(v_ids, 1) loop
    update public.gm_workspace_folders
    set sort_order = v_position - 1
    where id = v_ids[v_position]
      and campaign_id = v_folder.campaign_id
      and workspace_user_id = v_folder.workspace_user_id;
  end loop;
end;
$function$;

create or replace function public.delete_gm_workspace_folder_v1(
  p_folder_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_folder public.gm_workspace_folders%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_folder
  from public.gm_workspace_folders
  where id = p_folder_id
  for update;

  if v_folder.id is null then raise exception 'Folder not found'; end if;

  if not private.can_access_gm_workspace(
    v_folder.campaign_id,
    v_folder.workspace_user_id,
    auth.uid()
  ) then
    raise exception 'Not allowed';
  end if;

  update public.gm_workspace_folders
  set parent_id = v_folder.parent_id
  where parent_id = v_folder.id
    and campaign_id = v_folder.campaign_id
    and workspace_user_id = v_folder.workspace_user_id;

  update public.gm_workspace_files
  set folder_id = null,
      updated_at = now()
  where folder_id = v_folder.id
    and campaign_id = v_folder.campaign_id
    and workspace_user_id = v_folder.workspace_user_id;

  delete from public.gm_workspace_folders
  where id = v_folder.id
    and campaign_id = v_folder.campaign_id
    and workspace_user_id = v_folder.workspace_user_id;
end;
$function$;

revoke all on function public.reorder_gm_workspace_folder_v1(uuid, text)
  from public, anon;
grant execute on function public.reorder_gm_workspace_folder_v1(uuid, text)
  to authenticated;

revoke all on function public.delete_gm_workspace_folder_v1(uuid)
  from public, anon;
grant execute on function public.delete_gm_workspace_folder_v1(uuid)
  to authenticated;
