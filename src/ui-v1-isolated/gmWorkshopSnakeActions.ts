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
  WorkshopInvite,
  WorkshopLocation,
  WorkshopMember,
  WorkshopNpcHabitat,
  WorkshopOperations,
} from "./useGMWorkshopData"
import type {
  CharacterTemplateAssignment,
  RuleTemplate,
} from "../rule-templates/types.ts"

function selection(input: SnakeActionInput) {
  return typeof input?.selection === "string" ? input.selection : ""
}

function actionResult(ok: boolean, error: string | undefined, notice: string) {
  return ok
    ? { type: "success" as const, notice }
    : { type: "error" as const, message: error || "Действие не выполнено." }
}

export function createWorkshopCharacterEditAction({
  character,
  operations,
}: {
  character: WorkshopCharacter
  operations: WorkshopOperations
}): SnakeAction {
  return {
    id: "edit-character",
    label: "Редактировать",
    surface: {
      kind: "editor",
      eyebrow: character.publicationState === "draft" ? "Черновик" : "Персонаж",
      title: character.name,
      size: { width: "wide", height: "tall" },
      fields: [
        { id: "name", label: "Имя", type: "text", required: true },
        {
          id: "characterType",
          label: "Тип",
          type: "select",
          options: [
            { value: "pc", label: "PC" },
            { value: "npc", label: "NPC" },
          ],
        },
        { id: "bio", label: "Описание", type: "textarea" },
      ],
      initialValues: {
        name: character.name,
        characterType: character.characterType,
        bio: character.bio,
      },
      submitLabel: "Сохранить",
    },
    execute: async ({ input }) => {
      const nextType = input?.characterType === "npc" ? "npc" : "pc"
      const response = await operations.updateCharacter(character.id, {
        name: String(input?.name || character.name),
        characterType: nextType,
        bio: String(input?.bio || ""),
      })
      return actionResult(response.ok, response.error, "Персонаж сохранён.")
    },
  }
}

export function createWorkshopDraftCharacterDeleteAction({
  character,
  operations,
}: {
  character: WorkshopCharacter
  operations: WorkshopOperations
}): SnakeAction {
  return {
    id: "delete-draft-character",
    label: "Удалить черновик",
    tone: "danger",
    surface: {
      kind: "confirm",
      eyebrow: "Черновик",
      title: "Удалить «" + character.name + "»?",
      body: "Черновик будет удалён без публикации в кампанию.",
      confirmLabel: "Удалить",
    },
    execute: async () => {
      const response = await operations.deleteCharacter(character.id)
      return actionResult(response.ok, response.error, "Черновик удалён.")
    },
  }
}

