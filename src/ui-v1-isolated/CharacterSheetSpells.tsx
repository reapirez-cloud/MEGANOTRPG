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

export default function CharacterSheetSpells(props: CharacterSheetSpellsProps) {
  const { contract } = props

  if (!hasSpellcastingSurface(contract)) {
    return <CharacterSheetSpellsStage1 {...props} />
  }

  return (
    <div
      className="u1-character-spells u1-character-spells-stage2"
      data-spell-layout="stage2"
    >
      <CharacterSheetSpellsStage1 {...props} />
    </div>
  )
}
