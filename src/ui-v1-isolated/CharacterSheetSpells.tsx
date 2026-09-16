import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import type {
  ResolvedCharacterContract,
  ResolvedSpell,
  ResolvedSpellAccess,
} from "../character-engine/index.ts"
import { supabase } from "../lib/supabase.ts"
import type { CharacterSpell } from "../types/characterSheet.ts"
import type { SnakeAction } from "../snake-engine"
import { CHARACTER_SHEET_SPELL_GROUP_ORDER } from "./characterSheetUiContract"
import { SnakeTrigger, useSnake } from "./SnakeProvider"

type SpellCatalogMeta = {
  slug: string
  name_ru: string | null
  name_en: string
  school: string
  concentration: boolean
  ritual: boolean
  casting_time: string
  spell_range: string
  duration: string
  components: string[]
  effect_summary: string
  rules_text: string | null
  author_description: string
  author_comment: string
  source: string
}

type PreparationState =
  | "always_prepared"
  | "prepared"
  | "unprepared"
  | "not_required"

type SpellView = {
  spell: ResolvedSpell
  level: number
  name: string
  school: string
  concentration: boolean
  ritual: boolean
  preparation: PreparationState
  sourceNames: string[]
  legacy: CharacterSpell | null
  catalog: SpellCatalogMeta | null
}

const preparationLabels: Record<PreparationState, string> = {
  always_prepared: "Всегда подготовлено",
  prepared: "Подготовлено",
  unprepared: "Не подготовлено",
  not_required: "Без подготовки",
}

const schoolTranslations: Record<string, string> = {
  Abjuration: "Ограждение",
  Conjuration: "Вызов",
  Divination: "Прорицание",
  Enchantment: "Очарование",
  Evocation: "Воплощение",
  Illusion: "Иллюзия",
  Necromancy: "Некромантия",
  Transmutation: "Преобразование",
}

function schoolLabel(value: string) {
  return schoolTranslations[value] || value || "Без школы"
}

function levelLabel(level: number) {
  return level === 0 ? "ЗАГОВОРЫ" : `${level} УРОВЕНЬ`
}

function slugFromResolvedKey(key: string) {
  if (!key.startsWith("spell:")) return null
  const slug = key.slice("spell:".length).trim()
  return slug && /^[a-z0-9-]+$/i.test(slug) ? slug : null
}

function preparationState(accesses: ResolvedSpellAccess[]): PreparationState {
  if (accesses.some((access) => access.preparationMode === "always_prepared")) {
    return "always_prepared"
  }
  if (
    accesses.some(
      (access) =>
        access.preparationMode === "prepared" &&
        access.prepared,
    )
  ) {
    return "prepared"
  }
  if (accesses.some((access) => access.preparationMode === "prepared")) {
    return "unprepared"
  }
  return "not_required"
}

function accessSourceNames(accesses: ResolvedSpellAccess[]) {
  const names = new Set<string>()
  for (const access of accesses) {
    for (const sourceRef of access.sources) {
      const name = sourceRef.source.name?.trim()
      if (name) names.add(name)
    }
  }
  return [...names]
}

function legacySpellFor(
  spell: ResolvedSpell,
  byId: ReadonlyMap<string, CharacterSpell>,
) {
  for (const access of spell.accesses) {
    if (!access.key.startsWith("legacy-")) continue
    const id = access.key.slice("legacy-".length)
    const row = byId.get(id)
    if (row) return row
  }
  return null
}

function preparationRank(value: PreparationState) {
  if (value === "always_prepared") return 0
  if (value === "prepared") return 1
  if (value === "not_required") return 2
  return 3
}

function detailBody(view: SpellView) {
  const meta = view.catalog
  const legacy = view.legacy
  const components = Array.isArray(meta?.components)
    ? meta!.components.join(", ")
    : legacy?.components || ""

  const preparationNote =
    view.preparation === "prepared" || view.preparation === "unprepared"
      ? "Подготовка меняется через Гену в окне подготовки после отдыха."
      : ""

  const facts = [
    view.level === 0 ? "Заговор" : `${view.level} уровень`,
    schoolLabel(view.school),
    preparationLabels[view.preparation],
    view.concentration ? "Концентрация" : "",
    view.ritual ? "Ритуал" : "",
  ].filter(Boolean).join(" · ")

  const cast = [
    meta?.casting_time || legacy?.casting_time
      ? "Наложение: " + (meta?.casting_time || legacy?.casting_time)
      : "",
    meta?.spell_range || legacy?.spell_range
      ? "Дистанция: " + (meta?.spell_range || legacy?.spell_range)
      : "",
    meta?.duration || legacy?.duration
      ? "Длительность: " + (meta?.duration || legacy?.duration)
      : "",
    components ? "Компоненты: " + components : "",
  ].filter(Boolean).join("\n")

  const description =
    meta?.rules_text ||
    meta?.effect_summary ||
    legacy?.description ||
    meta?.author_description ||
    ""

  const sources = view.sourceNames.length
    ? "Доступ: " + view.sourceNames.join(" · ")
    : ""

  return [
    facts,
    cast,
    description,
    sources,
    preparationNote,
  ].filter(Boolean).join("\n\n")
}

