const SCALE_RANK: Record<string, number> = {
  world: 0,
  region: 1,
  settlement: 2,
  district: 3,
  site: 4,
  building: 5,
  room: 6,
  detail: 7,
}

/** A route between peers must not turn the departure place into a parent. */
export function canContainLocation(parentScale: string, targetScale: string) {
  const parent = SCALE_RANK[parentScale] ?? SCALE_RANK.site
  const target = SCALE_RANK[targetScale]
  if (target === undefined) return true // The cascade RPC validates the scale.
  return parent < target || (parent === target && target > SCALE_RANK.district)
}

/** New topology is bounded to the few named places needed to orient play. */
export function cascadeChildLimit(archetype: string) {
  if (archetype === "road") return 1
  if (["city", "town", "region", "world", "port"].includes(archetype)) return 4
  if (["forest", "wilderness", "village"].includes(archetype)) return 2
  return 3
}
