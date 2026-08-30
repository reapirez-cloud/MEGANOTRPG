import { useEffect, useMemo, useState } from "react"
import type {
  CharacterPreparationModel,
  ChoicePreparationTask,
  RollPreparationTask,
  SpellPreparationTask,
} from "../../lib/characterPreparation.ts"
import { supabase } from "../../lib/supabase.ts"
import { commitCharacterTemplateChoice } from "../../lib/templateChoiceRuntime.ts"
import "./ChatPreparationCard.css"

type ChatPreparationSpell = {
  id: string
  name: string
  spell_level: number
  prepared: boolean
  cast_mode: string
}

type Props = {
  roomId: string
  characterId: string
  model: CharacterPreparationModel
  spells: ChatPreparationSpell[]
  onChanged: () => void
}

function outcomeLabel(value: unknown) {
  if (value === "weal") return "Благо"
  if (value === "woe") return "Беда"
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  return "Записано"
}

function sameSelection(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const wanted = new Set(right)
  return left.every((value) => wanted.has(value))
}

function SpellTask({ characterId, task, spells, onChanged }: {
  characterId: string
  task: SpellPreparationTask
  spells: ChatPreparationSpell[]
  onChanged: () => void
}) {
  const canonical = useMemo(
    () => spells.filter((spell) => spell.prepared).map((spell) => spell.id),
    [spells],
  )
  const [draft, setDraft] = useState<string[]>(canonical)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setDraft(canonical)
    setError("")
  }, [canonical])

  const levels = useMemo(() => {
    const grouped = new Map<number, ChatPreparationSpell[]>()
    for (const spell of spells) {
      const current = grouped.get(spell.spell_level) || []
      current.push(spell)
      grouped.set(spell.spell_level, current)
    }
    return [...grouped.entries()].sort(([left], [right]) => left - right)
  }, [spells])
  const dirty = !sameSelection(draft, canonical)

  function toggle(id: string) {
    if (busy) return
    setError("")
    setDraft((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id])
  }

  async function save() {
    if (busy) return
    setBusy(true); setError("")
    const { error: rpcError } = await supabase.rpc("commit_character_spell_preparation_v1", {
      p_character_id: characterId,
      p_assignment_id: task.assignmentId,
      p_prepared_spell_ids: draft,
    })
    setBusy(false)
    if (rpcError) { setError(rpcError.message); return }
    onChanged()
  }

  return <section className="rest-prep-task">
    <div className="rest-prep-task__head">
      <span>✧</span>
      <div><small>{task.sourceName}</small><strong>Подготовить заклинания</strong></div>
      {task.record && <b className="rest-prep-task__done">Готово · {task.record.input_value}</b>}
    </div>

    {spells.length === 0 ? (
      <div className="rest-prep-empty">Нет личных заклинаний 1–9 уровня, которые требуют ежедневной подготовки.</div>
    ) : (
      <div className="rest-prep-spell-levels">
        {levels.map(([level, entries]) => <section className="rest-prep-spell-level" key={level}>
          <div className="rest-prep-spell-level__title"><span>{level} уровень</span><small>{entries.filter((spell) => draft.includes(spell.id)).length}/{entries.length}</small></div>
          <div className="rest-prep-spell-list">
            {entries.map((spell) => {
              const selected = draft.includes(spell.id)
              return <button
                type="button"
                className={selected ? "rest-prep-spell is-selected" : "rest-prep-spell"}
                disabled={busy}
                key={spell.id}
                onClick={() => toggle(spell.id)}
              >
                <i>{selected ? "✓" : ""}</i>
                <span>{spell.name}</span>
              </button>
            })}
          </div>
        </section>)}
      </div>
    )}

    <div className="rest-prep-spell-summary">
      <span>Выбрано <strong>{draft.length}</strong></span>
      <small>Заговоры и всегда подготовленные заклинания класса сюда не входят.</small>
    </div>
    <button className="rest-prep-confirm" type="button" disabled={busy || Boolean(task.record && !dirty)} onClick={() => void save()}>
      {busy ? "Сохраняем…" : task.record ? dirty ? "Обновить подготовку" : "Готово" : "Готово"}
    </button>
    {error && <div className="rest-prep-error">{error}</div>}
  </section>
}

