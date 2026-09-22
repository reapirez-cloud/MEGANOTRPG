import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import {
  inventoryPhysicalProfile,
  inventorySimpleChildren,
  inventorySimpleContainerCapacity,
  inventorySimpleContainerTargets,
  inventorySimpleContainerUsage,
} from "../inventory-engine"
import type { InventoryItem } from "../types/characterSheet"
import "./inventory-simple.css"

type Result = { ok: boolean; error?: string }

type Props = {
  items: InventoryItem[]
  canControl: boolean
  focusedItemId?: string | null
  onMove: (item: InventoryItem, holderItemId: string | null) => Promise<Result>
  onQuickAccess: (item: InventoryItem, enabled: boolean) => Promise<Result>
  onSwap: (first: InventoryItem, second: InventoryItem) => Promise<Result>
  onEquip: (item: InventoryItem) => Promise<Result>
  onUse: (item: InventoryItem, amount?: number) => Promise<Result>
}

type InventoryGlyphKind =
  | "bag"
  | "backpack"
  | "pouch"
  | "chest"
  | "equipment"
  | "consumable"
  | "book"
  | "currency"
  | "material"
  | "generic"

function semanticRole(item: InventoryItem) {
  const profile = inventoryPhysicalProfile(item)
  return profile.semantic_role || ""
}

function glyphKind(item: InventoryItem): InventoryGlyphKind {
  const role = semanticRole(item)

  if (item.category === "container") {
    if (/backpack/i.test(role)) return "backpack"
    if (/purse|pouch/i.test(role)) return "pouch"
    if (/chest/i.test(role)) return "chest"
    return "bag"
  }
  if (item.category === "equipment") return "equipment"
  if (item.category === "consumable") return "consumable"
  if (item.category === "book") return "book"
  if (item.category === "currency") return "currency"
  if (item.category === "material") return "material"
  return "generic"
}

