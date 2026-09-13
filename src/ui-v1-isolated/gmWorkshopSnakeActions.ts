import type {
  SnakeAction,
  SnakeActionInput,
} from "../snake-engine"
import type {
  ChasovoyDefinition,
  ChasovoyDefinitionKind,
  ChasovoyJson,
} from "../reference-engine/index.ts"
import type {
  WorkshopCharacter,
  WorkshopMember,
  WorkshopOperations,
} from "./useGMWorkshopData"

function selection(input: SnakeActionInput) {
  return typeof input?.selection === "string" ? input.selection : ""
}

function actionResult(ok: boolean, error: string | undefined, notice: string) {
  return ok
    ? { type: "success" as const, notice }
    : { type: "error" as const, message: error || "Действие не выполнено." }
}

export function createWorkshopCharacterActions({
  character,
  members,
  operations,
  onOpen,
}: {
  character: WorkshopCharacter
  members: WorkshopMember[]
  operations: WorkshopOperations
  onOpen: () => void
}): SnakeAction[] {
  const actions: SnakeAction[] = [
    {
      id: "open",
      label: "Открыть персонажа",
      execute: () => {
        onOpen()
        return { type: "success" }
      },
    },
  ]

  if (character.publicationState === "draft") {
    actions.push({
      id: "publish",
      label: "Отправить в кампанию",
      surface: character.characterType === "npc"
        ? {
            kind: "picker",
            eyebrow: "Черновик",
            title: "Когда игроки увидят NPC?",
            items: [
              {
                id: "discover",
                label: "При встрече",
                description: "Не появится в БД игрока до личной встречи.",
              },
              {
                id: "always",
                label: "Видно сразу",
                description: "Сразу доступен игрокам как известный персонаж мира.",
              },
            ],
            submitLabel: "Отправить",
          }
        : {
            kind: "confirm",
            eyebrow: "Черновик",
            title: "Отправить PC в кампанию?",
            body: "Персонаж станет доступен для назначения игроку, но сам никому не назначится и не станет активным.",
            confirmLabel: "Отправить",
          },
      execute: async ({ input }) => {
        const mode = character.characterType === "npc"
          ? (selection(input) as "always" | "discover") || "discover"
          : "always"
        const response = await operations.publishCharacter(character.id, mode)
        return actionResult(response.ok, response.error, "Персонаж отправлен в кампанию.")
      },
    })
    return actions
  }

  if (character.characterType === "pc") {
    actions.push({
      id: "access",
      label: "Доступ",
      kind: "branch",
      children: [
        {
          id: "assign",
          label: character.assignedUserId ? "Передать другому игроку" : "Назначить игроку",
          surface: {
            kind: "picker",
            eyebrow: "Доступ к PC",
            title: character.name,
            items: members.map((member) => ({
              id: member.userId,
              label: member.displayName,
              description: member.isOwner
                ? "Владелец"
                : member.role === "gm"
                  ? "GM"
                  : "Игрок",
            })),
            initialSelection: character.assignedUserId || undefined,
            submitLabel: character.assignedUserId ? "Передать" : "Назначить",
          },
          execute: async ({ input }) => {
            const userId = selection(input)
            const response = await operations.assignCharacter(character.id, userId || null)
            return actionResult(response.ok, response.error, "Назначение сохранено.")
          },
        },
        ...(character.assignedUserId
          ? [{
              id: "unassign",
              label: "Снять назначение",
              surface: {
                kind: "confirm" as const,
                eyebrow: "Доступ к PC",
                title: "Снять персонажа с игрока?",
                body: "Если этот PC был активным, активный выбор игрока будет снят.",
                confirmLabel: "Снять",
              },
              execute: async () => {
                const response = await operations.assignCharacter(character.id, null)
                return actionResult(response.ok, response.error, "Персонаж снова свободен.")
              },
            }]
          : []),
      ],
    })
  } else {
    actions.push({
      id: "visibility",
      label: "Видимость",
      kind: "branch",
      children: [
        {
          id: "discover",
          label: "При встрече",
          enabled: character.visibilityMode !== "discover",
          disabledReason: "Уже выбран режим «При встрече».",
          execute: async () => {
            const response = await operations.setNpcVisibility(character.id, "discover")
            return actionResult(response.ok, response.error, "NPC будет открыт после встречи.")
          },
        },
        {
          id: "always",
          label: "Видно сразу",
          enabled: character.visibilityMode !== "always",
          disabledReason: "NPC уже виден сразу.",
          execute: async () => {
            const response = await operations.setNpcVisibility(character.id, "always")
            return actionResult(response.ok, response.error, "NPC виден сразу.")
          },
        },
      ],
    })
  }

  actions.push({
    id: "state",
    label: "Состояние",
    kind: "branch",
    children: [
      {
        id: character.lifeState === "dead" ? "revive" : "kill",
        label: character.lifeState === "dead" ? "Вернуть в живые" : "Отметить мёртвым",
        tone: character.lifeState === "dead" ? "normal" : "danger",
        surface: {
          kind: "confirm",
          eyebrow: "Состояние персонажа",
          title: character.lifeState === "dead"
            ? "Вернуть «" + character.name + "»?"
            : "«" + character.name + "» погиб?",
          body: character.lifeState === "dead"
            ? "Персонаж снова сможет участвовать в активной кампании."
            : "Персонаж останется в истории и каталоге, но перестанет быть доступен как активный PC.",
          confirmLabel: character.lifeState === "dead" ? "Вернуть" : "Отметить мёртвым",
        },
        execute: async () => {
          const next = character.lifeState === "dead" ? "alive" : "dead"
          const response = await operations.setCharacterLifeState(character.id, next)
          return actionResult(
            response.ok,
            response.error,
            next === "dead" ? "Персонаж отмечен мёртвым." : "Персонаж снова жив.",
          )
        },
      },
    ],
  })

  return actions
}

