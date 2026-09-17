import type { ComponentProps } from "react"

import CharacterSheetSpellsStage1 from "./CharacterSheetSpellsStage1"
import "./character-sheet-spell-stage2-layout.css"

type CharacterSheetSpellsProps = ComponentProps<typeof CharacterSheetSpellsStage1>
type CharacterContract = CharacterSheetSpellsProps["contract"]

const STANDARD_SLOT_KEY = /^spell_slot_([1-9])$/

function hasSpellcastingSurface(contract: CharacterContract) {
  if (!contract) return false
  if (contract.spells.some((spell) => spell.identity.level >= 0 && spell.identity.level <= 9)) {
    return true
  }

  return contract.resources.some(
    (resource) =>
      STANDARD_SLOT_KEY.test(resource.stateKey) ||
      resource.stateKey === "warlock_pact_slots",
  )
}

function standardSlotLevels(contract: CharacterContract) {
  if (!contract) return []

  return contract.resources
    .flatMap((resource) => {
      const match = resource.stateKey.match(STANDARD_SLOT_KEY)
      if (!match || Math.max(0, Math.round(resource.max.value)) <= 0) return []
      return [Number(match[1])]
    })
    .sort((left, right) => left - right)
}

function slotLabel(contract: CharacterContract, level: number) {
  const resource = contract?.resources.find(
    (entry) => entry.stateKey === `spell_slot_${level}`,
  )
  if (!resource) return "Без доступных ячеек"

  const max = Math.max(0, Math.round(resource.max.value))
  const current = Math.max(0, Math.min(max, Math.round(resource.current)))
  return `${current}/${max} ячеек`
}

function EmptySpellCircle({
  level,
  subtitle,
}: {
  level: number
  subtitle: string
}) {
  const cantrip = level === 0
  const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"]

  return (
    <section
      className="u1-character-spells__circle u1-character-spells-stage2__placeholder"
      data-level={level}
      data-stage2-placeholder={cantrip ? "cantrips" : "spell-level"}
      aria-label={cantrip ? "Заговоры" : `${level} круг`}
    >
      <div className="u1-character-spells__circle-head">
        <span
          className="u1-character-spells__circle-seal u1-character-spells-stage2__placeholder-seal"
          data-cantrip={cantrip || undefined}
          aria-hidden="true"
        >
          {cantrip ? "✦" : roman[level] || level}
        </span>

        <span className="u1-character-spells__circle-title">
          <strong>{cantrip ? "Заговоры" : `${level} круг`}</strong>
          <small>{cantrip ? "Всегда доступны" : subtitle}</small>
        </span>

        <span className="u1-character-spells__circle-count">0 заклинаний</span>
        <span className="u1-character-spells__circle-caret" aria-hidden="true" />
      </div>

      <div className="u1-character-spells__preview-row u1-character-spells-stage2__empty-preview">
        <span>
          {cantrip
            ? "Заговоры пока не собраны Character Engine."
            : "Заклинания этого круга пока не собраны Character Engine."}
        </span>
      </div>
    </section>
  )
}

export default function CharacterSheetSpells(props: CharacterSheetSpellsProps) {
  const { contract } = props

  if (!hasSpellcastingSurface(contract)) {
    return <CharacterSheetSpellsStage1 {...props} />
  }

  const spellLevels = new Set(
    (contract?.spells || [])
      .map((spell) => spell.identity.level)
      .filter((level) => Number.isInteger(level) && level >= 0 && level <= 9),
  )
  const slotLevels = standardSlotLevels(contract)
  const missingSlotLevels = slotLevels.filter((level) => !spellLevels.has(level))

  return (
    <div className="u1-character-spells u1-character-spells-stage2" data-spell-layout="stage2">
      <CharacterSheetSpellsStage1 {...props} />

      {!spellLevels.has(0) && (
        <EmptySpellCircle level={0} subtitle="Всегда доступны" />
      )}

      {missingSlotLevels.map((level) => (
        <EmptySpellCircle
          key={level}
          level={level}
          subtitle={slotLabel(contract, level)}
        />
      ))}
    </div>
  )
}
