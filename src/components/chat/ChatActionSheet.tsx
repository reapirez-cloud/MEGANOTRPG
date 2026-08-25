import { useEffect, useMemo, useState } from "react"

import { supabase } from "../../lib/supabase"
import type {
  CharacterSheet,
  CharacterSpell,
  SpellSlotState,
} from "../../types/characterSheet"

type Props = {
  roomId: string
  characterId: string | null
  onClose: () => void
}

const dice = [4, 6, 8, 10, 12, 20, 100]

function slotState(
  slots: CharacterSheet["spell_slots"] | undefined,
  level: number,
): SpellSlotState {
  const value = slots?.[String(level)]
  return {
    max: Math.max(0, Number(value?.max || 0)),
    used: Math.max(0, Number(value?.used || 0)),
  }
}

export default function ChatActionSheet({
  roomId,
  characterId,
  onClose,
}: Props) {
  const [sheet, setSheet] = useState<CharacterSheet | null>(null)
  const [spells, setSpells] = useState<CharacterSpell[]>([])
  const [loadingSpells, setLoadingSpells] = useState(Boolean(characterId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const [dieSides, setDieSides] = useState(20)
  const [dieCount, setDieCount] = useState(1)
  const [modifier, setModifier] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!characterId) {
        setSheet(null)
        setSpells([])
        setLoadingSpells(false)
        return
      }

      setLoadingSpells(true)
      const [sheetResult, spellResult] = await Promise.all([
        supabase
          .from("character_sheets")
          .select("*")
          .eq("character_id", characterId)
          .maybeSingle(),
        supabase
          .from("character_spells")
          .select("*")
          .eq("character_id", characterId)
          .eq("prepared", true)
          .order("spell_level", { ascending: true })
          .order("name", { ascending: true }),
      ])

      if (cancelled) return

      const firstError = sheetResult.error || spellResult.error
      if (firstError) {
        setError(firstError.message)
        setLoadingSpells(false)
        return
      }

      setSheet((sheetResult.data || null) as CharacterSheet | null)
      setSpells((spellResult.data || []) as CharacterSpell[])
      setLoadingSpells(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [characterId])

  const configuredSlots = useMemo(() => {
    if (!sheet) return []
    return Array.from({ length: 9 }, (_, index) => index + 1)
      .map((level) => ({ level, ...slotState(sheet.spell_slots, level) }))
      .filter((slot) => slot.max > 0)
  }, [sheet])

  async function roll() {
    setBusy(true)
    setError("")

    const { error: rollError } = await supabase.rpc("roll_chat_dice", {
      p_room_id: roomId,
      p_sides: dieSides,
      p_count: dieCount,
      p_modifier: modifier,
    })

    setBusy(false)

    if (rollError) {
      setError(rollError.message)
      return
    }

    onClose()
  }

  async function cast(spell: CharacterSpell) {
    setBusy(true)
    setError("")

    const { error: castError } = await supabase.rpc("cast_prepared_spell", {
      p_room_id: roomId,
      p_spell_id: spell.id,
    })

    setBusy(false)

    if (castError) {
      setError(castError.message)
      return
    }

    onClose()
  }

  function remainingFor(spell: CharacterSpell) {
    if (spell.cast_mode === "cantrip") return null
    const level = spell.slot_level || spell.spell_level
    const slot = slotState(sheet?.spell_slots, level)
    return {
      level,
      max: slot.max,
      remaining: Math.max(0, slot.max - slot.used),
    }
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div
        className="bottom-sheet chat-action-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div>
            <h3 className="sheet-title">Действие</h3>
            <p className="sheet-copy">
              Бросок и заклинание сразу публикуются в игровом чате.
            </p>
          </div>
          <button className="sheet-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <section className="chat-action-block">
          <div className="chat-action-block__head">
            <div>
              <strong>Бросить кубик</strong>
              <small>Результат считает сервер</small>
            </div>
          </div>

          <div className="dice-builder dice-builder--mobile">
            <label className="dice-select-field">
              Куб
              <select
                className="app-select"
                value={dieSides}
                onChange={(event) => setDieSides(Number(event.target.value))}
              >
                {dice.map((sides) => (
                  <option key={sides} value={sides}>
                    d{sides}
                  </option>
                ))}
              </select>
            </label>

            <div className="dice-step-field">
              <span className="dice-step-field__label">Количество</span>
              <div className="dice-stepper">
                <button
                  type="button"
                  aria-label="Уменьшить количество кубиков"
                  onClick={() => setDieCount((value) => Math.max(1, value - 1))}
                  disabled={dieCount <= 1}
                >
                  −
                </button>
                <strong>{dieCount}</strong>
                <button
                  type="button"
                  aria-label="Увеличить количество кубиков"
                  onClick={() => setDieCount((value) => Math.min(20, value + 1))}
                  disabled={dieCount >= 20}
                >
                  +
                </button>
              </div>
              <div className="dice-preset-row">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={dieCount === value ? "dice-preset dice-preset--active" : "dice-preset"}
                    onClick={() => setDieCount(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="dice-step-field">
              <span className="dice-step-field__label">Модификатор</span>
              <div className="dice-stepper">
                <button
                  type="button"
                  aria-label="Уменьшить модификатор"
                  onClick={() => setModifier((value) => Math.max(-100, value - 1))}
                  disabled={modifier <= -100}
                >
                  −
                </button>
                <strong>{modifier > 0 ? `+${modifier}` : modifier}</strong>
                <button
                  type="button"
                  aria-label="Увеличить модификатор"
                  onClick={() => setModifier((value) => Math.min(100, value + 1))}
                  disabled={modifier >= 100}
                >
                  +
                </button>
              </div>
              <div className="dice-preset-row dice-preset-row--modifier">
                {[-5, -2, -1, 0, 1, 2, 5].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={modifier === value ? "dice-preset dice-preset--active" : "dice-preset"}
                    onClick={() => setModifier(value)}
                  >
                    {value > 0 ? `+${value}` : value}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            className="chat-action-primary"
            type="button"
            disabled={busy}
            onClick={() => void roll()}
          >
            🎲 Бросить {dieCount}d{dieSides}
            {modifier > 0 ? ` +${modifier}` : modifier < 0 ? ` ${modifier}` : ""}
          </button>
        </section>

        <section className="chat-action-block">
          <div className="chat-action-block__head">
            <div>
              <strong>Подготовленные заклинания</strong>
              <small>В чате показываются только зелёные / подготовленные</small>
            </div>
          </div>

          {configuredSlots.length > 0 && (
            <div className="chat-slot-strip">
              {configuredSlots.map((slot) => (
                <span key={slot.level}>
                  <small>{slot.level} ур.</small>
                  <strong>{Math.max(0, slot.max - slot.used)}/{slot.max}</strong>
                </span>
              ))}
            </div>
          )}

          {!characterId && (
            <div className="chat-action-empty">
              Для заклинаний нужен активный персонаж. Кубики ГМ может бросать и без него.
            </div>
          )}

          {characterId && loadingSpells && (
            <div className="chat-action-empty">Загружаем заклинания…</div>
          )}

          {characterId && !loadingSpells && spells.length === 0 && (
            <div className="chat-action-empty">
              Нет подготовленных заклинаний. Открой персонажа → Заклинания и отметь нужные как «Подготовлено».
            </div>
          )}

          <div className="prepared-spell-list">
            {spells.map((spell) => {
              const resource = remainingFor(spell)
              const unavailable =
                Boolean(resource) &&
                (resource!.max <= 0 || resource!.remaining <= 0)

              return (
                <button
                  className="prepared-spell-action"
                  type="button"
                  key={spell.id}
                  disabled={busy || unavailable}
                  onClick={() => void cast(spell)}
                >
                  <span className="prepared-spell-action__rune">
                    {spell.cast_mode === "cantrip"
                      ? "∞"
                      : spell.slot_level || spell.spell_level}
                  </span>
                  <span className="prepared-spell-action__copy">
                    <strong>{spell.name}</strong>
                    <small>
                      {spell.cast_mode === "cantrip"
                        ? "Кантрип · ячейка не тратится"
                        : resource
                          ? `Ячейка ${resource.level} ур. · осталось ${resource.remaining}/${resource.max}`
                          : "Ячейка"}
                    </small>
                  </span>
                  <span className="prepared-spell-action__go">›</span>
                </button>
              )
            })}
          </div>
        </section>

        {error && <div className="auth-error">{error}</div>}
      </div>
    </div>
  )
}
