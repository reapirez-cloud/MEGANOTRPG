/**
 * AI World Evolution implementation contract.
 *
 * This file is intentionally executable/machine-readable architecture, not a prose roadmap.
 * Future agents and maintainers must use this contract to decide whether a stage is actually
 * implemented. Similar existing infrastructure is NOT completion evidence unless the stage's
 * required artifacts and acceptance conditions are present.
 *
 * Human-readable master roadmap:
 *   docs/AI_WORLD_EVOLUTION_MASTER_ROADMAP.md
 */

export const AI_WORLD_EVOLUTION_CONTRACT_VERSION = 1 as const

export type AiWorldEvolutionStageStatus =
  | "planned"
  | "partial"
  | "implemented"
  | "certified"

export type AiWorldEvolutionStage = {
  id: number
  key: string
  title: string
  purpose: string
  status: AiWorldEvolutionStageStatus
  /** Existing pieces that help but do NOT complete the stage. */
  existingFoundation: readonly string[]
  /** Explicit shortcuts/fuzzy matches that must never be accepted as completion. */
  notSatisfiedBy: readonly string[]
  /** Concrete runtime/schema/code artifacts that must exist before status can become implemented. */
  requiredArtifacts: readonly string[]
  /** Observable behavior that must be true before status can become implemented/certified. */
  acceptance: readonly string[]
  /** Tests/checks required before status can become certified. */
  certification: readonly string[]
}

