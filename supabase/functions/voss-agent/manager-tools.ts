import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3"
import type { VossAuthority } from "./authority.ts"
import { canContainLocation, cascadeChildLimit } from "./location-hierarchy.ts"

type JsonRecord = Record<string, unknown>

export type VossManagerToolContext = {
  client: SupabaseClient
  admin: SupabaseClient
  campaignId: string
  userId: string
  authority: VossAuthority
  internalService?: boolean
}

const NPC_SHEET_PROPERTIES = {
  race: { type: "string" },
  background: { type: "string" },
  alignment: { type: "string" },
  strength: { type: "integer", minimum: 1, maximum: 40 },
  dexterity: { type: "integer", minimum: 1, maximum: 40 },
  constitution: { type: "integer", minimum: 1, maximum: 40 },
  intelligence: { type: "integer", minimum: 1, maximum: 40 },
  wisdom: { type: "integer", minimum: 1, maximum: 40 },
  charisma: { type: "integer", minimum: 1, maximum: 40 },
  armor_class: { type: "integer", minimum: 0, maximum: 50 },
  initiative_bonus: { type: "integer", minimum: -30, maximum: 30 },
  speed: { type: "integer", minimum: 0, maximum: 1000 },
  proficiency_bonus: { type: "integer", minimum: 0, maximum: 20 },
  max_hp: { type: "integer", minimum: 1, maximum: 100000 },
  current_hp: { type: "integer", minimum: 0, maximum: 100000 },
  temp_hp: { type: "integer", minimum: 0, maximum: 100000 },
  hit_dice: { type: "string" },
  passive_perception: { type: "integer", minimum: 0, maximum: 60 },
  saving_throw_proficiencies: {
    type: "array",
    maxItems: 12,
    items: { type: "string" },
  },
  skill_proficiencies: {
    type: "object",
    additionalProperties: true,
  },
  proficiencies: { type: "string" },
  languages: { type: "string" },
  senses: { type: "string" },
  personality_traits: { type: "string" },
  ideals: { type: "string" },
  bonds: { type: "string" },
  flaws: { type: "string" },
  backstory: { type: "string" },
  notes: { type: "string" },
} as const

const CHARACTER_SHEET_PROPERTIES = {
  race: { type: "string" },
  background: { type: "string" },
  alignment: { type: "string" },
  experience: { type: "integer", minimum: 0, maximum: 1000000000 },
  strength: { type: "integer", minimum: 1, maximum: 30 },
  dexterity: { type: "integer", minimum: 1, maximum: 30 },
  constitution: { type: "integer", minimum: 1, maximum: 30 },
  intelligence: { type: "integer", minimum: 1, maximum: 30 },
  wisdom: { type: "integer", minimum: 1, maximum: 30 },
  charisma: { type: "integer", minimum: 1, maximum: 30 },
  armor_class: { type: "integer", minimum: 0, maximum: 99 },
  initiative_bonus: { type: "integer", minimum: -30, maximum: 30 },
  speed: { type: "integer", minimum: 0, maximum: 1000 },
  proficiency_bonus: { type: "integer", minimum: 0, maximum: 20 },
  max_hp: { type: "integer", minimum: 0, maximum: 1000000 },
  current_hp: { type: "integer", minimum: 0, maximum: 1000000 },
  temp_hp: { type: "integer", minimum: 0, maximum: 1000000 },
  hit_dice: { type: "string" },
  death_save_successes: { type: "integer", minimum: 0, maximum: 3 },
  death_save_failures: { type: "integer", minimum: 0, maximum: 3 },
  passive_perception: { type: "integer", minimum: 0, maximum: 99 },
  saving_throw_proficiencies: { type: "array", items: { type: "string" } },
  skill_proficiencies: { type: "object", additionalProperties: true },
  proficiencies: { type: "string" },
  languages: { type: "string" },
  senses: { type: "string" },
  personality_traits: { type: "string" },
  ideals: { type: "string" },
  bonds: { type: "string" },
  flaws: { type: "string" },
  backstory: { type: "string" },
  notes: { type: "string" },
  spellcasting_enabled: { type: "boolean" },
  spellcasting_ability: {
    type: "string",
    enum: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"],
  },
  spell_save_dc: { type: "integer", minimum: 0, maximum: 99 },
  spell_attack_bonus: { type: "integer", minimum: -30, maximum: 99 },
  spell_slots: { type: "object", additionalProperties: true },
  spell_change_unlocked: { type: "boolean" },
  runtime_facts: { type: "object", additionalProperties: true },
} as const

const NPC_PROFILE_PROPERTIES = {
  role: { type: "string" },
  species: { type: "string" },
  creature_type: { type: "string" },
  size: {
    type: "string",
    enum: ["tiny", "small", "medium", "large", "huge", "gargantuan"],
  },
  challenge_rating: { type: "number", minimum: 0, maximum: 100 },
  occupation: { type: "string" },
  faction: { type: "string" },
  appearance: { type: "string" },
  demeanor: { type: "string" },
  motivation: { type: "string" },
  public_notes: { type: "string" },
  gm_notes: { type: "string" },
  tags: {
    type: "array",
    maxItems: 24,
    items: { type: "string" },
  },
} as const

const NPC_RELATIONSHIP_PROPERTIES = {
  target_character_id: { type: "string" },
  relationship_kind: { type: "string" },
  public_label: { type: "string" },
  attitude_score: { type: "integer", minimum: -100, maximum: 100 },
  player_note: { type: "string" },
  gm_note: { type: "string" },
  player_visible: { type: "boolean" },
} as const

