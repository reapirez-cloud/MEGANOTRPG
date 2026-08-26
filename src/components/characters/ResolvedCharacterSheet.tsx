import { useMemo, useState } from "react"

import {
  explainCharacter,
  type AbilityKey,
  type CharacterEngineInput,
  type CharacterExplainQuery,
  type ExplanationNode,
  type GrantPayload,
  type ResolvedCharacterContract,
  type ResolvedGrant,
  type SkillKey,
} from "../../character-engine/index.ts"
import type { CharacterFeature, CharacterSheet } from "../../types/characterSheet.ts"
import ContextActionSheet, { type ContextAction } from "../common/ContextActionSheet.tsx"
import { useLongPressItem } from "../../hooks/useLongPressItem.ts"

const abilities: Array<[AbilityKey, string, string]> = [
  ["strength", "СИЛ", "Сила"],
  ["dexterity", "ЛОВ", "Ловкость"],
  ["constitution", "ТЕЛ", "Телосложение"],
  ["intelligence", "ИНТ", "Интеллект"],
  ["wisdom", "МДР", "Мудрость"],
  ["charisma", "ХАР", "Харизма"],
]

const skills: Array<[SkillKey, string]> = [
  ["acrobatics", "Акробатика"], ["animal_handling", "Уход за животными"],
  ["arcana", "Магия"], ["athletics", "Атлетика"], ["deception", "Обман"],
  ["history", "История"], ["insight", "Проницательность"],
  ["intimidation", "Запугивание"], ["investigation", "Анализ"],
  ["medicine", "Медицина"], ["nature", "Природа"], ["perception", "Восприятие"],
  ["performance", "Выступление"], ["persuasion", "Убеждение"],
  ["religion", "Религия"], ["sleight_of_hand", "Ловкость рук"],
  ["stealth", "Скрытность"], ["survival", "Выживание"],
]

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

function objectPayload(payload: GrantPayload | undefined): Record<string, unknown> | null {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
}

function grantLabel(grant: ResolvedGrant): string {
  const payload = objectPayload(grant.payload)
  return typeof payload?.label === "string" ? payload.label : grant.key
}

function grantDescription(grant: ResolvedGrant): string {
  const payload = objectPayload(grant.payload)
  return typeof payload?.description === "string" ? payload.description : ""
}

function resourceLabel(contract: ResolvedCharacterContract, key: string, variantKey: string): string {
  const grant = contract.grants.find((entry) =>
    entry.target === "resource" && entry.key === key && entry.variantKey === variantKey,
  )
  return grant ? grantLabel(grant) : key.replace(/^spell_slot_(\d+)$/, "Ячейки $1 уровня")
}

function economyLabel(value: string): string {
  const labels: Record<string, string> = {
    action: "Действие", bonus_action: "Бонусное действие", reaction: "Реакция", free: "Без действия",
  }
  return labels[value] || value
}

function collectSources(node: ExplanationNode, result = new Set<string>()): Set<string> {
  if (node.source?.name) result.add(node.source.name)
  for (const child of node.children || []) collectSources(child, result)
  return result
}

