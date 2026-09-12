import { motion } from "motion/react"

import type { RootSpace } from "../../lib/appRoute"

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
            className={`mg-dock__item mg-dock__item--${item.id} ${selected ? "is-active" : ""}`}
            aria-current={selected ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.14 }}
          >
            {selected && (
              <motion.span
                className="mg-dock__active"
                layoutId="meganot-dock-active"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="mg-dock__label">{item.label}</span>
          </motion.button>
        )
      })}
    </nav>
  )
}
