import { useState } from "react"
import type { FormEvent } from "react"
import type { CharacterSpell, SpellInput } from "../../types/characterSheet"

type Props = {
  spell: CharacterSpell | null
  onClose: () => void
  onSave: (input: SpellInput) => Promise<{ ok: boolean; error?: string }>
  onDelete?: () => Promise<{ ok: boolean; error?: string }>
}

export default function SpellEditor({ spell, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<SpellInput>({
    name: spell?.name || "",
    spell_level: spell?.spell_level ?? 0,
    school: spell?.school || "",
    casting_time: spell?.casting_time || "",
    spell_range: spell?.spell_range || "",
    duration: spell?.duration || "",
    components: spell?.components || "",
    concentration: spell?.concentration || false,
    ritual: spell?.ritual || false,
    prepared: spell?.prepared || false,
    description: spell?.description || "",
    source: spell?.source || "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError("Укажи название заклинания.")
      return
    }
    setSaving(true)
    setError("")
    const result = await onSave(draft)
    setSaving(false)
    if (!result.ok) {
      setError(result.error || "Не удалось сохранить заклинание.")
      return
    }
    onClose()
  }

  async function remove() {
    if (!onDelete) return
    setSaving(true)
    setError("")
    const result = await onDelete()
    setSaving(false)
    if (!result.ok) {
      setError(result.error || "Не удалось удалить заклинание.")
      return
    }
    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <form className="bottom-sheet compact-editor-sheet" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div><h3 className="sheet-title">{spell ? "Редактировать заклинание" : "Добавить заклинание"}</h3><p className="sheet-copy">Список заклинаний может менять сам игрок.</p></div>
          <button className="sheet-close" type="button" onClick={onClose}>×</button>
        </div>

        <label className="field-label">Название</label>
        <input className="app-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={140} autoFocus />

        <div className="dnd-editor-grid dnd-editor-grid--2">
          <label>Уровень<select className="app-select" value={draft.spell_level} onChange={(e) => setDraft({ ...draft, spell_level: Number(e.target.value) })}>{Array.from({ length: 10 }, (_, level) => <option value={level} key={level}>{level === 0 ? "Заговор" : `${level} уровень`}</option>)}</select></label>
          <label>Школа<input className="app-input" value={draft.school} onChange={(e) => setDraft({ ...draft, school: e.target.value })} placeholder="Воплощение" /></label>
          <label>Время накладывания<input className="app-input" value={draft.casting_time} onChange={(e) => setDraft({ ...draft, casting_time: e.target.value })} placeholder="1 действие" /></label>
          <label>Дистанция<input className="app-input" value={draft.spell_range} onChange={(e) => setDraft({ ...draft, spell_range: e.target.value })} placeholder="60 фт." /></label>
          <label>Длительность<input className="app-input" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} /></label>
          <label>Компоненты<input className="app-input" value={draft.components} onChange={(e) => setDraft({ ...draft, components: e.target.value })} placeholder="В, С, М" /></label>
          <label>Источник<input className="app-input" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="PHB / класс" /></label>
        </div>

        <div className="spell-toggle-grid">
          <label><input type="checkbox" checked={draft.prepared} onChange={(e) => setDraft({ ...draft, prepared: e.target.checked })} /> Подготовлено</label>
          <label><input type="checkbox" checked={draft.concentration} onChange={(e) => setDraft({ ...draft, concentration: e.target.checked })} /> Концентрация</label>
          <label><input type="checkbox" checked={draft.ritual} onChange={(e) => setDraft({ ...draft, ritual: e.target.checked })} /> Ритуал</label>
        </div>

        <label className="field-label">Описание</label>
        <textarea className="app-textarea dnd-long-text" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={7000} />

        {error && <div className="auth-error">{error}</div>}
        <div className="editor-action-row">
          {spell && onDelete && <button className="danger-mini-button" type="button" onClick={() => void remove()} disabled={saving}>Удалить</button>}
          <button className="sheet-save" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
        </div>
      </form>
    </div>
  )
}
