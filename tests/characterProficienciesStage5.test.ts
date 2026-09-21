import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  CHARACTER_PROFICIENCY_CLASS_COVERAGE,
  CHARACTER_PROFICIENCY_PENDING_CLASS_KEYS,
} from "../src/ui-v1-isolated/characterProficiencyClassCoverage.ts"
import {
  characterProficiencyCatalogEntry,
} from "../src/ui-v1-isolated/characterProficienciesCatalog.ts"

const monkMigration = fs.readFileSync(
  "supabase/migrations/20260919150000_monk_proficiencies_stage5_v1.sql",
  "utf8",
)
const warlockMigration = fs.readFileSync(
  "supabase/migrations/20260919151000_warlock_proficiencies_stage5_v1.sql",
  "utf8",
)

test("stage 5 reserves exactly the thirteen project class identities", () => {
  assert.equal(CHARACTER_PROFICIENCY_CLASS_COVERAGE.length, 13)
  assert.equal(
    new Set(CHARACTER_PROFICIENCY_CLASS_COVERAGE.map((entry) => entry.catalogKey)).size,
    13,
  )
})

test("class proficiency coverage certifies Rogue Stage 2 and leaves three future runtimes pending", () => {
  assert.equal(
    CHARACTER_PROFICIENCY_CLASS_COVERAGE.filter(
      (entry) => entry.status === "certified",
    ).length,
    10,
  )
  assert.deepEqual(
    new Set(CHARACTER_PROFICIENCY_PENDING_CLASS_KEYS),
    new Set([
      "class:barbarian",
      "class:ranger",
      "class:artificer",
    ]),
  )
})

test("pending classes never invent proficiency grants", () => {
  for (const entry of CHARACTER_PROFICIENCY_CLASS_COVERAGE) {
    if (entry.status !== "mechanics_pending") continue
    assert.deepEqual(entry.expectedKeys, [])
  }
})

test("Monk coverage uses the already-authored 2024 core-trait weapon/save contract", () => {
  const monk = CHARACTER_PROFICIENCY_CLASS_COVERAGE.find(
    (entry) => entry.catalogKey === "class:monk",
  )!
  assert.deepEqual(
    new Set(monk.expectedKeys),
    new Set([
      "weapon:simple",
      "weapon:martial-light",
      "savingThrow:strength",
      "savingThrow:dexterity",
    ]),
  )
  assert.equal(
    characterProficiencyCatalogEntry("weapons", "weapon:martial-light")?.label,
    "Воинское оружие со свойством «Лёгкое»",
  )
  assert.match(monkMigration, /CLASS_INTEGRATION_STRICT: class:monk/)
  assert.match(monkMigration, /weapon:martial-light/)
  assert.match(monkMigration, /savingThrow:strength/)
  assert.match(monkMigration, /savingThrow:dexterity/)
})

test("Warlock coverage restores the authored light-armor simple-weapon and save baseline", () => {
  const warlock = CHARACTER_PROFICIENCY_CLASS_COVERAGE.find(
    (entry) => entry.catalogKey === "class:warlock",
  )!
  assert.deepEqual(
    new Set(warlock.expectedKeys),
    new Set([
      "weapon:simple",
      "armor:light",
      "savingThrow:wisdom",
      "savingThrow:charisma",
    ]),
  )
  assert.match(warlockMigration, /CLASS_INTEGRATION_STRICT: class:warlock/)
  assert.match(warlockMigration, /weapon:simple/)
  assert.match(warlockMigration, /armor:light/)
  assert.match(warlockMigration, /savingThrow:wisdom/)
  assert.match(warlockMigration, /savingThrow:charisma/)
})

test("Stage 5 forward migrations are idempotent and future-campaign aware", () => {
  for (const sql of [monkMigration, warlockMigration]) {
    assert.ok(sql.includes("not exists ("))
    assert.match(sql, /after insert on public\.campaigns/)
    assert.match(sql, /for v_campaign in select id from public\.campaigns loop/)
    assert.match(sql, /proficiency_stage5_status','READY'/)
  }
})
