import type { ReactNode } from "react"
import "./CharacterInteraction.css"

type StateKind = "loading" | "empty" | "error" | "stale"

type Props = {
  kind: StateKind
  title: string
  detail?: string
  action?: ReactNode
  compact?: boolean
}

const icons: Record<StateKind, string> = {
  loading: "◌",
  empty: "◇",
  error: "!",
  stale: "↻",
}

export default function CharacterSectionState({ kind, title, detail, action, compact = false }: Props) {
  return (
    <div
      className={`character-section-state-v5 character-section-state-v5--${kind}${compact ? " character-section-state-v5--compact" : ""}`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "loading" ? "polite" : undefined}
    >
      <span className="character-section-state-v5__icon" aria-hidden="true">
        {kind === "loading" ? <i className="status-spinner" /> : icons[kind]}
      </span>
      <span className="character-section-state-v5__copy">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {action && <span className="character-section-state-v5__action">{action}</span>}
    </div>
  )
}