export const VOSS_MANAGER_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_workshop_character",
      description:
        "GM/Admin only. Create a future PC or NPC directly in the Workshop Draft section. The character remains private draft content until separately published.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_type: { type: "string", enum: ["pc", "npc"] },
          name: { type: "string" },
          character_class: { type: "string" },
          level: { type: "integer", minimum: 1, maximum: 30 },
          bio: { type: "string" },
        },
        required: ["character_type", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_campaign_character",
      description:
        "GM/Admin only. Edit an existing campaign or Workshop character. Read the character first and send only intended fields.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          name: { type: "string" },
          character_type: { type: "string", enum: ["pc", "npc"] },
          character_class: { type: "string" },
          level: { type: "integer", minimum: 1, maximum: 30 },
          bio: { type: "string" },
          avatar_url: { type: "string" },
          sheet: {
            type: "object",
            additionalProperties: false,
            properties: CHARACTER_SHEET_PROPERTIES,
            description:
              "Patch the canonical character sheet: race, stats, HP, spellcasting values, slots, proficiencies, biography fields and runtime facts. Omitted fields are preserved.",
          },
        },
        required: ["character_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_character_spell",
      description:
        "GM/Admin only. Add, update preparation state, or remove a canonical spell/cantrip on a character. Resolve from spell_catalog by id, slug, Russian name or English name; never hand-copy spell mechanics.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          operation: { type: "string", enum: ["add", "remove"] },
          catalog_spell_id: { type: "string" },
          slug: { type: "string" },
          name: { type: "string" },
          prepared: { type: "boolean" },
        },
        required: ["character_id", "operation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_character_template_assignment",
      description:
        "GM/Admin only. Assign or update a canonical rule template on a character (class, subclass or any future template kind). This is the correct path for durable template mechanics and may include selected_choices.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          template_id: { type: "string" },
          template_slug: { type: "string" },
          template_name: { type: "string" },
          template_level: { type: "integer", minimum: 1, maximum: 30 },
          selected_choices: { type: "object", additionalProperties: true },
        },
        required: ["character_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "commit_character_template_choice",
      description:
        "GM/Admin only. Change one validated choice on an existing character template assignment. Use this for invocations and other class/subclass choices; the Character Engine validates unlock levels, replacement limits and runtime effects.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          assignment_id: { type: "string" },
          choice_key: { type: "string" },
          instances: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
        required: ["assignment_id", "choice_key", "instances"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_character_template_assignment",
      description:
        "GM/Admin only. Remove a canonical class/subclass/template assignment from a character through Character Engine cleanup.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          assignment_id: { type: "string" },
        },
        required: ["character_id", "assignment_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_character_feature",
      description:
        "GM/Admin only. Create or patch a direct character feature/feat. Prefer canonical template choices when one exists; use this for character-specific feats/features or imported mechanics.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          feature_id: { type: "string" },
          kind: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          mechanics: { type: "array", items: { type: "object", additionalProperties: true } },
          sort_order: { type: "integer" },
          source_definition_id: { type: "string" },
          source_definition_revision: { type: "integer", minimum: 1 },
        },
        required: ["character_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_character_feature",
      description:
        "GM/Admin only. Delete one direct character feature/feat by id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          feature_id: { type: "string" },
        },
        required: ["character_id", "feature_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_character_resource_state",
      description:
        "GM/Admin only. Set a character runtime resource state such as class resource, custom charges or temporary maximum. This changes current canonical runtime state, not the reusable class definition.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          state_key: { type: "string" },
          current: { type: "integer", minimum: 0 },
          max_snapshot: { type: "integer", minimum: 0 },
          label: { type: "string" },
          recharge: { type: "object", additionalProperties: true },
          temporary_max_bonus: { type: "integer", minimum: 0 },
        },
        required: ["character_id", "state_key", "current", "max_snapshot"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_character_inventory_item",
      description:
        "GM/Admin only. Create an inventory item through the canonical Cheburashka inventory authoring RPC. It may reuse an existing definition or author a campaign definition from input/profile.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          input: { type: "object", additionalProperties: true },
          inventory_profile: { type: "object", additionalProperties: true },
        },
        required: ["character_id", "input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_character_inventory_item",
      description:
        "GM/Admin only. Patch one inventory item through the canonical Cheburashka inventory engine. expected_version is optional; when omitted Freddy reads the current version first.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          item_id: { type: "string" },
          input: { type: "object", additionalProperties: true },
          inventory_profile: { type: "object", additionalProperties: true },
          expected_version: { type: "integer", minimum: 1 },
        },
        required: ["character_id", "item_id", "input"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_character_inventory_item",
      description:
        "GM/Admin only. Permanently remove one inventory item through the canonical inventory engine. expected_version is optional and is resolved when omitted.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          item_id: { type: "string" },
          expected_version: { type: "integer", minimum: 1 },
        },
        required: ["character_id", "item_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_character_inventory_equipped",
      description:
        "GM/Admin only. Equip one inventory item into a canonical equipment slot through the inventory engine.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          item_id: { type: "string" },
          equipment_slot: { type: "string" },
          expected_version: { type: "integer", minimum: 1 },
        },
        required: ["character_id", "item_id", "equipment_slot"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_character_inventory_quick_access",
      description:
        "GM/Admin only. Enable or disable the character's single quick-access inventory item.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          item_id: { type: "string" },
          enabled: { type: "boolean" },
          expected_version: { type: "integer", minimum: 1 },
        },
        required: ["character_id", "item_id", "enabled"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_world_npc",
      description:
        "GM/Admin only. Atomically create a canonical published NPC that exists in the world. Fill enough D&D sheet data for the NPC's actual role, plus NPC profile, optional current location/habitats, optional relationship to a character, and discovery for characters who have actually encountered the NPC. Do not use this for a future quest NPC that does not need to exist yet; keep that as a quest placeholder until it enters play.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          character_class: {
            type: "string",
            description: "NPC archetype or class label, e.g. Стражник, Торговец, Волшебник.",
          },
          level: { type: "integer", minimum: 1, maximum: 30 },
          bio: { type: "string" },
          avatar_url: { type: "string" },
          visibility_mode: { type: "string", enum: ["always", "discover"] },
          background_simulation_scope: {
            type: "string",
            enum: ["entity", "disabled"],
            description:
              "Persistent background simulation classification. entity means independently evolvable; disabled excludes it.",
          },
          location_id: { type: "string" },
          habitat_location_ids: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
          campaign_day: { type: "integer", minimum: 1 },
          day_period: {
            type: "string",
            enum: ["dawn", "morning", "day", "late_day", "evening", "night", "deep_night"],
          },
          discover_for_character_ids: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
          sheet: {
            type: "object",
            additionalProperties: false,
            properties: NPC_SHEET_PROPERTIES,
          },
          profile: {
            type: "object",
            additionalProperties: false,
            properties: NPC_PROFILE_PROPERTIES,
          },
          relationship: {
            type: "object",
            additionalProperties: false,
            properties: NPC_RELATIONSHIP_PROPERTIES,
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_world_npc",
      description:
        "GM/Admin only. Atomically patch an existing canonical world NPC. Read the NPC first. Send only fields that truly changed. Use this for D&D stats, NPC profile, current location, replacement habitat list, relationship state, or discovery after an encounter.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          name: { type: "string" },
          character_class: { type: "string" },
          level: { type: "integer", minimum: 1, maximum: 30 },
          bio: { type: "string" },
          avatar_url: { type: "string" },
          visibility_mode: { type: "string", enum: ["always", "discover"] },
          background_simulation_scope: {
            type: "string",
            enum: ["entity", "disabled"],
            description:
              "Persistent background simulation classification. entity means independently evolvable; disabled excludes it.",
          },
          location_id: { type: "string" },
          habitat_location_ids: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
          discover_for_character_ids: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
          sheet: {
            type: "object",
            additionalProperties: false,
            properties: NPC_SHEET_PROPERTIES,
          },
          profile: {
            type: "object",
            additionalProperties: false,
            properties: NPC_PROFILE_PROPERTIES,
          },
          relationship: {
            type: "object",
            additionalProperties: false,
            properties: NPC_RELATIONSHIP_PROPERTIES,
          },
        },
        required: ["character_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_faction",
      description:
        "GM/Admin only. Create a canonical campaign faction or update an existing faction. Reusing the same name returns/updates the existing faction instead of creating a duplicate. Faction identity is separate from a character's reputation with that faction.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          faction_id: { type: "string" },
          name: { type: "string" },
          summary: { type: "string" },
          description: { type: "string" },
          image_url: { type: "string" },
          player_visible: { type: "boolean" },
          state: { type: "string", enum: ["active", "archived"] },
          tags: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_faction_membership",
      description:
        "GM/Admin only. Set or update a character's membership in a canonical faction. Membership answers whether the character belongs to the faction and in what role/rank. It does NOT describe whether the faction likes the character.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          faction_id: { type: "string" },
          membership_role: { type: "string" },
          rank_label: { type: "string" },
          is_primary: { type: "boolean" },
          player_visible: { type: "boolean" },
          state: { type: "string", enum: ["active", "ended"] },
        },
        required: ["character_id", "faction_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_character_faction_reputation",
      description:
        "GM/Admin only. Set or update the current reputation of one character with a canonical faction. reputation_score is -100..100 and may change as play events change the faction's disposition. Keep GM-only reasons in gm_note and player-visible consequences in player_note/public_label.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          faction_id: { type: "string" },
          standing_kind: { type: "string" },
          public_label: { type: "string" },
          reputation_score: { type: "integer", minimum: -100, maximum: 100 },
          player_note: { type: "string" },
          gm_note: { type: "string" },
          player_visible: { type: "boolean" },
          state: { type: "string", enum: ["active", "ended"] },
        },
        required: ["character_id", "faction_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_character_life_state",
      description:
        "GM/Admin only. Mark an existing character alive or dead. Use only when the GM/Admin explicitly asks to change canonical life state.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          life_state: { type: "string", enum: ["alive", "dead"] },
        },
        required: ["character_id", "life_state"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_character_publication",
      description:
        "GM/Admin only. Move a character between Workshop Draft and published campaign state. Draft always becomes private and unassigned.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          publication_state: { type: "string", enum: ["draft", "campaign"] },
          visibility_mode: { type: "string", enum: ["always", "discover"] },
        },
        required: ["character_id", "publication_state"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_campaign_character",
      description:
        "GM/Admin only. Permanently delete a campaign or Workshop character when explicitly requested.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
        },
        required: ["character_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_character_world",
      description:
        "GM/Admin only. Move a canonical character to an active visible location. If campaign_day/day_period are omitted, preserve the character's current world time. Moving to a location automatically discovers that location and triggers quest location events.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          location_id: { type: "string" },
          campaign_day: { type: "integer", minimum: 1 },
          day_period: {
            type: "string",
            enum: ["dawn", "morning", "day", "late_day", "evening", "night", "deep_night"],
          },
        },
        required: ["character_id", "location_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_world_discovery",
      description:
        "GM/Admin only. Mark a location, world NPC, or location transition as discovered or undiscovered for one character. This changes what that character knows; it does not move the character and it does not create the entity.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          character_id: { type: "string" },
          entity_type: { type: "string", enum: ["location", "npc", "link"] },
          entity_id: { type: "string" },
          discovered: { type: "boolean" },
        },
        required: ["character_id", "entity_type", "entity_id", "discovered"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_npc_habitat",
      description:
        "GM/Admin only. Attach or detach an NPC from a location as a usual habitat. Habitat means where the NPC can normally be encountered and does not move the NPC's current world position.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          npc_character_id: { type: "string" },
          location_id: { type: "string" },
          attached: { type: "boolean" },
        },
        required: ["npc_character_id", "location_id", "attached"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_location_transition",
      description:
        "GM/Admin only. Create or update one directional canonical transition from a source location to a target location. Use link_id to edit a specific existing transition. Call again with reversed source/target if travel should work both ways.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          source_location_id: { type: "string" },
          target_location_id: { type: "string" },
          link_id: { type: "string" },
          label: { type: "string" },
          visibility_mode: { type: "string", enum: ["always", "discover", "private"] },
          sort_order: { type: "integer" },
          travel_minutes: {
            type: "integer",
            minimum: 1,
            maximum: 10080,
            description:
              "Optional canonical one-way travel duration in game minutes. Omit when unknown; AI survival should use it when the route is actually traversed.",
          },
        },
        required: ["source_location_id", "target_location_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_location_transition",
      description:
        "GM/Admin only. Permanently delete one canonical directional location transition.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          link_id: { type: "string" },
        },
        required: ["link_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_location_secret",
      description:
        "GM/Admin only. Create or update one persistent hidden secret attached to a canonical location. secret_key is the idempotency key inside the location. This is for durable world truth, danger, resource, route, person, object or hook state that should survive quests and sessions. It is never player-visible automatically.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          location_id: { type: "string" },
          secret_id: { type: "string" },
          secret_key: { type: "string" },
          secret_type: { type: "string" },
          title: { type: "string" },
          secret_text: { type: "string" },
          ai_directive: { type: "string" },
          reveal_text: { type: "string" },
          status: { type: "string", enum: ["active", "resolved", "retired"] },
          importance: { type: "integer", minimum: 1, maximum: 5 },
          tags: {
            type: "array",
            maxItems: 24,
            items: { type: "string" },
          },
          metadata: {
            type: "object",
            additionalProperties: true,
          },
          resolution_note: { type: "string" },
        },
        required: ["location_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_location_secret_state",
      description:
        "GM/Admin only. Change the lifecycle state of an existing location secret. resolved means the hidden situation has been resolved; retired means it is no longer canonical/relevant. This does not publish reveal_text to players.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          secret_id: { type: "string" },
          status: { type: "string", enum: ["active", "resolved", "retired"] },
          resolution_note: { type: "string" },
        },
        required: ["secret_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "materialize_location_cascade",
      description:
        "AI-world internal composite mutation. Create or reuse one canonical location, materialize exactly its immediate structural child layer, validate archetype coverage, connect transitions, and optionally move the source PC there. Never nest children inside children in one call.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          location_id: { type: "string" },
          parent_location_id: { type: "string" },
          source_location_id: { type: "string" },
          move_character_id: { type: "string" },
          campaign_day: { type: "integer", minimum: 1 },
          day_period: {
            type: "string",
            enum: ["dawn", "morning", "day", "late_day", "evening", "night", "deep_night"],
          },
          name: { type: "string" },
          summary: { type: "string" },
          description: { type: "string" },
          visibility_mode: {
            type: "string",
            enum: ["always", "discover", "private"],
          },
          background_simulation_scope: {
            type: "string",
            enum: ["entity", "detail", "disabled"],
          },
          archetype: {
            type: "string",
            enum: [
              "world", "region", "city", "town", "village", "district",
              "neighborhood", "road", "forest", "wilderness", "port",
              "building", "tavern", "inn", "shop", "temple", "manor",
              "castle", "dungeon", "cave", "room", "site", "other",
            ],
          },
          scale: {
            type: "string",
            enum: [
              "world", "region", "settlement", "district",
              "site", "building", "room", "detail",
            ],
          },
          structure_roles: {
            type: "array",
            maxItems: 16,
            items: { type: "string" },
          },
          coverage_manifest: {
            type: "object",
            additionalProperties: true,
            description:
              "Coverage notes for this immediate layer. Use omitted_roles={role: reason} only when a normally expected structural role genuinely does not exist in this specific location.",
          },
          children: {
            type: "array",
            maxItems: 4,
            description:
              "Compact immediate anchors only, 0-4 depending on archetype. Road: 0-1 observed branch/segment. City: 2-4 multifunctional districts. No speculative streets, houses, rooms or grandchildren.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                summary: { type: "string" },
                description: { type: "string" },
                visibility_mode: {
                  type: "string",
                  enum: ["always", "discover", "private"],
                },
                background_simulation_scope: {
                  type: "string",
                  enum: ["entity", "detail", "disabled"],
                },
                archetype: {
                  type: "string",
                  enum: [
                    "world", "region", "city", "town", "village", "district",
                    "neighborhood", "road", "forest", "wilderness", "port",
                    "building", "tavern", "inn", "shop", "temple", "manor",
                    "castle", "dungeon", "cave", "room", "site", "other",
                  ],
                },
                scale: {
                  type: "string",
                  enum: [
                    "world", "region", "settlement", "district",
                    "site", "building", "room", "detail",
                  ],
                },
                structure_roles: {
                  type: "array",
                  minItems: 1,
                  maxItems: 16,
                  items: { type: "string" },
                },
              },
              required: [
                "name",
                "archetype",
                "scale",
                "background_simulation_scope",
                "structure_roles",
              ],
            },
          },
        },
        required: [
          "archetype",
          "scale",
          "background_simulation_scope",
          "coverage_manifest",
          "children",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_location",
      description:
        "GM/Admin only. Create a canonical location/zone in the campaign world. May be nested under an existing parent location.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          parent_location_id: { type: "string" },
          name: { type: "string" },
          summary: { type: "string" },
          description: { type: "string" },
          visibility_mode: {
            type: "string",
            enum: ["always", "discover", "private"],
          },
          background_simulation_scope: {
            type: "string",
            enum: ["entity", "detail", "disabled"],
            description:
              "entity = independently simulated whole place; detail = internal fragment of another place; disabled = never selected.",
          },
          archetype: {
            type: "string",
            enum: [
              "world", "region", "city", "town", "village", "district",
              "neighborhood", "road", "forest", "wilderness", "port",
              "building", "tavern", "inn", "shop", "temple", "manor",
              "castle", "dungeon", "cave", "room", "site", "other",
            ],
          },
          scale: {
            type: "string",
            enum: [
              "world", "region", "settlement", "district",
              "site", "building", "room", "detail",
            ],
          },
          structure_roles: {
            type: "array",
            maxItems: 16,
            items: { type: "string" },
          },
          structure_state: {
            type: "string",
            enum: ["stub", "materialized", "detailed"],
          },
          coverage_manifest: {
            type: "object",
            additionalProperties: true,
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_location",
      description:
        "GM/Admin only. Edit an existing canonical location/zone. Read it first and change only requested fields.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          location_id: { type: "string" },
          parent_location_id: { type: "string" },
          name: { type: "string" },
          summary: { type: "string" },
          description: { type: "string" },
          visibility_mode: {
            type: "string",
            enum: ["always", "discover", "private"],
          },
          background_simulation_scope: {
            type: "string",
            enum: ["entity", "detail", "disabled"],
          },
          archetype: {
            type: "string",
            enum: [
              "world", "region", "city", "town", "village", "district",
              "neighborhood", "road", "forest", "wilderness", "port",
              "building", "tavern", "inn", "shop", "temple", "manor",
              "castle", "dungeon", "cave", "room", "site", "other",
            ],
          },
          scale: {
            type: "string",
            enum: [
              "world", "region", "settlement", "district",
              "site", "building", "room", "detail",
            ],
          },
          structure_roles: {
            type: "array",
            maxItems: 16,
            items: { type: "string" },
          },
          structure_state: {
            type: "string",
            enum: ["stub", "materialized", "detailed"],
          },
          coverage_manifest: {
            type: "object",
            additionalProperties: true,
          },
        },
        required: ["location_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_location_changes",
      description:
        "GM/Admin only. Apply a related batch of location creates/updates in order. Use refs to connect locations created earlier in the same batch. Prefer this for filling a tavern, settlement, dungeon floor or another location tree instead of one tool call per room.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          operations: {
            type: "array",
            minItems: 1,
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                op: { type: "string", enum: ["create", "update"] },
                ref: { type: "string" },
                location_id: { type: "string" },
                location_ref: { type: "string" },
                parent_location_id: { type: "string" },
                parent_ref: { type: "string" },
                name: { type: "string" },
                summary: { type: "string" },
                description: { type: "string" },
                visibility_mode: {
                  type: "string",
                  enum: ["always", "discover", "private"],
                },
                background_simulation_scope: {
                  type: "string",
                  enum: ["entity", "detail", "disabled"],
                },
                archetype: { type: "string" },
                scale: { type: "string" },
                structure_roles: {
                  type: "array",
                  maxItems: 16,
                  items: { type: "string" },
                },
                structure_state: {
                  type: "string",
                  enum: ["stub", "materialized", "detailed"],
                },
                coverage_manifest: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              required: ["op"],
            },
          },
        },
        required: ["operations"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_location_archived",
      description:
        "GM/Admin only. Archive or restore a location without deleting it.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          location_id: { type: "string" },
          archived: { type: "boolean" },
        },
        required: ["location_id", "archived"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_location",
      description:
        "GM/Admin only. Permanently delete a location/zone when explicitly requested.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          location_id: { type: "string" },
        },
        required: ["location_id"],
      },
    },
  },
] as const

