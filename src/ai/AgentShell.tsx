import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"

import {
  useAI,
  type AIViewContext,
} from "./AIProvider"
import {
  AGENT_OPEN_EVENT,
  type AgentOpenDetail,
} from "./agentUiBridge"

function uniquePrompts(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
    .slice(0, 4)
}

function contextPrompts(
  viewContext: AIViewContext | null,
  canManage: boolean,
) {
  const screen = viewContext?.screen || ""
  const entity = viewContext?.entity
  const label = entity?.label || viewContext?.title || ""
  const prompts: Array<string | null> = []

  if (viewContext?.draft?.dirty) {
    prompts.push("Проверь текущие несохранённые поля и скажи, что я мог упустить.")
  }

  if (entity) {
    prompts.push(
      label
        ? `Объясни, что сейчас важно в «${label}».`
        : "Объясни, что сейчас важно в открытой сущности.",
    )
  }

  if (/reference-(?:class|subclass|feature)|knowledge-base/u.test(screen)) {
    prompts.push("Объясни открытую механику простыми словами и отдельно назови точное правило.")
    if (canManage && entity) {
      prompts.push("Проверь, можно ли выразить открытую механику через CE, и собери безопасную компиляцию без применения.")
    }
  } else if (/character/u.test(screen)) {
    prompts.push("Что в этом персонаже сейчас требует внимания?")
  } else if (/location|world/u.test(screen)) {
    prompts.push("Что известно об этом месте и какие связи с ним уже есть в кампании?")
  } else if (/workspace/u.test(screen)) {
    prompts.push("Что на этом экране сейчас самое важное?")
  }

  prompts.push("Что из прошлого кампании связано с тем, что сейчас открыто?")

  if (canManage && /gm-workshop/u.test(screen)) {
    prompts.push("Собери структурированный AI-черновик по открытому материалу.")
  } else if (canManage && entity) {
    prompts.push("Предложи GM-варианты развития этого элемента, не меняя канон.")
  }

  return uniquePrompts([
    ...prompts,
    "Коротко разложи текущий экран: факты, риски и следующие действия.",
  ])
}

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

function mechanicsStatus(status: string) {
  if (status === "validated") return "Проверено"
  if (status === "unsupported") return "Нужна доработка"
  if (status === "applied") return "Применено"
  if (status === "rejected") return "Отклонено"
  return status
}

function recordField(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const field = (value as Record<string, unknown>)[key]
  return typeof field === "string" && field.trim() ? field.trim() : null
}

