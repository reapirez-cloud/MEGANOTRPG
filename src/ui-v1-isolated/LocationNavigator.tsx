import { AnimatePresence, motion } from "motion/react"
import { useMemo, useRef, useState } from "react"

import type { VisibilityMode } from "../types/world"
import {
  useUiV1Locations,
  type UiV1Location,
  type UiV1LocationDraft,
  type UiV1LocationLink,
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
        <img className="u1-location-tile__image" src={item.display_image_url} alt="" />
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
  run: () => void
}

function LocationActionSheet({
  location,
  canManage,
  onClose,
  onOpen,
  onAddChild,
  onAddTransition,
  onEdit,
  onDelete,
}: {
  location: UiV1Location
  canManage: boolean
  onClose: () => void
  onOpen: () => void
  onAddChild: () => void
  onAddTransition: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const actions: LocationAction[] = [
    { id: "open", label: "Открыть зону", run: onOpen },
    { id: "add-child", label: "Добавить подзону", managerOnly: true, run: onAddChild },
    { id: "add-transition", label: "Добавить переход", managerOnly: true, run: onAddTransition },
    { id: "edit", label: "Редактировать", managerOnly: true, run: onEdit },
    { id: "delete", label: "Удалить", managerOnly: true, danger: true, run: onDelete },
  ]

  return (
    <motion.div
      className="u1-location-sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.section
        className="u1-location-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Действия с зоной: ${location.name}`}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <strong>{location.name}</strong>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="u1-location-action-sheet__list">
          {actions
            .filter((action) => !action.managerOnly || canManage)
            .map((action) => (
              <button
                type="button"
                key={action.id}
                data-danger={action.danger || undefined}
                onClick={() => {
                  onClose()
                  action.run()
                }}
              >
                {action.label}
              </button>
            ))}
        </div>
      </motion.section>
    </motion.div>
  )
}

function LocationEditorSheet({
  title,
  initial,
  onClose,
  onSave,
}: {
  title: string
  initial?: UiV1Location | null
  onClose: () => void
  onSave: (draft: UiV1LocationDraft) => Promise<{ ok: boolean; error?: string }>
}) {
  const [name, setName] = useState(initial?.name || "")
  const [summary, setSummary] = useState(initial?.summary || "")
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>(initial?.visibility_mode || "discover")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit() {
    if (!name.trim()) {
      setError("Нужно название зоны.")
      return
    }

    setSaving(true)
    setError("")
    const result = await onSave({
      name: name.trim(),
      summary: summary.trim(),
      visibilityMode,
    })
    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось сохранить.")
      return
    }

    onClose()
  }

  return (
    <motion.div
      className="u1-location-sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.section
        className="u1-location-form-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <strong>{title}</strong>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <label>
          <span>Название</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} />
        </label>

        <label>
          <span>Короткое описание</span>
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} />
        </label>

        <label>
          <span>Видимость</span>
          <select
            value={visibilityMode}
            onChange={(event) => setVisibilityMode(event.target.value as VisibilityMode)}
          >
            <option value="always">Всегда видно</option>
            <option value="discover">После открытия</option>
            <option value="private">Только мастеру</option>
          </select>
        </label>

        {error && <p className="u1-location-form-sheet__error">{error}</p>}

        <button
          type="button"
          className="u1-location-form-sheet__submit"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? "Сохраняю…" : "Сохранить"}
        </button>
      </motion.section>
    </motion.div>
  )
}