const TOOL_NAMES = new Set(VOSS_MANAGER_TOOLS.map((tool) => tool.function.name))

export function isVossManagerTool(name: string) {
  return TOOL_NAMES.has(name)
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function uuid(value: unknown) {
  const result = text(value, 80)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)
    ? result
    : ""
}

function level(value: unknown, fallback = 1) {
  const parsed = Number(value)
  return Number.isInteger(parsed)
    ? Math.max(1, Math.min(30, parsed))
    : fallback
}

function managerClient(context: VossManagerToolContext) {
  return context.authority === "admin" ? context.admin : context.client
}

async function canonicalManagerRpc(
  context: VossManagerToolContext,
  operation: string,
  directArgs: JsonRecord,
  internalArgs: JsonRecord,
) {
  if (context.internalService) {
    return await context.admin.rpc("ai_gm_invoke_as_manager_v1", {
      p_actor_user_id: context.userId,
      p_operation: operation,
      p_args: internalArgs,
    })
  }

  return await context.client.rpc(operation, directArgs)
}

function canManage(context: VossManagerToolContext) {
  return context.authority === "gm" || context.authority === "admin"
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

const LOCATION_ARCHETYPES = new Set([
  "world", "region", "city", "town", "village", "district", "neighborhood",
  "road", "forest", "wilderness", "port", "building", "tavern", "inn",
  "shop", "temple", "manor", "castle", "dungeon", "cave", "room",
  "site", "other",
])
const LOCATION_SCALES = new Set([
  "world", "region", "settlement", "district", "site", "building", "room",
  "detail",
])
const LOCATION_STRUCTURE_STATES = new Set([
  "stub", "materialized", "detailed",
])

function locationEnum(
  value: unknown,
  allowed: Set<string>,
  fallback: string,
) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  return allowed.has(normalized) ? normalized : fallback
}

