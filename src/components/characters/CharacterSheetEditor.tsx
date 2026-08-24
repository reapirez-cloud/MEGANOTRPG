import { useMemo, useState } from "react"
import type { ChangeEvent, FormEvent } from "react"

import type { CharacterSheet, SkillRank } from "../../types/characterSheet"

const abilities = [
  ["strength", "Сила"],
  ["dexterity", "Ловкость"],
  ["constitution", "Телосложение"],
  ["intelligence", "Интеллект"],
  ["wisdom", "Мудрость"],
  ["charisma", "Харизма"],
] as const

const skills = [
  ["acrobatics", "Акробатика"],
  ["animal_handling", "Уход за животными"],
  ["arcana", "Магия"],
  ["athletics", "Атлетика"],
  ["deception", "Обман"],
  ["history", "История"],
  ["insight", "Проницательность"],
  ["intimidation", "Запугивание"],
  ["investigation", "Анализ"],
  ["medicine", "Медицина"],
  ["nature", "Природа"],
  ["perception", "Восприятие"],
  ["performance", "Выступление"],
  ["persuasion", "Убеждение"],
  ["religion", "Религия"],
  ["sleight_of_hand", "Ловкость рук"],
  ["stealth", "Скрытность"],
  ["survival", "Выживание"],
] as const

type Props = {
  sheet: CharacterSheet
  onClose: () => void
  onSave: (input: Partial<CharacterSheet>) => Promise<{ ok: boolean; error?: string }>
}