export default function CharacterSheetSpells({
  characterId,
  contract,
  legacySpells,
  runtimeError,
  focusLevel,
  onSelect,
}: {
  characterId: string
  contract: ResolvedCharacterContract | null
  legacySpells: CharacterSpell[]
  runtimeError?: string
  focusLevel?: number | null
  onSelect?: (spellId: string) => void
}) {
  const snake = useSnake()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [catalogBySlug, setCatalogBySlug] = useState<Map<string, SpellCatalogMeta>>(
    () => new Map(),
  )
  const [preparedOnly, setPreparedOnly] = useState(false)
  const [concentrationOnly, setConcentrationOnly] = useState(false)
  const [ritualOnly, setRitualOnly] = useState(false)
  const [school, setSchool] = useState("all")

  const slugs = useMemo(
    () =>
      contract
        ? [...new Set(
            contract.spells
              .map((spell) => slugFromResolvedKey(spell.key))
              .filter((slug): slug is string => Boolean(slug)),
          )].sort()
        : [],
    [contract],
  )

  useEffect(() => {
    let cancelled = false

    if (!slugs.length) {
      setCatalogBySlug(new Map())
      return () => {
        cancelled = true
      }
    }

    void supabase
      .from("spell_catalog")
      .select(
        "slug,name_ru,name_en,school,concentration,ritual,casting_time,spell_range,duration,components,effect_summary,rules_text,author_description,author_comment,source",
      )
      .in("slug", slugs)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setCatalogBySlug(new Map())
          return
        }
        setCatalogBySlug(
          new Map(
            ((data || []) as SpellCatalogMeta[]).map((row) => [row.slug, row]),
          ),
        )
      })

    return () => {
      cancelled = true
    }
  }, [slugs])

  const views = useMemo(() => {
    if (!contract) return []

    const legacyById = new Map(legacySpells.map((spell) => [spell.id, spell]))
    const usesPreparation = contract.spells.some((spell) =>
      spell.accesses.some((access) => access.preparationMode === "prepared"),
    )

    return contract.spells
      .map((spell): SpellView => {
        const legacy = legacySpellFor(spell, legacyById)
        const slug = slugFromResolvedKey(spell.key)
        const catalog = slug ? catalogBySlug.get(slug) || null : null
        const schoolValue =
          spell.identity.school?.trim() ||
          legacy?.school?.trim() ||
          catalog?.school?.trim() ||
          ""

        return {
          spell,
          level: Math.max(0, Math.min(9, spell.identity.level)),
          name: spell.identity.name,
          school: schoolValue,
          concentration:
            legacy?.concentration ??
            catalog?.concentration ??
            false,
          ritual:
            spell.identity.ritual ??
            legacy?.ritual ??
            catalog?.ritual ??
            false,
          preparation: preparationState(spell.accesses),
          sourceNames: accessSourceNames(spell.accesses),
          legacy,
          catalog,
        }
      })
      .sort((left, right) =>
        left.level - right.level ||
        (
          usesPreparation
            ? preparationRank(left.preparation) - preparationRank(right.preparation)
            : 0
        ) ||
        left.name.localeCompare(right.name, "ru")
      )
  }, [catalogBySlug, contract, legacySpells])

  const schoolOptions = useMemo(
    () =>
      [...new Set(views.map((spell) => spell.school).filter(Boolean))]
        .sort((left, right) =>
          schoolLabel(left).localeCompare(schoolLabel(right), "ru")
        ),
    [views],
  )

  const filtered = views.filter((spell) => {
    if (
      preparedOnly &&
      spell.preparation !== "prepared" &&
      spell.preparation !== "always_prepared"
    ) {
      return false
    }
    if (concentrationOnly && !spell.concentration) return false
    if (ritualOnly && !spell.ritual) return false
    if (school !== "all" && spell.school !== school) return false
    return true
  })

  useEffect(() => {
    if (
      focusLevel === null ||
      focusLevel === undefined ||
      focusLevel < 0 ||
      focusLevel > 9
    ) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const target = rootRef.current?.querySelector<HTMLElement>(
        `[data-level="${focusLevel}"]`,
      )
      target?.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [focusLevel, filtered.length])

  if (!contract) {
    return (
      <section className="u1-character-spells u1-character-spells--loading">
        <span>
          {runtimeError
            ? "Character Engine не собрал заклинания."
            : "Character Engine собирает заклинания…"}
        </span>
        {runtimeError && <small>{runtimeError}</small>}
      </section>
    )
  }

  if (!views.length) {
    return (
      <section className="u1-character-spells u1-character-spells--empty">
        <span>У персонажа нет доступных заклинаний.</span>
      </section>
    )
  }

  return (
    <div className="u1-character-spells" ref={rootRef}>
      <div className="u1-character-spells__filters">
        <div className="u1-character-spells__chips">
          <button
            type="button"
            data-active={preparedOnly || undefined}
            onClick={() => setPreparedOnly((value) => !value)}
          >
            ПОДГОТОВЛЕНЫ
          </button>
          <button
            type="button"
            data-active={concentrationOnly || undefined}
            onClick={() => setConcentrationOnly((value) => !value)}
          >
            КОНЦЕНТРАЦИЯ
          </button>
          <button
            type="button"
            data-active={ritualOnly || undefined}
            onClick={() => setRitualOnly((value) => !value)}
          >
            РИТУАЛ
          </button>
        </div>

        <label className="u1-character-spells__school">
          <span>ШКОЛА</span>
          <select value={school} onChange={(event) => setSchool(event.target.value)}>
            <option value="all">Все</option>
            {schoolOptions.map((value) => (
              <option key={value} value={value}>
                {schoolLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 && (
        <div className="u1-character-spells__no-results">
          Под эти фильтры ничего не попало.
        </div>
      )}

      {CHARACTER_SHEET_SPELL_GROUP_ORDER.map((level) => {
        const spells = filtered.filter((spell) => spell.level === level)
        if (!spells.length) return null

        return (
          <section
            key={level}
            className="u1-character-spells__level"
            data-level={level}
            data-focus-target={level === focusLevel || undefined}
          >
            <header className="u1-character-spells__level-head">
              <span>{levelLabel(level)}</span>
              <small>{spells.length}</small>
            </header>

            <div className="u1-character-spells__list">
              {spells.map((view) => {
                const entity = {
                  type: "character-spell",
                  id: characterId + ":" + view.spell.key,
                }
                const detailAction: SnakeAction = {
                  id: "inspect-spell",
                  label: "Подробнее",
                  surface: {
                    kind: "detail",
                    eyebrow: level === 0 ? "Заговор" : `${level} уровень`,
                    title: view.name,
                    body: detailBody(view),
                  },
                }
                const sourceAction: SnakeAction = {
                  id: "spell-source",
                  label: "Источник",
                  surface: {
                    kind: "detail",
                    eyebrow: "Доступ к заклинанию",
                    title: view.name,
                    body: view.sourceNames.length
                      ? view.sourceNames.join("\n")
                      : "Источник не подписан.",
                  },
                }

                return (
                  <SnakeTrigger
                    key={view.spell.key}
                    entity={entity}
                    actions={[detailAction, sourceAction]}
                  >
                    <button
                      type="button"
                      className="u1-character-spells__row"
                      data-preparation={view.preparation}
                      data-available={view.spell.available || undefined}
                      data-unavailable={!view.spell.available || undefined}
                      onClick={() => {
                        onSelect?.(view.spell.key)
                        if (detailAction.surface) {
                          snake.openSurface(detailAction.surface)
                        }
                      }}
                    >
                      <span className="u1-character-spells__state" aria-hidden="true">
                        <i />
                      </span>

                      <span className="u1-character-spells__copy">
                        <strong>{view.name}</strong>
                        <small>
                          {[
                            schoolLabel(view.school),
                            preparationLabels[view.preparation],
                            view.concentration ? "Концентрация" : "",
                            view.ritual ? "Ритуал" : "",
                          ].filter(Boolean).join(" · ")}
                        </small>
                      </span>

                      <span className="u1-character-spells__source">
                        {view.sourceNames[0] || ""}
                      </span>
                    </button>
                  </SnakeTrigger>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
