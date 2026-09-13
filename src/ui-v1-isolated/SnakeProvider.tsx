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
  type SnakeActionPathEntry,
  type SnakeEntityRef,
  type SnakeMenuRequest,
  type SnakeSurfaceRequest,
} from "../snake-engine"
import { SnakeContext, type SnakeContextValue } from "./snake/SnakeContext"
import { SnakeContextMenu } from "./snake/interaction/SnakeContextMenu"
import { SnakeWindowHost } from "./snake/surfaces/SnakeWindowHost"
import type {
  SnakeMenuSession,
  SnakeSurfaceSession,
  SnakeSurfaceSource,
} from "./snake/runtime"

export { useSnake } from "./snake/SnakeContext"
export { SnakeTrigger } from "./snake/interaction/SnakeTrigger"

export function SnakeProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<SnakeMenuSession | null>(null)
  const [surface, setSurface] = useState<SnakeSurfaceSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [menuBusy, setMenuBusy] = useState(false)
  const surfaceIdRef = useRef(0)
  const menuIdRef = useRef(0)

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
      path: source?.path,
    })
  }

  async function execute(
    action: SnakeAction,
    entity: SnakeEntityRef,
    input?: SnakeActionInput,
    path: SnakeActionPathEntry[] = [],
  ) {
    setBusy(true)
    const result = await snakeAgent.execute(action, entity, input, path)
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
      openSurface(result.request, { action, entity, path })
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

  async function invokeCommand(
    action: SnakeAction,
    entity: SnakeEntityRef,
    path: SnakeActionPathEntry[],
  ) {
    if (action.enabled === false) return

    if (action.surface) {
      openSurface(action.surface, { action, entity, path })
      return
    }

    await execute(action, entity, undefined, path)
  }

  async function invokeMenuAction(
    action: SnakeAction,
    session: SnakeMenuSession,
  ) {
    const frame = session.frames[session.frames.length - 1]
    if (!frame) return

    if (snakeAgent.isBranch(action)) {
      setMenuBusy(true)
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
        openSurface({
          kind: "notice",
          title: "Действие недоступно",
          body: reason instanceof Error
            ? reason.message
            : "Не удалось открыть следующий уровень.",
          tone: "error",
        })
      } finally {
        setMenuBusy(false)
      }
      return
    }

    setMenu(null)
    await invokeCommand(action, session.entity, frame.path)
  }

  const value = useMemo<SnakeContextValue>(
    () => ({
      openMenu(request: SnakeMenuRequest) {
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
      },
      closeMenu() {
        if (!menuBusy) setMenu(null)
      },
      openSurface,
      closeSurface() {
        if (!busy) setSurface(null)
      },
    }),
    [busy, menuBusy],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (busy || menuBusy) return

      if (surface) {
        setSurface(null)
        return
      }

      setMenu(null)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [busy, menuBusy, surface])

  const menuFrame = menu?.frames[menu.frames.length - 1] || null

  return (
    <SnakeContext.Provider value={value}>
      {children}
      {menu && menuFrame && (
        <SnakeContextMenu
          request={{
            entity: menu.entity,
            point: menu.point,
            title: menuFrame.title,
            actions: menuFrame.actions,
          }}
          canGoBack={menu.frames.length > 1}
          busy={menuBusy}
          onBack={() => {
            if (menuBusy) return
            setMenu((current) => {
              if (!current || current.frames.length <= 1) return current
              return { ...current, frames: current.frames.slice(0, -1) }
            })
          }}
          onClose={() => {
            if (!menuBusy) setMenu(null)
          }}
          onAction={(action) => void invokeMenuAction(action, menu)}
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
            void execute(
              surface.action,
              surface.entity,
              input,
              surface.path || [],
            )
          }}
        />
      )}
    </SnakeContext.Provider>
  )
}
