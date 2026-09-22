import type { InventoryPlacementTarget } from "../inventory-engine"
import type { InventoryItem } from "../types/characterSheet"
import { CHARACTER_INVENTORY_INTERFACE_CONTRACT } from "./characterSheetUiContract"
import InventorySimpleView from "./InventorySimpleView"

type Result = { ok: boolean; error?: string }

export default function CharacterInventoryInterface({
  characterId,
  characterName,
  classKey,
  items,
  canControl,
  focusedItemId,
  onMoveItem,
  onPlaceItem,
  onSwapItems,
  onEquipItem,
  onUseItem,
  onBack,
}: {
  characterId: string
  characterName: string
  classKey: string
  items: InventoryItem[]
  canControl: boolean
  focusedItemId?: string | null
  onMoveItem: (
    item: InventoryItem,
    holderItemId: string | null,
  ) => Promise<Result>
  onPlaceItem: (
    item: InventoryItem,
    placement: InventoryPlacementTarget,
  ) => Promise<Result>
  onSwapItems: (first: InventoryItem, second: InventoryItem) => Promise<Result>
  onEquipItem: (item: InventoryItem) => Promise<Result>
  onUseItem: (item: InventoryItem, amount?: number) => Promise<Result>
  onBack: () => void
}) {
  return (
    <main
      className="u1-character-sheet u1-character-inventory-interface"
      data-class-key={classKey}
      data-character-id={characterId}
      data-interface-version={CHARACTER_INVENTORY_INTERFACE_CONTRACT.version}
      data-inventory-status={CHARACTER_INVENTORY_INTERFACE_CONTRACT.status}
    >
      <header className="u1-character-inventory-interface__topbar">
        <button
          type="button"
          onClick={onBack}
          aria-label="Вернуться к листу персонажа"
        >
          ←
        </button>
        <span>ИНВЕНТАРЬ · {characterName}</span>
        <i aria-hidden="true" />
      </header>

      <section
        className="u1-character-inventory-interface__body"
        data-focused-item-id={focusedItemId || undefined}
        aria-label={"Инвентарь " + characterName}
      >
        <InventorySimpleView
          items={items}
          canControl={canControl}
          focusedItemId={focusedItemId}
          onMove={onMoveItem}
          onPlace={onPlaceItem}
          onSwap={onSwapItems}
          onEquip={onEquipItem}
          onUse={onUseItem}
        />
      </section>
    </main>
  )
}
