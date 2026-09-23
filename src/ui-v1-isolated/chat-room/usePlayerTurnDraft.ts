import { useCallback, useEffect, useMemo, useState } from "react"

import { supabase } from "../../lib/supabase"

export type PlayerTurnSlot = "action" | "bonus_action"

export type PlayerTurnEntry = {
  kind:
    | "template_action"
    | "template_roll"
    | "template_spell"
    | "spell_with_modifiers"
    | "inventory_event"
    | "inventory_roll"
    | "raw_event"
    | "raw_roll"
  label: string
  economy?: string
  commandId?: string
  mechanicId?: string
  optionKey?: string
  methodKey?: string
  spellMechanicId?: string
  spellResourceCosts?: unknown[]
  modifierMechanicIds?: string[]
  itemId?: string
  itemAmount?: number
  eventKind?: "action" | "spell"
  rollKind?: string
  modifier?: number
  rollD20?: boolean
  diceCount?: number
  diceSides?: number
  diceModifier?: number
  d20Floor?: number
  resourceCosts?: unknown[]
  payload?: Record<string, unknown>
}

export type PlayerTurnDraft = {
  id: string
  campaign_id: string
  room_id: string
  character_id: string
  user_id: string
  status: "draft" | "submitted" | "cancelled"
  revision: number
  action_entry: PlayerTurnEntry | null
  bonus_action_entry: PlayerTurnEntry | null
  movement: { description?: string } | null
  description: string
  turn_command_id: string | null
  submission_result: Record<string, unknown>
  updated_at: string
}

