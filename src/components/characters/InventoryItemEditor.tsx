import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import ImageUploadField from "../common/ImageUploadField"
import ItemMechanicPresets from "./ItemMechanicPresets"
import MechanicsBuilder from "./MechanicsBuilder"
import { equipmentSlots, inventoryCategories } from "../../lib/dndInventory"
import { mechanicSummary } from "../../lib/characterMechanics"
import { deleteCampaignMediaObject, deleteCampaignMediaObjects } from "../../lib/mediaUpload"
import type { EquipmentSlot, InventoryCategory, InventoryInput, InventoryItem } from "../../types/characterSheet"
import type { StoredMechanic, StoredMechanics } from "../../types/characterMechanics"

type Props = {
  item: InventoryItem | null
  campaignId: string
  onClose: () => void
  onSave: (input: InventoryInput) => Promise<{ ok: boolean; error?: string }>
  onDelete?: () => Promise<{ ok: boolean; error?: string }>
}

type ItemPreset = "plain" | "weapon" | "armor" | "consumable" | "artifact"
type WizardStep = 1 | 2 | 3 | 4

type Preset = {
  id: ItemPreset
  icon: string
  title: string
  description: string
  category: InventoryCategory
  slot: EquipmentSlot
  hint: string
}

const presets: Preset[] = [
  { id: "plain", icon: "◇", title: "Обычная вещь", description: "Книга, инструмент, ключ, материал — без обязательной механики.", category: "other", slot: "other", hint: "Если ничего не добавлять дальше, предмет останется просто вещью." },
  { id: "weapon", icon: "⚔", title: "Оружие", description: "Предмет в руке с готовой базовой атакой, которую можно изменить.", category: "equipment", slot: "main_hand", hint: "Старт: действие, Сила, владение, 1d8 рубящего урона." },
  { id: "armor", icon: "⬡", title: "Броня / экипировка", description: "Надеваемая вещь. Бонусы и сопротивления добавляются только если нужны.", category: "equipment", slot: "chest", hint: "По умолчанию механического бонуса нет — выбери его на шаге эффектов." },
  { id: "consumable", icon: "◉", title: "Расходник", description: "Зелье, свиток, заряд или одноразовый предмет.", category: "consumable", slot: "other", hint: "Количество по умолчанию 1. Эффект необязателен." },
  { id: "artifact", icon: "✦", title: "Артефакт", description: "Уникальная вещь с любым набором бонусов, условий, ресурсов и действий.", category: "equipment", slot: "other", hint: "Никакой скрытой магии: всё, что делает артефакт, явно задаётся на шаге эффектов." },
]

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function weaponBase(): StoredMechanic {
  return {
    id: makeId(),
    type: "action",
    key: `action:weapon-${makeId()}`,
    label: "Атака оружием",
    economy: "action",
    attackAbility: "strength",
    proficient: true,
    attackFlat: 0,
    damage: [{ key: "primary", damageType: "рубящий", count: 1, sides: 8, ability: "strength", flat: 0 }],
    activation: "equipped",
  }
}

function presetForItem(item: InventoryItem | null): ItemPreset {
  if (!item) return "plain"
  if (item.category === "consumable") return "consumable"
  if (item.category !== "equipment") return "plain"
  if (item.mechanics?.some((mechanic) => mechanic.type === "action" && mechanic.activation === "equipped")) return "weapon"
  if (item.equipment_slot === "chest" || item.equipment_slot === "head" || item.equipment_slot === "legs") return "armor"
  return "artifact"
}

