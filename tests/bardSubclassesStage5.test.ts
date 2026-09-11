import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import { bardReferenceCurrent } from "../src/data/classes/bardReferenceCurrent.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanic } from "../src/types/characterMechanics.ts"

const migrationPath = "supabase/migrations/20260911162000_bard_subclasses_stage5_v1.sql"
const migration = fs.readFileSync(migrationPath, "utf8")
const choiceUi = fs.readFileSync("src/components/characters/CharacterTemplateChoices.tsx", "utf8")

const runtimeKeys = [
  "subclass:bard:dance",
  "subclass:bard:glamour",
  "subclass:bard:lore",
  "subclass:bard:valor",
  "subclass:bard:eloquence",
  "subclass:bard:swords",
  "subclass:bard:whispers",
  "subclass:bard:creation",
  "subclass:bard:spirits",
] as const

function feature(id: string, sourceKey: string, key: string, label: string): StoredMechanic {
  return {
    id,
    type: "grant",
    target: "feature",
    sourceKey,
    key,
    payload: {
      label,
      description:
        "Точная механика подкласса использует уровень родительского Барда и не создаёт отдельного состояния хода, сцены или инициативы.",
      mechanic: { kind: "bard_stage5_test_feature" },
    },
  }
}

function parentBundle(level: number): CharacterTemplateBundle {
  return {
    assignment: {
      id: "bard-stage5-parent-assignment",
      character_id: "bard-stage5-character",
      template_id: "bard-stage5-parent",
      template_level: level,
      selected_choices: {},
      assigned_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    template: {
      id: "bard-stage5-parent",
      campaign_id: "campaign",
      kind: "class",
      slug: "bard-core",
      name: "Бард",
      description: "Бард Stage 5.",
      version: 1,
      mechanics: [],
      choices: [],
      catalog_key: "class:bard",
      catalog_revision: "xphb-2024-bard-stage5-subclasses-runtime-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary:
        "Бард 2024 использует общий запас Вдохновения барда, полный заклинательный прогресс и дочерние колледжи через единый Character Engine контракт.",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    levels: [{
      id: "bard-stage5-parent-l1",
      template_id: "bard-stage5-parent",
      level: 1,
      mechanics: [{
        id: "bard-stage5-bi",
        type: "resource",
        sourceKey: "bardic-inspiration",
        key: "bardic_inspiration",
        label: "Вдохновение барда",
        max: 4,
        recharge: ["short_rest", "long_rest"],
        initial: "full",
      }],
      choices: [],
    }],
  }
}

function subclassBundle(catalogKey: typeof runtimeKeys[number]): CharacterTemplateBundle {
  const slug = catalogKey.split(":").at(-1)!
  const mechanics: StoredMechanic[] = [
    feature(`${slug}-feature-l3`, `bard:${slug}:feature`, `bard_${slug}_feature`, `Колледж: ${slug}`),
  ]
  if (catalogKey === "subclass:bard:swords") {
    mechanics.push({
      id: "swords-test-flourish",
      type: "action",
      sourceKey: "bard:swords:feature",
      key: "bard_swords_test_flourish",
      label: "Росчерк клинка",
      economy: "special",
      resourceCosts: [{ key: "bardic_inspiration", amount: 1 }],
      effects: [{ kind: "semantic", key: "blade_flourish_test" }],
      tags: ["bard", "subclass", "swords", "bardic-inspiration"],
    })
  }
  return {
    assignment: {
      id: `${slug}-assignment`,
      character_id: "bard-stage5-character",
      template_id: `${slug}-template`,
      template_level: null,
      selected_choices: {},
      assigned_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    template: {
      id: `${slug}-template`,
      campaign_id: "campaign",
      kind: "subclass",
      slug: `bard-${slug}`,
      name: `Колледж ${slug}`,
      description: `Runtime-подкласс Барда: ${slug}.`,
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: "bard-stage5-parent",
      unlock_level: 3,
      catalog_key: catalogKey,
      catalog_revision: "bard-stage5-subclasses-runtime-v1",
      source_kind: "official",
      source_label: "Bard Stage 5 rules source",
      is_builtin: true,
      mechanical_summary:
        `Колледж ${slug} использует родительский уровень Барда и общие ресурсы, действия, выборы и заклинательные доступы проекта без собственного движка.`,
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    levels: [{
      id: `${slug}-level-3`,
      template_id: `${slug}-template`,
      level: 3,
      mechanics,
      choices: [],
    }],
  }
}

function packageAt(level: number) {
  return [parentBundle(level), ...runtimeKeys.map(subclassBundle)]
}

function contractFor(catalogKey: typeof runtimeKeys[number], level: number) {
  const parent = parentBundle(level)
  const subclass = subclassBundle(catalogKey)
  const parsed = resolveTemplateBundles([parent, subclass], level)
  const input: CharacterEngineInput = {
    base: {
      id: "bard-stage5-character",
      name: "Бард",
      level,
      abilities: {
        strength: 8,
        dexterity: 16,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 18,
      },
      baseMaxHp: 60,
      baseSpeed: 30,
    },
    state: {
      currentHp: 60,
      tempHp: 0,
      resources: { bardic_inspiration: { current: 4 } },
    },
    contributions: parsed.contributions,
  }
  return resolveCharacterContract(input)
}

test("Bard Stage 5 declares strict subclass/resource/package gates", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/i)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*subclass:bard/i)
  assert.match(migration, /CLASS_RESOURCE_POLICY:\s*short-long-rest-v1/i)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/bardSubclassesStage5\.test\.ts/i)
  assert.match(migration, /xphb-2024-bard-stage5-subclasses-runtime-v1/)
})

