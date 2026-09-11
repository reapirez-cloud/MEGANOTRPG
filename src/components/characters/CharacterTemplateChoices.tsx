import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../../context/AuthContext.tsx"
import { useCharacters } from "../../context/CharacterContext.tsx"
import { supabase } from "../../lib/supabase.ts"
import {
  commitCharacterTemplateChoice,
  commitCharacterTemplateChoiceV2,
  commitCharacterTemplateRestChoice,
} from "../../lib/templateChoiceRuntime.ts"
import type { StructuredChoiceInstance } from "../../rule-templates/choiceRuntimeV2.ts"
import {
  registeredCharacterTemplateBundles,
  subscribeCharacterTemplateBundles,
} from "../../rule-templates/registry.ts"
import {
  resolveTemplateChoiceStates,
  type TemplateChoiceOptionState,
  type TemplateChoiceState,
} from "../../rule-templates/choiceState.ts"
import "./CharacterTemplateChoices.css"

function optionMatches(option: TemplateChoiceOptionState, query: string) {
  const wanted = query.trim().toLocaleLowerCase("ru-RU")
  if (!wanted) return true
  return `${option.label} ${option.key}`.toLocaleLowerCase("ru-RU").includes(wanted)
}

function instanceEqual(left: StructuredChoiceInstance, right: StructuredChoiceInstance) {
  return left.option === right.option
    && (left.selector || "") === (right.selector || "")
    && (left.selector_value || "") === (right.selector_value || "")
    && JSON.stringify(left.config || {}) === JSON.stringify(right.config || {})
}

function removedStoredCount(stored: StructuredChoiceInstance[], draft: StructuredChoiceInstance[]) {
  const remaining = [...draft]
  let removed = 0
  for (const instance of stored) {
    const index = remaining.findIndex((candidate) => instanceEqual(instance, candidate))
    if (index >= 0) remaining.splice(index, 1)
    else removed += 1
  }
  return removed
}

function selectorLabel(state: TemplateChoiceState, instance: StructuredChoiceInstance) {
  if (!instance.selector_value) return ""
  const option = state.options.find((entry) => entry.key === instance.option)
  return option?.selector?.options.find((entry) => entry.value === instance.selector_value)?.label || instance.selector_value
}

function LegacyChoiceCard({
  characterId,
  state,
  canChoose,
}: {
  characterId: string
  state: TemplateChoiceState
  canChoose: boolean
}) {
  const [draft, setDraft] = useState<string[]>(state.selected)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setDraft(state.selected)
    setError("")
  }, [state.selected, state.required])

  const fixed = new Set(state.selected)
  const searchable = state.options.length > 8
  const available = state.options.filter((option) => option.available)
  const visible = available.filter((option) => optionMatches(option, query))
  const complete = draft.length === state.required

  function toggle(option: TemplateChoiceOptionState) {
    if (!canChoose || fixed.has(option.key) || !option.available) return
    setError("")
    setDraft((current) => {
      if (current.includes(option.key)) return current.filter((key) => key !== option.key)
      if (state.required === 1 && fixed.size === 0) return [option.key]
      if (current.length >= state.required) return current
      return [...current, option.key]
    })
  }

  async function confirm() {
    if (!canChoose || busy || !complete) return
    setBusy(true)
    setError("")
    const result = await commitCharacterTemplateChoice(characterId, state.assignmentId, state.key, draft)
    setBusy(false)
    if (!result.ok) setError(result.error)
  }

  if (state.status === "locked") {
    const selected = state.options.filter((option) => option.selected)
    const showAll = state.options.length <= 8
    return (
      <article className="template-choice-card is-locked">
        <header className="template-choice-card__head">
          <div><small>{state.sourceName} · {state.sourceLevel} ур.</small><strong>{state.label}</strong></div>
          <span className="template-choice-card__badge is-locked">🔒 Зафиксировано</span>
        </header>
        <div className="template-choice-card__options is-summary">
          {(showAll ? state.options : selected).map((option) => (
            <div className={`template-choice-option ${option.selected ? "is-selected" : "is-off"}`} key={option.key}>
              <span>{option.selected ? "✓" : "×"}</span><strong>{option.label}</strong><small>{option.selected ? "Вкл" : "Выкл"}</small>
            </div>
          ))}
          {!showAll && <div className="template-choice-option is-off is-aggregate"><span>×</span><strong>Остальные варианты</strong><small>Выкл · {Math.max(0, state.options.length - selected.length)}</small></div>}
        </div>
      </article>
    )
  }

  return (
    <article className="template-choice-card is-pending">
      <header className="template-choice-card__head">
        <div><small>{state.sourceName} · {state.sourceLevel} ур.</small><strong>{state.label}</strong></div>
        <span className="template-choice-card__badge">Нужен выбор</span>
      </header>
      <div className="template-choice-card__progress"><span>{state.selected.length > 0 ? `Уже зафиксировано: ${state.selected.length}` : "Пока ничего не выбрано"}</span><strong>{draft.length}/{state.required}</strong></div>
      {searchable && <label className="template-choice-card__search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти вариант" /></label>}
      <div className={`template-choice-card__options ${searchable ? "is-scrollable" : ""}`}>
        {visible.map((option) => {
          const selected = draft.includes(option.key)
          const locked = fixed.has(option.key)
          return <button type="button" className={`template-choice-option ${selected ? "is-selected" : ""} ${locked ? "is-fixed" : ""}`} key={option.key} disabled={!canChoose || locked} onClick={() => toggle(option)}>
            <span>{selected ? "✓" : ""}</span><strong>{option.label}</strong><small>{locked ? "Зафиксировано" : selected ? "Выбрано" : "Выбрать"}</small>
          </button>
        })}
        {visible.length === 0 && <div className="template-choice-card__empty">Подходящих вариантов нет.</div>}
      </div>
      {!canChoose && <p className="template-choice-card__notice">Этот выбор может подтвердить владелец персонажа или ГМ.</p>}
      {error && <div className="auth-error template-choice-card__error">{error}</div>}
      <div className="template-choice-card__confirm">
        <p>Старый пакет правил использует постоянный выбор v1. Уже подтверждённые варианты остаются неизменяемыми.</p>
        <button type="button" disabled={!canChoose || busy || !complete} onClick={() => void confirm()}>{busy ? "Фиксируем…" : "Зафиксировать выбор"}</button>
      </div>
    </article>
  )
}

