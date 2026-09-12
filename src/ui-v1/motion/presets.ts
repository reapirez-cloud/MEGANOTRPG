import type { Transition, Variants } from "motion/react"

export const mgMotion = {
  duration: {
    instant: 0.09,
    fast: 0.14,
    base: 0.22,
    slow: 0.36,
  },
  spring: {
    soft: {
      type: "spring",
      stiffness: 300,
      damping: 30,
      mass: 0.9,
    } satisfies Transition,
    selection: {
      type: "spring",
      stiffness: 420,
      damping: 34,
      mass: 0.82,
    } satisfies Transition,
    reveal: {
      type: "spring",
      stiffness: 260,
      damping: 28,
      mass: 0.95,
    } satisfies Transition,
  },
  press: {
    scale: 0.975,
  },
} as const

export const mgSceneVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
    scale: 0.992,
  },
  enter: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: mgMotion.spring.soft,
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.996,
    transition: { duration: mgMotion.duration.fast },
  },
}

export const mgOverlayVariants: Variants = {
  closed: {
    opacity: 0,
    scale: 0.985,
    y: 8,
  },
  open: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: mgMotion.spring.reveal,
  },
}
