import { useEffect, useState } from "react"
import type { ResolvedCharacterContract } from "../../character-engine/index.ts"
import CharacterClassPanelBase from "./CharacterClassPanelBase.tsx"
import CharacterTemplateChoices from "./CharacterTemplateChoices.tsx"
import "./CharacterClassFocus.css"

type Props = {
  characterId: string
  contract: ResolvedCharacterContract
  onOpenReference?: () => void
}
type Focus = "all" | "class" | "subclass"

const FOCUS_KEY = "meganotrpg.character-class-focus"

function initialFocus(): Focus {
  if (typeof window === "undefined") return "all"
  const value = window.sessionStorage.getItem(FOCUS_KEY)
  return value === "class" || value === "subclass" ? value : "all"
}

export default function CharacterClassPanel(props: Props) {
  const [focus, setFocus] = useState<Focus>(initialFocus)

  useEffect(() => () => {
    window.sessionStorage.removeItem(FOCUS_KEY)
  }, [])

  return <div className={`character-class-focus character-class-focus--${focus}`}>
    <nav className="character-class-focus__switch" aria-label="Механики класса">
      <button type="button" className={focus === "all" ? "is-active" : ""} onClick={() => setFocus("all")}>Все</button>
      <button type="button" className={focus === "class" ? "is-active" : ""} onClick={() => setFocus("class")}>Класс</button>
      <button type="button" className={focus === "subclass" ? "is-active" : ""} onClick={() => setFocus("subclass")}>Подкласс</button>
    </nav>
    <CharacterTemplateChoices characterId={props.characterId} />
    <CharacterClassPanelBase {...props} />
  </div>
}
