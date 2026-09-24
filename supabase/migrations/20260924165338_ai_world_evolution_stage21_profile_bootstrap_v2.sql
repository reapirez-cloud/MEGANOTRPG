create or replace function private.ensure_ai_gm_behavior_setting_for_slot_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.campaign_id is not null
     and old.campaign_id is distinct from new.campaign_id
  then
    insert into public.ai_gm_behavior_settings(
      campaign_id,profile_key,updated_by,updated_at
    ) values (
      new.campaign_id,'adventure',new.owner_user_id,now()
    )
    on conflict(campaign_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_ai_gm_behavior_setting_for_slot_v1
  on public.ai_world_slots;
create trigger ensure_ai_gm_behavior_setting_for_slot_v1
after insert or update of campaign_id
on public.ai_world_slots
for each row
execute function private.ensure_ai_gm_behavior_setting_for_slot_v1();

revoke all on function private.ensure_ai_gm_behavior_setting_for_slot_v1()
  from public,anon,authenticated;

comment on function private.ensure_ai_gm_behavior_setting_for_slot_v1() is
  'Stage 21 persists Adventure as the default behavior profile whenever an AI-world slot is bound to a campaign.';
