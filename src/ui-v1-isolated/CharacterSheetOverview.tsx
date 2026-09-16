import {
  useEffect,
  useRef,
  type CSSProperties,
} from "react"

import type {
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedGrant,
  ResolvedResource,
  ResourceRechargeTrigger,
} from "../character-engine/index.ts"
import type { ResourceSyncInput } from "../types/characterResources.ts"
import type { SnakeAction } from "../snake-engine"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import { CHARACTER_SHEET_MEDIA_SLOTS } from "./characterSheetUiContract"
import {
  createSheetReferenceMediaActions,
  type CharacterSheetMediaController,
} from "./characterSheetMediaActions"
import {
  classReferenceArtSlot,
  resourceReferenceArtSlot,
  type UiV1ReferenceMedia,
} from "./useUiV1ReferenceMedia"
import {
  CHARACTER_SHEET_SPENT_CROSS_ASSET,
  characterSheetVisualAssetForSlot,
} from "./characterSheetVisualAssets"
import {
  characterSheetEntitiesUsingResource,
  characterSheetEntityLabel,
  characterSheetLinkedEntitiesForAction,
  type CharacterSheetEntityNavigator,
} from "./characterSheetEntityNavigation"

const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"]

const spentCrossStyle = {
  "--u1-spent-cross": `url("${CHARACTER_SHEET_SPENT_CROSS_ASSET}")`,
} as CSSProperties

function mediaCropStyle(media: UiV1ReferenceMedia) {
  const presentation = media.presentation
  if (!presentation) {
    return {
      size: "cover",
      position: "center",
    }
  }

  const { x, y, width, height } = presentation.crop
  const positionX =
    width >= 0.999999
      ? 50
      : Math.max(0, Math.min(100, (x / (1 - width)) * 100))
  const positionY =
    height >= 0.999999
      ? 50
      : Math.max(0, Math.min(100, (y / (1 - height)) * 100))

  return {
    size: `${100 / width}% ${100 / height}%`,
    position: `${positionX}% ${positionY}%`,
  }
}

function iconVisual(
  iconSlot: string,
  override?: UiV1ReferenceMedia | null,
) {
  if (override?.url) {
    const crop = mediaCropStyle(override)
    return {
      render: "image" as const,
      style: {
        "--u1-sheet-icon": `url(${JSON.stringify(override.url)})`,
        "--u1-sheet-icon-size": crop.size,
        "--u1-sheet-icon-position": crop.position,
      } as CSSProperties,
    }
  }

  const asset = characterSheetVisualAssetForSlot(iconSlot)
  if (!asset) return null

  const positionX =
    asset.columns <= 1
      ? "0%"
      : `${(asset.column / (asset.columns - 1)) * 100}%`
  const positionY =
    asset.rows <= 1
      ? "0%"
      : `${(asset.row / (asset.rows - 1)) * 100}%`

  return {
    render: asset.render,
    style: {
      "--u1-sheet-icon": `url("${asset.url}")`,
      "--u1-sheet-icon-size":
        `${asset.columns * 100}% ${asset.rows * 100}%`,
      "--u1-sheet-icon-position": `${positionX} ${positionY}`,
    } as CSSProperties,
  }
}


const rechargeLabels: Record<ResourceRechargeTrigger, string> = {
  short_rest: "короткий отдых",
  long_rest: "долгий отдых",
  dawn: "рассвет",
  manual: "вручную",
  never: "не восстанавливается",
}

const economyLabels: Record<string, string> = {
  action: "Действие",
  bonus_action: "Бонусное действие",
  reaction: "Реакция",
  magic_action: "Магическое действие",
  "1_minute_ritual": "1 минута",
}

function titleFromKey(value: string) {
  const clean = value.replace(/[._:-]+/g, " ").replace(/\s+/g, " ").trim()
  if (!clean) return "Ресурс"
  return clean.charAt(0).toLocaleUpperCase("ru-RU") + clean.slice(1)
}

function grantLabel(grant: ResolvedGrant) {
  const payload =
    grant.payload && typeof grant.payload === "object" && !Array.isArray(grant.payload)
      ? grant.payload as Record<string, unknown>
      : null
  const label = typeof payload?.label === "string" ? payload.label.trim() : ""
  return label || titleFromKey(grant.key)
}

