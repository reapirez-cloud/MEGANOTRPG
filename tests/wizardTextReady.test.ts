import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  classReference,
  type ReferenceClass,
  type ReferenceFeature,
} from "../src/data/classReference.ts"
import {
  vossExplanationHasBoilerplate,
  vossExplanationHasRulesMeta,
  vossTextHasModernRegister,
} from "../src/data/vossVoice.ts"

const migration = fs.readFileSync("supabase/migrations/20260831100000_wizard_2024_text_pack.sql", "utf8")
const bootstrap = fs.readFileSync("supabase/migrations/20260831102000_guard_current_class_catalog_bootstrap.sql", "utf8")
const ledger = fs.readFileSync("src/rule-templates/CLASS_WORK_STATUS.md", "utf8")

function allWizardFeatures(wizard: ReferenceClass): ReferenceFeature[] {
  return wizard.levels.flatMap((entry) => entry.features)
}

function wizardLedgerBlock(): string {
  const start = ledger.indexOf("## Wizard (`class:wizard`)")
  assert.notEqual(start, -1)
  const end = ledger.indexOf("\n---", start)
  assert.notEqual(end, -1)
  return ledger.slice(start, end)
}

test("Wizard 2024 text package explicitly stops before runtime mechanics", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE: class_text/)
  assert.match(migration, /CLASS_WORK_LEDGER: src\/rule-templates\/CLASS_WORK_STATUS\.md/)
  assert.match(migration, /presentation-only/i)
  assert.doesNotMatch(migration, /insert into public\.rule_template_levels/i)
  assert.doesNotMatch(migration, /insert into public\.character_resource_states/i)
})

test("Wizard reference exposes the rebuilt base class and no subclasses", () => {
  const wizard = classReference.find((entry) => entry.catalogKey === "class:wizard")
  assert.ok(wizard)
  assert.equal(wizard.subclasses.length, 0)
  assert.equal(wizard.levels[0]?.level, 1)
  assert.equal(wizard.levels.at(-1)?.level, 20)
})

test("Wizard exact text covers every base feature present in this subclass-free pass", () => {
  const wizard = classReference.find((entry) => entry.catalogKey === "class:wizard")
  assert.ok(wizard)
  const features = allWizardFeatures(wizard)
  const names = features.map((entry) => entry.name)

  for (const expected of [
    "Заклинания",
    "Знаток ритуалов",
    "Магическое восстановление",
    "Учёный",
    "Запоминание заклинания",
    "Мастерство заклинаний",
    "Фирменные заклинания",
  ]) {
    assert.equal(names.includes(expected), true, `missing Wizard feature: ${expected}`)
  }

  for (const feature of features) {
    assert.equal(feature.description.trim().length > 80, true, `Wizard rule too short: ${feature.name}`)
    assert.equal(feature.authorExplanation?.trim().length ? true : false, true, `missing Voss explanation: ${feature.name}`)
    assert.equal(feature.authorComment?.trim().length ? true : false, true, `missing Voss comment: ${feature.name}`)
  }
})

test("Wizard Spellcasting is self-contained instead of pointing at an unseen table", () => {
  const wizard = classReference.find((entry) => entry.catalogKey === "class:wizard")
  assert.ok(wizard)
  const spellcasting = allWizardFeatures(wizard).find((entry) => entry.name === "Заклинания")
  assert.ok(spellcasting)

  assert.match(spellcasting.description, /6 заклинаний 1-го уровня/i)
  assert.match(spellcasting.description, /ещё 2 заклинания/i)
  assert.match(spellcasting.description, /3\/4\/4\/4\/5\/5\/6\/6\/7\/7\/8\/8\/9\/9\/10\/10\/11\/11\/12\/13/i)
  assert.match(spellcasting.description, /Интеллект/i)
  assert.match(spellcasting.description, /Книга заклинаний/i)
})

