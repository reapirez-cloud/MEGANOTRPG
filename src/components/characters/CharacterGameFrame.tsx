import { cloneElement, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react"
import { useCharacters } from "../../context/CharacterContext"
import { useCharacterTemplateRegistry } from "../../hooks/useCharacterTemplateRegistry"
import { useRuleTemplates } from "../../hooks/useRuleTemplates"
import { supabase } from "../../lib/supabase"
import type { RuleChoiceDefinition, RuleTemplateKind } from "../../rule-templates/types"

type Props = { characterId: string; children: ReactNode }
type LifeState = "alive" | "dead"
type SelectedChoices = Record<string, string | string[]>

function selectedValues(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

export default function CharacterGameFrame({ characterId, children }: Props) {
  const { characters, campaignId, canManage, refresh } = useCharacters()
  const character = characters.find((item) => item.id === characterId) || null
  const assigned = useCharacterTemplateRegistry(characterId)
  const rules = useRuleTemplates(campaignId)
  const [lifeState, setLifeState] = useState<LifeState>("alive")
  const [diedAt, setDiedAt] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [kind, setKind] = useState<RuleTemplateKind>("race")
  const [templateId, setTemplateId] = useState("")
  const [templateLevel, setTemplateLevel] = useState(character?.level || 1)
  const [selectedChoices, setSelectedChoices] = useState<SelectedChoices>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function loadLife() {
    const { data, error: lifeError } = await supabase.from("characters").select("life_state,died_at").eq("id", characterId).maybeSingle()
    if (lifeError || !data) return
    setLifeState(data.life_state === "dead" ? "dead" : "alive"); setDiedAt(data.died_at || null)
  }
  useEffect(() => { void loadLife() }, [characterId])

  const chosenTemplate = rules.templates.find((item) => item.id === templateId) || null
  const templatesForKind = rules.templates.filter((item) => item.kind === kind && item.is_active)
  const existingRace = assigned.bundles.find((item) => item.template.kind === "race") || null
  const existingClasses = assigned.bundles.filter((item) => item.template.kind === "class")
  const effectiveChoiceLevel = chosenTemplate?.kind === "class" ? templateLevel : character?.level || 1
  const choiceDefs = useMemo(() => {
    if (!chosenTemplate) return []
    const result = [...(chosenTemplate.choices || [])]
    for (const level of rules.levels.filter((item) => item.template_id === chosenTemplate.id && item.level <= effectiveChoiceLevel).sort((a, b) => a.level - b.level)) result.push(...(level.choices || []))
    return result
  }, [chosenTemplate, effectiveChoiceLevel, rules.levels])

  function chooseTemplate(id: string) {
    setTemplateId(id); setSelectedChoices({})
    const next = rules.templates.find((item) => item.id === id)
    setKind(next?.kind || kind)
    if (next?.kind === "class") setTemplateLevel(character?.level || 1)
  }

  function choiceComplete(definition: RuleChoiceDefinition) {
    return selectedValues(selectedChoices[definition.key]).length >= Math.max(1, definition.count || 1)
  }

  function toggleChoice(definition: RuleChoiceDefinition, option: string) {
    const required = Math.max(1, definition.count || 1)
    if (required === 1) { setSelectedChoices((current) => ({ ...current, [definition.key]: option })); return }
    setSelectedChoices((current) => {
      const previous = selectedValues(current[definition.key])
      const exists = previous.includes(option)
      const next = exists ? previous.filter((item) => item !== option) : previous.length < required ? [...previous, option] : [...previous.slice(1), option]
      return { ...current, [definition.key]: next }
    })
  }

  async function assignTemplate() {
    if (!chosenTemplate || !character) return
    setSaving(true); setError("")
    if (chosenTemplate.kind === "race") {
      const oldRaceIds = assigned.bundles.filter((item) => item.template.kind === "race" && item.template.id !== chosenTemplate.id).map((item) => item.assignment.id)
      if (oldRaceIds.length) {
        const removed = await supabase.from("character_template_assignments").delete().in("id", oldRaceIds)
        if (removed.error) { setSaving(false); setError(removed.error.message); return }
      }
    }
    const { error: assignError } = await supabase.rpc("assign_character_template", {
      p_character_id: characterId,
      p_template_id: chosenTemplate.id,
      p_template_level: chosenTemplate.kind === "class" ? Math.max(1, Math.min(30, templateLevel)) : null,
      p_selected_choices: selectedChoices,
    })
    setSaving(false)
    if (assignError) { setError(assignError.message); return }
    setTemplateId(""); setSelectedChoices({}); await assigned.reload()
  }

  async function removeAssignment(assignmentId: string) {
    setSaving(true); setError("")
    const { error: removeError } = await supabase.from("character_template_assignments").delete().eq("id", assignmentId)
    setSaving(false)
    if (removeError) { setError(removeError.message); return }
    await assigned.reload()
  }

  async function changeLife(next: LifeState) {
    setSaving(true); setError("")
    const { error: stateError } = await supabase.rpc("set_character_life_state", { p_character_id: characterId, p_life_state: next })
    setSaving(false)
    if (stateError) { setError(stateError.message); return }
    await Promise.all([loadLife(), refresh()])
  }

  const assignedSummary = useMemo(() => [existingRace?.template.name, ...existingClasses.map((entry) => `${entry.template.name}${entry.assignment.template_level ? ` ${entry.assignment.template_level}` : ""}`)].filter(Boolean).join(" · "), [existingClasses, existingRace])
  const renderedChildren = isValidElement(children) ? cloneElement(children, { key: `${characterId}:${assigned.revision}` }) : children

  return <div className={`character-game-frame ${lifeState === "dead" ? "is-dead" : ""}`}>
    {renderedChildren}
    {lifeState === "dead" && <div className="character-death-ribbon"><span>†</span><div><strong>Мёртв</strong><small>{diedAt ? `С ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(diedAt))}` : "История персонажа закрыта для действий"}</small></div></div>}
    {canManage && <button type="button" className="character-game-admin-button" onClick={() => setSheetOpen(true)}><span>◇</span><span><small>Игровые правила</small><strong>{assignedSummary || "Шаблоны и статус"}</strong></span></button>}

    {sheetOpen && <div className="soft-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheetOpen(false) }}><section className="soft-sheet character-game-admin-sheet"><div className="soft-sheet__handle"/><header className="soft-sheet__header"><div><small>Персонаж</small><h2>{character?.name || "Игровые правила"}</h2></div><button type="button" className="soft-sheet__close" onClick={() => setSheetOpen(false)}>×</button></header>
      <section className="character-admin-section"><div className="character-admin-section__head"><div><small>Lifecycle</small><h3>Состояние персонажа</h3></div><span className={`life-pill life-pill--${lifeState}`}>{lifeState === "dead" ? "Мёртв" : "Жив"}</span></div><div className="life-actions"><button type="button" className={lifeState === "alive" ? "is-active" : ""} disabled={saving} onClick={() => void changeLife("alive")}>Жив</button><button type="button" className={lifeState === "dead" ? "is-danger is-active" : "is-danger"} disabled={saving} onClick={() => void changeLife("dead")}>† Мёртв</button></div><p>Смерть автоматически закрывает персональный чат для действий и снимает персонажа с активного статуса. Возвращение открывает историю снова.</p></section>

      <section className="character-admin-section"><div className="character-admin-section__head"><div><small>Character Engine</small><h3>Назначенные шаблоны</h3></div></div><div className="assigned-template-list">{existingRace && <div className="assigned-template"><span className="assigned-template__icon">◈</span><span><small>Раса</small><strong>{existingRace.template.name}</strong></span><button type="button" disabled={saving} onClick={() => void removeAssignment(existingRace.assignment.id)}>×</button></div>}{existingClasses.map((bundle) => <div className="assigned-template" key={bundle.assignment.id}><span className="assigned-template__icon">◇</span><span><small>Класс · {bundle.assignment.template_level || character?.level || 1} ур.</small><strong>{bundle.template.name}</strong></span><button type="button" disabled={saving} onClick={() => void removeAssignment(bundle.assignment.id)}>×</button></div>)}{!existingRace && !existingClasses.length && <div className="template-assignment-empty">Шаблоны ещё не назначены.</div>}</div></section>

      <section className="character-admin-section"><div className="character-admin-section__head"><div><small>Добавить источник</small><h3>Раса или класс</h3></div></div><div className="template-kind-switch"><button type="button" className={kind === "race" ? "is-active" : ""} onClick={() => { setKind("race"); setTemplateId(""); setSelectedChoices({}) }}>Раса</button><button type="button" className={kind === "class" ? "is-active" : ""} onClick={() => { setKind("class"); setTemplateId(""); setSelectedChoices({}) }}>Класс</button></div><select className="app-select" value={templateId} onChange={(event) => chooseTemplate(event.target.value)}><option value="">Выберите шаблон</option>{templatesForKind.map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}</select>{kind === "class" && chosenTemplate && <label className="template-level-field"><span>Уровень в этом классе</span><input className="app-input" type="number" min="1" max="30" value={templateLevel} onChange={(event) => setTemplateLevel(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}/></label>}
        {choiceDefs.length > 0 && <div className="template-choice-fields">{choiceDefs.map((choice) => { const required = Math.max(1, choice.count || 1); const selected = selectedValues(selectedChoices[choice.key]); return <div className="template-choice-field" key={choice.key}><span>{choice.label}{required > 1 ? ` · ${selected.length}/${required}` : ""}</span>{required === 1 ? <select className="app-select" value={selected[0] || ""} onChange={(event) => toggleChoice(choice, event.target.value)}><option value="">Выберите</option>{choice.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <div className="template-choice-chips">{choice.options.map((option) => <button type="button" key={option} className={selected.includes(option) ? "is-active" : ""} onClick={() => toggleChoice(choice, option)}>{selected.includes(option) ? "✓ " : ""}{option}</button>)}</div>}</div> })}</div>}
        <button className="template-assign-button" type="button" disabled={!chosenTemplate || saving || choiceDefs.some((choice) => !choiceComplete(choice))} onClick={() => void assignTemplate()}>{saving ? "Сохраняем…" : chosenTemplate?.kind === "race" && existingRace ? "Заменить расу" : "Назначить шаблон"}</button>
      </section>
      {(error || assigned.error || rules.error) && <div className="sheet-error">{error || assigned.error || rules.error}</div>}
    </section></div>}
  </div>
}
