import { useMemo, useState } from "react"

import { classReference, type ClassReferenceEntry } from "../../data/classReference"
import { druidReference } from "../../data/classes/druidReference"
import type { SpellClassKey } from "../../lib/spellCatalog"
import SpellReference from "../characters/SpellReference"

type CharacterTarget = {
  id: string
  name: string
  character_class: string
}

type ReferenceSection = "home" | "spells" | "classes" | "class-detail" | "bestiary" | "chaos"

type Props = {
  character: CharacterTarget | null
  canManage: boolean
  onClose: () => void
  onCharacterChanged?: () => void
  initialSection?: "home" | "spells" | "classes" | "bestiary" | "chaos"
  initialClassId?: SpellClassKey | null
}

const sections = [
  {
    id: "spells" as const,
    icon: "✦",
    title: "Заклинания",
    copy: "Готовый каталог заклинаний с поиском, фильтрами и подробными карточками.",
    meta: "Каталог уже работает",
  },
  {
    id: "classes" as const,
    icon: "◇",
    title: "Классы",
    copy: "Классы, их назначение, подклассы и короткие описания специализаций.",
    meta: `${classReference.length} классов`,
  },
  {
    id: "bestiary" as const,
    icon: "◉",
    title: "Бестиарий",
    copy: "Существа, противники и их справочные карточки будут жить отдельным разделом.",
    meta: "Каркас готов",
  },
  {
    id: "chaos" as const,
    icon: "⌁",
    title: "Болезни, безумия и дикая магия",
    copy: "Таблицы и справочные эффекты, которые не относятся напрямую к заклинаниям или существам.",
    meta: "Каркас готов",
  },
]

function classTagline(entry: ClassReferenceEntry) {
  return entry.id === "druid" ? druidReference.tagline : entry.tagline
}

