import { useMemo } from "react"
import { useRuleTemplates } from "../../hooks/useRuleTemplates"
import type { StoredMechanic } from "../../types/characterMechanics"
import "./ChatSpellDetailSheet.css"

type Props = {
  campaignId: string
  mechanicId: string
  label: string
  detail?: string
  onClose: () => void
}

type MechanicEntry = {
  ownerKey: string
  mechanic: StoredMechanic
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function payloadText(mechanic: StoredMechanic | undefined, key: "label" | "description" | "authorExplanation" | "authorComment") {
  if (!mechanic || mechanic.type !== "grant" || !isRecord(mechanic.payload)) return ""
  const value = mechanic.payload[key]
  return typeof value === "string" ? value.trim() : ""
}

function sourceKey(mechanic: StoredMechanic) {
  return mechanic.sourceKey?.trim() || mechanic.id
}

function economyLabel(value: string) {
  if (value === "action") return "Действие"
  if (value === "bonus_action") return "Бонусное действие"
  if (value === "reaction") return "Реакция"
  if (value === "magic_action") return "Магическое действие"
  if (value === "free") return "Без действия"
  return value.split("_").join(" ")
}

function mechanicFacts(mechanics: StoredMechanic[], fallbackDetail: string) {
  const facts: string[] = []
  for (const mechanic of mechanics) {
    if (mechanic.type === "action") {
      facts.push(`Применение: ${economyLabel(mechanic.economy)}.`)
      if (mechanic.resourceKey && mechanic.resourceCost) facts.push(`Цена: ${mechanic.resourceCost} ед. ресурса «${mechanic.resourceKey}».`)
      for (const cost of mechanic.resourceCosts || []) facts.push(`Цена: ${cost.amount} ед. ресурса «${cost.key}».`)
      if (mechanic.damage?.length) {
        const damage = mechanic.damage.map((part) => {
          const count = typeof part.count === "number" ? part.count : "?"
          const sides = typeof part.sides === "number" ? part.sides : "?"
          return `${count}к${sides}${part.flat ? `+${part.flat}` : ""} ${part.damageType}`
        }).join(" + ")
        facts.push(`Урон: ${damage}.`)
      }
    }
    if (mechanic.type === "resource") {
      const max = typeof mechanic.max === "number" ? String(mechanic.max) : "по формуле персонажа"
      facts.push(`Ресурс «${mechanic.label}»: ${max}.`)
    }
  }
  if (!facts.length && fallbackDetail.trim()) facts.push(fallbackDetail.trim())
  return [...new Set(facts)]
}

export default function ChatActionDetailSheet({ campaignId, mechanicId, label, detail = "", onClose }: Props) {
  const { templates, levels, loading, error } = useRuleTemplates(campaignId)

  const view = useMemo(() => {
    const entries: MechanicEntry[] = []
    for (const template of templates) {
      for (const mechanic of template.mechanics || []) entries.push({ ownerKey: `${template.id}:base`, mechanic })
      for (const level of levels.filter((item) => item.template_id === template.id)) {
        for (const mechanic of level.mechanics || []) entries.push({ ownerKey: `${template.id}:level:${level.level}`, mechanic })
      }
    }

    const target = entries.find((entry) => entry.mechanic.id === mechanicId)
    if (!target) return null
    const key = sourceKey(target.mechanic)
    const mechanics = entries
      .filter((entry) => entry.ownerKey === target.ownerKey && sourceKey(entry.mechanic) === key)
      .map((entry) => entry.mechanic)
    const feature = mechanics.find((mechanic) => mechanic.type === "grant" && mechanic.target === "feature")
    const explanation = payloadText(feature, "authorExplanation")
      || mechanics.map((mechanic) => mechanic.presentation?.authorExplanation?.trim() || "").find(Boolean)
      || ""
    const description = payloadText(feature, "description") || detail.trim()
    const comment = payloadText(feature, "authorComment")
      || mechanics.map((mechanic) => mechanic.presentation?.authorComment?.trim() || "").find(Boolean)
      || ""
    return {
      name: payloadText(feature, "label") || label,
      explanation,
      description,
      comment,
      facts: mechanicFacts(mechanics, detail),
    }
  }, [detail, label, levels, mechanicId, templates])

  return (
    <div className="sheet-backdrop chat-spell-detail__backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <article className="bottom-sheet chat-spell-detail" role="dialog" aria-modal="true" aria-label={view?.name || label}>
        <div className="sheet-handle" />
        <header className="chat-spell-detail__head">
          <div><small>Классовая способность</small><h3>{view?.name || label || "Способность"}</h3></div>
          <button type="button" onClick={onClose} aria-label="Закрыть описание">×</button>
        </header>

        {loading && <div className="chat-spell-detail__state"><span className="status-spinner" />Загружаем полное описание…</div>}
        {error && <div className="auth-error">{error}</div>}
        {!loading && !error && !view && <div className="auth-error">Описание способности «{label}» не найдено в справочнике.</div>}

        {view && <div className="chat-spell-detail__body">
          {view.explanation && <section className="chat-spell-detail__author"><small>Восс объясняет</small><p>{view.explanation}</p></section>}
          {view.description && <section className="chat-spell-detail__block chat-spell-detail__rules"><small>Полное правило</small><p>{view.description}</p></section>}
          {view.facts.length > 0 && <section className="chat-spell-detail__block"><small>Механика</small>{view.facts.map((fact) => <p key={fact}>{fact}</p>)}</section>}
          {view.comment && <section className="chat-spell-detail__comment"><small>Заметка Восса</small><p>{view.comment}</p></section>}
        </div>}
      </article>
    </div>
  )
}
