-- A sealed AI-player turn must include the player's final text.
-- Ability/spell/roll cards may accumulate silently, but cards alone cannot wake the GM.

create or replace function private.require_player_turn_text_before_submit_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='submitted'
     and old.status='draft'
     and btrim(coalesce(new.description,''))=''
  then
    raise exception 'player_turn_text_required';
  end if;
  return new;
end;
$$;

revoke all on function private.require_player_turn_text_before_submit_v1()
  from public,anon,authenticated;

drop trigger if exists require_player_turn_text_before_submit_v1
  on public.player_turn_drafts;
create trigger require_player_turn_text_before_submit_v1
before update of status
on public.player_turn_drafts
for each row
execute function private.require_player_turn_text_before_submit_v1();

comment on function private.require_player_turn_text_before_submit_v1() is
  'Prevents linked mechanics from waking AI GM until the player has written final turn text and explicitly submitted the draft.';
