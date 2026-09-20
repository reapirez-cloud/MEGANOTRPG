import type {
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedResource,
  ResolvedSpell,
} from "../character-engine/index.ts"
import type { ChatSpellCastSelection } from "./gameplayActions.ts"

export const ABILITY_ROWS = [
  ["strength", "СИЛ", "Сила"],
  ["dexterity", "ЛОВ", "Ловкость"],
  ["constitution", "ТЕЛ", "Телосложение"],
  ["intelligence", "ИНТ", "Интеллект"],
  ["wisdom", "МДР", "Мудрость"],
  ["charisma", "ХАР", "Харизма"],
] as const

export const SKILL_NAMES: Record<string, string> = {
  acrobatics: "Акробатика",
  animal_handling: "Уход за животными",
  arcana: "Магия",
  athletics: "Атлетика",
  deception: "Обман",
  history: "История",
  insight: "Проницательность",
  intimidation: "Запугивание",
  investigation: "Анализ",
  medicine: "Медицина",
  nature: "Природа",
  perception: "Восприятие",
  performance: "Выступление",
  persuasion: "Убеждение",
  religion: "Религия",
  sleight_of_hand: "Ловкость рук",
  stealth: "Скрытность",
  survival: "Выживание",
}

export function signed(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

function payloadLabel(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const label = (payload as Record<string, unknown>).label
  return typeof label === "string" && label.trim() ? label.trim() : null
}

export function resourceLabels(contract: ResolvedCharacterContract | null) {
  const result = new Map<string, string>()
  if (!contract) return result
  for (const grant of contract.grants) {
    if (grant.target !== "resource") continue
    const label = payloadLabel(grant.payload)
    if (!label) continue
    const stateKey = grant.variantKey === "default"
      ? grant.key
      : `${grant.key}::${grant.variantKey}`
    result.set(stateKey, label)
  }
  return result
}

export function resourceName(
  resource: ResolvedResource,
  labels: Map<string, string>,
) {
  const explicit = labels.get(resource.stateKey)
  if (explicit) return explicit
  return resource.key
    .split(/[_-]+/g)
    .map((part) => part ? part[0]!.toLocaleUpperCase("ru-RU") + part.slice(1) : part)
    .join(" ")
}

export function actionSummary(
  action: ResolvedAction,
  resources: Map<string, ResolvedResource>,
  labels: Map<string, string>,
) {
  const parts: string[] = []
  if (action.attack) parts.push(`атака ${signed(action.attack.bonus.value)}`)
  const first = action.damage[0]
  if (first?.dice) {
    parts.push(`${first.dice.count}d${first.dice.sides}${first.modifier.value ? signed(first.modifier.value) : ""} ${first.type}`)
  }
  if (action.resourceCosts.length) {
    parts.push(action.resourceCosts.map((cost) => {
      const resolved = resources.get(cost.stateKey)
      return resolved
        ? `${cost.amount} ${resourceName(resolved, labels)}`
        : `${cost.amount} ${cost.key}`
    }).join(" + "))
  }
  return parts.join(" · ") || action.economy.split("_").join(" ")
}

export function spellSummary(spell: ResolvedSpell) {
  const sources = [...new Set(
    spell.accesses.flatMap((access) =>
      access.sources.map((ref) => ref.source.name),
    ).filter(Boolean),
  )]
  return [
    spell.identity.level === 0 ? "Заговор" : `${spell.identity.level} уровень`,
    spell.identity.school || "",
    sources.slice(0, 2).join(" · "),
  ].filter(Boolean).join(" · ")
}

export function spellCastSelections(spell: ResolvedSpell): ChatSpellCastSelection[] {
  const result: ChatSpellCastSelection[] = []
  for (const access of spell.accesses) {
    if (!access.available) continue
    for (const method of access.methods) {
      if (!method.available) continue
      if (!method.resourceOptions.length) {
        result.push({ spell, accessKey: access.key, methodKey: method.key })
        continue
      }
      for (const option of method.resourceOptions) {
        if (!option.available) continue
        result.push({
          spell,
          accessKey: access.key,
          methodKey: method.key,
          optionKey: option.key,
        })
      }
    }
  }
  return result
}

export function spellCastSelectionLabel(
  selection: ChatSpellCastSelection,
  contract: ResolvedCharacterContract,
) {
  const access = selection.spell.accesses.find((item) => item.key === selection.accessKey)
  const method = access?.methods.find((item) => item.key === selection.methodKey)
  const option = selection.optionKey
    ? method?.resourceOptions.find((item) => item.key === selection.optionKey)
    : undefined
  if (!method) return "Недоступный способ"
  if (!option) return method.kind === "at_will" ? "Без расхода" : method.kind

  const labels = resourceLabels(contract)
  const resources = new Map(contract.resources.map((resource) => [resource.stateKey, resource]))
  const costs = option.costs.map((cost) => {
    const resource = resources.get(cost.stateKey)
    return resource
      ? `${cost.amount} ${resourceName(resource, labels)}`
      : `${cost.amount} ${cost.key}`
  })
  return [
    option.castLevel > 0 ? `${option.castLevel} ур.` : "Без уровня",
    costs.length ? costs.join(" + ") : "Без расхода",
  ].join(" · ")
}

export function isInventoryAction(action: ResolvedAction) {
  return action.sources.some((ref) =>
    ref.source.sourceType === "inventory_item" || ref.source.id.startsWith("item:"),
  )
}

export function isSpellModifierAction(action: ResolvedAction) {
  return action.tags.includes("spell_modifier")
}

export function templateChoiceOptions(action: ResolvedAction) {
  const effect = action.effects.find((item) => item.kind === "template_choice")
  if (!effect || effect.kind !== "template_choice") return []
  return effect.options.map((key) => ({
    key,
    label: effect.optionLabels?.[key] || key,
  }))
}
