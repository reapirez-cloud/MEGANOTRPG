import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  resolveCharacterContract,
} from "../src/character-engine/index.ts"
import {
  buildLegacyCharacterEngineInput,
} from "../src/lib/legacyCharacterEngineAdapter.ts"
import type {
  CharacterFeature,
  CharacterSheet,
} from "../src/types/characterSheet.ts"
import {
  buildCharacterAbilitiesReadModel,
} from "../src/ui-v1-isolated/characterAbilitiesReadModel.ts"

function sheet(): CharacterSheet {
  return {
    character_id: "character-1",
    race: "Человек",
    background: "Бывший наёмник",
    alignment: "",
    experience: 0,
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
    armor_class: 10,
    initiative_bonus: 0,
    speed: 9,
    proficiency_bonus: 3,
    max_hp: 20,
    current_hp: 20,
    temp_hp: 0,
    hit_dice: "1d10",
    death_save_successes: 0,
    death_save_failures: 0,
    passive_perception: 10,
    saving_throw_proficiencies: [],
    skill_proficiencies: {},
    proficiencies: "",
    languages: "",
    senses: "",
    personality_traits: "",
    ideals: "",
    bonds: "",
    flaws: "",
    backstory: "",
    notes: "",
    spellcasting_enabled: false,
    spell_change_unlocked: false,
    spellcasting_ability: null,
    spell_save_dc: null,
    spell_attack_bonus: null,
    spell_slots: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }
}

function feature(
  id: string,
  kind: CharacterFeature["kind"],
  name: string,
  description: string,
): CharacterFeature {
  return {
    id,
    character_id: "character-1",
    kind,
    name,
    description,
    mechanics: [{
      id: id + ":ac",
      type: "numeric",
      target: "combat.ac",
      operation: "ADD",
      value: 1,
    }],
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }
}

test("real character background features and active effects flow through the runtime adapter into approved groups", () => {
  const characterSheet = sheet()
  const features: CharacterFeature[] = [
    feature(
      "background-1",
      "background_feature",
      "Боевой опыт",
      "Прошлая служба дала практический опыт.",
    ),
    feature(
      "effect-1",
      "effect",
      "Благословение Тени",
      "Пока действует, персонажа укрывает тень.",
    ),
    feature(
      "generic-1",
      "feature",
      "Личная привычка",
      "Обычная уникальная особенность.",
    ),
  ]

  const input = buildLegacyCharacterEngineInput({
    character: {
      id: "character-1",
      name: "Тест",
      level: 5,
    },
    sheet: characterSheet,
    spells: [],
    features,
    templateBundles: [],
    resourceStates: {},
    suppressedSourceIds: [],
  })
  const contract = resolveCharacterContract(input)
  const model = buildCharacterAbilitiesReadModel({
    contract,
    contributions: input.contributions,
    sourceNodes: [],
    backgroundName: characterSheet.background,
  })

  const background = model.groups.find(
    (group) => group.key === "background",
  )!
  const effects = model.groups.find(
    (group) => group.key === "effect",
  )!

  assert.equal(background.rows.length, 1)
  assert.equal(background.rows[0].label, "Боевой опыт")
  assert.equal(background.rows[0].sourceName, "Бывший наёмник")
  assert.equal(background.rows[0].sourceId, "feature:background-1")
  assert.equal(background.rows[0].capabilities.suppress, true)
  assert.deepEqual(background.sourceNames, ["Бывший наёмник"])

  assert.equal(effects.rows.length, 1)
  assert.equal(effects.rows[0].label, "Благословение Тени")
  assert.equal(effects.rows[0].sourceName, "Активные состояния")
  assert.equal(effects.rows[0].sourceId, "feature:effect-1")
  assert.equal(effects.rows[0].capabilities.suppress, true)
  assert.deepEqual(effects.sourceNames, ["Активные состояния"])

  assert.ok(
    model.unclassifiedSourceIds.some(
      (sourceId) =>
        sourceId === "feature:generic-1" ||
        sourceId === "legacy-feature:generic-1",
    ),
  )
})

test("stage 6 feature kinds use one canonical source identity for prose and mechanics", () => {
  const input = buildLegacyCharacterEngineInput({
    character: {
      id: "character-1",
      name: "Тест",
      level: 5,
    },
    sheet: sheet(),
    spells: [],
    features: [
      feature(
        "background-1",
        "background_feature",
        "Боевой опыт",
        "",
      ),
      feature(
        "effect-1",
        "effect",
        "Благословение",
        "",
      ),
    ],
    templateBundles: [],
    resourceStates: {},
    suppressedSourceIds: [],
  })

  const backgroundSources = new Set(
    input.contributions
      .filter((entry) =>
        entry.source.id === "feature:background-1"
      )
      .map((entry) => entry.source.id),
  )
  const effectSources = new Set(
    input.contributions
      .filter((entry) =>
        entry.source.id === "feature:effect-1"
      )
      .map((entry) => entry.source.id),
  )

  assert.deepEqual([...backgroundSources], ["feature:background-1"])
  assert.deepEqual([...effectSources], ["feature:effect-1"])
  assert.equal(
    input.contributions.some(
      (entry) =>
        entry.source.id === "legacy-feature:background-1" ||
        entry.source.id === "legacy-feature:effect-1",
    ),
    false,
  )
})

const editor = fs.readFileSync(
  "src/components/characters/FeatureEditor.tsx",
  "utf8",
)
const view = fs.readFileSync(
  "src/ui-v1-isolated/CharacterView.tsx",
  "utf8",
)
const migration = fs.readFileSync(
  "supabase/migrations/20260918150053_character_feature_background_effect_kinds.sql",
  "utf8",
)

test("GM feature authoring exposes explicit Background and Effect kinds", () => {
  assert.match(editor, /value: "background_feature"/)
  assert.match(editor, /label: "Черта предыстории"/)
  assert.match(editor, /value: "effect"/)
  assert.match(editor, /label: "Активный эффект"/)
})

test("abilities read-model receives the canonical narrative background name", () => {
  assert.match(
    view,
    /backgroundName: control\.sheet\?\.background/,
  )
})

test("database migration permits only the two new explicit stage 6 kinds in addition to existing feature kinds", () => {
  assert.match(migration, /'background_feature'::text/)
  assert.match(migration, /'effect'::text/)
  assert.match(
    migration,
    /add constraint character_features_kind_check/,
  )
})
