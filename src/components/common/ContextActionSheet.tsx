import { useId } from "react"
import { useDialogSurface } from "../../hooks/useDialogSurface.ts"

export type ContextAction = {
  id: string
  label: string
  detail?: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  onSelect: () => void | Promise<void>
}

type Props = {
  title: string
  subtitle?: string
  actions: ContextAction[]
  onClose: () => void
}

export default function ContextActionSheet({
  title,
  subtitle = "Что сделать с этим элементом?",
  actions,
  onClose,
}: Props) {
  const titleId = useId()
  const subtitleId = useId()
  const dialogRef = useDialogSurface<HTMLDivElement>(onClose, ".context-action:not(:disabled)")

  function choose(action: ContextAction) {
    if (action.disabled) return
    onClose()
    void action.onSelect()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="bottom-sheet context-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="character-editor-head">
          <div>
            <h3 className="sheet-title" id={titleId}>{title}</h3>
            <p className="sheet-copy" id={subtitleId}>{subtitle}</p>
          </div>
          <button className="sheet-close" type="button" onClick={onClose} aria-label="Закрыть действия">
            ×
          </button>
        </div>

        <div className="context-action-list">
          {actions.map((action) => (
            <button
              key={action.id}
              className={action.danger ? "context-action context-action--danger" : "context-action"}
              type="button"
              disabled={action.disabled}
              onClick={() => choose(action)}
            >
              <span className="context-action__icon" aria-hidden="true">
                {action.icon || "›"}
              </span>
              <span className="context-action__copy">
                <strong>{action.label}</strong>
                {action.detail && <small>{action.detail}</small>}
              </span>
              <span className="context-action__chevron" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
