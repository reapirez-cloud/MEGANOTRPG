import type {
  AbilityKey,
  ResolvedCharacterContract,
  SkillKey,
} from "../character-engine"
import type { CharacterSheet } from "../types/characterSheet"
import { CHARACTER_SHEET_MEDIA_SLOTS } from "./characterSheetUiContract"

const abilityRows: Array<{
  key: AbilityKey
  short: string
  label: string
}> = [
  { key: "strength", short: "СИЛ", label: "Сила" },
  { key: "dexterity", short: "ЛВК", label: "Ловкость" },
  { key: "constitution", short: "ТЕЛ", label: "Телосложение" },
  { key: "intelligence", short: "ИНТ", label: "Интеллект" },
  { key: "wisdom", short: "МДР", label: "Мудрость" },
  { key: "charisma", short: "ХАР", label: "Харизма" },
]

const skillLabels: Record<SkillKey, string> = {
  acrobatics: "Акробатика",
  animal_handling: "Уход за животными",
  arcana: "Магия",
  athletics: "Атлетика",
  deception: "Обман",
  history: "История",
  insight: "Проницательность",
  intimidation: "Запугивание",
  investigation: "Анализ",
  medicine: "Медицина",
  nature: "Природа",
  perception: "Восприятие",
  performance: "Выступление",
  persuasion: "Убеждение",
  religion: "Религия",
  sleight_of_hand: "Ловкость рук",
  stealth: "Скрытность",
  survival: "Выживание",
}

const skillsByAbility: Record<AbilityKey, SkillKey[]> = {
  strength: ["athletics"],
  dexterity: ["acrobatics", "sleight_of_hand", "stealth"],
  constitution: [],
  intelligence: ["arcana", "history", "investigation", "nature", "religion"],
  wisdom: ["animal_handling", "insight", "medicine", "perception", "survival"],
  charisma: ["deception", "intimidation", "performance", "persuasion"],
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

function sheetAbilityScore(sheet: CharacterSheet | null, ability: AbilityKey) {
  if (!sheet) return null
  return Number(sheet[ability])
}

function abilityScore(
  contract: ResolvedCharacterContract | null,
  sheet: CharacterSheet | null,
  ability: AbilityKey,
) {
  return contract?.abilities[ability].value ?? sheetAbilityScore(sheet, ability)
}

function abilityModifier(
  contract: ResolvedCharacterContract | null,
  sheet: CharacterSheet | null,
  ability: AbilityKey,
) {
  const resolved = contract?.abilities[ability].modifier
  if (resolved !== undefined) return resolved
  const score = sheetAbilityScore(sheet, ability)
  return score === null ? null : Math.floor((score - 10) / 2)
}

function numberText(value: number | null | undefined, sign = false) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return sign ? signed(value) : String(value)
}

