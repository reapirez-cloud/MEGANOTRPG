import { useEffect, useMemo, useRef, useState } from "react"
import type { ResolvedCharacterContract } from "../../character-engine/index.ts"
import { registeredCharacterClassPackages } from "../../rule-templates/classPackages.ts"
import CharacterClassPanelBase from "./CharacterClassPanelBase.tsx"
import CharacterFocusShell from "./CharacterFocusShell.tsx"
import CharacterSectionHeader from "./CharacterSectionHeader.tsx"
import CharacterTemplateChoices from "./CharacterTemplateChoices.tsx"
import WizardArcaneRecoveryPanel from "./WizardArcaneRecoveryPanel.tsx"
import WizardCompletionPanel from "./WizardCompletionPanel.tsx"
import WizardSpellbookPanel from "./WizardSpellbookPanel.tsx"
import "./CharacterClassFocus.css"
import "./WizardSpellbookProgression.css"

type Props = {
  characterId: string
  contract: ResolvedCharacterContract
  onOpenReference?: () => void
  onFocusChange?: (focused: boolean) => void
  focusResetKey?: number
}
type Focus = "all" | "class" | "subclass" | "spellbook"

const FOCUS_KEY = "meganotrpg.character-class-focus"

function initialFocus(): Focus {
  if (typeof window === "undefined") return "all"
  const value = window.sessionStorage.getItem(FOCUS_KEY)
  return value === "class" || value === "subclass" || value === "spellbook" ? value : "all"
}

