import { useCallback, useEffect, useRef, useState } from "react"

import { supabase } from "../lib/supabase"

export type CharacterQuestStatus =
  | "draft"
  | "active"
  | "completed"
  | "failed"
  | "cancelled"

export type CharacterQuestCompletedStage = {
  id: string
  player_title: string
  completion_text: string
  completed_at: string | null
  position: number
}

export type CharacterQuest = {
  id: string
  title: string
  player_brief: string
  status: CharacterQuestStatus
  sort_order: number
  activated_at: string | null
  closed_at: string | null
  completed_stages: CharacterQuestCompletedStage[]
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function nullableText(value: unknown) {
  return typeof value === "string" && value ? value : null
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function status(value: unknown): CharacterQuestStatus {
  return ["draft", "active", "completed", "failed", "cancelled"].includes(String(value))
    ? value as CharacterQuestStatus
    : "active"
}

function completedStages(value: unknown): CharacterQuestCompletedStage[] {
  if (!Array.isArray(value)) return []

  return value
    .map((raw) => {
      const row = raw && typeof raw === "object"
        ? raw as Record<string, unknown>
        : {}

      return {
        id: text(row.id),
        player_title: text(row.player_title),
        completion_text: text(row.completion_text),
        completed_at: nullableText(row.completed_at),
        position: number(row.position),
      }
    })
    .filter((stage) => Boolean(stage.id))
    .sort((a, b) => a.position - b.position)
}

function parseQuest(raw: unknown): CharacterQuest | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const id = text(row.id)
  if (!id) return null

  return {
    id,
    title: text(row.title) || "Безымянный квест",
    player_brief: text(row.player_brief),
    status: status(row.status),
    sort_order: number(row.sort_order),
    activated_at: nullableText(row.activated_at),
    closed_at: nullableText(row.closed_at),
    completed_stages: completedStages(row.completed_stages),
  }
}

export function useCharacterQuests(characterId: string, enabled: boolean) {
  const loadedCharacterIdRef = useRef<string | null>(null)
  const loadSequenceRef = useRef(0)
  const [quests, setQuests] = useState<CharacterQuest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled || !characterId) return
    const sequence = ++loadSequenceRef.current

    if (loadedCharacterIdRef.current !== characterId) {
      setLoading(true)
    }
    setError(null)

    const { data, error: rpcError } = await supabase.rpc(
      "list_character_quests_v1",
      { p_character_id: characterId },
    )

    if (rpcError) {
      if (sequence !== loadSequenceRef.current) return
      setError(rpcError.message || "Не удалось загрузить квесты.")
      setLoading(false)
      return
    }

    const rows = Array.isArray(data)
      ? data.map(parseQuest).filter((quest): quest is CharacterQuest => Boolean(quest))
      : []

    if (sequence !== loadSequenceRef.current) return

    setQuests(rows)
    loadedCharacterIdRef.current = characterId
    setLoading(false)
  }, [characterId, enabled])

  useEffect(() => {
    loadSequenceRef.current += 1
    loadedCharacterIdRef.current = null
    setQuests([])
    setError(null)
  }, [characterId])

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [enabled, load])

  return {
    quests,
    loading,
    error,
    reload: load,
  }
}
