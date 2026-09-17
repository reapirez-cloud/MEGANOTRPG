import assert from "node:assert/strict"
import test from "node:test"

import type { CharacterSpell } from "../src/types/characterSheet.ts"
import {
  buildSpellbookRenderModel,
  SPELLBOOK_CANTRIP_PREVIEW_LIMIT,
} from "../src/components/characters/spellbookRender.ts"

function spell(id: string, level: number, prepared = true): CharacterSpell {
  return {
    id,
    character_id: "character",
    name: id,
    spell_level: level,
    school: "",
    casting_time: "Действие",
    spell_range: "60 футов",
    duration: "Мгновенно",
    components: "В, С",
    concentration: false,
    ritual: false,
    prepared,
    cast_mode: level === 0 ? "cantrip" : "slot",
    slot_level: level === 0 ? null : level,
    description: "",
    source: "",
    sort_order: 0,
    created_at: "",
    updated_at: "",
  }
}

function model(spells: CharacterSpell[], selectedLevel: number | null, mode: "prepared" | "known" = "known") {
  return buildSpellbookRenderModel({
    resources: [],
    spells,
    mode,
    selectedLevel,
  })
}

test("stage 5 keeps cantrips out of the numbered spell list and exposes a four-item preview", () => {
  const spells = [
    spell("c1", 0),
    spell("c2", 0),
    spell("c3", 0),
    spell("c4", 0),
    spell("c5", 0),
    spell("c6", 0),
    spell("level-one", 1),
  ]
  const result = model(spells, null)

  assert.equal(SPELLBOOK_CANTRIP_PREVIEW_LIMIT, 4)
  assert.equal(result.cantrips.count, 6)
  assert.equal(result.cantrips.expanded, false)
  assert.deepEqual(result.cantrips.previewSpells.map((entry) => entry.id), ["c1", "c2", "c3", "c4"])
  assert.deepEqual(result.cantrips.visibleSpells.map((entry) => entry.id), ["c1", "c2", "c3", "c4"])
  assert.equal(result.cantrips.hiddenCount, 2)
  assert.deepEqual(result.visibleLeveledSpells.map((entry) => entry.id), ["level-one"])
})

test("stage 5 expands the cantrip section when zero level is selected", () => {
  const spells = Array.from({ length: 6 }, (_, index) => spell(`c${index + 1}`, 0))
  const result = model(spells, 0)

  assert.equal(result.cantrips.expanded, true)
  assert.equal(result.cantrips.visibleSpells.length, 6)
  assert.equal(result.visibleLeveledSpells.length, 0)
  assert.deepEqual(result.visibleSpells.map((entry) => entry.id), spells.map((entry) => entry.id))
})

test("stage 5 hides cantrip previews while a numbered circle is selected", () => {
  const result = model([
    spell("cantrip", 0),
    spell("level-one", 1),
    spell("level-two", 2),
  ], 2)

  assert.equal(result.cantrips.count, 1)
  assert.equal(result.cantrips.visibleSpells.length, 0)
  assert.deepEqual(result.visibleLeveledSpells.map((entry) => entry.id), ["level-two"])
})

test("stage 5 respects prepared mode before calculating the cantrip panel", () => {
  const result = model([
    spell("prepared-cantrip", 0, true),
    spell("known-cantrip", 0, false),
    spell("prepared-level-one", 1, true),
  ], null, "prepared")

  assert.equal(result.cantrips.count, 1)
  assert.deepEqual(result.cantrips.visibleSpells.map((entry) => entry.id), ["prepared-cantrip"])
  assert.deepEqual(result.visibleLeveledSpells.map((entry) => entry.id), ["prepared-level-one"])
})
