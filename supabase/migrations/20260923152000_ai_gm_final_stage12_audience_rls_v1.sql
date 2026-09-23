-- AI GM Stage 12 audience privacy: direct PC messages are readable only
-- by their author, explicit recipient players, and campaign managers.

create or replace function private.can_read_chat_message_stage12_v1(
  p_room_id uuid,
  p_user_id uuid,
  p_message_user_id uuid,
  p_character_id uuid,
  p_audience_scope text,
  p_recipient_character_ids uuid[]
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    private.can_read_chat_room(p_room_id,p_user_id)
    and (
      coalesce(p_audience_scope,'scene')<>'direct_pc'
      or p_message_user_id=p_user_id
      or exists(
        select 1
        from public.chat_rooms r
        where r.id=p_room_id
          and private.can_manage_campaign(r.campaign_id,p_user_id)
      )
      or exists(
        select 1
        from public.characters c
        where c.id=p_character_id
          and c.assigned_user_id=p_user_id
      )
      or exists(
        select 1
        from public.characters c
        where c.id=any(coalesce(p_recipient_character_ids,'{}'::uuid[]))
          and c.assigned_user_id=p_user_id
      )
    );
$$;

revoke all on function private.can_read_chat_message_stage12_v1(
  uuid,uuid,uuid,uuid,text,uuid[]
) from public,anon,authenticated;

drop policy if exists chat_messages_scoped_read
  on public.chat_messages;

create policy chat_messages_scoped_read
on public.chat_messages
for select
to authenticated
using (
  private.can_read_chat_message_stage12_v1(
    room_id,
    (select auth.uid()),
    user_id,
    character_id,
    audience_scope,
    recipient_character_ids
  )
);
