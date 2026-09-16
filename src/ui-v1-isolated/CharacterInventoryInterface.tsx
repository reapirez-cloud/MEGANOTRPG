import { CHARACTER_INVENTORY_INTERFACE_CONTRACT } from "./characterSheetUiContract"

export default function CharacterInventoryInterface({
  characterId,
  characterName,
  classKey,
  focusedItemId,
  focusedItemName,
  onBack,
}: {
  characterId: string
  characterName: string
  classKey: string
  focusedItemId?: string | null
  focusedItemName?: string | null
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
        <span>ИНВЕНТАРЬ</span>
        <i aria-hidden="true" />
      </header>

      <section
        className="u1-character-inventory-interface__body"
        data-focused-item-id={focusedItemId || undefined}
        data-future-inventory-mount="reserved"
        aria-label="Заглушка отдельного интерфейса инвентаря"
      >
        <small>{characterName}</small>
        <strong>Отдельный интерфейс инвентаря</strong>
        <p>
          Граница интерфейса готова. Сам инвентарь пока остаётся заглушкой:
          пространственная сетка, сумки, экипировка и перенос предметов
          проектируются и подключаются отдельным планом инвентаря.
        </p>
        {focusedItemId && (
          <div className="u1-character-inventory-interface__focus">
            <small>ЦЕЛЬ ПЕРЕХОДА</small>
            <strong>{focusedItemName || focusedItemId}</strong>
          </div>
        )}
      </section>
    </main>
  )
}
