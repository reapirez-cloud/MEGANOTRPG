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
      "When active PCs physically converge, lagging PCs may be advanced to the latest colocated game time through idle-life catch-up only",
      "Idle catch-up cannot grant off-screen achievements, rewards, quest progress or mechanical recovery",
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
    status: "certified",
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
    status: "certified",
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
    key: "logic-bound-player-rolls",
    title: "Canon-bound intent adjudication and delegated real player rolls",
    purpose:
      "Let the AI GM request any appropriate D&D-style check from world logic without needing application tool knowledge, while a smaller mechanic worker maps that semantic request onto the real server roll system and freezes difficulty before the die exists.",
    status: "planned",
    existingFoundation: [
      "pending_player_roll_requests already pauses the GM turn and uses a real server-side player d20",
      "player roll modifiers are resolved server-side from the character sheet",
      "request types already cover skill, ability, save, attack and custom checks",
      "Stage 11 World Resolver can settle genuinely unresolved world-existence branches before a player check",
    ],
    notSatisfiedBy: [
      "Giving the primary GM a catalog of application RPC/tool names and expecting it to call them correctly",
      "Hard-coding only combat or a short whitelist of authored checks",
      "Letting the model choose or change DC after seeing the roll",
      "Using a player skill roll to decide whether an unestablished hut, dragon, NPC or item exists",
      "Treating natural 20 as permission to materialize an exact impossible target",
      "Requesting a cosmetic roll when canon already makes success or failure deterministic",
      "A prompt-only instruction without a persisted pre-roll adjudication receipt",
    ],
    requiredArtifacts: [
      "Primary GM semantic roll directive that describes fictional intent, target PC, requested check/save/skill when known, reason and logical difficulty without exposing application implementation details",
      "Small mechanic/roll worker that reads the GM directive plus current character/context and maps it to the existing canonical roll request RPC",
      "Worker may infer ordinary D&D checks from context, including a Constitution check/save for strong alcohol, Athletics for exertion, Insight for reading behavior, Survival for tracking and other normal checks",
      "Server-persisted pre-roll intent adjudication receipt created before the player d20",
      "Receipt contains intent fingerprint, canonical evidence/context fingerprint, possibility mode, check specification, frozen DC/visibility and frozen outcome envelope",
      "Explicit possibility modes: deterministic_success, deterministic_failure, check and impossible_exact",
      "World-existence uncertainty is resolved by canon or Stage 11 Resolver before any player skill check; the player d20 never creates world existence",
      "For impossible_exact, the exact requested result is forbidden even on natural 20; natural 20 may unlock only a precommitted plausible partial-success envelope",
      "Existing pending_player_roll_requests references the adjudication receipt and the resume path consumes its frozen server result",
      "Server rejects changed DC, changed exact-goal permission, changed evidence fingerprint or outcome-envelope mutation after the roll request exists",
    ],
    acceptance: [
      "Primary GM can simply decide that drinking exceptionally strong alcohol warrants a Constitution check/save; the mechanic worker creates the correct real check without the primary GM knowing the app API",
      "Any ordinary D&D-style check can be requested from fiction and mechanics rather than only pre-authored buttons",
      "Searching for a canonically present but hidden hut can request an appropriate Survival, Perception or Investigation check with a precommitted DC",
      "Searching for an unestablished hut does not create the hut; impossible_exact may allow natural-20 partial success such as finding shelter, traces or a useful lead",
      "Searching for an unestablished dragon cannot produce a dragon from the skill roll; natural 20 can only return a bounded dragon-like clue or analogue that does not assert the dragon exists",
      "If canon already proves success or failure, the GM resolves it without a cosmetic roll",
      "The AI chooses difficulty from current canon and circumstances before the roll and cannot revise it after seeing the result",
    ],
    certification: [
      "Natural-language GM directive -> mechanic worker -> real pending player roll integration test",
      "Constitution check for strong alcohol integration test",
      "Pre-roll DC/outcome immutability test",
      "Known-target normal-check integration test",
      "Unestablished-target natural-20 partial-success test",
      "Anti-canon-creation test for impossible exact goals",
      "Deterministic no-roll test",
      "Stage 11 existence-resolution then player-skill-roll separation test",
      "Real d20 request/resume tamper regression test",
    ],
  },
  {
    id: 18,
    key: "post-response-world-commit",
    title: "Post-response junior world commit and turn gate",
    purpose:
      "Publish the GM answer first, then let a smaller worker materialize the world changes implied by that answer while the player reads it, without allowing the next player turn to race ahead of canonical state.",
    status: "planned",
    existingFoundation: [
      "world materializer and manager/quest tools already exist",
      "agent_jobs already provides durable job state",
      "game chat already has server-owned turn state and waiting_for_user handling",
    ],
    notSatisfiedBy: [
      "Running location/NPC materialization before the visible GM answer and making the player wait for invisible bookkeeping",
      "Allowing the next player message while post-turn canonical changes are still being written",
      "Client-only disabled input without a server-side send gate",
      "Letting the junior worker rewrite the GM narrative or invent new outcomes after the answer",
      "Treating worker failure as success and silently unlocking an inconsistent next turn",
    ],
    requiredArtifacts: [
      "Primary GM output split into player-visible answer plus hidden bounded post_turn_intents",
      "Visible GM/NPC answer is published before nonessential location/NPC/quest/memory materialization begins",
      "Durable per-turn post-response commit job with idempotency key derived from source GM turn and intent index",
      "Junior worker receives only the published answer, hidden structured intents, necessary canonical context and allowed manager tools",
      "Junior worker may create/update referenced locations, persistent NPCs, quest bindings, memories and other canonical records, but may not alter the already-published narrative outcome",
      "Server-owned turn gate blocks new player chat messages from that source scene while the post-response job is pending/running",
      "Client UI shows an explicit status such as 'Младший шуршит…' and disables send while the server gate is closed",
      "Roll-only interaction remains usable when the current turn is waiting_for_user; a pending roll is not treated as a new free-form player message",
      "On worker success, commit receipt is written and input unlocks",
      "On worker failure, the turn stays recoverably blocked with bounded automatic retry/admin recovery rather than accepting a new turn against stale state",
    ],
    acceptance: [
      "Player sees the GM answer before a newly mentioned location/NPC is written to canonical tables",
      "While the player reads the answer, the junior worker can create/update the implied world state",
      "A second player message is rejected server-side until the junior commit finishes",
      "After unlock, the next GM turn sees the committed location/NPC/quest state",
      "Repeated worker delivery cannot duplicate the same NPC/location/quest mutation",
    ],
    certification: [
      "Answer-visible-before-materialization ordering test",
      "Server-side send-gate race test",
      "Client shurshit-state integration test",
      "Idempotent post-turn replay test",
      "Worker failure/retry/unlock test",
      "Roll-wait vs post-turn-lock state-machine regression test",
    ],
  },
  {
    id: 19,
    key: "bounded-clean-gm-context",
    title: "Bounded clean GM context envelope",
    purpose:
      "Keep every primary GM turn focused and cheap by sending only the recent player-visible scene history plus compact relevant canon, never raw junior-worker/tool chatter or the entire campaign database.",
    status: "planned",
    existingFoundation: [
      "CHAT_CONTEXT_LIMIT is already 50",
      "memory facts and summaries are already bounded separately",
      "scene-day future filtering and relevant-character selection already exist",
    ],
    notSatisfiedBy: [
      "Assuming limit 50 is enough while forwarding raw event_payload and internal turn metadata for every message",
      "Passing agent_jobs history, junior tool calls, materializer commands or raw provider traces into future primary-GM turns",
      "Loading every NPC, location, quest, event or background snapshot in the campaign",
      "Growing prompt size linearly with campaign age",
    ],
    requiredArtifacts: [
      "Exactly the latest up-to-50 visible scene messages are eligible for raw conversational history, after audience and game-day filtering",
      "Narrative history normalization keeps only player speech/actions, GM narration, NPC dialogue and compact user-visible roll/action outcomes",
      "Internal turn_component values, worker commands, tool_call payloads, materialization tasks, provider traces and agent job internals are excluded from primary-GM history",
      "Large event_payload values are replaced by compact canonical summaries where a user-visible mechanical result matters",
      "Canonical context is loaded separately and selectively: current scene/time/location, physically relevant characters, relevant NPC fingerprints, active quest slice, bounded memory, bounded background state, relevant resources and current GM/player settings",
      "Junior workers may receive their own narrow tool context, but their commands never become narrative chat history",
      "45-message maintenance remains a separate archival/summary mechanism and does not cause full history replay",
      "Context-size telemetry records message count and approximate serialized bytes/tokens for regression testing",
    ],
    acceptance: [
      "A normal GM turn sees at most 50 recent relevant chat messages, not all historical messages",
      "Post-turn create_location/create_npc commands are absent from the next primary-GM prompt",
      "The canonical results of those commands are present through the normal location/NPC context",
      "A 500-turn campaign does not produce a primary-GM prompt proportional to 500 turns",
    ],
    certification: [
      "50-message hard-cap test",
      "worker-command exclusion test",
      "compact roll/action result projection test",
      "500-turn bounded-context regression test",
      "future/private-message visibility regression test",
    ],
  },
  {
    id: 20,
    key: "npc-identity-fingerprint",
    title: "Persistent NPC identity fingerprint",
    purpose:
      "Give every persistent NPC a durable personality core so dialogue, social checks, background simulation and long-term decisions come from the same person instead of being reinvented on every model call.",
    status: "planned",
    existingFoundation: [
      "npc_profiles already contains demeanor, motivation, notes and tags",
      "character relationships and faction reputations already model changing external state",
      "NPC dialogue context already receives the NPC profile",
    ],
    notSatisfiedBy: [
      "Treating demeanor plus motivation as a complete personality",
      "Letting current attitude toward the player overwrite stable values or red lines",
      "Regenerating personality from scratch every turn",
      "Changing core personality after ordinary conversation without a major canonical event",
    ],
    requiredArtifacts: [
      "Dedicated versioned NPC identity fingerprint record keyed by persistent NPC character_id",
      "Structured core fields for traits, weighted values, red lines/non-negotiables, long-term goals, fears, loyalties, risk tolerance, violence threshold, behavior under pressure, self-image, social style and decision priorities",
      "Clear separation between stable identity fingerprint and mutable state such as mood, current relationship, injury, location and temporary goals",
      "Fingerprint provenance and version history; identity changes require an explicit major-event/evolution receipt rather than silent overwrite",
      "GM-only/private fingerprint data is not automatically player-visible; discovered personality observations can be represented separately",
      "Primary GM, NPC dialogue model and background simulation all consume the same current fingerprint",
      "Promoted scene actors receive an initial conservative fingerprint from established behavior/bestiary provenance rather than invented biography",
      "Social adjudication may use values/red lines to decide normal check versus impossible_exact; a high Persuasion roll does not erase a core non-negotiable",
      "NPC card UI includes a GM-facing 'Личность' section for the fingerprint",
    ],
    acceptance: [
      "A principled NPC remains recognizably the same person across dialogue, off-screen simulation and later encounters",
      "A player cannot make an NPC violate a hard red line merely by asking or rolling high",
      "Relationship score may change quickly while the stable fingerprint remains unchanged",
      "A major canonical life event can explicitly evolve the fingerprint with provenance",
    ],
    certification: [
      "Cross-surface personality consistency test",
      "Red-line social-roll regression test",
      "Relationship-vs-identity separation test",
      "Major-event fingerprint versioning test",
      "Promotion fingerprint bootstrap test",
    ],
  },
  {
    id: 21,
    key: "gm-behavior-profiles",
    title: "GM behavior profiles",
    purpose:
      "Let the player choose the kind of campaign pressure they want without changing the underlying truth of the world, NPC autonomy or game mechanics.",
    status: "planned",
    existingFoundation: [
      "AI GM system prompt and model routing already exist",
      "Stages 17 and 20 provide logical rolls and autonomous NPC identity",
    ],
    notSatisfiedBy: [
      "A difficulty slider that merely changes enemy numbers",
      "Interpreting 'Жестокий' as an adversarial GM that fabricates deaths or targets the player",
      "Interpreting 'Симс' as wish fulfillment where NPCs obey the player",
      "Allowing any profile to overwrite canon, dice or NPC identity",
    ],
    requiredArtifacts: [
      "Campaign-level GM behavior configuration with presets Жестокий, Приключение and Симс plus explicit internal dimensions",
      "Shared constitution above every preset: player intent is input, not canon; world facts and NPC agency outrank player wishes unless the player performs a logical action that changes them; GM is also bound by canon and mechanics",
      "Жестокий profile means high causal realism, low/no plot armor, persistent legal/social consequences, dangerous power asymmetry and no rescue from foolish choices, but never fabricated hostility simply to kill a PC",
      "Приключение profile remains realistic but prefers recoverable complications, warnings, hooks and continued adventure when several equally logical outcomes exist",
      "Симс profile lowers unmotivated lethal pressure and emphasizes daily life, work, housing, relationships, dates, family, social conflict and long-term living while preserving refusal, failure and NPC autonomy",
      "Internal dimensions include consequence strictness, plot-armor allowance, lethal-escalation pressure, danger telegraphing, adventure coincidence, social/life focus, pacing and persistence of consequences",
      "Behavior profile affects selection among canonically plausible developments, never the truth of an already resolved fact",
    ],
    acceptance: [
      "Attacking city guards in Жестокий can realistically lead to overwhelming force, arrest or death and the city remembers it",
      "The same world in Приключение may more often expose escape/surrender/complication paths when logically available without erasing consequences",
      "Симс supports long stretches of ordinary life and relationships without turning NPCs into compliant props",
      "No profile lets a player declaration become true without causal support",
    ],
    certification: [
      "Same-scene cross-profile behavior test",
      "Non-adversarial Жестокий regression test",
      "NPC refusal preserved in Симс test",
      "Consequences persist across all profiles test",
    ],
  },
  {
    id: 22,
    key: "player-director-preferences",
    title: "Player director preferences",
    purpose:
      "Let players express what kinds of stories and pacing they want while treating those wishes as future opportunity preferences, never as commands that rewrite NPCs or canon.",
    status: "planned",
    existingFoundation: [
      "player/campaign settings infrastructure",
      "GM behavior profiles from Stage 21",
      "NPC identity fingerprints from Stage 20",
    ],
    notSatisfiedBy: [
      "Turning 'I want a romance with this NPC' into that NPC loving the player",
      "Letting preferences override failed rolls, NPC red lines or canonical facts",
      "Dumping unbounded free-text preferences into every prompt without structure/versioning",
    ],
    requiredArtifacts: [
      "Per-player versioned director-preference record with optional free text and structured interests such as combat, exploration, investigation, social play, romance, daily life, horror, politics and pacing",
      "Preferences are fed to the GM as opportunity-selection guidance only",
      "Explicit invariant that desired content can influence what opportunities the future world offers but not whether an existing NPC agrees, whether a roll succeeds or whether an established fact changes",
      "Shared-scene aggregation rule for multiple players so one player's preference cannot silently dominate another's",
      "Split-party scenes use the preferences of participating/source players only",
      "Bounded prompt projection rather than raw historical preference edits",
    ],
    acceptance: [
      "A player asking for more romance causes more plausible romantic opportunities over time, not automatic consent from a chosen NPC",
      "A player asking for fewer combats affects future encounter selection where flexible, not an already-triggered canonical ambush",
      "Conflicting co-op preferences produce a bounded compromise rather than hidden winner-takes-all behavior",
    ],
    certification: [
      "Preference-is-not-canon test",
      "NPC autonomy regression test",
      "Shared-scene preference merge test",
      "Bounded preference-context test",
    ],
  },
  {
    id: 23,
    key: "adult-life-sim-content-profile",
    title: "Adult and life-simulation content profile",
    purpose:
      "Allow an eligible campaign to treat mature adult life as ordinary world content, especially for life-simulation play, without MEGANOT adding a second sanitization layer on top of the selected model provider.",
    status: "planned",
    existingFoundation: [
      "GM behavior profiles including Симс",
      "player director preferences",
      "provider-specific model routing",
    ],
    notSatisfiedBy: [
      "A separate jailbreak layer that tries to bypass provider restrictions",
      "Forcing euphemisms, moralizing or automatic fade-to-black solely because mature subject matter is present",
      "Treating adult-focused mode as automatic NPC compliance",
      "Duplicating provider moderation with a large application-side pseudo-moderation system",
    ],
    requiredArtifacts: [
      "Campaign content profile with off, allowed and adult_focused modes where product/account eligibility permits",
      "Prompt instruction that mature themes may be represented as normal parts of the simulated world when enabled, without extra MEGANOT sanitization solely because the subject is mature",
      "Explicit instruction that the active model/provider remains authoritative for what it can actually generate; MEGANOT does not attempt to bypass provider restrictions",
      "Adult-focused mode changes thematic priority/detail availability, not NPC autonomy, canon, prices, social consequences or roll logic",
      "Симс plus adult_focused can prioritize adult relationships and venues as ordinary life-simulation opportunities while still using NPC identity, relationships and world causality",
      "Provider capability differences are handled by graceful degradation rather than rewriting campaign canon",
    ],
    acceptance: [
      "An adult-focused life-sim campaign can naturally include mature venues/relationships when the provider allows it without MEGANOT automatically sanitizing the scene",
      "A transactional venue can behave transactionally when canon and NPC role support it, while an unrelated NPC still reacts from their own identity and circumstances",
      "Switching providers does not corrupt world state if one provider declines content another provider can handle",
      "Adult-focused mode never converts player desire into NPC consent or canonical success",
    ],
    certification: [
      "Provider-capability graceful-degradation test",
      "No-extra-sanitization prompt regression test",
      "NPC autonomy in adult-focused mode test",
      "World-state preservation across provider refusal test",
    ],
  },
  {
    id: 24,
    key: "full-certification",
    title: "Full AI world and GM runtime certification",
    purpose:
      "Prove the complete autonomous-world, cooperative-time, roll, post-response commit, context, NPC identity and GM-configuration system works together without regressing existing gameplay or human-GM campaigns.",
    status: "planned",
    existingFoundation: [
      "Existing CI covering chat, rolls, NPC runtime, quests, world materialization and UI",
      "Certified world-evolution stages 1-16",
    ],
    notSatisfiedBy: [
      "Individual unit tests only",
      "Green build without end-to-end temporal/background/GM-runtime scenarios",
      "Manually checking one campaign",
      "Certifying new profiles/preferences without proving they cannot override canon",
    ],
    requiredArtifacts: [
      "Cross-system certification suite for stages 1-23",
      "AI-world isolation regression coverage",
      "Existing Stage 5/6/8/12 AI GM regression coverage retained",
      "End-to-end turn pipeline coverage from player message through GM reply, optional real roll, junior post-turn commit, unlock and next clean GM context",
    ],
    acceptance: [
      "Resolver, 30% selection, d100 interpretation, actor runtime, promotion, compaction, temporal overlays and canonical materialization work as one system",
      "Logic-bound semantic roll requests produce real server rolls without creating impossible canon",
      "GM answer is visible before post-turn bookkeeping, but next input cannot race ahead of the junior commit",
      "Primary GM context stays bounded to clean recent history plus relevant compact canon",
      "NPC identity persists across dialogue/background/social decisions",
      "GM profiles, player preferences and adult/life-sim content settings alter style/opportunity selection without overruling canon, dice or NPC autonomy",
      "Human-GM campaigns remain unchanged",
      "Existing quests/rest/dawn/co-op/45-message maintenance remain green",
    ],
    certification: [
      "Full CI green",
      "Concurrent dawn/day-run test",
      "200+ entity simulation test",
      "Actor promotion/background evolution/retention end-to-end test",
      "Split-party temporal and colocated catch-up end-to-end test",
      "Intent adjudication -> junior mechanic worker -> real player d20 -> frozen outcome end-to-end test",
      "GM reply -> junior shursh commit -> input unlock -> next-turn canonical-context test",
      "500-turn bounded clean-context test",
      "NPC fingerprint cross-surface test",
      "GM profile and player-preference non-canon-override tests",
      "Human-GM isolation regression suite",
    ],
  },
] as const satisfies readonly AiWorldEvolutionStage[]

export const AI_WORLD_EVOLUTION_STAGE_COUNT = 24 as const

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
      stage.requiredArtifacts.some((artifact) => /\b(?:planned|todo)\b/i.test(artifact))
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
