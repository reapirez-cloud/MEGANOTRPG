import { useId, type ReactNode } from "react"
import { useDialogSurface } from "../../hooks/useDialogSurface.ts"
import "./CharacterSocial.css"
import "./CharacterEditors.css"

type Props = {
  eyebrow?: string
  title: string
  value?: ReactNode
  valueLabel?: string
  children: ReactNode
  onClose: () => void
  className?: string
}

export default function CharacterDetailSheet({
  eyebrow = "Детали персонажа",
  title,
  value,
  valueLabel,
  children,
  onClose,
  className = "",
}: Props) {
  const titleId = useId()
  const dialogRef = useDialogSurface<HTMLElement>(onClose)

  return (
    <div className="sheet-backdrop character-detail-v5__backdrop" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`bottom-sheet character-detail-v5 ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="character-detail-v5__header">
          <div>
            <small>{eyebrow}</small>
            <h3 id={titleId}>{title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        {value !== undefined && (
          <div className="character-detail-v5__value">
            {valueLabel && <small>{valueLabel}</small>}
            <strong>{value}</strong>
          </div>
        )}
        <div className="character-detail-v5__body">{children}</div>
      </section>
    </div>
  )
}
