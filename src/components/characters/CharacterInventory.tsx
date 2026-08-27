import { useMemo, useState } from "react"
import { categoryLabel, categoryOrder, equipmentSlots, slotLabel, slotOrder } from "../../lib/dndInventory"
import { itemCurseInfo, mechanicSummary, playerVisibleItemMechanics } from "../../lib/characterMechanics"
import type { EquipmentSlot, InventoryCategory, InventoryItem } from "../../types/characterSheet"
import CampaignImage from "../common/CampaignImage"
import ContextActionSheet, { type ContextAction } from "../common/ContextActionSheet"
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
  onSetEquipped: (itemId: string, equipped: boolean, equipmentSlot: EquipmentSlot | null) => Result
}

const groupOrder: InventoryCategory[] = ["equipment", "consumable", "tool", "book", "trinket", "quest", "material", "currency", "container", "other"]

function ItemThumb({ item }: { item: InventoryItem }) {
  return <span className="inventory-v2-thumb">{item.image_url ? <CampaignImage value={item.image_url} alt="" /> : <span>◇</span>}</span>
}

function ItemBadges({ item, canManage }: { item: InventoryItem; canManage: boolean }) {
  const curse = itemCurseInfo(item)
  const showCurse = curse.cursed && (canManage || curse.showCurseToPlayer)
  return <>{item.equipped && <i>Надето</i>}{showCurse && <i className="inventory-v2-curse-badge">☠ Проклято</i>}</>
}

function gameplayMechanics(item: InventoryItem, canManage: boolean) {
  return playerVisibleItemMechanics(item, canManage)
}

function searchableCurseText(item: InventoryItem, canManage: boolean) {
  const curse = itemCurseInfo(item)
  return canManage || (curse.showCurseToPlayer && curse.showCurseEffectToPlayer) ? curse.description : ""
}

