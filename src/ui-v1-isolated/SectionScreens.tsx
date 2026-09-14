import { useMemo, useState } from "react"

import { LocationNavigator } from "./LocationNavigator"

import { classReference, type ClassReferenceEntry, type ClassReferenceSubclass } from "../data/classReference"
import { warlockInvocationsReference } from "../data/classes/warlockInvocationsReference"
import { useRuleTemplates } from "../hooks/useRuleTemplates"
import {
  knowledgeBaseSections,
  worldHubSections,
  type HubSection,
} from "./sectionRegistry"
import {
  useUiV1Achievements,
  useUiV1KnowledgeCatalog,
  useUiV1SocietyNews,
  useUiV1WorldData,
  type AchievementPreview,
} from "./useUiV1SectionData"
import {
  buildClassPresentation,
  buildSubclassPresentation,
  type UiV1MechanicGroup,
  type UiV1ProficiencyGroup,
  type UiV1ReferenceFeature,
  type UiV1ReferencePresentation,
} from "./classReferencePresentation"
import "./section-screens.css"

function navigate(path: string) {
  window.location.hash = `#/${path}`
}

function SectionHeader({
  title,
  backTo,
  action,
}: {
  title: string
  backTo: string
  action?: React.ReactNode
}) {
  return (
    <header className="u1-section-head">
      <button
        type="button"
        className="u1-section-head__back"
        onClick={() => navigate(backTo)}
        aria-label="Назад"
      >
        ←
      </button>
      <h1>{title}</h1>
      <span className="u1-section-head__action">{action}</span>
    </header>
  )
}

function HubCard({
  item,
  onOpen,
}: {
  item: HubSection
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className="u1-hub-card"
      data-tone={item.tone}
      onClick={onOpen}
    >
      {item.image ? (
        <img
          className="u1-hub-card__image"
          src={item.image}
          alt=""
          decoding="async"
          aria-hidden="true"
        />
      ) : (
        <span className="u1-hub-card__texture" aria-hidden="true" />
      )}
      <span className="u1-hub-card__scrim" aria-hidden="true" />
      <span className="u1-hub-card__copy">
        <strong>{item.title}</strong>
        <small>{item.caption}</small>
      </span>
    </button>
  )
}

