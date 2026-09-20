import { useState } from "react"

import { useAIViewContextLayer } from "../ai/AIProvider"
import type { SnakeAction } from "../snake-engine"
import type { ChasovoyDefinitionKind } from "../reference-engine/index.ts"
import { useSnake } from "./SnakeProvider"
import { openSourceAction, WorkshopDefinitionRows } from "./GMWorkshopCommon"
import {
  definitionInputFromSnake,
  draftDefinitionFields,
} from "./gmWorkshopSnakeActions"
import { useGMWorkshopData } from "./useGMWorkshopData"

type LibraryFilter = "all" | "item" | "spell" | "feature" | "condition"
type LibraryScope = "draft" | "active" | "archived"

export default function GMWorkshopLibrary({
  data,
}: {
  data: ReturnType<typeof useGMWorkshopData>
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<LibraryFilter>("all")
  const snake = useSnake()
  const [scope, setScope] = useState<LibraryScope>("active")
  const needle = query.trim().toLocaleLowerCase("ru-RU")
  const source =
    scope === "draft"
      ? data.draftDefinitions
      : scope === "active"
        ? data.activeDefinitions
        : data.archivedDefinitions

  const visible = source.filter((definition) => {
    if (filter === "item" && definition.kind !== "item") return false
    if (filter === "spell" && definition.kind !== "spell") return false
    if (
      filter === "feature" &&
      !(definition.kind === "feature" || definition.kind === "feat")
    ) return false
    if (filter === "condition" && definition.kind !== "condition") return false
    if (!needle) return true

    return (
      definition.name +
      " " +
      definition.summary +
      " " +
      definition.rulesText
    )
      .toLocaleLowerCase("ru-RU")
      .includes(needle)
  })

  const filters: Array<[LibraryFilter, string]> = [
    ["all", "Все"],
    ["item", "Предметы"],
    ["spell", "Заклинания"],
    ["feature", "Способности"],
    ["condition", "Эффекты"],
  ]

  function createDefinition(kind: ChasovoyDefinitionKind) {
    const action: SnakeAction = {
      id: "create-draft-" + kind,
      label: "Создать",
      surface: {
        kind: "editor",
        eyebrow: "Библиотека · черновик",
        title:
          kind === "item" ? "Новый предмет" :
          kind === "spell" ? "Новое заклинание" :
          kind === "condition" ? "Новый эффект" :
          "Новая способность",
        size: { width: "wide", height: "tall" },
        fields: draftDefinitionFields(kind),
        submitLabel: "Создать черновик",
      },
      execute: async ({ input }) => {
        try {
          const response = await data.operations.createDraftDefinition(
            kind,
            definitionInputFromSnake(kind, input),
          )
          return response.ok
            ? { type: "success", notice: "Черновик определения создан." }
            : { type: "error", message: response.error || "Не удалось создать черновик." }
        } catch (reason) {
          return {
            type: "error",
            message: reason instanceof Error ? reason.message : "Не удалось разобрать механику.",
          }
        }
      },
    }

    openSourceAction(snake, { type: "gm-library", id: kind }, action)
  }

  useAIViewContextLayer(
    "gm-workshop-library",
    {
      screen: "gm-workshop-library",
      title: "Мастерская · Библиотека",
      text: "GM просматривает рабочую библиотеку определений.",
      facts: {
        query,
        filter,
        scope,
        visibleDefinitions: visible.slice(0, 30).map((definition) => ({
          id: definition.id,
          kind: definition.kind,
          name: definition.name,
          summary: definition.summary,
          rulesText: definition.rulesText,
          status: definition.status,
        })),
      },
    },
    45,
  )

  return (
    <div className="u1-gm-workshop__section">
      <section className="u1-gm-workblock u1-gm-workblock--compact">
        <header>
          <div>
            <span>Создать</span>
            <small>Новая запись всегда начинается как черновик</small>
          </div>
          <div className="u1-gm-workblock__create">
            <button type="button" onClick={() => createDefinition("item")}>+ Предмет</button>
            <button type="button" onClick={() => createDefinition("spell")}>+ Заклинание</button>
            <button type="button" onClick={() => createDefinition("feature")}>+ Способность</button>
            <button type="button" onClick={() => createDefinition("condition")}>+ Эффект</button>
          </div>
        </header>
      </section>

      <div className="u1-gm-filter-rail">
        <button
          type="button"
          data-active={scope === "draft" || undefined}
          onClick={() => setScope("draft")}
        >
          Черновики · {data.draftDefinitions.length}
        </button>
        <button
          type="button"
          data-active={scope === "active" || undefined}
          onClick={() => setScope("active")}
        >
          Рабочая база · {data.activeDefinitions.length}
        </button>
        <button
          type="button"
          data-active={scope === "archived" || undefined}
          onClick={() => setScope("archived")}
        >
          Архив · {data.archivedDefinitions.length}
        </button>
      </div>

      <label className="u1-gm-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти в библиотеке…"
        />
      </label>

      <div className="u1-gm-filter-rail">
        {filters.map(([id, label]) => (
          <button
            type="button"
            key={id}
            data-active={filter === id || undefined}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <WorkshopDefinitionRows
        definitions={visible}
        allDefinitions={data.definitions}
        characters={data.characters}
        operations={data.operations}
      />
    </div>
  )
}
