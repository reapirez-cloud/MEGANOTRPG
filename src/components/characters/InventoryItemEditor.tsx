import { useState } from "react"
import type { FormEvent } from "react"
import ImageUploadField from "../common/ImageUploadField"
import MechanicsBuilder from "./MechanicsBuilder"
import { equipmentSlots, inventoryCategories } from "../../lib/dndInventory"
import { deleteCampaignMediaObject, deleteCampaignMediaObjects } from "../../lib/mediaUpload"
import type { EquipmentSlot, InventoryCategory, InventoryInput, InventoryItem } from "../../types/characterSheet"
import type { StoredMechanics } from "../../types/characterMechanics"

type Props = {
  item: InventoryItem | null
  campaignId: string
  onClose: () => void
  onSave: (input: InventoryInput) => Promise<{ ok: boolean; error?: string }>
  onDelete?: () => Promise<{ ok: boolean; error?: string }>
}

export default function InventoryItemEditor({ item, campaignId, onClose, onSave, onDelete }: Props) {
  const initialImageUrl = item?.image_url || ""
  const [name, setName] = useState(item?.name || "")
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1))
  const [category, setCategory] = useState<InventoryCategory>(item?.category || "equipment")
  const [equipmentSlot, setEquipmentSlot] = useState<EquipmentSlot>(item?.equipment_slot || "main_hand")
  const [equipped, setEquipped] = useState(item?.equipped || false)
  const [imageUrl, setImageUrl] = useState(initialImageUrl)
  const [description, setDescription] = useState(item?.description || "")
  const [mechanics, setMechanics] = useState<StoredMechanics>(item?.mechanics || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function cancel() {
    if (imageUrl && imageUrl !== initialImageUrl) await deleteCampaignMediaObject(imageUrl)
    onClose()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) { setError("Укажи название предмета."); return }
    setSaving(true); setError("")
    const result = await onSave({
      name: name.trim(),
      quantity: Math.max(0, Number.parseInt(quantity || "0", 10) || 0),
      weight: item?.weight ?? null,
      category,
      equipment_slot: category === "equipment" ? equipmentSlot : null,
      equipped: category === "equipment" ? equipped : false,
      image_url: imageUrl || null,
      description,
      mechanics,
    })
    setSaving(false)
    if (!result.ok) { setError(result.error || "Не удалось сохранить предмет."); return }
    if (initialImageUrl && initialImageUrl !== imageUrl) void deleteCampaignMediaObject(initialImageUrl)
    onClose()
  }

  async function remove() {
    if (!onDelete) return
    setSaving(true); setError("")
    const result = await onDelete(); setSaving(false)
    if (!result.ok) { setError(result.error || "Не удалось удалить предмет."); return }
    await deleteCampaignMediaObjects([initialImageUrl, imageUrl !== initialImageUrl ? imageUrl : null])
    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={() => void cancel()}>
      <form className="bottom-sheet v2-editor-sheet" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="v2-sheet-head">
          <div><span>Инвентарь</span><h3>{item ? "Редактировать предмет" : "Новый предмет"}</h3><p>Описание — для людей. Эффекты ниже — реальные правила Character Engine.</p></div>
          <button type="button" onClick={() => void cancel()}>×</button>
        </header>

        <section className="v2-form-section">
          <div className="v2-section-label"><span>01</span><div><strong>Основное</strong><small>Как предмет выглядит в инвентаре</small></div></div>
          <label className="field-label">Название</label>
          <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          <div className="v2-field-grid">
            <label><span className="field-label">Категория</span><select className="app-select" value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)}>{inventoryCategories.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            <label><span className="field-label">Количество</span><input className="app-input" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          </div>
          {category === "equipment" && <label><span className="field-label">Слот</span><select className="app-select" value={equipmentSlot} onChange={(e) => setEquipmentSlot(e.target.value as EquipmentSlot)}>{equipmentSlots.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>}
          <ImageUploadField value={imageUrl} onChange={setImageUrl} folder="items" campaignId={campaignId} label="Арт предмета" />
          <label className="field-label">Описание</label>
          <textarea className="app-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} placeholder="Что увидит игрок, когда откроет предмет…" />
        </section>

        {category === "equipment" && (
          <section className="v2-form-section v2-form-section--compact">
            <label className="v2-toggle-row"><span><strong>Надеть сразу</strong><small>Эффекты с условием «только надет» включатся сразу после сохранения.</small></span><input type="checkbox" checked={equipped} onChange={(e) => setEquipped(e.target.checked)} /></label>
          </section>
        )}

        <section className="v2-form-section">
          <div className="v2-section-label"><span>02</span><div><strong>Эффекты и действия</strong><small>Бонусы, условия, заряды, атаки и заклинания</small></div></div>
          <MechanicsBuilder value={mechanics} onChange={setMechanics} itemMode />
        </section>

        {error && <div className="auth-error">{error}</div>}
        <div className="v2-editor-actions">
          {item && onDelete && <button className="v2-danger-button" type="button" onClick={() => void remove()} disabled={saving}>Удалить</button>}
          <button className="v2-primary-button" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить предмет"}</button>
        </div>
      </form>
    </div>
  )
}
