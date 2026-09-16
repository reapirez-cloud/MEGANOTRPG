import { useMemo, useState, type ReactNode } from "react"

import { useAIViewContextLayer } from "../ai/AIProvider"
import {
  type AbilityKey,
  type ResolvedGrant,
  type ResolvedResource,
  type SkillKey,
} from "../character-engine/index.ts"
import CampaignMediaFrame from "../components/common/CampaignMediaFrame"
import { useResolvedCharacterRuntime } from "../hooks/useResolvedCharacterRuntime"
import type { SnakeAction } from "../snake-engine"
import {
  inventoryChildren,
  inventoryContainerTargets,
  inventoryHolder,
} from "../inventory-engine/holders"
import {
  firstAvailableGridPlacement,
  firstFreeExternalSlot,
  inventoryExternalCarryCapacity,
  inventoryPhysicalProfile,
  inventoryPlacementKind,
  type InventoryPlacementTarget,
} from "../inventory-engine"
import { inventoryStackMode } from "../inventory-engine/stacking"
import type { CharacterFeature, CharacterSheet, CharacterSpell, InventoryItem } from "../types/characterSheet"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import InventorySpatialView from "./InventorySpatialView"
import { openSourceAction } from "./GMWorkshopCommon"
import { createCharacterSnakeActions } from "./characterSnakeActions"
import { createWorkshopCharacterActions } from "./gmWorkshopSnakeActions"
import { useGMWorkshopData } from "./useGMWorkshopData"
import { useUiV1CharacterControl } from "./useUiV1CharacterControl"
import { useWorkspaceData } from "./useWorkspaceData"
import "./character-view.css"

type FocusSection = "inventory" | "spells" | "features" | "defenses" | null

const abilityFields: Array<[keyof CharacterSheet, AbilityKey, string, string]> = [
  ["strength", "strength", "СИЛ", "Сила"],
  ["dexterity", "dexterity", "ЛВК", "Ловкость"],
  ["constitution", "constitution", "ТЕЛ", "Телосложение"],
  ["intelligence", "intelligence", "ИНТ", "Интеллект"],
  ["wisdom", "wisdom", "МДР", "Мудрость"],
  ["charisma", "charisma", "ХАР", "Харизма"],
]

const skillLabels: Record<SkillKey, string> = {
  acrobatics: "Акробатика",
  animal_handling: "Уход за животными",
  arcana: "Магия",
  athletics: "Атлетика",
  deception: "Обман",
  history: "История",
  insight: "Проницательность",
  intimidation: "Запугивание",
  investigation: "Анализ",
  medicine: "Медицина",
  nature: "Природа",
  perception: "Восприятие",
  performance: "Выступление",
  persuasion: "Убеждение",
  religion: "Религия",
  sleight_of_hand: "Ловкость рук",
  stealth: "Скрытность",
  survival: "Выживание",
}

const resourceMarks: Record<string, string> = {
  channel_divinity: "✦",
  wild_shape: "◈",
  second_wind: "↟",
  action_surge: "⌁",
  monk_focus: "⊙",
  monk_uncanny_metabolism: "◌",
  sorcery_points: "✺",
  innate_sorcery: "✹",
  sorcerous_restoration: "⌇",
  wizard_arcane_recovery: "△",
  wizard_chronurgy_chronal_shift: "◐",
  wizard_chronurgy_momentary_stasis: "□",
  wizard_chronurgy_arcane_abeyance: "◇",
  warlock_pact_slots: "◆",
}

const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"]