export function createWorkshopPcUnassignAction({
  character,
  operations,
}: {
  character: WorkshopCharacter
  operations: WorkshopOperations
}): SnakeAction {
  return {
    id: "unassign",
    label: "Снять назначение",
    surface: {
      kind: "confirm",
      eyebrow: "Доступ к PC",
      title: "Снять «" + character.name + "» с игрока?",
      body: "Если этот PC был активным, активный выбор игрока будет снят.",
      confirmLabel: "Снять",
    },
    execute: async () => {
      const response = await operations.assignCharacter(character.id, null)
      return actionResult(response.ok, response.error, "Персонаж снова свободен.")
    },
  }
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
    createWorkshopCharacterEditAction({ character, operations }),
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
    actions.push(createWorkshopDraftCharacterDeleteAction({ character, operations }))
    return actions
  }

  if (character.characterType === "pc") {
    const assignedMember = character.assignedUserId
      ? members.find((member) => member.userId === character.assignedUserId) || null
      : null
    const isActive = assignedMember?.activeCharacterId === character.id

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
          ? [createWorkshopPcUnassignAction({ character, operations })]
          : []),
        ...(assignedMember && character.lifeState === "alive"
          ? [{
              id: "active",
              label: isActive ? "Снять активность" : "Сделать активным",
              execute: async () => {
                const response = await operations.setActiveCharacter(
                  assignedMember.userId,
                  isActive ? null : character.id,
                )
                return actionResult(
                  response.ok,
                  response.error,
                  isActive
                    ? "Активный персонаж снят."
                    : "Персонаж выбран активным.",
                )
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

export function createWorkshopMemberAssignAction({
  member,
  freePc,
  operations,
}: {
  member: WorkshopMember
  freePc: WorkshopCharacter[]
  operations: WorkshopOperations
}): SnakeAction {
  return {
    id: "assign-free-pc",
    label: "Назначить свободного PC",
    enabled: freePc.length > 0,
    disabledReason: "Нет свободных живых PC.",
    surface: {
      kind: "picker",
      eyebrow: "Партия",
      title: "Назначить персонажа · " + member.displayName,
      items: freePc.map((character) => ({
        id: character.id,
        label: character.name,
        description: character.characterClass + " · " + character.level,
      })),
      submitLabel: "Назначить",
    },
    execute: async ({ input }) => {
      const characterId = selection(input)
      const response = await operations.assignCharacter(characterId, member.userId)
      return actionResult(
        response.ok,
        response.error,
        "Персонаж назначен. Активность выбирается отдельно.",
      )
    },
  }
}

export function createWorkshopMemberRoleAction({
  member,
  operations,
}: {
  member: WorkshopMember
  operations: WorkshopOperations
}): SnakeAction {
  const nextRole = member.role === "gm" ? "player" : "gm"
  return {
    id: "change-role",
    label: nextRole === "gm" ? "Сделать GM" : "Сделать игроком",
    surface: {
      kind: "confirm",
      eyebrow: "Партия · роль",
      title: member.displayName,
      body: nextRole === "gm"
        ? "Игрок получит полномочия GM в кампании. Владение кампанией это не меняет."
        : "У участника будут сняты полномочия GM. Владение кампанией это не меняет.",
      confirmLabel: nextRole === "gm" ? "Сделать GM" : "Сделать игроком",
    },
    execute: async () => {
      const response = await operations.setMemberRole(member.userId, nextRole)
      return actionResult(response.ok, response.error, "Роль участника изменена.")
    },
  }
}

export function createWorkshopMemberActions({
  member,
  characters,
  operations,
  canChangeRole,
  onOpen,
}: {
  member: WorkshopMember
  characters: WorkshopCharacter[]
  operations: WorkshopOperations
  canChangeRole: boolean
  onOpen: () => void
}): SnakeAction[] {
  const assigned = characters.filter(
    (character) =>
      character.publicationState === "campaign" &&
      character.characterType === "pc" &&
      character.assignedUserId === member.userId,
  )
  const freePc = characters.filter(
    (character) =>
      character.publicationState === "campaign" &&
      character.characterType === "pc" &&
      character.lifeState === "alive" &&
      !character.assignedUserId,
  )
  const livingAssigned = assigned.filter((character) => character.lifeState === "alive")

  const characterChildren: SnakeAction[] = [
    createWorkshopMemberAssignAction({ member, freePc, operations }),
  ]

  if (livingAssigned.length > 0) {
    characterChildren.push({
      id: "active-character",
      label: "Активный персонаж",
      kind: "branch",
      children: [
        ...livingAssigned.map((character): SnakeAction => ({
          id: "active-" + character.id,
          label: member.activeCharacterId === character.id
            ? "✓ " + character.name
            : character.name,
          enabled: member.activeCharacterId !== character.id,
          disabledReason: "Этот персонаж уже активен.",
          execute: async () => {
            const response = await operations.setActiveCharacter(
              member.userId,
              character.id,
            )
            return actionResult(response.ok, response.error, "Активный персонаж изменён.")
          },
        })),
        ...(member.activeCharacterId
          ? [{
              id: "clear-active",
              label: "Снять активность",
              execute: async () => {
                const response = await operations.setActiveCharacter(member.userId, null)
                return actionResult(response.ok, response.error, "Активный персонаж снят.")
              },
            } satisfies SnakeAction]
          : []),
      ],
    })
  }

  const actions: SnakeAction[] = [
    {
      id: "open-member",
      label: "Открыть участника",
      execute: () => {
        onOpen()
        return { type: "success" }
      },
    },
    {
      id: "characters",
      label: "Персонажи",
      kind: "branch",
      children: characterChildren,
    },
  ]

  if (canChangeRole && !member.isOwner) {
    actions.push(createWorkshopMemberRoleAction({ member, operations }))
  }

  return actions
}

export function createWorkshopInviteActions({
  invite,
  campaignId,
  operations,
}: {
  invite: WorkshopInvite | null
  campaignId: string
  operations: WorkshopOperations
}): SnakeAction[] {
  void campaignId
  const actions: SnakeAction[] = []

  if (invite) {
    actions.push({
      id: "copy-invite",
      label: "Копировать код",
      execute: async () => {
        if (!navigator.clipboard?.writeText) {
          return { type: "error", message: "Буфер обмена недоступен." }
        }
        try {
          await navigator.clipboard.writeText(invite.code)
          return { type: "success", notice: "Код скопирован." }
        } catch {
          return { type: "error", message: "Не удалось скопировать код." }
        }
      },
    })
  }

  actions.push({
    id: "create-invite",
    label: invite ? "Создать новый код" : "Создать код",
    surface: {
      kind: "confirm",
      eyebrow: "Партия",
      title: invite ? "Создать новый код?" : "Создать приглашение?",
      body: "Код рассчитан на вход игроков в эту кампанию.",
      confirmLabel: "Создать",
    },
    execute: async () => {
      const response = await operations.createInvite()
      if (!response.ok) {
        return {
          type: "error",
          message: response.error || "Не удалось создать приглашение.",
        }
      }

      if (response.code && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(response.code)
        } catch {
          // Новый код всё равно остаётся видимым в Party.
        }
      }

      return actionResult(true, undefined, "Код приглашения создан.")
    },
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
  const actions: SnakeAction[] = [
    {
      id: "open-definition",
      label: "Открыть",
      surface: {
        kind: "detail",
        eyebrow: definition.status === "draft" ? "Черновик" : "Библиотека",
        title: definition.name,
        body: definition.rulesText || definition.summary || "Описание пока не заполнено.",
      },
    },
  ]

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
