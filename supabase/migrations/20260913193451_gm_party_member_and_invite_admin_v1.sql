create or replace function public.remove_campaign_member_v1(
  p_campaign_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'Only campaign owner can remove members';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Campaign owner cannot remove themselves';
  end if;

  if exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
      and cm.is_owner = true
  ) then
    raise exception 'Campaign owner cannot be removed';
  end if;

  if not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
  ) then
    raise exception 'Campaign member not found';
  end if;

  update public.characters
  set assigned_user_id = null,
      updated_at = now()
  where campaign_id = p_campaign_id
    and assigned_user_id = p_user_id;

  delete from public.campaign_members
  where campaign_id = p_campaign_id
    and user_id = p_user_id;
end;
$function$;

revoke all on function public.remove_campaign_member_v1(uuid, uuid)
  from public, anon;
grant execute on function public.remove_campaign_member_v1(uuid, uuid)
  to authenticated;

create or replace function public.revoke_campaign_invite_v1(
  p_campaign_id uuid,
  p_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_campaign(p_campaign_id, auth.uid()) then
    raise exception 'Only GM or owner can revoke invites';
  end if;

  update public.campaign_invites
  set revoked_at = now()
  where campaign_id = p_campaign_id
    and code = p_code
    and revoked_at is null;

  if not found then
    raise exception 'Active invite not found';
  end if;
end;
$function$;

revoke all on function public.revoke_campaign_invite_v1(uuid, text)
  from public, anon;
grant execute on function public.revoke_campaign_invite_v1(uuid, text)
  to authenticated;
