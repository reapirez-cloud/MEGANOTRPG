
alter function public.get_player_turn_draft_v1(uuid,uuid)
  set schema private;
alter function public.cancel_player_turn_draft_v1(uuid)
  set schema private;

revoke all on function private.get_player_turn_draft_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function private.get_player_turn_draft_v1(uuid,uuid)
  to authenticated;

revoke all on function private.cancel_player_turn_draft_v1(uuid)
  from public,anon,authenticated;
grant execute on function private.cancel_player_turn_draft_v1(uuid)
  to authenticated;

create or replace function public.get_player_turn_draft_v1(
  p_room_id uuid,
  p_character_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select private.get_player_turn_draft_v1(p_room_id,p_character_id)
$$;

create or replace function public.cancel_player_turn_draft_v1(
  p_draft_id uuid
)
returns boolean
language sql
security invoker
set search_path=''
as $$
  select private.cancel_player_turn_draft_v1(p_draft_id)
$$;

revoke all on function public.get_player_turn_draft_v1(uuid,uuid)
  from public,anon;
grant execute on function public.get_player_turn_draft_v1(uuid,uuid)
  to authenticated;

revoke all on function public.cancel_player_turn_draft_v1(uuid)
  from public,anon;
grant execute on function public.cancel_player_turn_draft_v1(uuid)
  to authenticated;

revoke execute on function public.save_player_turn_draft_v1(
  uuid,uuid,jsonb,jsonb,jsonb,text[],text,integer
) from public,anon,authenticated;

revoke execute on function public.save_player_turn_draft_v2(
  uuid,uuid,jsonb,jsonb,jsonb,text[],text,integer,text,uuid[]
) from public,anon,authenticated;

comment on function public.get_player_turn_draft_v1(uuid,uuid) is
  'Invoker wrapper around private authoritative draft read implementation.';
comment on function public.cancel_player_turn_draft_v1(uuid) is
  'Invoker wrapper around private authoritative draft cancellation implementation.';