function InventoryGlyph({ kind }: { kind: InventoryGlyphKind }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.45,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  }

  if (kind === "backpack") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path {...common} d="M16 15.5v-2.8c0-5 3.3-8.2 8-8.2s8 3.2 8 8.2v2.8" />
        <path {...common} d="M11.5 19.5c0-3.2 2.6-5.8 5.8-5.8h13.4c3.2 0 5.8 2.6 5.8 5.8v20H11.5z" />
        <path {...common} d="M15.5 25h17M16.5 31h15v7.5h-15zM11.5 23H8.8v12h2.7M36.5 23h2.7v12h-2.7" />
        <path fill="currentColor" opacity=".08" d="M13 20h22v18H13z" />
      </svg>
    )
  }

  if (kind === "pouch") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path {...common} d="M16 10h16l-2.6 8.2c5 3 7.6 7.1 7.6 12.4 0 8.2-5.4 12.4-13 12.4S11 38.8 11 30.6c0-5.3 2.6-9.4 7.6-12.4z" />
        <path {...common} d="M17 18.2h14M20 10l1.2 8.2M28 10l-1.2 8.2M18.5 25.5c3.5 1.2 7.5 1.2 11 0" />
        <path fill="currentColor" opacity=".07" d="M14 27c1.2-4 4.6-6.5 10-6.5S32.8 23 34 27v8.5c-2.2 3.7-5.5 5.5-10 5.5s-7.8-1.8-10-5.5z" />
      </svg>
    )
  }

  if (kind === "chest") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path {...common} d="M7 21h34v20H7zM8 21c0-7 5.7-12 12.7-12h6.6C34.3 9 40 14 40 21" />
        <path {...common} d="M7 27h34M20.5 25h7v8h-7zM24 33v4" />
        <path fill="currentColor" opacity=".08" d="M9 29h30v10H9z" />
      </svg>
    )
  }

  if (kind === "bag") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path {...common} d="M13 17.5h22l3.2 23H9.8z" />
        <path {...common} d="M17 17.5v-3.2c0-4 3.1-7.3 7-7.3s7 3.3 7 7.3v3.2M12 25h24M18 29.5h12" />
        <path fill="currentColor" opacity=".08" d="M12 27h24l1.5 11H10.5z" />
      </svg>
    )
  }

  if (kind === "equipment") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path {...common} d="m24 6 5 5 7-1 4 7-4 6 1.5 8.5L24 43 10.5 31.5 12 23l-4-6 4-7 7 1z" />
        <path {...common} d="M18 14.5 24 18l6-3.5M24 18v19M16 25h16" />
        <path fill="currentColor" opacity=".07" d="m24 20 10-5 3 4-3 5 1 6-11 10z" />
      </svg>
    )
  }

  if (kind === "consumable") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path {...common} d="M19 6h10v6l-2 3v4c5.5 1.6 9 6.1 9 12.3C36 38.7 31.2 43 24 43s-12-4.3-12-11.7c0-6.2 3.5-10.7 9-12.3v-4l-2-3z" />
        <path {...common} d="M18 27c4 1.4 8 1.4 12 0M18 11h12" />
        <path fill="currentColor" opacity=".1" d="M14.5 30c3.2 1.5 6.3 2.2 9.5 2.2s6.3-.7 9.5-2.2v3.5C33.5 38.2 30 41 24 41s-9.5-2.8-9.5-7.5z" />
      </svg>
    )
  }

  if (kind === "book") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path {...common} d="M7 9.5h14c2 0 3 1 3 3v29c0-2-1-3-3-3H7zM41 9.5H27c-2 0-3 1-3 3v29c0-2 1-3 3-3h14z" />
        <path {...common} d="M11 16h8M11 21h8M29 16h8M29 21h8" />
        <path fill="currentColor" opacity=".06" d="M9 12h12v24H9zM27 12h12v24H27z" />
      </svg>
    )
  }

  if (kind === "currency") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <ellipse {...common} cx="19" cy="17" rx="11" ry="5" />
        <path {...common} d="M8 17v7c0 2.8 4.9 5 11 5s11-2.2 11-5v-7M11 27v6c0 2.8 4.9 5 11 5s11-2.2 11-5v-8" />
        <path {...common} d="M27 28c7.2 0 13-2.2 13-5s-5.8-5-13-5" />
        <path fill="currentColor" opacity=".08" d="M10 18c2.1 1.5 5 2.2 9 2.2s6.9-.7 9-2.2v5c-2.2 1.5-5.2 2.2-9 2.2s-6.8-.7-9-2.2z" />
      </svg>
    )
  }

  if (kind === "material") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path {...common} d="m24 6 7 8 8 4-3 10 1 9-10 5-10-3-8-7 3-9-1-8z" />
        <path {...common} d="m12 23 9 2 3-19M21 25l6 17M21 25l18-7M21 25l-4 14" />
        <path fill="currentColor" opacity=".08" d="m22 27 13-6-2 7 1 7-7 4z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path {...common} d="M24 6 39 15v18L24 42 9 33V15zM9 15l15 9 15-9M24 24v18" />
      <path fill="currentColor" opacity=".07" d="m12 17 12 7v14l-12-7z" />
    </svg>
  )
}

function categoryLabel(item: InventoryItem) {
  const labels: Record<string, string> = {
    equipment: "Экипировка",
    consumable: "Расходник",
    tool: "Инструмент",
    book: "Книга",
    trinket: "Безделушка",
    quest: "Квестовый",
    material: "Материал",
    currency: "Валюта",
    container: "Сумка",
    other: "Предмет",
  }
  return labels[item.category] || "Предмет"
}

function weightLabel(item: InventoryItem) {
  if (item.weight == null || !Number.isFinite(Number(item.weight))) return "вес неизвестен"
  const total = Number(item.weight) * Math.max(1, Number(item.quantity || 1))
  return total.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " кг"
}