test("Wizard high-level rules keep the important 2024 eligibility and recharge limits", () => {
  const wizard = classReference.find((entry) => entry.catalogKey === "class:wizard")
  assert.ok(wizard)
  const features = allWizardFeatures(wizard)
  const mastery = features.find((entry) => entry.name === "Мастерство заклинаний")
  const signatures = features.find((entry) => entry.name === "Фирменные заклинания")
  const recovery = features.find((entry) => entry.name === "Магическое восстановление")
  assert.ok(mastery)
  assert.ok(signatures)
  assert.ok(recovery)

  assert.match(mastery.description, /1-го уровня/i)
  assert.match(mastery.description, /2-го уровня/i)
  assert.match(mastery.description, /Время накладывания.*Действие/i)
  assert.match(mastery.description, /без траты ячейки/i)
  assert.match(mastery.description, /одн(?:о|о из).*после.*длительного отдыха/i)
  assert.match(signatures.description, /два заклинания 3-го уровня/i)
  assert.match(signatures.description, /по одному разу/i)
  assert.match(signatures.description, /короткого или длительного отдыха/i)
  assert.match(recovery.description, /округлённой вверх/i)
  assert.match(recovery.description, /не выше 5-го уровня/i)
})

test("every Wizard feature card has genuinely authored in-world Voss narration", () => {
  const wizard = classReference.find((entry) => entry.catalogKey === "class:wizard")
  assert.ok(wizard)

  const narrations = [wizard.authorExplanation, ...allWizardFeatures(wizard).map((entry) => entry.authorExplanation)]
    .filter((entry): entry is string => Boolean(entry?.trim()))

  assert.equal(narrations.length, allWizardFeatures(wizard).length + 1)
  for (const [index, narration] of narrations.entries()) {
    assert.equal(vossExplanationHasRulesMeta(narration), false, `Wizard Voss narration ${index + 1} leaked mechanics`)
    assert.equal(vossExplanationHasBoilerplate(narration), false, `Wizard Voss narration ${index + 1} leaked boilerplate`)
    assert.equal(vossTextHasModernRegister(narration), false, `Wizard Voss narration ${index + 1} leaked modern register`)
  }

  assert.match(migration, /человек, который посмотрел на устройство мироздания и решил, что главная его проблема — отсутствие хорошего конспекта/)
  assert.match(migration, /Книгу волшебника лучше не мочить/)
})

test("Wizard catalog lifecycle survives the legacy builtin prune without reviving other removed classes", () => {
  assert.match(bootstrap, /CLASS_MIGRATION_SCOPE: infrastructure/)
  assert.match(bootstrap, /'class:fighter', 'class:druid', 'class:cleric', 'class:wizard'/)
  assert.match(bootstrap, /zzzz_campaigns_install_wizard_2024_text_pack/)
  assert.match(bootstrap, /private\.install_wizard_2024_text_pack\(new\.id\)/)
  assert.match(bootstrap, /private\.prune_removed_builtin_class_catalog\(v_campaign\.id\)/)
  assert.doesNotMatch(bootstrap, /class:(?:artificer|bard|barbarian|warlock|monk|paladin|rogue|ranger|sorcerer)'/)
})

test("Wizard ledger keeps text ready while mechanics and subclass work advance honestly", () => {
  const wizard = wizardLedgerBlock()
  assert.match(wizard, /\*\*Text:\*\* `READY`/)
  assert.match(wizard, /\*\*Mechanics\/runtime:\*\* `IN_PROGRESS`/)
  assert.match(wizard, /last_text_audit: 2026-08-31/)
  assert.match(wizard, /last_mechanics_audit_started: 2026-08-31/)
  assert.match(wizard, /subclasses: WAVE_0_CONTRACT_READY_CONTENT_NOT_INCLUDED/)
  assert.match(wizard, /subclass_wave_0: READY_2026_08_31/)
  assert.match(wizard, /subclass_supported_count: 13/)
  assert.match(wizard, /physical spellbook and book-gated preparation are implemented/i)
  assert.match(wizard, /Spellbook as authoritative owned-spell state/)
  assert.match(wizard, /Arcane Recovery: implemented in dev/i)
  assert.match(wizard, /does \*\*not\*\* install empty or unfinished subclass rows/i)
  assert.doesNotMatch(wizard, /\*\*Mechanics\/runtime:\*\* `READY`/)
})
