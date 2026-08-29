import { useMemo, useState } from "react"
import type {
  GrantPayload,
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedGrant,
  ResolvedResource,
  ResolvedSpellResourceOption,
} from "../../character-engine/index.ts"
import {
  runResolvedTemplateResourceAction,
  spendResolvedClassSpellOption,
} from "../../lib/classResourceRuntime.ts"
import { registeredCharacterClassPackages } from "../../rule-templates/classPackages.ts"
import {
  presentClassPackages,
  type ClassMechanicEntryType,
  type PresentedClassSpell,
  type PresentedTemplateMechanics,
} from "../../rule-templates/classPresentation.ts"
import "./CharacterClassPanel.css"

type Props = {
  characterId: string
  contract: ResolvedCharacterContract
  onOpenReference?: () => void
}

type ActionCardProps = {
  action: ResolvedAction
  busy: boolean
  onUse: (action: ResolvedAction, optionKey?: string) => void
}

type SpellCardProps = {
  entry: PresentedClassSpell
  sourceKind: "class" | "subclass"
  busy: boolean
  onSpend: (option: ResolvedSpellResourceOption) => void
}

const mechanicTypeLabel: Record<ClassMechanicEntryType, string> = {
  special_action: "Особое действие",
  class_spell: "Заклинание класса",
  resource: "Ресурс",
  passive_rule: "Пассивная механика",
  reference_rule: "Справочное правило",
  proficiency: "Владение",
  resistance: "Сопротивление",
  immunity: "Иммунитет",
  sense: "Чувство",
  language: "Язык",
}

function payloadObject(payload: GrantPayload | undefined): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
}

function grantLabel(grant: ResolvedGrant): string {
  const payload = payloadObject(grant.payload)
  return typeof payload?.label === "string" && payload.label.trim() ? payload.label : grant.key
}

function grantDescription(grant: ResolvedGrant): string {
  const payload = payloadObject(grant.payload)
  return typeof payload?.description === "string" ? payload.description : ""
}

function resourceLabel(resource: ResolvedResource): string {
  const grant = resource.sources[0]?.source.name
  return grant && grant !== resource.key ? grant : resource.key.replace(/[._:-]+/g, " ")
}

function economyLabel(value: string): string {
  const labels: Record<string, string> = {
    action: "Действие",
    bonus_action: "Бонусное действие",
    reaction: "Реакция",
    magic_action: "Магическое действие",
    none: "Без действия",
    short_rest: "Короткий отдых",
  }
  return labels[value] || value.replace(/[._:-]+/g, " ")
}

function actionCost(action: ResolvedAction): string {
  const mandatory = action.resourceCosts.map((cost) => `${cost.amount} ${cost.key.replace(/[._:-]+/g, " ")}`)
  const alternatives = action.costOptions.map((option) =>
    option.label || option.costs.map((cost) => `${cost.amount} ${cost.key.replace(/[._:-]+/g, " ")}`).join(" + "),
  )
  if (alternatives.length) mandatory.push(`один вариант: ${alternatives.join(" / ")}`)
  return mandatory.join(" · ")
}

function actionHasResourceRuntime(action: ResolvedAction): boolean {
  return Boolean(
    action.resourceCosts.length ||
    action.costOptions.length ||
    action.effects.some((effect) => effect.kind === "resource"),
  )
}

function defaultActionOption(action: ResolvedAction): string {
  return action.costOptions.find((option) => option.available)?.key || action.costOptions[0]?.key || ""
}

