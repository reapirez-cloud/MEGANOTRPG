import {
  useAI,
  useAIViewContextLayer,
  type AIDraft,
} from "../ai/AIProvider"
import { applyAIDraft } from "../ai/applyDraft"
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
  const {
    campaignId,
    userId,
    drafts: aiDrafts,
    refreshDrafts,
  } = useAI()

  useAIViewContextLayer(
    "gm-workshop-ai-drafts",
    {
      screen: "gm-workshop-ai-drafts",
      title: "Мастерская · AI-черновики",
      text: "Открыт раздел Черновика GM. Здесь отдельно показаны структурированные предложения Восса, которые ещё не являются каноном.",
      facts: {
        aiDrafts: aiDrafts.slice(0, 20).map((draft) => ({
          id: draft.id,
          type: draft.draft_type,
          title: draft.title,
          summary: draft.summary,
          revision: draft.current_revision,
          warnings: draft.validation_warnings,
          recentRevisions: draft.recent_revisions,
          nodes: draft.content.nodes,
          relations: draft.content.relations,
        })),
      },
    },
    52,
  )

  function openAIDraft(draft: AIDraft) {
    const nodes = draft.content.nodes || []
    const relations = draft.content.relations || []
    const lines = [
      draft.summary,
      "",
      ...nodes.map((node) =>
        "[" +
        node.entity_type +
        (node.entity_subtype ? " / " + node.entity_subtype : "") +
        "] " +
        node.name +
        (node.summary ? " — " + node.summary : "")
      ),
      ...(relations.length
        ? [
            "",
            "Связи:",
            ...relations.map((relation) =>
              "• " +
              relation.kind +
              ": " +
              relation.from_key +
              " → " +
              (relation.to_key || relation.to_existing?.label || relation.to_existing?.id || "?") +
              (relation.label ? " · " + relation.label : "")
            ),
          ]
        : []),
      ...(draft.recent_revisions?.length
        ? [
            "",
            "История ревизий:",
            ...draft.recent_revisions.map((revision) =>
              "• r" +
              revision.revision +
              (revision.change_summary ? " · " + revision.change_summary : "")
            ),
          ]
        : []),
      ...(draft.validation_warnings.length
        ? [
            "",
            "Предупреждения:",
            ...draft.validation_warnings.map((warning) => "• " + warning),
          ]
        : []),
      "",
      "Это только AI-черновик. Канонические сущности ещё не созданы.",
      "Чтобы изменить его, открой Восса и опиши правку обычным текстом.",
    ].filter((line) => line !== undefined)

    snake.openSurface(
      {
        kind: "detail",
        eyebrow: "AI DRAFT · НЕ КАНОН · r" + draft.current_revision,
        title: draft.title,
        body: lines.join("\n"),
        size: { width: "wide", height: "tall" },
      },
      {
        entity: { type: "ai-draft", id: draft.id },
        path: [],
      },
    )
  }

  function approveAIDraft(draft: AIDraft) {
    const warningText = draft.validation_warnings.length
      ? "\n\nПредупреждения:\n" +
        draft.validation_warnings.map((warning) => "• " + warning).join("\n")
      : ""

    const action: SnakeAction = {
      id: "apply-ai-draft-" + draft.id,
      label: "Применить",
      tone: "danger",
      surface: {
        kind: "confirm",
        eyebrow: "AI DRAFT · УТВЕРЖДЕНИЕ",
        title: "Создать канонический контент?",
        body:
          "Будет применена ровно ревизия r" +
          draft.current_revision +
          " черновика «" +
          draft.title +
          "».\n\n" +
          "Создание пойдёт через Oracle и владельцев домена. " +
          "Если один из поздних шагов упадёт, уже успешно созданные сущности не будут скрыто удаляться: run получит статус PARTIAL_FAILED для ручной проверки." +
          warningText,
        confirmLabel: "Утвердить и создать",
        cancelLabel: "Отмена",
        size: { width: "wide", height: "content" },
      },
      execute: async () => {
        const result = await applyAIDraft(draft, campaignId, userId)
        await Promise.all([
          refreshDrafts(),
          data.operations.refresh(),
        ])

        if (result.ok) {
          return {
            type: "success",
            notice: "AI Draft применён через Oracle. Канонический контент создан.",
          }
        }

        return {
          type: "error",
          message:
            (result.partial
              ? "Применение остановлено после частичного создания. Ничего автоматически не откатывалось. "
              : "") +
            result.error +
            (result.runId ? " · apply-run: " + result.runId : ""),
        }
      },
    }

    openSourceAction(
      snake,
      { type: "ai-draft", id: draft.id },
      action,
    )
  }

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
        try {
          const response = await data.operations.createDraftDefinition(
            kind,
            definitionInputFromSnake(kind, input),
          )
          return response.ok
            ? { type: "success", notice: "Заготовка создана." }
            : { type: "error", message: response.error || "Не удалось создать заготовку." }
        } catch (reason) {
          return {
            type: "error",
            message: reason instanceof Error ? reason.message : "Не удалось разобрать механику.",
          }
        }
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
            <span>Черновики Восса</span>
            <small>{aiDrafts.length}</small>
          </div>
          <b className="u1-gm-ai-draft-badge">AI · REVIEW</b>
        </header>

        <div className="u1-gm-list">
          {aiDrafts.map((draft) => (
            <div className="u1-gm-ai-draft-entry" key={draft.id}>
              <button
                type="button"
                className="u1-gm-definition-row u1-gm-ai-draft-row"
                onClick={() => openAIDraft(draft)}
              >
                <span>
                  <strong>{draft.title}</strong>
                  <small>
                    {draft.draft_type}
                    {" · "}
                    {draft.content.nodes?.length || 0} сущн.
                    {" · "}
                    {draft.content.relations?.length || 0} связей
                    {draft.summary ? " · " + draft.summary : ""}
                    {draft.recent_revisions?.[0]?.change_summary
                      ? " · " + draft.recent_revisions[0].change_summary
                      : ""}
                  </small>
                </span>
                <b>AI r{draft.current_revision}</b>
              </button>
              <button
                type="button"
                className="u1-gm-ai-draft-apply"
                onClick={() => approveAIDraft(draft)}
              >
                Применить
              </button>
            </div>
          ))}
          {!aiDrafts.length && (
            <div className="u1-gm-empty">
              Восс пока ничего не собрал. Попроси его создать зону, NPC, предмет или связанный набор.
            </div>
          )}
        </div>
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
