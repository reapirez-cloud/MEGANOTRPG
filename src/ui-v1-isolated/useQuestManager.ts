import { useCallback, useEffect, useRef, useState } from "react"

import { supabase } from "../lib/supabase"

export type QuestManagerSecret = {
  internal_summary: string
  gm_notes: string
  ai_directive: string
}

export type QuestManagerStageSecret = {
  internal_title: string
  objective: string
  gm_notes: string
}

export type QuestManagerStage = {
  id: string
  stage_key: string
  position: number
  status: "planned" | "active" | "completed" | "failed" | "skipped"
  player_title: string
  completion_text: string
  completed_at: string | null
  secret: QuestManagerStageSecret
}

export type QuestManagerTarget = {
  id: string
  quest_id: string
  stage_id: string | null
  target_key: string
  target_kind: "location" | "npc" | "item"
  placeholder_label: string
  internal_note: string
  binding_state: "placeholder" | "bound"
  location_id: string | null
  npc_character_id: string | null
  item_definition_id: string | null
}

export type QuestManagerConditionGroup = {
  id: string
  stage_id: string
  group_key: string
  mode: "all" | "any"
  position: number
}

export type QuestManagerCondition = {
  id: string
  group_id: string
  condition_key: string
  condition_type: string
  target_id: string | null
  required_quantity: number
  negated: boolean
  params: Record<string, unknown>
  position: number
}

export type QuestManagerPlan = {
  quest: {
    id: string
    campaign_id: string
    quest_key: string
    title: string
    player_brief: string
    status: "draft" | "active" | "completed" | "failed" | "cancelled"
    sort_order: number
    activated_at: string | null
    closed_at: string | null
  }
  secret: QuestManagerSecret
  stages: QuestManagerStage[]
  targets: QuestManagerTarget[]
  condition_groups: QuestManagerConditionGroup[]
  conditions: QuestManagerCondition[]
}

type MutationResult = { ok: boolean; error?: string }

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
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

function jsonObject(value: unknown) {
  return object(value)
}

function parsePlan(value: unknown): QuestManagerPlan | null {
  const root = object(value)
  const quest = object(root.quest)
  const questId = text(quest.id)
  if (!questId) return null

  const secret = object(root.secret)
  const stages = Array.isArray(root.stages) ? root.stages : []
  const targets = Array.isArray(root.targets) ? root.targets : []
  const groups = Array.isArray(root.condition_groups) ? root.condition_groups : []
  const conditions = Array.isArray(root.conditions) ? root.conditions : []

  return {
    quest: {
      id: questId,
      campaign_id: text(quest.campaign_id),
      quest_key: text(quest.quest_key),
      title: text(quest.title),
      player_brief: text(quest.player_brief),
      status: text(quest.status) as QuestManagerPlan["quest"]["status"],
      sort_order: number(quest.sort_order),
      activated_at: nullableText(quest.activated_at),
      closed_at: nullableText(quest.closed_at),
    },
    secret: {
      internal_summary: text(secret.internal_summary),
      gm_notes: text(secret.gm_notes),
      ai_directive: text(secret.ai_directive),
    },
    stages: stages.map((entry) => {
      const row = object(entry)
      const stageSecret = object(row.secret)
      return {
        id: text(row.id),
        stage_key: text(row.stage_key),
        position: number(row.position),
        status: text(row.status) as QuestManagerStage["status"],
        player_title: text(row.player_title),
        completion_text: text(row.completion_text),
        completed_at: nullableText(row.completed_at),
        secret: {
          internal_title: text(stageSecret.internal_title),
          objective: text(stageSecret.objective),
          gm_notes: text(stageSecret.gm_notes),
        },
      }
    }).filter((stage) => Boolean(stage.id)),
    targets: targets.map((entry) => {
      const row = object(entry)
      return {
        id: text(row.id),
        quest_id: text(row.quest_id),
        stage_id: nullableText(row.stage_id),
        target_key: text(row.target_key),
        target_kind: text(row.target_kind) as QuestManagerTarget["target_kind"],
        placeholder_label: text(row.placeholder_label),
        internal_note: text(row.internal_note),
        binding_state: text(row.binding_state) as QuestManagerTarget["binding_state"],
        location_id: nullableText(row.location_id),
        npc_character_id: nullableText(row.npc_character_id),
        item_definition_id: nullableText(row.item_definition_id),
      }
    }).filter((target) => Boolean(target.id)),
    condition_groups: groups.map((entry) => {
      const row = object(entry)
      return {
        id: text(row.id),
        stage_id: text(row.stage_id),
        group_key: text(row.group_key),
        mode: text(row.mode) === "any" ? "any" : "all",
        position: number(row.position),
      }
    }).filter((group) => Boolean(group.id)),
    conditions: conditions.map((entry) => {
      const row = object(entry)
      return {
        id: text(row.id),
        group_id: text(row.group_id),
        condition_key: text(row.condition_key),
        condition_type: text(row.condition_type),
        target_id: nullableText(row.target_id),
        required_quantity: Math.max(1, number(row.required_quantity)),
        negated: row.negated === true,
        params: jsonObject(row.params),
        position: number(row.position),
      }
    }).filter((condition) => Boolean(condition.id)),
  }
}

