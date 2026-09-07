import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { resolveTemplateChoiceStates } from "../src/rule-templates/choiceState.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"
import { warlockSupplementalRuntimeBundles } from "../src/rule-templates/warlockSupplementalSubclasses.ts"
import type { StoredMechanic } from "../src/types/characterMechanics.ts"

const migrationPath = "supabase/migrations/20260907125000_warlock_ready_stage4_source_gated_spells.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

const shieldSpell = {
  id: "warlock-ready-stage4-shield",
  type: "spell",
  sourceKey: "warlock-base:pact-magic",
  key: "spell:shield",
  catalogSlug: "shield",
  variantKey: "warlock-base:pact-magic:shield",
  payload: {
    spell: { name: "Щит", level: 1, school: "Abjuration" },
    preparation: { mode: "always_prepared" },
    methods: [{
      key: "warlock-pact-2",
      kind: "pact_magic",
      ability: "charisma",
      requiresPrepared: false,
      resourceOptions: [{ key: "warlock-pact-2", castLevel: 2, costs: [{ key: "warlock_pact_slots", amount: 1 }] }],
    }],
  },
} as StoredMechanic

const sanctuarySpell = {
  ...shieldSpell,
  id: "warlock-ready-stage4-sanctuary",
  key: "spell:sanctuary",
  catalogSlug: "sanctuary",
  variantKey: "warlock-base:pact-magic:sanctuary",
  payload: {
    ...shieldSpell.payload,
    spell: { name: "Убежище", level: 1, school: "Abjuration" },
  },
} as StoredMechanic

function pactChoice(option: "shield" | "sanctuary"): RuleChoiceDefinition {
  const isGenie = option === "sanctuary"
  return {
    key: "warlock_pact_magic_spells",
    label: "Магия договора: подготовленные заклинания",
    target: "trait",
    count: 1,
    options: [option],
    option_labels: { [option]: option },
    option_rules: {
      [option]: {
        source_requirements_any: [{
          catalog_key: isGenie ? "subclass:warlock:genie" : "subclass:warlock:hexblade",
          ...(isGenie ? { choice_key: "warlock_genie_patron_kind", choice_option: "dao" } : {}),
        }],
      },
    },
    option_mechanics: { [option]: [isGenie ? sanctuarySpell : shieldSpell] },
    selection_mode: "player_once",
    replacement_policy: "on_level_change",
    replacement_limit: 1,
    required: true,
    resolved_as: "class_spell",
  }
}

function classBundle(option: "shield" | "sanctuary"): CharacterTemplateBundle {
  return {
    assignment: {
      id: "warlock-ready-stage4-class-assignment",
      character_id: "warlock-ready-stage4-character",
      template_id: "warlock-ready-stage4-class",
      template_level: 5,
      selected_choices: { warlock_pact_magic_spells: [option] },
      assigned_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    },
    template: {
      id: "warlock-ready-stage4-class",
      campaign_id: "campaign",
      kind: "class",
      slug: "warlock",
      name: "Колдун",
      description: "Stage 4 source-gated patron spell fixture.",
      version: 1,
      mechanics: [{
        id: "warlock-ready-stage4-pact-slots",
        type: "resource",
        sourceKey: "warlock-base:pact-magic",
        key: "warlock_pact_slots",
        label: "Ячейки Магии договора",
        max: 2,
        recharge: ["short_rest", "long_rest"],
        initial: "full",
      } as StoredMechanic],
      choices: [pactChoice(option)],
      catalog_key: "class:warlock",
      catalog_revision: "warlock-ready-stage4-test",
      source_kind: "official",
      is_builtin: true,
      is_active: true,
      created_by: null,
      created_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    },
    levels: [],
  }
}

function subclassBundle(kind: "hexblade" | "genie", patronKind?: "dao" | "efreeti"): CharacterTemplateBundle {
  return {
    assignment: {
      id: `warlock-ready-stage4-${kind}-assignment`,
      character_id: "warlock-ready-stage4-character",
      template_id: `warlock-ready-stage4-${kind}`,
      template_level: null,
      selected_choices: patronKind ? { warlock_genie_patron_kind: [patronKind] } : {},
      assigned_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    },
    template: {
      id: `warlock-ready-stage4-${kind}`,
      campaign_id: "campaign",
      kind: "subclass",
      slug: kind,
      name: kind,
      description: "Stage 4 source fixture.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: "warlock-ready-stage4-class",
      unlock_level: 3,
      catalog_key: `subclass:warlock:${kind}`,
      catalog_revision: "warlock-ready-stage4-test",
      source_kind: "official",
      is_builtin: true,
      is_active: true,
      created_by: null,
      created_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    },
    levels: [],
  }
}

