import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"
import type { StoredMechanic } from "../src/types/characterMechanics.ts"

const migrationPath = "supabase/migrations/20260907023356_warlock_stage4_high_level_runtime_closure_v1.sql"
const migration = fs.readFileSync(migrationPath, "utf8")

function feature(id: string, sourceKey: string, key: string, label: string, description: string): StoredMechanic {
  return {
    id,
    type: "grant",
    target: "feature",
    key,
    sourceKey,
    payload: { label, description },
  } as StoredMechanic
}

function resource(id: string, sourceKey: string, key: string, label: string, max: number, recharge: ("short_rest" | "long_rest")[]): StoredMechanic {
  return {
    id,
    type: "resource",
    sourceKey,
    key,
    label,
    max,
    recharge,
    initial: "full",
  } as StoredMechanic
}

function value(id: string, sourceKey: string, key: string, label: string, amount: number, priority: number): StoredMechanic {
  return {
    id,
    type: "grant",
    target: "value",
    key,
    sourceKey,
    grantOperation: "REPLACE",
    priority,
    payload: { label, value: amount },
  } as StoredMechanic
}

function classSpell(
  id: string,
  sourceKey: string,
  slug: string,
  name: string,
  spellLevel: number,
  school: string,
  resourceKey: string,
  methodKey: string,
  includePact = false,
): StoredMechanic {
  const methods = [
    ...(includePact ? [{
      key: "warlock-pact-5",
      kind: "pact_magic",
      ability: "charisma",
      requiresPrepared: false,
      resourceOptions: [{
        key: "warlock-pact-5",
        castLevel: 5,
        costs: [{ key: "warlock_pact_slots", amount: 1 }],
      }],
    }] : []),
    {
      key: methodKey,
      kind: "class_feature",
      ability: "charisma",
      requiresPrepared: false,
      resourceOptions: [{
        key: methodKey,
        castLevel: spellLevel,
        costs: [{ key: resourceKey, amount: 1 }],
      }],
    },
  ]

  return {
    id,
    type: "spell",
    sourceKey,
    key: `spell:${slug}`,
    catalogSlug: slug,
    variantKey: `${sourceKey}:${slug}`,
    payload: {
      spell: { name, level: spellLevel, school, ritual: false },
      preparation: { mode: "always_prepared" },
      methods,
    },
  } as StoredMechanic
}

function arcanumChoice(level: 6 | 7 | 8 | 9, slug: string, name: string, school: string): RuleChoiceDefinition {
  const sourceKey = `warlock-base:mystic-arcanum-${level}`
  const key = `warlock_mystic_arcanum_${level}`
  return {
    key,
    label: `Таинственный арканум: заклинание ${level} уровня`,
    target: "trait",
    count: 1,
    options: [slug],
    option_labels: { [slug]: name },
    option_mechanics: {
      [slug]: [classSpell(
        `warlock-test-arcanum-${level}-${slug}`,
        sourceKey,
        slug,
        name,
        level,
        school,
        key,
        `mystic-arcanum-${level}`,
      )],
    },
    selection_mode: "player_once",
    replacement_policy: "on_level_change",
    replacement_limit: 1,
    required: true,
    resolved_as: "class_spell",
  } as RuleChoiceDefinition
}

const selectedArcanums = {
  6: ["circle-of-death", "Круг смерти", "Necromancy"],
  7: ["finger-of-death", "Перст смерти", "Necromancy"],
  8: ["dominate-monster", "Подчинение чудовища", "Enchantment"],
  9: ["foresight", "Предвидение", "Divination"],
} as const

function highLevelBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-warlock-stage4-high",
      character_id: "character-warlock-stage4-high",
      template_id: "class-warlock-stage4-high",
      template_level: 20,
      selected_choices: {
        warlock_mystic_arcanum_6: [selectedArcanums[6][0]],
        warlock_mystic_arcanum_7: [selectedArcanums[7][0]],
        warlock_mystic_arcanum_8: [selectedArcanums[8][0]],
        warlock_mystic_arcanum_9: [selectedArcanums[9][0]],
      } as never,
      assigned_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    },
    template: {
      id: "class-warlock-stage4-high",
      campaign_id: "campaign",
      kind: "class",
      slug: "warlock-stage4-high",
      name: "Колдун",
      description: "Базовый Колдун 2024 с закрытым высокоуровневым runtime.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:warlock",
      catalog_revision: "xphb-2024-warlock-high-level-runtime-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "Высокоуровневый колдун получает отдельные ежедневные Арканумы, всегда подготовленную Связь с покровителем и полное восстановление Магической хитростью на 20 уровне.",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
    },
    levels: [
      {
        id: "warlock-stage4-l9",
        template_id: "class-warlock-stage4-high",
        level: 9,
        mechanics: [
          resource("contact-use", "warlock-base:contact-patron", "warlock_contact_patron", "Связь с покровителем", 1, ["long_rest"]),
          feature(
            "contact-rules",
            "warlock-base:contact-patron",
            "contact_patron",
            "Связь с покровителем",
            "«Контакт с иным планом» всегда подготовлен; один раз между долгими отдыхами его можно сотворить бесплатно, автоматически преуспев в спасброске Интеллекта.",
          ),
          classSpell(
            "contact-spell",
            "warlock-base:contact-patron",
            "contact-other-plane",
            "Контакт с иным планом",
            5,
            "Divination",
            "warlock_contact_patron",
            "contact-patron-free",
            true,
          ),
        ],
        choices: [],
      },
      ...([11, 13, 15, 17] as const).map((classLevel, index) => {
        const spellLevel = ([6, 7, 8, 9] as const)[index]!
        const [slug, name, school] = selectedArcanums[spellLevel]
        const sourceKey = `warlock-base:mystic-arcanum-${spellLevel}`
        return {
          id: `warlock-stage4-l${classLevel}`,
          template_id: "class-warlock-stage4-high",
          level: classLevel,
          mechanics: [
            ...(classLevel === 17 ? [resource("pact-slots-17", "warlock-base:pact-magic", "warlock_pact_slots", "Ячейки Магии договора", 4, ["short_rest", "long_rest"])] : []),
            resource(`arcanum-${spellLevel}-use`, sourceKey, `warlock_mystic_arcanum_${spellLevel}`, `Таинственный арканум ${spellLevel} уровня`, 1, ["long_rest"]),
            feature(
              `arcanum-${spellLevel}-rules`,
              sourceKey,
              `mystic_arcanum_${spellLevel}`,
              `Таинственный арканум (${spellLevel} уровень)`,
              `Выбранное заклинание колдуна ${spellLevel} уровня всегда подготовлено, сотворяется один раз без ячейки и восстанавливает использование после долгого отдыха.`,
            ),
          ],
          choices: [arcanumChoice(spellLevel, slug, name, school)],
        }
      }),
      {
        id: "warlock-stage4-l20",
        template_id: "class-warlock-stage4-high",
        level: 20,
        mechanics: [
          value("cunning-restore-20", "warlock-base:magical-cunning", "warlock_magical_cunning_restore", "Ячейки, возвращаемые Магической хитростью", 4, 20),
          feature(
            "eldritch-master-rules",
            "warlock-base:eldritch-master",
            "eldritch_master",
            "Древнейший мастер",
            "Магическая хитрость теперь восстанавливает все четыре потраченные ячейки Магии договора; остальные правила этой способности не меняются.",
          ),
        ],
        choices: [],
      },
    ],
  }
}

