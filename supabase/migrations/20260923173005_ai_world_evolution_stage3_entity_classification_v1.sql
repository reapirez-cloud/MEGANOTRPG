-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 3: persisted generation-time simulation classification.
-- Legacy/manual content stays safe by default: disabled until deliberately classified.

alter table public.locations
  add column background_simulation_scope text not null default 'disabled'
  check (background_simulation_scope in ('entity','detail','disabled'));

alter table public.npc_profiles
  add column background_simulation_scope text not null default 'disabled'
  check (background_simulation_scope in ('entity','disabled'));

comment on column public.locations.background_simulation_scope is
  'AI background simulation classification: entity evolves independently; detail belongs to another entity; disabled is never selected. Legacy rows default disabled.';
comment on column public.npc_profiles.background_simulation_scope is
  'AI background simulation eligibility for persistent NPCs. Legacy/manual rows default disabled until deliberately classified.';

create index locations_background_entity_idx
  on public.locations(campaign_id, id)
  where lifecycle_state='active' and background_simulation_scope='entity';

create index npc_profiles_background_entity_idx
  on public.npc_profiles(campaign_id, character_id)
  where background_simulation_scope='entity';

CREATE OR REPLACE FUNCTION public.create_world_npc_v1(p_campaign_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_input jsonb := coalesce(p_input, '{}'::jsonb);
  v_sheet jsonb := '{}'::jsonb;
  v_profile jsonb := '{}'::jsonb;
  v_relationship jsonb := null;
  v_npc_id uuid;
  v_name text;
  v_visibility text;
  v_location_id uuid;
  v_habitat_id uuid;
  v_discover_id uuid;
  v_relationship_target uuid;
  v_value text;
  v_day integer := 1;
  v_day_period text := 'day';
  v_cr numeric(7,3) := 0;
  v_max_hp integer := 1;
  v_current_hp integer := 1;
  v_tags text[] := '{}'::text[];
  v_background_scope text := 'disabled';
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_campaign(p_campaign_id, v_user_id) then
    raise exception 'Only GM or owner can create world NPCs';
  end if;

  if jsonb_typeof(v_input) <> 'object' then
    raise exception 'NPC input must be an object';
  end if;

  v_name := nullif(btrim(coalesce(v_input->>'name', '')), '');
  if v_name is null then
    raise exception 'NPC name is required';
  end if;

  if jsonb_typeof(v_input->'sheet') = 'object' then
    v_sheet := v_input->'sheet';
  end if;
  if jsonb_typeof(v_input->'profile') = 'object' then
    v_profile := v_input->'profile';
  end if;
  if jsonb_typeof(v_input->'relationship') = 'object' then
    v_relationship := v_input->'relationship';
  end if;

  v_visibility := lower(btrim(coalesce(v_input->>'visibility_mode', 'discover')));
  if v_visibility not in ('always','discover') then
    raise exception 'Published world NPC visibility must be always or discover';
  end if;

  v_background_scope := lower(btrim(coalesce(v_input->>'background_simulation_scope', 'disabled')));
  if v_background_scope not in ('entity','disabled') then
    raise exception 'NPC background_simulation_scope must be entity or disabled';
  end if;

  if nullif(v_input->>'location_id', '') is not null then
    begin
      v_location_id := (v_input->>'location_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid NPC location id';
    end;

    if not exists (
      select 1 from public.locations l
      where l.id = v_location_id
        and l.campaign_id = p_campaign_id
        and l.lifecycle_state = 'active'
    ) or not private.can_view_location(v_location_id, v_user_id) then
      raise exception 'NPC location not found or unavailable';
    end if;
  end if;

  if coalesce(v_input->>'campaign_day', '') ~ '^[0-9]+$' then
    v_day := greatest(1, least((v_input->>'campaign_day')::integer, 1000000));
  end if;
  v_day_period := lower(btrim(coalesce(v_input->>'day_period', 'day')));
  if v_day_period not in ('dawn','morning','day','late_day','evening','night','deep_night') then
    v_day_period := 'day';
  end if;

  if coalesce(v_profile->>'challenge_rating', '') ~ '^[0-9]+([.][0-9]+)?$' then
    v_cr := greatest(0, least((v_profile->>'challenge_rating')::numeric, 100));
  end if;

  if jsonb_typeof(v_profile->'tags') = 'array' then
    select coalesce(array_agg(distinct left(btrim(value), 80)) filter (where btrim(value) <> ''), '{}'::text[])
      into v_tags
    from jsonb_array_elements_text(v_profile->'tags');
  end if;

  if coalesce(v_sheet->>'max_hp', '') ~ '^[0-9]+$' then
    v_max_hp := greatest(1, least((v_sheet->>'max_hp')::integer, 100000));
  end if;
  if coalesce(v_sheet->>'current_hp', '') ~ '^[0-9]+$' then
    v_current_hp := greatest(0, least((v_sheet->>'current_hp')::integer, v_max_hp));
  else
    v_current_hp := v_max_hp;
  end if;

  insert into public.characters (
    campaign_id,
    assigned_user_id,
    name,
    character_class,
    level,
    bio,
    avatar_url,
    character_type,
    visibility,
    visibility_mode,
    publication_state,
    created_by
  ) values (
    p_campaign_id,
    null,
    left(v_name, 160),
    coalesce(nullif(left(btrim(coalesce(v_input->>'character_class', '')), 120), ''), 'NPC'),
    case
      when coalesce(v_input->>'level', '') ~ '^[0-9]+$'
        then greatest(1, least((v_input->>'level')::integer, 30))
      else 1
    end,
    left(btrim(coalesce(v_input->>'bio', '')), 12000),
    nullif(left(btrim(coalesce(v_input->>'avatar_url', '')), 2000), ''),
    'npc',
    'campaign',
    v_visibility,
    'campaign',
    v_user_id
  )
  returning id into v_npc_id;

  update public.character_sheets cs
  set
    race = left(btrim(coalesce(v_sheet->>'race', v_profile->>'species', '')), 160),
    background = left(btrim(coalesce(v_sheet->>'background', '')), 240),
    alignment = left(btrim(coalesce(v_sheet->>'alignment', '')), 120),
    strength = case when coalesce(v_sheet->>'strength','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'strength')::int,40)) else 10 end,
    dexterity = case when coalesce(v_sheet->>'dexterity','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'dexterity')::int,40)) else 10 end,
    constitution = case when coalesce(v_sheet->>'constitution','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'constitution')::int,40)) else 10 end,
    intelligence = case when coalesce(v_sheet->>'intelligence','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'intelligence')::int,40)) else 10 end,
    wisdom = case when coalesce(v_sheet->>'wisdom','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'wisdom')::int,40)) else 10 end,
    charisma = case when coalesce(v_sheet->>'charisma','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'charisma')::int,40)) else 10 end,
    armor_class = case when coalesce(v_sheet->>'armor_class','') ~ '^-?[0-9]+$' then greatest(0,least((v_sheet->>'armor_class')::int,50)) else 10 end,
    initiative_bonus = case when coalesce(v_sheet->>'initiative_bonus','') ~ '^-?[0-9]+$' then greatest(-30,least((v_sheet->>'initiative_bonus')::int,30)) else 0 end,
    speed = case when coalesce(v_sheet->>'speed','') ~ '^[0-9]+$' then greatest(0,least((v_sheet->>'speed')::int,1000)) else 30 end,
    proficiency_bonus = case when coalesce(v_sheet->>'proficiency_bonus','') ~ '^-?[0-9]+$' then greatest(0,least((v_sheet->>'proficiency_bonus')::int,20)) else 2 end,
    max_hp = v_max_hp,
    current_hp = v_current_hp,
    temp_hp = case when coalesce(v_sheet->>'temp_hp','') ~ '^[0-9]+$' then greatest(0,least((v_sheet->>'temp_hp')::int,100000)) else 0 end,
    hit_dice = left(btrim(coalesce(v_sheet->>'hit_dice', '')), 120),
    passive_perception = case when coalesce(v_sheet->>'passive_perception','') ~ '^-?[0-9]+$' then greatest(0,least((v_sheet->>'passive_perception')::int,60)) else 10 end,
    saving_throw_proficiencies = case when jsonb_typeof(v_sheet->'saving_throw_proficiencies') = 'array' then v_sheet->'saving_throw_proficiencies' else '[]'::jsonb end,
    skill_proficiencies = case when jsonb_typeof(v_sheet->'skill_proficiencies') = 'object' then v_sheet->'skill_proficiencies' else '{}'::jsonb end,
    proficiencies = left(btrim(coalesce(v_sheet->>'proficiencies', '')), 4000),
    languages = left(btrim(coalesce(v_sheet->>'languages', '')), 2000),
    senses = left(btrim(coalesce(v_sheet->>'senses', '')), 2000),
    personality_traits = left(btrim(coalesce(v_sheet->>'personality_traits', '')), 6000),
    ideals = left(btrim(coalesce(v_sheet->>'ideals', '')), 6000),
    bonds = left(btrim(coalesce(v_sheet->>'bonds', '')), 6000),
    flaws = left(btrim(coalesce(v_sheet->>'flaws', '')), 6000),
    backstory = left(btrim(coalesce(v_sheet->>'backstory', '')), 12000),
    notes = left(btrim(coalesce(v_sheet->>'notes', '')), 12000),
    updated_at = now()
  where cs.character_id = v_npc_id;

  insert into public.npc_profiles (
    character_id,
    campaign_id,
    background_simulation_scope,
    role,
    species,
    creature_type,
    size,
    challenge_rating,
    occupation,
    faction,
    appearance,
    demeanor,
    motivation,
    public_notes,
    gm_notes,
    tags,
    created_by,
    updated_by
  ) values (
    v_npc_id,
    p_campaign_id,
    v_background_scope,
    coalesce(nullif(left(btrim(coalesce(v_profile->>'role', '')), 120), ''), 'npc'),
    left(btrim(coalesce(v_profile->>'species', v_sheet->>'race', '')), 160),
    coalesce(nullif(left(lower(btrim(coalesce(v_profile->>'creature_type', ''))), 120), ''), 'humanoid'),
    case
      when lower(btrim(coalesce(v_profile->>'size', 'medium'))) in ('tiny','small','medium','large','huge','gargantuan')
        then lower(btrim(coalesce(v_profile->>'size', 'medium')))
      else 'medium'
    end,
    v_cr,
    left(btrim(coalesce(v_profile->>'occupation', '')), 240),
    left(btrim(coalesce(v_profile->>'faction', '')), 240),
    left(btrim(coalesce(v_profile->>'appearance', '')), 12000),
    left(btrim(coalesce(v_profile->>'demeanor', '')), 6000),
    left(btrim(coalesce(v_profile->>'motivation', '')), 12000),
    left(btrim(coalesce(v_profile->>'public_notes', '')), 12000),
    left(btrim(coalesce(v_profile->>'gm_notes', '')), 24000),
    v_tags,
    v_user_id,
    v_user_id
  );

  if v_location_id is not null then
    insert into public.character_world_state (
      character_id, campaign_id, location_id, campaign_day, day_period, updated_by
    ) values (
      v_npc_id, p_campaign_id, v_location_id, v_day, v_day_period, v_user_id
    )
    on conflict (character_id) do update set
      location_id = excluded.location_id,
      campaign_day = excluded.campaign_day,
      day_period = excluded.day_period,
      updated_at = now(),
      updated_by = excluded.updated_by;
  end if;

  if jsonb_typeof(v_input->'habitat_location_ids') = 'array' then
    for v_value in
      select value from jsonb_array_elements_text(v_input->'habitat_location_ids')
    loop
      begin
        v_habitat_id := v_value::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid NPC habitat location id';
      end;

      if not exists (
        select 1 from public.locations l
        where l.id = v_habitat_id
          and l.campaign_id = p_campaign_id
          and l.lifecycle_state = 'active'
      ) or not private.can_view_location(v_habitat_id, v_user_id) then
        raise exception 'NPC habitat location not found or unavailable';
      end if;

      insert into public.location_npc_habitats(
        location_id, npc_character_id, campaign_id, created_by
      ) values (
        v_habitat_id, v_npc_id, p_campaign_id, v_user_id
      )
      on conflict (location_id, npc_character_id) do nothing;
    end loop;
  elsif v_location_id is not null then
    insert into public.location_npc_habitats(
      location_id, npc_character_id, campaign_id, created_by
    ) values (
      v_location_id, v_npc_id, p_campaign_id, v_user_id
    )
    on conflict (location_id, npc_character_id) do nothing;
  end if;

  if v_relationship is not null
     and nullif(v_relationship->>'target_character_id', '') is not null then
    begin
      v_relationship_target := (v_relationship->>'target_character_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid relationship target character id';
    end;

    if v_relationship_target = v_npc_id
       or not exists (
         select 1 from public.characters c
         where c.id = v_relationship_target
           and c.campaign_id = p_campaign_id
       )
       or not private.can_manage_character(v_relationship_target, v_user_id) then
      raise exception 'Relationship target is unavailable';
    end if;

    insert into public.character_relationships (
      campaign_id,
      subject_character_id,
      target_character_id,
      relationship_kind,
      public_label,
      attitude_score,
      player_note,
      gm_note,
      player_visible,
      started_at,
      created_by,
      updated_by
    ) values (
      p_campaign_id,
      v_npc_id,
      v_relationship_target,
      coalesce(nullif(left(btrim(coalesce(v_relationship->>'relationship_kind', '')), 120), ''), 'acquaintance'),
      left(btrim(coalesce(v_relationship->>'public_label', '')), 240),
      case
        when coalesce(v_relationship->>'attitude_score','') ~ '^-?[0-9]+$'
          then greatest(-100, least((v_relationship->>'attitude_score')::int, 100))
        else 0
      end,
      left(btrim(coalesce(v_relationship->>'player_note', '')), 6000),
      left(btrim(coalesce(v_relationship->>'gm_note', '')), 12000),
      coalesce((v_relationship->>'player_visible')::boolean, true),
      now(),
      v_user_id,
      v_user_id
    )
    on conflict (campaign_id, subject_character_id, target_character_id)
    do update set
      relationship_kind = excluded.relationship_kind,
      public_label = excluded.public_label,
      attitude_score = excluded.attitude_score,
      player_note = excluded.player_note,
      gm_note = excluded.gm_note,
      player_visible = excluded.player_visible,
      state = 'active',
      ended_at = null,
      updated_by = v_user_id,
      updated_at = now();
  end if;

  if jsonb_typeof(v_input->'discover_for_character_ids') = 'array' then
    for v_value in
      select value from jsonb_array_elements_text(v_input->'discover_for_character_ids')
    loop
      begin
        v_discover_id := v_value::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid discovery character id';
      end;

      if not exists (
        select 1 from public.characters c
        where c.id = v_discover_id
          and c.campaign_id = p_campaign_id
      ) or not private.can_manage_character(v_discover_id, v_user_id) then
        raise exception 'Discovery character is unavailable';
      end if;

      insert into public.character_npc_discoveries (
        character_id,
        npc_character_id,
        discovered_by,
        source,
        last_interaction_at
      ) values (
        v_discover_id,
        v_npc_id,
        v_user_id,
        'ai_gm',
        now()
      )
      on conflict (character_id, npc_character_id)
      do update set
        last_interaction_at = excluded.last_interaction_at,
        discovered_by = excluded.discovered_by,
        source = excluded.source;
    end loop;
  end if;

  return jsonb_build_object(
    'npc_id', v_npc_id,
    'name', v_name,
    'visibility_mode', v_visibility,
    'background_simulation_scope', v_background_scope,
    'location_id', v_location_id,
    'relationship_target_id', v_relationship_target,
    'canonical_state_changed', true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_world_npc_v1(p_npc_character_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_sheet jsonb := '{}'::jsonb;
  v_profile jsonb := '{}'::jsonb;
  v_relationship jsonb := null;
  v_campaign_id uuid;
  v_character_type text;
  v_location_id uuid;
  v_habitat_id uuid;
  v_discover_id uuid;
  v_relationship_target uuid;
  v_value text;
  v_tags text[];
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'NPC patch must be an object';
  end if;

  select c.campaign_id, c.character_type
    into v_campaign_id, v_character_type
  from public.characters c
  where c.id = p_npc_character_id;

  if v_campaign_id is null or v_character_type <> 'npc' then
    raise exception 'World NPC not found';
  end if;

  if not private.can_manage_character(p_npc_character_id, v_user_id) then
    raise exception 'Not allowed';
  end if;

  if jsonb_typeof(v_patch->'sheet') = 'object' then
    v_sheet := v_patch->'sheet';
  end if;
  if jsonb_typeof(v_patch->'profile') = 'object' then
    v_profile := v_patch->'profile';
  end if;
  if jsonb_typeof(v_patch->'relationship') = 'object' then
    v_relationship := v_patch->'relationship';
  end if;

  if v_patch ? 'background_simulation_scope'
     and lower(btrim(coalesce(v_patch->>'background_simulation_scope',''))) not in ('entity','disabled') then
    raise exception 'NPC background_simulation_scope must be entity or disabled';
  end if;

  update public.characters c
  set
    name = case
      when v_patch ? 'name'
        then coalesce(nullif(left(btrim(coalesce(v_patch->>'name','')),160),''), c.name)
      else c.name
    end,
    character_class = case
      when v_patch ? 'character_class'
        then coalesce(nullif(left(btrim(coalesce(v_patch->>'character_class','')),120),''),'NPC')
      else c.character_class
    end,
    level = case
      when v_patch ? 'level' and coalesce(v_patch->>'level','') ~ '^[0-9]+$'
        then greatest(1,least((v_patch->>'level')::int,30))
      else c.level
    end,
    bio = case
      when v_patch ? 'bio' then left(btrim(coalesce(v_patch->>'bio','')),12000)
      else c.bio
    end,
    avatar_url = case
      when v_patch ? 'avatar_url' then nullif(left(btrim(coalesce(v_patch->>'avatar_url','')),2000),'')
      else c.avatar_url
    end,
    visibility_mode = case
      when v_patch ? 'visibility_mode'
        and lower(btrim(coalesce(v_patch->>'visibility_mode',''))) in ('always','discover')
        then lower(btrim(v_patch->>'visibility_mode'))
      else c.visibility_mode
    end,
    updated_at = now()
  where c.id = p_npc_character_id;

  insert into public.character_sheets(character_id)
  values (p_npc_character_id)
  on conflict (character_id) do nothing;

  update public.character_sheets cs
  set
    race = case when v_sheet ? 'race' then left(btrim(coalesce(v_sheet->>'race','')),160) else cs.race end,
    background = case when v_sheet ? 'background' then left(btrim(coalesce(v_sheet->>'background','')),240) else cs.background end,
    alignment = case when v_sheet ? 'alignment' then left(btrim(coalesce(v_sheet->>'alignment','')),120) else cs.alignment end,
    strength = case when v_sheet ? 'strength' and coalesce(v_sheet->>'strength','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'strength')::int,40)) else cs.strength end,
    dexterity = case when v_sheet ? 'dexterity' and coalesce(v_sheet->>'dexterity','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'dexterity')::int,40)) else cs.dexterity end,
    constitution = case when v_sheet ? 'constitution' and coalesce(v_sheet->>'constitution','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'constitution')::int,40)) else cs.constitution end,
    intelligence = case when v_sheet ? 'intelligence' and coalesce(v_sheet->>'intelligence','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'intelligence')::int,40)) else cs.intelligence end,
    wisdom = case when v_sheet ? 'wisdom' and coalesce(v_sheet->>'wisdom','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'wisdom')::int,40)) else cs.wisdom end,
    charisma = case when v_sheet ? 'charisma' and coalesce(v_sheet->>'charisma','') ~ '^-?[0-9]+$' then greatest(1,least((v_sheet->>'charisma')::int,40)) else cs.charisma end,
    armor_class = case when v_sheet ? 'armor_class' and coalesce(v_sheet->>'armor_class','') ~ '^-?[0-9]+$' then greatest(0,least((v_sheet->>'armor_class')::int,50)) else cs.armor_class end,
    initiative_bonus = case when v_sheet ? 'initiative_bonus' and coalesce(v_sheet->>'initiative_bonus','') ~ '^-?[0-9]+$' then greatest(-30,least((v_sheet->>'initiative_bonus')::int,30)) else cs.initiative_bonus end,
    speed = case when v_sheet ? 'speed' and coalesce(v_sheet->>'speed','') ~ '^[0-9]+$' then greatest(0,least((v_sheet->>'speed')::int,1000)) else cs.speed end,
    proficiency_bonus = case when v_sheet ? 'proficiency_bonus' and coalesce(v_sheet->>'proficiency_bonus','') ~ '^-?[0-9]+$' then greatest(0,least((v_sheet->>'proficiency_bonus')::int,20)) else cs.proficiency_bonus end,
    max_hp = case when v_sheet ? 'max_hp' and coalesce(v_sheet->>'max_hp','') ~ '^[0-9]+$' then greatest(1,least((v_sheet->>'max_hp')::int,100000)) else cs.max_hp end,
    current_hp = case when v_sheet ? 'current_hp' and coalesce(v_sheet->>'current_hp','') ~ '^[0-9]+$' then greatest(0,least((v_sheet->>'current_hp')::int, case when v_sheet ? 'max_hp' and coalesce(v_sheet->>'max_hp','') ~ '^[0-9]+$' then greatest(1,least((v_sheet->>'max_hp')::int,100000)) else cs.max_hp end)) else least(cs.current_hp, case when v_sheet ? 'max_hp' and coalesce(v_sheet->>'max_hp','') ~ '^[0-9]+$' then greatest(1,least((v_sheet->>'max_hp')::int,100000)) else cs.max_hp end) end,
    temp_hp = case when v_sheet ? 'temp_hp' and coalesce(v_sheet->>'temp_hp','') ~ '^[0-9]+$' then greatest(0,least((v_sheet->>'temp_hp')::int,100000)) else cs.temp_hp end,
    hit_dice = case when v_sheet ? 'hit_dice' then left(btrim(coalesce(v_sheet->>'hit_dice','')),120) else cs.hit_dice end,
    passive_perception = case when v_sheet ? 'passive_perception' and coalesce(v_sheet->>'passive_perception','') ~ '^-?[0-9]+$' then greatest(0,least((v_sheet->>'passive_perception')::int,60)) else cs.passive_perception end,
    saving_throw_proficiencies = case when jsonb_typeof(v_sheet->'saving_throw_proficiencies') = 'array' then v_sheet->'saving_throw_proficiencies' else cs.saving_throw_proficiencies end,
    skill_proficiencies = case when jsonb_typeof(v_sheet->'skill_proficiencies') = 'object' then v_sheet->'skill_proficiencies' else cs.skill_proficiencies end,
    proficiencies = case when v_sheet ? 'proficiencies' then left(btrim(coalesce(v_sheet->>'proficiencies','')),4000) else cs.proficiencies end,
    languages = case when v_sheet ? 'languages' then left(btrim(coalesce(v_sheet->>'languages','')),2000) else cs.languages end,
    senses = case when v_sheet ? 'senses' then left(btrim(coalesce(v_sheet->>'senses','')),2000) else cs.senses end,
    personality_traits = case when v_sheet ? 'personality_traits' then left(btrim(coalesce(v_sheet->>'personality_traits','')),6000) else cs.personality_traits end,
    ideals = case when v_sheet ? 'ideals' then left(btrim(coalesce(v_sheet->>'ideals','')),6000) else cs.ideals end,
    bonds = case when v_sheet ? 'bonds' then left(btrim(coalesce(v_sheet->>'bonds','')),6000) else cs.bonds end,
    flaws = case when v_sheet ? 'flaws' then left(btrim(coalesce(v_sheet->>'flaws','')),6000) else cs.flaws end,
    backstory = case when v_sheet ? 'backstory' then left(btrim(coalesce(v_sheet->>'backstory','')),12000) else cs.backstory end,
    notes = case when v_sheet ? 'notes' then left(btrim(coalesce(v_sheet->>'notes','')),12000) else cs.notes end,
    updated_at = now()
  where cs.character_id = p_npc_character_id;

  if jsonb_typeof(v_profile->'tags') = 'array' then
    select coalesce(array_agg(distinct left(btrim(value),80)) filter (where btrim(value) <> ''), '{}'::text[])
      into v_tags
    from jsonb_array_elements_text(v_profile->'tags');
  end if;

  insert into public.npc_profiles(character_id,campaign_id)
  values (p_npc_character_id,v_campaign_id)
  on conflict (character_id) do nothing;

  update public.npc_profiles np
  set
    background_simulation_scope = case
      when v_patch ? 'background_simulation_scope'
        then lower(btrim(v_patch->>'background_simulation_scope'))
      else np.background_simulation_scope
    end,
    role = case when v_profile ? 'role' then coalesce(nullif(left(btrim(coalesce(v_profile->>'role','')),120),''),np.role) else np.role end,
    species = case when v_profile ? 'species' then left(btrim(coalesce(v_profile->>'species','')),160) else np.species end,
    creature_type = case when v_profile ? 'creature_type' then coalesce(nullif(left(lower(btrim(coalesce(v_profile->>'creature_type',''))),120),''),np.creature_type) else np.creature_type end,
    size = case when v_profile ? 'size' and lower(btrim(coalesce(v_profile->>'size',''))) in ('tiny','small','medium','large','huge','gargantuan') then lower(btrim(v_profile->>'size')) else np.size end,
    challenge_rating = case when v_profile ? 'challenge_rating' and coalesce(v_profile->>'challenge_rating','') ~ '^[0-9]+([.][0-9]+)?$' then greatest(0,least((v_profile->>'challenge_rating')::numeric,100)) else np.challenge_rating end,
    occupation = case when v_profile ? 'occupation' then left(btrim(coalesce(v_profile->>'occupation','')),240) else np.occupation end,
    faction = case when v_profile ? 'faction' then left(btrim(coalesce(v_profile->>'faction','')),240) else np.faction end,
    appearance = case when v_profile ? 'appearance' then left(btrim(coalesce(v_profile->>'appearance','')),12000) else np.appearance end,
    demeanor = case when v_profile ? 'demeanor' then left(btrim(coalesce(v_profile->>'demeanor','')),6000) else np.demeanor end,
    motivation = case when v_profile ? 'motivation' then left(btrim(coalesce(v_profile->>'motivation','')),12000) else np.motivation end,
    public_notes = case when v_profile ? 'public_notes' then left(btrim(coalesce(v_profile->>'public_notes','')),12000) else np.public_notes end,
    gm_notes = case when v_profile ? 'gm_notes' then left(btrim(coalesce(v_profile->>'gm_notes','')),24000) else np.gm_notes end,
    tags = case when v_profile ? 'tags' and v_tags is not null then v_tags else np.tags end,
    updated_by = v_user_id,
    updated_at = now()
  where np.character_id = p_npc_character_id;

  if v_patch ? 'location_id' then
    if v_patch->>'location_id' is null or btrim(coalesce(v_patch->>'location_id','')) = '' then
      v_location_id := null;
    else
      begin
        v_location_id := (v_patch->>'location_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid NPC location id';
      end;

      if not exists (
        select 1 from public.locations l
        where l.id = v_location_id
          and l.campaign_id = v_campaign_id
          and l.lifecycle_state = 'active'
      ) or not private.can_view_location(v_location_id, v_user_id) then
        raise exception 'NPC location not found or unavailable';
      end if;
    end if;

    insert into public.character_world_state (
      character_id,campaign_id,location_id,campaign_day,day_period,updated_by
    )
    select
      p_npc_character_id,
      v_campaign_id,
      v_location_id,
      coalesce(cws.campaign_day,1),
      coalesce(cws.day_period,'day'),
      v_user_id
    from (select 1) seed
    left join public.character_world_state cws
      on cws.character_id = p_npc_character_id
    on conflict (character_id) do update set
      location_id = excluded.location_id,
      updated_at = now(),
      updated_by = excluded.updated_by;
  end if;

  if v_patch ? 'habitat_location_ids' then
    if jsonb_typeof(v_patch->'habitat_location_ids') <> 'array' then
      raise exception 'habitat_location_ids must be an array';
    end if;

    delete from public.location_npc_habitats h
    where h.npc_character_id = p_npc_character_id
      and h.campaign_id = v_campaign_id;

    for v_value in
      select value from jsonb_array_elements_text(v_patch->'habitat_location_ids')
    loop
      begin
        v_habitat_id := v_value::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid NPC habitat location id';
      end;

      if not exists (
        select 1 from public.locations l
        where l.id = v_habitat_id
          and l.campaign_id = v_campaign_id
          and l.lifecycle_state = 'active'
      ) or not private.can_view_location(v_habitat_id, v_user_id) then
        raise exception 'NPC habitat location not found or unavailable';
      end if;

      insert into public.location_npc_habitats(
        location_id,npc_character_id,campaign_id,created_by
      ) values (
        v_habitat_id,p_npc_character_id,v_campaign_id,v_user_id
      )
      on conflict (location_id,npc_character_id) do nothing;
    end loop;
  end if;

  if v_relationship is not null
     and nullif(v_relationship->>'target_character_id','') is not null then
    begin
      v_relationship_target := (v_relationship->>'target_character_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid relationship target character id';
    end;

    if v_relationship_target = p_npc_character_id
       or not exists (
         select 1 from public.characters c
         where c.id = v_relationship_target
           and c.campaign_id = v_campaign_id
       )
       or not private.can_manage_character(v_relationship_target, v_user_id) then
      raise exception 'Relationship target is unavailable';
    end if;

    insert into public.character_relationships (
      campaign_id,subject_character_id,target_character_id,
      relationship_kind,public_label,attitude_score,
      player_note,gm_note,player_visible,started_at,created_by,updated_by
    ) values (
      v_campaign_id,p_npc_character_id,v_relationship_target,
      coalesce(nullif(left(btrim(coalesce(v_relationship->>'relationship_kind','')),120),''),'acquaintance'),
      left(btrim(coalesce(v_relationship->>'public_label','')),240),
      case when coalesce(v_relationship->>'attitude_score','') ~ '^-?[0-9]+$' then greatest(-100,least((v_relationship->>'attitude_score')::int,100)) else 0 end,
      left(btrim(coalesce(v_relationship->>'player_note','')),6000),
      left(btrim(coalesce(v_relationship->>'gm_note','')),12000),
      coalesce((v_relationship->>'player_visible')::boolean,true),
      now(),v_user_id,v_user_id
    )
    on conflict (campaign_id,subject_character_id,target_character_id)
    do update set
      relationship_kind = case when v_relationship ? 'relationship_kind' then excluded.relationship_kind else public.character_relationships.relationship_kind end,
      public_label = case when v_relationship ? 'public_label' then excluded.public_label else public.character_relationships.public_label end,
      attitude_score = case when v_relationship ? 'attitude_score' then excluded.attitude_score else public.character_relationships.attitude_score end,
      player_note = case when v_relationship ? 'player_note' then excluded.player_note else public.character_relationships.player_note end,
      gm_note = case when v_relationship ? 'gm_note' then excluded.gm_note else public.character_relationships.gm_note end,
      player_visible = case when v_relationship ? 'player_visible' then excluded.player_visible else public.character_relationships.player_visible end,
      state = 'active',
      ended_at = null,
      updated_by = v_user_id,
      updated_at = now();
  end if;

  if jsonb_typeof(v_patch->'discover_for_character_ids') = 'array' then
    for v_value in
      select value from jsonb_array_elements_text(v_patch->'discover_for_character_ids')
    loop
      begin
        v_discover_id := v_value::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid discovery character id';
      end;

      if not exists (
        select 1 from public.characters c
        where c.id = v_discover_id
          and c.campaign_id = v_campaign_id
      ) or not private.can_manage_character(v_discover_id, v_user_id) then
        raise exception 'Discovery character is unavailable';
      end if;

      insert into public.character_npc_discoveries(
        character_id,npc_character_id,discovered_by,source,last_interaction_at
      ) values (
        v_discover_id,p_npc_character_id,v_user_id,'ai_gm',now()
      )
      on conflict (character_id,npc_character_id)
      do update set
        last_interaction_at = excluded.last_interaction_at,
        discovered_by = excluded.discovered_by,
        source = excluded.source;
    end loop;
  end if;

  return jsonb_build_object(
    'npc_id', p_npc_character_id,
    'background_simulation_scope', (
      select np.background_simulation_scope
      from public.npc_profiles np
      where np.character_id = p_npc_character_id
    ),
    'canonical_state_changed', true
  );
end;
$function$
;
