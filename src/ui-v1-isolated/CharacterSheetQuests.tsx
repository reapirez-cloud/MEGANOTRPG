import { useMemo, useState } from "react"

import type { CharacterQuest } from "./useCharacterQuests"

type QuestFilter = "active" | "completed" | "failed"

const FILTERS: Array<{ id: QuestFilter; label: string }> = [
  { id: "active", label: "Активные" },
  { id: "completed", label: "Завершённые" },
  { id: "failed", label: "Проваленные" },
]

function inFilter(quest: CharacterQuest, filter: QuestFilter) {
  if (filter === "failed") {
    return quest.status === "failed" || quest.status === "cancelled"
  }
  return quest.status === filter
}

function statusLabel(quest: CharacterQuest) {
  if (quest.status === "completed") return "Завершён"
  if (quest.status === "failed") return "Провален"
  if (quest.status === "cancelled") return "Закрыт"
  return "Активен"
}

function QuestCard({ quest }: { quest: CharacterQuest }) {
  const completed = quest.completed_stages

  return (
    <article
      className="u1-character-quests__card"
      data-status={quest.status}
    >
      <header className="u1-character-quests__card-head">
        <span>{statusLabel(quest)}</span>
        <small>
          {completed.length
            ? `Раскрыто этапов: ${completed.length}`
            : "История ещё не раскрыта"}
        </small>
      </header>

      <h3>{quest.title}</h3>

      {quest.player_brief ? (
        <p className="u1-character-quests__brief">{quest.player_brief}</p>
      ) : null}

      <div className="u1-character-quests__history">
        <span className="u1-character-quests__history-title">
          Пройденный путь
        </span>

        {completed.length ? (
          <ol>
            {completed.map((stage) => (
              <li key={stage.id}>
                <i aria-hidden="true">✓</i>
                <div>
                  {stage.player_title ? (
                    <strong>{stage.player_title}</strong>
                  ) : null}
                  {stage.completion_text ? (
                    <p>{stage.completion_text}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="u1-character-quests__empty-history">
            Выполненные этапы появятся здесь по мере прохождения.
          </p>
        )}
      </div>
    </article>
  )
}

export default function CharacterSheetQuests({
  quests,
  loading,
  error,
  onReload,
}: {
  quests: CharacterQuest[]
  loading: boolean
  error: string | null
  onReload: () => void
}) {
  const [filter, setFilter] = useState<QuestFilter>("active")

  const playerVisible = useMemo(
    () => quests.filter((quest) => quest.status !== "draft"),
    [quests],
  )

  const counts = useMemo(() => ({
    active: playerVisible.filter((quest) => inFilter(quest, "active")).length,
    completed: playerVisible.filter((quest) => inFilter(quest, "completed")).length,
    failed: playerVisible.filter((quest) => inFilter(quest, "failed")).length,
  }), [playerVisible])

  const visible = useMemo(
    () => playerVisible.filter((quest) => inFilter(quest, filter)),
    [filter, playerVisible],
  )

  if (loading) {
    return (
      <section className="u1-character-quests" aria-label="Квесты">
        <div className="u1-character-quests__state">Загрузка квестов…</div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="u1-character-quests" aria-label="Квесты">
        <div className="u1-character-quests__state" data-error>
          <strong>Квесты недоступны</strong>
          <span>{error}</span>
          <button type="button" onClick={onReload}>Повторить</button>
        </div>
      </section>
    )
  }

  return (
    <section className="u1-character-quests" aria-label="Квесты">
      <header className="u1-character-quests__header">
        <span>Журнал персонажа</span>
        <h2>Квесты</h2>
        <p>
          Здесь остаётся только то, что персонаж уже знает. Будущие этапы
          и скрытые условия не загружаются в этот интерфейс.
        </p>
      </header>

      <nav className="u1-character-quests__filters" aria-label="Фильтр квестов">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            data-active={filter === item.id || undefined}
            onClick={() => setFilter(item.id)}
          >
            <span>{item.label}</span>
            <i>{counts[item.id]}</i>
          </button>
        ))}
      </nav>

      <div className="u1-character-quests__list">
        {visible.length ? (
          visible.map((quest) => <QuestCard key={quest.id} quest={quest} />)
        ) : (
          <div className="u1-character-quests__empty">
            {filter === "active"
              ? "Активных квестов нет."
              : filter === "completed"
                ? "Завершённых квестов пока нет."
                : "Проваленных квестов нет."}
          </div>
        )}
      </div>
    </section>
  )
}
