import { useState } from "react"
import type { FormEvent } from "react"
import ImageUploadField from "../common/ImageUploadField"

import { equipmentSlots, inventoryCategories } from "../../lib/dndInventory"
import {
  deleteCampaignMediaObject,
  deleteCampaignMediaObjects,
} from "../../lib/mediaUpload"
import type {
  EquipmentSlot,
  InventoryCategory,
  InventoryInput,
  InventoryItem,
} from "../../types/characterSheet"

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
  const [category, setCategory] = useState<InventoryCategory>(item?.category || "other")
  const [equipmentSlot, setEquipmentSlot] = useState<EquipmentSlot>(item?.equipment_slot || "main_hand")
  const [equipped, setEquipped] = useState(item?.equipped || false)
  const [imageUrl, setImageUrl] = useState(initialImageUrl)
  const [description, setDescription] = useState(item?.description || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function cancel() {
    if (imageUrl && imageUrl !== initialImageUrl) {
      await deleteCampaignMediaObject(imageUrl)
    }
    onClose()
  }

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
      // Вес больше не используется в текстовом интерфейсе. Старое значение
      // сохраняем при редактировании, чтобы скрытие поля не уничтожало данные.
      weight: item?.weight ?? null,
      category,
      equipment_slot: category === "equipment" ? equipmentSlot : null,
      equipped: category === "equipment" ? equipped : false,
      image_url: imageUrl || null,
      description,
    })
    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось сохранить предмет.")
      return
    }

    if (initialImageUrl && initialImageUrl !== imageUrl) {
      void deleteCampaignMediaObject(initialImageUrl)
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

    await deleteCampaignMediaObjects([
      initialImageUrl,
      imageUrl !== initialImageUrl ? imageUrl : null,
    ])
    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={() => void cancel()}>
      <form className="bottom-sheet compact-editor-sheet" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div>
            <h3 className="sheet-title">{item ? "Редактировать предмет" : "Новый предмет"}</h3>
            <p className="sheet-copy">ГМ задаёт предмет, его тег и слот. Игрок потом сам надевает и снимает свою экипировку.</p>
          </div>
          <button className="sheet-close" type="button" onClick={() => void cancel()}>×</button>
        </div>

        <label className="field-label">Название</label>
        <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />

        <label className="field-label">Тег</label>
        <select className="app-select" value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)}>
          {inventoryCategories.map((option) => (
            <option value={option.value} key={option.value}>{option.label}</option>
          ))}
        </select>

        {category === "equipment" && (
          <>
            <label className="field-label">Слот экипировки</label>
            <select className="app-select" value={equipmentSlot} onChange={(e) => setEquipmentSlot(e.target.value as EquipmentSlot)}>
              {equipmentSlots.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </>
        )}

        <label className="field-label">Количество</label>
        <input className="app-input" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />

        <ImageUploadField
          value={imageUrl}
          onChange={setImageUrl}
          folder="items"
          campaignId={campaignId}
          label="Арт предмета"
        />

        <label className="field-label">Описание</label>
        <textarea className="app-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} />

        {category === "equipment" && (
          <label className="dnd-switch-row">
            <span><strong>Надеть сразу</strong><small>ГМ может сразу пометить предмет надетым. Потом игрок управляет этим сам.</small></span>
            <input type="checkbox" checked={equipped} onChange={(e) => setEquipped(e.target.checked)} />
          </label>
        )}

        {error && <div className="auth-error">{error}</div>}
        <div className="editor-action-row">
          {item && onDelete && <button className="danger-mini-button" type="button" onClick={() => void remove()} disabled={saving}>Удалить</button>}
          <button className="sheet-save" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
        </div>
      </form>
    </div>
  )
}