export const AI_WORLD_EVOLUTION_STAGES = [
  {
    id: 1,
    key: "world-resolver",
    title: "World Resolver foundation",
    purpose:
      "Own all AI-world narrative/background randomness server-side with persistent idempotent decision keys, audit provenance and no rerolls.",
    status: "certified",
    existingFoundation: [
      "src/roll-engine/dice.ts provides unbiased dN rolling",
      "ENGINE_ARCHITECTURE.tobik owns gameplay randomness",
      "AI GM player/NPC roll RPCs already resolve gameplay dice server-side",
    ],
    notSatisfiedBy: [
      "Existing Roll Engine, Tobik, d20/player-roll RPCs, or free-dice UI by themselves",
      "A model generating a random-looking number in text or JSON",
      "A non-persistent helper that cannot replay a decision_key",
    ],
    requiredArtifacts: [
      "Persistent world-decision receipt storage keyed by campaign_id + decision_key",
      "Server operation resolve_world_random_v1 (or explicitly renamed equivalent)",
      "Validated outcome-band support for AI-requested narrative decisions",
      "AI-world campaign guard",
      "Audit link to campaign day/run/entity when applicable",
    ],
    acceptance: [
      "Same decision_key always returns the original stored roll",
      "No reroll operation exists for the same decision",
      "Model never chooses the numeric result",
      "Daily d100 and requested narrative decisions can use the same authoritative boundary",
    ],
    certification: [
      "Idempotent replay test",
      "Bounds/unbiased roller test",
      "Invalid/overlapping band rejection test",
      "Human-run campaign rejection test",
    ],
  },
  {
    id: 2,
    key: "background-schema",
    title: "Background simulation schema",
    purpose:
      "Persist daily runs, rolls, immutable background events and versioned compact state without prematurely mutating present-day canon.",
    status: "certified",
    existingFoundation: [
      "campaign_events",
      "campaign_memory_facts",
      "campaign_memory_summaries",
      "agent_jobs",
    ],
    notSatisfiedBy: [
      "campaign_events alone",
      "campaign_memory_facts alone",
      "45-message maintenance jobs",
      "A prose summary with no per-day idempotent run record",
    ],
    requiredArtifacts: [
      "Unique daily-run storage by campaign_id + campaign_day",
      "Background roll receipts",
      "Immutable background event ledger with effective_game_day",
      "Versioned compact entity snapshots by through_game_day",
      "AI-world-only write guards",
    ],
    acceptance: [
      "One campaign day cannot run background simulation twice",
      "Historical events and compact current state are distinct",
      "Multiple temporal snapshot versions can coexist",
    ],
    certification: [
      "Duplicate daily run test",
      "Snapshot version selection test",
      "Human-run campaign isolation test",
    ],
  },
  {
    id: 3,
    key: "entity-classification",
    title: "Generation-time simulation-unit classification",
    purpose:
      "Classify AI-generated persistent world content as whole entity, internal detail or disabled at creation time.",
    status: "certified",
    existingFoundation: [
      "World materializer prompt already avoids unnamed permanent NPC extras",
      "locations already support hierarchy and location_sections",
      "Background design documents define entity/detail/disabled",
    ],
    notSatisfiedBy: [
      "parent_location_id depth",
      "Assuming every locations row is independently simulated",
      "Prompt-only convention with no persisted classification",
      "Narrative importance scoring",
    ],
    requiredArtifacts: [
      "Persisted background_simulation_scope for AI-world locations",
      "Persisted simulation eligibility/classification for persistent NPCs",
      "World materializer tool/schema support for deliberate classification",
      "Safe defaults that do not accidentally simulate legacy/technical content",
    ],
    acceptance: [
      "Tavern may be entity even when nested under city",
      "Tavern room/toilet/corridor can be detail and never independently selected",
      "Named persistent goblin can be entity regardless of initial importance",
      "Unnamed scene extra is not materialized as a permanent NPC",
    ],
    certification: [
      "Nested whole-location test",
      "Interior-detail exclusion test",
      "Named minor NPC eligibility test",
      "Unnamed persistent-card regression test",
    ],
  },
  {
    id: 4,
    key: "shared-bestiary-compiler",
    title: "Shared Bestiary Runtime Compiler",
    purpose:
      "Provide one authoritative bestiary-to-runtime mechanical compiler for both canonical NPCs and ephemeral scene actors.",
    status: "certified",
    existingFoundation: [
      "Stage 6 NPC runtime currently compiles bestiary_catalog into character mechanics",
      "bestiary_catalog already exposes D&D stat blocks and mechanics",
    ],
    notSatisfiedBy: [
      "Duplicating Stage 6 SQL logic into a second scene-actor implementation",
      "A model copying numbers from bestiary prose",
      "Using bestiary rows directly without a stable runtime snapshot/contract",
    ],
    requiredArtifacts: [
      "Reusable compiler boundary callable by canonical NPC runtime and scene-actor runtime",
      "Stable compiled representation for actions, saves, reactions, resources and recharge",
      "Canonical NPC Stage 6 migrated to the shared compiler without behavior loss",
    ],
    acceptance: [
      "Same bestiary source compiles to equivalent mechanics for permanent and ephemeral actors",
      "AI never supplies attack bonus, damage dice, DC or resource costs",
    ],
    certification: [
      "Stage 6 regression equivalence tests",
      "Shared compiler deterministic fixture tests",
    ],
  },
  {
    id: 5,
    key: "ephemeral-scene-actors",
    title: "Ephemeral bestiary-backed scene actors",
    purpose:
      "Represent unnamed mechanically active creatures as lightweight per-scene instances instead of permanent characters.",
    status: "certified",
    existingFoundation: [
      "bestiary_catalog",
      "chat rooms and location/time state",
      "Canonical NPC runtime",
    ],
    notSatisfiedBy: [
      "Creating Бандит 1 / Бандит 2 as characters",
      "Creating temporary characters and deleting them later",
      "One shared HP value for every actor using the same bestiary slug",
    ],
    requiredArtifacts: [
      "ai_scene_actors (or explicitly equivalent) runtime storage",
      "Per-instance HP/life/resource/effect state",
      "source_bestiary_slug provenance",
      "Room/location/game-time attachment",
      "Independent actor UUIDs without permanent character identity",
      "Spawn/list/archive server boundaries",
    ],
    acceptance: [
      "Three bandits can exist as three independent actors from one bestiary entry",
      "No characters rows are created for anonymous actors",
      "Each actor has independent mutable state",
    ],
    certification: [
      "Multi-instance spawn test",
      "No-character-row test",
      "Independent HP/resource test",
    ],
  },
  {
    id: 6,
    key: "scene-actor-combat",
    title: "Scene actor combat/runtime execution",
    purpose:
      "Let ephemeral actors use the same authoritative combat mechanics as canonical NPCs.",
    status: "certified",
    existingFoundation: [
      "execute_ai_gm_npc_action_turn_v1",
      "execute_ai_gm_npc_roll_v2",
      "Stage 5 player hard-wait save pipeline",
    ],
    notSatisfiedBy: [
      "Narrating an anonymous attack without server execution",
      "Giving every anonymous actor a canonical NPC card to reuse existing RPCs",
    ],
    requiredArtifacts: [
      "Actor-reference abstraction supporting canonical NPC or scene_actor",
      "Scene-actor action/roll execution",
      "Per-actor resource consumption and state mutation",
      "Death/flee/remove handling",
      "Player save hard-wait integration",
    ],
    acceptance: [
      "Anonymous actor can attack and trigger saves",
      "Server owns all numeric mechanics and dice",
      "One actor death/resource use never mutates a sibling actor",
    ],
    certification: [
      "Independent combat state tests",
      "Forged model mechanic rejection test",
      "Player save wait/resume regression test",
    ],
  },
  {
    id: 7,
    key: "ai-gm-scene-actor-integration",
    title: "Primary AI GM scene-actor integration",
    purpose:
      "Make anonymous bestiary-backed actors the normal AI GM path for unnamed scene extras.",
    status: "certified",
    existingFoundation: [
      "World materializer prompt blocks persistent unnamed extras",
      "Primary AI GM already chooses canonical NPC actions",
    ],
    notSatisfiedBy: [
      "Prompt-only instruction with no spawn/action tools",
      "Simply refusing to create unnamed combatants",
    ],
    requiredArtifacts: [
      "AI-world-only spawn_scene_actor tool",
      "Compact active-scene actor context",
      "Legal scene-actor action execution tool/boundary",
      "Narrow validated flee/remove/state operations",
      "GM contract selecting ephemeral path for unnamed actors",
    ],
    acceptance: [
      "Трое бандитов creates scene actors, not three characters",
      "World materializer handles persistent canon while scene runtime handles disposable encounter actors",
    ],
    certification: [
      "AI GM tool-selection integration tests",
      "No numbered NPC card regression test",
    ],
  },
  {
    id: 8,
    key: "scene-actor-promotion",
    title: "Promotion of revealed actors into persistent NPCs",
    purpose:
      "Convert an existing ephemeral actor into exactly one canonical NPC when a real personal identity becomes known, preserving resolved state.",
    status: "certified",
    existingFoundation: [
      "create_world_npc",
      "NPC runtime build pipeline",
      "character discovery and location state",
    ],
    notSatisfiedBy: [
      "Creating a fresh NPC with the same name and discarding the actor",
      "Resetting HP/resources on promotion",
      "Treating temporary ordinal such as Бандит 2 as a real name",
    ],
    requiredArtifacts: [
      "Transactional promote_scene_actor_to_npc operation",
      "Idempotent actor -> promoted_character_id mapping",
      "State transfer for HP/resources/persistent conditions/location/time",
      "Same bestiary provenance preserved",
      "Discovery update for characters who learned the name",
      "Stale actor-reference redirect/resolution",
    ],
    acceptance: [
      "Гоблин at 3/7 HP promoted to Ург remains 3/7 HP",
      "Concurrent promotion attempts return one canonical NPC",
      "Promoted identity is persistent and the ephemeral instance stops acting independently",
    ],
    certification: [
      "State-preserving promotion test",
      "Concurrent/idempotent promotion test",
      "No duplicate NPC test",
    ],
  },
  {
    id: 9,
    key: "daily-candidate-resolver",
    title: "Daily 30% candidate Resolver",
    purpose:
      "Build whole-entity candidate pools, select entities server-side and pre-roll all daily d100 values before Flash is invoked.",
    status: "certified",
    existingFoundation: [
      "campaign_day/day_period state",
      "location-scoped dawn",
      "NPC/location discovery state",
    ],
    notSatisfiedBy: [
      "Using d100 value as an entity index",
      "Letting Flash choose which NPCs/locations evolve",
      "Forcing exactly round(count * 0.30) entities",
      "Selecting location details such as rooms/toilets",
    ],
    requiredArtifacts: [
      "Unique day-run reservation",
      "Eligible persistent NPC pool",
      "Eligible whole-location pool",
      "Independent bounded selection probability per entity, default 30%",
      "Persisted selected/rejected counts and selected IDs",
      "World d100 plus one d100 per selected entity persisted before AI call",
    ],
    acceptance: [
      "Pool may contain far more than 100 entities",
      "Every eligible entity has an independent selection chance",
      "Flash receives selected entities only",
    ],
    certification: [
      "200+ entity selection test",
      "No entity-index/d100 coupling test",
      "Whole-location filter test",
      "Concurrent day reservation test",
    ],
  },
  {
    id: 10,
    key: "flash-background-worker",
    title: "DeepSeek V4.1 Flash background worker",
    purpose:
      "Interpret Resolver-selected world/NPC/location d100 results into compact coherent developments without owning randomness or candidate selection.",
    status: "certified",
    existingFoundation: [
      "deepseek-v4.1-flash configured as cheap fixed worker elsewhere",
      "World materializer already uses Flash for canonical creation",
    ],
    notSatisfiedBy: [
      "Existing world materializer",
      "Existing 45-message maintenance worker",
      "Calling Flash separately for every entity",
      "Sending full campaign history and asking Flash what changed",
    ],
    requiredArtifacts: [
      "Dedicated background daily-run worker",
      "One normal batched model call per game day",
      "Strict structured output validation",
      "Input limited to world state + selected entities + supplied rolls + narrow canon",
      "No access to rejected candidate pool",
    ],
    acceptance: [
      "Flash obeys supplied severity/direction",
      "Flash may legitimately return no lasting event for neutral results",
      "Existing threads are preferred when logically relevant",
    ],
    certification: [
      "Supplied-roll obedience tests",
      "Rejected-candidate invisibility test",
      "Batch-size/context-budget test",
    ],
  },
  {
    id: 11,
    key: "resolver-narrative-branching",
    title: "Resolver-driven AI narrative branching",
    purpose:
      "Prevent Flash and the primary GM from silently choosing their preferred outcome when multiple plausible unresolved developments exist.",
    status: "certified",
    existingFoundation: [
      "Server-authoritative gameplay roll concept",
    ],
    notSatisfiedBy: [
      "AI temperature/randomness",
      "AI choosing an outcome then asking for a cosmetic roll",
      "Reusing player skill-check APIs for world decisions",
    ],
    requiredArtifacts: [
      "resolve_random_decision AI tool backed by World Resolver",
      "Question + outcome bands committed before result is returned",
      "Decision-key persistence and no-reroll semantics",
      "Flash integration",
      "Primary AI GM integration after Flash path is stable",
    ],
    acceptance: [
      "Model cannot see the roll before defining outcome mapping",
      "Matched outcome is determined server-side",
      "Deterministic/already-resolved rules do not use narrative Resolver",
    ],
    certification: [
      "Band-before-roll protocol test",
      "No-reroll test",
      "Primary GM/Flash tool integration tests",
    ],
  },
  {
    id: 12,
    key: "compact-background-state",
    title: "Compact versioned background state merger",
    purpose:
      "Merge old current state and new event into a concise replacement snapshot while preserving immutable history separately.",
    status: "certified",
    existingFoundation: [
      "campaign_memory_facts supports superseding facts",
      "campaign_memory_summaries",
      "45-message maintenance summaries",
    ],
    notSatisfiedBy: [
      "Appending one campaign_memory_fact per entity per day",
      "Leaving all old facts active",
      "Using 45-message maintenance as background compaction",
    ],
    requiredArtifacts: [
      "Per-entity/world compact snapshot merge path",
      "Immutable event -> snapshot provenance",
      "Versioned through_game_day state",
      "Prompt loader that consumes current snapshot rather than full event history",
    ],
    acceptance: [
      "Old robbery + new recovery becomes one coherent current merchant summary",
      "History remains queryable without occupying active prompt memory",
      "Prompt size does not grow linearly with campaign days",
    ],
    certification: [
      "Long-campaign bounded-context test",
      "Snapshot merge continuity test",
      "Immutable-history preservation test",
    ],
  },
  {
    id: 13,
    key: "split-party-temporal-overlay",
    title: "Split-party temporal background overlay",
    purpose:
      "Expose only world evolution valid for the source scene's game day and prevent future state from leaking to lagging players.",
    status: "certified",
    existingFoundation: [
      "character_world_state campaign_day/day_period",
      "chat_rooms campaign_day/day_period",
      "location-scoped dawn receipts",
      "game_age_days calculation in game-chat context",
    ],
    notSatisfiedBy: [
      "Math.max(0, currentDay - eventDay), which turns future events into age 0",
      "Applying a day-5 death directly to base characters while another player is on day 3",
    ],
    requiredArtifacts: [
      "Snapshot/event selection filtered by effective_game_day <= source scene day",
      "Future-memory exclusion",
      "Temporal overlay for life/location/destruction state when base mutation is unsafe",
      "Relevant world/location/NPC background context loader",
    ],
    acceptance: [
      "Day-3 player cannot observe day-5 background state",
      "Frontier group can observe day-5 state without forcing lagging group forward",
    ],
    certification: [
      "Split-party future-leak tests",
      "Future-memory age regression test",
    ],
  },
  {
    id: 14,
    key: "canonical-materialization-bridge",
    title: "Safe canonical background materialization",
    purpose:
      "Apply temporally safe background consequences to canonical owner tables exactly once without overwriting newer player/GM state.",
    status: "certified",
    existingFoundation: [
      "Oracle/domain-owner mutations",
      "World/NPC manager tools",
      "campaign_events provenance patterns",
    ],
    notSatisfiedBy: [
      "Immediately mutating canonical NPC/location rows for every Flash event",
      "Leaving every mechanical consequence forever as prose only",
    ],
    requiredArtifacts: [
      "Idempotent background-event materialization receipt",
      "Temporal safety check",
      "Conflict/newer-state protection",
      "Owner-engine/server mutation bridge",
      "Provenance back to background event",
    ],
    acceptance: [
      "NPC death/location move can eventually become canonical",
      "Older background event cannot overwrite a newer GM/player change",
      "Same event is never materialized twice",
    ],
    certification: [
      "Idempotence test",
      "Newer-state conflict test",
      "Temporal safety test",
    ],
  },
  {
    id: 15,
    key: "promotion-background-handoff",
    title: "Promoted actor background handoff",
    purpose:
      "Allow once-anonymous actors that gain identity to become normal persistent background-simulation entities.",
    status: "planned",
    existingFoundation: [
      "NPC discovery/profile/world state",
    ],
    notSatisfiedBy: [
      "Simulating ephemeral actor rows directly",
      "Requiring a manual importance flag before a named minor NPC can evolve",
    ],
    requiredArtifacts: [
      "Promotion assigns appropriate persistent simulation eligibility",
      "Scene actor provenance linked into NPC compact background state",
      "Daily Resolver ignores ephemeral actor row and can later select promoted NPC",
    ],
    acceptance: [
      "Random surviving goblin can reveal a name and later evolve off-screen",
      "Remaining anonymous siblings never enter persistent background simulation",
    ],
    certification: [
      "Promotion -> later Resolver eligibility integration test",
      "Anonymous sibling exclusion test",
    ],
  },
  {
    id: 16,
    key: "cleanup-retention",
    title: "Scene/background retention and cleanup",
    purpose:
      "Keep long-running AI worlds operationally small without deleting canonical history or promoted identities.",
    status: "planned",
    existingFoundation: [
      "agent job lifecycle",
      "event/snapshot separation design",
    ],
    notSatisfiedBy: [
      "Keeping full mechanics snapshots for every dead anonymous mob forever",
      "Deleting promoted NPC state with its original scene actor",
    ],
    requiredArtifacts: [
      "Scene actor archival/retention policy",
      "Safe compaction/pruning of heavy anonymous runtime snapshots",
      "Preserved encounter audit/provenance",
      "Preserved promotion redirect",
    ],
    acceptance: [
      "Dead/fled anonymous actors stop burdening active runtime",
      "Promotion/canonical history remains intact",
    ],
    certification: [
      "Retention job/policy tests",
      "Promoted-state preservation test",
    ],
  },
  {
    id: 17,
    key: "full-certification",
    title: "Full AI world evolution certification",
    purpose:
      "Prove the complete system works together and that existing AI GM/gameplay/human-GM behavior remains intact.",
    status: "planned",
    existingFoundation: [
      "Existing CI covering chat, rolls, NPC runtime, quests, world materialization and UI",
    ],
    notSatisfiedBy: [
      "Individual unit tests only",
      "Green build without end-to-end temporal/background scenarios",
      "Manually checking one campaign",
    ],
    requiredArtifacts: [
      "Cross-system certification suite for stages 1-16",
      "AI-world isolation regression coverage",
      "Existing Stage 5/6/8/12 AI GM regression coverage retained",
    ],
    acceptance: [
      "Resolver, 30% selection, d100 interpretation, actor runtime, promotion, compaction and temporal overlays work as one system",
      "Human-GM campaigns remain unchanged",
      "Existing quests/rest/dawn/co-op/45-message maintenance remain green",
    ],
    certification: [
      "Full CI green",
      "Concurrent dawn/day-run test",
      "200+ entity simulation test",
      "Actor promotion/background evolution end-to-end test",
      "Split-party temporal end-to-end test",
    ],
  },
] as const satisfies readonly AiWorldEvolutionStage[]

