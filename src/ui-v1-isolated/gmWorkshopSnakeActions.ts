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
        { id: "bio", label: "Описание", type: "textarea" },
      ],
      initialValues: {
        name: character.name,
        bio: character.bio,
      },
      submitLabel: "Сохранить",
    },
    execute: async ({ input }) => {
      const response = await operations.updateCharacter(character.id, {
        name: String(input?.name || character.name),
        bio: String(input?.bio || ""),
      })
      return actionResult(response.ok, response.error, "Персонаж сохранён.")
    },
  }
}


export function createWorkshopCharacterConvertAction({
  character,
  operations,
}: {
  character: WorkshopCharacter
  operations: WorkshopOperations
}): SnakeAction {
  const targetType = character.characterType === "pc" ? "npc" : "pc"
  const convertingToNpc = targetType === "npc"
  const published = character.publicationState === "campaign"

  return {
    id: "convert-character-type",
    label: convertingToNpc ? "Преобразовать в NPC" : "Преобразовать в PC",
    tone: "danger",
    surface: convertingToNpc && published
      ? {
          kind: "picker",
          eyebrow: "Тип персонажа · преобразование",
          title: "Преобразовать «" + character.name + "» в NPC? Назначение и активность будут сняты.",
          items: [
            {
              id: "discover",
              label: "При встрече",
              description: "NPC откроется игрокам после личной встречи.",
            },
            {
              id: "always",
              label: "Видно сразу",
              description: "NPC сразу станет известен игрокам.",
            },
          ],
          initialSelection: "discover",
          submitLabel: "Преобразовать",
        }
      : {
          kind: "confirm",
          eyebrow: "Тип персонажа · преобразование",
          title:
            "Преобразовать «" +
            character.name +
            "» в " +
            (convertingToNpc ? "NPC" : "PC") +
            "?",
          body: convertingToNpc
            ? "Черновик останется приватным и неназначенным."
            : "Обычные зоны NPC и записи обнаружения будут удалены. PC останется без назначения игроку.",
          confirmLabel: "Преобразовать",
        },
    execute: async ({ input }) => {
      const visibility =
        convertingToNpc && published
          ? (selection(input) as "always" | "discover") || "discover"
          : undefined
      const response = await operations.convertCharacterType(
        character.id,
        targetType,
        visibility,
      )
      return actionResult(
        response.ok,
        response.error,
        convertingToNpc
          ? "Персонаж преобразован в NPC."
          : "Персонаж преобразован в PC.",
      )
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
  templates,
  assignments,
  locations,
  npcHabitats,
  operations,
  onOpen,
}: {
  character: WorkshopCharacter
  members: WorkshopMember[]
  templates: RuleTemplate[]
  assignments: CharacterTemplateAssignment[]
  locations: WorkshopLocation[]
  npcHabitats: WorkshopNpcHabitat[]
  operations: WorkshopOperations
  onOpen: () => void
}): SnakeAction[] {
  const characterAssignments = assignments.filter(
    (assignment) => assignment.character_id === character.id,
  )
  const assignedTemplateIds = new Set(
    characterAssignments.map((assignment) => assignment.template_id),
  )
  const classTemplates = templates.filter(
    (template) => template.kind === "class" && template.is_active,
  )
  const subclassTemplates = templates.filter(
    (template) => template.kind === "subclass" && template.is_active,
  )
  const classAssignments = characterAssignments
    .map((assignment) => ({
      assignment,
      template: templates.find((template) => template.id === assignment.template_id) || null,
    }))
    .filter((entry) => entry.template?.kind === "class") as Array<{
      assignment: CharacterTemplateAssignment
      template: RuleTemplate
    }>
  const subclassAssignments = characterAssignments
    .map((assignment) => ({
      assignment,
      template: templates.find((template) => template.id === assignment.template_id) || null,
    }))
    .filter((entry) => entry.template?.kind === "subclass") as Array<{
      assignment: CharacterTemplateAssignment
      template: RuleTemplate
    }>

  const classChildren: SnakeAction[] = []

  const availableClasses = classTemplates.filter(
    (template) => !assignedTemplateIds.has(template.id),
  )
  classChildren.push({
    id: "add-class",
    label: classAssignments.length ? "Добавить ещё класс" : "Выбрать класс",
    enabled: availableClasses.length > 0,
    disabledReason: "Все доступные классы уже назначены.",
    surface: {
      kind: "editor",
      eyebrow: "Character Engine",
      title: classAssignments.length ? "Добавить класс" : "Выбрать класс персонажа",
      fields: [
        {
          id: "templateId",
          label: "Класс",
          type: "select",
          required: true,
          options: availableClasses.map((template) => ({
            value: template.id,
            label: template.name,
          })),
        },
        { id: "level", label: "Уровень класса", type: "number", required: true },
      ],
      initialValues: {
        templateId: availableClasses[0]?.id || "",
        level: 1,
      },
      submitLabel: "Назначить класс",
    },
    execute: async ({ input }) => {
      const templateId = String(input?.templateId || "")
      const level = Math.max(1, Math.min(30, Number(input?.level || 1)))
      const response = await operations.assignTemplate(character.id, templateId, level)
      return actionResult(response.ok, response.error, "Класс назначен через Character Engine.")
    },
  })

  for (const entry of classAssignments) {
    const classLevel = Math.max(1, entry.assignment.template_level || 1)
    const currentSubclass = subclassAssignments.find(
      (subclass) => subclass.template.parent_template_id === entry.template.id,
    ) || null
    const availableSubclasses = subclassTemplates.filter(
      (template) =>
        template.parent_template_id === entry.template.id &&
        classLevel >= (template.unlock_level || 1) &&
        template.id !== currentSubclass?.template.id,
    )

    const subclassChildren: SnakeAction[] = []
    if (currentSubclass) {
      subclassChildren.push({
        id: "remove-subclass-" + currentSubclass.assignment.id,
        label: "Снять " + currentSubclass.template.name,
        tone: "danger",
        surface: {
          kind: "confirm",
          eyebrow: "Character Engine",
          title: "Снять подкласс?",
          body: currentSubclass.template.name + " перестанет давать персонажу свои механики.",
          confirmLabel: "Снять подкласс",
        },
        execute: async () => {
          const response = await operations.removeTemplateAssignment(
            character.id,
            currentSubclass.assignment.id,
          )
          return actionResult(response.ok, response.error, "Подкласс снят.")
        },
      })
    }
    if (availableSubclasses.length > 0) {
      subclassChildren.push({
        id: "choose-subclass-" + entry.template.id,
        label: currentSubclass ? "Сменить подкласс" : "Выбрать подкласс",
        surface: {
          kind: "picker",
          eyebrow: entry.template.name,
          title: "Подкласс",
          items: availableSubclasses.map((template) => ({
            id: template.id,
            label: template.name,
            description: "Открывается с " + (template.unlock_level || 1) + " уровня класса",
          })),
          submitLabel: currentSubclass ? "Сменить" : "Выбрать",
        },
        execute: async ({ input }) => {
          const templateId = selection(input)
          const response = await operations.assignTemplate(character.id, templateId, classLevel)
          return actionResult(response.ok, response.error, "Подкласс назначен.")
        },
      })
    }

    classChildren.push({
      id: "class-" + entry.assignment.id,
      label: entry.template.name + " · " + classLevel + " ур.",
      kind: "branch",
      children: [
        {
          id: "level-" + entry.assignment.id,
          label: "Изменить уровень",
          surface: {
            kind: "editor",
            eyebrow: "Character Engine",
            title: entry.template.name,
            fields: [
              { id: "level", label: "Уровень класса", type: "number", required: true },
            ],
            initialValues: { level: classLevel },
            submitLabel: "Сохранить уровень",
          },
          execute: async ({ input }) => {
            const level = Math.max(1, Math.min(30, Number(input?.level || classLevel)))
            const response = await operations.assignTemplate(
              character.id,
              entry.template.id,
              level,
            )
            return actionResult(response.ok, response.error, "Уровень класса изменён.")
          },
        },
        ...(subclassChildren.length
          ? [{
              id: "subclass-" + entry.template.id,
              label: currentSubclass
                ? "Подкласс · " + currentSubclass.template.name
                : "Подкласс",
              kind: "branch" as const,
              children: subclassChildren,
            }]
          : []),
        {
          id: "remove-class-" + entry.assignment.id,
          label: "Снять класс",
          tone: "danger",
          surface: {
            kind: "confirm",
            eyebrow: "Character Engine",
            title: "Снять «" + entry.template.name + "»?",
            body: "Класс и его механики будут сняты с персонажа. Общий уровень пересчитается из оставшихся классов.",
            confirmLabel: "Снять класс",
          },
          execute: async () => {
            const response = await operations.removeTemplateAssignment(
              character.id,
              entry.assignment.id,
            )
            return actionResult(response.ok, response.error, "Класс снят.")
          },
        },
      ],
    })
  }

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
    createWorkshopCharacterConvertAction({ character, operations }),
    {
      id: "classes",
      label: "Классы",
      kind: "branch",
      children: classChildren,
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
                description: "Не появится у игроков до личной встречи.",
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
            } satisfies SnakeAction]
          : []),
      ],
    })
  } else {
    const activeLocations = locations.filter((location) => location.lifecycleState === "active")
    const habitatSet = new Set(
      npcHabitats
        .filter((link) => link.npcCharacterId === character.id)
        .map((link) => link.locationId),
    )

    actions.push(
      {
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
      },
      {
        id: "habitats",
        label: "Обычные зоны",
        kind: "branch",
        children: activeLocations.map((location) => {
          const attached = habitatSet.has(location.id)
          return {
            id: "habitat-" + location.id,
            label: (attached ? "✓ " : "") + location.name,
            execute: async () => {
              const response = await operations.setNpcHabitat(
                character.id,
                location.id,
                !attached,
              )
              return actionResult(
                response.ok,
                response.error,
                attached ? "Зона снята с NPC." : "Зона добавлена NPC.",
              )
            },
          } satisfies SnakeAction
        }),
      },
    )
  }

  actions.push(
    {
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
            const nextState = character.lifeState === "dead" ? "alive" : "dead"
            const response = await operations.setCharacterLifeState(character.id, nextState)
            return actionResult(
              response.ok,
              response.error,
              nextState === "dead" ? "Персонаж отмечен мёртвым." : "Персонаж снова жив.",
            )
          },
        },
      ],
    },
    {
      id: "publication",
      label: "Публикация",
      kind: "branch",
      children: [
        {
          id: "return-draft",
          label: "Вернуть в Черновик",
          surface: {
            kind: "confirm",
            eyebrow: "Публикация",
            title: "Вернуть «" + character.name + "» в Черновик?",
            body: "Персонаж исчезнет из обычной кампании. Назначение игроку и активный статус будут сняты.",
            confirmLabel: "Вернуть в Черновик",
          },
          execute: async () => {
            const response = await operations.returnCharacterToDraft(character.id)
            return actionResult(response.ok, response.error, "Персонаж возвращён в Черновик.")
          },
        },
        {
          id: "delete-character",
          label: "Удалить персонажа",
          tone: "danger",
          surface: {
            kind: "confirm",
            eyebrow: "Персонаж",
            title: "Удалить «" + character.name + "» навсегда?",
            body: "Будут удалены персонаж и связанные с ним данные. Это действие нельзя отменить.",
            confirmLabel: "Удалить навсегда",
          },
          execute: async () => {
            const response = await operations.deleteCharacter(character.id)
            return actionResult(response.ok, response.error, "Персонаж удалён.")
          },
        },
      ],
    },
  )

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
      eyebrow: "Участники",
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

