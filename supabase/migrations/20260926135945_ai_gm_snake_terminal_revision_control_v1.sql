-- Keep Snake replay controls available after a provider failure or player cancellation.
-- The generic resolver prefers active revisions, but the UI must still inspect the latest
-- terminal revision so the player can regenerate the same source turn.

CREATE OR REPLACE FUNCTION public.get_ai_gm_turn_control_v1(p_message_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_revision private.ai_gm_turn_revisions%rowtype;
  v_source public.chat_messages%rowtype;
  v_job public.agent_jobs%rowtype;
  v_can_manage boolean := false;
  v_is_author boolean := false;
  v_has_irreversible boolean := false;
  v_has_later boolean := false;
  v_in_progress boolean := false;
  v_plain_source boolean := false;
  v_block_reason text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select * into v_revision
  from private.ai_gm_turn_revisions r
  where r.id=private.resolve_ai_gm_revision_for_message_v1(p_message_id);

  -- Snake must still be able to inspect/replay a source message after the
  -- previous provider job failed or the player cancelled generation.
  -- The generic resolver intentionally prefers active revisions, so for
  -- control UI only we fall back to the latest terminal revision.
  if v_revision.id is null then
    select * into v_revision
    from private.ai_gm_turn_revisions r
    where r.source_message_id=p_message_id
    order by r.revision_no desc
    limit 1;
  end if;

  if v_revision.id is null then
    select r.* into v_revision
    from private.ai_gm_turn_effects fx
    join private.ai_gm_turn_revisions r on r.id=fx.revision_id
    where fx.effect_kind='chat_message'
      and fx.effect_ref=p_message_id::text
    order by r.revision_no desc
    limit 1;
  end if;

  if v_revision.id is null then
    return jsonb_build_object(
      'tracked',false,
      'message_id',p_message_id,
      'runtime_stage',11
    );
  end if;

  if not private.is_campaign_member(v_revision.campaign_id,v_user_id) then
    raise exception 'campaign_membership_required';
  end if;

  if not private.can_read_chat_room(v_revision.room_id) then
    raise exception 'chat_room_read_required';
  end if;

  perform private.sync_ai_gm_turn_ledger_v1(v_revision.job_id);

  select * into v_source
  from public.chat_messages
  where id=v_revision.source_message_id;

  select * into v_job
  from public.agent_jobs
  where id=v_revision.job_id;

  v_can_manage:=private.can_manage_campaign(v_revision.campaign_id,v_user_id);
  v_is_author:=v_source.user_id=v_user_id;
  v_in_progress:=v_job.status in ('queued','running');
  v_plain_source:=v_source.event_kind is null
    and v_source.turn_command_id is null
    and v_source.turn_component is null;

  select exists(
    select 1
    from private.ai_gm_turn_effects fx
    where fx.revision_id=v_revision.id
      and fx.rolled_back_at is null
      and fx.reversible=false
  ) into v_has_irreversible;

  v_has_later:=private.ai_gm_turn_has_later_messages_v1(v_revision.id);

  v_block_reason:=case
    when v_in_progress then 'Ход ИИ-ГМ ещё выполняется.'
    when v_has_irreversible then
      'Ход уже изменил механику/ресурсы или использовал разрешённый бросок. Автооткат заблокирован.'
    when v_has_later then
      'После этого хода уже появились более поздние сообщения. Сначала нельзя безопасно менять прошлую ветку.'
    else null
  end;

  return jsonb_build_object(
    'tracked',true,
    'campaign_id',v_revision.campaign_id,
    'room_id',v_revision.room_id,
    'source_message_id',v_revision.source_message_id,
    'source_body',v_source.body,
    'revision_id',v_revision.id,
    'revision_no',v_revision.revision_no,
    'job_id',v_revision.job_id,
    'job_status',v_job.status,
    'replay_mode',v_revision.replay_mode,
    'can_manage',v_can_manage,
    'is_source_author',v_is_author,
    'can_regenerate',(v_is_author or v_can_manage)
      and not v_in_progress
      and not v_has_irreversible
      and not v_has_later,
    'can_edit_resend',(v_is_author or v_can_manage)
      and v_plain_source
      and not v_in_progress
      and not v_has_irreversible
      and not v_has_later,
    'can_undo',v_can_manage
      and v_revision.state='active'
      and not v_in_progress
      and not v_has_irreversible
      and not v_has_later,
    'block_reason',v_block_reason,
    'runtime_stage',11
  );
end;
$function$

comment on function public.get_ai_gm_turn_control_v1(bigint) is
  'Returns Snake controls for an AI-GM turn, including safe regenerate access from the latest terminal revision after failed/cancelled generation.';
