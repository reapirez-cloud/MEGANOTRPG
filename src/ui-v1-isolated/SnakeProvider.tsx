import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { useAIViewContextLayer } from "../ai/AIProvider"
import {
  snakeAgent,
  type SnakeAction,
  type SnakeActionInput,
  type SnakeActionPathEntry,
  type SnakeEntityRef,
  type SnakeSurfaceRequest,
} from "../snake-engine"
import { SnakeContext, type SnakeContextValue } from "./snake/SnakeContext"
import { SnakeContextMenu } from "./snake/interaction/SnakeContextMenu"
import { useSnakeMenuRuntime } from "./snake/menuRuntime"
import { SnakeWindowHost } from "./snake/surfaces/SnakeWindowHost"
import type {
  SnakeSurfaceSession,
  SnakeSurfaceSource,
  SnakeViewContext,
} from "./snake/runtime"

export { useSnake } from "./snake/SnakeContext"
export { SnakeTrigger } from "./snake/interaction/SnakeTrigger"

export function SnakeProvider({ children }: { children: ReactNode }) {
  const [viewContext, setViewContext] = useState<SnakeViewContext | null>(null)
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

  const menu = useSnakeMenuRuntime({
    onCommand: invokeCommand,
    onError(message) {
      openSurface({
        kind: "notice",
        title: "Действие недоступно",
        body: message,
        tone: "error",
      })
    },
  })

  useAIViewContextLayer(
    "snake-menu",
    menu.menu
      ? {
          screen: "snake-menu",
          title: menu.frame?.title || "Контекстное меню",
          text: "Открыто контекстное меню Snake для выбранной сущности.",
          entity: {
            type: menu.menu.entity.type,
            id: menu.menu.entity.id,
            label: menu.frame?.title,
          },
          facts: {
            ...(viewContext?.facts || {}),
            snakeView: {
              screen: viewContext?.screen || null,
              title: viewContext?.title || null,
              entity: viewContext?.entity || null,
            },
            snakeMenu: {
              actions: menu.frame?.actions.map((action) => ({
                id: action.id,
                label: action.label,
                enabled: action.enabled !== false,
              })) || [],
              depth: menu.menu.frames.length,
              path: menu.frame?.path || [],
            },
          },
        }
      : null,
    85,
  )

  useAIViewContextLayer(
    "snake-surface",
    surface
      ? {
          screen: "snake-surface",
          route: viewContext?.route,
          title: surface.request.title,
          text: [
            viewContext?.text,
            "Открыто окно Snake для текущей сущности.",
          ].filter(Boolean).join("\n\n"),
          entity: surface.entity
            ? {
                type: surface.entity.type,
                id: surface.entity.id,
              }
            : viewContext?.entity || null,
          facts: {
            ...(viewContext?.facts || {}),
            snakeView: {
              screen: viewContext?.screen || null,
              title: viewContext?.title || null,
              entity: viewContext?.entity || null,
            },
            snakeSurface: {
              kind: surface.request.kind,
              actionId: surface.action?.id || null,
              actionLabel: surface.action?.label || null,
              path: surface.path || [],
              error: surface.error || null,
            },
          },
        }
      : null,
    90,
  )

  const value = useMemo<SnakeContextValue>(
    () => ({
      viewContext,
      setViewContext,
      openMenu: menu.openMenu,
      closeMenu: menu.closeMenu,
      openSurface,
      closeSurface() {
        if (!busy) setSurface(null)
      },
    }),
    [busy, menu.closeMenu, menu.openMenu, viewContext],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (busy || menu.busy) return

      if (surface) {
        setSurface(null)
        return
      }

      menu.closeMenu()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [busy, menu, surface])

  return (
    <SnakeContext.Provider value={value}>
      {children}
      {menu.menu && menu.frame && (
        <SnakeContextMenu
          request={{
            entity: menu.menu.entity,
            point: menu.menu.point,
            title: menu.frame.title,
            actions: menu.frame.actions,
          }}
          canGoBack={menu.menu.frames.length > 1}
          busy={menu.busy}
          onBack={menu.back}
          onClose={menu.closeMenu}
          onAction={(action) => void menu.invoke(action)}
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
