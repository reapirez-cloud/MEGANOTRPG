import type {
  SnakeAction,
  SnakeActionInput,
  SnakeActionResult,
  SnakeEntityRef,
} from "./types"

export class SnakeAgent {
  availableActions(actions: SnakeAction[]) {
    return actions.filter((action) => action.hidden !== true)
  }

  async execute(
    action: SnakeAction,
    entity: SnakeEntityRef,
    input?: SnakeActionInput,
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

    if (!action.execute) {
      return { type: "success" }
    }

    try {
      const result = await action.execute({ entity, input })
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
