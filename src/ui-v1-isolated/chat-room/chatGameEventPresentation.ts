import type { UiChatEvent } from "./chatEventModel"

export type GameCardStat = {
  label: string
  value: string
  emphasis?: boolean
}

export type GameCardResource = {
  label: string
  amount: number | null
  current: number | null
  max: number | null
}

export type GameCardRoll = {
  sides: number
  values: number[]
  count: number
  modifier: number | null
  total: number | null
  formula: string
}

export type GameCardPresentation = {
  eyebrow: string
  title: string
  subtitle: string | null
  chips: string[]
  roll: GameCardRoll | null
  stats: GameCardStat[]
  resources: GameCardResource[]
  note: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function stringValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function numberValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return null
}

function signed(value: number | null) {
  if (value === null) return "—"
  if (value > 0) return "+" + value
  return String(value)
}

function actionLabel(value: string | null) {
  if (!value) return null

  const normalized = value.toLocaleLowerCase("en-US")
  if (normalized === "action") return "Действие"
  if (normalized === "magic_action") return "Магическое действие"
  if (normalized === "bonus_action") return "Бонусное действие"
  if (normalized === "reaction") return "Реакция"
  if (normalized === "free") return "Свободное действие"
  if (normalized === "passive") return "Пассивно"
  return value
}

function rollKindLabel(value: string | null) {
  if (!value) return null

  const normalized = value.toLocaleLowerCase("en-US")
  if (normalized === "ability") return "Проверка характеристики"
  if (normalized === "skill") return "Проверка навыка"
  if (normalized === "saving_throw" || normalized === "save") return "Спасбросок"
  if (normalized === "attack") return "Бросок атаки"
  return value
}

function parseResources(payload: Record<string, unknown>) {
  const raw = payload.resourceCosts
  if (!Array.isArray(raw)) return []

  return raw.flatMap((entry): GameCardResource[] => {
    if (!isRecord(entry)) return []

    const label = stringValue(entry, "label", "name") || "Ресурс"
    return [{
      label,
      amount: numberValue(entry, "amount", "cost"),
      current: numberValue(entry, "current"),
      max: numberValue(entry, "max"),
    }]
  })
}

function rollPresentation(event: UiChatEvent, payload: Record<string, unknown>): GameCardPresentation {
  const title = event.game?.label || event.body || "Бросок"
  const kind = rollKindLabel(stringValue(payload, "kind"))
  const d20 = numberValue(payload, "d20")
  const modifier = numberValue(payload, "modifier")
  const total = numberValue(payload, "total")
  const effect = isRecord(payload.effect) ? payload.effect : null

  if (effect) {
    const rawCount = numberValue(effect, "count")
    const rawSides = numberValue(effect, "sides")
    const effectModifier = numberValue(effect, "modifier")
    const effectTotal = numberValue(effect, "total")
    const rolls = Array.isArray(effect.rolls)
      ? effect.rolls.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      : []
    const count =
      rawCount !== null && rawCount >= 1
        ? Math.floor(rawCount)
        : rolls.length || null
    const sides =
      rawSides !== null && rawSides >= 2
        ? Math.floor(rawSides)
        : null
    const formula =
      count !== null && sides !== null
        ? `${count}d${sides}${effectModifier ? signed(effectModifier) : ""}`
        : title
    const roll: GameCardRoll | null =
      count !== null && sides !== null
        ? {
            sides,
            values: rolls,
            count,
            modifier: effectModifier,
            total: effectTotal,
            formula,
          }
        : null

    return {
      eyebrow: "Бросок",
      title,
      subtitle: kind,
      chips: [],
      roll,
      stats: roll
        ? []
        : [
            ...(rolls.length
              ? [{ label: rolls.length === 1 ? "Кубик" : "Кости", value: rolls.join(" · ") }]
              : []),
            ...(effectModifier !== null
              ? [{ label: "Модификатор", value: signed(effectModifier) }]
              : []),
            ...(effectTotal !== null
              ? [{ label: "Итого", value: String(effectTotal), emphasis: true }]
              : []),
          ],
      resources: [],
      note: event.body && event.body !== title ? event.body : null,
    }
  }

  const roll: GameCardRoll | null =
    d20 !== null
      ? {
          sides: 20,
          values: [d20],
          count: 1,
          modifier,
          total,
          formula: `d20${modifier ? signed(modifier) : ""}`,
        }
      : null

  return {
    eyebrow: "Бросок",
    title,
    subtitle: kind,
    chips: [],
    roll,
    stats: roll
      ? []
      : [
          ...(modifier !== null
            ? [{ label: "Модификатор", value: signed(modifier) }]
            : []),
          ...(total !== null
            ? [{ label: "Итого", value: String(total), emphasis: true }]
            : []),
        ],
    resources: [],
    note: event.body && event.body !== title ? event.body : null,
  }
}

