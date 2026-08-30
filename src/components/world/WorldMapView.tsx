import { useMemo } from "react"

import CampaignImage from "../common/CampaignImage"
import type { LocationEntry, LocationLink, LocationSection } from "../../types/world"
import "../../world-map.css"

type Connection = {
  target: LocationEntry
  label: string
  kind: "link" | "child"
}

type Props = {
  locations: LocationEntry[]
  sections: LocationSection[]
  links: LocationLink[]
  currentLocationId?: string | null
  canManage: boolean
  onOpen: (location: LocationEntry) => void
}

export default function WorldMapView({
  locations,
  sections,
  links,
  currentLocationId = null,
  canManage,
  onOpen,
}: Props) {
  const activeLocations = useMemo(
    () => locations.filter((location) => location.lifecycle_state === "active"),
    [locations],
  )
  const locationById = useMemo(
    () => new Map(activeLocations.map((location) => [location.id, location])),
    [activeLocations],
  )
  const sectionLocation = useMemo(
    () => new Map(sections.map((section) => [section.id, section.location_id])),
    [sections],
  )
  const connections = useMemo(() => {
    const result = new Map<string, Connection[]>()
    const seen = new Set<string>()

    const add = (sourceId: string, connection: Connection) => {
      if (!locationById.has(sourceId)) return
      const key = `${sourceId}:${connection.target.id}`
      if (seen.has(key)) return
      seen.add(key)
      const current = result.get(sourceId) || []
      current.push(connection)
      result.set(sourceId, current)
    }

    for (const link of links) {
      const sourceId = sectionLocation.get(link.section_id)
      const target = locationById.get(link.target_location_id)
      if (!sourceId || !target) continue
      add(sourceId, { target, label: link.label || "Переход", kind: "link" })
    }

    for (const child of activeLocations) {
      if (!child.parent_location_id) continue
      const parent = locationById.get(child.parent_location_id)
      if (!parent) continue
      add(parent.id, { target: child, label: "Подзона", kind: "child" })
    }

    for (const list of result.values()) {
      list.sort((left, right) => left.target.name.localeCompare(right.target.name, "ru"))
    }
    return result
  }, [activeLocations, links, locationById, sectionLocation])

  const orderedLocations = useMemo(() => {
    const depthCache = new Map<string, number>()
    const depthOf = (location: LocationEntry): number => {
      const cached = depthCache.get(location.id)
      if (cached !== undefined) return cached
      const parent = location.parent_location_id ? locationById.get(location.parent_location_id) : null
      const depth = parent ? Math.min(5, depthOf(parent) + 1) : 0
      depthCache.set(location.id, depth)
      return depth
    }
    return [...activeLocations].sort((left, right) => {
      const depthDiff = depthOf(left) - depthOf(right)
      if (depthDiff) return depthDiff
      return left.name.localeCompare(right.name, "ru")
    }).map((location) => ({ location, depth: depthOf(location) }))
  }, [activeLocations, locationById])

  if (!orderedLocations.length) {
    return <div className="world-map-empty"><span>⌁</span><strong>Карта пока пустая</strong><p>{canManage ? "Создай зоны и переходы — связи появятся здесь автоматически." : "Открытые тебе локации появятся здесь."}</p></div>
  }

  return <section className="world-map-view" aria-label="Карта связей мира">
    <header className="world-map-intro"><div><small>Навигация</small><h3>Карта переходов</h3><p>Смотри откуда и куда можно перейти. Тап по локации или стрелке открывает её ЛОР.</p></div><span>{orderedLocations.length}</span></header>

    <div className="world-map-board">
      {orderedLocations.map(({ location, depth }) => {
        const routes = connections.get(location.id) || []
        const isCurrent = currentLocationId === location.id
        return <article className={`world-map-node ${isCurrent ? "is-current" : ""}`} key={location.id} style={{ "--map-depth": depth } as React.CSSProperties}>
          <button className="world-map-card" type="button" onClick={() => onOpen(location)}>
            {location.image_url ? <CampaignImage className="world-map-card__image" value={location.image_url} alt=""/> : <span className="world-map-card__mark" aria-hidden="true">◇</span>}
            <span className="world-map-card__copy"><small>{isCurrent ? "Сейчас здесь" : location.parent_location_id ? "Подзона" : "Локация"}</small><strong>{location.name}</strong>{location.summary && <p>{location.summary}</p>}</span>
            {canManage && location.visibility_mode === "private" && <span className="world-map-private">Только я</span>}
          </button>

          <div className="world-map-routes" aria-label={`Переходы из ${location.name}`}>
            {routes.length ? routes.map((route) => <button className={`world-map-route world-map-route--${route.kind}`} type="button" key={`${location.id}:${route.target.id}`} onClick={() => onOpen(route.target)}><span className="world-map-route__arrow">→</span><span><small>{route.label}</small><strong>{route.target.name}</strong></span></button>) : <span className="world-map-deadend">Нет прямых переходов</span>}
          </div>
        </article>
      })}
    </div>
  </section>
}
