import { useMemo, useState } from "react"

import { useCharacters } from "../../context/CharacterContext"
import { classReference, type ClassReferenceEntry } from "../../data/classReference"
import { getDruidBaseFeatureNuances, getDruidSubclassFeatureNuances } from "../../data/classes/druidNuances"
import { druidReference } from "../../data/classes/druidReference"
import { useRuleTemplates } from "../../hooks/useRuleTemplates"
import type { SpellClassKey } from "../../lib/spellCatalog"
import type { RuleTemplate, RuleTemplateLevel } from "../../rule-templates/types"
import type { StoredMechanic } from "../../types/characterMechanics"
import SpellReference from "../characters/SpellReference"

type CharacterTarget = {
  id: string
  name: string
  character_class: string
}

type ReferenceSection = "home" | "spells" | "classes" | "class-detail" | "subclass-detail" | "bestiary" | "chaos"

type Props = {
  campaignId?: string
  character: CharacterTarget | null
  canManage: boolean
  onClose: () => void
  onCharacterChanged?: () => void
  initialSection?: "home" | "spells" | "classes" | "bestiary" | "chaos"
  initialClassId?: SpellClassKey | null
}

type ReferenceSubclassView = {
  id: string
  name: string
  summary: string
  explanation?: string
  voss?: string
  templateId?: string
}

type RuleFeatureView = {
  level: number
  name: string
  explanation: string
  description: string
  facts: string[]
  nuances: string[]
  voss?: string
}

const sections = [
  { id: "spells" as const, icon: "✦", title: "Заклинания", copy: "Каталог заклинаний с поиском, фильтрами и подробными карточками.", meta: "Готово" },
  { id: "classes" as const, icon: "◇", title: "Классы", copy: "Классы, прогрессия, подклассы и объяснения способностей.", meta: `${classReference.length} классов` },
  { id: "bestiary" as const, icon: "◉", title: "Бестиарий", copy: "Существа, противники и их справочные карточки будут жить отдельным разделом.", meta: "Каркас готов" },
  { id: "chaos" as const, icon: "⌁", title: "Болезни, безумия и дикая магия", copy: "Таблицы и справочные эффекты, которые не относятся напрямую к заклинаниям или существам.", meta: "Каркас готов" },
]

const economyLabel: Record<string, string> = {
  action: "действие",
  bonus_action: "бонусное действие",
  reaction: "реакция",
  magic_action: "магическое действие",
  free: "без действия",
}

const rechargeLabel: Record<string, string> = {
  short_rest: "короткий отдых",
  long_rest: "долгий отдых",
  turn: "ход",
  round: "раунд",
}