function TransitionEditorSheet({
  source,
  locations,
  links,
  onClose,
  onSave,
}: {
  source: UiV1Location
  locations: UiV1Location[]
  links: UiV1LocationLink[]
  onClose: () => void
  onSave: (
    targetLocationId: string,
    label: string,
    visibilityMode: VisibilityMode,
  ) => Promise<{ ok: boolean; error?: string }>
}) {
  const linkedTargets = new Set(
    links
      .filter((link) => link.source_location_id === source.id)
      .map((link) => link.target_location_id),
  )
  const targets = locations.filter(
    (location) => location.id !== source.id && !linkedTargets.has(location.id),
  )
  const [targetId, setTargetId] = useState(targets[0]?.id || "")
  const [label, setLabel] = useState("")
  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>("discover")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit() {
    if (!targetId) {
      setError("Нет доступной зоны для перехода.")
      return
    }

    setSaving(true)
    setError("")
    const result = await onSave(targetId, label, visibilityMode)
    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось добавить переход.")
      return
    }

    onClose()
  }

  return (
    <motion.div
      className="u1-location-sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.section
        className="u1-location-form-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Добавить переход"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <strong>Добавить переход</strong>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <label>
          <span>Куда</span>
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            {targets.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Название перехода</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Например: Тайный тоннель"
            maxLength={160}
          />
        </label>

        <label>
          <span>Видимость</span>
          <select
            value={visibilityMode}
            onChange={(event) => setVisibilityMode(event.target.value as VisibilityMode)}
          >
            <option value="always">Всегда видно</option>
            <option value="discover">После открытия</option>
            <option value="private">Только мастеру</option>
          </select>
        </label>

        {error && <p className="u1-location-form-sheet__error">{error}</p>}

        <button
          type="button"
          className="u1-location-form-sheet__submit"
          disabled={saving || !targets.length}
          onClick={() => void submit()}
        >
          {saving ? "Добавляю…" : "Добавить переход"}
        </button>
      </motion.section>
    </motion.div>
  )
}

function countDescendants(locations: UiV1Location[], locationId: string) {
  const childrenByParent = new Map<string, string[]>()
  for (const location of locations) {
    if (!location.parent_location_id) continue
    const list = childrenByParent.get(location.parent_location_id) || []
    list.push(location.id)
    childrenByParent.set(location.parent_location_id, list)
  }

  let count = 0
  const stack = [...(childrenByParent.get(locationId) || [])]
  const visited = new Set<string>()
  while (stack.length) {
    const id = stack.pop()
    if (!id || visited.has(id)) continue
    visited.add(id)
    count += 1
    stack.push(...(childrenByParent.get(id) || []))
  }
  return count
}

