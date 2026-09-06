import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migrationPath = "supabase/migrations/20260907084500_warlock_hunger_of_hadar_catalog.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

test("Warlock Stage 5 seeds the missing PHB 2024 Hunger of Hadar identity", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*infrastructure/i)
  assert.match(migration, /'hunger-of-hadar'/)
  assert.match(migration, /'Hunger of Hadar'/)
  assert.match(migration, /'Голод Хадара'/)
  assert.match(migration, /\b3\s*,\s*\n\s*'Conjuration'/)
  assert.match(migration, /'Player''s Handbook 2024'/)
  assert.match(migration, /'official'/)
})

test("Hunger of Hadar stays contextual instead of inventing eager turn-state rolls", () => {
  assert.match(migration, /'contextual'/)
  assert.match(migration, /начал[а-я]*\s+и\s+кон[а-я]*\s+ход/i)
  assert.doesNotMatch(migration, /'roll'\s*,\s*\n\s*jsonb_build_object/i)
})

test("the shared catalog exposes Hunger of Hadar to Warlock without touching subclass ownership", () => {
  assert.match(migration, /insert\s+into\s+public\.spell_catalog_classes/i)
  assert.match(migration, /select\s+id,\s*'warlock'/i)
  assert.match(migration, /where\s+slug\s*=\s*'hunger-of-hadar'/i)
  assert.doesNotMatch(migration, /rule_templates|rule_template_levels/i)
})