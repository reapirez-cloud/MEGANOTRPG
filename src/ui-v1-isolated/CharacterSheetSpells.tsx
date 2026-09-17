import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"

import type {
  ResolvedCharacterContract,
  ResolvedResource,
  ResolvedSpell,
  ResolvedSpellAccess,
} from "../character-engine/index.ts"
import { supabase } from "../lib/supabase.ts"
import type { CharacterSpell } from "../types/characterSheet.ts"
import type { SnakeAction } from "../snake-engine"
import { CHARACTER_SHEET_SPELL_GROUP_ORDER } from "./characterSheetUiContract"
import {
  hasMutablePreparationWorkflow,
  isStandardSpellLevel,
  normalizeSpellSchool,
  resolveSpellPreparationState,
  spellPreparationRank,
  stableUniqueSortedStrings,
  summarizeSourceNames,
  type CharacterSheetPreparationState,
} from "./characterSheetDataCertification"
import {
  characterSheetEntityLabel,
  characterSheetLinkedEntitiesForSpell,
  type CharacterSheetEntityNavigator,
} from "./characterSheetEntityNavigation"
import { characterSheetSpellSlotAsset } from "./characterSheetVisualAssets"
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

type PreparationState = CharacterSheetPreparationState

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

const classLabels: Record<string, string> = {
  fighter: "Воин",
  warlock: "Колдун",
  cleric: "Жрец",
  druid: "Друид",
  bard: "Бард",
  paladin: "Паладин",
  sorcerer: "Чародей",
  wizard: "Волшебник",
  rogue: "Разбойник",
  monk: "Монах",
  barbarian: "Варвар",
  artificer: "Изобретатель",
  ranger: "Следопыт",
}

function atlasStyle(
  url: string,
  columns: number,
  rows: number,
  column: number,
  row: number,
) {
  const positionX =
    columns <= 1 ? "0%" : `${(column / (columns - 1)) * 100}%`
  const positionY =
    rows <= 1 ? "0%" : `${(row / (rows - 1)) * 100}%`

  return {
    "--u1-spell-slot-icon": `url("${url}")`,
    "--u1-spell-slot-icon-size": `${columns * 100}% ${rows * 100}%`,
    "--u1-spell-slot-icon-position": `${positionX} ${positionY}`,
  } as CSSProperties
}

function classSpellIconStyle(classKey: string) {
  const asset = characterSheetSpellSlotAsset(classKey)
  return atlasStyle(
    asset.url,
    asset.columns,
    asset.rows,
    asset.column,
    asset.row,
  )
}

function standardSlotLevel(resource: ResolvedResource) {
  const match = resource.stateKey.match(/^spell_slot_([1-9])$/)
  return match ? Number(match[1]) : null
}

function pactSlotLevel(contract: ResolvedCharacterContract) {
  const value = contract.values.find(
    (entry) =>
      entry.key === "warlock_pact_slot_level" ||
      entry.stateKey === "warlock_pact_slot_level",
  )
  return value
    ? Math.max(1, Math.min(9, Math.round(value.value.value)))
    : null
}

function slotCount(resource: ResolvedResource | null | undefined) {
  if (!resource) return { current: 0, max: 0 }
  const max = Math.max(0, Math.round(resource.max.value))
  return {
    current: Math.max(0, Math.min(max, Math.round(resource.current))),
    max,
  }
}

function schoolLabel(value: string) {
  const normalized = normalizeSpellSchool(value)
  return schoolTranslations[normalized] || normalized || "Без школы"
}

function levelLabel(level: number) {
  return level === 0 ? "ЗАГОВОРЫ" : `${level} УРОВЕНЬ`
}

function slugFromResolvedKey(key: string) {
  if (!key.startsWith("spell:")) return null
  const slug = key.slice("spell:".length).trim()
  return slug && /^[a-z0-9-]+$/i.test(slug) ? slug : null
}