export function createWorkshopMemberUnassignAction({
  member,
  character,
  operations,
}: {
  member: WorkshopMember
  character: WorkshopCharacter
  operations: WorkshopOperations
}): SnakeAction {
  return {
    id: "unassign-" + character.id,
    label: "Снять назначение",
    surface: {
      kind: "confirm",
      eyebrow: "Участники · персонаж",
      title: "Снять «" + character.name + "» с " + member.displayName + "?",
      body: "Персонаж станет свободным. Если он был активным, активный выбор участника будет снят.",
      confirmLabel: "Снять назначение",
    },
    execute: async () => {
      const response = await operations.assignCharacter(character.id, null)
      return actionResult(response.ok, response.error, "Персонаж снова свободен.")
    },
  }
}

export function createWorkshopMemberSetActiveAction({
  member,
  character,
  operations,
}: {
  member: WorkshopMember
  character: WorkshopCharacter
  operations: WorkshopOperations
}): SnakeAction {
  const isActive = member.activeCharacterId === character.id
  return {
    id: "active-" + character.id,
    label: isActive ? "Снять активность" : "Сделать активным",
    enabled: character.lifeState === "alive",
    disabledReason: "Мёртвый персонаж не может быть активным.",
    execute: async () => {
      const response = await operations.setActiveCharacter(
        member.userId,
        isActive ? null : character.id,
      )
      return actionResult(
        response.ok,
        response.error,
        isActive ? "Активный персонаж снят." : "Активный персонаж изменён.",
      )
    },
  }
}

