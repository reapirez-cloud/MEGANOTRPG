import { useMemo, useState } from "react"

import {
  explainCharacter,
  type AbilityKey,
  type CharacterEngineInput,
  type CharacterExplainQuery,
  type ResolvedCharacterContract,
  type SkillKey,
} from "../../character-engine/index.ts"
import type { CharacterSheet } from "../../types/characterSheet.ts"

const abilities: Array<[AbilityKey, string, string]> = [
  ["strength", "СИЛ", "Сила"],
  ["dexterity", "ЛОВ", "Ловкость"],
  ["constitution", "ТЕЛ", "Телосложение"],
  ["intelligence", "ИНТ", "Интеллект"],
  ["wisdom", "МДР", "Мудрость"],
  ["charisma", "ХАР", "Харизма"],
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

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

function proficiencyMark(rank: number): string {
  if (rank >= 2) return "◆"
  if (rank >= 1) return "●"
  return "○"
}

type Props = {
  input: CharacterEngineInput
  contract: ResolvedCharacterContract
  narrative: CharacterSheet
  canManage: boolean
  onEditSheet: () => void
  onEditResources: () => void
  onOpenSpells: (_level?: number) => void
}

export default function ResolvedCharacterSheetOpus({
  input,
  contract,
  canManage,
  onEditSheet,
  onEditResources,
}: Props) {
  const [expandedAbility, setExpandedAbility] = useState<AbilityKey | null>(null)
  const [explain, setExplain] = useState<{ title: string; query: CharacterExplainQuery } | null>(null)

  const explanation = useMemo(() => explain ? explainCharacter(input, explain.query) : null, [explain, input])

  const healthPercent = contract.combat.maxHp.value > 0
    ? Math.min(100, Math.max(0, (contract.combat.currentHp / contract.combat.maxHp.value) * 100))
    : 0

  function explainNumber(title: string, target: CharacterExplainQuery & { kind: "number" }) {
    setExplain({ title, query: target })
  }

  function toggleAbility(key: AbilityKey) {
    setExpandedAbility(expandedAbility === key ? null : key)
  }

  return (
    <>
      {canManage && (
        <div className="opus-section">
          <div style={{ display: "flex", gap: "8px", padding: "8px", borderRadius: "12px", background: "var(--opus-bg-surface)", border: "1px solid var(--opus-line)" }}>
            <button
              type="button"
              onClick={onEditSheet}
              style={{ flex: 1, minHeight: "44px", border: "1px solid var(--opus-line)", borderRadius: "8px", background: "transparent", color: "var(--opus-text-secondary)", fontSize: "11px", fontWeight: 680 }}
            >
              ✎ Лист
            </button>
            <button
              type="button"
              onClick={onEditResources}
              style={{ flex: 1, minHeight: "44px", border: "1px solid var(--opus-line)", borderRadius: "8px", background: "transparent", color: "var(--opus-text-secondary)", fontSize: "11px", fontWeight: 680 }}
            >
              ♥ Ресурсы
            </button>
          </div>
        </div>
      )}
      
      <section className="opus-combat">
        <button
          className="opus-combat__hp"
          type="button"
          onClick={() => explainNumber("Максимум здоровья", { kind: "number", target: "combat.maxHp" })}
        >
          <span className="opus-combat__hp-label">Здоровье</span>
          <span className="opus-combat__hp-value">
            {contract.combat.currentHp}
            <em>/{contract.combat.maxHp.value}</em>
          </span>
          <div className="opus-combat__hp-track">
            <div className="opus-combat__hp-fill" style={{ width: `${healthPercent}%` }} />
          </div>
        </button>

        <div className="opus-combat__secondary">
          <button
            className="opus-combat__stat opus-combat__stat--ac"
            type="button"
            onClick={() => explainNumber("Класс доспеха", { kind: "number", target: "combat.ac" })}
          >
            <span className="opus-combat__stat-label">Класс доспеха</span>
            <span className="opus-combat__stat-value">{contract.combat.ac.value}</span>
          </button>
          <button
            className="opus-combat__stat opus-combat__stat--initiative"
            type="button"
            onClick={() => explainNumber("Инициатива", { kind: "number", target: "combat.initiative" })}
          >
            <span className="opus-combat__stat-label">Инициатива</span>
            <span className="opus-combat__stat-value">{signed(contract.combat.initiative.value)}</span>
          </button>
        </div>
      </section>

      <section className="opus-stats-grid">
        <button
          type="button"
          className="opus-stat-button"
          onClick={() => explainNumber("Скорость", { kind: "number", target: "combat.speed" })}
        >
          <span className="opus-stat-button__label">Скорость</span>
          <span className="opus-stat-button__value">{contract.combat.speed.value}</span>
          <span className="opus-stat-button__detail">фт/ход</span>
        </button>
        <button
          type="button"
          className="opus-stat-button"
          onClick={() => explainNumber("Бонус мастерства", { kind: "number", target: "core.proficiencyBonus" })}
        >
          <span className="opus-stat-button__label">Мастерство</span>
          <span className="opus-stat-button__value">{signed(contract.proficiencyBonus.value)}</span>
          <span className="opus-stat-button__detail">бонус</span>
        </button>
        <button
          type="button"
          className="opus-stat-button"
          onClick={() => explainNumber("Пассивное восприятие", { kind: "number", target: "passives.perception" })}
        >
          <span className="opus-stat-button__label">Пассивное</span>
          <span className="opus-stat-button__value">{contract.passives.perception.value}</span>
          <span className="opus-stat-button__detail">восприятие</span>
        </button>
      </section>

      <section className="opus-abilities">
        <header className="opus-section-header">
          <span className="opus-section-header__eyebrow">Проверки и спасброски</span>
          <h2 className="opus-section-header__title">Характеристики</h2>
        </header>
        <div className="opus-ability-list">
          {abilities.map(([key, short, label]) => {
            const ability = contract.abilities[key]
            const save = contract.savingThrows[key]
            const relatedSkills = skills.filter(([skillKey]) => contract.skills[skillKey].ability === key)
            const isExpanded = expandedAbility === key

            return (
              <article key={key} className="opus-ability-item">
                <button
                  className="opus-ability-header"
                  type="button"
                  onClick={() => toggleAbility(key)}
                  aria-expanded={isExpanded}
                >
                  <div className="opus-ability-score-badge">
                    <span className="opus-ability-score-badge__value">{ability.value}</span>
                  </div>
                  <div className="opus-ability-header__copy">
                    <span className="opus-ability-header__name">{label}</span>
                    <span className="opus-ability-header__mod">
                      {signed(ability.modifier)} · {short}
                    </span>
                  </div>
                  <span className={`opus-ability-header__save${save.proficiencyRank > 0 ? " is-proficient" : ""}`}>
                    {proficiencyMark(save.proficiencyRank)} {signed(save.bonus.value)}
                  </span>
                </button>
                {isExpanded && relatedSkills.length > 0 && (
                  <div className="opus-ability-skills">
                    {relatedSkills.map(([skillKey, skillLabel]) => {
                      const skill = contract.skills[skillKey]
                      return (
                        <button
                          key={skillKey}
                          className="opus-skill-button"
                          type="button"
                          onClick={() => explainNumber(skillLabel, { kind: "number", target: `skills.${skillKey}.bonus` })}
                        >
                          <span className={`opus-skill-button__prof${skill.proficiencyRank > 0 ? " is-proficient" : ""}`}>
                            {proficiencyMark(skill.proficiencyRank)}
                          </span>
                          <span className="opus-skill-button__name">{skillLabel}</span>
                          <span className="opus-skill-button__value">{signed(skill.bonus.value)}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      {explain && explanation && (
        <div className="sheet-backdrop" onClick={() => setExplain(null)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">{explain.title}</h3>
                <p className="sheet-copy">Расчёт Character Engine</p>
              </div>
              <button className="sheet-close" type="button" onClick={() => setExplain(null)}>
                ×
              </button>
            </div>
            {explanation.value !== undefined && (
              <div style={{ padding: "12px 16px", fontSize: "32px", fontWeight: 760, textAlign: "center" }}>
                {typeof explanation.value === "number" ? signed(explanation.value) : String(explanation.value)}
              </div>
            )}
            <div style={{ padding: "0 16px 16px", fontSize: "11px", lineHeight: 1.5, color: "var(--opus-text-secondary)" }}>
              Значение собрано из базовых параметров и всех действующих источников.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
