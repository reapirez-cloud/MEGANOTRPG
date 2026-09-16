export default function CharacterInventoryInterface({
  characterName,
  classKey,
  onBack,
}: {
  characterName: string
  classKey: string
  onBack: () => void
}) {
  return (
    <main
      className="u1-character-sheet u1-character-inventory-interface"
      data-class-key={classKey}
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

      <section className="u1-character-inventory-interface__body">
        <small>{characterName}</small>
        <strong>Отдельный интерфейс инвентаря</strong>
        <p>
          Навигация уже отделена от листа. Пространственная сетка, сумки,
          экипировка и перенос предметов будут подключены сюда на этапе 14.
        </p>
      </section>
    </main>
  )
}
