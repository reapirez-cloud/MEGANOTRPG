import type { ChatRoom } from "../types/chat"

export type ChatRoomStatusTone = "live" | "limited" | "archived" | "neutral"

export type ChatRoomStatus = {
  label: string
  tone: ChatRoomStatusTone
}

const dayPeriodLabels: Record<ChatRoom["day_period"], string> = {
  dawn: "рассвет",
  morning: "утро",
  day: "день",
  late_day: "после полудня",
  evening: "вечер",
  night: "ночь",
  deep_night: "глубокая ночь",
}

function validDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function activitySource(room: ChatRoom) {
  return room.last_message_at || room.updated_at || room.created_at
}

export function roomStatus(room: ChatRoom): ChatRoomStatus {
  if (room.room_type === "character") {
    if (room.character_life_state === "dead") {
      return { label: "История завершена", tone: "archived" }
    }
    if (room.is_read_only) {
      return { label: "Только чтение", tone: "limited" }
    }
    return { label: "Активная история", tone: "live" }
  }

  if (room.room_type === "scene") {
    if (room.scene_state === "closed" || room.room_state === "closed") {
      return { label: "Событие завершено", tone: "archived" }
    }
    if (room.room_state === "gm_only") {
      return { label: "Только ГМ пишет", tone: "limited" }
    }
    if (room.open_to_campaign && room.campaign_can_write) {
      return { label: "Открыто кампании", tone: "live" }
    }
    if (room.open_to_campaign) {
      return { label: "Кампания читает", tone: "limited" }
    }
    return { label: "По участникам", tone: "neutral" }
  }

  return { label: "Общий чат", tone: "live" }
}

export function roomContextParts(room: ChatRoom) {
  const parts: string[] = []
  if (room.context_location_name) parts.push(room.context_location_name)
  if (room.context_campaign_day !== null) parts.push("День " + room.context_campaign_day)
  if (room.context_day_period) parts.push(dayPeriodLabels[room.context_day_period])
  return parts
}

export function formatRoomActivity(room: ChatRoom) {
  const date = validDate(activitySource(room))
  if (!date) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function formatRoomActivityDate(room: ChatRoom) {
  const date = validDate(activitySource(room))
  if (!date) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(date)
}

export function formatRoomCompletion(room: ChatRoom) {
  const exact =
    room.room_type === "character"
      ? room.character_died_at
      : room.room_type === "scene"
        ? room.closed_at
        : null

  const exactDate = validDate(exact)
  if (exactDate) {
    const date = new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(exactDate)
    return "Завершено " + date
  }

  const fallbackDate = validDate(activitySource(room))
  if (!fallbackDate) return "Завершено"
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(fallbackDate)
  return "Последняя активность " + date
}
