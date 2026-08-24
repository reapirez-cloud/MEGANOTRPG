import { useState } from "react"
import type { FormEvent } from "react"
import type { CharacterFeature, FeatureInput } from "../../types/characterSheet"

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError("Укажи название.")
      return
    }
    setSaving(true)
    const result = await onSave({ kind, name, description })
    setSaving(false)
    if (!result.ok) {
      setError(result.error || "Не удалось сохранить.")
      return
    }
    onClose()
  }

  async function remove() {
    if (!onDelete) return
    setSaving(true)
    const result = await onDelete()
    setSaving(false)
    if (!result.ok) {
      setError(result.error || "Не удалось удалить.")
      return
    }
    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <form className="bottom-sheet compact-editor-sheet" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div><h3 className="sheet-title">{feature ? "Редактировать особенность" : "Добавить особенность"}</h3><p className="sheet-copy">Фиты, классовые и расовые особенности.</p></div>
          <button className="sheet-close" type="button" onClick={onClose}>×</button>
        </div>

        <label className="field-label">Тип</label>
        <select className="app-select" value={kind} onChange={(e) => setKind(e.target.value as FeatureInput["kind"])}>
          <option value="feat">Фит</option>
          <option value="class_feature">Классовая особенность</option>
          <option value="racial_trait">Расовая особенность</option>
          <option value="feature">Особенность</option>
          <option value="other">Другое</option>
        </select>

        <label className="field-label">Название</label>
        <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={140} autoFocus />
        <label className="field-label">Описание</label>
        <textarea className="app-textarea dnd-long-text" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />

        {error && <div className="auth-error">{error}</div>}
        <div className="editor-action-row">
          {feature && onDelete && <button className="danger-mini-button" type="button" onClick={() => void remove()} disabled={saving}>Удалить</button>}
          <button className="sheet-save" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
        </div>
      </form>
    </div>
  )
}