function locationRoles(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase().slice(0, 64))
      .filter(Boolean),
  )].slice(0, 16)
}

const CHARACTER_SHEET_KEYS = new Set(Object.keys(CHARACTER_SHEET_PROPERTIES))

function sheetPatch(value: unknown) {
  const source = record(value)
  const patch: JsonRecord = {}
  for (const [key, item] of Object.entries(source)) {
    if (CHARACTER_SHEET_KEYS.has(key) && item !== undefined) patch[key] = item
  }
  return patch
}

async function currentInventoryVersion(
  context: VossManagerToolContext,
  characterId: string,
  itemId: string,
) {
  const { data, error } = await context.admin
    .from("character_inventory_items")
    .select("id,character_id,version")
    .eq("id", itemId)
    .eq("character_id", characterId)
    .maybeSingle()
  if (error) return { error: error.message, version: 0 }
  if (!data) return { error: "inventory_item_not_found", version: 0 }
  return { error: "", version: Number(data.version || 0) }
}

async function readCharacter(context: VossManagerToolContext, characterId: string) {
  const { data, error } = await managerClient(context)
    .from("characters")
    .select("id,campaign_id,assigned_user_id,name,character_class,level,bio,avatar_url,character_type,visibility,visibility_mode,publication_state,life_state,died_at")
    .eq("campaign_id", context.campaignId)
    .eq("id", characterId)
    .maybeSingle()
  if (error) return { error: error.message as string, row: null }
  return { error: "", row: data || null }
}

async function createWorkshopCharacter(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const name = text(args.name, 160)
  if (!name) return { error: "character_name_required" }
  const characterType = args.character_type === "npc" ? "npc" : "pc"

  const { data, error } = await managerClient(context)
    .from("characters")
    .insert({
      campaign_id: context.campaignId,
      assigned_user_id: null,
      name,
      character_class: text(args.character_class, 120) || "Персонаж",
      level: level(args.level, 1),
      bio: text(args.bio, 12000),
      avatar_url: null,
      character_type: characterType,
      visibility: "private",
      visibility_mode: "private",
      publication_state: "draft",
      created_by: context.userId,
    })
    .select("id,name,character_type,publication_state,visibility_mode")
    .single()

  if (error) return { error: error.message }
  return { character: data, canonical_state_changed: true, surface: "workshop_draft" }
}

async function updateCampaignCharacter(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  const row = current.row
  const characterType =
    args.character_type === "npc"
      ? "npc"
      : args.character_type === "pc"
        ? "pc"
        : row.character_type
  const patch: JsonRecord = {
    name: text(args.name, 160) || row.name,
    character_class:
      args.character_class === undefined
        ? row.character_class
        : text(args.character_class, 120) || "Персонаж",
    level: args.level === undefined ? row.level : level(args.level, row.level),
    bio: args.bio === undefined ? row.bio : text(args.bio, 12000),
    avatar_url:
      args.avatar_url === undefined
        ? row.avatar_url
        : text(args.avatar_url, 2000) || null,
    character_type: characterType,
    updated_at: new Date().toISOString(),
  }
  if (characterType === "npc") patch.assigned_user_id = null
  if (row.publication_state === "draft") {
    patch.assigned_user_id = null
    patch.visibility = "private"
    patch.visibility_mode = "private"
  }

  const { data, error } = await managerClient(context)
    .from("characters")
    .update(patch)
    .eq("campaign_id", context.campaignId)
    .eq("id", characterId)
    .select("id,name,character_type,character_class,level,bio,publication_state,visibility_mode,life_state")
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { not_found: true }

  let sheet: unknown = null
  const requestedSheet = sheetPatch(args.sheet)
  if (Object.keys(requestedSheet).length) {
    requestedSheet.updated_at = new Date().toISOString()
    const { data: sheetData, error: sheetError } = await context.admin
      .from("character_sheets")
      .upsert(
        { character_id: characterId, ...requestedSheet },
        { onConflict: "character_id" },
      )
      .select("*")
      .single()
    if (sheetError) return { error: sheetError.message, character: data }
    sheet = sheetData
  }

  return { character: data, ...(sheet ? { sheet } : {}), canonical_state_changed: true }
}

async function resolveCatalogSpell(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const catalogId = uuid(args.catalog_spell_id)
  if (catalogId) {
    const result = await context.admin
      .from("spell_catalog")
      .select("id,slug,name_ru,name_en,spell_level")
      .eq("id", catalogId)
      .maybeSingle()
    if (result.error) return { error: result.error.message, spell: null }
    return { error: "", spell: result.data || null }
  }

  const slug = text(args.slug, 220)
  if (slug) {
    const result = await context.admin
      .from("spell_catalog")
      .select("id,slug,name_ru,name_en,spell_level")
      .eq("slug", slug)
      .maybeSingle()
    if (result.error) return { error: result.error.message, spell: null }
    if (result.data) return { error: "", spell: result.data }
  }

  const name = text(args.name, 240)
  if (!name) return { error: "spell_identifier_required", spell: null }

  const ru = await context.admin
    .from("spell_catalog")
    .select("id,slug,name_ru,name_en,spell_level")
    .eq("name_ru", name)
    .limit(1)
    .maybeSingle()
  if (ru.error) return { error: ru.error.message, spell: null }
  if (ru.data) return { error: "", spell: ru.data }

  const en = await context.admin
    .from("spell_catalog")
    .select("id,slug,name_ru,name_en,spell_level")
    .eq("name_en", name)
    .limit(1)
    .maybeSingle()
  if (en.error) return { error: en.error.message, spell: null }
  return { error: "", spell: en.data || null }
}

async function setCharacterSpell(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  const resolved = await resolveCatalogSpell(context, args)
  if (resolved.error) return { error: resolved.error }
  if (!resolved.spell) return { error: "spell_not_found" }

  const existing = await context.admin
    .from("character_spells")
    .select("id,prepared,catalog_spell_id")
    .eq("character_id", characterId)
    .eq("catalog_spell_id", resolved.spell.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing.error) return { error: existing.error.message }

  if (args.operation === "remove") {
    if (!existing.data) {
      return { removed: false, not_found: true, spell: resolved.spell }
    }
    const deleted = await context.admin
      .from("character_spells")
      .delete()
      .eq("character_id", characterId)
      .eq("catalog_spell_id", resolved.spell.id)
    if (deleted.error) return { error: deleted.error.message }
    return {
      removed: true,
      spell: resolved.spell,
      canonical_state_changed: true,
    }
  }

  const prepared =
    typeof args.prepared === "boolean"
      ? args.prepared
      : Number(resolved.spell.spell_level || 0) === 0

  if (existing.data) {
    const updated = await context.admin
      .from("character_spells")
      .update({ prepared, updated_at: new Date().toISOString() })
      .eq("id", existing.data.id)
      .select("id,name,spell_level,prepared,cast_mode,slot_level,catalog_spell_id")
      .single()
    if (updated.error) return { error: updated.error.message }
    return { spell: updated.data, canonical_state_changed: true }
  }

  const inserted = await context.admin
    .from("character_spells")
    .insert({
      character_id: characterId,
      catalog_spell_id: resolved.spell.id,
      name: resolved.spell.name_ru || resolved.spell.name_en || resolved.spell.slug,
      prepared,
    })
    .select("id,name,spell_level,prepared,cast_mode,slot_level,catalog_spell_id")
    .single()
  if (inserted.error) return { error: inserted.error.message }
  return { spell: inserted.data, canonical_state_changed: true }
}

async function resolveRuleTemplate(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const templateId = uuid(args.template_id)
  if (templateId) {
    const result = await context.admin
      .from("rule_templates")
      .select("id,campaign_id,kind,slug,name,is_active")
      .eq("id", templateId)
      .eq("campaign_id", context.campaignId)
      .maybeSingle()
    if (result.error) return { error: result.error.message, template: null }
    return { error: "", template: result.data || null }
  }

  const slug = text(args.template_slug, 220)
  if (slug) {
    const result = await context.admin
      .from("rule_templates")
      .select("id,campaign_id,kind,slug,name,is_active")
      .eq("campaign_id", context.campaignId)
      .eq("slug", slug)
      .maybeSingle()
    if (result.error) return { error: result.error.message, template: null }
    if (result.data) return { error: "", template: result.data }
  }

  const name = text(args.template_name, 240)
  if (!name) return { error: "template_identifier_required", template: null }
  const result = await context.admin
    .from("rule_templates")
    .select("id,campaign_id,kind,slug,name,is_active")
    .eq("campaign_id", context.campaignId)
    .eq("name", name)
    .limit(1)
    .maybeSingle()
  if (result.error) return { error: result.error.message, template: null }
  return { error: "", template: result.data || null }
}

