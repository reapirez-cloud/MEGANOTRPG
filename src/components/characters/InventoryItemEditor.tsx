import { useState } from "react"
import type { FormEvent } from "react"
import type { InventoryInput, InventoryItem } from "../../types/characterSheet"

type Props = {
  item: InventoryItem | null
  onClose: () => void
  onSave: (input: InventoryInput) => Promise<{ ok: boolean; error?: string }>
  onDelete?: () => Promise<{ ok: boolean; error?: string }>
}

export default function InventoryItemEditor({ item, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState(item?.name || "")
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1))
  const [weight, setWeight] = useState(item?.weight == null ? "" : String(item.weight))
  const [equipped, setEquipped] = useState(item?.equipped || false)
  const [imageUrl, setImageUrl] = useState(item?.image_url || "")
  const [description, setDescription] = useState(item?.description || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError("Укажи название предмета.")
      return
    }

    setSaving(true)
    setError("")
    const result = await onSave({
      name,
      quantity: Math.max(0, Number.parseInt(quantity || "0", 10) || 0),
      weight: weight.trim() ? Number(weight) : null,
      equipped,
      image_url: imageUrl || null,
      description,
    })
    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось сохранить предмет.")
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
      setError(result.error || "Не удалось удалить предмет.")
      return
    }
    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <form className="bottom-sheet compact-editor-sheet" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div><h3 className="sheet-title">{item ? "Редактировать предмет" : "Новый предмет"}</h3><p className="sheet-copy">Инвентарь заполняют GM или владелец.</p></div>
          <button className="sheet-close" type="button" onClick={onClose}>×</button>
        </div>

        <label className="field-label">Название</label>
        <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />

        <div className="dnd-editor-grid dnd-editor-grid--2">
          <label>Количество<input className="app-input" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          <label>Вес<input className="app-input" type="number" min="0" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
        </div>

        <label className="field-label">Арт предмета</label>
        <input className="app-input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Ссылка на изображение" />

        <label className="field-label">Описание</label>
        <textarea className="app-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} />

        <label className="dnd-switch-row">
          <span><strong>Экипировано</strong><small>Пометка для быстрого просмотра.</small></span>
          <input type="checkbox" checked={equipped} onChange={(e) => setEquipped(e.target.checked)} />
        </label>

        {error && <div className="auth-error">{error}</div>}
        <div className="editor-action-row">
          {item && onDelete && <button className="danger-mini-button" type="button" onClick={() => void remove()} disabled={saving}>Удалить</button>}
          <button className="sheet-save" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
        </div>
      </form>
    </div>
  )
}