function StructuredChoiceCard({
  characterId,
  state,
  canChoose,
}: {
  characterId: string
  state: TemplateChoiceState
  canChoose: boolean
}) {
  const [draft, setDraft] = useState<StructuredChoiceInstance[]>(state.instances)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState(state.status === "pending")

  useEffect(() => {
    setDraft(state.instances)
    setEditing(state.status === "pending")
    setError("")
  }, [state.instances, state.required, state.status])

  const searchable = state.options.length > 8
  const visible = state.options.filter((option) => optionMatches(option, query))
  const chosenOptions = new Set(draft.map((instance) => instance.option))
  const removed = removedStoredCount(state.instances, draft)

  function dynamicLockedReason(option: TemplateChoiceOptionState) {
    if (!option.available && option.lockedReason) return option.lockedReason
    if (state.sourceLevel < option.minLevel) return `Доступно с ${option.minLevel} уровня`
    const missing = option.requiredOptions.filter((required) => !chosenOptions.has(required))
    if (missing.length > 0) {
      return `Нужно: ${missing.map((key) => state.options.find((entry) => entry.key === key)?.label || key).join(", ")}`
    }
    if (!option.repeatable && chosenOptions.has(option.key)) return "Уже выбрано"
    return null
  }

  function add(option: TemplateChoiceOptionState) {
    if (!canChoose || !editing || draft.length >= state.required || dynamicLockedReason(option)) return
    setError("")
    setDraft((current) => [...current, {
      option: option.key,
      ...(option.selector ? { selector: option.selector.key } : {}),
      config: {},
    }])
  }

  function remove(index: number) {
    const instance = draft[index]
    if (!instance || !canChoose || !editing) return
    const sameOptionCount = draft.filter((entry) => entry.option === instance.option).length
    const requiredBy = sameOptionCount <= 1 && state.options.some((option) =>
      draft.some((entry) => entry.option === option.key)
      && option.requiredOptions.includes(instance.option),
    )
    const stored = state.instances.some((entry) => instanceEqual(entry, instance))
    const limitReached = stored && state.replacementLimit !== null && removed >= state.replacementLimit
    const fixed = stored && !state.canReplaceNow
    if (requiredBy || limitReached || fixed) return
    setError("")
    setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  function setSelector(index: number, value: string) {
    setError("")
    setDraft((current) => current.map((instance, itemIndex) => itemIndex === index
      ? { ...instance, selector_value: value || undefined }
      : instance))
  }

  const selectorComplete = draft.every((instance) => {
    const option = state.options.find((entry) => entry.key === instance.option)
    return !option?.selector || Boolean(instance.selector_value)
  })
  const prerequisitesComplete = draft.every((instance) => {
    const option = state.options.find((entry) => entry.key === instance.option)
    return (option?.requiredOptions || []).every((required) => chosenOptions.has(required))
  })
  const duplicateSelectors = draft.some((instance, index) => instance.selector_value && draft.some((other, otherIndex) =>
    otherIndex !== index && other.option === instance.option && other.selector_value === instance.selector_value,
  ))
  const complete = draft.length === state.required && selectorComplete && prerequisitesComplete && !duplicateSelectors

  async function confirm() {
    if (!canChoose || busy || !complete) return
    setBusy(true)
    setError("")
    const result = state.refresh === "short_rest" || state.refresh === "short_or_long_rest"
      ? await commitCharacterTemplateRestChoice(characterId, state.assignmentId, state.key, draft)
      : await commitCharacterTemplateChoiceV2(characterId, state.assignmentId, state.key, draft)
    setBusy(false)
    if (!result.ok) setError(result.error)
  }

  if (!editing) {
    return (
      <article className={`template-choice-card ${state.status === "editable" ? "is-editable" : "is-locked"}`}>
        <header className="template-choice-card__head">
          <div><small>{state.sourceName} · {state.sourceLevel} ур. · Choice Runtime v2</small><strong>{state.label}</strong></div>
          <span className={`template-choice-card__badge ${state.status === "locked" ? "is-locked" : "is-editable"}`}>{state.status === "locked" ? "🔒 Зафиксировано" : "↻ Можно изменить"}</span>
        </header>
        <div className="template-choice-card__selected-list">
          {state.instances.map((instance, index) => <div className="template-choice-instance is-summary" key={`${instance.option}:${instance.selector_value || index}`}>
            <span>✓</span><div><strong>{state.options.find((entry) => entry.key === instance.option)?.label || instance.option}</strong>{instance.selector_value && <small>{selectorLabel(state, instance)}</small>}</div>
          </div>)}
        </div>
        {state.status === "editable" && <div className="template-choice-card__confirm">
          <p>{state.refresh ? "Изменение разрешит сервер только во время подходящего окна отдыха." : `После получения нового уровня можно заменить не более ${state.replacementLimit || "разрешённого правилами числа"} ранее выбранных вариантов.`}</p>
          <button type="button" disabled={!canChoose} onClick={() => setEditing(true)}>Изменить выбор</button>
        </div>}
      </article>
    )
  }

  return (
    <article className="template-choice-card is-pending is-structured">
      <header className="template-choice-card__head">
        <div><small>{state.sourceName} · {state.sourceLevel} ур. · Choice Runtime v2</small><strong>{state.label}</strong></div>
        <span className="template-choice-card__badge">{state.status === "pending" ? "Нужен выбор" : "Редактирование"}</span>
      </header>
      <div className="template-choice-card__progress"><span>{state.status === "pending" ? `Осталось выбрать: ${Math.max(0, state.required - draft.length)}` : `Заменено старых вариантов: ${removed}${state.replacementLimit ? `/${state.replacementLimit}` : ""}`}</span><strong>{draft.length}/{state.required}</strong></div>

      {draft.length > 0 && <div className="template-choice-card__selected-list">
        {draft.map((instance, index) => {
          const option = state.options.find((entry) => entry.key === instance.option)
          const sameOptionCount = draft.filter((entry) => entry.option === instance.option).length
          const requiredBy = sameOptionCount <= 1 && state.options.some((candidate) => draft.some((entry) => entry.option === candidate.key) && candidate.requiredOptions.includes(instance.option))
          const stored = state.instances.some((entry) => instanceEqual(entry, instance))
          const fixed = stored && !state.canReplaceNow
          const limitReached = stored && state.replacementLimit !== null && removed >= state.replacementLimit
          const cannotRemove = fixed || requiredBy || limitReached
          return <div className="template-choice-instance" key={`${instance.option}:${instance.selector_value || "new"}:${index}`}>
            <span>✓</span>
            <div className="template-choice-instance__copy">
              <strong>{option?.label || instance.option}</strong>
              {option?.selector && <select value={instance.selector_value || ""} onChange={(event) => setSelector(index, event.target.value)} disabled={!canChoose || fixed}>
                <option value="">Выберите цель…</option>
                {option.selector.options.map((selectorOption) => {
                  const used = draft.some((entry, itemIndex) => itemIndex !== index && entry.option === instance.option && entry.selector_value === selectorOption.value)
                  return <option value={selectorOption.value} disabled={used} key={selectorOption.value}>{selectorOption.label}</option>
                })}
              </select>}
              {requiredBy && <small>Нельзя убрать: это требование другого выбранного варианта.</small>}
              {fixed && <small>Этот вариант уже зафиксирован текущим правилом.</small>}
              {limitReached && !fixed && !requiredBy && <small>Лимит замен на этом уровне уже использован.</small>}
            </div>
            <button type="button" className="template-choice-instance__remove" disabled={!canChoose || cannotRemove} onClick={() => remove(index)} aria-label={`Убрать ${option?.label || instance.option}`}>×</button>
          </div>
        })}
      </div>}

      {searchable && <label className="template-choice-card__search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти вариант" /></label>}
      <div className={`template-choice-card__options ${searchable ? "is-scrollable" : ""}`}>
        {visible.map((option) => {
          const reason = dynamicLockedReason(option)
          const full = draft.length >= state.required
          return <button type="button" className={`template-choice-option ${reason ? "is-unavailable" : ""}`} key={option.key} disabled={!canChoose || full || Boolean(reason)} onClick={() => add(option)}>
            <span>{reason ? "🔒" : "+"}</span><strong>{option.label}</strong><small>{reason || (option.selector ? "Добавить и выбрать цель" : option.repeatable ? "Можно повторять" : "Добавить")}</small>
          </button>
        })}
        {visible.length === 0 && <div className="template-choice-card__empty">Подходящих вариантов нет.</div>}
      </div>

      {state.refresh && <p className="template-choice-card__notice">Этот набор можно менять только в открытом окне {state.refresh === "short_rest" ? "короткого отдыха" : "короткого или долгого отдыха"}. Сервер проверяет окно отдыха при сохранении.</p>}
      {duplicateSelectors && <p className="template-choice-card__notice is-warning">Повторяемое воззвание нельзя назначить одной и той же цели дважды.</p>}
      {!canChoose && <p className="template-choice-card__notice">Этот выбор может подтвердить владелец персонажа или ГМ.</p>}
      {error && <div className="auth-error template-choice-card__error">{error}</div>}
      <div className="template-choice-card__confirm">
        <p>Уровни, требования, повторяемость, цели и лимит замен повторно проверяются сервером. Интерфейс не является источником правил.</p>
        <div className="template-choice-card__confirm-actions">
          {state.status === "editable" && <button type="button" className="is-secondary" disabled={busy} onClick={() => { setDraft(state.instances); setEditing(false); setError("") }}>Отмена</button>}
          <button type="button" disabled={!canChoose || busy || !complete} onClick={() => void confirm()}>{busy ? "Сохраняем…" : "Сохранить выбор"}</button>
        </div>
      </div>
    </article>
  )
}

export default function CharacterTemplateChoices({ characterId }: { characterId: string }) {
  const { user } = useAuth()
  const { characters, canManage } = useCharacters()
  const character = characters.find((item) => item.id === characterId) || null
  const [revision, setRevision] = useState(0)
  const [sheetSkillProficiencies, setSheetSkillProficiencies] = useState<Record<string, number>>({})

  useEffect(() => subscribeCharacterTemplateBundles(characterId, () => setRevision((value) => value + 1)), [characterId])

  useEffect(() => {
    let cancelled = false
    void supabase
      .from("character_sheets")
      .select("skill_proficiencies")
      .eq("character_id", characterId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const raw = data?.skill_proficiencies
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          setSheetSkillProficiencies({})
          return
        }
        const entries = Object.entries(raw as Record<string, unknown>).flatMap(([key, value]) => {
          const rank = Number(value)
          return Number.isFinite(rank) && rank > 0 ? [[key, rank] as const] : []
        })
        setSheetSkillProficiencies(Object.fromEntries(entries))
      })
    return () => { cancelled = true }
  }, [characterId, revision])

  const states = useMemo(() => resolveTemplateChoiceStates(
    registeredCharacterTemplateBundles(characterId),
    character?.level || 1,
    { skillProficiencies: sheetSkillProficiencies },
  ).filter((state) => state.status !== "hidden" && (state.templateKind === "class" || state.templateKind === "subclass")), [characterId, character?.level, revision, sheetSkillProficiencies])

  if (!states.length) return null

  const pending = states.filter((state) => state.status === "pending").length
  const editable = states.filter((state) => state.status === "editable").length
  const canChoose = Boolean(canManage || (character?.assigned_user_id && character.assigned_user_id === user.id))

  return (
    <section className="character-tab-section template-choices">
      <header className="template-choices__head">
        <div>
          <span>Character Engine · решения</span>
          <h2>{pending > 0 ? "Нужно завершить выбор" : "Выборы персонажа"}</h2>
          <p>CE показывает требования, цели и повторяемые варианты из правил. Сервер остаётся окончательным источником допустимости выбора.</p>
        </div>
        <strong className={pending > 0 ? "is-pending" : editable > 0 ? "is-editable" : ""}>{pending > 0 ? `${pending} ждёт` : editable > 0 ? `${editable} можно изменить` : "✓ Готово"}</strong>
      </header>
      <div className="template-choices__list">
        {states.map((state) => state.runtimeVersion === 2
          ? <StructuredChoiceCard key={state.id} characterId={characterId} state={state} canChoose={canChoose} />
          : <LegacyChoiceCard key={state.id} characterId={characterId} state={state} canChoose={canChoose} />)}
      </div>
    </section>
  )
}
