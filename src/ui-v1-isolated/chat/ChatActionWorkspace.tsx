import { useMemo, useState } from "react"

import type {
  ResolvedAction,
  ResolvedCharacterContract,
} from "../../character-engine/index.ts"
import type { ChatActionModel } from "../../chat-runtime/actionModel.ts"
import {
  createCheckSnakeAction,
  createFreeRollSnakeAction,
  createResolvedActionSnakeAction,
  createResolvedSpellSnakeAction,
  type ChatFreeRollRequest,
  type ChatGameplayRuntime,
  type ChatSpellCastSelection,
} from "../../chat-runtime/gameplayActions.ts"
import {
  ABILITY_ROWS,
  SKILL_NAMES,
  actionSummary,
  isInventoryAction,
  isSpellModifierAction,
  resourceLabels,
  signed,
  spellCastSelectionLabel,
  spellCastSelections,
  spellSummary,
  templateChoiceOptions,
} from "../../chat-runtime/presentation.ts"
import type { CharacterEntity } from "../../entity-engine/types.ts"
import type { SnakeAction, SnakeActionResult } from "../../snake-engine/index.ts"
import { useSnake } from "../SnakeProvider"
import type { ChatActionSectionId } from "./ChatActionLauncher"
import "./chat-action-workspace.css"

type Runtime = {
  character: CharacterEntity | null
  characterId: string | null
  contract: ResolvedCharacterContract | null
  model: ChatActionModel
  loading: boolean
  stale: boolean
  error: string
  narrator: boolean
}

type Props = {
  roomId: string
  sectionId?: string
  runtime: Runtime
  onExecuted: () => void
}

type IconName = "dice" | "skill" | "action" | "item" | "spell" | "shield" | "spark"

function ActionIcon({ name }: { name: IconName }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  }

  if (name === "dice") return <svg {...common}><path d="M7 3h10l4 6-4 12H7L3 9 7 3Z"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/></svg>
  if (name === "skill") return <svg {...common}><path d="M12 3v18M5 8.5 12 3l7 5.5M5 15.5 12 21l7-5.5"/><path d="M5 8.5v7M19 8.5v7"/></svg>
  if (name === "action") return <svg {...common}><path d="m14 2-8 12h6l-2 8 8-12h-6l2-8Z"/></svg>
  if (name === "item") return <svg {...common}><path d="M5 7.5 12 3l7 4.5v9L12 21l-7-4.5v-9Z"/><path d="m5 7.5 7 4.5 7-4.5M12 12v9"/></svg>
  if (name === "spell") return <svg {...common}><path d="M12 2.5 14.2 9 21 12l-6.8 3L12 21.5 9.8 15 3 12l6.8-3L12 2.5Z"/><path d="m18.5 3.5.6 1.8 1.9.7-1.9.7-.6 1.8-.6-1.8-1.9-.7 1.9-.7.6-1.8Z"/></svg>
  if (name === "shield") return <svg {...common}><path d="M12 3 19 6v5c0 4.7-2.9 8.1-7 10-4.1-1.9-7-5.3-7-10V6l7-3Z"/><path d="m9.5 12 1.7 1.7 3.7-4"/></svg>
  return <svg {...common}><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/></svg>
}

function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return <div className="u1-action-empty"><span><ActionIcon name={icon}/></span><strong>{title}</strong><p>{text}</p></div>
}

function LoadingState() {
  return <div className="u1-action-loading" aria-busy="true"><span/><span/><span/><span/></div>
}

function ResourceStrip({ contract }: { contract: ResolvedCharacterContract }) {
  const labels = useMemo(() => resourceLabels(contract), [contract])
  const visible = contract.resources
    .filter((resource) => resource.max.value > 0)
    .slice(0, 8)

  if (!visible.length) return null

  return <div className="u1-action-resources" aria-label="Ресурсы персонажа">
    {visible.map((resource) => {
      const max = Math.max(0, Math.round(resource.max.value))
      const current = Math.max(0, Math.min(max, Math.round(resource.current)))
      const label = labels.get(resource.stateKey) || resource.key.replace(/_/g, " ")
      return <div key={resource.stateKey} className="u1-action-resource" data-empty={current <= 0 || undefined}>
        <span><strong>{label}</strong><small>{current}/{max}</small></span>
        <i><b style={{ width: `${max ? (current / max) * 100 : 0}%` }} /></i>
      </div>
    })}
  </div>
}