async function setCharacterTemplateAssignment(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  const resolved = await resolveRuleTemplate(context, args)
  if (resolved.error) return { error: resolved.error }
  if (!resolved.template || resolved.template.is_active !== true) {
    return { error: "active_template_not_found" }
  }

  const selectedChoices = record(args.selected_choices)
  const { data, error } = await context.client.rpc(
    "set_character_template_assignment_owner_v1",
    {
      p_character_id: characterId,
      p_template_id: resolved.template.id,
      p_template_level:
        args.template_level === undefined ? null : level(args.template_level, 1),
      p_selected_choices: selectedChoices,
    },
  )
  if (error) return { error: error.message }

  const assignment = await context.admin
    .from("character_template_assignments")
    .select("id,character_id,template_id,template_level,selected_choices,updated_at")
    .eq("id", data)
    .maybeSingle()
  if (assignment.error) return { error: assignment.error.message }
  return {
    assignment: assignment.data,
    template: resolved.template,
    canonical_state_changed: true,
  }
}

async function commitCharacterTemplateChoice(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const assignmentId = uuid(args.assignment_id)
  const choiceKey = text(args.choice_key, 240)
  if (!assignmentId) return { error: "assignment_id_required" }
  if (!choiceKey) return { error: "choice_key_required" }

  const assignment = await context.admin
    .from("character_template_assignments")
    .select("id,character_id,template_id")
    .eq("id", assignmentId)
    .maybeSingle()
  if (assignment.error) return { error: assignment.error.message }
  if (!assignment.data) return { error: "assignment_not_found" }

  const current = await readCharacter(context, assignment.data.character_id)
  if (current.error) return { error: current.error }
  if (!current.row) return { error: "assignment_character_not_in_campaign" }

  const instances = Array.isArray(args.instances) ? args.instances : []
  const result = await context.client.rpc(
    "commit_character_template_choice_v2",
    {
      p_assignment_id: assignmentId,
      p_choice_key: choiceKey,
      p_instances: instances,
    },
  )
  if (result.error) return { error: result.error.message }
  return { choice: result.data, canonical_state_changed: true }
}

async function removeCharacterTemplateAssignment(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const assignmentId = uuid(args.assignment_id)
  if (!characterId) return { error: "character_id_required" }
  if (!assignmentId) return { error: "assignment_id_required" }

  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  const result = await context.client.rpc(
    "remove_character_template_assignment_v2",
    { p_character_id: characterId, p_assignment_id: assignmentId },
  )
  if (result.error) return { error: result.error.message }
  return { removed: true, assignment_id: assignmentId, canonical_state_changed: true }
}

async function upsertCharacterFeature(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  const featureId = args.feature_id ? uuid(args.feature_id) : ""
  if (args.feature_id && !featureId) return { error: "feature_id_invalid" }

  const patch: JsonRecord = { updated_at: new Date().toISOString() }
  if (args.kind !== undefined) patch.kind = text(args.kind, 80) || "feature"
  if (args.name !== undefined) patch.name = text(args.name, 240)
  if (args.description !== undefined) patch.description = text(args.description, 12000)
  if (Array.isArray(args.mechanics)) patch.mechanics = args.mechanics
  if (Number.isInteger(Number(args.sort_order))) patch.sort_order = Number(args.sort_order)
  if (args.source_definition_id !== undefined) {
    const definitionId = uuid(args.source_definition_id)
    if (!definitionId) return { error: "source_definition_id_invalid" }
    patch.source_definition_id = definitionId
  }
  if (args.source_definition_revision !== undefined) {
    patch.source_definition_revision = Math.max(1, Number(args.source_definition_revision))
  }

  if (featureId) {
    const result = await context.admin
      .from("character_features")
      .update(patch)
      .eq("character_id", characterId)
      .eq("id", featureId)
      .select("*")
      .maybeSingle()
    if (result.error) return { error: result.error.message }
    if (!result.data) return { not_found: true }
    return { feature: result.data, canonical_state_changed: true }
  }

  if (!patch.name) return { error: "feature_name_required" }
  const result = await context.admin
    .from("character_features")
    .insert({
      character_id: characterId,
      kind: patch.kind || "feature",
      name: patch.name,
      description: patch.description || "",
      mechanics: patch.mechanics || [],
      sort_order: patch.sort_order || 0,
      ...(patch.source_definition_id ? { source_definition_id: patch.source_definition_id } : {}),
      ...(patch.source_definition_revision ? { source_definition_revision: patch.source_definition_revision } : {}),
    })
    .select("*")
    .single()
  if (result.error) return { error: result.error.message }
  return { feature: result.data, canonical_state_changed: true }
}

async function deleteCharacterFeature(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const featureId = uuid(args.feature_id)
  if (!characterId) return { error: "character_id_required" }
  if (!featureId) return { error: "feature_id_required" }
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }
  const result = await context.admin
    .from("character_features")
    .delete()
    .eq("character_id", characterId)
    .eq("id", featureId)
  if (result.error) return { error: result.error.message }
  return { deleted: true, feature_id: featureId, canonical_state_changed: true }
}

async function setCharacterResourceState(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const stateKey = text(args.state_key, 240)
  if (!characterId) return { error: "character_id_required" }
  if (!stateKey) return { error: "state_key_required" }
  const currentCharacter = await readCharacter(context, characterId)
  if (currentCharacter.error) return { error: currentCharacter.error }
  if (!currentCharacter.row) return { not_found: true }

  const payload: JsonRecord = {
    character_id: characterId,
    state_key: stateKey,
    current: Math.max(0, Number(args.current || 0)),
    max_snapshot: Math.max(0, Number(args.max_snapshot || 0)),
    label: text(args.label, 240),
    recharge: record(args.recharge),
    temporary_max_bonus: Math.max(0, Number(args.temporary_max_bonus || 0)),
    updated_by: context.userId,
    updated_at: new Date().toISOString(),
  }
  const result = await context.admin
    .from("character_resource_states")
    .upsert(payload, { onConflict: "character_id,state_key" })
    .select("*")
    .single()
  if (result.error) return { error: result.error.message }
  return { resource: result.data, canonical_state_changed: true }
}

async function createCharacterInventoryItem(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }
  const input = record(args.input)
  if (!Object.keys(input).length) return { error: "inventory_input_required" }

  const result = await context.client.rpc("create_inventory_item_v3", {
    p_character_id: characterId,
    p_input: input,
    p_inventory_profile:
      Object.keys(record(args.inventory_profile)).length
        ? record(args.inventory_profile)
        : null,
  })
  if (result.error) return { error: result.error.message }
  return { inventory: result.data, canonical_state_changed: true }
}

async function updateCharacterInventoryItem(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const itemId = uuid(args.item_id)
  if (!characterId) return { error: "character_id_required" }
  if (!itemId) return { error: "item_id_required" }
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  let expectedVersion = Number(args.expected_version || 0)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    const version = await currentInventoryVersion(context, characterId, itemId)
    if (version.error) return { error: version.error }
    expectedVersion = version.version
  }

  const result = await context.client.rpc("update_inventory_item_v3", {
    p_character_id: characterId,
    p_item_id: itemId,
    p_input: record(args.input),
    p_inventory_profile:
      Object.keys(record(args.inventory_profile)).length
        ? record(args.inventory_profile)
        : null,
    p_expected_version: expectedVersion,
  })
  if (result.error) return { error: result.error.message }
  return { inventory: result.data, canonical_state_changed: true }
}

async function removeCharacterInventoryItem(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const itemId = uuid(args.item_id)
  if (!characterId) return { error: "character_id_required" }
  if (!itemId) return { error: "item_id_required" }
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  let expectedVersion = Number(args.expected_version || 0)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    const version = await currentInventoryVersion(context, characterId, itemId)
    if (version.error) return { error: version.error }
    expectedVersion = version.version
  }

  const result = await context.client.rpc("remove_inventory_item_v1", {
    p_character_id: characterId,
    p_item_id: itemId,
    p_expected_version: expectedVersion,
  })
  if (result.error) return { error: result.error.message }
  return { inventory: result.data, canonical_state_changed: true }
}

async function setCharacterInventoryEquipped(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const itemId = uuid(args.item_id)
  const slot = text(args.equipment_slot, 80)
  if (!characterId) return { error: "character_id_required" }
  if (!itemId) return { error: "item_id_required" }
  if (!slot) return { error: "equipment_slot_required" }

  let expectedVersion = Number(args.expected_version || 0)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    const version = await currentInventoryVersion(context, characterId, itemId)
    if (version.error) return { error: version.error }
    expectedVersion = version.version
  }

  const result = await context.client.rpc("set_inventory_item_equipped_v2", {
    p_character_id: characterId,
    p_item_id: itemId,
    p_equipped: true,
    p_equipment_slot: slot,
    p_expected_version: expectedVersion,
  })
  if (result.error) return { error: result.error.message }
  return { inventory: result.data, canonical_state_changed: true }
}

async function setCharacterInventoryQuickAccess(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const itemId = uuid(args.item_id)
  if (!characterId) return { error: "character_id_required" }
  if (!itemId) return { error: "item_id_required" }

  let expectedVersion = Number(args.expected_version || 0)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    const version = await currentInventoryVersion(context, characterId, itemId)
    if (version.error) return { error: version.error }
    expectedVersion = version.version
  }

  const result = await context.client.rpc("set_inventory_quick_access_v1", {
    p_character_id: characterId,
    p_item_id: itemId,
    p_enabled: args.enabled === true,
    p_expected_version: expectedVersion,
  })
  if (result.error) return { error: result.error.message }
  return { inventory: result.data, canonical_state_changed: true }
}

