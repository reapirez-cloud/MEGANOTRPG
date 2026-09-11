import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import { bardReferenceCurrent } from "../src/data/classes/bardReferenceCurrent.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../src/types/characterMechanics.ts"

const migrationPath = "supabase/migrations/20260911060000_bard_catalog_stage1.sql"
const migration = fs.readFileSync(migrationPath, "utf8")
const referenceMechanics = fs.readFileSync("src/data/classes/referenceMechanics.ts", "utf8")
const runtimePlan = fs.readFileSync("src/data/classes/bardRuntimePlan.md", "utf8")

type FeatureSpec = {
  level: number
  key: string
  name: string
  description: string
}

const featureSpecs: FeatureSpec[] = [
  { level: 1, key: "bardic-inspiration", name: "Вдохновение барда", description: "Бонусным действием выберите другое существо в пределах 60 футов, которое видит или слышит вас: оно получает кость Вдохновения барда для одного проваленного D20-теста в течение следующего часа." },
  { level: 1, key: "spellcasting", name: "Сотворение заклинаний", description: "Бард использует Харизму для заклинаний своего списка, музыкальный инструмент как фокусировку и получает магию по прогрессии полного заклинателя." },
  { level: 2, key: "expertise", name: "Экспертиза", description: "Выберите два навыка, которыми владеете: для их проверок бонус мастерства удваивается. На 9 уровне эта черта позволяет выбрать ещё два таких навыка." },
  { level: 2, key: "jack-of-all-trades", name: "Мастер на все руки", description: "К проверке характеристики, использующей навык без вашего владения, добавляйте половину бонуса мастерства с округлением вниз, если бонус мастерства иначе не применяется." },
  { level: 3, key: "bard-subclass", name: "Подкласс барда", description: "На 3 уровне выберите коллегию барда; выбранная коллегия определяет дополнительные способности, которые открываются вместе с дальнейшими уровнями барда." },
  { level: 4, key: "ability-score-improvement", name: "Улучшение характеристик", description: "Получите талант «Улучшение характеристик» либо другой талант, требованиям которого соответствуете; эта возможность повторяется на 8, 12 и 16 уровнях." },
  { level: 5, key: "font-of-inspiration", name: "Источник вдохновения", description: "С 5 уровня Вдохновение барда возвращается также после короткого отдыха, а одну ячейку заклинаний можно потратить без действия, чтобы вернуть одно потраченное применение." },
  { level: 6, key: "subclass", name: "Способность подкласса", description: "На 6 уровне выбранная коллегия барда открывает следующую способность своего подкласса согласно точным правилам этой коллегии." },
  { level: 7, key: "countercharm", name: "Контрочарование", description: "Когда вы или существо в пределах 30 футов проваливает спасбросок против Очарования или Испуга, вы можете реакцией позволить цели перебросить его с преимуществом." },
  { level: 8, key: "ability-score-improvement", name: "Улучшение характеристик", description: "Получите талант «Улучшение характеристик» либо другой талант, требованиям которого соответствуете; это отдельное повышение на 8 уровне барда." },
  { level: 9, key: "expertise", name: "Экспертиза", description: "Выберите ещё два навыка, которыми владеете: для их проверок бонус мастерства удваивается в дополнение к двум навыкам, выбранным на 2 уровне." },
  { level: 10, key: "magical-secrets", name: "Тайны магии", description: "Новые и заменяемые подготовленные заклинания барда можно выбирать из списков Барда, Жреца, Друида и Волшебника; выбранные заклинания считаются заклинаниями барда." },
  { level: 12, key: "ability-score-improvement", name: "Улучшение характеристик", description: "Получите талант «Улучшение характеристик» либо другой талант, требованиям которого соответствуете; это отдельное повышение на 12 уровне барда." },
  { level: 14, key: "subclass", name: "Способность подкласса", description: "На 14 уровне выбранная коллегия барда открывает следующую способность своего подкласса согласно точным правилам этой коллегии." },
  { level: 16, key: "ability-score-improvement", name: "Улучшение характеристик", description: "Получите талант «Улучшение характеристик» либо другой талант, требованиям которого соответствуете; это отдельное повышение на 16 уровне барда." },
  { level: 18, key: "superior-inspiration", name: "Превосходное вдохновение", description: "Когда вы бросаете инициативу и имеете меньше двух доступных применений Вдохновения барда, количество доступных применений поднимается до двух." },
  { level: 19, key: "epic-boon", name: "Эпический дар", description: "Получите эпический дар либо другой талант, требованиям которого соответствуете; выбор выполняется по общим правилам талантов персонажа." },
  { level: 20, key: "words-of-creation", name: "Слова созидания", description: "«Слово силы: Исцеление» и «Слово силы: Смерть» всегда подготовлены; вершина класса также позволяет одному из этих заклинаний затронуть дополнительную подходящую цель рядом с первой." },
]

