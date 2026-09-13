import type { SnakeAction } from "../snake-engine"
import type { ChasovoyDefinitionKind } from "../reference-engine/index.ts"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import {
  openSourceAction,
  WorkshopDefinitionRows,
} from "./GMWorkshopCommon"
import {
  createWorkshopCharacterActions,
  definitionInputFromSnake,
  draftDefinitionFields,
} from "./gmWorkshopSnakeActions"
import { useGMWorkshopData } from "./useGMWorkshopData"

export default function GMWorkshopDraft({
  data,
  onOpenCharacter,
}: {
  data: ReturnType<typeof useGMWorkshopData>
  onOpenCharacter: (characterId: string) => void
}) {
  const snake = useSnake()

  function createCharacter(type: "pc" | "npc") {
    const action: SnakeAction = {
      id: "create-draft-" + type,
      label: "Создать",
      surface: {
        kind: "editor",
        eyebrow: "Черновик · только GM",
        title: type === "pc" ? "Новый PC" : "Новый NPC",
        size: { width: "wide", height: "tall" },
        fields: [
          { id: "name", label: "Имя", type: "text", required: true },
          {
            id: "classTemplateId",
            label: "Класс",
            type: "select",
            options: [
              { value: "", label: "Без класса" },
              ...data.classTemplates.map((template) => ({
                value: template.id,
                label: template.name,
              })),
            ],
          },
          { id: "level", label: "Уровень класса", type: "number" },
          { id: "bio", label: "Описание", type: "textarea" },
        ],
        initialValues: { classTemplateId: "", level: 1 },
        submitLabel: "Создать в Черновике",
      },
      execute: async ({ input }) => {
        const response = await data.operations.createDraftCharacter(type, {
          name: String(input?.name || ""),
          classTemplateId: String(input?.classTemplateId || "") || null,
          level: Number(input?.level || 1),
          bio: String(input?.bio || ""),
        })
        return response.ok
          ? { type: "success", notice: "Персонаж создан в Черновике." }
          : { type: "error", message: response.error || "Не удалось создать персонажа." }
      },
    }

    openSourceAction(snake, { type: "gm-draft", id: "characters" }, action)
  }

  function createDefinition(kind: ChasovoyDefinitionKind) {
    const action: SnakeAction = {
      id: "create-draft-" + kind,
      label: "Создать",
      surface: {
        kind: "editor",
        eyebrow: "Черновик · только GM",
        title:
          kind === "item" ? "Новый предмет" :
          kind === "spell" ? "Новое заклинание" :
          kind === "condition" ? "Новый эффект" :
          "Новая способность",
        size: { width: "wide", height: "tall" },
        fields: draftDefinitionFields(kind),
        submitLabel: "Создать в Черновике",
      },
      execute: async ({ input }) => {
        const response = await data.operations.createDraftDefinition(
          kind,
          definitionInputFromSnake(kind, input),
        )
        return response.ok
          ? { type: "success", notice: "Заготовка создана." }
          : { type: "error", message: response.error || "Не удалось создать заготовку." }
      },
    }

    openSourceAction(snake, { type: "gm-draft", id: kind }, action)
  }

  const items = data.draftDefinitions.filter((definition) => definition.kind === "item")
  const mechanics = data.draftDefinitions.filter((definition) =>
    definition.kind === "spell" ||
    definition.kind === "feature" ||
    definition.kind === "condition" ||
    definition.kind === "feat"
  )

  return (
    <div className="u1-gm-workshop__section">
      <section className="u1-gm-draft-intro">
        <span>ТОЛЬКО GM</span>
        <strong>Ничто отсюда не существует для игроков.</strong>
        <p>
          Здесь можно собирать будущих PC и NPC, тестировать предметы и механики.
          Публикация всегда отдельное действие.
        </p>
      </section>

      <section className="u1-gm-workblock">
        <header>
          <div>
            <span>Персонажи</span>
            <small>{data.draftCharacters.length}</small>
          </div>
          <div className="u1-gm-workblock__create">
            <button type="button" onClick={() => createCharacter("pc")}>+ PC</button>
            <button type="button" onClick={() => createCharacter("npc")}>+ NPC</button>
          </div>
        </header>

        <div className="u1-gm-list">
          {data.draftCharacters.map((character) => {
            const actions = createWorkshopCharacterActions({
              character,
              members: data.members,
              templates: data.templates,
              assignments: data.templateAssignments,
              locations: data.locations,
              npcHabitats: data.npcHabitats,
              operations: data.operations,
              onOpen: () => onOpenCharacter(character.id),
            })

            return (
              <SnakeTrigger
                key={character.id}
                entity={{ type: "character", id: character.id }}
                actions={actions}
              >
                <button
                  type="button"
                  className="u1-gm-entity-row"
                  onClick={() => onOpenCharacter(character.id)}
                >
                  <span>
                    <strong>{character.name}</strong>
                    <small>
                      {character.characterType === "pc" ? "PC" : "NPC"}
                      {" · "}
                      {character.characterClass}
                      {" · "}
                      {character.level}
                    </small>
                  </span>
                  <b>ЧЕРНОВИК</b>
                </button>
              </SnakeTrigger>
            )
          })}
          {!data.draftCharacters.length && (
            <div className="u1-gm-empty">Будущих персонажей пока нет.</div>
          )}
        </div>
      </section>

      <section className="u1-gm-workblock">
        <header>
          <div>
            <span>Предметы</span>
            <small>{items.length}</small>
          </div>
          <button type="button" onClick={() => createDefinition("item")}>
            + Предмет
          </button>
        </header>
        <WorkshopDefinitionRows
          definitions={items}
          allDefinitions={data.definitions}
          characters={data.characters}
          operations={data.operations}
        />
      </section>

      <section className="u1-gm-workblock">
        <header>
          <div>
            <span>Механики</span>
            <small>{mechanics.length}</small>
          </div>
          <div className="u1-gm-workblock__create">
            <button type="button" onClick={() => createDefinition("spell")}>
              + Заклинание
            </button>
            <button type="button" onClick={() => createDefinition("feature")}>
              + Способность
            </button>
            <button type="button" onClick={() => createDefinition("condition")}>
              + Эффект
            </button>
          </div>
        </header>
        <WorkshopDefinitionRows
          definitions={mechanics}
          allDefinitions={data.definitions}
          characters={data.characters}
          operations={data.operations}
        />
      </section>
    </div>
  )
}
