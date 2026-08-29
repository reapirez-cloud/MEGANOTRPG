import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { druidReference } from "../src/data/classes/druidReference.ts"
import { spellAuthorVoiceRules } from "../src/data/spellReferenceAuthor.ts"
import { vossCommentHasDeveloperLeak, vossVoice, vossVoiceRules } from "../src/data/vossVoice.ts"

const migration = fs.readFileSync("supabase/migrations/20260829150000_fighter_druid_voss_coverage.sql", "utf8")
const referenceGuide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const mechanicTypes = fs.readFileSync("src/types/characterMechanics.ts", "utf8")

test("Reynar Voss has one canonical voice contract for spells and class features", () => {
  assert.equal(vossVoice.name, "Рейнар Восс")
  assert.ok(vossVoice.traits.includes("саркастичный"))
  assert.ok(vossVoice.traits.includes("ироничный"))
  assert.ok(vossVoice.traits.includes("циничный"))
  assert.ok(vossVoice.traits.includes("чёрный юмор"))
  assert.equal(spellAuthorVoiceRules, vossVoiceRules)
  assert.ok(vossVoiceRules.some((rule) => /1–2|коротк/i.test(rule)))
  assert.ok(vossVoiceRules.some((rule) => /не сообщает новые числа/i.test(rule)))
  assert.ok(vossVoiceRules.some((rule) => /Character Engine/i.test(rule)))
})

test("developer language is rejected from Voss narrator copy", () => {
  assert.equal(vossCommentHasDeveloperLeak("Могильщики любят стабильный рост показателей."), false)
  assert.equal(vossCommentHasDeveloperLeak("В этой кампании мы используем другую реализацию."), true)
  assert.equal(vossCommentHasDeveloperLeak("Character Engine спишет ресурс."), true)
})

test("every static Druid class feature already carries a Voss note", () => {
  assert.ok(druidReference.features.length > 0)
  for (const feature of druidReference.features) {
    assert.ok(feature.voss?.trim(), `Missing Voss note on Druid feature: ${feature.name}`)
    assert.equal(vossCommentHasDeveloperLeak(feature.voss || ""), false, `Developer-language leak in Druid feature: ${feature.name}`)
  }
})

test("reference cards can read narrator copy from any renderer-only mechanic group", () => {
  assert.match(mechanicTypes, /authorComment\?: string/)
  assert.match(mechanicTypes, /Renderer-only metadata shared by every mechanic kind/)
  assert.match(referenceGuide, /mechanic\.presentation\?\.authorComment\?\.trim\(\)/)
  assert.match(referenceGuide, /payloadText\(mechanic, "authorComment"\)/)
})

test("Fighter and Druid Voss migration is presentation-only and self-gating", () => {
  assert.match(migration, /CLASS_WORK_STATUS: fighter:text=READY;mechanics=NOT_AUDITED; druid:text=READY;mechanics=NOT_AUDITED/)
  assert.match(migration, /CLASS_STATUS_LEDGER: src\/rule-templates\/CLASS_WORK_STATUS\.md/)
  assert.match(migration, /PRESENTATION ONLY/)
  assert.match(migration, /presentation,authorComment/)
  assert.match(migration, /Voss coverage failed/)
  assert.match(migration, /Voss voice failed/)

  assert.doesNotMatch(migration, /resourceCosts/)
  assert.doesNotMatch(migration, /option_mechanics/)
  assert.doesNotMatch(migration, /payload,mechanic/)
  assert.doesNotMatch(migration, /grantOperation/)

  const featureCommentBlock = migration.split("update public.rule_template_levels rtl")[0]
  const fighterSourceComments = featureCommentBlock.match(/\('(?:class:fighter|subclass:fighter:[^']+)','[^']+','/g) || []
  assert.equal(fighterSourceComments.length, 72, "every current Fighter feature source must get an explicit Voss comment")
})
