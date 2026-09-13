import type { ReactNode } from "react"

import type { SnakeAction } from "../snake-engine"
import type { ChasovoyDefinition } from "../reference-engine/index.ts"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import { createWorkshopDefinitionActions } from "./gmWorkshopSnakeActions"
import type {
  WorkshopCharacter,
  WorkshopOperations,
  WorkshopSection,
} from "./useGMWorkshopData"

export function definitionLabel(kind: ChasovoyDefinition["kind"]) {
  if (kind === "item") return "Предмет"
  if (kind === "spell") return "Заклинание"
  if (kind === "condition") return "Эффект"
  if (kind === "feature" || kind === "feat") return "Способность"
  return "Определение"
}

export function visibilityLabel(character: WorkshopCharacter) {
  if (character.publicationState === "draft") return "Черновик"
  if (character.lifeState === "dead") return "Мёртв"
  if (character.characterType === "npc") {
    return character.visibilityMode === "discover" ? "При встрече" : "Видно сразу"
  }
  return character.assignedUserId ? "Назначен" : "Свободен"
}

export function openSourceAction(
  snake: ReturnType<typeof useSnake>,
  entity: { type: string; id: string },
  action: SnakeAction,
) {
  if (!action.surface) return
  snake.openSurface(action.surface, { action, entity, path: [] })
}

export function WorkshopHeader({
  campaignTitle,
  section,
  onNavigate,
  onBack,
}: {
  campaignTitle: string
  section?: WorkshopSection
  onNavigate: (section?: WorkshopSection) => void
  onBack: () => void
}) {
  const title =
    section === "draft" ? "Черновик" :
    section === "party" ? "Партия" :
    section === "characters" ? "Персонажи" :
    section === "library" ? "Библиотека" :
    section === "materials" ? "Материалы" :
    "Мастерская"

  return (
    <header className="u1-gm-workshop__header">
      <button
        type="button"
        className="u1-gm-workshop__back"
        onClick={() => section ? onNavigate(undefined) : onBack()}
        aria-label="Назад"
      >
        ←
      </button>
      <div>
        <span>{campaignTitle || "Кампания"}</span>
        <strong>{title}</strong>
      </div>
    </header>
  )
}

export function WorkshopPanel({
  eyebrow,
  title,
  meta,
  detail,
  tone,
  onClick,
  children,
}: {
  eyebrow?: string
  title: string
  meta?: string
  detail?: string
  tone?: "draft"
  onClick?: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      className="u1-gm-panel"
      data-tone={tone}
      onClick={onClick}
    >
      <span className="u1-gm-panel__head">
        <span>
          {eyebrow && <small>{eyebrow}</small>}
          <strong>{title}</strong>
        </span>
        {meta && <b>{meta}</b>}
      </span>
      {detail && <span className="u1-gm-panel__detail">{detail}</span>}
      {children}
      <i className="u1-gm-panel__arrow" aria-hidden="true">→</i>
    </button>
  )
}

export function WorkshopDefinitionRows({
  definitions,
  allDefinitions,
  characters,
  operations,
}: {
  definitions: ChasovoyDefinition[]
  allDefinitions: ChasovoyDefinition[]
  characters: WorkshopCharacter[]
  operations: WorkshopOperations
}) {
  const snake = useSnake()

  if (!definitions.length) {
    return <div className="u1-gm-empty">Пока пусто.</div>
  }

  return (
    <div className="u1-gm-list">
      {definitions.map((definition) => {
        const actions = createWorkshopDefinitionActions({
          definition,
          definitions: allDefinitions,
          characters,
          operations,
        })
        return (
          <SnakeTrigger
            key={definition.id}
            entity={{ type: "definition", id: definition.id }}
            actions={actions}
          >
            <button
              type="button"
              className="u1-gm-definition-row"
              onClick={() => snake.openSurface({
                kind: "detail",
                eyebrow: definition.status === "draft" ? "Черновик" : "Библиотека",
                title: definition.name,
                body: definition.rulesText || definition.summary || "Описание пока не заполнено.",
              })}
            >
              <span>
                <strong>{definition.name}</strong>
                <small>
                  {definitionLabel(definition.kind)}
                  {definition.summary ? " · " + definition.summary : ""}
                </small>
              </span>
              <b>{definition.status === "draft" ? "ЧЕРНОВИК" : "r" + definition.revision}</b>
            </button>
          </SnakeTrigger>
        )
      })}
    </div>
  )
}
