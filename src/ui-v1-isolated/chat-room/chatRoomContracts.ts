export type ChatRoomDayPeriod =
  | "dawn"
  | "morning"
  | "day"
  | "late_day"
  | "evening"
  | "night"
  | "deep_night"

export type ChatRoomHeaderCharacter = {
  id: string
  name: string
  className: string
  level: number
  avatarUrl: string | null
  currentHp: number | null
  maxHp: number | null
  tempHp: number
}

export type ChatRoomHeaderIdentity =
  | {
      kind: "character"
      character: ChatRoomHeaderCharacter
    }
  | {
      kind: "narrator"
      name: "Рассказчик"
    }
  | null

export type ChatRoomHeaderContext = {
  campaignDay: number | null
  dayPeriod: ChatRoomDayPeriod | null
  locationName: string | null
}

export type ChatRoomQuickActions = {
  hasCharacter: boolean
  hasEquippedWeapon: boolean
}

export type ChatRoomShellModel = {
  roomId: string
  roomTitle: string
  roomType: "character" | "scene" | "flood"
  readOnly: boolean
  canManage: boolean
  viewer: {
    campaignId: string
    userId: string
  }
  identity: ChatRoomHeaderIdentity
  context: ChatRoomHeaderContext
  quickActions: ChatRoomQuickActions
}

export const CHAT_ROOM_DAY_PERIOD_LABELS: Record<ChatRoomDayPeriod, string> = {
  dawn: "Рассвет",
  morning: "Утро",
  day: "День",
  late_day: "После полудня",
  evening: "Вечер",
  night: "Ночь",
  deep_night: "Глубокая ночь",
}

export function chatRoomDayPeriodLabel(value: ChatRoomDayPeriod | null) {
  return value ? CHAT_ROOM_DAY_PERIOD_LABELS[value] : "Время не определено"
}

export function chatSpeakerStorageKey(
  campaignId: string,
  roomId: string,
  userId: string,
) {
  return `meganotrpg:chat-speaker:${campaignId}:${roomId}:${userId}`
}


export const CHAT_SPEAKER_CHANGED_EVENT = "meganotrpg:chat-speaker-changed"

export type ChatSpeakerOption =
  | {
      id: "narrator"
      kind: "narrator"
      name: "Рассказчик"
      avatarUrl: null
    }
  | {
      id: string
      kind: "character"
      name: string
      avatarUrl: string | null
    }