function classTagline(entry: ClassReferenceEntry) {
  return entry.id === "druid" ? druidReference.tagline : entry.tagline
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function payloadText(mechanic: StoredMechanic, key: "label" | "description" | "authorExplanation" | "authorComment") {
  if (mechanic.type !== "grant") return ""
  const payload: unknown = mechanic.payload
  if (!isRecord(payload)) return ""
  const value = payload[key]
  return typeof value === "string" ? value.trim() : ""
}

function payloadStringList(mechanic: StoredMechanic, key: "authorNuances") {
  if (mechanic.type !== "grant") return []
  const payload: unknown = mechanic.payload
  if (!isRecord(payload)) return []
  const value = payload[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
}

function sourceKey(mechanic: StoredMechanic) {
  return mechanic.sourceKey?.trim() || mechanic.id
}

function mechanicName(mechanic: StoredMechanic) {
  if (mechanic.type === "resource" || mechanic.type === "action") return mechanic.label
  if (mechanic.type === "spell") return mechanic.payload.spell.name
  if (mechanic.type === "numeric") return mechanic.label || mechanic.target
  return payloadText(mechanic, "label") || mechanic.label || mechanic.key
}

function formatMax(mechanic: StoredMechanic) {
  if (mechanic.type !== "resource") return ""
  return typeof mechanic.max === "number" ? String(mechanic.max) : "по формуле персонажа"
}

function isSpellSlot(mechanic: StoredMechanic) {
  return mechanic.type === "resource" && /^spell_slot_[1-9]$/.test(mechanic.key)
}

function mechanicFacts(mechanics: StoredMechanic[]) {
  const facts: string[] = []
  for (const mechanic of mechanics) {
    if (isSpellSlot(mechanic)) continue
    if (mechanic.type === "resource") {
      facts.push(`Запас «${mechanic.label}»: ${formatMax(mechanic)}.`)
      const triggers = (Array.isArray(mechanic.recharge) ? mechanic.recharge : [mechanic.recharge]).map((item) => rechargeLabel[item] || item)
      if (triggers.length) facts.push(`Восстановление: ${triggers.join(" или ")}.`)
    } else if (mechanic.type === "action") {
      const economy = economyLabel[mechanic.economy] || mechanic.economy
      facts.push(`Применение: ${economy}.`)
      if (mechanic.resourceKey && mechanic.resourceCost) facts.push(`Цена: ${mechanic.resourceCost} ед. ресурса «${mechanic.resourceKey}».`)
      if (mechanic.damage?.length) {
        const dice = mechanic.damage.map((part) => `${part.count}к${part.sides}${part.flat ? `+${part.flat}` : ""} ${part.damageType}`).join(" + ")
        facts.push(`Урон: ${dice}.`)
      }
    } else if (mechanic.type === "spell") {
      const level = mechanic.payload.spell.level
      facts.push(level === 0 ? `Даёт заговор «${mechanic.payload.spell.name}».` : `Даёт заклинание «${mechanic.payload.spell.name}» (${level} ур.).`)
    } else if (mechanic.type === "grant" && mechanic.target === "proficiency") {
      const label = payloadText(mechanic, "label")
      if (label) facts.push(`Владение: ${label}.`)
    }
  }
  return [...new Set(facts)]
}

function featureDescription(mechanics: StoredMechanic[]) {
  for (const mechanic of mechanics) {
    const description = payloadText(mechanic, "description")
    if (description) return description
  }
  const primary = mechanics.find((mechanic) => !isSpellSlot(mechanic))
  if (!primary) return ""
  if (primary.type === "action") return `Открывает действие «${primary.label}».`
  if (primary.type === "resource") return `Добавляет классовый ресурс «${primary.label}».`
  if (primary.type === "spell") return `Даёт доступ к заклинанию «${primary.payload.spell.name}».`
  return mechanicName(primary)
}

function explicitFeatureExplanation(mechanics: StoredMechanic[]) {
  for (const mechanic of mechanics) {
    if (mechanic.type === "grant" && mechanic.target === "feature") {
      const explanation = payloadText(mechanic, "authorExplanation")
      if (explanation) return explanation
    }
  }
  for (const mechanic of mechanics) {
    const explanation = mechanic.presentation?.authorExplanation?.trim()
    if (explanation) return explanation
  }
  return ""
}

function firstRuleSentence(description: string) {
  const normalized = description.replace(/\\n/g, " ").replace(/\s+/g, " ").trim()
  const match = normalized.match(/^(.+?[.!?])(?:\s|$)/)
  return match?.[1]?.trim() || normalized
}

/**
 * Last-resort clarity layer. Audited classes should provide authorExplanation in
 * data, but a newly added source group must still render in the correct order
 * instead of silently losing the explanation layer.
 */
function fallbackFeatureExplanation(mechanics: StoredMechanic[], description: string) {
  const visible = mechanics.filter((mechanic) => !isSpellSlot(mechanic))
  const spells = visible.filter((mechanic) => mechanic.type === "spell")
  if (spells.length) {
    const names = spells.map((mechanic) => mechanic.type === "spell" ? `«${mechanic.payload.spell.name}»` : "").filter(Boolean)
    return `Эта способность добавляет ${names.length === 1 ? "заклинание" : "заклинания"} ${names.join(", ")}. Здесь запоминается сам доступ; точное действие каждого заклинания смотрите в его карточке.`
  }

  const resource = visible.find((mechanic) => mechanic.type === "resource")
  if (resource?.type === "resource") {
    return `Это запас применений «${resource.label}». Когда другое правило требует его потратить, уменьшается этот запас; карточка ниже показывает, сколько применений доступно и после какого отдыха они возвращаются.`
  }

  const action = visible.find((mechanic) => mechanic.type === "action")
  if (action?.type === "action") {
    const economy = economyLabel[action.economy] || action.economy
    return `Это отдельное ${economy}: выбираете его тогда, когда хотите применить эту способность. Цель, цена и результат указаны в точном правиле ниже.`
  }

  const proficiencies = visible.filter((mechanic) => mechanic.type === "grant" && mechanic.target === "proficiency")
  if (proficiencies.length === visible.length && proficiencies.length) {
    return "Это постоянные владения. Получив их, вы просто учитываете их в подходящих проверках, спасбросках, оружии или доспехах; отдельная активация не нужна."
  }

  return firstRuleSentence(description)
}

function featureExplanation(mechanics: StoredMechanic[], description: string) {
  return explicitFeatureExplanation(mechanics) || fallbackFeatureExplanation(mechanics, description)
}

function featureNuances(mechanics: StoredMechanic[]) {
  const nuances: string[] = []
  for (const mechanic of mechanics) {
    if (mechanic.type === "grant" && mechanic.target === "feature") nuances.push(...payloadStringList(mechanic, "authorNuances"))
  }
  for (const mechanic of mechanics) {
    const values = mechanic.presentation?.authorNuances || []
    nuances.push(...values.map((item) => item.trim()).filter(Boolean))
  }
  return [...new Set(nuances)]
}

function featureVoss(mechanics: StoredMechanic[]) {
  for (const mechanic of mechanics) {
    if (mechanic.type !== "grant" || mechanic.target !== "feature") continue
    const comment = payloadText(mechanic, "authorComment")
    if (comment) return comment
  }
  for (const mechanic of mechanics) {
    const comment = mechanic.presentation?.authorComment?.trim()
    if (comment) return comment
  }
  return ""
}

function featureName(mechanics: StoredMechanic[]) {
  const featureGrant = mechanics.find((mechanic) => mechanic.type === "grant" && mechanic.target === "feature")
  if (featureGrant) return mechanicName(featureGrant)
  const primary = mechanics.find((mechanic) => !isSpellSlot(mechanic))
  return primary ? mechanicName(primary) : "Способность"
}

function buildTemplateFeatures(template: RuleTemplate | undefined, levels: RuleTemplateLevel[]) {
  if (!template) return []
  const rows: Array<{ level: number; mechanics: StoredMechanic[] }> = []
  if (template.mechanics?.length) rows.push({ level: template.kind === "subclass" ? Math.max(1, template.unlock_level || 1) : 1, mechanics: template.mechanics })
  for (const level of levels.filter((entry) => entry.template_id === template.id)) rows.push({ level: level.level, mechanics: level.mechanics || [] })

  const result: RuleFeatureView[] = []
  for (const row of rows.sort((a, b) => a.level - b.level)) {
    const groups = new Map<string, StoredMechanic[]>()
    for (const mechanic of row.mechanics) {
      const key = sourceKey(mechanic)
      groups.set(key, [...(groups.get(key) || []), mechanic])
    }
    for (const mechanics of groups.values()) {
      if (!mechanics.length || mechanics.every(isSpellSlot)) continue
      const description = featureDescription(mechanics)
      if (!description) continue
      const level = template.kind === "subclass" ? Math.max(row.level, template.unlock_level || 1) : row.level
      result.push({
        level,
        name: featureName(mechanics),
        explanation: featureExplanation(mechanics, description),
        description,
        facts: mechanicFacts(mechanics),
        nuances: featureNuances(mechanics),
        voss: featureVoss(mechanics) || undefined,
      })
    }
  }
  return result
}

function lastSegment(value: string, separator: string) {
  const parts = value.split(separator)
  return parts[parts.length - 1] || value
}

function templateCatalogTail(template: RuleTemplate) {
  const key = template.catalog_key?.trim()
  if (key) return lastSegment(key, ":")
  return lastSegment(template.slug, "-")
}

function staticSubclasses(entry: ClassReferenceEntry): ReferenceSubclassView[] {
  if (entry.id === "druid") return druidReference.subclasses.map((item) => ({ id: item.id, name: item.name, summary: item.mechanics, explanation: item.explanation, voss: item.voss }))
  return entry.subclasses.map((item) => ({ id: item.id, name: item.name, summary: item.summary }))
}

function FeatureCard({ feature, onOpen }: { feature: RuleFeatureView; onOpen: (feature: RuleFeatureView) => void }) {
  return (
    <button className="reference-class-feature reference-class-feature--button surface" type="button" onClick={() => onOpen(feature)}>
      <span className="reference-class-feature__head">
        <span>{feature.level} ур.</span>
        <strong>{feature.name}</strong>
        <em aria-hidden="true">›</em>
      </span>
      <span className="reference-class-feature__eyebrow">Восс объясняет</span>
      <span className="reference-class-feature__preview">{feature.explanation}</span>
      <span className="reference-class-feature__open">{feature.nuances.length ? "Объяснение → правило → нюансы → комментарий" : "Объяснение → правило → комментарий"}</span>
    </button>
  )
}

export default function ReferenceGuide({
  campaignId: campaignIdProp,
  character,
  canManage,
  onClose,
  onCharacterChanged,
  initialSection = "home",
  initialClassId = null,
}: Props) {
  const { campaignId: contextCampaignId } = useCharacters()
  const campaignId = campaignIdProp || contextCampaignId
  const { templates, levels, loading: catalogLoading, error: catalogError } = useRuleTemplates(campaignId)
  const initialClass = useMemo(() => classReference.find((entry) => entry.id === initialClassId) || null, [initialClassId])
  const [section, setSection] = useState<ReferenceSection>(initialClass ? "class-detail" : initialSection)
  const [selectedClass, setSelectedClass] = useState<ClassReferenceEntry | null>(initialClass)
  const [selectedSubclass, setSelectedSubclass] = useState<ReferenceSubclassView | null>(null)
  const [selectedFeature, setSelectedFeature] = useState<RuleFeatureView | null>(null)

  const classTemplate = useMemo(() => {
    if (!selectedClass) return undefined
    return templates.find((item) => item.kind === "class" && item.catalog_key === `class:${selectedClass.id}`)
      || templates.find((item) => item.kind === "class" && item.slug === `${selectedClass.id}-core`)
  }, [selectedClass, templates])

  const visibleSubclasses = useMemo(() => {
    if (!selectedClass) return []
    const fallback = staticSubclasses(selectedClass)
    if (!classTemplate) return fallback
    const db = templates.filter((item) => item.kind === "subclass" && item.parent_template_id === classTemplate.id)
    if (!db.length) return fallback

    const fallbackById = new Map(fallback.map((item) => [item.id, item]))
    const order = new Map(fallback.map((item, index) => [item.id, index]))
    const dbViews = db.map((template) => {
      const id = templateCatalogTail(template)
      const old = fallbackById.get(id)
      return {
        id,
        name: template.name || old?.name || id,
        summary: template.mechanical_summary?.trim() || template.description?.trim() || old?.summary || "Специализация класса.",
        explanation: template.author_description?.trim() || old?.explanation,
        voss: template.author_comment?.trim() || old?.voss,
        templateId: template.id,
      } satisfies ReferenceSubclassView
    })

    const dbById = new Map(dbViews.map((item) => [item.id, item]))
    const merged = fallback.map((item) => dbById.get(item.id) || item)
    for (const item of dbViews) {
      if (!fallbackById.has(item.id)) merged.push(item)
    }

    return merged.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.name.localeCompare(b.name, "ru"))
  }, [classTemplate, selectedClass, templates])

  const selectedSubclassTemplate = useMemo(() => {
    if (!selectedClass || !selectedSubclass) return undefined
    if (selectedSubclass.templateId) return templates.find((item) => item.id === selectedSubclass.templateId)
    return templates.find((item) => item.kind === "subclass" && item.catalog_key === `subclass:${selectedClass.id}:${selectedSubclass.id}`)
  }, [selectedClass, selectedSubclass, templates])

  const classFeatures = useMemo(() => buildTemplateFeatures(classTemplate, levels), [classTemplate, levels])
  const subclassFeatures = useMemo(() => {
    const features = buildTemplateFeatures(selectedSubclassTemplate, levels)
    if (selectedClass?.id !== "druid" || !selectedSubclass) return features
    return features.map((feature) => {
      const nuances = getDruidSubclassFeatureNuances(selectedSubclass.id, feature.name)
      return nuances.length ? { ...feature, nuances } : feature
    })
  }, [selectedClass, selectedSubclass, selectedSubclassTemplate, levels])

  if (section === "spells") {
    return <SpellReference character={character} canManage={canManage} onClose={() => setSection("home")} onCharacterChanged={onCharacterChanged} />
  }

  function goBack() {
    if (selectedFeature) { setSelectedFeature(null); return }
    if (section === "home") { onClose(); return }
    if (section === "subclass-detail") { setSelectedSubclass(null); setSection("class-detail"); return }
    if (section === "class-detail") { setSelectedClass(null); setSelectedSubclass(null); setSection("classes"); return }
    setSection("home")
  }

  function openClass(entry: ClassReferenceEntry) {
    setSelectedFeature(null)
    setSelectedClass(entry)
    setSelectedSubclass(null)
    setSection("class-detail")
  }

  function openSubclass(subclass: ReferenceSubclassView) {
    setSelectedFeature(null)
    setSelectedSubclass(subclass)
    setSection("subclass-detail")
  }

  const title = section === "home"
    ? "Справочник"
    : section === "classes"
      ? "Классы"
      : section === "class-detail"
        ? selectedClass?.name || "Класс"
        : section === "subclass-detail"
          ? selectedSubclass?.name || "Подкласс"
          : section === "bestiary"
            ? "Бестиарий"
            : "Болезни, безумия и дикая магия"

  const isDruid = selectedClass?.id === "druid"
  const classSummary = isDruid ? druidReference.mechanicalSummary : classTemplate?.mechanical_summary?.trim() || selectedClass?.tagline || ""
  const classExplanation = isDruid ? druidReference.authorDescription : classTemplate?.author_description?.trim() || selectedClass?.tagline || ""
  const classDescription = classTemplate?.description?.trim() || selectedClass?.description || classSummary
  const classComment = isDruid ? druidReference.authorComment : classTemplate?.author_comment?.trim() || ""
  const subclassExplanation = selectedSubclassTemplate?.author_description?.trim() || selectedSubclass?.explanation || selectedSubclass?.summary || ""
  const subclassDescription = selectedSubclassTemplate?.description?.trim() || selectedSubclass?.summary || ""
  const subclassSummary = selectedSubclassTemplate?.mechanical_summary?.trim() || selectedSubclass?.summary || ""
  const subclassComment = selectedSubclassTemplate?.author_comment?.trim() || selectedSubclass?.voss || ""

  return (
    <div className="reference-guide-overlay">
      <section className="reference-guide-page">
        <header className="reference-guide-header">
          <button className="icon-button" type="button" onClick={goBack} aria-label={section === "home" ? "Закрыть справочник" : "Назад"}>←</button>
          <div><h2>{title}</h2>{section === "home" && <p>Единая база правил и игровых материалов</p>}</div>
          <span />
        </header>

        {section === "home" && (
          <main className="reference-guide-content">
            <div className="reference-guide-intro surface">
              <span className="reference-guide-intro__mark">⌘</span>
              <div><strong>Один справочник вместо отдельных баз</strong><p>Каждый тип материала живёт в своём разделе, но открывается из одного места.</p></div>
            </div>
            <div className="reference-guide-grid">
              {sections.map((item) => (
                <button className="reference-guide-section surface" type="button" key={item.id} onClick={() => setSection(item.id)}>
                  <span className="reference-guide-section__icon">{item.icon}</span>
                  <span className="reference-guide-section__copy"><strong>{item.title}</strong><small>{item.copy}</small><em>{item.meta}</em></span>
                  <span className="reference-guide-section__chevron">›</span>
                </button>
              ))}
            </div>
          </main>
        )}

        {section === "classes" && (
          <main className="reference-guide-content reference-guide-content--list">
            <div className="reference-guide-section-note"><strong>Класс → прогрессия → подкласс</strong><p>Открой класс, затем нужную специализацию. Внутри показываются реальные уровневые правила из каталога кампании.</p></div>
            {catalogLoading && <div className="reference-catalog-status">Загружаю правила кампании…</div>}
            {catalogError && <div className="reference-catalog-status is-error">Каталог временно недоступен: {catalogError}</div>}
            <div className="reference-class-list">
              {classReference.map((entry) => (
                <button className="reference-class-card surface" type="button" key={entry.id} onClick={() => openClass(entry)}>
                  <span className="reference-class-card__monogram">{entry.name.slice(0, 1)}</span>
                  <span className="reference-class-card__copy">
                    <span className="reference-class-card__title"><strong>{entry.name}</strong><small>{entry.nameEn}</small></span>
                    <span>{classTagline(entry)}</span>
                    <em>{entry.id === "druid" ? `${druidReference.subclasses.length} кругов` : `${entry.subclasses.length} подклассов`}</em>
                  </span>
                  <span className="reference-guide-section__chevron">›</span>
                </button>
              ))}
            </div>
          </main>
        )}

        {section === "class-detail" && selectedClass && (
          <main className="reference-guide-content reference-guide-content--detail">
            <div className="reference-class-hero surface">
              <span className="reference-class-hero__monogram">{selectedClass.name.slice(0, 1)}</span>
              <div><h3>{selectedClass.name}</h3><span>{selectedClass.nameEn}</span><p>{classTagline(selectedClass)}</p></div>
            </div>
            {classExplanation && <section className="reference-voss-explanation surface"><span>Восс объясняет</span><p>{classExplanation}</p></section>}
            <section className="reference-class-description"><span>Описание класса</span><p>{classDescription}</p></section>
            <section className="reference-class-mechanics surface"><span>Коротко о правилах</span><p>{classSummary}</p></section>
            {classComment && <section className="reference-voss-note surface"><span>Комментарий Восса</span><p>{classComment}</p></section>}

            <section className="reference-class-feature-section">
              <div className="reference-subclass-section__head"><span>Прогрессия класса</span><small>{isDruid ? druidReference.features.length : classFeatures.length}</small></div>
              <div className="reference-class-feature-list">
                {isDruid ? druidReference.features.map((feature) => (
                  <FeatureCard
                    key={`${feature.level}:${feature.name}`}
                    feature={{ level: feature.level, name: feature.name, explanation: feature.explanation, description: feature.mechanics, facts: feature.details || [], nuances: getDruidBaseFeatureNuances(feature.level, feature.name), voss: feature.voss }}
                    onOpen={setSelectedFeature}
                  />
                )) : classFeatures.length ? classFeatures.map((feature, index) => (
                  <FeatureCard key={`${feature.level}:${feature.name}:${index}`} feature={feature} onOpen={setSelectedFeature} />
                )) : <div className="reference-catalog-status">Подробная прогрессия для этой карточки ещё не загружена.</div>}
              </div>
            </section>

            <section className="reference-subclass-section">
              <div className="reference-subclass-section__head"><span>Подклассы</span><small>{visibleSubclasses.length}</small></div>
              <div className="reference-subclass-list">
                {visibleSubclasses.map((subclass) => (
                  <button className="reference-subclass-card surface" type="button" key={subclass.id} onClick={() => openSubclass(subclass)}>
                    <span className="reference-subclass-card__copy"><strong>{subclass.name}</strong><p>{subclass.explanation || subclass.summary}</p></span>
                    <span className="reference-guide-section__chevron">›</span>
                  </button>
                ))}
              </div>
            </section>
          </main>
        )}

        {section === "subclass-detail" && selectedClass && selectedSubclass && (
          <main className="reference-guide-content reference-guide-content--detail">
            <div className="reference-class-hero surface">
              <span className="reference-class-hero__monogram">{selectedSubclass.name.slice(0, 1)}</span>
              <div><h3>{selectedSubclass.name}</h3><span>{selectedClass.name}</span><p>{selectedSubclass.summary}</p></div>
            </div>
            {subclassExplanation && <section className="reference-voss-explanation surface"><span>Восс объясняет</span><p>{subclassExplanation}</p></section>}
            {subclassDescription && <section className="reference-class-description"><span>Описание подкласса</span><p>{subclassDescription}</p></section>}
            {subclassSummary && subclassSummary !== subclassDescription && <section className="reference-class-mechanics surface"><span>Коротко о правилах</span><p>{subclassSummary}</p></section>}
            {subclassComment && <section className="reference-voss-note surface"><span>Комментарий Восса</span><p>{subclassComment}</p></section>}
            <section className="reference-class-feature-section">
              <div className="reference-subclass-section__head"><span>Прогрессия подкласса</span><small>{subclassFeatures.length}</small></div>
              <div className="reference-class-feature-list">
                {subclassFeatures.length ? subclassFeatures.map((feature, index) => (
                  <FeatureCard key={`${feature.level}:${feature.name}:${index}`} feature={feature} onOpen={setSelectedFeature} />
                )) : <div className="reference-catalog-status">Для этой специализации пока есть справочное описание, но подробные уровневые карточки ещё не загружены.</div>}
              </div>
            </section>
          </main>
        )}

        {(section === "bestiary" || section === "chaos") && (
          <main className="reference-guide-content reference-guide-content--empty">
            <div className="reference-guide-placeholder surface">
              <span>{section === "bestiary" ? "◉" : "⌁"}</span>
              <h3>{section === "bestiary" ? "Раздел для бестиария готов" : "Раздел для таблиц готов"}</h3>
              <p>{section === "bestiary" ? "Сюда можно добавлять существ отдельными карточками, не смешивая их с миром кампании или персонажами." : "Здесь будут отдельные категории: болезни, безумия и дикая магия. Они отделены от заклинаний и классов на уровне навигации."}</p>
            </div>
          </main>
        )}
      </section>

      {selectedFeature && (
        <section className="reference-feature-detail-overlay" role="dialog" aria-modal="true" aria-label={`Правило: ${selectedFeature.name}`}>
          <div className="reference-feature-detail-page">
            <header className="reference-feature-detail-header">
              <button className="icon-button" type="button" onClick={() => setSelectedFeature(null)} aria-label="Назад к списку способностей">←</button>
              <div><span>{selectedFeature.level} уровень</span><h2>{selectedFeature.name}</h2></div>
              <span />
            </header>
            <main className="reference-feature-detail-content">
              <section className="reference-voss-explanation surface">
                <span>Восс объясняет</span>
                <p>{selectedFeature.explanation}</p>
              </section>
              <section className="reference-feature-detail-rule surface">
                <span>Точное правило</span>
                <p>{selectedFeature.description}</p>
              </section>
              {selectedFeature.facts.length ? (
                <section className="reference-feature-detail-facts">
                  <span>Механические данные</span>
                  <ul className="reference-rule-facts">{selectedFeature.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
                </section>
              ) : null}
              {selectedFeature.nuances.length ? (
                <section className="reference-voss-nuances surface">
                  <span>Нюансы Восса</span>
                  <ul>{selectedFeature.nuances.map((nuance) => <li key={nuance}>{nuance}</li>)}</ul>
                </section>
              ) : null}
              {selectedFeature.voss && <section className="reference-voss-note surface"><span>Комментарий Восса</span><p>{selectedFeature.voss}</p></section>}
            </main>
          </div>
        </section>
      )}
    </div>
  )
}
