import { useMemo, useState } from "react"
import { categoryLabel, categoryOrder, equipmentSlots, slotLabel, slotOrder } from "../../lib/dndInventory"
import { itemCurseInfo, mechanicSummary, playerVisibleItemMechanics } from "../../lib/characterMechanics"
import type { EquipmentSlot, InventoryCategory, InventoryItem } from "../../types/characterSheet"
import CampaignImage from "../common/CampaignImage"
import ContextActionSheet, { type ContextAction } from "../common/ContextActionSheet"
import { useLongPressItem } from "../../hooks/useLongPressItem"
import "./CharacterInventory.css"

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

type InventoryFilter = "all" | InventoryCategory

const groupOrder: InventoryCategory[] = ["equipment", "consumable", "tool", "book", "trinket", "quest", "material", "currency", "container", "other"]

const categoryIcons: Record<InventoryCategory, string> = {
  equipment: "◆",
  consumable: "◉",
  tool: "⌁",
  book: "▤",
  trinket: "✦",
  quest: "◇",
  material: "⬡",
  currency: "◈",
  container: "▣",
  other: "·",
}

const slotIcons: Record<EquipmentSlot, string> = {
  head: "◠",
  neck: "◌",
  shoulders: "⌁",
  chest: "⬡",
  back: "▽",
  main_hand: "╱",
  off_hand: "╲",
  two_hands: "═",
  hands: "◇",
  wrists: "○",
  waist: "—",
  legs: "Ⅱ",
  feet: "⌄",
  ring_left: "◦",
  ring_right: "◦",
  ammo: "⋮",
  other: "＋",
}

function ItemThumb({ item, className = "" }: { item: InventoryItem; className?: string }) {
  return (
    <span className={`inventory-rpg__thumb ${className}`.trim()}>
      {item.image_url
        ? <CampaignImage value={item.image_url} alt="" />
        : <span aria-hidden="true">{categoryIcons[item.category]}</span>}
    </span>
  )
}

function gameplayMechanics(item: InventoryItem, canManage: boolean) {
  return playerVisibleItemMechanics(item, canManage)
}

function searchableCurseText(item: InventoryItem, canManage: boolean) {
  const curse = itemCurseInfo(item)
  return canManage || (curse.showCurseToPlayer && curse.showCurseEffectToPlayer) ? curse.description : ""
}

function itemPreview(item: InventoryItem, canManage: boolean) {
  const mechanics = gameplayMechanics(item, canManage)
  if (mechanics.length) return mechanics.slice(0, 2).map(mechanicSummary).join(" · ")
  if (item.description.trim()) return item.description.trim()
  return "Без дополнительных механических эффектов"
}

function chargeLabel(item: InventoryItem) {
  if (item.usage_mode !== "charges") return ""
  if (item.charges_max == null) return "Заряды"
  return `Заряды ${item.charges_current ?? item.charges_max}/${item.charges_max}`
}

function formatWeight(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)
}

function ItemBadges({ item, canManage }: { item: InventoryItem; canManage: boolean }) {
  const curse = itemCurseInfo(item)
  const showCurse = curse.cursed && (canManage || curse.showCurseToPlayer)
  const charges = chargeLabel(item)
  return (
    <span className="inventory-rpg__badges">
      {item.equipped && <i className="inventory-rpg__badge inventory-rpg__badge--equipped">Надето</i>}
      {charges && <i className="inventory-rpg__badge inventory-rpg__badge--charges">{charges}</i>}
      {showCurse && <i className="inventory-rpg__badge inventory-rpg__badge--curse">☠ Проклято</i>}
    </span>
  )
}