function ActorHeader({ runtime }: { runtime: Runtime }) {
  if (runtime.loading) {
    return <div className="u1-action-actor is-loading"><span/><div><i/><i/></div></div>
  }

  if (!runtime.character || !runtime.contract) {
    return <div className="u1-action-actor is-empty">
      <span><ActionIcon name="shield"/></span>
      <div>
        <small>{runtime.narrator ? "Рассказчик" : "Персонаж"}</small>
        <strong>{runtime.narrator ? "Свободный голос ГМ" : "Не выбран"}</strong>
      </div>
    </div>
  }

  return <div className="u1-action-actor">
    <span className="u1-action-actor__mark">
      {runtime.character.name.slice(0, 1).toLocaleUpperCase("ru-RU")}
    </span>
    <div>
      <small>{runtime.character.character_class || "Персонаж"} · {runtime.character.level} уровень</small>
      <strong>{runtime.character.name}</strong>
    </div>
    {runtime.stale && <em>обновляем</em>}
  </div>
}

function FreeRollPanel({
  runtime,
  onFreeRoll,
  onCheck,
}: {
  runtime: Runtime
  onFreeRoll: (request: ChatFreeRollRequest) => void
  onCheck: (label: string, modifier: number, kind: "ability" | "save") => void
}) {
  const [count, setCount] = useState(1)
  const [sides, setSides] = useState(20)
  const [modifier, setModifier] = useState(0)
  const notation = `${count}d${sides}${modifier ? signed(modifier) : ""}`
  const contract = runtime.contract

  return <div className="u1-action-stack">
    <section className="u1-action-dice-card">
      <header>
        <div><small>Свободный бросок</small><strong>{notation}</strong></div>
        <ActionIcon name="dice"/>
      </header>
      <div className="u1-action-dice-quick">
        {[4, 6, 8, 10, 12, 20, 100].map((value) => (
          <button key={value} type="button" data-active={sides === value || undefined} onClick={() => setSides(value)}>d{value}</button>
        ))}
      </div>
      <div className="u1-action-dice-fields">
        <label><span>Кубы</span><input type="number" min="1" max="40" value={count} onChange={(event) => setCount(Math.max(1, Math.min(40, Number(event.target.value) || 1)))}/></label>
        <label><span>Грани</span><input type="number" min="2" max="1000" value={sides} onChange={(event) => setSides(Math.max(2, Math.min(1000, Number(event.target.value) || 20)))}/></label>
        <label><span>Модификатор</span><input type="number" min="-500" max="500" value={modifier} onChange={(event) => setModifier(Math.max(-500, Math.min(500, Number(event.target.value) || 0)))}/></label>
      </div>
      <button className="u1-action-primary" type="button" onClick={() => onFreeRoll({ count, sides, modifier })}>
        <ActionIcon name="dice"/>Бросить {notation}
      </button>
    </section>

    {contract && <section className="u1-action-section">
      <header className="u1-action-section__head">
        <div><small>Персонаж</small><strong>Характеристики и спасброски</strong></div>
        <span>серверный d20</span>
      </header>
      <div className="u1-action-ability-grid">
        {ABILITY_ROWS.map(([key, short, label]) => (
          <div className="u1-action-ability" key={key}>
            <button type="button" onClick={() => onCheck(label, contract.abilities[key].modifier, "ability")}>
              <span>{short}</span><strong>{signed(contract.abilities[key].modifier)}</strong>
            </button>
            <button type="button" onClick={() => onCheck(`Спасбросок: ${label}`, contract.savingThrows[key].bonus.value, "save")}>
              <small>спас</small><b>{signed(contract.savingThrows[key].bonus.value)}</b>
            </button>
          </div>
        ))}
      </div>
    </section>}
  </div>
}

