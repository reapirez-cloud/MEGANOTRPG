import type { ChatRoom } from "../types/chat"

export type ChatCatalogModel = {
  flood: ChatRoom | null
  currentStory: ChatRoom | null
  personalActive: ChatRoom[]
  eventsActive: ChatRoom[]
  completed: ChatRoom[]
}

function timestamp(value: string | null | undefined) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function isChatRoomClosed(room: ChatRoom) {
  if (room.room_type === "character") {
    return room.character_life_state === "dead" || room.room_state === "closed"
  }
  if (room.room_type === "scene") {
    return room.scene_state === "closed" || room.room_state === "closed"
  }
  return false
}

export function chatRoomActivityTimestamp(room: ChatRoom) {
  return (
    timestamp(room.last_message_at) ||
    timestamp(room.updated_at) ||
    timestamp(room.created_at)
  )
}

export function chatRoomCompletionTimestamp(room: ChatRoom) {
  if (room.room_type === "character") {
    return timestamp(room.character_died_at) || chatRoomActivityTimestamp(room)
  }
  if (room.room_type === "scene") {
    return timestamp(room.closed_at) || chatRoomActivityTimestamp(room)
  }
  return chatRoomActivityTimestamp(room)
}

function byActivityDesc(a: ChatRoom, b: ChatRoom) {
  const activityDiff = chatRoomActivityTimestamp(b) - chatRoomActivityTimestamp(a)
  if (activityDiff !== 0) return activityDiff
  const positionDiff = a.position - b.position
  if (positionDiff !== 0) return positionDiff
  return a.id.localeCompare(b.id)
}

function byCompletionDesc(a: ChatRoom, b: ChatRoom) {
  const completionDiff = chatRoomCompletionTimestamp(b) - chatRoomCompletionTimestamp(a)
  if (completionDiff !== 0) return completionDiff
  return byActivityDesc(a, b)
}

export function buildChatCatalogModel(rooms: ChatRoom[]): ChatCatalogModel {
  const flood = rooms.find((room) => room.room_type === "flood") ?? null

  const personalActive = rooms
    .filter((room) => room.room_type === "character" && !isChatRoomClosed(room))
    .sort(byActivityDesc)

  const eventsActive = rooms
    .filter((room) => room.room_type === "scene" && !isChatRoomClosed(room))
    .sort(byActivityDesc)

  const completed = rooms
    .filter(
      (room) =>
        (room.room_type === "character" || room.room_type === "scene") &&
        isChatRoomClosed(room),
    )
    .sort(byCompletionDesc)

  const currentStory =
    [...personalActive, ...eventsActive].sort(byActivityDesc)[0] ?? null

  return {
    flood,
    currentStory,
    personalActive,
    eventsActive,
    completed,
  }
}
