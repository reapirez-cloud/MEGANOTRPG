import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { classReference } from "../src/data/classReference.ts"

const historicalClassSql = fs.readFileSync(
  "supabase/migrations/20260827180000_official_class_catalog.sql",
  "utf8",
)
const historicalSubclassSql = fs.readFileSync(
  "supabase/migrations/20260827180100_official_subclass_catalog.sql",
  "utf8",
)
const resetSql = fs.readFileSync(
  "supabase/migrations/20260829235500_remove_legacy_builtin_classes.sql",
  "utf8",
)

function embeddedCatalog(sql: string) {
  const match = sql.match(/v_catalog jsonb := \$catalog\$(.*?)\$catalog\$::jsonb/s)
  assert.ok(match?.[1], "embedded historical catalog is missing")
  return JSON.parse(match[1]) as Array<Record<string, any>>
}

test("historical full-catalog migrations stay immutable migration history", () => {
  const historicalClasses = embeddedCatalog(historicalClassSql)
  const historicalSubclasses = embeddedCatalog(historicalSubclassSql)

  const keys = new Set(historicalClasses.map((entry) => entry.key))
  keys.add("druid")
  assert.equal(keys.size, 13)
  assert.equal(historicalSubclasses.length, 125)
  assert.match(historicalClassSql, /private\.install_official_class_catalog/)
  assert.match(historicalSubclassSql, /private\.official_subclass_spell_mechanic/)
})

test("player-facing active reference contains only rebuilt Fighter, Druid and Cleric", () => {
  assert.deepEqual(
    classReference.map((entry) => entry.id).sort(),
    ["cleric", "druid", "fighter"],
  )
  assert.equal(classReference.reduce((sum, entry) => sum + entry.subclasses.length, 0), 32)
})

test("legacy reset deletes builtin leftovers without touching custom easter-egg classes", () => {
  assert.match(resetSql, /is_builtin IS TRUE/)
  assert.match(resetSql, /'class:fighter', 'class:druid', 'class:cleric'/)
  assert.match(resetSql, /custom\/non-builtin templates are intentionally outside this cleanup/i)
  assert.match(resetSql, /Жопка/)
})
