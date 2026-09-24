
alter function public.save_player_turn_draft_v3(
  uuid,uuid,jsonb,text,integer,text,uuid[]
) set schema private;

alter function public.submit_player_turn_stage12_v2(
  uuid,integer,uuid,uuid[]
) set schema private;

revoke all on function private.save_player_turn_draft_v3(
  uuid,uuid,jsonb,text,integer,text,uuid[]
) from public,anon,authenticated;
grant execute on function private.save_player_turn_draft_v3(
  uuid,uuid,jsonb,text,integer,text,uuid[]
) to authenticated;

revoke all on function private.submit_player_turn_stage12_v2(
  uuid,integer,uuid,uuid[]
) from public,anon,authenticated;
grant execute on function private.submit_player_turn_stage12_v2(
  uuid,integer,uuid,uuid[]
) to authenticated;

create or replace function public.save_player_turn_draft_v3(
  p_room_id uuid,
  p_character_id uuid,
  p_plan_entries jsonb default '[]'::jsonb,
  p_description text default '',
  p_expected_revision integer default null,
  p_audience_scope text default 'scene',
  p_recipient_character_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.save_player_turn_draft_v3(
    p_room_id,
    p_character_id,
    p_plan_entries,
    p_description,
    p_expected_revision,
    p_audience_scope,
    p_recipient_character_ids
  )
$$;

create or replace function public.submit_player_turn_stage12_v2(
  p_draft_id uuid,
  p_expected_revision integer,
  p_turn_command_id uuid,
  p_recipient_character_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.submit_player_turn_stage12_v2(
    p_draft_id,
    p_expected_revision,
    p_turn_command_id,
    p_recipient_character_ids
  )
$$;

revoke all on function public.save_player_turn_draft_v3(
  uuid,uuid,jsonb,text,integer,text,uuid[]
) from public,anon;
grant execute on function public.save_player_turn_draft_v3(
  uuid,uuid,jsonb,text,integer,text,uuid[]
) to authenticated;

revoke all on function public.submit_player_turn_stage12_v2(
  uuid,integer,uuid,uuid[]
) from public,anon;
grant execute on function public.submit_player_turn_stage12_v2(
  uuid,integer,uuid,uuid[]
) to authenticated;

create index if not exists player_turn_drafts_declaration_message_idx
on public.player_turn_drafts(declaration_message_id)
where declaration_message_id is not null;
