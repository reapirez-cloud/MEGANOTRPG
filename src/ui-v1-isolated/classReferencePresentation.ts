import {
  type ClassReferenceEntry,
  type ClassReferenceSubclass,
  type ClassReferenceSubclassFeature,
} from "../data/classReference"
import {
  clericClassVossComment,
  clericClassVossNarration,
  getClericBaseVossComment,
  getClericBaseVossNarration,
  getClericSubclassFeatureVossComment,
  getClericSubclassFeatureVossNarration,
  getClericSubclassVossComment,
  getClericSubclassVossNarration,
} from "../data/classes/clericVossNarration"
import {
  druidClassVossComment,
  druidClassVossNarration,
  getDruidBaseVossComment,
  getDruidBaseVossNarration,
  getDruidSubclassFeatureVossComment,
  getDruidSubclassFeatureVossNarration,
  getDruidSubclassVossComment,
  getDruidSubclassVossNarration,
} from "../data/classes/druidVossNarration"
import {
  fighterClassVossComment,
  fighterClassVossNarration,
  getFighterBaseVossComment,
  getFighterBaseVossNarration,
  getFighterSubclassFeatureVossComment,
  getFighterSubclassFeatureVossNarration,
  getFighterSubclassVossComment,
  getFighterSubclassVossNarration,
} from "../data/classes/fighterVossNarration"
import {
  getWizardBaseVossComment,
  getWizardBaseVossNarration,
  wizardClassVossComment,
  wizardClassVossNarration,
} from "../data/classes/wizardVossNarration"
import {
  getWizardSubclassVossComment,
  getWizardSubclassVossNarration,
} from "../data/classes/wizardSubclassVossNarration"
import type {
  RuleChoiceDefinition,
  RuleTemplate,
  RuleTemplateLevel,
} from "../rule-templates/types"
import type { StoredMechanic } from "../types/characterMechanics"

export type UiV1ReferenceFeature = {
  level: number
  sourceKey: string
  name: string
  rule: string
  facts: string[]
  meta: string
  vossExplanation: string
  vossComment: string
}

export type UiV1ProficiencyGroup = {
  id: string
  title: string
  items: string[]
}

export type UiV1MechanicGroup = {
  id: string
  title: string
  levels: number[]
  summary: string
  facts: string[]
}

export type UiV1ReferencePresentation = {
  vossExplanation: string
  vossComment: string
  storyFeatures: UiV1ReferenceFeature[]
  proficiencies: UiV1ProficiencyGroup[]
  mechanics: UiV1MechanicGroup[]
}

type RuntimeRow = {
  level: number
  mechanics: StoredMechanic[]
  choices: RuleChoiceDefinition[]
}

type RuntimeSourceGroup = {
  level: number
  sourceKey: string
  mechanics: StoredMechanic[]
}

const economyLabel: Record<string, string> = {
  action: "Действие",
  bonus_action: "Бонусное действие",
  reaction: "Реакция",
  magic_action: "Магическое действие",
  free: "Без действия",
}

const rechargeLabel: Record<string, string> = {
  short_rest: "короткий отдых",
  long_rest: "долгий отдых",
  dawn: "рассвет",
  turn: "ход",
  round: "раунд",
}