export default function InventoryItemEditor({ item, campaignId, onClose, onSave, onDelete }: Props) {
  const initialImageUrl = item?.image_url || ""
  const [step, setStep] = useState<WizardStep>(1)
  const [preset, setPreset] = useState<ItemPreset>(() => presetForItem(item))
  const [name, setName] = useState(item?.name || "")
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1))
  const [category, setCategory] = useState<InventoryCategory>(item?.category || "other")
  const [equipmentSlot, setEquipmentSlot] = useState<EquipmentSlot>(item?.equipment_slot || "other")
  const [equipped, setEquipped] = useState(item?.equipped || false)
  const [imageUrl, setImageUrl] = useState(initialImageUrl)
  const [description, setDescription] = useState(item?.description || "")
  const [mechanics, setMechanics] = useState<StoredMechanics>(item?.mechanics || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const currentPreset = presets.find((candidate) => candidate.id === preset) || presets[0]
  const reviewMechanics = useMemo(() => mechanics.slice(0, 4).map(mechanicSummary), [mechanics])

  function choosePreset(next: ItemPreset) {
    const selected = presets.find((candidate) => candidate.id === next) || presets[0]
    setPreset(next)
    setCategory(selected.category)
    setEquipmentSlot(selected.slot)
    setEquipped(false)
    if (!item && mechanics.length === 0 && next === "weapon") setMechanics([weaponBase()])
    if (!item && preset === "weapon" && next !== "weapon" && mechanics.length === 1 && mechanics[0]?.type === "action" && mechanics[0].label === "Атака оружием") setMechanics([])
  }

  async function cancel() {
    if (imageUrl && imageUrl !== initialImageUrl) await deleteCampaignMediaObject(imageUrl)
    onClose()
  }

  function nextStep() {
    setError("")
    if (step === 2 && !name.trim()) { setError("Укажи название предмета."); return }
    setStep((Math.min(4, step + 1)) as WizardStep)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (step < 4) { nextStep(); return }
    if (!name.trim()) { setError("Укажи название предмета."); setStep(2); return }
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
      <form className="bottom-sheet v2-editor-sheet creation-wizard" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="v2-sheet-head creation-wizard__head">
          <div>
            <span>{item ? "Редактирование" : "Создание"} · шаг {step} из 4</span>
            <h3>{item ? "Предмет" : "Новый предмет"}</h3>
            <p>{step === 1 ? "Сначала выбери, что это вообще за вещь." : step === 2 ? "Теперь только понятная база: название, вид, количество." : step === 3 ? "Добавь механику только если она действительно нужна." : "Проверь результат перед сохранением."}</p>
          </div>
          <button type="button" onClick={() => void cancel()}>×</button>
        </header>

        <div className="creation-wizard__progress" aria-label={`Шаг ${step} из 4`}>
          {[1, 2, 3, 4].map((value) => <i key={value} className={value <= step ? "is-active" : ""} />)}
        </div>

        {step === 1 && (
          <section className="creation-wizard__step">
            <div className="creation-wizard__intro"><span>01</span><div><strong>Что создаём?</strong><small>Выбор задаёт только разумную стартовую базу. Всё можно поменять дальше.</small></div></div>
            <div className="creation-preset-grid">
              {presets.map((candidate) => (
                <button type="button" key={candidate.id} className={preset === candidate.id ? "creation-preset is-active" : "creation-preset"} onClick={() => choosePreset(candidate.id)}>
                  <span>{candidate.icon}</span><div><strong>{candidate.title}</strong><small>{candidate.description}</small></div><i>{preset === candidate.id ? "✓" : "›"}</i>
                </button>
              ))}
            </div>
            <div className="creation-default-note"><span>↳</span><p><strong>{currentPreset.title}</strong><small>{currentPreset.hint}</small></p></div>
          </section>
        )}

        {step === 2 && (
          <section className="creation-wizard__step">
            <div className="creation-wizard__intro"><span>02</span><div><strong>База предмета</strong><small>Поля, которые игрок реально увидит в инвентаре.</small></div></div>
            <label className="field-label">Название</label>
            <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus placeholder={preset === "weapon" ? "Например: Длинный меч" : preset === "artifact" ? "Например: Сердце Пепла" : "Название предмета"} />
            <div className="v2-field-grid">
              <label><span className="field-label">Категория</span><select className="app-select" value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)}>{inventoryCategories.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
              <label><span className="field-label">Количество</span><input className="app-input" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
            </div>
            {category === "equipment" && <label><span className="field-label">Куда надевается</span><select className="app-select" value={equipmentSlot} onChange={(e) => setEquipmentSlot(e.target.value as EquipmentSlot)}>{equipmentSlots.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>}
            <ImageUploadField value={imageUrl} onChange={setImageUrl} folder="items" campaignId={campaignId} label="Арт предмета" />
            <label className="field-label">Описание <small className="creation-optional">необязательно</small></label>
            <textarea className="app-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} placeholder="Что увидит игрок, когда откроет предмет…" />
            {category === "equipment" && <label className="v2-toggle-row creation-inline-toggle"><span><strong>Надеть сразу</strong><small>Если выключено, предмет просто попадёт в инвентарь.</small></span><input type="checkbox" checked={equipped} onChange={(e) => setEquipped(e.target.checked)} /></label>}
          </section>
        )}

        {step === 3 && (
          <section className="creation-wizard__step">
            <div className="creation-wizard__intro"><span>03</span><div><strong>Что предмет делает?</strong><small>Этот шаг можно оставить пустым. Тогда предмет не влияет на Character Engine.</small></div></div>
            <div className="creation-default-note creation-default-note--neutral"><span>✦</span><p><strong>{mechanics.length ? `${mechanics.length} эффектов настроено` : "Без эффектов — это нормально"}</strong><small>Сначала выбери частый готовый эффект. Для редких правил ниже остаётся полный конструктор.</small></p></div>
            <ItemMechanicPresets value={mechanics} onChange={setMechanics} />
            <div className="creation-wizard__intro"><span>⚙</span><div><strong>Расширенная настройка</strong><small>Свои бонусы, произвольные теги, условия, атаки, ресурсы и нестандартные заклинания.</small></div></div>
            <MechanicsBuilder value={mechanics} onChange={setMechanics} itemMode />
          </section>
        )}

        {step === 4 && (
          <section className="creation-wizard__step">
            <div className="creation-wizard__intro"><span>04</span><div><strong>Проверка</strong><small>Никаких скрытых правил: здесь видно, что именно сохранится.</small></div></div>
            <div className="creation-review-card">
              <div className="creation-review-card__icon">{currentPreset.icon}</div>
              <div><small>{currentPreset.title}</small><strong>{name.trim() || "Без названия"}</strong><span>{inventoryCategories.find((option) => option.value === category)?.label || category}{category === "equipment" ? ` · ${equipmentSlots.find((option) => option.value === equipmentSlot)?.label || equipmentSlot}` : ""} · ×{Math.max(0, Number.parseInt(quantity || "0", 10) || 0)}</span></div>
            </div>
            <div className="creation-review-block"><span>Описание</span><p>{description.trim() || "Без описания."}</p></div>
            <div className="creation-review-block"><span>Механика</span>{reviewMechanics.length ? <ul>{reviewMechanics.map((summary) => <li key={summary}>{summary}</li>)}{mechanics.length > reviewMechanics.length && <li>И ещё {mechanics.length - reviewMechanics.length}…</li>}</ul> : <p>Нет эффектов. Предмет не меняет характеристики и действия персонажа.</p>}</div>
          </section>
        )}

        {error && <div className="auth-error">{error}</div>}
        <div className="v2-editor-actions creation-wizard__actions">
          {item && onDelete && step === 4 && <button className="v2-danger-button" type="button" onClick={() => void remove()} disabled={saving}>Удалить</button>}
          {step > 1 && <button className="v2-secondary-button" type="button" onClick={() => setStep((step - 1) as WizardStep)} disabled={saving}>Назад</button>}
          <button className="v2-primary-button" type="submit" disabled={saving}>{saving ? "Сохраняем…" : step < 4 ? "Далее" : item ? "Сохранить изменения" : "Создать предмет"}</button>
        </div>
      </form>
    </div>
  )
}
