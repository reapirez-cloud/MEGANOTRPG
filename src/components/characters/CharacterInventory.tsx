import { useMemo, useState } from "react"

import {
  categoryLabel,
  categoryOrder,
  categoryShort,
  equipmentSlots,
  inventoryCategories,
  slotLabel,
  slotOrder,
  slotShort,
} from "../../lib/dndInventory"
import type {
  EquipmentSlot,
  InventoryCategory,
  InventoryItem,
} from "../../types/characterSheet"
import CampaignImage from "../common/CampaignImage"
import ContextActionSheet, {
  type ContextAction,
} from "../common/ContextActionSheet"
import { useLongPressItem } from "../../hooks/useLongPressItem"

type Result = Promise<{ ok: boolean; error?: string }>

type Props = {
  mode: "inventory" | "equipment"
  items: InventoryItem[]
  canManage: boolean
  canEquip: boolean
  onCreate: () => void
  onEdit: (item: InventoryItem) => void
  onDelete: (itemId: string) => Result
  onSetEquipped: (
    itemId: string,
    equipped: boolean,
    equipmentSlot: EquipmentSlot | null,
  ) => Result
}

export default function CharacterInventory({
  mode,
  items,
  canManage,
  canEquip,
  onCreate,
  onEdit,
  onDelete,
  onSetEquipped,
}: Props) {
  const [filter, setFilter] = useState<"all" | InventoryCategory>("all")
  const [detail, setDetail] = useState<InventoryItem | null>(null)
  const [itemMenu, setItemMenu] = useState<InventoryItem | null>(null)
  const [actionError, setActionError] = useState("")
  const bindItemLongPress = useLongPressItem<InventoryItem>((item) => {
    setItemMenu(item)
  })

  async function quickEquip(item: InventoryItem) {
    setActionError("")
    const result = await onSetEquipped(
      item.id,
      !item.equipped,
      item.equipped ? item.equipment_slot : item.equipment_slot || "main_hand",
    )
    if (!result.ok) setActionError(result.error || "Не удалось изменить экипировку.")
  }

  async function removeItem(item: InventoryItem) {
    if (!window.confirm(`Удалить предмет «${item.name}»?`)) return
    setActionError("")
    const result = await onDelete(item.id)
    if (!result.ok) setActionError(result.error || "Не удалось удалить предмет.")
  }

  function itemActions(item: InventoryItem): ContextAction[] {
    return [
      {
        id: "open",
        label: "Открыть предмет",
        detail: "Описание, количество, вес и состояние",
        icon: "↗",
        onSelect: () => setDetail(item),
      },
      ...(item.category === "equipment" && canEquip
        ? [{
            id: "equip",
            label: item.equipped ? "Снять" : "Надеть",
            detail: item.equipped ? "Вернуть предмет в инвентарь" : "Использовать назначенный слот",
            icon: item.equipped ? "↓" : "↑",
            onSelect: () => quickEquip(item),
          }]
        : []),
      ...(canManage
        ? [
            {
              id: "edit",
              label: "Редактировать",
              detail: "Название, тег, количество, арт и описание",
              icon: "✎",
              onSelect: () => onEdit(item),
            },
            {
              id: "delete",
              label: "Удалить предмет",
              detail: "Предмет исчезнет из инвентаря",
              icon: "×",
              danger: true,
              onSelect: () => removeItem(item),
            },
          ]
        : []),
    ]
  }

  const itemActionNode = itemMenu ? (
    <ContextActionSheet
      title={itemMenu.name}
      subtitle="Долгое нажатие открывает действия с предметом"
      actions={itemActions(itemMenu)}
      onClose={() => setItemMenu(null)}
    />
  ) : null

  const sorted = useMemo(
    () => [...items].sort((a, b) => {
      const categoryDiff = categoryOrder(a.category) - categoryOrder(b.category)
      if (categoryDiff !== 0) return categoryDiff
      if (a.equipped !== b.equipped) return a.equipped ? -1 : 1
      return a.name.localeCompare(b.name, "ru")
    }),
    [items],
  )

  const visibleCategories = useMemo(
    () => inventoryCategories.filter((category) =>
      items.some((item) => item.category === category.value),
    ),
    [items],
  )

  const filtered = filter === "all"
    ? sorted
    : sorted.filter((item) => item.category === filter)

  if (mode === "equipment") {
    const equipped = items
      .filter((item) => item.category === "equipment" && item.equipped)
      .sort((a, b) => slotOrder(a.equipment_slot) - slotOrder(b.equipment_slot))

    return (
      <>
      <section className="character-tab-section">
        <div className="section-head">
          <div>
            <h3 className="section-title">Экипировка</h3>
            <p className="item-meta">Что сейчас надето и занято по слотам</p>
          </div>
        </div>

        <div className="equipment-overview surface">
          {equipmentSlots.map((slot) => {
            const item = equipped.find((entry) => entry.equipment_slot === slot.value)
            return (
              <button
                {...(item ? bindItemLongPress(item) : {})}
                className={`equipment-slot-row ${item ? "equipment-slot-row--filled" : ""}`}
                type="button"
                key={slot.value}
                onClick={() => item && setDetail(item)}
                disabled={!item}
                style={{ touchAction: "pan-y" }}
              >
                <span className="equipment-slot-row__slot">{slot.label}</span>
                {item ? (
                  <span className="equipment-slot-row__item">
                    <span className="equipment-slot-thumb">
                      {item.image_url ? <CampaignImage value={item.image_url} alt="" /> : "◆"}
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>×{item.quantity}{item.weight != null ? ` · ${item.weight} ф.` : ""}</small>
                    </span>
                  </span>
                ) : (
                  <span className="equipment-slot-row__empty">Пусто</span>
                )}
              </button>
            )
          })}
        </div>

        {equipped.length === 0 && (
          <div className="character-empty surface">Пока ничего не надето. Открой предмет в инвентаре и нажми «Надеть».</div>
        )}

        {actionError && <div className="auth-error">{actionError}</div>}

        {detail && (
          <InventoryDetail
            item={detail}
            canManage={canManage}
            canEquip={canEquip}
            onClose={() => setDetail(null)}
            onEdit={() => { setDetail(null); onEdit(detail) }}
            onSetEquipped={onSetEquipped}
          />
        )}
      </section>
      {itemActionNode}
      </>
    )
  }

  return (
    <section className="character-tab-section">
      <div className="section-head">
        <div>
          <h3 className="section-title">Инвентарь</h3>
          <p className="item-meta">Предметы разложены по тегам, а не одной кучей</p>
        </div>
        {canManage && (
          <button className="section-link" type="button" onClick={onCreate}>+ Предмет</button>
        )}
      </div>

      <div className="inventory-filter-strip">
        <button
          type="button"
          className={filter === "all" ? "inventory-filter-chip inventory-filter-chip--active" : "inventory-filter-chip"}
          onClick={() => setFilter("all")}
        >
          Все <span>{items.length}</span>
        </button>
        {visibleCategories.map((category) => {
          const count = items.filter((item) => item.category === category.value).length
          return (
            <button
              type="button"
              key={category.value}
              className={filter === category.value ? "inventory-filter-chip inventory-filter-chip--active" : "inventory-filter-chip"}
              onClick={() => setFilter(category.value)}
            >
              {category.short} <span>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="inventory-list inventory-list--clickable">
        {filtered.length === 0 && (
          <div className="character-empty surface">
            {items.length === 0 ? "Инвентарь пока пуст." : "В этой категории пока пусто."}
          </div>
        )}

        {filtered.map((item) => (
          <article
            {...bindItemLongPress(item)}
            className="inventory-card surface inventory-card--interactive"
            key={item.id}
            style={{ touchAction: "pan-y" }}
          >
            <button className="inventory-card__open" type="button" onClick={() => setDetail(item)}>
              <span className="inventory-card__art">
                {item.image_url ? <CampaignImage value={item.image_url} alt="" /> : <span>◆</span>}
              </span>
              <span className="inventory-card__body">
                <span className="inventory-card__top">
                  <strong>{item.name}</strong>
                  <span>×{item.quantity}</span>
                </span>
                <span className="inventory-card__tags">
                  <em>{categoryShort(item.category)}</em>
                  {item.category === "equipment" && <em>{slotShort(item.equipment_slot)}</em>}
                  {item.equipped && <em className="inventory-tag--equipped">Надето</em>}
                </span>
                <span className="inventory-card__preview">
                  {item.description || "Нажми, чтобы открыть предмет"}
                </span>
              </span>
            </button>

            {canManage && (
              <button className="card-edit-icon inventory-card__edit" type="button" onClick={() => onEdit(item)} aria-label="Редактировать предмет">✎</button>
            )}
          </article>
        ))}
      </div>

      {actionError && <div className="auth-error">{actionError}</div>}

      {detail && (
        <InventoryDetail
          item={detail}
          canManage={canManage}
          canEquip={canEquip}
          onClose={() => setDetail(null)}
          onEdit={() => { setDetail(null); onEdit(detail) }}
          onSetEquipped={onSetEquipped}
        />
      )}
      {itemActionNode}
    </section>
  )
}

function InventoryDetail({
  item,
  canManage,
  canEquip,
  onClose,
  onEdit,
  onSetEquipped,
}: {
  item: InventoryItem
  canManage: boolean
  canEquip: boolean
  onClose: () => void
  onEdit: () => void
  onSetEquipped: Props["onSetEquipped"]
}) {
  const [slot, setSlot] = useState<EquipmentSlot>(item.equipment_slot || "main_hand")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function toggleEquipment() {
    setSaving(true)
    setError("")
    const result = await onSetEquipped(
      item.id,
      !item.equipped,
      item.equipped ? item.equipment_slot : slot,
    )
    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось изменить экипировку.")
      return
    }

    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div className="bottom-sheet inventory-detail-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="inventory-detail-head">
          <div>
            <span className="inventory-detail-tag">{categoryLabel(item.category)}</span>
            <h3 className="sheet-title">{item.name}</h3>
            {item.category === "equipment" && <p className="sheet-copy">{slotLabel(item.equipment_slot)}</p>}
          </div>
          <button className="sheet-close" type="button" onClick={onClose}>×</button>
        </div>

        <div className="inventory-detail-art">
          {item.image_url ? <CampaignImage value={item.image_url} alt="" /> : <span>◆</span>}
        </div>

        <div className="inventory-detail-facts">
          <div><span>Количество</span><strong>{item.quantity}</strong></div>
          <div><span>Вес</span><strong>{item.weight == null ? "—" : `${item.weight} ф.`}</strong></div>
          <div><span>Состояние</span><strong>{item.equipped ? "Надето" : "В инвентаре"}</strong></div>
        </div>

        <div className="inventory-detail-description">
          <span>Описание</span>
          <p>{item.description || "У предмета пока нет описания."}</p>
        </div>

        {item.category === "equipment" && canEquip && !item.equipped && (
          <>
            <label className="field-label">Куда надеть</label>
            <select className="app-select" value={slot} onChange={(event) => setSlot(event.target.value as EquipmentSlot)}>
              {equipmentSlots.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </>
        )}

        {error && <div className="auth-error">{error}</div>}

        <div className="inventory-detail-actions">
          {canManage && <button className="secondary-action-button" type="button" onClick={onEdit}>✎ Изменить</button>}
          {item.category === "equipment" && canEquip && (
            <button
              className={item.equipped ? "equipment-action-button equipment-action-button--remove" : "equipment-action-button"}
              type="button"
              onClick={() => void toggleEquipment()}
              disabled={saving}
            >
              {saving ? "…" : item.equipped ? "Снять" : "Надеть"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
