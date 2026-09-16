import type {
  SnakeAction,
  SnakeActionPathEntry,
  SnakeEntityRef,
  SnakePoint,
  SnakeSurfaceRequest,
} from "../../snake-engine"

export type SnakeViewContext = {
  screen: string
  route?: string
  title?: string
  text?: string
  entity?: {
    type: string
    id: string
    label?: string
  } | null
  facts?: Record<string, unknown>
}

export type SnakeSurfaceSource = {
  action?: SnakeAction
  entity?: SnakeEntityRef
  path?: SnakeActionPathEntry[]
}

export type SnakeSurfaceSession = SnakeSurfaceSource & {
  id: number
  request: SnakeSurfaceRequest
  error?: string
}

export type SnakeMenuFrame = {
  id: string
  title?: string
  actions: SnakeAction[]
  path: SnakeActionPathEntry[]
}

export type SnakeMenuSession = {
  id: number
  entity: SnakeEntityRef
  point: SnakePoint
  frames: SnakeMenuFrame[]
}
