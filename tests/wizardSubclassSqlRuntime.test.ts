import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  WIZARD_SUBCLASS_RUNTIME_REVISION,
  wizardSubclassRuntimeBundles,
} from "../src/rule-templates/wizardSubclassMechanics.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260902060000_wizard_subclass_persistent_state_policy.sql",
  "utf8",
)
const v3Migration = fs.readFileSync(
  "supabase/migrations/20260902123814_wizard_subclass_runtime_v3.sql",
  "utf8",
)

test("Wizard SQL installer matches the canonical persistent Overchannel lifecycle", () => {
  assert.match(migration, /'evoker-overchannel-safe-action'/)
  assert.match(
    migration,
    /'kind','state','key',v_state_overchannel,'operation','SET','value',0/,
  )
  assert.match(migration, /'evoker-overchannel-repeat-action'/)
  assert.match(
    migration,
    /'condition',jsonb_build_object\('kind','state','key',v_state_overchannel,'operator','EXISTS'\)/,
  )
  assert.match(
    migration,
    /'kind','state','key',v_state_overchannel,'operation','ADD','value',1/,
  )
})

test("Wizard SQL installer uses canonical resourceCosts for migrated persistent actions", () => {
  assert.match(migration, /'resourceCosts'/)
  assert.doesNotMatch(migration, /'resourceKey'/)
  assert.doesNotMatch(migration, /'resourceCost'/)
})

test("Wizard v3 SQL installer embeds every TypeScript runtime level and choice payload", () => {
  const subclasses = wizardSubclassRuntimeBundles.filter((bundle) => bundle.template.kind === "subclass")
  assert.equal(subclasses.length, 13)
  assert.match(v3Migration, new RegExp(WIZARD_SUBCLASS_RUNTIME_REVISION.replaceAll("@", "\\@")))

  for (const bundle of subclasses) {
    assert.ok(v3Migration.includes(`'${bundle.template.catalog_key}'`), bundle.template.catalog_key || bundle.template.slug)
    for (const row of bundle.levels) {
      const mechanics = JSON.stringify(row.mechanics).replaceAll("'", "''")
      const choices = JSON.stringify(row.choices).replaceAll("'", "''")
      assert.ok(v3Migration.includes(`'${mechanics}'::jsonb`), `${bundle.template.catalog_key} level ${row.level} mechanics`)
      assert.ok(v3Migration.includes(`'${choices}'::jsonb`), `${bundle.template.catalog_key} level ${row.level} choices`)
    }
  }
})

test("Wizard v3 SQL recovery supports exact-value set without weakening persistent triggers", () => {
  assert.match(v3Migration, /elsif v_restore='set'/)
  assert.match(v3Migration, /set current=least\(max_snapshot,v_amount\)/)
  assert.match(v3Migration, /p_trigger not in \('short_rest','long_rest','dawn'\)/)
  assert.match(v3Migration, /install_wizard_subclass_runtime_for_new_campaign_v3/)
})