export type PlayerTurnSubmitResult = {
  draft_id: string
  campaign_id: string
  room_id: string
  character_id: string
  turn_command_id: string
  message_ids: number[]
  action_message_id: number | null
  bonus_action_message_id: number | null
  movement_message_id: number | null
  trigger_message_id: number
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function draftFrom(value: unknown): PlayerTurnDraft | null {
  const row = record(value)
  if (!row.id) return null
  return row as unknown as PlayerTurnDraft
}

function submitResultFrom(value: unknown): PlayerTurnSubmitResult {
  const row = record(value)
  const trigger = Number(row.trigger_message_id || 0)
  if (!Number.isSafeInteger(trigger) || trigger < 1) {
    throw new Error("Ход отправлен без итогового сообщения.")
  }

  return {
    draft_id: String(row.draft_id || ""),
    campaign_id: String(row.campaign_id || ""),
    room_id: String(row.room_id || ""),
    character_id: String(row.character_id || ""),
    turn_command_id: String(row.turn_command_id || ""),
    message_ids: Array.isArray(row.message_ids)
      ? row.message_ids.map(Number).filter(Number.isSafeInteger)
      : [],
    action_message_id: Number(row.action_message_id) || null,
    bonus_action_message_id: Number(row.bonus_action_message_id) || null,
    movement_message_id: Number(row.movement_message_id) || null,
    trigger_message_id: trigger,
  }
}

export function playerTurnSlotForEconomy(economy: string | null | undefined): PlayerTurnSlot {
  const normalized = (economy || "").trim().toLocaleLowerCase("en-US")
  if (normalized === "reaction") {
    throw new Error("Реакция не входит в текущий ход.")
  }
  return normalized === "bonus_action" ? "bonus_action" : "action"
}

export async function playerTurnSlotForSpell(spellKey: string): Promise<PlayerTurnSlot> {
  const result = await supabase
    .from("spell_catalog")
    .select("casting_time")
    .eq("slug", spellKey)
    .maybeSingle()

  if (result.error) throw result.error

  const castingTime = String(result.data?.casting_time || "")
    .trim()
    .toLocaleLowerCase("ru-RU")

  if (castingTime.includes("реакц") || castingTime.includes("reaction")) {
    throw new Error("Заклинание-реакция не входит в текущий ход.")
  }

  if (castingTime.includes("бонус") || castingTime.includes("bonus")) {
    return "bonus_action"
  }

  return "action"
}

export function usePlayerTurnDraft({
  roomId,
  characterId,
  enabled,
}: {
  roomId: string
  characterId: string | null
  enabled: boolean
}) {
  const [draft, setDraft] = useState<PlayerTurnDraft | null>(null)
  const [description, setDescription] = useState("")
  const [movement, setMovement] = useState("")
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled || !characterId) {
      setDraft(null)
      setDescription("")
      setMovement("")
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await supabase.rpc("get_player_turn_draft_v1", {
        p_room_id: roomId,
        p_character_id: characterId,
      })
      if (result.error) throw result.error

      const next = draftFrom(result.data)
      setDraft(next)
      setDescription(next?.description || "")
      setMovement(next?.movement?.description || "")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Черновик хода не загрузился")
    } finally {
      setLoading(false)
    }
  }, [characterId, enabled, roomId])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(async ({
    actionEntry = draft?.action_entry || null,
    bonusActionEntry = draft?.bonus_action_entry || null,
    descriptionValue = description,
    movementValue = movement,
  }: {
    actionEntry?: PlayerTurnEntry | null
    bonusActionEntry?: PlayerTurnEntry | null
    descriptionValue?: string
    movementValue?: string
  } = {}) => {
    if (!enabled || !characterId) {
      throw new Error("Для очереди хода нужен персонаж игрока.")
    }

    const result = await supabase.rpc("save_player_turn_draft_v1", {
      p_room_id: roomId,
      p_character_id: characterId,
      p_action_entry: actionEntry,
      p_bonus_action_entry: bonusActionEntry,
      p_movement: movementValue.trim()
        ? { description: movementValue.trim() }
        : null,
      p_description: descriptionValue,
      p_expected_revision: draft?.revision ?? null,
    })

    if (result.error) throw result.error

    const next = draftFrom(result.data)
    if (!next) throw new Error("Сервер не вернул черновик хода.")
    setDraft(next)
    return next
  }, [characterId, description, draft, enabled, movement, roomId])

  const queueEntry = useCallback(async (
    slot: PlayerTurnSlot,
    entry: PlayerTurnEntry,
  ) => {
    setBusy(true)
    setError(null)
    try {
      const next = await save({
        actionEntry: slot === "action" ? entry : draft?.action_entry || null,
        bonusActionEntry:
          slot === "bonus_action"
            ? entry
            : draft?.bonus_action_entry || null,
      })
      return next
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Действие не добавлено в ход"
      setError(message)
      throw cause
    } finally {
      setBusy(false)
    }
  }, [draft, save])

  const clearEntry = useCallback(async (slot: PlayerTurnSlot) => {
    setBusy(true)
    setError(null)
    try {
      return await save({
        actionEntry: slot === "action" ? null : draft?.action_entry || null,
        bonusActionEntry:
          slot === "bonus_action" ? null : draft?.bonus_action_entry || null,
      })
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Действие не удалено"
      setError(message)
      throw cause
    } finally {
      setBusy(false)
    }
  }, [draft, save])

  const cancel = useCallback(async () => {
    if (!draft?.id) {
      setDescription("")
      setMovement("")
      return
    }

    setBusy(true)
    setError(null)
    try {
      const result = await supabase.rpc("cancel_player_turn_draft_v1", {
        p_draft_id: draft.id,
      })
      if (result.error) throw result.error
      setDraft(null)
      setDescription("")
      setMovement("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ход не очищен")
      throw cause
    } finally {
      setBusy(false)
    }
  }, [draft?.id])

  const submit = useCallback(async () => {
    setBusy(true)
    setError(null)

    try {
      const saved = await save()
      const turnCommandId = crypto.randomUUID()
      const result = await supabase.rpc("submit_player_turn_v1", {
        p_draft_id: saved.id,
        p_expected_revision: saved.revision,
        p_turn_command_id: turnCommandId,
      })

      if (result.error) throw result.error

      const submitted = submitResultFrom(result.data)
      setDraft(null)
      setDescription("")
      setMovement("")
      return submitted
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Ход не отправлен"
      setError(message)
      throw cause
    } finally {
      setBusy(false)
    }
  }, [save])

  const hasContent = useMemo(
    () =>
      Boolean(
        draft?.action_entry ||
        draft?.bonus_action_entry ||
        description.trim() ||
        movement.trim(),
      ),
    [description, draft?.action_entry, draft?.bonus_action_entry, movement],
  )

  return {
    draft,
    description,
    movement,
    loading,
    busy,
    error,
    hasContent,
    setDescription,
    setMovement,
    queueEntry,
    clearEntry,
    cancel,
    submit,
    reload: load,
  }
}
