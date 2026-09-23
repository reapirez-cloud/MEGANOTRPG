-- AI GM Stage 12: set explicit PC dialogue audience after canonical turn submission.

create or replace function public.set_chat_message_audience_v1(
  p_message_id bigint,
  p_recipient_character_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.chat_messages%rowtype;
  v_campaign_id uuid;
  v_recipients uuid[] := coalesce(p_recipient_character_ids,'{}'::uuid[]);
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select m.*,r.campaign_id
    into v_message,v_campaign_id
  from public.chat_messages m
  join public.chat_rooms r on r.id=m.room_id
  where m.id=p_message_id
  for update of m;

  if v_message.id is null then
    raise exception 'chat_message_not_found';
  end if;

  if v_message.user_id is distinct from v_user_id
     and not private.can_manage_campaign(v_campaign_id,v_user_id)
  then
    raise exception 'chat_message_audience_not_allowed';
  end if;

  if v_message.character_id is null then
    raise exception 'chat_message_audience_requires_character';
  end if;

  if exists(
    select 1
    from private.ai_gm_turn_revisions r
    join public.agent_jobs j on j.id=r.job_id
    where r.source_message_id=p_message_id
      and r.state='active'
      and j.status in ('running','waiting_for_user','completed')
  ) then
    raise exception 'chat_message_audience_locked_by_ai_gm_turn';
  end if;

  update public.chat_messages m
  set audience_scope=case
        when cardinality(v_recipients)>0 then 'direct_pc'
        else 'scene'
      end,
      recipient_character_ids=v_recipients,
      edited_at=case
        when m.recipient_character_ids is distinct from v_recipients
          or m.audience_scope is distinct from case
            when cardinality(v_recipients)>0 then 'direct_pc'
            else 'scene'
          end
        then coalesce(m.edited_at,now())
        else m.edited_at
      end
  where m.id=p_message_id
  returning m.* into v_message;

  return jsonb_build_object(
    'message_id',v_message.id,
    'audience_scope',v_message.audience_scope,
    'recipient_character_ids',v_message.recipient_character_ids
  );
end;
$$;

revoke all on function public.set_chat_message_audience_v1(bigint,uuid[])
  from public,anon;
grant execute on function public.set_chat_message_audience_v1(bigint,uuid[])
  to authenticated,service_role;
