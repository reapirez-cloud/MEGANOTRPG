import type { ReactNode } from "react"
import "./CharacterSpecialized.css"

type Props = {
  eyebrow: string
  title: string
  detail?: string
  icon?: string
  meta?: ReactNode
  action?: ReactNode
}

export default function CharacterSectionHeader({ eyebrow, title, detail, icon = "◇", meta, action }: Props) {
  return (
    <header className="character-section-header-v5">
      <span className="character-section-header-v5__icon" aria-hidden="true">{icon}</span>
      <div className="character-section-header-v5__copy">
        <small>{eyebrow}</small>
        <h3>{title}</h3>
        {detail && <p>{detail}</p>}
        {meta && <div className="character-section-header-v5__meta">{meta}</div>}
      </div>
      {action && <div className="character-section-header-v5__action">{action}</div>}
    </header>
  )
}
