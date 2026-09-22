import { useEffect, useMemo, useState } from "react"

import type { SnakeAction, SnakeActionInput, SnakeActionResult } from "../snake-engine"
import { SnakeTrigger } from "./SnakeProvider"
import type { CharacterQuest } from "./useCharacterQuests"
import {
  type QuestManagerCondition,
  type QuestManagerConditionGroup,
  type QuestManagerPlan,
  type QuestManagerStage,
  type QuestManagerTarget,
  useQuestManager,
} from "./useQuestManager"

type QuestFilter = "active" | "completed" | "failed"
type QuestLayer = "player" | "gm"

export type QuestManagerCatalog = {
  locations: Array<{ id: string; name: string }>
  npcs: Array<{ id: string; name: string }>
  items: Array<{ id: string; name: string }>
}

const FILTERS: Array<{ id: QuestFilter; label: string }> = [
  { id: "active", label: "Активные" },
  { id: "completed", label: "Завершённые" },
  { id: "failed", label: "Проваленные" },
]

const CONDITION_LABELS: Record<string, string> = {
  visit_location: "Посетить локацию",
  discover_location: "Обнаружить локацию",
  meet_npc: "Встретить NPC",
  talk_to_npc: "Поговорить с NPC",
  discover_npc: "Обнаружить NPC",
  inventory_has: "Иметь предмет",
  deliver_item: "Передать предмет",
  event_occurred: "Событие произошло",
  character_state: "Состояние персонажа",
  custom_narrative: "Сюжетное условие",
}

function inputText(input: SnakeActionInput, key: string) {
  const value = input && typeof input === "object" ? input[key] : undefined
  return typeof value === "string" ? value : ""
}

function inputBoolean(input: SnakeActionInput, key: string) {
  const value = input && typeof input === "object" ? input[key] : undefined
  return value === true
}

function inputNumber(input: SnakeActionInput, key: string, fallback = 1) {
  const value = input && typeof input === "object" ? Number(input[key]) : Number.NaN
  return Number.isFinite(value) ? value : fallback
}

function snakeResult(
  result: { ok: boolean; error?: string },
  notice: string,
): SnakeActionResult {
  return result.ok
    ? { type: "success", notice }
    : { type: "error", message: result.error || "Не удалось сохранить изменения." }
}

function inFilter(quest: CharacterQuest, filter: QuestFilter) {
  if (filter === "failed") {
    return quest.status === "failed" || quest.status === "cancelled"
  }
  return quest.status === filter
}

function statusLabel(quest: CharacterQuest) {
  if (quest.status === "draft") return "Черновик"
  if (quest.status === "completed") return "Завершён"
  if (quest.status === "failed") return "Провален"
  if (quest.status === "cancelled") return "Закрыт"
  return "Активен"
}

function stageStatusLabel(status: QuestManagerStage["status"]) {
  if (status === "planned") return "Запланирован"
  if (status === "active") return "Активен"
  if (status === "completed") return "Выполнен"
  if (status === "failed") return "Провален"
  return "Пропущен"
}

function targetKindLabel(kind: QuestManagerTarget["target_kind"]) {
  if (kind === "location") return "Локация"
  if (kind === "npc") return "NPC"
  return "Предмет"
}

