import { supabase } from "../../lib/supabase"

export type PlayerTurnSlot = "action" | "bonus_action" | "reaction"
export type PlayerTurnComponent = PlayerTurnSlot | "movement"

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
    | "movement"
  label: string
  commandId?: string
  slot?: PlayerTurnSlot
  [key: string]: unknown
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
  component_order: PlayerTurnComponent[]
  plan_entries: PlayerTurnEntry[]
  execution_state:
    | "draft"
    | "pending"
    | "executing"
    | "completed"
    | "interrupted"
    | "cancelled"
  execution_cursor: number
  executed_message_ids: number[]
  executed_reaction_command_ids: string[]
  declaration_message_id: number | null
  interruption_reason: string | null
  description: string
  audience_scope: "scene" | "direct_pc"
  recipient_character_ids: string[]
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
  trigger_message_id: number
  declaration_only: true
  plan_entry_count: number
  audience_scope: "scene" | "direct_pc"
  recipient_character_ids: string[]
}

function asDraft(value: unknown): PlayerTurnDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as PlayerTurnDraft
}

function asSubmitResult(value: unknown): PlayerTurnSubmitResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Сервер не вернул результат хода.")
  }
  const result = value as PlayerTurnSubmitResult
  if (!Number.isSafeInteger(Number(result.trigger_message_id))) {
    throw new Error("Сервер не вернул финальное сообщение хода.")
  }
  return result
}

export function playerTurnSlotForEconomy(economy: string): PlayerTurnSlot {
  const normalized = economy.trim().toLocaleLowerCase("ru-RU")
  if (normalized.includes("reaction") || normalized.includes("реакц")) {
    return "reaction"
  }
  return normalized.includes("bonus") || normalized.includes("бонус")
    ? "bonus_action"
    : "action"
}

export async function playerTurnSlotForSpell(
  spellKey: string,
): Promise<PlayerTurnSlot> {
  const result = await supabase
    .from("spell_catalog")
    .select("casting_time")
    .eq("slug", spellKey)
    .maybeSingle()

  if (result.error) throw result.error

  const castingTime = String(result.data?.casting_time || "")
    .trim()
    .toLocaleLowerCase("ru-RU")

  if (castingTime.includes("reaction") || castingTime.includes("реакц")) {
    return "reaction"
  }

  return castingTime.includes("bonus") || castingTime.includes("бонус")
    ? "bonus_action"
    : "action"
}

export function newPlayerTurnCommandId() {
  return crypto.randomUUID()
}

export function orderedPlayerTurnComponents(
  draft: PlayerTurnDraft | null,
): PlayerTurnComponent[] {
  if (!draft) return []

  const available = new Set<PlayerTurnComponent>()
  if (draft.action_entry) available.add("action")
  if (draft.bonus_action_entry) available.add("bonus_action")
  if (draft.movement?.description?.trim()) available.add("movement")

  const ordered: PlayerTurnComponent[] = []
  for (const component of draft.component_order || []) {
    if (available.has(component) && !ordered.includes(component)) {
      ordered.push(component)
    }
  }
  for (const component of ["action", "bonus_action", "movement"] as const) {
    if (available.has(component) && !ordered.includes(component)) {
      ordered.push(component)
    }
  }
  return ordered
}

export function playerTurnEntryCommandId(entry: PlayerTurnEntry) {
  return typeof entry.commandId === "string" && entry.commandId
    ? entry.commandId
    : ""
}

export function withPlayerTurnCommandId(entry: PlayerTurnEntry): PlayerTurnEntry {
  return playerTurnEntryCommandId(entry)
    ? entry
    : { ...entry, commandId: newPlayerTurnCommandId() }
}

export function reorderPlayerTurnEntries(
  entries: PlayerTurnEntry[],
  index: number,
  direction: -1 | 1,
) {
  const next = [...entries]
  const target = index + direction
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) {
    return next
  }
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function reorderPlayerTurnComponents(
  order: PlayerTurnComponent[],
  component: PlayerTurnComponent,
  direction: -1 | 1,
) {
  const next = [...order]
  const index = next.indexOf(component)
  const target = index + direction
  if (index < 0 || target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}


export async function loadPlayerTurnDraft({
  roomId,
  characterId,
}: {
  roomId: string
  characterId: string
}) {
  const result = await supabase.rpc("get_player_turn_draft_v1", {
    p_room_id: roomId,
    p_character_id: characterId,
  })
  if (result.error) throw result.error
  return asDraft(result.data)
}

export async function savePlayerTurnDraft({
  roomId,
  characterId,
  planEntries,
  description,
  expectedRevision,
  recipientCharacterIds = [],
}: {
  roomId: string
  characterId: string
  planEntries: PlayerTurnEntry[]
  description: string
  expectedRevision: number | null
  recipientCharacterIds?: string[]
}) {
  const result = await supabase.rpc("save_player_turn_draft_v3", {
    p_room_id: roomId,
    p_character_id: characterId,
    p_plan_entries: planEntries,
    p_description: description,
    p_expected_revision: expectedRevision,
    p_audience_scope: recipientCharacterIds.length ? "direct_pc" : "scene",
    p_recipient_character_ids: recipientCharacterIds,
  })
  if (result.error) throw result.error
  const draft = asDraft(result.data)
  if (!draft) throw new Error("Черновик хода не сохранён.")
  return draft
}

export async function cancelPlayerTurnDraft(draftId: string) {
  const result = await supabase.rpc("cancel_player_turn_draft_v1", {
    p_draft_id: draftId,
  })
  if (result.error) throw result.error
  return result.data === true
}

export async function submitPlayerTurnDraft({
  draftId,
  revision,
  turnCommandId,
  recipientCharacterIds = [],
}: {
  draftId: string
  revision: number
  turnCommandId: string
  recipientCharacterIds?: string[]
}) {
  const result = await supabase.rpc("submit_player_turn_stage12_v2", {
    p_draft_id: draftId,
    p_expected_revision: revision,
    p_turn_command_id: turnCommandId,
    p_recipient_character_ids: recipientCharacterIds,
  })
  if (result.error) throw result.error
  return asSubmitResult(result.data)
}
