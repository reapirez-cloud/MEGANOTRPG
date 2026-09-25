-- AI GM immersive presentation + campaign mode semantics.
-- Keeps player-facing narration in-world, makes Brutal economically causal,
-- and expresses 18+ as an application permission rather than policy plumbing.

update public.ai_gm_behavior_profiles
set summary='Максимальная причинность и реализм: последствия, опасность и экономика держат масштаб мира без искусственного обнищания игрока.',
    behavior_contract=coalesce(behavior_contract,'{}'::jsonb) || jsonb_build_object(
      'economic_scale','strict_local_consistency',
      'wages_prices_rewards','anchor_to_local_standard_of_living',
      'large_windfalls','require_causal_source_and_capable_payer',
      'loot_faucet','forbidden',
      'poverty_bias','forbidden',
      'scarcity_and_supply','respect'
    )
where profile_key='brutal';

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
        'summary','Без специального разрешения и приоритета взрослой тематики.'
      ),
      jsonb_build_object(
        'mode','allowed',
        'display_name','Разрешено',
        'summary','Для совершеннолетних персонажей разрешены зрелые темы, если они естественны для сцены и мира; это не меняет согласие и характер NPC.'
      ),
      jsonb_build_object(
        'mode','adult_focused',
        'display_name','Взрослая жизнь',
        'summary','Разрешает зрелую тематику и чаще допускает взрослые отношения и ситуации среди равно правдоподобных life-sim ветвей, без автоматического успеха.'
      )
    ),
    'contract',jsonb_build_object(
      'application_permission_profile_only',true,
      'adult_characters_only',true,
      'no_automatic_fade_to_black_when_enabled',true,
      'never_overrides_npc_agency',true,
      'never_overrides_consent',true,
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
      'application_permission_profile_only',true,
      'adult_characters_only',true,
      'npc_agency_unchanged',true,
      'consent_unchanged',true,
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

comment on table public.ai_gm_behavior_profiles is
  'AI GM behavior presets. Brutal enforces causal, legal, social and economic scale consistency without arbitrary poverty; profiles never rewrite canon, dice or NPC agency.';