function SectionHub({
  title,
  items,
  basePath,
}: {
  title: string
  items: HubSection[]
  basePath: string
}) {
  return (
    <main className="u1-section-page">
      <SectionHeader title={title} backTo="home" />
      <section className="u1-hub-list" aria-label={title}>
        {items.map((item) => (
          <HubCard
            key={item.id}
            item={item}
            onOpen={() => navigate(`${basePath}/${item.id}`)}
          />
        ))}
      </section>
    </main>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="u1-section-empty">{children}</div>
}

function FutureConnection({
  title,
  backTo,
}: {
  title: string
  backTo: string
}) {
  return (
    <main className="u1-section-page">
      <SectionHeader title={title} backTo={backTo} />
      <EmptyState>Раздел подключён к новой навигации. Наполнение будет сделано отдельным этапом.</EmptyState>
    </main>
  )
}

export function WorldSectionScreen({
  subsection,
  path = [],
}: {
  subsection?: string
  path?: string[]
}) {
  const world = useUiV1WorldData()

  if (!subsection) {
    return (
      <SectionHub
        title="Мир"
        items={worldHubSections}
        basePath="home/world"
      />
    )
  }

  const registered = worldHubSections.find((item) => item.id === subsection)
  if (!registered) return <FutureConnection title="Мир" backTo="home/world" />

  if (subsection === "locations") {
    return (
      <LocationNavigator
        selectedLocationId={path[0]}
        detail={path[1] === "detail"}
      />
    )
  }

  if (subsection === "map") {
    return (
      <main className="u1-section-page">
        <SectionHeader title="Карта" backTo="home/world" />
        <EmptyState>
          Вход в карту готов. Саму карту сейчас намеренно не строим: её отдельная концепция не должна быть испорчена временной реализацией.
        </EmptyState>
      </main>
    )
  }

  return (
    <main className="u1-section-page">
      <SectionHeader title={registered.title} backTo="home/world" />
      {world.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : world.error ? (
        <EmptyState>Раздел временно недоступен.</EmptyState>
      ) : subsection === "characters" ? (
        <div className="u1-simple-list">
          {world.characters.map((item) => (
            <article className="u1-simple-row" key={item.id}>
              <strong>{item.name}</strong>
              <small>{item.character_class || "Персонаж"}</small>
            </article>
          ))}
          {!world.characters.length && <EmptyState>Персонажей пока нет.</EmptyState>}
        </div>
      ) : subsection === "lore" ? (
        <div className="u1-simple-list">
          {world.lore.map((item) => (
            <article className="u1-simple-row" key={item.id}>
              <strong>{item.title}</strong>
              {item.summary && <small>{item.summary}</small>}
            </article>
          ))}
          {!world.lore.length && <EmptyState>Лор пока не заполнен.</EmptyState>}
        </div>
      ) : (
        <FutureConnection title={registered.title} backTo="home/world" />
      )}
    </main>
  )
}

function ClassCatalogPanels({
  rows,
  query,
  onOpen,
}: {
  rows: Array<{ id: string; title: string; meta?: string; art?: string }>
  query: string
  onOpen: (id: string) => void
}) {
  const normalized = query.trim().toLocaleLowerCase("ru")
  const visible = useMemo(
    () => normalized
      ? rows.filter((row) => `${row.title} ${row.meta || ""}`.toLocaleLowerCase("ru").includes(normalized))
      : rows,
    [normalized, rows],
  )

  return (
    <div className="u1-class-panel-list">
      {visible.map((row) => (
        <button
          type="button"
          className="u1-class-panel"
          data-class-id={row.id}
          key={row.id}
          onClick={() => onOpen(row.id)}
          aria-label={`Открыть: ${row.title}`}
        >
          <span className="u1-class-panel__texture" aria-hidden="true" />
          {row.art && (
            <img
              className="u1-class-panel__image"
              src={row.art}
              alt=""
              loading="lazy"
              decoding="async"
              aria-hidden="true"
              onError={(event) => {
                event.currentTarget.hidden = true
              }}
            />
          )}
          <span className="u1-class-panel__scrim" aria-hidden="true" />
          <span className="u1-class-panel__copy">
            <strong>{row.title}</strong>
            {row.meta && <small>{row.meta}</small>}
          </span>
        </button>
      ))}
      {!visible.length && <EmptyState>Ничего не найдено.</EmptyState>}
    </div>
  )
}

function CatalogRows({
  rows,
  query,
}: {
  rows: Array<{ id: string; title: string; meta: string }>
  query: string
}) {
  const normalized = query.trim().toLocaleLowerCase("ru")
  const visible = useMemo(
    () => normalized
      ? rows.filter((row) => `${row.title} ${row.meta}`.toLocaleLowerCase("ru").includes(normalized))
      : rows,
    [normalized, rows],
  )

  return (
    <div className="u1-catalog-list">
      {visible.map((row) => (
        <article className="u1-catalog-row" key={row.id}>
          <strong>{row.title}</strong>
          <small>{row.meta}</small>
        </article>
      ))}
      {!visible.length && <EmptyState>Ничего не найдено.</EmptyState>}
    </div>
  )
}


function ReferenceCopyBlock({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="u1-reference-copy__block">
      <span>{label}</span>
      <p>{children}</p>
    </section>
  )
}

function ClassModeTabs({
  entry,
  active,
  onBeforeNavigate,
}: {
  entry: ClassReferenceEntry
  active: "class" | "subclasses"
  onBeforeNavigate?: () => void
}) {
  return (
    <nav className="u1-class-mode-tabs" aria-label="Класс и подклассы">
      <button
        type="button"
        data-active={active === "class" || undefined}
        onClick={() => {
          onBeforeNavigate?.()
          navigate(`home/knowledge-base/classes/${entry.id}`)
        }}
      >
        Класс
      </button>
      <button
        type="button"
        data-active={active === "subclasses" || undefined}
        onClick={() => {
          onBeforeNavigate?.()
          navigate(`home/knowledge-base/classes/${entry.id}/subclasses`)
        }}
      >
        Подклассы <small>{entry.subclasses.length}</small>
      </button>
    </nav>
  )
}

function ReferenceHeroPlaceholder({ kind }: { kind: "class" | "subclass" | "feature" }) {
  return (
    <div className="u1-reference-hero-placeholder" data-kind={kind} aria-hidden="true">
      <span className="u1-reference-hero-placeholder__wash" />
      <span className="u1-reference-hero-placeholder__line" />
    </div>
  )
}

type ReferenceDetailMode = "features" | "proficiencies" | "mechanics"

function ReferenceDetailTabs({
  active,
  onChange,
}: {
  active: ReferenceDetailMode
  onChange: (mode: ReferenceDetailMode) => void
}) {
  const tabs: Array<{ id: ReferenceDetailMode; label: string }> = [
    { id: "features", label: "Умения" },
    { id: "proficiencies", label: "Владения" },
    { id: "mechanics", label: "Механика" },
  ]

  return (
    <nav className="u1-reference-detail-tabs" aria-label="Содержание класса">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.id}
          data-active={active === tab.id || undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

function ExpandableVossIntro({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null

  const canExpand = text.length > 260

  return (
    <section className="u1-voss-intro" data-expanded={expanded || undefined}>
      <span>Восс объясняет</span>
      <div className="u1-voss-intro__text-wrap">
        <p className="u1-voss-intro__text">{text}</p>
        {!expanded && canExpand && <i className="u1-voss-intro__fade" aria-hidden="true" />}
      </div>
      {canExpand && (
        <button type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Свернуть ↑" : "Показать полностью ↓"}
        </button>
      )}
    </section>
  )
}

function VossCommentBlock({ text }: { text: string }) {
  if (!text) return null

  return (
    <section className="u1-voss-comment-block">
      <span>Комментарий Восса</span>
      <p>{text}</p>
    </section>
  )
}

function FeatureProgression({
  title,
  features,
  onOpen,
}: {
  title: string
  features: UiV1ReferenceFeature[]
  onOpen: (index: number) => void
}) {
  const [levelFilter, setLevelFilter] = useState("all")
  const levelOptions = useMemo(
    () => [...new Set(features.map((feature) => feature.level))].sort((a, b) => a - b),
    [features],
  )

  const rows = features
    .map((feature, index) => ({ feature, index }))
    .filter(({ feature }) => levelFilter === "all" || feature.level === Number(levelFilter))

  return (
    <section className="u1-feature-section">
      <div className="u1-feature-section__head">
        <span>{title}</span>
        <label className="u1-feature-level-filter">
          <span className="sr-only">Уровень</span>
          <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
            <option value="all">Все уровни</option>
            {levelOptions.map((level) => (
              <option key={level} value={level}>Уровень {level}</option>
            ))}
          </select>
        </label>
      </div>

      {rows.length ? (
        <div className="u1-feature-list">
          {rows.map(({ feature, index }) => (
            <button
              type="button"
              className="u1-feature-row"
              key={feature.sourceKey + ":" + index}
              onClick={() => onOpen(index)}
            >
              <span className="u1-feature-row__level">{String(feature.level).padStart(2, "0")}</span>
              <span className="u1-feature-row__copy">
                <strong>{feature.name}</strong>
                {feature.vossExplanation && (
                  <small className="u1-feature-row__story">{feature.vossExplanation}</small>
                )}
              </span>
              <i aria-hidden="true">›</i>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState>Для выбранного уровня умений нет.</EmptyState>
      )}
    </section>
  )
}

function ProficiencyView({ groups }: { groups: UiV1ProficiencyGroup[] }) {
  if (!groups.length) {
    return <EmptyState>Этот класс или подкласс не добавляет отдельных владений.</EmptyState>
  }

  return (
    <section className="u1-proficiency-view" aria-label="Владения">
      {groups.map((group) => (
        <section className="u1-proficiency-group" key={group.id}>
          <span>{group.title}</span>
          <div>
            {group.items.map((item) => <p key={item}>{item}</p>)}
          </div>
        </section>
      ))}
    </section>
  )
}

function mechanicLevelLabel(group: UiV1MechanicGroup) {
  if (!group.levels.length) return ""
  if (group.levels.length === 1) return group.levels[0] + " уровень"
  return "Уровни " + group.levels.join(", ")
}

function MechanicsView({ groups }: { groups: UiV1MechanicGroup[] }) {
  if (!groups.length) {
    return <EmptyState>Для этого материала пока нет отдельного runtime-представления механики.</EmptyState>
  }

  return (
    <section className="u1-mechanics-view" aria-label="Механика">
      {groups.map((group) => (
        <details className="u1-mechanic-row" key={group.id}>
          <summary>
            <span>
              <strong>{group.title}</strong>
              {group.levels.length > 0 && <small>{mechanicLevelLabel(group)}</small>}
            </span>
            <i aria-hidden="true">+</i>
          </summary>
          <div className="u1-mechanic-row__body">
            {group.summary && <p>{group.summary}</p>}
            {group.facts.length > 0 && (
              <ul>
                {group.facts.map((fact) => <li key={fact}>{fact}</li>)}
              </ul>
            )}
          </div>
        </details>
      ))}
    </section>
  )
}

function FeatureDetailScreen({
  sourceTitle,
  sourceKind,
  feature,
  backTo,
}: {
  sourceTitle: string
  sourceKind: "Класс" | "Подкласс"
  feature: UiV1ReferenceFeature
  backTo: string
}) {
  return (
    <main className="u1-section-page">
      <SectionHeader title={sourceTitle} backTo={backTo} />
      <ReferenceHeroPlaceholder kind="feature" />

      <section className="u1-feature-detail">
        <div className="u1-feature-detail__eyebrow">
          {feature.level} уровень · {sourceKind}
        </div>
        <h2>{feature.name}</h2>

        <div className="u1-reference-copy u1-reference-copy--feature">
          {feature.vossExplanation && (
            <ReferenceCopyBlock label="Восс объясняет">{feature.vossExplanation}</ReferenceCopyBlock>
          )}
          {feature.rule && (
            <ReferenceCopyBlock label="Точное правило">{feature.rule}</ReferenceCopyBlock>
          )}
          {feature.facts.length > 0 && (
            <section className="u1-feature-facts">
              <span>Механика</span>
              <ul>
                {feature.facts.map((fact) => <li key={fact}>{fact}</li>)}
              </ul>
            </section>
          )}
          {feature.vossComment && (
            <ReferenceCopyBlock label="Комментарий Восса">{feature.vossComment}</ReferenceCopyBlock>
          )}
        </div>
      </section>
    </main>
  )
}

function ClassDetailScreen({
  entry,
  presentation,
}: {
  entry: ClassReferenceEntry
  presentation: UiV1ReferencePresentation
}) {
  const [mode, setMode] = useState<ReferenceDetailMode>("features")

  return (
    <main className="u1-section-page">
      <SectionHeader title={entry.name} backTo="home/knowledge-base/classes" />
      <ClassModeTabs
        entry={entry}
        active="class"
        onBeforeNavigate={() => setMode("features")}
      />
      <ReferenceHeroPlaceholder kind="class" />
      <ReferenceDetailTabs active={mode} onChange={setMode} />

      {mode === "features" ? (
        <>
          <ExpandableVossIntro text={presentation.vossExplanation} />
          <VossCommentBlock text={presentation.vossComment} />
          <FeatureProgression
            title="Умения класса"
            features={presentation.storyFeatures}
            onOpen={(index) => navigate(`home/knowledge-base/classes/${entry.id}/features/${index}`)}
          />
        </>
      ) : mode === "proficiencies" ? (
        <ProficiencyView groups={presentation.proficiencies} />
      ) : (
        <MechanicsView groups={presentation.mechanics} />
      )}
    </main>
  )
}

const subclassPreviewArtIds = new Set([
  "druid:moon",
])

function subclassPreviewArtPath(entry: ClassReferenceEntry, subclass: ClassReferenceSubclass) {
  const key = `${entry.id}:${subclass.id}`
  return subclassPreviewArtIds.has(key)
    ? `/ui-v1/subclasses/${entry.id}/${subclass.id}-preview.webp`
    : undefined
}

function SubclassCatalogScreen({
  entry,
  query,
  setQuery,
}: {
  entry: ClassReferenceEntry
  query: string
  setQuery: (value: string) => void
}) {
  const rows = entry.subclasses.map((subclass) => ({
    id: subclass.id,
    title: subclass.name,
    meta: undefined,
    art: subclassPreviewArtPath(entry, subclass),
  }))

  return (
    <main className="u1-section-page">
      <SectionHeader title={entry.name} backTo="home/knowledge-base/classes" />
      <ClassModeTabs entry={entry} active="subclasses" />
      <h2 className="u1-subclass-catalog-title">Подклассы</h2>
      <label className="u1-catalog-search">
        <span>Поиск</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти подкласс…"
        />
      </label>
      <ClassCatalogPanels
        rows={rows}
        query={query}
        onOpen={(subclassId) =>
          navigate(`home/knowledge-base/classes/${entry.id}/subclasses/${subclassId}`)
        }
      />
    </main>
  )
}

function SubclassDetailScreen({
  entry,
  subclass,
  presentation,
}: {
  entry: ClassReferenceEntry
  subclass: ClassReferenceSubclass
  presentation: UiV1ReferencePresentation
}) {
  const [mode, setMode] = useState<ReferenceDetailMode>("features")

  return (
    <main className="u1-section-page">
      <SectionHeader
        title={subclass.name}
        backTo={`home/knowledge-base/classes/${entry.id}/subclasses`}
      />
      <ClassModeTabs
        entry={entry}
        active="subclasses"
        onBeforeNavigate={() => setMode("features")}
      />
      <ReferenceHeroPlaceholder kind="subclass" />
      <ReferenceDetailTabs active={mode} onChange={setMode} />

      {mode === "features" ? (
        <>
          <ExpandableVossIntro text={presentation.vossExplanation} />
          <VossCommentBlock text={presentation.vossComment} />
          <FeatureProgression
            title="Умения подкласса"
            features={presentation.storyFeatures}
            onOpen={(index) =>
              navigate(
                `home/knowledge-base/classes/${entry.id}/subclasses/${subclass.id}/features/${index}`,
              )
            }
          />
        </>
      ) : mode === "proficiencies" ? (
        <ProficiencyView groups={presentation.proficiencies} />
      ) : (
        <MechanicsView groups={presentation.mechanics} />
      )}
    </main>
  )
}

export function KnowledgeBaseScreen({ subsection, path = [] }: { subsection?: string; path?: string[] }) {
  const catalog = useUiV1KnowledgeCatalog(subsection)
  const rules = useRuleTemplates(subsection === "classes" ? catalog.campaignId : "")
  const [query, setQuery] = useState("")

  if (!subsection) {
    return (
      <SectionHub
        title="База знаний"
        items={knowledgeBaseSections}
        basePath="home/knowledge-base"
      />
    )
  }

  const registered = knowledgeBaseSections.find((item) => item.id === subsection)
  if (!registered) return <FutureConnection title="База знаний" backTo="home/knowledge-base" />

  const staticRows =
    subsection === "classes"
      ? classReference.map((entry) => ({
          id: entry.id,
          title: entry.name,
          meta: `${entry.subclasses.length} подклассов`,
          art: `/ui-v1/classes/${entry.id}.webp`,
        }))
      : subsection === "invocations"
        ? warlockInvocationsReference.map((entry, index) => ({
            id: `${entry.level}:${entry.name}:${index}`,
            title: entry.name.replace(/^Воззвание:\s*/, ""),
            meta: `${entry.level} уровень`,
          }))
        : null

  if (registered.state === "placeholder") {
    return <FutureConnection title={registered.title} backTo="home/knowledge-base" />
  }

  if (subsection === "classes" && path.length) {
    const selectedClass = classReference.find((entry) => entry.id === path[0])
    if (!selectedClass) {
      return <FutureConnection title="Классы" backTo="home/knowledge-base/classes" />
    }

    const classPresentation = buildClassPresentation(selectedClass, rules.templates, rules.levels)

    if (path[1] === "features") {
      const feature = classPresentation.storyFeatures[Number(path[2])]
      if (!feature) {
        return <FutureConnection title={selectedClass.name} backTo={`home/knowledge-base/classes/${selectedClass.id}`} />
      }

      return (
        <FeatureDetailScreen
          sourceTitle={selectedClass.name}
          sourceKind="Класс"
          feature={feature}
          backTo={`home/knowledge-base/classes/${selectedClass.id}`}
        />
      )
    }

    if (path[1] === "subclasses") {
      if (path[2]) {
        const selectedSubclass = selectedClass.subclasses.find((subclass) => subclass.id === path[2])
        if (!selectedSubclass) {
          return (
            <FutureConnection
              title="Подклассы"
              backTo={`home/knowledge-base/classes/${selectedClass.id}/subclasses`}
            />
          )
        }

        const subclassPresentation = buildSubclassPresentation(
          selectedClass,
          selectedSubclass,
          rules.templates,
          rules.levels,
        )

        if (path[3] === "features") {
          const feature = subclassPresentation.storyFeatures[Number(path[4])]
          if (!feature) {
            return (
              <FutureConnection
                title={selectedSubclass.name}
                backTo={`home/knowledge-base/classes/${selectedClass.id}/subclasses/${selectedSubclass.id}`}
              />
            )
          }

          return (
            <FeatureDetailScreen
              sourceTitle={selectedSubclass.name}
              sourceKind="Подкласс"
              feature={feature}
              backTo={`home/knowledge-base/classes/${selectedClass.id}/subclasses/${selectedSubclass.id}`}
            />
          )
        }

        return (
          <SubclassDetailScreen
            entry={selectedClass}
            subclass={selectedSubclass}
            presentation={subclassPresentation}
          />
        )
      }

      return <SubclassCatalogScreen entry={selectedClass} query={query} setQuery={setQuery} />
    }

    return <ClassDetailScreen entry={selectedClass} presentation={classPresentation} />
  }

  return (
    <main className="u1-section-page">
      <SectionHeader title={registered.title} backTo="home/knowledge-base" />
      <label className="u1-catalog-search">
        <span>Поиск</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти…"
        />
      </label>

      {subsection === "classes" && staticRows ? (
        <ClassCatalogPanels rows={staticRows} query={query} onOpen={(classId) => navigate(`home/knowledge-base/classes/${classId}`)} />
      ) : staticRows ? (
        <CatalogRows rows={staticRows} query={query} />
      ) : catalog.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : catalog.error ? (
        <EmptyState>Каталог временно недоступен.</EmptyState>
      ) : (
        <CatalogRows rows={catalog.rows} query={query} />
      )}
    </main>
  )
}

function AchievementTile({ item }: { item: AchievementPreview }) {
  return (
    <article
      className="u1-achievement-tile"
      data-future-action="achievement-detail"
    >
      <span className="u1-achievement-tile__texture" aria-hidden="true" />
      <strong>{item.title}</strong>
    </article>
  )
}

export function AchievementsScreen() {
  const achievements = useUiV1Achievements()

  return (
    <main className="u1-section-page">
      <SectionHeader title="Достижения" backTo="home" />
      {achievements.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : achievements.error ? (
        <EmptyState>Достижения временно недоступны.</EmptyState>
      ) : achievements.items.length ? (
        <section className="u1-achievement-list" aria-label="Достижения кампании">
          {achievements.items.map((item) => (
            <AchievementTile key={item.id} item={item} />
          ))}
        </section>
      ) : (
        <EmptyState>Достижений пока нет.</EmptyState>
      )}
    </main>
  )
}

function newsDay(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
}

function newsTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function SocietyNewsScreen() {
  const news = useUiV1SocietyNews()
  const [composerOpen, setComposerOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [composerError, setComposerError] = useState("")

  const grouped = useMemo(() => {
    const result: Array<{ day: string; items: typeof news.items }> = []
    for (const item of news.items) {
      const day = newsDay(item.published_at)
      const current = result[result.length - 1]
      if (current?.day === day) current.items.push(item)
      else result.push({ day, items: [item] })
    }
    return result
  }, [news.items])

  async function publish() {
    const cleanTitle = title.trim()
    const cleanBody = body.trim()
    if (!cleanTitle || !cleanBody) {
      setComposerError("Нужны заголовок и текст.")
      return
    }

    setSaving(true)
    setComposerError("")
    const result = await news.publish(cleanTitle, cleanBody)
    setSaving(false)

    if (!result.ok) {
      setComposerError(result.error || "Не удалось опубликовать.")
      return
    }

    setTitle("")
    setBody("")
    setComposerOpen(false)
  }

  return (
    <main className="u1-section-page">
      <SectionHeader
        title="Новости общества"
        backTo="home"
        action={news.canManage ? (
          <button
            type="button"
            className="u1-section-add"
            aria-label="Новая публикация"
            onClick={() => setComposerOpen(true)}
          >
            +
          </button>
        ) : null}
      />

      {news.loading ? (
        <EmptyState>Загрузка…</EmptyState>
      ) : news.error ? (
        <EmptyState>Новости временно недоступны.</EmptyState>
      ) : grouped.length ? (
        <section className="u1-news-timeline" aria-label="Новости общества">
          {grouped.map((group) => (
            <div className="u1-news-day" key={group.day}>
              <div className="u1-news-day__label">{group.day}</div>
              <div className="u1-news-day__items">
                {group.items.map((item) => (
                  <article className="u1-news-entry" key={item.id}>
                    <time>{newsTime(item.published_at)}</time>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <EmptyState>Публикаций пока нет.</EmptyState>
      )}

      {composerOpen && news.canManage && (
        <div className="u1-composer-backdrop" onMouseDown={() => setComposerOpen(false)}>
          <section
            className="u1-composer"
            role="dialog"
            aria-modal="true"
            aria-label="Новая публикация"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <strong>Новая публикация</strong>
              <button type="button" onClick={() => setComposerOpen(false)} aria-label="Закрыть">×</button>
            </header>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Заголовок"
              maxLength={160}
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Текст новости"
              rows={8}
            />
            {composerError && <p className="u1-composer__error">{composerError}</p>}
            <button
              type="button"
              className="u1-composer__publish"
              disabled={saving}
              onClick={() => void publish()}
            >
              {saving ? "Публикую…" : "Опубликовать"}
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
