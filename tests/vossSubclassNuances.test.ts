import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const migration = fs.readFileSync("supabase/migrations/20260829142821_subclass_voss_nuances.sql", "utf8")
const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const voice = fs.readFileSync("src/data/vossVoice.ts", "utf8")
const types = fs.readFileSync("src/types/characterMechanics.ts", "utf8")

function pipelineBundle(): CharacterTemplateBundle {
  return {
    template: {
      id: "nuance-test-class",
      campaign_id: "campaign",
      kind: "class",
      slug: "nuance-test-class",
      name: "Тестовый класс",
      description: "Тестовый пакет для проверки presentation-слоя нюансов.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:nuance-test",
      catalog_revision: "nuance-test-v1",
      source_kind: "official",
      source_label: "Internal test",
      is_builtin: true,
      mechanical_summary: "Класс получает один ограниченный приём, расходующий один ресурс и восстанавливающийся после долгого отдыха.",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    },
    assignment: {
      id: "assignment",
      character_id: "hero",
      template_id: "nuance-test-class",
      template_level: 1,
      selected_choices: {},
      assigned_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    },
    levels: [{
      id: "nuance-test-level-1",
      template_id: "nuance-test-class",
      level: 1,
      choices: [],
      mechanics: [
        {
          id: "nuance-test-feature",
          type: "grant",
          target: "feature",
          key: "class:nuance-test:step",
          sourceKey: "step",
          payload: {
            label: "Полевой шаг",
            description: "Бонусным действием потратьте 1 использование Полевого шага и переместитесь на 10 футов. После долгого отдыха запас полностью восстанавливается.",
            authorComment: "Если ноги ещё работают, не заставляйте магию изображать из себя ноги.",
          },
        },
        {
          id: "nuance-test-resource",
          type: "resource",
          key: "field_step",
          label: "Полевой шаг",
          max: 1,
          recharge: "long_rest",
          sourceKey: "step",
        },
        {
          id: "nuance-test-action",
          type: "action",
          key: "field_step",
          label: "Полевой шаг",
          economy: "bonus_action",
          resourceKey: "field_step",
          resourceCost: 1,
          sourceKey: "step",
        },
      ],
    }],
  }
}

test("subclass nuance migration is presentation-only and covers audited subclasses", () => {
  assert.match(migration, /PRESENTATION ONLY/)
  assert.match(migration, /authorNuances/)
  assert.match(migration, /subclass:fighter/)
  assert.match(migration, /subclass:druid/)
  assert.match(migration, /subclass:cleric/)
  assert.match(migration, /Но ветер же ветер/)
  assert.doesNotMatch(migration, /jsonb_set\([^\n]*\{payload,description\}/)
  assert.doesNotMatch(migration, /jsonb_build_object\([^\n]*(?:resourceCosts|effects|requirements|max)/)
})

test("subclass ability detail renders explanation rule nuances and comment in order", () => {
  const start = guide.indexOf('className="reference-feature-detail-content"')
  const end = guide.indexOf("</main>", start)
  const detail = guide.slice(start, end)

  const explanation = detail.indexOf("Восс объясняет")
  const rule = detail.indexOf("Точное правило")
  const nuances = detail.indexOf("Нюансы Восса")
  const comment = detail.indexOf("Комментарий Восса")

  assert.ok(explanation >= 0)
  assert.ok(rule > explanation)
  assert.ok(nuances > rule)
  assert.ok(comment > nuances)
})

test("collapsed ability card visibly identifies the Voss explanation layer", () => {
  assert.match(guide, /reference-class-feature__eyebrow/)
  assert.match(guide, />Восс объясняет</)
  assert.match(guide, /Объяснение → правило → нюансы → комментарий/)
})

test("nuances are renderer-only structured presentation data", () => {
  assert.match(types, /authorNuances\?: string\[\]/)
  assert.match(voice, /Нюансы Восса/)
  assert.match(voice, /типичн.{0,30}(ошиб|трактов)/i)
  assert.match(voice, /не (?:создают|добавляют|придумывают).{0,30}(нов|скрыт).{0,30}(механ|прав)/i)
})

test("nuance presentation leaves the strict class package parser and CE path intact", () => {
  const bundle = pipelineBundle()
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))

  const resolution = resolveTemplateBundles([bundle], 1)
  assert.ok(resolution.contributions.length >= 3)

  const contract = resolveCharacterContract({
    base: {
      id: "hero",
      name: "Hero",
      level: 1,
      abilities: { strength: 14, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      baseMaxHp: 10,
      baseSpeed: 30,
    },
    state: { currentHp: 10, tempHp: 0, resources: {} },
    contributions: resolution.contributions,
  })

  assert.ok(contract.actions.some((action) => action.key === "field_step"))
  assert.ok(contract.resources.some((resource) => resource.key === "field_step"))
})
