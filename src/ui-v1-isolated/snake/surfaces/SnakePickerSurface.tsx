import { useState } from "react"

import type { SnakePickerRequest } from "../../../snake-engine"

export function SnakePickerSurface({
  request,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  request: SnakePickerRequest
  busy: boolean
  error?: string
  onSubmit: (input: { selection: string }) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<string | null>(
    request.initialSelection || null,
  )

  return (
    <>
      <div className="u1-snake-picker">
        {request.items.map((item) => (
          <button
            type="button"
            key={item.id}
            data-selected={selected === item.id || undefined}
            disabled={item.disabled}
            onClick={() => setSelected(item.id)}
          >
            <strong>{item.label}</strong>
            {item.description && <span>{item.description}</span>}
          </button>
        ))}
      </div>

      {error && <div className="u1-snake-window__error">{error}</div>}

      <footer className="u1-snake-window__footer">
        <button type="button" onClick={onCancel} disabled={busy}>
          {request.cancelLabel || "Отмена"}
        </button>
        <button
          type="button"
          data-primary
          disabled={busy || !selected}
          onClick={() => selected && onSubmit({ selection: selected })}
        >
          {busy ? "…" : request.submitLabel || "Выбрать"}
        </button>
      </footer>
    </>
  )
}