export default function CharacterSheetCore({
  contract,
  sheet,
  spellcastingAbility,
  expandedAbility,
  onToggleAbility,
}: {
  contract: ResolvedCharacterContract | null
  sheet: CharacterSheet | null
  spellcastingAbility?: AbilityKey
  expandedAbility: AbilityKey | null
  onToggleAbility: (ability: AbilityKey) => void
}) {
  const magic =
    contract && spellcastingAbility
      ? contract.spellcasting.byAbility[spellcastingAbility]
      : null
  const spellcastingEnabled = Boolean(
    spellcastingAbility ||
    sheet?.spellcasting_enabled ||
    sheet?.spell_save_dc !== null ||
    sheet?.spell_attack_bonus !== null
  )

  const quickStats = [
    {
      id: "armor-class",
      label: "КД",
      value: numberText(contract?.combat.ac.value ?? sheet?.armor_class),
      iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.armorClass,
    },
    {
      id: "passive-perception",
      label: "Пассив",
      value: numberText(contract?.passives.perception.value ?? sheet?.passive_perception),
      iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.passivePerception,
    },
    {
      id: "proficiency",
      label: "Мастерство",
      value: numberText(contract?.proficiencyBonus.value ?? sheet?.proficiency_bonus, true),
      iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.proficiency,
    },
    {
      id: "initiative",
      label: "Инициатива",
      value: numberText(contract?.combat.initiative.value ?? sheet?.initiative_bonus, true),
      iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.initiative,
    },
    {
      id: "speed",
      label: "Скорость",
      value: `${numberText(contract?.combat.speed.value ?? sheet?.speed)} м`,
      iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.speed,
    },
    ...(spellcastingEnabled
      ? [
          {
            id: "spell-save-dc",
            label: "СЛ",
            value: numberText(magic?.saveDc ?? sheet?.spell_save_dc),
            iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.spellSaveDc,
          },
          {
            id: "spell-attack",
            label: "Атака закл.",
            value: numberText(magic?.attackBonus ?? sheet?.spell_attack_bonus, true),
            iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.spellAttack,
          },
        ]
      : []),
  ]

  return (
    <section className="u1-character-sheet-core" aria-label="Основные показатели">
      <div className="u1-character-sheet-core__quick">
        {quickStats.map((stat) => (
          <div key={stat.id} className="u1-character-sheet-core__quick-row">
            <span
              className="u1-character-sheet-core__quick-icon"
              data-icon-slot={stat.iconSlot}
              aria-hidden="true"
            />
            <span className="u1-character-sheet-core__quick-label">{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <div
        className="u1-character-sheet-core__abilities"
        data-expanded={expandedAbility || undefined}
      >
        {abilityRows.map((ability) => {
          const score = abilityScore(contract, sheet, ability.key)
          const modifier = abilityModifier(contract, sheet, ability.key)
          const expanded = expandedAbility === ability.key
          const hidden = expandedAbility !== null && !expanded
          const savingThrow = contract?.savingThrows[ability.key]

          return (
            <div
              key={ability.key}
              className="u1-character-sheet-core__ability"
              data-expanded={expanded || undefined}
              data-hidden={hidden || undefined}
            >
              <button
                type="button"
                className="u1-character-sheet-core__ability-head"
                onClick={() => onToggleAbility(ability.key)}
                aria-expanded={expanded}
                aria-label={`${ability.label}: ${numberText(score)}, модификатор ${numberText(modifier, true)}`}
              >
                <span>
                  <b>{ability.short}</b>
                  <small>{ability.label}</small>
                </span>
                <strong>{numberText(score)}</strong>
                <em>{numberText(modifier, true)}</em>
              </button>

              {expanded && (
                <div className="u1-character-sheet-core__ability-detail">
                  <div className="u1-character-sheet-core__save">
                    <span>Спасбросок</span>
                    <strong>{numberText(savingThrow?.bonus.value ?? modifier, true)}</strong>
                    <small>
                      {savingThrow?.proficiencyRank === 2
                        ? "экспертиза"
                        : savingThrow?.proficiencyRank === 1
                          ? "владение"
                          : "без владения"}
                    </small>
                  </div>

                  <div className="u1-character-sheet-core__skills">
                    {skillsByAbility[ability.key].length === 0 ? (
                      <div className="u1-character-sheet-core__no-skills">
                        У этой характеристики нет стандартных навыков
                      </div>
                    ) : (
                      skillsByAbility[ability.key].map((skillKey) => {
                        const skill = contract?.skills[skillKey]
                        return (
                          <div
                            key={skillKey}
                            className="u1-character-sheet-core__skill"
                            data-rank={skill?.proficiencyRank || 0}
                          >
                            <span>{skillLabels[skillKey]}</span>
                            <small>
                              {skill?.proficiencyRank === 2
                                ? "эксп."
                                : skill?.proficiencyRank === 1
                                  ? "влад."
                                  : ""}
                            </small>
                            <strong>{numberText(skill?.bonus.value, true)}</strong>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
