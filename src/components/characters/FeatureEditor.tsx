import { useState } from "react"
import type { FormEvent } from "react"
import type { CharacterFeature, FeatureInput } from "../../types/characterSheet"
import type { StoredMechanics } from "../../types/characterMechanics"
import MechanicsBuilder from "./MechanicsBuilder"

type Props = {
  feature: CharacterFeature | null
  onClose: () => void
  onSave: (input: FeatureInput) => Promise<{ ok: boolean; error?: string }>
  onDelete?: () => Promise<{ ok: boolean; error?: string }>
}

export default function FeatureEditor({ feature, onClose, onSave, onDelete }: Props) {
  const [kind, setKind] = useState<FeatureInput["kind"]>(feature?.kind || "feat")
  const [name, setName] = useState(feature?.name || "")
  const [description, setDescription] = useState(feature?.description || "")
  const [mechanics, setMechanics] = useState<StoredMechanics>(feature?.mechanics || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) { setError("Укажи название."); return }
    setSaving(true); setError("")
    const result = await onSave({ kind, name: name.trim(), description, mechanics })
    setSaving(false)
    if (!result.ok) { setError(result.error || "Не удалось сохранить."); return }
    onClose()
  }

  async function remove() {
    if (!onDelete) return
    setSaving(true); setError("")
    const result = await onDelete(); setSaving(false)
    if (!result.ok) { setError(result.error || "Не удалось удалить."); return }
    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <form className="bottom-sheet v2-editor-sheet" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="v2-sheet-head">
          <div><span>Особенность</span><h3>{feature ? "Редактировать" : "Новая особенность"}</h3><p>Один редактор для фитов, классовых черт и уникальных правил персонажа.</p></div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <section className="v2-form-section">
          <div className="v2-section-label"><span>01</span><div><strong>Описание</strong><small>Название и текст, который видит игрок</small></div></div>
          <label className="field-label">Тип</label>
          <select className="app-select" value={kind} onChange={(e) => setKind(e.target.value as FeatureInput["kind"])}>
            <option value="feat">Фит</option><option value="class_feature">Классовая особенность</option><option value="racial_trait">Расовая особенность</option><option value="feature">Особенность</option><option value="other">Другое</option>
          </select>
          <label className="field-label">Название</label>
          <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={140} autoFocus />
          <label className="field-label">Описание</label>
          <textarea className="app-textarea dnd-long-text" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
        </section>

        <section className="v2-form-section">
          <div className="v2-section-label"><span>02</span><div><strong>Механика</strong><small>То, что реально меняет resolved-персонажа</small></div></div>
          <MechanicsBuilder value={mechanics} onChange={setMechanics} />
        </section>

        {error && <div className="auth-error">{error}</div>}
        <div className="v2-editor-actions">
          {feature && onDelete && <button className="v2-danger-button" type="button" onClick={() => void remove()} disabled={saving}>Удалить</button>}
          <button className="v2-primary-button" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
        </div>
      </form>
    </div>
  )
}