export function createWorkshopDefinitionActions({
  definition,
  definitions,
  characters,
  operations,
}: {
  definition: ChasovoyDefinition
  definitions: ChasovoyDefinition[]
  characters: WorkshopCharacter[]
  operations: WorkshopOperations
}): SnakeAction[] {
  const living = characters.filter((character) =>
    character.publicationState === "campaign" &&
    character.lifeState === "alive"
  )
  const actions: SnakeAction[] = []

  if (definition.status === "draft") {
    actions.push({
      id: "publish",
      label: "Отправить в кампанию",
      surface: {
        kind: "confirm",
        eyebrow: "Черновик",
        title: definition.name,
        body: "Заготовка станет рабочим определением кампании. Она ничего автоматически не выдаст персонажам.",
        confirmLabel: "Отправить",
      },
      execute: async () => {
        const response = await operations.publishDefinition(definition.id)
        return actionResult(response.ok, response.error, "Заготовка отправлена в кампанию.")
      },
    })
  } else if (definition.status === "active") {
    actions.push({
      id: "issue",
      label: "Выдать персонажу",
      enabled: living.length > 0,
      disabledReason: "Нет живых персонажей кампании.",
      surface: {
        kind: "picker",
        eyebrow: "Выдать",
        title: definition.name,
        items: living.map((character) => ({
          id: character.id,
          label: character.name,
          description:
            (character.characterType === "pc" ? "PC" : "NPC") +
            " · " +
            character.characterClass +
            " " +
            character.level,
        })),
        submitLabel: "Выдать",
      },
      execute: async ({ input }) => {
        const characterId = selection(input)
        const response = await operations.issueDefinition(definition, characterId)
        return actionResult(response.ok, response.error, "Выдано персонажу.")
      },
    })

    if (
      definition.kind === "feature" ||
      definition.kind === "condition" ||
      definition.kind === "feat"
    ) {
      const items = definitions.filter(
        (candidate) => candidate.kind === "item" && candidate.status === "active",
      )

      actions.push({
        id: "link-item",
        label: "Привязать к предмету",
        enabled: items.length > 0,
        disabledReason: "В библиотеке нет активных предметов.",
        surface: {
          kind: "picker",
          eyebrow: "Привязать механику",
          title: definition.name,
          items: items.map((item) => ({
            id: item.id,
            label: item.name,
            description: item.summary || "Предмет",
          })),
          submitLabel: "Привязать",
        },
        execute: async ({ input }) => {
          const itemId = selection(input)
          const response = await operations.linkDefinitionToItem(definition, itemId)
          return actionResult(response.ok, response.error, "Механика привязана к предмету.")
        },
      })
    }
  }

  actions.push(
    {
      id: "edit",
      label: "Редактировать",
      surface: {
        kind: "editor",
        eyebrow: definition.status === "draft" ? "Черновик" : "Библиотека",
        title: definition.name,
        size: { width: "wide", height: "tall" },
        fields: [
          { id: "name", label: "Название", type: "text", required: true },
          { id: "summary", label: "Коротко", type: "text" },
          { id: "rulesText", label: "Описание / правила", type: "textarea" },
        ],
        initialValues: {
          name: definition.name,
          summary: definition.summary,
          rulesText: definition.rulesText,
        },
      },
      execute: async ({ input }) => {
        const response = await operations.reviseDefinition(definition.id, {
          name: String(input?.name || definition.name),
          summary: String(input?.summary || ""),
          rulesText: String(input?.rulesText || ""),
          data: definition.data,
          mechanics: definition.mechanics,
        })
        return actionResult(response.ok, response.error, "Новая ревизия сохранена.")
      },
    },
    {
      id: "clone",
      label: "Создать копию",
      execute: async () => {
        const response = await operations.cloneDefinition(definition)
        return actionResult(response.ok, response.error, "Копия создана в Черновике.")
      },
    },
  )

  if (definition.status !== "archived") {
    actions.push({
      id: "archive",
      label: "Архивировать",
      tone: "danger",
      surface: {
        kind: "confirm",
        eyebrow: "Библиотека",
        title: "Архивировать «" + definition.name + "»?",
        body: "Уже выданные экземпляры и способности у персонажей останутся.",
        confirmLabel: "Архивировать",
      },
      execute: async () => {
        const response = await operations.archiveDefinition(definition.id)
        return actionResult(response.ok, response.error, "Определение архивировано.")
      },
    })
  }

  return actions
}

