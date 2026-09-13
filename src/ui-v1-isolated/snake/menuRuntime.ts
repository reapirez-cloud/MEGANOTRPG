import { useRef, useState } from "react"

import {
  snakeAgent,
  type SnakeAction,
  type SnakeActionPathEntry,
  type SnakeEntityRef,
  type SnakeMenuRequest,
} from "../../snake-engine"
import type { SnakeMenuSession } from "./runtime"

type Props = {
  onCommand: (
    action: SnakeAction,
    entity: SnakeEntityRef,
    path: SnakeActionPathEntry[],
  ) => void | Promise<void>
  onError: (message: string) => void
}

export function useSnakeMenuRuntime({ onCommand, onError }: Props) {
  const [menu, setMenu] = useState<SnakeMenuSession | null>(null)
  const [busy, setBusy] = useState(false)
  const menuIdRef = useRef(0)

  function openMenu(request: SnakeMenuRequest) {
    const actions = snakeAgent.availableActions(request.actions)
    if (actions.length === 0) return

    menuIdRef.current += 1
    setMenu({
      id: menuIdRef.current,
      entity: request.entity,
      point: request.point,
      frames: [{
        id: "root",
        title: request.title,
        actions,
        path: [],
      }],
    })
  }

  function closeMenu() {
    if (!busy) setMenu(null)
  }

  function back() {
    if (busy) return
    setMenu((current) => {
      if (!current || current.frames.length <= 1) return current
      return { ...current, frames: current.frames.slice(0, -1) }
    })
  }

  async function invoke(action: SnakeAction) {
    const session = menu
    const frame = session?.frames[session.frames.length - 1]
    if (!session || !frame) return

    if (!snakeAgent.isBranch(action)) {
      setMenu(null)
      await onCommand(action, session.entity, frame.path)
      return
    }

    setBusy(true)
    try {
      const next = await snakeAgent.resolveBranch(
        action,
        session.entity,
        frame.path,
      )

      setMenu((current) => {
        if (!current || current.id !== session.id) return current
        if (next.actions.length === 0) return current

        return {
          ...current,
          frames: [
            ...current.frames,
            {
              id: action.id,
              title: action.label,
              actions: next.actions,
              path: next.path,
            },
          ],
        }
      })
    } catch (reason) {
      setMenu(null)
      onError(
        reason instanceof Error
          ? reason.message
          : "Не удалось открыть следующий уровень.",
      )
    } finally {
      setBusy(false)
    }
  }

  return {
    menu,
    frame: menu?.frames[menu.frames.length - 1] || null,
    busy,
    openMenu,
    closeMenu,
    back,
    invoke,
  }
}
