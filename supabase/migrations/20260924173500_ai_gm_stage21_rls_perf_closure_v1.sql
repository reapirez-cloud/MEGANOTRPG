
drop policy if exists ai_gm_behavior_profiles_read
  on public.ai_gm_behavior_profiles;
create policy ai_gm_behavior_profiles_read
on public.ai_gm_behavior_profiles
for select to authenticated
using (
  coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) is false
);

drop policy if exists ai_gm_behavior_settings_member_read
  on public.ai_gm_behavior_settings;
create policy ai_gm_behavior_settings_member_read
on public.ai_gm_behavior_settings
for select to authenticated
using (
  coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) is false
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
  coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) is false
  and updated_by=(select auth.uid())
  and (
    select private.is_ai_world_campaign_v1(campaign_id)
  )
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
  coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) is false
  and (
    select private.is_ai_world_campaign_v1(campaign_id)
  )
  and (
    select private.is_campaign_manager(
      campaign_id,
      (select auth.uid())
    )
  )
)
with check (
  coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) is false
  and updated_by=(select auth.uid())
  and (
    select private.is_ai_world_campaign_v1(campaign_id)
  )
  and (
    select private.is_campaign_manager(
      campaign_id,
      (select auth.uid())
    )
  )
);
