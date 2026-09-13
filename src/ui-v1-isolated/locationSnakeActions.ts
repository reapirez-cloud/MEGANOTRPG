import type { SnakeAction } from "../snake-engine"
import type { VisibilityMode } from "../types/world"
import type { UiV1Location } from "./useUiV1Locations"

type LocationOperations = {
  createLocation: (
    parentLocationId: string | null,
    input: { name: string; summary: string; description: string; visibilityMode: VisibilityMode },
  ) => Promise<{ ok: boolean; error?: string }>
  updateLocation: (
    location: UiV1Location,
    input: { name: string; summary: string; description: string; visibilityMode: VisibilityMode },
  ) => Promise<{ ok: boolean; error?: string }>
  archiveLocation: (locationId: string) => Promise<{ ok: boolean; error?: string }>
  deleteLocation: (locationId: string) => Promise<{ ok: boolean; error?: string }>
  createTransition: (
    sourceLocationId: string,
    targetLocationId: string,
    label: string,
    visibilityMode: VisibilityMode,
  ) => Promise<{ ok: boolean; error?: string }>
}

function result(response: { ok: boolean; error?: string }, notice: string) {
  return response.ok
    ? { type: "success" as const, notice }
    : { type: "error" as const, message: response.error || "Действие не выполнено." }
}

const visibilityOptions = [
  { value: "discover", label: "По открытию" },
  { value: "always", label: "Видна сразу" },
  { value: "private", label: "Только GM" },
]

export function createLocationCreateAction({
  parentLocationId,
  title,
  operations,
}: {
  parentLocationId: string | null
  title: string
  operations: LocationOperations
}): SnakeAction {
  return {
    id: parentLocationId ? "add-child" : "add-root",
    label: parentLocationId ? "Добавить вложенную локацию" : "Добавить локацию",
    surface: {
      kind: "editor",
      eyebrow: "Мир · Локации",
      title,
      size: { width: "wide", height: "tall" },
      fields: [
        { id: "name", label: "Название", type: "text", required: true },
        { id: "summary", label: "Коротко", type: "text" },
        { id: "description", label: "Описание", type: "textarea" },
        {
          id: "visibilityMode",
          label: "Видимость",
          type: "select",
          options: visibilityOptions,
        },
      ],
      initialValues: { visibilityMode: "discover" },
      submitLabel: "Создать",
    },
    execute: async ({ input }) => {
      const response = await operations.createLocation(parentLocationId, {
        name: String(input?.name || ""),
        summary: String(input?.summary || ""),
        description: String(input?.description || ""),
        visibilityMode: (String(input?.visibilityMode || "discover") as VisibilityMode),
      })
      return result(response, "Локация создана.")
    },
  }
}

export function createLocationSnakeActions({
  location,
  locations,
  canManage,
  operations,
  onOpen,
}: {
  location: UiV1Location
  locations: UiV1Location[]
  canManage: boolean
  operations: LocationOperations
  onOpen: () => void
}): SnakeAction[] {
  const actions: SnakeAction[] = [
    {
      id: "open",
      label: "Открыть локацию",
      group: "primary",
      execute: () => {
        onOpen()
        return { type: "success" }
      },
    },
  ]

  if (!canManage) return actions

  const transitionTargets = locations.filter((candidate) => candidate.id !== location.id)

  actions.push(
    createLocationCreateAction({
      parentLocationId: location.id,
      title: "Новая локация внутри «" + location.name + "»",
      operations,
    }),
    {
      id: "add-transition",
      label: "Добавить переход",
      group: "manage",
      enabled: transitionTargets.length > 0,
      disabledReason: "Нет другой локации для перехода.",
      surface: {
        kind: "editor",
        eyebrow: "Мир · Переход",
        title: location.name,
        fields: [
          {
            id: "targetLocationId",
            label: "Куда",
            type: "select",
            required: true,
            options: transitionTargets.map((target) => ({
              value: target.id,
              label: target.name,
            })),
          },
          { id: "label", label: "Название перехода", type: "text" },
          {
            id: "visibilityMode",
            label: "Видимость",
            type: "select",
            options: visibilityOptions,
          },
        ],
        initialValues: {
          targetLocationId: transitionTargets[0]?.id || "",
          visibilityMode: "discover",
        },
        submitLabel: "Создать переход",
      },
      execute: async ({ input }) => {
        const response = await operations.createTransition(
          location.id,
          String(input?.targetLocationId || ""),
          String(input?.label || ""),
          String(input?.visibilityMode || "discover") as VisibilityMode,
        )
        return result(response, "Переход создан.")
      },
    },
    {
      id: "edit",
      label: "Редактировать",
      group: "manage",
      surface: {
        kind: "editor",
        eyebrow: "Мир · Локация",
        title: location.name,
        size: { width: "wide", height: "tall" },
        fields: [
          { id: "name", label: "Название", type: "text", required: true },
          { id: "summary", label: "Коротко", type: "text" },
          { id: "description", label: "Описание", type: "textarea" },
          {
            id: "visibilityMode",
            label: "Видимость",
            type: "select",
            options: visibilityOptions,
          },
        ],
        initialValues: {
          name: location.name,
          summary: location.summary,
          description: location.description,
          visibilityMode: location.visibility_mode,
        },
        submitLabel: "Сохранить",
      },
      execute: async ({ input }) => {
        const response = await operations.updateLocation(location, {
          name: String(input?.name || location.name),
          summary: String(input?.summary || ""),
          description: String(input?.description || ""),
          visibilityMode: String(input?.visibilityMode || location.visibility_mode) as VisibilityMode,
        })
        return result(response, "Локация сохранена.")
      },
    },
    {
      id: "archive",
      label: "В архив",
      group: "manage",
      surface: {
        kind: "confirm",
        eyebrow: "Мир · Локация",
        title: "Архивировать «" + location.name + "»?",
        body: "Локация исчезнет из активной структуры мира, но останется в данных кампании.",
        confirmLabel: "В архив",
      },
      execute: async () => {
        const response = await operations.archiveLocation(location.id)
        return result(response, "Локация архивирована.")
      },
    },
    {
      id: "delete",
      label: "Удалить навсегда",
      group: "danger",
      tone: "danger",
      surface: {
        kind: "confirm",
        eyebrow: "Мир · Локация",
        title: "Удалить «" + location.name + "» навсегда?",
        body: "Это необратимое действие. Вложенные данные будут обработаны связями базы данных.",
        confirmLabel: "Удалить навсегда",
      },
      execute: async () => {
        const response = await operations.deleteLocation(location.id)
        return result(response, "Локация удалена.")
      },
    },
  )

  return actions
}