function feature(spec: FeatureSpec): StoredMechanic {
  return {
    id: `bard-${spec.key}-feature-l${spec.level}`,
    type: "grant",
    target: "feature",
    key: `class:bard:${spec.key}:l${spec.level}`,
    sourceKey: spec.key,
    payload: { label: spec.name, description: spec.description },
  }
}

const baseMechanics: StoredMechanics = [
  {
    id: "bard-hit-die",
    type: "grant",
    target: "feature",
    key: "class:bard:hit-die",
    sourceKey: "hit-die",
    payload: {
      label: "Кость здоровья: к8",
      hitDie: 8,
      description: "Бард использует к8 как кость здоровья класса; эта кость определяет базовую прогрессию здоровья при получении уровней барда.",
    },
  },
  { id: "bard-save-dexterity", type: "grant", target: "proficiency", key: "savingThrow:dexterity", sourceKey: "saving-throw-dexterity", payload: { rank: 1, label: "Спасбросок: Ловкость" } },
  { id: "bard-save-charisma", type: "grant", target: "proficiency", key: "savingThrow:charisma", sourceKey: "saving-throw-charisma", payload: { rank: 1, label: "Спасбросок: Харизма" } },
  { id: "bard-armor-light", type: "grant", target: "proficiency", key: "armor:light", sourceKey: "armor-light", payload: { rank: 1, label: "Лёгкие доспехи" } },
  { id: "bard-weapon-simple", type: "grant", target: "proficiency", key: "weapon:simple", sourceKey: "weapon-simple", payload: { rank: 1, label: "Простое оружие" } },
]

const skillOptions = [
  "skill:acrobatics", "skill:animal_handling", "skill:arcana", "skill:athletics",
  "skill:deception", "skill:history", "skill:insight", "skill:intimidation",
  "skill:investigation", "skill:medicine", "skill:nature", "skill:perception",
  "skill:performance", "skill:persuasion", "skill:religion", "skill:sleight_of_hand",
  "skill:stealth", "skill:survival",
]

const instrumentOptions = [
  "tool:musical:bagpipes", "tool:musical:drum", "tool:musical:dulcimer",
  "tool:musical:flute", "tool:musical:horn", "tool:musical:lute",
  "tool:musical:lyre", "tool:musical:pan_flute", "tool:musical:shawm", "tool:musical:viol",
]

function bardStage1Bundle(level: number): CharacterTemplateBundle {
  return {
    assignment: {
      id: "bard-stage1-assignment",
      character_id: "bard-stage1-character",
      template_id: "class-bard-stage1",
      template_level: level,
      selected_choices: {
        "bard-skills": ["skill:performance", "skill:persuasion", "skill:stealth"],
        "bard-musical-instruments": ["tool:musical:lute", "tool:musical:flute", "tool:musical:viol"],
      },
      assigned_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    template: {
      id: "class-bard-stage1",
      campaign_id: "campaign",
      kind: "class",
      slug: "bard-core",
      name: "Бард",
      description: "Полный заклинатель Харизмы, который сочетает Вдохновение барда, широкие навыки и магические секреты.",
      version: 1,
      mechanics: baseMechanics,
      choices: [
        {
          key: "bard-skills",
          label: "Навыки: Бард",
          target: "proficiency",
          count: 3,
          selection_mode: "player_once",
          required: true,
          options: skillOptions,
        },
        {
          key: "bard-musical-instruments",
          label: "Музыкальные инструменты: Бард",
          target: "proficiency",
          count: 3,
          selection_mode: "player_once",
          required: true,
          options: instrumentOptions,
        },
      ],
      catalog_key: "class:bard",
      catalog_revision: "xphb-2024-bard-stage1-foundation-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "К8 здоровья; Харизма; спасброски Ловкости и Харизмы; лёгкая броня; простое оружие; три навыка и три музыкальных инструмента; структурная прогрессия Барда 1–20.",
      rules_meta: {
        mechanics_status: "STAGE1_FOUNDATION",
        runtime_stage: 1,
        resource_runtime_included: false,
        spell_runtime_included: false,
        subclass_runtime_included: false,
        sheet_profile_deferred: true,
      },
      is_active: true,
      created_by: null,
      created_at: "2026-09-11T00:00:00Z",
      updated_at: "2026-09-11T00:00:00Z",
    },
    levels: Array.from({ length: 20 }, (_, index) => {
      const sourceLevel = index + 1
      return {
        id: `bard-stage1-level-${sourceLevel}`,
        template_id: "class-bard-stage1",
        level: sourceLevel,
        mechanics: featureSpecs.filter((entry) => entry.level === sourceLevel).map(feature),
        choices: [],
      }
    }),
  }
}

function resolveBard(level: number) {
  const bundle = bardStage1Bundle(level)
  const parsed = resolveTemplateBundles([bundle], level)
  const input: CharacterEngineInput = {
    base: {
      id: "bard-stage1-character",
      name: "Бард",
      level,
      abilities: {
        strength: 8,
        dexterity: 16,
        constitution: 14,
        intelligence: 12,
        wisdom: 10,
        charisma: 18,
      },
      baseMaxHp: 40,
      baseSpeed: 30,
    },
    state: { currentHp: 40, tempHp: 0 },
    contributions: parsed.contributions,
  }
  return { bundle, parsed, contract: resolveCharacterContract(input) }
}

test("Bard Stage 1 migration declares the strict mechanics boundary", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE:\s*mechanics/)
  assert.match(migration, /CLASS_INTEGRATION_STRICT:\s*class:bard/)
  assert.match(migration, /CLASS_PACKAGE_TEST:\s*tests\/bardCatalogStage1\.test\.ts/)
  assert.match(migration, /catalog_key='class:bard'/)
  assert.match(migration, /for v_level in 1\.\.20 loop/)
  assert.match(migration, /'sheet_profile_deferred',true/)
  assert.match(migration, /'spellcasting_contract',jsonb_build_object/)
  assert.doesNotMatch(migration, /'sheet_profile'\s*,/)
  assert.match(migration, /"20":22/)
  assert.match(migration, /"20":\{"1":4,"2":3,"3":3,"4":3,"5":3,"6":2,"7":2,"8":1,"9":1\}/)
  assert.match(migration, /after insert on public\.campaigns/)
})