export function useQuestManager(
  questId: string | null,
  enabled: boolean,
) {
  const sequenceRef = useRef(0)
  const [plan, setPlan] = useState<QuestManagerPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled || !questId) return
    const sequence = ++sequenceRef.current
    setLoading(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc(
      "read_quest_plan_v1",
      { p_quest_id: questId },
    )

    if (sequence !== sequenceRef.current) return

    if (rpcError) {
      setPlan(null)
      setError(rpcError.message || "Не удалось загрузить план квеста.")
      setLoading(false)
      return
    }

    const parsed = parsePlan(data)
    if (!parsed) {
      setPlan(null)
      setError("План квеста повреждён или пуст.")
      setLoading(false)
      return
    }

    setPlan(parsed)
    setLoading(false)
  }, [enabled, questId])

  useEffect(() => {
    sequenceRef.current += 1
    setPlan(null)
    setError(null)
    setLoading(false)
  }, [questId])

  useEffect(() => {
    if (!enabled || !questId) return
    void load()
  }, [enabled, load, questId])

  const mutate = useCallback(async (
    action: () => Promise<{ error: { message?: string } | null }>,
    fallback: string,
  ): Promise<MutationResult> => {
    if (!enabled || !questId) return { ok: false, error: "Недостаточно прав." }

    const result = await action()
    if (result.error) {
      return { ok: false, error: result.error.message || fallback }
    }

    await load()
    return { ok: true }
  }, [enabled, load, questId])

  const updateQuestPublic = useCallback((
    input: { title: string; playerBrief: string },
  ) => mutate(
    () => supabase
      .from("quests")
      .update({
        title: input.title.trim(),
        player_brief: input.playerBrief.trim(),
      })
      .eq("id", questId!),
    "Не удалось обновить публичную часть квеста.",
  ), [mutate, questId])

  const updateQuestSecret = useCallback((
    input: QuestManagerSecret,
  ) => mutate(
    () => supabase
      .from("quest_secrets")
      .upsert({
        quest_id: questId!,
        internal_summary: input.internal_summary.trim(),
        gm_notes: input.gm_notes.trim(),
        ai_directive: input.ai_directive.trim(),
      }, { onConflict: "quest_id" }),
    "Не удалось сохранить скрытые заметки.",
  ), [mutate, questId])

  const setQuestStatus = useCallback((
    status: QuestManagerPlan["quest"]["status"],
  ) => {
    const now = new Date().toISOString()
    const closed = ["completed", "failed", "cancelled"].includes(status)
    return mutate(
      () => supabase
        .from("quests")
        .update({
          status,
          activated_at: status === "active" ? now : plan?.quest.activated_at || null,
          closed_at: closed ? now : null,
        })
        .eq("id", questId!),
      "Не удалось изменить статус квеста.",
    )
  }, [mutate, plan?.quest.activated_at, questId])

  const updateStagePublic = useCallback((
    stageId: string,
    input: { playerTitle: string; completionText: string },
  ) => mutate(
    () => supabase
      .from("quest_stages")
      .update({
        player_title: input.playerTitle.trim(),
        completion_text: input.completionText.trim(),
      })
      .eq("id", stageId)
      .eq("quest_id", questId!),
    "Не удалось обновить публичную часть этапа.",
  ), [mutate, questId])

  const updateStageSecret = useCallback((
    stageId: string,
    input: QuestManagerStageSecret,
  ) => mutate(
    () => supabase
      .from("quest_stage_secrets")
      .upsert({
        stage_id: stageId,
        internal_title: input.internal_title.trim(),
        objective: input.objective.trim(),
        gm_notes: input.gm_notes.trim(),
      }, { onConflict: "stage_id" }),
    "Не удалось сохранить скрытые данные этапа.",
  ), [mutate])

  const setStageStatus = useCallback((
    stageId: string,
    status: QuestManagerStage["status"],
  ) => mutate(
    () => supabase
      .from("quest_stages")
      .update({
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", stageId)
      .eq("quest_id", questId!),
    "Не удалось изменить статус этапа.",
  ), [mutate, questId])

  const updateTarget = useCallback((
    targetId: string,
    input: { placeholderLabel: string; internalNote: string },
  ) => mutate(
    () => supabase
      .from("quest_targets")
      .update({
        placeholder_label: input.placeholderLabel.trim(),
        internal_note: input.internalNote.trim(),
      })
      .eq("id", targetId)
      .eq("quest_id", questId!),
    "Не удалось обновить цель квеста.",
  ), [mutate, questId])

  const bindTarget = useCallback((
    target: QuestManagerTarget,
    entityId: string | null,
  ) => {
    const patch = target.target_kind === "location"
      ? { location_id: entityId }
      : target.target_kind === "npc"
        ? { npc_character_id: entityId }
        : { item_definition_id: entityId }

    return mutate(
      () => supabase
        .from("quest_targets")
        .update(patch)
        .eq("id", target.id)
        .eq("quest_id", questId!),
      "Не удалось привязать цель к сущности мира.",
    )
  }, [mutate, questId])

  const updateCondition = useCallback((
    conditionId: string,
    input: {
      requiredQuantity: number
      negated: boolean
      params: Record<string, unknown>
    },
  ) => mutate(
    () => supabase
      .from("quest_conditions")
      .update({
        required_quantity: Math.max(1, Math.floor(input.requiredQuantity || 1)),
        negated: input.negated,
        params: input.params,
      })
      .eq("id", conditionId),
    "Не удалось обновить условие.",
  ), [mutate])

  const setConditionGroupMode = useCallback((
    groupId: string,
    mode: "all" | "any",
  ) => mutate(
    () => supabase
      .from("quest_condition_groups")
      .update({ mode })
      .eq("id", groupId),
    "Не удалось изменить режим группы условий.",
  ), [mutate])

  return {
    plan,
    loading,
    error,
    reload: load,
    updateQuestPublic,
    updateQuestSecret,
    setQuestStatus,
    updateStagePublic,
    updateStageSecret,
    setStageStatus,
    updateTarget,
    bindTarget,
    updateCondition,
    setConditionGroupMode,
  }
}
