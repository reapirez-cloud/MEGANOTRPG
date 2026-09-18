import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterContribution,
} from "../src/character-engine/index.ts"
import { sourceSuppressionContributions } from "../src/lib/suppressionRuntime.ts"

const sourceId =
  "template:subclass:battle-master:v1:source:riposte"

function resolveWithSuppressed(suppressed: boolean) {
  const featureSource = {
    id: sourceId,
    name: "Контратака",
    sourceType: "subclass_template",
    parentSourceId: "template:subclass:battle-master:v1",
  }

  const contributions: CharacterContribution[] = [
    {
      id: "riposte-feature",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "riposte",
      payload: {
        label: "Контратака",
        description: "Ответный удар.",
        mechanic: {
          kind: "reaction",
          trigger: "enemy_misses",
        },
      },
      source: featureSource,
    },
    {
      id: "riposte-speed-test",
      kind: "numeric",
      target: "combat.speed",
      operation: "ADD",
      value: 3,
      source: featureSource,
    },
    ...(suppressed
      ? sourceSuppressionContributions(
          "character-1",
          [sourceId],
        )
      : []),
  ]

  return resolveCharacterContract({
    base: {
      id: "character-1",
      name: "Тест",
      level: 5,
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      baseMaxHp: 20,
      baseSpeed: 9,
    },
    state: {
      currentHp: 20,
      tempHp: 0,
      resources: {},
      facts: {},
    },
    contributions,
  })
}

test("canonical source suppression removes the ability mechanics from CE and enabling restores them", () => {
  const active = resolveWithSuppressed(false)
  const suppressed = resolveWithSuppressed(true)

  assert.equal(active.combat.speed.value, 12)
  assert.equal(suppressed.combat.speed.value, 9)

  assert.equal(
    active.capabilities.features.some(
      (feature) => feature.key === "riposte",
    ),
    true,
  )
  assert.equal(
    suppressed.capabilities.features.some(
      (feature) => feature.key === "riposte",
    ),
    false,
  )

  assert.equal(
    active.rules.some((rule) => rule.key === "riposte"),
    true,
  )
  assert.equal(
    suppressed.rules.some((rule) => rule.key === "riposte"),
    false,
  )
})

const suppressionHook = fs.readFileSync(
  "src/hooks/useCharacterSourceSuppressions.ts",
  "utf8",
)
const oracleEngine = fs.readFileSync(
  "src/oracle-engine/engine.ts",
  "utf8",
)
const shapoklyakEngine = fs.readFileSync(
  "src/entity-engine/engine.ts",
  "utf8",
)
const shapoklyakStorage = fs.readFileSync(
  "src/entity-engine/supabase.ts",
  "utf8",
)
const campaignScope = fs.readFileSync(
  "src/ui-v1-isolated/useUiV1SectionData.ts",
  "utf8",
)

test("ability suppression mutation follows Snake domain callback into Oracle and Shapoklyak canonical state", () => {
  assert.match(
    suppressionHook,
    /oracle\.characters\.setSourceSuppressed\(/,
  )
  assert.match(
    oracleEngine,
    /setSourceSuppressed:[\s\S]*?dependencies\.shapoklyak\.execute\(\{ kind: "entity\.set_source_suppressed"/,
  )
  assert.match(
    shapoklyakEngine,
    /"entity\.set_source_suppressed"/,
  )
  assert.match(
    shapoklyakStorage,
    /rpc\("set_character_source_suppressed"/,
  )
  assert.match(
    shapoklyakStorage,
    /requiresResolution: true/,
  )
})

test("suppression persistence reloads canonical rows and manager authority includes GM or owner", () => {
  assert.match(
    suppressionHook,
    /await oracle\.characters\.setSourceSuppressed[\s\S]*?await load\(\)/,
  )
  assert.match(
    suppressionHook,
    /table: "character_source_suppressions"/,
  )
  assert.match(
    campaignScope,
    /canManage: membership\.role === "gm" \|\| membership\.is_owner === true/,
  )
})
