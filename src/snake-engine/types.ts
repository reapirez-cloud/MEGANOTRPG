export type SnakeEntityRef = {
  type: string
  id: string
}

export type SnakePoint = {
  x: number
  y: number
}

export type SnakeActionTone = "normal" | "danger"

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

export type SnakeSurfaceRequest =
  | {
      kind: "placeholder"
      title: string
      eyebrow?: string
      body?: string
    }
  | {
      kind: "confirm"
      title: string
      eyebrow?: string
      body?: string
      confirmLabel?: string
      cancelLabel?: string
    }
  | {
      kind: "editor"
      title: string
      eyebrow?: string
      fields: SnakeFieldSchema[]
      initialValues?: Record<string, unknown>
      submitLabel?: string
      cancelLabel?: string
    }
  | {
      kind: "picker"
      title: string
      eyebrow?: string
      items: SnakePickerItem[]
      submitLabel?: string
      cancelLabel?: string
    }
  | {
      kind: "detail"
      title: string
      eyebrow?: string
      body?: string
      mediaUrl?: string
    }
  | {
      kind: "notice"
      title: string
      eyebrow?: string
      body?: string
      tone?: "normal" | "error"
    }

export type SnakeActionInput = Record<string, unknown> | undefined

export type SnakeActionResult =
  | { type: "success"; notice?: string }
  | { type: "error"; message: string }
  | { type: "surface"; request: SnakeSurfaceRequest }

export type SnakeActionExecutionContext = {
  entity: SnakeEntityRef
  input: SnakeActionInput
}

export type SnakeActionExecutor = (
  context: SnakeActionExecutionContext,
) => SnakeActionResult | void | Promise<SnakeActionResult | void>

export type SnakeAction = {
  id: string
  label: string
  enabled?: boolean
  hidden?: boolean
  tone?: SnakeActionTone
  group?: string
  disabledReason?: string
  surface?: SnakeSurfaceRequest
  execute?: SnakeActionExecutor
}

export type SnakeMenuRequest = {
  entity: SnakeEntityRef
  actions: SnakeAction[]
  point: SnakePoint
}
