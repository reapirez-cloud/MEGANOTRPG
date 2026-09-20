import { useEffect, useRef, useState } from "react"

export type ChatActionSectionId =
  | "roll"
  | "skill"
  | "action"
  | "item"
  | "spell"

type ChatActionIconName = ChatActionSectionId

export type ChatActionSection = {
  id: ChatActionSectionId
  label: string
  hint: string
  icon: ChatActionIconName
  count?: number
  disabled?: boolean
  disabledReason?: string
}

export const CHAT_ACTION_SECTIONS: readonly ChatActionSection[] = [
  { id: "roll", label: "Бросок", hint: "Проверки и спасброски", icon: "roll" },
  { id: "skill", label: "Умение", hint: "Доступные способности", icon: "skill" },
  { id: "action", label: "Действие", hint: "Боевые и особые действия", icon: "action" },
  { id: "item", label: "Предмет", hint: "Инвентарь и использование", icon: "item" },
  { id: "spell", label: "Заклинание", hint: "Магия персонажа", icon: "spell" },
]

type Props = {
  open: boolean
  items: readonly ChatActionSection[]
  onClose: () => void
  onSelect: (id: ChatActionSectionId) => void
}

function LauncherIcon({ name }: { name: ChatActionIconName }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  }

  if (name === "roll") {
    return <svg {...common}><path d="M7 3h10l4 6-4 12H7L3 9 7 3Z"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/></svg>
  }
  if (name === "skill") {
    return <svg {...common}><path d="M12 3v18M5 8.5 12 3l7 5.5M5 15.5 12 21l7-5.5"/><path d="M5 8.5v7M19 8.5v7"/></svg>
  }
  if (name === "action") {
    return <svg {...common}><path d="m14 2-8 12h6l-2 8 8-12h-6l2-8Z"/></svg>
  }
  if (name === "item") {
    return <svg {...common}><path d="M5 7.5 12 3l7 4.5v9L12 21l-7-4.5v-9Z"/><path d="m5 7.5 7 4.5 7-4.5M12 12v9"/></svg>
  }
  return <svg {...common}><path d="M12 2.5 14.2 9 21 12l-6.8 3L12 21.5 9.8 15 3 12l6.8-3L12 2.5Z"/><path d="m18.5 3.5.6 1.8 1.9.7-1.9.7-.6 1.8-.6-1.8-1.9-.7 1.9-.7.6-1.8Z"/></svg>
}

export function ChatActionLauncher({
  open,
  items,
  onClose,
  onSelect,
}: Props) {
  const firstItemRef = useRef<HTMLButtonElement | null>(null)
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setRendered(true)
      setClosing(false)
      return
    }

    if (!rendered) return

    setClosing(true)
    const timer = window.setTimeout(() => {
      setRendered(false)
      setClosing(false)
    }, 135)

    return () => window.clearTimeout(timer)
  }, [open, rendered])

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

  if (!rendered) return null

  return (
    <div
      className="u1-chat-launcher-layer"
      data-chat-action-launcher-layer="true"
      data-closing={closing || undefined}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.stopPropagation()
      }}
      onPointerUp={(event) => {
        if (event.target === event.currentTarget) event.stopPropagation()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || closing) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
    >
      <div
        id="u1-chat-action-launcher"
        className="u1-chat-launcher"
        data-closing={closing || undefined}
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
              disabled={item.disabled || closing}
              aria-disabled={item.disabled || closing || undefined}
              title={item.disabled ? item.disabledReason : undefined}
              onClick={() => {
                if (!item.disabled && !closing) onSelect(item.id)
              }}
            >
              <span className="u1-chat-launcher__icon" aria-hidden="true">
                <LauncherIcon name={item.icon} />
              </span>
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
