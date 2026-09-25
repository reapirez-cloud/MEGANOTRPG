-- Harden Brutal/Hardcore into a strict survival simulation without arbitrary punishment.

update public.ai_gm_behavior_profiles
set summary='Жёсткая симуляция мира «попробуй выжить»: без сюжетных страховок и level scaling, с реальной логистикой, последствиями и масштабом экономики.',
    behavior_contract=coalesce(behavior_contract,'{}'::jsonb) || jsonb_build_object(
      'survival_simulation','strict',
      'world_level_scaling','forbidden',
      'plot_armor','near_zero',
      'safe_exit_guarantee','forbidden',
      'food_water_sleep_weather','causal_when_relevant',
      'travel_distance_time','strict',
      'shelter_and_lodging','causal',
      'carrying_and_consumables','respect_existing_rules',
      'treatment_access','world_bound',
      'injury_and_resource_recovery','requires_real_recovery_path',
      'legal_social_consequences','persistent',
      'power_asymmetry','strict',
      'economic_scale','strict_local_consistency',
      'large_windfalls','require_causal_source_and_capable_payer',
      'loot_faucet','forbidden',
      'poverty_bias','forbidden',
      'artificial_scarcity','forbidden',
      'artificial_dc_inflation','forbidden',
      'new_hidden_house_rules','forbidden'
    )
where profile_key='brutal';