function contractFor(bundles: CharacterTemplateBundle[]) {
  const parsed = resolveTemplateBundles(bundles, 5)
  const input: CharacterEngineInput = {
    base: {
      id: "warlock-ready-stage4-character",
      name: "Колдун",
      level: 5,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
      baseMaxHp: 40,
      baseSpeed: 30,
    },
    state: { currentHp: 40, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  }
  return { parsed, contract: resolveCharacterContract(input) }
}

test("Stage 4 migration declares the strict Warlock package and source-gated spell contract", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/i)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*class:warlock/i)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/warlockReadyStage4SupplementalSpellAccess\.test\.ts/i)
  assert.match(migration, /CLASS_WORK_STATUS:\s*src\/rule-templates\/CLASS_WORK_STATUS\.md/i)
  assert.match(migration, /source_requirements_any/)
  assert.match(migration, /character_meets_choice_source_requirements_v1/)
  assert.match(migration, /character_choice_source_requirements_v1/)
  for (const slug of ["wrathful-smite", "branding-smite", "staggering-smite", "banishing-smite", "bigbys-hand", "feign-death"]) {
    assert.match(migration, new RegExp(slug))
  }
})

test("Stage 4 keeps the full Warlock supplemental package inside strict class and resource gates", () => {
  assert.doesNotThrow(() => assertClassPackageQuality(warlockSupplementalRuntimeBundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(warlockSupplementalRuntimeBundles))
  const parsed = resolveTemplateBundles(warlockSupplementalRuntimeBundles, 14)
  assert.ok(parsed.contributions.length > 0)
  const contract = resolveCharacterContract({
    base: {
      id: "warlock-ready-stage4-package",
      name: "Колдун",
      level: 14,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
      baseMaxHp: 90,
      baseSpeed: 30,
    },
    state: { currentHp: 90, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  })
  assert.ok(contract.resources.some((entry) => entry.key === "warlock_pact_slots"))
})

test("Hexblade expanded spell is hidden without its source and becomes real CE spell access with Hexblade", () => {
  const warlock = classBundle("shield")
  const withoutPatron = resolveTemplateChoiceStates([warlock], 5)[0]
  assert.equal(withoutPatron?.options.find((option) => option.key === "shield")?.available, false)
  assert.match(withoutPatron?.options.find((option) => option.key === "shield")?.lockedReason || "", /источник/i)
  assert.equal(contractFor([warlock]).contract.spells.some((spell) => spell.key === "spell:shield"), false)

  const hexblade = subclassBundle("hexblade")
  const withPatron = resolveTemplateChoiceStates([warlock, hexblade], 5)[0]
  assert.equal(withPatron?.options.find((option) => option.key === "shield")?.available, true)
  assert.equal(contractFor([warlock, hexblade]).contract.spells.some((spell) => spell.key === "spell:shield"), true)
})

test("stale patron spell selection stops emitting mechanics after the source subclass disappears", () => {
  const warlock = classBundle("shield")
  const active = contractFor([warlock, subclassBundle("hexblade")])
  const stale = contractFor([warlock])
  assert.ok(active.parsed.contributions.some((entry) => entry.key === "spell:shield"))
  assert.equal(stale.parsed.contributions.some((entry) => entry.key === "spell:shield"), false)
})

test("Genie element spell requires both the Genie subclass and the matching persistent patron kind", () => {
  const warlock = classBundle("sanctuary")
  const dao = resolveTemplateChoiceStates([warlock, subclassBundle("genie", "dao")], 5)[0]
  const efreeti = resolveTemplateChoiceStates([warlock, subclassBundle("genie", "efreeti")], 5)[0]
  assert.equal(dao?.options.find((option) => option.key === "sanctuary")?.available, true)
  assert.equal(efreeti?.options.find((option) => option.key === "sanctuary")?.available, false)
  assert.equal(contractFor([warlock, subclassBundle("genie", "dao")]).contract.spells.some((spell) => spell.key === "spell:sanctuary"), true)
  assert.equal(contractFor([warlock, subclassBundle("genie", "efreeti")]).contract.spells.some((spell) => spell.key === "spell:sanctuary"), false)
})
