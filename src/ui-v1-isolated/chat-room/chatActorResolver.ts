import type { ChatViewerRole } from "./chatRoomContracts"

export const CHAT_NARRATOR_SPEAKER_ID = "narrator" as const

export function normalizeChatViewerRole(
  value: string | null | undefined,
): ChatViewerRole {
  return value === "gm" ? "gm" : "player"
}

export function chatDefaultSpeakerId({
  canManage,
  viewerRole,
  viewerCharacterId,
}: {
  canManage: boolean
  viewerRole: ChatViewerRole
  viewerCharacterId: string | null
}) {
  if (viewerRole === "player" && viewerCharacterId) {
    return viewerCharacterId
  }

  return canManage ? CHAT_NARRATOR_SPEAKER_ID : viewerCharacterId
}

export function resolveChatSpeakerId({
  storedId,
  defaultId,
  availableIds,
}: {
  storedId: string | null
  defaultId: string | null
  availableIds: Iterable<string>
}) {
  const available = new Set(availableIds)

  if (storedId && available.has(storedId)) {
    return storedId
  }

  if (defaultId && available.has(defaultId)) {
    return defaultId
  }

  if (available.has(CHAT_NARRATOR_SPEAKER_ID)) {
    return CHAT_NARRATOR_SPEAKER_ID
  }

  return null
}