const proficiencyOrder = [
  "Оружие",
  "Доспехи",
  "Спасброски",
  "Навыки",
  "Инструменты",
  "Языки",
  "Прочее",
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function payloadText(
  mechanic: StoredMechanic,
  key: "label" | "description" | "authorExplanation" | "authorComment",
) {
  if (mechanic.type !== "grant") return ""
  const payload: unknown = mechanic.payload
  if (!isRecord(payload)) return ""
  const value = payload[key]
  return typeof value === "string" ? value.trim() : ""
}

function sourceKey(mechanic: StoredMechanic) {
  return mechanic.sourceKey?.trim() || mechanic.id
}

function canonicalSourceKey(value: string) {
  return value.replace(/^feature:/, "").replace(/^class:[^:]+:/, "")
}

function isSpellSlot(mechanic: StoredMechanic) {
  return mechanic.type === "resource" && /^spell_slot_[1-9]$/.test(mechanic.key)
}

function mechanicName(mechanic: StoredMechanic) {
  if (mechanic.type === "resource" || mechanic.type === "action") return mechanic.label
  if (mechanic.type === "spell") return mechanic.payload.spell.name
  if (mechanic.type === "numeric" || mechanic.type === "formula") return mechanic.label || ""
  return payloadText(mechanic, "label") || mechanic.label || ""
}

function featureGrant(mechanics: StoredMechanic[]) {
  return mechanics.find(
    (mechanic) => mechanic.type === "grant" && mechanic.target === "feature",
  )
}

function featureName(mechanics: StoredMechanic[]) {
  const grant = featureGrant(mechanics)
  if (grant) return mechanicName(grant)

  const primary = mechanics.find((mechanic) => !isSpellSlot(mechanic))
  return primary ? mechanicName(primary) : ""
}

function featureRule(mechanics: StoredMechanic[]) {
  for (const mechanic of mechanics) {
    const description = payloadText(mechanic, "description")
    if (description) return description
  }
  return ""
}

function featureExplanation(mechanics: StoredMechanic[]) {
  for (const mechanic of mechanics) {
    if (mechanic.type === "grant" && mechanic.target === "feature") {
      const explanation = payloadText(mechanic, "authorExplanation")
      if (explanation) return explanation
    }
  }

  for (const mechanic of mechanics) {
    const explanation = mechanic.presentation?.authorExplanation?.trim()
    if (explanation) return explanation
  }

  return ""
}

function featureComment(mechanics: StoredMechanic[]) {
  for (const mechanic of mechanics) {
    if (mechanic.type === "grant" && mechanic.target === "feature") {
      const comment = payloadText(mechanic, "authorComment")
      if (comment) return comment
    }
  }

  for (const mechanic of mechanics) {
    const comment = mechanic.presentation?.authorComment?.trim()
    if (comment) return comment
  }

  return ""
}

function featureMeta(mechanics: StoredMechanic[]) {
  const action = mechanics.find((mechanic) => mechanic.type === "action")
  if (action?.type === "action") {
    return economyLabel[action.economy] || action.economy
  }

  const resource = mechanics.find((mechanic) => mechanic.type === "resource")
  if (resource?.type === "resource") {
    const triggers = (Array.isArray(resource.recharge) ? resource.recharge : [resource.recharge])
      .map((item) => rechargeLabel[item] || item)
      .filter(Boolean)

    if (triggers.length) return "Восстановление: " + triggers.join(" / ")
  }

  return ""
}

function resourceFacts(mechanics: StoredMechanic[]) {
  const facts: string[] = []
  const byKey = new Map<string, StoredMechanic[]>()

  for (const mechanic of mechanics) {
    if (mechanic.type !== "resource" || isSpellSlot(mechanic)) continue
    byKey.set(mechanic.key, [...(byKey.get(mechanic.key) || []), mechanic])
  }

  for (const rows of byKey.values()) {
    const resources = rows.filter((row): row is Extract<StoredMechanic, { type: "resource" }> => row.type === "resource")
    const latest = resources[resources.length - 1]
    if (!latest) continue

    const maxima = [...new Set(resources.map((row) => typeof row.max === "number" ? String(row.max) : "по формуле"))]
    const max = maxima.length === 1 ? maxima[0] : "растёт по уровням"
    facts.push(`Ресурс «${latest.label}»: ${max}.`)

    const triggers = (Array.isArray(latest.recharge) ? latest.recharge : [latest.recharge])
      .map((item) => rechargeLabel[item] || item)
      .filter(Boolean)
    if (triggers.length) facts.push("Восстановление: " + triggers.join(" или ") + ".")
  }

  return facts
}

function actionFacts(mechanics: StoredMechanic[]) {
  const actions = mechanics.filter(
    (mechanic): mechanic is Extract<StoredMechanic, { type: "action" }> => mechanic.type === "action",
  )
  if (!actions.length) return [] as string[]

  const labels = [...new Set(actions.map((action) => action.label).filter(Boolean))]
  const economies = [...new Set(actions.map((action) => economyLabel[action.economy] || action.economy).filter(Boolean))]
  const facts: string[] = []

  if (labels.length === 1) facts.push("Действие: " + labels[0] + ".")
  else if (labels.length > 1) {
    const visible = labels.slice(0, 3)
    facts.push(
      "Действия: " +
        visible.join(", ") +
        (labels.length > visible.length ? ` и ещё ${labels.length - visible.length}.` : "."),
    )
  }

  if (economies.length === 1) facts.push("Экономика: " + economies[0] + ".")
  return facts
}

function mechanicFacts(mechanics: StoredMechanic[]) {
  const facts = [...resourceFacts(mechanics), ...actionFacts(mechanics)]

  for (const mechanic of mechanics) {
    if (mechanic.type === "spell") {
      const level = mechanic.payload.spell.level
      facts.push(
        level === 0
          ? `Даёт заговор «${mechanic.payload.spell.name}».`
          : `Даёт заклинание «${mechanic.payload.spell.name}» (${level} ур.).`,
      )
    }
  }

  return [...new Set(facts)]
}

function runtimeRows(template: RuleTemplate | undefined, levels: RuleTemplateLevel[]) {
  if (!template) return [] as RuntimeRow[]

  const baseLevel = template.kind === "subclass"
    ? Math.max(1, template.unlock_level || 1)
    : 1
  const rows: RuntimeRow[] = [{
    level: baseLevel,
    mechanics: template.mechanics || [],
    choices: template.choices || [],
  }]

  for (const level of levels.filter((entry) => entry.template_id === template.id)) {
    rows.push({
      level: level.level,
      mechanics: level.mechanics || [],
      choices: level.choices || [],
    })
  }

  return rows.sort((left, right) => left.level - right.level)
}

function runtimeSourceGroups(template: RuleTemplate | undefined, levels: RuleTemplateLevel[]) {
  const result: RuntimeSourceGroup[] = []

  for (const row of runtimeRows(template, levels)) {
    const groups = new Map<string, StoredMechanic[]>()

    for (const mechanic of row.mechanics) {
      if (isSpellSlot(mechanic)) continue
      const key = canonicalSourceKey(sourceKey(mechanic))
      groups.set(key, [...(groups.get(key) || []), mechanic])
    }

    for (const [groupSourceKey, mechanics] of groups.entries()) {
      result.push({ level: row.level, sourceKey: groupSourceKey, mechanics })
    }
  }

  return result
}

function normalizeFeatureName(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "")
}

