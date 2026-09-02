import { useEffect, type ComponentProps, type MouseEvent } from "react"
import ResolvedCharacterSheetBase from "./ResolvedCharacterSheetBase.tsx"

type BaseProps = ComponentProps<typeof ResolvedCharacterSheetBase>
type Props = BaseProps & {
  onFocusChange?: (focused: boolean) => void
  focusResetKey?: number
}
type ClassFocus = "class" | "subclass"

const FOCUS_KEY = "meganotrpg.character-class-focus"

function rememberClassFocus(event: MouseEvent<HTMLDivElement>) {
  const button = (event.target as HTMLElement).closest("button")
  const text = button?.textContent || ""
  let focus: ClassFocus | null = null
  if (text.includes("Способности подкласса")) focus = "subclass"
  else if (text.includes("Способности класса")) focus = "class"
  if (focus) window.sessionStorage.setItem(FOCUS_KEY, focus)
}

export default function ResolvedCharacterSheet({ onFocusChange, focusResetKey = 0, ...props }: Props) {
  useEffect(() => () => onFocusChange?.(false), [onFocusChange])

  function openClassMechanics() {
    const classButton = document.querySelector<HTMLButtonElement>(".profile-v3__class")
    if (classButton) {
      classButton.click()
      return
    }
    props.onOpenClassReference?.()
  }

  function trackFocus(event: MouseEvent<HTMLDivElement>) {
    rememberClassFocus(event)
    const target = event.target as HTMLElement
    if (target.closest(".character-focus-v5__back")) {
      onFocusChange?.(false)
      return
    }
    if (target.closest(".sheet-v4__directory-list > button")) {
      const text = target.closest("button")?.textContent || ""
      if (!text.includes("Способности класса") && !text.includes("Способности подкласса") && !text.includes("Заклинания")) {
        onFocusChange?.(true)
      }
    }
  }

  return <div onClickCapture={trackFocus}>
    <ResolvedCharacterSheetBase key={focusResetKey} {...props} onOpenClassReference={openClassMechanics} />
  </div>
}
