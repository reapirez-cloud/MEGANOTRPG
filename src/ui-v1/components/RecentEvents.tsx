import type { HomeRecentEvent } from "../hooks/useHomeRecentEvents"
import Pressable from "../primitives/Pressable"

type Props = {
  items: HomeRecentEvent[]
  loading: boolean
  onOpen: () => void
}

const sourceLabel: Record<HomeRecentEvent["sourceType"], string> = {
  diary: "Дневник",
  achievement: "Достижение",
  update: "Обновление",
  moment: "Событие",
}

function timeLabel(value: string) {
  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()

  return new Intl.DateTimeFormat("ru-RU", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short" }).format(date)
}

export default function RecentEvents({ items, loading, onOpen }: Props) {
  return (
    <section className="mg-recent-events" aria-labelledby="mg-recent-events-title">
      <div className="mg-recent-events__head">
        <div>
          <span className="mg-type-eyebrow">Кампания</span>
          <h2 id="mg-recent-events-title">Последние события</h2>
        </div>
        <button type="button" onClick={onOpen}>Все</button>
      </div>

      <div className="mg-recent-events__list">
        {loading && (
          <>
            <span className="mg-recent-events__skeleton" />
            <span className="mg-recent-events__skeleton" />
          </>
        )}

        {!loading && items.length === 0 && (
          <p className="mg-recent-events__empty">Пока тихо. Значимые события появятся здесь.</p>
        )}

        {items.map((item) => (
          <Pressable
            type="button"
            className="mg-recent-event"
            key={item.id}
            onClick={onOpen}
          >
            <span className="mg-recent-event__meta">
              {sourceLabel[item.sourceType]} · {timeLabel(item.publishedAt)}
            </span>
            <strong>{item.title || item.body || "Событие кампании"}</strong>
          </Pressable>
        ))}
      </div>
    </section>
  )
}
