import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput, type CharacterSource } from "../src/character-engine/index.ts"
import { contributionForStoredMechanic } from "../src/lib/characterMechanics.ts"
import { resourceSyncInputs } from "../src/lib/resourceRuntime.ts"
import type { StoredMechanic } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync("supabase/migrations/20260828211500_fighter_precision_pack.sql", "utf8")

const fighterSource: CharacterSource = {
  id: "template:class:fighter:v1:source:second-wind",
  name: "Второе дыхание",
  sourceType: "class_template",
}

function baseInput(contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "fighter-test",
      name: "Воин",
      level: 5,
      abilities: { strength: 16, dexterity: 14, constitution: 16, intelligence: 10, wisdom: 12, charisma: 10 },
      baseMaxHp: 44,
      baseSpeed: 30,
    },
    state: { currentHp: 44, tempHp: 0, resources: {} },
    contributions,
  }
}

test("Fighter pack installs all ten project subclasses", () => {
  for (const key of [
    "arcane-archer",
    "battle-master",
    "cavalier",
    "champion",
    "echo-knight",
    "eldritch-knight",
    "psi-warrior",
    "banneret",
    "rune-knight",
    "samurai",
  ]) {
    assert.match(migration, new RegExp(`subclass:fighter:${key}`))
  }
})

test("base Fighter progression is represented by real resources and values", () => {
  assert.match(migration, /fighter-second-wind-l1[\s\S]*'2'::jsonb/)
  assert.match(migration, /fighter-second-wind-l4[\s\S]*'3'::jsonb/)
  assert.match(migration, /fighter-second-wind-l10[\s\S]*'4'::jsonb/)
  assert.match(migration, /fighter-action-surge-l17[\s\S]*'2'::jsonb/)
  assert.match(migration, /fighter-indomitable-l13[\s\S]*'2'::jsonb/)
  assert.match(migration, /fighter-indomitable-l17[\s\S]*'3'::jsonb/)
  assert.match(migration, /weapon_mastery_count/)
  assert.match(migration, /fighter-weapon-mastery-l16[\s\S]*'6'::jsonb/)
  assert.match(migration, /attacks_per_attack_action/)
  assert.match(migration, /fighter-attacks-l20[\s\S]*'4'::jsonb/)
})

test("Second Wind persists per-trigger recovery without class-specific server code", () => {
  const mechanic = {
    id: "second-wind-test",
    type: "grant",
    target: "resource",
    key: "second_wind",
    sourceKey: "second-wind",
    payload: {
      max: 3,
      label: "Второе дыхание",
      initial: "full",
      recharge: { triggers: ["long_rest"], restore: "full" },
      recoveryRules: [
        { trigger: "short_rest", restore: "amount", amount: 1 },
        { trigger: "long_rest", restore: "full" },
      ],
    },
  } as unknown as StoredMechanic
  const contract = resolveCharacterContract(baseInput([contributionForStoredMechanic(mechanic, fighterSource)]))
  const sync = resourceSyncInputs(contract)
  assert.deepEqual(sync[0]?.recharge, {
    rules: [
      { trigger: "short_rest", restore: "amount", amount: 1 },
      { trigger: "long_rest", restore: "full" },
    ],
  })
  assert.match(migration, /jsonb_typeof\(v_row\.recharge->'rules'\)='array'/)
  assert.doesNotMatch(migration, /second_wind.*p_trigger/i)
})

test("Battle Master keeps superiority pool and die size as separate identities", () => {
  assert.match(migration, /superiority_dice/)
  assert.match(migration, /superiority_die/)
  assert.match(migration, /fighter-bm-dice-l3[\s\S]*'4'::jsonb/)
  assert.match(migration, /fighter-bm-dice-l7[\s\S]*'5'::jsonb/)
  assert.match(migration, /fighter-bm-dice-l15[\s\S]*'6'::jsonb/)
  assert.match(migration, /fighter-bm-die-l3[\s\S]*'8'::jsonb/)
  assert.match(migration, /fighter-bm-die-l10[\s\S]*'10'::jsonb/)
  assert.match(migration, /fighter-bm-die-l18[\s\S]*'12'::jsonb/)
})

test("finite subclass mechanics use CE resources instead of fake scene flags", () => {
  for (const key of [
    "arcane_shot",
    "warding_maneuver",
    "unleash_incarnation",
    "shadow_martyr",
    "psionic_energy",
    "giants_might",
    "runic_shield",
    "fighting_spirit",
    "strength_before_death",
  ]) assert.match(migration, new RegExp(key))

  assert.doesNotMatch(migration, /"enforcement"\s*:\s*"gm"/)
  assert.doesNotMatch(migration, /_confirmed/)
  assert.match(migration, /no_fake_scene_state/)
})

test("Psi Warrior pool and die scale independently", () => {
  assert.match(migration, /psionic_energy/)
  assert.match(migration, /core\.proficiencyBonus/)
  assert.match(migration, /fighter-psi-die3[\s\S]*'6'::jsonb/)
  assert.match(migration, /fighter-psi-die5[\s\S]*'8'::jsonb/)
  assert.match(migration, /fighter-psi-die11[\s\S]*'10'::jsonb/)
  assert.match(migration, /fighter-psi-die17[\s\S]*'12'::jsonb/)
  assert.match(migration, /psionic_recovery/)
})

test("Eldritch Knight uses shared standard spell slot identities", () => {
  assert.match(migration, /spellcasting_progression','one_third'/)
  assert.match(migration, /fighter-ek-slot1-l3[\s\S]*spell_slot_1[\s\S]*'2'::jsonb/)
  assert.match(migration, /fighter-ek-slot2-l7[\s\S]*spell_slot_2[\s\S]*'2'::jsonb/)
  assert.match(migration, /fighter-ek-slot3-l13[\s\S]*spell_slot_3[\s\S]*'2'::jsonb/)
  assert.match(migration, /fighter-ek-slot4-l19[\s\S]*spell_slot_4[\s\S]*'1'::jsonb/)
  assert.doesNotMatch(migration, /eldritch_knight_slot_/)
})

test("Banneret reuses Fighter resources rather than duplicating them", () => {
  assert.match(migration, /Групповое восстановление[\s\S]*то же Второе дыхание/)
  assert.match(migration, /Воодушевляющий всплеск[\s\S]*ресурс базового класса/)
  assert.match(migration, /Общая стойкость[\s\S]*ресурс Неукротимого/)
  assert.doesNotMatch(migration, /banneret_(second_wind|action_surge|indomitable)/)
})
