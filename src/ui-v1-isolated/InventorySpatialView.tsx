import { useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

import type { SnakeAction } from "../snake-engine"
import type { InventoryItem } from "../types/characterSheet"
import {
  firstAvailableGridPlacement,
  inventoryExternalCarryCapacity,
  inventoryPhysicalProfile,
  inventoryPlacementKind,
  inventoryPlacementProblem,
  rotateInventoryShape,
  type InventoryPlacementTarget,
} from "../inventory-engine"
import { SnakeTrigger } from "./SnakeProvider"
import "./inventory-spatial.css"

const CELL_PX = 46
const DRAG_THRESHOLD = 7

type Result = { ok: boolean; error?: string }

type Props = {
  items: InventoryItem[]
  activeHolderId: string | null
  canControl: boolean
  actionsForItem: (item: InventoryItem) => SnakeAction[]
  onActiveHolderChange: (holderId: string | null) => void
  onOpenItem: (item: InventoryItem) => void
  onMove: (item: InventoryItem, target: InventoryPlacementTarget) => Promise<Result>
  onEquip: (item: InventoryItem) => Promise<Result>
}

type EquipmentTarget = { kind: "equipment" }
type DropTarget = InventoryPlacementTarget | EquipmentTarget

type DragState = {
  itemId: string
  pointerId: number
  startX: number
  startY: number
  clientX: number
  clientY: number
  grabCellX: number
  grabCellY: number
  moved: boolean
}

type DropHint = {
  target: DropTarget
  problem: string | null
}

function itemInPlacement(items: readonly InventoryItem[], kind: "hand" | "external", index: number) {
  return items.find((item) =>
    inventoryPlacementKind(item) === kind
    && item.placement_index === index
  ) || null
}

function compactItemLabel(item: InventoryItem) {
  return item.quantity > 1 ? item.name + " ×" + item.quantity : item.name
}

function itemAtRoot(item: InventoryItem) {
  return inventoryPlacementKind(item) === "root" && !item.equipped
}

function gridItems(items: readonly InventoryItem[], holderId: string) {
  return items.filter((item) =>
    item.holder_item_id === holderId
    && inventoryPlacementKind(item) === "grid"
    && item.grid_x != null
    && item.grid_y != null
  )
}

function legacyItems(items: readonly InventoryItem[], holderId: string) {
  return items.filter((item) =>
    item.holder_item_id === holderId
    && inventoryPlacementKind(item) === "legacy"
  )
}

export default function InventorySpatialView({
  items,
  activeHolderId,
  canControl,
  actionsForItem,
  onActiveHolderChange,
  onOpenItem,
  onMove,
  onEquip,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hint, setHint] = useState<DropHint | null>(null)
  const [message, setMessage] = useState("")
  const [movingId, setMovingId] = useState<string | null>(null)

  const activeHolder = activeHolderId
    ? items.find((item) => item.id === activeHolderId) || null
    : null
  const activeContainer = activeHolder
    ? inventoryPhysicalProfile(activeHolder).container_profile || null
    : null
  const parentHolder = activeHolder?.holder_item_id
    ? items.find((item) => item.id === activeHolder.holder_item_id) || null
    : null

  const rootContainers = useMemo(
    () => items.filter((item) => item.category === "container" && itemAtRoot(item)),
    [items],
  )
  const rootLooseItems = useMemo(
    () => items.filter((item) => item.category !== "container" && itemAtRoot(item)),
    [items],
  )
  const equippedItems = useMemo(() => items.filter((item) => item.equipped), [items])
  const externalCapacity = inventoryExternalCarryCapacity(items)
  const currentGridItems = activeHolder ? gridItems(items, activeHolder.id) : []
  const currentLegacyItems = activeHolder ? legacyItems(items, activeHolder.id) : []

  function targetProblem(item: InventoryItem, target: DropTarget) {
    if (target.kind === "equipment") {
      return item.category === "equipment" ? null : "Экипировать можно только предмет экипировки."
    }
    if (target.kind === "root" && item.equipped) {
      return "После снятия выбери руку, сумку или внешнюю ячейку."
    }
    return inventoryPlacementProblem(items, item, target)
  }

  function targetFromPoint(
    item: InventoryItem,
    clientX: number,
    clientY: number,
    grabCellX: number,
    grabCellY: number,
  ): DropHint | null {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    if (!element) return null

    const direct = element.closest<HTMLElement>("[data-inventory-drop-kind]")
    const kind = direct?.dataset.inventoryDropKind

    if (kind === "hand") {
      const index = Number(direct?.dataset.inventoryDropIndex)
      const target = { kind: "hand" as const, index: index === 1 ? 1 as const : 0 as const }
      return { target, problem: targetProblem(item, target) }
    }

    if (kind === "external") {
      const target = {
        kind: "external" as const,
        index: Number(direct?.dataset.inventoryDropIndex || 0),
      }
      return { target, problem: targetProblem(item, target) }
    }

    if (kind === "root") {
      const target = { kind: "root" as const }
      return { target, problem: targetProblem(item, target) }
    }

    if (kind === "equipment") {
      const target = { kind: "equipment" as const }
      return { target, problem: targetProblem(item, target) }
    }

    if (kind === "container") {
      const holder = items.find((candidate) => candidate.id === direct?.dataset.inventoryHolderId)
      if (!holder) return null
      const target = firstAvailableGridPlacement(items, item, holder)
      return target
        ? { target, problem: targetProblem(item, target) }
        : { target: { kind: "root" }, problem: "В контейнере нет подходящего места." }
    }

    const grid = element.closest<HTMLElement>("[data-inventory-grid]")
    if (grid && activeHolder) {
      const rect = grid.getBoundingClientRect()
      const cellX = Math.floor((clientX - rect.left) / CELL_PX)
      const cellY = Math.floor((clientY - rect.top) / CELL_PX)
      const target = {
        kind: "grid" as const,
        holderItemId: activeHolder.id,
        gridX: cellX - grabCellX,
        gridY: cellY - grabCellY,
        rotation: (item.grid_rotation || 0) as 0 | 90 | 180 | 270,
      }
      return { target, problem: targetProblem(item, target) }
    }

    return null
  }

  function startDrag(event: ReactPointerEvent<HTMLElement>, item: InventoryItem) {
    if (!canControl || movingId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const currentKind = inventoryPlacementKind(item)
    const grabCellX = currentKind === "grid"
      ? Math.max(0, Math.floor((event.clientX - rect.left) / CELL_PX))
      : 0
    const grabCellY = currentKind === "grid"
      ? Math.max(0, Math.floor((event.clientY - rect.top) / CELL_PX))
      : 0

    event.currentTarget.setPointerCapture(event.pointerId)
    setMessage("")
    setDrag({
      itemId: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      grabCellX,
      grabCellY,
      moved: false,
    })
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>, item: InventoryItem) {
    if (!drag || drag.itemId !== item.id || drag.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
    const moved = drag.moved || distance >= DRAG_THRESHOLD
    if (moved) event.preventDefault()
    setDrag((current) => current ? {
      ...current,
      clientX: event.clientX,
      clientY: event.clientY,
      moved,
    } : null)
    if (moved) {
      setHint(targetFromPoint(
        item,
        event.clientX,
        event.clientY,
        drag.grabCellX,
        drag.grabCellY,
      ))
    }
  }

  async function endDrag(event: ReactPointerEvent<HTMLElement>, item: InventoryItem) {
    if (!drag || drag.itemId !== item.id || drag.pointerId !== event.pointerId) return
    const moved = drag.moved
    const currentHint = moved
      ? targetFromPoint(item, event.clientX, event.clientY, drag.grabCellX, drag.grabCellY)
      : null
    setDrag(null)
    setHint(null)

    if (!moved) {
      if (item.category === "container") onActiveHolderChange(item.id)
      else onOpenItem(item)
      return
    }

    if (!currentHint) {
      setMessage("Здесь предмет оставить нельзя.")
      return
    }
    if (currentHint.problem) {
      setMessage(currentHint.problem)
      return
    }

    setMovingId(item.id)
    const result = currentHint.target.kind === "equipment"
      ? await onEquip(item)
      : await onMove(item, currentHint.target)
    setMovingId(null)
    if (!result.ok) setMessage(result.error || "Не удалось переместить предмет.")
  }

  function cancelDrag() {
    setDrag(null)
    setHint(null)
  }

  function itemCard(
    item: InventoryItem,
    className: string,
    style?: CSSProperties,
    dropContainer = false,
  ) {
    const actions = actionsForItem(item)
    return (
      <SnakeTrigger
        key={item.id}
        entity={{ type: "inventory-item", id: item.id }}
        actions={actions}
        moveTolerancePx={Math.max(1, DRAG_THRESHOLD - 1)}
      >
        <button
          type="button"
          className={className}
          style={style}
          data-inventory-drop-kind={dropContainer ? "container" : undefined}
          data-inventory-holder-id={dropContainer ? item.id : undefined}
          data-moving={movingId === item.id || undefined}
          data-dragging={drag?.moved && drag.itemId === item.id || undefined}
          onPointerDown={(event) => startDrag(event, item)}
          onPointerMove={(event) => moveDrag(event, item)}
          onPointerUp={(event) => void endDrag(event, item)}
          onPointerCancel={cancelDrag}
          aria-label={item.name}
        >
          {className === "u1-inventory-grid-item" ? (
            <>
              {rotateInventoryShape(
                inventoryPhysicalProfile(item),
                (item.grid_rotation || 0) as 0 | 90 | 180 | 270,
              ).cells.map((cell) => (
                <i
                  className="u1-inventory-shape-cell"
                  key={cell.x + ":" + cell.y}
                  style={{
                    left: cell.x * CELL_PX,
                    top: cell.y * CELL_PX,
                    width: CELL_PX,
                    height: CELL_PX,
                  }}
                />
              ))}
              <strong>{compactItemLabel(item)}</strong>
            </>
          ) : (
            <>
              <span>{item.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</span>
              <strong>{compactItemLabel(item)}</strong>
            </>
          )}
        </button>
      </SnakeTrigger>
    )
  }

  const draggedItem = drag ? items.find((item) => item.id === drag.itemId) || null : null
  const draggedShape = draggedItem
    ? rotateInventoryShape(
        inventoryPhysicalProfile(draggedItem),
        (draggedItem.grid_rotation || 0) as 0 | 90 | 180 | 270,
      )
    : null

  return (
    <div className="u1-inventory-space">
      <section className="u1-inventory-carry">
        <header><span>ПЕРЕНОСКА</span><small>две руки · сумки · внешние ячейки</small></header>
        <div className="u1-inventory-carry__rail">
          {[0, 1].map((handIndex) => {
            const item = itemInPlacement(items, "hand", handIndex)
            return (
              <div
                className="u1-inventory-slot u1-inventory-slot--hand"
                data-inventory-drop-kind="hand"
                data-inventory-drop-index={handIndex}
                key={"hand-" + handIndex}
              >
                <small>РУКА {handIndex + 1}</small>
                {item
                  ? itemCard(item, "u1-inventory-compact")
                  : <i aria-hidden="true">◇</i>}
              </div>
            )
          }).slice(0, 1)}

          {rootContainers.map((container) => (
            <div className="u1-inventory-slot u1-inventory-slot--bag" key={container.id}>
              <small>СУМКА</small>
              {itemCard(container, "u1-inventory-compact", undefined, true)}
            </div>
          ))}

          {Array.from({ length: externalCapacity }, (_, index) => {
            const item = itemInPlacement(items, "external", index)
            return (
              <div
                className="u1-inventory-slot"
                data-inventory-drop-kind="external"
                data-inventory-drop-index={index}
                key={"external-" + index}
              >
                <small>СНАРУЖИ</small>
                {item
                  ? itemCard(item, "u1-inventory-compact")
                  : <i aria-hidden="true">□</i>}
              </div>
            )
          })}

          {[1].map((handIndex) => {
            const item = itemInPlacement(items, "hand", handIndex)
            return (
              <div
                className="u1-inventory-slot u1-inventory-slot--hand"
                data-inventory-drop-kind="hand"
                data-inventory-drop-index={handIndex}
                key={"hand-" + handIndex}
              >
                <small>РУКА {handIndex + 1}</small>
                {item
                  ? itemCard(item, "u1-inventory-compact")
                  : <i aria-hidden="true">◇</i>}
              </div>
            )
          })}
        </div>
      </section>

      {equippedItems.length > 0 && (
        <section
          className="u1-inventory-equipment"
          data-inventory-drop-kind="equipment"
        >
          <header><span>ЭКИПИРОВАНО</span><small>тот же экземпляр · без копии в сумке</small></header>
          <div>
            {equippedItems.map((item) => itemCard(item, "u1-inventory-equipped-item"))}
          </div>
        </section>
      )}

      {canControl && (
        <div
          className="u1-inventory-equip-drop"
          data-inventory-drop-kind="equipment"
          data-active={hint?.target.kind === "equipment" || undefined}
          data-invalid={hint?.target.kind === "equipment" && Boolean(hint.problem) || undefined}
        >
          ЭКИПИРОВАТЬ
        </div>
      )}

      {activeHolder && activeContainer ? (
        <section className="u1-inventory-bag">
          <header className="u1-inventory-bag__head">
            <button
              type="button"
              onClick={() => onActiveHolderChange(activeHolder.holder_item_id ?? null)}
            >
              ←
            </button>
            <div>
              <strong>{activeHolder.name}</strong>
              <small>
                {activeContainer.internal_grid_width}×{activeContainer.internal_grid_height}
                {" · "}окно ≈ 6 клеток
              </small>
            </div>
            <span>{currentGridItems.length}</span>
          </header>

          <div className="u1-inventory-grid-viewport">
            <div
              className="u1-inventory-grid"
              data-inventory-grid
              style={{
                width: activeContainer.internal_grid_width * CELL_PX,
                height: activeContainer.internal_grid_height * CELL_PX,
                backgroundSize: CELL_PX + "px " + CELL_PX + "px",
              }}
            >
              {currentGridItems.map((item) => {
                const shape = rotateInventoryShape(
                  inventoryPhysicalProfile(item),
                  (item.grid_rotation || 0) as 0 | 90 | 180 | 270,
                )
                return itemCard(
                  item,
                  "u1-inventory-grid-item",
                  {
                    left: (item.grid_x || 0) * CELL_PX,
                    top: (item.grid_y || 0) * CELL_PX,
                    width: shape.width * CELL_PX,
                    height: shape.height * CELL_PX,
                  },
                  item.category === "container",
                )
              })}

              {hint?.target.kind === "grid" && hint.target.holderItemId === activeHolder.id && draggedItem && (() => {
                const previewShape = rotateInventoryShape(
                  inventoryPhysicalProfile(draggedItem),
                  hint.target.rotation,
                )
                return (
                  <div
                    className="u1-inventory-grid-hint"
                    data-invalid={Boolean(hint.problem) || undefined}
                    style={{
                      left: hint.target.gridX * CELL_PX,
                      top: hint.target.gridY * CELL_PX,
                      width: previewShape.width * CELL_PX,
                      height: previewShape.height * CELL_PX,
                    }}
                  >
                    {previewShape.cells.map((cell) => (
                      <i
                        className="u1-inventory-shape-cell"
                        key={cell.x + ":" + cell.y}
                        style={{
                          left: cell.x * CELL_PX,
                          top: cell.y * CELL_PX,
                          width: CELL_PX,
                          height: CELL_PX,
                        }}
                      />
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>

          {currentLegacyItems.length > 0 && (
            <div className="u1-inventory-legacy">
              <small>НУЖНО РАЗМЕСТИТЬ</small>
              <div>
                {currentLegacyItems.map((item) => itemCard(item, "u1-inventory-loose-item", undefined, item.category === "container"))}
              </div>
            </div>
          )}

          <div className="u1-inventory-bag__drop-rail">
            {parentHolder && (
              <div
                data-inventory-drop-kind="container"
                data-inventory-holder-id={parentHolder.id}
              >
                В РОДИТЕЛЬСКУЮ СУМКУ
              </div>
            )}
            <div data-inventory-drop-kind="root">В СВОБОДНЫЕ ПРЕДМЕТЫ</div>
          </div>
        </section>
      ) : (
        <section className="u1-inventory-root">
          <header>
            <span>СВОБОДНЫЕ ПРЕДМЕТЫ</span>
            <small>перетащи в руку или сумку</small>
          </header>
          <div
            className="u1-inventory-root__tray"
            data-inventory-drop-kind="root"
          >
            {rootLooseItems.map((item) => itemCard(item, "u1-inventory-loose-item"))}
            {!rootLooseItems.length && <p>Свободных предметов нет.</p>}
          </div>
        </section>
      )}

      {message && <div className="u1-inventory-message" role="status">{message}</div>}

      {drag?.moved && draggedItem && draggedShape && (
        <div
          className="u1-inventory-drag-ghost"
          data-invalid={Boolean(hint?.problem) || undefined}
          style={{
            left: drag.clientX - drag.grabCellX * CELL_PX,
            top: drag.clientY - drag.grabCellY * CELL_PX,
            width: draggedShape.width * CELL_PX,
            height: draggedShape.height * CELL_PX,
          }}
        >
          {draggedShape.cells.map((cell) => (
            <i
              className="u1-inventory-shape-cell"
              key={cell.x + ":" + cell.y}
              style={{
                left: cell.x * CELL_PX,
                top: cell.y * CELL_PX,
                width: CELL_PX,
                height: CELL_PX,
              }}
            />
          ))}
          <span>{draggedItem.name}</span>
        </div>
      )}
    </div>
  )
}
