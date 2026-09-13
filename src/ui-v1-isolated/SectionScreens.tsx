import { useMemo, useState } from "react"

import { LocationNavigator } from "./LocationNavigator"

import { classReference } from "../data/classReference"
import { warlockInvocationsReference } from "../data/classes/warlockInvocationsReference"
import {
  knowledgeBaseSections,
  worldHubSections,
  type HubSection,
} from "./sectionRegistry"
import {
  useUiV1Achievements,
  useUiV1KnowledgeCatalog,
  useUiV1SocietyNews,
  useUiV1WorldData,
  type AchievementPreview,
} from "./useUiV1SectionData"
import "./section-screens.css"

function navigate(path: string) {
  window.location.hash = `#/${path}`
}

function SectionHeader({
  title,
  backTo,
  action,
}: {
  title: string
  backTo: string
  action?: React.ReactNode
}) {
  return (
    <header className="u1-section-head">
      <button
        type="button"
        className="u1-section-head__back"
        onClick={() => navigate(backTo)}
        aria-label="Назад"
      >
        ←
      </button>
      <h1>{title}</h1>
      <span className="u1-section-head__action">{action}</span>
    </header>
  )
}

function HubCard({
  item,
  onOpen,
}: {
  item: HubSection
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className="u1-hub-card"
      data-tone={item.tone}
      onClick={onOpen}
    >
      {item.image ? (
        <img
          className="u1-hub-card__image"
          src={item.image}
          alt=""
          decoding="async"
          aria-hidden="true"
        />
      ) : (
        <span className="u1-hub-card__texture" aria-hidden="true" />
      )}
      <span className="u1-hub-card__scrim" aria-hidden="true" />
      <span className="u1-hub-card__copy">
        <strong>{item.title}</strong>
        <small>{item.caption}</small>
      </span>
    </button>
  )
}

