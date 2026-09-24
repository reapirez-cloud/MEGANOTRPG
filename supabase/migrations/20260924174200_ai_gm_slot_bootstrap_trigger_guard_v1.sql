
create or replace function private.ensure_ai_gm_behavior_setting_for_slot_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.campaign_id is null then
    return new;
  end if;

  if tg_op='UPDATE' then
    if old.campaign_id is not distinct from new.campaign_id then
      return new;
    end if;
  end if;

  insert into public.ai_gm_behavior_settings(
    campaign_id,profile_key,updated_by,updated_at
  ) values (
    new.campaign_id,'adventure',new.owner_user_id,now()
  )
  on conflict(campaign_id) do nothing;

  return new;
end;
$$;

revoke all on function private.ensure_ai_gm_behavior_setting_for_slot_v1()
  from public,anon,authenticated;

create or replace function private.ensure_ai_gm_junior_setting_for_slot_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_model_id uuid;
begin
  if new.campaign_id is null then
    return new;
  end if;

  if tg_op='UPDATE' then
    if old.campaign_id is not distinct from new.campaign_id then
      return new;
    end if;
  end if;

  select m.id into v_model_id
  from public.ai_models m
  where m.model_key='deepseek-v4.1-flash'
    and m.enabled=true
    and m.model_kind='agent'
    and m.access_scope='campaign'
  limit 1;

  if v_model_id is not null then
    insert into public.ai_agent_settings(
      campaign_id,agent_key,selected_model_id,updated_by,updated_at
    ) values (
      new.campaign_id,'junior',v_model_id,new.owner_user_id,now()
    )
    on conflict(campaign_id,agent_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_ai_gm_junior_setting_for_slot_v1()
  from public,anon,authenticated;
