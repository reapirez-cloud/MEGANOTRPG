import type { ChatEventPayload, ChatMessage } from "../../types/chat"

export type UiChatEventType =
  | "message"
  | "gm_message"
  | "roll"
  | "roll_request"
  | "spell"
  | "attack"
  | "item"
  | "class_ability"
  | "media"
  | "system"

export type UiChatEventAuthor = {
  userId: string | null
  characterId: string | null
  name: string
  avatarUrl: string | null
  isGm: boolean
}

export type UiChatEvent = {
  id: number
  roomId: string
  type: UiChatEventType
  author: UiChatEventAuthor
  body: string
  createdAt: string
  editedAt: string | null
  media: {
    url: string
    kind: "image"
  } | null
  game: {
    label: string | null
    detail: string | null
    payload: ChatEventPayload | null
  } | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function payloadString(
  payload: ChatEventPayload | null,
  ...keys: string[]
) {
  if (!payload) return null

  for (const key of keys) {
    const value = payload[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  return null
}

function normalizeActionType(payload: ChatEventPayload | null): UiChatEventType {
  const explicit = payloadString(
    payload,
    "actionType",
    "action_type",
    "eventType",
    "event_type",
    "kind",
    "type",
  )?.toLocaleLowerCase("en-US")

  if (
    explicit === "attack" ||
    explicit === "weapon_attack" ||
    explicit === "weapon-attack"
  ) {
    return "attack"
  }

  if (
    explicit === "item" ||
    explicit === "item_use" ||
    explicit === "item-use" ||
    explicit === "use_item"
  ) {
    return "item"
  }

  if (
    explicit === "class" ||
    explicit === "class_ability" ||
    explicit === "class-ability" ||
    explicit === "ability" ||
    explicit === "feature"
  ) {
    return "class_ability"
  }

  // Legacy "action" rows in MEGANOT are class/character mechanics.
  // Do not reinterpret them as attacks merely because an action can cause damage.
  return "class_ability"
}

export function normalizeChatEvent(
  message: ChatMessage,
  isGmAuthor: boolean,
): UiChatEvent {
  let type: UiChatEventType

  if (message.event_kind === "roll_request") {
    type = "roll_request"
  } else if (message.event_kind === "roll") {
    type = "roll"
  } else if (message.event_kind === "spell") {
    type = "spell"
  } else if (message.event_kind === "attack") {
    type = "attack"
  } else if (message.event_kind === "item") {
    type = "item"
  } else if (message.event_kind === "class_ability") {
    type = "class_ability"
  } else if (message.event_kind === "action") {
    type = normalizeActionType(message.event_payload)
  } else if (message.attachment_url) {
    type = "media"
  } else if (!message.user_id && !message.character_id) {
    type = "system"
  } else if (isGmAuthor && !message.character_id) {
    type = "gm_message"
  } else {
    type = "message"
  }

  const hasGameData =
    type === "roll" ||
    type === "roll_request" ||
    type === "spell" ||
    type === "attack" ||
    type === "item" ||
    type === "class_ability"

  return {
    id: message.id,
    roomId: message.room_id,
    type,
    author: {
      userId: message.user_id,
      characterId: message.character_id,
      name:
        message.author_name.trim() ||
        (type === "system" ? "Система" : isGmAuthor ? "Рассказчик" : "Персонаж"),
      avatarUrl: message.author_avatar_url,
      isGm: isGmAuthor,
    },
    body: message.body.trim(),
    createdAt: message.created_at,
    editedAt: message.edited_at,
    media:
      message.attachment_url && message.attachment_kind === "image"
        ? {
            url: message.attachment_url,
            kind: "image",
          }
        : null,
    game: hasGameData
      ? {
          label: payloadString(message.event_payload, "label", "name", "title"),
          detail: payloadString(message.event_payload, "detail", "description"),
          payload: isRecord(message.event_payload)
            ? message.event_payload
            : null,
        }
      : null,
  }
}

export function chatEventTypeLabel(type: UiChatEventType) {
  if (type === "roll_request") return "Запрос броска"
  if (type === "roll") return "Бросок"
  if (type === "spell") return "Заклинание"
  if (type === "attack") return "Атака"
  if (type === "item") return "Предмет"
  if (type === "class_ability") return "Классовое умение"
  if (type === "gm_message") return "GM"
  if (type === "system") return "Система"
  if (type === "media") return "Медиа"
  return "Сообщение"
}
