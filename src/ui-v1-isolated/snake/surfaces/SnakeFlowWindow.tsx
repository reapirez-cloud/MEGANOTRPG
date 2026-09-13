import { useState } from "react"

import type {
  SnakeEditorRequest,
  SnakeFlowRequest,
  SnakePickerRequest,
  SnakeWindowSize,
} from "../../../snake-engine"
import type { SnakeSurfaceSession } from "../runtime"
import { SnakeEditorSurface } from "./SnakeEditorSurface"
import { SnakePickerSurface } from "./SnakePickerSurface"
import { SnakeWindowFrame } from "./SnakeWindowFrame"
import { defaultWindowSize } from "./windowSizing"

export function SnakeFlowWindow({
  session,
  request,
  busy,
  onClose,
  onSubmit,
}: {
  session: SnakeSurfaceSession
  request: SnakeFlowRequest
  busy: boolean
  onClose: () => void
  onSubmit: (input: Record<string, unknown>) => void
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState<Record<string, unknown>>(
    request.initialValues || {},
  )

  const step = request.steps[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === request.steps.length - 1

  if (!step) {
    return (
      <SnakeWindowFrame
        id={session.id}
        eyebrow={request.eyebrow}
        title={request.title}
        size={defaultWindowSize(request)}
        busy={busy}
        onClose={onClose}
      >
        <p>Для этого процесса не настроены шаги.</p>
        <footer className="u1-snake-window__footer">
          <button type="button" data-primary onClick={onClose}>
            Закрыть
          </button>
        </footer>
      </SnakeWindowFrame>
    )
  }

  const size: Required<SnakeWindowSize> = {
    width: step.size?.width || request.size?.width || "standard",
    height: step.size?.height || request.size?.height || "content",
  }

  function back() {
    if (isFirst) {
      onClose()
      return
    }
    setStepIndex((current) => Math.max(0, current - 1))
  }

  function advance(input?: Record<string, unknown>) {
    const nextDraft = input ? { ...draft, ...input } : draft
    if (input) setDraft(nextDraft)

    if (isLast) {
      onSubmit(nextDraft)
      return
    }

    setStepIndex((current) => current + 1)
  }

  const backLabel = isFirst
    ? request.cancelLabel || "Отмена"
    : request.backLabel || "Назад"
  const nextLabel = isLast
    ? request.submitLabel || "Завершить"
    : step.nextLabel || request.nextLabel || "Далее"

  const editorRequest: SnakeEditorRequest | null =
    step.kind === "editor"
      ? {
          kind: "editor",
          title: step.title,
          fields: step.fields,
          initialValues: draft,
          submitLabel: nextLabel,
          cancelLabel: backLabel,
        }
      : null

  const pickerKey =
    step.kind === "picker" ? step.valueKey || "selection" : "selection"

  const pickerRequest: SnakePickerRequest | null =
    step.kind === "picker"
      ? {
          kind: "picker",
          title: step.title,
          items: step.items,
          initialSelection:
            typeof draft[pickerKey] === "string"
              ? String(draft[pickerKey])
              : undefined,
          submitLabel: nextLabel,
          cancelLabel: backLabel,
        }
      : null

  return (
    <SnakeWindowFrame
      id={session.id}
      eyebrow={step.eyebrow || request.eyebrow || request.title}
      title={step.title}
      size={size}
      busy={busy}
      onClose={onClose}
      stepMeta={`${String(stepIndex + 1).padStart(2, "0")} / ${String(request.steps.length).padStart(2, "0")}`}
    >
      <div className="u1-snake-flow-step" key={step.id}>
        {editorRequest && (
          <SnakeEditorSurface
            key={step.id}
            request={editorRequest}
            busy={busy}
            error={session.error}
            onSubmit={advance}
            onCancel={back}
          />
        )}

        {pickerRequest && (
          <SnakePickerSurface
            key={step.id}
            request={pickerRequest}
            busy={busy}
            error={session.error}
            onSubmit={({ selection }) => advance({ [pickerKey]: selection })}
            onCancel={back}
          />
        )}

        {step.kind === "confirm" && (
          <>
            {step.body && <p>{step.body}</p>}
            {session.error && (
              <div className="u1-snake-window__error">{session.error}</div>
            )}
            <footer className="u1-snake-window__footer">
              <button type="button" onClick={back} disabled={busy}>
                {backLabel}
              </button>
              <button
                type="button"
                data-primary
                disabled={busy}
                onClick={() =>
                  advance({ [step.valueKey || "confirmed"]: true })
                }
              >
                {busy ? "…" : nextLabel}
              </button>
            </footer>
          </>
        )}

        {step.kind === "detail" && (
          <>
            {step.mediaUrl && (
              <img className="u1-snake-window__media" src={step.mediaUrl} alt="" />
            )}
            {step.body && <p>{step.body}</p>}
            <footer className="u1-snake-window__footer">
              <button type="button" onClick={back} disabled={busy}>
                {backLabel}
              </button>
              <button
                type="button"
                data-primary
                disabled={busy}
                onClick={() => advance()}
              >
                {busy ? "…" : nextLabel}
              </button>
            </footer>
          </>
        )}
      </div>
    </SnakeWindowFrame>
  )
}