function ClassActionCard({ action, busy, onUse }: ActionCardProps) {
  const cost = actionCost(action)
  const failed = action.requirements.filter((item) => !item.satisfied)
  const [optionKey, setOptionKey] = useState(() => defaultActionOption(action))
  const selectedOption = action.costOptions.find((option) => option.key === optionKey)
  const hasRuntime = actionHasResourceRuntime(action)
  const canUse = action.available && (!selectedOption || selectedOption.available)

  return (
    <article className={`class-panel__action ${action.available ? "" : "is-unavailable"}`}>
      <div className="class-panel__action-head">
        <span className="class-panel__action-rune" aria-hidden="true">◆</span>
        <div>
          <span className="class-panel__type">Особое действие</span>
          <strong>{action.label || action.key}</strong>
          <small>{economyLabel(action.economy)}{cost ? ` · ${cost}` : ""}</small>
        </div>
        <span className={`class-panel__status ${action.available ? "is-ready" : ""}`}>
          {action.available ? "Доступно" : "Нет ресурса"}
        </span>
      </div>

      {failed.length > 0 && (
        <div className="class-panel__requirements">
          {failed.map((requirement, index) => (
            <span key={`${requirement.kind}:${index}`}>
              {requirement.label || "Условие ресурса не выполнено"}
            </span>
          ))}
        </div>
      )}

      {hasRuntime ? (
        <div className="class-panel__runtime-row">
          {action.costOptions.length > 0 && (
            <select value={optionKey} onChange={(event) => setOptionKey(event.target.value)} aria-label="Способ оплаты">
              {action.costOptions.map((option) => (
                <option key={option.key} value={option.key} disabled={!option.available}>
                  {option.label || option.key}{option.available ? "" : " · нет ресурса"}
                </option>
              ))}
            </select>
          )}
          <button type="button" disabled={busy || !canUse} onClick={() => onUse(action, optionKey || undefined)}>
            {busy ? "Считаем…" : "Использовать"}
          </button>
        </div>
      ) : (
        <div className="class-panel__runtime-note">CE распознал это как особое действие. Отдельного списываемого ресурса нет — эффект применяется по точному правилу.</div>
      )}
    </article>
  )
}

function spellOptions(entry: PresentedClassSpell): ResolvedSpellResourceOption[] {
  const options = entry.access.methods.flatMap((method) => method.resourceOptions)
  const unique = new Map<string, ResolvedSpellResourceOption>()
  for (const option of options) {
    const identity = `${option.castLevel}:${option.costs.map((cost) => `${cost.stateKey}:${cost.amount}`).join("+")}`
    if (!unique.has(identity)) unique.set(identity, option)
  }
  return [...unique.values()].sort((left, right) => left.castLevel - right.castLevel)
}

function spellOptionLabel(option: ResolvedSpellResourceOption): string {
  const resource = option.costs[0]
  const availability = resource ? `${resource.current}/${resource.max}` : ""
  return `${option.castLevel} ур.${availability ? ` · ${availability}` : ""}`
}