export default function CharacterInventory(props: Props) {
  const { mode, items, canManage, canEquip, onCreate, onEdit, onDelete, onSetEquipped } = props
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<InventoryFilter>("all")
  const [detail, setDetail] = useState<InventoryItem | null>(null)
  const [menu, setMenu] = useState<InventoryItem | null>(null)
  const [error, setError] = useState("")
  const bindLongPress = useLongPressItem<InventoryItem>((item) => setMenu(item))

  const counts = useMemo(() => {
    const category = new Map<InventoryCategory, number>()
    let units = 0
    let equipped = 0
    let weight = 0
    let hasWeight = false
    for (const item of items) {
      category.set(item.category, (category.get(item.category) || 0) + 1)
      units += Math.max(0, item.quantity)
      if (item.equipped) equipped += 1
      if (item.weight != null && Number.isFinite(item.weight)) {
        weight += Math.max(0, item.weight) * Math.max(0, item.quantity)
        hasWeight = true
      }
    }
    return { category, units, equipped, weight, hasWeight }
  }, [items])

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru-RU")
    return [...items]
      .sort((a, b) => Number(b.equipped) - Number(a.equipped) || categoryOrder(a.category) - categoryOrder(b.category) || a.name.localeCompare(b.name, "ru"))
      .filter((item) => filter === "all" || item.category === filter)
      .filter((item) => !q || `${item.name} ${item.description} ${categoryLabel(item.category)} ${slotLabel(item.equipment_slot)} ${searchableCurseText(item, canManage)}`.toLocaleLowerCase("ru-RU").includes(q))
  }, [canManage, filter, items, query])

  const equipped = useMemo(
    () => items.filter((item) => item.category === "equipment" && item.equipped).sort((a, b) => slotOrder(a.equipment_slot) - slotOrder(b.equipment_slot) || a.name.localeCompare(b.name, "ru")),
    [items],
  )

  const unequippedEquipment = useMemo(
    () => items.filter((item) => item.category === "equipment" && !item.equipped).sort((a, b) => slotOrder(a.equipment_slot) - slotOrder(b.equipment_slot) || a.name.localeCompare(b.name, "ru")),
    [items],
  )

  const equippedBySlot = useMemo(() => {
    const map = new Map<EquipmentSlot, InventoryItem[]>()
    for (const item of equipped) {
      const slot = item.equipment_slot || "other"
      const current = map.get(slot) || []
      current.push(item)
      map.set(slot, current)
    }
    return map
  }, [equipped])

  const activeMechanicsCount = useMemo(
    () => equipped.reduce((sum, item) => sum + gameplayMechanics(item, canManage).length, 0),
    [canManage, equipped],
  )

  async function toggleEquip(item: InventoryItem) {
    setError("")
    const result = await onSetEquipped(
      item.id,
      !item.equipped,
      item.equipped ? item.equipment_slot : item.equipment_slot || "main_hand",
    )
    if (!result.ok) {
      setError(result.error || "Не удалось изменить экипировку.")
      return
    }
    setDetail(null)
  }

  async function remove(item: InventoryItem) {
    setError("")
    const result = await onDelete(item.id)
    if (!result.ok) setError(result.error || "Не удалось удалить предмет.")
  }

  function actions(item: InventoryItem): ContextAction[] {
    return [
      { id: "open", label: "Просмотр", detail: "Описание, состояние и активные эффекты", icon: "↗", onSelect: () => setDetail(item) },
      ...(item.category === "equipment" && canEquip ? [{
        id: "equip",
        label: item.equipped ? "Снять" : "Надеть",
        detail: item.equipped ? "Отключить эффекты экипировки" : `Использовать слот: ${slotLabel(item.equipment_slot || "main_hand")}`,
        icon: item.equipped ? "↓" : "↑",
        onSelect: () => toggleEquip(item),
      } satisfies ContextAction] : []),
      ...(canManage ? [
        { id: "edit", label: "Редактировать", detail: "Название, арт, слот и механика", icon: "✎", onSelect: () => onEdit(item) } satisfies ContextAction,
        { id: "delete", label: "Удалить", detail: "Удалить предмет из инвентаря", icon: "×", danger: true, onSelect: () => remove(item) } satisfies ContextAction,
      ] : []),
    ]
  }

  const detailSheet = detail
    ? <InventoryDetail
        item={detail}
        canManage={canManage}
        canEquip={canEquip}
        onClose={() => setDetail(null)}
        onEdit={() => { setDetail(null); onEdit(detail) }}
        onToggle={() => toggleEquip(detail)}
      />
    : null

  const actionSheet = menu
    ? <ContextActionSheet title={menu.name} subtitle="Действия с предметом" actions={actions(menu)} onClose={() => setMenu(null)} />
    : null

  if (mode === "equipment") {
    return (
      <section className="character-tab-section inventory-rpg inventory-rpg--equipment">
        <header className="inventory-rpg__hero">
          <div className="inventory-rpg__hero-main">
            <div>
              <span className="inventory-rpg__eyebrow">Снаряжение персонажа</span>
              <h3>Экипировка</h3>
              <p>Здесь видно, что реально надето и какие предметы сейчас могут влиять на расчёты персонажа.</p>
            </div>
          </div>
          <div className="inventory-rpg__stats">
            <div className="inventory-rpg__stat"><small>Надето</small><strong>{equipped.length}</strong></div>
            <div className="inventory-rpg__stat"><small>Свободно</small><strong>{Math.max(0, equipmentSlots.length - equippedBySlot.size)}</strong></div>
            <div className="inventory-rpg__stat"><small>Эффектов</small><strong>{activeMechanicsCount}</strong></div>
          </div>
        </header>

        <section className="inventory-rpg__section">
          <div className="inventory-rpg__section-head">
            <div><small>Слоты</small><strong>На персонаже</strong></div>
            <span>{equipped.length ? `${equipped.length} предметов` : "Пусто"}</span>
          </div>
          <div className="inventory-rpg__equipment-board">
            {equipmentSlots.map((slot) => {
              const slotted = equippedBySlot.get(slot.value) || []
              const item = slotted[0] || null
              const content = (
                <>
                  <span className="inventory-rpg__slot-head">
                    <i className="inventory-rpg__slot-icon">{slotIcons[slot.value]}</i>
                    <span className="inventory-rpg__slot-label">{slot.short}</span>
                  </span>
                  {item
                    ? <span className="inventory-rpg__slot-item">
                        <span className="inventory-rpg__slot-thumb">{item.image_url ? <CampaignImage value={item.image_url} alt="" /> : categoryIcons[item.category]}</span>
                        <span className="inventory-rpg__slot-copy">
                          <strong>{item.name}</strong>
                          <small>{slotted.length > 1 ? `Ещё ${slotted.length - 1}` : "Надето"}</small>
                        </span>
                      </span>
                    : <span className="inventory-rpg__slot-empty">Свободно</span>}
                </>
              )
              if (!item) return <div className="inventory-rpg__slot is-empty" key={slot.value}>{content}</div>
              return (
                <button
                  {...bindLongPress(item)}
                  style={{ touchAction: "pan-y" }}
                  type="button"
                  className="inventory-rpg__slot is-filled"
                  key={slot.value}
                  onClick={() => setDetail(item)}
                >
                  {content}
                </button>
              )
            })}
          </div>
        </section>

        {unequippedEquipment.length > 0 && (
          <section className="inventory-rpg__section inventory-rpg__available">
            <div className="inventory-rpg__section-head">
              <div><small>Рюкзак</small><strong>Можно надеть</strong></div>
              <span>{unequippedEquipment.length}</span>
            </div>
            <div className="inventory-rpg__list">
              {unequippedEquipment.map((item) => (
                <article {...bindLongPress(item)} style={{ touchAction: "pan-y" }} className="inventory-rpg__equip-row" key={item.id}>
                  <button type="button" className="inventory-rpg__equip-open" onClick={() => setDetail(item)} aria-label={`Открыть ${item.name}`}>
                    <ItemThumb item={item} />
                    <span className="inventory-rpg__equip-copy">
                      <strong>{item.name}</strong>
                      <small>{slotLabel(item.equipment_slot)} · {itemPreview(item, canManage)}</small>
                    </span>
                  </button>
                  {canEquip && <button type="button" className="inventory-rpg__equip-button" onClick={() => void toggleEquip(item)}>Надеть</button>}
                </article>
              ))}
            </div>
          </section>
        )}

        {!items.some((item) => item.category === "equipment") && (
          <div className="inventory-rpg__empty">
            <span>◆</span>
            <strong>Экипировки пока нет</strong>
            <p>Когда в инвентаре появятся оружие, броня или другие надеваемые предметы, они будут доступны здесь.</p>
          </div>
        )}

        {error && <div className="inventory-rpg__error">{error}</div>}
        {detailSheet}
        {actionSheet}
      </section>
    )
  }

  const activeFilters = groupOrder.filter((category) => (counts.category.get(category) || 0) > 0)

  return (
    <section className="character-tab-section inventory-rpg inventory-rpg--items">
      <header className="inventory-rpg__hero">
        <div className="inventory-rpg__hero-main">
          <div>
            <span className="inventory-rpg__eyebrow">Вещи персонажа</span>
            <h3>Инвентарь</h3>
            <p>Предметы, расходники и ценности без стены мелкого текста. Долгое нажатие открывает действия.</p>
          </div>
          {canManage && <button className="inventory-rpg__create" type="button" onClick={onCreate}>＋ Предмет</button>}
        </div>
        <div className="inventory-rpg__stats">
          <div className="inventory-rpg__stat"><small>Позиций</small><strong>{items.length}</strong></div>
          <div className="inventory-rpg__stat"><small>Количество</small><strong>{counts.units}</strong></div>
          <div className="inventory-rpg__stat"><small>{counts.hasWeight ? "Вес" : "Надето"}</small><strong>{counts.hasWeight ? formatWeight(counts.weight) : counts.equipped}</strong></div>
        </div>
      </header>

      {items.length > 0 && (
        <div className="inventory-rpg__toolbar">
          <label className="inventory-rpg__search">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию, описанию или эффекту" />
          </label>
          <div className="inventory-rpg__filters" aria-label="Категории инвентаря">
            <button type="button" className={filter === "all" ? "inventory-rpg__filter is-active" : "inventory-rpg__filter"} onClick={() => setFilter("all")}>
              <i>≡</i><span>Все</span><small>{items.length}</small>
            </button>
            {activeFilters.map((category) => (
              <button type="button" key={category} className={filter === category ? "inventory-rpg__filter is-active" : "inventory-rpg__filter"} onClick={() => setFilter(category)}>
                <i>{categoryIcons[category]}</i><span>{categoryLabel(category)}</span><small>{counts.category.get(category) || 0}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.length > 0 ? (
        <div className="inventory-rpg__list">
          {visible.map((item) => (
            <article {...bindLongPress(item)} style={{ touchAction: "pan-y" }} className="inventory-rpg__item" key={item.id}>
              <button type="button" className="inventory-rpg__item-main" onClick={() => setDetail(item)}>
                <ItemThumb item={item} />
                <span className="inventory-rpg__item-copy">
                  <span className="inventory-rpg__item-title">
                    <strong>{item.name}</strong>
                    {item.quantity !== 1 && <em className="inventory-rpg__quantity">×{item.quantity}</em>}
                  </span>
                  <span className="inventory-rpg__item-meta">
                    <span>{categoryLabel(item.category)}</span>
                    {item.category === "equipment" && <><span className="inventory-rpg__dot">·</span><span>{slotLabel(item.equipment_slot)}</span></>}
                  </span>
                  <span className="inventory-rpg__item-preview">{itemPreview(item, canManage)}</span>
                  <ItemBadges item={item} canManage={canManage} />
                </span>
                <span className="inventory-rpg__chevron">›</span>
              </button>
              {canManage && <button className="inventory-rpg__menu" type="button" onClick={() => setMenu(item)} aria-label={`Действия с ${item.name}`}>•••</button>}
            </article>
          ))}
        </div>
      ) : (
        <div className="inventory-rpg__empty">
          <span>{items.length ? "⌕" : "◇"}</span>
          <strong>{items.length ? "Ничего не найдено" : "Инвентарь пуст"}</strong>
          <p>{items.length ? "Измени запрос или выбери другую категорию." : "Предметы появятся здесь. Их механика по-прежнему будет проходить через инвентарный движок и CE."}</p>
        </div>
      )}

      {error && <div className="inventory-rpg__error">{error}</div>}
      {detailSheet}
      {actionSheet}
    </section>
  )
}

function InventoryDetail({ item, canManage, canEquip, onClose, onEdit, onToggle }: {
  item: InventoryItem
  canManage: boolean
  canEquip: boolean
  onClose: () => void
  onEdit: () => void
  onToggle: () => void
}) {
  const curse = itemCurseInfo(item)
  const showCurse = curse.cursed && (canManage || curse.showCurseToPlayer)
  const showCurseEffect = curse.cursed && (canManage || (curse.showCurseToPlayer && curse.showCurseEffectToPlayer))
  const mechanics = gameplayMechanics(item, canManage)
  const weight = item.weight == null ? "—" : formatWeight(item.weight)
  const status = item.category === "equipment"
    ? item.equipped ? "Надето · эффекты экипировки активны" : "В инвентаре · эффекты экипировки неактивны"
    : "В инвентаре"

  return (
    <div className="sheet-backdrop inventory-rpg__backdrop" onMouseDown={onClose}>
      <section className="bottom-sheet inventory-rpg-detail" role="dialog" aria-modal="true" aria-label={item.name} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="inventory-rpg-detail__head">
          <ItemThumb item={item} />
          <div className="inventory-rpg-detail__title">
            <small>{categoryLabel(item.category)}{item.equipment_slot ? ` · ${slotLabel(item.equipment_slot)}` : ""}</small>
            <h3>{item.name}</h3>
            <p>{status}</p>
          </div>
          <button className="inventory-rpg-detail__close" type="button" onClick={onClose}>×</button>
        </header>

        {item.image_url && <div className="inventory-rpg-detail__art"><CampaignImage value={item.image_url} alt="" /></div>}

        <div className="inventory-rpg-detail__facts">
          <div className="inventory-rpg-detail__fact"><small>Количество</small><strong>{item.quantity}</strong></div>
          <div className="inventory-rpg-detail__fact"><small>Вес / шт.</small><strong>{weight}</strong></div>
          <div className="inventory-rpg-detail__fact"><small>Состояние</small><strong>{item.equipped ? "Надето" : "В рюкзаке"}</strong></div>
        </div>

        <ItemBadges item={item} canManage={canManage} />

        {item.description && <section className="inventory-rpg-detail__section"><small>Описание</small><p>{item.description}</p></section>}

        {showCurse && (
          <section className="inventory-rpg-detail__section inventory-rpg-detail__section--curse">
            <small>Проклятие</small>
            <p>{showCurseEffect ? (curse.description || "Предмет проклят. Подробности эффекта не указаны.") : "Проклятие обнаружено. Его эффект неизвестен."}</p>
          </section>
        )}

        <section className="inventory-rpg-detail__section">
          <small>Механика</small>
          {mechanics.length ? (
            <div className="inventory-rpg-detail__mechanics">
              {mechanics.map((mechanic) => {
                const inactive = mechanic.activation === "equipped" && !item.equipped
                return (
                  <div className={inactive ? "inventory-rpg-detail__mechanic is-inactive" : "inventory-rpg-detail__mechanic"} key={mechanic.id}>
                    <i>✦</i>
                    <span>
                      <strong>{mechanicSummary(mechanic)}</strong>
                      <small>{inactive ? "Неактивно: предмет нужно надеть" : mechanic.activation === "equipped" ? "Активно, пока предмет надет" : `Источник: ${item.name}`}</small>
                    </span>
                  </div>
                )
              })}
            </div>
          ) : <p>У предмета нет видимых механических эффектов.</p>}
        </section>

        {(canManage || (item.category === "equipment" && canEquip)) && (
          <footer className="inventory-rpg-detail__actions">
            {canManage && <button type="button" className="inventory-rpg-detail__edit" onClick={onEdit}>Редактировать</button>}
            {item.category === "equipment" && canEquip && <button type="button" className={item.equipped ? "inventory-rpg-detail__equip is-remove" : "inventory-rpg-detail__equip"} onClick={onToggle}>{item.equipped ? "Снять" : "Надеть"}</button>}
          </footer>
        )}
      </section>
    </div>
  )
}
