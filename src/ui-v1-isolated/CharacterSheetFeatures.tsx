import { useEffect, useState } from "react"

import {
  characterAbilityCollapsedPreview,
  nextExpandedAbilityGroup,
} from "./characterAbilitiesAccordion.ts"
import type {
  CharacterAbilitiesReadModel,
  CharacterAbilityGroup,
  CharacterAbilityGroupKey,
  CharacterAbilityRow,
} from "./characterAbilitiesReadModel.ts"

function AbilityGroupIcon({
  group,
}: {
  group: CharacterAbilityGroupKey
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  }

  if (group === "class") {
    return (
      <svg {...common}>
        <path d="m7.2 4.2 9.6 15.6M16.8 4.2 7.2 19.8" />
        <path d="m5.2 6.4 2-2 2.2.5M18.8 6.4l-2-2-2.2.5" />
        <path d="m5.8 17.4 2.2 2.2M18.2 17.4 16 19.6" />
      </svg>
    )
  }

  if (group === "subclass") {
    return (
      <svg {...common}>
        <path d="M12 3.2 14 9.8 20.6 12 14 14.2 12 20.8 10 14.2 3.4 12 10 9.8 12 3.2Z" />
        <circle cx="12" cy="12" r="2.2" />
      </svg>
    )
  }

  if (group === "race") {
    return (
      <svg {...common}>
        <path d="M12 20.2V8.4" />
        <path d="M12 12.3c-3.6-.2-5.8-2-6.7-5.5 3.6-.3 5.9 1.4 6.7 5.5Z" />
        <path d="M12 9.6c3.4-.2 5.6-1.8 6.6-4.9-3.4-.4-5.7 1.2-6.6 4.9Z" />
        <path d="M9.4 20.2h5.2" />
      </svg>
    )
  }

  if (group === "background") {
    return (
      <svg {...common}>
        <path d="M5.2 5.3c2.5-.7 4.6-.3 6.8 1.2v11.4c-2.2-1.5-4.3-1.9-6.8-1.2V5.3Z" />
        <path d="M18.8 5.3c-2.5-.7-4.6-.3-6.8 1.2v11.4c2.2-1.5 4.3-1.9 6.8-1.2V5.3Z" />
        <path d="M8 9.2h2M14 9.2h2M8 12h2M14 12h2" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="6.7" />
      <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3" />
      <path d="m5.5 5.5 2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  )
}

function sourceSummary(group: CharacterAbilityGroup) {
  if (!group.sourceNames.length) {
    return group.key === "effect"
      ? "Активные состояния"
      : "Источник не назначен"
  }

  if (group.sourceNames.length <= 2) {
    return group.sourceNames.join(" · ")
  }

  return (
    group.sourceNames.slice(0, 2).join(" · ") +
    " · +" +
    (group.sourceNames.length - 2)
  )
}

function iconIsImage(value: string) {
  return /^(?:https?:|data:|blob:|\/)/i.test(value)
}

function AbilityRowIcon({
  row,
}: {
  row: CharacterAbilityRow
}) {
  return (
    <span
      className="u1-character-features__ability-icon"
      data-icon-id={row.icon || undefined}
      aria-hidden="true"
    >
      {iconIsImage(row.icon) ? (
        <img src={row.icon} alt="" draggable={false} />
      ) : (
        <AbilityGroupIcon group={row.group} />
      )}
    </span>
  )
}

function AbilityPreviewRow({
  row,
}: {
  row: CharacterAbilityRow
}) {
  return (
    <span
      className="u1-character-features__preview-row"
      data-suppressed={row.status === "suppressed" || undefined}
    >
      <AbilityRowIcon row={row} />
      <span>{row.label}</span>
    </span>
  )
}

function AbilityExpandedRow({
  row,
}: {
  row: CharacterAbilityRow
}) {
  return (
    <div
      className="u1-character-features__ability-row"
      data-ability-id={row.id}
      data-suppressed={row.status === "suppressed" || undefined}
    >
      <AbilityRowIcon row={row} />

      <span className="u1-character-features__ability-copy">
        <strong>{row.label}</strong>
        <small>
          {row.shortDescription ||
            (row.unlockLevel !== null
              ? "Открывается на " + row.unlockLevel + " уровне"
              : "Описание не добавлено")}
        </small>
      </span>

      {row.status === "suppressed" && (
        <span className="u1-character-features__ability-state">
          Заглушено
        </span>
      )}
    </div>
  )
}

export default function CharacterSheetFeatures({
  model,
  runtimeError,
}: {
  model: CharacterAbilitiesReadModel | null
  runtimeError?: string
}) {
  const [expandedGroup, setExpandedGroup] =
    useState<CharacterAbilityGroupKey | null>(null)

  useEffect(() => {
    if (!expandedGroup || !model) return

    const current = model.groups.find(
      (group) => group.key === expandedGroup,
    )
    if (!current || current.totalCount <= 0) {
      setExpandedGroup(null)
    }
  }, [expandedGroup, model])

  if (!model) {
    return (
      <section className="u1-character-features u1-character-features--loading">
        <span>
          {runtimeError
            ? "Character Engine не собрал умения."
            : "Character Engine собирает умения…"}
        </span>
        {runtimeError && <small>{runtimeError}</small>}
      </section>
    )
  }

  return (
    <section
      className="u1-character-features"
      aria-labelledby="character-abilities-title"
      data-stage="accordion"
      data-expanded-group={expandedGroup || undefined}
      data-unclassified-count={
        model.unclassifiedSourceIds.length > 0
          ? model.unclassifiedSourceIds.length
          : undefined
      }
    >
      <header className="u1-character-features__intro">
        <span id="character-abilities-title">УМЕНИЯ</span>
        <small>Всё, что делает персонажа тем, кто он есть</small>
      </header>

      <div className="u1-character-features__panels">
        {model.groups.map((group) => {
          const expanded =
            expandedGroup === group.key && group.totalCount > 0
          const preview = characterAbilityCollapsedPreview(group)
          const contentId =
            "character-ability-group-" + group.key

          return (
            <article
              key={group.key}
              className="u1-character-features__panel"
              data-group={group.key}
              data-expanded={expanded || undefined}
              data-empty={group.totalCount === 0 || undefined}
              data-suppressed-count={
                group.suppressedCount > 0
                  ? group.suppressedCount
                  : undefined
              }
            >
              <button
                type="button"
                className="u1-character-features__panel-toggle"
                disabled={group.totalCount <= 0}
                aria-expanded={expanded}
                aria-controls={contentId}
                onClick={() =>
                  setExpandedGroup((current) =>
                    nextExpandedAbilityGroup(
                      current,
                      group.key,
                      group.totalCount,
                    )
                  )
                }
              >
                <span className="u1-character-features__panel-source">
                  <span
                    className="u1-character-features__panel-icon"
                    aria-hidden="true"
                  >
                    <AbilityGroupIcon group={group.key} />
                  </span>

                  <span className="u1-character-features__panel-identity">
                    <strong>{group.label}</strong>
                    <small>{sourceSummary(group)}</small>
                  </span>
                </span>

                <span className="u1-character-features__panel-summary">
                  {expanded ? (
                    <span className="u1-character-features__opened-count">
                      Открыто: {group.totalCount} из {group.totalCount}
                    </span>
                  ) : group.totalCount > 0 ? (
                    <span className="u1-character-features__preview">
                      {preview.rows.map((row) => (
                        <AbilityPreviewRow key={row.id} row={row} />
                      ))}
                      {preview.hiddenCount > 0 && (
                        <small>
                          ещё {preview.hiddenCount}
                        </small>
                      )}
                    </span>
                  ) : (
                    <span className="u1-character-features__empty-label">
                      Нет умений
                    </span>
                  )}

                  <i
                    className="u1-character-features__panel-chevron"
                    aria-hidden="true"
                  >
                    ⌄
                  </i>
                </span>
              </button>

              <div
                id={contentId}
                className="u1-character-features__expanded"
                role="region"
                aria-label={group.label}
                hidden={!expanded}
              >
                {group.rows.map((row) => (
                  <AbilityExpandedRow key={row.id} row={row} />
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