function ClassSpellCard({ entry, sourceKind, busy, onSpend }: SpellCardProps) {
  const { spell, access } = entry
  const paidOptions = useMemo(() => spellOptions(entry), [entry])
  const firstAvailable = paidOptions.find((option) => option.available) || paidOptions[0]
  const [selectedKey, setSelectedKey] = useState(() => firstAvailable?.key || "")
  const selected = paidOptions.find((option) => option.key === selectedKey && option.available) || paidOptions.find((option) => option.available)
  const minimumSlot = paidOptions[0]?.castLevel
  const alwaysPrepared = access.preparationMode === "always_prepared"

  return (
    <article className={`class-panel__spell ${access.available ? "" : "is-unavailable"}`}>
      <div className="class-panel__spell-main">
        <span className="class-panel__spell-level">{spell.identity.level === 0 ? "∞" : spell.identity.level}</span>
        <div>
          <span className="class-panel__type">{sourceKind === "class" ? "Заклинание класса" : "Заклинание подкласса"}</span>
          <strong>{spell.identity.name}</strong>
          <small>
            {alwaysPrepared ? "Всегда подготовлено" : "Классовый доступ"}
            {spell.identity.level > 0 && minimumSlot ? ` · ячейка ${minimumSlot}+` : spell.identity.level === 0 ? " · без ячейки" : ""}
          </small>
        </div>
        <span className={`class-panel__status ${access.available ? "is-ready" : ""}`}>
          {access.available ? "Доступно" : "Нет ресурса"}
        </span>
      </div>

      {paidOptions.length > 0 && (
        <div className="class-panel__runtime-row class-panel__runtime-row--spell">
          <select
            value={selected?.key || selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
            aria-label={`Уровень ячейки для ${spell.identity.name}`}
          >
            {paidOptions.map((option) => (
              <option key={`${option.key}:${option.castLevel}`} value={option.key} disabled={!option.available}>
                {spellOptionLabel(option)}{option.available ? "" : " · нет"}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || !selected} onClick={() => selected && onSpend(selected)}>
            {busy ? "Списываем…" : "Потратить ячейку"}
          </button>
        </div>
      )}
    </article>
  )
}

function featureType(mechanics: PresentedTemplateMechanics, feature: ResolvedGrant): ClassMechanicEntryType {
  return mechanics.entries.find((entry) => entry.id === `feature:${feature.key}:${feature.variantKey}`)?.type || "reference_rule"
}

function featureIntegration(mechanics: PresentedTemplateMechanics, feature: ResolvedGrant): string {
  const entry = mechanics.entries.find((item) => item.id === `feature:${feature.key}:${feature.variantKey}`)
  if (entry?.integration === "structured") return "CE · структурированная механика"
  if (entry?.integration === "summary") return "CE · сводка механики"
  return "Справочное правило"
}

function capabilityGroups(mechanics: PresentedTemplateMechanics) {
  return [
    { type: "proficiency" as const, label: "Владения", values: mechanics.proficiencies },
    { type: "resistance" as const, label: "Сопротивления", values: mechanics.resistances },
    { type: "immunity" as const, label: "Иммунитеты", values: mechanics.immunities },
    { type: "sense" as const, label: "Чувства", values: mechanics.senses },
    { type: "language" as const, label: "Языки", values: mechanics.languages },
  ].filter((group) => group.values.length > 0)
}

function TemplateBlock({
  mechanics,
  busyId,
  onUseAction,
  onSpendSpell,
}: {
  mechanics: PresentedTemplateMechanics
  busyId: string
  onUseAction: (action: ResolvedAction, optionKey?: string) => void
  onSpendSpell: (entry: PresentedClassSpell, option: ResolvedSpellResourceOption) => void
}) {
  const capabilities = capabilityGroups(mechanics)
  const hasContent = mechanics.entries.length > 0
  return (
    <section className={`class-panel__source class-panel__source--${mechanics.kind}`}>
      <header className="class-panel__source-head">
        <span className="class-panel__source-icon" aria-hidden="true">{mechanics.kind === "class" ? "◇" : "✦"}</span>
        <div>
          <small>{mechanics.kind === "class" ? "Класс" : "Подкласс"} · {mechanics.level} ур.</small>
          <h3>{mechanics.name}</h3>
        </div>
      </header>

      {!hasContent && <div className="class-panel__empty">На этом уровне активных механик пока нет.</div>}

      {mechanics.resources.length > 0 && (
        <div className="class-panel__group">
          <div className="class-panel__group-title"><span>Ресурсы</span><small>{mechanics.resources.length}</small></div>
          <div className="class-panel__resources">
            {mechanics.resources.map((resource) => (
              <div className="class-panel__resource" key={resource.stateKey}>
                <small className="class-panel__type">Ресурс</small>
                <span>{resourceLabel(resource)}</span>
                <strong>{resource.current}<em> / {resource.max.value}</em></strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {mechanics.actions.length > 0 && (
        <div className="class-panel__group">
          <div className="class-panel__group-title"><span>Особые действия</span><small>{mechanics.actions.length}</small></div>
          <p className="class-panel__hint">CE определяет экономику действия и доступность. Если у способности есть конечный ресурс, кнопка «Использовать» списывает его; условия сцены и внешний эффект разрешаются по точному правилу.</p>
          <div className="class-panel__stack">
            {mechanics.actions.map((action) => (
              <ClassActionCard
                key={action.stateKey}
                action={action}
                busy={busyId === `action:${action.stateKey}`}
                onUse={onUseAction}
              />
            ))}
          </div>
        </div>
      )}

      {mechanics.spells.length > 0 && (
        <div className="class-panel__group">
          <div className="class-panel__group-title">
            <span>{mechanics.kind === "class" ? "Заклинания класса" : "Заклинания подкласса"}</span><small>{mechanics.spells.length}</small>
          </div>
          <p className="class-panel__hint">Это доступ, выданный именно классом или подклассом. Он приходит автоматически с уровнем источника и не смешивается с вручную изученными заклинаниями.</p>
          <div className="class-panel__stack">
            {mechanics.spells.map((entry) => (
              <ClassSpellCard
                key={`${entry.spell.key}:${entry.access.key}`}
                entry={entry}
                sourceKind={mechanics.kind}
                busy={busyId === `spell:${entry.spell.key}:${entry.access.key}`}
                onSpend={(option) => onSpendSpell(entry, option)}
              />
            ))}
          </div>
        </div>
      )}

      {capabilities.length > 0 && (
        <div className="class-panel__group">
          <div className="class-panel__group-title"><span>Постоянные эффекты и владения</span><small>{capabilities.reduce((sum, group) => sum + group.values.length, 0)}</small></div>
          <div className="class-panel__features">
            {capabilities.flatMap((group) => group.values.map((grant) => (
              <article key={`${group.type}:${grant.key}:${grant.variantKey}`}>
                <span className="class-panel__type">{mechanicTypeLabel[group.type]}</span>
                <strong>{grantLabel(grant)}</strong>
                {grantDescription(grant) && <p>{grantDescription(grant)}</p>}
                <small>{group.label} · CE</small>
              </article>
            )))}
          </div>
        </div>
      )}

      {mechanics.features.length > 0 && (
        <div className="class-panel__group">
          <div className="class-panel__group-title"><span>Особенности и правила</span><small>{mechanics.features.length}</small></div>
          <div className="class-panel__features">
            {mechanics.features.map((feature) => {
              const type = featureType(mechanics, feature)
              return (
                <article key={`${feature.target}:${feature.key}:${feature.variantKey}`}>
                  <span className={`class-panel__type ${type === "reference_rule" ? "is-reference" : ""}`}>{mechanicTypeLabel[type]}</span>
                  <strong>{grantLabel(feature)}</strong>
                  {grantDescription(feature) && <p>{grantDescription(feature)}</p>}
                  <small>{featureIntegration(mechanics, feature)} · {feature.sources[0]?.source.name || "Классовая механика"}</small>
                </article>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

export default function CharacterClassPanel({ characterId, contract, onOpenReference }: Props) {
  const packages = presentClassPackages(contract, registeredCharacterClassPackages(characterId))
  const [busyId, setBusyId] = useState("")
  const [runtimeError, setRuntimeError] = useState("")

  async function runAction(action: ResolvedAction, optionKey?: string) {
    if (busyId) return
    setBusyId(`action:${action.stateKey}`)
    setRuntimeError("")
    const result = await runResolvedTemplateResourceAction(characterId, contract, action, optionKey)
    setBusyId("")
    if (!result.ok) setRuntimeError(result.error)
  }

  async function spendSpell(entry: PresentedClassSpell, option: ResolvedSpellResourceOption) {
    if (busyId) return
    setBusyId(`spell:${entry.spell.key}:${entry.access.key}`)
    setRuntimeError("")
    const result = await spendResolvedClassSpellOption(characterId, contract, option)
    setBusyId("")
    if (!result.ok) setRuntimeError(result.error)
  }

  return (
    <section className="character-tab-section class-panel">
      <header className="class-panel__hero">
        <div>
          <span>Character Engine</span>
          <h2>Класс персонажа</h2>
          <p>Активные правила текущего уровня. Каждая запись имеет машинный тип: особое действие, заклинание класса, ресурс, пассивная механика или постоянный эффект.</p>
        </div>
        {onOpenReference && <button type="button" onClick={onOpenReference}>Справочник <span>›</span></button>}
      </header>

      {runtimeError && <div className="auth-error class-panel__error">{runtimeError}</div>}

      {packages.map((entry) => (
        <div className="class-panel__package" key={entry.classMechanics.templateId}>
          <TemplateBlock mechanics={entry.classMechanics} busyId={busyId} onUseAction={(action, option) => void runAction(action, option)} onSpendSpell={(spell, option) => void spendSpell(spell, option)} />
          {entry.subclassMechanics && <TemplateBlock mechanics={entry.subclassMechanics} busyId={busyId} onUseAction={(action, option) => void runAction(action, option)} onSpendSpell={(spell, option) => void spendSpell(spell, option)} />}
        </div>
      ))}

      {packages.length === 0 && <div className="class-panel__empty class-panel__empty--large">Класс ещё не привязан к Character Engine.</div>}
    </section>
  )
}
