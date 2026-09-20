import type {
  SnakeAction,
  SnakeActionInput,
} from "../snake-engine"
import type { ChatRoom } from "../types/chat"

type MutationResult = { ok: boolean; error?: string }

function roomKind(room: ChatRoom) {
  if (room.room_type === "character") return "Личная история"
  if (room.room_type === "scene") return "Сцена"
  return "Флуд"
}

function mutationResult(response: MutationResult, notice: string) {
  return response.ok
    ? { type: "success" as const, notice }
    : {
        type: "error" as const,
        message: response.error || "Не удалось выполнить действие.",
      }
}

export function createChatRoomSnakeActions({
  room,
  details,
  canManage,
  openRoom,
  setPreview,
  deleteScene,
}: {
  room: ChatRoom
  details: string
  canManage: boolean
  openRoom: () => void
  setPreview: (input: SnakeActionInput) => Promise<MutationResult>
  deleteScene: () => Promise<MutationResult>
}): SnakeAction[] {
  const actions: SnakeAction[] = [
    {
      id: "open",
      label: "Открыть",
      group: "primary",
      execute: () => {
        openRoom()
        return { type: "success" as const }
      },
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

  if (
    canManage &&
    (room.room_type === "character" || room.room_type === "scene")
  ) {
    actions.push({
      id: "preview",
      label: room.avatar_url ? "Заменить превью" : "Назначить превью",
      group: "media",
      surface: {
        kind: "media",
        eyebrow: roomKind(room) + " · графика",
        title: "Превью · " + room.title,
        items: room.avatar_url
          ? [{
              id: "chat-preview",
              src: room.avatar_url,
              title: room.title,
            }]
          : [],
        compose: {
          label: "Превью чата · 9:16",
          shape: "rect",
          aspectRatio: 9 / 16,
          allowFilePick: true,
          requireFile: true,
          fileLabel: room.avatar_url
            ? "Выбрать другое изображение"
            : "Выбрать изображение",
          submitLabel: "Назначить на превью",
          initialPresentation: room.avatar_presentation || null,
        },
      },
      execute: async ({ input }) =>
        mutationResult(
          await setPreview(input),
          "Превью чата обновлено.",
        ),
    })
  }

  if (canManage && room.room_type === "scene") {
    actions.push({
      id: "delete-scene",
      label: "Удалить сцену",
      group: "danger",
      tone: "danger",
      surface: {
        kind: "confirm",
        eyebrow: "Сцена",
        title: "Удалить «" + room.title + "»?",
        body:
          "Сцена и её связанные сообщения будут удалены. Личные истории этим действием удалить нельзя.",
        confirmLabel: "Удалить сцену",
        cancelLabel: "Отмена",
      },
      execute: async ({ input }) => {
        if (input?.confirmed !== true) {
          return {
            type: "error" as const,
            message: "Удаление сцены не подтверждено.",
          }
        }
        return mutationResult(
          await deleteScene(),
          "Сцена удалена.",
        )
      },
    })
  }

  return actions
}
