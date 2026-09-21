import { useMemo, useState } from "react"

import type {
  AbilityKey,
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedSpell,
  ResolvedSpellAccess,
  ResolvedSpellCastingMethod,
  SkillKey,
} from "../../character-engine/index.ts"
import {
  buildChatActionModel,
  type ChatActionSourceGroup,
} from "../../components/chat/chatActionModel.ts"
import { spellSlotResources } from "../../components/characters/spellSlots.ts"
import type { ChatActionLauncherMode } from "./chatRoomContracts"
import "./chat-action-panel.css"

export type FreeDiceRequest = {
  count: number
  sides: number
  modifier: number
}

type SpellChannel = "cantrips" | string | null
type AttackChannel = "weapon" | "spell" | "special" | null

type SpellCastSelection = {
  spell: ResolvedSpell
  accessKey: string
  methodKey: string
  optionKey?: string
}

type Props = {
  mode: ChatActionLauncherMode
  characterName: string | null
  contract: ResolvedCharacterContract | null
  loading?: boolean
  includePrivateSources?: boolean
  onClose: () => void
  onFreeRoll: (
    request: FreeDiceRequest,
  ) => boolean | void | Promise<boolean | void>
  onCheck: (
    label: string,
    modifier: number,
    kind: "ability" | "skill" | "save",
  ) => void | Promise<void>
  onAction: (
    action: ResolvedAction,
    optionKey?: string,
  ) => void | Promise<void>
  onSpell: (spell: ResolvedSpell) => void | Promise<void>
}

const standardDice = [4, 6, 8, 10, 12, 20, 100]

const abilityRows: Array<[AbilityKey, string, string]> = [
  ["strength", "СИЛ", "Сила"],
  ["dexterity", "ЛОВ", "Ловкость"],
  ["constitution", "ТЕЛ", "Телосложение"],
  ["intelligence", "ИНТ", "Интеллект"],
  ["wisdom", "МДР", "Мудрость"],
  ["charisma", "ХАР", "Харизма"],
]

