import { useMemo, useState } from "react"

import type {
  AbilityKey,
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedSpell,
  SkillKey,
} from "../../character-engine/index.ts"
import {
  buildChatActionModel,
  type ChatActionSourceGroup,
} from "../../components/chat/chatActionModel.ts"
import type { ChatActionLauncherMode } from "./chatRoomContracts"
import "./chat-action-panel.css"

export type FreeDiceRequest = {
  count: number
  sides: number
  modifier: number
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
    hint: "Класс и подкласс",
  },
  spell: {
    eyebrow: "Персонаж",
    title: "Заклинания",
    hint: "Доступная магия",
  },
  item: {
    eyebrow: "Персонаж",
    title: "Инвентарь",
    hint: "Предметы и расходники",
  },
  action: {
    eyebrow: "Персонаж",
    title: "Атака",
    hint: "Оружие и атакующая магия",
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

  return parts.join(" · ") || "Игровое действие"
}

function spellSummary(spell: ResolvedSpell) {
  const level =
    spell.identity.level > 0
      ? `${spell.identity.level} уровень`
      : "Заговор"
  return level
}

function actionChoice(
  action: ResolvedAction,
): { options: string[]; labels?: Record<string, string> } | null {
  const choice = action.effects.find((effect) => effect.kind === "template_choice")
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
  onAction: (action: ResolvedAction, optionKey?: string) => void | Promise<void>
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
  onAction: (action: ResolvedAction, optionKey?: string) => void | Promise<void>
  onSpell: (spell: ResolvedSpell) => void | Promise<void>
  emptyTitle: string
  emptyBody: string
}) {
  if (!groups.length) {
    return <EmptyState title={emptyTitle} body={emptyBody} />
  }

  return (
    <div className="u1-chat-action-groups">
      {groups.map((group) => (
        <section className="u1-chat-action-group" key={group.id}>
          <header>
            <span>{group.sourceType === "inventory_item" ? "Предмет" : "Источник"}</span>
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
      ))}
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
                        onCheck(label, contract.abilities[key].modifier, "ability"),
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
                      onCheck(skillNames[skill.key], skill.bonus.value, "skill"),
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
              groups={model.classGroups}
              busy={busy}
              run={run}
              onAction={onAction}
              onSpell={onSpell}
              emptyTitle="Нет доступных способностей"
              emptyBody="Классовые действия появятся здесь из Character Engine."
            />
          ) : null}

          {!loading && contract && mode === "spell" ? (
            model.spells.length ? (
              <SpellRows
                spells={model.spells}
                busy={busy}
                run={run}
                onSpell={onSpell}
              />
            ) : (
              <EmptyState
                title="Нет доступных заклинаний"
                body="Сейчас у персонажа нет доступной магии этого типа."
              />
            )
          ) : null}

          {!loading && contract && mode === "item" ? (
            <SourceGroups
              groups={itemGroups}
              busy={busy}
              run={run}
              onAction={onAction}
              onSpell={onSpell}
              emptyTitle="Нет доступных предметов"
              emptyBody="Инвентарь не содержит доступных игровых действий."
            />
          ) : null}

          {!loading && contract && mode === "action" ? (
            model.attacks.length || model.attackSpells.length ? (
              <>
                <ActionRows
                  actions={model.attacks}
                  busy={busy}
                  run={run}
                  onAction={onAction}
                />
                <SpellRows
                  spells={model.attackSpells}
                  busy={busy}
                  run={run}
                  onSpell={onSpell}
                />
              </>
            ) : (
              <EmptyState
                title="Нет доступных атак"
                body="Оружие и атакующие заклинания здесь не найдены."
              />
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