export default function CharacterInventory(props: Props) {
  const { mode, items, canManage, canEquip, onCreate, onEdit, onDelete, onSetEquipped } = props
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Set<InventoryCategory>>(new Set())
  const [detail, setDetail] = useState<InventoryItem | null>(null)
  const [menu, setMenu] = useState<InventoryItem | null>(null)
  const [showEmptySlots, setShowEmptySlots] = useState(false)
  const [error, setError] = useState("")
  const bindLongPress = useLongPressItem<InventoryItem>((item) => setMenu(item))

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru-RU")
    return [...items]
      .sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category) || Number(b.equipped) - Number(a.equipped) || a.name.localeCompare(b.name, "ru"))
      .filter((item) => !q || `${item.name} ${item.description} ${searchableCurseText(item, canManage)}`.toLocaleLowerCase("ru-RU").includes(q))
  }, [canManage, items, query])

  async function toggleEquip(item: InventoryItem) {
    setError("")
    const result = await onSetEquipped(item.id, !item.equipped, item.equipped ? item.equipment_slot : item.equipment_slot || "main_hand")
    if (!result.ok) setError(result.error || "Не удалось изменить экипировку.")
    else setDetail(null)
  }

  async function remove(item: InventoryItem) {
    const result = await onDelete(item.id)
    if (!result.ok) setError(result.error || "Не удалось удалить предмет.")
  }

  function actions(item: InventoryItem): ContextAction[] {
    return [
      { id: "open", label: "Открыть", detail: "Описание и активные эффекты", icon: "↗", onSelect: () => setDetail(item) },
      ...(item.category === "equipment" && canEquip ? [{ id: "equip", label: item.equipped ? "Снять" : "Надеть", detail: item.equipped ? "Отключить эффекты экипировки" : "Активировать эффекты экипировки", icon: item.equipped ? "↓" : "↑", onSelect: () => toggleEquip(item) }] : []),
      ...(canManage ? [
        { id: "edit", label: "Редактировать", detail: "Основное, арт и механика", icon: "✎", onSelect: () => onEdit(item) },
        { id: "delete", label: "Удалить", detail: "Удалить предмет из инвентаря", icon: "×", danger: true, onSelect: () => remove(item) },
      ] : []),
    ]
  }

  if (mode === "equipment") {
    const equipped = items.filter((item) => item.category === "equipment" && item.equipped).sort((a, b) => slotOrder(a.equipment_slot) - slotOrder(b.equipment_slot))
    const occupied = new Set(equipped.map((item) => item.equipment_slot).filter(Boolean))
    const empty = equipmentSlots.filter((slot) => !occupied.has(slot.value))
    return (
      <section className="character-tab-section inventory-v2">
        <div className="inventory-v2-heading"><div><span>Сейчас на персонаже</span><h3>Экипировка</h3><p>Только занятые слоты и эффекты, которые реально работают.</p></div></div>
        <div className="equipment-v2-list">
          {equipped.map((item) => {
            const mechanics = gameplayMechanics(item, canManage)
            return <button {...bindLongPress(item)} style={{ touchAction: "pan-y" }} type="button" key={item.id} className="equipment-v2-row" onClick={() => setDetail(item)}>
              <span className="equipment-v2-slot">{slotLabel(item.equipment_slot)}</span><ItemThumb item={item} />
              <span className="equipment-v2-copy"><span><strong>{item.name}</strong><ItemBadges item={item} canManage={canManage} /></span><small>{mechanics.length ? mechanics.slice(0, 2).map(mechanicSummary).join(" · ") : "Без видимых механических эффектов"}</small></span><span className="equipment-v2-go">›</span>
            </button>
          })}
          {!equipped.length && <div className="v2-empty-state"><span>◇</span><strong>Ничего не надето</strong><p>Надень предмет из инвентаря — его механика сразу попадёт в Character Engine.</p></div>}
        </div>
        {empty.length > 0 && <div className="empty-slot-block"><button type="button" onClick={() => setShowEmptySlots((value) => !value)}><span>Свободные слоты</span><strong>{empty.length}</strong><em>{showEmptySlots ? "⌃" : "⌄"}</em></button>{showEmptySlots && <div className="empty-slot-grid">{empty.map((slot) => <span key={slot.value}>{slot.label}</span>)}</div>}</div>}
        {error && <div className="auth-error">{error}</div>}
        {detail && <InventoryDetail item={detail} canManage={canManage} canEquip={canEquip} onClose={() => setDetail(null)} onEdit={() => { setDetail(null); onEdit(detail) }} onToggle={() => toggleEquip(detail)} />}
        {menu && <ContextActionSheet title={menu.name} subtitle="Действия с предметом" actions={actions(menu)} onClose={() => setMenu(null)} />}
      </section>
    )
  }

  const groups = groupOrder.map((category) => ({ category, items: visible.filter((item) => item.category === category) })).filter((group) => group.items.length)
  return (
    <section className="character-tab-section inventory-v2">
      <div className="inventory-v2-heading"><div><span>Вещи персонажа</span><h3>Инвентарь</h3><p>Предметы сгруппированы по назначению; механика видна прямо в строке.</p></div>{canManage && <button type="button" onClick={onCreate}>＋ Предмет</button>}</div>
      {items.length > 7 && <label className="inventory-v2-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти предмет" /></label>}
      <div className="inventory-v2-groups">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.category)
          return <section className="inventory-v2-group" key={group.category}>
            <button className="inventory-v2-group-head" type="button" onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(group.category)) next.delete(group.category); else next.add(group.category); return next })}><span>{categoryLabel(group.category)}</span><small>{group.items.length}</small><em>{isCollapsed ? "⌄" : "⌃"}</em></button>
            {!isCollapsed && <div className="inventory-v2-list">{group.items.map((item) => {
              const mechanics = gameplayMechanics(item, canManage)
              return <article {...bindLongPress(item)} style={{ touchAction: "pan-y" }} className="inventory-v2-row" key={item.id}>
                <button type="button" className="inventory-v2-open" onClick={() => setDetail(item)}><ItemThumb item={item} /><span className="inventory-v2-copy"><span><strong>{item.name}</strong>{item.quantity > 1 && <em>×{item.quantity}</em>}<ItemBadges item={item} canManage={canManage} /></span><small>{mechanics.length ? mechanics.slice(0, 2).map(mechanicSummary).join(" · ") : item.description || "Без видимых дополнительных эффектов"}</small></span><span className="inventory-v2-go">›</span></button>
                {canManage && <button className="inventory-v2-edit" type="button" onClick={() => onEdit(item)} aria-label="Редактировать">•••</button>}
              </article>
            })}</div>}
          </section>
        })}
        {!groups.length && <div className="v2-empty-state"><span>◇</span><strong>{items.length ? "Ничего не найдено" : "Инвентарь пуст"}</strong><p>{items.length ? "Измени запрос поиска." : "Предметы появятся здесь, а их эффекты будут автоматически влиять на лист."}</p></div>}
      </div>
      {error && <div className="auth-error">{error}</div>}
      {detail && <InventoryDetail item={detail} canManage={canManage} canEquip={canEquip} onClose={() => setDetail(null)} onEdit={() => { setDetail(null); onEdit(detail) }} onToggle={() => toggleEquip(detail)} />}
      {menu && <ContextActionSheet title={menu.name} subtitle="Действия с предметом" actions={actions(menu)} onClose={() => setMenu(null)} />}
    </section>
  )
}

