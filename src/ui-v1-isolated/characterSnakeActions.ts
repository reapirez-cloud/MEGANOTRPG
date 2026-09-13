import type { SnakeAction, SnakeSurfaceRequest } from "../snake-engine"

function placeholder(title: string, body: string): SnakeSurfaceRequest {
  return {
    kind: "placeholder",
    eyebrow: "Персонаж · Аватар",
    title,
    body,
  }
}

export function createCharacterSnakeActions({
  canEditAvatar,
}: {
  canEditAvatar: boolean
}): SnakeAction[] {
  if (!canEditAvatar) return []

  return [
    {
      id: "avatar",
      label: "Аватар",
      kind: "branch",
      group: "identity",
      children: ({ path }) => {
        if (path[path.length - 1]?.id !== "avatar") return []

        return [
          {
            id: "character-avatar",
            label: "Аватар персонажа",
            surface: placeholder(
              "Аватар персонажа",
              "Это стабильная точка подключения редактора основного аватара персонажа. Сам редактор будет подключён отдельным этапом.",
            ),
          },
          {
            id: "panel-avatar",
            label: "Аватар панели",
            surface: placeholder(
              "Аватар панели",
              "Это отдельная точка подключения изображения для панели персонажа в «Я». Хранилище и редактор будут подключены отдельным этапом.",
            ),
          },
        ]
      },
    },
  ]
}
