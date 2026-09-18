import type {
  AbilityKey,
  ResolvedCharacterContract,
  SkillKey,
} from "../character-engine/index.ts"
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

const GRIMDARK_ICON_ROOT = "/ui-icons/grimdark/ui"

const QUICK_STAT_PNG_IDS = new Set([
  "armor-class",
  "passive-perception",
  "proficiency",
  "initiative",
  "speed",
  "spell-save-dc",
])

function QuickStatIcon({ id }: { id: string }) {
  if (QUICK_STAT_PNG_IDS.has(id)) {
    return (
      <img
        src={`${GRIMDARK_ICON_ROOT}/${id}.png`}
        alt=""
        width={96}
        height={96}
        decoding="async"
        draggable={false}
      />
    )
  }

  if (id === "spell-attack") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.45}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M5.1 18.9 18.9 5.1M13.5 5.1h5.4v5.4" />
        <path d="M6 8.9a6.3 6.3 0 0 0 9.1 9.1" />
      </svg>
    )
  }

  return null
}

function AbilityGlyph({ ability }: { ability: AbilityKey }) {
  return (
    <img
      src={`${GRIMDARK_ICON_ROOT}/${ability}.png`}
      alt=""
      draggable={false}
    />
  )
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

function proficiencyMark(rank: number) {
  if (rank >= 2) return "×2"
  if (rank >= 1) return "●"
  return ""
}

function speedText(feet: number) {
  const meters = Math.round(feet * 3) / 10
  return `${String(meters).replace(".", ",")} м`
}

export default function CharacterSheetCore({
  contract,
  spellcastingAbility,
  expandedAbility,
  onToggleAbility,
}: {
  contract: ResolvedCharacterContract | null
  spellcastingAbility?: AbilityKey
  expandedAbility: AbilityKey | null
  onToggleAbility: (ability: AbilityKey) => void
}) {
  if (!contract) {
    return (
      <section
        className="u1-character-sheet-core u1-character-sheet-core--loading"
        aria-label="Основные показатели персонажа"
      >
        <span>Character Engine рассчитывает параметры…</span>
      </section>
    )
  }

  const spellcasting = spellcastingAbility
    ? contract.spellcasting.byAbility[spellcastingAbility]
    : null

  const quickStats = [
    {
      id: "armor-class",
      label: "КД",
      value: String(contract.combat.ac.value),
      iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.armorClass,
    },
    {
      id: "passive-perception",
      label: "Пассив",
      value: String(contract.passives.perception.value),
      iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.passivePerception,
    },
    {
      id: "proficiency",
      label: "Мастерство",
      value: signed(contract.proficiencyBonus.value),
      iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.proficiency,
    },
    {
      id: "initiative",
      label: "Инициатива",
      value: signed(contract.combat.initiative.value),
      iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.initiative,
    },
    {
      id: "speed",
      label: "Скорость",
      value: speedText(contract.combat.speed.value),
      iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.speed,
    },
    ...(spellcasting
      ? [
          {
            id: "spell-save-dc",
            label: "СЛ заклинаний",
            value: String(spellcasting.saveDc),
            iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.spellSaveDc,
          },
          {
            id: "spell-attack",
            label: "Атака закл.",
            value: signed(spellcasting.attackBonus),
            iconSlot: CHARACTER_SHEET_MEDIA_SLOTS.quickStats.spellAttack,
          },
        ]
      : []),
  ]

  const expandedMeta = expandedAbility
    ? abilityRows.find((item) => item.key === expandedAbility) || null
    : null

  const expandedSkills = expandedAbility
    ? Object.values(contract.skills)
        .filter((skill) => skill.ability === expandedAbility)
        .sort((left, right) =>
          skillLabels[left.key].localeCompare(skillLabels[right.key], "ru"),
        )
    : []

  return (
    <section
      className="u1-character-sheet-core"
      aria-label="Основные показатели персонажа"
      data-expanded={expandedAbility || undefined}
    >
      <header className="u1-character-sheet-core__head">
        <span aria-hidden="true">✣</span>
        <strong>ХАРАКТЕРИСТИКИ</strong>
        <small>ТЕЛО · РАЗУМ · ДУХ</small>
      </header>

      <div className="u1-character-sheet-core__columns">
        <div className="u1-character-sheet-core__quick">
        {quickStats.map((stat) => (
          <div key={stat.id} className="u1-character-sheet-core__quick-row">
            <span
              className="u1-character-sheet-core__quick-icon"
              data-icon-slot={stat.iconSlot}
              data-stat-id={stat.id}
              aria-hidden="true"
            >
              <QuickStatIcon id={stat.id} />
            </span>
            <span className="u1-character-sheet-core__quick-label">
              {stat.label}
            </span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <div className="u1-character-sheet-core__abilities">
        {expandedAbility && expandedMeta ? (
          <div
            className="u1-character-sheet-core__ability"
            data-expanded="true"
          >
            <button
              type="button"
              className="u1-character-sheet-core__ability-head"
              onClick={() => onToggleAbility(expandedAbility)}
              aria-expanded="true"
              aria-label={`${expandedMeta.label}: ${contract.abilities[expandedAbility].value}, модификатор ${signed(contract.abilities[expandedAbility].modifier)}`}
            >
              <span className="u1-character-sheet-core__ability-glyph" aria-hidden="true">
                <AbilityGlyph ability={expandedAbility} />
              </span>
              <span>
                <b>{expandedMeta.short}</b>
                <small>{expandedMeta.label}</small>
              </span>
              <strong>{contract.abilities[expandedAbility].value}</strong>
              <em>{signed(contract.abilities[expandedAbility].modifier)}</em>
            </button>

            <div className="u1-character-sheet-core__ability-detail">
              <div className="u1-character-sheet-core__save">
                <span>Спасбросок</span>
                <i>
                  {proficiencyMark(
                    contract.savingThrows[expandedAbility].proficiencyRank,
                  )}
                </i>
                <strong>
                  {signed(contract.savingThrows[expandedAbility].bonus.value)}
                </strong>
              </div>

              <div className="u1-character-sheet-core__skills">
                {expandedSkills.length > 0 ? (
                  expandedSkills.map((skill) => (
                    <div
                      key={skill.key}
                      className="u1-character-sheet-core__skill"
                      data-rank={skill.proficiencyRank}
                    >
                      <span>{skillLabels[skill.key]}</span>
                      <i>{proficiencyMark(skill.proficiencyRank)}</i>
                      <strong>{signed(skill.bonus.value)}</strong>
                    </div>
                  ))
                ) : (
                  <div className="u1-character-sheet-core__no-skills">
                    У этой характеристики нет стандартных навыков
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          abilityRows.map((ability) => {
            const resolved = contract.abilities[ability.key]

            return (
              <button
                key={ability.key}
                type="button"
                className="u1-character-sheet-core__ability-row"
                data-ability={ability.key}
                onClick={() => onToggleAbility(ability.key)}
                aria-expanded="false"
                aria-label={`${ability.label}: ${resolved.value}, модификатор ${signed(resolved.modifier)}`}
              >
                <span className="u1-character-sheet-core__ability-glyph" aria-hidden="true">
                  <AbilityGlyph ability={ability.key} />
                </span>
                <span>{ability.short}</span>
                <strong>{resolved.value}</strong>
                <em>{signed(resolved.modifier)}</em>
              </button>
            )
          })
        )}
        </div>
      </div>
    </section>
  )
}