function genericProgressionMarker(group: RuntimeSourceGroup) {
  const key = group.sourceKey
  const name = featureName(group.mechanics).toLocaleLowerCase("ru")
  if (key === "hit-die" || key === "ability-score-improvement" || key === "epic-boon") return true
  if (key === "subclass" || key.endsWith("-subclass")) return true
  if (name.startsWith("способность подкласса") || name.startsWith("подкласс ")) return true
  if (name.includes("воинский архетип") && key.includes("subclass")) return true
  return false
}

function authoredFeatureView(
  feature: ClassReferenceSubclassFeature,
  source: string,
  runtimeGroups: RuntimeSourceGroup[],
) {
  const sameLevel = runtimeGroups.filter(
    (group) => group.level === feature.level && featureGrant(group.mechanics) && !genericProgressionMarker(group),
  )
  const normalizedAuthored = normalizeFeatureName(feature.name)
  const exactMatches = sameLevel.filter((group) => {
    const runtimeName = normalizeFeatureName(featureName(group.mechanics))
    return runtimeName && (
      normalizedAuthored.includes(runtimeName) ||
      runtimeName.includes(normalizedAuthored)
    )
  })
  const matches = exactMatches.length
    ? exactMatches
    : feature.name.includes(" и ")
      ? sameLevel
      : sameLevel.length === 1
        ? sameLevel
        : []

  const runtimeMechanics = matches.flatMap((group) => group.mechanics)

  return {
    level: feature.level,
    sourceKey: source,
    name: feature.name,
    rule: feature.mechanics || featureRule(runtimeMechanics),
    facts: [...new Set([...(feature.details || []), ...mechanicFacts(runtimeMechanics)])],
    meta: featureMeta(runtimeMechanics),
    vossExplanation: feature.explanation || featureExplanation(runtimeMechanics),
    vossComment: feature.voss || featureComment(runtimeMechanics),
  } satisfies UiV1ReferenceFeature
}

function authoredClassFeatures(entry: ClassReferenceEntry) {
  return entry.features || []
}

