export const SURVIVAL_RESOURCE_KEYS = {
  satiety: "survival_satiety",
  alertness: "survival_alertness",
} as const

export type SurvivalStage = 0 | 1 | 2 | 3
export type SurvivalPressureSource = "hunger" | "fatigue"

export type SurvivalTrack = {
  value: number
  stage: SurvivalStage
  flatPenalty: 0 | -5 | -7
}

export type SurvivalRollPressure = {
  mode: "normal" | "disadvantage"
  flatPenalty: 0 | -5 | -7
  stacking: "worst_only"
  sources: Array<{
    source: SurvivalPressureSource
    stage: Exclude<SurvivalStage, 0>
    flatPenalty: 0 | -5 | -7
  }>
}

export const SURVIVAL_STAGE_THRESHOLDS = {
  stage1AtOrBelow: 50,
  stage2AtOrBelow: 25,
  stage3AtOrBelow: 10,
} as const

export const SURVIVAL_DEPLETION_MINUTES = {
  satiety100To0: 48 * 60,
  alertness100To0: 72 * 60,
} as const

export function clampSurvivalValue(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function resolveSurvivalStage(value: number): SurvivalStage {
  const current = clampSurvivalValue(value)
  if (current <= SURVIVAL_STAGE_THRESHOLDS.stage3AtOrBelow) return 3
  if (current <= SURVIVAL_STAGE_THRESHOLDS.stage2AtOrBelow) return 2
  if (current <= SURVIVAL_STAGE_THRESHOLDS.stage1AtOrBelow) return 1
  return 0
}

export function survivalStageFlatPenalty(
  stage: SurvivalStage,
): 0 | -5 | -7 {
  if (stage >= 3) return -7
  if (stage === 2) return -5
  return 0
}

export function resolveSurvivalTrack(value: number): SurvivalTrack {
  const normalized = clampSurvivalValue(value)
  const stage = resolveSurvivalStage(normalized)
  return {
    value: normalized,
    stage,
    flatPenalty: survivalStageFlatPenalty(stage),
  }
}

/**
 * Hunger and fatigue are independent status tracks but share one roll-pressure
 * channel. Disadvantage applies once and only the worse flat penalty applies.
 */
export function resolveSurvivalRollPressure(input: {
  satiety: number
  alertness: number
}): {
  hunger: SurvivalTrack
  fatigue: SurvivalTrack
  roll: SurvivalRollPressure
} {
  const hunger = resolveSurvivalTrack(input.satiety)
  const fatigue = resolveSurvivalTrack(input.alertness)
  const sources: SurvivalRollPressure["sources"] = []

  if (hunger.stage !== 0) {
    const stage: Exclude<SurvivalStage, 0> = hunger.stage
    sources.push({
      source: "hunger",
      stage,
      flatPenalty: hunger.flatPenalty,
    })
  }

  if (fatigue.stage !== 0) {
    const stage: Exclude<SurvivalStage, 0> = fatigue.stage
    sources.push({
      source: "fatigue",
      stage,
      flatPenalty: fatigue.flatPenalty,
    })
  }

  return {
    hunger,
    fatigue,
    roll: {
      mode: sources.length ? "disadvantage" : "normal",
      flatPenalty: Math.min(hunger.flatPenalty, fatigue.flatPenalty) as 0 | -5 | -7,
      stacking: "worst_only",
      sources,
    },
  }
}
