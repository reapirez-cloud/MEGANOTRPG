import type {
  SnakeAction,
  SnakeActionInput,
  SnakeActionPathEntry,
  SnakeActionResult,
  SnakeEntityRef,
} from "./types"

export class SnakeAgent {
  availableActions(actions: SnakeAction[]) {
    return actions.filter((action) => action.hidden !== true)
  }

  isBranch(action: SnakeAction) {
    return action.kind === "branch" || Boolean(action.children)
  }

  async resolveBranch(
    action: SnakeAction,
    entity: SnakeEntityRef,
    path: SnakeActionPathEntry[] = [],
  ) {
    if (action.hidden) {
      throw new Error("Действие недоступно.")
    }

    if (action.enabled === false) {
      throw new Error(action.disabledReason || "Действие сейчас недоступно.")
    }

    if (!this.isBranch(action)) {
      throw new Error("Это действие не открывает следующий уровень.")
    }

    const nextPath = [...path, { id: action.id, label: action.label }]
    const children = typeof action.children === "function"
      ? await action.children({ entity, path: nextPath })
      : action.children || []

    return {
      path: nextPath,
      actions: this.availableActions(children),
    }
  }

  async execute(
    action: SnakeAction,
    entity: SnakeEntityRef,
    input?: SnakeActionInput,
    path: SnakeActionPathEntry[] = [],
  ): Promise<SnakeActionResult> {
    if (action.hidden) {
      return { type: "error", message: "Действие недоступно." }
    }

    if (action.enabled === false) {
      return {
        type: "error",
        message: action.disabledReason || "Действие сейчас недоступно.",
      }
    }

    if (this.isBranch(action)) {
      return {
        type: "error",
        message: "Сначала выберите действие внутри этого раздела.",
      }
    }

    if (!action.execute) {
      return { type: "success" }
    }

    try {
      const result = await action.execute({ entity, input, path })
      return result || { type: "success" }
    } catch (error) {
      return {
        type: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Не удалось выполнить действие.",
      }
    }
  }
}

export const snakeAgent = new SnakeAgent()
