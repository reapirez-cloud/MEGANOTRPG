import type {
  SnakeAction,
  SnakeEntityRef,
  SnakeSurfaceRequest,
} from "../../snake-engine"

export type SnakeSurfaceSource = {
  action?: SnakeAction
  entity?: SnakeEntityRef
}

export type SnakeSurfaceSession = SnakeSurfaceSource & {
  id: number
  request: SnakeSurfaceRequest
  error?: string
}
