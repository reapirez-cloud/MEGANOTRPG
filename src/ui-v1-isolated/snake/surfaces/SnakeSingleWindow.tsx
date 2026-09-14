import type { SnakeActionInput } from "../../../snake-engine"
import type { SnakeSurfaceSession } from "../runtime"
import { SnakeEditorSurface } from "./SnakeEditorSurface"
import { SnakePickerSurface } from "./SnakePickerSurface"
import { SnakeWindowFrame } from "./SnakeWindowFrame"
import { defaultWindowSize } from "./windowSizing"

export function SnakeSingleWindow({
  session,
  busy,
  onClose,
  onSubmit,
}: {
  session: SnakeSurfaceSession
  busy: boolean
  onClose: () => void
  onSubmit: (input?: SnakeActionInput) => void
}) {
  const request = session.request
  if (request.kind === "flow") return null

  return (
    <SnakeWindowFrame
      id={session.id}
      eyebrow={request.eyebrow}
      title={request.title}
      size={defaultWindowSize(request)}
      busy={busy}
      onClose={onClose}
    >
      {request.kind === "placeholder" && (
        <>
          <p>
            {request.body ||
              "Интерфейс этой функции будет спроектирован отдельным этапом."}
          </p>
          <footer className="u1-snake-window__footer">
            <button type="button" data-primary onClick={onClose}>
              Закрыть
            </button>
          </footer>
        </>
      )}

      {request.kind === "confirm" && (
        <>
          {request.body && <p>{request.body}</p>}
          {session.error && (
            <div className="u1-snake-window__error">{session.error}</div>
          )}
          <footer className="u1-snake-window__footer">
            <button type="button" onClick={onClose} disabled={busy}>
              {request.cancelLabel || "Отмена"}
            </button>
            <button
              type="button"
              data-primary
              disabled={busy}
              onClick={() => onSubmit({ confirmed: true })}
            >
              {busy ? "…" : request.confirmLabel || "Подтвердить"}
            </button>
          </footer>
        </>
      )}

      {request.kind === "editor" && (
        <SnakeEditorSurface
          key={session.id}
          request={request}
          busy={busy}
          error={session.error}
          entity={session.entity}
          contextSource={"snake-editor:" + session.id}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      )}

      {request.kind === "picker" && (
        <SnakePickerSurface
          key={session.id}
          request={request}
          busy={busy}
          error={session.error}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      )}

      {request.kind === "detail" && (
        <>
          {request.mediaUrl && (
            <img className="u1-snake-window__media" src={request.mediaUrl} alt="" />
          )}
          {request.body && <p>{request.body}</p>}
          <footer className="u1-snake-window__footer">
            <button type="button" data-primary onClick={onClose}>
              Закрыть
            </button>
          </footer>
        </>
      )}

      {request.kind === "notice" && (
        <>
          {request.body && (
            <p data-tone={request.tone || "normal"}>{request.body}</p>
          )}
          <footer className="u1-snake-window__footer">
            <button type="button" data-primary onClick={onClose}>
              Закрыть
            </button>
          </footer>
        </>
      )}
    </SnakeWindowFrame>
  )
}