function SkillsPanel({
  runtime,
  onCheck,
}: {
  runtime: Runtime
  onCheck: (label: string, modifier: number) => void
}) {
  if (!runtime.contract) {
    return <EmptyState icon="skill" title="Нужен персонаж" text="Умения берутся из единого resolved-контракта персонажа."/>
  }

  const skills = Object.entries(runtime.contract.skills)
    .map(([skillKey, value]) => ({ ...value, skillKey }))
    .sort((left, right) =>
      (SKILL_NAMES[left.skillKey] || left.skillKey).localeCompare(
        SKILL_NAMES[right.skillKey] || right.skillKey,
        "ru",
      ),
    )

  return <section className="u1-action-section">
    <header className="u1-action-section__head">
      <div><small>Проверки</small><strong>Умения</strong></div><span>{skills.length}</span>
    </header>
    <div className="u1-action-list">
      {skills.map((skill) => (
        <button
          type="button"
          className="u1-action-row"
          key={skill.skillKey}
          onClick={() => onCheck(SKILL_NAMES[skill.skillKey] || skill.skillKey, skill.bonus.value)}
        >
          <span className="u1-action-row__icon"><ActionIcon name="skill"/></span>
          <span className="u1-action-row__copy">
            <strong>{SKILL_NAMES[skill.skillKey] || skill.skillKey}</strong>
            <small>{skill.proficiencyRank >= 2 ? "Экспертиза" : skill.proficiencyRank ? "Владение" : "Без владения"}</small>
          </span>
          <b>{signed(skill.bonus.value)}</b>
        </button>
      ))}
    </div>
  </section>
}

