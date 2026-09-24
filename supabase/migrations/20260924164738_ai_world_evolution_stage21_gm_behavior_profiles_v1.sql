create table public.ai_gm_behavior_profiles (
  profile_key text primary key
    check (profile_key in ('brutal','adventure','sims')),
  display_name text not null,
  summary text not null,
  consequence_strictness smallint not null check (consequence_strictness between 0 and 5),
  plot_armor_allowance smallint not null check (plot_armor_allowance between 0 and 5),
  lethal_escalation_pressure smallint not null check (lethal_escalation_pressure between 0 and 5),
  danger_telegraphing smallint not null check (danger_telegraphing between 0 and 5),
  recoverable_complication_preference smallint not null check (recoverable_complication_preference between 0 and 5),
  adventure_coincidence smallint not null check (adventure_coincidence between 0 and 5),
  life_social_focus smallint not null check (life_social_focus between 0 and 5),
  pacing_pressure smallint not null check (pacing_pressure between 0 and 5),
  consequence_persistence smallint not null check (consequence_persistence between 0 and 5),
  behavior_contract jsonb not null default '{}'::jsonb
    check (jsonb_typeof(behavior_contract)='object'),
  sort_order smallint not null,
  created_at timestamptz not null default now()
);

insert into public.ai_gm_behavior_profiles(
  profile_key,display_name,summary,
  consequence_strictness,plot_armor_allowance,lethal_escalation_pressure,
  danger_telegraphing,recoverable_complication_preference,adventure_coincidence,
  life_social_focus,pacing_pressure,consequence_persistence,
  behavior_contract,sort_order
) values
(
  'brutal','Жестокий',
  'Строгий причинный реализм без искусственной охоты на игрока.',
  5,0,4,2,1,1,1,3,5,
  jsonb_build_object(
    'causal_realism','max',
    'power_asymmetry','respect',
    'fabricated_hostility','forbidden',
    'rescue_bias','none',
    'legal_social_economic_memory','strong',
    'world_level_scaling','forbidden'
  ),
  10
),
(
  'adventure','Приключение',
  'Реалистичное приключение: последствия сохраняются, но среди равно правдоподобных ветвей чаще выбираются продолжение игры, предупреждение и осложнение.',
  4,2,3,4,4,4,2,4,4,
  jsonb_build_object(
    'causal_realism','high',
    'power_asymmetry','respect',
    'fabricated_hostility','forbidden',
    'recoverable_paths','prefer_when_equally_plausible',
    'hooks','more_common',
    'canon_protection','strict'
  ),
  20
),
(
  'sims','Симс',
  'Жизнь и социалка получают больше пространства, но отказ, провал, последствия и смертельные ситуации остаются реальными.',
  3,2,1,4,4,2,5,2,4,
  jsonb_build_object(
    'causal_realism','high',
    'power_asymmetry','respect',
    'fabricated_hostility','forbidden',
    'unmotivated_lethal_escalation','low',
    'ordinary_life_density','high',
    'npc_compliance_bias','forbidden',
    'canon_protection','strict'
  ),
  30
);

create table public.ai_gm_behavior_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  profile_key text not null default 'adventure'
    references public.ai_gm_behavior_profiles(profile_key) on update cascade,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.ai_gm_behavior_profiles enable row level security;
alter table public.ai_gm_behavior_settings enable row level security;

create policy ai_gm_behavior_profiles_read
on public.ai_gm_behavior_profiles
for select to authenticated
using (
  (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) is false
);

create policy ai_gm_behavior_settings_member_read
on public.ai_gm_behavior_settings
for select to authenticated
using (
  (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) is false
  and (
    select private.is_campaign_member(
      campaign_id,
      (select auth.uid())
    )
  )
);

create index ai_gm_behavior_settings_profile_idx
  on public.ai_gm_behavior_settings(profile_key,campaign_id);

insert into public.ai_gm_behavior_settings(campaign_id,profile_key,updated_by,updated_at)
select c.id,'adventure',null,now()
from public.campaigns c
where private.is_ai_world_campaign_v1(c.id)
on conflict(campaign_id) do nothing;

create or replace function private.ai_gm_behavior_profile_json_v1(
  p_profile_key text
)
returns jsonb
language sql
stable
set search_path=''
as $$
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
    )
  )
  from public.ai_gm_behavior_profiles p
  where p.profile_key=p_profile_key
$$;

create or replace function public.read_ai_gm_behavior_profile_v1(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_profile_key text;
begin
  if not private.is_ai_world_campaign_v1(p_campaign_id) then
    return private.ai_gm_behavior_profile_json_v1('adventure')
      || jsonb_build_object('ai_world',false);
  end if;

  select s.profile_key into v_profile_key
  from public.ai_gm_behavior_settings s
  where s.campaign_id=p_campaign_id;

  v_profile_key:=coalesce(v_profile_key,'adventure');

  return private.ai_gm_behavior_profile_json_v1(v_profile_key)
    || jsonb_build_object('ai_world',true);
end;
$$;

create or replace function public.list_campaign_ai_gm_behavior_profiles_v1(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_user_id uuid:=(select auth.uid());
  v_selected text;
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) is true then
    raise exception using errcode='42501',message='permanent_user_required';
  end if;
  if not private.is_campaign_member(p_campaign_id,v_user_id) then
    raise exception using errcode='42501',message='campaign_membership_required';
  end if;

  select s.profile_key into v_selected
  from public.ai_gm_behavior_settings s
  where s.campaign_id=p_campaign_id;

  v_selected:=coalesce(v_selected,'adventure');

  return jsonb_build_object(
    'campaign_id',p_campaign_id,
    'ai_world',private.is_ai_world_campaign_v1(p_campaign_id),
    'selected_profile_key',v_selected,
    'can_manage',private.is_campaign_manager(p_campaign_id,v_user_id),
    'profiles',coalesce((
      select jsonb_agg(
        private.ai_gm_behavior_profile_json_v1(p.profile_key)
        || jsonb_build_object('selected',p.profile_key=v_selected)
        order by p.sort_order
      )
      from public.ai_gm_behavior_profiles p
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.set_campaign_ai_gm_behavior_profile_v1(
  p_campaign_id uuid,
  p_profile_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=(select auth.uid());
  v_key text:=lower(btrim(coalesce(p_profile_key,'')));
begin
  if v_user_id is null then raise exception 'auth_required'; end if;
  if (select coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) is true then
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

  return public.read_ai_gm_behavior_profile_v1(p_campaign_id);
end;
$$;

revoke all on function private.ai_gm_behavior_profile_json_v1(text)
  from public,anon,authenticated;
revoke all on function public.read_ai_gm_behavior_profile_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.read_ai_gm_behavior_profile_v1(uuid)
  to service_role;
revoke all on function public.list_campaign_ai_gm_behavior_profiles_v1(uuid)
  from public,anon;
grant execute on function public.list_campaign_ai_gm_behavior_profiles_v1(uuid)
  to authenticated;
revoke all on function public.set_campaign_ai_gm_behavior_profile_v1(uuid,text)
  from public,anon;
grant execute on function public.set_campaign_ai_gm_behavior_profile_v1(uuid,text)
  to authenticated;

alter publication supabase_realtime add table public.ai_gm_behavior_settings;

comment on table public.ai_gm_behavior_profiles is
  'Stage 21 fixed AI GM behavior presets. Dimensions bias selection only among canonically plausible developments; they never modify facts, dice, mechanics or NPC identity.';
comment on table public.ai_gm_behavior_settings is
  'Stage 21 campaign-level selection of the AI GM behavior preset. Adventure is the default.';
