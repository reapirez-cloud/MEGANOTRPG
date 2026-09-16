import type { SnakeAction } from "../snake-engine"
import type { InventoryItem } from "../types/characterSheet"
import type { UiV1Location, UiV1WorldStorage } from "./useUiV1Locations"

type Result = { ok: boolean; error?: string }

type StorageOperations = {
  canManage: boolean
  activeCharacterId: string | null
  loadStorageItems: (storageId: string) => Promise<InventoryItem[]>
  loadActiveInventory: () => Promise<InventoryItem[]>
  createStorage: (
    locationId: string,
    input: {
      name: string
      description?: string
      storageKind?: UiV1WorldStorage["storage_kind"]
      visibilityMode?: UiV1WorldStorage["visibility_mode"]
      accessMode?: UiV1WorldStorage["access_mode"]
      ownerCharacterId?: string | null
    },
  ) => Promise<Result>
  updateStorage: (
    storage: UiV1WorldStorage,
    input: {
      name: string
      description: string
      visibilityMode: UiV1WorldStorage["visibility_mode"]
      accessMode: UiV1WorldStorage["access_mode"]
      ownerCharacterId: string | null
    },
  ) => Promise<Result>
  moveStorage: (storage: UiV1WorldStorage, locationId: string) => Promise<Result>
  archiveStorage: (storage: UiV1WorldStorage) => Promise<Result>
  storeItem: (storage: UiV1WorldStorage, item: InventoryItem, amount?: number) => Promise<Result>
  takeItem: (storage: UiV1WorldStorage, item: InventoryItem, amount?: number) => Promise<Result>
}

function actionResult(result: Result, notice: string) {
  return result.ok
    ? { type: "success" as const, notice }
    : { type: "error" as const, message: result.error || "Действие не выполнено." }
}

const kindOptions = [
  { value: "stash", label: "Тайник" },
  { value: "chest", label: "Сундук" },
  { value: "crate", label: "Ящик" },
  { value: "cache", label: "Схрон" },
  { value: "other", label: "Другое" },
]

const visibilityOptions = [
  { value: "campaign", label: "Видно кампании" },
  { value: "owner", label: "Только владельцу" },
  { value: "gm", label: "Только GM" },
]

const accessOptions = [
  { value: "shared", label: "Общее использование" },
  { value: "owner", label: "Только владелец" },
  { value: "gm", label: "Только GM" },
]

export function createWorldStorageCreateAction({
  location,
  operations,
}: {
  location: UiV1Location
  operations: StorageOperations
}): SnakeAction {
  const playerOnly = !operations.canManage
  return {
    id: "create-world-storage",
    label: "Создать хранилище",
    surface: {
      kind: "editor",
      eyebrow: "Мир · Хранилище",
      title: "Новое хранилище · " + location.name,
      fields: [
        { id: "name", label: "Название", type: "text", required: true },
        { id: "description", label: "Описание", type: "textarea" },
        ...(playerOnly ? [] : [
          { id: "storageKind", label: "Тип", type: "select", options: kindOptions },
          { id: "visibilityMode", label: "Видимость", type: "select", options: visibilityOptions },
          { id: "accessMode", label: "Доступ", type: "select", options: accessOptions },
        ] as const),
      ],
      initialValues: playerOnly
        ? {}
        : {
            storageKind: "stash",
            visibilityMode: "campaign",
            accessMode: "shared",
          },
      submitLabel: "Создать",
    },
    execute: async ({ input }) => actionResult(
      await operations.createStorage(location.id, {
        name: String(input?.name || ""),
        description: String(input?.description || ""),
        storageKind: String(input?.storageKind || "stash") as UiV1WorldStorage["storage_kind"],
        visibilityMode: String(input?.visibilityMode || (playerOnly ? "owner" : "campaign")) as UiV1WorldStorage["visibility_mode"],
        accessMode: String(input?.accessMode || (playerOnly ? "owner" : "shared")) as UiV1WorldStorage["access_mode"],
        ownerCharacterId: playerOnly ? operations.activeCharacterId : null,
      }),
      "Хранилище создано.",
    ),
  }
}

