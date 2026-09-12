type Props = {
  campaignTitle: string
  displayName: string
  onOpenWhatsNew: () => void
  onOpenWorld: () => void
  onOpenGallery: () => void
  onOpenWorkspace: () => void
}

export default function HomeFoundation({
  campaignTitle,
  displayName,
  onOpenWhatsNew,
  onOpenWorld,
  onOpenGallery,
  onOpenWorkspace,
}: Props) {
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "•"

  return (
    <main className="mg-home-foundation">
      <header className="mg-home-foundation__header">
        <div>
          <span className="mg-home-foundation__eyebrow">Кампания</span>
          <h1>{campaignTitle || "MEGANOTRPG"}</h1>
        </div>
        <button
          type="button"
          className="mg-personal-origin"
          aria-label="Открыть личное пространство"
          onClick={onOpenWorkspace}
        >
          {initial}
        </button>
      </header>

      <section className="mg-home-foundation__intro">
        <p>{displayName ? `С возвращением, ${displayName}.` : "С возвращением."}</p>
        <h2>Главная</h2>
      </section>

      <nav className="mg-home-foundation__routes" aria-label="Разделы Главной">
        <button type="button" onClick={onOpenWhatsNew}>
          <span>Что нового</span>
          <small>Хроника кампании</small>
        </button>
        <button type="button" onClick={onOpenWorld}>
          <span>Мир</span>
          <small>Зоны, NPC, лор и карта</small>
        </button>
        <button type="button" onClick={onOpenGallery}>
          <span>Арты</span>
          <small>Галерея кампании</small>
        </button>
      </nav>
    </main>
  )
}
