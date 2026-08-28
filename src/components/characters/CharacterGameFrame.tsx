import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useCharacters } from "../../context/CharacterContext"
import { useCharacterResourceStates } from "../../hooks/useCharacterResourceStates"
import { useCharacterTemplateRegistry } from "../../hooks/useCharacterTemplateRegistry"
import { useRuleTemplates } from "../../hooks/useRuleTemplates"
import { supabase } from "../../lib/supabase"
import { resolveTemplateBundles } from "../../rule-templates/resolver"
import type { CharacterTemplateBundle, RuleChoiceDefinition, RuleTemplateKind } from "../../rule-templates/types"
import "./CharacterGameFrame.css"

type Props = { characterId: string; children: ReactNode }
type LifeState = "alive" | "dead"
type SelectedChoices = Record<string, string | string[]>
type RecoveryTrigger = "short_rest" | "long_rest" | "dawn" | "manual"

const assignmentKinds: RuleTemplateKind[] = ["race", "subrace", "class", "subclass"]
const kindLabel: Record<RuleTemplateKind, string> = {
  race: "Раса",
  subrace: "Подраса",
  class: "Класс",
  subclass: "Подкласс",
}

function selectedValues(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function cloneChoices(value: SelectedChoices | null | undefined): SelectedChoices {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, selected]) => [key, Array.isArray(selected) ? [...selected] : selected]),
  )
}

function choiceOptionLabel(definition: RuleChoiceDefinition, option: string) {
  return definition.option_labels?.[option] || option
}

