import { useEffect, useRef } from "react"

import type {
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedGrant,
  ResolvedSourceRef,
} from "../character-engine/index.ts"
import type { RuleTemplate } from "../rule-templates/types.ts"
import type { SnakeAction } from "../snake-engine"
import {
  CHARACTER_SHEET_FEATURE_SOURCE_ORDER,
  CHARACTER_SHEET_FEATURE_TIMING_ORDER,
} from "./characterSheetUiContract"
import {
  characterSheetEntityFromSource,
  characterSheetEntityLabel,
  characterSheetLinkedEntitiesForAction,
  type CharacterSheetEntityNavigator,
  type CharacterSheetEntityTarget,
} from "./characterSheetEntityNavigation"
import { SnakeTrigger, useSnake } from "./SnakeProvider"

type FeatureSourceGroup = typeof CHARACTER_SHEET_FEATURE_SOURCE_ORDER[number]
type FeatureTiming = typeof CHARACTER_SHEET_FEATURE_TIMING_ORDER[number]

type FeatureEntry = {
  id: string
  label: string
  description: string
  category: FeatureSourceGroup
  sourceId: string
  originId: string
  sourceName: string
  sourceType: string
  timing: FeatureTiming
  navigationKeys: string[]
  sourceTarget: CharacterSheetEntityTarget | null
  action: ResolvedAction | null
  grant: ResolvedGrant | null
}

const categoryLabels: Record<FeatureSourceGroup, string> = {
  class: "КЛАСС",
  subclass: "ПОДКЛАСС",
  race: "РАСА",
  background: "ПРЕДЫСТОРИЯ",
  item: "ПРЕДМЕТЫ",
  effect: "ЭФФЕКТЫ",
  other: "ПРОЧЕЕ",
}

