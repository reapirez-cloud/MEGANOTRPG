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
  spendResolvedClassSpellOption,
  useResolvedTemplateResourceAction,
} from "../../lib/classResourceRuntime.ts"
import { registeredCharacterClassPackages } from "../../rule-templates/classPackages.ts"
import { presentClassPackages, type PresentedClassSpell, type PresentedTemplateMechanics } from "../../rule-templates/classPresentation.ts"
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
  busy: boolean
  onSpend: (option: ResolvedSpellResourceOption) => void
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

      {hasRuntime && (
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

function ClassSpellCard({ entry, busy, onSpend }: SpellCardProps) {
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
  const hasContent = mechanics.features.length || mechanics.resources.length || mechanics.actions.length || mechanics.spells.length
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
                <span>{resourceLabel(resource)}</span>
                <strong>{resource.current}<em> / {resource.max.value}</em></strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {mechanics.actions.length > 0 && (
        <div className="class-panel__group">
          <div className="class-panel__group-title"><span>Классовые действия</span><small>{mechanics.actions.length}</small></div>
          <p className="class-panel__hint">MEGANOT автоматически считает только ресурсы. Условия сцены и сам эффект способности выполняются по описанию правила.</p>
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
            <span>Заклинания от класса</span><small>{mechanics.spells.length}</small>
          </div>
          <p className="class-panel__hint">Приходят автоматически с уровнем источника и не попадают в ручной список изученных. Заклинания 1+ уровня тратят общие ячейки персонажа.</p>
          <div className="class-panel__stack">
            {mechanics.spells.map((entry) => (
              <ClassSpellCard
                key={`${entry.spell.key}:${entry.access.key}`}
                entry={entry}
                busy={busyId === `spell:${entry.spell.key}:${entry.access.key}`}
                onSpend={(option) => onSpendSpell(entry, option)}
              />
            ))}
          </div>
        </div>
      )}

      {mechanics.features.length > 0 && (
        <div className="class-panel__group">
          <div className="class-panel__group-title"><span>Особенности и правила</span><small>{mechanics.features.length}</small></div>
          <div className="class-panel__features">
            {mechanics.features.map((feature) => (
              <article key={`${feature.target}:${feature.key}:${feature.variantKey}`}>
                <strong>{grantLabel(feature)}</strong>
                {grantDescription(feature) && <p>{grantDescription(feature)}</p>}
                <small>{feature.sources[0]?.source.name || "Классовая механика"}</small>
              </article>
            ))}
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

  async function useAction(action: ResolvedAction, optionKey?: string) {
    if (busyId) return
    setBusyId(`action:${action.stateKey}`)
    setRuntimeError("")
    const result = await useResolvedTemplateResourceAction(characterId, contract, action, optionKey)
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
          <p>Активные правила текущего уровня. Новые способности и классовые заклинания появляются автоматически, а конечные ресурсы считаются в одном месте.</p>
        </div>
        {onOpenReference && <button type="button" onClick={onOpenReference}>Справочник <span>›</span></button>}
      </header>

      {runtimeError && <div className="auth-error class-panel__error">{runtimeError}</div>}

      {packages.map((entry) => (
        <div className="class-panel__package" key={entry.classMechanics.templateId}>
          <TemplateBlock mechanics={entry.classMechanics} busyId={busyId} onUseAction={(action, option) => void useAction(action, option)} onSpendSpell={(spell, option) => void spendSpell(spell, option)} />
          {entry.subclassMechanics && <TemplateBlock mechanics={entry.subclassMechanics} busyId={busyId} onUseAction={(action, option) => void useAction(action, option)} onSpendSpell={(spell, option) => void spendSpell(spell, option)} />}
        </div>
      ))}

      {packages.length === 0 && <div className="class-panel__empty class-panel__empty--large">Класс ещё не привязан к Character Engine.</div>}
    </section>
  )
}
