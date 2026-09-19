import type { SnakeAction, SnakeSurfaceRequest } from "../snake-engine"
import type { ChatRoom } from "../types/chat"

function roomKind(room: ChatRoom) {
  if (room.room_type === "character") return "Личная история"
  if (room.room_type === "scene") return "Событие"
  return "Флуд"
}

export function chatRoomOpenSurface(room: ChatRoom): SnakeSurfaceRequest {
  return {
    kind: "placeholder",
    eyebrow: roomKind(room),
    title: room.title,
    body:
      "Внутренний игровой диалог подключается отдельным этапом. Комната и сообщения остаются без изменений.",
    size: { width: "compact", height: "content" },
  }
}

export function createChatRoomSnakeActions({
  room,
  details,
}: {
  room: ChatRoom
  details: string
}): SnakeAction[] {
  return [
    {
      id: "open",
      label: "Открыть",
      group: "primary",
      surface: chatRoomOpenSurface(room),
    },
    {
      id: "details",
      label: "Сведения",
      group: "inspect",
      surface: {
        kind: "detail",
        eyebrow: roomKind(room),
        title: room.title,
        body: details,
        size: { width: "compact", height: "content" },
      },
    },
  ]
}
