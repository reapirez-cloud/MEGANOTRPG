import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import {
  useAI,
  type AIAttachment,
  type AIGeneratedAssetRef,
} from "./AIProvider"
import ArtPlayer, { type ArtPlayerItem } from "../components/media/ArtPlayer"
import {
  AGENT_OPEN_EVENT,
  type AgentOpenDetail,
} from "./agentUiBridge"

const ORB_SIZE = 40
const ORB_MARGIN = 10
const ORB_STORAGE_KEY = "meganotrpg:voss-orb-position"

function AgentMark() {
  return (
    <span className="u1-agent-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

function imageJobStatus(status: string) {
  if (status === "queued") return "В очереди"
  if (status === "running") return "Генерация"
  if (status === "waiting_for_user") return "Ждёт выбора"
  if (status === "completed") return "Готово"
  if (status === "failed") return "Ошибка"
  if (status === "cancelled") return "Отменено"
  return status
}

function recordField(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const field = (value as Record<string, unknown>)[key]
  return typeof field === "string" && field.trim() ? field.trim() : null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function defaultOrbPosition() {
  if (typeof window === "undefined") return { x: 10, y: 120 }
  try {
    const stored = window.localStorage.getItem(ORB_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
        return {
          x: clamp(parsed.x, ORB_MARGIN, window.innerWidth - ORB_SIZE - ORB_MARGIN),
          y: clamp(parsed.y, ORB_MARGIN, window.innerHeight - ORB_SIZE - ORB_MARGIN),
        }
      }
    }
  } catch {
    // Position persistence is convenience only.
  }

  return {
    x: Math.max(ORB_MARGIN, window.innerWidth - ORB_SIZE - ORB_MARGIN),
    y: clamp(
      Math.round(window.innerHeight * 0.33),
      ORB_MARGIN,
      window.innerHeight - ORB_SIZE - ORB_MARGIN,
    ),
  }
}

function snapOrb(position: { x: number; y: number }) {
  const maxX = window.innerWidth - ORB_SIZE - ORB_MARGIN
  const maxY = window.innerHeight - ORB_SIZE - ORB_MARGIN
  const x = clamp(position.x, ORB_MARGIN, maxX)
  const y = clamp(position.y, ORB_MARGIN, maxY)

  const distances = [
    { edge: "left", value: x },
    { edge: "right", value: window.innerWidth - (x + ORB_SIZE) },
    { edge: "top", value: y },
    { edge: "bottom", value: window.innerHeight - (y + ORB_SIZE) },
  ].sort((left, right) => left.value - right.value)

  const edge = distances[0]?.edge
  if (edge === "left") return { x: ORB_MARGIN, y }
  if (edge === "right") return { x: maxX, y }
  if (edge === "top") return { x, y: ORB_MARGIN }
  return { x, y: maxY }
}

function readableBytes(bytes: number) {
  if (bytes < 1024) return bytes + " Б"
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " КБ"
  return (bytes / (1024 * 1024)).toFixed(1) + " МБ"
}

export default function AgentShell() {
  const {
    campaignId,
    canManage,
    assistantName,
    models,
    selectedModelId,
    lastRoute,
    threads,
    activeThreadId,
    messages,
    jobs,
    loading,
    sending,
    pendingReply,
    error,
    chooseModel,
    uploadAttachment,
    removeAttachment,
    createThread,
    switchThread,
    deleteThread,
    saveGeneratedAsset,
    cancelImageJob,
    retryImageJob,
    send,
  } = useAI()

  const [open, setOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [attachments, setAttachments] = useState<AIAttachment[]>([])
  const [selectedGeneratedAssetRef, setSelectedGeneratedAssetRef] =
    useState<AIGeneratedAssetRef | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewImage, setPreviewImage] = useState<{
    key: string
    title: string
    items: ArtPlayerItem[]
    initialIndex: number
  } | null>(null)
  const [pendingDeleteThreadId, setPendingDeleteThreadId] =
    useState<string | null>(null)
  const [orbPosition, setOrbPosition] = useState(defaultOrbPosition)
  const [orbDragging, setOrbDragging] = useState(false)

  const logRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const orbRef = useRef<HTMLButtonElement | null>(null)
  const wasOpenRef = useRef(false)
  const followTailRef = useRef(true)
  const orbPositionRef = useRef(orbPosition)
  const orbFrameRef = useRef<number | null>(null)
  const pendingOrbPositionRef = useRef(orbPosition)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)

  const selectedModel =
    models.find((model) => model.id === selectedModelId) ||
    models.find((model) => model.is_base) ||
    null
  const selectableModels = models.filter(
    (model) =>
      model.is_base ||
      model.user_selectable ||
      (canManage && model.gm_selectable),
  )
  const pendingDeleteThread =
    pendingDeleteThreadId
      ? threads.find((thread) => thread.id === pendingDeleteThreadId) || null
      : null

  const visibleJobs = jobs.slice(0, 6)
  const timelineOrder = new Map<string, number>(
    [
      ...messages.map((message) => ({
        key: `message:${message.id}`,
        createdAt: message.created_at,
      })),
      ...visibleJobs.map((job) => ({
        key: `job:${job.id}`,
        createdAt: job.created_at,
      })),
    ]
      .sort((left, right) => {
        const byTime = Date.parse(left.createdAt) - Date.parse(right.createdAt)
        return byTime || left.key.localeCompare(right.key)
      })
      .map((entry, index) => [entry.key, index] as const),
  )
  const timelineTailOrder = timelineOrder.size + 1

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<AgentOpenDetail>).detail
      if (detail?.prompt?.trim()) setDraft(detail.prompt.trim())
      setOpen(true)
    }

    window.addEventListener(AGENT_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(AGENT_OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    orbPositionRef.current = orbPosition
    pendingOrbPositionRef.current = orbPosition
  }, [orbPosition])

  useEffect(() => {
    const onResize = () => {
      const next = snapOrb(orbPositionRef.current)
      orbPositionRef.current = next
      pendingOrbPositionRef.current = next
      setOrbPosition(next)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    return () => {
      if (orbFrameRef.current !== null) {
        window.cancelAnimationFrame(orbFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setToolsOpen(false)
      setPendingDeleteThreadId(null)
      if (wasOpenRef.current) {
        wasOpenRef.current = false
        requestAnimationFrame(() => orbRef.current?.focus())
      }
      return
    }

    const opening = !wasOpenRef.current
    wasOpenRef.current = true
    if (opening) followTailRef.current = true
    requestAnimationFrame(() => textareaRef.current?.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (previewImage) {
          setPreviewImage(null)
          return
        }
        if (toolsOpen) {
          setToolsOpen(false)
          return
        }
        setOpen(false)
        return
      }

      if (event.key !== "Tab") return
      const panel = panelRef.current
      if (!panel) return

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => getComputedStyle(node).visibility !== "hidden")

      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, previewImage, toolsOpen])

  useEffect(() => {
    if (!open || !followTailRef.current) return
    requestAnimationFrame(() => {
      const node = logRef.current
      if (node && followTailRef.current) node.scrollTop = node.scrollHeight
    })
  }, [jobs, messages, open, pendingReply, sending])

  function onLogScroll() {
    const node = logRef.current
    if (!node) return
    followTailRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < 96
  }

  if (!campaignId || loading) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    const outgoingAttachments = attachments
    const outgoingGeneratedAssetRef = selectedGeneratedAssetRef
    if (
      (!text && !outgoingAttachments.length && !outgoingGeneratedAssetRef) ||
      sending ||
      pendingReply ||
      uploading
    ) return

    setDraft("")
    setAttachments([])
    setSelectedGeneratedAssetRef(null)

    const accepted = await send(
      text,
      outgoingAttachments,
      outgoingGeneratedAssetRef,
    )
    if (!accepted) {
      setDraft(text)
      setAttachments(outgoingAttachments)
      setSelectedGeneratedAssetRef(outgoingGeneratedAssetRef)
    }
  }

  function prefillPrompt(prompt: string) {
    setDraft(prompt)
  }

  async function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value = ""
    if (!files.length) return

    setUploading(true)
    try {
      const remaining = Math.max(0, 4 - attachments.length)
      for (const file of files.slice(0, remaining)) {
        const uploaded = await uploadAttachment(file)
        if (uploaded) {
          setAttachments((current) => [...current, uploaded].slice(0, 4))
        }
      }
    } finally {
      setUploading(false)
    }
  }

  async function discardAttachment(attachment: AIAttachment) {
    setAttachments((current) =>
      current.filter((item) => item.storagePath !== attachment.storagePath)
    )
    await removeAttachment(attachment)
  }

  function paintOrb(position: { x: number; y: number }) {
    pendingOrbPositionRef.current = position

    if (orbFrameRef.current !== null) return
    orbFrameRef.current = window.requestAnimationFrame(() => {
      orbFrameRef.current = null
      const next = pendingOrbPositionRef.current
      orbPositionRef.current = next
      const node = orbRef.current
      if (node) {
        node.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`
      }
    })
  }

  function flushOrbFrame() {
    if (orbFrameRef.current !== null) {
      window.cancelAnimationFrame(orbFrameRef.current)
      orbFrameRef.current = null
    }

    const next = pendingOrbPositionRef.current
    orbPositionRef.current = next
    const node = orbRef.current
    if (node) {
      node.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`
    }
    return next
  }

  function orbPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const origin = orbPositionRef.current
    pendingOrbPositionRef.current = origin
    setOrbDragging(true)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      moved: false,
    }
  }

  function orbPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (Math.hypot(deltaX, deltaY) > 4) drag.moved = true

    paintOrb({
      x: clamp(
        drag.originX + deltaX,
        ORB_MARGIN,
        window.innerWidth - ORB_SIZE - ORB_MARGIN,
      ),
      y: clamp(
        drag.originY + deltaY,
        ORB_MARGIN,
        window.innerHeight - ORB_SIZE - ORB_MARGIN,
      ),
    })
  }

  function orbPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const current = flushOrbFrame()
    dragRef.current = null
    setOrbDragging(false)

    if (!drag.moved) {
      setOrbPosition(current)
      setOpen((value) => !value)
      return
    }

    const next = snapOrb(current)
    orbPositionRef.current = next
    pendingOrbPositionRef.current = next
    setOrbPosition(next)

    try {
      window.localStorage.setItem(ORB_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Position persistence is convenience only.
    }
  }

  function orbPointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const current = flushOrbFrame()
    dragRef.current = null
    setOrbDragging(false)
    orbPositionRef.current = current
    setOrbPosition(current)
  }

  return (
    <>
      <button
        ref={orbRef}
        type="button"
        className="u1-agent-orb"
        style={{
          transform: `translate3d(${orbPosition.x}px, ${orbPosition.y}px, 0)`,
        }}
        onPointerDown={orbPointerDown}
        onPointerMove={orbPointerMove}
        onPointerUp={orbPointerUp}
        onPointerCancel={orbPointerCancel}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          setOpen((current) => !current)
        }}
        aria-label={
          open
            ? `Свернуть ${assistantName}`
            : sending || pendingReply
              ? `${assistantName} работает в фоне`
              : `Открыть ${assistantName}`
        }
        aria-expanded={open}
        aria-controls="u1-agent-panel"
        data-open={open || undefined}
        data-busy={(sending || pendingReply) || undefined}
        data-dragging={orbDragging || undefined}
      >
        <AgentMark />
        <span className="u1-agent-orb__state" aria-hidden="true" />
      </button>

      {open && (
        <button
          type="button"
          className="u1-agent-backdrop"
          onClick={() => setOpen(false)}
          aria-label={`Закрыть ${assistantName}`}
          tabIndex={-1}
        />
      )}

      {previewImage && (
        <div className="u1-art-player-layer">
          <ArtPlayer
            key={previewImage.key}
            items={previewImage.items}
            initialIndex={previewImage.initialIndex}
            title={previewImage.title}
            eyebrow={`ИИ · ${assistantName}`}
            onClose={() => setPreviewImage(null)}
          />
        </div>
      )}

      <aside
        id="u1-agent-panel"
        className="u1-agent-panel"
        aria-label={assistantName}
        aria-hidden={!open}
        data-open={open || undefined}
      >
        <header className="u1-agent-panel__header">
          <button
            type="button"
            className="u1-agent-tools-trigger"
            onClick={() => setToolsOpen((current) => !current)}
            aria-label={`Инструменты ${assistantName}`}
            aria-expanded={toolsOpen}
          >
            <span />
            <span />
            <span />
          </button>

          <div className="u1-agent-panel__identity">
            <AgentMark />
            <div>
              <span>MEGANOT</span>
              <strong>{assistantName}</strong>
            </div>
          </div>

          <div className="u1-agent-panel__header-actions">
            <small>{selectedModel?.display_name || "AI"}</small>
            <button
              type="button"
              className="u1-agent-panel__close"
              onClick={() => setOpen(false)}
              aria-label={`Свернуть ${assistantName}`}
            >
              ×
            </button>
          </div>
        </header>

        <div
          className="u1-agent-tools-shade"
          data-open={toolsOpen || undefined}
          onClick={() => setToolsOpen(false)}
        />

        <section
          className="u1-agent-tools-drawer"
          data-open={toolsOpen || undefined}
          aria-hidden={!toolsOpen}
        >
          <header>
            <span>ИНСТРУМЕНТЫ {assistantName.toLocaleUpperCase("ru-RU")}</span>
            <button
              type="button"
              onClick={() => setToolsOpen(false)}
              aria-label="Закрыть инструменты"
            >
              ×
            </button>
          </header>

          <div className="u1-agent-tools-section">
            <span className="u1-agent-tools-section__label">Модель</span>
            <div className="u1-agent-model-list">
              {selectableModels.map((model) => (
                <button
                  type="button"
                  key={model.id}
                  className="u1-agent-model-choice"
                  data-selected={model.id === selectedModelId || undefined}
                  onClick={() => void chooseModel(model.id)}
                  disabled={sending || pendingReply}
                >
                  <strong>{model.display_name}</strong>
                  <small>
                    {model.supports_vision ? "текст · изображения" : "текст"}
                    {model.supports_tools ? " · инструменты" : ""}
                  </small>
                </button>
              ))}
            </div>
          </div>

          <div className="u1-agent-tools-section">
            <span className="u1-agent-tools-section__label">Файл</span>
            <button
              type="button"
              className="u1-agent-file-action"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || pendingReply || uploading || attachments.length >= 4}
            >
              <span aria-hidden="true">＋</span>
              <div>
                <strong>{uploading ? "Загрузка…" : "Вставить файл"}</strong>
                <small>текст, код или изображение · до 12 МБ</small>
              </div>
            </button>
            <input
              ref={fileInputRef}
              className="u1-agent-file-input"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,text/*,.md,.markdown,.json,.csv,.ts,.tsx,.js,.jsx,.mjs,.cjs,.css,.scss,.html,.xml,.sql,.yaml,.yml,.toml,.ini,.py,.java,.kt,.go,.rs,.php,.rb,.sh"
              onChange={(event) => void onFilesSelected(event)}
            />
          </div>

          <div className="u1-agent-tools-section u1-agent-thread-section">
            <div className="u1-agent-thread-section__head">
              <span className="u1-agent-tools-section__label">Чаты</span>
              <button
                type="button"
                className="u1-agent-thread-new"
                onClick={() => void createThread()}
                disabled={sending || pendingReply}
                aria-label={`Новый чат с ${assistantName}`}
              >
                ＋
              </button>
            </div>

            <div className="u1-agent-thread-list">
              {threads.length === 0 && (
                <small className="u1-agent-thread-empty">
                  Здесь пока пусто.
                </small>
              )}

              {threads.map((thread) => (
                <div
                  key={thread.id}
                  className="u1-agent-thread-row"
                  data-active={thread.id === activeThreadId || undefined}
                >
                  <button
                    type="button"
                    className="u1-agent-thread-choice"
                    onClick={() => void switchThread(thread.id)}
                    disabled={sending || pendingReply}
                  >
                    <strong>{thread.title || "Новый чат"}</strong>
                    <small>
                      {new Date(thread.updated_at).toLocaleDateString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="u1-agent-thread-delete"
                    onClick={() => setPendingDeleteThreadId(thread.id)}
                    disabled={sending || pendingReply}
                    aria-label={`Удалить чат ${thread.title || "Новый чат"}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

        </section>

        {pendingDeleteThread && (
          <div
            className="u1-agent-confirm-shade"
            role="presentation"
            onClick={() => setPendingDeleteThreadId(null)}
          >
            <section
              className="u1-agent-confirm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="u1-agent-delete-chat-title"
              onClick={(event) => event.stopPropagation()}
            >
              <span>ЧАТЫ {assistantName.toLocaleUpperCase("ru-RU")}</span>
              <strong id="u1-agent-delete-chat-title">Удалить чат?</strong>
              <p>
                «{pendingDeleteThread.title || "Новый чат"}» исчезнет вместе с
                его историей. Это действие нельзя отменить.
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => setPendingDeleteThreadId(null)}
                >
                  Оставить
                </button>
                <button
                  type="button"
                  data-danger
                  onClick={async () => {
                    const deleted =
                      await deleteThread(pendingDeleteThread.id)
                    if (deleted) setPendingDeleteThreadId(null)
                  }}
                >
                  Удалить
                </button>
              </div>
            </section>
          </div>
        )}

        <div className="u1-agent-log" ref={logRef} aria-live="polite" onScroll={onLogScroll}>
          {messages.map((message) => (
            <article
              key={message.id}
              className="u1-agent-message"
              data-role={message.role}
              style={{ order: timelineOrder.get(`message:${message.id}`) }}
            >
              <small>{message.role === "assistant" ? assistantName.toLocaleUpperCase("ru-RU") : "ВЫ"}</small>
              <p>{message.body}</p>
            </article>
          ))}

          {visibleJobs.map((job) => {
            const reviewSummary = recordField(
              (job.result as Record<string, unknown>).review,
              "summary",
            )

            return (
              <article
                key={job.id}
                className="u1-agent-image-job"
                data-status={job.status}
                style={{ order: timelineOrder.get(`job:${job.id}`) }}
              >
                <header>
                  <div>
                    <span>ИЗОБРАЖЕНИЕ</span>
                    <strong>{imageJobStatus(job.status)}</strong>
                  </div>
                  <small>
                    {job.completed_outputs}/{job.requested_outputs}
                  </small>
                </header>

                {job.outputs.length > 0 && (
                  <div
                    className="u1-agent-image-grid"
                    data-count={job.outputs.length}
                  >
                    {job.outputs.map((asset) => {
                      const saved =
                        asset.status === "attached" ||
                        Boolean(asset.saved_at) ||
                        !asset.expires_at

                      return (
                        <div
                          key={asset.id}
                          className="u1-agent-image-card"
                          data-saved={saved || undefined}
                        >
                          <button
                            type="button"
                            className="u1-agent-image-option"
                            data-preferred={asset.review.preferred === true || undefined}
                            onClick={() => {
                              setSelectedGeneratedAssetRef({
                                jobId: job.id,
                                assetId: asset.id,
                                variantIndex: asset.variant_index,
                              })
                              if (!draft.trim()) {
                                prefillPrompt("Используй выбранный вариант.")
                              }
                            }}
                          >
                            {asset.url ? (
                              <img
                                src={asset.url}
                                alt={`Вариант ${asset.variant_index}`}
                                loading="lazy"
                              />
                            ) : (
                              <span className="u1-agent-image-option__placeholder" />
                            )}
                            <span>
                              Вариант {asset.variant_index}
                              {asset.review.preferred === true ? ` · выбор ${assistantName}` : ""}
                            </span>
                          </button>

                          <div className="u1-agent-image-actions">
                            {saved ? (
                              <span>Сохранено</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void saveGeneratedAsset(asset.id)}
                                disabled={sending || pendingReply}
                              >
                                Сохранить
                              </button>
                            )}
                            {asset.url && (
                              <button
                                type="button"
                                onClick={() => {
                                  const items = job.outputs.flatMap((candidate) =>
                                    candidate.url
                                      ? [{
                                          id: candidate.id,
                                          src: candidate.url,
                                          title: `Вариант ${candidate.variant_index}`,
                                          alt: `Вариант ${candidate.variant_index}`,
                                          facts: {
                                            jobId: job.id,
                                            assetId: candidate.id,
                                            variantIndex: candidate.variant_index,
                                            status: candidate.status,
                                            purpose: candidate.purpose,
                                            profile: candidate.profile,
                                          },
                                        }]
                                      : [],
                                  )
                                  const initialIndex = Math.max(
                                    0,
                                    items.findIndex((item) => item.id === asset.id),
                                  )
                                  setPreviewImage({
                                    key: `${job.id}:${asset.id}`,
                                    title: "Генерация",
                                    items,
                                    initialIndex,
                                  })
                                }}
                              >
                                Открыть
                              </button>
                            )}
                          </div>

                          {!saved && asset.expires_at && (
                            <small className="u1-agent-image-expiry">
                              Удалится после{" "}
                              {new Date(asset.expires_at).toLocaleDateString(
                                "ru-RU",
                                { day: "2-digit", month: "2-digit" },
                              )}
                            </small>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {(job.status === "queued" || job.status === "running") && (
                  <div className="u1-agent-image-job__progress">
                    <p>
                      Генерация · готово {job.completed_outputs} из{" "}
                      {job.requested_outputs}
                    </p>
                    <button
                      type="button"
                      onClick={() => void cancelImageJob(job.id)}
                    >
                      Отменить
                    </button>
                  </div>
                )}

                {reviewSummary && <p>{reviewSummary}</p>}

                {job.status === "failed" && (
                  <div className="u1-agent-image-job__failure">
                    <p className="u1-agent-image-job__error">
                      {job.error_message || "Генерация не завершилась."}
                    </p>
                    <button
                      type="button"
                      onClick={() => void retryImageJob(job.id)}
                    >
                      Повторить
                    </button>
                  </div>
                )}
              </article>
            )
          })}

          {lastRoute && (lastRoute.degraded || lastRoute.mode === "fallback") && (
            <div className="u1-agent-route-note" role="status" style={{ order: timelineTailOrder }}>
              {lastRoute.degraded
                ? "Ответ работает в ограниченном режиме."
                : `Использована совместимая модель: ${lastRoute.modelName}.`}
            </div>
          )}

          {(sending || pendingReply) && (
            <div className="u1-agent-thinking" style={{ order: timelineTailOrder + 1 }}>
              <AgentMark />
              <span>{assistantName} разбирается…</span>
            </div>
          )}
        </div>

        {attachments.length > 0 && (
          <div className="u1-agent-attachments">
            {attachments.map((attachment) => (
              <div key={attachment.storagePath} className="u1-agent-attachment">
                <div>
                  <strong>{attachment.name}</strong>
                  <small>{readableBytes(attachment.size)}</small>
                </div>
                <button
                  type="button"
                  onClick={() => void discardAttachment(attachment)}
                  disabled={sending || pendingReply}
                  aria-label={`Убрать ${attachment.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedGeneratedAssetRef && (
          <div className="u1-agent-selected-image">
            <span>
              Выбран вариант {selectedGeneratedAssetRef.variantIndex}
            </span>
            <button
              type="button"
              onClick={() => setSelectedGeneratedAssetRef(null)}
              disabled={sending || pendingReply}
              aria-label="Убрать выбранное изображение"
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <div className="u1-agent-error" role="status">
            {error}
          </div>
        )}

        <form className="u1-agent-composer" onSubmit={submit}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder={`${assistantName}…`}
            maxLength={8000}
            rows={2}
            disabled={sending || pendingReply}
            aria-label={`Сообщение для ${assistantName}`}
          />
          <button
            type="submit"
            disabled={
              (!draft.trim() && !attachments.length && !selectedGeneratedAssetRef) ||
              sending ||
              pendingReply ||
              uploading
            }
            aria-label={`Отправить ${assistantName}`}
          >
            <span aria-hidden="true">↑</span>
          </button>
        </form>
      </aside>
    </>
  )
}
