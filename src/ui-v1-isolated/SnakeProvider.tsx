import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

import {
  snakeAgent,
  type SnakeAction,
  type SnakeActionInput,
  type SnakeEditorRequest,
  type SnakeEntityRef,
  type SnakeFlowRequest,
  type SnakeFlowStep,
  type SnakeMenuRequest,
  type SnakePickerRequest,
  type SnakePoint,
  type SnakeSurfaceRequest,
  type SnakeWindowSize,
} from "../snake-engine"

type SnakeSurfaceSession = {
  id: number
  request: SnakeSurfaceRequest
  action?: SnakeAction
  entity?: SnakeEntityRef
  error?: string
}

type SnakeContextValue = {
  openMenu: (request: SnakeMenuRequest) => void
  closeMenu: () => void
  openSurface: (
    request: SnakeSurfaceRequest,
    source?: { action?: SnakeAction; entity?: SnakeEntityRef },
  ) => void
  closeSurface: () => void
}

const SnakeContext = createContext<SnakeContextValue | null>(null)

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function SnakeContextMenu({
  request,
  onClose,
  onAction,
}: {
  request: SnakeMenuRequest
  onClose: () => void
  onAction: (action: SnakeAction) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState(request.point)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return

    const rect = menu.getBoundingClientRect()
    const padding = 10
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let x = request.point.x
    let y = request.point.y

    if (x + rect.width + padding > viewportWidth) {
      x = request.point.x - rect.width
    }

    if (y + rect.height + padding > viewportHeight) {
      y = request.point.y - rect.height
    }

    const nextPosition = {
      x: clamp(x, padding, viewportWidth - rect.width - padding),
      y: clamp(y, padding, viewportHeight - rect.height - padding),
    }

    setPosition(nextPosition)
    setOrigin({
      x: clamp(request.point.x - nextPosition.x, 0, rect.width),
      y: clamp(request.point.y - nextPosition.y, 0, rect.height),
    })
  }, [request])

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      onClose()
    }

    window.addEventListener("pointerdown", closeOnPointerDown, true)
    return () => window.removeEventListener("pointerdown", closeOnPointerDown, true)
  }, [onClose])

  let previousGroup: string | undefined

  return createPortal(
    <div
      ref={ref}
      className="u1-snake-menu"
      role="menu"
      aria-label="Действия"
      style={{
        left: position.x,
        top: position.y,
        "--u1-snake-origin-x": `${origin.x}px`,
        "--u1-snake-origin-y": `${origin.y}px`,
      } as CSSProperties}
    >
      {request.actions.map((action, index) => {
        const separator =
          index > 0 &&
          action.group !== undefined &&
          action.group !== previousGroup
        previousGroup = action.group

        return (
          <div className="u1-snake-menu__row" key={action.id}>
            {separator && <span className="u1-snake-menu__separator" aria-hidden="true" />}
            <button
              type="button"
              role="menuitem"
              disabled={action.enabled === false}
              data-tone={action.tone || "normal"}
              title={action.enabled === false ? action.disabledReason : undefined}
              onClick={() => onAction(action)}
            >
              {action.label}
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}

function validateRequiredFields(
  fields: SnakeEditorRequest["fields"],
  values: Record<string, unknown>,
) {
  return fields.find((field) => {
    if (!("required" in field) || !field.required) return false
    const value = values[field.id]
    return value === undefined || value === null || String(value).trim() === ""
  })
}

function SnakeEditor({
  request,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  request: SnakeEditorRequest
  busy: boolean
  error?: string
  onSubmit: (input: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, unknown>>(
    request.initialValues || {},
  )
  const [validation, setValidation] = useState<string | null>(null)

  function submit() {
    const missing = validateRequiredFields(request.fields, values)

    if (missing) {
      setValidation(`Заполните поле «${missing.label}».`)
      return
    }

    setValidation(null)
    onSubmit(values)
  }

  return (
    <>
      <div className="u1-snake-window__fields">
        {request.fields.map((field) => {
          const value = values[field.id]

          if (field.type === "checkbox") {
            return (
              <label className="u1-snake-field u1-snake-field--check" key={field.id}>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.id]: event.target.checked,
                    }))
                  }
                />
                <span>{field.label}</span>
              </label>
            )
          }

          if (field.type === "select") {
            return (
              <label className="u1-snake-field" key={field.id}>
                <span>{field.label}</span>
                <select
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.id]: event.target.value,
                    }))
                  }
                >
                  <option value="">Выбрать</option>
                  {field.options.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          }

          if (field.type === "textarea") {
            return (
              <label className="u1-snake-field" key={field.id}>
                <span>{field.label}</span>
                <textarea
                  value={typeof value === "string" ? value : ""}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.id]: event.target.value,
                    }))
                  }
                />
              </label>
            )
          }

          return (
            <label className="u1-snake-field" key={field.id}>
              <span>{field.label}</span>
              <input
                type={field.type}
                value={
                  typeof value === "string" || typeof value === "number"
                    ? value
                    : ""
                }
                placeholder={field.placeholder}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.id]:
                      field.type === "number"
                        ? event.target.value === ""
                          ? ""
                          : Number(event.target.value)
                        : event.target.value,
                  }))
                }
              />
            </label>
          )
        })}
      </div>

      {(validation || error) && (
        <div className="u1-snake-window__error">{validation || error}</div>
      )}

      <footer className="u1-snake-window__footer">
        <button type="button" onClick={onCancel} disabled={busy}>
          {request.cancelLabel || "Отмена"}
        </button>
        <button type="button" data-primary onClick={submit} disabled={busy}>
          {busy ? "…" : request.submitLabel || "Сохранить"}
        </button>
      </footer>
    </>
  )
}

