import { useMemo, useState } from "react"

import type {
  AbilityKey,
  ResolvedCharacterContract,
} from "../../character-engine/index.ts"
import type {
  CharacterSheet,
  CharacterSpell,
  CharacterSpellOption,
} from "../../types/characterSheet.ts"
import CharacterDetailSheet from "./CharacterDetailSheet.tsx"
import CharacterSectionHeader from "./CharacterSectionHeader.tsx"
import CharacterSectionState from "./CharacterSectionState.tsx"
import SpellSlotMeter from "./SpellSlotMeter.tsx"
import { spellSlotResources } from "./spellSlots.ts"

type SpellMode = "prepared" | "known"

type Props = {
  sheet: CharacterSheet
  contract: ResolvedCharacterContract
  spellcastingAbility?: AbilityKey
  spells: CharacterSpell[]
  /** Legacy catalog-option projection. Kept in the prop contract during migration, never authored here. */
  options: CharacterSpellOption[]
  canManage: boolean
  canChooseSpells: boolean
  selectedLevel: number | null
  actionId: string | null
  error: string
  onSelectedLevelChange: (level: number | null) => void
  onOpenReference: () => void
  onEditResources: () => void
  onEnableMagic: () => void
  onDisableMagic: () => void
  /** Legacy callbacks stay accepted so old profile shells remain source-compatible. */
  onAddOption: () => void
  onEditOption: (option: CharacterSpellOption) => void
  onLearn: (option: CharacterSpellOption) => void
  onTogglePrepared: (spell: CharacterSpell) => void
  onForget: (spell: CharacterSpell) => void
  onEditSpell: (spell: CharacterSpell) => void
}

