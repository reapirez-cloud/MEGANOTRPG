/**
 * AI Survival implementation contract.
 *
 * Human-readable roadmap:
 *   docs/AI_SURVIVAL_MASTER_ROADMAP.md
 *
 * Keep the roadmap coarse. Implementation and tests belong inside the four
 * product stages rather than becoming dozens of ceremonial micro-stages.
 */

export const AI_SURVIVAL_CONTRACT_VERSION = 1 as const

export type AiSurvivalStageStatus =
  | "planned"
  | "partial"
  | "implemented"
  | "certified"

export type AiSurvivalStageContract = {
  id: number
  key: string
  title: string
  status: AiSurvivalStageStatus
  requiredArtifacts: readonly string[]
  acceptance: readonly string[]
}

export const AI_SURVIVAL_STAGES = [
  {
    id: 1,
    key: "minute-clock-survival-core",
    title: "Minute clock + Survival Core",
    status: "implemented",
    requiredArtifacts: [
      "character_world_state.campaign_minute",
      "chat_rooms.campaign_minute",
      "minute-aware colocated player catch-up",
      "survival_satiety resource",
      "survival_alertness resource",
      "high-resolution survival depletion remainders",
      "independent hunger/fatigue stage resolver",
      "non-stacking survival roll-pressure resolver",
      "generic Character Engine resource condition",
    ],
    acceptance: [
      "Legacy day/period and exact campaign minute stay synchronized",
      "Five-minute scenes eventually deplete resources instead of rounding away",
      "Hunger and fatigue remain independent status sources",
      "Hunger III + Fatigue III resolves to disadvantage + -7, never -14",
      "Idle-life colocated catch-up does not starve or exhaust an off-screen PC",
    ],
  },
  {
    id: 2,
    key: "d20-food-sleep",
    title: "D20 + food + sleep/rest mechanics",
    status: "planned",
    requiredArtifacts: [
      "normal/advantage/disadvantage authoritative d20 mode",
      "survival pressure integrated into intended d20 tests",
      "atomic food consume + satiety restore operation",
      "sleep duration + alertness restore operation",
      "short/long rest time advancement",
      "dawn boundary integration",
      "optional canonical route travel duration",
    ],
    acceptance: [
      "Survival disadvantage is rolled mechanically rather than narrated",
      "Both survival causes are preserved in roll provenance",
      "Food cannot restore above 100 and cannot be consumed twice",
      "Sleep/rest cannot recover without advancing game time",
    ],
  },
  {
    id: 3,
    key: "ai-status-drawer",
    title: "AI GM + player status drawer",
    status: "planned",
    requiredArtifacts: [
      "AI-world status drawer replacing the human-GM control drawer",
      "exact time/location/satiety/alertness presentation",
      "structured elapsed-time output from primary GM",
      "0–5 minute server cap for normal scene advancement",
      "post-turn deterministic time/survival commit",
      "survival state in AI GM canonical context",
    ],
    acceptance: [
      "AI-world player sees status instead of GM-only rest controls",
      "Human-GM campaign drawer is unchanged",
      "Primary GM describes time semantically but server owns arithmetic",
    ],
  },
  {
    id: 4,
    key: "coop-rollback-certification",
    title: "Co-op time + rollback + certification",
    status: "planned",
    requiredArtifacts: [
      "shared-scene participant time advancement",
      "split-party exact clocks",
      "turn-revision time/survival receipts",
      "regenerate/undo idempotency",
      "focused full-path certification",
    ],
    acceptance: [
      "Retry/regenerate never double-advances survival time",
      "Undo restores world time and survival atomically",
      "Colocated convergence remains temporally safe",
      "Four-stage roadmap can be marked certified without hidden follow-up stages",
    ],
  },
] as const satisfies readonly AiSurvivalStageContract[]
