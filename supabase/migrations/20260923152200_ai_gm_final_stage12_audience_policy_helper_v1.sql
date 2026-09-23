-- AI GM Stage 12 RLS helper execution: allow authenticated policies
-- to evaluate the fail-closed direct-PC visibility predicate.

grant execute on function private.can_read_chat_message_stage12_v1(
  uuid,uuid,uuid,uuid,text,uuid[]
) to authenticated;