function itemMeta(item: InventoryItem) {
  const chunks = [categoryLabel(item), weightLabel(item)]
  if (item.stack_mode === "stack" && item.quantity > 1) chunks.unshift(item.quantity + " шт.")
  if (item.usage_mode === "charges" && item.charges_max) {
    chunks.unshift((item.charges_current ?? 0) + "/" + item.charges_max + " зарядов")
  }
  return chunks.join(" · ")
}


const EQUIPMENT_SLOTS: Array<{
  key: Exclude<InventoryItem["equipment_slot"], null>
  label: string
}> = [
  { key: "head", label: "Голова" },
  { key: "neck", label: "Шея" },
  { key: "shoulders", label: "Плечи" },
  { key: "chest", label: "Корпус" },
  { key: "back", label: "Спина" },
  { key: "hands", label: "Кисти" },
  { key: "wrists", label: "Запястья" },
  { key: "waist", label: "Пояс" },
  { key: "legs", label: "Ноги" },
  { key: "feet", label: "Ступни" },
  { key: "main_hand", label: "Основная рука" },
  { key: "off_hand", label: "Вторая рука" },
  { key: "two_hands", label: "Две руки" },
  { key: "ring_left", label: "Кольцо I" },
  { key: "ring_right", label: "Кольцо II" },
  { key: "ammo", label: "Боеприпасы" },
  { key: "other", label: "Прочее" },
]

function hasQuickAccess(item: InventoryItem) {
  return item.item_state?.quick_access === true
}

function simplePlacement(item: InventoryItem) {
  return item.placement_kind || (item.holder_item_id ? "legacy" : "root")
}

