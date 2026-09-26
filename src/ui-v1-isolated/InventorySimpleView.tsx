import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from "react"
import { inventorySimpleChildren, inventorySimpleContainerCapacity, inventorySimpleContainerTargets, inventorySimpleContainerUsage } from "../inventory-engine"
import type { InventoryItem } from "../types/characterSheet"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import { inventoryItemActions, inventoryItemDetail } from "./inventorySnakeActions"
import "./inventory-simple.css"

type Result = { ok: boolean; error?: string }
type Props = {
  items: InventoryItem[]; canControl: boolean; focusedItemId?: string | null
  onMove: (item: InventoryItem, holder: string | null) => Promise<Result>
  onPlaceHand: (item: InventoryItem, index: 0 | 1) => Promise<Result>
  onQuickAccess: (item: InventoryItem, slot: number | null) => Promise<Result>
  onSwap: (first: InventoryItem, second: InventoryItem) => Promise<Result>
  onEquip: (item: InventoryItem, slot?: InventoryItem["equipment_slot"]) => Promise<Result>
  onUse: (item: InventoryItem, amount?: number) => Promise<Result>
}
function semanticRole(item: InventoryItem) {
  return String(item.inventory_profile?.semantic_role || "")
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


const EQUIPMENT_SLOTS: { key: NonNullable<InventoryItem["equipment_slot"]>; label: string }[] = [
  { key: "main_hand", label: "Оружие" }, { key: "off_hand", label: "Вторая рука" },
  { key: "head", label: "Голова" }, { key: "chest", label: "Броня" },
  { key: "hands", label: "Перчатки" }, { key: "feet", label: "Обувь" },
  { key: "neck", label: "Амулет" }, { key: "ring_left", label: "Кольцо I" },
  { key: "ring_right", label: "Кольцо II" }, { key: "shoulders", label: "Плечи" },
  { key: "back", label: "Спина" }, { key: "wrists", label: "Запястья" },
  { key: "waist", label: "Пояс" }, { key: "legs", label: "Ноги" },
  { key: "two_hands", label: "Две руки" }, { key: "ammo", label: "Боеприпасы" },
  { key: "other", label: "Прочее" },
]
const FILTERS = ["Все", "Оружие", "Расходники", "Еда", "Материалы", "Прочее"] as const
function itemWeight(item: InventoryItem) {
  return item.weight == null ? "—" : `${(Number(item.weight) * item.quantity).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`
}
function itemFilter(item: InventoryItem, filter: typeof FILTERS[number]) {
  if (filter === "Все") return true
  if (filter === "Оружие") return item.category === "equipment"
  if (filter === "Расходники") return item.category === "consumable"
  if (filter === "Еда") return /food|meal|ration/i.test(semanticRole(item))
  if (filter === "Материалы") return item.category === "material"
  return !["equipment", "consumable", "material"].includes(item.category)
}

export default function InventorySimpleView({ items, canControl, focusedItemId, onMove, onPlaceHand, onQuickAccess, onSwap, onEquip, onUse }: Props) {
  const snake = useSnake()
  const [activeBagId, setActiveBagId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<typeof FILTERS[number]>("Все")
  const [equipmentExpanded, setEquipmentExpanded] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const dragRef = useRef<{ id: string; pointerId: number; x: number; y: number; active: boolean } | null>(null)
  const suppressClick = useRef(0)
  const pending = useRef(false)
  const bags = useMemo(() => items.filter((item) => item.category === "container" && !item.equipped)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ru")), [items])
  useEffect(() => {
    if (activeBagId && !bags.some((bag) => bag.id === activeBagId)) setActiveBagId(null)
  }, [activeBagId, bags])
  const quick = Array.from({ length: 5 }, (_, i) => items.find((item) => Number(item.item_state?.quick_slot) === i + 1) ||
    (i === 0 ? items.find((item) => item.item_state?.quick_access === true) : undefined))
  const equipment = new Map(items.filter((item) => item.equipped && item.equipment_slot).map((item) => [item.equipment_slot, item]))
  const currentBag = bags.find((bag) => bag.id === activeBagId) || null
  const unplaced = items.filter((item) => !item.equipped && !item.holder_item_id &&
    item.placement_kind !== "hand" && item.placement_kind !== "external" && item.category !== "container")
  const visibleItems = (currentBag ? inventorySimpleChildren(items, currentBag.id) :
    items.filter((item) => !item.equipped && (item.placement_kind === "hand" || item.placement_kind === "external")))
    .filter((item) => itemFilter(item, filter) && item.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")))
  const totalWeight = items.reduce((total, item) => total + (item.weight == null ? 0 : Number(item.weight) * item.quantity), 0)
  const operations = { move: onMove, placeHand: onPlaceHand, quick: onQuickAccess, equip: onEquip, use: onUse }
  function actions(item: InventoryItem) {
    return inventoryItemActions(item, items, canControl, operations, setActiveBagId)
  }
  function inspect(item: InventoryItem) { snake.openSurface(inventoryItemDetail(item), { entity: { type: "inventory-item", id: item.id } }) }
  function openActions(item: InventoryItem, element: HTMLElement) {
    const rect = element.getBoundingClientRect()
    snake.openMenu({ entity: { type: "inventory-item", id: item.id }, actions: actions(item),
      title: item.name, point: { x: rect.right - 12, y: rect.top + rect.height / 2 } })
  }
  async function commit(task: () => Promise<Result>) {
    if (pending.current) return
    pending.current = true
    setError("")
    try {
      const result = await task()
      if (!result.ok) setError(result.error || "Действие не выполнено.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Действие не выполнено.")
    } finally {
      pending.current = false
      setDragId(null)
    }
  }
  function drop(id: string, element: Element | null) {
    const item = items.find((entry) => entry.id === id)
    if (!item || !element) { setDragId(null); return }
    const quickTarget = element.closest<HTMLElement>("[data-quick-slot]")
    if (quickTarget) {
      void commit(() => onQuickAccess(item, Number(quickTarget.dataset.quickSlot)))
      return
    }
    const equipmentTarget = element.closest<HTMLElement>("[data-equip-slot]")
    if (equipmentTarget) {
      const slot = equipmentTarget.dataset.equipSlot as InventoryItem["equipment_slot"]
      if (!item.equipped && item.category === "equipment" &&
        (!item.equipment_slot || item.equipment_slot === slot) && slot &&
        !equipment.has(slot)) void commit(() => onEquip(item, slot))
      else setDragId(null)
      return
    }
    const bagTarget = element.closest<HTMLElement>("[data-bag-target]")
    if (bagTarget?.dataset.bagTarget) { void commit(() => onMove(item, bagTarget.dataset.bagTarget!)); return }
    const handTarget = element.closest<HTMLElement>("[data-hand-target]")
    if (handTarget) { void commit(() => onPlaceHand(item, Number(handTarget.dataset.handTarget) as 0 | 1)); return }
    const other = element.closest<HTMLElement>("[data-item-id]")
    if (other?.dataset.itemId && other.dataset.itemId !== id) {
      const target = items.find((entry) => entry.id === other.dataset.itemId)
      if (target && !item.equipped && !target.equipped && item.category !== "container" && target.category !== "container") {
        void commit(() => onSwap(item, target)); return
      }
    }
    setDragId(null)
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>, item: InventoryItem) {
    if (!canControl || event.pointerType === "mouse") return
    dragRef.current = { id: item.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const state = dragRef.current
    if (!state || state.pointerId !== event.pointerId) return
    if (!state.active && Math.hypot(event.clientX - state.x, event.clientY - state.y) > 12) {
      state.active = true; setDragId(state.id)
    }
    if (state.active) event.preventDefault()
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const state = dragRef.current; dragRef.current = null
    if (!state || !state.active) return
    suppressClick.current = performance.now() + 500
    event.preventDefault()
    drop(state.id, document.elementFromPoint(event.clientX, event.clientY))
  }
  function dragStart(event: DragEvent<HTMLButtonElement>, item: InventoryItem) {
    if (!canControl) { event.preventDefault(); return }
    setDragId(item.id); event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.effectAllowed = "move"
  }
  function dragOver(event: DragEvent<HTMLElement>) { if (canControl) event.preventDefault() }
  function nativeDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault(); event.stopPropagation()
    drop(event.dataTransfer.getData("text/plain") || dragId || "", event.target as Element)
  }
  function thumb(item: InventoryItem) {
    return item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <InventoryGlyph kind={glyphKind(item)} />
  }
  function itemRow(item: InventoryItem) {
    return <SnakeTrigger key={item.id} entity={{ type: "inventory-item", id: item.id }} actions={actions(item)}>
      <div className="u1-inventory__row" data-item-id={item.id} data-focused={item.id === focusedItemId || undefined}
        onDragOver={dragOver} onDrop={nativeDrop}>
        <button type="button" className="u1-inventory__row-main" draggable={canControl}
          onDragStart={(event) => dragStart(event, item)} onDragEnd={() => setDragId(null)}
          onPointerDown={(event) => pointerDown(event, item)} onPointerMove={pointerMove}
          onPointerUp={pointerUp} onPointerCancel={() => { dragRef.current = null; setDragId(null) }}
          onClick={() => { if (performance.now() >= suppressClick.current) inspect(item) }}>
          <span className="u1-inventory__thumb">{thumb(item)}</span>
          <span className="u1-inventory__row-text"><strong>{item.name}</strong><small>{item.description || item.category}</small></span>
          <span className="u1-inventory__row-count">{item.quantity > 1 ? `×${item.quantity}` : ""}<small>{itemWeight(item)}</small></span>
        </button>
        <button type="button" className="u1-inventory__more" aria-label={`Действия: ${item.name}`}
          onClick={(event) => { event.stopPropagation(); openActions(item, event.currentTarget) }}>⋮</button>
      </div>
    </SnakeTrigger>
  }
  return <div className="u1-inventory" data-simple-inventory="v3" data-dragging={Boolean(dragId) || undefined}>
    <div className="u1-inventory__heading"><h1>Инвентарь</h1><div><span>Общий вес: {totalWeight.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг</span><i /></div></div>
    <section className="u1-inventory__quick" aria-label="Быстрый доступ">
      {quick.map((item, index) => <div key={index} className="u1-inventory__quick-cell" data-quick-slot={index + 1}
        onDragOver={dragOver} onDrop={nativeDrop}>
        <span className="u1-inventory__quick-number">{index + 1}</span>
        {item ? <SnakeTrigger entity={{ type: "inventory-item", id: item.id }} actions={actions(item)}>
          <button type="button" title={item.name} onClick={(event) => {
            if (canControl && (item.category === "consumable" || item.usage_mode && item.usage_mode !== "none") && !item.equipped) {
              void commit(() => onUse(item, 1))
            } else openActions(item, event.currentTarget)
          }}>
            {thumb(item)}{item.quantity > 1 && <b>{item.quantity}</b>}
          </button></SnakeTrigger> : <span className="u1-inventory__quick-empty">+</span>}
      </div>)}
    </section>
    <section className="u1-inventory__gear" aria-label="Экипировка">
      <div className="u1-inventory__section-heading"><strong>Экипировка</strong>
        <button type="button" onClick={() => setEquipmentExpanded(!equipmentExpanded)}>
          {equipmentExpanded ? "Свернуть" : `Все слоты · ${EQUIPMENT_SLOTS.length}`}</button></div>
      <div className="u1-inventory__gear-grid">
        {(equipmentExpanded ? EQUIPMENT_SLOTS : EQUIPMENT_SLOTS.slice(0, 9)).map(({ key, label }) => {
          const item = equipment.get(key)
          return <div className="u1-inventory__gear-cell" key={key} data-equip-slot={key} onDragOver={dragOver} onDrop={nativeDrop}>
            {item ? <SnakeTrigger entity={{ type: "inventory-item", id: item.id }} actions={actions(item)}>
              <button type="button" onClick={() => inspect(item)} className="u1-inventory__gear-item">{thumb(item)}</button>
            </SnakeTrigger> : <span className="u1-inventory__gear-empty">◇</span>}
            <small>{label}</small>
          </div>
        })}
      </div>
    </section>
    <div className="u1-inventory__bags" aria-label="Руки">
      {([0, 1] as const).map((index) => <div key={index} data-hand-target={index}
        onDragOver={dragOver} onDrop={nativeDrop}>
        Рука {index + 1}: {items.find((item) => !item.equipped && item.placement_kind === "hand" && item.placement_index === index)?.name || "свободна"}
      </div>)}
    </div>
    <div className="u1-inventory__bags" aria-label="Сумки">
      <button type="button" className={!currentBag ? "is-active" : ""} data-bag-target=""
        onClick={() => setActiveBagId(null)}>Руки</button>
      {bags.map((bag) => <SnakeTrigger key={bag.id} entity={{ type: "inventory-item", id: bag.id }} actions={actions(bag)}>
        <button type="button" className={currentBag?.id === bag.id ? "is-active" : ""}
          data-bag-target={bag.id} onDragOver={dragOver} onDrop={nativeDrop} onClick={() => setActiveBagId(bag.id)}>
          <span className="u1-inventory__bag-icon">{thumb(bag)}</span>{bag.name}
          <small>{inventorySimpleContainerUsage(items, bag.id).used}/{inventorySimpleContainerCapacity(bag)}</small>
        </button></SnakeTrigger>)}
    </div>
    <div className="u1-inventory__search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск предметов" aria-label="Поиск предметов" />⌕</div>
    <div className="u1-inventory__filters">{FILTERS.map((entry) => <button type="button" key={entry}
      className={entry === filter ? "is-active" : ""} onClick={() => setFilter(entry)}>{entry}</button>)}</div>
    <section className="u1-inventory__list" aria-label="Предметы">
      <div className="u1-inventory__list-heading"><strong>{currentBag?.name || "Руки и крепления"}</strong><span>{visibleItems.length} предметов</span></div>
      {visibleItems.length ? visibleItems.map(itemRow) : <p className="u1-inventory__empty">Здесь нет предметов</p>}
    </section>
    {unplaced.length > 0 && <section className="u1-inventory__list" aria-label="Неразмещённые предметы">
      <div className="u1-inventory__list-heading"><strong>Неразмещённые старые предметы</strong><span>{unplaced.length}</span></div>
      <p className="u1-inventory__empty">Переложите в сумку или возьмите в свободную руку.</p>
      {unplaced.filter((item) => itemFilter(item, filter) && item.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))).map(itemRow)}
    </section>}
    {error && <div role="alert" className="u1-inventory__error">{error}</div>}
  </div>
}
