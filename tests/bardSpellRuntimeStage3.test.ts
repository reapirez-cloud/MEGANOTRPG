import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  applySpellResourceOption,
  resolveCharacterContract,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"
import type { StoredMechanic } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260911080000_bard_stage3_spell_runtime_v1.sql",
  "utf8",
)

function spellMechanic(slug: string, name: string, level: number): StoredMechanic {
  return {
    id: `test-bard-spell-${slug}`,
    type: "spell",
    key: `spell:${slug}`,
    catalogSlug: slug,
    sourceKey: "bard-stage3:spellcasting",
    variantKey: `bard:spellcasting:${slug}`,
    grantOperation: "GRANT",
    payload: {
      spell: { name, level, school: "enchantment", ritual: false },
      preparation: { mode: level === 0 ? "not_required" : "always_prepared" },
      methods: [{
        key: "bard-cast",
        kind: "class_spell",
        ability: "charisma",
        attackBonus: {
          kind: "add",
          terms: [
            { kind: "reference", key: "core.proficiencyBonus" },
            { kind: "reference", key: "abilities.charisma.modifier" },
          ],
        },
        saveDc: {
          kind: "add",
          terms: [
            { kind: "literal", value: 8 },
            { kind: "reference", key: "core.proficiencyBonus" },
            { kind: "reference", key: "abilities.charisma.modifier" },
          ],
        },
        requiresPrepared: false,
        ...(level > 0 ? {
          resourceOptions: [{
            key: `slot-${level}`,
            castLevel: level,
            costs: [{ key: `spell_slot_${level}`, amount: 1 }],
          }],
        } : {}),
      }],
    },
  }
}

const preparedChoice: RuleChoiceDefinition = {
  key: "bard_prepared_spells",
  label: "Подготовленные заклинания барда",
  target: "spell",
  count: 1,
  selection_mode: "player_once",
  replacement_policy: "on_level_change",
  replacement_limit: 1,
  options: ["healing-word", "wall-of-force"],
  option_labels: {
    "healing-word": "Лечащее слово",
    "wall-of-force": "Силовая стена",
  },
  option_unlock_level: {
    "healing-word": 1,
    "wall-of-force": 10,
  },
  option_mechanics: {
    "healing-word": [spellMechanic("healing-word", "Лечащее слово", 1)],
    "wall-of-force": [spellMechanic("wall-of-force", "Силовая стена", 5)],
  },
}

const cantripChoice: RuleChoiceDefinition = {
  key: "bard_cantrips",
  label: "Заговоры барда",
  target: "spell",
  count: 1,
  selection_mode: "player_once",
  replacement_policy: "on_level_change",
  replacement_limit: 1,
  options: ["vicious-mockery"],
  option_labels: { "vicious-mockery": "Злая насмешка" },
  option_unlock_level: { "vicious-mockery": 1 },
  option_mechanics: {
    "vicious-mockery": [spellMechanic("vicious-mockery", "Злая насмешка", 0)],
  },
}

function bundleAt(level: number, prepared = "healing-word"): CharacterTemplateBundle {
  return {
    assignment: {
      id: "bard-stage3-assignment",
      character_id: "bard-stage3-character",
      template_id: "bard-stage3-template",
      template_level: level,
      selected_choices: {
        bard_cantrips: ["vicious-mockery"],
        bard_prepared_spells: [prepared],
      },
      assigned_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    template: {
      id: "bard-stage3-template",
      campaign_id: "campaign",
      kind: "class",
      slug: "bard-core",
      name: "Бард",
      description: "Тестовый пакет заклинаний Барда.",
      version: 1,
      mechanics: [],
      choices: [],
      catalog_key: "class:bard",
      catalog_revision: "xphb-2024-bard-stage3-spell-runtime-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "Бард использует Харизму, постоянный список известных заговоров и подготовленных заклинаний и общий запас ячеек полного заклинателя.",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    levels: [{
      id: "bard-stage3-level-1",
      template_id: "bard-stage3-template",
      level: 1,
      mechanics: [
        {
          id: "bard-spellcasting-feature-l1",
          type: "grant",
          sourceKey: "spellcasting",
          target: "feature",
          key: "class:bard:spellcasting:l1",
          payload: {
            label: "Сотворение заклинаний",
            description: "Бард использует Харизму для своих заклинаний, выбирает заговоры и заклинания по уровню барда и восстанавливает потраченные ячейки после долгого отдыха.",
          },
        },
        {
          id: "test-slot-1",
          type: "resource",
          sourceKey: "spellcasting",
          key: "spell_slot_1",
          label: "Ячейки 1 уровня",
          max: 4,
          recharge: ["long_rest"],
          initial: "full",
        },
        {
          id: "test-slot-5",
          type: "resource",
          sourceKey: "spellcasting",
          key: "spell_slot_5",
          label: "Ячейки 5 уровня",
          max: 2,
          recharge: ["long_rest"],
          initial: "full",
        },
      ],
      choices: [cantripChoice, preparedChoice],
    }],
  }
}

