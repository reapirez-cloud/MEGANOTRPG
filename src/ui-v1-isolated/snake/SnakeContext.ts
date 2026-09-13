import { createContext, useContext } from "react"

import type { SnakeMenuRequest, SnakeSurfaceRequest } from "../../snake-engine"
import type { SnakeSurfaceSource } from "./runtime"

export type SnakeContextValue = {
  openMenu: (request: SnakeMenuRequest) => void
  closeMenu: () => void
  openSurface: (
    request: SnakeSurfaceRequest,
    source?: SnakeSurfaceSource,
  ) => void
  closeSurface: () => void
}

export const SnakeContext = createContext<SnakeContextValue | null>(null)

export function useSnake() {
  const context = useContext(SnakeContext)
  if (!context) {
    throw new Error("useSnake must be used inside SnakeProvider")
  }
  return context
}