function DeleteLocationSheet({
  location,
  descendantCount,
  onClose,
  onConfirm,
}: {
  location: UiV1Location
  descendantCount: number
  onClose: () => void
  onConfirm: () => Promise<{ ok: boolean; error?: string }>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function confirm() {
    setSaving(true)
    setError("")
    const result = await onConfirm()
    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось удалить зону.")
      return
    }

    onClose()
  }

  return (
    <motion.div
      className="u1-location-sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.section
        className="u1-location-form-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Удалить зону"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <strong>Удалить «{location.name}»?</strong>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <p className="u1-location-delete-copy">
          Зона будет удалена окончательно.
          {descendantCount > 0
            ? ` Вместе с ней удалятся вложенные подзоны: ${descendantCount}.`
            : ""}
          {" "}Переходы, ведущие в удалённые зоны, тоже исчезнут.
        </p>

        {error && <p className="u1-location-form-sheet__error">{error}</p>}

        <button
          type="button"
          className="u1-location-form-sheet__submit"
          data-danger="true"
          disabled={saving}
          onClick={() => void confirm()}
        >
          {saving ? "Удаляю…" : "Удалить"}
        </button>
      </motion.section>
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
        {location.display_image_url && <img src={location.display_image_url} alt="" />}
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
  const [actionTarget, setActionTarget] = useState<UiV1Location | null>(null)
  const [editor, setEditor] = useState<{
    mode: "root" | "child" | "edit"
    target: UiV1Location | null
  } | null>(null)
  const [transitionSource, setTransitionSource] = useState<UiV1Location | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UiV1Location | null>(null)

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
    navigate(`home/world/locations/${location.id}`)
  }

  return (
    <main className="u1-section-page">
      <LocationHeader
        backTo={backTo}
        action={world.canManage ? (
          <button
            type="button"
            className="u1-section-add"
            aria-label="Добавить главную зону"
            onClick={() => setEditor({ mode: "root", target: null })}
          >
            +
          </button>
        ) : null}
      />

      <section className="u1-location-navigator" aria-label="Навигация по локациям">
        <AnimatePresence mode="popLayout" initial={false}>
          {!selected ? (
            <motion.div
              className="u1-location-root-list"
              key="roots"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {roots.map((location) => (
                <LocationTile
                  key={location.id}
                  item={location}
                  mode="root"
                  onNavigate={() => navigateInto(location)}
                  onOpen={() => openDetail(location)}
                  onLongPress={() => setActionTarget(location)}
                />
              ))}
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
                  {path.map((location) => (
                    <LocationTile
                      key={location.id}
                      item={location}
                      mode="path"
                      onNavigate={() => navigateInto(location)}
                      onOpen={() => openDetail(location)}
                      onLongPress={() => setActionTarget(location)}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {children.length > 0 && (
                <section className="u1-location-branch" aria-labelledby="u1-location-children">
                  <h2 id="u1-location-children">Подзоны</h2>
                  <div className="u1-location-child-list">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {children.map((location) => (
                        <LocationTile
                          key={location.id}
                          item={location}
                          mode="child"
                          onNavigate={() => navigateInto(location)}
                          onOpen={() => openDetail(location)}
                          onLongPress={() => setActionTarget(location)}
                        />
                      ))}
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

      <AnimatePresence>
        {actionTarget && (
          <LocationActionSheet
            location={actionTarget}
            canManage={world.canManage}
            onClose={() => setActionTarget(null)}
            onOpen={() => openDetail(actionTarget)}
            onAddChild={() => setEditor({ mode: "child", target: actionTarget })}
            onAddTransition={() => setTransitionSource(actionTarget)}
            onEdit={() => setEditor({ mode: "edit", target: actionTarget })}
            onDelete={() => setDeleteTarget(actionTarget)}
          />
        )}

        {editor && (
          <LocationEditorSheet
            key={`editor:${editor.mode}:${editor.target?.id || "root"}`}
            title={
              editor.mode === "root"
                ? "Новая главная зона"
                : editor.mode === "child"
                  ? `Подзона: ${editor.target?.name || ""}`
                  : `Редактировать: ${editor.target?.name || ""}`
            }
            initial={editor.mode === "edit" ? editor.target : null}
            onClose={() => setEditor(null)}
            onSave={(draft) =>
              editor.mode === "edit" && editor.target
                ? world.updateLocation(editor.target, draft)
                : world.createLocation(
                    editor.mode === "child" ? editor.target?.id || null : null,
                    draft,
                  )
            }
          />
        )}

        {transitionSource && (
          <TransitionEditorSheet
            key={`transition:${transitionSource.id}`}
            source={transitionSource}
            locations={world.locations}
            links={world.links}
            onClose={() => setTransitionSource(null)}
            onSave={(targetId, label, visibilityMode) =>
              world.createTransition(
                transitionSource.id,
                targetId,
                label,
                visibilityMode,
              )
            }
          />
        )}

        {deleteTarget && (
          <DeleteLocationSheet
            key={`delete:${deleteTarget.id}`}
            location={deleteTarget}
            descendantCount={countDescendants(world.locations, deleteTarget.id)}
            onClose={() => setDeleteTarget(null)}
            onConfirm={async () => {
              const parentId = deleteTarget.parent_location_id
              const result = await world.deleteLocation(deleteTarget.id)
              if (result.ok) {
                navigate(parentId ? `home/world/locations/${parentId}` : "home/world/locations")
              }
              return result
            }}
          />
        )}
      </AnimatePresence>
    </main>
  )
}