function SectionHub({
  title,
  items,
  basePath,
}: {
  title: string
  items: HubSection[]
  basePath: string
}) {
  return (
    <main className="u1-section-page">
      <SectionHeader title={title} backTo="home" />
      <section className="u1-hub-list" aria-label={title}>
        {items.map((item) => (
          <HubCard
            key={item.id}
            item={item}
            onOpen={() => navigate(`${basePath}/${item.id}`)}
          />
        ))}
      </section>
    </main>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="u1-section-empty">{children}</div>
}

function FutureConnection({
  title,
  backTo,
}: {
  title: string
  backTo: string
}) {
  return (
    <main className="u1-section-page">
      <SectionHeader title={title} backTo={backTo} />
      <EmptyState>Раздел подключён к новой навигации. Наполнение будет сделано отдельным этапом.</EmptyState>
    </main>
  )
}

export function WorldSectionScreen({
  subsection,
  path = [],
}: {
  subsection?: string
  path?: string[]
}) {
  const world = useUiV1WorldData()

  if (!subsection) {
    return (
      <SectionHub
        title="Мир"
        items={worldHubSections}
        basePath="home/world"
      />
    )
  }

  const registered = worldHubSections.find((item) => item.id === subsection)
  if (!registered) return <FutureConnection title="Мир" backTo="home/world" />

  if (subsection === "locations") {
    return (
      <LocationNavigator
        selectedLocationId={path[0]}
        detail={path[1] === "detail"}
      />
    )
  }

  if (subsection === "map") {
    return (
      <main className="u1-section-page">
        <SectionHeader title="Карта" backTo="home/world" />
        <EmptyState>
          Вход в карту готов. Саму карту сейчас намеренно не строим: её отдельная концепция не должна быть испорчена временной реализацией.
        </EmptyState>
      </main>
    )
  }

  return (
    <main className="u1-section-page">
      <SectionHeader title={registered.title} backTo="home/world" />
      {world.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : world.error ? (
        <EmptyState>Раздел временно недоступен.</EmptyState>
      ) : subsection === "characters" ? (
        <div className="u1-simple-list">
          {world.characters.map((item) => (
            <article className="u1-simple-row" key={item.id}>
              <strong>{item.name}</strong>
              <small>{item.character_class || "Персонаж"}</small>
            </article>
          ))}
          {!world.characters.length && <EmptyState>Персонажей пока нет.</EmptyState>}
        </div>
      ) : subsection === "lore" ? (
        <div className="u1-simple-list">
          {world.lore.map((item) => (
            <article className="u1-simple-row" key={item.id}>
              <strong>{item.title}</strong>
              {item.summary && <small>{item.summary}</small>}
            </article>
          ))}
          {!world.lore.length && <EmptyState>Лор пока не заполнен.</EmptyState>}
        </div>
      ) : (
        <FutureConnection title={registered.title} backTo="home/world" />
      )}
    </main>
  )
}

function ClassCatalogPanels({
  rows,
  query,
}: {
  rows: Array<{ id: string; title: string; meta: string; art?: string }>
  query: string
}) {
  const normalized = query.trim().toLocaleLowerCase("ru")
  const visible = useMemo(
    () => normalized
      ? rows.filter((row) => `${row.title} ${row.meta}`.toLocaleLowerCase("ru").includes(normalized))
      : rows,
    [normalized, rows],
  )

  return (
    <div className="u1-class-panel-list">
      {visible.map((row) => (
        <article
          className="u1-class-panel"
          data-class-id={row.id}
          key={row.id}
        >
          <span className="u1-class-panel__texture" aria-hidden="true" />
          <img
            className="u1-class-panel__image"
            src={row.art || `/ui-v1/classes/${row.id}.webp`}
            alt=""
            loading="lazy"
            decoding="async"
            aria-hidden="true"
            onError={(event) => {
              event.currentTarget.hidden = true
            }}
          />
          <span className="u1-class-panel__scrim" aria-hidden="true" />
          <span className="u1-class-panel__copy">
            <strong>{row.title}</strong>
            <small>{row.meta}</small>
          </span>
        </article>
      ))}
      {!visible.length && <EmptyState>Ничего не найдено.</EmptyState>}
    </div>
  )
}

function CatalogRows({
  rows,
  query,
}: {
  rows: Array<{ id: string; title: string; meta: string }>
  query: string
}) {
  const normalized = query.trim().toLocaleLowerCase("ru")
  const visible = useMemo(
    () => normalized
      ? rows.filter((row) => `${row.title} ${row.meta}`.toLocaleLowerCase("ru").includes(normalized))
      : rows,
    [normalized, rows],
  )

  return (
    <div className="u1-catalog-list">
      {visible.map((row) => (
        <article className="u1-catalog-row" key={row.id}>
          <strong>{row.title}</strong>
          <small>{row.meta}</small>
        </article>
      ))}
      {!visible.length && <EmptyState>Ничего не найдено.</EmptyState>}
    </div>
  )
}

export function KnowledgeBaseScreen({ subsection }: { subsection?: string }) {
  const catalog = useUiV1KnowledgeCatalog(subsection)
  const [query, setQuery] = useState("")

  if (!subsection) {
    return (
      <SectionHub
        title="База знаний"
        items={knowledgeBaseSections}
        basePath="home/knowledge-base"
      />
    )
  }

  const registered = knowledgeBaseSections.find((item) => item.id === subsection)
  if (!registered) return <FutureConnection title="База знаний" backTo="home/knowledge-base" />

  const staticRows =
    subsection === "classes"
      ? classReference.map((entry) => ({
          id: entry.id,
          title: entry.name,
          meta: `${entry.subclasses.length} подклассов`,
          art: `/ui-v1/classes/${entry.id}.webp`,
        }))
      : subsection === "invocations"
        ? warlockInvocationsReference.map((entry, index) => ({
            id: `${entry.level}:${entry.name}:${index}`,
            title: entry.name.replace(/^Воззвание:\s*/, ""),
            meta: `${entry.level} уровень`,
          }))
        : null

  if (registered.state === "placeholder") {
    return <FutureConnection title={registered.title} backTo="home/knowledge-base" />
  }

  return (
    <main className="u1-section-page">
      <SectionHeader title={registered.title} backTo="home/knowledge-base" />
      <label className="u1-catalog-search">
        <span>Поиск</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти…"
        />
      </label>

      {subsection === "classes" && staticRows ? (
        <ClassCatalogPanels rows={staticRows} query={query} />
      ) : staticRows ? (
        <CatalogRows rows={staticRows} query={query} />
      ) : catalog.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : catalog.error ? (
        <EmptyState>Каталог временно недоступен.</EmptyState>
      ) : (
        <CatalogRows rows={catalog.rows} query={query} />
      )}
    </main>
  )
}

function AchievementTile({ item }: { item: AchievementPreview }) {
  return (
    <article
      className="u1-achievement-tile"
      data-future-action="achievement-detail"
    >
      <span className="u1-achievement-tile__texture" aria-hidden="true" />
      <strong>{item.title}</strong>
    </article>
  )
}

export function AchievementsScreen() {
  const achievements = useUiV1Achievements()

  return (
    <main className="u1-section-page">
      <SectionHeader title="Достижения" backTo="home" />
      {achievements.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : achievements.error ? (
        <EmptyState>Достижения временно недоступны.</EmptyState>
      ) : achievements.items.length ? (
        <section className="u1-achievement-list" aria-label="Достижения кампании">
          {achievements.items.map((item) => (
            <AchievementTile key={item.id} item={item} />
          ))}
        </section>
      ) : (
        <EmptyState>Достижений пока нет.</EmptyState>
      )}
    </main>
  )
}

function newsDay(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
}

function newsTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function SocietyNewsScreen() {
  const news = useUiV1SocietyNews()
  const [composerOpen, setComposerOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [composerError, setComposerError] = useState("")

  const grouped = useMemo(() => {
    const result: Array<{ day: string; items: typeof news.items }> = []
    for (const item of news.items) {
      const day = newsDay(item.published_at)
      const current = result[result.length - 1]
      if (current?.day === day) current.items.push(item)
      else result.push({ day, items: [item] })
    }
    return result
  }, [news.items])

  async function publish() {
    const cleanTitle = title.trim()
    const cleanBody = body.trim()
    if (!cleanTitle || !cleanBody) {
      setComposerError("Нужны заголовок и текст.")
      return
    }

    setSaving(true)
    setComposerError("")
    const result = await news.publish(cleanTitle, cleanBody)
    setSaving(false)

    if (!result.ok) {
      setComposerError(result.error || "Не удалось опубликовать.")
      return
    }

    setTitle("")
    setBody("")
    setComposerOpen(false)
  }

  return (
    <main className="u1-section-page">
      <SectionHeader
        title="Новости общества"
        backTo="home"
        action={news.canManage ? (
          <button
            type="button"
            className="u1-section-add"
            aria-label="Новая публикация"
            onClick={() => setComposerOpen(true)}
          >
            +
          </button>
        ) : null}
      />

      {news.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : news.error ? (
        <EmptyState>Новости временно недоступны.</EmptyState>
      ) : grouped.length ? (
        <section className="u1-news-timeline" aria-label="Новости общества">
          {grouped.map((group) => (
            <div className="u1-news-day" key={group.day}>
              <div className="u1-news-day__label">{group.day}</div>
              <div className="u1-news-day__items">
                {group.items.map((item) => (
                  <article className="u1-news-entry" key={item.id}>
                    <time>{newsTime(item.published_at)}</time>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <EmptyState>Публикаций пока нет.</EmptyState>
      )}

      {composerOpen && news.canManage && (
        <div className="u1-composer-backdrop" onMouseDown={() => setComposerOpen(false)}>
          <section
            className="u1-composer"
            role="dialog"
            aria-modal="true"
            aria-label="Новая публикация"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <strong>Новая публикация</strong>
              <button type="button" onClick={() => setComposerOpen(false)} aria-label="Закрыть">×</button>
            </header>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Заголовок"
              maxLength={160}
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Текст новости"
              rows={8}
            />
            {composerError && <p className="u1-composer__error">{composerError}</p>}
            <button
              type="button"
              className="u1-composer__publish"
              disabled={saving}
              onClick={() => void publish()}
            >
              {saving ? "Публикую…" : "Опубликовать"}
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
