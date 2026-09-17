import { useMemo, useState } from "react"

import {
  explainCharacter,
  type AbilityKey,
  type CharacterEngineInput,
  type CharacterExplainQuery,
  type GrantPayload,
  type NumericTarget,
  type ResolvedCharacterContract,
  type ResolvedGrant,
  type ResolvedResource,
  type SkillKey,
} from "../../character-engine/index.ts"
import { useLongPressItem } from "../../hooks/useLongPressItem.ts"
import type { CharacterFeature } from "../../types/characterSheet.ts"
import ContextActionSheet, { type ContextAction } from "../common/ContextActionSheet.tsx"

const abilities: Array<[AbilityKey, string, string, UiIconName]> = [
  ["strength", "СИЛ", "Сила", "strength"],
  ["dexterity", "ЛОВ", "Ловкость", "dexterity"],
  ["constitution", "ТЕЛ", "Телосложение", "constitution"],
  ["intelligence", "ИНТ", "Интеллект", "intelligence"],
  ["wisdom", "МДР", "Мудрость", "wisdom"],
  ["charisma", "ХАР", "Харизма", "charisma"],
]

const skills: Array<[SkillKey, string]> = [
  ["acrobatics", "Акробатика"],
  ["animal_handling", "Уход за животными"],
  ["arcana", "Магия"],
  ["athletics", "Атлетика"],
  ["deception", "Обман"],
  ["history", "История"],
  ["insight", "Проницательность"],
  ["intimidation", "Запугивание"],
  ["investigation", "Анализ"],
  ["medicine", "Медицина"],
  ["nature", "Природа"],
  ["perception", "Восприятие"],
  ["performance", "Выступление"],
  ["persuasion", "Убеждение"],
  ["religion", "Религия"],
  ["sleight_of_hand", "Ловкость рук"],
  ["stealth", "Скрытность"],
  ["survival", "Выживание"],
]

const resourcePresentation: Record<string, { icon: string; label?: string }> = {
  rage: { icon: "⟁", label: "Ярость" },
  bardic_inspiration: { icon: "✧", label: "Вдохновение барда" },
  channel_divinity: { icon: "✦", label: "Божественный канал" },
  wild_shape: { icon: "◈", label: "Дикая форма" },
  second_wind: { icon: "↟", label: "Второе дыхание" },
  action_surge: { icon: "⌁", label: "Всплеск действий" },
  lay_on_hands: { icon: "†", label: "Наложение рук" },
  monk_focus: { icon: "⊙", label: "Очки концентрации" },
  monk_uncanny_metabolism: { icon: "◌", label: "Невероятный метаболизм" },
  sorcery_points: { icon: "✺", label: "Очки чародейства" },
  innate_sorcery: { icon: "✹", label: "Врождённое чародейство" },
  sorcerous_restoration: { icon: "⌇", label: "Чародейское восстановление" },
  wizard_arcane_recovery: { icon: "△", label: "Магическое восстановление" },
  wizard_chronurgy_chronal_shift: { icon: "◐", label: "Хрональный сдвиг" },
  wizard_chronurgy_momentary_stasis: { icon: "□", label: "Мгновенный стазис" },
  wizard_chronurgy_arcane_abeyance: { icon: "◇", label: "Тайное ожидание" },
  warlock_pact_slots: { icon: "◆", label: "Магия договора" },
}

const uiIconPaths = {
  strength: "/ui-icons/grimdark/strength.png",
  dexterity: "/ui-icons/grimdark/dexterity.png",
  constitution: "/ui-icons/grimdark/constitution.png",
  intelligence: "/ui-icons/grimdark/intelligence.png",
  wisdom: "/ui-icons/grimdark/wisdom.png",
  charisma: "/ui-icons/grimdark/charisma.png",
  "armor-class": "/ui-icons/grimdark/armor-class.png",
  initiative: "/ui-icons/grimdark/initiative.png",
  proficiency: "/ui-icons/grimdark/proficiency.png",
  "spell-save-dc": "/ui-icons/grimdark/spell-save-dc.png",
  "passive-perception": "/ui-icons/grimdark/passive-perception.png",
  inspiration: "/ui-icons/grimdark/inspiration.png",
} as const

type UiIconName = keyof typeof uiIconPaths

