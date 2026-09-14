import type { ReactNode } from "react"

import { useAIViewContextLayer } from "../ai/AIProvider"
import type { SnakeAction } from "../snake-engine"
import type { CharacterSheet, InventoryItem } from "../types/characterSheet"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import { openSourceAction } from "./GMWorkshopCommon"
import { createWorkshopCharacterActions } from "./gmWorkshopSnakeActions"
import { useGMWorkshopData } from "./useGMWorkshopData"
import { useUiV1CharacterControl } from "./useUiV1CharacterControl"
import "./character-view.css"

const abilityFields: Array<[keyof CharacterSheet, string]> = [
  ["strength", "СИЛ"],
  ["dexterity", "ЛВК"],
  ["constitution", "ТЕЛ"],
  ["intelligence", "ИНТ"],
  ["wisdom", "МДР"],
  ["charisma", "ХАР"],
]

function number(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
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
  const snake = useSnake()

  useAIViewContextLayer(
    "character-view",
    control.loading
      ? null
      : {
          screen: "character",
          route: "#/workspace/character/" + characterId,
          title: control.character
            ? "Персонаж · " + control.character.name
            : "Персонаж",
          text: control.character
            ? "Открыт полный лист персонажа «" + control.character.name + "»."
            : "Страница персонажа открыта, но данные персонажа недоступны.",
          entity: control.character
            ? {
                type: "character",
                id: control.character.id,
                label: control.character.name,
              }
            : {
                type: "character",
                id: characterId,
              },
          facts: control.character
            ? {
                character: {
                  id: control.character.id,
                  name: control.character.name,
                  class: control.character.characterClass,
                  level: control.character.level,
                  type: control.character.characterType,
                  lifeState: control.character.lifeState,
                  bio: control.character.bio,
                },
                sheet: control.sheet
                  ? {
                      race: control.sheet.race,
                      background: control.sheet.background,
                      alignment: control.sheet.alignment,
                      abilities: {
                        strength: control.sheet.strength,
                        dexterity: control.sheet.dexterity,
                        constitution: control.sheet.constitution,
                        intelligence: control.sheet.intelligence,
                        wisdom: control.sheet.wisdom,
                        charisma: control.sheet.charisma,
                      },
                      armorClass: control.sheet.armor_class,
                      initiativeBonus: control.sheet.initiative_bonus,
                      speed: control.sheet.speed,
                      proficiencyBonus: control.sheet.proficiency_bonus,
                      passivePerception: control.sheet.passive_perception,
                      hp: {
                        current: control.sheet.current_hp,
                        max: control.sheet.max_hp,
                        temp: control.sheet.temp_hp,
                      },
                      proficiencies: control.sheet.proficiencies,
                      languages: control.sheet.languages,
                      senses: control.sheet.senses,
                    }
                  : null,
                resources: control.resources.slice(0, 30),
                inventory: control.inventory.slice(0, 40).map((item) => ({
                  id: item.id,
                  name: item.name,
                  category: item.category,
                  quantity: item.quantity,
                  equipped: item.equipped,
                  description: item.description,
                  usageMode: item.usage_mode,
                  chargesCurrent: item.charges_current,
                  chargesMax: item.charges_max,
                })),
                spells: control.spells.slice(0, 40).map((spell) => ({
                  id: spell.id,
                  name: spell.name,
                  level: spell.spell_level,
                  school: spell.school,
                  prepared: spell.prepared,
                  concentration: spell.concentration,
                  ritual: spell.ritual,
                  description: spell.description,
                })),
                features: control.features.slice(0, 40).map((feature) => ({
                  id: feature.id,
                  name: feature.name,
                  kind: feature.kind,
                  description: feature.description,
                })),
                templateAssignments: control.assignments.slice(0, 20).map((assignment) => {
                  const template = control.templates.find(
                    (item) => item.id === assignment.template_id,
                  )
                  return {
                    assignmentId: assignment.id,
                    templateId: assignment.template_id,
                    kind: template?.kind || null,
                    name: template?.name || null,
                    level: assignment.template_level,
                  }
                }),
              }
            : {
                characterId,
                error: control.error,
              },
        },
    60,
  )

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
  const workshopCharacter = workshop.characters.find((item) => item.id === characterId) || null
  const characterActions = control.canManage && workshopCharacter
    ? createWorkshopCharacterActions({
        character: workshopCharacter,
        members: workshop.members,
        templates: workshop.templates,
        assignments: workshop.templateAssignments,
        locations: workshop.locations,
        npcHabitats: workshop.npcHabitats,
        operations: workshop.operations,
        onOpen: () => {},
      })
    : []

  const entity = { type: "character", id: characterId }
  const classNames = control.assignments
    .map((assignment) => {
      const template = control.templates.find((item) => item.id === assignment.template_id)
      if (!template || template.kind !== "class") return null
      return template.name + " " + (assignment.template_level || 1)
    })
    .filter(Boolean)

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
        ...abilityFields.map(([key, label]) => ({
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

  function inventoryActions(item: InventoryItem): SnakeAction[] {
    if (!control.canManage) return []
    const actions: SnakeAction[] = []

    if (item.category === "equipment") {
      actions.push({
        id: "equip",
        label: item.equipped ? "Снять" : "Экипировать",
        execute: async () => {
          const response = await control.setEquipped(item, !item.equipped)
          return response.ok
            ? { type: "success", notice: item.equipped ? "Предмет снят." : "Предмет экипирован." }
            : { type: "error", message: response.error || "Не удалось изменить экипировку." }
        },
      })
    }

    actions.push({
      id: "edit-item",
      label: "Редактировать",
      surface: {
        kind: "editor",
        eyebrow: "Инвентарь",
        title: item.name,
        fields: [
          { id: "name", label: "Название", type: "text", required: true },
          { id: "quantity", label: "Количество", type: "number", required: true },
          { id: "weight", label: "Вес", type: "number" },
          ...(item.usage_mode === "charges"
            ? [
                { id: "charges_current", label: "Текущие заряды", type: "number" as const },
                { id: "charges_max", label: "Максимум зарядов", type: "number" as const },
              ]
            : []),
          { id: "description", label: "Описание", type: "textarea" },
        ],
        initialValues: {
          name: item.name,
          quantity: item.quantity,
          weight: item.weight ?? "",
          charges_current: item.charges_current ?? "",
          charges_max: item.charges_max ?? "",
          description: item.description,
        },
        submitLabel: "Сохранить предмет",
      },
      execute: async ({ input }) => {
        const response = await control.updateItem(item, {
          name: String(input?.name || item.name),
          quantity: Math.max(0, Math.floor(number(input?.quantity, item.quantity))),
          weight: input?.weight === "" ? null : number(input?.weight, item.weight ?? 0),
          ...(item.usage_mode === "charges"
            ? {
                charges_current: Math.max(0, number(input?.charges_current, item.charges_current ?? 0)),
                charges_max: Math.max(1, number(input?.charges_max, item.charges_max ?? 1)),
              }
            : {}),
          description: String(input?.description ?? item.description),
        })
        return response.ok
          ? { type: "success", notice: "Предмет сохранён." }
          : { type: "error", message: response.error || "Не удалось сохранить предмет." }
      },
    })

    actions.push({
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
          { id: "amount", label: "Количество", type: "number", required: true },
        ],
        initialValues: {
          target: control.transferTargets[0]?.id || "",
          amount: 1,
        },
        submitLabel: "Передать",
      },
      execute: async ({ input }) => {
        const target = String(input?.target || "")
        const amount = Math.max(1, Math.min(item.quantity, Math.floor(number(input?.amount, 1))))
        const response = await control.transferItem(item.id, target, amount)
        return response.ok
          ? { type: "success", notice: "Предмет передан." }
          : { type: "error", message: response.error || "Не удалось передать предмет." }
      },
    })

    actions.push({
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
        const response = await control.removeItem(item.id)
        return response.ok
          ? { type: "success", notice: "Предмет удалён." }
          : { type: "error", message: response.error || "Не удалось удалить предмет." }
      },
    })

    return actions
  }

  return (
    <main className="u1-character-view">
      <header className="u1-character-view__nav">
        <button type="button" onClick={onBack} aria-label="Назад">←</button>
        <span>ПЕРСОНАЖ</span>
        {control.canManage && characterActions.length > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              snake.openMenu({
                entity,
                actions: characterActions,
                point: { x: rect.right, y: rect.bottom + 8 },
                title: character.name,
              })
            }}
            aria-label="Управление персонажем"
          >
            •••
          </button>
        ) : <i />}
      </header>

      <SnakeTrigger entity={entity} actions={characterActions}>
        <section className="u1-character-view__hero" data-dead={character.lifeState === "dead" || undefined}>
          {character.avatarUrl ? <img src={character.avatarUrl} alt="" /> : <span aria-hidden="true" />}
          <div>
            <small>{character.characterType === "pc" ? "PC" : "NPC"} · {character.lifeState === "dead" ? "Мёртв" : "Жив"}</small>
            <h1>{character.name}</h1>
            <p>{classNames.length ? classNames.join(" · ") : character.characterClass || "Без класса"}</p>
          </div>
        </section>
      </SnakeTrigger>

      {control.sheet && (
        <>
          <section className="u1-character-view__vitals">
            <button
              type="button"
              onClick={() => hpAction && openSourceAction(snake, entity, hpAction)}
              disabled={!hpAction}
            >
              <span>HP</span>
              <strong>{control.sheet.current_hp}/{control.sheet.max_hp}</strong>
              {control.sheet.temp_hp > 0 && <small>+{control.sheet.temp_hp} врем.</small>}
            </button>
            <div>
              <span>КД <strong>{control.sheet.armor_class}</strong></span>
              <span>Иниц. <strong>{control.sheet.initiative_bonus >= 0 ? "+" : ""}{control.sheet.initiative_bonus}</strong></span>
              <span>Скор. <strong>{control.sheet.speed}</strong></span>
              <span>Маст. <strong>+{control.sheet.proficiency_bonus}</strong></span>
            </div>
          </section>

          <div className="u1-character-view__abilities">
            {abilityFields.map(([key, label]) => (
              <span key={String(key)}>
                <strong>{control.sheet![key] as number}</strong>
                <small>{label}</small>
              </span>
            ))}
          </div>

          {control.canManage && (
            <div className="u1-character-view__gm-actions">
              <button type="button" onClick={() => sheetAction && openSourceAction(snake, entity, sheetAction)}>Редактировать лист</button>
              <button type="button" onClick={() => void control.recover("short_rest")}>Короткий отдых</button>
              <button type="button" onClick={() => void control.recover("long_rest")}>Долгий отдых</button>
              <button type="button" onClick={() => void control.recover("dawn")}>Рассвет</button>
            </div>
          )}
        </>
      )}

      <Section title="Ресурсы" meta={String(control.resources.length)}>
        <div className="u1-character-view__rows">
          {control.resources.map((resource) => (
            <div className="u1-character-view__row" key={resource.resource_key}>
              <strong>{resource.resource_key}</strong>
              <small>{resource.current_value}/{resource.max_value}</small>
            </div>
          ))}
          {!control.resources.length && <div className="u1-character-view__quiet">Нет отдельных ресурсов.</div>}
        </div>
      </Section>

      <Section title="Инвентарь" meta={String(control.inventory.length)}>
        <div className="u1-character-view__rows">
          {control.inventory.map((item) => (
            <SnakeTrigger
              key={item.id}
              entity={{ type: "inventory-item", id: item.id }}
              actions={inventoryActions(item)}
            >
              <button type="button" className="u1-character-view__row">
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.category}{item.equipped ? " · надето" : ""}</small>
                </span>
                <b>×{item.quantity}</b>
              </button>
            </SnakeTrigger>
          ))}
          {!control.inventory.length && <div className="u1-character-view__quiet">Инвентарь пуст.</div>}
        </div>
      </Section>

      <Section title="Заклинания" meta={String(control.spells.length)}>
        <div className="u1-character-view__rows">
          {control.spells.map((spell) => {
            const actions: SnakeAction[] = control.canManage ? [
              {
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
                    { id: "casting_time", label: "Время", type: "text" },
                    { id: "spell_range", label: "Дистанция", type: "text" },
                    { id: "duration", label: "Длительность", type: "text" },
                    { id: "components", label: "Компоненты", type: "text" },
                    { id: "concentration", label: "Концентрация", type: "checkbox" },
                    { id: "ritual", label: "Ритуал", type: "checkbox" },
                    { id: "description", label: "Описание", type: "textarea" },
                  ],
                  initialValues: {
                    name: spell.name,
                    spell_level: spell.spell_level,
                    school: spell.school,
                    casting_time: spell.casting_time,
                    spell_range: spell.spell_range,
                    duration: spell.duration,
                    components: spell.components,
                    concentration: spell.concentration,
                    ritual: spell.ritual,
                    description: spell.description,
                  },
                  submitLabel: "Сохранить",
                },
                execute: async ({ input }) => {
                  const response = await control.updateSpell(spell, {
                    name: String(input?.name || spell.name),
                    spell_level: Math.max(0, Math.min(9, number(input?.spell_level, spell.spell_level))),
                    school: String(input?.school ?? spell.school),
                    casting_time: String(input?.casting_time ?? spell.casting_time),
                    spell_range: String(input?.spell_range ?? spell.spell_range),
                    duration: String(input?.duration ?? spell.duration),
                    components: String(input?.components ?? spell.components),
                    concentration: Boolean(input?.concentration),
                    ritual: Boolean(input?.ritual),
                    description: String(input?.description ?? spell.description),
                  })
                  return response.ok
                    ? { type: "success", notice: "Заклинание сохранено." }
                    : { type: "error", message: response.error || "Не удалось сохранить." }
                },
              },
              {
                id: "prepared",
                label: spell.prepared ? "Снять подготовку" : "Подготовить",
                execute: async () => {
                  const response = await control.setSpellPrepared(spell.id, !spell.prepared)
                  return response.ok
                    ? { type: "success", notice: spell.prepared ? "Подготовка снята." : "Заклинание подготовлено." }
                    : { type: "error", message: response.error || "Не удалось изменить подготовку." }
                },
              },
              {
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
              },
            ] : []

            return (
              <SnakeTrigger key={spell.id} entity={{ type: "spell", id: spell.id }} actions={actions}>
                <button type="button" className="u1-character-view__row">
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

      <Section title="Особенности" meta={String(control.features.length)}>
        <div className="u1-character-view__rows">
          {control.features.map((feature) => {
            const actions: SnakeAction[] = control.canManage ? [
              {
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
              },
              {
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
              },
            ] : []

            return (
              <SnakeTrigger key={feature.id} entity={{ type: "feature", id: feature.id }} actions={actions}>
                <button type="button" className="u1-character-view__row">
                  <span>
                    <strong>{feature.name}</strong>
                    <small>{feature.kind}</small>
                  </span>
                </button>
              </SnakeTrigger>
            )
          })}
          {!control.features.length && <div className="u1-character-view__quiet">Особенностей нет.</div>}
        </div>
      </Section>

      {character.bio && (
        <Section title="Описание">
          <p className="u1-character-view__bio">{character.bio}</p>
        </Section>
      )}
    </main>
  )
}