const timingLabels: Record<FeatureTiming, string> = {
  action: "Действие",
  bonus_action: "Бонусное действие",
  reaction: "Реакция",
  passive: "Пассивное",
  other: "Особенность",
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function titleFromKey(value: string) {
  const clean = value.replace(/[._:-]+/g, " ").replace(/\s+/g, " ").trim()
  if (!clean) return "Особенность"
  return clean.charAt(0).toLocaleUpperCase("ru-RU") + clean.slice(1)
}

function normalizedLabel(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/[^a-zа-яё0-9]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function sourceOf(sources: ResolvedSourceRef[]) {
  return sources[0]?.source || null
}

function templateIdFromSourceId(sourceId: string) {
  const match = sourceId.match(
    /^template:(?:race|subrace|class|subclass):([^:]+):v\d+/,
  )
  return match?.[1] || null
}

function categoryFromTemplateKind(
  kind: RuleTemplate["kind"],
): FeatureSourceGroup {
  if (kind === "class") return "class"
  if (kind === "subclass") return "subclass"
  return "race"
}

function categoryFromSourceType(
  sourceType: string,
  payloadKind: string,
): FeatureSourceGroup {
  const value = sourceType.toLocaleLowerCase("ru-RU")

  if (value.includes("subclass")) return "subclass"
  if (value.includes("class")) return "class"
  if (value.includes("subrace") || value.includes("race")) return "race"
  if (value.includes("background")) return "background"
  if (
    value.includes("item") ||
    value.includes("inventory") ||
    value.includes("equipment")
  ) return "item"
  if (
    value.includes("effect") ||
    value.includes("status") ||
    value.includes("condition") ||
    value.includes("curse")
  ) return "effect"

  if (value === "legacy_feature") {
    if (payloadKind === "class_feature") return "class"
    if (payloadKind === "racial_trait") return "race"
  }

  return "other"
}

function sourceMeta(
  sources: ResolvedSourceRef[],
  templatesById: ReadonlyMap<string, RuleTemplate>,
  payloadKind = "",
) {
  const source = sourceOf(sources)
  const sourceTarget = characterSheetEntityFromSource(source)
  const sourceType = source?.sourceType || "unknown"
  const sourceId = source?.id || "unknown"
  const templateId = templateIdFromSourceId(sourceId)
  const template = templateId ? templatesById.get(templateId) || null : null

  if (template) {
    return {
      category: categoryFromTemplateKind(template.kind),
      sourceId: "template:" + template.id,
      originId: sourceId,
      sourceName: template.name,
      sourceType,
      sourceTarget,
    }
  }

  const category = categoryFromSourceType(sourceType, payloadKind)
  const sourceName =
    sourceType === "legacy_feature"
      ? category === "class"
        ? "Ручные классовые особенности"
        : category === "race"
          ? "Ручные расовые особенности"
          : "Ручные особенности"
      : source?.name?.trim() || categoryLabels[category]

  return {
    category,
    sourceId:
      sourceType === "legacy_feature"
        ? "legacy:" + category
        : source?.parentSourceId || source?.id || category + ":unknown",
    originId: source?.id || category + ":unknown",
    sourceName,
    sourceType,
    sourceTarget,
  }
}

function timingFromEconomy(economy: string): FeatureTiming {
  const value = economy.toLocaleLowerCase("ru-RU")
  if (value === "action" || value === "magic_action") return "action"
  if (value === "bonus_action") return "bonus_action"
  if (value === "reaction") return "reaction"
  return "other"
}

function featureTiming(grant: ResolvedGrant): FeatureTiming {
  const payload = record(grant.payload)
  const mechanic = record(payload?.mechanic)
  const explicit =
    text(mechanic?.economy) ||
    text(mechanic?.actionType) ||
    text(mechanic?.activation)

  if (explicit) {
    const timing = timingFromEconomy(explicit)
    if (timing !== "other") return timing
  }

  return "passive"
}

function actionDetail(action: ResolvedAction) {
  const costs = [
    ...action.resourceCosts.map((cost) =>
      `${titleFromKey(cost.key)}: ${cost.amount} · ${cost.current}/${cost.max}`
    ),
    ...action.costOptions.flatMap((option) =>
      option.costs.map((cost) =>
        `${option.label || titleFromKey(option.key)}: ${titleFromKey(cost.key)} ${cost.amount}`
      )
    ),
  ]

  const requirements = action.requirements
    .filter((requirement) => requirement.label)
    .map((requirement) =>
      `${requirement.satisfied ? "✓" : "×"} ${requirement.label}`
    )

  return [
    timingLabels[timingFromEconomy(action.economy)],
    action.available ? "Сейчас доступно." : "Сейчас недоступно.",
    costs.length ? "Стоимость:\n" + costs.join("\n") : "",
    requirements.length ? "Условия:\n" + requirements.join("\n") : "",
  ].filter(Boolean).join("\n\n")
}

function buildEntries(
  contract: ResolvedCharacterContract,
  templates: RuleTemplate[],
): FeatureEntry[] {
  const templatesById = new Map(
    templates.map((template) => [template.id, template]),
  )
  const entries = new Map<string, FeatureEntry>()

  for (const grant of [
    ...contract.capabilities.features,
    ...contract.capabilities.traits,
  ]) {
    const payload = record(grant.payload)
    const payloadKind = text(payload?.kind)
    const source = sourceMeta(grant.sources, templatesById, payloadKind)
    const label = text(payload?.label) || titleFromKey(grant.key)
    const description = text(payload?.description)
    const key = source.originId + ":" + normalizedLabel(label)

    entries.set(key, {
      id: "grant:" + grant.key + ":" + grant.variantKey,
      label,
      description,
      ...source,
      timing: featureTiming(grant),
      navigationKeys: [
        "grant:" + grant.key + ":" + grant.variantKey,
        grant.key,
        grant.variantKey,
        ...grant.sources.map((entry) => entry.source.id),
      ],
      sourceTarget: source.sourceTarget,
      action: null,
      grant,
    })
  }

  for (const action of contract.actions) {
    const source = sourceMeta(action.sources, templatesById)
    const label = action.label?.trim() || titleFromKey(action.key)
    const key = source.originId + ":" + normalizedLabel(label)
    const current = entries.get(key)

    if (current) {
      entries.set(key, {
        ...current,
        timing: timingFromEconomy(action.economy),
        navigationKeys: [
          ...new Set([
            ...current.navigationKeys,
            "action:" + action.stateKey,
            action.stateKey,
            action.key,
            ...action.sources.map((entry) => entry.source.id),
          ]),
        ],
        sourceTarget: current.sourceTarget || source.sourceTarget,
        action,
      })
      continue
    }

    entries.set(key, {
      id: "action:" + action.stateKey,
      label,
      description: "",
      ...source,
      timing: timingFromEconomy(action.economy),
      navigationKeys: [
        "action:" + action.stateKey,
        action.stateKey,
        action.key,
        ...action.sources.map((entry) => entry.source.id),
      ],
      sourceTarget: source.sourceTarget,
      action,
      grant: null,
    })
  }

  const categoryRank = new Map(
    CHARACTER_SHEET_FEATURE_SOURCE_ORDER.map((key, index) => [key, index]),
  )
  const timingRank = new Map(
    CHARACTER_SHEET_FEATURE_TIMING_ORDER.map((key, index) => [key, index]),
  )

  return [...entries.values()].sort((left, right) =>
    (categoryRank.get(left.category) ?? 99) -
      (categoryRank.get(right.category) ?? 99) ||
    left.sourceName.localeCompare(right.sourceName, "ru") ||
    (timingRank.get(left.timing) ?? 99) -
      (timingRank.get(right.timing) ?? 99) ||
    left.label.localeCompare(right.label, "ru")
  )
}

function detailBody(entry: FeatureEntry) {
  return [
    entry.description,
    entry.action ? actionDetail(entry.action) : "",
  ].filter(Boolean).join("\n\n") || "Описание не добавлено."
}

export default function CharacterSheetFeatures({
  characterId,
  contract,
  templates,
  runtimeError,
  focusKey,
  onSelect,
  onNavigateEntity,
}: {
  characterId: string
  contract: ResolvedCharacterContract | null
  templates: RuleTemplate[]
  runtimeError?: string
  focusKey?: string | null
  onSelect?: (featureId: string) => void
  onNavigateEntity?: CharacterSheetEntityNavigator
}) {
  const snake = useSnake()
  const rootRef = useRef<HTMLDivElement | null>(null)

  const entries = contract ? buildEntries(contract, templates) : []
  const focusedEntry =
    focusKey
      ? entries.find((entry) => entry.navigationKeys.includes(focusKey)) || null
      : null

  useEffect(() => {
    if (!focusedEntry) return
    const frame = window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(
          `[data-entry-id="${focusedEntry.id}"]`,
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusedEntry?.id])

  if (!contract) {
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

  const byCategory = new Map<FeatureSourceGroup, FeatureEntry[]>()

  for (const entry of entries) {
    byCategory.set(entry.category, [
      ...(byCategory.get(entry.category) || []),
      entry,
    ])
  }

  if (entries.length === 0) {
    return (
      <section className="u1-character-features u1-character-features--empty">
        <span>У персонажа пока нет resolved-умений.</span>
      </section>
    )
  }

  return (
    <div className="u1-character-features" ref={rootRef}>
      {CHARACTER_SHEET_FEATURE_SOURCE_ORDER.map((category) => {
        const categoryEntries = byCategory.get(category) || []
        if (!categoryEntries.length) return null

        const sourceGroups = new Map<string, FeatureEntry[]>()
        for (const entry of categoryEntries) {
          sourceGroups.set(entry.sourceId, [
            ...(sourceGroups.get(entry.sourceId) || []),
            entry,
          ])
        }

        return (
          <section
            key={category}
            className="u1-character-features__category"
            data-category={category}
          >
            <header className="u1-character-features__category-head">
              <span>{categoryLabels[category]}</span>
              <small>{categoryEntries.length}</small>
            </header>

            {[...sourceGroups.entries()].map(([sourceId, sourceEntries]) => {
              const sourceName =
                sourceEntries[0]?.sourceName || categoryLabels[category]

              return (
                <div key={sourceId} className="u1-character-features__source">
                  <div className="u1-character-features__source-head">
                    <strong>{sourceName}</strong>
                  </div>

                  <div className="u1-character-features__list">
                    {sourceEntries.map((entry) => {
                      const entity = {
                        type: entry.action
                          ? "character-action"
                          : "character-feature",
                        id: characterId + ":" + entry.id,
                      }
                      const detailAction: SnakeAction = {
                        id: "inspect-feature",
                        label: "Подробнее",
                        surface: {
                          kind: "detail",
                          eyebrow: timingLabels[entry.timing],
                          title: entry.label,
                          body: detailBody(entry),
                        },
                      }
                      const relatedTargets = [
                        ...(entry.action
                          ? characterSheetLinkedEntitiesForAction(entry.action)
                          : []),
                        ...(entry.sourceTarget ? [entry.sourceTarget] : []),
                      ]
                      const navigationAction: SnakeAction | null =
                        onNavigateEntity && relatedTargets.length
                          ? {
                              id: "feature-linked-entities",
                              label: "Связано",
                              kind: "branch",
                              children: relatedTargets.map((target, index) => ({
                                id: "navigate-" + target.kind + "-" + index,
                                label: characterSheetEntityLabel(target),
                                execute: () => onNavigateEntity(target),
                              })),
                            }
                          : null
                      const sourceAction: SnakeAction = {
                        id: "feature-source",
                        label: "Источник",
                        surface: {
                          kind: "detail",
                          eyebrow: categoryLabels[entry.category],
                          title: entry.sourceName,
                          body: "Источник способности: " + entry.sourceName + ".",
                        },
                      }

                      return (
                        <SnakeTrigger
                          key={entry.id}
                          entity={entity}
                          actions={[
                            detailAction,
                            sourceAction,
                            ...(navigationAction ? [navigationAction] : []),
                          ]}
                        >
                          <button
                            type="button"
                            className="u1-character-features__row"
                            data-entry-id={entry.id}
                            data-focus-target={
                              focusedEntry?.id === entry.id || undefined
                            }
                            data-timing={entry.timing}
                            data-available={
                              entry.action?.available === true || undefined
                            }
                            data-unavailable={
                              entry.action?.available === false || undefined
                            }
                            onClick={() => {
                              onSelect?.(entry.id)
                              if (detailAction.surface) {
                                snake.openSurface(detailAction.surface)
                              }
                            }}
                          >
                            <span className="u1-character-features__timing">
                              {timingLabels[entry.timing]}
                            </span>
                            <span className="u1-character-features__copy">
                              <strong>{entry.label}</strong>
                              {entry.description && (
                                <small>{entry.description}</small>
                              )}
                            </span>
                            <i aria-hidden="true">
                              {entry.action
                                ? entry.action.available
                                  ? "●"
                                  : "○"
                                : "›"}
                            </i>
                          </button>
                        </SnakeTrigger>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