test("Stage 5 fixture passes strict class quality and resource policy for all nine colleges", () => {
  const bundles = packageAt(14)
  assert.doesNotThrow(() => assertClassPackageQuality(bundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(bundles))
})

test("Stage 5 publishes exactly nine runtime colleges and keeps Tragedy outside runtime", () => {
  for (const key of runtimeKeys) assert.ok(migration.includes(key), key)
  assert.equal(runtimeKeys.length, 9)
  assert.match(migration, /subclass:bard:tragedy/)
  assert.match(migration, /set is_active=false[\s\S]*subclass:bard:tragedy/i)
  assert.doesNotMatch(
    migration,
    /bard_stage5_upsert_subclass_v1\([\s\S]{0,300}'subclass:bard:tragedy'/,
  )
  assert.ok(bardReferenceCurrent.subclasses.some((entry) => entry.id === "dance"))
  assert.ok(bardReferenceCurrent.subclasses.some((entry) => entry.id === "tragedy"))
  assert.equal(bardReferenceCurrent.referenceOnly, true)
})

test("every runtime college is a Bard child at level 3 and inherits parent Bard level", () => {
  for (const key of runtimeKeys) {
    const bundle = subclassBundle(key)
    assert.equal(bundle.template.parent_template_id, "bard-stage5-parent")
    assert.equal(bundle.template.unlock_level, 3)
    assert.equal(bundle.assignment.template_level, null)
  }

  const low = contractFor("subclass:bard:swords", 2)
  assert.equal(low.actions.some((entry) => entry.key === "bard_swords_test_flourish"), false)

  const unlocked = contractFor("subclass:bard:swords", 3)
  const flourish = unlocked.actions.find((entry) => entry.key === "bard_swords_test_flourish")
  assert.ok(flourish)
  assert.equal(flourish.resourceCosts[0]?.stateKey, "bardic_inspiration")
})

test("all BI-tagged subclass spenders use the canonical Bardic Inspiration ledger", () => {
  assert.match(migration, /canonical_bardic_inspiration_resource','bardic_inspiration'/)
  assert.match(migration, /@> '\["bardic-inspiration"\]'::jsonb/)
  assert.match(migration, /c\.value->>'key'='bardic_inspiration'/)

  const resourceKeys = [...migration.matchAll(/"key":"([^"]*inspiration[^"]*)","amount"/g)]
    .map((match) => match[1])
  assert.ok(resourceKeys.filter((key) => key === "bardic_inspiration").length >= 8)
  assert.ok(resourceKeys.includes("bard_eloquence_infectious_inspiration"))
})

test("Dance exposes canonical BI spenders and never invents initiative state", () => {
  assert.match(migration, /bard_dance_inspiring_movement/)
  assert.match(migration, /bard_dance_tandem_footwork/)
  assert.match(migration, /initiative-trigger/)
  assert.match(migration, /table-adjudicated/)
  assert.doesNotMatch(migration, /initiative_confirmed|initiative_available|turn_state/)
})

test("Lore has three bonus skills and two source-level gated Magical Discoveries", () => {
  assert.match(migration, /'bard_lore_bonus_skills'[\s\S]*'count',3/)
  assert.match(migration, /'bard_lore_magical_discoveries'[\s\S]*'count',2/)
  assert.match(migration, /'replacement_policy','on_level_change'/)
  assert.match(migration, /'replacement_limit',1/)
  assert.match(migration, /c\.class_key in \('cleric','druid','wizard'\)/)
})

test("Glamour, Valor and legacy colleges expose their declared runtime identities", () => {
  for (const marker of [
    "bard_glamour_mantle_of_inspiration",
    "bard_glamour_mantle_of_majesty_activate",
    "bard_valor_extra_attack",
    "bard_eloquence_unsettling_words",
    "bard_swords_defensive_flourish",
    "bard_whispers_psychic_blades",
    "bard_creation_animating_performance_use",
    "bard_spirits_tales_from_beyond",
  ]) assert.ok(migration.includes(marker), marker)
})

test("Spirits uses the generic long-rest Choice Runtime path", () => {
  assert.match(migration, /'bard_spirits_spirit_session'/)
  assert.match(migration, /'refresh','long_rest'/)
  assert.match(migration, /s\.school in \('Divination','Necromancy'\)/)
  assert.match(choiceUi, /const result = state\.refresh\s*\? await commitCharacterTemplateRestChoice/)
  assert.match(choiceUi, /state\.refresh === "long_rest" \? "долгого отдыха"/)
})

test("new campaigns install Stage 5 instead of stopping at Stage 4", () => {
  assert.match(migration, /perform private\.ensure_bard_base_runtime_stage4_v1\(p_campaign_id\)/)
  assert.match(migration, /drop trigger if exists aaaaaaaaj_campaigns_ensure_bard_base_runtime_stage4_v1/)
  assert.match(migration, /create trigger aaaaaaaak_campaigns_ensure_bard_subclasses_stage5_v1/)
})

test("scene, hit and turn cadence stays semantic rather than persistent fake state", () => {
  assert.doesNotMatch(
    migration,
    /turn_counter|round_counter|scene_[a-z_]+_confirmed|target_is_hit|target_hit_confirmed|_available\b/,
  )
})