function TextBlock({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null
  return <article className="engine-sheet__text surface"><h4>{title}</h4><p>{text}</p></article>
}

type Props = {
  input: CharacterEngineInput
  contract: ResolvedCharacterContract
  narrative: CharacterSheet
  characterClass: string
  spellcastingAbility?: AbilityKey
  canManage: boolean
  features: CharacterFeature[]
  onEditSheet: () => void
  onEditResources: () => void
  onAddFeature: () => void
  onEditFeature: (feature: CharacterFeature) => void
  onDeleteFeature: (featureId: string) => Promise<{ ok: boolean; error?: string }>
  onOpenClassReference?: () => void
}

export default function ResolvedCharacterSheet({
  input,
  contract,
  narrative,
  characterClass,
  spellcastingAbility,
  canManage,
  features,
  onEditSheet,
  onEditResources,
  onAddFeature,
  onEditFeature,
  onDeleteFeature,
  onOpenClassReference,
}: Props) {
  const [explain, setExplain] = useState<{ title: string; query: CharacterExplainQuery } | null>(null)
  const [featureMenu, setFeatureMenu] = useState<CharacterFeature | null>(null)
  const [featureError, setFeatureError] = useState("")
  const bindFeature = useLongPressItem<CharacterFeature>((feature) => setFeatureMenu(feature))

  const explanation = useMemo(
    () => explain ? explainCharacter(input, explain.query) : null,
    [explain, input],
  )

  const visibleResources = contract.resources.filter((resource) => resource.max.value > 0)
  const magic = spellcastingAbility ? contract.spellcasting.byAbility[spellcastingAbility] : null

  function explainNumber(title: string, target: CharacterExplainQuery & { kind: "number" }) {
    setExplain({ title, query: target })
  }

  async function removeFeature(feature: CharacterFeature) {
    if (!window.confirm(`Удалить особенность «${feature.name}»?`)) return
    const result = await onDeleteFeature(feature.id)
    if (!result.ok) setFeatureError(result.error || "Не удалось удалить особенность.")
  }

  function featureActions(feature: CharacterFeature): ContextAction[] {
    if (!canManage) return []
    return [
      { id: "edit", label: "Редактировать", detail: "Название, тип и описание", icon: "✎", onSelect: () => onEditFeature(feature) },
      { id: "delete", label: "Удалить особенность", detail: "Она исчезнет из листа", icon: "×", danger: true, onSelect: () => removeFeature(feature) },
    ]
  }

  return (
    <section className="character-tab-section engine-sheet">
      <div className="section-head engine-sheet__head">
        <div>
          <h3 className="section-title">Лист персонажа</h3>
          <p className="item-meta">Все игровые числа рассчитаны Character Engine {contract.engineVersion}</p>
        </div>
        {canManage && <div className="section-actions"><button className="section-link" type="button" onClick={onEditResources}>♥ Ресурсы</button><button className="section-link" type="button" onClick={onEditSheet}>✎ Лист</button></div>}
      </div>

      <div className="engine-sheet__identity surface">
        <button type="button" onClick={onOpenClassReference} disabled={!onOpenClassReference}>
          <span>Класс</span><strong>{characterClass || "—"}</strong><small>{onOpenClassReference ? "Открыть в справочнике ›" : ""}</small>
        </button>
        {narrative.race && <div><span>Раса / вид</span><strong>{narrative.race}</strong></div>}
        {narrative.background && <div><span>Предыстория</span><strong>{narrative.background}</strong></div>}
        {narrative.alignment && <div><span>Мировоззрение</span><strong>{narrative.alignment}</strong></div>}
      </div>

      <div className="engine-sheet__combat">
        <button className="engine-stat surface" type="button" onClick={() => explainNumber("Класс доспеха", { kind: "number", target: "combat.ac" })}><span>КД</span><strong>{contract.combat.ac.value}</strong><small>Почему?</small></button>
        <div className="engine-stat surface"><span>HP</span><strong>{contract.combat.currentHp}<em>/{contract.combat.maxHp.value}</em></strong>{contract.combat.tempHp > 0 && <small>+{contract.combat.tempHp} врем.</small>}</div>
        <button className="engine-stat surface" type="button" onClick={() => explainNumber("Инициатива", { kind: "number", target: "combat.initiative" })}><span>Инициатива</span><strong>{signed(contract.combat.initiative.value)}</strong><small>Почему?</small></button>
        <button className="engine-stat surface" type="button" onClick={() => explainNumber("Скорость", { kind: "number", target: "combat.speed" })}><span>Скорость</span><strong>{contract.combat.speed.value}</strong><small>фт. · Почему?</small></button>
        <button className="engine-stat surface" type="button" onClick={() => explainNumber("Бонус мастерства", { kind: "number", target: "core.proficiencyBonus" })}><span>Мастерство</span><strong>{signed(contract.proficiencyBonus.value)}</strong><small>Почему?</small></button>
        <button className="engine-stat surface" type="button" onClick={() => explainNumber("Пассивное восприятие", { kind: "number", target: "passives.perception" })}><span>Пасс. восприятие</span><strong>{contract.passives.perception.value}</strong><small>Почему?</small></button>
      </div>

      <div className="engine-sheet__abilities">
        {abilities.map(([key, short, label]) => {
          const ability = contract.abilities[key]
          const save = contract.savingThrows[key]
          return (
            <button className="engine-ability surface" type="button" key={key} onClick={() => explainNumber(label, { kind: "number", target: `abilities.${key}` })}>
              <span>{short}</span><strong>{ability.value}</strong><em>{signed(ability.modifier)}</em>
              <small className={save.proficiencyRank > 0 ? "engine-save engine-save--active" : "engine-save"}>● Спас {signed(save.bonus.value)}</small>
            </button>
          )
        })}
      </div>

      {magic && contract.spells.length > 0 && (
        <article className="engine-sheet__magic surface">
          <div><span>Магия</span><strong>{abilities.find(([key]) => key === spellcastingAbility)?.[2] || spellcastingAbility}</strong></div>
          <div><span>СЛ</span><strong>{magic.saveDc}</strong></div>
          <div><span>Атака</span><strong>{signed(magic.attackBonus)}</strong></div>
          <div><span>Заклинаний</span><strong>{contract.spells.length}</strong></div>
        </article>
      )}

      {visibleResources.length > 0 && (
        <details className="engine-sheet__panel surface" open>
          <summary><span>Ресурсы</span><small>{visibleResources.length}</small></summary>
          <div className="engine-resource-list">
            {visibleResources.map((resource) => (
              <button type="button" key={resource.stateKey} onClick={() => setExplain({ title: resourceLabel(contract, resource.key, resource.variantKey), query: { kind: "resource", stateKey: resource.stateKey } })}>
                <span>{resourceLabel(contract, resource.key, resource.variantKey)}</span><strong>{resource.current}/{resource.max.value}</strong><small>Почему?</small>
              </button>
            ))}
          </div>
        </details>
      )}

      {contract.actions.length > 0 && (
        <details className="engine-sheet__panel surface" open>
          <summary><span>Действия</span><small>{contract.actions.length}</small></summary>
          <div className="engine-action-list">
            {contract.actions.map((action) => (
              <button type="button" className={!action.available ? "engine-action engine-action--disabled" : "engine-action"} key={action.stateKey} onClick={() => setExplain({ title: action.label || action.key, query: { kind: "action", stateKey: action.stateKey } })}>
                <span><strong>{action.label || action.key}</strong><small>{economyLabel(action.economy)}{action.resourceCosts.length ? ` · ${action.resourceCosts.map((cost) => `${cost.amount} ${cost.key}`).join(", ")}` : ""}</small></span>
                <span>{action.attack ? `Атака ${signed(action.attack.bonus.value)}` : ""}{action.damage.map((damage) => damage.dice ? ` ${damage.dice.count}к${damage.dice.sides}` : "").join("")}</span>
              </button>
            ))}
          </div>
        </details>
      )}

      <details className="engine-sheet__panel surface">
        <summary><span>Навыки</span><small>18</small></summary>
        <div className="engine-skill-list">
          {skills.map(([key, label]) => {
            const skill = contract.skills[key]
            return <button type="button" key={key} onClick={() => explainNumber(label, { kind: "number", target: `skills.${key}.bonus` })}><span className={skill.proficiencyRank > 0 ? "engine-prof engine-prof--active" : "engine-prof"}>{skill.proficiencyRank === 2 ? "◆" : skill.proficiencyRank === 1 ? "●" : "○"}</span><span>{label}</span><strong>{signed(skill.bonus.value)}</strong></button>
          })}
        </div>
      </details>

      {(contract.capabilities.resistances.length > 0 || contract.capabilities.immunities.length > 0) && (
        <details className="engine-sheet__panel surface">
          <summary><span>Защиты</span></summary>
          <div className="engine-chip-list">
            {contract.capabilities.resistances.map((entry) => <span key={`r:${entry.key}:${entry.variantKey}`}>Сопротивление: {grantLabel(entry)}</span>)}
            {contract.capabilities.immunities.map((entry) => <span key={`i:${entry.key}:${entry.variantKey}`}>Иммунитет: {grantLabel(entry)}</span>)}
          </div>
        </details>
      )}

      {(["senses", "languages", "proficiencies"] as const).map((section) => {
        const entries = contract.capabilities[section]
        if (!entries.length) return null
        const titles = { senses: "Чувства", languages: "Языки", proficiencies: "Владения" }
        return <details className="engine-sheet__panel surface" key={section}><summary><span>{titles[section]}</span><small>{entries.length}</small></summary><div className="engine-chip-list">{entries.map((entry) => <span key={`${entry.key}:${entry.variantKey}`}>{grantLabel(entry)}</span>)}</div></details>
      })}

      {(contract.capabilities.features.length > 0 || contract.capabilities.traits.length > 0 || canManage) && (
        <details className="engine-sheet__panel surface" open>
          <summary><span>Фиты и особенности</span><small>{contract.capabilities.features.length + contract.capabilities.traits.length}</small></summary>
          {canManage && <button className="engine-add-feature" type="button" onClick={onAddFeature}>+ Добавить особенность</button>}
          {featureError && <div className="auth-error">{featureError}</div>}
          <div className="engine-feature-list">
            {[...contract.capabilities.features, ...contract.capabilities.traits].map((entry) => {
              const payload = objectPayload(entry.payload)
              const legacyId = typeof payload?.legacyFeatureId === "string" ? payload.legacyFeatureId : null
              const feature = legacyId ? features.find((item) => item.id === legacyId) : undefined
              return <article className="engine-feature" key={`${entry.target}:${entry.key}:${entry.variantKey}`} {...(feature && canManage ? bindFeature(feature) : {})} style={{ touchAction: "pan-y" }}><div><strong>{grantLabel(entry)}</strong>{feature && canManage && <button type="button" onClick={() => onEditFeature(feature)}>✎</button>}</div>{grantDescription(entry) && <p>{grantDescription(entry)}</p>}</article>
            })}
          </div>
        </details>
      )}

      <div className="engine-sheet__narrative">
        <TextBlock title="Черты личности" text={narrative.personality_traits} />
        <TextBlock title="Идеалы" text={narrative.ideals} />
        <TextBlock title="Привязанности" text={narrative.bonds} />
        <TextBlock title="Слабости" text={narrative.flaws} />
        <TextBlock title="Предыстория" text={narrative.backstory} />
        <TextBlock title="Заметки" text={narrative.notes} />
      </div>

      {explain && explanation && (
        <div className="sheet-backdrop" onMouseDown={() => setExplain(null)}>
          <div className="bottom-sheet engine-explain" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head"><div><h3 className="sheet-title">{explain.title}</h3><p className="sheet-copy">Почему получилось именно это число</p></div><button className="sheet-close" type="button" onClick={() => setExplain(null)}>×</button></div>
            {explanation.value !== undefined && <div className="engine-explain__value">{typeof explanation.value === "number" ? signed(explanation.value) : String(explanation.value)}</div>}
            <p className="engine-explain__summary">{explanation.summary}</p>
            <div className="engine-explain__sources"><strong>Источники</strong>{[...collectSources(explanation.tree)].length ? [...collectSources(explanation.tree)].map((source) => <span key={source}>{source}</span>) : <span>Базовое правило Character Engine</span>}</div>
          </div>
        </div>
      )}

      {featureMenu && <ContextActionSheet title={featureMenu.name} subtitle="Долгое нажатие открывает действия с особенностью" actions={featureActions(featureMenu)} onClose={() => setFeatureMenu(null)} />}
    </section>
  )
}
