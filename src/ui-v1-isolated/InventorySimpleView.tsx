import { useEffect, useMemo, useState } from "react"

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

export default function InventorySimpleView({
  items,
  canControl,
  focusedItemId,
  onMove,
  onEquip,
  onUse,
}: Props) {
  const [activeHolderId, setActiveHolderId] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(focusedItemId || null)
  const [targetHolderId, setTargetHolderId] = useState("")
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const selectedItem = selectedItemId
    ? items.find((item) => item.id === selectedItemId) || null
    : null
  const activeHolder = activeHolderId
    ? items.find((item) => item.id === activeHolderId) || null
    : null

  const rootContainers = useMemo(
    () => inventorySimpleChildren(items, null)
      .filter((item) => item.category === "container"),
    [items],
  )
  const rootLooseItems = useMemo(
    () => inventorySimpleChildren(items, null)
      .filter((item) => item.category !== "container"),
    [items],
  )
  const equippedItems = useMemo(
    () => items.filter((item) => item.equipped),
    [items],
  )
  const activeChildren = useMemo(
    () => activeHolder ? inventorySimpleChildren(items, activeHolder.id) : [],
    [activeHolder, items],
  )
  const targets = useMemo(
    () => selectedItem ? inventorySimpleContainerTargets(items, selectedItem) : [],
    [items, selectedItem],
  )

  useEffect(() => {
    if (!focusedItemId) return
    const focused = items.find((item) => item.id === focusedItemId)
    if (!focused) return
    setSelectedItemId(focused.id)
    setActiveHolderId(focused.holder_item_id ?? null)
  }, [focusedItemId, items])

  useEffect(() => {
    if (!selectedItem) {
      setTargetHolderId("")
      return
    }

    const firstAvailable = targets.find((entry) => !entry.full)
    if (selectedItem.holder_item_id) {
      setTargetHolderId("")
    } else if (firstAvailable) {
      setTargetHolderId(firstAvailable.container.id)
    } else {
      setTargetHolderId("")
    }
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

  function itemSlot(item: InventoryItem) {
    return (
      <button
        type="button"
        className="u1-simple-inventory__slot u1-simple-inventory__slot--filled"
        key={item.id}
        data-selected={selectedItemId === item.id || undefined}
        onClick={() => selectItem(item)}
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

  function bagCard(container: InventoryItem) {
    const usage = inventorySimpleContainerUsage(items, container.id)
    const percentage = usage.capacity > 0
      ? Math.min(100, (usage.used / usage.capacity) * 100)
      : 100

    return (
      <button
        type="button"
        className="u1-simple-inventory__bag-card"
        data-active={activeHolderId === container.id || undefined}
        key={container.id}
        onClick={() => {
          setActiveHolderId(container.id)
          setSelectedItemId(container.id)
          setMessage("")
          setError("")
        }}
      >
        <span className="u1-simple-inventory__bag-icon">
          <InventoryGlyph kind={glyphKind(container)} />
        </span>
        <span className="u1-simple-inventory__bag-copy">
          <strong>{container.name}</strong>
          <small>{usage.used} / {usage.capacity} ячеек</small>
          <i aria-hidden="true">
            <b style={{ width: percentage + "%" }} />
          </i>
        </span>
        <span className="u1-simple-inventory__bag-arrow" aria-hidden="true">›</span>
      </button>
    )
  }

  const activeUsage = activeHolder
    ? inventorySimpleContainerUsage(items, activeHolder.id)
    : null
  const activeCapacity = activeHolder
    ? inventorySimpleContainerCapacity(activeHolder)
    : 0
  const emptySlots = activeHolder
    ? Math.max(0, activeCapacity - activeChildren.length)
    : 0
  const parentHolderId = activeHolder?.holder_item_id ?? null

  return (
    <div className="u1-simple-inventory" data-simple-inventory="v1">
      <section className="u1-simple-inventory__bags" aria-label="Сумки">
        <header>
          <div>
            <span>КОНТЕЙНЕРЫ</span>
            <strong>Сумки</strong>
          </div>
          <small>{rootContainers.length} шт.</small>
        </header>
        {rootContainers.length ? (
          <div className="u1-simple-inventory__bag-list">
            {rootContainers.map(bagCard)}
          </div>
        ) : (
          <div className="u1-simple-inventory__empty-note">
            Сумок пока нет. Свободные предметы остаются при персонаже.
          </div>
        )}
      </section>

      {equippedItems.length ? (
        <section className="u1-simple-inventory__equipment" aria-label="Экипировано">
          <header>
            <span>ЭКИПИРОВАНО</span>
            <small>{equippedItems.length}</small>
          </header>
          <div>{equippedItems.map(itemSlot)}</div>
        </section>
      ) : null}

      <section className="u1-simple-inventory__contents">
        <header className="u1-simple-inventory__contents-head">
          <div>
            {activeHolder ? (
              <button
                type="button"
                onClick={() => setActiveHolderId(parentHolderId)}
                aria-label="Назад к родительской сумке"
              >
                ←
              </button>
            ) : (
              <span className="u1-simple-inventory__contents-glyph" aria-hidden="true">◇</span>
            )}
            <div>
              <span>{activeHolder ? "ОТКРЫТАЯ СУМКА" : "ПРИ СЕБЕ"}</span>
              <strong>{activeHolder?.name || "Свободные предметы"}</strong>
            </div>
          </div>
          <small>
            {activeUsage
              ? activeUsage.used + " / " + activeUsage.capacity
              : rootLooseItems.length + " предметов"}
          </small>
        </header>

        {activeHolder ? (
          <div
            className="u1-simple-inventory__slots"
            aria-label={"Содержимое " + activeHolder.name}
          >
            {activeChildren.map(itemSlot)}
            {Array.from({ length: emptySlots }, (_, index) => (
              <div
                className="u1-simple-inventory__slot u1-simple-inventory__slot--empty"
                aria-hidden="true"
                key={"empty-" + index}
              >
                <InventoryGlyph kind="generic" />
              </div>
            ))}
          </div>
        ) : rootLooseItems.length ? (
          <div className="u1-simple-inventory__slots u1-simple-inventory__slots--root">
            {rootLooseItems.map(itemSlot)}
          </div>
        ) : (
          <div className="u1-simple-inventory__empty-note">
            Здесь пусто. Предметы можно переложить в сумку или оставить при себе.
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

          {selectedItem.category === "container" ? (
            <button
              type="button"
              className="u1-simple-inventory__open-bag"
              onClick={() => setActiveHolderId(selectedItem.id)}
            >
              <InventoryGlyph kind={glyphKind(selectedItem)} />
              <span>
                <strong>Открыть сумку</strong>
                <small>
                  {inventorySimpleContainerUsage(items, selectedItem.id).used}
                  {" / "}
                  {inventorySimpleContainerUsage(items, selectedItem.id).capacity}
                  {" ячеек"}
                </small>
              </span>
              <b aria-hidden="true">›</b>
            </button>
          ) : null}

          {canControl ? (
            <div className="u1-simple-inventory__actions">
              <label>
                <span>Переложить</span>
                <select
                  value={targetHolderId}
                  onChange={(event) => setTargetHolderId(event.target.value)}
                >
                  <option
                    value=""
                    disabled={!selectedItem.holder_item_id || selectedItem.equipped}
                  >
                    При себе
                  </option>
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
                  disabled={
                    Boolean(busy) ||
                    (targetHolderId === "" && !selectedItem.holder_item_id) ||
                    (targetHolderId !== "" &&
                      targets.find((entry) => entry.container.id === targetHolderId)?.full === true)
                  }
                  onClick={() => void run(
                    "move",
                    () => onMove(selectedItem, targetHolderId || null),
                    "Предмет переложен.",
                  )}
                >
                  {busy === "move" ? "Перекладываем…" : "Переложить"}
                </button>

                {selectedItem.category === "equipment" && !selectedItem.equipped ? (
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
      ) : null}
    </div>
  )
}