async function setCharacterLifeState(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }
  const lifeState = args.life_state === "dead" ? "dead" : "alive"
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  const { data, error } = await managerClient(context)
    .from("characters")
    .update({
      life_state: lifeState,
      died_at:
        lifeState === "dead"
          ? current.row.died_at || new Date().toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", context.campaignId)
    .eq("id", characterId)
    .select("id,name,life_state,died_at")
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return { character: data, canonical_state_changed: true }
}

async function deleteCampaignCharacter(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }

  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  const { error } = await managerClient(context)
    .from("characters")
    .delete()
    .eq("campaign_id", context.campaignId)
    .eq("id", characterId)

  if (error) return { error: error.message }
  return {
    deleted: true,
    character_id: characterId,
    character_name: current.row.name,
    canonical_state_changed: true,
  }
}

async function setCharacterPublication(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }
  const state = args.publication_state === "campaign" ? "campaign" : "draft"
  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }

  const visibility =
    current.row.character_type === "npc" && args.visibility_mode === "always"
      ? "always"
      : current.row.character_type === "npc"
        ? "discover"
        : "always"

  const patch = state === "draft"
    ? {
        publication_state: "draft",
        assigned_user_id: null,
        visibility: "private",
        visibility_mode: "private",
        updated_at: new Date().toISOString(),
      }
    : {
        publication_state: "campaign",
        visibility: "campaign",
        visibility_mode: visibility,
        updated_at: new Date().toISOString(),
      }

  if (state === "draft" && current.row.assigned_user_id) {
    await managerClient(context)
      .from("campaign_members")
      .update({ active_character_id: null })
      .eq("campaign_id", context.campaignId)
      .eq("active_character_id", characterId)
  }

  const { data, error } = await managerClient(context)
    .from("characters")
    .update(patch)
    .eq("campaign_id", context.campaignId)
    .eq("id", characterId)
    .select("id,name,character_type,publication_state,visibility_mode,assigned_user_id")
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return { character: data, canonical_state_changed: true }
}

async function createWorldNpc(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const name = text(args.name, 160)
  if (!name) return { error: "npc_name_required" }

  const payload: JsonRecord = { ...args, name }
  const { data, error } = await canonicalManagerRpc(
    context,
    "create_world_npc_v1",
    {
      p_campaign_id: context.campaignId,
      p_input: payload,
    },
    {
      campaign_id: context.campaignId,
      input: payload,
    },
  )

  if (error) return { error: error.message }
  return {
    npc: data,
    canonical_state_changed: true,
  }
}

async function updateWorldNpc(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  if (!characterId) return { error: "character_id_required" }

  const current = await readCharacter(context, characterId)
  if (current.error) return { error: current.error }
  if (!current.row) return { not_found: true }
  if (current.row.character_type !== "npc") return { error: "world_npc_required" }

  const patch: JsonRecord = { ...args }
  delete patch.character_id

  const { data, error } = await canonicalManagerRpc(
    context,
    "update_world_npc_v1",
    {
      p_npc_character_id: characterId,
      p_patch: patch,
    },
    {
      npc_character_id: characterId,
      patch,
    },
  )

  if (error) return { error: error.message }
  return {
    npc: data,
    canonical_state_changed: true,
  }
}

async function upsertFaction(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const factionId = args.faction_id ? uuid(args.faction_id) : ""
  if (args.faction_id && !factionId) return { error: "faction_id_invalid" }
  const name = text(args.name, 160)
  if (!factionId && !name) return { error: "faction_name_required" }

  const payload: JsonRecord = { ...args }
  if (factionId) payload.faction_id = factionId
  if (name) payload.name = name

  const { data, error } = await canonicalManagerRpc(
    context,
    "upsert_faction_v1",
    {
      p_campaign_id: context.campaignId,
      p_input: payload,
    },
    {
      campaign_id: context.campaignId,
      input: payload,
    },
  )

  if (error) return { error: error.message }
  return { faction: data, canonical_state_changed: true }
}

async function setFactionMembership(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const factionId = uuid(args.faction_id)
  if (!characterId) return { error: "character_id_required" }
  if (!factionId) return { error: "faction_id_required" }

  const payload: JsonRecord = { ...args }
  delete payload.character_id
  delete payload.faction_id

  const { data, error } = await canonicalManagerRpc(
    context,
    "set_faction_membership_v1",
    {
      p_character_id: characterId,
      p_faction_id: factionId,
      p_input: payload,
    },
    {
      character_id: characterId,
      faction_id: factionId,
      input: payload,
    },
  )

  if (error) return { error: error.message }
  return { membership: data, canonical_state_changed: true }
}

async function setCharacterFactionReputation(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const factionId = uuid(args.faction_id)
  if (!characterId) return { error: "character_id_required" }
  if (!factionId) return { error: "faction_id_required" }

  const payload: JsonRecord = { ...args }
  delete payload.character_id
  delete payload.faction_id

  const { data, error } = await canonicalManagerRpc(
    context,
    "set_character_faction_reputation_v1",
    {
      p_character_id: characterId,
      p_faction_id: factionId,
      p_input: payload,
    },
    {
      character_id: characterId,
      faction_id: factionId,
      input: payload,
    },
  )

  if (error) return { error: error.message }
  return { reputation: data, canonical_state_changed: true }
}

async function moveCharacterWorld(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const locationId = uuid(args.location_id)
  if (!characterId) return { error: "character_id_required" }
  if (!locationId) return { error: "location_id_required" }

  const campaignDay =
    args.campaign_day === undefined ? null : Number(args.campaign_day)
  const dayPeriod =
    args.day_period === undefined ? null : text(args.day_period, 40)
  const { data, error } = await canonicalManagerRpc(
    context,
    "move_character_world_v1",
    {
      p_character_id: characterId,
      p_location_id: locationId,
      p_campaign_day: campaignDay,
      p_day_period: dayPeriod,
    },
    {
      character_id: characterId,
      location_id: locationId,
      campaign_day: campaignDay,
      day_period: dayPeriod,
    },
  )

  if (error) return { error: error.message }
  return { movement: data, canonical_state_changed: true }
}

async function setWorldDiscovery(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const characterId = uuid(args.character_id)
  const entityId = uuid(args.entity_id)
  const entityType =
    args.entity_type === "location" ||
    args.entity_type === "npc" ||
    args.entity_type === "link"
      ? args.entity_type
      : ""

  if (!characterId) return { error: "character_id_required" }
  if (!entityId) return { error: "entity_id_required" }
  if (!entityType) return { error: "entity_type_invalid" }

  const discovered = args.discovered !== false
  const { data, error } = await canonicalManagerRpc(
    context,
    "manage_world_discovery_v1",
    {
      p_character_id: characterId,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_discovered: discovered,
      p_source: "ai_gm",
    },
    {
      character_id: characterId,
      entity_type: entityType,
      entity_id: entityId,
      discovered,
      source: "ai_gm",
    },
  )

  if (error) return { error: error.message }
  return { discovery: data, canonical_state_changed: true }
}

async function setNpcHabitat(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const npcCharacterId = uuid(args.npc_character_id)
  const locationId = uuid(args.location_id)
  if (!npcCharacterId) return { error: "npc_character_id_required" }
  if (!locationId) return { error: "location_id_required" }

  const attached = args.attached !== false
  const { error } = await canonicalManagerRpc(
    context,
    "set_npc_zone_habitat",
    {
      p_npc_character_id: npcCharacterId,
      p_location_id: locationId,
      p_attached: attached,
    },
    {
      npc_character_id: npcCharacterId,
      location_id: locationId,
      attached,
    },
  )

  if (error) return { error: error.message }
  return {
    npc_character_id: npcCharacterId,
    location_id: locationId,
    attached,
    canonical_state_changed: true,
  }
}

async function upsertLocationTransition(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const sourceLocationId = uuid(args.source_location_id)
  const targetLocationId = uuid(args.target_location_id)
  if (!sourceLocationId) return { error: "source_location_id_required" }
  if (!targetLocationId) return { error: "target_location_id_required" }

  const input: JsonRecord = {}
  if (args.link_id !== undefined) {
    const linkId = uuid(args.link_id)
    if (!linkId) return { error: "link_id_invalid" }
    input.link_id = linkId
  }
  if (args.label !== undefined) input.label = text(args.label, 240)
  if (
    args.visibility_mode === "always" ||
    args.visibility_mode === "discover" ||
    args.visibility_mode === "private"
  ) {
    input.visibility_mode = args.visibility_mode
  }
  if (Number.isInteger(Number(args.sort_order))) {
    input.sort_order = Number(args.sort_order)
  }
  if (
    Number.isInteger(Number(args.travel_minutes)) &&
    Number(args.travel_minutes) >= 1 &&
    Number(args.travel_minutes) <= 10080
  ) {
    input.travel_minutes = Number(args.travel_minutes)
  }

  const { data, error } = await canonicalManagerRpc(
    context,
    "upsert_location_transition_v1",
    {
      p_source_location_id: sourceLocationId,
      p_target_location_id: targetLocationId,
      p_input: input,
    },
    {
      source_location_id: sourceLocationId,
      target_location_id: targetLocationId,
      input,
    },
  )

  if (error) return { error: error.message }
  return { transition: data, canonical_state_changed: true }
}