function accessSourceNames(accesses: ResolvedSpellAccess[]) {
  return stableUniqueSortedStrings(
    accesses.flatMap((access) =>
      access.sources.map(
        (sourceRef) => sourceRef.source.name?.trim() || "",
      )
    ),
  )
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
  focusSpellKey,
  onSelect,
  onNavigateEntity,
}: {
  characterId: string
  contract: ResolvedCharacterContract | null
  legacySpells: CharacterSpell[]
  runtimeError?: string
  focusLevel?: number | null
  focusSpellKey?: string | null
  onSelect?: (spellId: string) => void
  onNavigateEntity?: CharacterSheetEntityNavigator
}) {
  const snake = useSnake()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [sheetClassKey, setSheetClassKey] = useState("")
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
    const usesPreparation =
      hasMutablePreparationWorkflow(contract.spells)

    return contract.spells
      .map((spell): SpellView => {
        const legacy = legacySpellFor(spell, legacyById)
        const slug = slugFromResolvedKey(spell.key)
        const catalog = slug ? catalogBySlug.get(slug) || null : null
        const schoolValue =
          normalizeSpellSchool(
            spell.identity.school?.trim() ||
            legacy?.school?.trim() ||
            catalog?.school?.trim() ||
            "",
          )

        return {
          spell,
          level: spell.identity.level,
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
          preparation: resolveSpellPreparationState(spell.accesses),
          sourceNames: accessSourceNames(spell.accesses),
          legacy,
          catalog,
        }
      })
      .sort((left, right) =>
        left.level - right.level ||
        (
          usesPreparation
            ? spellPreparationRank(left.preparation) -
              spellPreparationRank(right.preparation)
            : 0
        ) ||
        left.name.localeCompare(right.name, "ru")
      )
  }, [catalogBySlug, contract, legacySpells])

  const slotByLevel = useMemo(
    () => new Map(
      (contract?.resources || [])
        .map((resource) => {
          const level = standardSlotLevel(resource)
          return level === null ? null : [level, resource] as const
        })
        .filter(
          (entry): entry is readonly [number, ResolvedResource] =>
            entry !== null,
        ),
    ),
    [contract],
  )

  const pactSlots = useMemo(
    () =>
      (contract?.resources || []).find(
        (resource) => resource.stateKey === "warlock_pact_slots",
      ) || null,
    [contract],
  )

  const pactLevel = contract ? pactSlotLevel(contract) : null

  useEffect(() => {
    if (!contract) return
    const sheet = rootRef.current?.closest<HTMLElement>(".u1-character-sheet")
    setSheetClassKey(sheet?.dataset.classKey || "")
  }, [characterId, contract])

  const hasPreparationWorkflow = useMemo(
    () =>
      hasMutablePreparationWorkflow(
        views.map((view) => view.spell),
      ),
    [views],
  )

  useEffect(() => {
    if (!hasPreparationWorkflow && preparedOnly) {
      setPreparedOnly(false)
    }
  }, [hasPreparationWorkflow, preparedOnly])

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

  const scrollToLevel = (level: number) => {
    window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-level="${level}"]`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
          inline: "nearest",
        })
    })
  }

  useEffect(() => {
    if (!focusSpellKey) return

    const frame = window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(
          `[data-spell-key="${focusSpellKey}"]`,
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [focusSpellKey, filtered.length])

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
      <section
        className="u1-character-spells__slots-panel"
        aria-labelledby="u1-character-spells-slots-title"
      >
        <header className="u1-character-spells__slots-head">
          <strong id="u1-character-spells-slots-title">ЯЧЕЙКИ ЗАКЛИНАНИЙ</strong>
          <span aria-hidden="true" />
          <small>
            {pactSlots && pactLevel
              ? `Магия договора · ${pactLevel} круг`
              : classLabels[sheetClassKey] || "Заклинатель"}
          </small>
        </header>

        <div className="u1-character-spells__slots-grid">
          {Array.from({ length: 9 }, (_, index) => index + 1).map((level) => {
            const pactAtThisLevel = Boolean(pactSlots && pactLevel === level)
            const resource =
              slotByLevel.get(level) || (pactAtThisLevel ? pactSlots : null)
            const slot = slotCount(resource)
            const locked = slot.max <= 0
            const exhausted = !locked && slot.current <= 0

            return (
              <button
                key={level}
                type="button"
                className="u1-character-spells__slot"
                data-slot-level={level}
                data-locked={locked || undefined}
                data-pact={pactAtThisLevel || undefined}
                data-exhausted={exhausted || undefined}
                data-focus-target={focusLevel === level || undefined}
                disabled={locked}
                onClick={() => scrollToLevel(level)}
                aria-label={
                  locked
                    ? `${level} круг недоступен`
                    : pactAtThisLevel
                      ? `Магия договора: ${slot.current} из ${slot.max} ячеек ${level} круга`
                      : `${level} круг: ${slot.current} из ${slot.max} ячеек`
                }
              >
                <span className="u1-character-spells__slot-icon-frame">
                  {locked ? (
                    <i className="u1-character-spells__slot-lock" aria-hidden="true" />
                  ) : (
                    <i
                      className="u1-character-spells__class-icon"
                      style={classSpellIconStyle(sheetClassKey)}
                      aria-hidden="true"
                    />
                  )}
                </span>
                <small>{locked ? `${level} круг` : `${slot.current}/${slot.max}`}</small>
              </button>
            )
          })}
        </div>
      </section>

      <div className="u1-character-spells__filters">
        <div className="u1-character-spells__chips">
          {hasPreparationWorkflow && (
            <button
              type="button"
              data-active={preparedOnly || undefined}
              onClick={() => setPreparedOnly((value) => !value)}
            >
              ПОДГОТОВЛЕНЫ
            </button>
          )}
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
                const relatedTargets =
                  characterSheetLinkedEntitiesForSpell(view.spell)
                const navigationAction: SnakeAction | null =
                  onNavigateEntity && relatedTargets.length
                    ? {
                        id: "spell-linked-entities",
                        label: "Связано",
                        kind: "branch",
                        children: relatedTargets.map((target, index) => ({
                          id: "navigate-" + target.kind + "-" + index,
                          label: characterSheetEntityLabel(target),
                          execute: () => onNavigateEntity(target),
                        })),
                      }
                    : null
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
                    actions={[
                      detailAction,
                      sourceAction,
                      ...(navigationAction ? [navigationAction] : []),
                    ]}
                  >
                    <button
                      type="button"
                      className="u1-character-spells__row"
                      data-spell-key={view.spell.key}
                      data-entity-focus={
                        focusSpellKey === view.spell.key || undefined
                      }
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
                        {summarizeSourceNames(view.sourceNames)}
                      </span>
                    </button>
                  </SnakeTrigger>
                )
              })}
            </div>
          </section>
        )
      })}

      {filtered.some((spell) => !isStandardSpellLevel(spell.level)) && (
        <section
          className="u1-character-spells__level"
          data-level="other"
        >
          <header className="u1-character-spells__level-head">
            <span>ПРОЧЕЕ</span>
            <small>
              {filtered.filter(
                (spell) => !isStandardSpellLevel(spell.level),
              ).length}
            </small>
          </header>
          <div className="u1-character-spells__no-results">
            {filtered
              .filter((spell) => !isStandardSpellLevel(spell.level))
              .map((spell) =>
                `${spell.name} · уровень ${spell.level}`
              )
              .join(" · ")}
          </div>
        </section>
      )}
    </div>
  )
}
