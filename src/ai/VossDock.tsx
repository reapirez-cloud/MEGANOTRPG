import { useEffect, useRef, useState, type FormEvent } from "react"

import { useAI } from "./AIProvider"

export default function VossDock() {
  const {
    campaignId,
    canManage,
    models,
    selectedModelId,
    messages,
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

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      const node = logRef.current
      if (node) node.scrollTop = node.scrollHeight
    })
  }, [messages, open, sending])

  if (!campaignId || loading) return null

  const selectedModel =
    models.find((model) => model.id === selectedModelId) ||
    models.find((model) => model.is_base) ||
    null

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    const accepted = await send(text)
    if (accepted) setDraft("")
  }

  if (!open) {
    return (
      <button
        type="button"
        className="u1-voss-launcher"
        onClick={() => setOpen(true)}
        aria-label="Открыть Восса"
      >
        <span>ВОСС</span>
        <small>{canManage ? selectedModel?.display_name || "AI" : "БАЗА"}</small>
      </button>
    )
  }

  return (
    <aside className="u1-voss-panel" aria-label="Восс, помощник MEGANOT RPG">
      <header className="u1-voss-panel__header">
        <div>
          <span>MEGANOT / AGENT</span>
          <strong>Восс</strong>
          <small>{viewContext?.title || "Помощник кампании"}</small>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Свернуть Восса">×</button>
      </header>

      {canManage && models.length > 0 && (
        <label className="u1-voss-model">
          <span>Модель</span>
          <select
            value={selectedModelId || ""}
            onChange={(event) => void chooseModel(event.target.value)}
            disabled={sending}
          >
            {models.filter((model) => model.gm_selectable || model.is_base).map((model) => (
              <option key={model.id} value={model.id}>
                {model.display_name}{model.is_base ? " · база" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="u1-voss-context">
        <span>Сейчас вижу</span>
        <strong>{viewContext?.title || viewContext?.screen || "текущий экран"}</strong>
        {viewContext?.entity && (
          <small className="u1-voss-context__entity">
            {viewContext.entity.type}
            {" · "}
            {viewContext.entity.label || viewContext.entity.id}
          </small>
        )}
        {viewContext?.draft?.dirty && (
          <b>НЕ СОХРАНЕНО · ВИЖУ ТЕКУЩИЕ ПОЛЯ</b>
        )}
        {viewContext?.text && <small>{viewContext.text}</small>}
      </div>

      <div className="u1-voss-log" ref={logRef}>
        {!messages.length && (
          <div className="u1-voss-empty">
            <strong>Спрашивай по тому, что открыто.</strong>
            <p>
              Я вижу текущий экран, выбранную сущность и незаписанные поля редакторов.
              Пока только читаю и объясняю: менять канонические данные мне ещё не разрешено.
            </p>
          </div>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            className="u1-voss-message"
            data-role={message.role}
          >
            <small>{message.role === "assistant" ? "ВОСС" : "ВЫ"}</small>
            <p>{message.body}</p>
          </article>
        ))}
        {sending && <div className="u1-voss-thinking">Восс разбирается…</div>}
      </div>

      {error && <div className="u1-voss-error">{error}</div>}

      <form className="u1-voss-composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Спроси про открытый экран, механику или идею…"
          maxLength={8000}
          rows={2}
          disabled={sending}
        />
        <button type="submit" disabled={!draft.trim() || sending} aria-label="Отправить Воссу">
          ↑
        </button>
      </form>
    </aside>
  )
}