function ChoiceTask({ characterId, task, onChanged }: {
  characterId: string
  task: ChoicePreparationTask
  onChanged: () => void
}) {
  const required = Math.max(1, Number(task.definition.count || 1))
  const [draft, setDraft] = useState<string[]>(task.selected.slice(0, required))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setDraft(task.selected.slice(0, required))
    setError("")
  }, [required, task.selected])

  const options = useMemo(() => task.definition.options.map((key) => ({
    key,
    label: task.definition.option_labels?.[key] || key,
  })), [task.definition])

  function toggle(key: string) {
    if (busy) return
    setError("")
    setDraft((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key)
      if (required === 1) return [key]
      if (current.length >= required) return current
      return [...current, key]
    })
  }

  async function save() {
    if (busy || draft.length !== required) return
    setBusy(true); setError("")
    const result = await commitCharacterTemplateChoice(characterId, task.assignmentId, task.key, draft)
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    onChanged()
  }

  return <section className="rest-prep-task">
    <div className="rest-prep-task__head"><span>◇</span><div><small>{task.sourceName}</small><strong>{task.label}</strong></div></div>
    <div className="rest-prep-options">
      {options.map((option) => {
        const selected = draft.includes(option.key)
        return <button type="button" className={selected ? "is-selected" : ""} disabled={busy} key={option.key} onClick={() => toggle(option.key)}><i>{selected ? "✓" : ""}</i><span>{option.label}</span></button>
      })}
    </div>
    <button className="rest-prep-confirm" type="button" disabled={busy || draft.length !== required} onClick={() => void save()}>{busy ? "Сохраняем…" : task.selected.length ? "Сменить на этот отдых" : "Зафиксировать выбор"}</button>
    {error && <div className="rest-prep-error">{error}</div>}
  </section>
}

function RollTask({ roomId, characterId, task, onChanged }: {
  roomId: string
  characterId: string
  task: RollPreparationTask
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const notation = `${task.count}d${task.sides}`

  async function roll() {
    if (busy || task.record) return
    setBusy(true); setError("")
    const { error: rpcError } = await supabase.rpc("send_chat_preparation_roll_v1", {
      p_room_id: roomId,
      p_character_id: characterId,
      p_assignment_id: task.assignmentId,
      p_task_key: task.key,
      p_label: task.label,
    })
    setBusy(false)
    if (rpcError) { setError(rpcError.message); return }
    onChanged()
  }

  return <section className="rest-prep-task">
    <div className="rest-prep-task__head"><span>◈</span><div><small>{task.sourceName} · {notation}</small><strong>{task.label}</strong></div></div>
    {task.record
      ? <div className="rest-prep-record"><span>Записано</span><strong>{task.record.input_value}</strong><em>→ {outcomeLabel(task.record.resolved_value)}</em></div>
      : <button className="rest-prep-roll" type="button" disabled={busy} onClick={() => void roll()}>{busy ? "Бросаем…" : `Бросить ${notation} и записать`}</button>}
    {error && <div className="rest-prep-error">{error}</div>}
  </section>
}

export default function ChatPreparationCard({ roomId, characterId, model, spells, onChanged }: Props) {
  if (!model.session?.is_open || model.tasks.length === 0) return null
  const spellTasks = model.tasks.filter((task): task is SpellPreparationTask => task.kind === "spells")
  const choiceTasks = model.tasks.filter((task): task is ChoicePreparationTask => task.kind === "choice")
  const rollTasks = model.tasks.filter((task): task is RollPreparationTask => task.kind === "roll")

  return <aside className="rest-prep-card">
    <header className="rest-prep-card__header">
      <span className="rest-prep-card__icon">☾</span>
      <div><small>Долгий отдых завершён</small><strong>Подготовка разблокирована</strong></div>
      <b>до первой реплики</b>
    </header>
    <p className="rest-prep-card__warning">Заверши подготовку до первого обычного сообщения от персонажа. <strong>Первый отправленный текст закроет это окно до следующего долгого отдыха.</strong> Броски, способности и заклинания окно не закрывают.</p>

    {spellTasks.map((task) => <SpellTask characterId={characterId} task={task} spells={spells} onChanged={onChanged} key={`${task.assignmentId}:${task.key}`} />)}
    {choiceTasks.map((task) => <ChoiceTask characterId={characterId} task={task} onChanged={onChanged} key={`${task.assignmentId}:${task.key}`} />)}
    {rollTasks.map((task) => <RollTask roomId={roomId} characterId={characterId} task={task} onChanged={onChanged} key={`${task.assignmentId}:${task.key}`} />)}
  </aside>
}
