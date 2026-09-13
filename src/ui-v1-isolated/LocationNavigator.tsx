import { AnimatePresence, motion } from "motion/react"
import { useMemo } from "react"

import type { SnakeAction, SnakeEntityRef } from "../snake-engine"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import { createLocationSnakeActions } from "./locationSnakeActions"
import {
  useUiV1Locations,
  type UiV1Location,
} from "./useUiV1Locations"

function navigate(path: string) {
  window.location.hash = `#/${path}`
}

function LocationHeader({
  backTo,
  action,
}: {
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
      <h1>Локации</h1>
      <span className="u1-section-head__action">{action}</span>
    </header>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="u1-section-empty">{children}</div>
}

type TileMode = "root" | "path" | "child"

function LocationTile({
  item,
  mode,
  onNavigate,
  onOpen,
}: {
  item: UiV1Location
  mode: TileMode
  onNavigate: () => void
  onOpen: () => void
}) {
  return (
    <motion.article
      layout
      layoutId={`ui-v1-location:${item.id}`}
      className="u1-location-tile"
      data-mode={mode}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 7, scale: 0.985 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {item.display_image_url ? (
        <img
          className="u1-location-tile__image"
          src={item.display_image_url}
          alt=""
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        />
      ) : (
        <span className="u1-location-tile__texture" aria-hidden="true" />
      )}
      <span className="u1-location-tile__scrim" aria-hidden="true" />

      <button
        type="button"
        className="u1-location-tile__main"
        onClick={onNavigate}
      >
        <strong>{item.name}</strong>
      </button>

      <button
        type="button"
        className="u1-location-open-button"
        aria-label={`Открыть локацию: ${item.name}`}
        onClick={onOpen}
      >
        <span className="u1-location-open-button__glyph" aria-hidden="true">↗</span>
      </button>
    </motion.article>
  )
}

function LocationNode({
  item,
  mode,
  actions,
  onNavigate,
  onOpen,
}: {
  item: UiV1Location
  mode: TileMode
  actions: SnakeAction[]
  onNavigate: () => void
  onOpen: () => void
}) {
  const entity: SnakeEntityRef = {
    type: "location",
    id: item.id,
  }

  return (
    <motion.div
      layout
      className="u1-location-node"
      data-location-node-id={item.id}
      data-mode={mode}
    >
      <SnakeTrigger entity={entity} actions={actions}>
        <LocationTile
          item={item}
          mode={mode}
          onNavigate={onNavigate}
          onOpen={onOpen}
        />
      </SnakeTrigger>
    </motion.div>
  )
}

function LocationDetailConnection({ location }: { location: UiV1Location }) {
  return (
    <main className="u1-section-page">
      <header className="u1-section-head">
        <button
          type="button"
          className="u1-section-head__back"
          onClick={() => navigate(`home/world/locations/${location.id}`)}
          aria-label="Назад"
        >
          ←
        </button>
        <h1>{location.name}</h1>
        <span className="u1-section-head__action" />
      </header>

      <section className="u1-location-detail-seam">
        {location.display_image_url && <img src={location.display_image_url} alt="" draggable={false} />}
        {location.summary && <p>{location.summary}</p>}
        <span>Карточка локации подключена отдельным маршрутом. Полное наполнение спроектируем своим этапом.</span>
      </section>
    </main>
  )
}

export function LocationNavigator({
  selectedLocationId,
  detail = false,
}: {
  selectedLocationId?: string
  detail?: boolean
}) {
  const world = useUiV1Locations()
  const snake = useSnake()

  const locationById = useMemo(
    () => new Map(world.locations.map((location) => [location.id, location])),
    [world.locations],
  )

  const roots = useMemo(
    () =>
      world.locations.filter(
        (location) =>
          !location.parent_location_id ||
          !locationById.has(location.parent_location_id),
      ),
    [locationById, world.locations],
  )

  const selected = selectedLocationId
    ? locationById.get(selectedLocationId) || null
    : null

  const path = useMemo(() => {
    if (!selected) return []

    const reversed: UiV1Location[] = []
    const visited = new Set<string>()
    let current: UiV1Location | undefined = selected

    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      reversed.push(current)
      current = current.parent_location_id
        ? locationById.get(current.parent_location_id)
        : undefined
    }

    return reversed.reverse()
  }, [locationById, selected])

  const children = useMemo(
    () =>
      selected
        ? world.locations.filter((location) => location.parent_location_id === selected.id)
        : [],
    [selected, world.locations],
  )

  const transitions = useMemo(
    () =>
      selected
        ? world.links.filter((link) => link.source_location_id === selected.id)
        : [],
    [selected, world.links],
  )

  const selectedParent = selected?.parent_location_id
    ? locationById.get(selected.parent_location_id) || null
    : null

  if (world.loading) {
    return (
      <main className="u1-section-page">
        <LocationHeader backTo="home/world" />
        <EmptyState>Загрузка…</EmptyState>
      </main>
    )
  }

  if (world.error) {
    return (
      <main className="u1-section-page">
        <LocationHeader backTo="home/world" />
        <EmptyState>Локации временно недоступны.</EmptyState>
      </main>
    )
  }

  if (selectedLocationId && !selected) {
    return (
      <main className="u1-section-page">
        <LocationHeader backTo="home/world/locations" />
        <EmptyState>Эта локация недоступна или больше не существует.</EmptyState>
      </main>
    )
  }

  if (selected && detail) {
    return <LocationDetailConnection location={selected} />
  }

  const backTo = selected
    ? selectedParent
      ? `home/world/locations/${selectedParent.id}`
      : "home/world/locations"
    : "home/world"

  function openDetail(location: UiV1Location) {
    navigate(`home/world/locations/${location.id}/detail`)
  }

  function navigateInto(location: UiV1Location) {
    if (location.id === selected?.id) return
    navigate(`home/world/locations/${location.id}`)
  }

  function renderNode(location: UiV1Location, mode: TileMode) {
    const actions = createLocationSnakeActions({
      location,
      canManage: world.canManage,
      onOpen: () => openDetail(location),
    })

    return (
      <LocationNode
        key={location.id}
        item={location}
        mode={mode}
        actions={actions}
        onNavigate={() => navigateInto(location)}
        onOpen={() => openDetail(location)}
      />
    )
  }

  return (
    <main className="u1-section-page">
      <LocationHeader
        backTo={backTo}
        action={world.canManage ? (
          <button
            type="button"
            className="u1-section-add"
            aria-label="Добавить главную локацию"
            onClick={() =>
              snake.openSurface({
                kind: "placeholder",
                eyebrow: "Локация",
                title: "Создание главной локации",
                body: "Интерфейс этой функции будет спроектирован отдельным этапом.",
              })
            }
          >
            +
          </button>
        ) : null}
      />

      <section
        className="u1-location-navigator"
        aria-label="Навигация по локациям"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {!selected ? (
            <motion.div
              className="u1-location-root-list"
              key="roots"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {roots.map((location) => renderNode(location, "root"))}
            </motion.div>
          ) : (
            <motion.div
              className="u1-location-context"
              key="context"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="u1-location-path">
                <AnimatePresence mode="popLayout" initial={false}>
                  {path.map((location) => renderNode(location, "path"))}
                </AnimatePresence>
              </div>

              {children.length > 0 && (
                <section className="u1-location-branch" aria-labelledby="u1-location-children">
                  <h2 id="u1-location-children">Вложенные локации</h2>
                  <div className="u1-location-child-list">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {children.map((location) => renderNode(location, "child"))}
                    </AnimatePresence>
                  </div>
                </section>
              )}

              {transitions.length > 0 && (
                <section className="u1-location-transitions" aria-labelledby="u1-location-transitions">
                  <h2 id="u1-location-transitions">Переходы</h2>
                  <div className="u1-location-transition-list">
                    {transitions.map((transition) => {
                      const target = locationById.get(transition.target_location_id)
                      if (!target) return null

                      return (
                        <button
                          type="button"
                          className="u1-location-transition"
                          key={transition.id}
                          onClick={() => navigate(`home/world/locations/${target.id}`)}
                        >
                          <span aria-hidden="true">→</span>
                          <span>
                            <small>{transition.label.trim() || "Переход"}</small>
                            <strong>{target.name}</strong>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!selected && roots.length === 0 && <EmptyState>Локаций пока нет.</EmptyState>}
      </section>
    </main>
  )
}
