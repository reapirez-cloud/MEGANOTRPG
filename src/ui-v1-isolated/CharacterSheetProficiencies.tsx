import { useState, type MouseEvent } from "react"

import {
  CHARACTER_PROFICIENCY_GROUP_ORDER,
} from "./characterProficienciesCatalog.ts"
import type {
  CharacterProficienciesReadModel,
  CharacterProficiencyGroupKey,
} from "./characterProficienciesReadModel.ts"

type ExpandedGroups = Record<CharacterProficiencyGroupKey, boolean>

function defaultExpandedGroups(): ExpandedGroups {
  return Object.fromEntries(
    CHARACTER_PROFICIENCY_GROUP_ORDER.map((key) => [key, true]),
  ) as ExpandedGroups
}

function ProficiencyGroupIcon({
  group,
}: {
  group: CharacterProficiencyGroupKey
}) {
  const common = {
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.45,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  }

  if (group === "weapons") {
    return (
      <svg {...common}>
        <path d="M8 5.2 21.9 19.1M24 5.2 10.1 19.1" />
        <path d="m6.2 7 1.8-1.8 3.1.6M25.8 7 24 5.2l-3.1.6" />
        <path d="m7.6 21.6 2.8-2.8M24.4 21.6l-2.8-2.8" />
        <path d="m5.4 23.8 2.2 2.2M26.6 23.8 24.4 26" />
      </svg>
    )
  }

  if (group === "armor") {
    return (
      <svg {...common}>
        <path d="M16 4.2 25 7.8v7.1c0 6.1-3.5 10.2-9 12.9-5.5-2.7-9-6.8-9-12.9V7.8L16 4.2Z" />
        <path d="M16 8.2v15.1M10.7 11.1 16 8.2l5.3 2.9" />
      </svg>
    )
  }

  if (group === "tools") {
    return (
      <svg {...common}>
        <path d="m8.2 7.1 6.3 6.3M17.2 16.1l7.6 7.6" />
        <path d="M7.1 5.9 5.4 9.8l3.1 3.1 3.9-1.7" />
        <path d="M23.8 7.1c-2.4-1.2-5.4-.7-7.3 1.2-1.8 1.8-2.3 4.4-1.5 6.7l-7.7 7.7 2 2 7.7-7.7c2.3.8 4.9.3 6.7-1.5 1.9-1.9 2.4-4.9 1.2-7.3l-3.7 3.7-2.9-2.9 3.5-3.9Z" />
      </svg>
    )
  }

  if (group === "languages") {
    return (
      <svg {...common}>
        <path d="M5.5 7.2h13.2v10.2H11l-4.2 3.7v-3.7H5.5V7.2Z" />
        <path d="M14.7 14.6h7.8v5.6h2.7v4.1l-4.3-4.1h-6.2" />
        <path d="M9 11.2h6.3M9 14h4.1" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M16 4.4 19.1 12l8.1 4-8.1 4L16 27.6 12.9 20l-8.1-4 8.1-4L16 4.4Z" />
      <circle cx="16" cy="16" r="3.1" />
      <path d="M16 9.5v2.1M16 20.4v2.1M9.5 16h2.1M20.4 16h2.1" />
    </svg>
  )
}

function groupCounter(
  current: number,
  total: number | null,
) {
  return total === null
    ? String(current)
    : `${current} / ${total}`
}

function groupCounterLabel(
  current: number,
  total: number | null,
) {
  return total === null
    ? `${current} владений в открытом каталоге`
    : `${current} из ${total} владений`
}

export default function CharacterSheetProficiencies({
  model,
  runtimeError,
}: {
  model: CharacterProficienciesReadModel | null
  runtimeError?: string
}) {
  const [expandedGroups, setExpandedGroups] = useState<ExpandedGroups>(
    defaultExpandedGroups,
  )

  function toggleGroup(
    group: CharacterProficiencyGroupKey,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    const header = event.currentTarget
    const scroller = header.closest<HTMLElement>(".u1-character-sheet")
    const beforeTop = header.getBoundingClientRect().top

    setExpandedGroups((current) => ({
      ...current,
      [group]: !current[group],
    }))

    window.requestAnimationFrame(() => {
      if (!scroller || !header.isConnected) return
      const afterTop = header.getBoundingClientRect().top
      const delta = afterTop - beforeTop
      if (Math.abs(delta) > 0.5) scroller.scrollTop += delta
    })
  }

  if (!model) {
    const failed = Boolean(runtimeError)

    return (
      <section
        className={
          "u1-character-proficiencies u1-character-proficiencies--status " +
          (failed
            ? "u1-character-proficiencies--error"
            : "u1-character-proficiencies--loading")
        }
        aria-label="Владения"
        aria-live="polite"
        data-stage="3"
        data-state={failed ? "error" : "loading"}
      >
        <span>
          {failed
            ? "Не удалось собрать владения"
            : "Собираем владения персонажа…"}
        </span>
        <small>
          {runtimeError ||
            "Character Engine и старый лист сводятся в один read-model."}
        </small>
      </section>
    )
  }

  const empty = model.groups.every((group) => group.currentCount === 0)

  return (
    <section
      className="u1-character-proficiencies"
      aria-label="Владения"
      data-stage="3"
      data-empty={empty || undefined}
    >
      {runtimeError ? (
        <div
          className="u1-character-proficiencies__warning"
          role="status"
        >
          <strong>Данные Character Engine могли обновиться не полностью.</strong>
          <small>{runtimeError}</small>
        </div>
      ) : null}

      <div className="u1-character-proficiencies__panels">
        {model.groups.map((group) => {
          const expanded = expandedGroups[group.key]
          const headerId = `proficiency-${group.key}-header`
          const bodyId = `proficiency-${group.key}-body`

          return (
            <article
              className="u1-character-proficiencies__panel"
              data-group={group.key}
              data-expanded={expanded ? "true" : "false"}
              data-empty={group.currentCount === 0 || undefined}
              key={group.key}
            >
              <button
                id={headerId}
                className="u1-character-proficiencies__head"
                type="button"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={(event) => toggleGroup(group.key, event)}
              >
                <span
                  className="u1-character-proficiencies__icon"
                  data-icon-slot={group.iconSlot}
                  aria-hidden="true"
                >
                  <ProficiencyGroupIcon group={group.key} />
                </span>

                <span className="u1-character-proficiencies__identity">
                  <strong>{group.label}</strong>
                  <small>{group.description}</small>
                </span>

                <span
                  className="u1-character-proficiencies__tail"
                  aria-label={groupCounterLabel(
                    group.currentCount,
                    group.catalogCount,
                  )}
                >
                  <strong aria-hidden="true">
                    {groupCounter(
                      group.currentCount,
                      group.catalogCount,
                    )}
                  </strong>
                  <i aria-hidden="true">⌄</i>
                </span>
              </button>

              <div
                id={bodyId}
                className="u1-character-proficiencies__collapse"
                role="region"
                aria-labelledby={headerId}
                aria-hidden={!expanded}
              >
                <div className="u1-character-proficiencies__collapse-inner">
                  <div className="u1-character-proficiencies__body">
                    <div
                      className="u1-character-proficiencies__tags"
                      aria-label={group.label}
                    >
                      {group.rows.map((row) => (
                        <span
                          className="u1-character-proficiencies__tag"
                          data-origin={row.origin}
                          data-rank={row.rank}
                          key={row.id}
                        >
                          {row.label}
                        </span>
                      ))}

                      {group.rows.length === 0 ? (
                        <span className="u1-character-proficiencies__empty">
                          Нет владений этого типа
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {model.unclassifiedRuntimeKeys.length ||
      model.unclassifiedLegacyTokens.length ? (
        <p
          className="u1-character-proficiencies__diagnostic"
          aria-hidden="true"
        >
          Неразобранные записи сохранены в read-model и не подмешиваются
          в пять панелей.
        </p>
      ) : null}
    </section>
  )
}
