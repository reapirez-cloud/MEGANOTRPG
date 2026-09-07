-- Warlock Stage 2 completion patch.
-- Aligns persisted Supabase runtime with the Character Engine contract certified in TS.

create or replace function private.patch_warlock_supplemental_level_v1(
  p_campaign_id uuid,
  p_catalog_key text,
  p_level integer,
  p_remove_ids text[] default array[]::text[],
  p_append jsonb default '[]'::jsonb,
  p_choices jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_template_id uuid;
begin
  select id into v_template_id
  from public.rule_templates
  where campaign_id = p_campaign_id
    and catalog_key = p_catalog_key
    and is_builtin is true
  limit 1;

  if v_template_id is null then
    return;
  end if;

  update public.rule_template_levels rtl
  set mechanics = coalesce((
        select jsonb_agg(entry)
        from jsonb_array_elements(coalesce(rtl.mechanics, '[]'::jsonb)) entry
        where coalesce(not ((entry ->> 'id') = any (coalesce(p_remove_ids, array[]::text[]))), true)
      ), '[]'::jsonb) || coalesce(p_append, '[]'::jsonb),
      choices = case when p_choices is null then rtl.choices else p_choices end
  where rtl.template_id = v_template_id
    and rtl.level = p_level;
end;
$$;

revoke all on function private.patch_warlock_supplemental_level_v1(uuid, text, integer, text[], jsonb, jsonb) from public;

create or replace function private.apply_warlock_supplemental_stage2_completion_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.install_warlock_supplemental_subclasses_v1(p_campaign_id);

  perform private.patch_warlock_supplemental_level_v1(
    p_campaign_id, 'subclass:warlock:hexblade', 3,
    array['hexblade-medium-armor','hexblade-shields','hexblade-martial'],
    $json$[
      {"id":"hexblade-medium-armor","type":"grant","sourceKey":"warlock:hexblade:hex-warrior","target":"proficiency","key":"armor:medium","payload":{"rank":1}},
      {"id":"hexblade-shields","type":"grant","sourceKey":"warlock:hexblade:hex-warrior","target":"proficiency","key":"armor:shield","payload":{"rank":1}},
      {"id":"hexblade-martial","type":"grant","sourceKey":"warlock:hexblade:hex-warrior","target":"proficiency","key":"weapon:martial","payload":{"rank":1}}
    ]$json$::jsonb
  );

  perform private.patch_warlock_supplemental_level_v1(
    p_campaign_id, 'subclass:warlock:hexblade', 10,
    array['hexblade-armor-of-hexes-action'],
    $json$[
      {"id":"hexblade-armor-of-hexes-action","type":"action","sourceKey":"warlock:hexblade:armor-of-hexes","key":"warlock_hexblade_armor_of_hexes_action","label":"Доспехи проклятий","economy":"reaction","effects":[{"kind":"semantic","key":"armor_of_hexes","payload":{"die":"1d6","succeedsOn":[4,5,6],"gm_target_hit_gate":true}}],"tags":["warlock","subclass","supplemental"]}
    ]$json$::jsonb
  );

  perform private.patch_warlock_supplemental_level_v1(
    p_campaign_id, 'subclass:warlock:fathomless', 6,
    array['fathomless-guardian-coil-action'],
    $json$[
      {"id":"fathomless-guardian-coil-action","type":"action","sourceKey":"warlock:fathomless:guardian-coil","key":"warlock_fathomless_guardian_coil_action","label":"Защитная спираль","economy":"reaction","effects":[{"kind":"semantic","key":"guardian_coil","payload":{"rangeFromTentacleFeet":10,"reductionDiceByLevel":{"6":"1d8","10":"2d8"},"gm_scene_position_gate":true,"gm_reaction_gate":true}}],"tags":["warlock","subclass","supplemental"]}
    ]$json$::jsonb
  );

  perform private.patch_warlock_supplemental_level_v1(
    p_campaign_id, 'subclass:warlock:genie', 3,
    array[]::text[], '[]'::jsonb,
    $json$[
      {
        "key":"warlock_genie_patron_kind",
        "label":"Род покровителя-джинна",
        "target":"trait",
        "options":["dao","djinni","efreeti","marid"],
        "count":1,
        "option_labels":{"dao":"Дао","djinni":"Джинни","efreeti":"Ифрити","marid":"Марид"},
        "selection_mode":"player_once",
        "replacement_policy":"locked",
        "option_mechanics":{
          "dao":[{"id":"genie-dao-resistance","type":"grant","sourceKey":"warlock:genie:elemental-gift","target":"resistance","key":"damage:bludgeoning","payload":{"label":"Сопротивление дробящему урону"}}],
          "djinni":[{"id":"genie-djinni-resistance","type":"grant","sourceKey":"warlock:genie:elemental-gift","target":"resistance","key":"damage:thunder","payload":{"label":"Сопротивление звуковому урону"}}],
          "efreeti":[{"id":"genie-efreeti-resistance","type":"grant","sourceKey":"warlock:genie:elemental-gift","target":"resistance","key":"damage:fire","payload":{"label":"Сопротивление огню"}}],
          "marid":[{"id":"genie-marid-resistance","type":"grant","sourceKey":"warlock:genie:elemental-gift","target":"resistance","key":"damage:cold","payload":{"label":"Сопротивление холоду"}}]
        }
      }
    ]$json$::jsonb
  );

  -- Random 1d4-long-rest cooldowns stay semantic; a normal long-rest resource would be false.
  perform private.patch_warlock_supplemental_level_v1(
    p_campaign_id, 'subclass:warlock:genie', 14,
    array['genie-wish-resource','genie-wish-action','genie-limited-wish-action'],
    $json$[
      {"id":"genie-limited-wish-action","type":"action","sourceKey":"warlock:genie:limited-wish","key":"warlock_genie_limited_wish_action","label":"Ограниченное желание","economy":"action","effects":[{"kind":"semantic","key":"limited_wish","payload":{"maximumSpellLevel":6,"maximumCastingTime":"1_action","ignoresComponents":true,"cooldown":"1d4_long_rests","gm_spell_gate":true,"gm_cooldown_gate":true}}],"tags":["warlock","subclass","supplemental"]}
    ]$json$::jsonb
  );

  perform private.patch_warlock_supplemental_level_v1(
    p_campaign_id, 'subclass:warlock:undead', 10,
    array['undead-necrotic-husk-action'],
    $json$[
      {"id":"undead-necrotic-husk-action","type":"action","sourceKey":"warlock:undead:necrotic-husk","key":"warlock_undead_necrotic_husk_action","label":"Некротическая оболочка","economy":"reaction","effects":[{"kind":"semantic","key":"necrotic_husk","payload":{"trigger":"reduced_to_zero_hp","remainHp":1,"burstDamage":"2d10_plus_warlock_level","burstType":"necrotic","exhaustion":1,"cooldown":"1d4_long_rests","gm_trigger_gate":true,"gm_cooldown_gate":true}}],"tags":["warlock","subclass","supplemental"]}
    ]$json$::jsonb
  );
end;
$$;

revoke all on function private.apply_warlock_supplemental_stage2_completion_v1(uuid) from public;

create or replace function public.handle_warlock_supplemental_runtime_v1()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.apply_warlock_supplemental_stage2_completion_v1(new.id);
  return new;
end;
$$;

do $$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.apply_warlock_supplemental_stage2_completion_v1(v_campaign.id);
  end loop;
end;
$$;