async function deleteLocationTransition(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const linkId = uuid(args.link_id)
  if (!linkId) return { error: "link_id_required" }

  const { data, error } = await canonicalManagerRpc(
    context,
    "delete_location_transition_v1",
    { p_link_id: linkId },
    { link_id: linkId },
  )

  if (error) return { error: error.message }
  return { transition: data, canonical_state_changed: true }
}

async function upsertLocationSecret(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const locationId = uuid(args.location_id)
  if (!locationId) return { error: "location_id_required" }

  const input: JsonRecord = { ...args }
  delete input.location_id

  if (args.secret_id !== undefined) {
    const secretId = uuid(args.secret_id)
    if (!secretId) return { error: "secret_id_invalid" }
    input.secret_id = secretId
  }

  if (args.secret_key !== undefined) {
    input.secret_key = text(args.secret_key, 160)
  }
  if (args.title !== undefined) input.title = text(args.title, 240)
  if (args.secret_text !== undefined) input.secret_text = text(args.secret_text, 24000)
  if (args.ai_directive !== undefined) input.ai_directive = text(args.ai_directive, 12000)
  if (args.reveal_text !== undefined) input.reveal_text = text(args.reveal_text, 12000)
  if (args.resolution_note !== undefined) {
    input.resolution_note = text(args.resolution_note, 12000)
  }

  const { data, error } = await canonicalManagerRpc(
    context,
    "upsert_location_secret_v1",
    {
      p_location_id: locationId,
      p_input: input,
    },
    {
      location_id: locationId,
      input,
    },
  )

  if (error) return { error: error.message }
  return { secret: data, canonical_state_changed: true }
}

async function setLocationSecretState(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const secretId = uuid(args.secret_id)
  if (!secretId) return { error: "secret_id_required" }
  const status =
    args.status === "active" ||
    args.status === "resolved" ||
    args.status === "retired"
      ? args.status
      : ""
  if (!status) return { error: "location_secret_status_invalid" }

  const resolutionNote = text(args.resolution_note, 12000)
  const { data, error } = await canonicalManagerRpc(
    context,
    "set_location_secret_state_v1",
    {
      p_secret_id: secretId,
      p_status: status,
      p_resolution_note: resolutionNote,
    },
    {
      secret_id: secretId,
      status,
      resolution_note: resolutionNote,
    },
  )

  if (error) return { error: error.message }
  return { secret: data, canonical_state_changed: true }
}

export async function prepareLocationCascadeInput(
  admin: SupabaseClient,
  campaignId: string,
  args: JsonRecord,
) {
  if (
    Array.isArray(args.children) &&
    args.children.length > cascadeChildLimit(String(args.archetype || "site"))
  ) {
    return { error: "cascade_children_exceed_compact_limit" }
  }

  const input: JsonRecord = {}
  for (const key of [
    "location_id",
    "parent_location_id",
    "source_location_id",
    "move_character_id",
    "campaign_day",
    "day_period",
    "name",
    "summary",
    "description",
    "visibility_mode",
    "background_simulation_scope",
    "archetype",
    "scale",
    "structure_roles",
    "coverage_manifest",
    "children",
  ]) {
    if (Object.prototype.hasOwnProperty.call(args, key)) input[key] = args[key]
  }

  // A route is a transition, not a hierarchy edge. If the materializer has
  // mistaken the departure point for the parent of an equal/larger place,
  // attach the destination to the nearest containing ancestor instead.
  const proposedParentId = uuid(input.parent_location_id)
  if (proposedParentId && !input.location_id) {
    if (typeof input.scale === "string") {
      let cursor: string | null = proposedParentId
      const visited = new Set<string>()
      while (cursor && !visited.has(cursor)) {
        visited.add(cursor)
        const { data: ancestor, error } = await admin
          .from("locations")
          .select("id,parent_location_id,scale")
          .eq("campaign_id", campaignId)
          .eq("id", cursor)
          .eq("lifecycle_state", "active")
          .maybeSingle()
        if (error) return { error: error.message }
        if (!ancestor) return { error: "cascade_parent_location_unavailable" }
        if (canContainLocation(ancestor.scale, input.scale)) break
        cursor = ancestor.parent_location_id
      }
      input.parent_location_id = cursor
    }
  }

  return { input }
}

async function materializeLocationCascade(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  if (!context.internalService) {
    return { error: "location_cascade_internal_service_only" }
  }
  const prepared = await prepareLocationCascadeInput(
    context.admin, context.campaignId, args,
  )
  if (prepared.error || !prepared.input) return { error: prepared.error }

  const { data, error } = await context.admin.rpc(
    "ai_gm_materialize_location_cascade_v1",
    {
      p_campaign_id: context.campaignId,
      p_actor_user_id: context.userId,
      p_input: prepared.input,
    },
  )

  if (error) return { error: error.message }
  return {
    cascade: data,
    location: record(data).location,
    movement: record(data).movement,
    canonical_state_changed: record(data).canonical_state_changed === true,
  }
}

async function createLocation(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const name = text(args.name, 160)
  if (!name) return { error: "location_name_required" }
  const parentLocationId = args.parent_location_id ? uuid(args.parent_location_id) : null
  if (args.parent_location_id && !parentLocationId) return { error: "parent_location_id_invalid" }
  const visibility =
    args.visibility_mode === "always" || args.visibility_mode === "private"
      ? args.visibility_mode
      : "discover"
  const backgroundSimulationScope =
    args.background_simulation_scope === "entity" ||
      args.background_simulation_scope === "detail"
      ? args.background_simulation_scope
      : "disabled"
  const archetype = locationEnum(args.archetype, LOCATION_ARCHETYPES, "site")
  const scale = locationEnum(args.scale, LOCATION_SCALES, "site")
  const structureRoles = locationRoles(args.structure_roles)
  const structureState = locationEnum(
    args.structure_state,
    LOCATION_STRUCTURE_STATES,
    scale === "room" || scale === "detail" ? "materialized" : "stub",
  )
  const coverageManifest = record(args.coverage_manifest)

  if (parentLocationId) {
    const { data: parent, error: parentError } = await managerClient(context)
      .from("locations")
      .select("id")
      .eq("campaign_id", context.campaignId)
      .eq("id", parentLocationId)
      .maybeSingle()
    if (parentError) return { error: parentError.message }
    if (!parent) return { error: "parent_location_not_found" }
  }

  const { data, error } = await managerClient(context)
    .from("locations")
    .insert({
      campaign_id: context.campaignId,
      parent_location_id: parentLocationId,
      name,
      summary: text(args.summary, 2000),
      description: text(args.description, 12000),
      image_url: null,
      visibility_mode: visibility,
      background_simulation_scope: backgroundSimulationScope,
      lifecycle_state: "active",
      created_by: context.userId,
      archetype,
      scale,
      structure_roles: structureRoles,
      structure_state: structureState,
      coverage_manifest: coverageManifest,
      structured_at:
        structureState === "materialized" || structureState === "detailed"
          ? new Date().toISOString()
          : null,
    })
    .select("id,parent_location_id,name,summary,description,visibility_mode,background_simulation_scope,lifecycle_state,archetype,scale,structure_roles,structure_state,coverage_manifest,structured_at")
    .single()

  if (error) return { error: error.message }
  return { location: data, canonical_state_changed: true }
}

