import type {
  CharacterAbilitiesReadModel,
  CharacterAbilityGroup,
  CharacterAbilityGroupKey,
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

function countLabel(group: CharacterAbilityGroup) {
  if (group.totalCount === 0) return "Нет умений"
  if (group.totalCount === 1) return "1 умение"
  if (group.totalCount >= 2 && group.totalCount <= 4) {
    return group.totalCount + " умения"
  }
  return group.totalCount + " умений"
}

export default function CharacterSheetFeatures({
  model,
  runtimeError,
}: {
  model: CharacterAbilitiesReadModel | null
  runtimeError?: string
}) {
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
      data-stage="panel-shell"
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
        {model.groups.map((group) => (
          <article
            key={group.key}
            className="u1-character-features__panel"
            data-group={group.key}
            data-empty={group.totalCount === 0 || undefined}
            data-suppressed-count={
              group.suppressedCount > 0
                ? group.suppressedCount
                : undefined
            }
          >
            <div className="u1-character-features__panel-source">
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
            </div>

            <div
              className="u1-character-features__panel-summary"
              aria-label={countLabel(group)}
            >
              <span>{countLabel(group)}</span>
              <i aria-hidden="true">⌄</i>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