function rechargeText(resource: ResolvedResource) {
  const triggers = resource.recharge.triggers || []
  if (!triggers.length) return "без автоматического восстановления"
  return triggers
    .map((trigger) => rechargeLabels[trigger] || trigger.replace(/_/g, " "))
    .join(" · ")
}

function standardSlotLevel(stateKey: string) {
  const match = stateKey.match(/^spell_slot_([1-9])$/)
  return match ? Number(match[1]) : null
}

function pactSlotLevel(contract: ResolvedCharacterContract) {
  const value = contract.values.find(
    (entry) =>
      entry.key === "warlock_pact_slot_level" ||
      entry.stateKey === "warlock_pact_slot_level",
  )
  return value ? Math.max(1, Math.min(9, Math.round(value.value.value))) : null
}

function isSpellSlotResource(resource: ResolvedResource) {
  return standardSlotLevel(resource.stateKey) !== null ||
    resource.stateKey === "warlock_pact_slots"
}

function actionTitle(action: ResolvedAction) {
  return action.label?.trim() || titleFromKey(action.key)
}

function economyLabel(value: string) {
  return economyLabels[value] || titleFromKey(value)
}

function actionDetail(action: ResolvedAction) {
  const costs = [
    ...action.resourceCosts.map((cost) =>
      `${titleFromKey(cost.key)}: ${cost.amount} · доступно ${cost.current}/${cost.max}`
    ),
    ...action.costOptions.flatMap((option) =>
      option.costs.map((cost) =>
        `${option.label || titleFromKey(option.key)}: ${titleFromKey(cost.key)} ${cost.amount}`
      )
    ),
  ]

  const requirements = action.requirements
    .filter((item) => item.label)
    .map((item) => `${item.satisfied ? "✓" : "×"} ${item.label}`)

  return [
    economyLabel(action.economy),
    action.available ? "Сейчас доступно." : "Сейчас недоступно.",
    costs.length ? "Стоимость:\n" + costs.join("\n") : "",
    requirements.length ? "Условия:\n" + requirements.join("\n") : "",
  ].filter(Boolean).join("\n\n")
}

function actionPriority(action: ResolvedAction) {
  const economy = action.economy
  const economyRank =
    economy === "action" || economy === "magic_action"
      ? 0
      : economy === "bonus_action"
        ? 1
        : economy === "reaction"
          ? 2
          : 3

  return (action.available ? 0 : 10) + economyRank
}

function chargeCount(resource: ResolvedResource) {
  return Math.max(0, Math.round(resource.max.value))
}

function availableChargeCount(resource: ResolvedResource) {
  return Math.max(
    0,
    Math.min(chargeCount(resource), Math.round(resource.current)),
  )
}

function ResourceCharges({
  resource,
  iconSlot,
  mediaOverride = null,
  spell = false,
}: {
  resource: ResolvedResource
  iconSlot: string
  mediaOverride?: UiV1ReferenceMedia | null
  spell?: boolean
}) {
  const max = chargeCount(resource)
  const current = availableChargeCount(resource)
  const rendered = Math.min(max, 40)
  const visual = iconVisual(iconSlot, mediaOverride)

  if (max === 0) {
    return <span className="u1-character-overview__zero">нет зарядов</span>
  }

  return (
    <span
      className="u1-character-overview__charges"
      data-spell={spell || undefined}
      aria-label={`Доступно ${current} из ${max}`}
      data-current={current}
      data-max={max}
    >
      {Array.from({ length: rendered }, (_, index) => (
        <span
          key={index}
          className="u1-character-overview__charge"
          data-state={index < current ? "available" : "spent"}
          data-icon-slot={iconSlot}
          data-has-asset={visual ? true : undefined}
          data-asset-render={visual?.render}
          style={visual?.style}
          aria-hidden="true"
        >
          <i />
        </span>
      ))}
      {max > rendered && (
        <small className="u1-character-overview__charge-overflow">
          +{max - rendered}
        </small>
      )}
    </span>
  )
}