function InventoryDetail({ item, canManage, canEquip, onClose, onEdit, onToggle }: { item: InventoryItem; canManage: boolean; canEquip: boolean; onClose: () => void; onEdit: () => void; onToggle: () => void }) {
  const curse = itemCurseInfo(item)
  const showCurse = curse.cursed && (canManage || curse.showCurseToPlayer)
  const showCurseEffect = curse.cursed && (canManage || (curse.showCurseToPlayer && curse.showCurseEffectToPlayer))
  const mechanics = gameplayMechanics(item, canManage)
  return <div className="sheet-backdrop" onMouseDown={onClose}><section className="bottom-sheet inventory-v2-detail" onMouseDown={(e) => e.stopPropagation()}>
    <div className="sheet-handle" /><header className="v2-sheet-head"><div><span>{categoryLabel(item.category)}{item.equipment_slot ? ` · ${slotLabel(item.equipment_slot)}` : ""}</span><h3>{item.name}</h3><p>{item.equipped ? "Надето · активные эффекты учитываются" : "В инвентаре"}</p>{showCurse && <b className="inventory-v2-curse-badge inventory-v2-curse-badge--detail">☠ Проклято</b>}</div><button type="button" onClick={onClose}>×</button></header>
    {item.image_url && <CampaignImage className="inventory-v2-detail-art" value={item.image_url} alt="" />}
    {item.description && <div className="inventory-v2-description"><span>Описание</span><p>{item.description}</p></div>}
    {showCurse && <div className="inventory-v2-curse"><span>Проклятие</span><p>{showCurseEffect ? (curse.description || "Предмет проклят. Подробности проклятия не указаны.") : "Проклятие обнаружено. Его эффект неизвестен."}</p></div>}
    <div className="inventory-v2-effects"><span>Механика</span>{mechanics.length ? mechanics.map((mechanic) => <div key={mechanic.id}><i>✦</i><span><strong>{mechanicSummary(mechanic)}</strong><small>{mechanic.activation === "equipped" && !item.equipped ? "Неактивно: предмет нужно надеть" : `Источник: ${item.name}`}</small></span></div>) : <p>У предмета нет видимых механических эффектов.</p>}</div>
    <div className="v2-editor-actions">{canManage && <button type="button" className="v2-secondary-button" onClick={onEdit}>Редактировать</button>}{item.category === "equipment" && canEquip && <button type="button" className="v2-primary-button" onClick={onToggle}>{item.equipped ? "Снять" : "Надеть"}</button>}</div>
  </section></div>
}