function engineInput(bundle: CharacterTemplateBundle): CharacterEngineInput {
  const parsed = resolveTemplateBundles([bundle], 20)
  return {
    base: {
      id: "bard-stage3-character",
      name: "Бард",
      level: 20,
      abilities: {
        strength: 8,
        dexterity: 14,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 18,
      },
      baseMaxHp: 100,
      baseSpeed: 30,
    },
    state: {
      currentHp: 100,
      tempHp: 0,
      resources: {
        spell_slot_1: { current: 4 },
        spell_slot_5: { current: 2 },
      },
    },
    contributions: parsed.contributions,
  }
}

test("Bard Stage 3 declares strict mechanics/resource/package gates", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE: mechanics/)
  assert.match(migration, /CLASS_INTEGRATION_STRICT: class:bard/)
  assert.match(migration, /CLASS_RESOURCE_POLICY: short-long-rest-v1/)
  assert.match(migration, /CLASS_PACKAGE_TEST: tests\/bardSpellRuntimeStage3\.test\.ts/)
  assert.match(migration, /xphb-2024-bard-stage3-spell-runtime-v1/)
})

test("Bard Stage 3 package passes shared quality and persistent-resource policy", () => {
  const bundle = bundleAt(10)
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundle]))
})

test("spell choices emit only canonical spell mechanics, never an empty choice grant", () => {
  const bundle = bundleAt(10, "wall-of-force")
  const parsed = resolveTemplateBundles([bundle], 20)
  const spellGrants = parsed.contributions.filter(
    (entry) => entry.kind === "grant" && entry.target === "spell",
  )
  assert.equal(spellGrants.length, 2)
  assert.ok(spellGrants.every((entry) => entry.payload && typeof entry.payload === "object"))
})

test("Magical Secrets uses Bard source level rather than total character level", () => {
  const level9 = resolveCharacterContract(engineInput(bundleAt(9, "wall-of-force")))
  assert.equal(level9.spells.some((spell) => spell.key === "spell:wall-of-force"), false)

  const level10 = resolveCharacterContract(engineInput(bundleAt(10, "wall-of-force")))
  const secret = level10.spells.find((spell) => spell.key === "spell:wall-of-force")
  assert.ok(secret)
  assert.equal(secret.identity.level, 5)
  assert.equal(secret.accesses[0]?.methods[0]?.ability, "charisma")
  assert.equal(secret.accesses[0]?.methods[0]?.saveDc?.value, 18)
  assert.equal(secret.accesses[0]?.methods[0]?.attackBonus?.value, 10)
})

test("Bard spell access spends the shared spell-slot ledger", () => {
  const input = engineInput(bundleAt(10, "wall-of-force"))
  const contract = resolveCharacterContract(input)
  const secret = contract.spells.find((spell) => spell.key === "spell:wall-of-force")
  assert.ok(secret)
  const option = secret.accesses[0]?.methods[0]?.resourceOptions.find((entry) => entry.key === "slot-5")
  assert.ok(option)
  assert.equal(option.available, true)

  const next = applySpellResourceOption(input.state, option)
  assert.equal(next.resources?.spell_slot_5?.current, 1)
})

test("Bard cantrips remain Bard-list choices while Magical Secrets expands only levelled spells", () => {
  assert.match(migration, /where s\.spell_level=0[\s\S]*c\.class_key='bard'/)
  assert.match(migration, /s\.spell_level between 1 and 9[\s\S]*c\.class_key in \('bard','cleric','druid','wizard'\)/)
  assert.match(migration, /greatest\(10,private\.bard_stage3_spell_unlock_level_v1\(s\.spell_level\)\)/)
  assert.match(migration, /'magical_secrets_cantrips',false/)
})

test("Bard carries exact cantrip and prepared-spell count progression", () => {
  assert.match(migration, /'count_by_level',jsonb_build_object\('1',2,'4',3,'10',4\)/)
  assert.match(migration, /'1',4,'2',5,'3',6,'4',7,'5',9,'6',10,'7',11,'8',12,'9',14,'10',15/)
  assert.match(migration, /'11',16,'12',16,'13',17,'14',17,'15',18,'16',18,'17',19,'18',20,'19',21,'20',22/)
  assert.match(migration, /'replacement_policy','on_level_change'/)
  assert.match(migration, /'replacement_limit',1/)
})

test("Bard Stage 3 activates Charisma sheet profile, focus, slot sync and spell links", () => {
  assert.match(migration, /'spellcasting_enabled',true/)
  assert.match(migration, /'spellcasting_ability','charisma'/)
  assert.match(migration, /'spellcasting_focus','musical_instrument'/)
  assert.match(migration, /'sheet_profile_deferred',false/)
  assert.match(migration, /spellcasting_focus:musical_instrument/)
  assert.match(migration, /private\.sync_bard_spell_slots_stage3_v1/)
  assert.match(migration, /private\.sync_rule_template_spell_links\(v_bard\)/)
  assert.match(migration, /character_template_assignments_sync_bard_spell_slots_stage3_v1/)
})

test("new campaigns install Stage 3 instead of stopping at Stage 2", () => {
  assert.match(migration, /perform private\.ensure_bard_stage2_superior_inspiration_v2\(p_campaign_id\)/)
  assert.match(migration, /drop trigger if exists aaaaaaaah_campaigns_ensure_bard_stage2_superior_inspiration_v2/)
  assert.match(migration, /create trigger aaaaaaaai_campaigns_ensure_bard_spell_runtime_stage3_v1/)
})
