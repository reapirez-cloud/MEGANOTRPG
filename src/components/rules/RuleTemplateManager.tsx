import { useMemo, useState } from "react"
import { useCharacters } from "../../context/CharacterContext"
import { useRuleTemplates } from "../../hooks/useRuleTemplates"
import { supabase } from "../../lib/supabase"
import type { RuleChoiceDefinition, RuleChoiceTarget, RuleTemplate, RuleTemplateKind } from "../../rule-templates/types"
import type { StoredMechanics } from "../../types/characterMechanics"
import MechanicsBuilder from "../characters/MechanicsBuilder"

type EditorState = { kind: RuleTemplateKind; template: RuleTemplate | null } | null

type ChoiceEditorProps = {
  value: RuleChoiceDefinition[]
  onChange: (value: RuleChoiceDefinition[]) => void
  compact?: boolean
}

function slugFromName(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/[^a-zа-яё0-9]+/giu, "-").replace(/^-|-$/g, "").slice(0, 60)
}
function choiceKey(label: string) { return slugFromName(label) || `choice-${Date.now().toString(36)}` }

function ChoiceEditor({ value, onChange, compact = false }: ChoiceEditorProps) {
  const [label, setLabel] = useState("")
  const [target, setTarget] = useState<RuleChoiceTarget>("proficiency")
  const [options, setOptions] = useState("")
  const [count, setCount] = useState(1)

  function add() {
    const clean = label.trim()
    const items = options.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean)
    if (!clean || !items.length) return
    onChange([...value, { key: choiceKey(clean), label: clean, target, options: items, count: Math.max(1, Math.min(items.length, count)) }])
    setLabel(""); setOptions(""); setCount(1)
  }

  return <div className={compact ? "rule-choice-editor is-compact" : "rule-choice-editor"}>
    {value.length > 0 && <div className="rule-choice-list">{value.map((choice) => <div key={choice.key}><span><strong>{choice.label}</strong><small>{choice.options.join(" · ")}{(choice.count || 1) > 1 ? ` · выбрать ${choice.count}` : ""}</small></span><button type="button" onClick={() => onChange(value.filter((item) => item.key !== choice.key))}>×</button></div>)}</div>}
    <div className="rule-choice-builder">
      <input className="app-input" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Например: Язык"/>
      <select className="app-select" value={target} onChange={(event) => setTarget(event.target.value as RuleChoiceTarget)}><option value="proficiency">Владение</option><option value="language">Язык</option><option value="sense">Чувство</option><option value="trait">Черта</option></select>
      <input className="app-input" value={options} onChange={(event) => setOptions(event.target.value)} placeholder="Общий, Эльфийский, Дварфский"/>
      <label className="rule-choice-count"><span>Сколько</span><input type="number" min="1" max="10" value={count} onChange={(event) => setCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}/></label>
      <button type="button" onClick={add}>Добавить выбор</button>
    </div>
  </div>
}

