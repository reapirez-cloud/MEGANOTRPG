import test from "node:test"
import assert from "node:assert/strict"

import {
  resolveSurvivalRollPressure,
  resolveSurvivalStage,
  SURVIVAL_DEPLETION_MINUTES,
} from "../src/ai-survival/engine.ts"
import {
  campaignMinuteToWorldTime,
  legacyWorldTimeToCampaignMinute,
} from "../src/world-state/time.ts"
import { evaluateCondition } from "../src/character-engine/conditions.ts"

test("AI survival stages use locked thresholds", () => {
  assert.equal(resolveSurvivalStage(51), 0)
  assert.equal(resolveSurvivalStage(50), 1)
  assert.equal(resolveSurvivalStage(25), 2)
  assert.equal(resolveSurvivalStage(10), 3)
})

test("hunger and fatigue remain separate without numeric stacking", () => {
  const pressure = resolveSurvivalRollPressure({
    satiety: 5,
    alertness: 5,
  })

  assert.equal(pressure.hunger.stage, 3)
  assert.equal(pressure.fatigue.stage, 3)
  assert.equal(pressure.roll.mode, "disadvantage")
  assert.equal(pressure.roll.flatPenalty, -7)
  assert.equal(pressure.roll.stacking, "worst_only")
  assert.equal(pressure.roll.sources.length, 2)
})

test("exact campaign minute round-trips legacy period anchors", () => {
  const minute = legacyWorldTimeToCampaignMinute({
    campaign_day: 3,
    day_period: "evening",
  })
  assert.equal(minute, 2 * 1440 + 1200)

  const exact = campaignMinuteToWorldTime(minute)
  assert.equal(exact.campaign_day, 3)
  assert.equal(exact.day_period, "evening")
  assert.equal(exact.hour, 20)
  assert.equal(exact.minute, 0)
})

test("resource conditions read canonical runtime resources", () => {
  assert.equal(
    evaluateCondition(
      { kind: "resource", key: "survival_satiety", operator: "LTE", value: 25 },
      {
        maxHp: 10,
        state: {
          currentHp: 10,
          tempHp: 0,
          resources: {
            survival_satiety: { current: 20 },
          },
        },
      },
    ),
    true,
  )
})


test("survival pacing avoids turning the campaign into a cooking simulator", () => {
  assert.equal(SURVIVAL_DEPLETION_MINUTES.satiety100To0, 48 * 60)
  assert.equal(SURVIVAL_DEPLETION_MINUTES.alertness100To0, 72 * 60)
})
