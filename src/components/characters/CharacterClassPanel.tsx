import type {
  GrantPayload,
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedGrant,
  ResolvedResource,
} from "../../character-engine/index.ts"
import { registeredCharacterClassPackages } from "../../rule-templates/classPackages.ts"
import { presentClassPackages, type PresentedClassSpell, type PresentedTemplateMechanics } from "../../rule-templates/classPresentation.ts"
import "./CharacterClassPanel.css"

type Props = {
  characterId: string
  contract: ResolvedCharacterContract
  onOpenReference?: () => void
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
  const source = resource.sources[0]?.source.name
  return source && source !== resource.key ? source : resource.key.replace(/[._:-]+/g, " ")
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

function ClassActionCard({ action }: { action: ResolvedAction }) {
  const cost = actionCost(action)
  const failed = action.requirements.filter((item) => !item.satisfied)
  return (
    <article className={`class-panel__action ${action.available ? "" : "is-unavailable"}`}>
      <div className="class-panel__action-head">
        <span className="class-panel__action-rune" aria-hidden="true">◆</span>
        <div>
          <strong>{action.label || action.key}</strong>
          <small>{economyLabel(action.economy)}{cost ? ` · ${cost}` : ""}</small>
        </div>
        <span className={`class-panel__status ${action.available ? "is-ready" : ""}`}>
          {action.available ? "Готово" : "Недоступно"}
        </span>
      </div>
      {failed.length > 0 && (
        <div className="class-panel__requirements">
          {failed.map((requirement, index) => (
            <span key={`${requirement.kind}:${index}`} className={requirement.enforcement === "gm" ? "is-gm" : ""}>
              {requirement.label || (requirement.enforcement === "gm" ? "Требование ГМ" : "Условие не выполнено")}
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

function ClassSpellCard({ entry }: { entry: PresentedClassSpell }) {
  const { spell, access } = entry
  const methods = access.methods
  const paidOptions = methods.flatMap((method) => method.resourceOptions)
  const minimumSlot = paidOptions
    .map((option) => option.castLevel)
    .filter((level) => Number.isFinite(level) && level > 0)
    .sort((a, b) => a - b)[0]
  const alwaysPrepared = access.preparationMode === "always_prepared"
  return (
    <article className={`class-panel__spell ${access.available ? "" : "is-unavailable"}`}>
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
    </article>
  )
}

function TemplateBlock({ mechanics }: { mechanics: PresentedTemplateMechanics }) {
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
          <div className="class-panel__stack">{mechanics.actions.map((action) => <ClassActionCard key={action.stateKey} action={action} />)}</div>
        </div>
      )}

      {mechanics.spells.length > 0 && (
        <div className="class-panel__group">
          <div className="class-panel__group-title">
            <span>Заклинания от класса</span><small>{mechanics.spells.length}</small>
          </div>
          <p className="class-panel__hint">Приходят автоматически с уровнем источника. Они не требуют ручного изучения; заклинания 1+ уровня используют обычные ячейки.</p>
          <div className="class-panel__stack">{mechanics.spells.map((entry) => <ClassSpellCard key={`${entry.spell.key}:${entry.access.key}`} entry={entry} />)}</div>
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
  return (
    <section className="character-tab-section class-panel">
      <header className="class-panel__hero">
        <div>
          <span>Character Engine</span>
          <h2>Класс персонажа</h2>
          <p>Только реально активные механики текущего уровня. Новые способности и классовые заклинания появляются автоматически.</p>
        </div>
        {onOpenReference && <button type="button" onClick={onOpenReference}>Справочник <span>›</span></button>}
      </header>

      {packages.map((entry) => (
        <div className="class-panel__package" key={entry.classMechanics.templateId}>
          <TemplateBlock mechanics={entry.classMechanics} />
          {entry.subclassMechanics && <TemplateBlock mechanics={entry.subclassMechanics} />}
        </div>
      ))}

      {packages.length === 0 && <div className="class-panel__empty class-panel__empty--large">Класс ещё не привязан к Character Engine.</div>}
    </section>
  )
}