function classFeatureNarration(entry: ClassReferenceEntry, group: RuntimeSourceGroup) {
  const name = featureName(group.mechanics)
  if (entry.id === "fighter") return getFighterBaseVossNarration(group.level, name)
  if (entry.id === "druid") return getDruidBaseVossNarration(group.level, name)
  if (entry.id === "cleric") return getClericBaseVossNarration(group.level, group.sourceKey)
  if (entry.id === "wizard") return getWizardBaseVossNarration(group.level, group.sourceKey)
  return featureExplanation(group.mechanics)
}

function classFeatureComment(entry: ClassReferenceEntry, group: RuntimeSourceGroup) {
  const name = featureName(group.mechanics)
  if (entry.id === "fighter") return getFighterBaseVossComment(group.level, name)
  if (entry.id === "druid") return getDruidBaseVossComment(group.level, name)
  if (entry.id === "cleric") return getClericBaseVossComment(group.level, group.sourceKey)
  if (entry.id === "wizard") return getWizardBaseVossComment(group.level, group.sourceKey)
  return featureComment(group.mechanics)
}

function subclassFeatureNarration(
  entry: ClassReferenceEntry,
  subclass: ClassReferenceSubclass,
  group: RuntimeSourceGroup,
) {
  const name = featureName(group.mechanics)
  if (entry.id === "fighter") {
    return getFighterSubclassFeatureVossNarration(subclass.id, group.level, name)
  }
  if (entry.id === "druid") {
    return getDruidSubclassFeatureVossNarration(subclass.id, name)
  }
  if (entry.id === "cleric") {
    return getClericSubclassFeatureVossNarration(subclass.id, group.sourceKey)
  }
  return featureExplanation(group.mechanics)
}

function subclassFeatureComment(
  entry: ClassReferenceEntry,
  subclass: ClassReferenceSubclass,
  group: RuntimeSourceGroup,
) {
  const name = featureName(group.mechanics)
  if (entry.id === "fighter") {
    return getFighterSubclassFeatureVossComment(subclass.id, group.level, name)
  }
  if (entry.id === "druid") {
    return getDruidSubclassFeatureVossComment(subclass.id, name)
  }
  if (entry.id === "cleric") {
    return getClericSubclassFeatureVossComment(subclass.id, group.sourceKey)
  }
  return featureComment(group.mechanics)
}

function runtimeStoryFeatures(
  groups: RuntimeSourceGroup[],
  narration: (group: RuntimeSourceGroup) => string,
  comment: (group: RuntimeSourceGroup) => string,
) {
  return groups
    .filter((group) => featureGrant(group.mechanics) && !genericProgressionMarker(group))
    .map((group) => ({
      level: group.level,
      sourceKey: group.sourceKey,
      name: featureName(group.mechanics),
      rule: featureRule(group.mechanics),
      facts: mechanicFacts(group.mechanics),
      meta: featureMeta(group.mechanics),
      vossExplanation: narration(group),
      vossComment: comment(group),
    }))
    .filter((feature) => feature.name && feature.vossExplanation)
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name, "ru"))
}

function classifyProficiency(label: string, key: string) {
  const value = (label + " " + key).toLocaleLowerCase("ru")
  if (value.includes("спасброс")) return "Спасброски"
  if (value.includes("навык") || value.includes("skill:")) return "Навыки"
  if (value.includes("доспех") || value.includes("брон") || value.includes("armor")) return "Доспехи"
  if (value.includes("оруж") || value.includes("weapon")) return "Оружие"
  if (value.includes("инструмент") || value.includes("tool")) return "Инструменты"
  if (value.includes("язык") || value.includes("language")) return "Языки"
  return "Прочее"
}

function choiceText(choice: RuleChoiceDefinition) {
  const labels = choice.options
    .map((option) => choice.option_labels?.[option] || option.replace(/^[^:]+:/, ""))
    .filter(Boolean)
  const count = Math.max(1, choice.count || 1)
  if (!labels.length) return choice.label
  return `Выберите ${count}: ${labels.join(", ")}`
}

