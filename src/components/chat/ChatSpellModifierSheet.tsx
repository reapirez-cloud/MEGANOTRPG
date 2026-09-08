import { useMemo, useState } from "react"
import type { ResolvedAction, ResolvedSpell } from "../../character-engine/index.ts"
import "./ChatActionSheet.css"

function spellModifierActions(actions: ResolvedAction[]) {
  return actions.filter((action) => action.tags.includes("spell_modifier"))
}

function isStackException(action: ResolvedAction) {
  return action.tags.includes("metamagic_stack_exception")
}

function canCombineSpellModifier(selected: ResolvedAction[], candidate: ResolvedAction) {
  if (selected.some((action) => action.stateKey === candidate.stateKey)) return true
  if (selected.length >= 3) return false
  if (isStackException(candidate)) return true
  return !selected.some((action) => !isStackException(action))
}

function costLabel(action: ResolvedAction) {
  if (!action.resourceCosts.length) return "Без расхода ресурса"
  return action.resourceCosts
    .map((cost) => `${cost.amount} ${cost.key === "sorcery_points" ? "ОЧ" : cost.key}`)
    .join(" + ")
}

type Props = {
  spell: ResolvedSpell
  modifierActions: ResolvedAction[]
  busy?: boolean
  onClose: () => void
  onCast: (modifiers: ResolvedAction[]) => void | Promise<void>
}

export default function ChatSpellModifierSheet({ spell, modifierActions, busy = false, onClose, onCast }: Props) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const available = useMemo(() => spellModifierActions(modifierActions), [modifierActions])
  const selected = useMemo(
    () => available.filter((action) => selectedKeys.includes(action.stateKey)),
    [available, selectedKeys],
  )

  function toggle(action: ResolvedAction) {
    if (!action.available || busy) return
    setSelectedKeys((current) => {
      if (current.includes(action.stateKey)) return current.filter((key) => key !== action.stateKey)
      const selectedNow = available.filter((entry) => current.includes(entry.stateKey))
      if (!canCombineSpellModifier(selectedNow, action)) return current
      return [...current, action.stateKey]
    })
  }

  return <div className="chat-action-backdrop" onMouseDown={onClose}>
    <section className="chat-action-flow chat-action-flow--v3" onMouseDown={(event) => event.stopPropagation()}>
      <div className="chat-action-flow__handle" />
      <header className="action-v2-head">
        <div>
          <span>Модификатор заклинания</span>
          <strong>{spell.identity.name}</strong>
          <small>Выбранные варианты оплачиваются вместе с этим сотворением.</small>
        </div>
        <button type="button" onClick={onClose}>×</button>
      </header>
      <div className="action-v2-body">
        <div className="action-v2-section-title">
          <strong>Метамагия</strong>
          <small>{selected.length ? `выбрано ${selected.length}` : "необязательно"}</small>
        </div>
        <div className="action-v2-list action-v2-list--cards">
          {available.map((action) => {
            const active = selectedKeys.includes(action.stateKey)
            const combinable = active || canCombineSpellModifier(selected, action)
            return <button
              type="button"
              key={action.stateKey}
              disabled={busy || !action.available || !combinable}
              className={active ? "is-active" : ""}
              onClick={() => toggle(action)}
            >
              <i>{active ? "✓" : "◇"}</i>
              <span>
                <strong>{action.label || action.key}</strong>
                <small>{costLabel(action)}{isStackException(action) ? " · можно сочетать" : ""}</small>
              </span>
              <em>{active ? "✓" : "›"}</em>
            </button>
          })}
        </div>
        {!available.length && <div className="action-v2-empty action-v2-empty--compact">
          <span>◇</span><strong>Нет доступной Метамагии</strong><p>Сначала выберите варианты способности в листе класса.</p>
        </div>}
        <button className="free-dice-roll" disabled={busy} type="button" onClick={() => void onCast(selected)}>
          {selected.length ? `✧ Сотворить · Метамагия ${selected.length}` : "✧ Сотворить без Метамагии"}
        </button>
      </div>
    </section>
  </div>
}