export default function InventorySimpleView({
  items,
  canControl,
  focusedItemId,
  onMove,
  onQuickAccess,
  onSwap,
  onEquip,
  onUse,
}: Props) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(focusedItemId || null)
  const [targetHolderId, setTargetHolderId] = useState("")
  const [dragItemId, setDragItemId] = useState<string | null>(null)
  const pointerDragRef = useRef<{
    pointerId: number
    itemId: string
    startX: number
    startY: number
    active: boolean
  } | null>(null)
  const suppressClickUntilRef = useRef(0)
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const selectedItem = selectedItemId
    ? items.find((item) => item.id === selectedItemId) || null
    : null

  const bags = useMemo(
    () => items
      .filter((item) => item.category === "container" && !item.equipped)
      .slice()
      .sort((left, right) => {
        const order = Number(left.sort_order || 0) - Number(right.sort_order || 0)
        return order || left.name.localeCompare(right.name, "ru")
      }),
    [items],
  )

  const rootLooseItems = useMemo(
    () => inventorySimpleChildren(items, null).filter((item) => {
      const placement = simplePlacement(item)
      return (
        item.category !== "container" &&
        placement !== "hand" &&
        placement !== "external"
      )
    }),
    [items],
  )

  const equippedBySlot = useMemo(() => {
    const map = new Map<string, InventoryItem>()
    for (const item of items) {
      if (item.equipped && item.equipment_slot && !map.has(item.equipment_slot)) {
        map.set(item.equipment_slot, item)
      }
    }
    return map
  }, [items])

  const quickItem = useMemo(
    () => items.find((item) => hasQuickAccess(item)) || null,
    [items],
  )

  const targets = useMemo(
    () => selectedItem ? inventorySimpleContainerTargets(items, selectedItem) : [],
    [items, selectedItem],
  )

  useEffect(() => {
    if (!focusedItemId) return
    if (items.some((item) => item.id === focusedItemId)) {
      setSelectedItemId(focusedItemId)
    }
  }, [focusedItemId, items])

  useEffect(() => {
    if (!selectedItem) {
      setTargetHolderId("")
      return
    }
    const firstAvailable = targets.find((entry) => !entry.full)
    setTargetHolderId(
      selectedItem.holder_item_id
        ? ""
        : firstAvailable?.container.id || "",
    )
  }, [selectedItem?.id, selectedItem?.holder_item_id, targets])

  async function run(
    key: string,
    task: () => Promise<Result>,
    successMessage: string,
  ) {
    if (busy) return
    setBusy(key)
    setMessage("")
    setError("")
    const result = await task()
    setBusy("")
    setDragItemId(null)
    if (!result.ok) {
      setError(result.error || "Действие не выполнено.")
      return
    }
    setMessage(successMessage)
  }

  function selectItem(item: InventoryItem) {
    setSelectedItemId(item.id)
    setMessage("")
    setError("")
  }

  function draggedItem() {
    return dragItemId
      ? items.find((item) => item.id === dragItemId) || null
      : null
  }

  function moveToHolder(item: InventoryItem, holderItemId: string | null) {
    if (item.equipped && holderItemId === null) {
      setError("Экипированный предмет можно снять только в реальную сумку.")
      setDragItemId(null)
      return
    }
    if (
      (item.holder_item_id ?? null) === holderItemId &&
      simplePlacement(item) !== "hand"
    ) {
      setDragItemId(null)
      return
    }
    void run(
      "move:" + item.id,
      () => onMove(item, holderItemId),
      holderItemId ? "Предмет переложен в сумку." : "Предмет переложен при себе.",
    )
  }

  function swapWith(item: InventoryItem, target: InventoryItem) {
    if (
      item.id === target.id ||
      item.equipped ||
      target.equipped ||
      item.category === "container" ||
      target.category === "container"
    ) {
      setDragItemId(null)
      return
    }
    void run(
      "swap:" + item.id,
      () => onSwap(item, target),
      "Предметы поменяны местами.",
    )
  }

  function setQuickAccess(item: InventoryItem, enabled: boolean) {
    void run(
      "quick:" + item.id,
      () => onQuickAccess(item, enabled),
      enabled
        ? "Предмет добавлен в быстрый доступ."
        : "Предмет убран из быстрого доступа.",
    )
  }

  function equipInto(
    item: InventoryItem,
    slot: Exclude<InventoryItem["equipment_slot"], null>,
    occupant: InventoryItem | undefined,
  ) {
    if (
      occupant ||
      item.category !== "equipment" ||
      item.equipment_slot !== slot ||
      item.equipped
    ) {
      setDragItemId(null)
      return
    }
    void run(
      "equip:" + item.id,
      () => onEquip(item),
      "Предмет экипирован.",
    )
  }

  function beginPointerDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    item: InventoryItem,
  ) {
    if (
      !canControl ||
      event.pointerType === "mouse" ||
      event.isPrimary === false
    ) {
      return
    }

    pointerDragRef.current = {
      pointerId: event.pointerId,
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function movePointerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = pointerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const distance = Math.hypot(
      event.clientX - drag.startX,
      event.clientY - drag.startY,
    )
    if (!drag.active && distance >= 8) {
      drag.active = true
      setDragItemId(drag.itemId)
    }
    if (drag.active) event.preventDefault()
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = pointerDragRef.current
    pointerDragRef.current = null
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.active) {
      setDragItemId(null)
      return
    }

    suppressClickUntilRef.current = performance.now() + 360
    event.preventDefault()

    const item = items.find((candidate) => candidate.id === drag.itemId)
    const target = document.elementFromPoint(event.clientX, event.clientY)
    if (!item || !(target instanceof Element)) {
      setDragItemId(null)
      return
    }

    const itemDrop = target.closest<HTMLElement>("[data-simple-drop-item]")
    const targetItemId = itemDrop?.dataset.simpleDropItem
    if (targetItemId && targetItemId !== item.id) {
      const targetItem = items.find((candidate) => candidate.id === targetItemId)
      if (targetItem) {
        swapWith(item, targetItem)
        return
      }
    }

    const quickDrop = target.closest<HTMLElement>("[data-simple-drop-quick]")
    if (quickDrop) {
      setQuickAccess(item, true)
      return
    }

    const equipmentDrop = target.closest<HTMLElement>("[data-simple-drop-equipment]")
    if (equipmentDrop?.dataset.simpleDropEquipment) {
      const slot = equipmentDrop.dataset.simpleDropEquipment as Exclude<
        InventoryItem["equipment_slot"],
        null
      >
      equipInto(item, slot, equippedBySlot.get(slot))
      return
    }

    const holderDrop = target.closest<HTMLElement>("[data-simple-drop-holder]")
    if (holderDrop?.dataset.simpleDropHolder) {
      moveToHolder(item, holderDrop.dataset.simpleDropHolder)
      return
    }

    if (target.closest("[data-simple-drop-root]")) {
      moveToHolder(item, null)
      return
    }

    setDragItemId(null)
  }

  function cancelPointerDrag() {
    pointerDragRef.current = null
    setDragItemId(null)
  }

  function beginDrag(
    event: ReactDragEvent<HTMLButtonElement>,
    item: InventoryItem,
  ) {
    if (!canControl) {
      event.preventDefault()
      return
    }
    setDragItemId(item.id)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", item.id)
  }

  function allowDrop(event: ReactDragEvent<HTMLElement>) {
    if (!canControl) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }

  function dropIntoHolder(
    event: ReactDragEvent<HTMLElement>,
    holderItemId: string | null,
  ) {
    event.preventDefault()
    event.stopPropagation()
    const item = draggedItem()
    if (!item) return
    moveToHolder(item, holderItemId)
  }

  function dropOnItem(
    event: ReactDragEvent<HTMLElement>,
    target: InventoryItem,
  ) {
    event.preventDefault()
    event.stopPropagation()
    const item = draggedItem()
    if (!item) return
    swapWith(item, target)
  }

  function dropQuick(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    const item = draggedItem()
    if (!item) return
    setQuickAccess(item, true)
  }

  function dropEquipment(
    event: ReactDragEvent<HTMLElement>,
    slot: Exclude<InventoryItem["equipment_slot"], null>,
    occupant: InventoryItem | undefined,
  ) {
    event.preventDefault()
    event.stopPropagation()
    const item = draggedItem()
    if (!item) return
    equipInto(item, slot, occupant)
  }

  function itemSlot(
    item: InventoryItem,
    compact = false,
    acceptsItemDrop = true,
  ) {
    return (
      <button
        type="button"
        className="u1-simple-inventory__slot u1-simple-inventory__slot--filled"
        key={item.id}
        data-selected={selectedItemId === item.id || undefined}
        data-dragging={dragItemId === item.id || undefined}
        data-compact={compact || undefined}
        data-simple-drop-item={acceptsItemDrop ? item.id : undefined}
        draggable={canControl}
        onDragStart={(event) => beginDrag(event, item)}
        onDragEnd={() => setDragItemId(null)}
        onPointerDown={(event) => beginPointerDrag(event, item)}
        onPointerMove={movePointerDrag}
        onPointerUp={finishPointerDrag}
        onPointerCancel={cancelPointerDrag}
        onDragOver={acceptsItemDrop ? allowDrop : undefined}
        onDrop={acceptsItemDrop ? (event) => dropOnItem(event, item) : undefined}
        onClick={() => {
          if (performance.now() < suppressClickUntilRef.current) return
          selectItem(item)
        }}
        aria-label={item.name}
      >
        <span className="u1-simple-inventory__slot-icon">
          {item.image_url ? (
            <img src={item.image_url} alt="" loading="lazy" />
          ) : (
            <InventoryGlyph kind={glyphKind(item)} />
          )}
        </span>
        <strong>{item.name}</strong>
        {item.stack_mode === "stack" && item.quantity > 1 ? (
          <b className="u1-simple-inventory__quantity">{item.quantity}</b>
        ) : null}
        {item.category === "container" ? (
          <i className="u1-simple-inventory__nested-mark" aria-label="Контейнер">↳</i>
        ) : null}
      </button>
    )
  }

  function emptySlot(key: string) {
    return (
      <div
        className="u1-simple-inventory__slot u1-simple-inventory__slot--empty"
        aria-hidden="true"
        key={key}
      >
        <InventoryGlyph kind="generic" />
      </div>
    )
  }

  return (
    <div
      className="u1-simple-inventory"
      data-simple-inventory="v2"
      data-dragging={Boolean(dragItemId) || undefined}
    >
      <section className="u1-simple-inventory__equipment" aria-label="Инвентарь — экипировка">
        <header>
          <div>
            <span>ИНВЕНТАРЬ</span>
            <strong>Экипировка</strong>
          </div>
          <small>{items.filter((item) => item.equipped).length} экипировано</small>
        </header>

        <div className="u1-simple-inventory__equipment-grid">
          {EQUIPMENT_SLOTS.map((slot) => {
            const item = equippedBySlot.get(slot.key)
            return (
              <div
                className="u1-simple-inventory__equipment-slot"
                data-empty={!item || undefined}
                data-equipment-slot={slot.key}
                data-simple-drop-equipment={slot.key}
                key={slot.key}
                onDragOver={allowDrop}
                onDrop={(event) => dropEquipment(event, slot.key, item)}
              >
                <span>{slot.label}</span>
                {item ? itemSlot(item, true) : (
                  <div className="u1-simple-inventory__equipment-empty">
                    <InventoryGlyph kind="equipment" />
                    <small>Не экипировано</small>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="u1-simple-inventory__quick">
          <header>
            <div>
              <span>БЫСТРЫЙ ДОСТУП</span>
              <small>Можно положить любой предмет</small>
            </div>
          </header>
          <div className="u1-simple-inventory__quick-grid">
            <div
              className="u1-simple-inventory__quick-slot"
              data-empty={!quickItem || undefined}
              data-simple-drop-quick="true"
              onDragOver={allowDrop}
              onDrop={dropQuick}
            >
              <span>Быстрый доступ</span>
              {quickItem ? itemSlot(quickItem, true, false) : (
                <div className="u1-simple-inventory__quick-empty">
                  <b>+</b>
                  <small>Перетащи сюда любой предмет</small>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="u1-simple-inventory__bags" aria-label="Сумки">
        <header>
          <div>
            <span>КОНТЕЙНЕРЫ</span>
            <strong>Сумки</strong>
          </div>
          <small>{bags.length} шт.</small>
        </header>

        {bags.length ? (
          <div className="u1-simple-inventory__bag-stack">
            {bags.map((bag) => {
              const children = inventorySimpleChildren(items, bag.id)
              const capacity = inventorySimpleContainerCapacity(bag)
              const usage = inventorySimpleContainerUsage(items, bag.id)
              const emptyCount = Math.max(0, capacity - children.length)

              return (
                <section
                  className="u1-simple-inventory__bag-panel"
                  key={bag.id}
                  data-bag-id={bag.id}
                  data-simple-drop-holder={bag.id}
                  onDragOver={allowDrop}
                  onDrop={(event) => dropIntoHolder(event, bag.id)}
                >
                  <header>
                    <span className="u1-simple-inventory__bag-icon">
                      <InventoryGlyph kind={glyphKind(bag)} />
                    </span>
                    <div>
                      <strong>{bag.name}</strong>
                      <small>{usage.used} / {usage.capacity} ячеек</small>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectItem(bag)}
                      aria-label={"Открыть описание: " + bag.name}
                    >
                      ⋯
                    </button>
                  </header>
                  <div className="u1-simple-inventory__slots">
                    {children.map((item) => itemSlot(item))}
                    {Array.from({ length: emptyCount }, (_, index) =>
                      emptySlot(bag.id + ":empty:" + index)
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="u1-simple-inventory__empty-note">
            Сумок пока нет.
          </div>
        )}
      </section>

      <section
        className="u1-simple-inventory__contents"
        data-simple-drop-root="true"
        onDragOver={allowDrop}
        onDrop={(event) => dropIntoHolder(event, null)}
      >
        <header className="u1-simple-inventory__contents-head">
          <div>
            <span className="u1-simple-inventory__contents-glyph" aria-hidden="true">◇</span>
            <div>
              <span>ПРИ СЕБЕ</span>
              <strong>Без сумки</strong>
            </div>
          </div>
          <small>{rootLooseItems.length} предметов</small>
        </header>

        {rootLooseItems.length ? (
          <div className="u1-simple-inventory__slots u1-simple-inventory__slots--root">
            {rootLooseItems.map((item) => itemSlot(item))}
          </div>
        ) : (
          <div className="u1-simple-inventory__empty-note">
            Здесь пусто. Предметы можно перетаскивать между сумками и этой областью.
          </div>
        )}
      </section>

      {selectedItem ? (
        <section className="u1-simple-inventory__detail" aria-label="Выбранный предмет">
          <div className="u1-simple-inventory__detail-main">
            <span className="u1-simple-inventory__detail-icon">
              {selectedItem.image_url ? (
                <img src={selectedItem.image_url} alt="" />
              ) : (
                <InventoryGlyph kind={glyphKind(selectedItem)} />
              )}
            </span>
            <div>
              <small>{categoryLabel(selectedItem)}</small>
              <strong>{selectedItem.name}</strong>
              <p>{itemMeta(selectedItem)}</p>
            </div>
          </div>

          {selectedItem.description.trim() ? (
            <p className="u1-simple-inventory__description">
              {selectedItem.description}
            </p>
          ) : null}

          {canControl ? (
            <div className="u1-simple-inventory__quick-actions">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => setQuickAccess(selectedItem, !hasQuickAccess(selectedItem))}
              >
                {hasQuickAccess(selectedItem)
                  ? "Убрать из быстрого доступа"
                  : "В быстрый доступ"}
              </button>
            </div>
          ) : null}

          {canControl && !selectedItem.equipped ? (
            <div className="u1-simple-inventory__actions">
              <label>
                <span>Переложить без перетаскивания</span>
                <select
                  value={targetHolderId}
                  onChange={(event) => setTargetHolderId(event.target.value)}
                >
                  <option value="">При себе</option>
                  {targets.map((entry) => (
                    <option
                      value={entry.container.id}
                      disabled={entry.full}
                      key={entry.container.id}
                    >
                      {entry.container.name} · {entry.used}/{entry.capacity}
                      {entry.full ? " · заполнена" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="u1-simple-inventory__action-row">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void run(
                    "move",
                    () => onMove(selectedItem, targetHolderId || null),
                    "Предмет переложен.",
                  )}
                >
                  {busy === "move" ? "Перекладываем…" : "Переложить"}
                </button>

                {selectedItem.category === "equipment" ? (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void run(
                      "equip",
                      () => onEquip(selectedItem),
                      "Предмет экипирован.",
                    )}
                  >
                    {busy === "equip" ? "…" : "Экипировать"}
                  </button>
                ) : null}

                {(selectedItem.usage_mode !== "none" ||
                  selectedItem.category === "consumable") ? (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void run(
                      "use",
                      () => onUse(selectedItem, 1),
                      "Предмет использован.",
                    )}
                  >
                    {busy === "use" ? "…" : "Использовать"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {message ? <div className="u1-simple-inventory__notice">{message}</div> : null}
          {error ? <div className="u1-simple-inventory__error">{error}</div> : null}
        </section>
      ) : error ? (
        <div className="u1-simple-inventory__error">{error}</div>
      ) : null}
    </div>
  )
}
