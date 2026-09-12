import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"

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
  onLongPress,
}: {
  item: UiV1Location
  mode: TileMode
  onNavigate: () => void
  onOpen: () => void
  onLongPress: () => void
}) {
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const longPressedRef = useRef(false)

  function clearLongPress() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return

    longPressedRef.current = false
    startRef.current = { x: event.clientX, y: event.clientY }
    clearLongPress()
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true
      onLongPress()
    }, 520)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const start = startRef.current
    if (!start) return

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (distance > 10) clearLongPress()
  }

  function handlePointerEnd() {
    clearLongPress()
    startRef.current = null
  }

  function handleClick() {
    if (longPressedRef.current) {
      longPressedRef.current = false
      return
    }
    onNavigate()
  }

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
      onContextMenu={(event) => {
        event.preventDefault()
        onLongPress()
      }}
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onClick={handleClick}
      >
        <strong>{item.name}</strong>
      </button>

      <button
        type="button"
        className="u1-location-open-button"
        aria-label={`Открыть зону: ${item.name}`}
        onClick={onOpen}
      >
        <span className="u1-location-open-button__glyph" aria-hidden="true">↗</span>
      </button>
    </motion.article>
  )
}

type LocationAction = {
  id: string
  label: string
  managerOnly?: boolean
  danger?: boolean
  placeholderTitle?: string
  run?: () => void
}

function InlineFeaturePlaceholder({
  title,
  onBack,
}: {
  title: string
  onBack: () => void
}) {
  return (
    <motion.div
      className="u1-location-inline-placeholder"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 3 }}
    >
      <strong>{title}</strong>
      <span>Интерфейс этой функции будет спроектирован отдельным этапом.</span>
      <button type="button" onClick={onBack}>← К действиям</button>
    </motion.div>
  )
}

