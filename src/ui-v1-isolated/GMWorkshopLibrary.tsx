import { useState } from "react"

import { WorkshopDefinitionRows } from "./GMWorkshopCommon"
import { useGMWorkshopData } from "./useGMWorkshopData"

type LibraryFilter = "all" | "item" | "spell" | "feature" | "condition"

export default function GMWorkshopLibrary({
  data,
}: {
  data: ReturnType<typeof useGMWorkshopData>
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<LibraryFilter>("all")
  const needle = query.trim().toLocaleLowerCase("ru-RU")

  const visible = data.activeDefinitions.filter((definition) => {
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

  return (
    <div className="u1-gm-workshop__section">
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
