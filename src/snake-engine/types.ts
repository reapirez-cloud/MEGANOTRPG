export type SnakeEntityRef = {
  type: string
  id: string
}

export type SnakePoint = {
  x: number
  y: number
}

export type SnakeActionTone = "normal" | "danger"

export type SnakeActionPathEntry = {
  id: string
  label: string
}

export type SnakeWindowWidth =
  | "compact"
  | "narrow"
  | "standard"
  | "wide"
  | "full"

export type SnakeWindowHeight =
  | "content"
  | "tall"
  | "full"

export type SnakeWindowSize = {
  width?: SnakeWindowWidth
  height?: SnakeWindowHeight
}

export type SnakeFieldOption = {
  value: string
  label: string
}

export type SnakeFieldSchema =
  | {
      id: string
      label: string
      type: "text" | "textarea" | "number"
      required?: boolean
      placeholder?: string
    }
  | {
      id: string
      label: string
      type: "select"
      required?: boolean
      options: SnakeFieldOption[]
    }
  | {
      id: string
      label: string
      type: "checkbox"
    }

export type SnakePickerItem = {
  id: string
  label: string
  description?: string
  disabled?: boolean
}

type SnakeWindowRequestBase = {
  title: string
  eyebrow?: string
  size?: SnakeWindowSize
}

export type SnakePlaceholderRequest = SnakeWindowRequestBase & {
  kind: "placeholder"
  body?: string
}

export type SnakeConfirmRequest = SnakeWindowRequestBase & {
  kind: "confirm"
  body?: string
  confirmLabel?: string
  cancelLabel?: string
}

export type SnakeEditorRequest = SnakeWindowRequestBase & {
  kind: "editor"
  fields: SnakeFieldSchema[]
  initialValues?: Record<string, unknown>
  submitLabel?: string
  cancelLabel?: string
}

export type SnakePickerRequest = SnakeWindowRequestBase & {
  kind: "picker"
  items: SnakePickerItem[]
  initialSelection?: string
  submitLabel?: string
  cancelLabel?: string
}

export type SnakeDetailRequest = SnakeWindowRequestBase & {
  kind: "detail"
  body?: string
  mediaUrl?: string
}

export type SnakeMediaItem = {
  id: string
  src: string
  title?: string
  caption?: string
  alt?: string
  facts?: Record<string, unknown>
}

export type SnakeMediaRequest = SnakeWindowRequestBase & {
  kind: "media"
  items: SnakeMediaItem[]
  initialIndex?: number
}

export type SnakeNoticeRequest = SnakeWindowRequestBase & {
  kind: "notice"
  body?: string
  tone?: "normal" | "error"
}

type SnakeFlowStepBase = {
  id: string
  title: string
  eyebrow?: string
  size?: SnakeWindowSize
}

export type SnakeFlowStep =
  | (SnakeFlowStepBase & {
      kind: "editor"
      fields: SnakeFieldSchema[]
      nextLabel?: string
    })
  | (SnakeFlowStepBase & {
      kind: "picker"
      items: SnakePickerItem[]
      valueKey?: string
      nextLabel?: string
    })
  | (SnakeFlowStepBase & {
      kind: "confirm"
      body?: string
      valueKey?: string
      nextLabel?: string
    })
  | (SnakeFlowStepBase & {
      kind: "detail"
      body?: string
      mediaUrl?: string
      nextLabel?: string
    })

export type SnakeFlowRequest = SnakeWindowRequestBase & {
  kind: "flow"
  steps: SnakeFlowStep[]
  initialValues?: Record<string, unknown>
  nextLabel?: string
  backLabel?: string
  cancelLabel?: string
  submitLabel?: string
}

export type SnakeSurfaceRequest =
  | SnakePlaceholderRequest
  | SnakeConfirmRequest
  | SnakeEditorRequest
  | SnakePickerRequest
  | SnakeDetailRequest
  | SnakeMediaRequest
  | SnakeNoticeRequest
  | SnakeFlowRequest

export type SnakeActionInput = Record<string, unknown> | undefined

export type SnakeActionResult =
  | { type: "success"; notice?: string }
  | { type: "error"; message: string }
  | { type: "surface"; request: SnakeSurfaceRequest }

export type SnakeBranchResolverContext = {
  entity: SnakeEntityRef
  path: SnakeActionPathEntry[]
}

export type SnakeBranchResolver = (
  context: SnakeBranchResolverContext,
) => SnakeAction[] | Promise<SnakeAction[]>

export type SnakeActionExecutionContext = {
  entity: SnakeEntityRef
  input: SnakeActionInput
  path: SnakeActionPathEntry[]
}

export type SnakeActionExecutor = (
  context: SnakeActionExecutionContext,
) => SnakeActionResult | void | Promise<SnakeActionResult | void>

export type SnakeAction = {
  id: string
  label: string
  kind?: "command" | "branch"
  enabled?: boolean
  hidden?: boolean
  tone?: SnakeActionTone
  group?: string
  disabledReason?: string
  children?: SnakeAction[] | SnakeBranchResolver
  surface?: SnakeSurfaceRequest
  execute?: SnakeActionExecutor
}

export type SnakeMenuRequest = {
  entity: SnakeEntityRef
  actions: SnakeAction[]
  point: SnakePoint
  title?: string
}
