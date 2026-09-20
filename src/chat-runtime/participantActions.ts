import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { oracle } from "../oracle-engine/runtime.ts"
import type { SnakeAction } from "../snake-engine/index.ts"

export type ChatRecoveryTrigger = "short_rest" | "long_rest" | "dawn"

const recoveryLabel: Record<ChatRecoveryTrigger, string> = {
  short_rest: "Короткий отдых",
  long_rest: "Долгий отдых",
  dawn: "Рассвет",
}

export function createChatCharacterRecoverySnakeAction({
  campaignId,
  requestedBy,
  canManage,
  targetCharacterId,
  targetName,
  trigger,
}: {
  campaignId: string
  requestedBy: string
  canManage: boolean
  targetCharacterId: string
  targetName: string
  trigger: ChatRecoveryTrigger
}): SnakeAction {
  const label = recoveryLabel[trigger]

  return {
    id: `chat.character.${targetCharacterId}.recovery.${trigger}`,
    label,
    enabled: canManage && Boolean(campaignId) && Boolean(requestedBy),
    disabledReason: "Отдых и восстановление доступны только GM/Admin.",
    execute: async () => {
      await oracle.characters.recover(
        createEngineCommandContext({
          campaignId,
          requestedBy,
          authority: "gm",
          actorCharacterId: targetCharacterId,
        }),
        targetCharacterId,
        trigger,
      )

      return {
        type: "success" as const,
        notice: `${label}: ${targetName}`,
      }
    },
  }
}
