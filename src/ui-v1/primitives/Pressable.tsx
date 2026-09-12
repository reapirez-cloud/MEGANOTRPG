import type { ReactNode } from "react"
import { motion, type HTMLMotionProps } from "motion/react"

import { mgMotion } from "../motion/presets"

type Props = Omit<HTMLMotionProps<"button">, "children"> & {
  children: ReactNode
}

export default function Pressable({
  children,
  className = "",
  disabled,
  ...props
}: Props) {
  return (
    <motion.button
      {...props}
      className={`mg-interactive mg-focusable ${className}`.trim()}
      disabled={disabled}
      whileTap={disabled ? undefined : mgMotion.press}
      transition={{ duration: mgMotion.duration.fast }}
    >
      {children}
    </motion.button>
  )
}
