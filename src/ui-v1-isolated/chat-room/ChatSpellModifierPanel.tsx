import { useMemo, useState } from "react"

import type {
  ResolvedAction,
  ResolvedSpell,
} from "../../character-engine/index.ts"
import "./chat-action-panel.css"

function isStackException(action: ResolvedAction) {
  return action.tags.includes("metamagic_stack_exception")
}

function canCombine(
  selected: ResolvedAction[],
  candidate: ResolvedAction,
) {
  if (selected.some((action) => action.stateKey === candidate.stateKey)) {
    return true
  }
  if (selected.length >= 3) return false
  if (isStackException(candidate)) return true
  return !selected.some((action) => !isStackException(action))
}

function costLabel(action: ResolvedAction) {
  if (!action.resourceCosts.length) return "Без расхода ресурса"
  return action.resourceCosts
    .map((cost) =>
      `${cost.amount} ${cost.key === "sorcery_points" ? "ОЧ" : cost.key}`,
    )
    .join(" + ")
}

export default function ChatSpellModifierPanel({
  spell,
  modifierActions,
  busy = false,
  onClose,
  onCast,
}: {
  spell: ResolvedSpell
  modifierActions: ResolvedAction[]
  busy?: boolean
  onClose: () => void
  onCast: (modifiers: ResolvedAction[]) => void | Promise<void>
}) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const available = useMemo(
    () =>
      modifierActions.filter((action) =>
        action.tags.includes("spell_modifier"),
      ),
    [modifierActions],
  )
  const selected = useMemo(
    () =>
      available.filter((action) => selectedKeys.includes(action.stateKey)),
    [available, selectedKeys],
  )

  const toggle = (action: ResolvedAction) => {
    if (!action.available || busy) return

    setSelectedKeys((current) => {
      if (current.includes(action.stateKey)) {
        return current.filter((key) => key !== action.stateKey)
      }

      const selectedNow = available.filter((entry) =>
        current.includes(entry.stateKey),
      )
      if (!canCombine(selectedNow, action)) return current
      return [...current, action.stateKey]
    })
  }

  return (
    <div className="u1-chat-action-backdrop" data-mode="modifier" onPointerDown={onClose}>
      <section
        className="u1-chat-action-panel"
        aria-label="Метамагия"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="u1-chat-action-head">
          <div>
            <span>Модификатор заклинания</span>
            <strong>{spell.identity.name}</strong>
            <small>
              {selected.length
                ? `Выбрано: ${selected.length}`
                : "Метамагия необязательна"}
            </small>
          </div>
          <button type="button" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="u1-chat-action-body">
          {available.length ? (
            <div className="u1-chat-action-list">
              {available.map((action) => {
                const active = selectedKeys.includes(action.stateKey)
                const combinable = active || canCombine(selected, action)

                return (
                  <button
                    type="button"
                    key={action.stateKey}
                    className={active ? "is-active" : ""}
                    disabled={busy || !action.available || !combinable}
                    onClick={() => toggle(action)}
                  >
                    <span className="u1-chat-action-list__icon">
                      {active ? "✓" : "◇"}
                    </span>
                    <span>
                      <strong>{action.label || action.key}</strong>
                      <small>
                        {costLabel(action)}
                        {isStackException(action) ? " · можно сочетать" : ""}
                      </small>
                    </span>
                    <em aria-hidden="true">{active ? "✓" : "›"}</em>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="u1-chat-action-empty">
              <span aria-hidden="true">◇</span>
              <strong>Нет доступной Метамагии</strong>
              <p>Заклинание можно сотворить без модификаторов.</p>
            </div>
          )}

          <button
            className="u1-chat-action-primary"
            type="button"
            disabled={busy}
            onClick={() => void onCast(selected)}
          >
            {selected.length
              ? `Сотворить · Метамагия ${selected.length}`
              : "Сотворить без Метамагии"}
          </button>
        </div>
      </section>
    </div>
  )
}
