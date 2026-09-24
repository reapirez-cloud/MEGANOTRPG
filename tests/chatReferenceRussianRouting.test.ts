import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

const chatCard = read("src/ui-v1-isolated/chat-room/ChatGameEventCard.tsx")
const chatSheet = read("src/components/chat/ChatSpellDetailSheet.tsx")
const invocationReference = read(
  "src/components/reference/WarlockInvocationsReference.tsx",
)
const translationMigration = read(
  "supabase/migrations/20260924224500_spell_reference_ru_route_and_gap_fill_v1.sql",
)

test("chat spell inspection opens canonical Russian mechanics before commentary", () => {
  assert.match(
    chatCard,
    /row\.rules_text \|\|[\s\S]*row\.effect_summary \|\|[\s\S]*payloadDescription\(event\)/,
  )
  assert.match(chatCard, /title: row\.name_ru\?\.trim\(\) \|\| presentation\.title/)
  assert.doesNotMatch(
    chatCard,
    /description:[\s\S]{0,180}row\.author_description/,
  )

  assert.match(
    chatSheet,
    /spell\.rules_text \|\| spell\.effect_summary/,
  )
  assert.match(chatSheet, /<small>Механика<\/small>/)
  assert.doesNotMatch(chatSheet, /объясняет|Заметка Восса/)
})

test("chat class ability inspection can fall back to the Russian reference feature catalog", () => {
  assert.match(chatCard, /loadReferenceFeatureDetail/)
  assert.match(chatCard, /reference_definition_revisions/)
  assert.match(chatCard, /reference_definitions/)
  assert.match(chatCard, /definition\.data\.kind !== "feature"/)
  assert.match(chatCard, /Таинственное воззвание/)
  assert.match(chatCard, /minimum_warlock_level/)
  assert.match(chatCard, /name_en/)
})

test("warlock invocation reference is DB-backed and every row is inspectable", () => {
  assert.match(invocationReference, /reference_definitions/)
  assert.match(invocationReference, /reference_definition_revisions/)
  assert.match(invocationReference, /feature_kind !== "eldritch_invocation"/)
  assert.match(invocationReference, /class_key !== "warlock"/)
  assert.match(invocationReference, /onClick=\{\(\) => setSelected\(entry\)\}/)
  assert.match(invocationReference, /reference-feature-detail-overlay/)
  assert.match(invocationReference, /selected\.rulesText \|\| selected\.summary/)
})

test("remaining spell catalog translation gaps are explicitly closed", () => {
  for (const slug of [
    "thorn-whip",
    "arcane-vigor",
    "leomund-s-secret-chest",
    "mordenkainen-s-faithful-hound",
    "mordenkainen-s-private-sanctum",
    "otiluke-s-resilient-sphere",
    "wrathful-smite",
    "branding-smite",
    "feign-death",
    "staggering-smite",
    "banishing-smite",
    "bigbys-hand",
  ]) {
    assert.ok(
      translationMigration.includes(`slug='${slug}'`),
      `Russian reference migration must cover ${slug}`,
    )
  }

  assert.match(translationMigration, /name_ru='Терновый кнут'/)
  assert.match(translationMigration, /name_ru='Магическая бодрость'/)
  assert.match(translationMigration, /name_ru='Тайный сундук Леомунда'/)
  assert.match(translationMigration, /name_ru='Верный пёс Морденкайнена'/)
  assert.match(translationMigration, /name_ru='Личное святилище Морденкайнена'/)
  assert.match(translationMigration, /name_ru='Упругая сфера Отилюка'/)
})
