import assert from "node:assert/strict"
import test from "node:test"

import type { CharacterSpell } from "../src/types/characterSheet.ts"
import {
  buildSpellMiniIcons,
  compactSpellComponents,
  spellMiniIconAriaLabel,
} from "../src/components/characters/spellMiniIcons.ts"

function spell(overrides: Partial<CharacterSpell> = {}): CharacterSpell {
  return {
    id: "spell",
    character_id: "character",
    name: "Тестовое заклинание",
    spell_level: 2,
    school: "Воплощение",
    casting_time: "Действие",
    spell_range: "60 футов",
    duration: "1 минута",
    components: "В, С, М (кусочек стекла)",
    concentration: false,
    ritual: false,
    prepared: false,
    cast_mode: "slot",
    slot_level: 2,
    description: "",
    source: "",
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  }
}

test("stage 4 mini icons expose stable renderer metadata in one order", () => {
  const items = buildSpellMiniIcons(spell({ concentration: true, ritual: true, prepared: true }))

  assert.deepEqual(items.map((item) => item.kind), [
    "casting-time",
    "range",
    "duration",
    "components",
    "concentration",
    "ritual",
    "prepared",
  ])
  assert.equal(items.find((item) => item.kind === "components")?.value, "В · С · М")
  assert.equal(items.find((item) => item.kind === "concentration")?.emphasized, true)
  assert.equal(items.find((item) => item.kind === "ritual")?.emphasized, true)
  assert.equal(items.find((item) => item.kind === "prepared")?.emphasized, true)
})

test("stage 4 never infers concentration or ritual from prose", () => {
  const items = buildSpellMiniIcons(spell({
    duration: "Концентрация, до 10 минут",
    concentration: false,
    ritual: false,
  }))

  assert.equal(items.some((item) => item.kind === "concentration"), false)
  assert.equal(items.some((item) => item.kind === "ritual"), false)
  assert.equal(items.find((item) => item.kind === "duration")?.value, "Концентрация, до 10 минут")
})

test("stage 4 component labels stay compact for russian and latin catalog rows", () => {
  assert.equal(compactSpellComponents("В, С, М (редкий порошок)"), "В · С · М")
  assert.equal(compactSpellComponents("V, S, M (a tiny bell)"), "V · S · M")
  assert.equal(compactSpellComponents("В"), "В")
})

test("stage 4 omits missing facts instead of inventing placeholder mini icons", () => {
  const items = buildSpellMiniIcons(spell({
    casting_time: "",
    spell_range: "",
    duration: "",
    components: "",
  }))

  assert.deepEqual(items, [])
})

test("stage 4 mini icon aria label keeps full semantic label", () => {
  const item = buildSpellMiniIcons(spell())[0]
  assert.ok(item)
  assert.equal(spellMiniIconAriaLabel(item), "Накладывание: Действие")
})