export default function AgentShell() {
  const {
    campaignId,
    canManage,
    models,
    selectedModelId,
    lastRoute,
    messages,
    drafts,
    jobs,
    mechanicsCompilations,
    loading,
    sending,
    error,
    viewContext,
    chooseModel,
    send,
  } = useAI()

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const logRef = useRef<HTMLDivElement | null>(null)

  const selectedModel =
    models.find((model) => model.id === selectedModelId) ||
    models.find((model) => model.is_base) ||
    null
  const routedModel =
    models.find((model) => model.id === lastRoute?.modelId) ||
    selectedModel

  const prompts = useMemo(
    () => contextPrompts(viewContext, canManage),
    [canManage, viewContext],
  )

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
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      const node = logRef.current
      if (node) node.scrollTop = node.scrollHeight
    })
  }, [jobs, messages, open, sending])

  if (!campaignId || loading) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    const accepted = await send(text)
    if (accepted) setDraft("")
  }

  function prefillPrompt(prompt: string) {
    setDraft(prompt)
  }

  return (
    <>
      <button
        type="button"
        className="u1-agent-orb"
        onClick={() => setOpen((current) => !current)}
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
          aria-label="Закрыть панель Восса"
          tabIndex={-1}
        />
      )}

      <aside
        id="u1-agent-panel"
        className="u1-agent-panel"
        aria-label="Восс, агент MEGANOT RPG"
        aria-hidden={!open}
        data-open={open || undefined}
      >
        <header className="u1-agent-panel__header">
          <div className="u1-agent-panel__identity">
            <AgentMark />
            <div>
              <span>MEGANOT / AGENT</span>
              <strong>Восс</strong>
              <small>{viewContext?.title || "Помощник кампании"}</small>
            </div>
          </div>

          <button
            type="button"
            className="u1-agent-panel__close"
            onClick={() => setOpen(false)}
            aria-label="Свернуть Восса"
          >
            ×
          </button>
        </header>

        <section className="u1-agent-context" aria-label="Контекст агента">
          <div className="u1-agent-context__head">
            <span>Сейчас вижу</span>
            <small>
              {routedModel?.supports_tools ? "READ · MEMORY · ON" : "CONTEXT ONLY"}
            </small>
          </div>

          <strong>
            {viewContext?.title || viewContext?.screen || "Текущий экран"}
          </strong>

          {viewContext?.entity && (
            <small className="u1-agent-context__entity">
              {viewContext.entity.type}
              {" · "}
              {viewContext.entity.label || viewContext.entity.id}
            </small>
          )}

          {viewContext?.draft?.dirty && (
            <b>НЕ СОХРАНЕНО · ВИЖУ ТЕКУЩИЕ ПОЛЯ</b>
          )}

          {lastRoute && (
            <small className="u1-agent-route" title={lastRoute.reason}>
              {lastRoute.task.toUpperCase()}
              {" · "}
              {lastRoute.modelName}
              {" · "}
              {lastRoute.mode.toUpperCase()}
              {lastRoute.degraded ? " · DEGRADED" : ""}
            </small>
          )}
        </section>

        {canManage && models.length > 0 && (
          <label className="u1-agent-model">
            <span>Основная модель</span>
            <select
              value={selectedModelId || ""}
              onChange={(event) => void chooseModel(event.target.value)}
              disabled={sending}
            >
              {models
                .filter((model) => model.gm_selectable || model.is_base)
                .map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.display_name}
                    {model.is_base ? " · база" : ""}
                  </option>
                ))}
            </select>
          </label>
        )}

        <div className="u1-agent-prompts" aria-label="Подсказки по текущему экрану">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => prefillPrompt(prompt)}
              disabled={sending}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="u1-agent-log" ref={logRef} aria-live="polite">
          {canManage && mechanicsCompilations[0] && (
            <article
              className="u1-agent-mechanics-card"
              data-status={mechanicsCompilations[0].status}
            >
              <header>
                <div>
                  <span>MECHANICS COMPILER · v{mechanicsCompilations[0].compiler_version}</span>
                  <strong>{mechanicsCompilations[0].title}</strong>
                </div>
                <b>{mechanicsStatus(mechanicsCompilations[0].status)}</b>
              </header>

              <p>{mechanicsCompilations[0].intent_text}</p>

              <div className="u1-agent-mechanics-card__stats">
                <small>
                  {mechanicsCompilations[0].mechanics.length} мех.
                </small>
                <small>
                  {mechanicsCompilations[0].coverage.filter((row) => row.owner === "ce").length} CE
                </small>
                <small>
                  {mechanicsCompilations[0].coverage.filter((row) => row.owner === "hybrid").length} hybrid
                </small>
                <small>
                  {mechanicsCompilations[0].coverage.filter((row) => row.owner === "gm").length} GM
                </small>
              </div>

              {mechanicsCompilations[0].unsupported_reasons.length > 0 && (
                <div className="u1-agent-mechanics-card__blocked">
                  {mechanicsCompilations[0].unsupported_reasons.slice(0, 3).map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </div>
              )}

              {mechanicsCompilations[0].diagnostics.some(
                (item) => item.severity === "error",
              ) && (
                <small className="u1-agent-mechanics-card__diagnostic">
                  Ошибок компиляции:{" "}
                  {mechanicsCompilations[0].diagnostics.filter(
                    (item) => item.severity === "error",
                  ).length}
                </small>
              )}

              {mechanicsCompilations[0].status === "validated" && (
                <button
                  type="button"
                  onClick={() =>
                    prefillPrompt(
                      `Примени компиляцию механик ${mechanicsCompilations[0].id}.`,
                    )
                  }
                  disabled={sending}
                >
                  Подготовить применение
                </button>
              )}

              {mechanicsCompilations[0].status === "unsupported" && (
                <small className="u1-agent-mechanics-card__law">
                  Нельзя применять · пробел должен быть исправлен или передан в Developer Mode
                </small>
              )}
            </article>
          )}

          {canManage && drafts[0] && (
            <article className="u1-agent-draft-card">
              <span>AI DRAFT · НЕ КАНОН</span>
              <strong>{drafts[0].title}</strong>
              {drafts[0].summary && <p>{drafts[0].summary}</p>}
              <small>
                {drafts[0].content.nodes?.length || 0} сущн.
                {" · "}
                {drafts[0].content.relations?.length || 0} связей
                {" · r"}
                {drafts[0].current_revision}
              </small>
              {drafts[0].recent_revisions?.[0]?.change_summary && (
                <em>{drafts[0].recent_revisions[0].change_summary}</em>
              )}
            </article>
          )}

          {!messages.length && (
            <div className="u1-agent-empty">
              <strong>Спрашивай по тому, что открыто.</strong>
              <p>
                Восс получает семантический контекст текущего экрана, может дочитывать
                разрешённые данные, использовать память кампании и собирать GM-черновики.
                Канон сам не меняется.
              </p>
            </div>
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
                data-output-count={job.outputs.length}
              >
                <header>
                  <div>
                    <span>IMAGE JOB</span>
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
                    {job.outputs.map((asset) => (
                      <button
                        type="button"
                        key={asset.id}
                        className="u1-agent-image-option"
                        data-preferred={asset.review.preferred === true || undefined}
                        onClick={() =>
                          prefillPrompt(
                            `Используй вариант ${asset.variant_index} из последней генерации.`,
                          )
                        }
                        aria-label={`Выбрать вариант ${asset.variant_index}`}
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
                        <span className="u1-agent-image-option__meta">
                          <b>Вариант {asset.variant_index}</b>
                          {asset.review.preferred === true && (
                            <em>Выбор Восса</em>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {(job.status === "queued" || job.status === "running") && (
                  <p className="u1-agent-image-job__progress">
                    Генерируется {job.requested_outputs === 1
                      ? "изображение"
                      : `${job.requested_outputs} варианта`}.
                    Уже готовы: {job.completed_outputs}.
                  </p>
                )}

                {reviewSummary && (
                  <p className="u1-agent-image-job__review">
                    {reviewSummary}
                  </p>
                )}

                {job.status === "failed" && (
                  <p className="u1-agent-image-job__error">
                    {job.error_message || "Генерация не завершилась."}
                  </p>
                )}

                {job.requested_outputs > 1 && job.status === "completed" && (
                  <small className="u1-agent-image-job__law">
                    Показаны все запрошенные варианты · выбор Восса не скрывает остальные
                  </small>
                )}
              </article>
            )
          })}


          {sending && (
            <div className="u1-agent-thinking">Восс разбирается…</div>
          )}
        </div>

        {error && (
          <div className="u1-agent-error" role="status">
            {error}
          </div>
        )}

        <form className="u1-agent-composer" onSubmit={submit}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Спроси про то, что сейчас открыто…"
            maxLength={8000}
            rows={2}
            disabled={sending}
            aria-label="Сообщение Воссу"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Отправить Воссу"
          >
            ↑
          </button>
        </form>
      </aside>
    </>
  )
}