export default function CharacterGameFrame({ characterId, children }: Props) {
  const { characters, campaignId, canManage, refresh, updateCharacter } = useCharacters()
  const character = characters.find((item) => item.id === characterId) || null
  const assigned = useCharacterTemplateRegistry(characterId)
  const runtime = useCharacterResourceStates(characterId)
  const rules = useRuleTemplates(campaignId)
  const [lifeState, setLifeState] = useState<LifeState>("alive")
  const [diedAt, setDiedAt] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [kind, setKind] = useState<RuleTemplateKind>("race")
  const [templateId, setTemplateId] = useState("")
  const [templateLevel, setTemplateLevel] = useState(character?.level || 1)
  const [selectedChoices, setSelectedChoices] = useState<SelectedChoices>({})
  const [saving, setSaving] = useState(false)
  const [suppressionSaving, setSuppressionSaving] = useState("")
  const [error, setError] = useState("")

  const loadLife = useCallback(async () => {
    const { data, error: lifeError } = await supabase
      .from("characters")
      .select("life_state,died_at")
      .eq("id", characterId)
      .maybeSingle()
    if (lifeError || !data) return
    setLifeState(data.life_state === "dead" ? "dead" : "alive")
    setDiedAt(data.died_at || null)
  }, [characterId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void loadLife() })
    return () => { cancelled = true }
  }, [loadLife])

  const existingRace = assigned.bundles.find((item) => item.template.kind === "race") || null
  const existingSubrace = assigned.bundles.find((item) => item.template.kind === "subrace") || null
  const existingClasses = assigned.bundles.filter((item) => item.template.kind === "class")
  const existingSubclasses = assigned.bundles.filter((item) => item.template.kind === "subclass")
  const chosenTemplate = rules.templates.find((item) => item.id === templateId) || null
  const existingChosenBundle = assigned.bundles.find((item) => item.template.id === templateId) || null
  const classLevelByTemplate = useMemo(
    () => new Map(existingClasses.map((bundle) => [bundle.template.id, bundle.assignment.template_level || 1])),
    [existingClasses],
  )

  const templatesForKind = useMemo(() => rules.templates.filter((item) => {
    if (item.kind !== kind || !item.is_active) return false
    if (kind === "subrace") return Boolean(existingRace && item.parent_template_id === existingRace.template.id)
    if (kind === "subclass") {
      if (!item.parent_template_id) return false
      const parentLevel = classLevelByTemplate.get(item.parent_template_id)
      return parentLevel !== undefined && parentLevel >= (item.unlock_level || 1)
    }
    return true
  }), [classLevelByTemplate, existingRace, kind, rules.templates])

  const effectiveChoiceLevel = chosenTemplate?.kind === "class"
    ? templateLevel
    : chosenTemplate?.kind === "subclass" && chosenTemplate.parent_template_id
      ? classLevelByTemplate.get(chosenTemplate.parent_template_id) || 1
      : character?.level || 1

  const choiceDefs = useMemo(() => {
    if (!chosenTemplate) return []
    const result = [...(chosenTemplate.choices || [])]
    for (const level of rules.levels
      .filter((item) => item.template_id === chosenTemplate.id && item.level <= effectiveChoiceLevel)
      .sort((a, b) => a.level - b.level)) {
      result.push(...(level.choices || []))
    }
    return result
  }, [chosenTemplate, effectiveChoiceLevel, rules.levels])

  const sourceResolution = useMemo(
    () => resolveTemplateBundles(assigned.bundles, character?.level || 1),
    [assigned.bundles, character?.level],
  )

  const classMechanicGroups = useMemo(() => assigned.bundles
    .filter((bundle) => bundle.template.kind === "class" || bundle.template.kind === "subclass")
    .map((bundle) => ({
      bundle,
      root: sourceResolution.sources.find((node) => node.templateId === bundle.template.id && node.nodeKind === "template") || null,
      nodes: sourceResolution.sources.filter((node) => node.templateId === bundle.template.id && node.nodeKind !== "template"),
    })), [assigned.bundles, sourceResolution.sources])

  function chooseKind(next: RuleTemplateKind) {
    setKind(next)
    setTemplateId("")
    setSelectedChoices({})
  }

  function chooseTemplate(id: string) {
    setTemplateId(id)
    const next = rules.templates.find((item) => item.id === id)
    const existing = assigned.bundles.find((item) => item.template.id === id)
    setSelectedChoices(cloneChoices(existing?.assignment.selected_choices))
    setKind(next?.kind || kind)
    if (next?.kind === "class") {
      setTemplateLevel(existing?.assignment.template_level || character?.level || 1)
    }
  }

  function toggleChoice(definition: RuleChoiceDefinition, option: string) {
    const required = Math.max(1, definition.count || 1)
    if (required === 1) {
      setSelectedChoices((current) => ({ ...current, [definition.key]: option }))
      return
    }
    setSelectedChoices((current) => {
      const previous = selectedValues(current[definition.key])
      const exists = previous.includes(option)
      const next = exists
        ? previous.filter((item) => item !== option)
        : previous.length < required
          ? [...previous, option]
          : [...previous.slice(1), option]
      return { ...current, [definition.key]: next }
    })
  }

  async function assignTemplate() {
    if (!chosenTemplate || !character) return
    const selectedLevel = chosenTemplate.kind === "class" ? Math.max(1, Math.min(30, templateLevel)) : null
    const nextChoices = {
      ...cloneChoices(existingChosenBundle?.assignment.selected_choices),
      ...cloneChoices(selectedChoices),
    }

    setSaving(true)
    setError("")
    const { error: assignError } = await supabase.rpc("assign_character_template_v2", {
      p_character_id: characterId,
      p_template_id: chosenTemplate.id,
      p_template_level: selectedLevel,
      p_selected_choices: nextChoices,
    })
    if (assignError) {
      setSaving(false)
      setError(assignError.message)
      return
    }

    if (chosenTemplate.kind === "class" && selectedLevel) {
      const { error: profileError } = await supabase.rpc("apply_class_template_sheet_profile", {
        p_character_id: characterId,
        p_template_id: chosenTemplate.id,
        p_template_level: selectedLevel,
      })
      if (profileError) {
        setSaving(false)
        await assigned.reload()
        setError(`Класс назначен, но профиль листа не применился: ${profileError.message}`)
        return
      }
      if (!existingClasses.length && chosenTemplate.is_builtin) {
        const labelResult = await updateCharacter(character.id, {
          name: character.name,
          character_class: chosenTemplate.name,
          level: character.level,
          bio: character.bio,
          avatar_url: character.avatar_url,
          assigned_user_id: character.assigned_user_id,
          character_type: character.character_type,
          visibility: character.visibility,
        })
        if (!labelResult.ok) setError(labelResult.error || "Класс назначен, но название класса в карточке не обновилось.")
      }
    }

    setSaving(false)
    setTemplateId("")
    setSelectedChoices({})
    await Promise.all([assigned.reload(), refresh()])
  }

  async function removeAssignment(assignmentId: string) {
    setSaving(true)
    setError("")
    const { error: removeError } = await supabase
      .from("character_template_assignments")
      .delete()
      .eq("id", assignmentId)
    setSaving(false)
    if (removeError) {
      setError(removeError.message)
      return
    }
    await assigned.reload()
  }

  async function toggleSource(sourceId: string) {
    if (!sourceId || suppressionSaving) return
    const currentlySuppressed = assigned.suppressions.sourceIds.has(sourceId)
    setSuppressionSaving(sourceId)
    setError("")
    const result = await assigned.suppressions.setSuppressed(sourceId, !currentlySuppressed)
    setSuppressionSaving("")
    if (!result.ok) setError(result.error)
  }

  async function changeLife(next: LifeState) {
    setSaving(true)
    setError("")
    const { error: stateError } = await supabase.rpc("set_character_life_state", {
      p_character_id: characterId,
      p_life_state: next,
    })
    setSaving(false)
    if (stateError) {
      setError(stateError.message)
      return
    }
    await Promise.all([loadLife(), refresh()])
  }

  async function recover(trigger: RecoveryTrigger) {
    setSaving(true)
    setError("")
    const request = trigger === "short_rest"
      ? supabase.rpc("grant_character_short_rest", { p_character_id: characterId })
      : trigger === "long_rest"
        ? supabase.rpc("grant_character_long_rest", { p_character_id: characterId })
        : supabase.rpc("recover_character_resources", { p_character_id: characterId, p_trigger: trigger })
    const { error: recoveryError } = await request
    setSaving(false)
    if (recoveryError) {
      setError(recoveryError.message)
      return
    }
    await runtime.reload()
  }

  const assignedSummary = useMemo(() => [
    existingRace?.template.name,
    existingSubrace?.template.name,
    ...existingClasses.flatMap((entry) => [
      entry.template.name,
      ...existingSubclasses
        .filter((sub) => sub.template.parent_template_id === entry.template.id)
        .map((sub) => sub.template.name),
    ]),
  ].filter(Boolean).join(" · "), [existingClasses, existingRace, existingSubclasses, existingSubrace])

  const renderedChildren = isValidElement(children)
    ? cloneElement(children, { key: `${characterId}:${assigned.revision}:${runtime.revision}` })
    : children
  const assignedItems = [existingRace, existingSubrace, ...existingClasses, ...existingSubclasses]
    .filter((item): item is CharacterTemplateBundle => Boolean(item))

  return <div className={`character-game-frame ${lifeState === "dead" ? "is-dead" : ""}`}>
    {renderedChildren}
    {lifeState === "dead" && <div className="character-death-ribbon">
      <span>†</span>
      <div>
        <strong>Мёртв</strong>
        <small>{diedAt ? `С ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(diedAt))}` : "История персонажа закрыта для действий"}</small>
      </div>
    </div>}

    {canManage && <button type="button" className="character-game-admin-button" onClick={() => setSheetOpen(true)}>
      <span>◇</span>
      <span>
        <small>Игровые правила</small>
        <strong>{assignedSummary || "Шаблоны и статус"}</strong>
      </span>
    </button>}

    {sheetOpen && <div className="soft-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheetOpen(false) }}>
      <section className="soft-sheet character-game-admin-sheet">
        <div className="soft-sheet__handle"/>
        <header className="soft-sheet__header">
          <div><small>Персонаж</small><h2>{character?.name || "Игровые правила"}</h2></div>
          <button type="button" className="soft-sheet__close" onClick={() => setSheetOpen(false)}>×</button>
        </header>

        <section className="character-admin-section">
          <div className="character-admin-section__head">
            <div><small>Статус</small><h3>Состояние персонажа</h3></div>
            <span className={`life-pill life-pill--${lifeState}`}>{lifeState === "dead" ? "Мёртв" : "Жив"}</span>
          </div>
          <div className="life-actions">
            <button type="button" className={lifeState === "alive" ? "is-active" : ""} disabled={saving} onClick={() => void changeLife("alive")}>Жив</button>
            <button type="button" className={lifeState === "dead" ? "is-danger is-active" : "is-danger"} disabled={saving} onClick={() => void changeLife("dead")}>† Мёртв</button>
          </div>
          <p>Смерть автоматически закрывает персональный чат для действий и снимает персонажа с активного статуса.</p>
        </section>

        <section className="character-admin-section">
          <div className="character-admin-section__head">
            <div><small>Ресурсы</small><h3>Отдых и восстановление</h3></div>
            <span className="life-pill">{runtime.rows.length} ресурсов</span>
          </div>
          <div className="resource-recovery-grid">
            <button type="button" disabled={saving} onClick={() => void recover("short_rest")}>◷ Короткий отдых</button>
            <button type="button" disabled={saving} onClick={() => void recover("long_rest")}>☾ Долгий отдых</button>
            <button type="button" disabled={saving} onClick={() => void recover("dawn")}>☀ Рассвет</button>
            <button type="button" disabled={saving} onClick={() => void recover("manual")}>↻ Восстановить ручные</button>
          </div>
          <p>Каждый запас восстанавливается по правилам своей способности. Долгий отдых также возвращает HP и ячейки заклинаний.</p>
        </section>

        <section className="character-admin-section">
          <div className="character-admin-section__head"><div><small>Правила</small><h3>Назначенные шаблоны</h3></div></div>
          <div className="assigned-template-list">
            {assignedItems.map((bundle) => <div className="assigned-template assigned-template--editable" key={bundle.assignment.id}>
              <span className="assigned-template__icon">{bundle.template.kind.includes("race") ? "◈" : "◇"}</span>
              <span>
                <small>{kindLabel[bundle.template.kind]}{bundle.assignment.template_level ? ` · ${bundle.assignment.template_level} ур.` : ""}</small>
                <strong>{bundle.template.name}</strong>
              </span>
              <button type="button" className="assigned-template__edit" disabled={saving} onClick={() => chooseTemplate(bundle.template.id)} aria-label={`Изменить ${bundle.template.name}`}>✎</button>
              <button type="button" disabled={saving} onClick={() => void removeAssignment(bundle.assignment.id)} aria-label={`Удалить ${bundle.template.name}`}>×</button>
            </div>)}
            {!assignedItems.length && <div className="template-assignment-empty">Шаблоны ещё не назначены.</div>}
          </div>
        </section>

        {classMechanicGroups.length > 0 && <section className="character-admin-section class-mechanics-control">
          <div className="character-admin-section__head">
            <div><small>Точная настройка</small><h3>Механики класса</h3></div>
            <span className="life-pill">{assigned.suppressions.sourceIds.size} выкл.</span>
          </div>
          <p>Выключение хранится у персонажа отдельно. Повышение уровня не включит способность обратно само.</p>
          <div className="class-mechanics-groups">
            {classMechanicGroups.map(({ bundle, root, nodes }) => {
              const rootSuppressed = Boolean(root && assigned.suppressions.sourceIds.has(root.id))
              return <details className={`class-mechanics-group ${rootSuppressed ? "is-suppressed" : ""}`} key={bundle.assignment.id}>
                <summary>
                  <span className="class-mechanics-group__icon">{bundle.template.kind === "class" ? "◇" : "✦"}</span>
                  <span><small>{kindLabel[bundle.template.kind]} · {bundle.template.kind === "class" ? bundle.assignment.template_level || character?.level || 1 : classLevelByTemplate.get(bundle.template.parent_template_id || "") || character?.level || 1} ур.</small><strong>{bundle.template.name}</strong></span>
                  <span className="class-mechanics-group__count">{nodes.length}</span>
                </summary>
                <div className="class-mechanics-group__body">
                  {root && <div className="class-source-row class-source-row--root">
                    <span><small>Вся ветка</small><strong>{bundle.template.name}</strong></span>
                    <button
                      type="button"
                      className={rootSuppressed ? "is-off" : "is-on"}
                      disabled={Boolean(suppressionSaving)}
                      aria-pressed={!rootSuppressed}
                      onClick={() => void toggleSource(root.id)}
                    >{suppressionSaving === root.id ? "…" : rootSuppressed ? "Выкл" : "Вкл"}</button>
                  </div>}
                  <div className="class-source-list">
                    {nodes.map((node) => {
                      const ownSuppressed = assigned.suppressions.sourceIds.has(node.id)
                      const effectiveSuppressed = rootSuppressed || ownSuppressed
                      return <div className={`class-source-row ${effectiveSuppressed ? "is-suppressed" : ""}`} key={node.id}>
                        <span>
                          <small>{node.nodeKind === "choice" ? "Выбор" : node.unlockLevel > 1 ? `${node.unlockLevel} уровень` : "Базовая механика"}</small>
                          <strong>{node.name}</strong>
                        </span>
                        <button
                          type="button"
                          className={effectiveSuppressed ? "is-off" : "is-on"}
                          disabled={rootSuppressed || Boolean(suppressionSaving)}
                          aria-pressed={!effectiveSuppressed}
                          onClick={() => void toggleSource(node.id)}
                        >{suppressionSaving === node.id ? "…" : rootSuppressed ? "Ветка выкл" : ownSuppressed ? "Выкл" : "Вкл"}</button>
                      </div>
                    })}
                    {!nodes.length && <div className="template-assignment-empty">У этого шаблона пока нет отдельных автоматических механик.</div>}
                  </div>
                </div>
              </details>
            })}
          </div>
        </section>}

        <section className="character-admin-section">
          <div className="character-admin-section__head"><div><small>Назначение</small><h3>Раса, класс и специализация</h3></div></div>
          <div className="template-kind-switch template-kind-switch--four">
            {assignmentKinds.map((entry) => <button type="button" key={entry} className={kind === entry ? "is-active" : ""} onClick={() => chooseKind(entry)}>{kindLabel[entry]}</button>)}
          </div>
          <select className="app-select" value={templateId} onChange={(event) => chooseTemplate(event.target.value)}>
            <option value="">Выберите шаблон</option>
            {templatesForKind.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
          {kind === "class" && chosenTemplate && <label className="template-level-field">
            <span>Уровень в этом классе</span>
            <input className="app-input" type="number" min="1" max="30" value={templateLevel} onChange={(event) => setTemplateLevel(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}/>
          </label>}
          {(kind === "subrace" && !existingRace) && <div className="template-assignment-empty">Сначала назначьте расу.</div>}
          {(kind === "subclass" && !existingClasses.length) && <div className="template-assignment-empty">Сначала назначьте класс и нужный уровень.</div>}
          {choiceDefs.length > 0 && <div className="template-choice-fields">
            <div className="template-choice-note"><span>◇</span><p><strong>Выбор можно оставить на потом</strong><small>Нерешённый вариант ничего не выдаёт и не мешает назначить класс. Уже сделанный выбор сохраняется при повышении уровня.</small></p></div>
            {choiceDefs.map((choice) => {
              const required = Math.max(1, choice.count || 1)
              const selected = selectedValues(selectedChoices[choice.key])
              return <div className="template-choice-field" key={choice.key}>
                <span>{choice.label}{required > 1 ? ` · ${selected.length}/${required}` : ""}</span>
                {required === 1
                  ? <select className="app-select" value={selected[0] || ""} onChange={(event) => toggleChoice(choice, event.target.value)}>
                      <option value="">Не выбрано</option>
                      {choice.options.map((option) => <option key={option} value={option}>{choiceOptionLabel(choice, option)}</option>)}
                    </select>
                  : <div className="template-choice-chips">{choice.options.map((option) => <button type="button" key={option} className={selected.includes(option) ? "is-active" : ""} onClick={() => toggleChoice(choice, option)}>{selected.includes(option) ? "✓ " : ""}{choiceOptionLabel(choice, option)}</button>)}</div>}
              </div>
            })}
          </div>}
          <button className="template-assign-button" type="button" disabled={!chosenTemplate || saving} onClick={() => void assignTemplate()}>
            {saving ? "Сохраняем…" : existingChosenBundle ? "Сохранить изменения" : "Назначить шаблон"}
          </button>
        </section>

        {(error || assigned.error || rules.error || runtime.error) && <div className="sheet-error">{error || assigned.error || rules.error || runtime.error}</div>}
      </section>
    </div>}
  </div>
}
