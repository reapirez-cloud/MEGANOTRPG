import type { SnakeAction, SnakeSurfaceRequest } from "../snake-engine"
import { inventorySimpleContainerTargets } from "../inventory-engine"
import type { InventoryItem } from "../types/characterSheet"

type Result = { ok: boolean; error?: string }
type Operations = {
  move: (item: InventoryItem, holder: string | null) => Promise<Result>
  quick: (item: InventoryItem, slot: number | null) => Promise<Result>
  equip: (item: InventoryItem) => Promise<Result>
  use: (item: InventoryItem, amount?: number) => Promise<Result>
}

export function inventoryItemDetail(item: InventoryItem): SnakeSurfaceRequest {
  const weight = item.weight == null ? "Неизвестен" : `${Number(item.weight).toLocaleString("ru-RU")} кг за единицу`
  const details = [
    item.description.trim() || "Описание предмета не добавлено.",
    `Количество: ${item.quantity} · Вес: ${weight}`,
    item.equipped ? "Экипировано" : "При себе",
    item.usage_mode === "charges" ? `Заряды: ${item.charges_current ?? 0}/${item.charges_max ?? 0}` : "",
  ].filter(Boolean).join("\n\n")
  return { kind: "detail", eyebrow: "ИНВЕНТАРЬ · ПРЕДМЕТ", title: item.name,
    body: details, mediaUrl: item.image_url || undefined, mediaFit: "contain",
    size: { width: "standard", height: "tall" } }
}

export function inventoryItemActions(
  item: InventoryItem, items: InventoryItem[], canControl: boolean, operations: Operations,
  openBag: (id: string) => void,
): SnakeAction[] {
  const result = async (task: () => Promise<Result>, notice: string) => {
    const response = await task()
    return response.ok ? { type: "success" as const, notice } :
      { type: "error" as const, message: response.error || "Действие не выполнено." }
  }
  const actions: SnakeAction[] = [{ id: "inspect", label: "Осмотреть", surface: inventoryItemDetail(item) }]
  if (item.category === "container") {
    actions.push({ id: "open", label: "Открыть", execute: () => { openBag(item.id); return { type: "success" } } })
  }
  if (!canControl) return actions
  if (!item.equipped && (item.usage_mode !== "none" && item.usage_mode != null || item.category === "consumable")) {
    actions.push({ id: "use", label: "Использовать", execute: () => result(() => operations.use(item, 1), "Предмет использован.") })
  }
  if (!item.equipped && item.category === "equipment" && item.equipment_slot) {
    actions.push({ id: "equip", label: "Надеть", execute: () => result(() => operations.equip(item), "Предмет экипирован.") })
  }
  actions.push({ id: "quick", label: "Быстрый доступ", kind: "branch", children: [
    ...[1, 2, 3, 4, 5].map((slot): SnakeAction => ({
      id: `quick-${slot}`, label: `Слот ${slot}`,
      execute: () => result(() => operations.quick(item, slot), `Предмет назначен в слот ${slot}.`),
    })),
    ...(item.item_state?.quick_slot ? [{ id: "quick-clear", label: "Убрать из быстрого доступа",
      execute: () => result(() => operations.quick(item, null), "Быстрый доступ очищен.") } satisfies SnakeAction] : []),
  ] })
  const targets = inventorySimpleContainerTargets(items, item).filter((target) => !target.full)
  if (!item.equipped) {
    actions.push({ id: "move", label: "Переместить", kind: "branch", children: [
      { id: "carry", label: "При себе", execute: () => result(() => operations.move(item, null), "Предмет переложен.") },
      ...targets.filter((target) => target.container.id !== item.holder_item_id).map((target): SnakeAction => ({
        id: `bag-${target.container.id}`, label: target.container.name,
        execute: () => result(() => operations.move(item, target.container.id), "Предмет переложен."),
      })),
    ] })
  } else if (targets.length) {
    actions.push({ id: "unequip", label: "Снять в сумку", kind: "branch", children:
      targets.map((target): SnakeAction => ({ id: `unequip-${target.container.id}`, label: target.container.name,
        execute: () => result(() => operations.move(item, target.container.id), "Предмет снят в сумку.") })) })
  }
  return actions
}
