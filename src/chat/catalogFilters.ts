import type { ChatRoom } from "../types/chat"

export type ChatCatalogFilter =
  | "all"
  | "personal"
  | "events"
  | "flood"
  | "completed"
  | "unread"

export type ChatCatalogSection =
  | "personal"
  | "events"
  | "flood"
  | "completed"

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU")
}

export function chatCatalogSectionVisible(
  filter: ChatCatalogFilter,
  section: ChatCatalogSection,
) {
  return filter === "all" || filter === "unread" || filter === section
}

export function matchesChatCatalogSearch(
  room: ChatRoom,
  query: string,
  extraText = "",
) {
  const needle = normalize(query)
  if (!needle) return true

  const haystack = normalize([
    room.title,
    room.preview,
    room.context_location_name || "",
    room.room_type,
    extraText,
  ].join(" "))

  return haystack.includes(needle)
}

export function filterChatCatalogRooms({
  rooms,
  query,
  filter,
  section,
  extraText,
}: {
  rooms: ChatRoom[]
  query: string
  filter: ChatCatalogFilter
  section: ChatCatalogSection
  extraText?: (room: ChatRoom) => string
}) {
  if (!chatCatalogSectionVisible(filter, section)) return []

  return rooms.filter((room) => {
    if (filter === "unread" && room.unread_count <= 0) return false
    return matchesChatCatalogSearch(room, query, extraText?.(room) || "")
  })
}
