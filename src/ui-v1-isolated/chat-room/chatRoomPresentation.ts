import type { ChatRoomShellModel } from "./chatRoomContracts"

export type ChatRoomIdentityKind = "character" | "narrator" | "observer"

export type ChatRoomPresentationState = {
  identityKind: ChatRoomIdentityKind
  canCompose: boolean
  showQuickActions: boolean
  showPersonaSelector: boolean
  canOpenGameActions: boolean
}

export function chatRoomPresentationState(
  model: ChatRoomShellModel,
): ChatRoomPresentationState {
  const identityKind: ChatRoomIdentityKind =
    model.identity?.kind === "character"
      ? "character"
      : model.identity?.kind === "narrator"
        ? "narrator"
        : "observer"

  const hasCharacter =
    identityKind === "character" && model.quickActions.hasCharacter

  const canCompose =
    model.canWrite && (model.canManage || identityKind === "character")

  return {
    identityKind,
    canCompose,
    showQuickActions: model.canWrite && hasCharacter,
    showPersonaSelector: model.canManage && model.canWrite,
    canOpenGameActions: canCompose,
  }
}