test("Bard Stage 1 has the exact starting proficiency choices without activating runtime resources", () => {
  const { bundle, parsed, contract } = resolveBard(1)
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))

  for (const key of ["savingThrow:dexterity", "savingThrow:charisma", "armor:light", "weapon:simple"]) {
    assert.ok(parsed.contributions.some((entry) =>
      entry.kind === "grant" && entry.target === "proficiency" && entry.key === key
    ), key)
  }

  for (const key of ["skill:performance", "skill:persuasion", "skill:stealth", "tool:musical:lute", "tool:musical:flute", "tool:musical:viol"]) {
    assert.ok(parsed.contributions.some((entry) =>
      entry.kind === "grant" && entry.target === "proficiency" && entry.key === key
    ), key)
  }

  assert.ok(contract.capabilities.features.some((entry) => entry.key === "class:bard:bardic-inspiration:l1"))
  assert.ok(contract.capabilities.features.some((entry) => entry.key === "class:bard:spellcasting:l1"))
  assert.equal(contract.resources.length, 0)
  assert.equal(contract.actions.length, 0)
  assert.equal(contract.spells.length, 0)
})

test("Bard Stage 1 resolves low, mid and high class-level feature gates through CE", () => {
  for (const level of [1, 10, 20]) {
    const { bundle } = resolveBard(level)
    assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  }

  const levelOne = resolveBard(1).contract
  const levelTen = resolveBard(10).contract
  const levelTwenty = resolveBard(20).contract

  assert.equal(levelOne.capabilities.features.some((entry) => entry.key === "class:bard:expertise:l2"), false)
  assert.ok(levelTen.capabilities.features.some((entry) => entry.key === "class:bard:magical-secrets:l10"))
  assert.equal(levelTen.capabilities.features.some((entry) => entry.key === "class:bard:words-of-creation:l20"), false)
  assert.ok(levelTwenty.capabilities.features.some((entry) => entry.key === "class:bard:words-of-creation:l20"))
})

test("Bard reference rules contain the corrected 2024 Jack, Font and Magical Secrets text", () => {
  assert.match(referenceMechanics, /проверке характеристики, которая использует навык, которым вы не владеете/)
  assert.doesNotMatch(referenceMechanics, /Это также применяется к инициативе/)
  assert.match(referenceMechanics, /без действия потратить ячейку заклинаний, чтобы восстановить одно потраченное применение Вдохновения барда/)
  assert.doesNotMatch(referenceMechanics, /ячейка должна быть израсходована на заклинание барда/)
  assert.match(referenceMechanics, /списков Барда, Жреца, Друида и Волшебника/)
  assert.match(referenceMechanics, /Когда вы заменяете подготовленное заклинание барда/)
})

test("Bard stays reference-only and carries an explicit post-Stage-1 roadmap", () => {
  assert.equal(bardReferenceCurrent.referenceOnly, true)
  for (const marker of [
    "Stage 2 — Bardic Inspiration",
    "bardic_inspiration",
    "Stage 3 — spell runtime",
    "sheet_profile",
    "College of Dance",
    "referenceOnly",
    "multiclass",
  ]) {
    assert.ok(runtimePlan.includes(marker), marker)
  }
})