export default function ReferenceGuide({
  character,
  canManage,
  onClose,
  onCharacterChanged,
  initialSection = "home",
  initialClassId = null,
}: Props) {
  const initialClass = useMemo(
    () => classReference.find((entry) => entry.id === initialClassId) || null,
    [initialClassId],
  )
  const [section, setSection] = useState<ReferenceSection>(
    initialClass ? "class-detail" : initialSection,
  )
  const [selectedClass, setSelectedClass] = useState<ClassReferenceEntry | null>(initialClass)

  if (section === "spells") {
    return (
      <SpellReference
        character={character}
        canManage={canManage}
        onClose={() => setSection("home")}
        onCharacterChanged={onCharacterChanged}
      />
    )
  }

  function goBack() {
    if (section === "home") {
      onClose()
      return
    }
    if (section === "class-detail") {
      setSelectedClass(null)
      setSection("classes")
      return
    }
    setSection("home")
  }

  function openClass(entry: ClassReferenceEntry) {
    setSelectedClass(entry)
    setSection("class-detail")
  }

  const title = section === "home"
    ? "Справочник"
    : section === "classes"
      ? "Классы"
      : section === "class-detail"
        ? selectedClass?.name || "Класс"
        : section === "bestiary"
          ? "Бестиарий"
          : "Болезни, безумия и дикая магия"
  const isDruid = selectedClass?.id === "druid"
  const visibleSubclasses = isDruid ? druidReference.subclasses : selectedClass?.subclasses || []

  return (
    <div className="reference-guide-overlay">
      <section className="reference-guide-page">
        <header className="reference-guide-header">
          <button className="icon-button" type="button" onClick={goBack} aria-label={section === "home" ? "Закрыть справочник" : "Назад"}>←</button>
          <div>
            <h2>{title}</h2>
            {section === "home" && <p>Единая база правил и игровых материалов</p>}
          </div>
          <span />
        </header>

        {section === "home" && (
          <main className="reference-guide-content">
            <div className="reference-guide-intro surface">
              <span className="reference-guide-intro__mark">⌘</span>
              <div>
                <strong>Один справочник вместо отдельных баз</strong>
                <p>Каждый тип материала живёт в своём разделе, но открывается из одного места.</p>
              </div>
            </div>

            <div className="reference-guide-grid">
              {sections.map((item) => (
                <button
                  className="reference-guide-section surface"
                  type="button"
                  key={item.id}
                  onClick={() => setSection(item.id)}
                >
                  <span className="reference-guide-section__icon">{item.icon}</span>
                  <span className="reference-guide-section__copy">
                    <strong>{item.title}</strong>
                    <small>{item.copy}</small>
                    <em>{item.meta}</em>
                  </span>
                  <span className="reference-guide-section__chevron">›</span>
                </button>
              ))}
            </div>
          </main>
        )}

        {section === "classes" && (
          <main className="reference-guide-content reference-guide-content--list">
            <div className="reference-guide-section-note">
              <strong>Классы — самостоятельные справочные карточки</strong>
              <p>Механика хранится отдельно от авторского текста. Рассказчик объясняет правила своими словами, но Character Engine получает только структурированные данные.</p>
            </div>

            <div className="reference-class-list">
              {classReference.map((entry) => (
                <button
                  className="reference-class-card surface"
                  type="button"
                  key={entry.id}
                  onClick={() => openClass(entry)}
                >
                  <span className="reference-class-card__monogram">{entry.name.slice(0, 1)}</span>
                  <span className="reference-class-card__copy">
                    <span className="reference-class-card__title">
                      <strong>{entry.name}</strong>
                      <small>{entry.nameEn}</small>
                    </span>
                    <span>{classTagline(entry)}</span>
                    <em>{entry.id === "druid" ? `${druidReference.rulesLabel} · ${druidReference.subclasses.length} круга` : `${entry.subclasses.length} подклассов`}</em>
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
              <div>
                <h3>{selectedClass.name}</h3>
                <span>{selectedClass.nameEn}</span>
                <p>{classTagline(selectedClass)}</p>
              </div>
            </div>

            {isDruid && (
              <div className="reference-class-rule-badges" aria-label="Редакция правил">
                <span>{druidReference.sourceLabel}</span>
                <strong>{druidReference.rulesLabel}</strong>
              </div>
            )}

            <section className="reference-class-description">
              <span>{isDruid ? "Рейнар Восс" : "Описание класса"}</span>
              <p>{isDruid ? druidReference.authorDescription : selectedClass.description}</p>
            </section>

            {isDruid && (
              <>
                <section className="reference-class-mechanics surface">
                  <span>Коротко о механике</span>
                  <p>{druidReference.mechanicalSummary}</p>
                  <small>{druidReference.wildShapePolicy}</small>
                </section>
                <section className="reference-voss-note surface">
                  <span>Заметка Восса</span>
                  <p>{druidReference.authorComment}</p>
                </section>
                <section className="reference-class-feature-section">
                  <div className="reference-subclass-section__head"><span>Прогрессия класса</span><small>{druidReference.features.length}</small></div>
                  <div className="reference-class-feature-list">
                    {druidReference.features.map((feature) => (
                      <article className="reference-class-feature surface" key={`${feature.level}:${feature.name}`}>
                        <header><span>{feature.level} ур.</span><strong>{feature.name}</strong>{feature.revision && <em>{feature.revision}</em>}</header>
                        <p>{feature.mechanics}</p>
                        {feature.voss && <blockquote>{feature.voss}</blockquote>}
                      </article>
                    ))}
                  </div>
                </section>
              </>
            )}

            <section className="reference-subclass-section">
              <div className="reference-subclass-section__head">
                <span>Подклассы</span>
                <small>{visibleSubclasses.length}</small>
              </div>
              <div className="reference-subclass-list">
                {visibleSubclasses.map((subclass) => (
                  <article className="reference-subclass-card surface" key={subclass.id} id={`${selectedClass.id}:${subclass.id}`}>
                    <strong>{subclass.name}</strong>
                    <p>{"mechanics" in subclass ? subclass.mechanics : subclass.summary}</p>
                    {"voss" in subclass && <blockquote>{subclass.voss}</blockquote>}
                  </article>
                ))}
              </div>
            </section>
          </main>
        )}

        {(section === "bestiary" || section === "chaos") && (
          <main className="reference-guide-content reference-guide-content--empty">
            <div className="reference-guide-placeholder surface">
              <span>{section === "bestiary" ? "◉" : "⌁"}</span>
              <h3>{section === "bestiary" ? "Раздел для бестиария готов" : "Раздел для таблиц готов"}</h3>
              <p>
                {section === "bestiary"
                  ? "Сюда можно добавлять существ отдельными карточками, не смешивая их с миром кампании или персонажами."
                  : "Здесь будут отдельные категории: болезни, безумия и дикая магия. Они уже отделены от заклинаний и классов на уровне навигации."}
              </p>
            </div>
          </main>
        )}
      </section>
    </div>
  )
}