export default function CharacterSheetEditor({ sheet, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CharacterSheet>({ ...sheet })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const saveSet = useMemo(
    () => new Set(draft.saving_throw_proficiencies || []),
    [draft.saving_throw_proficiencies],
  )

  function numberField(
    key: keyof CharacterSheet,
    value: number,
  ) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const parsed = Number.parseInt(event.target.value || "0", 10)
      setDraft((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : value }))
    }
  }

  function toggleSave(key: string) {
    const next = new Set(saveSet)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setDraft((current) => ({
      ...current,
      saving_throw_proficiencies: Array.from(next),
    }))
  }

  function setSkill(key: string, rank: SkillRank) {
    setDraft((current) => ({
      ...current,
      skill_proficiencies: {
        ...(current.skill_proficiencies || {}),
        [key]: rank,
      },
    }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")

    const result = await onSave(draft)
    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось сохранить лист.")
      return
    }

    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <form
        className="bottom-sheet dnd-sheet-editor"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div>
            <h3 className="sheet-title">Редактировать лист</h3>
            <p className="sheet-copy">Основные параметры D&D-персонажа.</p>
          </div>
          <button className="sheet-close" type="button" onClick={onClose}>×</button>
        </div>

        <div className="dnd-editor-section">
          <h4>Основное</h4>
          <div className="dnd-editor-grid dnd-editor-grid--2">
            <label>Раса / вид<input className="app-input" value={draft.race} onChange={(e) => setDraft({ ...draft, race: e.target.value })} /></label>
            <label>Предыстория<input className="app-input" value={draft.background} onChange={(e) => setDraft({ ...draft, background: e.target.value })} /></label>
            <label>Мировоззрение<input className="app-input" value={draft.alignment} onChange={(e) => setDraft({ ...draft, alignment: e.target.value })} /></label>
            <label>Опыт<input className="app-input" type="number" min="0" value={draft.experience} onChange={numberField("experience", draft.experience)} /></label>
          </div>
        </div>

        <div className="dnd-editor-section">
          <h4>Характеристики</h4>
          <div className="dnd-editor-grid dnd-editor-grid--3">
            {abilities.map(([key, label]) => (
              <label key={key}>{label}<input className="app-input" type="number" min="1" max="30" value={draft[key]} onChange={numberField(key, draft[key])} /></label>
            ))}
          </div>
        </div>

        <div className="dnd-editor-section">
          <h4>Бой</h4>
          <div className="dnd-editor-grid dnd-editor-grid--3">
            <label>КД<input className="app-input" type="number" min="0" value={draft.armor_class} onChange={numberField("armor_class", draft.armor_class)} /></label>
            <label>Инициатива<input className="app-input" type="number" value={draft.initiative_bonus} onChange={numberField("initiative_bonus", draft.initiative_bonus)} /></label>
            <label>Скорость<input className="app-input" type="number" min="0" value={draft.speed} onChange={numberField("speed", draft.speed)} /></label>
            <label>Бонус мастерства<input className="app-input" type="number" value={draft.proficiency_bonus} onChange={numberField("proficiency_bonus", draft.proficiency_bonus)} /></label>
            <label>Макс. HP<input className="app-input" type="number" min="0" value={draft.max_hp} onChange={numberField("max_hp", draft.max_hp)} /></label>
            <label>Текущие HP<input className="app-input" type="number" min="0" value={draft.current_hp} onChange={numberField("current_hp", draft.current_hp)} /></label>
            <label>Временные HP<input className="app-input" type="number" min="0" value={draft.temp_hp} onChange={numberField("temp_hp", draft.temp_hp)} /></label>
            <label>Пассивное восприятие<input className="app-input" type="number" value={draft.passive_perception} onChange={numberField("passive_perception", draft.passive_perception)} /></label>
            <label>Кости хитов<input className="app-input" value={draft.hit_dice} onChange={(e) => setDraft({ ...draft, hit_dice: e.target.value })} placeholder="Напр. 5d8" /></label>
            <label>Успехи спасбросков от смерти<input className="app-input" type="number" min="0" max="3" value={draft.death_save_successes} onChange={numberField("death_save_successes", draft.death_save_successes)} /></label>
            <label>Провалы<input className="app-input" type="number" min="0" max="3" value={draft.death_save_failures} onChange={numberField("death_save_failures", draft.death_save_failures)} /></label>
          </div>
        </div>

        <div className="dnd-editor-section">
          <h4>Спасброски</h4>
          <div className="dnd-check-grid">
            {abilities.map(([key, label]) => (
              <label className="dnd-check" key={key}>
                <input type="checkbox" checked={saveSet.has(key)} onChange={() => toggleSave(key)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="dnd-editor-section">
          <h4>Навыки</h4>
          <div className="dnd-skill-edit-list">
            {skills.map(([key, label]) => (
              <label className="dnd-skill-edit-row" key={key}>
                <span>{label}</span>
                <select
                  className="app-select"
                  value={draft.skill_proficiencies?.[key] || 0}
                  onChange={(e) => setSkill(key, Number(e.target.value) as SkillRank)}
                >
                  <option value={0}>Нет</option>
                  <option value={1}>Владение</option>
                  <option value={2}>Экспертиза</option>
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="dnd-editor-section">
          <h4>Заклинания</h4>
          <label className="dnd-switch-row">
            <span><strong>Персонаж использует заклинания</strong><small>Вкладка появится игроку только если включено.</small></span>
            <input type="checkbox" checked={draft.spellcasting_enabled} onChange={(e) => setDraft({ ...draft, spellcasting_enabled: e.target.checked })} />
          </label>

          {draft.spellcasting_enabled && (
            <div className="dnd-editor-grid dnd-editor-grid--3">
              <label>Базовая характеристика<input className="app-input" value={draft.spellcasting_ability || ""} onChange={(e) => setDraft({ ...draft, spellcasting_ability: e.target.value || null })} placeholder="Мудрость" /></label>
              <label>СЛ спасброска<input className="app-input" type="number" value={draft.spell_save_dc ?? ""} onChange={(e) => setDraft({ ...draft, spell_save_dc: e.target.value ? Number(e.target.value) : null })} /></label>
              <label>Бонус атаки<input className="app-input" type="number" value={draft.spell_attack_bonus ?? ""} onChange={(e) => setDraft({ ...draft, spell_attack_bonus: e.target.value ? Number(e.target.value) : null })} /></label>
            </div>
          )}
        </div>

        <div className="dnd-editor-section">
          <h4>Владения и описание</h4>
          <label>Владения<textarea className="app-textarea" value={draft.proficiencies} onChange={(e) => setDraft({ ...draft, proficiencies: e.target.value })} /></label>
          <label>Языки<textarea className="app-textarea" value={draft.languages} onChange={(e) => setDraft({ ...draft, languages: e.target.value })} /></label>
          <label>Чувства<textarea className="app-textarea" value={draft.senses} onChange={(e) => setDraft({ ...draft, senses: e.target.value })} /></label>
          <label>Черты личности<textarea className="app-textarea" value={draft.personality_traits} onChange={(e) => setDraft({ ...draft, personality_traits: e.target.value })} /></label>
          <label>Идеалы<textarea className="app-textarea" value={draft.ideals} onChange={(e) => setDraft({ ...draft, ideals: e.target.value })} /></label>
          <label>Привязанности<textarea className="app-textarea" value={draft.bonds} onChange={(e) => setDraft({ ...draft, bonds: e.target.value })} /></label>
          <label>Слабости<textarea className="app-textarea" value={draft.flaws} onChange={(e) => setDraft({ ...draft, flaws: e.target.value })} /></label>
          <label>Предыстория персонажа<textarea className="app-textarea dnd-long-text" value={draft.backstory} onChange={(e) => setDraft({ ...draft, backstory: e.target.value })} /></label>
          <label>Заметки<textarea className="app-textarea" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
        </div>

        {error && <div className="auth-error">{error}</div>}
        <button className="sheet-save" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить лист"}</button>
      </form>
    </div>
  )
}
