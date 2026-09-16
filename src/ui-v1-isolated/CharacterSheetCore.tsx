import type { ReactNode } from "react"
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

function QuickStatIcon({ id }: { id: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.45,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  }

  if (id === "armor-class") {
    return (
      <svg {...common}>
        <path d="M12 3.2 18 5.6v5.3c0 4.1-2.2 7.4-6 9.9-3.8-2.5-6-5.8-6-9.9V5.6L12 3.2Z" />
        <path d="M9.2 11.6 11 13.4l3.9-4.2" />
      </svg>
    )
  }

  if (id === "passive-perception") {
    return (
      <svg {...common}>
        <path d="M3.7 12s3-4.5 8.3-4.5S20.3 12 20.3 12 17.3 16.5 12 16.5 3.7 12 3.7 12Z" />
        <circle cx="12" cy="12" r="2.15" />
      </svg>
    )
  }

  if (id === "proficiency") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="6.6" />
        <path d="m12 5.4 1.7 4.8 4.9 1.8-4.9 1.8-1.7 4.8-1.7-4.8L5.4 12l4.9-1.8L12 5.4Z" />
      </svg>
    )
  }

  if (id === "initiative") {
    return (
      <svg {...common}>
        <path d="M12 3.8v3.1M12 17.1v3.1M20.2 12h-3.1M6.9 12H3.8" />
        <path d="m16.9 7.1-2.65 4.15L10.1 13.9l2.65-4.15L16.9 7.1Z" />
        <circle cx="12" cy="12" r="6.25" />
      </svg>
    )
  }

  if (id === "speed") {
    return (
      <svg {...common}>
        <path d="M5 17.4c2.3-4.7 5.15-7.95 9.4-10.8" />
        <path d="M12.3 6.4h3.7v3.7M8.05 12.35l2.4 2.4M5.9 15.6l1.55 1.55" />
      </svg>
    )
  }

  if (id === "spell-save-dc") {
    return (
      <svg {...common}>
        <path d="m12 3.3 2.05 5.05L19.2 10.4l-5.15 2.05L12 17.5l-2.05-5.05L4.8 10.4l5.15-2.05L12 3.3Z" />
        <path d="M8.6 18.6h6.8" />
      </svg>
    )
  }

  if (id === "spell-attack") {
    return (
      <svg {...common}>
        <path d="M5.1 18.9 18.9 5.1M13.5 5.1h5.4v5.4" />
        <path d="M6 8.9a6.3 6.3 0 0 0 9.1 9.1" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="6.4" />
    </svg>
  )
}

function AbilityGlyph({ ability }: { ability: AbilityKey }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.35,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  }

  const paths: Record<AbilityKey, ReactNode> = {
    strength: <path d="M7.2 15.8c2.2-1.15 3.8-3.25 4.55-6.15M16.8 15.8c-2.2-1.15-3.8-3.25-4.55-6.15M8 7.4 5.6 9.8M16 7.4l2.4 2.4M8 16.2v2.4M16 16.2v2.4" />,
    dexterity: <path d="M5 15.8c4.9 0 7.45-2.55 7.45-7.45M12.45 8.35 16 5.2M12.45 8.35l3.9 1.2M9.35 12.6l3.35 3.35M7.1 15.15l1.3 3.65" />,
    constitution: <path d="M12 3.8 17 6.1v5.1c0 3.65-1.8 6.55-5 8.95-3.2-2.4-5-5.3-5-8.95V6.1L12 3.8Z" />,
    intelligence: <path d="M8.2 8.3a3.8 3.8 0 0 1 7.6 0v7.4a3.8 3.8 0 0 1-7.6 0V8.3ZM12 4.5v15M8.2 10.1h3.8M12 13.9h3.8" />,
    wisdom: <><path d="M3.8 12s3-4.3 8.2-4.3 8.2 4.3 8.2 4.3-3 4.3-8.2 4.3S3.8 12 3.8 12Z" /><circle cx="12" cy="12" r="2" /></>,
    charisma: <path d="M12 4.1 13.8 9l5.1 1.8-5.1 1.8L12 17.5l-1.8-4.9-5.1-1.8L10.2 9 12 4.1ZM7.4 18.6h9.2" />,
  }

  return <svg {...common}>{paths[ability]}</svg>
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