function UiIcon({ name, className = "" }: { name: UiIconName; className?: string }) {
  return <img className={"opus-ui-icon " + className} src={uiIconPaths[name]} alt="" aria-hidden="true" />
}

const resourceIconNames: Record<string, UiIconName> = {
  rage: "strength",
  bardic_inspiration: "inspiration",
  channel_divinity: "spell-save-dc",
  wild_shape: "wisdom",
  second_wind: "constitution",
  action_surge: "initiative",
  lay_on_hands: "spell-save-dc",
  monk_focus: "wisdom",
  monk_uncanny_metabolism: "constitution",
  sorcery_points: "spell-save-dc",
  innate_sorcery: "charisma",
  sorcerous_restoration: "inspiration",
  wizard_arcane_recovery: "intelligence",
  wizard_chronurgy_chronal_shift: "initiative",
  wizard_chronurgy_momentary_stasis: "passive-perception",
  wizard_chronurgy_arcane_abeyance: "spell-save-dc",
  warlock_pact_slots: "spell-save-dc",
}

const romanLevels = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"]

function signed(value: number): string {
  return value >= 0 ? "+" + value : String(value)
}

function objectPayload(payload: GrantPayload | undefined): Record<string, unknown> | null {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
}

function friendlyKey(value: string): string {
  const cleaned = value
    .replace(/^legacy[.:_-]*/i, "")
    .replace(/[.:/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned) return "Особенность"
  return cleaned.charAt(0).toLocaleUpperCase("ru-RU") + cleaned.slice(1)
}

function grantLabel(grant: ResolvedGrant): string {
  const payload = objectPayload(grant.payload)
  return typeof payload?.label === "string" && payload.label.trim()
    ? payload.label
    : friendlyKey(grant.key)
}

function grantDescription(grant: ResolvedGrant): string {
  const payload = objectPayload(grant.payload)
  return typeof payload?.description === "string" ? payload.description : ""
}

function resourceLabel(resource: ResolvedResource): string {
  if (resource.stateKey.startsWith("wizard_signature_")) return "Фирменное заклинание"
  return resourcePresentation[resource.stateKey]?.label || friendlyKey(resource.key || resource.stateKey)
}

function resourceIcon(resource: ResolvedResource): string {
  if (resource.stateKey.startsWith("wizard_signature_")) return "✥"
  const known = resourcePresentation[resource.stateKey]?.icon
  if (known) return known
  const parts = (resource.key || resource.stateKey).split(/[_:.\s-]+/).filter(Boolean)
  if (parts.length >= 2) return ((parts[0][0] || "◇") + (parts[1][0] || "")).toLocaleUpperCase("ru-RU")
  return (parts[0] || "◇").slice(0, 2).toLocaleUpperCase("ru-RU")
}

function resourcePips(resource: ResolvedResource) {
  const max = Math.max(0, Math.round(resource.max.value))
  if (max === 0 || max > 8) return null
  return (
    <span className="opus-resource-line__pips" aria-label={resource.current + " из " + max}>
      {Array.from({ length: max }, (_, index) => (
        <i key={index} data-filled={index < resource.current ? "true" : undefined} />
      ))}
    </span>
  )
}

type Props = {
  input: CharacterEngineInput
  contract: ResolvedCharacterContract
  classLabel: string
  spellcastingAbility?: AbilityKey
  canManage: boolean
  features: CharacterFeature[]
  onEditSheet: () => void
  onEditResources: () => void
  onAddFeature: () => void
  onEditFeature: (feature: CharacterFeature) => void
  onDeleteFeature: (featureId: string) => Promise<{ ok: boolean; error?: string }>
  onOpenClass: () => void
  onOpenSpells: (_level?: number) => void
}

export default function ResolvedCharacterSheetOpus({
  input,
  contract,
  classLabel,
  spellcastingAbility,
  canManage,
  features,
  onEditSheet,
  onEditResources,
  onAddFeature,
  onEditFeature,
  onDeleteFeature,
  onOpenClass,
  onOpenSpells,
}: Props) {
  const [expandedAbility, setExpandedAbility] = useState<AbilityKey | null>(null)
  const [explain, setExplain] = useState<{ title: string; query: CharacterExplainQuery } | null>(null)
  const [featureMenu, setFeatureMenu] = useState<CharacterFeature | null>(null)
  const [featureError, setFeatureError] = useState("")
  const bindFeature = useLongPressItem<CharacterFeature>((feature) => setFeatureMenu(feature))

  const explanation = useMemo(() => explain ? explainCharacter(input, explain.query) : null, [explain, input])
  const featureGrants = [...contract.capabilities.features, ...contract.capabilities.traits]
  const spellSlots = contract.resources
    .map((resource) => {
      const match = resource.stateKey.match(/^spell_slot_(\d+)$/)
      return match ? { resource, level: Number(match[1]) } : null
    })
    .filter((entry): entry is { resource: ResolvedResource; level: number } => Boolean(entry))
    .sort((left, right) => left.level - right.level)
  const uniqueResources = contract.resources.filter((resource) => !/^spell_slot_\d+$/.test(resource.stateKey))

  const hasSpellcasting = contract.spells.length > 0 || spellSlots.length > 0
  const activeSpellcasting = spellcastingAbility ? contract.spellcasting.byAbility[spellcastingAbility] : null
  const spellSaveDc = hasSpellcasting && activeSpellcasting ? activeSpellcasting.saveDc : null
  const spellAttack = hasSpellcasting && activeSpellcasting ? activeSpellcasting.attackBonus : null

  const healthPercent = contract.combat.maxHp.value > 0
    ? Math.min(100, Math.max(0, (contract.combat.currentHp / contract.combat.maxHp.value) * 100))
    : 0

  const visibleAbilities = expandedAbility
    ? abilities.filter(([key]) => key === expandedAbility)
    : abilities

  const defenseGroups = [
    { label: "Сопротивления", items: contract.capabilities.resistances },
    { label: "Иммунитеты", items: contract.capabilities.immunities },
    { label: "Владения", items: contract.capabilities.proficiencies },
    { label: "Языки", items: contract.capabilities.languages },
    { label: "Чувства", items: contract.capabilities.senses },
  ].filter((group) => group.items.length > 0)

  function explainNumber(title: string, target: CharacterExplainQuery & { kind: "number" }) {
    setExplain({ title, query: target })
  }

  function toggleAbility(key: AbilityKey) {
    setExpandedAbility((current) => current === key ? null : key)
  }

  async function removeFeature(feature: CharacterFeature) {
    if (!window.confirm("Удалить особенность «" + feature.name + "»?")) return
    const result = await onDeleteFeature(feature.id)
    if (!result.ok) {
      setFeatureError(result.error || "Не удалось удалить особенность.")
      return
    }
    setFeatureMenu(null)
  }

  function featureActions(feature: CharacterFeature): ContextAction[] {
    if (!canManage) return []
    return [
      {
        id: "edit",
        label: "Редактировать",
        detail: "Название, тип и описание",
        icon: "✎",
        onSelect: () => {
          setFeatureMenu(null)
          onEditFeature(feature)
        },
      },
      {
        id: "delete",
        label: "Удалить особенность",
        detail: "Она исчезнет из листа",
        icon: "×",
        danger: true,
        onSelect: () => void removeFeature(feature),
      },
    ]
  }

  return (
    <>
      <section className="opus-sheet-intro">
        <div className="opus-sheet-intro__identity">
          <h1>{contract.name}</h1>
          <button type="button" onClick={onOpenClass}>
            {classLabel || "Класс не указан"} · {contract.level} ур.
          </button>
        </div>
        <button
          className="opus-sheet-intro__hp"
          type="button"
          onClick={() => explainNumber("Максимум здоровья", { kind: "number", target: "combat.maxHp" })}
        >
          <span><strong>{contract.combat.currentHp}</strong> / {contract.combat.maxHp.value} HP</span>
          <i><b style={{ width: healthPercent + "%" }} /></i>
        </button>
      </section>

      <section className="opus-core-grid" aria-label="Основные параметры персонажа">
        <div className="opus-core-grid__quick">
          <button type="button" onClick={() => explainNumber("Класс доспеха", { kind: "number", target: "combat.ac" })}>
            <UiIcon name="armor-class" className="opus-core-icon" /><span>КД</span><strong>{contract.combat.ac.value}</strong>
          </button>
          <button type="button" onClick={() => explainNumber("Пассивное восприятие", { kind: "number", target: "passives.perception" })}>
            <UiIcon name="passive-perception" className="opus-core-icon" /><span>ПАССИВ</span><strong>{contract.passives.perception.value}</strong>
          </button>
          <button type="button" onClick={() => explainNumber("Бонус мастерства", { kind: "number", target: "core.proficiencyBonus" })}>
            <UiIcon name="proficiency" className="opus-core-icon" /><span>МАСТЕРСТВО</span><strong>{signed(contract.proficiencyBonus.value)}</strong>
          </button>
          <button type="button" onClick={() => explainNumber("Инициатива", { kind: "number", target: "combat.initiative" })}>
            <UiIcon name="initiative" className="opus-core-icon" /><span>ИНИЦИАТИВА</span><strong>{signed(contract.combat.initiative.value)}</strong>
          </button>
          <button type="button" onClick={() => explainNumber("Скорость", { kind: "number", target: "combat.speed" })}>
            <UiIcon name="dexterity" className="opus-core-icon" /><span>СКОРОСТЬ</span><strong>{contract.combat.speed.value}</strong>
          </button>
          {spellSaveDc !== null && <div><UiIcon name="spell-save-dc" className="opus-core-icon" /><span>СЛ</span><strong>{spellSaveDc}</strong></div>}
          {spellAttack !== null && <div><UiIcon name="spell-save-dc" className="opus-core-icon" /><span>АТАКА</span><strong>{signed(spellAttack)}</strong></div>}
        </div>

        <div className="opus-core-grid__abilities" data-expanded={expandedAbility || undefined}>
          {visibleAbilities.map(([key, short, label, iconName]) => {
            const ability = contract.abilities[key]
            const save = contract.savingThrows[key]
            const isExpanded = expandedAbility === key
            const relatedSkills = skills.filter(([skillKey]) => contract.skills[skillKey].ability === key)
            return (
              <div className="opus-ability-row" key={key} data-expanded={isExpanded ? "true" : undefined}>
                <button type="button" onClick={() => toggleAbility(key)} aria-expanded={isExpanded}>
                  <UiIcon name={iconName} className="opus-ability-row__icon" />
                  <span>{short}</span>
                  <strong>{ability.value}</strong>
                  <em>{signed(ability.modifier)}</em>
                </button>
                {isExpanded && (
                  <div className="opus-ability-row__skills">
                    <header>
                      <span>{label}</span>
                      <strong>СПАС {signed(save.bonus.value)}</strong>
                    </header>
                    {relatedSkills.map(([skillKey, skillLabel]) => {
                      const skill = contract.skills[skillKey]
                      return (
                        <button
                          key={skillKey}
                          type="button"
                          onClick={() => explainNumber(skillLabel, { kind: "number", target: ("skills." + skillKey + ".bonus") as NumericTarget })}
                        >
                          <span>{skillLabel}</span>
                          <strong>{signed(skill.bonus.value)}</strong>
                          {skill.proficiencyRank > 0 && <i>{skill.proficiencyRank > 1 ? "◆" : "●"}</i>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {uniqueResources.length > 0 && (
        <section className="opus-sheet-section opus-sheet-resources">
          <header className="opus-sheet-section__title">
            <span>РЕСУРСЫ</span><i />
          </header>
          <div className="opus-resource-lines">
            {uniqueResources.map((resource) => (
              <button
                className="opus-resource-line"
                key={resource.stateKey}
                type="button"
                onClick={canManage ? onEditResources : undefined}
                aria-label={resourceLabel(resource) + ": " + resource.current + " из " + resource.max.value}
              >
                <span className="opus-resource-line__icon"><UiIcon name={resourceIconName(resource)} /></span>
                <span className="opus-resource-line__copy">
                  <strong>{resourceLabel(resource)}</strong>
                  <small>{resource.recharge.triggers.join(" · ").replace(/_/g, " ") || "ручное восстановление"}</small>
                </span>
                {resourcePips(resource)}
                <span className="opus-resource-line__value">{resource.current}/{resource.max.value}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {spellSlots.length > 0 && (
        <section className="opus-sheet-section opus-spell-slots">
          <button className="opus-sheet-section__title opus-sheet-section__title--button" type="button" onClick={() => onOpenSpells()}>
            <span>ЗАКЛИНАНИЯ</span><i />
          </button>
          <div className="opus-spell-slots__viewport">
            {spellSlots.map(({ resource, level }) => {
              const max = Math.max(0, Math.round(resource.max.value))
              return (
                <button className="opus-spell-slot-row" key={resource.stateKey} type="button" onClick={() => onOpenSpells(level)}>
                  <span className="opus-spell-slot-row__level">{romanLevels[level] || level} <small>УРОВЕНЬ</small></span>
                  <span className="opus-spell-slot-row__pips" aria-label={resource.current + " из " + max}>
                    {Array.from({ length: max }, (_, index) => (
                      <i key={index} data-filled={index < resource.current ? "true" : undefined} />
                    ))}
                  </span>
                  <strong>{resource.current} / {max}</strong>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="opus-sheet-directory">
        {(featureGrants.length > 0 || canManage) && (
          <details>
            <summary><span>СПОСОБНОСТИ</span><strong>{featureGrants.length}</strong><i>›</i></summary>
            <div className="opus-sheet-directory__body">
              {featureError && <div className="auth-error">{featureError}</div>}
              {featureGrants.map((entry) => {
                const payload = objectPayload(entry.payload)
                const legacyId = typeof payload?.legacyFeatureId === "string" ? payload.legacyFeatureId : null
                const feature = legacyId ? features.find((item) => item.id === legacyId) : undefined
                return (
                  <article
                    className="opus-directory-feature"
                    key={entry.target + ":" + entry.key + ":" + entry.variantKey}
                    {...(feature && canManage ? bindFeature(feature) : {})}
                    style={{ touchAction: "pan-y" }}
                  >
                    <span>✦</span>
                    <div><strong>{grantLabel(entry)}</strong>{grantDescription(entry) && <small>{grantDescription(entry)}</small>}</div>
                    {feature && canManage && <button type="button" onClick={() => onEditFeature(feature)}>✎</button>}
                  </article>
                )
              })}
              {!featureGrants.length && <p className="opus-sheet-directory__empty">Отдельных способностей пока нет.</p>}
              {canManage && <button className="opus-directory-add" type="button" onClick={onAddFeature}>＋ Добавить особенность</button>}
            </div>
          </details>
        )}

        {defenseGroups.length > 0 && (
          <details>
            <summary><span>ВЛАДЕНИЯ И ЗАЩИТЫ</span><strong>{defenseGroups.reduce((sum, group) => sum + group.items.length, 0)}</strong><i>›</i></summary>
            <div className="opus-sheet-directory__body">
              {defenseGroups.map((group) => (
                <div className="opus-defense-group" key={group.label}>
                  <span>{group.label}</span>
                  <div>{group.items.map((entry) => <strong key={entry.key + ":" + entry.variantKey}>{grantLabel(entry)}</strong>)}</div>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {canManage && (
        <details className="opus-admin-tools">
          <summary>НАСТРОЙКА ЛИСТА <span>›</span></summary>
          <div>
            <button type="button" onClick={onEditSheet}>Лист</button>
            <button type="button" onClick={onEditResources}>Ресурсы</button>
            <button type="button" onClick={onAddFeature}>Особенность</button>
          </div>
        </details>
      )}

      {explain && explanation && (
        <div className="sheet-backdrop" onClick={() => setExplain(null)}>
          <div className="bottom-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">{explain.title}</h3>
                <p className="sheet-copy">Расчёт Character Engine</p>
              </div>
              <button className="sheet-close" type="button" onClick={() => setExplain(null)}>×</button>
            </div>
            {explanation.value !== undefined && (
              <div className="opus-explain-value">
                {typeof explanation.value === "number" ? signed(explanation.value) : String(explanation.value)}
              </div>
            )}
            <p className="opus-explain-copy">Значение собрано из базовых параметров и всех действующих источников.</p>
          </div>
        </div>
      )}

      {featureMenu && (
        <ContextActionSheet
          title={featureMenu.name}
          subtitle="Действия с особенностью"
          actions={featureActions(featureMenu)}
          onClose={() => setFeatureMenu(null)}
        />
      )}
    </>
  )
}
