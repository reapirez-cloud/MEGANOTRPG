import type {
  ClassReferenceEntry,
  ClassReferenceSubclass,
  ClassReferenceSubclassFeature,
} from "../data/classReference"
import type { RuleTemplate, RuleTemplateLevel } from "../rule-templates/types"
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

export type UiV1ReferencePresentation = {
  vossExplanation: string
  vossComment: string
  features: UiV1ReferenceFeature[]
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

function isSpellSlot(mechanic: StoredMechanic) {
  return mechanic.type === "resource" && /^spell_slot_[1-9]$/.test(mechanic.key)
}

function mechanicName(mechanic: StoredMechanic) {
  if (mechanic.type === "resource" || mechanic.type === "action") return mechanic.label
  if (mechanic.type === "spell") return mechanic.payload.spell.name
  if (mechanic.type === "numeric" || mechanic.type === "formula") return mechanic.label || mechanic.target
  return payloadText(mechanic, "label") || mechanic.label || mechanic.key
}

function featureName(mechanics: StoredMechanic[]) {
  const featureGrant = mechanics.find(
    (mechanic) => mechanic.type === "grant" && mechanic.target === "feature",
  )
  if (featureGrant) return mechanicName(featureGrant)

  const primary = mechanics.find((mechanic) => !isSpellSlot(mechanic))
  return primary ? mechanicName(primary) : "Способность"
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

  for (const mechanic of mechanics) {
    if (mechanic.type !== "grant" || mechanic.target !== "feature") continue
    const payload: unknown = mechanic.payload
    if (!isRecord(payload) || !isRecord(payload.mechanic)) continue
    const economy = payload.mechanic.economy
    if (typeof economy === "string" && economy) return economyLabel[economy] || economy
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

function mechanicFacts(mechanics: StoredMechanic[]) {
  const facts: string[] = []

  for (const mechanic of mechanics) {
    if (isSpellSlot(mechanic)) continue

    if (mechanic.type === "resource") {
      const max = typeof mechanic.max === "number" ? String(mechanic.max) : "по формуле персонажа"
      facts.push("Запас «" + mechanic.label + "»: " + max + ".")

      const triggers = (Array.isArray(mechanic.recharge) ? mechanic.recharge : [mechanic.recharge])
        .map((item) => rechargeLabel[item] || item)
        .filter(Boolean)

      if (triggers.length) facts.push("Восстановление: " + triggers.join(" или ") + ".")
      continue
    }

    if (mechanic.type === "action") {
      const economy = economyLabel[mechanic.economy] || mechanic.economy
      if (economy) facts.push("Применение: " + economy.toLocaleLowerCase("ru") + ".")

      if (mechanic.resourceKey && mechanic.resourceCost) {
        facts.push(
          "Цена: " +
            mechanic.resourceCost +
            " ед. ресурса «" +
            mechanic.resourceKey +
            "».",
        )
      }
      continue
    }

    if (mechanic.type === "spell") {
      const level = mechanic.payload.spell.level
      facts.push(
        level === 0
          ? "Даёт заговор «" + mechanic.payload.spell.name + "»."
          : "Даёт заклинание «" + mechanic.payload.spell.name + "» (" + level + " ур.).",
      )
      continue
    }

    if (mechanic.type === "grant" && mechanic.target === "proficiency") {
      const label = payloadText(mechanic, "label")
      if (label) facts.push("Владение: " + label + ".")
    }
  }

  return [...new Set(facts)]
}

function runtimeFeatures(template: RuleTemplate | undefined, levels: RuleTemplateLevel[]) {
  if (!template) return [] as UiV1ReferenceFeature[]

  const rows: Array<{ level: number; mechanics: StoredMechanic[] }> = []

  if (template.mechanics?.length) {
    rows.push({
      level: template.kind === "subclass" ? Math.max(1, template.unlock_level || 1) : 1,
      mechanics: template.mechanics,
    })
  }

  for (const level of levels.filter((entry) => entry.template_id === template.id)) {
    rows.push({ level: level.level, mechanics: level.mechanics || [] })
  }

  const result: UiV1ReferenceFeature[] = []

  for (const row of rows.sort((left, right) => left.level - right.level)) {
    const groups = new Map<string, StoredMechanic[]>()

    for (const mechanic of row.mechanics) {
      const key = sourceKey(mechanic)
      groups.set(key, [...(groups.get(key) || []), mechanic])
    }

    for (const [groupSourceKey, mechanics] of groups.entries()) {
      if (!mechanics.length || mechanics.every(isSpellSlot)) continue

      result.push({
        level:
          template.kind === "subclass"
            ? Math.max(row.level, template.unlock_level || 1)
            : row.level,
        sourceKey: groupSourceKey,
        name: featureName(mechanics),
        rule: featureRule(mechanics),
        facts: mechanicFacts(mechanics),
        meta: featureMeta(mechanics),
        vossExplanation: featureExplanation(mechanics),
        vossComment: featureComment(mechanics),
      })
    }
  }

  return result
}

function authoredFeatures(
  features: ClassReferenceSubclassFeature[] | undefined,
  prefix: string,
): UiV1ReferenceFeature[] {
  return (features || []).map((feature, index) => ({
    level: feature.level,
    sourceKey: prefix + ":" + feature.level + ":" + index,
    name: feature.name,
    rule: feature.mechanics || "",
    facts: feature.details || [],
    meta: "",
    vossExplanation: feature.explanation || "",
    vossComment: feature.voss || "",
  }))
}

function featureIdentity(feature: Pick<UiV1ReferenceFeature, "level" | "name">) {
  return (
    feature.level +
    ":" +
    feature.name
      .toLocaleLowerCase("ru")
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]+/gi, "")
  )
}

function mergeFeatures(
  runtime: UiV1ReferenceFeature[],
  authored: UiV1ReferenceFeature[],
) {
  if (!runtime.length) return [...authored].sort((a, b) => a.level - b.level)
  if (!authored.length) return [...runtime].sort((a, b) => a.level - b.level)

  const authoredByIdentity = new Map(
    authored.map((feature) => [featureIdentity(feature), feature]),
  )
  const consumed = new Set<string>()

  const merged = runtime.map((feature) => {
    const key = featureIdentity(feature)
    const literary = authoredByIdentity.get(key)
    if (!literary) return feature

    consumed.add(key)
    return {
      ...feature,
      rule: feature.rule || literary.rule,
      facts: [...new Set([...feature.facts, ...literary.facts])],
      vossExplanation: literary.vossExplanation || feature.vossExplanation,
      vossComment: literary.vossComment || feature.vossComment,
    }
  })

  for (const feature of authored) {
    if (!consumed.has(featureIdentity(feature))) merged.push(feature)
  }

  return merged.sort(
    (left, right) =>
      left.level - right.level || left.name.localeCompare(right.name, "ru"),
  )
}

function findClassTemplate(
  entry: ClassReferenceEntry,
  templates: RuleTemplate[],
) {
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

export function buildClassPresentation(
  entry: ClassReferenceEntry,
  templates: RuleTemplate[],
  levels: RuleTemplateLevel[],
): UiV1ReferencePresentation {
  const template = findClassTemplate(entry, templates)
  const runtime = runtimeFeatures(template, levels)
  const authored = authoredFeatures(entry.features, "reference:class:" + entry.id)

  return {
    vossExplanation:
      entry.explanation?.trim() || template?.author_description?.trim() || "",
    vossComment:
      entry.voss?.trim() || template?.author_comment?.trim() || "",
    features: mergeFeatures(runtime, authored),
  }
}

export function buildSubclassPresentation(
  entry: ClassReferenceEntry,
  subclass: ClassReferenceSubclass,
  templates: RuleTemplate[],
  levels: RuleTemplateLevel[],
): UiV1ReferencePresentation {
  const template = findSubclassTemplate(entry, subclass, templates)
  const runtime = runtimeFeatures(template, levels)
  const authored = authoredFeatures(
    subclass.features,
    "reference:subclass:" + entry.id + ":" + subclass.id,
  )

  return {
    vossExplanation:
      subclass.explanation?.trim() ||
      template?.author_description?.trim() ||
      "",
    vossComment:
      subclass.voss?.trim() || template?.author_comment?.trim() || "",
    features: mergeFeatures(runtime, authored),
  }
}
