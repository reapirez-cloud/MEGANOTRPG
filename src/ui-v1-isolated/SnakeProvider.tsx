import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  snakeAgent,
  type SnakeAction,
  type SnakeActionInput,
  type SnakeEntityRef,
  type SnakeMenuRequest,
  type SnakeSurfaceRequest,
} from "../snake-engine"
import { SnakeContext, type SnakeContextValue } from "./snake/SnakeContext"
import { SnakeContextMenu } from "./snake/interaction/SnakeContextMenu"
import { SnakeWindowHost } from "./snake/surfaces/SnakeWindowHost"
import type {
  SnakeSurfaceSession,
  SnakeSurfaceSource,
} from "./snake/runtime"

export { useSnake } from "./snake/SnakeContext"
export { SnakeTrigger } from "./snake/interaction/SnakeTrigger"

export function SnakeProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<SnakeMenuRequest | null>(null)
  const [surface, setSurface] = useState<SnakeSurfaceSession | null>(null)
  const [busy, setBusy] = useState(false)
  const surfaceIdRef = useRef(0)

  function openSurface(
    request: SnakeSurfaceRequest,
    source?: SnakeSurfaceSource,
  ) {
    surfaceIdRef.current += 1
    setSurface({
      id: surfaceIdRef.current,
      request,
      action: source?.action,
      entity: source?.entity,
    })
  }

  async function execute(
    action: SnakeAction,
    entity: SnakeEntityRef,
    input?: SnakeActionInput,
  ) {
    setBusy(true)
    const result = await snakeAgent.execute(action, entity, input)
    setBusy(false)

    if (result.type === "error") {
      setSurface((current) =>
        current
          ? { ...current, error: result.message }
          : {
              id: ++surfaceIdRef.current,
              request: {
                kind: "notice",
                title: "Действие не выполнено",
                body: result.message,
                tone: "error",
              },
            },
      )
      return
    }

    if (result.type === "surface") {
      openSurface(result.request, { action, entity })
      return
    }

    setSurface(null)

    if (result.notice) {
      openSurface({
        kind: "notice",
        title: "Готово",
        body: result.notice,
      })
    }
  }

  async function invokeAction(action: SnakeAction, entity: SnakeEntityRef) {
    setMenu(null)

    if (action.enabled === false) return

    if (action.surface) {
      openSurface(action.surface, { action, entity })
      return
    }

    await execute(action, entity)
  }

  const value = useMemo<SnakeContextValue>(
    () => ({
      openMenu(request) {
        const actions = snakeAgent.availableActions(request.actions)
        if (actions.length === 0) return
        setMenu({ ...request, actions })
      },
      closeMenu() {
        setMenu(null)
      },
      openSurface,
      closeSurface() {
        if (!busy) setSurface(null)
      },
    }),
    [busy],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (busy) return

      if (surface) {
        setSurface(null)
        return
      }

      setMenu(null)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [busy, surface])

  return (
    <SnakeContext.Provider value={value}>
      {children}
      {menu && (
        <SnakeContextMenu
          request={menu}
          onClose={() => setMenu(null)}
          onAction={(action) => void invokeAction(action, menu.entity)}
        />
      )}
      {surface && (
        <SnakeWindowHost
          session={surface}
          busy={busy}
          onClose={() => {
            if (!busy) setSurface(null)
          }}
          onSubmit={(input) => {
            if (!surface.action || !surface.entity) {
              setSurface(null)
              return
            }
            void execute(surface.action, surface.entity, input)
          }}
        />
      )}
    </SnakeContext.Provider>
  )
}