test("Stage 4 migration replaces semantic high-level casts with concrete spell access", () => {
  assert.match(migration, /warlock_stage4_spell_mechanic_v1/)
  assert.match(migration, /contact-patron-free/)
  assert.match(migration, /warlock-pact-5/)
  assert.match(migration, /mystic-arcanum-' \|\| p_spell_level/)
  assert.match(migration, /'option_mechanics', v_mechanics/)
  assert.doesNotMatch(migration, /cast_selected_spell/)
  assert.doesNotMatch(migration, /warlock_spell_level_[6789]/)
})

test("Mystic Arcanum choice is restricted to exact-level Warlock catalog spells", () => {
  assert.match(migration, /s\.spell_level = p_spell_level/)
  assert.match(migration, /sc\.class_key = 'warlock'/)
  assert.match(migration, /WARLOCK_STAGE4_SPELL_LEVEL_MISMATCH/)
  assert.match(migration, /WARLOCK_STAGE4_ARCANUM_LIST_EMPTY/)
  assert.match(migration, /'replacement_policy', 'on_level_change'/)
  assert.match(migration, /'replacement_limit', 1/)
})

test("Stage 4 high-level package passes strict quality/resource gates through parser and CE", () => {
  const source = highLevelBundle()
  assert.doesNotThrow(() => assertClassPackageQuality([source]))
  assert.doesNotThrow(() => assertClassResourcePolicy([source]))

  const parsed = resolveTemplateBundles([source], 20)
  const contract = resolveCharacterContract({
    base: {
      id: "warlock-stage4-high",
      name: "Колдун",
      level: 20,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 20 },
      baseMaxHp: 120,
      baseSpeed: 30,
    },
    state: { currentHp: 120, tempHp: 0, resources: {} },
    contributions: parsed.contributions,
  })

  const contact = contract.spells.find((entry) => entry.key === "spell:contact-other-plane")
  assert.ok(contact)
  const contactAccess = contact.accesses.find((entry) => entry.key.includes("warlock-base:contact-patron"))
  assert.ok(contactAccess)
  assert.equal(contactAccess.methods.length, 2)
  assert.ok(contactAccess.methods.some((method) => method.kind === "pact_magic" && method.resourceOptions[0]?.costs[0]?.key === "warlock_pact_slots"))
  assert.ok(contactAccess.methods.some((method) => method.key === "contact-patron-free" && method.resourceOptions[0]?.costs[0]?.key === "warlock_contact_patron"))

  for (const spellLevel of [6, 7, 8, 9] as const) {
    const [slug] = selectedArcanums[spellLevel]
    const arcanum = contract.spells.find((entry) => entry.key === `spell:${slug}`)
    assert.ok(arcanum, `missing Arcanum ${spellLevel}`)
    const access = arcanum.accesses.find((entry) => entry.key.includes(`mystic-arcanum-${spellLevel}`))
    assert.ok(access, `missing Arcanum ${spellLevel} access`)
    const method = access.methods.find((entry) => entry.key === `mystic-arcanum-${spellLevel}`)
    assert.equal(method?.resourceOptions[0]?.castLevel, spellLevel)
    assert.equal(method?.resourceOptions[0]?.costs[0]?.key, `warlock_mystic_arcanum_${spellLevel}`)
  }

  assert.equal(contract.resources.find((entry) => entry.key === "warlock_pact_slots")?.max.value, 4)
  assert.equal(contract.values.find((entry) => entry.key === "warlock_magical_cunning_restore")?.value.value, 4)
})

test("Eldritch Master reuses Magical Cunning instead of adding a duplicate pool", () => {
  assert.match(migration, /WARLOCK_STAGE4_ELDRITCH_MASTER_RESTORE_INVALID/)
  assert.match(migration, /WARLOCK_STAGE4_ELDRITCH_MASTER_PACT_MAX_INVALID/)
  assert.match(migration, /'eldritch_master_runtime', true/)
  assert.doesNotMatch(migration, /warlock_eldritch_master_use/)
})
