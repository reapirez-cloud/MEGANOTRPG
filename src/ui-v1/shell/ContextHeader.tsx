import type { ReactNode } from "react"

type Props = {
  title: string
  eyebrow?: string
  onBack?: () => void
  actions?: ReactNode
}

export default function ContextHeader({ title, eyebrow, onBack, actions }: Props) {
  return (
    <header className="mg-context-header">
      <div className="mg-context-header__lead">
        {onBack && (
          <button
            className="mg-context-header__back"
            type="button"
            aria-label="Назад"
            onClick={onBack}
          >
            ←
          </button>
        )}
        <div>
          {eyebrow && <span className="mg-context-header__eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
        </div>
      </div>
      {actions && <div className="mg-context-header__actions">{actions}</div>}
    </header>
  )
}
