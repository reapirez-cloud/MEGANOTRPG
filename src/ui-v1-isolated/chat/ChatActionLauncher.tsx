import { useEffect, useRef } from "react"

export type ChatActionSectionId =
  | "roll"
  | "skill"
  | "action"
  | "item"
  | "spell"

export type ChatActionSection = {
  id: ChatActionSectionId
  label: string
  hint: string
  icon: string
  count?: number
  disabled?: boolean
  disabledReason?: string
}

export const CHAT_ACTION_SECTIONS: readonly ChatActionSection[] = [
  { id: "roll", label: "Бросок", hint: "Проверки и спасброски", icon: "◈" },
  { id: "skill", label: "Умение", hint: "Доступные способности", icon: "◇" },
  { id: "action", label: "Действие", hint: "Боевые и особые действия", icon: "↯" },
  { id: "item", label: "Предмет", hint: "Инвентарь и использование", icon: "▧" },
  { id: "spell", label: "Заклинание", hint: "Магия персонажа", icon: "✧" },
]

type Props = {
  open: boolean
  items: readonly ChatActionSection[]
  onClose: () => void
  onSelect: (id: ChatActionSectionId) => void
}

export function ChatActionLauncher({
  open,
  items,
  onClose,
  onSelect,
}: Props) {
  const firstItemRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return

    const frame = window.requestAnimationFrame(() => firstItemRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="u1-chat-launcher-layer"
      data-chat-action-launcher-layer="true"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.stopPropagation()
      }}
      onPointerUp={(event) => {
        if (event.target === event.currentTarget) event.stopPropagation()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
    >
      <div
        id="u1-chat-action-launcher"
        className="u1-chat-launcher"
        role="menu"
        aria-label="Игровые действия"
      >
        <div className="u1-chat-launcher__head">
          <small>Действия</small>
          <span>Выберите раздел</span>
        </div>
        <div className="u1-chat-launcher__list">
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={index === 0 ? firstItemRef : undefined}
              type="button"
              className="u1-chat-launcher__item"
              role="menuitem"
              disabled={item.disabled}
              aria-disabled={item.disabled || undefined}
              title={item.disabled ? item.disabledReason : undefined}
              onClick={() => {
                if (!item.disabled) onSelect(item.id)
              }}
            >
              <span className="u1-chat-launcher__icon" aria-hidden="true">{item.icon}</span>
              <span className="u1-chat-launcher__copy">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
              <span className="u1-chat-launcher__arrow" aria-hidden="true">
                {item.count !== undefined ? item.count : "›"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
