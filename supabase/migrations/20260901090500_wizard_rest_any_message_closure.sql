-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardBaseClosure.test.ts
-- CLASS_WORK_STATUS: wizard:text=READY;mechanics=IN_PROGRESS
--
-- Product rule: once a rest choice window is open, the assigned player's first
-- chat message for that PC ends the post-rest phase. This includes text,
-- attachments and mechanical event messages. Rest-choice RPCs do not insert
-- chat_messages and therefore do not close their own window.

begin;

create or replace function private.close_character_rest_windows_from_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.character_id is null or new.user_id is null then return new; end if;
  if not exists(
    select 1 from public.characters c
    where c.id=new.character_id
      and c.character_type='pc'
      and c.assigned_user_id=new.user_id
  ) then return new; end if;

  update public.character_short_rest_sessions
  set is_open=false,closed_at=now(),updated_at=now()
  where character_id=new.character_id and is_open=true;

  update public.character_preparation_sessions
  set is_open=false,closed_at=now(),closed_by_message_id=new.id,updated_at=now()
  where character_id=new.character_id and is_open=true;

  return new;
end;
$function$;

revoke all on function private.close_character_rest_windows_from_chat() from public,anon,authenticated;

drop trigger if exists close_character_rest_windows_on_player_text on public.chat_messages;
drop trigger if exists close_character_rest_windows_on_player_message on public.chat_messages;
create trigger close_character_rest_windows_on_player_message
after insert on public.chat_messages
for each row execute function private.close_character_rest_windows_from_chat();

update public.rule_templates
set rules_meta=coalesce(rules_meta,'{}'::jsonb)
  || jsonb_build_object('gena_rest_window_policy','first_assigned_player_message_closes_all_post_rest_choices'),
    updated_at=now()
where is_active=true and catalog_key='class:wizard';

commit;
