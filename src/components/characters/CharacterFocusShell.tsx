import type { ReactNode } from "react"

type Props = {
  eyebrow?: string
  title: string
  detail?: string
  meta?: ReactNode
  action?: ReactNode
  onBack: () => void
  backLabel?: string
  children: ReactNode
  className?: string
}

export default function CharacterFocusShell({
  eyebrow = "Раздел персонажа",
  title,
  detail,
  meta,
  action,
  onBack,
  backLabel = "Лист",
  children,
  className = "",
}: Props) {
  return (
    <section className={`character-focus-v5 ${className}`.trim()} data-character-focus="true">
      <header className="character-focus-v5__header">
        <button className="character-focus-v5__back" type="button" onClick={onBack} aria-label={`Назад: ${backLabel}`}>
          <span aria-hidden="true">←</span>
          <strong>{backLabel}</strong>
        </button>
        <div className="character-focus-v5__copy">
          <small>{eyebrow}</small>
          <h3>{title}</h3>
          {detail && <p>{detail}</p>}
          {meta && <div className="character-focus-v5__meta">{meta}</div>}
        </div>
        {action && <div className="character-focus-v5__action">{action}</div>}
      </header>
      <div className="character-focus-v5__body">{children}</div>
    </section>
  )
}
