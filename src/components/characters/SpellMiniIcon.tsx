import type { ReactNode } from "react"

import type { SpellMiniIconDescriptor, SpellMiniIconKind } from "./spellMiniIcons.ts"
import { spellMiniIconAriaLabel } from "./spellMiniIcons.ts"

type IconProps = {
  item: SpellMiniIconDescriptor
  compact?: boolean
}

type RowProps = {
  items: SpellMiniIconDescriptor[]
  compact?: boolean
  className?: string
}

const iconPaths: Record<SpellMiniIconKind, ReactNode> = {
  "casting-time": <>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 8v4l2.7 1.7" />
  </>,
  range: <>
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="2.2" />
    <path d="M16.6 7.4 20 4m0 0v4m0-4h-4" />
  </>,
  duration: <>
    <path d="M8 4h8M8 20h8M9 4c0 3 1.2 4.5 3 6-1.8 1.5-3 3-3 6M15 4c0 3-1.2 4.5-3 6 1.8 1.5 3 3 3 6" />
  </>,
  components: <>
    <path d="M12 3 19 8v8l-7 5-7-5V8l7-5Z" />
    <path d="m8.5 10 3.5 2 3.5-2M12 12v5" />
  </>,
  concentration: <>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="3.5" />
    <circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none" />
  </>,
  ritual: <>
    <path d="M15.8 4.2a7.5 7.5 0 1 0 4 11.7A7 7 0 0 1 15.8 4.2Z" />
    <path d="m18 7 .7 1.5L20 9l-1.3.5L18 11l-.7-1.5L16 9l1.3-.5L18 7Z" />
  </>,
  prepared: <>
    <path d="m12 3 7 7-7 11-7-11 7-7Z" />
    <path d="m9 11 2 2 4-4" />
  </>,
}

export function SpellMiniIcon({ item, compact = false }: IconProps) {
  return (
    <span
      className={`spell-mini-icon spell-mini-icon--${item.kind}${item.emphasized ? " is-emphasized" : ""}${compact ? " is-compact" : ""}`}
      aria-label={spellMiniIconAriaLabel(item)}
      title={spellMiniIconAriaLabel(item)}
    >
      <span className="spell-mini-icon__glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
          {iconPaths[item.kind]}
        </svg>
      </span>
      <span className="spell-mini-icon__value">{item.value}</span>
    </span>
  )
}

export function SpellMiniIconRow({ items, compact = false, className = "" }: RowProps) {
  if (items.length === 0) return null

  return (
    <span className={`spell-mini-icons${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}>
      {items.map((item) => (
        <SpellMiniIcon key={`${item.kind}:${item.value}`} item={item} compact={compact} />
      ))}
    </span>
  )
}

export default SpellMiniIcon
