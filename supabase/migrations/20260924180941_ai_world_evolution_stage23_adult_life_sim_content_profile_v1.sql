-- AI World Evolution Stage 23: adult / life-simulation content profile.
-- This is an application profile, never a provider-bypass layer.
-- Provider policy remains authoritative; NPC agency, canon and mechanics are unchanged.

create table if not exists public.ai_gm_content_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  mode text not null default 'off'
    check (mode in ('off','allowed','adult_focused')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.ai_gm_content_settings enable row level security;

revoke all on table public.ai_gm_content_settings from public, anon, authenticated;
grant select, insert, update on table public.ai_gm_content_settings to authenticated;
grant select, insert, update on table public.ai_gm_content_settings to service_role;

drop policy if exists ai_gm_content_settings_read_member
  on public.ai_gm_content_settings;
create policy ai_gm_content_settings_read_member
on public.ai_gm_content_settings
for select to authenticated
using (
  coalesce((((select auth.jwt())->>'is_anonymous')::boolean),false) is false
  and (select private.is_ai_world_campaign_v1(campaign_id))
  and (select private.is_campaign_member(campaign_id,(select auth.uid())))
);

drop policy if exists ai_gm_content_settings_insert_manager
  on public.ai_gm_content_settings;
create policy ai_gm_content_settings_insert_manager
on public.ai_gm_content_settings
for insert to authenticated
with check (
  coalesce((((select auth.jwt())->>'is_anonymous')::boolean),false) is false
  and (select private.is_ai_world_campaign_v1(campaign_id))
  and (select private.is_campaign_manager(campaign_id,(select auth.uid())))
  and updated_by=(select auth.uid())
);

drop policy if exists ai_gm_content_settings_update_manager
  on public.ai_gm_content_settings;
create policy ai_gm_content_settings_update_manager
on public.ai_gm_content_settings
for update to authenticated
using (
  coalesce((((select auth.jwt())->>'is_anonymous')::boolean),false) is false
  and (select private.is_ai_world_campaign_v1(campaign_id))
  and (select private.is_campaign_manager(campaign_id,(select auth.uid())))
)
with check (
  coalesce((((select auth.jwt())->>'is_anonymous')::boolean),false) is false
  and (select private.is_ai_world_campaign_v1(campaign_id))
  and (select private.is_campaign_manager(campaign_id,(select auth.uid())))
  and updated_by=(select auth.uid())
);

insert into public.ai_gm_content_settings(campaign_id,mode,updated_by)
select distinct s.campaign_id,'off',null::uuid
from public.ai_world_slots s
where s.campaign_id is not null
on conflict(campaign_id) do nothing;

create or replace function private.ensure_ai_gm_content_setting_for_slot_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.campaign_id is not null then
    insert into public.ai_gm_content_settings(campaign_id,mode,updated_by)
    values(new.campaign_id,'off',null::uuid)
    on conflict(campaign_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_ai_gm_content_setting_for_slot_v1()
  from public,anon,authenticated;

drop trigger if exists ensure_ai_gm_content_setting_for_slot_v1
  on public.ai_world_slots;
create trigger ensure_ai_gm_content_setting_for_slot_v1
after insert or update of campaign_id
on public.ai_world_slots
for each row
execute function private.ensure_ai_gm_content_setting_for_slot_v1();

create or replace function public.list_campaign_ai_gm_content_profiles_v1(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_ai_world boolean;
  v_mode text := 'off';
  v_updated_at timestamptz;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if coalesce((((select auth.jwt())->>'is_anonymous')::boolean),false) then
    raise exception 'permanent_account_required';
  end if;

  v_ai_world := private.is_ai_world_campaign_v1(p_campaign_id);

  if not private.is_campaign_member(p_campaign_id,v_user_id) then
    raise exception 'campaign_membership_required';
  end if;

  if v_ai_world then
    select s.mode,s.updated_at
    into v_mode,v_updated_at
    from public.ai_gm_content_settings s
    where s.campaign_id=p_campaign_id;

    v_mode := coalesce(v_mode,'off');
  end if;

  return jsonb_build_object(
    'ai_world',v_ai_world,
    'selected_mode',case when v_ai_world then v_mode else 'off' end,
    'updated_at',v_updated_at,
    'modes',jsonb_build_array(
      jsonb_build_object(
        'mode','off',
        'display_name','Выключено',
        'summary','Без специального приоритета взрослой тематики.'
      ),
      jsonb_build_object(
        'mode','allowed',
        'display_name','Разрешено',
        'summary','Зрелые темы могут появляться естественно, если это уместно и поддерживается провайдером.'
      ),
      jsonb_build_object(
        'mode','adult_focused',
        'display_name','Взрослая жизнь',
        'summary','В life-sim повышает приоритет взрослых отношений и соответствующих социальных сцен, не меняя агентность NPC.'
      )
    ),
    'contract',jsonb_build_object(
      'application_profile_only',true,
      'provider_remains_authoritative',true,
      'no_provider_bypass',true,
      'no_extra_sanitization_when_enabled',true,
      'never_overrides_npc_agency',true,
      'never_overrides_canon',true,
      'never_overrides_dice',true,
      'never_overrides_prices_or_consequences',true
    )
  );
end;
$$;

create or replace function public.set_campaign_ai_gm_content_profile_v1(
  p_campaign_id uuid,
  p_mode text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_mode text := lower(btrim(coalesce(p_mode,'')));
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if coalesce((((select auth.jwt())->>'is_anonymous')::boolean),false) then
    raise exception 'permanent_account_required';
  end if;
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    raise exception 'ai_gm_content_profile_ai_world_only';
  end if;
  if not private.is_campaign_manager(p_campaign_id,v_user_id) then
    raise exception 'campaign_manager_required';
  end if;
  if v_mode not in ('off','allowed','adult_focused') then
    raise exception 'ai_gm_content_profile_invalid';
  end if;

  insert into public.ai_gm_content_settings(campaign_id,mode,updated_by,updated_at)
  values(p_campaign_id,v_mode,v_user_id,now())
  on conflict(campaign_id) do update set
    mode=excluded.mode,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at;

  return jsonb_build_object(
    'campaign_id',p_campaign_id,
    'mode',v_mode,
    'updated_at',now(),
    'contract',jsonb_build_object(
      'provider_remains_authoritative',true,
      'no_provider_bypass',true,
      'npc_agency_unchanged',true,
      'canon_unchanged',true
    )
  );
end;
$$;

revoke all on function public.list_campaign_ai_gm_content_profiles_v1(uuid)
  from public,anon;
grant execute on function public.list_campaign_ai_gm_content_profiles_v1(uuid)
  to authenticated,service_role;

revoke all on function public.set_campaign_ai_gm_content_profile_v1(uuid,text)
  from public,anon;
grant execute on function public.set_campaign_ai_gm_content_profile_v1(uuid,text)
  to authenticated,service_role;
