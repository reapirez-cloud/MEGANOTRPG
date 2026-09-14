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

export default function AgentShell() {
  const {
    campaignId,
    canManage,
    models,
    selectedModelId,
    lastRoute,
    messages,
    drafts,
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
  }, [messages, open, sending])

  if (!campaignId || loading) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    const accepted = await send(text)
    if (accepted) setDraft("")
  }

  function usePrompt(prompt: string) {
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
              onClick={() => usePrompt(prompt)}
              disabled={sending}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="u1-agent-log" ref={logRef} aria-live="polite">
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
