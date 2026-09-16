-- Stage 10 acceptance closure: SQL NULL must never count as acceptance.

create or replace function public.accept_trade_v1(
  p_session_id uuid,
  p_actor_character_id uuid,
  p_expected_revision bigint,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.trade_sessions%rowtype;
  v_existing public.engine_command_receipts%rowtype;
  v_lines jsonb;
  v_exchange jsonb;
  v_result jsonb;
  v_error text;
  v_new_revision bigint;
  v_both_accepted boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trade:'||p_session_id::text,0)
  );

  select * into v_session
  from public.trade_sessions
  where id=p_session_id
  for update;

  if not found or v_session.state<>'open' then
    raise exception 'Trade session is not open';
  end if;
  if v_session.revision<>p_expected_revision then
    raise exception 'trade.revision_stale';
  end if;
  if not private.can_act_trade_side_v1(
    p_session_id,p_actor_character_id,auth.uid()
  ) then
    raise exception 'Not allowed to accept for this trade side';
  end if;

  select * into v_existing
  from public.engine_command_receipts
  where command_id=p_command_id;

  if found then
    if v_existing.created_by<>auth.uid()
       or v_existing.engine<>'gena'
       or v_existing.command_kind<>'trade.accept'
       or v_existing.aggregate_id<>p_session_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ownerCharacterId',line.owner_character_id,
        'targetCharacterId',
          case
            when line.owner_character_id=v_session.side_a_character_id
              then v_session.side_b_character_id
            else v_session.side_a_character_id
          end,
        'itemId',line.item_id,
        'quantity',line.quantity,
        'itemVersion',line.item_version,
        'integrityFingerprint',line.integrity_fingerprint
      )
      order by line.item_id
    ),
    '[]'::jsonb
  )
  into v_lines
  from public.trade_offer_lines line
  where line.session_id=p_session_id;

  -- Validate before even recording the first acceptance. If outside inventory
  -- mutations made the offer stale, invalidate this revision persistently.
  begin
    perform private.cheburashka_validate_trade_exchange_v1(
      v_session.side_a_character_id,
      v_session.side_b_character_id,
      v_lines
    );
  exception
    when others then
      v_error:=sqlerrm;
      if v_error like 'trade.%' then
        v_new_revision:=private.trade_bump_revision_v1(p_session_id,v_error);
        v_result:=jsonb_build_object(
          'sessionId',p_session_id,
          'state','open',
          'revision',v_new_revision,
          'invalidated',true,
          'failureCode',v_error
        );
        perform private.trade_record_event_v1(
          p_session_id,'offer.invalidated',v_new_revision,
          p_actor_character_id,v_result,auth.uid()
        );
        insert into public.engine_command_receipts(
          command_id,campaign_id,engine,command_kind,aggregate_id,result,
          created_by,actor_character_id
        )
        values(
          p_command_id,v_session.campaign_id,'gena','trade.accept',
          p_session_id,v_result,auth.uid(),p_actor_character_id
        );
        return v_result;
      end if;
      raise;
  end;

  if p_actor_character_id=v_session.side_a_character_id then
    update public.trade_sessions
    set accepted_a_revision=revision,
        last_failure_code=null,
        updated_at=now()
    where id=p_session_id;
  else
    update public.trade_sessions
    set accepted_b_revision=revision,
        last_failure_code=null,
        updated_at=now()
    where id=p_session_id;
  end if;

  select * into v_session
  from public.trade_sessions
  where id=p_session_id
  for update;

  v_both_accepted := coalesce(
    v_session.accepted_a_revision=v_session.revision
    and v_session.accepted_b_revision=v_session.revision,
    false
  );

  if not v_both_accepted then
    v_result:=jsonb_build_object(
      'sessionId',p_session_id,
      'state','open',
      'revision',v_session.revision,
      'acceptedARevision',v_session.accepted_a_revision,
      'acceptedBRevision',v_session.accepted_b_revision,
      'committed',false
    );

    perform private.trade_record_event_v1(
      p_session_id,'trade.accepted',v_session.revision,
      p_actor_character_id,v_result,auth.uid()
    );

    insert into public.engine_command_receipts(
      command_id,campaign_id,engine,command_kind,aggregate_id,result,
      created_by,actor_character_id
    )
    values(
      p_command_id,v_session.campaign_id,'gena','trade.accept',
      p_session_id,v_result,auth.uid(),p_actor_character_id
    );

    return v_result;
  end if;

  -- Second acceptance commits the same revision in this transaction.
  begin
    v_exchange:=private.cheburashka_commit_trade_exchange_v1(
      v_session.side_a_character_id,
      v_session.side_b_character_id,
      v_lines
    );
  exception
    when others then
      v_error:=sqlerrm;
      if v_error like 'trade.%' then
        v_new_revision:=private.trade_bump_revision_v1(p_session_id,v_error);
        v_result:=jsonb_build_object(
          'sessionId',p_session_id,
          'state','open',
          'revision',v_new_revision,
          'invalidated',true,
          'failureCode',v_error
        );
        perform private.trade_record_event_v1(
          p_session_id,'offer.invalidated',v_new_revision,
          p_actor_character_id,v_result,auth.uid()
        );
        insert into public.engine_command_receipts(
          command_id,campaign_id,engine,command_kind,aggregate_id,result,
          created_by,actor_character_id
        )
        values(
          p_command_id,v_session.campaign_id,'gena','trade.accept',
          p_session_id,v_result,auth.uid(),p_actor_character_id
        );
        return v_result;
      end if;
      raise;
  end;

  update public.trade_sessions
  set state='committed',
      committed_at=now(),
      last_failure_code=null,
      updated_at=now()
  where id=p_session_id;

  v_result:=jsonb_build_object(
    'sessionId',p_session_id,
    'state','committed',
    'revision',v_session.revision,
    'committed',true,
    'exchange',v_exchange
  );

  perform private.trade_record_event_v1(
    p_session_id,'trade.committed',v_session.revision,
    p_actor_character_id,v_result,auth.uid()
  );

  insert into public.engine_command_receipts(
    command_id,campaign_id,engine,command_kind,aggregate_id,result,
    created_by,actor_character_id
  )
  values(
    p_command_id,v_session.campaign_id,'gena','trade.accept',
    p_session_id,v_result,auth.uid(),p_actor_character_id
  );

  return v_result;
end;
$function$;
revoke all on function public.accept_trade_v1(uuid,uuid,bigint,uuid)
from public,anon;
grant execute on function public.accept_trade_v1(uuid,uuid,bigint,uuid)