function ActionRow({
  action,
  contract,
  onRun,
}: {
  action: ResolvedAction
  contract: ResolvedCharacterContract
  onRun: (optionKey?: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const resources = useMemo(
    () => new Map(contract.resources.map((resource) => [resource.stateKey, resource])),
    [contract.resources],
  )
  const labels = useMemo(() => resourceLabels(contract), [contract])
  const choices = templateChoiceOptions(action)
  const paymentChoices = !choices.length && action.costOptions.length > 1
    ? action.costOptions.map((option) => ({
        key: option.key,
        label: option.label || option.key,
        available: option.available,
      }))
    : []
  const selectable = choices.length > 0 || paymentChoices.length > 0
  const unavailableReason = !action.available
    ? action.requirements.find((item) => !item.satisfied)?.label || "Сейчас недоступно"
    : ""

  return <article className="u1-action-card" data-disabled={!action.available || undefined} data-expanded={expanded || undefined}>
    <button
      type="button"
      className="u1-action-card__main"
      disabled={!action.available}
      onClick={() => selectable ? setExpanded((value) => !value) : onRun()}
    >
      <span className="u1-action-card__icon"><ActionIcon name={action.attack ? "action" : "spark"}/></span>
      <span className="u1-action-card__copy">
        <strong>{action.label || action.key}</strong>
        <small>{unavailableReason || actionSummary(action, resources, labels)}</small>
      </span>
      <span className="u1-action-card__edge">{selectable ? (expanded ? "−" : "+") : "›"}</span>
    </button>

    {expanded && <div className="u1-action-card__choices">
      {choices.map((choice) => (
        <button type="button" key={choice.key} onClick={() => onRun(choice.key)}>
          <span>{choice.label}</span><b>›</b>
        </button>
      ))}
      {paymentChoices.map((choice) => (
        <button type="button" key={choice.key} disabled={!choice.available} onClick={() => onRun(choice.key)}>
          <span>{choice.label}</span><b>{choice.available ? "›" : "×"}</b>
        </button>
      ))}
    </div>}
  </article>
}

function ActionsPanel({
  runtime,
  itemsOnly,
  onAction,
}: {
  runtime: Runtime
  itemsOnly: boolean
  onAction: (action: ResolvedAction, optionKey?: string) => void
}) {
  const contract = runtime.contract
  if (!contract) {
    return <EmptyState
      icon={itemsOnly ? "item" : "action"}
      title="Нужен персонаж"
      text="Этот раздел строится только из resolved-действий выбранного персонажа."
    />
  }

  const actions = contract.actions.filter((action) =>
    itemsOnly
      ? isInventoryAction(action)
      : !isInventoryAction(action) && !isSpellModifierAction(action),
  )

  if (!actions.length) {
    return <EmptyState
      icon={itemsOnly ? "item" : "action"}
      title={itemsOnly ? "Нет действий предметов" : "Нет доступных действий"}
      text={itemsOnly
        ? "Здесь появляются только реальные действия предметов из Cheburashka → CE."
        : "CE сейчас не отдаёт действий для этого персонажа."}
    />
  }

  return <section className="u1-action-section">
    <header className="u1-action-section__head">
      <div><small>{itemsOnly ? "Инвентарь" : "CE"}</small><strong>{itemsOnly ? "Предметы" : "Действия"}</strong></div>
      <span>{actions.length}</span>
    </header>
    <div className="u1-action-card-list">
      {actions.map((action) => (
        <ActionRow
          key={action.stateKey}
          action={action}
          contract={contract}
          onRun={(optionKey) => onAction(action, optionKey)}
        />
      ))}
    </div>
  </section>
}

function canCombineSpellModifier(selected: ResolvedAction[], candidate: ResolvedAction) {
  if (selected.some((action) => action.stateKey === candidate.stateKey)) return true
  if (selected.length >= 3) return false
  if (candidate.tags.includes("metamagic_stack_exception")) return true
  return !selected.some((action) => !action.tags.includes("metamagic_stack_exception"))
}

function SpellPanel({
  runtime,
  onSpell,
}: {
  runtime: Runtime
  onSpell: (selection: ChatSpellCastSelection, modifiers: ResolvedAction[]) => void
}) {
  const contract = runtime.contract
  const [openSpell, setOpenSpell] = useState<string | null>(null)
  const [selectedModifierKeys, setSelectedModifierKeys] = useState<string[]>([])

  if (!contract) {
    return <EmptyState icon="spell" title="Нужен персонаж" text="Заклинания и способы сотворения приходят из CE."/>
  }

  const spells = runtime.model.spells
  const modifiers = contract.actions.filter(isSpellModifierAction)
  const selectedModifiers = modifiers.filter((modifier) =>
    selectedModifierKeys.includes(modifier.stateKey),
  )
  const grouped = new Map<number, typeof spells>()
  for (const spell of spells) {
    const level = spell.identity.level
    const list = grouped.get(level) || []
    list.push(spell)
    grouped.set(level, list)
  }

  if (!spells.length) {
    return <EmptyState icon="spell" title="Нет доступной магии" text="CE не отдаёт доступных заклинаний для текущего состояния персонажа."/>
  }

  return <div className="u1-action-stack">
    {[...grouped.entries()].sort(([left], [right]) => left - right).map(([level, entries]) => (
      <section className="u1-action-section" key={level}>
        <header className="u1-action-section__head">
          <div><small>{level === 0 ? "Без ячейки" : `Уровень ${level}`}</small><strong>{level === 0 ? "Заговоры" : `Заклинания ${level} уровня`}</strong></div>
          <span>{entries.length}</span>
        </header>
        <div className="u1-action-card-list">
          {entries.map((spell) => {
            const open = openSpell === spell.key
            const casts = spellCastSelections(spell)

            return <article className="u1-action-card u1-action-card--spell" key={spell.key} data-expanded={open || undefined}>
              <button
                type="button"
                className="u1-action-card__main"
                disabled={!spell.available || !casts.length}
                onClick={() => {
                  setOpenSpell((current) => current === spell.key ? null : spell.key)
                  setSelectedModifierKeys([])
                }}
              >
                <span className="u1-action-card__icon"><ActionIcon name="spell"/></span>
                <span className="u1-action-card__copy"><strong>{spell.identity.name}</strong><small>{spellSummary(spell)}</small></span>
                <span className="u1-action-card__edge">{open ? "−" : "+"}</span>
              </button>

              {open && <div className="u1-action-card__spell-body">
                <div className="u1-action-cast-options">
                  {casts.map((selection) => {
                    const key = `${selection.accessKey}:${selection.methodKey}:${selection.optionKey || "free"}`
                    return <button type="button" key={key} onClick={() => onSpell(selection, selectedModifiers)}>
                      <span><strong>Сотворить</strong><small>{spellCastSelectionLabel(selection, contract)}</small></span><b>›</b>
                    </button>
                  })}
                </div>

                {modifiers.length > 0 && <div className="u1-action-modifiers">
                  <small>Модификаторы заклинания</small>
                  <div>
                    {modifiers.map((modifier) => {
                      const active = selectedModifierKeys.includes(modifier.stateKey)
                      const combinable = active || canCombineSpellModifier(selectedModifiers, modifier)
                      return <button
                        type="button"
                        key={modifier.stateKey}
                        data-active={active || undefined}
                        disabled={!modifier.available || !combinable}
                        onClick={() => setSelectedModifierKeys((current) =>
                          active
                            ? current.filter((key) => key !== modifier.stateKey)
                            : [...current, modifier.stateKey],
                        )}
                      >
                        {active ? "✓ " : ""}{modifier.label || modifier.key}
                      </button>
                    })}
                  </div>
                </div>}
              </div>}
            </article>
          })}
        </div>
      </section>
    ))}
  </div>
}

export function ChatActionWorkspace({
  roomId,
  sectionId,
  runtime,
  onExecuted,
}: Props) {
  const snake = useSnake()
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState("")
  const section = (sectionId || "roll") as ChatActionSectionId

  const commandRuntime: ChatGameplayRuntime = {
    roomId,
    characterId: runtime.characterId,
    contract: runtime.contract,
  }

  async function execute(action: SnakeAction) {
    if (busy) return
    setBusy(true)
    setLocalError("")

    const result: SnakeActionResult = await snake.executeAction(
      action,
      {
        type: runtime.characterId ? "character" : "chat_room",
        id: runtime.characterId || roomId,
      },
    )

    setBusy(false)

    if (result.type === "error") {
      setLocalError(result.message)
      return
    }

    if (result.type === "success") onExecuted()
  }

  const content = runtime.loading
    ? <LoadingState/>
    : section === "roll"
      ? <FreeRollPanel
          runtime={runtime}
          onFreeRoll={(request) => void execute(createFreeRollSnakeAction(commandRuntime, request))}
          onCheck={(label, modifier, kind) => void execute(createCheckSnakeAction(commandRuntime, { label, modifier, kind }))}
        />
      : section === "skill"
        ? <SkillsPanel
            runtime={runtime}
            onCheck={(label, modifier) => void execute(createCheckSnakeAction(commandRuntime, { label, modifier, kind: "skill" }))}
          />
        : section === "action"
          ? <ActionsPanel
              runtime={runtime}
              itemsOnly={false}
              onAction={(action, optionKey) => void execute(createResolvedActionSnakeAction(commandRuntime, action, optionKey))}
            />
          : section === "item"
            ? <ActionsPanel
                runtime={runtime}
                itemsOnly
                onAction={(action, optionKey) => void execute(createResolvedActionSnakeAction(commandRuntime, action, optionKey))}
              />
            : <SpellPanel
                runtime={runtime}
                onSpell={(selection, modifiers) => void execute(createResolvedSpellSnakeAction(commandRuntime, selection, modifiers))}
              />

  return <div className="u1-action-workspace" data-chat-drawer-workspace="stage-4" data-section={section} aria-busy={busy || undefined}>
    <ActorHeader runtime={runtime}/>
    {runtime.contract && <ResourceStrip contract={runtime.contract}/>}
    {runtime.error && <div className="u1-action-banner">{runtime.error}</div>}
    {localError && <div className="u1-action-banner is-error">{localError}</div>}
    <div className="u1-action-workspace__body">{content}</div>
    {busy && <div className="u1-action-busy"><span/>Выполняем через Snake…</div>}
  </div>
}