function number(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function signed(value: number) {
  return value >= 0 ? "+" + value : String(value)
}

function titleFromKey(value: string) {
  const clean = value.replace(/[._:-]+/g, " ").replace(/\s+/g, " ").trim()
  if (!clean) return "Ресурс"
  return clean.charAt(0).toLocaleUpperCase("ru-RU") + clean.slice(1)
}

function resourceMark(key: string) {
  if (key.startsWith("wizard_signature_")) return "✥"
  if (resourceMarks[key]) return resourceMarks[key]
  const parts = key.split(/[._:\s-]+/).filter(Boolean)
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toLocaleUpperCase("ru-RU")
  return (parts[0] || "◇").slice(0, 2).toLocaleUpperCase("ru-RU")
}

function grantLabel(grant: ResolvedGrant) {
  const payload =
    grant.payload && typeof grant.payload === "object" && !Array.isArray(grant.payload)
      ? grant.payload as Record<string, unknown>
      : null
  const label = typeof payload?.label === "string" ? payload.label.trim() : ""
  return label || titleFromKey(grant.key)
}

function itemDetail(item: InventoryItem, inventory: readonly InventoryItem[]) {
  const holder = inventoryHolder(inventory, item)
  const children = item.category === "container"
    ? inventoryChildren(inventory, item.id)
    : []
  return [
    item.category ? "Категория: " + item.category : "",
    "Количество: " + item.quantity,
    inventoryStackMode(item) === "instance" ? "Отдельный экземпляр." : "Стопка.",
    holder ? "Находится в: " + holder.name : "Находится в корневом инвентаре.",
    item.category === "container"
      ? children.length
        ? "Внутри: " + children.map((child) => child.name + (child.quantity > 1 ? ` ×${child.quantity}` : "")).join(", ")
        : "Контейнер пуст."
      : "",
    item.usage_mode === "charges"
      ? "Заряды: " + (item.charges_current ?? item.charges_max ?? 0) + "/" + (item.charges_max ?? 0)
      : item.usage_mode === "quantity" ? "Использование расходует 1 единицу." : "",
    item.equipped ? "Сейчас экипировано." : "",
    item.description || "Описание не добавлено.",
  ].filter(Boolean).join("\n\n")
}

function spellDetail(spell: CharacterSpell) {
  const meta = [
    spell.spell_level === 0 ? "Заговор" : spell.spell_level + " уровень",
    spell.school,
    spell.casting_time,
    spell.spell_range,
    spell.duration,
  ].filter(Boolean).join(" · ")
  return [meta, spell.description || "Описание не добавлено."].filter(Boolean).join("\n\n")
}

function featureDetail(feature: CharacterFeature) {
  return [feature.kind, feature.description || "Описание не добавлено."].filter(Boolean).join("\n\n")
}

function Section({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: ReactNode
}) {
  return (
    <section className="u1-character-view__section">
      <header>
        <strong>{title}</strong>
        {meta && <small>{meta}</small>}
      </header>
      {children}
    </section>
  )
}

export default function CharacterView({
  characterId,
  onBack,
}: {
  characterId: string
  onBack: () => void
}) {
  const control = useUiV1CharacterControl(characterId)
  const workshop = useGMWorkshopData()
  const workspace = useWorkspaceData()
  const snake = useSnake()
  const runtime = useResolvedCharacterRuntime(control.runtimeEntity)
  const [focus, setFocus] = useState<FocusSection>(null)
  const [inventoryHolderId, setInventoryHolderId] = useState<string | null>(null)
  const [expandedAbility, setExpandedAbility] = useState<AbilityKey | null>(null)

  const contract = runtime.snapshot?.contract || null
  const spellcastingAbility = runtime.snapshot?.spellcastingAbility
  const magic = contract && spellcastingAbility
    ? contract.spellcasting.byAbility[spellcastingAbility]
    : null

  useAIViewContextLayer(
    "character-view",
    control.loading
      ? null
      : {
          screen: "character",
          route: "#/workspace/character/" + characterId,
          title: control.character ? "Персонаж · " + control.character.name : "Персонаж",
          text: control.character
            ? "Открыт игровой лист персонажа «" + control.character.name + "»."
            : "Страница персонажа открыта, но данные персонажа недоступны.",
          entity: control.character
            ? { type: "character", id: control.character.id, label: control.character.name }
            : { type: "character", id: characterId },
          facts: control.character
            ? {
                focus: focus || "sheet",
                expandedAbility,
                class: control.character.characterClass,
                level: control.character.level,
                hp: contract
                  ? {
                      current: contract.combat.currentHp,
                      max: contract.combat.maxHp.value,
                      temp: contract.combat.tempHp,
                    }
                  : null,
                resources: contract?.resources.slice(0, 30).map((resource) => ({
                  key: resource.stateKey,
                  current: resource.current,
                  max: resource.max.value,
                })) || control.resources.slice(0, 30),
                inventory: control.inventory.slice(0, 40).map((item) => ({
                  id: item.id,
                  name: item.name,
                  quantity: item.quantity,
                  equipped: item.equipped,
                  holderItemId: item.holder_item_id ?? null,
                })),
                spells: control.spells.slice(0, 40).map((spell) => ({
                  id: spell.id,
                  name: spell.name,
                  level: spell.spell_level,
                  prepared: spell.prepared,
                })),
                features: control.features.slice(0, 40).map((feature) => ({
                  id: feature.id,
                  name: feature.name,
                  kind: feature.kind,
                })),
              }
            : { characterId, error: control.error },
        },
    60,
  )

  const classInfo = useMemo(() => {
    const assigned = control.assignments
      .map((assignment) => ({
        assignment,
        template: control.templates.find((item) => item.id === assignment.template_id) || null,
      }))
      .filter((entry) => entry.template?.kind === "class")
    const names = assigned.map((entry) =>
      (entry.template?.name || "") + " " + (entry.assignment.template_level || 1),
    )
    return {
      names,
      key: assigned[0]?.template?.slug || "default",
    }
  }, [control.assignments, control.templates])

  if (control.loading) {
    return <main className="u1-character-view"><div className="u1-character-view__empty">Загрузка персонажа…</div></main>
  }

  if (control.error || !control.character) {
    return (
      <main className="u1-character-view">
        <header className="u1-character-view__nav">
          <button type="button" onClick={onBack}>←</button>
          <strong>Персонаж</strong>
        </header>
        <div className="u1-character-view__empty">{control.error || "Персонаж не найден."}</div>
      </main>
    )
  }

  const character = control.character
  const entity = { type: "character", id: characterId }
  const workspaceCharacter = workspace.characters.find((item) => item.id === characterId) || null
  const workshopCharacter = workshop.characters.find((item) => item.id === characterId) || null

  const managerActions = control.canManage && workshopCharacter
    ? createWorkshopCharacterActions({
        character: workshopCharacter,
        members: workshop.members,
        templates: workshop.templates,
        assignments: workshop.templateAssignments,
        locations: workshop.locations,
        npcHabitats: workshop.npcHabitats,
        operations: workshop.operations,
        onOpen: () => setFocus(null),
      })
    : []

  const mediaActions = workspaceCharacter
    ? createCharacterSnakeActions({
        canEditAvatar: control.canControlCharacter,
        character: workspaceCharacter,
        applyMedia: (slot, input) => workspace.applyCharacterMedia(characterId, slot, input),
      })
    : []

  const heroUrl =
    workspaceCharacter?.sheetHeroUrl ||
    workspaceCharacter?.panelAvatarUrl ||
    workspaceCharacter?.avatarUrl ||
    character.panelAvatarUrl ||
    character.avatarUrl
  const heroPresentation = workspaceCharacter?.sheetHeroAssetId
    ? workspaceCharacter.sheetHeroPresentation
    : null

  const heroViewAction: SnakeAction | null = heroUrl ? {
    id: "view-sheet-art",
    label: "Открыть арт",
    surface: {
      kind: "media",
      eyebrow: "Персонаж",
      title: character.name,
      items: [{ id: "sheet-art", src: heroUrl, title: character.name }],
    },
  } : null

  const sheetAction: SnakeAction | null = control.canManage && control.sheet ? {
    id: "edit-sheet",
    label: "Редактировать лист",
    surface: {
      kind: "editor",
      eyebrow: "Лист персонажа",
      title: character.name,
      size: { width: "wide", height: "tall" },
      fields: [
        { id: "race", label: "Раса / вид", type: "text" },
        { id: "background", label: "Предыстория", type: "text" },
        { id: "alignment", label: "Мировоззрение", type: "text" },
        ...abilityFields.map(([key, , label]) => ({
          id: String(key),
          label,
          type: "number" as const,
        })),
        { id: "armor_class", label: "КД", type: "number" },
        { id: "initiative_bonus", label: "Инициатива", type: "number" },
        { id: "speed", label: "Скорость", type: "number" },
        { id: "proficiency_bonus", label: "Бонус мастерства", type: "number" },
        { id: "passive_perception", label: "Пассивное восприятие", type: "number" },
        { id: "proficiencies", label: "Владения", type: "textarea" },
        { id: "languages", label: "Языки", type: "textarea" },
        { id: "senses", label: "Чувства", type: "textarea" },
        { id: "backstory", label: "История", type: "textarea" },
        { id: "notes", label: "Заметки", type: "textarea" },
      ],
      initialValues: {
        race: control.sheet.race,
        background: control.sheet.background,
        alignment: control.sheet.alignment,
        strength: control.sheet.strength,
        dexterity: control.sheet.dexterity,
        constitution: control.sheet.constitution,
        intelligence: control.sheet.intelligence,
        wisdom: control.sheet.wisdom,
        charisma: control.sheet.charisma,
        armor_class: control.sheet.armor_class,
        initiative_bonus: control.sheet.initiative_bonus,
        speed: control.sheet.speed,
        proficiency_bonus: control.sheet.proficiency_bonus,
        passive_perception: control.sheet.passive_perception,
        proficiencies: control.sheet.proficiencies,
        languages: control.sheet.languages,
        senses: control.sheet.senses,
        backstory: control.sheet.backstory,
        notes: control.sheet.notes,
      },
      submitLabel: "Сохранить лист",
    },
    execute: async ({ input }) => {
      const sheet = control.sheet!
      const response = await control.updateSheet({
        race: String(input?.race ?? sheet.race),
        background: String(input?.background ?? sheet.background),
        alignment: String(input?.alignment ?? sheet.alignment),
        strength: number(input?.strength, sheet.strength),
        dexterity: number(input?.dexterity, sheet.dexterity),
        constitution: number(input?.constitution, sheet.constitution),
        intelligence: number(input?.intelligence, sheet.intelligence),
        wisdom: number(input?.wisdom, sheet.wisdom),
        charisma: number(input?.charisma, sheet.charisma),
        armor_class: number(input?.armor_class, sheet.armor_class),
        initiative_bonus: number(input?.initiative_bonus, sheet.initiative_bonus),
        speed: number(input?.speed, sheet.speed),
        proficiency_bonus: number(input?.proficiency_bonus, sheet.proficiency_bonus),
        passive_perception: number(input?.passive_perception, sheet.passive_perception),
        proficiencies: String(input?.proficiencies ?? sheet.proficiencies),
        languages: String(input?.languages ?? sheet.languages),
        senses: String(input?.senses ?? sheet.senses),
        backstory: String(input?.backstory ?? sheet.backstory),
        notes: String(input?.notes ?? sheet.notes),
      })
      return response.ok
        ? { type: "success", notice: "Лист сохранён." }
        : { type: "error", message: response.error || "Не удалось сохранить лист." }
    },
  } : null

  const hpAction: SnakeAction | null = control.canManage && control.sheet ? {
    id: "edit-hp",
    label: "Изменить HP",
    surface: {
      kind: "editor",
      eyebrow: "Боевое состояние",
      title: character.name,
      fields: [
        { id: "current", label: "Текущие HP", type: "number", required: true },
        { id: "max", label: "Максимум HP", type: "number", required: true },
        { id: "temp", label: "Временные HP", type: "number" },
      ],
      initialValues: {
        current: control.sheet.current_hp,
        max: control.sheet.max_hp,
        temp: control.sheet.temp_hp,
      },
      submitLabel: "Сохранить HP",
    },
    execute: async ({ input }) => {
      const response = await control.setHp(
        Math.max(0, number(input?.current, control.sheet!.current_hp)),
        Math.max(0, number(input?.max, control.sheet!.max_hp)),
        Math.max(0, number(input?.temp, control.sheet!.temp_hp)),
      )
      return response.ok
        ? { type: "success", notice: "HP изменены." }
        : { type: "error", message: response.error || "Не удалось изменить HP." }
    },
  } : null

  const recoveryAction: SnakeAction | null = control.canManage ? {
    id: "recovery",
    label: "Восстановление",
    kind: "branch",
    children: [
      {
        id: "short-rest",
        label: "Короткий отдых",
        execute: async () => {
          const response = await control.recover("short_rest")
          return response.ok
            ? { type: "success", notice: "Короткий отдых применён." }
            : { type: "error", message: response.error || "Не удалось восстановить ресурсы." }
        },
      },
      {
        id: "long-rest",
        label: "Долгий отдых",
        execute: async () => {
          const response = await control.recover("long_rest")
          return response.ok
            ? { type: "success", notice: "Долгий отдых применён." }
            : { type: "error", message: response.error || "Не удалось восстановить ресурсы." }
        },
      },
      {
        id: "dawn",
        label: "Рассвет",
        execute: async () => {
          const response = await control.recover("dawn")
          return response.ok
            ? { type: "success", notice: "Рассвет применён." }
            : { type: "error", message: response.error || "Не удалось восстановить ресурсы." }
        },
      },
    ],
  } : null

  const sheetManageChildren = [sheetAction, hpAction, recoveryAction].filter(Boolean) as SnakeAction[]
  const heroActions: SnakeAction[] = [
    ...(heroViewAction ? [heroViewAction] : []),
    ...mediaActions,
    ...(sheetManageChildren.length ? [{
      id: "sheet",
      label: "Лист",
      kind: "branch" as const,
      children: sheetManageChildren,
    }] : []),
    ...managerActions,
  ]

  const hpCurrent = contract?.combat.currentHp ?? control.sheet?.current_hp ?? 0
  const hpMax = contract?.combat.maxHp.value ?? control.sheet?.max_hp ?? 0
  const hpPercent = hpMax > 0 ? Math.min(100, Math.max(0, hpCurrent / hpMax * 100)) : 0
  const ac = contract?.combat.ac.value ?? control.sheet?.armor_class ?? 0
  const initiative = contract?.combat.initiative.value ?? control.sheet?.initiative_bonus ?? 0
  const speed = contract?.combat.speed.value ?? control.sheet?.speed ?? 0
  const proficiency = contract?.proficiencyBonus.value ?? control.sheet?.proficiency_bonus ?? 0
  const passive = contract?.passives.perception.value ?? control.sheet?.passive_perception ?? 0

  const resources = contract?.resources || []
  const spellSlots = resources
    .map((resource) => {
      const match = resource.stateKey.match(/^spell_slot_(\d+)$/)
      return match ? { level: Number(match[1]), resource } : null
    })
    .filter((entry): entry is { level: number; resource: ResolvedResource } => Boolean(entry))
    .sort((left, right) => left.level - right.level)
  const classResources = resources.filter((resource) => !/^spell_slot_\d+$/.test(resource.stateKey))

  const capabilityGroups = contract ? [
    { label: "Сопротивления", entries: contract.capabilities.resistances },
    { label: "Иммунитеты", entries: contract.capabilities.immunities },
    { label: "Владения", entries: contract.capabilities.proficiencies },
    { label: "Языки", entries: contract.capabilities.languages },
    { label: "Чувства", entries: contract.capabilities.senses },
  ].filter((group) => group.entries.length) : []

  function resourceLabel(resource: ResolvedResource) {
    return control.resources.find((row) => row.state_key === resource.stateKey)?.label ||
      titleFromKey(resource.key || resource.stateKey)
  }

  function openAction(action: SnakeAction, actionEntity = entity) {
    if (action.surface) openSourceAction(snake, actionEntity, action)
  }

  function inventoryActions(item: InventoryItem): SnakeAction[] {
    const actions: SnakeAction[] = [{
      id: "inspect",
      label: "Осмотреть",
      surface: {
        kind: "detail",
        eyebrow: "Инвентарь",
        title: item.name,
        body: itemDetail(item, control.inventory),
        mediaUrl: item.image_url || undefined,
      },
    }]

    const usageMode = item.usage_mode ?? (item.category === "consumable" ? "quantity" : "none")
    const stackMode = inventoryStackMode(item)
    const profile = inventoryPhysicalProfile(item)
    const placementKind = inventoryPlacementKind(item)
    const containerPlacements = inventoryContainerTargets(control.inventory, item)
      .map((container) => ({
        container,
        placement: firstAvailableGridPlacement(control.inventory, item, container),
      }))
      .filter((entry): entry is { container: InventoryItem; placement: Extract<InventoryPlacementTarget, { kind: "grid" }> } => Boolean(entry.placement))

    const freeHands = ([0, 1] as const).filter((index) =>
      !control.inventory.some((candidate) =>
        candidate.id !== item.id
        && inventoryPlacementKind(candidate) === "hand"
        && candidate.placement_index === index
      ),
    )
    const freeExternal = firstFreeExternalSlot(control.inventory)

    if (item.category === "container") {
      actions.push({
        id: "open-container",
        label: "Открыть контейнер",
        execute: async () => {
          setInventoryHolderId(item.id)
          return { type: "success", notice: "Контейнер открыт." }
        },
      })
    }

    if (usageMode !== "none" && control.canControlCharacter) {
      const remaining = usageMode === "charges"
        ? item.charges_current ?? item.charges_max ?? 0
        : item.quantity
      actions.push({
        id: "use-item",
        label: usageMode === "charges" ? "Использовать заряд" : "Использовать",
        enabled: remaining > 0,
        disabledReason: usageMode === "charges" ? "Заряды закончились." : "Предмет закончился.",
        execute: async () => {
          const response = await control.useItem(item, 1)
          return response.ok
            ? { type: "success", notice: usageMode === "charges" ? "Заряд использован." : "Предмет использован." }
            : { type: "error", message: response.error || "Не удалось использовать предмет." }
        },
      })
    }

    if (
      control.canControlCharacter
      && placementKind === "grid"
      && item.holder_item_id
      && item.grid_x != null
      && item.grid_y != null
      && profile.rotatable
    ) {
      actions.push({
        id: "rotate-item",
        label: "Повернуть",
        execute: async () => {
          const rotation = (((item.grid_rotation || 0) + 90) % 360) as 0 | 90 | 180 | 270
          const response = await control.moveItem(item, {
            kind: "grid",
            holderItemId: item.holder_item_id!,
            gridX: item.grid_x!,
            gridY: item.grid_y!,
            rotation,
          })
          return response.ok
            ? { type: "success", notice: "Предмет повёрнут." }
            : { type: "error", message: response.error || "Здесь предмет не повернуть." }
        },
      })
    }

    if (control.canControlCharacter && freeHands.length) {
      actions.push({
        id: "move-to-hand",
        label: "В руку",
        kind: "branch",
        children: freeHands.map((index) => ({
          id: "hand-" + index,
          label: "Рука " + (index + 1),
          execute: async () => {
            const response = await control.moveItem(item, { kind: "hand", index })
            return response.ok
              ? { type: "success", notice: "Предмет перемещён в руку." }
              : { type: "error", message: response.error || "Не удалось занять руку." }
          },
        })),
      })
    }

    if (control.canControlCharacter && freeExternal !== null) {
      actions.push({
        id: "move-to-external",
        label: "Во внешнюю ячейку",
        execute: async () => {
          const response = await control.moveItem(item, { kind: "external", index: freeExternal })
          return response.ok
            ? { type: "success", notice: "Предмет закреплён снаружи." }
            : { type: "error", message: response.error || "Не удалось переместить предмет." }
        },
      })
    }

    if (control.canControlCharacter && containerPlacements.length) {
      actions.push({
        id: "move-to-container",
        label: "В другую сумку",
        surface: {
          kind: "editor",
          eyebrow: "Инвентарь",
          title: "Куда положить «" + item.name + "»",
          fields: [{
            id: "holder",
            label: "Контейнер",
            type: "select",
            required: true,
            options: containerPlacements.map(({ container }) => ({
              value: container.id,
              label: container.name,
            })),
          }],
          initialValues: { holder: containerPlacements[0]?.container.id || "" },
          submitLabel: "Положить",
        },
        execute: async ({ input }) => {
          const holderId = String(input?.holder || "")
          const placement = containerPlacements.find((entry) => entry.container.id === holderId)?.placement
          if (!placement) {
            return { type: "error", message: "В выбранной сумке больше нет подходящего места." }
          }
          const response = await control.moveItem(item, placement)
          return response.ok
            ? { type: "success", notice: "Предмет помещён в контейнер." }
            : { type: "error", message: response.error || "Не удалось переместить предмет." }
        },
      })
    }

    if (control.canControlCharacter && !item.equipped && placementKind !== "root") {
      actions.push({
        id: "move-to-root",
        label: "В свободные предметы",
        execute: async () => {
          const response = await control.moveItem(item, { kind: "root" })
          return response.ok
            ? { type: "success", notice: "Предмет вынут из размещения." }
            : { type: "error", message: response.error || "Не удалось переместить предмет." }
        },
      })
    }

    if (item.category === "equipment" && control.canControlCharacter && !item.equipped) {
      actions.push({
        id: "equip",
        label: "Экипировать",
        execute: async () => {
          const response = await control.setEquipped(item, true)
          return response.ok
            ? { type: "success", notice: "Предмет экипирован." }
            : { type: "error", message: response.error || "Не удалось экипировать предмет." }
        },
      })
    }

    if (item.category === "equipment" && control.canControlCharacter && item.equipped) {
      const unequipTargets: SnakeAction[] = [
        ...freeHands.map((index) => ({
          id: "unequip-hand-" + index,
          label: "Снять в руку " + (index + 1),
          execute: async () => {
            const response = await control.moveItem(item, { kind: "hand", index })
            return response.ok
              ? { type: "success" as const, notice: "Предмет снят в руку." }
              : { type: "error" as const, message: response.error || "Не удалось снять предмет." }
          },
        })),
        ...(freeExternal === null ? [] : [{
          id: "unequip-external",
          label: "Снять во внешнюю ячейку",
          execute: async () => {
            const response = await control.moveItem(item, { kind: "external", index: freeExternal })
            return response.ok
              ? { type: "success" as const, notice: "Предмет снят во внешнюю ячейку." }
              : { type: "error" as const, message: response.error || "Не удалось снять предмет." }
          },
        }]),
        ...containerPlacements.map(({ container, placement }) => ({
          id: "unequip-container-" + container.id,
          label: "Снять в «" + container.name + "»",
          execute: async () => {
            const response = await control.moveItem(item, placement)
            return response.ok
              ? { type: "success" as const, notice: "Предмет снят в контейнер." }
              : { type: "error" as const, message: response.error || "Не удалось снять предмет." }
          },
        })),
      ]

      actions.push({
        id: "unequip",
        label: "Снять",
        kind: "branch",
        enabled: unequipTargets.length > 0,
        disabledReason: "Сначала освободи руку, внешнюю ячейку или место в сумке.",
        children: unequipTargets,
      })
    }

    if (control.canManage) {
      actions.push({
        id: "edit-item",
        label: "Редактировать",
        surface: {
          kind: "editor",
          eyebrow: "Инвентарь",
          title: item.name,
          fields: [
            { id: "name", label: "Название", type: "text", required: true },
            ...(stackMode === "instance" ? [] : [{ id: "quantity", label: "Количество", type: "number", required: true } as const]),
            { id: "weight", label: "Вес", type: "number" },
            { id: "description", label: "Описание", type: "textarea" },
          ],
          initialValues: {
            name: item.name,
            quantity: item.quantity,
            weight: item.weight ?? "",
            description: item.description,
          },
          submitLabel: "Сохранить предмет",
        },
        execute: async ({ input }) => {
          const response = await control.updateItem(item, {
            name: String(input?.name || item.name),
            quantity: stackMode === "instance"
              ? 1
              : Math.max(1, Math.floor(number(input?.quantity, item.quantity))),
            weight: input?.weight === "" ? null : number(input?.weight, item.weight ?? 0),
            description: String(input?.description ?? item.description),
          })
          return response.ok
            ? { type: "success", notice: "Предмет сохранён." }
            : { type: "error", message: response.error || "Не удалось сохранить предмет." }
        },
      }, {
        id: "transfer-item",
        label: "Передать",
        enabled: control.transferTargets.length > 0,
        disabledReason: "Нет другого живого персонажа кампании.",
        surface: {
          kind: "editor",
          eyebrow: "Инвентарь",
          title: "Передать «" + item.name + "»",
          fields: [
            {
              id: "target",
              label: "Кому",
              type: "select",
              required: true,
              options: control.transferTargets.map((target) => ({
                value: target.id,
                label: target.name,
              })),
            },
            ...(stackMode === "instance" ? [] : [{ id: "amount", label: "Количество", type: "number", required: true } as const]),
          ],
          initialValues: {
            target: control.transferTargets[0]?.id || "",
            ...(stackMode === "instance" ? {} : { amount: 1 }),
          },
          submitLabel: "Передать",
        },
        execute: async ({ input }) => {
          const target = String(input?.target || "")
          const amount = stackMode === "instance"
            ? 1
            : Math.max(1, Math.min(item.quantity, Math.floor(number(input?.amount, 1))))
          const response = await control.transferItem(item, target, amount)
          return response.ok
            ? { type: "success", notice: "Предмет передан." }
            : { type: "error", message: response.error || "Не удалось передать предмет." }
        },
      }, {
        id: "delete-item",
        label: "Удалить",
        tone: "danger",
        surface: {
          kind: "confirm",
          eyebrow: "Инвентарь",
          title: "Удалить «" + item.name + "»?",
          body: "Экземпляр исчезнет из инвентаря персонажа.",
          confirmLabel: "Удалить",
        },
        execute: async () => {
          const response = await control.removeItem(item)
          return response.ok
            ? { type: "success", notice: "Предмет удалён." }
            : { type: "error", message: response.error || "Не удалось удалить предмет." }
        },
      })
    }
    return actions
  }

  function spellActions(spell: CharacterSpell): SnakeAction[] {
    const actions: SnakeAction[] = [{
      id: "inspect",
      label: "Открыть",
      surface: {
        kind: "detail",
        eyebrow: spell.spell_level === 0 ? "Заговор" : spell.spell_level + " уровень",
        title: spell.name,
        body: spellDetail(spell),
      },
    }]
    const canPrepare = control.canManage ||
      Boolean(control.canControlCharacter && control.sheet?.spell_change_unlocked)
    if (canPrepare) {
      actions.push({
        id: "prepared",
        label: spell.prepared ? "Снять подготовку" : "Подготовить",
        execute: async () => {
          const response = await control.setSpellPrepared(spell.id, !spell.prepared)
          return response.ok
            ? { type: "success", notice: spell.prepared ? "Подготовка снята." : "Заклинание подготовлено." }
            : { type: "error", message: response.error || "Не удалось изменить подготовку." }
        },
      })
    }
    if (control.canManage) {
      actions.push({
        id: "edit-spell",
        label: "Редактировать",
        surface: {
          kind: "editor",
          eyebrow: "Заклинание",
          title: spell.name,
          fields: [
            { id: "name", label: "Название", type: "text", required: true },
            { id: "spell_level", label: "Уровень", type: "number" },
            { id: "school", label: "Школа", type: "text" },
            { id: "description", label: "Описание", type: "textarea" },
          ],
          initialValues: {
            name: spell.name,
            spell_level: spell.spell_level,
            school: spell.school,
            description: spell.description,
          },
          submitLabel: "Сохранить",
        },
        execute: async ({ input }) => {
          const response = await control.updateSpell(spell, {
            name: String(input?.name || spell.name),
            spell_level: Math.max(0, Math.min(9, number(input?.spell_level, spell.spell_level))),
            school: String(input?.school ?? spell.school),
            description: String(input?.description ?? spell.description),
          })
          return response.ok
            ? { type: "success", notice: "Заклинание сохранено." }
            : { type: "error", message: response.error || "Не удалось сохранить." }
        },
      }, {
        id: "delete-spell",
        label: "Удалить",
        tone: "danger",
        surface: {
          kind: "confirm",
          eyebrow: "Заклинание",
          title: "Удалить «" + spell.name + "»?",
          confirmLabel: "Удалить",
        },
        execute: async () => {
          const response = await control.deleteSpell(spell.id)
          return response.ok
            ? { type: "success", notice: "Заклинание удалено." }
            : { type: "error", message: response.error || "Не удалось удалить." }
        },
      })
    }
    return actions
  }

  function featureActions(feature: CharacterFeature): SnakeAction[] {
    const actions: SnakeAction[] = [{
      id: "inspect",
      label: "Открыть",
      surface: {
        kind: "detail",
        eyebrow: "Особенность",
        title: feature.name,
        body: featureDetail(feature),
      },
    }]
    if (control.canManage) {
      actions.push({
        id: "edit-feature",
        label: "Редактировать",
        surface: {
          kind: "editor",
          eyebrow: "Особенность",
          title: feature.name,
          fields: [
            { id: "name", label: "Название", type: "text", required: true },
            { id: "description", label: "Описание", type: "textarea" },
          ],
          initialValues: { name: feature.name, description: feature.description },
          submitLabel: "Сохранить",
        },
        execute: async ({ input }) => {
          const response = await control.updateFeature(feature, {
            name: String(input?.name || feature.name),
            description: String(input?.description ?? feature.description),
          })
          return response.ok
            ? { type: "success", notice: "Особенность сохранена." }
            : { type: "error", message: response.error || "Не удалось сохранить." }
        },
      }, {
        id: "delete-feature",
        label: "Удалить",
        tone: "danger",
        surface: {
          kind: "confirm",
          eyebrow: "Особенность",
          title: "Удалить «" + feature.name + "»?",
          confirmLabel: "Удалить",
        },
        execute: async () => {
          const response = await control.deleteFeature(feature.id)
          return response.ok
            ? { type: "success", notice: "Особенность удалена." }
            : { type: "error", message: response.error || "Не удалось удалить." }
        },
      })
    }
    return actions
  }

  function focusedContent() {
    if (focus === "inventory") {
      return (
        <InventorySpatialView
          items={control.inventory}
          activeHolderId={inventoryHolderId}
          canControl={control.canControlCharacter}
          actionsForItem={inventoryActions}
          onActiveHolderChange={setInventoryHolderId}
          onOpenItem={(item) => {
            const inspect = inventoryActions(item)[0]
            if (inspect) openAction(inspect, { type: "inventory-item", id: item.id })
          }}
          onMove={control.moveItem}
          onEquip={(item) => control.setEquipped(item, true)}
        />
      )
    }

    if (focus === "spells") {
      return (
        <Section title="Заклинания" meta={String(control.spells.length)}>
          <div className="u1-character-view__rows">
            {control.spells.map((spell) => {
              const actions = spellActions(spell)
              const inspect = actions[0]
              const spellEntity = { type: "spell", id: spell.id }
              return (
                <SnakeTrigger key={spell.id} entity={spellEntity} actions={actions}>
                  <button type="button" className="u1-character-view__row" onClick={() => openAction(inspect, spellEntity)}>
                    <span>
                      <strong>{spell.name}</strong>
                      <small>{spell.spell_level === 0 ? "Заговор" : spell.spell_level + " ур."} · {spell.school}</small>
                    </span>
                    <b>{spell.prepared ? "ГОТОВО" : ""}</b>
                  </button>
                </SnakeTrigger>
              )
            })}
            {!control.spells.length && <div className="u1-character-view__quiet">Заклинаний нет.</div>}
          </div>
        </Section>
      )
    }

    if (focus === "features") {
      return (
        <Section title="Особенности" meta={String(control.features.length)}>
          <div className="u1-character-view__rows">
            {control.features.map((feature) => {
              const actions = featureActions(feature)
              const inspect = actions[0]
              const featureEntity = { type: "feature", id: feature.id }
              return (
                <SnakeTrigger key={feature.id} entity={featureEntity} actions={actions}>
                  <button type="button" className="u1-character-view__row" onClick={() => openAction(inspect, featureEntity)}>
                    <span><strong>{feature.name}</strong><small>{feature.kind}</small></span>
                    <b>›</b>
                  </button>
                </SnakeTrigger>
              )
            })}
            {!control.features.length && <div className="u1-character-view__quiet">Особенностей нет.</div>}
          </div>
        </Section>
      )
    }

    return (
      <Section title="Владения и защиты">
        <div className="u1-character-view__defenses">
          {capabilityGroups.map((group) => (
            <div key={group.label}>
              <span>{group.label}</span>
              <p>{group.entries.map(grantLabel).join(" · ")}</p>
            </div>
          ))}
          {!capabilityGroups.length && <div className="u1-character-view__quiet">Отдельных защит и владений нет.</div>}
        </div>
      </Section>
    )
  }

  const hero = (
    <section className="u1-character-view__hero" data-dead={character.lifeState === "dead" || undefined}>
      {heroUrl ? (
        <CampaignMediaFrame
          value={heroUrl}
          presentation={heroPresentation}
          alt=""
          aria-hidden="true"
        />
      ) : <span aria-hidden="true" />}
      <span className="u1-character-view__hero-veil" aria-hidden="true" />
      <div className="u1-character-view__hero-copy">
        <small>БИО</small>
        <p>{character.bio || "История персонажа ещё не записана."}</p>
      </div>
      {heroViewAction && (
        <button
          type="button"
          className="u1-character-view__hero-open"
          onClick={() => openAction(heroViewAction)}
          aria-label={"Открыть арт персонажа " + character.name}
        />
      )}
    </section>
  )

  return (
    <main className="u1-character-view" data-class-key={classInfo.key}>
      <header className="u1-character-view__nav">
        <button
          type="button"
          onClick={() => {
            if (focus === "inventory" && inventoryHolderId) {
              const currentHolder = control.inventory.find((item) => item.id === inventoryHolderId)
              setInventoryHolderId(currentHolder?.holder_item_id ?? null)
              return
            }
            if (focus) {
              setFocus(null)
              return
            }
            onBack()
          }}
          aria-label="Назад"
        >
          ←
        </button>
        <span>{focus ? "ПЕРСОНАЖ / " + focus.toLocaleUpperCase("ru-RU") : "ПЕРСОНАЖ"}</span>
        {heroActions.length ? (
          <button
            type="button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              snake.openMenu({
                entity,
                actions: heroActions,
                point: { x: rect.right, y: rect.bottom + 8 },
                title: character.name,
              })
            }}
            aria-label="Действия с персонажем"
          >
            •••
          </button>
        ) : <i />}
      </header>

      {focus ? focusedContent() : (
        <>
          {heroActions.length ? (
            <SnakeTrigger entity={entity} actions={heroActions}>{hero}</SnakeTrigger>
          ) : hero}

          <button className="u1-character-view__inventory-line" type="button" onClick={() => { setInventoryHolderId(null); setFocus("inventory") }}>
            <i /><strong>ИНВЕНТАРЬ · {control.inventory.length} ПРЕДМЕТОВ</strong><i />
          </button>

          <section className="u1-character-view__identity">
            <div>
              <h1>{character.name}</h1>
              <p>{classInfo.names.length ? classInfo.names.join(" · ") : character.characterClass || "Без класса"}</p>
            </div>
            <div className="u1-character-view__hp">
              <strong>{hpCurrent} / {hpMax} HP</strong>
              <i><b style={{ width: hpPercent + "%" }} /></i>
            </div>
          </section>

          <section className="u1-character-view__core">
            <div className="u1-character-view__quick">
              <div><span>КД</span><strong>{ac}</strong></div>
              <div><span>ПАССИВ</span><strong>{passive}</strong></div>
              <div><span>МАСТЕРСТВО</span><strong>{signed(proficiency)}</strong></div>
              <div><span>ИНИЦИАТИВА</span><strong>{signed(initiative)}</strong></div>
              <div><span>СКОРОСТЬ</span><strong>{speed}</strong></div>
              {magic && <div><span>СЛ</span><strong>{magic.saveDc}</strong></div>}
              {magic && <div><span>АТАКА</span><strong>{signed(magic.attackBonus)}</strong></div>}
            </div>

            <div className="u1-character-view__ability-matrix" data-expanded={expandedAbility || undefined}>
              {abilityFields
                .filter(([, ability]) => !expandedAbility || expandedAbility === ability)
                .map(([sheetKey, ability, short, full]) => {
                  const resolvedAbility = contract?.abilities[ability]
                  const score = resolvedAbility?.value ?? Number(control.sheet?.[sheetKey] || 0)
                  const modifier = resolvedAbility?.modifier ?? Math.floor((score - 10) / 2)
                  const skillRows = contract
                    ? (Object.keys(contract.skills) as SkillKey[]).filter((key) => contract.skills[key].ability === ability)
                    : []
                  const open = expandedAbility === ability
                  const saveBonus = contract ? contract.savingThrows[ability].bonus.value : modifier
                  return (
                    <div className="u1-character-view__ability" key={ability} data-open={open || undefined}>
                      <button type="button" onClick={() => setExpandedAbility(open ? null : ability)} aria-expanded={open}>
                        <span>{short}</span><strong>{score}</strong><em>{signed(modifier)}</em>
                      </button>
                      {open && (
                        <div className="u1-character-view__skills">
                          <header><span>{full}</span><strong>СПАС {signed(saveBonus)}</strong></header>
                          {skillRows.map((skillKey) => (
                            <div key={skillKey}>
                              <span>{skillLabels[skillKey]}</span>
                              <strong>{signed(contract!.skills[skillKey].bonus.value)}</strong>
                              {contract!.skills[skillKey].proficiencyRank > 0 && <i>{contract!.skills[skillKey].proficiencyRank > 1 ? "◆" : "●"}</i>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </section>

          {classResources.length > 0 && (
            <section className="u1-character-view__resources">
              <header><span>РЕСУРСЫ</span><i /></header>
              {classResources.map((resource) => {
                const resourceEntity = { type: "character-resource", id: characterId + ":" + resource.stateKey }
                const detailAction: SnakeAction = {
                  id: "inspect",
                  label: "Подробнее",
                  surface: {
                    kind: "detail",
                    eyebrow: "Ресурс персонажа",
                    title: resourceLabel(resource),
                    body: "Доступно: " + resource.current + " из " + resource.max.value + ".\n\nВосстановление: " + resource.recharge.triggers.join(" · ").replace(/_/g, " "),
                  },
                }
                const max = Math.max(0, Math.round(resource.max.value))
                return (
                  <SnakeTrigger key={resource.stateKey} entity={resourceEntity} actions={[detailAction]}>
                    <button type="button" className="u1-character-view__resource" onClick={() => openAction(detailAction, resourceEntity)}>
                      <span className="u1-character-view__resource-mark">{resourceMark(resource.stateKey)}</span>
                      <span className="u1-character-view__resource-copy">
                        <strong>{resourceLabel(resource)}</strong>
                        <small>{resource.recharge.triggers.join(" · ").replace(/_/g, " ")}</small>
                      </span>
                      {max > 0 && max <= 8 && (
                        <span className="u1-character-view__pips">
                          {Array.from({ length: max }, (_, index) => <i key={index} data-filled={index < resource.current || undefined} />)}
                        </span>
                      )}
                      <b>{resource.current}/{max}</b>
                    </button>
                  </SnakeTrigger>
                )
              })}
            </section>
          )}

          {spellSlots.length > 0 && (
            <section className="u1-character-view__slots">
              <header><span>ЗАКЛИНАНИЯ</span><i /></header>
              <div className="u1-character-view__slot-viewport">
                {spellSlots.map(({ level, resource }) => {
                  const max = Math.max(0, Math.round(resource.max.value))
                  const resourceEntity = { type: "spell-slot", id: characterId + ":" + resource.stateKey }
                  const detailAction: SnakeAction = {
                    id: "inspect",
                    label: "Подробнее",
                    surface: {
                      kind: "detail",
                      eyebrow: "Ячейки заклинаний",
                      title: (roman[level] || level) + " уровень",
                      body: "Доступно: " + resource.current + " из " + max + ".",
                    },
                  }
                  return (
                    <SnakeTrigger key={resource.stateKey} entity={resourceEntity} actions={[detailAction]}>
                      <button type="button" className="u1-character-view__slot" onClick={() => openAction(detailAction, resourceEntity)}>
                        <span>{roman[level] || level} <small>УРОВЕНЬ</small></span>
                        <span className="u1-character-view__slot-pips">
                          {Array.from({ length: max }, (_, index) => <i key={index} data-filled={index < resource.current || undefined} />)}
                        </span>
                        <strong>{resource.current} / {max}</strong>
                      </button>
                    </SnakeTrigger>
                  )
                })}
              </div>
            </section>
          )}

          <section className="u1-character-view__directory">
            <button type="button" onClick={() => setFocus("features")}><span>СПОСОБНОСТИ</span><strong>{control.features.length}</strong><i>›</i></button>
            <button type="button" onClick={() => setFocus("spells")}><span>ЗАКЛИНАНИЯ</span><strong>{control.spells.length}</strong><i>›</i></button>
            <button type="button" onClick={() => setFocus("inventory")}><span>ИНВЕНТАРЬ</span><strong>{control.inventory.length}</strong><i>›</i></button>
            <button type="button" onClick={() => setFocus("defenses")}><span>ВЛАДЕНИЯ И ЗАЩИТЫ</span><strong>{capabilityGroups.reduce((sum, group) => sum + group.entries.length, 0)}</strong><i>›</i></button>
          </section>

          {runtime.error && <div className="u1-character-view__quiet">Character Engine: {runtime.error}</div>}
        </>
      )}
    </main>
  )
}