async function updateLocation(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const locationId = uuid(args.location_id)
  if (!locationId) return { error: "location_id_required" }

  const { data: current, error: readError } = await managerClient(context)
    .from("locations")
    .select("id,parent_location_id,name,summary,description,visibility_mode,background_simulation_scope,lifecycle_state,archetype,scale,structure_roles,structure_state,coverage_manifest,structured_at")
    .eq("campaign_id", context.campaignId)
    .eq("id", locationId)
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!current) return { not_found: true }

  let parentLocationId = current.parent_location_id
  if (Object.prototype.hasOwnProperty.call(args, "parent_location_id")) {
    if (args.parent_location_id === null) parentLocationId = null
    else {
      const parsed = uuid(args.parent_location_id)
      if (!parsed || parsed === locationId) return { error: "parent_location_id_invalid" }
      const { data: parent, error: parentError } = await managerClient(context)
        .from("locations")
        .select("id")
        .eq("campaign_id", context.campaignId)
        .eq("id", parsed)
        .maybeSingle()
      if (parentError) return { error: parentError.message }
      if (!parent) return { error: "parent_location_not_found" }
      parentLocationId = parsed
    }
  }

  const visibility =
    args.visibility_mode === "always" ||
      args.visibility_mode === "discover" ||
      args.visibility_mode === "private"
      ? args.visibility_mode
      : current.visibility_mode

  const backgroundSimulationScope =
    args.background_simulation_scope === "entity" ||
      args.background_simulation_scope === "detail" ||
      args.background_simulation_scope === "disabled"
      ? args.background_simulation_scope
      : current.background_simulation_scope
  const archetype = locationEnum(
    args.archetype,
    LOCATION_ARCHETYPES,
    String(current.archetype || "site"),
  )
  const scale = locationEnum(
    args.scale,
    LOCATION_SCALES,
    String(current.scale || "site"),
  )
  const structureRoles =
    args.structure_roles === undefined
      ? locationRoles(current.structure_roles)
      : locationRoles(args.structure_roles)
  const structureState = locationEnum(
    args.structure_state,
    LOCATION_STRUCTURE_STATES,
    String(current.structure_state || "stub"),
  )
  const coverageManifest =
    args.coverage_manifest === undefined
      ? record(current.coverage_manifest)
      : record(args.coverage_manifest)

  const { data, error } = await managerClient(context)
    .from("locations")
    .update({
      parent_location_id: parentLocationId,
      name: args.name === undefined ? current.name : text(args.name, 160) || current.name,
      summary: args.summary === undefined ? current.summary : text(args.summary, 2000),
      description: args.description === undefined ? current.description : text(args.description, 12000),
      visibility_mode: visibility,
      background_simulation_scope: backgroundSimulationScope,
      archetype,
      scale,
      structure_roles: structureRoles,
      structure_state: structureState,
      coverage_manifest: coverageManifest,
      structured_at:
        structureState === "materialized" || structureState === "detailed"
          ? current.structured_at || new Date().toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", context.campaignId)
    .eq("id", locationId)
    .select("id,parent_location_id,name,summary,description,visibility_mode,background_simulation_scope,lifecycle_state,archetype,scale,structure_roles,structure_state,coverage_manifest,structured_at")
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return { location: data, canonical_state_changed: true }
}

async function batchLocationChanges(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const operations = Array.isArray(args.operations)
    ? args.operations.slice(0, 24)
    : []
  if (!operations.length) return { error: "location_operations_required" }

  const declaredRefs = new Set<string>()
  for (let index = 0; index < operations.length; index += 1) {
    const raw = operations[index]
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { error: "location_operation_invalid", failed_index: index }
    }
    const operation = raw as JsonRecord
    const op = operation.op === "create" || operation.op === "update"
      ? operation.op
      : ""
    if (!op) return { error: "location_operation_kind_invalid", failed_index: index }

    const ref = text(operation.ref, 80)
    if (ref) {
      if (declaredRefs.has(ref)) {
        return { error: "location_operation_ref_duplicate", failed_index: index, ref }
      }
      declaredRefs.add(ref)
    }

    if (op === "create" && !text(operation.name, 160)) {
      return { error: "location_name_required", failed_index: index }
    }

    if (
      op === "update" &&
      !uuid(operation.location_id) &&
      !text(operation.location_ref, 80)
    ) {
      return { error: "location_id_required", failed_index: index }
    }
  }

  const refs = new Map<string, string>()
  const results: JsonRecord[] = []

  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index] as JsonRecord
    const op = operation.op as "create" | "update"
    const ref = text(operation.ref, 80)
    const callArgs: JsonRecord = {}

    for (const key of [
      "location_id",
      "parent_location_id",
      "name",
      "summary",
      "description",
      "visibility_mode",
      "background_simulation_scope",
      "archetype",
      "scale",
      "structure_roles",
      "structure_state",
      "coverage_manifest",
    ]) {
      if (Object.prototype.hasOwnProperty.call(operation, key)) {
        callArgs[key] = operation[key]
      }
    }

    const parentRef = text(operation.parent_ref, 80)
    if (parentRef) {
      const parentId = refs.get(parentRef)
      if (!parentId) {
        return {
          error: "location_parent_ref_unresolved",
          failed_index: index,
          parent_ref: parentRef,
          applied: results,
        }
      }
      callArgs.parent_location_id = parentId
    }

    if (op === "update") {
      const locationRef = text(operation.location_ref, 80)
      if (locationRef) {
        const locationId = refs.get(locationRef)
        if (!locationId) {
          return {
            error: "location_ref_unresolved",
            failed_index: index,
            location_ref: locationRef,
            applied: results,
          }
        }
        callArgs.location_id = locationId
      }
    }

    const result = op === "create"
      ? await createLocation(context, callArgs)
      : await updateLocation(context, callArgs)

    const resultRecord =
      result && typeof result === "object" && !Array.isArray(result)
        ? result as JsonRecord
        : { error: "location_operation_invalid_result" }

    if (typeof resultRecord.error === "string" || resultRecord.not_found === true) {
      return {
        error:
          typeof resultRecord.error === "string"
            ? resultRecord.error
            : "location_not_found",
        failed_index: index,
        applied: results,
        partial_applied: results.length > 0,
      }
    }

    const location =
      resultRecord.location &&
      typeof resultRecord.location === "object" &&
      !Array.isArray(resultRecord.location)
        ? resultRecord.location as JsonRecord
        : null
    const locationId =
      location && typeof location.id === "string" ? location.id : ""

    if (ref && locationId) refs.set(ref, locationId)
    results.push({
      index,
      op,
      ref: ref || null,
      location: location || null,
    })
  }

  return {
    canonical_state_changed: true,
    applied_count: results.length,
    applied: results,
    refs: Object.fromEntries(refs),
  }
}

async function deleteLocation(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const locationId = uuid(args.location_id)
  if (!locationId) return { error: "location_id_required" }

  const { data: current, error: readError } = await managerClient(context)
    .from("locations")
    .select("id,name")
    .eq("campaign_id", context.campaignId)
    .eq("id", locationId)
    .maybeSingle()

  if (readError) return { error: readError.message }
  if (!current) return { not_found: true }

  const { error } = await managerClient(context)
    .from("locations")
    .delete()
    .eq("campaign_id", context.campaignId)
    .eq("id", locationId)

  if (error) return { error: error.message }
  return {
    deleted: true,
    location_id: locationId,
    location_name: current.name,
    canonical_state_changed: true,
  }
}

async function setLocationArchived(
  context: VossManagerToolContext,
  args: JsonRecord,
) {
  const locationId = uuid(args.location_id)
  if (!locationId) return { error: "location_id_required" }
  const archived = args.archived === true
  const { data, error } = await managerClient(context)
    .from("locations")
    .update({
      lifecycle_state: archived ? "archived" : "active",
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", context.campaignId)
    .eq("id", locationId)
    .select("id,name,lifecycle_state,archived_at")
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { not_found: true }
  return { location: data, canonical_state_changed: true }
}

export async function executeVossManagerTool(
  context: VossManagerToolContext,
  name: string,
  args: JsonRecord,
) {
  if (!canManage(context)) return { error: "gm_authority_required" }

  try {
    if (name === "create_workshop_character") return await createWorkshopCharacter(context, args)
    if (name === "update_campaign_character") return await updateCampaignCharacter(context, args)
    if (name === "set_character_spell") return await setCharacterSpell(context, args)
    if (name === "set_character_template_assignment") return await setCharacterTemplateAssignment(context, args)
    if (name === "commit_character_template_choice") return await commitCharacterTemplateChoice(context, args)
    if (name === "remove_character_template_assignment") return await removeCharacterTemplateAssignment(context, args)
    if (name === "upsert_character_feature") return await upsertCharacterFeature(context, args)
    if (name === "delete_character_feature") return await deleteCharacterFeature(context, args)
    if (name === "set_character_resource_state") return await setCharacterResourceState(context, args)
    if (name === "create_character_inventory_item") return await createCharacterInventoryItem(context, args)
    if (name === "update_character_inventory_item") return await updateCharacterInventoryItem(context, args)
    if (name === "remove_character_inventory_item") return await removeCharacterInventoryItem(context, args)
    if (name === "set_character_inventory_equipped") return await setCharacterInventoryEquipped(context, args)
    if (name === "set_character_inventory_quick_access") return await setCharacterInventoryQuickAccess(context, args)
    if (name === "create_world_npc") return await createWorldNpc(context, args)
    if (name === "update_world_npc") return await updateWorldNpc(context, args)
    if (name === "upsert_faction") return await upsertFaction(context, args)
    if (name === "set_faction_membership") return await setFactionMembership(context, args)
    if (name === "set_character_faction_reputation") return await setCharacterFactionReputation(context, args)
    if (name === "move_character_world") return await moveCharacterWorld(context, args)
    if (name === "set_world_discovery") return await setWorldDiscovery(context, args)
    if (name === "set_npc_habitat") return await setNpcHabitat(context, args)
    if (name === "upsert_location_transition") return await upsertLocationTransition(context, args)
    if (name === "delete_location_transition") return await deleteLocationTransition(context, args)
    if (name === "upsert_location_secret") return await upsertLocationSecret(context, args)
    if (name === "set_location_secret_state") return await setLocationSecretState(context, args)
    if (name === "set_character_life_state") return await setCharacterLifeState(context, args)
    if (name === "set_character_publication") return await setCharacterPublication(context, args)
    if (name === "delete_campaign_character") return await deleteCampaignCharacter(context, args)
    if (name === "materialize_location_cascade") {
      return await materializeLocationCascade(context, args)
    }
    if (name === "create_location") return await createLocation(context, args)
    if (name === "update_location") return await updateLocation(context, args)
    if (name === "batch_location_changes") return await batchLocationChanges(context, args)
    if (name === "set_location_archived") return await setLocationArchived(context, args)
    if (name === "delete_location") return await deleteLocation(context, args)
    return { error: "unknown_manager_tool" }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