function buildProficiencies(template: RuleTemplate | undefined, levels: RuleTemplateLevel[]) {
  if (!template) return [] as UiV1ProficiencyGroup[]

  const groups = new Map<string, string[]>()

  for (const row of runtimeRows(template, levels)) {
    for (const mechanic of row.mechanics) {
      if (mechanic.type !== "grant" || mechanic.target !== "proficiency") continue
      const label = payloadText(mechanic, "label") || mechanic.label || ""
      if (!label) continue
      const category = classifyProficiency(label, mechanic.key)
      groups.set(category, [...(groups.get(category) || []), label])
    }

    for (const choice of row.choices) {
      if (choice.target !== "proficiency") continue
      const category = classifyProficiency(choice.label, choice.key)
      groups.set(category, [...(groups.get(category) || []), choiceText(choice)])
    }
  }

  return proficiencyOrder
    .filter((title) => groups.has(title))
    .map((title) => ({
      id: title.toLocaleLowerCase("ru"),
      title,
      items: [...new Set(groups.get(title) || [])],
    }))
}

function humanMechanicTitle(mechanics: StoredMechanic[]) {
  const preferred = [
    ...mechanics.filter((mechanic) => mechanic.type === "grant" && mechanic.target === "feature"),
    ...mechanics.filter((mechanic) => mechanic.type === "resource"),
    ...mechanics.filter((mechanic) => mechanic.type === "action"),
    ...mechanics,
  ]

  for (const mechanic of preferred) {
    const label = mechanicName(mechanic).trim()
    if (!label) continue
    if (/^[a-z]+:[a-z0-9:_-]+$/i.test(label)) continue
    return label
  }

  return ""
}

function buildMechanics(template: RuleTemplate | undefined, levels: RuleTemplateLevel[]) {
  if (!template) return [] as UiV1MechanicGroup[]

  const bySource = new Map<string, RuntimeSourceGroup[]>()
  for (const group of runtimeSourceGroups(template, levels)) {
    const useful = group.mechanics.filter(
      (mechanic) => !(mechanic.type === "grant" && mechanic.target === "proficiency"),
    )
    if (!useful.length) continue
    bySource.set(group.sourceKey, [...(bySource.get(group.sourceKey) || []), { ...group, mechanics: useful }])
  }

  const result: UiV1MechanicGroup[] = []

  for (const [id, sourceGroups] of bySource.entries()) {
    const mechanics = sourceGroups.flatMap((group) => group.mechanics)
    const title = humanMechanicTitle(mechanics)
    if (!title) continue

    const summaries = [...new Set(sourceGroups.map((group) => featureRule(group.mechanics)).filter(Boolean))]
    result.push({
      id,
      title,
      levels: [...new Set(sourceGroups.map((group) => group.level))].sort((a, b) => a - b),
      summary: summaries[0] || "",
      facts: mechanicFacts(mechanics),
    })
  }

  for (const row of runtimeRows(template, levels)) {
    for (const choice of row.choices) {
      if (choice.target === "proficiency") continue
      const id = `choice:${choice.key}`
      if (result.some((item) => item.id === id)) continue
      result.push({
        id,
        title: choice.label,
        levels: [row.level],
        summary: `Выбор: ${Math.max(1, choice.count || 1)} вариант(а).`,
        facts: choice.options.length
          ? [choice.options.map((option) => choice.option_labels?.[option] || option.replace(/^[^:]+:/, "")).join(", ")]
          : [],
      })
    }
  }

  return result.sort(
    (left, right) =>
      (left.levels[0] || 1) - (right.levels[0] || 1) ||
      left.title.localeCompare(right.title, "ru"),
  )
}

function mechanicsFallback(features: UiV1ReferenceFeature[]) {
  return features.map((feature) => ({
    id: "reference:" + feature.sourceKey,
    title: feature.name,
    levels: [feature.level],
    summary: feature.rule,
    facts: feature.facts,
  }))
}

function findClassTemplate(entry: ClassReferenceEntry, templates: RuleTemplate[]) {
  if (entry.referenceOnly) return undefined

  return (
    templates.find(
      (template) =>
        template.kind === "class" &&
        template.catalog_key === "class:" + entry.id,
    ) ||
    templates.find(
      (template) =>
        template.kind === "class" && template.slug === entry.id + "-core",
    )
  )
}

function findSubclassTemplate(
  entry: ClassReferenceEntry,
  subclass: ClassReferenceSubclass,
  templates: RuleTemplate[],
) {
  if (entry.referenceOnly || subclass.referenceOnly) return undefined

  return templates.find(
    (template) =>
      template.kind === "subclass" &&
      template.catalog_key ===
        "subclass:" + entry.id + ":" + subclass.id,
  )
}

