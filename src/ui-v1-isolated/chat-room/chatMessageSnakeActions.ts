import type { SnakeAction } from "../../snake-engine"
import { supabase } from "../../lib/supabase"
import type { UiChatEvent } from "./chatEventModel"

type AiGmTurnControl = {
  tracked?: boolean
  campaign_id?: string
  room_id?: string
  source_message_id?: number
  source_body?: string
  revision_id?: string
  revision_no?: number
  job_id?: string
  job_status?: string
  replay_mode?: string
  can_manage?: boolean
  is_source_author?: boolean
  can_regenerate?: boolean
  can_edit_resend?: boolean
  can_undo?: boolean
  block_reason?: string | null
}

function inputText(
  input: Record<string, unknown> | undefined,
  key: string,
) {
  const value = input?.[key]
  return typeof value === "string" ? value.trim() : ""
}

async function loadControl(messageId: number): Promise<AiGmTurnControl> {
  const result = await supabase.rpc("get_ai_gm_turn_control_v1", {
    p_message_id: messageId,
  })
  if (result.error) throw result.error
  return (result.data || {}) as AiGmTurnControl
}

async function replayTurn({
  campaignId,
  sourceMessageId,
  mode,
  editedBody,
}: {
  campaignId: string
  sourceMessageId: number
  mode: "regenerate" | "edit_resend"
  editedBody?: string
}) {
  const result = await supabase.functions.invoke("voss-agent", {
    body: {
      campaignId,
      action: "game_chat_replay",
      sourceChatMessageId: sourceMessageId,
      replayMode: mode,
      editedBody: mode === "edit_resend" ? editedBody : undefined,
    },
  })

  const data =
    result.data && typeof result.data === "object"
      ? result.data as Record<string, unknown>
      : {}
  const errorMessage =
    typeof data.error === "string"
      ? data.error
      : result.error?.message || null

  if (result.error || data.accepted === false || errorMessage) {
    return {
      ok: false,
      error: errorMessage || "ИИ-ГМ не смог перезапустить ход.",
    }
  }

  return { ok: true }
}

async function undoTurn(messageId: number) {
  const result = await supabase.rpc("undo_ai_gm_turn_v1", {
    p_message_id: messageId,
  })

  return result.error
    ? { ok: false, error: result.error.message }
    : { ok: true }
}

function blockedAction(
  id: string,
  label: string,
  reason: string,
): SnakeAction {
  return {
    id,
    label,
    enabled: false,
    disabledReason: reason,
    group: "ai-gm",
  }
}

