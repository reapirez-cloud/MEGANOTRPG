import { useEffect, useState } from "react"

import {
  characterAbilityCollapsedPreview,
  nextExpandedAbilityGroup,
} from "./characterAbilitiesAccordion.ts"
import {
  characterAbilityIconVisual,
} from "./characterAbilityMedia.ts"
import {
  characterAbilityDetailSurface,
  characterAbilityEntity,
  createCharacterAbilitySnakeActions,
  type CharacterAbilitySuppressionResult,
} from "./characterAbilitySnakeActions.ts"
import type {
  CharacterAbilitiesReadModel,
  CharacterAbilityGroup,
  CharacterAbilityGroupKey,
  CharacterAbilityRow,
} from "./characterAbilitiesReadModel.ts"
import { SnakeTrigger, useSnake } from "./SnakeProvider"

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

  if (group === "feat") {
    return (
      <svg {...common}>
        <path d="M12 3.2 14.2 9.7 20.8 12l-6.6 2.3L12 20.8l-2.2-6.5L3.2 12l6.6-2.3L12 3.2Z" />
        <path d="M8.7 8.7 15.3 15.3M15.3 8.7l-6.6 6.6" />
      </svg>
    )
  }

  if (group === "special") {
    return (
      <svg {...common}>
        <path d="M6.2 4.8c2.4 1.5 4.2 1.7 5.8.5 1.6 1.2 3.4 1 5.8-.5-.3 5.9-2.1 10.7-5.8 14.4-3.7-3.7-5.5-8.5-5.8-14.4Z" />
        <path d="M9 10.2c.8-.7 1.6-1 2.4-.9M15 10.2c-.8-.7-1.6-1-2.4-.9" />
        <path d="M9.5 14.6c1.7.8 3.3.8 5 0" />
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
      : "Не назначено"
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

function AbilityRowIcon({
  row,
}: {
  row: CharacterAbilityRow
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const resolved = characterAbilityIconVisual(row.icon)
  const visual =
    imageFailed && resolved.kind === "image"
      ? { kind: "fallback" as const }
      : resolved

  useEffect(() => {
    setImageFailed(false)
  }, [row.icon])

  return (
    <span
      className="u1-character-features__ability-icon"
      data-icon-id={row.icon || undefined}
      data-icon-kind={visual.kind}
      data-asset-render={
        visual.kind === "atlas"
          ? visual.render
          : undefined
      }
      style={visual.kind === "atlas" ? visual.style : undefined}
      aria-hidden="true"
    >
      {visual.kind === "image" ? (
        <img
          src={visual.src}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : visual.kind === "atlas" ? (
        <i className="u1-character-features__ability-icon-sprite" />
      ) : visual.kind === "glyph" ? (
        <span className="u1-character-features__ability-icon-glyph">
          {visual.glyph}
        </span>
      ) : (
        <AbilityGroupIcon group={row.group} />
      )}
    </span>
  )
}

function AbilityInteractiveRow({
  characterId,
  row,
  compact = false,
  canManage,
  onSelect,
  onSetSuppressed,
}: {
  characterId: string
  row: CharacterAbilityRow
  compact?: boolean
  canManage: boolean
  onSelect?: (abilityId: string) => void
  onSetSuppressed?: (
    sourceId: string,
    suppressed: boolean,
  ) => Promise<CharacterAbilitySuppressionResult>
}) {
  const snake = useSnake()
  const entity = characterAbilityEntity(characterId, row)
  const actions = createCharacterAbilitySnakeActions(row, {
    canManage,
    setSuppressed: onSetSuppressed,
  })
  const detail = characterAbilityDetailSurface(row)

  if (compact) {
    return (
      <SnakeTrigger entity={entity} actions={actions}>
        <button
          type="button"
          className="u1-character-features__preview-row"
          data-ability-id={row.id}
          data-suppressed={row.status === "suppressed" || undefined}
          onClick={() => {
            onSelect?.(row.id)
            snake.openSurface(detail)
          }}
        >
          <AbilityRowIcon row={row} />
          <span>{row.label}</span>
        </button>
      </SnakeTrigger>
    )
  }

  return (
    <SnakeTrigger entity={entity} actions={actions}>
      <button
        type="button"
        className="u1-character-features__ability-row"
        data-ability-id={row.id}
        data-suppressed={row.status === "suppressed" || undefined}
        onClick={() => {
          onSelect?.(row.id)
          snake.openSurface(detail)
        }}
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
      </button>
    </SnakeTrigger>
  )
}

export default function CharacterSheetFeatures({
  characterId,
  model,
  runtimeError,
  canManage,
  onSelect,
  onSetSuppressed,
}: {
  characterId: string
  model: CharacterAbilitiesReadModel | null
  runtimeError?: string
  canManage: boolean
  onSelect?: (abilityId: string) => void
  onSetSuppressed?: (
    sourceId: string,
    suppressed: boolean,
  ) => Promise<CharacterAbilitySuppressionResult>
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
      aria-label="Умения персонажа"
      data-expanded-group={expandedGroup || undefined}
      data-unclassified-count={
        model.unclassifiedSourceIds.length > 0
          ? model.unclassifiedSourceIds.length
          : undefined
      }
    >
      <div className="u1-character-features__panels">
        {model.groups.map((group) => {
          const expanded =
            expandedGroup === group.key && group.totalCount > 0
          const preview = characterAbilityCollapsedPreview(group)
          const contentId =
            "character-ability-group-" + group.key
          const toggleGroup = () =>
            setExpandedGroup((current) =>
              nextExpandedAbilityGroup(
                current,
                group.key,
                group.totalCount,
              )
            )

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
              <div className="u1-character-features__panel-head">
                <button
                  type="button"
                  className="u1-character-features__panel-source"
                  disabled={group.totalCount <= 0}
                  aria-expanded={expanded}
                  aria-controls={contentId}
                  onClick={toggleGroup}
                >
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
                </button>

                <div className="u1-character-features__panel-summary">
                  {expanded ? (
                    <span className="u1-character-features__opened-count">
                      Открыто: {group.totalCount} из {group.totalCount}
                    </span>
                  ) : group.totalCount > 0 ? (
                    <span className="u1-character-features__preview">
                      {preview.rows.map((row) => (
                        <AbilityInteractiveRow
                          key={row.id}
                          characterId={characterId}
                          row={row}
                          compact
                          canManage={canManage}
                          onSelect={onSelect}
                          onSetSuppressed={onSetSuppressed}
                        />
                      ))}
                    </span>
                  ) : (
                    <span
                      className="u1-character-features__empty-label"
                      aria-label="Нет доступных умений"
                    >
                      —
                    </span>
                  )}

                  <span className="u1-character-features__panel-tail">
                    {!expanded && preview.hiddenCount > 0 && (
                      <small className="u1-character-features__panel-more">
                        ещё {preview.hiddenCount}
                      </small>
                    )}

                    <button
                      type="button"
                      className="u1-character-features__panel-chevron-button"
                      disabled={group.totalCount <= 0}
                      aria-expanded={expanded}
                      aria-controls={contentId}
                      aria-label={
                        expanded
                          ? "Свернуть " + group.label
                          : "Развернуть " + group.label
                      }
                      onClick={toggleGroup}
                    >
                      <i
                        className="u1-character-features__panel-chevron"
                        aria-hidden="true"
                      >
                        ⌄
                      </i>
                    </button>
                  </span>
                </div>
              </div>

              <div
                id={contentId}
                className="u1-character-features__expanded"
                role="region"
                aria-label={group.label}
                hidden={!expanded}
              >
                {group.rows.map((row) => (
                  <AbilityInteractiveRow
                    key={row.id}
                    characterId={characterId}
                    row={row}
                    canManage={canManage}
                    onSelect={onSelect}
                    onSetSuppressed={onSetSuppressed}
                  />
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
