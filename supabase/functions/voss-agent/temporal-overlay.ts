type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function nullableNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function gameTimeFromEvent(event: JsonRecord | undefined) {
  const payload = record(event?.payload)
  return {
    campaignDay:
      nullableNumber(payload.effective_game_day) ??
      nullableNumber(payload.campaign_day),
    dayPeriod: nullableString(payload.day_period),
    sourceLocationId:
      nullableString(event?.location_id) ||
      nullableString(payload.location_snapshot),
  }
}

export function eventVisibleAtGameDay(
  event: JsonRecord | undefined,
  currentDay: number | null,
) {
  if (currentDay === null) return true
  const eventDay = gameTimeFromEvent(event).campaignDay
  return eventDay === null || eventDay <= currentDay
}

export function withGameAge(
  item: JsonRecord,
  event: JsonRecord | undefined,
  currentDay: number | null,
) {
  const time = gameTimeFromEvent(event)
  return {
    ...item,
    campaign_day: time.campaignDay,
    day_period: time.dayPeriod,
    game_age_days:
      currentDay !== null &&
        time.campaignDay !== null &&
        time.campaignDay <= currentDay
        ? currentDay - time.campaignDay
        : null,
    source_location_id: time.sourceLocationId,
  }
}

export function snapshotTemporalOverlay(snapshot: unknown): JsonRecord {
  const snap = record(snapshot)
  const state = record(snap.state)
  return record(state.temporal_overlay)
}

export function applyLocationTemporalOverlay(
  location: JsonRecord | null,
  snapshot: unknown,
): JsonRecord | null {
  if (!location) return null
  const snap = record(snapshot)
  const overlay = snapshotTemporalOverlay(snap)
  const lifecycle =
    nullableString(overlay.lifecycle_state) ||
    nullableString(location.lifecycle_state)

  return {
    ...location,
    base_lifecycle_state: location.lifecycle_state ?? null,
    lifecycle_state: lifecycle,
    temporal_status: nullableString(overlay.status),
    background_snapshot: snap.id ? snap : null,
    temporal_overlay: overlay,
  }
}

export function effectiveNpcTemporalState(
  character: JsonRecord,
  canonicalLocationId: string | null,
  snapshot: unknown,
) {
  const snap = record(snapshot)
  const overlay = snapshotTemporalOverlay(snap)
  const hasLocationOverride =
    Object.prototype.hasOwnProperty.call(overlay, "location_id")

  return {
    lifeState:
      nullableString(overlay.life_state) ||
      nullableString(character.life_state) ||
      "alive",
    locationId: hasLocationOverride
      ? nullableString(overlay.location_id)
      : canonicalLocationId,
    status: nullableString(overlay.status),
    snapshot: snap.id ? snap : null,
    overlay,
  }
}