export default function CharacterClassPanel(props: Props) {
  const { onFocusChange, focusResetKey = 0 } = props
  const packages = registeredCharacterClassPackages(props.characterId)
  const wizardPackage = packages.find((entry) => entry.classCatalogKey === "class:wizard")
  const hasWizard = Boolean(wizardPackage)
  const hasSubclass = packages.some((entry) => entry.subclassTemplateId)
  const [focus, setFocus] = useState<Focus>(initialFocus)
  const resetReady = useRef(false)

  const classNames = useMemo(() => packages.map((entry) => entry.className).join(" · ") || "Класс не привязан", [packages])
  const subclassNames = useMemo(
    () => packages.flatMap((entry) => entry.subclassName ? [entry.subclassName] : []).join(" · ") || "Подкласс не выбран",
    [packages],
  )

  useEffect(() => {
    onFocusChange?.(focus !== "all")
  }, [focus, onFocusChange])

  useEffect(() => () => {
    window.sessionStorage.removeItem(FOCUS_KEY)
    onFocusChange?.(false)
  }, [onFocusChange])

  useEffect(() => {
    if (focus === "spellbook" && !hasWizard) {
      setFocus("all")
      window.sessionStorage.removeItem(FOCUS_KEY)
    }
    if (focus === "subclass" && !hasSubclass) {
      setFocus("all")
      window.sessionStorage.removeItem(FOCUS_KEY)
    }
  }, [focus, hasSubclass, hasWizard])

  useEffect(() => {
    if (!resetReady.current) {
      resetReady.current = true
      return
    }
    setFocus("all")
    window.sessionStorage.removeItem(FOCUS_KEY)
  }, [focusResetKey])

  function choose(next: Focus) {
    setFocus(next)
    if (next === "all") window.sessionStorage.removeItem(FOCUS_KEY)
    else window.sessionStorage.setItem(FOCUS_KEY, next)
  }

  const referenceAction = props.onOpenReference
    ? <button className="character-specialized-v5__action" type="button" onClick={props.onOpenReference}>Справочник</button>
    : undefined

  if (focus === "class") {
    return (
      <div className="character-class-focus character-class-focus-v5 character-specialized-v5 character-class-focus--class">
        <CharacterFocusShell
          eyebrow="Класс персонажа"
          title={classNames}
          detail="Активные способности, ресурсы и постоянные эффекты текущего уровня."
          onBack={() => choose("all")}
          backLabel="Класс"
          action={referenceAction}
        >
          <CharacterTemplateChoices characterId={props.characterId} />
          {wizardPackage && <WizardArcaneRecoveryPanel
            characterId={props.characterId}
            assignmentId={wizardPackage.classAssignmentId}
            wizardLevel={wizardPackage.level}
            contract={props.contract}
          />}
          <CharacterClassPanelBase characterId={props.characterId} contract={props.contract} onOpenReference={props.onOpenReference} />
        </CharacterFocusShell>
      </div>
    )
  }

  if (focus === "subclass") {
    return (
      <div className="character-class-focus character-class-focus-v5 character-specialized-v5 character-class-focus--subclass">
        <CharacterFocusShell
          eyebrow="Подкласс персонажа"
          title={subclassNames}
          detail="Отдельная ветка механик подкласса, связанная с уровнем родительского класса."
          onBack={() => choose("all")}
          backLabel="Класс"
          action={referenceAction}
        >
          <CharacterTemplateChoices characterId={props.characterId} />
          <CharacterClassPanelBase characterId={props.characterId} contract={props.contract} onOpenReference={props.onOpenReference} />
        </CharacterFocusShell>
      </div>
    )
  }

  if (focus === "spellbook" && hasWizard) {
    return (
      <div className="character-class-focus character-class-focus-v5 character-specialized-v5 character-class-focus--spellbook character-class-focus--has-wizard">
        <CharacterFocusShell
          eyebrow="Волшебник"
          title="Моя книга"
          detail="Физическая книга волшебника, её записанные заклинания и постоянные решения класса."
          onBack={() => choose("all")}
          backLabel="Класс"
          action={referenceAction}
        >
          <WizardSpellbookPanel characterId={props.characterId} />
          <WizardCompletionPanel characterId={props.characterId} />
        </CharacterFocusShell>
      </div>
    )
  }

  return (
    <section className={`character-class-focus character-class-focus-v5 character-specialized-v5${hasWizard ? " character-class-focus--has-wizard" : ""}`}>
      <CharacterSectionHeader
        eyebrow="Механики персонажа"
        title="Класс"
        detail="Класс и подкласс остаются связанными, но открываются как отдельные источники способностей."
        icon="◇"
        meta={<>
          {packages.map((entry) => <span key={entry.classAssignmentId}>{entry.level} ур. · {entry.className}</span>)}
        </>}
        action={referenceAction}
      />

      <CharacterTemplateChoices characterId={props.characterId} />

      <nav className="character-specialized-v5__directory" aria-label="Разделы класса">
        <button className="character-specialized-v5__directory-button" type="button" onClick={() => choose("class")}>
          <span className="character-specialized-v5__directory-icon" aria-hidden="true">◇</span>
          <span className="character-specialized-v5__directory-copy"><strong>Класс</strong><small>{classNames}</small></span>
          <span className="character-specialized-v5__directory-tail"><span>{packages.length}</span><b>›</b></span>
        </button>

        {hasSubclass && <button className="character-specialized-v5__directory-button" type="button" onClick={() => choose("subclass")}>
          <span className="character-specialized-v5__directory-icon" aria-hidden="true">✦</span>
          <span className="character-specialized-v5__directory-copy"><strong>Подкласс</strong><small>{subclassNames}</small></span>
          <span className="character-specialized-v5__directory-tail"><span>{packages.filter((entry) => entry.subclassTemplateId).length}</span><b>›</b></span>
        </button>}

        {hasWizard && <button className="character-specialized-v5__directory-button" type="button" onClick={() => choose("spellbook")}>
          <span className="character-specialized-v5__directory-icon" aria-hidden="true">▤</span>
          <span className="character-specialized-v5__directory-copy"><strong>Моя книга</strong><small>Книга заклинаний и решения Волшебника</small></span>
          <span className="character-specialized-v5__directory-tail"><b>›</b></span>
        </button>}
      </nav>
    </section>
  )
}
