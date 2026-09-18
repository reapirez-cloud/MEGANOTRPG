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
  ResolvedSpellResourceOption,
} from "../character-engine/index.ts"
import { spendResolvedClassSpellOption } from "../lib/classResourceRuntime.ts"
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
import "./character-sheet-spell-casting.css"

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

type CastChoice = {
  id: string
  methodKind: string
  castLevel: number
  option: ResolvedSpellResourceOption | null
  available: boolean
}

type CastFeedback = {
  spellKey: string
  kind: "success" | "error"
  text: string
}

const preparationLabels: Record<PreparationState, string> = {
  always_prepared: "Всегда подготовлено",
  prepared: "Подготовлено",
  unprepared: "Не подготовлено",
  not_required: "Без подготовки",
}

const preparationShortLabels: Record<PreparationState, string> = {
  always_prepared: "Всегда",
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

function castingTimeLabel(view: SpellView) {
  return (
    view.catalog?.casting_time?.trim() ||
    view.legacy?.casting_time?.trim() ||
    schoolLabel(view.school)
  )
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

function castMethodLabel(kind: string) {
  const normalized = kind.trim().toLocaleLowerCase("ru-RU")
  if (normalized.includes("ritual") || normalized.includes("ритуал")) return "Ритуал"
  if (normalized.includes("pact")) return "Магия договора"
  if (normalized.includes("item")) return "Предмет"
  return "Наложение"
}

function resourceLabel(stateKey: string, castLevel: number) {
  const slot = stateKey.match(/^spell_slot_([1-9])$/)
  if (slot) {
    const level = Number(slot[1])
    return `${roman[level] || level} круг`
  }
  if (stateKey === "warlock_pact_slots") {
    return `Магия договора · ${roman[castLevel] || castLevel} круг`
  }
  if (stateKey.startsWith("mystic_arcanum")) {
    return `Мистический аркан · ${roman[castLevel] || castLevel} круг`
  }
  return stateKey
    .replace(/::/g, " · ")
    .replace(/[_-]+/g, " ")
}

function castChoiceLabel(choice: CastChoice) {
  if (!choice.option) return `${castMethodLabel(choice.methodKind)} · без расхода`

  const costs = choice.option.costs.map((cost) => {
    const pool = `${Math.max(0, Math.round(cost.current))}/${Math.max(0, Math.round(cost.max))}`
    return `${resourceLabel(cost.stateKey, choice.castLevel)} · ${pool}`
  })

  return costs.join(" + ")
}

function resolvedCastChoices(view: SpellView): CastChoice[] {
  const bySignature = new Map<string, CastChoice>()

  for (const access of view.spell.accesses) {
    for (const method of access.methods) {
      if (!method.resourceOptions.length) {
        const signature = `free:${method.kind}`
        const choice: CastChoice = {
          id: `${view.spell.key}:${access.key}:${method.key}:free`,
          methodKind: method.kind,
          castLevel: view.level,
          option: null,
          available: method.available,
        }
        const current = bySignature.get(signature)
        if (!current || (!current.available && choice.available)) {
          bySignature.set(signature, choice)
        }
        continue
      }

      for (const option of method.resourceOptions) {
        const costSignature = option.costs
          .map((cost) => `${cost.stateKey}:${cost.amount}`)
          .sort()
          .join("|")
        const signature = `${option.castLevel}:${costSignature}`
        const choice: CastChoice = {
          id: `${view.spell.key}:${access.key}:${method.key}:${option.key}`,
          methodKind: method.kind,
          castLevel: option.castLevel,
          option,
          available: method.available && option.available,
        }
        const current = bySignature.get(signature)
        if (!current || (!current.available && choice.available)) {
          bySignature.set(signature, choice)
        }
      }
    }
  }

  return [...bySignature.values()].sort((left, right) =>
    left.castLevel - right.castLevel ||
    Number(Boolean(left.option)) - Number(Boolean(right.option)) ||
    castChoiceLabel(left).localeCompare(castChoiceLabel(right), "ru"),
  )
}

export default function CharacterSheetSpells({
  characterId,
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
  const [sheetClassKey, setSheetClassKey] = useState("")
  const [expandedLevel, setExpandedLevel] = useState<number | null>(() =>
    typeof focusLevel === "number" && focusLevel >= 0 && focusLevel <= 9
      ? focusLevel
      : null,
  )
  const [grimoireLevel, setGrimoireLevel] = useState<number | null>(null)
  const [preparedOnly, setPreparedOnly] = useState(false)
  const [concentrationOnly, setConcentrationOnly] = useState(false)
  const [ritualOnly, setRitualOnly] = useState(false)
  const [school, setSchool] = useState("all")
  const [preparationBusyId, setPreparationBusyId] = useState<string | null>(null)
  const [preparationError, setPreparationError] = useState("")
  const [castPickerKey, setCastPickerKey] = useState<string | null>(null)
  const [castBusyKey, setCastBusyKey] = useState<string | null>(null)
  const [castFeedback, setCastFeedback] = useState<CastFeedback | null>(null)
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

  const schoolOptions = useMemo(
    () =>
      [...new Set(views.map((view) => view.school).filter(Boolean))]
        .sort((left, right) =>
          schoolLabel(left).localeCompare(schoolLabel(right), "ru"),
        ),
    [views],
  )

  useEffect(() => {
    if (!contract) return
    const sheet = rootRef.current?.closest<HTMLElement>(".u1-character-sheet")
    setSheetClassKey(sheet?.dataset.classKey || "")
  }, [characterId, contract])

  useEffect(() => {
    if (!views.length) {
      setExpandedLevel(null)
      setGrimoireLevel(null)
      setCastPickerKey(null)
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
    setCastPickerKey(null)
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
    setExpandedLevel(level)
    setGrimoireLevel(level)
    setPreparationError("")
    setCastPickerKey(null)
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

  const castSpell = async (view: SpellView, choice: CastChoice) => {
    if (!contract || !canEditPreparation || !choice.available) return

    setCastBusyKey(choice.id)
    setCastFeedback(null)

    try {
      if (choice.option) {
        const result = await spendResolvedClassSpellOption(
          characterId,
          contract,
          choice.option,
        )
        if (!result.ok) {
          setCastFeedback({
            spellKey: view.spell.key,
            kind: "error",
            text: result.error || "Не удалось списать ресурс заклинания.",
          })
          return
        }
      }

      setCastPickerKey(null)
      setCastFeedback({
        spellKey: view.spell.key,
        kind: "success",
        text: choice.option
          ? `Наложено · ${castChoiceLabel(choice)}`
          : "Наложено · без расхода ресурса",
      })
    } catch (reason) {
      setCastFeedback({
        spellKey: view.spell.key,
        kind: "error",
        text: reason instanceof Error && reason.message
          ? reason.message
          : "Не удалось наложить заклинание.",
      })
    } finally {
      setCastBusyKey((current) => current === choice.id ? null : current)
    }
  }

  useEffect(() => {
    if (!focusSpellKey) return
    const focused = views.find((view) => view.spell.key === focusSpellKey)
    if (focused && isStandardSpellLevel(focused.level)) {
      setExpandedLevel(focused.level)
      setGrimoireLevel(null)
      setCastPickerKey(null)
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
    setCastPickerKey(null)
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

  const renderCastControls = (view: SpellView) => {
    const choices = resolvedCastChoices(view)
    const availableChoices = choices.filter((choice) => choice.available)
    const pickerOpen = castPickerKey === view.spell.key
    const busy = castBusyKey !== null && choices.some((choice) => choice.id === castBusyKey)
    const feedback = castFeedback?.spellKey === view.spell.key ? castFeedback : null

    let disabledReason = ""
    if (!canEditPreparation) {
      disabledReason = "Только для управляемого персонажа"
    } else if (!choices.length) {
      disabledReason = "Нет способа наложения"
    } else if (!availableChoices.length) {
      disabledReason = view.preparation === "unprepared"
        ? "Не подготовлено"
        : "Нет доступного ресурса"
    }

    const primaryLabel = busy
      ? "Накладываю…"
      : disabledReason || (availableChoices.length > 1 ? "Выбрать расход" : "Наложить")

    return (
      <div
        className="u1-character-spells__cast"
        data-picker={pickerOpen || undefined}
        data-disabled={Boolean(disabledReason) || undefined}
      >
        <button
          type="button"
          className="u1-character-spells__cast-primary"
          disabled={Boolean(disabledReason) || busy}
          onClick={() => {
            if (availableChoices.length === 1) {
              void castSpell(view, availableChoices[0]!)
              return
            }
            setCastFeedback(null)
            setCastPickerKey((current) =>
              current === view.spell.key ? null : view.spell.key,
            )
          }}
        >
          <span className="u1-character-spells__cast-glyph" aria-hidden="true" />
          <span>{primaryLabel}</span>
        </button>

        {pickerOpen && choices.length > 1 && (
          <div className="u1-character-spells__cast-options">
            {choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                data-pact={
                  choice.option?.costs.some(
                    (cost) => cost.stateKey === "warlock_pact_slots",
                  ) || undefined
                }
                disabled={!choice.available || castBusyKey !== null}
                onClick={() => void castSpell(view, choice)}
              >
                <strong>
                  {choice.castLevel > 0
                    ? `${roman[choice.castLevel] || choice.castLevel} круг`
                    : castMethodLabel(choice.methodKind)}
                </strong>
                <small>{castChoiceLabel(choice)}</small>
              </button>
            ))}
          </div>
        )}

        {feedback && (
          <div
            className="u1-character-spells__cast-feedback"
            data-kind={feedback.kind}
            role="status"
          >
            {feedback.text}
          </div>
        )}
      </div>
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
          data-preparation={view.preparation}
          data-school={normalizeSpellSchool(view.school) || undefined}
          data-concentration={view.concentration || undefined}
          data-ritual={view.ritual || undefined}
          data-unavailable={!view.spell.available || undefined}
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
            <i
              className="u1-character-spells__prep-mark"
              data-state={view.preparation}
            />
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
                <span
                  className="u1-character-spells__preparation"
                  data-state={view.preparation}
                >
                  {preparationShortLabels[view.preparation]}
                </span>
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
    const editable = mutable && Boolean(onSetPrepared) && canEditPreparation

    if (grimoire) {
      return (
        <div
          key={view.spell.key}
          className="u1-character-spells__grimoire-entry"
          data-preparation={view.preparation}
        >
          {trigger}
          {renderCastControls(view)}
          {mutable ? (
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
            <span className="u1-character-spells__prepare-fixed">
              {view.preparation === "always_prepared"
                ? "Всегда подготовлено"
                : view.preparation === "not_required"
                  ? "Подготовка не требуется"
                  : "Управляется источником"}
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
        {renderCastControls(view)}
      </div>
    )
  }

  return (
    <div className="u1-character-spells" ref={rootRef}>
      {hasSpellSlots && (
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
      )}

      {views.length === 0 && (
        <section className="u1-character-spells__empty-book">
          <strong>Книга заклинаний пока пуста</strong>
          <span>
            Ячейки уже собраны Character Engine, но доступных заклинаний у персонажа нет.
          </span>
        </section>
      )}

      {CHARACTER_SHEET_SPELL_GROUP_ORDER.map((level) => {
        const allSpells = views.filter((spell) => spell.level === level)
        if (!allSpells.length) return null

        const expanded = expandedLevel === level
        const grimoireOpen = grimoireLevel === level
        const grimoireSpells = grimoireOpen
          ? filteredGrimoireSpells(allSpells)
          : allSpells
        const levelHasPreparation = allSpells.some(
          (view) => mutablePreparationSpellId(view) !== null,
        )
        const slotPresentation = slotForSpellLevel(level)
        const slot = slotCount(slotPresentation.resource)
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
                setExpandedLevel(level)
                if (grimoireLevel !== level) setGrimoireLevel(null)
                setCastPickerKey(null)
              }}
              aria-expanded={expanded}
              aria-controls={`u1-character-spells-content-${level}`}
            >
              <span
                className="u1-character-spells__circle-seal"
                style={level === 0 ? classSpellIconStyle(sheetClassKey) : undefined}
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
                {allSpells.length} заклинаний
              </span>
              <span className="u1-character-spells__circle-caret" aria-hidden="true" />
            </button>

            {expanded ? (
              grimoireOpen ? (
                <div
                  className="u1-character-spells__grimoire-panel"
                  id={`u1-character-spells-content-${level}`}
                  data-grimoire-level={level}
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
                        setCastPickerKey(null)
                      }}
                      aria-label="Закрыть гримуар"
                    >
                      <span aria-hidden="true" />
                    </button>
                  </header>

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
                      <small>Все заклинания круга, фильтры и подготовка</small>
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
                      setCastPickerKey(null)
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
