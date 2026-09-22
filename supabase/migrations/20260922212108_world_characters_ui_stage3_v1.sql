CREATE OR REPLACE FUNCTION public.list_world_characters_v1(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_active_character_id uuid;
  v_can_manage boolean := false;
  v_rows jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_campaign_member(p_campaign_id, v_user_id) then
    raise exception 'Not allowed';
  end if;

  v_can_manage := private.can_manage_campaign(p_campaign_id, v_user_id);
  v_active_character_id := private.active_character_for_user(p_campaign_id, v_user_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'avatar_url', c.avatar_url,
        'character_class', c.character_class,
        'level', c.level,
        'life_state', c.life_state,
        'bio', c.bio,
        'role', coalesce(np.role, ''),
        'species', coalesce(np.species, ''),
        'creature_type', coalesce(np.creature_type, ''),
        'size', coalesce(np.size, ''),
        'challenge_rating', np.challenge_rating,
        'occupation', coalesce(np.occupation, ''),
        'faction', coalesce(np.faction, ''),
        'relationship',
          case when rel.id is null then null
          else jsonb_build_object(
            'id', rel.id,
            'direction',
              case when rel.subject_character_id = c.id
                then 'npc_to_character'
                else 'character_to_npc'
              end,
            'relationship_kind', rel.relationship_kind,
            'public_label', rel.public_label,
            'attitude_score', rel.attitude_score,
            'player_note', rel.player_note,
            'state', rel.state,
            'updated_at', rel.updated_at
          )
          end
      )
      order by lower(c.name), c.created_at
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.characters c
  left join public.npc_profiles np
    on np.character_id = c.id
  left join lateral (
    select r.*
    from public.character_relationships r
    where v_active_character_id is not null
      and r.campaign_id = p_campaign_id
      and (
        (r.subject_character_id = c.id and r.target_character_id = v_active_character_id)
        or
        (r.subject_character_id = v_active_character_id and r.target_character_id = c.id)
      )
      and (v_can_manage or r.player_visible)
      and r.state = 'active'
    order by
      case when r.subject_character_id = c.id then 0 else 1 end,
      r.updated_at desc
    limit 1
  ) rel on true
  where c.campaign_id = p_campaign_id
    and c.character_type = 'npc'
    and c.publication_state = 'campaign'
    and private.can_view_character(c.id, v_user_id);

  return v_rows;
end;
$function$;

revoke all on function public.list_world_characters_v1(uuid) from public, anon;
grant execute on function public.list_world_characters_v1(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.read_world_npc_dossier_v1(p_npc_character_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_character_type text;
  v_can_manage boolean := false;
  v_active_character_id uuid;
  v_character jsonb := '{}'::jsonb;
  v_profile jsonb := '{}'::jsonb;
  v_manager_profile jsonb := null;
  v_sheet jsonb := '{}'::jsonb;
  v_location jsonb := null;
  v_habitats jsonb := '[]'::jsonb;
  v_relationship jsonb := null;
  v_manager_relationships jsonb := null;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select c.campaign_id, c.character_type
    into v_campaign_id, v_character_type
  from public.characters c
  where c.id = p_npc_character_id;

  if v_campaign_id is null
     or v_character_type <> 'npc'
     or not private.can_view_character(p_npc_character_id, v_user_id) then
    raise exception 'NPC not found or unavailable';
  end if;

  v_can_manage := private.can_manage_campaign(v_campaign_id, v_user_id);
  v_active_character_id := private.active_character_for_user(v_campaign_id, v_user_id);

  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'avatar_url', c.avatar_url,
    'character_class', c.character_class,
    'level', c.level,
    'bio', c.bio,
    'life_state', c.life_state
  )
  into v_character
  from public.characters c
  where c.id = p_npc_character_id;

  select jsonb_build_object(
    'role', coalesce(np.role, ''),
    'species', coalesce(np.species, ''),
    'creature_type', coalesce(np.creature_type, ''),
    'size', coalesce(np.size, ''),
    'challenge_rating', np.challenge_rating,
    'occupation', coalesce(np.occupation, ''),
    'faction', coalesce(np.faction, ''),
    'appearance', coalesce(np.appearance, ''),
    'demeanor', coalesce(np.demeanor, ''),
    'public_notes', coalesce(np.public_notes, ''),
    'tags', coalesce(to_jsonb(np.tags), '[]'::jsonb)
  )
  into v_profile
  from public.npc_profiles np
  where np.character_id = p_npc_character_id;

  if v_profile is null then
    v_profile := jsonb_build_object(
      'role','',
      'species','',
      'creature_type','',
      'size','',
      'challenge_rating',null,
      'occupation','',
      'faction','',
      'appearance','',
      'demeanor','',
      'public_notes','',
      'tags','[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'race', cs.race,
    'background', cs.background,
    'alignment', cs.alignment,
    'strength', cs.strength,
    'dexterity', cs.dexterity,
    'constitution', cs.constitution,
    'intelligence', cs.intelligence,
    'wisdom', cs.wisdom,
    'charisma', cs.charisma,
    'armor_class', cs.armor_class,
    'initiative_bonus', cs.initiative_bonus,
    'speed', cs.speed,
    'proficiency_bonus', cs.proficiency_bonus,
    'max_hp', cs.max_hp,
    'current_hp', cs.current_hp,
    'temp_hp', cs.temp_hp,
    'hit_dice', cs.hit_dice,
    'passive_perception', cs.passive_perception,
    'saving_throw_proficiencies', cs.saving_throw_proficiencies,
    'skill_proficiencies', cs.skill_proficiencies,
    'proficiencies', cs.proficiencies,
    'languages', cs.languages,
    'senses', cs.senses,
    'spellcasting_enabled', cs.spellcasting_enabled,
    'spellcasting_ability', cs.spellcasting_ability,
    'spell_save_dc', cs.spell_save_dc,
    'spell_attack_bonus', cs.spell_attack_bonus
  )
  into v_sheet
  from public.character_sheets cs
  where cs.character_id = p_npc_character_id;

  select jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'summary', l.summary
  )
  into v_location
  from public.character_world_state cws
  join public.locations l on l.id = cws.location_id
  where cws.character_id = p_npc_character_id
    and private.can_view_location(l.id, v_user_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'summary', l.summary
      )
      order by lower(l.name)
    ),
    '[]'::jsonb
  )
  into v_habitats
  from public.location_npc_habitats h
  join public.locations l on l.id = h.location_id
  where h.npc_character_id = p_npc_character_id
    and private.can_view_location(l.id, v_user_id);

  select
    case when r.id is null then null
    else jsonb_build_object(
      'id', r.id,
      'direction',
        case when r.subject_character_id = p_npc_character_id
          then 'npc_to_character'
          else 'character_to_npc'
        end,
      'relationship_kind', r.relationship_kind,
      'public_label', r.public_label,
      'attitude_score', r.attitude_score,
      'player_note', r.player_note,
      'state', r.state,
      'updated_at', r.updated_at
    )
    end
  into v_relationship
  from (
    select rr.*
    from public.character_relationships rr
    where v_active_character_id is not null
      and rr.campaign_id = v_campaign_id
      and (
        (rr.subject_character_id = p_npc_character_id and rr.target_character_id = v_active_character_id)
        or
        (rr.subject_character_id = v_active_character_id and rr.target_character_id = p_npc_character_id)
      )
      and (v_can_manage or rr.player_visible)
      and rr.state = 'active'
    order by
      case when rr.subject_character_id = p_npc_character_id then 0 else 1 end,
      rr.updated_at desc
    limit 1
  ) r;

  if v_can_manage then
    select jsonb_build_object(
      'motivation', coalesce(np.motivation, ''),
      'gm_notes', coalesce(np.gm_notes, '')
    )
    into v_manager_profile
    from public.npc_profiles np
    where np.character_id = p_npc_character_id;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'direction',
            case when r.subject_character_id = p_npc_character_id
              then 'npc_to_character'
              else 'character_to_npc'
            end,
          'counterpart_character_id',
            case when r.subject_character_id = p_npc_character_id
              then r.target_character_id
              else r.subject_character_id
            end,
          'counterpart_name', counterpart.name,
          'relationship_kind', r.relationship_kind,
          'public_label', r.public_label,
          'attitude_score', r.attitude_score,
          'player_note', r.player_note,
          'gm_note', r.gm_note,
          'player_visible', r.player_visible,
          'state', r.state,
          'updated_at', r.updated_at
        )
        order by r.updated_at desc
      ),
      '[]'::jsonb
    )
    into v_manager_relationships
    from public.character_relationships r
    join public.characters counterpart
      on counterpart.id = case
        when r.subject_character_id = p_npc_character_id
          then r.target_character_id
        else r.subject_character_id
      end
    where r.campaign_id = v_campaign_id
      and (
        r.subject_character_id = p_npc_character_id
        or r.target_character_id = p_npc_character_id
      )
      and private.can_view_character(counterpart.id, v_user_id);
  end if;

  return jsonb_build_object(
    'character', v_character,
    'profile', v_profile,
    'sheet', coalesce(v_sheet, '{}'::jsonb),
    'location', v_location,
    'habitats', v_habitats,
    'relationship', v_relationship,
    'manager',
      case when v_can_manage then
        jsonb_build_object(
          'profile', coalesce(v_manager_profile, '{}'::jsonb),
          'relationships', coalesce(v_manager_relationships, '[]'::jsonb)
        )
      else null
      end
  );
end;
$function$;

revoke all on function public.read_world_npc_dossier_v1(uuid) from public, anon;
grant execute on function public.read_world_npc_dossier_v1(uuid) to authenticated;

comment on function public.list_world_characters_v1(uuid) is
  'Player-safe world NPC card feed. Uses character visibility/discovery and returns only public NPC profile fields plus the visible current relationship to the caller active character.';
comment on function public.read_world_npc_dossier_v1(uuid) is
  'Player-safe world NPC dossier with D&D sheet, visible world position/habitats and relationship to caller active character. GM/Admin additionally receive secret NPC profile and all manageable relationships.';