export function draftDefinitionFields(kind: ChasovoyDefinitionKind) {
  const common = [
    { id: "name", label: "Название", type: "text" as const, required: true },
    { id: "summary", label: "Коротко", type: "text" as const },
    { id: "rulesText", label: "Описание / правила", type: "textarea" as const },
  ]

  if (kind === "item") {
    return [
      ...common,
      {
        id: "category",
        label: "Категория",
        type: "select" as const,
        options: [
          { value: "equipment", label: "Экипировка" },
          { value: "consumable", label: "Расходник" },
          { value: "tool", label: "Инструмент" },
          { value: "quest", label: "Квестовый" },
          { value: "other", label: "Прочее" },
        ],
      },
    ]
  }

  if (kind === "spell") {
    return [
      ...common,
      { id: "spell_level", label: "Уровень", type: "number" as const },
      { id: "school", label: "Школа", type: "text" as const },
      { id: "casting_time", label: "Время накладывания", type: "text" as const },
      { id: "spell_range", label: "Дистанция", type: "text" as const },
      { id: "duration", label: "Длительность", type: "text" as const },
      { id: "components", label: "Компоненты", type: "text" as const },
      { id: "concentration", label: "Концентрация", type: "checkbox" as const },
      { id: "ritual", label: "Ритуал", type: "checkbox" as const },
    ]
  }

  return common
}

export function definitionInputFromSnake(
  kind: ChasovoyDefinitionKind,
  input: SnakeActionInput,
) {
  const values = input || {}
  const data: Record<string, ChasovoyJson> = {}

  if (kind === "item") {
    data.category = String(values.category || "other")
    data.quantity = 1
    data.usage_mode = "none"
  }

  if (kind === "spell") {
    data.spell_level = Number(values.spell_level || 0)
    data.school = String(values.school || "Особая")
    data.casting_time = String(values.casting_time || "1 действие")
    data.spell_range = String(values.spell_range || "На себя")
    data.duration = String(values.duration || "Мгновенно")
    data.components = String(values.components || "")
    data.concentration = Boolean(values.concentration)
    data.ritual = Boolean(values.ritual)
  }

  return {
    name: String(values.name || ""),
    summary: String(values.summary || ""),
    rulesText: String(values.rulesText || ""),
    data,
    mechanics: [] as ChasovoyJson,
  }
}
