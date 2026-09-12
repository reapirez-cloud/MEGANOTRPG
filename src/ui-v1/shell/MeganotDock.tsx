import { motion } from "motion/react"

import type { RootSpace } from "../../lib/appRoute"
import { mgMotion } from "../motion/presets"

type Props = {
  active: RootSpace
  onNavigate: (space: RootSpace) => void
}

const items: Array<{ id: RootSpace; label: string }> = [
  { id: "chats", label: "Чаты" },
  { id: "home", label: "Главная" },
  { id: "workspace", label: "Пространство" },
]

export default function MeganotDock({ active, onNavigate }: Props) {
  return (
    <nav className="mg-dock" aria-label="Основная навигация">
      {items.map((item) => {
        const selected = active === item.id
        return (
          <motion.button
            key={item.id}
            type="button"
            className={`mg-dock__item mg-dock__item--${item.id} mg-interactive mg-focusable ${selected ? "is-active" : ""}`}
            aria-current={selected ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
            whileTap={mgMotion.press}
            transition={{ duration: mgMotion.duration.fast }}
          >
            {selected && (
              <motion.span
                className="mg-dock__active"
                layoutId="meganot-dock-active"
                transition={mgMotion.spring.selection}
              />
            )}
            <span className="mg-dock__label">{item.label}</span>
          </motion.button>
        )
      })}
    </nav>
  )
}