export default function CharacterSheetOverview({
  characterId,
  classKey,
  contract,
  resourceSyncInputs,
  runtimeError,
  onOpenFeatures,
  onOpenSpells,
  focusResourceKey,
  onSelectResource,
  onNavigateEntity,
  mediaController,
}: {
  characterId: string
  classKey: string
  contract: ResolvedCharacterContract | null
  resourceSyncInputs: ResourceSyncInput[]
  runtimeError?: string
  onOpenFeatures: () => void
  onOpenSpells: (level?: number | null) => void
  focusResourceKey?: string | null
  onSelectResource?: (stateKey: string) => void
  onNavigateEntity?: CharacterSheetEntityNavigator
  mediaController?: CharacterSheetMediaController | null
}) {
  const snake = useSnake()
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!focusResourceKey) return

    const frame = window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(
          `[data-resource-key="${focusResourceKey}"]`,
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [focusResourceKey])

  if (!contract) {
    return (
      <section className="u1-character-overview u1-character-overview--loading">
        <span>
          {runtimeError
            ? "Character Engine не собрал Overview."
            : "Character Engine собирает Overview…"}
        </span>
        {runtimeError && <small>{runtimeError}</small>}
      </section>
    )
  }

  const labelByStateKey = new Map(
    resourceSyncInputs.map((resource) => [resource.stateKey, resource.label]),
  )

  const classResources = contract.resources.filter(
    (resource) => !isSpellSlotResource(resource),
  )

  const pactLevel = pactSlotLevel(contract)
  const spellSlots = contract.resources
    .filter(isSpellSlotResource)
    .map((resource) => ({
      resource,
      level: standardSlotLevel(resource.stateKey) ??
        (resource.stateKey === "warlock_pact_slots" ? pactLevel : null),
      pact: resource.stateKey === "warlock_pact_slots",
    }))
    .sort((left, right) => {
      if (left.pact !== right.pact) return left.pact ? 1 : -1
      return (left.level || 99) - (right.level || 99)
    })

  const previewActions = contract.actions
    .slice()
    .sort((left, right) =>
      actionPriority(left) - actionPriority(right) ||
      actionTitle(left).localeCompare(actionTitle(right), "ru"),
    )
    .slice(0, 4)

  const protections = [
    ...contract.capabilities.resistances.map((grant) => ({
      kind: "Сопр.",
      grant,
    })),
    ...contract.capabilities.immunities.map((grant) => ({
      kind: "Иммун.",
      grant,
    })),
  ]

  return (
    <div
      className="u1-character-overview"
      ref={rootRef}
      style={spentCrossStyle}
    >
      {classResources.length > 0 && (
        <section
          className="u1-character-overview__section u1-character-overview__section--resources"
          aria-labelledby="u1-character-overview-resources"
        >
          <header className="u1-character-overview__section-head">
            <span id="u1-character-overview-resources">РЕСУРСЫ</span>
            <small>{classResources.length}</small>
          </header>

          <div className="u1-character-overview__resource-list">
            {classResources.map((resource) => {
              const label =
                labelByStateKey.get(resource.stateKey) ||
                titleFromKey(resource.key)
              const max = chargeCount(resource)
              const current = availableChargeCount(resource)
              const iconSlot =
                CHARACTER_SHEET_MEDIA_SLOTS.classResource(classKey)
              const exactMediaSlot =
                resourceReferenceArtSlot(resource.stateKey)
              const exactMedia =
                mediaController?.get(exactMediaSlot) || null
              const classResourceMedia =
                mediaController?.get(
                  classReferenceArtSlot(classKey, "resource"),
                ) || null
              const resourceMedia =
                exactMedia || classResourceMedia
              const visual = iconVisual(iconSlot, resourceMedia)
              const resourceMediaActions =
                mediaController
                  ? createSheetReferenceMediaActions({
                      controller: mediaController,
                      targetField: exactMediaSlot,
                      title: label,
                      eyebrow: "Лист персонажа · ресурс",
                      composeLabel: "Иконка ресурса · 1:1",
                      shape: "square",
                      aspectRatio: 1,
                      applyLabel: "Установить иконку",
                      successNotice: "Иконка ресурса обновлена.",
                      resetTitle: "Сбросить иконку ресурса",
                      resetNotice:
                        "Иконка ресурса возвращена к классовой или встроенной.",
                    })
                  : []
              const entity = {
                type: "character-resource",
                id: characterId + ":" + resource.stateKey,
                label,
              }
              const relatedTargets =
                characterSheetEntitiesUsingResource(
                  contract.actions,
                  contract.spells,
                  resource.stateKey,
                )
              const navigationAction: SnakeAction | null =
                onNavigateEntity && relatedTargets.length
                  ? {
                      id: "resource-linked-entities",
                      label: "Связано",
                      kind: "branch",
                      children: relatedTargets.map((target, index) => ({
                        id: "navigate-" + target.kind + "-" + index,
                        label: characterSheetEntityLabel(target),
                        execute: () => onNavigateEntity(target),
                      })),
                    }
                  : null
              const detailAction: SnakeAction = {
                id: "inspect-resource",
                label: "Подробнее",
                surface: {
                  kind: "detail",
                  eyebrow: "Ресурс персонажа",
                  title: label,
                  body: [
                    `Доступно: ${current} из ${max}.`,
                    `Восстановление: ${rechargeText(resource)}.`,
                  ].join("\n\n"),
                },
              }

              return (
                <SnakeTrigger
                  key={resource.stateKey}
                  entity={entity}
                  actions={[
                    detailAction,
                    ...(navigationAction ? [navigationAction] : []),
                    ...resourceMediaActions,
                  ]}
                >
                  <button
                    type="button"
                    className="u1-character-overview__resource"
                    data-resource-key={resource.stateKey}
                    data-depleted={max > 0 && current === 0 ? true : undefined}
                    data-focus-target={
                      focusResourceKey === resource.stateKey || undefined
                    }
                    onClick={() => {
                      onSelectResource?.(resource.stateKey)
                      if (detailAction.surface) {
                        snake.openSurface(detailAction.surface)
                      }
                    }}
                  >
                    <span className="u1-character-overview__resource-head">
                      <span
                        className="u1-character-overview__resource-icon"
                        data-icon-slot={iconSlot}
                        data-has-asset={visual ? true : undefined}
                        data-asset-render={visual?.render}
                        data-state={max > 0 && current === 0 ? "spent" : "available"}
                        style={visual?.style}
                        aria-hidden="true"
                      >
                        <i />
                      </span>
                      <span className="u1-character-overview__resource-copy">
                        <strong>{label}</strong>
                        <small>{rechargeText(resource)}</small>
                      </span>
                      <b>{current}/{max}</b>
                    </span>

                    <ResourceCharges
                      resource={resource}
                      iconSlot={iconSlot}
                      mediaOverride={resourceMedia}
                    />
                  </button>
                </SnakeTrigger>
              )
            })}
          </div>
        </section>
      )}

      {spellSlots.length > 0 && (
        <section
          className="u1-character-overview__section u1-character-overview__section--slots"
          aria-labelledby="u1-character-overview-slots"
        >
          <header className="u1-character-overview__section-head">
            <span id="u1-character-overview-slots">ЯЧЕЙКИ ЗАКЛИНАНИЙ</span>
            <button type="button" onClick={() => onOpenSpells(null)}>
              ВСЕ ›
            </button>
          </header>

          <div className="u1-character-overview__slot-viewport">
            {spellSlots.map(({ resource, level, pact }) => {
              const max = chargeCount(resource)
              const current = availableChargeCount(resource)
              const label = pact
                ? `ПАКТ · ${level ? roman[level] || level : "?"}`
                : roman[level || 0] || String(level || "?")
              const iconSlot = CHARACTER_SHEET_MEDIA_SLOTS.spellSlot(classKey)
              const spellMediaSlot =
                classReferenceArtSlot(classKey, "spell_slot")
              const spellMedia =
                mediaController?.get(spellMediaSlot) || null
              const spellMediaActions =
                mediaController
                  ? createSheetReferenceMediaActions({
                      controller: mediaController,
                      targetField: spellMediaSlot,
                      title: "Иконка ячеек заклинаний",
                      eyebrow: "Лист персонажа · класс",
                      composeLabel: "Ячейка заклинаний · 1:1",
                      shape: "square",
                      aspectRatio: 1,
                      applyLabel: "Установить иконку",
                      successNotice:
                        "Классовая иконка ячеек заклинаний обновлена.",
                      resetTitle: "Сбросить иконку ячеек",
                      resetNotice:
                        "Иконка ячеек возвращена к встроенной.",
                    })
                  : []

              const entity = {
                type: "spell-slot",
                id: characterId + ":" + resource.stateKey,
                label: pact
                  ? "Ячейки Магии договора"
                  : `Ячейки ${level} уровня`,
              }
              const detailAction: SnakeAction = {
                id: "inspect-spell-slots",
                label: "Подробнее",
                surface: {
                  kind: "detail",
                  eyebrow: pact ? "Магия договора" : "Ячейки заклинаний",
                  title: pact
                    ? `Пакт · ${level ? roman[level] || level : "?"} уровень`
                    : `${level} уровень`,
                  body: [
                    `Доступно: ${current} из ${max}.`,
                    `Восстановление: ${rechargeText(resource)}.`,
                  ].join("\n\n"),
                },
              }

              return (
                <SnakeTrigger
                  key={resource.stateKey}
                  entity={entity}
                  actions={[detailAction, ...spellMediaActions]}
                >
                  <button
                    type="button"
                    className="u1-character-overview__slot"
                    data-pact={pact || undefined}
                    data-slot-level={level ?? undefined}
                    data-slot-count={max}
                    onClick={() => onOpenSpells(level)}
                    aria-label={
                      pact
                        ? `Ячейки Магии договора, доступно ${current} из ${max}`
                        : `Ячейки ${level} уровня, доступно ${current} из ${max}`
                    }
                  >
                    <span className="u1-character-overview__slot-level">
                      <strong>{label}</strong>
                      {!pact && <small>УРОВЕНЬ</small>}
                    </span>

                    <ResourceCharges
                      resource={resource}
                      iconSlot={iconSlot}
                      mediaOverride={spellMedia}
                      spell
                    />

                    <b>{current}/{max}</b>
                  </button>
                </SnakeTrigger>
              )
            })}
          </div>
        </section>
      )}

      {previewActions.length > 0 && (
        <section
          className="u1-character-overview__section"
          aria-labelledby="u1-character-overview-actions"
        >
          <header className="u1-character-overview__section-head">
            <span id="u1-character-overview-actions">БЫСТРЫЕ ДЕЙСТВИЯ</span>
            <button type="button" onClick={onOpenFeatures}>
              ВСЕ ›
            </button>
          </header>

          <div className="u1-character-overview__action-list">
            {previewActions.map((action) => {
              const title = actionTitle(action)
              const entity = {
                type: "character-action",
                id: characterId + ":" + action.stateKey,
                label: title,
              }
              const relatedTargets =
                characterSheetLinkedEntitiesForAction(action)
              const navigationAction: SnakeAction | null =
                onNavigateEntity && relatedTargets.length
                  ? {
                      id: "action-linked-entities",
                      label: "Связано",
                      kind: "branch",
                      children: relatedTargets.map((target, index) => ({
                        id: "navigate-" + target.kind + "-" + index,
                        label: characterSheetEntityLabel(target),
                        execute: () => onNavigateEntity(target),
                      })),
                    }
                  : null
              const detailAction: SnakeAction = {
                id: "inspect-action",
                label: "Подробнее",
                surface: {
                  kind: "detail",
                  eyebrow: economyLabel(action.economy),
                  title,
                  body: actionDetail(action),
                },
              }

              return (
                <SnakeTrigger
                  key={action.stateKey}
                  entity={entity}
                  actions={[
                    detailAction,
                    ...(navigationAction ? [navigationAction] : []),
                  ]}
                >
                  <button
                    type="button"
                    className="u1-character-overview__action"
                    data-available={action.available || undefined}
                    onClick={() =>
                      detailAction.surface &&
                      snake.openSurface(detailAction.surface)
                    }
                  >
                    <span>
                      <strong>{title}</strong>
                      <small>{economyLabel(action.economy)}</small>
                    </span>
                    <i aria-hidden="true">
                      {action.available ? "●" : "○"}
                    </i>
                  </button>
                </SnakeTrigger>
              )
            })}
          </div>
        </section>
      )}

      {protections.length > 0 && (
        <section
          className="u1-character-overview__section"
          aria-labelledby="u1-character-overview-protections"
        >
          <header className="u1-character-overview__section-head">
            <span id="u1-character-overview-protections">ЗАЩИТЫ</span>
            <small>{protections.length}</small>
          </header>

          <div className="u1-character-overview__protections">
            {protections.slice(0, 8).map(({ kind, grant }) => (
              <span
                key={kind + ":" + grant.key + ":" + grant.variantKey}
                className="u1-character-overview__protection"
              >
                <small>{kind}</small>
                <strong>{grantLabel(grant)}</strong>
              </span>
            ))}
            {protections.length > 8 && (
              <span className="u1-character-overview__protection-more">
                +{protections.length - 8}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
