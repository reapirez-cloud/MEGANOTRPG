import { useEffect, useMemo, useState } from "react"

import { buildChatActionModel } from "../../chat-runtime/actionModel.ts"
import { useAuth } from "../../context/AuthContext"
import { shapoklyak } from "../../entity-engine/runtime.ts"
import type { CharacterEntity } from "../../entity-engine/types.ts"
import { useResolvedCharacterRuntime } from "../../hooks/useResolvedCharacterRuntime.ts"

function speakerStorageKey(campaignId: string, userId: string) {
  return `meganotrpg:v1:speaking-identity:${campaignId}:${userId}`
}

function selectedCharacterId(
  campaignId: string,
  userId: string,
  canManage: boolean,
  activeCharacterId: string | null,
) {
  if (!canManage) return activeCharacterId
  try {
    const stored = window.localStorage.getItem(speakerStorageKey(campaignId, userId))
    return stored?.startsWith("character:")
      ? stored.slice("character:".length)
      : null
  } catch {
    return null
  }
}

export function useUiV1ChatActorRuntime(enabled: boolean) {
  const { campaign, user } = useAuth()
  const [character, setCharacter] = useState<CharacterEntity | null>(null)
  const [actorLoading, setActorLoading] = useState(false)
  const [actorError, setActorError] = useState("")

  const characterId = useMemo(() => {
    if (!enabled || !campaign) return null
    return selectedCharacterId(
      campaign.campaignId,
      user.id,
      campaign.canManage,
      campaign.activeCharacterId,
    )
  }, [campaign, enabled, user.id])

  useEffect(() => {
    let cancelled = false

    if (!enabled || !campaign || !characterId) {
      queueMicrotask(() => {
        if (cancelled) return
        setCharacter(null)
        setActorLoading(false)
        setActorError("")
      })
      return () => { cancelled = true }
    }

    queueMicrotask(() => {
      if (!cancelled) {
        setActorLoading(true)
        setActorError("")
      }
    })

    void shapoklyak.getEntity(characterId)
      .then((entity) => {
        if (cancelled) return
        if (!entity || entity.campaign_id !== campaign.campaignId) {
          setCharacter(null)
          setActorError("Выбранный персонаж недоступен в этой кампании.")
        } else {
          setCharacter(entity)
          setActorError("")
        }
        setActorLoading(false)
      })
      .catch((reason) => {
        if (cancelled) return
        setCharacter(null)
        setActorError(
          reason instanceof Error
            ? reason.message
            : "Не удалось загрузить персонажа.",
        )
        setActorLoading(false)
      })

    return () => { cancelled = true }
  }, [campaign, characterId, enabled])

  const resolved = useResolvedCharacterRuntime(character)
  const model = useMemo(
    () => buildChatActionModel(resolved.contract, campaign?.canManage === true),
    [campaign?.canManage, resolved.contract],
  )

  return {
    campaignId: campaign?.campaignId || "",
    userId: user.id,
    canManage: campaign?.canManage === true,
    narrator: Boolean(enabled && campaign?.canManage && !characterId),
    character,
    characterId: character?.id || null,
    contract: resolved.contract,
    model,
    loading: actorLoading || (Boolean(character) && resolved.loading),
    stale: resolved.stale,
    error: actorError || resolved.error,
    refresh: resolved.refresh,
  }
}
