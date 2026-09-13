import { useMemo, useState } from "react"

import { SnakeTrigger } from "./SnakeProvider"
import {
  visibilityLabel,
} from "./GMWorkshopCommon"
import { createWorkshopCharacterActions } from "./gmWorkshopSnakeActions"
import {
  useGMWorkshopData,
  type WorkshopCharacter,
} from "./useGMWorkshopData"

type CharacterFilter = "all" | "pc" | "npc" | "free" | "dead"

function recentKey(campaignId: string) {
  return "meganotrpg:v1:gm-recent-characters:" + campaignId
}

export default function GMWorkshopCharacters({
  data,
  onOpenCharacter,
}: {
  data: ReturnType<typeof useGMWorkshopData>
  onOpenCharacter: (characterId: string) => void
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<CharacterFilter>("all")
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(recentKey(data.campaignId)) || "[]",
      )
      return Array.isArray(stored)
        ? stored.filter((value) => typeof value === "string")
        : []
    } catch {
      return []
    }
  })

  const memberMap = useMemo(
    () => new Map(data.members.map((member) => [member.userId, member])),
    [data.members],
  )

  function openCharacter(character: WorkshopCharacter) {
    const next = [
      character.id,
      ...recentIds.filter((id) => id !== character.id),
    ].slice(0, 5)

    setRecentIds(next)
    window.localStorage.setItem(
      recentKey(data.campaignId),
      JSON.stringify(next),
    )
    onOpenCharacter(character.id)
  }

  const needle = query.trim().toLocaleLowerCase("ru-RU")
  const visible = data.campaignCharacters
    .filter((character) => {
      if (filter === "pc" && character.characterType !== "pc") return false
      if (filter === "npc" && character.characterType !== "npc") return false
      if (
        filter === "free" &&
        !(
          character.characterType === "pc" &&
          !character.assignedUserId &&
          character.lifeState === "alive"
        )
      ) return false
      if (filter === "dead" && character.lifeState !== "dead") return false
      if (!needle) return true

      const owner = character.assignedUserId
        ? memberMap.get(character.assignedUserId)?.displayName || ""
        : ""

      const searchable = [
        character.name,
        character.characterClass,
        owner,
        character.characterType === "pc"
          ? "pc игрок персонаж игрока"
          : "npc персонаж мира",
        character.lifeState === "dead" ? "мертв мёртв погиб" : "жив",
        !character.assignedUserId && character.characterType === "pc"
          ? "свободен свободный"
          : "",
        character.visibilityMode === "discover"
          ? "при встрече"
          : "видно сразу",
      ]
        .join(" ")
        .toLocaleLowerCase("ru-RU")

      return searchable.includes(needle)
    })
    .sort(
      (left, right) =>
        Number(left.lifeState === "dead") -
          Number(right.lifeState === "dead") ||
        left.name.localeCompare(right.name, "ru"),
    )

  const recent = recentIds
    .map((id) =>
      data.campaignCharacters.find((character) => character.id === id),
    )
    .filter(
      (character): character is WorkshopCharacter => Boolean(character),
    )
    .slice(0, 5)

  const filters: Array<[CharacterFilter, string, number]> = [
    ["all", "Все персонажи", data.campaignCharacters.length],
    [
      "pc",
      "Персонажи игроков",
      data.campaignCharacters.filter(
        (character) => character.characterType === "pc",
      ).length,
    ],
    [
      "npc",
      "Персонажи мира",
      data.campaignCharacters.filter(
        (character) => character.characterType === "npc",
      ).length,
    ],
    [
      "free",
      "Свободные",
      data.campaignCharacters.filter(
        (character) =>
          character.characterType === "pc" &&
          !character.assignedUserId &&
          character.lifeState === "alive",
      ).length,
    ],
    [
      "dead",
      "Мёртвые",
      data.campaignCharacters.filter(
        (character) => character.lifeState === "dead",
      ).length,
    ],
  ]

  return (
    <div className="u1-gm-workshop__section">
      <label className="u1-gm-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти персонажа, класс, игрока…"
        />
      </label>

      {!query && (
        <section className="u1-gm-destination">
          <span>Куда перейти</span>
          {filters.map(([id, label, count]) => (
            <button
              type="button"
              key={id}
              data-active={filter === id || undefined}
              onClick={() => setFilter(id)}
            >
              <strong>{label}</strong>
              <small>{count}</small>
            </button>
          ))}
        </section>
      )}

      {!query && filter === "all" && recent.length > 0 && (
        <section className="u1-gm-recent">
          <span>Недавние</span>
          <div>
            {recent.map((character) => (
              <button
                type="button"
                key={character.id}
                onClick={() => openCharacter(character)}
              >
                {character.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="u1-gm-list u1-gm-character-catalog">
        {visible.map((character) => {
          const owner = character.assignedUserId
            ? memberMap.get(character.assignedUserId)
            : null
          const active = owner?.activeCharacterId === character.id
          const actions = createWorkshopCharacterActions({
            character,
            members: data.members,
            operations: data.operations,
            onOpen: () => openCharacter(character),
          })

          return (
            <SnakeTrigger
              key={character.id}
              entity={{ type: "character", id: character.id }}
              actions={actions}
            >
              <button
                type="button"
                className="u1-gm-character-row"
                data-dead={character.lifeState === "dead" || undefined}
                onClick={() => openCharacter(character)}
              >
                <span className="u1-gm-character-row__media">
                  {character.avatarUrl ? (
                    <img src={character.avatarUrl} alt="" />
                  ) : (
                    <i aria-hidden="true">
                      {character.name.slice(0, 1).toUpperCase()}
                    </i>
                  )}
                </span>

                <span className="u1-gm-character-row__copy">
                  <strong>{character.name}</strong>
                  <small>
                    {character.characterType === "pc" ? "PC" : "NPC"}
                    {" · "}
                    {character.characterClass}
                    {" · "}
                    {character.level}
                    {owner ? " · " + owner.displayName : ""}
                    {active ? " · активен" : ""}
                  </small>
                </span>

                <b>{visibilityLabel(character)}</b>
              </button>
            </SnakeTrigger>
          )
        })}

        {!visible.length && (
          <div className="u1-gm-empty">
            {query
              ? "По этому запросу никого нет."
              : "В этой выборке пока пусто."}
          </div>
        )}
      </div>
    </div>
  )
}
