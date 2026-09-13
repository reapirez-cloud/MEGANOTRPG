export type WorkspaceIdentityCharacter = {
  id: string
  assignedUserId: string | null
  characterType: "pc" | "npc"
  lifeState: "alive" | "dead"
}

export type WorkspaceIdentityMembership = {
  userId: string
  activeCharacterId: string | null
}

/**
 * Workspace speaking identity is not manager ownership.
 *
 * A manager may speak as their own living character or an unassigned living
 * world NPC. A character assigned to another user is protected from the
 * Workspace speaker picker even when the viewer is GM/owner.
 *
 * Unassigned PCs stay in management/workshop instead of becoming accidental
 * speaking identities.
 */
export function canSelectWorkspaceSpeaker(
  character: WorkspaceIdentityCharacter,
  currentUserId: string,
) {
  if (character.lifeState !== "alive") return false
  if (character.assignedUserId === currentUserId) return true
  return character.characterType === "npc" && character.assignedUserId === null
}

export function isForeignAssignedCharacter(
  character: WorkspaceIdentityCharacter,
  currentUserId: string,
) {
  return Boolean(
    character.assignedUserId &&
    character.assignedUserId !== currentUserId,
  )
}

export function activeOtherPlayerCharacterIds(
  characters: WorkspaceIdentityCharacter[],
  memberships: WorkspaceIdentityMembership[],
  currentUserId: string,
) {
  const characterById = new Map(characters.map((character) => [character.id, character]))
  const ids: string[] = []

  for (const membership of memberships) {
    if (membership.userId === currentUserId || !membership.activeCharacterId) continue

    const character = characterById.get(membership.activeCharacterId)
    if (!character) continue
    if (character.characterType !== "pc" || character.lifeState !== "alive") continue
    if (character.assignedUserId !== membership.userId) continue

    ids.push(character.id)
  }

  return [...new Set(ids)]
}

export function sortOwnedWorkspaceCharacters<
  T extends Pick<WorkspaceIdentityCharacter, "lifeState">
>(characters: T[]) {
  return [...characters].sort(
    (left, right) =>
      Number(left.lifeState === "dead") - Number(right.lifeState === "dead"),
  )
}
