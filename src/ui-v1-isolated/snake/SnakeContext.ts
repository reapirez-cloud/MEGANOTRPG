import { createContext, useContext } from "react"

import type { SnakeAction, SnakeActionInput, SnakeActionPathEntry, SnakeActionResult, SnakeEntityRef, SnakeMenuRequest, SnakeSurfaceRequest } from "../../snake-engine"
import type { SnakeSurfaceSource, SnakeViewContext } from "./runtime"

export type SnakeContextValue = {
  viewContext: SnakeViewContext | null
  setViewContext: (context: SnakeViewContext | null) => void
  openMenu: (request: SnakeMenuRequest) => void
  closeMenu: () => void
  openSurface: (
    request: SnakeSurfaceRequest,
    source?: SnakeSurfaceSource,
  ) => void
  closeSurface: () => void
  executeAction: (
    action: SnakeAction,
    entity: SnakeEntityRef,
    input?: SnakeActionInput,
    path?: SnakeActionPathEntry[],
  ) => Promise<SnakeActionResult>
}

export const SnakeContext = createContext<SnakeContextValue | null>(null)

export function useSnake() {
  const context = useContext(SnakeContext)
  if (!context) {
    throw new Error("useSnake must be used inside SnakeProvider")
  }
  return context
}
