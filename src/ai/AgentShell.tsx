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
} from "./AIProvider"
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

function devRunStatus(status: string) {
  if (status === "proposed") return "Ждёт подтверждения"
  if (status === "branch_applied") return "Ветка создана"
  if (status === "checks_pending") return "Идут проверки"
  if (status === "preview_ready") return "Preview готов"
  if (status === "merge_ready") return "Готов к dev"
  if (status === "merged_dev") return "Слит в dev"
  if (status === "failed") return "Проверки не прошли"
  if (status === "cancelled") return "Отменён"
  if (status === "stale") return "Устарел"
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
    isSystemAdmin,
    models,
    ownerOverrideModels,
    selectedModelId,
    threads,
    activeThreadId,
    messages,
    drafts,
    jobs,
    devSession,
    devRuns,
    developerCapabilities,
    loading,
    sending,
    error,
    chooseModel,
    uploadAttachment,
    removeAttachment,
    openDeveloperMode,
    closeDeveloperMode,
    setDeveloperOverride,
    applyDevRun,
    refreshDevRun,
    mergeDevRun,
    cancelDevRun,
    createThread,
    switchThread,
    deleteThread,
    saveGeneratedAsset,
    send,
  } = useAI()

  const [open, setOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [attachments, setAttachments] = useState<AIAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [orbPosition, setOrbPosition] = useState(defaultOrbPosition)

  const logRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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
  const latestDevRun = devRuns[0] || null

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
    const onResize = () => {
      setOrbPosition((current) => snapOrb(current))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    if (!open) {
      setToolsOpen(false)
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (toolsOpen) {
        setToolsOpen(false)
        return
      }
      setOpen(false)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, toolsOpen])

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      const node = logRef.current
      if (node) node.scrollTop = node.scrollHeight
    })
  }, [devRuns, jobs, messages, open, sending])

  if (!campaignId || loading) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if ((!text && !attachments.length) || sending || uploading) return
    const accepted = await send(text, attachments)
    if (accepted) {
      setDraft("")
      setAttachments([])
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

  function orbPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: orbPosition.x,
      originY: orbPosition.y,
      moved: false,
    }
  }

  function orbPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (Math.hypot(deltaX, deltaY) > 4) drag.moved = true

    setOrbPosition({
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
    dragRef.current = null

    if (!drag.moved) {
      setOpen((current) => !current)
      return
    }

    const next = snapOrb(orbPosition)
    setOrbPosition(next)
    try {
      window.localStorage.setItem(ORB_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Position persistence is convenience only.
    }
  }

  return (
    <>
      <button
        type="button"
        className="u1-agent-orb"
        style={{ left: orbPosition.x, top: orbPosition.y }}
        onPointerDown={orbPointerDown}
        onPointerMove={orbPointerMove}
        onPointerUp={orbPointerUp}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          setOpen((current) => !current)
        }}
        aria-label={open ? "Свернуть Восса" : "Открыть Восса"}
        aria-expanded={open}
        aria-controls="u1-agent-panel"
        data-open={open || undefined}
      >
        <AgentMark />
        <span className="u1-agent-orb__state" aria-hidden="true" />
      </button>

      {open && (
        <button
          type="button"
          className="u1-agent-backdrop"
          onClick={() => setOpen(false)}
          aria-label="Закрыть Восса"
          tabIndex={-1}
        />
      )}

      <aside
        id="u1-agent-panel"
        className="u1-agent-panel"
        aria-label="Восс"
        aria-hidden={!open}
        data-open={open || undefined}
      >
        <header className="u1-agent-panel__header">
          <button
            type="button"
            className="u1-agent-tools-trigger"
            onClick={() => setToolsOpen((current) => !current)}
            aria-label="Инструменты Восса"
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
              <strong>Восс</strong>
            </div>
          </div>

          <div className="u1-agent-panel__header-actions">
            <small>{selectedModel?.display_name || "AI"}</small>
            <button
              type="button"
              className="u1-agent-panel__close"
              onClick={() => setOpen(false)}
              aria-label="Свернуть Восса"
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
            <span>ИНСТРУМЕНТЫ ВОССА</span>
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
                  disabled={sending}
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
              disabled={sending || uploading || attachments.length >= 4}
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
                disabled={sending}
                aria-label="Новый чат с Воссом"
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
                    disabled={sending}
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
                    onClick={() => {
                      if (!window.confirm(
                        `Удалить чат «${thread.title || "Новый чат"}»?`,
                      )) return
                      void deleteThread(thread.id)
                    }}
                    disabled={sending}
                    aria-label={`Удалить чат ${thread.title || "Новый чат"}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {isSystemAdmin && (
            <div className="u1-agent-tools-section u1-agent-dev-control">
              <div className="u1-agent-dev-control__head">
                <div>
                  <span className="u1-agent-tools-section__label">
                    Developer Mode
                  </span>
                  <strong>{devSession ? "Активен" : "Выключен"}</strong>
                </div>
                {devSession ? (
                  <button
                    type="button"
                    onClick={() => void closeDeveloperMode()}
                    disabled={sending}
                  >
                    Закрыть
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void openDeveloperMode(null)}
                    disabled={sending}
                  >
                    Открыть
                  </button>
                )}
              </div>

              {devSession && (
                <>
                  <small>
                    dev · до{" "}
                    {new Date(devSession.expires_at).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {developerCapabilities?.repositoryConfigured
                      ? "repo подключён"
                      : "repo без server token"}
                  </small>

                  {ownerOverrideModels.length > 0 && (
                    <label className="u1-agent-dev-model">
                      <span>Модель разработчика</span>
                      <select
                        value={devSession.owner_override_model_id || ""}
                        onChange={(event) =>
                          void setDeveloperOverride(event.target.value || null)
                        }
                        disabled={sending}
                      >
                        <option value="">Основная модель</option>
                        {ownerOverrideModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        <div className="u1-agent-log" ref={logRef} aria-live="polite">
          {isSystemAdmin && latestDevRun && (
            <article
              className="u1-agent-system-entry u1-agent-dev-run"
              data-status={latestDevRun.state}
            >
              <header>
                <div>
                  <span>DEVELOPER RUN</span>
                  <strong>{latestDevRun.title}</strong>
                </div>
                <b>{devRunStatus(latestDevRun.state)}</b>
              </header>

              {latestDevRun.summary && <p>{latestDevRun.summary}</p>}

              <div className="u1-agent-system-meta">
                <small>{latestDevRun.proposed_changes.length} файлов</small>
                <small>CI: {latestDevRun.ci_state}</small>
                <small>Preview: {latestDevRun.preview_state}</small>
              </div>

              {latestDevRun.diff_preview && (
                <details className="u1-agent-dev-run__diff">
                  <summary>Diff preview</summary>
                  <pre>{latestDevRun.diff_preview.slice(0, 18000)}</pre>
                </details>
              )}

              <div className="u1-agent-system-actions">
                {latestDevRun.state === "proposed" && (
                  <button
                    type="button"
                    disabled={
                      sending ||
                      !devSession ||
                      developerCapabilities?.repositoryConfigured !== true
                    }
                    onClick={() => {
                      if (!window.confirm(
                        "Создать preview-ветку и PR в dev? main останется нетронут.",
                      )) return
                      void applyDevRun(latestDevRun.id)
                    }}
                  >
                    Создать preview-ветку
                  </button>
                )}

                {latestDevRun.head_sha &&
                  !["merged_dev", "cancelled", "stale"].includes(
                    latestDevRun.state,
                  ) && (
                    <button
                      type="button"
                      disabled={sending || !devSession}
                      onClick={() => void refreshDevRun(latestDevRun.id)}
                    >
                      Проверки
                    </button>
                  )}

                {latestDevRun.state === "merge_ready" && (
                  <button
                    type="button"
                    disabled={sending || !devSession}
                    onClick={() => {
                      if (!window.confirm(
                        "CI и Preview зелёные. Слить этот PR в dev?",
                      )) return
                      void mergeDevRun(latestDevRun.id)
                    }}
                  >
                    Слить в dev
                  </button>
                )}

                {!["merged_dev", "cancelled"].includes(latestDevRun.state) && (
                  <button
                    type="button"
                    disabled={sending || !devSession}
                    onClick={() => void cancelDevRun(latestDevRun.id)}
                  >
                    Отменить
                  </button>
                )}
              </div>
            </article>
          )}

          {canManage && drafts[0] && (
            <article className="u1-agent-system-entry">
              <header>
                <div>
                  <span>AI DRAFT · НЕ КАНОН</span>
                  <strong>{drafts[0].title}</strong>
                </div>
                <b>r{drafts[0].current_revision}</b>
              </header>
              {drafts[0].summary && <p>{drafts[0].summary}</p>}
              {drafts[0].recent_revisions?.[0]?.change_summary && (
                <small className="u1-agent-system-note">
                  {drafts[0].recent_revisions[0].change_summary}
                </small>
              )}
            </article>
          )}

          {messages.map((message) => (
            <article
              key={message.id}
              className="u1-agent-message"
              data-role={message.role}
            >
              <small>{message.role === "assistant" ? "ВОСС" : "ВЫ"}</small>
              <p>{message.body}</p>
            </article>
          ))}

          {jobs.slice(0, 6).map((job) => {
            const reviewSummary = recordField(
              (job.result as Record<string, unknown>).review,
              "summary",
            )

            return (
              <article
                key={job.id}
                className="u1-agent-image-job"
                data-status={job.status}
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
                            onClick={() =>
                              prefillPrompt(
                                `Используй вариант ${asset.variant_index} из последней генерации.`,
                              )
                            }
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
                              {asset.review.preferred === true ? " · выбор Восса" : ""}
                            </span>
                          </button>

                          <div className="u1-agent-image-actions">
                            {saved ? (
                              <span>Сохранено</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void saveGeneratedAsset(asset.id)}
                                disabled={sending}
                              >
                                Сохранить
                              </button>
                            )}
                            {asset.url && (
                              <a
                                href={asset.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Открыть
                              </a>
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
                  <p>
                    Генерация · готово {job.completed_outputs} из{" "}
                    {job.requested_outputs}
                  </p>
                )}

                {reviewSummary && <p>{reviewSummary}</p>}

                {job.status === "failed" && (
                  <p className="u1-agent-image-job__error">
                    {job.error_message || "Генерация не завершилась."}
                  </p>
                )}
              </article>
            )
          })}

          {sending && (
            <div className="u1-agent-thinking">
              <AgentMark />
              <span>Восс разбирается…</span>
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
                  disabled={sending}
                  aria-label={`Убрать ${attachment.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="u1-agent-error" role="status">
            {error}
          </div>
        )}

        <form className="u1-agent-composer" onSubmit={submit}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Восс…"
            maxLength={8000}
            rows={2}
            disabled={sending}
            aria-label="Сообщение Воссу"
          />
          <button
            type="submit"
            disabled={
              (!draft.trim() && !attachments.length) ||
              sending ||
              uploading
            }
            aria-label="Отправить Воссу"
          >
            <span aria-hidden="true">↑</span>
          </button>
        </form>
      </aside>
    </>
  )
}