function LocationInlineMenu({
  location,
  canManage,
  placeholderTitle,
  onOpen,
  onPlaceholder,
  onBack,
}: {
  location: UiV1Location
  canManage: boolean
  placeholderTitle: string | null
  onOpen: () => void
  onPlaceholder: (title: string) => void
  onBack: () => void
}) {
  const actions: LocationAction[] = [
    { id: "open", label: "Открыть зону", run: onOpen },
    { id: "add-child", label: "Добавить подзону", managerOnly: true, placeholderTitle: "Добавление подзоны" },
    { id: "add-transition", label: "Добавить переход", managerOnly: true, placeholderTitle: "Добавление перехода" },
    { id: "edit", label: "Редактировать", managerOnly: true, placeholderTitle: "Редактирование зоны" },
    { id: "delete", label: "Удалить", managerOnly: true, danger: true, placeholderTitle: "Удаление зоны" },
  ]

  return (
    <motion.div
      className="u1-location-inline-menu"
      role="group"
      aria-label={`Действия с зоной: ${location.name}`}
      initial={{ height: 0, opacity: 0, y: -6 }}
      animate={{ height: "auto", opacity: 1, y: 0 }}
      exit={{ height: 0, opacity: 0, y: -6 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {placeholderTitle ? (
          <InlineFeaturePlaceholder
            key={placeholderTitle}
            title={placeholderTitle}
            onBack={onBack}
          />
        ) : (
          <motion.div
            key="actions"
            className="u1-location-inline-menu__actions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {actions
              .filter((action) => !action.managerOnly || canManage)
              .map((action, index) => (
                <motion.button
                  type="button"
                  key={action.id}
                  data-danger={action.danger || undefined}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.025, duration: 0.16 }}
                  onClick={() => {
                    if (action.run) {
                      action.run()
                      return
                    }
                    if (action.placeholderTitle) {
                      onPlaceholder(action.placeholderTitle)
                    }
                  }}
                >
                  {action.label}
                </motion.button>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function LocationNode({
  item,
  mode,
  expanded,
  placeholderTitle,
  canManage,
  onNavigate,
  onOpen,
  onLongPress,
  onPlaceholder,
  onBack,
}: {
  item: UiV1Location
  mode: TileMode
  expanded: boolean
  placeholderTitle: string | null
  canManage: boolean
  onNavigate: () => void
  onOpen: () => void
  onLongPress: () => void
  onPlaceholder: (title: string) => void
  onBack: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!expanded) return

    const frame = window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [expanded])

  return (
    <motion.div
      ref={ref}
      layout
      className="u1-location-node"
      data-location-node-id={item.id}
      data-mode={mode}
      data-expanded={expanded || undefined}
    >
      <LocationTile
        item={item}
        mode={mode}
        onNavigate={onNavigate}
        onOpen={onOpen}
        onLongPress={onLongPress}
      />

      <AnimatePresence initial={false}>
        {expanded && (
          <LocationInlineMenu
            location={item}
            canManage={canManage}
            placeholderTitle={placeholderTitle}
            onOpen={onOpen}
            onPlaceholder={onPlaceholder}
            onBack={onBack}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function RootFeaturePlaceholder({
  title,
  onClose,
}: {
  title: string
  onClose: () => void
}) {
  return (
    <motion.section
      className="u1-location-root-placeholder"
      initial={{ opacity: 0, height: 0, y: -5 }}
      animate={{ opacity: 1, height: "auto", y: 0 }}
      exit={{ opacity: 0, height: 0, y: -5 }}
    >
      <strong>{title}</strong>
      <span>Интерфейс этой функции будет спроектирован отдельным этапом.</span>
      <button type="button" onClick={onClose}>Закрыть</button>
    </motion.section>
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
        <span>Карточка зоны подключена отдельным маршрутом. Полное наполнение спроектируем своим этапом.</span>
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
  const [actionTargetId, setActionTargetId] = useState<string | null>(null)
  const [inlinePlaceholder, setInlinePlaceholder] = useState<{
    locationId: string
    title: string
  } | null>(null)
  const [rootPlaceholder, setRootPlaceholder] = useState<string | null>(null)

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
        <EmptyState>Эта зона недоступна или больше не существует.</EmptyState>
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
    setActionTargetId(null)
    setInlinePlaceholder(null)
    navigate(`home/world/locations/${location.id}`)
  }

  function toggleActions(location: UiV1Location) {
    setRootPlaceholder(null)
    setInlinePlaceholder(null)
    setActionTargetId((current) => current === location.id ? null : location.id)
  }

  function renderNode(location: UiV1Location, mode: TileMode) {
    const expanded = actionTargetId === location.id
    const placeholderTitle =
      inlinePlaceholder?.locationId === location.id
        ? inlinePlaceholder.title
        : null

    return (
      <LocationNode
        key={location.id}
        item={location}
        mode={mode}
        expanded={expanded}
        placeholderTitle={placeholderTitle}
        canManage={world.canManage}
        onNavigate={() => navigateInto(location)}
        onOpen={() => openDetail(location)}
        onLongPress={() => toggleActions(location)}
        onPlaceholder={(title) => {
          setActionTargetId(location.id)
          setInlinePlaceholder({ locationId: location.id, title })
        }}
        onBack={() => setInlinePlaceholder(null)}
      />
    )
  }

  return (
    <main
      className="u1-section-page"
      onPointerDownCapture={(event) => {
        if (!actionTargetId) return
        const target = event.target as HTMLElement
        if (target.closest(`[data-location-node-id="${actionTargetId}"]`)) return
        setActionTargetId(null)
        setInlinePlaceholder(null)
      }}
    >
      <LocationHeader
        backTo={backTo}
        action={world.canManage ? (
          <button
            type="button"
            className="u1-section-add"
            aria-label="Добавить главную зону"
            onClick={() => {
              setActionTargetId(null)
              setInlinePlaceholder(null)
              setRootPlaceholder("Создание главной зоны")
            }}
          >
            +
          </button>
        ) : null}
      />

      <AnimatePresence initial={false}>
        {rootPlaceholder && (
          <RootFeaturePlaceholder
            title={rootPlaceholder}
            onClose={() => setRootPlaceholder(null)}
          />
        )}
      </AnimatePresence>

      <section
        className="u1-location-navigator"
        aria-label="Навигация по локациям"
        data-menu-open={Boolean(actionTargetId) || undefined}
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
                  <h2 id="u1-location-children">Подзоны</h2>
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
                          onClick={() => {
                            setActionTargetId(null)
                            setInlinePlaceholder(null)
                            navigate(`home/world/locations/${target.id}`)
                          }}
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