export function createWorldStorageSnakeActions({
  storage,
  locations,
  operations,
}: {
  storage: UiV1WorldStorage
  locations: UiV1Location[]
  operations: StorageOperations
}): SnakeAction[] {
  const actions: SnakeAction[] = [{
    id: "inspect-world-storage",
    label: "Сведения",
    surface: {
      kind: "detail",
      eyebrow: "Мир · Хранилище",
      title: storage.name,
      body: [
        storage.description,
        "Предметов: " + storage.item_count,
        storage.can_operate ? "Доступ: можно пользоваться" : "Доступ: только просмотр",
      ].filter(Boolean).join("\n\n"),
    },
  }]

  if (storage.can_operate && operations.activeCharacterId) {
    actions.push({
      id: "store-world-item",
      label: "Положить предмет",
      kind: "branch",
      children: async () => {
        const items = (await operations.loadActiveInventory())
          .filter((item) => !item.equipped)
        if (!items.length) {
          return [{
            id: "store-world-empty",
            label: "Нет доступных предметов",
            enabled: false,
          }]
        }
        return items.map((item) => ({
          id: "store-world-" + item.id,
          label: item.quantity > 1 ? item.name + " ×" + item.quantity : item.name,
          execute: async () => actionResult(
            await operations.storeItem(storage, item),
            "Предмет оставлен в хранилище.",
          ),
        }))
      },
    }, {
      id: "take-world-item",
      label: "Забрать предмет",
      kind: "branch",
      children: async () => {
        const items = (await operations.loadStorageItems(storage.id))
          .filter((item) => item.id !== storage.root_item_id)
        if (!items.length) {
          return [{
            id: "take-world-empty",
            label: "Хранилище пусто",
            enabled: false,
          }]
        }
        return items.map((item) => ({
          id: "take-world-" + item.id,
          label: item.quantity > 1 ? item.name + " ×" + item.quantity : item.name,
          execute: async () => actionResult(
            await operations.takeItem(storage, item),
            "Предмет забран.",
          ),
        }))
      },
    })
  }

  const canEdit = operations.canManage || (
    storage.owner_character_id !== null
    && storage.owner_character_id === operations.activeCharacterId
  )
  if (canEdit) {
    const playerOwner = !operations.canManage
    actions.push({
      id: "edit-world-storage",
      label: "Редактировать",
      surface: {
        kind: "editor",
        eyebrow: "Мир · Хранилище",
        title: storage.name,
        fields: [
          { id: "name", label: "Название", type: "text", required: true },
          { id: "description", label: "Описание", type: "textarea" },
          ...(playerOwner ? [] : [
            { id: "visibilityMode", label: "Видимость", type: "select", options: visibilityOptions },
            { id: "accessMode", label: "Доступ", type: "select", options: accessOptions },
          ] as const),
        ],
        initialValues: {
          name: storage.name,
          description: storage.description,
          visibilityMode: storage.visibility_mode,
          accessMode: storage.access_mode,
        },
        submitLabel: "Сохранить",
      },
      execute: async ({ input }) => actionResult(
        await operations.updateStorage(storage, {
          name: String(input?.name || storage.name),
          description: String(input?.description ?? storage.description),
          visibilityMode: String(input?.visibilityMode || storage.visibility_mode) as UiV1WorldStorage["visibility_mode"],
          accessMode: String(input?.accessMode || storage.access_mode) as UiV1WorldStorage["access_mode"],
          ownerCharacterId: storage.owner_character_id,
        }),
        "Хранилище сохранено.",
      ),
    })

    if (operations.canManage) {
      const targets = locations.filter((location) => location.id !== storage.location_id)
      actions.push({
        id: "move-world-storage",
        label: "Перенести в локацию",
        kind: "branch",
        enabled: targets.length > 0,
        children: targets.map((location) => ({
          id: "move-storage-" + location.id,
          label: location.name,
          execute: async () => actionResult(
            await operations.moveStorage(storage, location.id),
            "Хранилище перенесено целиком.",
          ),
        })),
      })
    }

    actions.push({
      id: "archive-world-storage",
      label: "Убрать в архив",
      tone: "danger",
      surface: {
        kind: "confirm",
        eyebrow: "Мир · Хранилище",
        title: "Архивировать «" + storage.name + "»?",
        body: "Содержимое останется в том же каноническом контейнере и не будет скопировано.",
        confirmLabel: "В архив",
      },
      execute: async () => actionResult(
        await operations.archiveStorage(storage),
        "Хранилище архивировано.",
      ),
    })
  }

  return actions
}
