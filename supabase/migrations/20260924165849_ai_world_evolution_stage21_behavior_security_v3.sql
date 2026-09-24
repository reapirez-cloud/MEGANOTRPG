drop policy if exists ai_gm_behavior_profiles_read
  on public.ai_gm_behavior_profiles;
create policy ai_gm_behavior_profiles_read
on public.ai_gm_behavior_profiles
for select to authenticated
using (
  (select (auth.jwt()->>'is_anonymous')::boolean) is false
);

drop policy if exists ai_gm_behavior_settings_member_read
  on public.ai_gm_behavior_settings;
create policy ai_gm_behavior_settings_member_read
on public.ai_gm_behavior_settings
for select to authenticated
using (
  (select (auth.jwt()->>'is_anonymous')::boolean) is false
  and (
    select private.is_campaign_member(
      campaign_id,
      (select auth.uid())
    )
  )
);

drop policy if exists ai_gm_behavior_settings_manager_insert
  on public.ai_gm_behavior_settings;
create policy ai_gm_behavior_settings_manager_insert
on public.ai_gm_behavior_settings
for insert to authenticated
with check (
  (select (auth.jwt()->>'is_anonymous')::boolean) is false
  and updated_by=(select auth.uid())
  and private.is_ai_world_campaign_v1(campaign_id)
  and (
    select private.is_campaign_manager(
      campaign_id,
      (select auth.uid())
    )
  )
);

drop policy if exists ai_gm_behavior_settings_manager_update
  on public.ai_gm_behavior_settings;
create policy ai_gm_behavior_settings_manager_update
on public.ai_gm_behavior_settings
for update to authenticated
using (
  (select (auth.jwt()->>'is_anonymous')::boolean) is false
  and private.is_ai_world_campaign_v1(campaign_id)
  and (
    select private.is_campaign_manager(
      campaign_id,
      (select auth.uid())
    )
  )
)
with check (
  (select (auth.jwt()->>'is_anonymous')::boolean) is false
  and updated_by=(select auth.uid())
  and private.is_ai_world_campaign_v1(campaign_id)
  and (
    select private.is_campaign_manager(
      campaign_id,
      (select auth.uid())
    )
  )
);

create or replace function public.set_campaign_ai_gm_behavior_profile_v1(
  p_campaign_id uuid,
  p_profile_key text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid:=(select auth.uid());
  v_key text:=lower(btrim(coalesce(p_profile_key,'')));
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if (select (auth.jwt()->>'is_anonymous')::boolean) is true then
    raise exception using errcode='42501',message='permanent_user_required';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception using errcode='22023',message='ai_gm_behavior_profile_ai_world_only';
  end if;
  if not private.is_campaign_manager(p_campaign_id,v_user_id) then
    raise exception using errcode='42501',message='campaign_manager_required';
  end if;
  if not exists(
    select 1 from public.ai_gm_behavior_profiles p
    where p.profile_key=v_key
  ) then
    raise exception using errcode='22023',message='ai_gm_behavior_profile_invalid';
  end if;

  insert into public.ai_gm_behavior_settings(
    campaign_id,profile_key,updated_by,updated_at
  ) values (
    p_campaign_id,v_key,v_user_id,now()
  )
  on conflict(campaign_id) do update set
    profile_key=excluded.profile_key,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at;

  select jsonb_build_object(
    'profile_key',p.profile_key,
    'display_name',p.display_name,
    'summary',p.summary,
    'dimensions',jsonb_build_object(
      'consequence_strictness',p.consequence_strictness,
      'plot_armor_allowance',p.plot_armor_allowance,
      'lethal_escalation_pressure',p.lethal_escalation_pressure,
      'danger_telegraphing',p.danger_telegraphing,
      'recoverable_complication_preference',p.recoverable_complication_preference,
      'adventure_coincidence',p.adventure_coincidence,
      'life_social_focus',p.life_social_focus,
      'pacing_pressure',p.pacing_pressure,
      'consequence_persistence',p.consequence_persistence
    ),
    'behavior_contract',p.behavior_contract,
    'constitution',jsonb_build_array(
      'player_intent_is_input_not_canon',
      'world_facts_remain_authoritative',
      'resolved_mechanics_and_dice_remain_authoritative',
      'npc_identity_and_agency_remain_authoritative',
      'profile_only_breaks_ties_between_canonically_plausible_developments',
      'profile_never_fabricates_hostility_or_success'
    ),
    'ai_world',true
  )
  into v_result
  from public.ai_gm_behavior_profiles p
  where p.profile_key=v_key;

  return v_result;
end;
$$;

revoke all on function public.set_campaign_ai_gm_behavior_profile_v1(uuid,text)
  from public,anon;
grant execute on function public.set_campaign_ai_gm_behavior_profile_v1(uuid,text)
  to authenticated;
