import assert from "node:assert/strict"
import test from "node:test"

import {
  AI_WORLD_EVOLUTION_STAGE_COUNT,
  AI_WORLD_EVOLUTION_STAGES,
  validateAiWorldEvolutionContract,
} from "../src/ai-world-evolution/contract.ts"

test("AI world evolution implementation contract is structurally complete", () => {
  assert.deepEqual(validateAiWorldEvolutionContract(), [])
  assert.equal(AI_WORLD_EVOLUTION_STAGES.length, AI_WORLD_EVOLUTION_STAGE_COUNT)
  assert.deepEqual(
    AI_WORLD_EVOLUTION_STAGES.map((stage) => stage.id),
    Array.from({ length: AI_WORLD_EVOLUTION_STAGE_COUNT }, (_, index) => index + 1),
  )
})

test("every AI world evolution stage explicitly blocks fuzzy completion claims", () => {
  for (const stage of AI_WORLD_EVOLUTION_STAGES) {
    assert.ok(stage.purpose.length > 20, `stage ${stage.id} needs a real purpose`)
    assert.ok(stage.notSatisfiedBy.length > 0, `stage ${stage.id} needs notSatisfiedBy`)
    assert.ok(stage.requiredArtifacts.length > 0, `stage ${stage.id} needs required artifacts`)
    assert.ok(stage.acceptance.length > 0, `stage ${stage.id} needs acceptance criteria`)
    assert.ok(stage.certification.length > 0, `stage ${stage.id} needs certification criteria`)
  }
})

test("existing gameplay dice are explicitly not accepted as World Resolver completion", () => {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === 1)
  assert.ok(stage)
  assert.equal(stage.status, "planned")
  assert.match(stage.notSatisfiedBy.join("\n"), /Roll Engine|Tobik|player-roll/)
  assert.match(stage.requiredArtifacts.join("\n"), /decision_key|resolve_world_random_v1/)
})

test("existing canonical NPC runtime is not accepted as ephemeral actor completion", () => {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === 5)
  assert.ok(stage)
  assert.equal(stage.status, "planned")
  assert.match(stage.notSatisfiedBy.join("\n"), /Бандит 1/)
  assert.match(stage.requiredArtifacts.join("\n"), /ai_scene_actors/)
})

test("existing campaign memory is not accepted as compact background-state completion", () => {
  const stage = AI_WORLD_EVOLUTION_STAGES.find((entry) => entry.id === 12)
  assert.ok(stage)
  assert.equal(stage.status, "planned")
  assert.match(stage.notSatisfiedBy.join("\n"), /campaign_memory_fact/)
  assert.match(stage.requiredArtifacts.join("\n"), /snapshot/)
})
