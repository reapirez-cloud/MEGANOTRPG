import type { ResolvedCharacterContract } from "../../character-engine/index.ts"
import CharacterClassPanelBase from "./CharacterClassPanelBase.tsx"
import CharacterTemplateChoices from "./CharacterTemplateChoices.tsx"

type Props = {
  characterId: string
  contract: ResolvedCharacterContract
  onOpenReference?: () => void
}

export default function CharacterClassPanel(props: Props) {
  return (
    <>
      <CharacterTemplateChoices characterId={props.characterId} />
      <CharacterClassPanelBase {...props} />
    </>
  )
}
