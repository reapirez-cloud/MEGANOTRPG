import test from "node:test"
import assert from "node:assert/strict"

import {
  resolveSurvivalRollPressure,
  resolveSurvivalStage,
} from "../src/ai-survival/engine.ts"
import {
  campaignMinuteToWorldTime,
  legacyWorldTimeToCampaignMinute,
} from "../src/world-state/time.ts"

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
