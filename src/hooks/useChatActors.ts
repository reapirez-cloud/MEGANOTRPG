import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { useCharacters, type Character } from "../context/CharacterContext"

export type ChatActor = {
  key: string
  characterId: string | null
  label: string
  avatar_url: string | null
  character: Character | null
  kind: "role" | "character"
}

type ChatActorSelectionDetail = { storageKey: string; selectedKey: string }
const CHAT_ACTOR_SELECTION_EVENT = "meganotrpg:chat-actor-selection"

export function useChatActors() {
  const { user, profile } = useAuth()
  const { campaignId, characters, activeCharacter, canManage, isOwner, isGm } = useCharacters()

  const roleActor = useMemo<ChatActor | null>(() => canManage ? {
    key: "role", characterId: null,
    label: isOwner ? `Владелец · ${profile.display_name}` : isGm ? `ГМ · ${profile.display_name}` : profile.display_name,
    avatar_url: null, character: null, kind: "role",
  } : null, [canManage, isGm, isOwner, profile.display_name])

  const actors = useMemo(() => {
    const list: ChatActor[] = []
    if (roleActor) list.push(roleActor)

    for (const character of characters) {
      if (character.life_state === "dead") continue
      const ownActivePc = character.character_type === "pc"
        && character.assigned_user_id === user.id
        && character.id === activeCharacter?.id
      const availableToManager = canManage
      const availableToPlayer = !canManage && ownActivePc
      if (!availableToManager && !availableToPlayer) continue

      list.push({
        key: character.id,
        characterId: character.id,
        label: character.name,
        avatar_url: character.avatar_url,
        character,
        kind: "character",
      })
    }
    return list
  }, [activeCharacter?.id, canManage, characters, roleActor, user.id])

  const storageKey = `meganotrpg:v2:chat-actor:${campaignId}`
  const [selectedKey, setSelectedKey] = useState(() => window.localStorage.getItem(storageKey) || "")
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setSelectedKey(saved || (canManage ? "role" : activeCharacter?.id || ""))
    })
    return () => { cancelled = true }
  }, [activeCharacter?.id, campaignId, canManage, storageKey])

  useEffect(() => {
    const onSelection = (event: Event) => {
      const detail = (event as CustomEvent<ChatActorSelectionDetail>).detail
      if (!detail || detail.storageKey !== storageKey) return
      setSelectedKey(detail.selectedKey)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) setSelectedKey(event.newValue || "")
    }
    window.addEventListener(CHAT_ACTOR_SELECTION_EVENT, onSelection)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(CHAT_ACTOR_SELECTION_EVENT, onSelection)
      window.removeEventListener("storage", onStorage)
    }
  }, [storageKey])

  const selected = actors.find((actor) => actor.key === selectedKey)
    || actors.find((actor) => actor.characterId === activeCharacter?.id)
    || actors.find((actor) => actor.kind === "role")
    || actors[0]
    || null

  const selectActor = useCallback((actor: ChatActor) => {
    setSelectedKey(actor.key)
    window.localStorage.setItem(storageKey, actor.key)
    window.dispatchEvent(new CustomEvent<ChatActorSelectionDetail>(CHAT_ACTOR_SELECTION_EVENT, {
      detail: { storageKey, selectedKey: actor.key },
    }))
  }, [storageKey])

  return { actors, selected, selectActor }
}