export default function RuleTemplateManager() {
  const { campaignId } = useCharacters()
  const rules = useRuleTemplates(campaignId, true)
  const [editor, setEditor] = useState<EditorState>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [baseMechanics, setBaseMechanics] = useState<StoredMechanics>([])
  const [choices, setChoices] = useState<RuleChoiceDefinition[]>([])
  const [levelNumber, setLevelNumber] = useState(1)
  const [levelDrafts, setLevelDrafts] = useState<Record<number, StoredMechanics>>({ 1: [] })
  const [levelChoiceDrafts, setLevelChoiceDrafts] = useState<Record<number, RuleChoiceDefinition[]>>({ 1: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const active = rules.templates.filter((item) => item.is_active)
  const grouped = useMemo(() => ({ race: active.filter((item) => item.kind === "race"), class: active.filter((item) => item.kind === "class") }), [active])
  const levelKeys = useMemo(() => [...new Set([...Object.keys(levelDrafts), ...Object.keys(levelChoiceDrafts), String(levelNumber)].map(Number))].sort((a, b) => a - b), [levelChoiceDrafts, levelDrafts, levelNumber])

  function open(kind: RuleTemplateKind, template: RuleTemplate | null = null) {
    setEditor({ kind, template }); setName(template?.name || ""); setDescription(template?.description || ""); setBaseMechanics(template?.mechanics || []); setChoices(template?.choices || []); setError("")
    const storedLevels = template ? rules.levels.filter((item) => item.template_id === template.id).sort((a, b) => a.level - b.level) : []
    const mechanicMap: Record<number, StoredMechanics> = {}
    const choiceMap: Record<number, RuleChoiceDefinition[]> = {}
    for (const item of storedLevels) { mechanicMap[item.level] = item.mechanics || []; choiceMap[item.level] = item.choices || [] }
    if (!storedLevels.length) { mechanicMap[1] = []; choiceMap[1] = [] }
    setLevelDrafts(mechanicMap); setLevelChoiceDrafts(choiceMap); setLevelNumber(storedLevels[0]?.level || 1)
  }

  function selectLevel(level: number) {
    const safe = Math.max(1, Math.min(30, level))
    setLevelNumber(safe)
    setLevelDrafts((current) => safe in current ? current : { ...current, [safe]: [] })
    setLevelChoiceDrafts((current) => safe in current ? current : { ...current, [safe]: [] })
  }

  function removeLevel(level: number) {
    if (levelKeys.length <= 1) return
    setLevelDrafts((current) => { const next = { ...current }; delete next[level]; return next })
    setLevelChoiceDrafts((current) => { const next = { ...current }; delete next[level]; return next })
    const nextLevel = levelKeys.find((item) => item !== level) || 1
    setLevelNumber(nextLevel)
  }

  async function save() {
    if (!editor || !name.trim()) return
    setSaving(true); setError("")
    const { data, error: templateError } = await supabase.rpc("save_rule_template", {
      p_campaign_id: campaignId,
      p_template_id: editor.template?.id || null,
      p_kind: editor.kind,
      p_name: name.trim(),
      p_slug: editor.template?.slug || slugFromName(name),
      p_description: description.trim(),
      p_mechanics: baseMechanics,
      p_choices: choices,
      p_version: editor.template?.version || 1,
    })
    if (templateError || !data) { setSaving(false); setError(templateError?.message || "Не удалось сохранить шаблон."); return }
    const templateId = String(data)
    const levelsToSave = [...new Set([...Object.keys(levelDrafts), ...Object.keys(levelChoiceDrafts)].map(Number))].filter((level) => level >= 1 && level <= 30).sort((a, b) => a - b)
    for (const level of levelsToSave) {
      const { error: levelError } = await supabase.rpc("save_rule_template_level", { p_template_id: templateId, p_level: level, p_mechanics: levelDrafts[level] || [], p_choices: levelChoiceDrafts[level] || [] })
      if (levelError) { setSaving(false); setError(`Уровень ${level}: ${levelError.message}`); return }
    }
    setSaving(false); await rules.reload(); setEditor(null)
  }

  async function archive(template: RuleTemplate) {
    const { error: archiveError } = await supabase.from("rule_templates").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", template.id)
    if (archiveError) setError(archiveError.message); else await rules.reload()
  }

  return <section className="rule-manager control-section">
    <div className="rule-manager__head"><div><span>Character Engine</span><h3>Расы и классы</h3><p>Шаблоны — реальные источники механики. Изменения применяются к назначенным персонажам через Character Engine.</p></div><div><button type="button" onClick={() => open("race")}>＋ Раса</button><button type="button" onClick={() => open("class")}>＋ Класс</button></div></div>
    {rules.error && <div className="auth-error">{rules.error}</div>}{error && <div className="auth-error">{error}</div>}
    {rules.loading ? <div className="rule-manager__loading">Загружаем шаблоны…</div> : <div className="rule-manager__groups">{(["race","class"] as RuleTemplateKind[]).map((kind) => <div className="rule-group" key={kind}><div className="rule-group__title"><span>{kind === "race" ? "Расы" : "Классы"}</span><small>{grouped[kind].length}</small></div>{grouped[kind].length ? grouped[kind].map((template) => { const levelCount = rules.levels.filter((item) => item.template_id === template.id).length; return <article className="rule-card" key={template.id}><button type="button" className="rule-card__main" onClick={() => open(kind, template)}><span className="rule-card__icon">{kind === "race" ? "◈" : "◇"}</span><span><strong>{template.name}</strong><small>v{template.version} · {template.mechanics.length} базовых эффектов · {levelCount} уровней</small><p>{template.description || "Без описания"}</p></span><b>›</b></button><button type="button" className="rule-card__archive" onClick={() => void archive(template)}>Архив</button></article> }) : <div className="rule-empty">Пока нет шаблонов.</div>}</div>)}</div>}

    {editor && <div className="soft-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null) }}><section className="soft-sheet rule-editor" onMouseDown={(event) => event.stopPropagation()}><div className="soft-sheet__handle"/><header className="soft-sheet__header"><div><small>{editor.kind === "race" ? "Шаблон расы" : "Шаблон класса"}</small><h2>{editor.template ? `Редактировать ${editor.template.name}` : editor.kind === "race" ? "Новая раса" : "Новый класс"}</h2></div><button className="soft-sheet__close" type="button" onClick={() => setEditor(null)}>×</button></header>
      <div className="rule-editor__fields"><label><span>Название</span><input className="app-input" value={name} onChange={(event) => setName(event.target.value)} autoFocus/></label><label><span>Описание</span><textarea className="app-textarea" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Коротко: что это за источник правил"/></label></div>
      <section className="rule-editor__section"><div className="rule-editor__section-head"><div><small>Всегда активно</small><h3>Базовая механика</h3></div></div><MechanicsBuilder value={baseMechanics} onChange={setBaseMechanics}/></section>
      <section className="rule-editor__section"><div className="rule-editor__section-head"><div><small>Выбор при назначении</small><h3>Базовые варианты</h3></div></div><ChoiceEditor value={choices} onChange={setChoices}/></section>
      <section className="rule-editor__section"><div className="rule-editor__section-head"><div><small>Открывается с уровня</small><h3>Механика и выборы уровня</h3></div><label className="rule-level-picker"><span>Уровень</span><input type="number" min="1" max="30" value={levelNumber} onChange={(event) => selectLevel(Number(event.target.value) || 1)}/></label></div>
        <div className="rule-level-rail">{levelKeys.map((level) => <div className={level === levelNumber ? "is-active" : ""} key={level}><button type="button" onClick={() => selectLevel(level)}>{level}</button>{levelKeys.length > 1 && <button type="button" aria-label={`Удалить уровень ${level}`} onClick={() => removeLevel(level)}>×</button>}</div>)}<button type="button" className="rule-level-add" onClick={() => selectLevel(Math.min(30, (levelKeys[levelKeys.length - 1] || 0) + 1))}>＋</button></div>
        <MechanicsBuilder value={levelDrafts[levelNumber] || []} onChange={(value) => setLevelDrafts((current) => ({ ...current, [levelNumber]: value }))}/>
        <div className="rule-level-choices"><small>Выборы, которые появляются на {levelNumber} уровне</small><ChoiceEditor compact value={levelChoiceDrafts[levelNumber] || []} onChange={(value) => setLevelChoiceDrafts((current) => ({ ...current, [levelNumber]: value }))}/></div>
      </section>
      {error && <div className="sheet-error">{error}</div>}<footer className="soft-sheet__footer"><button className="sheet-secondary" type="button" onClick={() => setEditor(null)}>Отмена</button><button className="sheet-primary" type="button" disabled={saving || !name.trim()} onClick={() => void save()}>{saving ? "Сохраняем…" : "Сохранить шаблон"}</button></footer>
    </section></div>}
  </section>
}
