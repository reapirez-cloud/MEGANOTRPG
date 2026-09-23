-- AI GM Stage 12: atomically attach explicit PC audience to submitted player turns.

create or replace function public.submit_player_turn_stage12_v1(
  p_draft_id uuid,
  p_expected_revision integer,
  p_turn_command_id uuid,
  p_recipient_character_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_trigger_message_id bigint;
  v_audience jsonb;
begin
  v_result:=public.submit_player_turn_v1(
    p_draft_id,
    p_expected_revision,
    p_turn_command_id
  );

  v_trigger_message_id:=nullif(v_result->>'trigger_message_id','')::bigint;
  if v_trigger_message_id is null then
    raise exception 'player_turn_trigger_message_missing';
  end if;

  v_audience:=public.set_chat_message_audience_v1(
    v_trigger_message_id,
    coalesce(p_recipient_character_ids,'{}'::uuid[])
  );

  return v_result||jsonb_build_object(
    'audience_scope',v_audience->>'audience_scope',
    'recipient_character_ids',coalesce(
      v_audience->'recipient_character_ids',
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.submit_player_turn_stage12_v1(
  uuid,integer,uuid,uuid[]
) from public,anon;
grant execute on function public.submit_player_turn_stage12_v1(
  uuid,integer,uuid,uuid[]
) to authenticated,service_role;

comment on function public.submit_player_turn_stage12_v1(
  uuid,integer,uuid,uuid[]
) is
  'Stage 12 atomic player turn submit plus server-validated explicit PC dialogue audience.';