const abilityNames: Record<AbilityKey, string> = {
  strength: "Сила",
  dexterity: "Ловкость",
  constitution: "Телосложение",
  intelligence: "Интеллект",
  wisdom: "Мудрость",
  charisma: "Харизма",
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

function levelName(level: number) {
  return level === 0 ? "Заговор" : `${level} уровень`
}

function spellMeta(spell: CharacterSpell) {
  return [spell.school, spell.casting_time, spell.spell_range]
    .filter(Boolean)
    .join(" · ") || "Параметры не указаны"
}

export default function CharacterSpellbook(props: Props) {
  const {
    sheet,
    contract,
    spellcastingAbility,
    spells,
    canManage,
    canChooseSpells,
    selectedLevel,
    actionId,
    error,
    onSelectedLevelChange,
    onOpenReference,
    onEditResources,
    onEnableMagic,
    onDisableMagic,
    onTogglePrepared,
    onForget,
  } = props

  const [mode, setMode] = useState<SpellMode>(
    spells.some((spell) => spell.prepared) ? "prepared" : "known",
  )
  const [selectedSpell, setSelectedSpell] = useState<CharacterSpell | null>(null)

  const magic = spellcastingAbility
    ? contract.spellcasting.byAbility[spellcastingAbility]
    : null
  const preparedCount = spells.filter((spell) => spell.prepared).length
  const levels = useMemo(() => {
    const values = new Set<number>()
    for (const spell of spells) values.add(spell.spell_level)
    for (const slot of spellSlotResources(contract.resources)) values.add(slot.level)
    return [...values].sort((left, right) => left - right)
  }, [contract.resources, spells])

  const visibleSpells = spells.filter((spell) =>
    (mode !== "prepared" || spell.prepared) &&
    (selectedLevel === null || spell.spell_level === selectedLevel),
  )

  if (!sheet.spellcasting_enabled) {
    return (
      <section className="spellbook-v3 spellbook-v3--empty character-spellbook-v5 character-specialized-v5">
        <CharacterSectionHeader eyebrow="Магия персонажа" title="Магия" icon="✦" action={<button type="button" onClick={onOpenReference}>Справочник</button>} />
        <CharacterSectionState
          kind="empty"
          title="Магия не открыта"
          detail="У персонажа пока нет активного доступа к разделу заклинаний."
          action={canManage ? <button className="section-link" type="button" onClick={onEnableMagic}>Включить магию</button> : undefined}
        />
      </section>
    )
  }

  return (
    <section className="spellbook-v3 character-spellbook-v5 character-specialized-v5">
      <CharacterSectionHeader
        eyebrow="Магия персонажа"
        title="Магия"
        detail="Подготовка, известные заклинания и доступные ячейки."
        icon="✦"
        meta={<>
          <span>{preparedCount} подготовлено</span>
          <span>{spells.length} изучено</span>
        </>}
        action={<button type="button" onClick={onOpenReference}>Справочник</button>}
      />

      {(magic || spellcastingAbility) && (
        <div className="spellbook-v3__casting" aria-label="Показатели заклинателя">
          <div><span>Характеристика</span><strong>{spellcastingAbility ? abilityNames[spellcastingAbility] : "—"}</strong></div>
          <div><span>СЛ</span><strong>{magic?.saveDc ?? "—"}</strong></div>
          <div><span>Атака</span><strong>{magic ? signed(magic.attackBonus) : "—"}</strong></div>
        </div>
      )}

      <div className="spellbook-v3__slots">
        <div className="sheet-v3__section-heading">
          <div><span>Ресурс</span><h3>Ячейки заклинаний</h3></div>
          {canManage && <button type="button" onClick={onEditResources}>Настроить</button>}
        </div>
        <SpellSlotMeter
          resources={contract.resources}
          selectedLevel={selectedLevel}
          onSelect={(level) => onSelectedLevelChange(selectedLevel === level ? null : level)}
        />
      </div>

      <div className="spellbook-v3__mode" role="tablist" aria-label="Раздел заклинаний">
        <button type="button" role="tab" aria-selected={mode === "prepared"} className={mode === "prepared" ? "is-active" : ""} onClick={() => setMode("prepared")}>Подготовлено <span>{preparedCount}</span></button>
        <button type="button" role="tab" aria-selected={mode === "known"} className={mode === "known" ? "is-active" : ""} onClick={() => setMode("known")}>Изучено <span>{spells.length}</span></button>
      </div>

      <div className="spellbook-v3__levels" aria-label="Фильтр по уровню">
        <button type="button" className={selectedLevel === null ? "is-active" : ""} onClick={() => onSelectedLevelChange(null)}>Все</button>
        {levels.map((level) => (
          <button type="button" key={level} className={selectedLevel === level ? "is-active" : ""} onClick={() => onSelectedLevelChange(level)}>
            {level === 0 ? "Заговоры" : level}
          </button>
        ))}
      </div>

      {error && <CharacterSectionState compact kind="error" title="Заклинания не обновились" detail={error} />}

      <div className="spellbook-v3__list">
        {visibleSpells.map((spell) => (
          <article className="spellbook-v3__spell" key={spell.id}>
            <button className="spellbook-v3__spell-main" type="button" onClick={() => setSelectedSpell(spell)}>
              <span className="spellbook-v3__level-rune">{spell.spell_level === 0 ? "∞" : spell.spell_level}</span>
              <span className="spellbook-v3__spell-copy">
                <strong>{spell.name}</strong>
                <small>{spellMeta(spell)}</small>
              </span>
              <span className="spellbook-v3__chevron" aria-hidden="true">›</span>
            </button>
            <div className="spellbook-v3__spell-actions">
              {canChooseSpells ? (
                <button
                  type="button"
                  className={spell.prepared ? "spellbook-v3__prepare is-prepared" : "spellbook-v3__prepare"}
                  aria-pressed={spell.prepared}
                  disabled={actionId === `prepare:${spell.id}`}
                  onClick={() => onTogglePrepared(spell)}
                >
                  <span aria-hidden="true">{spell.prepared ? "◆" : "◇"}</span>
                  {spell.prepared ? "Подготовлено" : "Подготовить"}
                </button>
              ) : spell.prepared ? (
                <span className="spellbook-v3__prepared-label">◆ Подготовлено</span>
              ) : <span />}
            </div>
          </article>
        ))}
      </div>

      {visibleSpells.length === 0 && (
        <CharacterSectionState
          compact
          kind="empty"
          title={mode === "prepared" ? "Нет подготовленных заклинаний" : "Список пуст"}
          detail={selectedLevel === null ? "Добавить заклинание можно через Справочник." : "На выбранном уровне ничего не найдено."}
        />
      )}

      <button className="spellbook-v3__add-option" type="button" onClick={onOpenReference}>
        + Добавить из Справочника
      </button>

      {!canManage && (
        <div className="spellbook-v3__access-note">
          <span className={sheet.spell_change_unlocked ? "is-open" : ""} aria-hidden="true" />
          <div>
            <strong>{sheet.spell_change_unlocked ? "Смена заклинаний открыта" : "Смена заклинаний закрыта"}</strong>
            <p>{sheet.spell_change_unlocked ? "Можно менять подготовку и добавлять разрешённые заклинания." : "Заклинания доступны для просмотра без изменения выбора."}</p>
          </div>
        </div>
      )}

      {canManage && (
        <button className="spellbook-v3__disable" type="button" onClick={onDisableMagic}>Отключить магию у персонажа</button>
      )}

      {selectedSpell && (
        <CharacterDetailSheet eyebrow={levelName(selectedSpell.spell_level)} title={selectedSpell.name} onClose={() => setSelectedSpell(null)} className="character-spell-detail-v5">
          <div className="character-spell-detail-v5__facts">
            {selectedSpell.school && <div><span>Школа</span><strong>{selectedSpell.school}</strong></div>}
            {selectedSpell.casting_time && <div><span>Накладывание</span><strong>{selectedSpell.casting_time}</strong></div>}
            {selectedSpell.spell_range && <div><span>Дистанция</span><strong>{selectedSpell.spell_range}</strong></div>}
            {selectedSpell.duration && <div><span>Длительность</span><strong>{selectedSpell.duration}</strong></div>}
          </div>
          <div className="character-spell-detail-v5__tags">
            {selectedSpell.concentration && <span>Концентрация</span>}
            {selectedSpell.ritual && <span>Ритуал</span>}
            {selectedSpell.components && <span>{selectedSpell.components}</span>}
          </div>
          <p className="character-spell-detail-v5__description">{selectedSpell.description || "Описание приходит из Справочника."}</p>
          {selectedSpell.source && <small className="character-spell-detail-v5__source">Источник: {selectedSpell.source}</small>}
          {canChooseSpells && <div className="character-spell-detail-v5__actions">
            <button type="button" className="spell-detail-v3__primary" onClick={() => onTogglePrepared(selectedSpell)}>
              {selectedSpell.prepared ? "Убрать подготовку" : "Подготовить"}
            </button>
            <button type="button" className="spell-detail-v3__danger" onClick={() => onForget(selectedSpell)}>Убрать из изученных</button>
          </div>}
        </CharacterDetailSheet>
      )}
    </section>
  )
}
