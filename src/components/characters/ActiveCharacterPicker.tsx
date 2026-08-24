import { useState } from "react"

import { useCharacters } from "../../context/CharacterContext"
import CharacterAvatar from "./CharacterAvatar"

type Props = {
  compact?: boolean
}

export default function ActiveCharacterPicker({ compact = false }: Props) {
  const {
    myCharacters,
    activeCharacter,
    setActiveCharacter,
  } = useCharacters()

  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)

  async function choose(characterId: string) {
    setSwitching(characterId)
    const ok = await setActiveCharacter(characterId)
    setSwitching(null)

    if (ok) setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className={`active-character-chip ${compact ? "active-character-chip--compact" : ""}`}
        onClick={() => setOpen(true)}
      >
        <CharacterAvatar character={activeCharacter} size="small" />
        <span>
          <small>Активный</small>
          <strong>{activeCharacter?.name || "Выбрать персонажа"}</strong>
        </span>
        <span className="active-character-chip__chevron">⌄</span>
      </button>

      {open && (
        <div className="sheet-backdrop" onMouseDown={() => setOpen(false)}>
          <div
            className="bottom-sheet character-picker-sheet"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="character-picker-sheet__head">
              <div>
                <h3 className="sheet-title">Активный персонаж</h3>
                <p className="sheet-copy">
                  Его имя и аватар будут использоваться в игровых сообщениях.
                </p>
              </div>
              <button
                className="sheet-close"
                type="button"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="character-picker-list">
              {myCharacters.map((character) => {
                const active = character.id === activeCharacter?.id

                return (
                  <button
                    key={character.id}
                    type="button"
                    className={`character-picker-row ${active ? "character-picker-row--active" : ""}`}
                    onClick={() => void choose(character.id)}
                    disabled={switching !== null}
                  >
                    <CharacterAvatar character={character} size="medium" />
                    <span className="character-picker-row__body">
                      <strong>{character.name}</strong>
                      <small>
                        {character.character_class} · {character.level} ур.
                      </small>
                    </span>
                    <span className="character-picker-row__state">
                      {active ? "Активен" : switching === character.id ? "…" : "Выбрать"}
                    </span>
                  </button>
                )
              })}
            </div>

            {myCharacters.length === 0 && (
              <div className="character-picker-empty">
                Сначала создай персонажа во вкладке «Персонажи».
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
