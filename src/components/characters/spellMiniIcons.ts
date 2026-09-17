import type { CharacterSpell } from "../../types/characterSheet.ts"

export type SpellMiniIconKind =
  | "casting-time"
  | "range"
  | "duration"
  | "components"
  | "concentration"
  | "ritual"
  | "prepared"

export type SpellMiniIconDescriptor = {
  kind: SpellMiniIconKind
  label: string
  value: string
  emphasized?: boolean
}

function text(value: string | null | undefined): string {
  return value?.trim() || ""
}

export function compactSpellComponents(value: string): string {
  const primary = text(value).split("(", 1)[0]?.trim() || ""
  return primary
    .replace(/\s*,\s*/g, " · ")
    .replace(/\s*;\s*/g, " · ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Renderer-only spell metadata projection.
 *
 * The descriptors deliberately preserve the stored spell facts instead of
 * inferring mechanics from prose. This keeps the mini-icon system reusable for
 * every class while Character Engine remains the source of mechanical truth.
 */
export function buildSpellMiniIcons(spell: CharacterSpell): SpellMiniIconDescriptor[] {
  const items: SpellMiniIconDescriptor[] = []
  const castingTime = text(spell.casting_time)
  const range = text(spell.spell_range)
  const duration = text(spell.duration)
  const components = compactSpellComponents(spell.components)

  if (castingTime) items.push({ kind: "casting-time", label: "Накладывание", value: castingTime })
  if (range) items.push({ kind: "range", label: "Дистанция", value: range })
  if (duration) items.push({ kind: "duration", label: "Длительность", value: duration })
  if (components) items.push({ kind: "components", label: "Компоненты", value: components })
  if (spell.concentration) items.push({ kind: "concentration", label: "Концентрация", value: "Конц.", emphasized: true })
  if (spell.ritual) items.push({ kind: "ritual", label: "Ритуал", value: "Ритуал", emphasized: true })
  if (spell.prepared) items.push({ kind: "prepared", label: "Подготовка", value: "Готово", emphasized: true })

  return items
}

export function spellMiniIconAriaLabel(item: SpellMiniIconDescriptor): string {
  return `${item.label}: ${item.value}`
}