export const AI_WORLD_EVOLUTION_STAGE_COUNT = 17 as const

/**
 * Contract sanity validator.
 *
 * Important: this validates the implementation specification itself. It does NOT
 * claim runtime stages are implemented. Stage status must only be advanced when
 * its required artifacts and acceptance/certification evidence actually exist.
 */
export function validateAiWorldEvolutionContract(): string[] {
  const errors: string[] = []

  if (AI_WORLD_EVOLUTION_STAGES.length !== AI_WORLD_EVOLUTION_STAGE_COUNT) {
    errors.push(
      `expected ${AI_WORLD_EVOLUTION_STAGE_COUNT} stages, got ${AI_WORLD_EVOLUTION_STAGES.length}`,
    )
  }

  const ids = new Set<number>()
  const keys = new Set<string>()

  for (const declaredStage of AI_WORLD_EVOLUTION_STAGES) {
    // Widen the literal tuple member back to the public contract shape so this
    // validator remains a real runtime sanity check as stage statuses advance.
    const stage: AiWorldEvolutionStage = declaredStage

    if (ids.has(stage.id)) errors.push(`duplicate stage id: ${stage.id}`)
    ids.add(stage.id)

    if (keys.has(stage.key)) errors.push(`duplicate stage key: ${stage.key}`)
    keys.add(stage.key)

    if (!stage.purpose.trim()) errors.push(`stage ${stage.id}: purpose is empty`)
    if (stage.notSatisfiedBy.length === 0) {
      errors.push(`stage ${stage.id}: notSatisfiedBy must prevent fuzzy completion claims`)
    }
    if (stage.requiredArtifacts.length === 0) {
      errors.push(`stage ${stage.id}: requiredArtifacts is empty`)
    }
    if (stage.acceptance.length === 0) {
      errors.push(`stage ${stage.id}: acceptance is empty`)
    }
    if (stage.certification.length === 0) {
      errors.push(`stage ${stage.id}: certification is empty`)
    }

    if (
      (stage.status === "implemented" || stage.status === "certified") &&
      stage.requiredArtifacts.some((artifact) => /planned|todo|later/i.test(artifact))
    ) {
      errors.push(`stage ${stage.id}: implemented status contains planned artifact`)
    }
  }

  for (let expected = 1; expected <= AI_WORLD_EVOLUTION_STAGE_COUNT; expected += 1) {
    if (!ids.has(expected)) errors.push(`missing stage id: ${expected}`)
  }

  return errors
}

export function assertAiWorldEvolutionContract(): void {
  const errors = validateAiWorldEvolutionContract()
  if (errors.length > 0) {
    throw new Error(`Invalid AI World Evolution contract:\n${errors.join("\n")}`)
  }
}

/**
 * Returns the current declared stage state for UI/dev tooling.
 * This is intentionally explicit so an agent cannot infer completion from the
 * presence of vaguely related files such as generic dice utilities.
 */
export function aiWorldEvolutionStageStatus(id: number): AiWorldEvolutionStageStatus {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === id)
  if (!stage) throw new Error(`Unknown AI World Evolution stage: ${id}`)
  return stage.status
}
