import { useCallback, useEffect, useMemo, useState } from "react"

import { resolveCampaignMediaUrl } from "../../lib/campaignMedia"
import { supabase } from "../../lib/supabase"
import {
  CHAT_SPEAKER_CHANGED_EVENT,
  chatSpeakerStorageKey,
  type ChatSpeakerOption,
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
  id: "narrator",
  kind: "narrator",
  name: "Рассказчик",
  avatarUrl: null,
}

export function useChatSpeakerOptions({
  campaignId,
  userId,
  roomId,
  enabled,
}: {
  campaignId: string
  userId: string
  roomId: string
  enabled: boolean
}) {
  const [options, setOptions] = useState<ChatSpeakerOption[]>([NARRATOR_OPTION])
  const [selectedId, setSelectedId] = useState("narrator")
  const [loading, setLoading] = useState(enabled)

  const storageKey = useMemo(
    () => chatSpeakerStorageKey(campaignId, roomId, userId),
    [campaignId, roomId, userId],
  )

  const load = useCallback(async () => {
    if (!enabled) {
      setOptions([NARRATOR_OPTION])
      setSelectedId("narrator")
      setLoading(false)
      return
    }

    setLoading(true)

    const bindingsResult = await supabase
      .from("chat_actor_bindings")
      .select("character_id")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)

    const ids = ((bindingsResult.data || []) as BindingRow[]).map(
      (binding) => binding.character_id,
    )

    let characterOptions: ChatSpeakerOption[] = []
    if (ids.length) {
      const charactersResult = await supabase
        .from("characters")
        .select("id, name, avatar_url")
        .eq("campaign_id", campaignId)
        .in("id", ids)
        .eq("life_state", "alive")

      const characters = (charactersResult.data || []) as CharacterRow[]
      characterOptions = await Promise.all(
        characters
          .sort((a, b) => a.name.localeCompare(b.name, "ru"))
          .map(async (character): Promise<ChatSpeakerOption> => ({
            id: character.id,
            kind: "character",
            name: character.name,
            avatarUrl: character.avatar_url
              ? (await resolveCampaignMediaUrl(character.avatar_url)) ||
                character.avatar_url
              : null,
          })),
      )
    }

    const nextOptions = [NARRATOR_OPTION, ...characterOptions]
    const stored = window.localStorage.getItem(storageKey) || "narrator"
    const validStored = nextOptions.some((option) => option.id === stored)
      ? stored
      : "narrator"

    if (validStored !== stored) {
      window.localStorage.setItem(storageKey, validStored)
    }

    setOptions(nextOptions)
    setSelectedId(validStored)
    setLoading(false)
  }, [campaignId, enabled, storageKey, userId])

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