const skillNames: Record<SkillKey, string> = {
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

const modeCopy: Record<
  ChatActionLauncherMode,
  { eyebrow: string; title: string; hint: string }
> = {
  roll: {
    eyebrow: "Игровое действие",
    title: "Бросок",
    hint: "Кубы, характеристики и навыки",
  },
  ability: {
    eyebrow: "Персонаж",
    title: "Способности",
    hint: "Класс, подкласс и особые источники",
  },
  spell: {
    eyebrow: "Персонаж",
    title: "Заклинания",
    hint: "Сначала ресурс, потом конкретный каст",
  },
  item: {
    eyebrow: "Персонаж",
    title: "Инвентарь",
    hint: "Предметы и расходники",
  },
  action: {
    eyebrow: "Персонаж",
    title: "Атака",
    hint: "Оружие, магия или особый источник",
  },
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function actionSummary(action: ResolvedAction) {
  const parts: string[] = []
  if (action.attack) parts.push(`атака ${signed(action.attack.bonus.value)}`)

  const damage = action.damage[0]
  if (damage?.dice) {
    parts.push(
      `${damage.dice.count}d${damage.dice.sides}${damage.modifier.value ? signed(damage.modifier.value) : ""} ${damage.type}`,
    )
  }

  if (action.resourceCosts.length) {
    parts.push(
      action.resourceCosts
        .map((cost) => `${cost.amount} × ${cost.key}`)
        .join(" + "),
    )
  }

  return parts.join(" · ") || action.economy.split("_").join(" ")
}

function spellSummary(spell: ResolvedSpell) {
  const level =
    spell.identity.level > 0
      ? `${spell.identity.level} уровень`
      : "Заговор"
  return [level, spell.identity.school || ""].filter(Boolean).join(" · ")
}

function exactSpellCast(selection: SpellCastSelection): ResolvedSpell {
  const access = selection.spell.accesses.find(
    (entry) => entry.key === selection.accessKey,
  )
  const method = access?.methods.find(
    (entry) => entry.key === selection.methodKey,
  )
  if (!access || !method) return selection.spell

  const option = selection.optionKey
    ? method.resourceOptions.find((entry) => entry.key === selection.optionKey)
    : undefined

  const selectedMethod: ResolvedSpellCastingMethod = {
    ...method,
    available: true,
    resourceOptions: option ? [{ ...option, available: true }] : [],
  }
  const selectedAccess: ResolvedSpellAccess = {
    ...access,
    available: true,
    methods: [selectedMethod],
  }

  return {
    ...selection.spell,
    available: true,
    accesses: [selectedAccess],
  }
}

function firstSpellCast(spell: ResolvedSpell): SpellCastSelection | null {
  for (const access of spell.accesses) {
    if (!access.available) continue
    for (const method of access.methods) {
      if (!method.available) continue
      const option = method.resourceOptions.find((entry) => entry.available)
      if (method.resourceOptions.length === 0 || option) {
        return {
          spell,
          accessKey: access.key,
          methodKey: method.key,
          ...(option ? { optionKey: option.key } : {}),
        }
      }
    }
  }
  return null
}

function cantripCast(spell: ResolvedSpell): SpellCastSelection | null {
  if (spell.identity.level !== 0) return null

  for (const access of spell.accesses) {
    if (!access.available) continue
    for (const method of access.methods) {
      if (!method.available) continue
      const option = method.resourceOptions.find(
        (item) => item.available && item.castLevel === 0,
      )
      if (method.resourceOptions.length === 0 || option) {
        return {
          spell,
          accessKey: access.key,
          methodKey: method.key,
          ...(option ? { optionKey: option.key } : {}),
        }
      }
    }
  }

  return null
}

function spellCastForSlot(
  spell: ResolvedSpell,
  level: number,
  stateKey: string,
): SpellCastSelection | null {
  for (const access of spell.accesses) {
    if (!access.available) continue
    for (const method of access.methods) {
      if (!method.available) continue
      const option = method.resourceOptions.find(
        (item) =>
          item.available &&
          item.castLevel === level &&
          item.costs.some(
            (cost) => cost.stateKey === stateKey && cost.available,
          ),
      )
      if (option) {
        return {
          spell,
          accessKey: access.key,
          methodKey: method.key,
          optionKey: option.key,
        }
      }
    }
  }

  return null
}

function actionIsAttack(action: ResolvedAction) {
  return Boolean(action.attack) ||
    action.damage.some((entry) => Boolean(entry.dice))
}

function actionChoice(
  action: ResolvedAction,
): { options: string[]; labels?: Record<string, string> } | null {
  const choice = action.effects.find(
    (effect) => effect.kind === "template_choice",
  )
  if (!choice) return null

  const value = choice as unknown as {
    options?: unknown
    optionLabels?: unknown
  }

  if (!Array.isArray(value.options)) return null
  const options = value.options.filter(
    (option): option is string => typeof option === "string",
  )
  if (!options.length) return null

  const labels =
    value.optionLabels &&
    typeof value.optionLabels === "object" &&
    !Array.isArray(value.optionLabels)
      ? (value.optionLabels as Record<string, string>)
      : undefined

  return { options, labels }
}

function EmptyState({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="u1-chat-action-empty">
      <span aria-hidden="true">◇</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  )
}

function ResourceStrip({ group }: { group: ChatActionSourceGroup }) {
  if (!group.resources.length) return null

  return (
    <div className="u1-chat-action-resources">
      {group.resources.map((resource) => (
        <span key={resource.stateKey}>
          <b>{resource.key.replace(/[_-]+/g, " ")}</b>
          <strong>
            {Math.max(0, resource.current)}/
            {Math.max(0, resource.max.value)}
          </strong>
        </span>
      ))}
    </div>
  )
}

function ActionRows({
  actions,
  busy,
  run,
  onAction,
}: {
  actions: ResolvedAction[]
  busy: boolean
  run: (task: () => void | Promise<void>) => void
  onAction: (
    action: ResolvedAction,
    optionKey?: string,
  ) => void | Promise<void>
}) {
  if (!actions.length) return null

  return (
    <div className="u1-chat-action-list">
      {actions.flatMap((action) => {
        const choice = actionChoice(action)
        if (!choice) {
          return [
            <button
              type="button"
              key={action.stateKey}
              disabled={busy || !action.available}
              onClick={() => run(() => onAction(action))}
            >
              <span className="u1-chat-action-list__icon">◆</span>
              <span>
                <strong>{action.label || action.key}</strong>
                <small>{actionSummary(action)}</small>
              </span>
              <em aria-hidden="true">›</em>
            </button>,
          ]
        }

        return choice.options.map((option) => (
          <button
            type="button"
            key={`${action.stateKey}:${option}`}
            disabled={busy || !action.available}
            onClick={() => run(() => onAction(action, option))}
          >
            <span className="u1-chat-action-list__icon">◆</span>
            <span>
              <strong>{choice.labels?.[option] || option}</strong>
              <small>{action.label || action.key}</small>
            </span>
            <em aria-hidden="true">›</em>
          </button>
        ))
      })}
    </div>
  )
}

function SpellRows({
  spells,
  busy,
  run,
  onSpell,
}: {
  spells: ResolvedSpell[]
  busy: boolean
  run: (task: () => void | Promise<void>) => void
  onSpell: (spell: ResolvedSpell) => void | Promise<void>
}) {
  if (!spells.length) return null

  return (
    <div className="u1-chat-action-list">
      {spells.map((spell) => (
        <button
          type="button"
          key={spell.key}
          disabled={busy || !spell.available}
          onClick={() => run(() => onSpell(spell))}
        >
          <span className="u1-chat-action-list__icon">✧</span>
          <span>
            <strong>{spell.identity.name}</strong>
            <small>{spellSummary(spell)}</small>
          </span>
          <em aria-hidden="true">›</em>
        </button>
      ))}
    </div>
  )
}

function SpellSlotFlow({
  spells,
  contract,
  channel,
  setChannel,
  busy,
  run,
  onCast,
  emptyTitle,
}: {
  spells: ResolvedSpell[]
  contract: ResolvedCharacterContract
  channel: SpellChannel
  setChannel: (value: SpellChannel) => void
  busy: boolean
  run: (task: () => void | Promise<void>) => void
  onCast: (selection: SpellCastSelection) => void | Promise<void>
  emptyTitle: string
}) {
  const slots = useMemo(
    () => spellSlotResources(contract.resources),
    [contract.resources],
  )
  const cantrips = useMemo(
    () =>
      spells
        .map(cantripCast)
        .filter((item): item is SpellCastSelection => item !== null),
    [spells],
  )
  const selectedSlot =
    channel && channel !== "cantrips"
      ? slots.find(({ resource }) => resource.stateKey === channel) || null
      : null

  const casts = useMemo(() => {
    if (!channel) return []
    if (channel === "cantrips") return cantrips

    const slot = slots.find(({ resource }) => resource.stateKey === channel)
    if (!slot || slot.resource.current <= 0) return []

    return spells
      .map((spell) =>
        spellCastForSlot(spell, slot.level, slot.resource.stateKey),
      )
      .filter((item): item is SpellCastSelection => item !== null)
  }, [cantrips, channel, slots, spells])

  if (!spells.length) {
    return (
      <EmptyState
        title={emptyTitle}
        body="Подходящих заклинаний сейчас нет."
      />
    )
  }

  if (!channel) {
    return (
      <div className="u1-chat-action-route">
        <header className="u1-chat-action-route__head">
          <span>Шаг 1</span>
          <strong>Выбери ячейку</strong>
          <small>
            Покажем только те заклинания, которые реально можно сотворить этим
            ресурсом.
          </small>
        </header>

        <div className="u1-chat-slot-grid">
          {cantrips.length ? (
            <button
              type="button"
              className="u1-chat-slot"
              disabled={busy}
              onClick={() => setChannel("cantrips")}
            >
              <b>∞</b>
              <span>
                <strong>Заговоры</strong>
                <small>Без расхода ячейки · {cantrips.length}</small>
              </span>
              <em aria-hidden="true">›</em>
            </button>
          ) : null}

          {slots.map(({ resource, level }) => {
            const maximum = Math.max(0, Math.round(resource.max.value))
            const current = Math.max(
              0,
              Math.min(maximum, Math.round(resource.current)),
            )
            const depleted = current <= 0

            return (
              <button
                type="button"
                className="u1-chat-slot"
                data-depleted={depleted || undefined}
                key={resource.stateKey}
                disabled={busy || depleted}
                onClick={() => setChannel(resource.stateKey)}
              >
                <b>{level}</b>
                <span>
                  <strong>Ячейка {level} уровня</strong>
                  <i className="u1-chat-slot__orbs" aria-hidden="true">
                    {Array.from({ length: maximum }, (_, index) => (
                      <i
                        className={index < current ? "is-lit" : ""}
                        key={index}
                      />
                    ))}
                  </i>
                  <small>
                    {depleted
                      ? "Ячейки закончились"
                      : `${current} из ${maximum} доступно`}
                  </small>
                </span>
                <em>{current}/{maximum}</em>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="u1-chat-action-route">
      <header className="u1-chat-action-route__head u1-chat-action-route__head--back">
        <button type="button" onClick={() => setChannel(null)}>
          ‹ Ячейки
        </button>
        <span>
          {channel === "cantrips"
            ? "Без ячейки"
            : `Ячейка ${selectedSlot?.level || "—"} уровня`}
        </span>
        <strong>Шаг 2 · {casts.length} доступно</strong>
        {selectedSlot ? (
          <small>
            {Math.round(selectedSlot.resource.current)}/
            {Math.round(selectedSlot.resource.max.value)} ячеек осталось
          </small>
        ) : null}
      </header>

      {casts.length ? (
        <div className="u1-chat-action-list">
          {casts.map((selection) => (
            <button
              type="button"
              key={`${selection.spell.key}:${selection.accessKey}:${selection.methodKey}:${selection.optionKey || "free"}`}
              disabled={busy}
              onClick={() => run(() => onCast(selection))}
            >
              <span className="u1-chat-action-list__icon">✧</span>
              <span>
                <strong>{selection.spell.identity.name}</strong>
                <small>{spellSummary(selection.spell)}</small>
              </span>
              <em aria-hidden="true">›</em>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Этой ячейкой нечего применить"
          body="Вернись и выбери другой уровень."
        />
      )}
    </div>
  )
}

function SourceGroups({
  groups,
  busy,
  run,
  onAction,
  onSpell,
  emptyTitle,
  emptyBody,
}: {
  groups: ChatActionSourceGroup[]
  busy: boolean
  run: (task: () => void | Promise<void>) => void
  onAction: (
    action: ResolvedAction,
    optionKey?: string,
  ) => void | Promise<void>
  onSpell: (spell: ResolvedSpell) => void | Promise<void>
  emptyTitle: string
  emptyBody: string
}) {
  if (!groups.length) {
    return <EmptyState title={emptyTitle} body={emptyBody} />
  }

  return (
    <div className="u1-chat-action-groups">
      {groups.map((group) => {
        const sourceLabel =
          group.sourceType === "inventory_item" || group.id.startsWith("item:")
            ? "Предмет"
            : group.sourceType === "class_template" ||
                group.sourceType === "subclass_template" ||
                group.id.startsWith("template:class:") ||
                group.id.startsWith("template:subclass:")
              ? "Класс / подкласс"
              : "Особый источник"

        return (
          <section className="u1-chat-action-group" key={group.id}>
            <header>
              <span>{sourceLabel}</span>
              <strong>{group.name}</strong>
            </header>
            <ResourceStrip group={group} />
            <ActionRows
              actions={group.actions}
              busy={busy}
              run={run}
              onAction={onAction}
            />
            <SpellRows
              spells={group.spells}
              busy={busy}
              run={run}
              onSpell={onSpell}
            />
          </section>
        )
      })}
    </div>
  )
}

function RollSurface({
  contract,
  busy,
  run,
  onFreeRoll,
  onCheck,
  onClose,
}: {
  contract: ResolvedCharacterContract | null
  busy: boolean
  run: (task: () => void | Promise<void>) => void
  onFreeRoll: Props["onFreeRoll"]
  onCheck: Props["onCheck"]
  onClose: () => void
}) {
  const [count, setCount] = useState(1)
  const [sides, setSides] = useState(20)
  const [modifier, setModifier] = useState(0)
  const notation = `${count}d${sides}${modifier ? signed(modifier) : ""}`

  const skills = contract
    ? Object.entries(contract.skills)
        .map(([key, value]) => ({
          ...value,
          key: key as SkillKey,
        }))
        .sort((left, right) =>
          skillNames[left.key].localeCompare(skillNames[right.key], "ru"),
        )
    : []

  return (
    <div className="u1-chat-roll">
      <section className="u1-chat-roll__card">
        <div className="u1-chat-roll__headline">
          <div>
            <span>Свободный бросок</span>
            <strong>{notation}</strong>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const sent = await onFreeRoll({ count, sides, modifier })
                if (sent !== false) onClose()
              })
            }
          >
            Бросить
          </button>
        </div>

        <div className="u1-chat-roll__dice" aria-label="Быстрый выбор куба">
          {standardDice.map((die) => (
            <button
              type="button"
              key={die}
              className={sides === die ? "is-active" : ""}
              onClick={() => setSides(die)}
            >
              d{die}
            </button>
          ))}
        </div>

        <div className="u1-chat-roll__controls">
          <label>
            <span>Количество</span>
            <input
              type="number"
              min="1"
              max="40"
              value={count}
              onChange={(event) =>
                setCount(clamp(Number(event.target.value), 1, 40))
              }
            />
          </label>
          <label>
            <span>Грани</span>
            <input
              type="number"
              min="2"
              max="1000"
              value={sides}
              onChange={(event) =>
                setSides(clamp(Number(event.target.value), 2, 1000))
              }
            />
          </label>
          <label>
            <span>Модификатор</span>
            <input
              type="number"
              min="-500"
              max="500"
              value={modifier}
              onChange={(event) =>
                setModifier(clamp(Number(event.target.value), -500, 500))
              }
            />
          </label>
        </div>
      </section>

      {contract ? (
        <>
          <section className="u1-chat-checks">
            <header>
              <strong>Характеристики</strong>
              <small>тап = проверка · «Спас» = спасбросок</small>
            </header>
            <div className="u1-chat-checks__grid">
              {abilityRows.map(([key, short, label]) => (
                <div key={key}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        onCheck(
                          label,
                          contract.abilities[key].modifier,
                          "ability",
                        ),
                      )
                    }
                  >
                    <span>{short}</span>
                    <strong>{signed(contract.abilities[key].modifier)}</strong>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        onCheck(
                          `Спасбросок: ${label}`,
                          contract.savingThrows[key].bonus.value,
                          "save",
                        ),
                      )
                    }
                  >
                    Спас {signed(contract.savingThrows[key].bonus.value)}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <details className="u1-chat-skills">
            <summary>
              <span>Навыки</span>
              <strong>{skills.length}</strong>
            </summary>
            <div>
              {skills.map((skill) => (
                <button
                  type="button"
                  key={skill.key}
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      onCheck(
                        skillNames[skill.key],
                        skill.bonus.value,
                        "skill",
                      ),
                    )
                  }
                >
                  <span>{skillNames[skill.key]}</span>
                  <strong>{signed(skill.bonus.value)}</strong>
                </button>
              ))}
            </div>
          </details>
        </>
      ) : (
        <p className="u1-chat-action-note">
          Без выбранного персонажа доступен свободный бросок.
        </p>
      )}
    </div>
  )
}

export default function ChatActionPanel({
  mode,
  characterName,
  contract,
  loading = false,
  includePrivateSources = true,
  onClose,
  onFreeRoll,
  onCheck,
  onAction,
  onSpell,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [spellChannel, setSpellChannel] = useState<SpellChannel>(null)
  const [attackChannel, setAttackChannel] = useState<AttackChannel>(null)
  const [attackSpellChannel, setAttackSpellChannel] =
    useState<SpellChannel>(null)

  const model = useMemo(
    () => buildChatActionModel(contract, includePrivateSources),
    [contract, includePrivateSources],
  )

  const itemGroups = useMemo(
    () =>
      model.uniqueGroups.filter(
        (group) =>
          group.sourceType === "inventory_item" ||
          group.id.startsWith("item:"),
      ),
    [model.uniqueGroups],
  )

  const nonItemUniqueGroups = useMemo(
    () =>
      model.uniqueGroups.filter(
        (group) =>
          group.sourceType !== "inventory_item" &&
          !group.id.startsWith("item:"),
      ),
    [model.uniqueGroups],
  )

  const abilityGroups = useMemo(
    () => [...model.classGroups, ...nonItemUniqueGroups],
    [model.classGroups, nonItemUniqueGroups],
  )

  const attackSpellKeys = useMemo(
    () => new Set(model.attackSpells.map((spell) => spell.key)),
    [model.attackSpells],
  )

  const specialGroups = useMemo(
    () =>
      model.uniqueGroups
        .map((group) => ({
          ...group,
          actions: group.actions.filter(actionIsAttack),
          spells: group.spells.filter((spell) =>
            attackSpellKeys.has(spell.key),
          ),
        }))
        .filter(
          (group) =>
            (group.sourceType === "inventory_item" ||
              group.id.startsWith("item:")) &&
            (group.actions.length || group.spells.length),
        ),
    [attackSpellKeys, model.uniqueGroups],
  )

  const specialCount = specialGroups.reduce(
    (sum, group) => sum + group.actions.length + group.spells.length,
    0,
  )

  const copy = modeCopy[mode]

  const run = (task: () => void | Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError("")
    void Promise.resolve()
      .then(task)
      .catch((reason) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Не удалось выполнить действие.",
        )
      })
      .finally(() => setBusy(false))
  }

  const castSelection = (selection: SpellCastSelection) =>
    onSpell(exactSpellCast(selection))

  const castDefault = (spell: ResolvedSpell) => {
    const selection = firstSpellCast(spell)
    if (!selection) {
      throw new Error("У заклинания нет доступного способа сотворения.")
    }
    return castSelection(selection)
  }

  return (
    <div
      className="u1-chat-action-backdrop"
      data-mode={mode}
      onPointerDown={onClose}
    >
      <section
        className="u1-chat-action-panel"
        aria-label={copy.title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="u1-chat-action-head">
          <div>
            <span>{copy.eyebrow}</span>
            <strong>{copy.title}</strong>
            <small>
              {characterName ? `${characterName} · ${copy.hint}` : copy.hint}
            </small>
          </div>
          <button type="button" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="u1-chat-action-body">
          {loading ? (
            <div className="u1-chat-action-loading">
              <span className="status-spinner" />
              <p>Собираем данные персонажа…</p>
            </div>
          ) : null}

          {!loading && mode === "roll" ? (
            <RollSurface
              contract={contract}
              busy={busy}
              run={run}
              onFreeRoll={onFreeRoll}
              onCheck={onCheck}
              onClose={onClose}
            />
          ) : null}

          {!loading && mode !== "roll" && !contract ? (
            <EmptyState
              title="Нужен персонаж"
              body="Для этого действия должен быть выбран персонаж."
            />
          ) : null}

          {!loading && contract && mode === "ability" ? (
            <SourceGroups
              groups={abilityGroups}
              busy={busy}
              run={run}
              onAction={onAction}
              onSpell={(spell) => castDefault(spell)}
              emptyTitle="Нет доступных способностей"
              emptyBody="Классовые и особые действия появятся здесь из Character Engine."
            />
          ) : null}

          {!loading && contract && mode === "spell" ? (
            <SpellSlotFlow
              spells={model.spells}
              contract={contract}
              channel={spellChannel}
              setChannel={setSpellChannel}
              busy={busy}
              run={run}
              onCast={castSelection}
              emptyTitle="Нет доступной магии"
            />
          ) : null}

          {!loading && contract && mode === "item" ? (
            <SourceGroups
              groups={itemGroups}
              busy={busy}
              run={run}
              onAction={onAction}
              onSpell={(spell) => castDefault(spell)}
              emptyTitle="Нет доступных предметов"
              emptyBody="Инвентарь не содержит доступных игровых действий."
            />
          ) : null}

          {!loading && contract && mode === "action" ? (
            !attackChannel ? (
              <div className="u1-chat-action-list">
                <button
                  type="button"
                  disabled={!model.attacks.length}
                  onClick={() => setAttackChannel("weapon")}
                >
                  <span className="u1-chat-action-list__icon">⚔</span>
                  <span>
                    <strong>Оружие</strong>
                    <small>
                      {model.attacks.length
                        ? `${model.attacks.length} доступно`
                        : "Нет доступных атак оружием"}
                    </small>
                  </span>
                  <em aria-hidden="true">›</em>
                </button>

                <button
                  type="button"
                  disabled={!model.attackSpells.length}
                  onClick={() => setAttackChannel("spell")}
                >
                  <span className="u1-chat-action-list__icon">✧</span>
                  <span>
                    <strong>Заклинание</strong>
                    <small>
                      {model.attackSpells.length
                        ? `Урон · ${model.attackSpells.length} доступно`
                        : "Нет наносящих урон заклинаний"}
                    </small>
                  </span>
                  <em aria-hidden="true">›</em>
                </button>

                <button
                  type="button"
                  disabled={!specialCount}
                  onClick={() => setAttackChannel("special")}
                >
                  <span className="u1-chat-action-list__icon">◆</span>
                  <span>
                    <strong>Особое</strong>
                    <small>
                      {specialCount
                        ? `Предметы и расходники · ${specialCount}`
                        : "Нет особых атак из предметов"}
                    </small>
                  </span>
                  <em aria-hidden="true">›</em>
                </button>
              </div>
            ) : (
              <div className="u1-chat-action-route">
                <header className="u1-chat-action-route__head u1-chat-action-route__head--back">
                  <button
                    type="button"
                    onClick={() => {
                      setAttackChannel(null)
                      setAttackSpellChannel(null)
                    }}
                  >
                    ‹ Атака
                  </button>
                  <span>Тип атаки</span>
                  <strong>
                    {attackChannel === "weapon"
                      ? "Оружие"
                      : attackChannel === "spell"
                        ? "Заклинание"
                        : "Особое"}
                  </strong>
                </header>

                {attackChannel === "weapon" ? (
                  <ActionRows
                    actions={model.attacks}
                    busy={busy}
                    run={run}
                    onAction={onAction}
                  />
                ) : null}

                {attackChannel === "spell" ? (
                  <SpellSlotFlow
                    spells={model.attackSpells}
                    contract={contract}
                    channel={attackSpellChannel}
                    setChannel={setAttackSpellChannel}
                    busy={busy}
                    run={run}
                    onCast={castSelection}
                    emptyTitle="Нет атакующих заклинаний"
                  />
                ) : null}

                {attackChannel === "special" ? (
                  <SourceGroups
                    groups={specialGroups}
                    busy={busy}
                    run={run}
                    onAction={onAction}
                    onSpell={(spell) => castDefault(spell)}
                    emptyTitle="Нет особых атак"
                    emptyBody="Подходящих атак из предметов сейчас нет."
                  />
                ) : null}
              </div>
            )
          ) : null}

          {error ? (
            <div className="u1-chat-action-error" role="status">
              {error}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
