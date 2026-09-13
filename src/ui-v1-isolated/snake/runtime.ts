import type {
  SnakeAction,
  SnakeActionPathEntry,
  SnakeEntityRef,
  SnakePoint,
  SnakeSurfaceRequest,
} from "../../snake-engine"

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