function controlActions(
  event: UiChatEvent,
  campaignId: string,
  control: AiGmTurnControl,
): SnakeAction[] {
  if (!control.tracked || !control.source_message_id) {
    return [
      blockedAction(
        "ai-gm-not-tracked",
        "Нет ревизии ИИ-ГМ",
        "Это сообщение не связано с каноническим AI GM turn.",
      ),
    ]
  }

  const blockReason =
    control.block_reason ||
    "Этот ход нельзя безопасно изменить в текущем состоянии."
  const sourceMessageId = Number(control.source_message_id)
  const revisionNo = Number(control.revision_no || 1)

  const actions: SnakeAction[] = [
    {
      id: "ai-gm-revision-details",
      label: "Сведения о ревизии",
      group: "inspect",
      surface: {
        kind: "detail",
        eyebrow: "ИИ-ГМ · ревизия " + revisionNo,
        title: "Ход ИИ-ГМ",
        body: [
          "Статус: " + (control.job_status || "неизвестен") + ".",
          "Режим: " + (control.replay_mode || "initial") + ".",
          control.block_reason
            ? "Автооткат сейчас заблокирован: " + control.block_reason
            : "Ход можно безопасно переиграть: ledger не видит необратимых последствий и более поздних сообщений.",
        ].join("\n\n"),
      },
    },
  ]

  if (control.can_regenerate) {
    actions.push({
      id: "ai-gm-regenerate",
      label: "Новая генерация",
      group: "ai-gm",
      surface: {
        kind: "confirm",
        eyebrow: "ИИ-ГМ · ревизия " + revisionNo,
        title: "Сгенерировать ход заново?",
        body:
          "Текущий ответ ИИ-ГМ и его обратимые последствия будут убраны из канона. Исходное сообщение игрока останется тем же.",
        confirmLabel: "Новая генерация",
        cancelLabel: "Отмена",
      },
      execute: async ({ input }) => {
        if (input?.confirmed !== true) {
          return { type: "error", message: "Новая генерация не подтверждена." }
        }
        const result = await replayTurn({
          campaignId,
          sourceMessageId,
          mode: "regenerate",
        })
        return result.ok
          ? { type: "success", notice: "Новая генерация запущена." }
          : {
              type: "error",
              message: result.error || "Новая генерация не запущена.",
            }
      },
    })
  } else {
    actions.push(
      blockedAction(
        "ai-gm-regenerate",
        "Новая генерация",
        blockReason,
      ),
    )
  }

  if (control.can_edit_resend) {
    actions.push({
      id: "ai-gm-edit-resend",
      label: "Редактировать и отправить заново",
      group: "ai-gm",
      surface: {
        kind: "editor",
        eyebrow: "ИИ-ГМ · исходный ход",
        title: "Редактировать сообщение",
        size: { width: "wide", height: "content" },
        fields: [
          {
            id: "body",
            label: "Текст",
            type: "textarea",
            required: true,
          },
        ],
        initialValues: {
          body: control.source_body || event.body,
        },
        submitLabel: "Сохранить и переиграть",
        cancelLabel: "Отмена",
      },
      execute: async ({ input }) => {
        const body = inputText(input, "body")
        if (!body) {
          return { type: "error", message: "Сообщение не может быть пустым." }
        }
        const result = await replayTurn({
          campaignId,
          sourceMessageId,
          mode: "edit_resend",
          editedBody: body,
        })
        return result.ok
          ? {
              type: "success",
              notice: "Сообщение изменено. ИИ-ГМ переигрывает ход.",
            }
          : {
              type: "error",
              message: result.error || "Сообщение не переиграно.",
            }
      },
    })
  } else {
    actions.push(
      blockedAction(
        "ai-gm-edit-resend",
        "Редактировать и отправить заново",
        control.is_source_author || control.can_manage
          ? blockReason
          : "Редактировать исходный ход может его автор или GM.",
      ),
    )
  }

  if (control.can_undo) {
    actions.push({
      id: "ai-gm-undo",
      label: "Откатить ход ИИ-ГМ",
      group: "danger",
      tone: "danger",
      surface: {
        kind: "confirm",
        eyebrow: "ИИ-ГМ · rollback",
        title: "Откатить этот ход?",
        body:
          "Будут удалены только последствия, которые ledger считает обратимыми. Механические траты и другие необратимые изменения сервер не позволит откатить этой кнопкой.",
        confirmLabel: "Откатить",
        cancelLabel: "Отмена",
      },
      execute: async ({ input }) => {
        if (input?.confirmed !== true) {
          return { type: "error", message: "Откат не подтверждён." }
        }
        const result = await undoTurn(event.id)
        return result.ok
          ? { type: "success", notice: "Ход ИИ-ГМ откатан." }
          : {
              type: "error",
              message: result.error || "Ход не удалось откатить.",
            }
      },
    })
  } else if (control.can_manage) {
    actions.push(
      blockedAction(
        "ai-gm-undo",
        "Откатить ход ИИ-ГМ",
        blockReason,
      ),
    )
  }

  return actions
}

export function createChatMessageSnakeActions({
  event,
  campaignId,
}: {
  event: UiChatEvent
  campaignId: string
}): SnakeAction[] {
  if (
    event.type === "system" &&
    event.game?.payload?.systemEvent !== "ai_gm_media"
  ) {
    return []
  }

  return [
    {
      id: "ai-gm-turn",
      label: "ИИ-ГМ",
      kind: "branch",
      group: "ai-gm",
      children: async () => {
        try {
          const control = await loadControl(event.id)
          return controlActions(event, campaignId, control)
        } catch (error) {
          return [
            blockedAction(
              "ai-gm-control-error",
              "Действия ИИ-ГМ недоступны",
              error instanceof Error
                ? error.message
                : "Не удалось прочитать ledger хода.",
            ),
          ]
        }
      },
    },
  ]
}
