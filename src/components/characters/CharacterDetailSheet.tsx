import type { ReactNode } from "react"

type Props = {
  eyebrow?: string
  title: string
  value?: ReactNode
  children: ReactNode
  onClose: () => void
  className?: string
}

export default function CharacterDetailSheet({
  eyebrow = "Детали персонажа",
  title,
  value,
  children,
  onClose,
  className = "",
}: Props) {
  return (
    <div className="sheet-backdrop character-detail-v5__backdrop" onMouseDown={onClose}>
      <section
        className={`bottom-sheet character-detail-v5 ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <header className="character-detail-v5__header">
          <div>
            <small>{eyebrow}</small>
            <h3>{title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        {value !== undefined && <div className="character-detail-v5__value">{value}</div>}
        <div className="character-detail-v5__body">{children}</div>
      </section>
    </div>
  )
}