function SnakePicker({
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

function defaultWindowSize(request: SnakeSurfaceRequest): Required<SnakeWindowSize> {
  const fallbackWidth =
    request.kind === "confirm" ||
    request.kind === "notice" ||
    request.kind === "placeholder"
      ? "compact"
      : request.kind === "detail"
        ? "wide"
        : "standard"

  return {
    width: request.size?.width || fallbackWidth,
    height: request.size?.height || "content",
  }
}

function WindowFrame({
  id,
  eyebrow,
  title,
  size,
  busy,
  onClose,
  children,
  stepMeta,
}: {
  id: number
  eyebrow?: string
  title: string
  size: Required<SnakeWindowSize>
  busy: boolean
  onClose: () => void
  children: ReactNode
  stepMeta?: string
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [id, title])

  return (
    <section
      className="u1-snake-window"
      data-width={size.width}
      data-height={size.height}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`u1-snake-window-title-${id}`}
    >
      <header className="u1-snake-window__head">
        <div>
          <span className="u1-snake-window__meta">
            {eyebrow && <i>{eyebrow}</i>}
            {stepMeta && <b>{stepMeta}</b>}
          </span>
          <h2 id={`u1-snake-window-title-${id}`}>{title}</h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>
      </header>
      <div className="u1-snake-window__body">{children}</div>
    </section>
  )
}

function SnakeFlowWindow({
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
      <WindowFrame
        id={session.id}
        eyebrow={request.eyebrow}
        title={request.title}
        size={defaultWindowSize(request)}
        busy={busy}
        onClose={onClose}
      >
        <p>Для этого процесса не настроены шаги.</p>
        <footer className="u1-snake-window__footer">
          <button type="button" data-primary onClick={onClose}>Закрыть</button>
        </footer>
      </WindowFrame>
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
    <WindowFrame
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
          <SnakeEditor
            key={step.id}
            request={editorRequest}
            busy={busy}
            error={session.error}
            onSubmit={advance}
            onCancel={back}
          />
        )}

        {pickerRequest && (
          <SnakePicker
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
    </WindowFrame>
  )
}

function SnakeSingleWindow({
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

  const size = defaultWindowSize(request)

  return (
    <WindowFrame
      id={session.id}
      eyebrow={request.eyebrow}
      title={request.title}
      size={size}
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
        <SnakeEditor
          key={session.id}
          request={request}
          busy={busy}
          error={session.error}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      )}

      {request.kind === "picker" && (
        <SnakePicker
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
    </WindowFrame>
  )
}

function SnakeWindow({
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
  return createPortal(
    <div
      className="u1-snake-window-layer"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      {session.request.kind === "flow" ? (
        <SnakeFlowWindow
          session={session}
          request={session.request}
          busy={busy}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : (
        <SnakeSingleWindow
          session={session}
          busy={busy}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </div>,
    document.body,
  )
}

export function SnakeProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<SnakeMenuRequest | null>(null)
  const [surface, setSurface] = useState<SnakeSurfaceSession | null>(null)
  const [busy, setBusy] = useState(false)
  const surfaceIdRef = useRef(0)

  function openSurface(
    request: SnakeSurfaceRequest,
    source?: { action?: SnakeAction; entity?: SnakeEntityRef },
  ) {
    surfaceIdRef.current += 1
    setSurface({
      id: surfaceIdRef.current,
      request,
      action: source?.action,
      entity: source?.entity,
    })
  }

  async function execute(
    action: SnakeAction,
    entity: SnakeEntityRef,
    input?: SnakeActionInput,
  ) {
    setBusy(true)
    const result = await snakeAgent.execute(action, entity, input)
    setBusy(false)

    if (result.type === "error") {
      setSurface((current) =>
        current
          ? { ...current, error: result.message }
          : {
              id: ++surfaceIdRef.current,
              request: {
                kind: "notice",
                title: "Действие не выполнено",
                body: result.message,
                tone: "error",
              },
            },
      )
      return
    }

    if (result.type === "surface") {
      openSurface(result.request, { action, entity })
      return
    }

    setSurface(null)

    if (result.notice) {
      openSurface({
        kind: "notice",
        title: "Готово",
        body: result.notice,
      })
    }
  }

  async function invokeAction(action: SnakeAction, entity: SnakeEntityRef) {
    setMenu(null)

    if (action.enabled === false) return

    if (action.surface) {
      openSurface(action.surface, { action, entity })
      return
    }

    await execute(action, entity)
  }

  const value = useMemo<SnakeContextValue>(
    () => ({
      openMenu(request) {
        const actions = snakeAgent.availableActions(request.actions)
        if (actions.length === 0) return
        setMenu({ ...request, actions })
      },
      closeMenu() {
        setMenu(null)
      },
      openSurface,
      closeSurface() {
        if (!busy) setSurface(null)
      },
    }),
    [busy],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (busy) return

      if (surface) {
        setSurface(null)
        return
      }

      setMenu(null)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [busy, surface])

  return (
    <SnakeContext.Provider value={value}>
      {children}
      {menu && (
        <SnakeContextMenu
          request={menu}
          onClose={() => setMenu(null)}
          onAction={(action) => void invokeAction(action, menu.entity)}
        />
      )}
      {surface && (
        <SnakeWindow
          session={surface}
          busy={busy}
          onClose={() => {
            if (!busy) setSurface(null)
          }}
          onSubmit={(input) => {
            if (!surface.action || !surface.entity) {
              setSurface(null)
              return
            }
            void execute(surface.action, surface.entity, input)
          }}
        />
      )}
    </SnakeContext.Provider>
  )
}

export function useSnake() {
  const context = useContext(SnakeContext)
  if (!context) {
    throw new Error("useSnake must be used inside SnakeProvider")
  }
  return context
}

export function SnakeTrigger({
  entity,
  actions,
  children,
}: {
  entity: SnakeEntityRef
  actions: SnakeAction[]
  children: ReactNode
}) {
  const snake = useSnake()
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<SnakePoint | null>(null)
  const consumedUntilRef = useRef(0)
  const suppressClickUntilRef = useRef(0)

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function open(point: SnakePoint) {
    snake.openMenu({ entity, actions, point })
  }

  function pointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.pointerType === "mouse") return
    if (event.button !== 0) return

    clearTimer()
    startRef.current = { x: event.clientX, y: event.clientY }

    timerRef.current = window.setTimeout(() => {
      const point = startRef.current
      if (!point) return

      consumedUntilRef.current = performance.now() + 1200
      suppressClickUntilRef.current = performance.now() + 650
      open(point)
      timerRef.current = null
    }, 520)
  }

  function pointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
    const start = startRef.current
    if (!start) return

    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
      clearTimer()
      startRef.current = null
    }
  }

  function pointerEnd() {
    clearTimer()
    startRef.current = null
  }

  function contextMenu(event: ReactMouseEvent<HTMLSpanElement>) {
    event.preventDefault()

    const point = { x: event.clientX, y: event.clientY }
    const start = startRef.current
    const duplicate =
      performance.now() < consumedUntilRef.current &&
      (!start || Math.hypot(point.x - start.x, point.y - start.y) < 36)

    if (duplicate) {
      event.stopPropagation()
      return
    }

    open(point)
  }

  return (
    <span
      className="u1-snake-trigger"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onContextMenu={contextMenu}
      onClickCapture={(event) => {
        if (performance.now() >= suppressClickUntilRef.current) return
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {children}
    </span>
  )
}