export function createWorkshopMemberClearActiveAction({
  member,
  operations,
}: {
  member: WorkshopMember
  operations: WorkshopOperations
}): SnakeAction {
  return {
    id: "clear-active",
    label: "Снять активность",
    enabled: Boolean(member.activeCharacterId),
    disabledReason: "Активный персонаж не выбран.",
    execute: async () => {
      const response = await operations.setActiveCharacter(member.userId, null)
      return actionResult(response.ok, response.error, "Активный персонаж снят.")
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
      eyebrow: "Участники · роль",
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
  canRemoveMember,
  onOpen,
}: {
  member: WorkshopMember
  characters: WorkshopCharacter[]
  operations: WorkshopOperations
  canChangeRole: boolean
  canRemoveMember: boolean
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
    ...assigned.map((character) =>
      createWorkshopMemberUnassignAction({ member, character, operations })
    ),
  ]

  if (livingAssigned.length > 0) {
    characterChildren.push({
      id: "active-character",
      label: "Активный персонаж",
      kind: "branch",
      children: [
        ...livingAssigned.map((character): SnakeAction => {
          const action = createWorkshopMemberSetActiveAction({
            member,
            character,
            operations,
          })
          return {
            ...action,
            label: member.activeCharacterId === character.id
              ? "✓ " + character.name
              : character.name,
            enabled: member.activeCharacterId !== character.id,
            disabledReason: "Этот персонаж уже активен.",
          }
        }),
        ...(member.activeCharacterId
          ? [createWorkshopMemberClearActiveAction({ member, operations })]
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

  if (canRemoveMember && !member.isOwner) {
    actions.push({
      id: "remove-member",
      label: "Удалить из кампании",
      tone: "danger",
      surface: {
        kind: "confirm",
        eyebrow: "Участники",
        title: "Удалить «" + member.displayName + "» из кампании?",
        body: "Все назначенные этому участнику PC станут свободными. Сам участник потеряет доступ к кампании.",
        confirmLabel: "Удалить участника",
      },
      execute: async () => {
        const response = await operations.removeMember(member.userId)
        return actionResult(response.ok, response.error, "Участник удалён из кампании.")
      },
    })
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

  if (invite && !invite.revokedAt) {
    actions.push({
      id: "revoke-invite",
      label: "Отозвать код",
      tone: "danger",
      surface: {
        kind: "confirm",
        eyebrow: "Участники",
        title: "Отозвать код " + invite.code + "?",
        body: "После отзыва по этому коду больше нельзя будет вступить в кампанию.",
        confirmLabel: "Отозвать",
      },
      execute: async () => {
        const response = await operations.revokeInvite(invite.code)
        return actionResult(response.ok, response.error, "Код отозван.")
      },
    })
  }

  actions.push({
    id: "create-invite",
    label: invite ? "Создать новый код" : "Создать код",
    surface: {
      kind: "editor",
      eyebrow: "Участники",
      title: invite ? "Новый код приглашения" : "Создать приглашение",
      fields: [
        { id: "maxUses", label: "Лимит использований", type: "number", required: true },
        { id: "expiresDays", label: "Срок действия, дней", type: "number", required: true },
      ],
      initialValues: { maxUses: 20, expiresDays: 30 },
      submitLabel: "Создать код",
    },
    execute: async ({ input }) => {
      const response = await operations.createInvite(
        Math.max(1, Math.min(500, Math.floor(Number(input?.maxUses || 20)))),
        Math.max(1, Math.min(365, Math.floor(Number(input?.expiresDays || 30)))),
      )
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
          // Новый код остаётся видимым в «Участниках».
        }
      }

      return actionResult(true, undefined, "Код приглашения создан.")
    },
  })

  return actions
}

function linkedDefinitionIds(definition: ChasovoyDefinition): string[] {
  const refs = definition.data.linked_definitions
  if (Array.isArray(refs)) {
    return refs.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return []
      const id = (value as Record<string, unknown>).id
      return typeof id === "string" ? [id] : []
    })
  }
  const legacy = definition.data.linked_definition_ids
  return Array.isArray(legacy)
    ? legacy.filter((value): value is string => typeof value === "string")
    : []
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
    const revisionTargetId =
      typeof definition.data.revises_definition_id === "string"
        ? definition.data.revises_definition_id
        : null
    actions.push({
      id: "publish",
      label: revisionTargetId ? "Опубликовать ревизию" : "Отправить в кампанию",
      surface: {
        kind: "confirm",
        eyebrow: revisionTargetId ? "Черновик ревизии" : "Черновик",
        title: definition.name,
        body: revisionTargetId
          ? "Черновик станет новой рабочей ревизией исходного определения одной транзакцией. Текущая активная версия не менялась до этого момента."
          : "Заготовка станет рабочим определением кампании. Она ничего автоматически не выдаст персонажам.",
        confirmLabel: revisionTargetId ? "Опубликовать ревизию" : "Отправить",
      },
      execute: async () => {
        const response = await operations.publishDefinition(definition.id)
        return actionResult(
          response.ok,
          response.error,
          revisionTargetId
            ? "Новая ревизия опубликована."
            : "Заготовка отправлена в кампанию.",
        )
      },
    })
  } else if (definition.status === "active") {
    actions.push({
      id: "issue",
      label: "Выдать персонажу",
      enabled: living.length > 0,
      disabledReason: "Нет живых персонажей кампании.",
      surface: definition.kind === "item"
        ? {
            kind: "editor",
            eyebrow: "Выдать предмет",
            title: definition.name,
            fields: [
              {
                id: "characterId",
                label: "Персонаж",
                type: "select",
                required: true,
                options: living.map((character) => ({
                  value: character.id,
                  label:
                    character.name +
                    " · " +
                    (character.characterType === "pc" ? "PC" : "NPC"),
                })),
              },
              { id: "quantity", label: "Количество", type: "number", required: true },
            ],
            initialValues: {
              characterId: living[0]?.id || "",
              quantity: 1,
            },
            submitLabel: "Выдать",
          }
        : {
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
        const characterId = definition.kind === "item"
          ? String(input?.characterId || "")
          : selection(input)
        const quantity = definition.kind === "item"
          ? Math.max(1, Math.floor(Number(input?.quantity || 1)))
          : undefined
        const response = await operations.issueDefinition(definition, characterId, quantity)
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
      const linkedItems = items.filter((item) => {
        const pending = definitions.find((candidate) =>
          candidate.kind === "item" &&
          candidate.status === "draft" &&
          candidate.data.revises_definition_id === item.id
        )
        return linkedDefinitionIds(pending || item).includes(definition.id)
      })
      const unlinkedItems = items.filter(
        (item) => !linkedItems.some((linked) => linked.id === item.id),
      )

      actions.push({
        id: "link-item",
        label: "Привязать к предмету",
        enabled: unlinkedItems.length > 0,
        disabledReason: "Нет непривязанных активных предметов.",
        surface: {
          kind: "picker",
          eyebrow: "Привязать механику",
          title: definition.name,
          items: unlinkedItems.map((item) => ({
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

      if (linkedItems.length > 0) {
        actions.push({
          id: "unlink-item",
          label: "Отвязать от предмета",
          surface: {
            kind: "picker",
            eyebrow: "Отвязать механику",
            title: definition.name,
            items: linkedItems.map((item) => ({
              id: item.id,
              label: item.name,
              description: item.summary || "Предмет",
            })),
            submitLabel: "Отвязать",
          },
          execute: async ({ input }) => {
            const itemId = selection(input)
            const response = await operations.unlinkDefinitionFromItem(definition, itemId)
            return actionResult(response.ok, response.error, "Механика отвязана от предмета.")
          },
        })
      }
    }
  }

  actions.push(
    {
      id: "edit",
      label:
        definition.status === "active"
          ? "Создать ревизию"
          : definition.status === "archived"
            ? "Редактировать после восстановления"
            : "Редактировать",
      enabled: definition.status !== "archived",
      disabledReason: "Сначала верни определение из архива.",
      surface: {
        kind: "editor",
        eyebrow:
          definition.status === "active"
            ? "Новая ревизия · черновик"
            : definition.status === "draft"
              ? "Черновик"
              : "Архив",
        title: definition.name,
        size: { width: "wide", height: "tall" },
        fields: draftDefinitionFields(definition.kind),
        initialValues: definitionInitialValues(definition),
        submitLabel: definition.status === "active" ? "Создать черновик ревизии" : "Сохранить",
      },
      execute: async ({ input }) => {
        try {
          const next = definitionInputFromSnake(definition.kind, input)
          const response = await operations.reviseDefinition(definition.id, {
            ...next,
            data: { ...definition.data, ...(next.data || {}) },
          })
          return actionResult(
            response.ok,
            response.error,
            definition.status === "active"
              ? "Черновик ревизии создан. Рабочая версия не изменена."
              : "Черновик сохранён.",
          )
        } catch (reason) {
          return {
            type: "error",
            message: reason instanceof Error ? reason.message : "Не удалось разобрать механику.",
          }
        }
      },
    },
    {
      id: "advanced",
      label: "Дополнительно",
      kind: "branch",
      children: [
        {
          id: "advanced-mechanics-json",
          label: "Механики JSON · разработчик",
          enabled: definition.status !== "archived",
          disabledReason: "Сначала верни определение из архива.",
          surface: {
            kind: "editor",
            eyebrow: "Дополнительно · разработчик",
            title: definition.name,
            size: { width: "wide", height: "tall" },
            fields: [
              {
                id: "mechanicsJson",
                label: "Механики JSON",
                type: "textarea",
                placeholder: "[]",
              },
            ],
            initialValues: {
              mechanicsJson: JSON.stringify(definition.mechanics ?? [], null, 2),
            },
            submitLabel:
              definition.status === "active"
                ? "Создать ревизию механик"
                : "Сохранить механику",
          },
          execute: async ({ input }) => {
            try {
              const mechanics = definitionMechanicsFromSnake(input)
              const response = await operations.reviseDefinition(definition.id, {
                name: definition.name,
                summary: definition.summary,
                rulesText: definition.rulesText,
                mechanics,
                data: definition.data,
              })
              return actionResult(
                response.ok,
                response.error,
                definition.status === "active"
                  ? "Черновик ревизии механик создан."
                  : "Механика сохранена.",
              )
            } catch (reason) {
              return {
                type: "error",
                message: reason instanceof Error
                  ? reason.message
                  : "Не удалось разобрать механику.",
              }
            }
          },
        },
      ],
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

  if (definition.status === "archived") {
    actions.push({
      id: "restore",
      label: "Вернуть в библиотеку",
      surface: {
        kind: "confirm",
        eyebrow: "Архив",
        title: "Вернуть «" + definition.name + "»?",
        body: "Определение снова станет активным и доступным для выдачи.",
        confirmLabel: "Вернуть",
      },
      execute: async () => {
        const response = await operations.restoreDefinition(definition.id)
        return actionResult(response.ok, response.error, "Определение возвращено в библиотеку.")
      },
    })
  } else {
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

export function definitionInitialValues(definition: ChasovoyDefinition) {
  const values: Record<string, unknown> = {
    name: definition.name,
    summary: definition.summary,
    rulesText: definition.rulesText,
  }

  if (definition.kind === "item") {
    values.category = String(definition.data.category || "other")
    values.quantity = Number(definition.data.quantity || 1)
    values.weight = typeof definition.data.weight === "number" ? definition.data.weight : ""
    values.equipment_slot = String(definition.data.equipment_slot || "other")
    values.usage_mode = String(definition.data.usage_mode || "none")
    values.charges_max = typeof definition.data.charges_max === "number"
      ? definition.data.charges_max
      : ""
    values.image_url = String(definition.data.image_url || "")
  }

  if (definition.kind === "spell") {
    values.spell_level = Number(definition.data.spell_level || 0)
    values.school = String(definition.data.school || "Особая")
    values.casting_time = String(definition.data.casting_time || "1 действие")
    values.spell_range = String(definition.data.spell_range || "На себя")
    values.duration = String(definition.data.duration || "Мгновенно")
    values.components = String(definition.data.components || "")
    values.concentration = Boolean(definition.data.concentration)
    values.ritual = Boolean(definition.data.ritual)
  }

  return values
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
          { value: "book", label: "Книга" },
          { value: "trinket", label: "Безделушка" },
          { value: "quest", label: "Квестовый" },
          { value: "material", label: "Материал" },
          { value: "currency", label: "Валюта" },
          { value: "container", label: "Контейнер" },
          { value: "other", label: "Прочее" },
        ],
      },
      { id: "quantity", label: "Количество по умолчанию", type: "number" as const },
      { id: "weight", label: "Вес", type: "number" as const },
      {
        id: "equipment_slot",
        label: "Слот экипировки",
        type: "select" as const,
        options: [
          { value: "other", label: "Другое" },
          { value: "main_hand", label: "Основная рука" },
          { value: "off_hand", label: "Вторая рука" },
          { value: "two_hands", label: "Две руки" },
          { value: "head", label: "Голова" },
          { value: "neck", label: "Шея" },
          { value: "shoulders", label: "Плечи" },
          { value: "chest", label: "Корпус" },
          { value: "hands", label: "Кисти" },
          { value: "wrists", label: "Запястья" },
          { value: "waist", label: "Пояс" },
          { value: "legs", label: "Ноги" },
          { value: "feet", label: "Ступни" },
          { value: "back", label: "Спина" },
          { value: "ring_left", label: "Левое кольцо" },
          { value: "ring_right", label: "Правое кольцо" },
          { value: "ammo", label: "Боеприпасы" },
        ],
      },
      {
        id: "usage_mode",
        label: "Расходование",
        type: "select" as const,
        options: [
          { value: "none", label: "Не расходуется" },
          { value: "quantity", label: "Количество" },
          { value: "charges", label: "Заряды" },
        ],
      },
      { id: "charges_max", label: "Максимум зарядов", type: "number" as const },
      { id: "image_url", label: "Путь / URL арта", type: "text" as const },
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
    data.quantity = Math.max(1, Math.floor(Number(values.quantity || 1)))
    if (values.weight !== "" && values.weight !== undefined) {
      data.weight = Number(values.weight || 0)
    }
    data.equipment_slot = String(values.equipment_slot || "other")
    data.usage_mode = String(values.usage_mode || "none")
    if (String(values.usage_mode || "none") === "charges") {
      data.charges_max = Math.max(1, Math.floor(Number(values.charges_max || 1)))
      data.charges_current = data.charges_max
    } else {
      data.charges_max = null
      data.charges_current = null
    }
    data.image_url = String(values.image_url || "")
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

  const result: {
    name: string
    summary: string
    rulesText: string
    data: Record<string, ChasovoyJson>
    mechanics?: ChasovoyJson[]
  } = {
    name: String(values.name || ""),
    summary: String(values.summary || ""),
    rulesText: String(values.rulesText || ""),
    data,
  }

  if (Object.prototype.hasOwnProperty.call(values, "mechanicsJson")) {
    result.mechanics = definitionMechanicsFromSnake(input)
  }

  return result
}

export function definitionMechanicsFromSnake(input: SnakeActionInput): ChasovoyJson[] {
  const rawMechanics = String(input?.mechanicsJson || "[]").trim() || "[]"
  let mechanics: ChasovoyJson
  try {
    mechanics = JSON.parse(rawMechanics) as ChasovoyJson
  } catch {
    throw new Error("Механики должны быть корректным JSON.")
  }
  if (!Array.isArray(mechanics)) {
    throw new Error("Механики должны быть JSON-массивом.")
  }
  return mechanics
}
