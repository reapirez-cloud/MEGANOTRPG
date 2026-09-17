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
import CharacterSectionState from "./CharacterSectionState.tsx"
import { SpellMiniIconRow } from "./SpellMiniIcon.tsx"
import { buildSpellMiniIcons } from "./spellMiniIcons.ts"
import { buildSpellbookRenderModel, type SpellbookMode } from "./spellbookRender.ts"
import "./CharacterSpellbookStage2.css"
import "./CharacterSpellbookStage3.css"
import "./CharacterSpellbookStage4.css"
import "./CharacterSpellbookStage5.css"
import "./CharacterSpellbookStage6.css"

type Props = {
  sheet: CharacterSheet
  contract: ResolvedCharacterContract
  classLabel?: string
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

function compactSpellFacts(spell: CharacterSpell) {
  return buildSpellMiniIcons(spell).filter((item) => item.kind !== "prepared")
}

export default function CharacterSpellbook(props: Props) {
  const {
    sheet,
    contract,
    classLabel,
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

  const [mode, setMode] = useState<SpellbookMode>(
    spells.some((spell) => spell.prepared) ? "prepared" : "known",
  )
  const [selectedSpell, setSelectedSpell] = useState<CharacterSpell | null>(null)

  const magic = spellcastingAbility
    ? contract.spellcasting.byAbility[spellcastingAbility]
    : null
  const renderModel = useMemo(() => buildSpellbookRenderModel({
    resources: contract.resources,
    spells,
    mode,
    selectedLevel,
  }), [contract.resources, mode, selectedLevel, spells])
  const {
    preparedCount,
    knownCount,
    slotRail,
    cantrips,
    levelSections,
  } = renderModel
  const cantripSectionVisible = selectedLevel === null || selectedLevel === 0
  const hasModeSpellContent = cantrips.count > 0 || levelSections.some((section) => section.spellCount > 0)

  const spellHeader = (
    <section className="spellbook-reference-shell" aria-label="Ячейки заклинаний">
      <header className="spellbook-reference-shell__head">
        <div className="spellbook-reference-shell__title">
          <small>Магия персонажа</small>
          <h2>ЯЧЕЙКИ ЗАКЛИНАНИЙ</h2>
        </div>
        <div className="spellbook-reference-shell__identity">
          <strong>{classLabel || "Заклинатель"}</strong>
          <span>Ур. {contract.level}</span>
        </div>
      </header>

      <div className="spellbook-reference-shell__rail" aria-label="Круги заклинаний с первого по девятый">
        {slotRail.map((slot) => {
          const active = selectedLevel === slot.level
          return (
            <button
              key={slot.level}
              type="button"
              className={`spellbook-reference-shell__circle${slot.available ? " is-available" : " is-locked"}${slot.depleted ? " is-depleted" : ""}${active ? " is-active" : ""}`}
              disabled={!slot.available}
              aria-pressed={slot.available ? active : undefined}
              aria-label={slot.available
                ? `${slot.level} круг: ${slot.current} из ${slot.maximum} ячеек${slot.depleted ? ", ячейки закончились" : ""}`
                : `${slot.level} круг недоступен`}
              onClick={() => onSelectedLevelChange(active ? null : slot.level)}
            >
              <span className="spellbook-reference-shell__level">{slot.level}</span>
              {slot.available ? (
                <span className="spellbook-reference-shell__cells" aria-hidden="true">
                  {slot.cells.map((cell) => (
                    <i key={cell.index} className={cell.filled ? "is-filled" : ""} />
                  ))}
                </span>
              ) : (
                <span className="spellbook-reference-shell__locked-mark" aria-hidden="true">×</span>
              )}
              <strong>{slot.available ? `${slot.current}/${slot.maximum}` : "—"}</strong>
            </button>
          )
        })}
      </div>
    </section>
  )

  if (!sheet.spellcasting_enabled) {
    return (
      <section className="spellbook-v3 spellbook-v3--empty character-spellbook-v5 character-specialized-v5">
        {spellHeader}
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
      {spellHeader}

      <div className="spellbook-reference-shell__summary">
        <span>{preparedCount} подготовлено</span>
        <span>{knownCount} изучено</span>
        <div className="spellbook-reference-shell__actions">
          {canManage && <button type="button" onClick={onEditResources}>Настроить ячейки</button>}
          <button type="button" onClick={onOpenReference}>Справочник</button>
        </div>
      </div>

      {(magic || spellcastingAbility) && (
        <div className="spellbook-v3__casting" aria-label="Показатели заклинателя">
          <div><span>Характеристика</span><strong>{spellcastingAbility ? abilityNames[spellcastingAbility] : "—"}</strong></div>
          <div><span>СЛ</span><strong>{magic?.saveDc ?? "—"}</strong></div>
          <div><span>Атака</span><strong>{magic ? signed(magic.attackBonus) : "—"}</strong></div>
        </div>
      )}

      <div className="spellbook-v3__mode" role="tablist" aria-label="Раздел заклинаний">
        <button type="button" role="tab" aria-selected={mode === "prepared"} className={mode === "prepared" ? "is-active" : ""} onClick={() => setMode("prepared")}>Подготовлено <span>{preparedCount}</span></button>
        <button type="button" role="tab" aria-selected={mode === "known"} className={mode === "known" ? "is-active" : ""} onClick={() => setMode("known")}>Изучено <span>{knownCount}</span></button>
      </div>

      {cantripSectionVisible && (
        <section className={`spellbook-cantrips${cantrips.expanded ? " is-expanded" : ""}`} aria-label="Заговоры">
          <button
            className="spellbook-cantrips__head"
            type="button"
            aria-expanded={cantrips.expanded}
            onClick={() => onSelectedLevelChange(cantrips.expanded ? null : 0)}
          >
            <span className="spellbook-cantrips__rune" aria-hidden="true">∞</span>
            <span className="spellbook-cantrips__heading">
              <small>0 круг</small>
              <strong>ЗАГОВОРЫ</strong>
            </span>
            <span className="spellbook-cantrips__count">
              <b>{cantrips.count}</b>
              <small>{cantrips.expanded ? "открыто" : "известно"}</small>
            </span>
            <span className="spellbook-cantrips__toggle" aria-hidden="true">⌄</span>
          </button>

          {cantrips.visibleSpells.length > 0 ? (
            <div className="spellbook-cantrips__preview">
              {cantrips.visibleSpells.map((spell) => (
                <button className="spellbook-cantrips__spell" type="button" key={spell.id} onClick={() => setSelectedSpell(spell)}>
                  <span className="spellbook-cantrips__spell-rune" aria-hidden="true">∞</span>
                  <span className="spellbook-cantrips__spell-copy">
                    <strong>{spell.name}</strong>
                    {spell.school && <small>{spell.school}</small>}
                    <SpellMiniIconRow items={compactSpellFacts(spell)} compact />
                  </span>
                  <span className="spellbook-cantrips__spell-chevron" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="spellbook-cantrips__empty">В этом режиме заговоров нет.</div>
          )}
        </section>
      )}

      {error && <CharacterSectionState compact kind="error" title="Заклинания не обновились" detail={error} />}

      <div className="spellbook-level-accordions" aria-label="Заклинания по кругам">
        {levelSections.map((section) => (
          <section
            className={`spellbook-level-panel${section.expanded ? " is-expanded" : ""}${section.slot.depleted ? " is-depleted" : ""}`}
            key={section.level}
          >
            <button
              className="spellbook-level-panel__head"
              type="button"
              aria-expanded={section.expanded}
              aria-controls={`spellbook-level-${section.level}`}
              onClick={() => onSelectedLevelChange(section.expanded ? null : section.level)}
            >
              <span className="spellbook-level-panel__rune" aria-hidden="true">{section.level}</span>
              <span className="spellbook-level-panel__heading">
                <small>{section.level} круг</small>
                <strong>ЗАКЛИНАНИЯ {section.level} КРУГА</strong>
              </span>
              <span className="spellbook-level-panel__count">
                <b>{section.spellCount}</b>
                <small>{mode === "prepared" ? "подгот." : "изучено"}</small>
              </span>
              <span className={`spellbook-level-panel__slots${section.slot.available ? "" : " is-none"}`}>
                {section.slot.available ? (
                  <>
                    <span className="spellbook-level-panel__slot-cells" aria-hidden="true">
                      {section.slot.cells.map((cell) => <i key={cell.index} className={cell.filled ? "is-filled" : ""} />)}
                    </span>
                    <small>{section.slot.current}/{section.slot.maximum} яч.</small>
                  </>
                ) : (
                  <small>без ячеек</small>
                )}
              </span>
              <span className="spellbook-level-panel__toggle" aria-hidden="true">⌄</span>
            </button>

            {section.expanded && (
              <div className="spellbook-level-panel__body" id={`spellbook-level-${section.level}`}>
                {section.spells.length > 0 ? (
                  <div className="spellbook-level-panel__list">
                    {section.spells.map((spell) => (
                      <article className="spellbook-v3__spell" key={spell.id}>
                        <button className="spellbook-v3__spell-main" type="button" onClick={() => setSelectedSpell(spell)}>
                          <span className="spellbook-v3__level-rune">{spell.spell_level}</span>
                          <span className="spellbook-v3__spell-copy">
                            <strong>{spell.name}</strong>
                            {spell.school && <small className="spellbook-v3__school">{spell.school}</small>}
                            <SpellMiniIconRow items={compactSpellFacts(spell)} compact />
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
                ) : (
                  <div className="spellbook-level-panel__empty">
                    {mode === "prepared" ? "На этом круге нет подготовленных заклинаний." : "На этом круге нет изученных заклинаний."}
                  </div>
                )}
              </div>
            )}
          </section>
        ))}
      </div>

      {selectedLevel === null && !hasModeSpellContent && (
        <CharacterSectionState
          compact
          kind="empty"
          title={mode === "prepared" ? "Нет подготовленных заклинаний" : "Список пуст"}
          detail="Добавить заклинание можно через Справочник."
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
          <SpellMiniIconRow
            items={buildSpellMiniIcons(selectedSpell).filter((item) =>
              item.kind === "components" || item.kind === "concentration" || item.kind === "ritual" || item.kind === "prepared",
            )}
          />
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
