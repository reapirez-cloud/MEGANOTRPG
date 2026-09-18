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
  type CharacterSheetPreparationState,
} from "./characterSheetDataCertification"
import {
  characterSheetEntityLabel,
  characterSheetLinkedEntitiesForSpell,
  type CharacterSheetEntityNavigator,
} from "./characterSheetEntityNavigation"
import { characterSheetSpellSlotAsset } from "./characterSheetVisualAssets"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import "./character-sheet-spells.css"
import "./character-sheet-spell-stage6.css"

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

type PreparationMutationResult = {
  ok: boolean
  error?: string
}

type SpellClassProfile = {
  preparationRefresh?: string | null
  selectionMode?: string | null
  progression?: string | null
}

type GrimoireManagementMode =
  | "direct"
  | "long_rest"
  | "level_choice"
  | "pact_magic"
  | "spellbook"

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

const schoolIconSeeds: Record<string, number> = {
  Abjuration: 0,
  Conjuration: 2,
  Divination: 4,
  Enchantment: 6,
  Evocation: 8,
  Illusion: 10,
  Necromancy: 1,
  Transmutation: 5,
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

const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"]
const SPELL_CARD_ICON_ATLAS = "/ui-v1/character-sheet/icons/spell-slots.png"

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

function stableHash(value: string) {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function spellCardIconStyle(view: SpellView) {
  const school = normalizeSpellSchool(view.school)
  const seed = schoolIconSeeds[school] ?? Math.max(0, view.level)
  const identity = `${view.spell.key}:${view.name}:${view.level}`
  const index = (seed + stableHash(identity)) % 12
  const column = index % 4
  const row = Math.floor(index / 4)
  const positionX = `${(column / 3) * 100}%`
  const positionY = `${(row / 2) * 100}%`

  return {
    "--u1-spell-card-icon": `url("${SPELL_CARD_ICON_ATLAS}")`,
    "--u1-spell-card-icon-size": "400% 300%",
    "--u1-spell-card-icon-position": `${positionX} ${positionY}`,
  } as CSSProperties
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

function levelTitle(level: number) {
  return level === 0 ? "Заговоры" : `${level} круг`
}

function spellCountLabel(count: number) {
  const value = Math.max(0, Math.round(count))
  const mod100 = value % 100
  const mod10 = value % 10

  if (mod100 >= 11 && mod100 <= 14) return `${value} заклинаний`
  if (mod10 === 1) return `${value} заклинание`
  if (mod10 >= 2 && mod10 <= 4) return `${value} заклинания`
  return `${value} заклинаний`
}

function initialSpellCircleLevel(
  contract: ResolvedCharacterContract | null,
  focusLevel?: number | null,
) {
  if (
    typeof focusLevel === "number" &&
    focusLevel >= 0 &&
    focusLevel <= 9
  ) {
    return focusLevel
  }

  if (!contract) return null

  const levels = CHARACTER_SHEET_SPELL_GROUP_ORDER.filter((level) =>
    contract.spells.some((spell) => spell.identity.level === level),
  )
  return levels.find((level) => level > 0) ?? levels[0] ?? null
}

function grimoireManagementMode(
  classKey: string,
  profile: SpellClassProfile | undefined,
  hasPactSlots: boolean,
): GrimoireManagementMode {
  if (classKey === "wizard") return "spellbook"
  if (profile?.preparationRefresh === "long_rest") return "long_rest"
  if (profile?.progression === "pact_magic" || hasPactSlots) return "pact_magic"
  if (profile?.selectionMode === "persistent_on_level_change") return "level_choice"
  return "direct"
}

function fixedPreparationLabel(
  view: SpellView,
  mode: GrimoireManagementMode,
) {
  if (view.level === 0) return "Всегда доступно"

  if (mode === "pact_magic") return "Магия договора"
  if (mode === "level_choice") return "Выбрано при развитии"

  if (view.preparation === "always_prepared") return "Всегда подготовлено"
  if (view.preparation === "prepared") return "Подготовлено"
  if (view.preparation === "unprepared") return "Не подготовлено"
  return "Подготовка не требуется"
}

function grimoireOpenHint(mode: GrimoireManagementMode) {
  if (mode === "spellbook") return "Книга заклинаний, фильтры и подготовка"
  if (mode === "long_rest") return "Фильтры и подготовка после долгого отдыха"
  if (mode === "pact_magic") return "Магия договора, фильтры и подробности"
  if (mode === "level_choice") return "Выбранные заклинания, фильтры и подробности"
  return "Все заклинания круга, фильтры и подготовка"
}


function castingTimeLabel(view: SpellView) {
  const raw =
    view.catalog?.casting_time?.trim() ||
    view.legacy?.casting_time?.trim() ||
    ""

  if (!raw) return schoolLabel(view.school)

  const normalized = raw.toLocaleLowerCase("ru-RU")
  if (/^(?:1\s+)?бонусное действие/u.test(normalized)) return "Бонусное действие"
  if (/^(?:1\s+)?действие/u.test(normalized)) return "Действие"
  if (/^(?:1\s+)?реакция/u.test(normalized)) return "Реакция"

  return raw
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

function mutablePreparationSpellId(view: SpellView) {
  if (!view.legacy) return null
  const mutable = view.spell.accesses.some(
    (access) => access.preparationMode === "prepared",
  )
  return mutable ? view.legacy.id : null
}

function resolveViewPreparation(
  spell: ResolvedSpell,
  legacy: CharacterSpell | null,
) {
  const resolved = resolveSpellPreparationState(spell.accesses)
  if (!legacy) return resolved

  const hasMutable = spell.accesses.some(
    (access) => access.preparationMode === "prepared",
  )
  const hasFixedAccess = spell.accesses.some(
    (access) =>
      access.preparationMode === "always_prepared" ||
      access.preparationMode === "not_required",
  )

  if (hasMutable && !hasFixedAccess) {
    return legacy.prepared ? "prepared" : "unprepared"
  }

  return resolved
}

function detailBody(view: SpellView) {
  const meta = view.catalog
  const legacy = view.legacy
  const components = Array.isArray(meta?.components)
    ? meta!.components.join(", ")
    : legacy?.components || ""

  const preparationNote =
    view.preparation === "prepared" || view.preparation === "unprepared"
      ? "Подготовку можно изменить в гримуаре."
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
  classKey,
  classSpellProfile,
  contract,
  legacySpells,
  runtimeError,
  focusLevel,
  focusSpellKey,
  canEditPreparation = false,
  onSetPrepared,
  onSelect,
  onNavigateEntity,
}: {
  characterId: string
  classKey?: string
  classSpellProfile?: SpellClassProfile
  contract: ResolvedCharacterContract | null
  legacySpells: CharacterSpell[]
  runtimeError?: string
  focusLevel?: number | null
  focusSpellKey?: string | null
  canEditPreparation?: boolean
  onSetPrepared?: (
    spellId: string,
    prepared: boolean,
  ) => Promise<PreparationMutationResult>
  onSelect?: (spellId: string) => void
  onNavigateEntity?: CharacterSheetEntityNavigator
}) {
  const snake = useSnake()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [sheetClassKey, setSheetClassKey] = useState(() => classKey?.trim() || "")
  const displayClassKey = classKey?.trim() || sheetClassKey
  const [expandedLevel, setExpandedLevel] = useState<number | null>(() =>
    initialSpellCircleLevel(contract, focusLevel),
  )
  const [grimoireLevel, setGrimoireLevel] = useState<number | null>(null)
  const [preparedOnly, setPreparedOnly] = useState(false)
  const [concentrationOnly, setConcentrationOnly] = useState(false)
  const [ritualOnly, setRitualOnly] = useState(false)
  const [school, setSchool] = useState("all")
  const [preparationBusyId, setPreparationBusyId] = useState<string | null>(null)
  const [preparationError, setPreparationError] = useState("")
  const [catalogBySlug, setCatalogBySlug] = useState<Map<string, SpellCatalogMeta>>(
    () => new Map(),
  )

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
    const usesPreparation = hasMutablePreparationWorkflow(contract.spells)

    return contract.spells
      .map((spell): SpellView => {
        const legacy = legacySpellFor(spell, legacyById)
        const slug = slugFromResolvedKey(spell.key)
        const catalog = slug ? catalogBySlug.get(slug) || null : null
        const schoolValue = normalizeSpellSchool(
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
            legacy?.concentration ?? catalog?.concentration ?? false,
          ritual:
            spell.identity.ritual ?? legacy?.ritual ?? catalog?.ritual ?? false,
          preparation: resolveViewPreparation(spell, legacy),
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
  const hasSpellSlots = slotByLevel.size > 0 || Boolean(pactSlots)
  const grimoireMode = grimoireManagementMode(
    displayClassKey,
    classSpellProfile,
    Boolean(pactSlots),
  )
  const preparationManagedByRest =
    grimoireMode === "long_rest" || grimoireMode === "spellbook"

  useEffect(() => {
    if (!contract) return
    if (classKey?.trim()) {
      setSheetClassKey(classKey.trim())
      return
    }
    const sheet = rootRef.current?.closest<HTMLElement>(".u1-character-sheet")
    setSheetClassKey(sheet?.dataset.classKey || "")
  }, [characterId, classKey, contract])

  useEffect(() => {
    if (!views.length) {
      setExpandedLevel(null)
      setGrimoireLevel(null)
      return
    }

    const availableLevels = CHARACTER_SHEET_SPELL_GROUP_ORDER.filter((level) =>
      views.some((spell) => spell.level === level),
    )

    setExpandedLevel((current) => {
      if (current !== null && availableLevels.includes(current)) return current
      if (
        typeof focusLevel === "number" &&
        focusLevel >= 0 &&
        focusLevel <= 9 &&
        availableLevels.includes(focusLevel)
      ) {
        return focusLevel
      }
      return availableLevels.find((level) => level > 0) ?? availableLevels[0] ?? null
    })

    setGrimoireLevel((current) =>
      current !== null && availableLevels.includes(current) ? current : null,
    )
  }, [focusLevel, views])

  const slotForSpellLevel = (level: number) => {
    const standard = slotByLevel.get(level)
    if (standard) return { resource: standard, pact: false, castLevel: level }
    if (level > 0 && pactSlots && pactLevel && level <= pactLevel) {
      return { resource: pactSlots, pact: true, castLevel: pactLevel }
    }
    return { resource: null, pact: false, castLevel: level }
  }

  const resetGrimoireFilters = () => {
    setPreparedOnly(false)
    setConcentrationOnly(false)
    setRitualOnly(false)
    setSchool("all")
  }

  const openCircle = (level: number) => {
    setExpandedLevel(level)
    setGrimoireLevel(null)
    setPreparationError("")
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

  const openGrimoire = (level: number) => {
    resetGrimoireFilters()
    setExpandedLevel(level)
    setGrimoireLevel(level)
    setPreparationError("")
    window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-grimoire-level="${level}"]`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        })
    })
  }

  const filteredGrimoireSpells = (items: SpellView[]) => items.filter((view) => {
    if (
      preparedOnly &&
      view.preparation !== "prepared" &&
      view.preparation !== "always_prepared"
    ) {
      return false
    }
    if (concentrationOnly && !view.concentration) return false
    if (ritualOnly && !view.ritual) return false
    if (school !== "all" && view.school !== school) return false
    return true
  })

  const setPrepared = async (view: SpellView) => {
    const spellId = mutablePreparationSpellId(view)
    if (!spellId || !onSetPrepared || !canEditPreparation) return

    const nextPrepared = view.preparation !== "prepared"
    setPreparationBusyId(spellId)
    setPreparationError("")

    try {
      const result = await onSetPrepared(spellId, nextPrepared)
      if (!result.ok) {
        setPreparationError(
          result.error || "Не удалось изменить подготовку заклинания.",
        )
      }
    } catch (reason) {
      setPreparationError(
        reason instanceof Error && reason.message
          ? reason.message
          : "Не удалось изменить подготовку заклинания.",
      )
    } finally {
      setPreparationBusyId((current) => current === spellId ? null : current)
    }
  }

  useEffect(() => {
    if (!focusSpellKey) return
    const focused = views.find((view) => view.spell.key === focusSpellKey)
    if (focused && isStandardSpellLevel(focused.level)) {
      setExpandedLevel(focused.level)
      setGrimoireLevel(null)
    }

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        rootRef.current
          ?.querySelector<HTMLElement>(`[data-spell-key="${focusSpellKey}"]`)
          ?.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          })
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [focusSpellKey, views])

  useEffect(() => {
    if (
      focusLevel === null ||
      focusLevel === undefined ||
      focusLevel < 0 ||
      focusLevel > 9
    ) {
      return
    }

    setExpandedLevel(focusLevel)
    setGrimoireLevel(null)
    const frame = window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-level="${focusLevel}"]`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
          inline: "nearest",
        })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [focusLevel, views.length])

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

  if (!views.length && !hasSpellSlots) {
    return (
      <section className="u1-character-spells u1-character-spells--empty">
        <span>У персонажа нет доступных заклинаний.</span>
      </section>
    )
  }

  const renderSpell = (
    view: SpellView,
    compact = false,
    grimoire = false,
  ) => {
    const entity = {
      type: "character-spell",
      id: characterId + ":" + view.spell.key,
    }
    const detailAction: SnakeAction = {
      id: "inspect-spell",
      label: "Подробнее",
      surface: {
        kind: "detail",
        eyebrow: view.level === 0 ? "Заговор" : `${view.level} круг`,
        title: view.name,
        body: detailBody(view),
      },
    }
    const relatedTargets = characterSheetLinkedEntitiesForSpell(view.spell)
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

    const trigger = (
      <SnakeTrigger
        key={compact ? view.spell.key : undefined}
        entity={entity}
        actions={[
          detailAction,
          sourceAction,
          ...(navigationAction ? [navigationAction] : []),
        ]}
      >
        <button
          type="button"
          className={
            compact
              ? "u1-character-spells__preview-card"
              : "u1-character-spells__spell-card"
          }
          data-spell-key={view.spell.key}
          data-entity-focus={focusSpellKey === view.spell.key || undefined}
          data-preparation={grimoire ? view.preparation : undefined}
          data-school={normalizeSpellSchool(view.school) || undefined}
          data-concentration={view.concentration || undefined}
          data-ritual={view.ritual || undefined}
          onClick={() => {
            onSelect?.(view.spell.key)
            if (detailAction.surface) snake.openSurface(detailAction.surface)
          }}
        >
          <span className="u1-character-spells__spell-visual" aria-hidden="true">
            <span
              className="u1-character-spells__spell-icon"
              style={spellCardIconStyle(view)}
            />
            {grimoire && (
              <i
                className="u1-character-spells__prep-mark"
                data-state={view.preparation}
              />
            )}
          </span>

          <span className="u1-character-spells__spell-copy">
            <strong>{view.name}</strong>
            {!compact && (
              <>
                <small className="u1-character-spells__spell-meta">
                  <span className="u1-character-spells__cast-time">
                    {castingTimeLabel(view)}
                  </span>
                  {view.concentration && <em>Концентрация</em>}
                  {view.ritual && <em>Ритуал</em>}
                </small>
              </>
            )}
          </span>
        </button>
      </SnakeTrigger>
    )

    if (compact) return trigger

    const preparationSpellId = mutablePreparationSpellId(view)
    const preparationBusy = preparationSpellId === preparationBusyId
    const mutable = Boolean(preparationSpellId)
    const editable =
      mutable &&
      grimoireMode === "direct" &&
      Boolean(onSetPrepared) &&
      canEditPreparation

    if (grimoire) {
      return (
        <div
          key={view.spell.key}
          className="u1-character-spells__grimoire-entry"
          data-preparation={view.preparation}
        >
          {trigger}
          {mutable && grimoireMode === "direct" ? (
            <button
              type="button"
              className="u1-character-spells__prepare-toggle"
              data-active={view.preparation === "prepared" || undefined}
              data-busy={preparationBusy || undefined}
              disabled={!editable || preparationBusy}
              aria-pressed={view.preparation === "prepared"}
              onClick={() => void setPrepared(view)}
            >
              {preparationBusy
                ? "Сохраняю…"
                : view.preparation === "prepared"
                  ? "Убрать из подготовленных"
                  : "Подготовить"}
            </button>
          ) : (
            <span
              className="u1-character-spells__prepare-fixed"
              data-management-mode={grimoireMode}
              data-current-preparation={view.preparation}
            >
              {fixedPreparationLabel(view, grimoireMode)}
            </span>
          )}
        </div>
      )
    }

    return (
      <div
        key={view.spell.key}
        className="u1-character-spells__spell-entry"
        data-preparation={view.preparation}
      >
        {trigger}
      </div>
    )
  }

  return (
    <div
      className="u1-character-spells"
      ref={rootRef}
      data-class-key={displayClassKey || undefined}
      data-character-level={contract.level}
      data-grimoire-management={grimoireMode}
    >
      {hasSpellSlots && (
        <section
          className="u1-character-spells__slots-panel"
          aria-labelledby="u1-character-spells-slots-title"
        >
          <header className="u1-character-spells__slots-head">
            <strong id="u1-character-spells-slots-title">ЯЧЕЙКИ ЗАКЛИНАНИЙ</strong>
            <span aria-hidden="true" />
            <small data-class-level>
              {classLabels[displayClassKey] || "Заклинатель"} · Ур. {contract.level}
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
                  data-focus-target={expandedLevel === level || undefined}
                  disabled={locked}
                  onClick={() => openCircle(level)}
                  aria-label={
                    locked
                      ? `${level} круг недоступен`
                      : pactAtThisLevel
                        ? `Магия договора: ${slot.current} из ${slot.max} ячеек ${level} круга`
                        : `${level} круг: ${slot.current} из ${slot.max} ячеек`
                  }
                  aria-controls={`u1-character-spells-circle-${level}`}
                >
                  <span className="u1-character-spells__slot-icon-frame">
                    {locked ? (
                      <i className="u1-character-spells__slot-lock" aria-hidden="true" />
                    ) : (
                      <i
                        className="u1-character-spells__class-icon"
                        style={classSpellIconStyle(displayClassKey)}
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
      )}

      {CHARACTER_SHEET_SPELL_GROUP_ORDER.map((level) => {
        const allSpells = views.filter((spell) => spell.level === level)
        const slotPresentation = slotForSpellLevel(level)
        const slot = slotCount(slotPresentation.resource)
        const hasStandardSpellSurface =
          hasSpellSlots || views.some((spell) => isStandardSpellLevel(spell.level))
        const emptyCantrip =
          level === 0 && hasStandardSpellSurface && allSpells.length === 0
        const emptySlotLevel =
          level > 0 &&
          !slotPresentation.pact &&
          slot.max > 0 &&
          allSpells.length === 0

        if (!allSpells.length && !emptyCantrip && !emptySlotLevel) return null

        if (!allSpells.length) {
          const cantrip = level === 0

          return (
            <section
              key={level}
              id={`u1-character-spells-circle-${level}`}
              className="u1-character-spells__circle u1-character-spells-stage2__placeholder"
              data-level={level}
              data-stage2-placeholder={cantrip ? "cantrips" : "spell-level"}
              aria-label={cantrip ? "Заговоры" : `${level} круг`}
            >
              <div className="u1-character-spells__circle-head">
                <span
                  className="u1-character-spells__circle-seal u1-character-spells-stage2__placeholder-seal"
                  style={cantrip ? classSpellIconStyle(displayClassKey) : undefined}
                  data-cantrip={cantrip || undefined}
                  aria-hidden="true"
                >
                  {!cantrip && (roman[level] || level)}
                </span>

                <span className="u1-character-spells__circle-title">
                  <strong>{cantrip ? "Заговоры" : `${level} круг`}</strong>
                  <small>
                    {cantrip
                      ? "Всегда доступны"
                      : `${slot.current}/${slot.max} ячеек`}
                  </small>
                </span>

                <span className="u1-character-spells__circle-count">
                  {spellCountLabel(0)}
                </span>
                <span
                  className="u1-character-spells__circle-caret"
                  aria-hidden="true"
                />
              </div>

              <div className="u1-character-spells__preview-row u1-character-spells-stage2__empty-preview">
                <span>
                  {cantrip
                    ? "Заговоры пока не собраны Character Engine."
                    : "Заклинания этого круга пока не собраны Character Engine."}
                </span>
              </div>
            </section>
          )
        }

        const expanded = expandedLevel === level
        const grimoireOpen = grimoireLevel === level
        const grimoireSpells = grimoireOpen
          ? filteredGrimoireSpells(allSpells)
          : allSpells
        const levelHasPreparation =
          (preparationManagedByRest &&
            allSpells.some((view) => view.preparation !== "not_required")) ||
          (grimoireMode === "direct" &&
            allSpells.some((view) => mutablePreparationSpellId(view) !== null))
        const schoolOptions = [...new Set(
          allSpells.map((view) => view.school).filter(Boolean),
        )].sort((left, right) =>
          schoolLabel(left).localeCompare(schoolLabel(right), "ru"),
        )
        const grimoireContext =
          grimoireMode === "spellbook"
            ? "Книга заклинаний · подготовка меняется после долгого отдыха через чат"
            : grimoireMode === "long_rest"
              ? "Подготовка меняется после долгого отдыха через чат"
              : grimoireMode === "pact_magic"
                ? slotPresentation.pact && slot.max > 0
                  ? `Магия договора · ${slot.current}/${slot.max} · ячейка ${roman[slotPresentation.castLevel] || slotPresentation.castLevel} круга`
                  : "Магия договора · выбранные заклинания"
                : grimoireMode === "level_choice"
                  ? "Список меняется при развитии персонажа"
                  : "Подготовку доступных заклинаний можно менять здесь"
        const preview = allSpells.slice(0, 3)
        const remaining = Math.max(0, allSpells.length - preview.length)

        return (
          <section
            key={level}
            id={`u1-character-spells-circle-${level}`}
            className="u1-character-spells__circle"
            data-level={level}
            data-expanded={expanded || undefined}
            data-grimoire={grimoireOpen || undefined}
            data-focus-target={level === focusLevel || undefined}
          >
            <button
              type="button"
              className="u1-character-spells__circle-head"
              onClick={() => {
                if (expanded) {
                  setExpandedLevel(null)
                  setGrimoireLevel(null)
                  setPreparationError("")
                  return
                }
                openCircle(level)
              }}
              aria-expanded={expanded}
              aria-controls={`u1-character-spells-content-${level}`}
            >
              <span
                className="u1-character-spells__circle-seal"
                style={level === 0 ? classSpellIconStyle(displayClassKey) : undefined}
                data-cantrip={level === 0 || undefined}
                aria-hidden="true"
              >
                {level > 0 && (roman[level] || level)}
              </span>

              <span className="u1-character-spells__circle-title">
                <strong>{levelTitle(level)}</strong>
                <small>
                  {level === 0
                    ? "Всегда доступны"
                    : slot.max > 0
                      ? slotPresentation.pact
                        ? `${slot.current}/${slot.max} Магия договора · ${roman[slotPresentation.castLevel] || slotPresentation.castLevel} круг`
                        : `${slot.current}/${slot.max} ячеек`
                      : "Без доступных ячеек"}
                </small>
              </span>

              <span className="u1-character-spells__circle-count">
                {spellCountLabel(allSpells.length)}
              </span>
              <span className="u1-character-spells__circle-caret" aria-hidden="true" />
            </button>

            {expanded ? (
              grimoireOpen ? (
                <div
                  className="u1-character-spells__grimoire-panel"
                  id={`u1-character-spells-content-${level}`}
                  data-grimoire-level={level}
                  data-management-mode={grimoireMode}
                >
                  <header className="u1-character-spells__grimoire-head">
                    <span className="u1-character-spells__grimoire-title">
                      <strong>Гримуар · {levelTitle(level)}</strong>
                      <small>
                        {grimoireSpells.length} из {allSpells.length}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="u1-character-spells__grimoire-close"
                      onClick={() => {
                        setGrimoireLevel(null)
                        setPreparationError("")
                        resetGrimoireFilters()
                      }}
                      aria-label="Закрыть гримуар"
                    >
                      <span aria-hidden="true" />
                    </button>
                  </header>

                  <div
                    className="u1-character-spells__grimoire-context"
                    data-mode={grimoireMode}
                  >
                    {grimoireContext}
                  </div>

                  <div className="u1-character-spells__grimoire-filters">
                    {levelHasPreparation && (
                      <button
                        type="button"
                        data-active={preparedOnly || undefined}
                        onClick={() => setPreparedOnly((value) => !value)}
                      >
                        Подготовлены
                      </button>
                    )}
                    <button
                      type="button"
                      data-active={concentrationOnly || undefined}
                      onClick={() => setConcentrationOnly((value) => !value)}
                    >
                      Концентрация
                    </button>
                    <button
                      type="button"
                      data-active={ritualOnly || undefined}
                      onClick={() => setRitualOnly((value) => !value)}
                    >
                      Ритуал
                    </button>
                    <label>
                      <span>Школа</span>
                      <select
                        value={school}
                        onChange={(event) => setSchool(event.target.value)}
                      >
                        <option value="all">Все</option>
                        {schoolOptions.map((value) => (
                          <option key={value} value={value}>
                            {schoolLabel(value)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="u1-character-spells__grimoire-reset"
                      onClick={resetGrimoireFilters}
                    >
                      Сбросить
                    </button>
                  </div>

                  {preparationError && (
                    <div
                      className="u1-character-spells__grimoire-error"
                      role="status"
                    >
                      {preparationError}
                    </div>
                  )}

                  <div className="u1-character-spells__grimoire-list">
                    {grimoireSpells.length ? (
                      grimoireSpells.map((view) => renderSpell(view, false, true))
                    ) : (
                      <div className="u1-character-spells__grimoire-empty">
                        Под эти фильтры ничего не попало.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="u1-character-spells__expanded-grid"
                  id={`u1-character-spells-content-${level}`}
                >
                  {allSpells.map((view) => renderSpell(view))}
                  <button
                    type="button"
                    className="u1-character-spells__grimoire-open"
                    onClick={() => openGrimoire(level)}
                  >
                    <span className="u1-character-spells__grimoire-book" aria-hidden="true" />
                    <span>
                      <strong>Открыть в гримуаре</strong>
                      <small>{grimoireOpenHint(grimoireMode)}</small>
                    </span>
                  </button>
                </div>
              )
            ) : (
              <div
                className="u1-character-spells__preview-row"
                id={`u1-character-spells-content-${level}`}
                data-has-more={remaining > 0 || undefined}
              >
                {preview.map((view) => renderSpell(view, true))}
                {remaining > 0 && (
                  <button
                    type="button"
                    className="u1-character-spells__more"
                    onClick={() => {
                      setExpandedLevel(level)
                      setGrimoireLevel(null)
                    }}
                    aria-label={`Показать ещё ${remaining}`}
                  >
                    +{remaining}
                  </button>
                )}
              </div>
            )}
          </section>
        )
      })}

      {views.some((spell) => !isStandardSpellLevel(spell.level)) && (
        <section className="u1-character-spells__unknown-levels">
          {views
            .filter((spell) => !isStandardSpellLevel(spell.level))
            .map((spell) => `${spell.name} · уровень ${spell.level}`)
            .join(" · ")}
        </section>
      )}
    </div>
  )
}