function classIntro(entry: ClassReferenceEntry, template: RuleTemplate | undefined) {
  if (entry.id === "fighter") return fighterClassVossNarration
  if (entry.id === "druid") return druidClassVossNarration
  if (entry.id === "cleric") return clericClassVossNarration
  if (entry.id === "wizard") return wizardClassVossNarration
  return entry.explanation?.trim() || template?.author_description?.trim() || ""
}

function classComment(entry: ClassReferenceEntry, template: RuleTemplate | undefined) {
  if (entry.id === "fighter") return fighterClassVossComment
  if (entry.id === "druid") return druidClassVossComment
  if (entry.id === "cleric") return clericClassVossComment
  if (entry.id === "wizard") return wizardClassVossComment
  return entry.voss?.trim() || template?.author_comment?.trim() || ""
}

function subclassIntro(
  entry: ClassReferenceEntry,
  subclass: ClassReferenceSubclass,
  template: RuleTemplate | undefined,
) {
  if (entry.id === "fighter") return getFighterSubclassVossNarration(subclass.id)
  if (entry.id === "druid") return getDruidSubclassVossNarration(subclass.id)
  if (entry.id === "cleric") return getClericSubclassVossNarration(subclass.id)
  if (entry.id === "wizard") return getWizardSubclassVossNarration(subclass.id)
  return subclass.explanation?.trim() || template?.author_description?.trim() || ""
}

function subclassComment(
  entry: ClassReferenceEntry,
  subclass: ClassReferenceSubclass,
  template: RuleTemplate | undefined,
) {
  if (entry.id === "fighter") return getFighterSubclassVossComment(subclass.id)
  if (entry.id === "druid") return getDruidSubclassVossComment(subclass.id)
  if (entry.id === "cleric") return getClericSubclassVossComment(subclass.id)
  if (entry.id === "wizard") return getWizardSubclassVossComment(subclass.id)
  return subclass.voss?.trim() || template?.author_comment?.trim() || ""
}

export function buildClassPresentation(
  entry: ClassReferenceEntry,
  templates: RuleTemplate[],
  levels: RuleTemplateLevel[],
): UiV1ReferencePresentation {
  const template = findClassTemplate(entry, templates)
  const groups = runtimeSourceGroups(template, levels)
  const authored = authoredClassFeatures(entry)
  const storyFeatures = authored.length
    ? authored.map((feature, index) =>
        authoredFeatureView(feature, `reference:class:${entry.id}:${index}`, groups),
      )
    : runtimeStoryFeatures(
        groups,
        (group) => classFeatureNarration(entry, group),
        (group) => classFeatureComment(entry, group),
      )
  const mechanics = buildMechanics(template, levels)

  return {
    vossExplanation: classIntro(entry, template),
    vossComment: classComment(entry, template),
    storyFeatures,
    proficiencies: buildProficiencies(template, levels),
    mechanics: mechanics.length ? mechanics : mechanicsFallback(storyFeatures),
  }
}

export function buildSubclassPresentation(
  entry: ClassReferenceEntry,
  subclass: ClassReferenceSubclass,
  templates: RuleTemplate[],
  levels: RuleTemplateLevel[],
): UiV1ReferencePresentation {
  const template = findSubclassTemplate(entry, subclass, templates)
  const groups = runtimeSourceGroups(template, levels)
  const authored = subclass.features || []
  const storyFeatures = authored.length
    ? authored.map((feature, index) =>
        authoredFeatureView(
          feature,
          `reference:subclass:${entry.id}:${subclass.id}:${index}`,
          groups,
        ),
      )
    : runtimeStoryFeatures(
        groups,
        (group) => subclassFeatureNarration(entry, subclass, group),
        (group) => subclassFeatureComment(entry, subclass, group),
      )
  const mechanics = buildMechanics(template, levels)

  return {
    vossExplanation: subclassIntro(entry, subclass, template),
    vossComment: subclassComment(entry, subclass, template),
    storyFeatures,
    proficiencies: buildProficiencies(template, levels),
    mechanics: mechanics.length ? mechanics : mechanicsFallback(storyFeatures),
  }
}
