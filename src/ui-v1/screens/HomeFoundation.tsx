import { useHomeRecentEvents } from "../hooks/useHomeRecentEvents"
import Pressable from "../primitives/Pressable"
import RecentEvents from "../components/RecentEvents"
import SectionPreview from "../components/SectionPreview"

type Props = {
  campaignId: string
  campaignTitle: string
  campaignCoverUrl?: string | null
  displayName: string
  onOpenWhatsNew: () => void
  onOpenWorld: () => void
  onOpenSocietyNews: () => void
  onOpenAchievements: () => void
  onOpenGallery: () => void
  onOpenUpdates: () => void
  onOpenWorkspace: () => void
}

export default function HomeFoundation({
  campaignId,
  campaignTitle,
  campaignCoverUrl,
  displayName,
  onOpenWhatsNew,
  onOpenWorld,
  onOpenSocietyNews,
  onOpenAchievements,
  onOpenGallery,
  onOpenUpdates,
  onOpenWorkspace,
}: Props) {
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "•"
  const recent = useHomeRecentEvents(campaignId)

  return (
    <main className="mg-home">
      <header className="mg-home__header">
        <div className="mg-home__identity">
          <span>Кампания</span>
          <h1>{campaignTitle || "MEGANOTRPG"}</h1>
        </div>
        <Pressable
          type="button"
          className="mg-personal-origin"
          aria-label="Открыть личное пространство"
          onClick={onOpenWorkspace}
        >
          {initial}
        </Pressable>
      </header>

      <section className="mg-home__welcome">
        <p>{displayName ? `С возвращением, ${displayName}` : "С возвращением"}</p>
        <h2>Что происходит?</h2>
      </section>

      <section className="mg-home__previews" aria-label="Разделы Главной">
        <SectionPreview
          title="Что нового"
          meta="Хроника кампании"
          size="hero"
          onClick={onOpenWhatsNew}
          className="mg-home__preview-whats-new"
        />

        <SectionPreview
          title="Мир"
          meta="Зоны · NPC · Лор · Карта"
          imageUrl={campaignCoverUrl}
          size="wide"
          onClick={onOpenWorld}
          className="mg-home__preview-world"
        />

        <div className="mg-home__preview-pair">
          <SectionPreview
            title="Новости общества"
            meta="Важное для всех"
            onClick={onOpenSocietyNews}
            className="mg-home__preview-news"
          />
          <SectionPreview
            title="Достижения"
            meta="Что уже сделано"
            onClick={onOpenAchievements}
            className="mg-home__preview-achievements"
          />
        </div>

        <div className="mg-home__preview-pair">
          <SectionPreview
            title="Арты"
            meta="Галерея кампании"
            onClick={onOpenGallery}
            className="mg-home__preview-art"
          />
          <SectionPreview
            title="Обновления"
            meta="Изменения приложения"
            onClick={onOpenUpdates}
            className="mg-home__preview-updates"
          />
        </div>
      </section>

      <RecentEvents
        items={recent.items}
        loading={recent.loading}
        onOpen={onOpenWhatsNew}
      />
    </main>
  )
}
