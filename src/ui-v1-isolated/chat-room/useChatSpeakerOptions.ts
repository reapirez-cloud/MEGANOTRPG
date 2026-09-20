import { useCallback, useEffect, useMemo, useState } from "react"

import { resolveCampaignMediaUrl } from "../../lib/campaignMedia"
import { supabase } from "../../lib/supabase"
import {
  CHAT_NARRATOR_SPEAKER_ID,
  chatDefaultSpeakerId,
  resolveChatSpeakerId,
} from "./chatActorResolver"
import {
  CHAT_SPEAKER_CHANGED_EVENT,
  chatSpeakerStorageKey,
  type ChatSpeakerOption,
  type ChatViewerRole,
} from "./chatRoomContracts"

type BindingRow = {
  character_id: string
}

type CharacterRow = {
  id: string
  name: string
  avatar_url: string | null
}

const NARRATOR_OPTION: ChatSpeakerOption = {
  id: CHAT_NARRATOR_SPEAKER_ID,
  kind: "narrator",
  name: "Рассказчик",
  avatarUrl: null,
}

async function characterOption(
  character: CharacterRow,
): Promise<ChatSpeakerOption> {
  return {
    id: character.id,
    kind: "character",
    name: character.name,
    avatarUrl: character.avatar_url
      ? (await resolveCampaignMediaUrl(character.avatar_url)) ||
        character.avatar_url
      : null,
  }
}

export function useChatSpeakerOptions({
  campaignId,
  userId,
  roomId,
  enabled,
  viewerRole,
  playerCharacterId,
}: {
  campaignId: string
  userId: string
  roomId: string
  enabled: boolean
  viewerRole: ChatViewerRole
  playerCharacterId: string | null
}) {
  const [options, setOptions] = useState<ChatSpeakerOption[]>([NARRATOR_OPTION])
  const [selectedId, setSelectedId] = useState<string>(
    CHAT_NARRATOR_SPEAKER_ID,
  )
  const [loading, setLoading] = useState(enabled)

  const storageKey = useMemo(
    () => chatSpeakerStorageKey(campaignId, roomId, userId),
    [campaignId, roomId, userId],
  )

  const load = useCallback(async () => {
    if (!enabled) {
      setOptions([NARRATOR_OPTION])
      setSelectedId(CHAT_NARRATOR_SPEAKER_ID)
      setLoading(false)
      return
    }

    setLoading(true)

    const bindingsResult = await supabase
      .from("chat_actor_bindings")
      .select("character_id")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)

    const boundNpcIds = ((bindingsResult.data || []) as BindingRow[]).map(
      (binding) => binding.character_id,
    )

    let playerOption: ChatSpeakerOption | null = null
    if (viewerRole === "player" && playerCharacterId) {
      const playerResult = await supabase
        .from("characters")
        .select("id, name, avatar_url")
        .eq("campaign_id", campaignId)
        .eq("id", playerCharacterId)
        .eq("assigned_user_id", userId)
        .eq("character_type", "pc")
        .eq("life_state", "alive")
        .maybeSingle()

      if (playerResult.data) {
        playerOption = await characterOption(playerResult.data as CharacterRow)
      }
    }

    let npcOptions: ChatSpeakerOption[] = []
    if (boundNpcIds.length) {
      const charactersResult = await supabase
        .from("characters")
        .select("id, name, avatar_url")
        .eq("campaign_id", campaignId)
        .in("id", boundNpcIds)
        .eq("character_type", "npc")
        .eq("life_state", "alive")

      const characters = (charactersResult.data || []) as CharacterRow[]
      npcOptions = await Promise.all(
        characters
          .sort((a, b) => a.name.localeCompare(b.name, "ru"))
          .map(characterOption),
      )
    }

    const nextOptions = [
      ...(playerOption ? [playerOption] : []),
      NARRATOR_OPTION,
      ...npcOptions,
    ]
    const defaultId = chatDefaultSpeakerId({
      canManage: true,
      viewerRole,
      viewerCharacterId: playerCharacterId,
    })
    const stored = window.localStorage.getItem(storageKey)
    const selected = resolveChatSpeakerId({
      storedId: stored,
      defaultId,
      availableIds: nextOptions.map((option) => option.id),
    }) || CHAT_NARRATOR_SPEAKER_ID

    if (selected !== stored) {
      window.localStorage.setItem(storageKey, selected)
    }

    setOptions(nextOptions)
    setSelectedId(selected)
    setLoading(false)
  }, [
    campaignId,
    enabled,
    playerCharacterId,
    storageKey,
    userId,
    viewerRole,
  ])

  useEffect(() => {
    void load()
  }, [load])

  const selectSpeaker = useCallback(
    (id: string) => {
      if (!options.some((option) => option.id === id)) return

      window.localStorage.setItem(storageKey, id)
      setSelectedId(id)
      window.dispatchEvent(
        new CustomEvent(CHAT_SPEAKER_CHANGED_EVENT, {
          detail: { roomId, speakerId: id },
        }),
      )
    },
    [options, roomId, storageKey],
  )

  return {
    options,
    selectedId,
    selected:
      options.find((option) => option.id === selectedId) || NARRATOR_OPTION,
    loading,
    selectSpeaker,
  }
}
