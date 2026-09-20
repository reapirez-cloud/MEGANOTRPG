import {
  useAI,
  useAIViewContextLayer,
  type AIDraft,
} from "../ai/AIProvider"
import { applyAIDraft } from "../ai/applyDraft"
import type { SnakeAction } from "../snake-engine"
import { useSnake } from "./SnakeProvider"
import { openSourceAction } from "./GMWorkshopCommon"
import { useGMWorkshopData } from "./useGMWorkshopData"

export default function GMWorkshopReview({
  data,
}: {
  data: ReturnType<typeof useGMWorkshopData>
}) {
  const snake = useSnake()
  const {
    campaignId,
    userId,
    drafts: aiDrafts,
    refreshDrafts,
  } = useAI()

  useAIViewContextLayer(
    "gm-workshop-review",
    {
      screen: "gm-workshop-review",
      title: "Мастерская · На проверку",
      text: "GM проверяет структурированные AI-предложения до их превращения в канонический контент.",
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
      "Это AI-предложение. Канонические сущности ещё не созданы.",
      "Чтобы изменить его, открой Восса или Фредди и опиши правку обычным текстом.",
    ].filter((line) => line !== undefined)

    snake.openSurface(
      {
        kind: "detail",
        eyebrow: "AI REVIEW · НЕ КАНОН · r" + draft.current_revision,
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
        eyebrow: "AI REVIEW · УТВЕРЖДЕНИЕ",
        title: "Создать канонический контент?",
        body:
          "Будет применена ровно ревизия r" +
          draft.current_revision +
          " предложения «" +
          draft.title +
          "».\n\n" +
          "Создание пойдёт через Oracle и владельцев домена. " +
          "Если поздний шаг упадёт, уже созданные сущности не будут скрыто удаляться: apply-run останется для ручной проверки." +
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
            notice: "AI-предложение применено через Oracle. Канонический контент создан.",
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

  return (
    <div className="u1-gm-workshop__section">
      <section className="u1-gm-draft-intro">
        <span>AI · REVIEW</span>
        <strong>Здесь нет канона, пока GM не нажал «Применить».</strong>
        <p>
          Восс и Фредди могут собрать структуру и связи, но публикация всегда остаётся отдельным решением GM.
        </p>
      </section>

      <section className="u1-gm-workblock">
        <header>
          <div>
            <span>На проверку</span>
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
              AI-предложений на проверку сейчас нет.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
