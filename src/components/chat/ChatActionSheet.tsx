import { useMemo, useState } from "react"

import {
  chatActionPrototypeData,
  signedModifier,
  type ChatAbilityOption,
  type ChatActionPrototypeData,
  type ChatCheckOption,
  type ChatSpellOption,
  type ChatSpellSlotOption,
} from "./chatActionPrototype"

type Props = {
  characterId: string | null
  characterName?: string | null
  onClose: () => void
  data?: ChatActionPrototypeData
  onRollRequested?: (check: ChatCheckOption) => void | Promise<void>
  onSpellRequested?: (spell: ChatSpellOption, slotLevel: number) => void | Promise<void>
  onOpenSpellReference?: (spellId: string) => void
}

type FlowView =
  | "home"
  | "abilities"
  | "checks"
  | "slots"
  | "spells"
  | "spell-detail"
  | "roll-result"
  | "cast-preview"

function softPulse() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(8)
  }
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1
}

export default function ChatActionSheet({
  characterId,
  characterName,
  onClose,
  data = chatActionPrototypeData,
  onRollRequested,
  onSpellRequested,
  onOpenSpellReference,
}: Props) {
  const [view, setView] = useState<FlowView>("home")
  const [selectedAbility, setSelectedAbility] = useState<ChatAbilityOption | null>(null)
  const [selectedCheck, setSelectedCheck] = useState<ChatCheckOption | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<ChatSpellSlotOption | null>(null)
  const [selectedSpell, setSelectedSpell] = useState<ChatSpellOption | null>(null)
  const [rollResult, setRollResult] = useState<{ die: number; total: number } | null>(null)
  const [demoNotice, setDemoNotice] = useState("")
  const [busy, setBusy] = useState(false)

  const checks = useMemo(
    () => data.checks.filter((item) => item.ability === selectedAbility?.id),
    [data.checks, selectedAbility?.id],
  )

  const regularChecks = checks.filter((item) => item.kind !== "save")
  const saves = checks.filter((item) => item.kind === "save")

  const availableSpells = useMemo(() => {
    if (!selectedSlot) return []
    return data.spells.filter((spell) =>
      spell.availableSlotLevels.includes(selectedSlot.level),
    )
  }, [data.spells, selectedSlot])

  function move(next: FlowView) {
    softPulse()
    setDemoNotice("")
    setView(next)
  }

  function goBack() {
    setDemoNotice("")
    if (view === "home") {
      onClose()
      return
    }
    if (view === "abilities" || view === "slots") {
      move("home")
      return
    }
    if (view === "checks") {
      setSelectedAbility(null)
      move("abilities")
      return
    }
    if (view === "spells") {
      setSelectedSlot(null)
      move("slots")
      return
    }
    if (view === "spell-detail") {
      setSelectedSpell(null)
      move("spells")
      return
    }
    if (view === "roll-result") {
      setRollResult(null)
      move("checks")
      return
    }
    if (view === "cast-preview") {
      move("spell-detail")
    }
  }

  function selectAbility(ability: ChatAbilityOption) {
    setSelectedAbility(ability)
    move("checks")
  }

  function selectSlot(slot: ChatSpellSlotOption) {
    if (slot.remaining <= 0) return
    setSelectedSlot(slot)
    move("spells")
  }

  function selectSpell(spell: ChatSpellOption) {
    setSelectedSpell(spell)
    move("spell-detail")
  }

  async function triggerRoll(check: ChatCheckOption) {
    setSelectedCheck(check)
    setBusy(true)
    if (onRollRequested) {
      await onRollRequested(check)
      setBusy(false)
      onClose()
      return
    }

    const die = rollD20()
    setRollResult({ die, total: die + check.modifier })
    setBusy(false)
    move("roll-result")
  }

  async function triggerSpell() {
    if (!selectedSpell || !selectedSlot) return
    setBusy(true)
    if (onSpellRequested) {
      await onSpellRequested(selectedSpell, selectedSlot.level)
      setBusy(false)
      onClose()
      return
    }

    setBusy(false)
    setDemoNotice("Демо: действие не отправлено в чат и ячейка не потрачена.")
    move("cast-preview")
  }

  const title = view === "home"
    ? "Действия"
    : view === "abilities"
      ? "Проверка"
      : view === "checks"
        ? selectedAbility?.name || "Проверка"
        : view === "slots"
          ? "Заклинание"
          : view === "spells"
            ? `Ячейка ${selectedSlot?.level ?? "—"}`
            : view === "spell-detail" || view === "cast-preview"
              ? selectedSpell?.name || "Заклинание"
              : selectedCheck?.name || "Результат"

  return (
    <div className="chat-action-backdrop" onMouseDown={onClose}>
      <section
        className="chat-action-flow"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Действия в чате"
      >
        <div className="chat-action-flow__handle" />

        <header className="chat-action-flow__header">
          <button
            className="chat-action-flow__back"
            type="button"
            onClick={goBack}
            aria-label={view === "home" ? "Закрыть" : "Назад"}
          >
            {view === "home" ? "×" : "‹"}
          </button>
          <div>
            <strong>{title}</strong>
            <small>
              {characterName
                ? `${characterName}${characterId ? " · данные пока демонстрационные" : ""}`
                : "Демонстрационный режим"}
            </small>
          </div>
          <span className="chat-action-flow__header-spacer" />
        </header>

        <div className="chat-action-flow__viewport">
          <div className="chat-action-flow__screen" key={view}>
            {view === "home" && (
              <div className="chat-action-home">
                <button className="chat-action-choice" type="button" onClick={() => move("abilities")}>
                  <span className="chat-action-choice__icon">◈</span>
                  <span>
                    <strong>Бросок кубика</strong>
                    <small>Характеристика, навык или спасбросок</small>
                  </span>
                  <em>›</em>
                </button>

                <button className="chat-action-choice" type="button" onClick={() => move("slots")}>
                  <span className="chat-action-choice__icon">✦</span>
                  <span>
                    <strong>Заклинание</strong>
                    <small>Выбор ячейки и доступного заклинания</small>
                  </span>
                  <em>›</em>
                </button>
              </div>
            )}

            {view === "abilities" && (
              <div className="chat-ability-grid">
                {data.abilities.map((ability) => (
                  <button
                    className="chat-ability-tile"
                    type="button"
                    key={ability.id}
                    onClick={() => selectAbility(ability)}
                  >
                    <span>{ability.short}</span>
                    <strong>{signedModifier(ability.modifier)}</strong>
                    <small>{ability.name}</small>
                  </button>
                ))}
              </div>
            )}

            {view === "checks" && (
              <div className="chat-check-list">
                {regularChecks.map((check) => (
                  <button
                    className="chat-check-row"
                    type="button"
                    key={check.id}
                    disabled={busy}
                    onClick={() => void triggerRoll(check)}
                  >
                    <span className={`chat-check-row__dot ${check.proficient ? "chat-check-row__dot--active" : ""}`} />
                    <span className="chat-check-row__copy">
                      <strong>{check.name}</strong>
                      <small>{check.kind === "ability" ? "Проверка характеристики" : check.proficient ? "Есть владение" : "Без владения"}</small>
                    </span>
                    <span className="chat-check-row__modifier">{signedModifier(check.modifier)}</span>
                  </button>
                ))}

                {saves.length > 0 && (
                  <div className="chat-check-save-group">
                    <span>Спасбросок</span>
                    {saves.map((check) => (
                      <button
                        className="chat-check-row chat-check-row--save"
                        type="button"
                        key={check.id}
                        disabled={busy}
                        onClick={() => void triggerRoll(check)}
                      >
                        <span className={`chat-check-row__dot ${check.proficient ? "chat-check-row__dot--active" : ""}`} />
                        <span className="chat-check-row__copy">
                          <strong>{check.name}</strong>
                          <small>{check.proficient ? "Есть владение" : "Без владения"}</small>
                        </span>
                        <span className="chat-check-row__modifier">{signedModifier(check.modifier)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "roll-result" && selectedCheck && rollResult && (
              <div className="chat-roll-preview">
                <div className="chat-roll-preview__card">
                  <span className="chat-roll-preview__icon">◈</span>
                  <div>
                    <small>{characterName || "Персонаж"}</small>
                    <strong>{selectedCheck.name}</strong>
                    <span>d20: {rollResult.die} {selectedCheck.modifier >= 0 ? "+" : "−"} {Math.abs(selectedCheck.modifier)}</span>
                  </div>
                  <b>{rollResult.total}</b>
                </div>
                <p>Демо-результат. Позже сервер возьмёт модификатор из листа и сам создаст такое сообщение в чате.</p>
                <button type="button" className="chat-action-secondary" onClick={() => move("checks")}>Бросить другую проверку</button>
              </div>
            )}

            {view === "slots" && (
              <div className="chat-slot-picker">
                <div className="chat-slot-picker__note">
                  <strong>Выбери ячейку</strong>
                  <small>Позже остаток будет загружаться прямо из ресурсов персонажа.</small>
                </div>
                <div className="chat-slot-picker__strip">
                  {data.slots.map((slot) => (
                    <button
                      className={`chat-slot-chip ${slot.remaining <= 0 ? "chat-slot-chip--empty" : ""}`}
                      type="button"
                      key={slot.level}
                      disabled={slot.remaining <= 0}
                      onClick={() => selectSlot(slot)}
                    >
                      <span>{slot.level}</span>
                      <strong>{slot.remaining}/{slot.max}</strong>
                      <small>ячейка</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {view === "spells" && selectedSlot && (
              <div className="chat-spell-list">
                <div className="chat-spell-list__head">
                  <span>{availableSpells.length} доступно</span>
                  <small>ячейка {selectedSlot.level} уровня</small>
                </div>
                {availableSpells.map((spell) => {
                  const upcast = spell.baseLevel < selectedSlot.level
                  return (
                    <button
                      className="chat-spell-row"
                      type="button"
                      key={spell.id}
                      onClick={() => selectSpell(spell)}
                    >
                      <span className="chat-spell-row__level">{spell.baseLevel}</span>
                      <span className="chat-spell-row__copy">
                        <strong>{spell.name}</strong>
                        <small>{upcast ? `${spell.baseLevel} → ${selectedSlot.level} · ${spell.school}` : `${spell.baseLevel} ур. · ${spell.school}`}</small>
                        <em>{spell.damageOrEffect}</em>
                      </span>
                      <span className="chat-spell-row__go">›</span>
                    </button>
                  )
                })}
              </div>
            )}

            {view === "spell-detail" && selectedSpell && selectedSlot && (
              <div className="chat-spell-confirm">
                <div className="chat-spell-confirm__hero">
                  <span>✦</span>
                  <div>
                    <small>{selectedSpell.school}</small>
                    <strong>{selectedSpell.name}</strong>
                    <em>Ячейка {selectedSlot.level}</em>
                  </div>
                </div>
                <div className="chat-spell-confirm__facts">
                  <span><small>Эффект</small><strong>{selectedSpell.damageOrEffect}</strong></span>
                  <span><small>Проверка</small><strong>{selectedSpell.check}</strong></span>
                </div>
                <p>{selectedSpell.description}</p>
                {onOpenSpellReference && (
                  <button className="chat-reference-link" type="button" onClick={() => onOpenSpellReference(selectedSpell.id)}>
                    Открыть полное описание ›
                  </button>
                )}
                <button className="chat-cast-button" type="button" disabled={busy} onClick={() => void triggerSpell()}>
                  Произнести · ячейка {selectedSlot.level}
                </button>
              </div>
            )}

            {view === "cast-preview" && selectedSpell && selectedSlot && (
              <div className="chat-cast-preview">
                <div className="chat-cast-message">
                  <span className="chat-cast-message__rune">✦</span>
                  <div className="chat-cast-message__copy">
                    <small>{characterName || "Персонаж"} · ячейка {selectedSlot.level}</small>
                    <strong>{selectedSpell.name}</strong>
                    <span>{selectedSpell.damageOrEffect} · {selectedSpell.check}</span>
                    <em>Открыть описание ›</em>
                  </div>
                </div>
                <p>{demoNotice}</p>
                <button type="button" className="chat-action-secondary" onClick={() => move("slots")}>Выбрать другое заклинание</button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