function spellPresentation(event: UiChatEvent, payload: Record<string, unknown>): GameCardPresentation {
  const title = event.game?.label || event.body || "Заклинание"
  const detail = event.game?.detail
  const segments = detail
    ? detail.split("·").map((segment) => segment.trim()).filter(Boolean)
    : []

  return {
    eyebrow: "Заклинание",
    title,
    subtitle: segments[0] || null,
    chips: segments.slice(1),
    roll: null,
    stats: [],
    resources: parseResources(payload),
    note: event.body && event.body !== title ? event.body : null,
  }
}

function attackPresentation(event: UiChatEvent, payload: Record<string, unknown>): GameCardPresentation {
  const title = event.game?.label || event.body || "Атака"
  const target = stringValue(payload, "targetName", "target_name", "target")
  const range = stringValue(payload, "rangeLabel", "range_label", "range")
  const attackRoll = numberValue(payload, "attackRoll", "attack_roll", "roll", "d20")
  const modifier = numberValue(payload, "attackModifier", "attack_modifier", "modifier")
  const total = numberValue(payload, "attackTotal", "attack_total", "total")
  const damage = stringValue(payload, "damageLabel", "damage_label", "damage")

  return {
    eyebrow: "Атака",
    title,
    subtitle: target ? "Цель: " + target : null,
    chips: [range, damage].filter((value): value is string => Boolean(value)),
    roll: null,
    stats: [
      ...(attackRoll !== null ? [{ label: "Кубик", value: String(attackRoll) }] : []),
      ...(modifier !== null ? [{ label: "Модификатор", value: signed(modifier) }] : []),
      ...(total !== null ? [{ label: "Итого", value: String(total), emphasis: true }] : []),
    ],
    resources: parseResources(payload),
    note: event.body && event.body !== title ? event.body : null,
  }
}

function itemPresentation(event: UiChatEvent, payload: Record<string, unknown>): GameCardPresentation {
  const title = event.game?.label || event.body || "Предмет"
  const quantity = numberValue(payload, "quantity", "amount")
  const use = actionLabel(stringValue(payload, "detail", "activation", "economy"))

  return {
    eyebrow: "Предмет",
    title,
    subtitle: use,
    chips: quantity !== null ? ["Количество: " + quantity] : [],
    roll: null,
    stats: [],
    resources: parseResources(payload),
    note: event.body && event.body !== title ? event.body : null,
  }
}

function abilityPresentation(event: UiChatEvent, payload: Record<string, unknown>): GameCardPresentation {
  const title = event.game?.label || event.body || "Классовое умение"
  const activation = actionLabel(
    event.game?.detail || stringValue(payload, "activation", "economy"),
  )
  const ability = isRecord(payload.ability) ? payload.ability : null
  const kind = ability ? stringValue(ability, "kind") : null

  return {
    eyebrow: "Классовое умение",
    title,
    subtitle: activation,
    chips: kind === "character_ability" ? ["Способность персонажа"] : [],
    roll: null,
    stats: [],
    resources: parseResources(payload),
    note: event.body && event.body !== title ? event.body : null,
  }
}

export function presentGameEvent(event: UiChatEvent): GameCardPresentation {
  const payload = isRecord(event.game?.payload) ? event.game!.payload! : {}

  if (event.type === "roll") return rollPresentation(event, payload)
  if (event.type === "spell") return spellPresentation(event, payload)
  if (event.type === "attack") return attackPresentation(event, payload)
  if (event.type === "item") return itemPresentation(event, payload)
  return abilityPresentation(event, payload)
}
