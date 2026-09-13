import { AnimatePresence, motion } from "motion/react"
import { useMemo } from "react"

import type { SnakeAction, SnakeEntityRef } from "../snake-engine"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import {
  createLocationCreateAction,
  createLocationSnakeActions,
  createLocationTransitionActions,
} from "./locationSnakeActions"
import { openSourceAction } from "./GMWorkshopCommon"
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

function LocationDetailConnection({
  location,
  sections,
}: {
  location: UiV1Location
  sections: Array<{ id: string; title: string; body: string }>
}) {
  const hasText = Boolean(
    location.summary.trim() ||
    location.description.trim() ||
    sections.some((section) => section.title.trim() || section.body.trim()),
  )

  return (
    <main className="u1-section-page">
      <header className="u1-section-head">
        <button
          type="button"
          className="u1-section-head__back"
          onClick={() => {
            if (window.history.length > 1) window.history.back()
            else navigate(`home/world/locations/${location.id}`)
          }}
          aria-label="Назад"
        >
          ←
        </button>
        <h1>{location.name}</h1>
        <span className="u1-section-head__action" />
      </header>

      <article className="u1-entity-detail">
        {location.display_image_url && (
          <div className="u1-entity-detail__hero">
            <img
              src={location.display_image_url}
              alt=""
              draggable={false}
            />
            <span aria-hidden="true" />
          </div>
        )}

        <div className="u1-entity-detail__copy">
          {location.summary.trim() && (
            <p className="u1-entity-detail__lead">{location.summary}</p>
          )}

          {location.description.trim() && (
            <p className="u1-entity-detail__body">{location.description}</p>
          )}

          {sections.map((section) => (
            <section className="u1-entity-detail__section" key={section.id}>
              {section.title.trim() && <h2>{section.title}</h2>}
              {section.body.trim() && <p>{section.body}</p>}
            </section>
          ))}

          {!hasText && (
            <p className="u1-entity-detail__empty">Описание пока не добавлено.</p>
          )}
        </div>
      </article>
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
    return (
      <LocationDetailConnection
        location={selected}
        sections={world.sections.filter((section) => section.location_id === selected.id)}
      />
    )
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
      locations: world.locations,
      canManage: world.canManage,
      operations: world,
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
            onClick={() => {
              const action = createLocationCreateAction({
                parentLocationId: null,
                title: "Новая главная локация",
                operations: world,
              })
              openSourceAction(
                snake,
                { type: "location-root", id: world.campaignId },
                action,
              )
            }}
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

                      const actions = createLocationTransitionActions({
                        link: transition,
                        target,
                        locations: world.locations,
                        canManage: world.canManage,
                        operations: world,
                        onOpen: () => navigate(`home/world/locations/${target.id}`),
                      })

                      return (
                        <SnakeTrigger
                          key={transition.id}
                          entity={{ type: "location-transition", id: transition.id }}
                          actions={actions}
                        >
                          <button
                            type="button"
                            className="u1-location-transition"
                            onClick={() => navigate(`home/world/locations/${target.id}`)}
                          >
                            <span aria-hidden="true">→</span>
                            <span>
                              <small>{transition.label.trim() || "Переход"}</small>
                              <strong>{target.name}</strong>
                            </span>
                          </button>
                        </SnakeTrigger>
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