function QuestCard({ quest }: { quest: CharacterQuest }) {
  const completed = quest.completed_stages

  return (
    <article
      className="u1-character-quests__card"
      data-status={quest.status}
    >
      <header className="u1-character-quests__card-head">
        <span>{statusLabel(quest)}</span>
        <small>
          {completed.length
            ? `Раскрыто этапов: ${completed.length}`
            : "История ещё не раскрыта"}
        </small>
      </header>

      <h3>{quest.title}</h3>

      {quest.player_brief ? (
        <p className="u1-character-quests__brief">{quest.player_brief}</p>
      ) : null}

      <div className="u1-character-quests__history">
        <span className="u1-character-quests__history-title">
          Пройденный путь
        </span>

        {completed.length ? (
          <ol>
            {completed.map((stage) => (
              <li key={stage.id}>
                <i aria-hidden="true">✓</i>
                <div>
                  {stage.player_title ? (
                    <strong>{stage.player_title}</strong>
                  ) : null}
                  {stage.completion_text ? (
                    <p>{stage.completion_text}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="u1-character-quests__empty-history">
            Выполненные этапы появятся здесь по мере прохождения.
          </p>
        )}
      </div>
    </article>
  )
}

function bindingLabel(
  target: QuestManagerTarget,
  catalog: QuestManagerCatalog,
) {
  if (target.target_kind === "location" && target.location_id) {
    return catalog.locations.find((item) => item.id === target.location_id)?.name
      || target.location_id
  }
  if (target.target_kind === "npc" && target.npc_character_id) {
    return catalog.npcs.find((item) => item.id === target.npc_character_id)?.name
      || target.npc_character_id
  }
  if (target.target_kind === "item" && target.item_definition_id) {
    return catalog.items.find((item) => item.id === target.item_definition_id)?.name
      || target.item_definition_id
  }
  return null
}

function targetCandidates(
  target: QuestManagerTarget,
  catalog: QuestManagerCatalog,
) {
  if (target.target_kind === "location") return catalog.locations
  if (target.target_kind === "npc") return catalog.npcs
  return catalog.items
}

function conditionTargetLabel(
  condition: QuestManagerCondition,
  targets: QuestManagerTarget[],
) {
  if (!condition.target_id) return null
  return targets.find((target) => target.id === condition.target_id)?.placeholder_label
    || condition.target_id
}

function GmQuestPlan({
  quest,
  plan,
  loading,
  error,
  catalog,
  manager,
  onReloadPublic,
}: {
  quest: CharacterQuest
  plan: QuestManagerPlan | null
  loading: boolean
  error: string | null
  catalog: QuestManagerCatalog
  manager: ReturnType<typeof useQuestManager>
  onReloadPublic: () => void
}) {
  async function mutateAndRefresh(
    work: () => Promise<{ ok: boolean; error?: string }>,
    notice: string,
    refreshPublic = false,
  ) {
    const result = await work()
    if (result.ok && refreshPublic) onReloadPublic()
    return snakeResult(result, notice)
  }

  if (loading) {
    return <div className="u1-character-quests__state">Загрузка внутреннего плана…</div>
  }

  if (error) {
    return (
      <div className="u1-character-quests__state" data-error>
        <strong>План квеста недоступен</strong>
        <span>{error}</span>
        <button type="button" onClick={() => void manager.reload()}>
          Повторить
        </button>
      </div>
    )
  }

  if (!plan) {
    return <div className="u1-character-quests__state">Выбери квест слева.</div>
  }

  const questActions: SnakeAction[] = [
    {
      id: "quest-edit-player",
      label: "Редактировать видимое игроку",
      surface: {
        kind: "editor",
        eyebrow: "Квест · игрок",
        title: plan.quest.title,
        size: { width: "wide", height: "tall" },
        fields: [
          { id: "title", label: "Название", type: "text", required: true },
          { id: "player_brief", label: "Текущая вводная игроку", type: "textarea" },
        ],
        initialValues: {
          title: plan.quest.title,
          player_brief: plan.quest.player_brief,
        },
        submitLabel: "Сохранить",
      },
      execute: ({ input }) => mutateAndRefresh(
        () => manager.updateQuestPublic({
          title: inputText(input, "title"),
          playerBrief: inputText(input, "player_brief"),
        }),
        "Публичная часть квеста обновлена.",
        true,
      ),
    },
    {
      id: "quest-edit-secret",
      label: "Скрытые заметки",
      surface: {
        kind: "editor",
        eyebrow: "Квест · только ГМ",
        title: "Скрытый план",
        size: { width: "wide", height: "tall" },
        fields: [
          { id: "internal_summary", label: "Внутренний замысел", type: "textarea" },
          { id: "gm_notes", label: "Заметки мастера", type: "textarea" },
          { id: "ai_directive", label: "Указания ИИ-ГМ", type: "textarea" },
        ],
        initialValues: plan.secret,
        submitLabel: "Сохранить",
      },
      execute: ({ input }) => mutateAndRefresh(
        () => manager.updateQuestSecret({
          internal_summary: inputText(input, "internal_summary"),
          gm_notes: inputText(input, "gm_notes"),
          ai_directive: inputText(input, "ai_directive"),
        }),
        "Скрытый план сохранён.",
      ),
    },
    {
      id: "quest-set-status",
      label: "Статус квеста",
      surface: {
        kind: "picker",
        eyebrow: "Квест · статус",
        title: plan.quest.title,
        initialSelection: plan.quest.status,
        items: [
          { id: "draft", label: "Черновик" },
          { id: "active", label: "Активен" },
          { id: "completed", label: "Завершён" },
          { id: "failed", label: "Провален" },
          { id: "cancelled", label: "Закрыт" },
        ],
        submitLabel: "Применить",
      },
      execute: ({ input }) => mutateAndRefresh(
        () => manager.setQuestStatus(inputText(input, "selection") as QuestManagerPlan["quest"]["status"]),
        "Статус квеста обновлён.",
        true,
      ),
    },
  ]

  function targetActionsFor(target: QuestManagerTarget): SnakeAction[] {
    const candidates = targetCandidates(target, catalog)

    return [
      {
        id: "quest-target-edit",
        label: "Редактировать цель",
        surface: {
          kind: "editor",
          eyebrow: targetKindLabel(target.target_kind),
          title: target.placeholder_label,
          fields: [
            { id: "placeholder_label", label: "Внутренняя пометка", type: "text", required: true },
            { id: "internal_note", label: "Что здесь задумано", type: "textarea" },
          ],
          initialValues: {
            placeholder_label: target.placeholder_label,
            internal_note: target.internal_note,
          },
        },
        execute: ({ input }) => mutateAndRefresh(
          () => manager.updateTarget(target.id, {
            placeholderLabel: inputText(input, "placeholder_label"),
            internalNote: inputText(input, "internal_note"),
          }),
          "Цель квеста обновлена.",
        ),
      },
      {
        id: "quest-target-bind",
        label: target.binding_state === "bound"
          ? "Изменить привязку"
          : "Привязать к миру",
        enabled: candidates.length > 0,
        disabledReason: "Подходящих сущностей в кампании пока нет.",
        surface: {
          kind: "picker",
          eyebrow: `${targetKindLabel(target.target_kind)} · привязка`,
          title: target.placeholder_label,
          initialSelection:
            target.location_id
            || target.npc_character_id
            || target.item_definition_id
            || undefined,
          items: candidates.map((candidate) => ({
            id: candidate.id,
            label: candidate.name,
          })),
          submitLabel: "Привязать",
        },
        execute: ({ input }) => mutateAndRefresh(
          () => manager.bindTarget(target, inputText(input, "selection")),
          "Placeholder привязан к сущности мира.",
        ),
      },
      {
        id: "quest-target-unbind",
        label: "Вернуть в placeholder",
        hidden: target.binding_state !== "bound",
        surface: {
          kind: "confirm",
          title: "Убрать привязку?",
          body: `«${target.placeholder_label}» снова станет только внутренней пометкой квеста.`,
          confirmLabel: "Отвязать",
        },
        execute: () => mutateAndRefresh(
          () => manager.bindTarget(target, null),
          "Цель снова стала placeholder.",
        ),
      },
    ]
  }

  return (
    <div className="u1-character-quests__gm-plan">
      <SnakeTrigger
        entity={{ type: "quest", id: plan.quest.id }}
        actions={questActions}
      >
        <section className="u1-character-quests__gm-summary">
          <div>
            <span>Внутренний план</span>
            <h3>{plan.quest.title}</h3>
          </div>
          <b data-status={plan.quest.status}>{statusLabel(quest)}</b>
          {plan.secret.internal_summary ? <p>{plan.secret.internal_summary}</p> : null}
          {plan.secret.gm_notes ? (
            <div className="u1-character-quests__secret-note">
              <strong>Заметки ГМ</strong>
              <p>{plan.secret.gm_notes}</p>
            </div>
          ) : null}
          {plan.secret.ai_directive ? (
            <div className="u1-character-quests__secret-note">
              <strong>Указания ИИ-ГМ</strong>
              <p>{plan.secret.ai_directive}</p>
            </div>
          ) : null}
        </section>
      </SnakeTrigger>

      <section className="u1-character-quests__gm-section">
        <header>
          <span>Этапы</span>
          <i>{plan.stages.length}</i>
        </header>

        <div className="u1-character-quests__gm-stages">
          {plan.stages.map((stage) => {
            const stageTargets = plan.targets.filter((target) => target.stage_id === stage.id)
            const stageGroups = plan.condition_groups.filter((group) => group.stage_id === stage.id)

            const stageActions: SnakeAction[] = [
              {
                id: "quest-stage-edit-player",
                label: "Редактировать публичный результат",
                surface: {
                  kind: "editor",
                  eyebrow: `Этап ${stage.position + 1} · игрок`,
                  title: stage.secret.internal_title || stage.player_title || stage.stage_key,
                  fields: [
                    { id: "player_title", label: "Название после раскрытия", type: "text" },
                    { id: "completion_text", label: "Что узнает игрок после выполнения", type: "textarea" },
                  ],
                  initialValues: {
                    player_title: stage.player_title,
                    completion_text: stage.completion_text,
                  },
                },
                execute: ({ input }) => mutateAndRefresh(
                  () => manager.updateStagePublic(stage.id, {
                    playerTitle: inputText(input, "player_title"),
                    completionText: inputText(input, "completion_text"),
                  }),
                  "Публичный результат этапа обновлён.",
                  true,
                ),
              },
              {
                id: "quest-stage-edit-secret",
                label: "Скрытый план этапа",
                surface: {
                  kind: "editor",
                  eyebrow: `Этап ${stage.position + 1} · только ГМ`,
                  title: stage.secret.internal_title || stage.stage_key,
                  size: { width: "wide", height: "tall" },
                  fields: [
                    { id: "internal_title", label: "Внутреннее название", type: "text" },
                    { id: "objective", label: "Что должно произойти", type: "textarea" },
                    { id: "gm_notes", label: "Заметки мастера", type: "textarea" },
                  ],
                  initialValues: stage.secret,
                },
                execute: ({ input }) => mutateAndRefresh(
                  () => manager.updateStageSecret(stage.id, {
                    internal_title: inputText(input, "internal_title"),
                    objective: inputText(input, "objective"),
                    gm_notes: inputText(input, "gm_notes"),
                  }),
                  "Скрытый план этапа сохранён.",
                ),
              },
              {
                id: "quest-stage-status",
                label: "Статус этапа",
                surface: {
                  kind: "picker",
                  eyebrow: `Этап ${stage.position + 1}`,
                  title: "Статус этапа",
                  initialSelection: stage.status,
                  items: [
                    { id: "planned", label: "Запланирован" },
                    { id: "active", label: "Активен" },
                    { id: "completed", label: "Выполнен" },
                    { id: "failed", label: "Провален" },
                    { id: "skipped", label: "Пропущен" },
                  ],
                  submitLabel: "Применить",
                },
                execute: ({ input }) => mutateAndRefresh(
                  () => manager.setStageStatus(
                    stage.id,
                    inputText(input, "selection") as QuestManagerStage["status"],
                  ),
                  "Статус этапа обновлён.",
                  true,
                ),
              },
            ]

            return (
              <SnakeTrigger
                key={stage.id}
                entity={{ type: "quest-stage", id: stage.id }}
                actions={stageActions}
              >
                <article
                  className="u1-character-quests__gm-stage"
                  data-status={stage.status}
                >
                  <header>
                    <span>Этап {stage.position + 1}</span>
                    <b>{stageStatusLabel(stage.status)}</b>
                  </header>
                  <h4>
                    {stage.secret.internal_title
                      || stage.player_title
                      || stage.stage_key}
                  </h4>

                  {stage.secret.objective ? (
                    <p className="u1-character-quests__gm-objective">
                      {stage.secret.objective}
                    </p>
                  ) : null}

                  {stage.secret.gm_notes ? (
                    <p className="u1-character-quests__gm-note">
                      {stage.secret.gm_notes}
                    </p>
                  ) : null}

                  {stage.player_title || stage.completion_text ? (
                    <div className="u1-character-quests__gm-player-result">
                      <span>Игрок увидит после выполнения</span>
                      {stage.player_title ? <strong>{stage.player_title}</strong> : null}
                      {stage.completion_text ? <p>{stage.completion_text}</p> : null}
                    </div>
                  ) : null}

                  {stageTargets.length ? (
                    <div className="u1-character-quests__gm-subsection">
                      <span>Связанные цели</span>
                      <div className="u1-character-quests__gm-targets">
                        {stageTargets.map((target) => {
                          const bound = bindingLabel(target, catalog)
                          const targetActions = targetActionsFor(target)

                          return (
                            <SnakeTrigger
                              key={target.id}
                              entity={{ type: "quest-target", id: target.id }}
                              actions={targetActions}
                            >
                              <div
                                className="u1-character-quests__gm-target"
                                data-binding={target.binding_state}
                              >
                                <div>
                                  <span>{targetKindLabel(target.target_kind)}</span>
                                  <strong>{target.placeholder_label}</strong>
                                </div>
                                <i>
                                  {bound
                                    ? `→ ${bound}`
                                    : "Не создано в мире"}
                                </i>
                                {target.internal_note ? <p>{target.internal_note}</p> : null}
                              </div>
                            </SnakeTrigger>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {stageGroups.length ? (
                    <div className="u1-character-quests__gm-subsection">
                      <span>Условия выполнения</span>
                      <div className="u1-character-quests__gm-conditions">
                        {stageGroups.map((group) => {
                          const groupConditions = plan.conditions
                            .filter((condition) => condition.group_id === group.id)
                            .sort((a, b) => a.position - b.position)

                          const groupActions: SnakeAction[] = [{
                            id: "quest-condition-group-mode",
                            label: "Логика группы",
                            surface: {
                              kind: "picker",
                              eyebrow: "Условия этапа",
                              title: group.group_key,
                              initialSelection: group.mode,
                              items: [
                                { id: "all", label: "Все условия (AND)" },
                                { id: "any", label: "Любое условие (OR)" },
                              ],
                              submitLabel: "Применить",
                            },
                            execute: ({ input }) => mutateAndRefresh(
                              () => manager.setConditionGroupMode(
                                group.id,
                                inputText(input, "selection") === "any" ? "any" : "all",
                              ),
                              "Логика группы условий обновлена.",
                            ),
                          }]

                          return (
                            <SnakeTrigger
                              key={group.id}
                              entity={{ type: "quest-condition-group", id: group.id }}
                              actions={groupActions}
                            >
                              <div className="u1-character-quests__gm-condition-group">
                                <header>
                                  <strong>{group.group_key}</strong>
                                  <span>{group.mode === "all" ? "ВСЕ" : "ЛЮБОЕ"}</span>
                                </header>

                                {groupConditions.map((condition) => {
                                  const conditionActions: SnakeAction[] = [{
                                    id: "quest-condition-edit",
                                    label: "Редактировать условие",
                                    surface: {
                                      kind: "editor",
                                      eyebrow: "Quest Engine · условие",
                                      title: CONDITION_LABELS[condition.condition_type] || condition.condition_type,
                                      fields: [
                                        { id: "required_quantity", label: "Количество", type: "number" },
                                        { id: "negated", label: "Инвертировать условие", type: "checkbox" },
                                        { id: "params_json", label: "Дополнительные параметры JSON", type: "textarea" },
                                      ],
                                      initialValues: {
                                        required_quantity: condition.required_quantity,
                                        negated: condition.negated,
                                        params_json: JSON.stringify(condition.params, null, 2),
                                      },
                                    },
                                    execute: async ({ input }) => {
                                      let params: Record<string, unknown> = {}
                                      try {
                                        const parsed = JSON.parse(inputText(input, "params_json") || "{}")
                                        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                                          return { type: "error", message: "params должен быть JSON-объектом." }
                                        }
                                        params = parsed as Record<string, unknown>
                                      } catch {
                                        return { type: "error", message: "В params некорректный JSON." }
                                      }

                                      return mutateAndRefresh(
                                        () => manager.updateCondition(condition.id, {
                                          requiredQuantity: inputNumber(input, "required_quantity", 1),
                                          negated: inputBoolean(input, "negated"),
                                          params,
                                        }),
                                        "Условие обновлено.",
                                      )
                                    },
                                  }]

                                  return (
                                    <SnakeTrigger
                                      key={condition.id}
                                      entity={{ type: "quest-condition", id: condition.id }}
                                      actions={conditionActions}
                                    >
                                      <div className="u1-character-quests__gm-condition">
                                        <span>
                                          {condition.negated ? "НЕ · " : ""}
                                          {CONDITION_LABELS[condition.condition_type]
                                            || condition.condition_type}
                                        </span>
                                        <strong>
                                          {conditionTargetLabel(condition, plan.targets) || "Без target"}
                                          {condition.required_quantity > 1
                                            ? ` ×${condition.required_quantity}`
                                            : ""}
                                        </strong>
                                      </div>
                                    </SnakeTrigger>
                                  )
                                })}
                              </div>
                            </SnakeTrigger>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </article>
              </SnakeTrigger>
            )
          })}
        </div>
      </section>

      {plan.targets.some((target) => !target.stage_id) ? (
        <section className="u1-character-quests__gm-section">
          <header>
            <span>Цели всего квеста</span>
          </header>
          <div className="u1-character-quests__gm-targets">
            {plan.targets
              .filter((target) => !target.stage_id)
              .map((target) => (
                <SnakeTrigger
                  key={target.id}
                  entity={{ type: "quest-target", id: target.id }}
                  actions={targetActionsFor(target)}
                >
                  <div
                    className="u1-character-quests__gm-target"
                    data-binding={target.binding_state}
                  >
                    <div>
                      <span>{targetKindLabel(target.target_kind)}</span>
                      <strong>{target.placeholder_label}</strong>
                    </div>
                    <i>{bindingLabel(target, catalog) || "Не создано в мире"}</i>
                    {target.internal_note ? <p>{target.internal_note}</p> : null}
                  </div>
                </SnakeTrigger>
              ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default function CharacterSheetQuests({
  quests,
  loading,
  error,
  onReload,
  canManage = false,
  managerCatalog = { locations: [], npcs: [], items: [] },
}: {
  quests: CharacterQuest[]
  loading: boolean
  error: string | null
  onReload: () => void
  canManage?: boolean
  managerCatalog?: QuestManagerCatalog
}) {
  const [filter, setFilter] = useState<QuestFilter>("active")
  const [layer, setLayer] = useState<QuestLayer>("player")
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null)

  const playerVisible = useMemo(
    () => quests.filter((quest) => quest.status !== "draft"),
    [quests],
  )

  const counts = useMemo(() => ({
    active: playerVisible.filter((quest) => inFilter(quest, "active")).length,
    completed: playerVisible.filter((quest) => inFilter(quest, "completed")).length,
    failed: playerVisible.filter((quest) => inFilter(quest, "failed")).length,
  }), [playerVisible])

  const visible = useMemo(
    () => playerVisible.filter((quest) => inFilter(quest, filter)),
    [filter, playerVisible],
  )

  useEffect(() => {
    if (!canManage && layer === "gm") setLayer("player")
  }, [canManage, layer])

  useEffect(() => {
    if (layer !== "gm") return
    if (selectedQuestId && quests.some((quest) => quest.id === selectedQuestId)) return
    setSelectedQuestId(quests[0]?.id || null)
  }, [layer, quests, selectedQuestId])

  const manager = useQuestManager(
    selectedQuestId,
    canManage && layer === "gm",
  )

  if (loading) {
    return (
      <section className="u1-character-quests" aria-label="Квесты">
        <div className="u1-character-quests__state">Загрузка квестов…</div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="u1-character-quests" aria-label="Квесты">
        <div className="u1-character-quests__state" data-error>
          <strong>Квесты недоступны</strong>
          <span>{error}</span>
          <button type="button" onClick={onReload}>Повторить</button>
        </div>
      </section>
    )
  }

  const selectedQuest =
    quests.find((quest) => quest.id === selectedQuestId)
    || null

  return (
    <section
      className="u1-character-quests"
      aria-label="Квесты"
      data-layer={layer}
    >
      <header className="u1-character-quests__header">
        <div className="u1-character-quests__title-row">
          <div>
            <span>{layer === "gm" ? "Quest Engine · GM" : "Журнал персонажа"}</span>
            <h2>Квесты</h2>
          </div>

          {canManage ? (
            <div className="u1-character-quests__layer-switch">
              <button
                type="button"
                data-active={layer === "player" || undefined}
                onClick={() => setLayer("player")}
              >
                Игрок
              </button>
              <button
                type="button"
                data-active={layer === "gm" || undefined}
                onClick={() => setLayer("gm")}
              >
                Слой ГМ
              </button>
            </div>
          ) : null}
        </div>

        <p>
          {layer === "gm"
            ? "Полный внутренний план. Долгий тап по квесту, этапу, цели или условию открывает управление через Снейка."
            : "Здесь остаётся только то, что персонаж уже знает. Будущие этапы и скрытые условия не загружаются в этот интерфейс."}
        </p>
      </header>

      {layer === "gm" && canManage ? (
        <div className="u1-character-quests__gm-layout">
          <aside className="u1-character-quests__gm-list">
            <header>
              <span>Все квесты</span>
              <i>{quests.length}</i>
            </header>
            {quests.length ? quests.map((quest) => (
              <button
                key={quest.id}
                type="button"
                data-active={selectedQuestId === quest.id || undefined}
                data-status={quest.status}
                onClick={() => setSelectedQuestId(quest.id)}
              >
                <span>{statusLabel(quest)}</span>
                <strong>{quest.title}</strong>
                <small>{quest.player_brief || "Без публичной вводной"}</small>
              </button>
            )) : (
              <div className="u1-character-quests__empty">
                У персонажа пока нет квестов.
              </div>
            )}
          </aside>

          <main className="u1-character-quests__gm-main">
            {selectedQuest ? (
              <GmQuestPlan
                quest={selectedQuest}
                plan={manager.plan}
                loading={manager.loading}
                error={manager.error}
                catalog={managerCatalog}
                manager={manager}
                onReloadPublic={onReload}
              />
            ) : (
              <div className="u1-character-quests__state">
                Квесты пока не созданы.
              </div>
            )}
          </main>
        </div>
      ) : (
        <>
          <nav className="u1-character-quests__filters" aria-label="Фильтр квестов">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-active={filter === item.id || undefined}
                onClick={() => setFilter(item.id)}
              >
                <span>{item.label}</span>
                <i>{counts[item.id]}</i>
              </button>
            ))}
          </nav>

          <div className="u1-character-quests__list">
            {visible.length ? (
              visible.map((quest) => <QuestCard key={quest.id} quest={quest} />)
            ) : (
              <div className="u1-character-quests__empty">
                {filter === "active"
                  ? "Активных квестов нет."
                  : filter === "completed"
                    ? "Завершённых квестов пока нет."
                    : "Проваленных квестов нет."}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
