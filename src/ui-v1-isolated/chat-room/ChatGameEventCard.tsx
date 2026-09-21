import { useEffect, useMemo, useState } from "react"

import { supabase } from "../../lib/supabase"
import DiceGlyph from "./DiceGlyph"
import type { UiChatEvent, UiChatEventType } from "./chatEventModel"
import {
  presentGameEvent,
  type GameCardPresentation,
  type GameCardRoll,
} from "./chatGameEventPresentation"

function formatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function signedRollValue(value: number) {
  if (value > 0) return "+" + value
  return String(value)
}

function StructuredRollSummary({ roll }: { roll: GameCardRoll }) {
  const rawValuesLabel = roll.values.join(" · ")
  const modifierLabel =
    roll.modifier === null ? null : signedRollValue(roll.modifier)
  const totalLabel = roll.total === null ? "—" : String(roll.total)
  const density =
    roll.values.length <= 1 ? "single" :
    roll.values.length <= 4 ? "group" :
    "dense"

  return (
    <section
      className="u1-room-roll-stage4"
      data-roll-model-stage="3"
      data-roll-visual-stage="4"
      data-die-sides={roll.sides}
      data-dice-count={roll.count}
      data-dice-density={density}
      aria-label={rawValuesLabel ? `Чистые кости: ${rawValuesLabel}` : roll.formula}
    >
      <div className="u1-room-roll-stage4__summary">
        <span className="u1-room-roll-stage4__formula">{roll.formula}</span>

        <div className="u1-room-roll-stage4__math">
          {modifierLabel !== null ? (
            <>
              <div className="u1-room-roll-stage4__modifier">
                <span>Модификатор</span>
                <strong>{modifierLabel}</strong>
              </div>
              <span className="u1-room-roll-stage4__equals" aria-hidden="true">→</span>
            </>
          ) : null}

          <div className="u1-room-roll-stage4__total">
            <span>Итого</span>
            <strong>{totalLabel}</strong>
          </div>
        </div>
      </div>

      <div className="u1-room-roll-stage4__dice" aria-label="Чистый результат кубиков">
        {roll.values.length ? (
          roll.values.map((value, index) => (
            <DiceGlyph
              key={index + ":" + value}
              sides={roll.sides}
              value={value}
            />
          ))
        ) : (
          <span className="u1-room-roll-stage4__missing">—</span>
        )}
      </div>
    </section>
  )
}

function GameIcon({ type }: { type: UiChatEventType }) {
  if (type === "roll") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2.7 7.3 4.2v8.2L12 21.3l-7.3-6.2V6.9L12 2.7Z" />
        <path d="m4.7 6.9 7.3 4.3 7.3-4.3M12 11.2v10.1" />
        <path d="m8.2 5 3.8 6.2L15.8 5" />
      </svg>
    )
  }

  if (type === "spell") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 4.2c3.2-1 5.7-.4 7.5 1.6v14c-1.8-2-4.3-2.6-7.5-1.6v-14Z" />
        <path d="M19.5 4.2c-3.2-1-5.7-.4-7.5 1.6v14c1.8-2 4.3-2.6 7.5-1.6v-14Z" />
        <path d="m16.4 8.2.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6.6-1.3Z" />
      </svg>
    )
  }

  if (type === "attack") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 19 4-4M8 16l8.8-8.8 2 2L10 18l-2-2Z" />
        <path d="m15.7 5.9 2.5-2.5 2.4 2.4-2.5 2.5M4 20h5" />
      </svg>
    )
  }

  if (type === "item") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8.5V6.8A5 5 0 0 1 12 2a5 5 0 0 1 5 4.8v1.7" />
        <path d="M4.5 8.5h15l-1 12h-13l-1-12Z" />
        <path d="M9 12h6" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8 15 9l6.2 3-6.2 3-3 6.2L9 15l-6.2-3L9 9l3-6.2Z" />
      <circle cx="12" cy="12" r="2.1" />
    </svg>
  )
}

type DetailMeta = {
  label: string
  value: string
}

type DetailState = {
  loading: boolean
  description: string | null
  meta: DetailMeta[]
  error: string | null
}

type SpellCatalogRow = {
  name_ru: string | null
  spell_level: number | null
  school: string | null
  casting_time: string | null
  spell_range: string | null
  duration: string | null
  components: string[] | null
  concentration: boolean | null
  ritual: boolean | null
  effect_summary: string | null
  rules_text: string | null
  author_description: string | null
}

type TemplateAssignmentRow = {
  template_id: string
  template_level: number
}

type TemplateLevelRow = {
  template_id: string
  level: number
  mechanics: unknown
}

type TemplateRow = {
  id: string
  mechanics: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function collectRecords(value: unknown, output: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, output)
    return output
  }
  if (!isRecord(value)) return output

  output.push(value)
  for (const nested of Object.values(value)) {
    if (Array.isArray(nested) || isRecord(nested)) collectRecords(nested, output)
  }
  return output
}

function payloadDescription(event: UiChatEvent) {
  const payload = isRecord(event.game?.payload) ? event.game!.payload! : null
  if (!payload) return null

  const direct = readString(payload, "description", "rulesText", "rules_text")
  if (direct) return direct

  const ability = isRecord(payload.ability) ? payload.ability : null
  return ability
    ? readString(ability, "description", "rulesText", "rules_text")
    : null
}

function payloadString(event: UiChatEvent, ...keys: string[]) {
  const payload = isRecord(event.game?.payload) ? event.game!.payload! : null
  return payload ? readString(payload, ...keys) : null
}

function spellSlug(event: UiChatEvent) {
  const key = payloadString(event, "spellKey", "spell_key")
  if (!key) return null
  return key.replace(/^spell:/u, "").trim() || null
}

async function loadSpellDetail(
  event: UiChatEvent,
  presentation: GameCardPresentation,
): Promise<Pick<DetailState, "description" | "meta">> {
  const slug = spellSlug(event)
  const fields =
    "name_ru, spell_level, school, casting_time, spell_range, duration, components, concentration, ritual, effect_summary, rules_text, author_description"

  let row: SpellCatalogRow | null = null

  if (slug) {
    const bySlug = await supabase
      .from("spell_catalog")
      .select(fields)
      .eq("slug", slug)
      .maybeSingle()

    if (!bySlug.error) row = (bySlug.data as SpellCatalogRow | null) || null
  }

  if (!row) {
    const byName = await supabase
      .from("spell_catalog")
      .select(fields)
      .eq("name_ru", presentation.title)
      .limit(1)
      .maybeSingle()

    if (!byName.error) row = (byName.data as SpellCatalogRow | null) || null
  }

  if (!row) {
    const legacy = event.author.characterId
      ? await supabase
          .from("character_spells")
          .select(
            "spell_level, school, casting_time, spell_range, duration, components, concentration, ritual, description",
          )
          .eq("character_id", event.author.characterId)
          .eq("name", presentation.title)
          .limit(1)
          .maybeSingle()
      : null

    const data = legacy?.data as
      | {
          spell_level: number | null
          school: string | null
          casting_time: string | null
          spell_range: string | null
          duration: string | null
          components: string | null
          concentration: boolean | null
          ritual: boolean | null
          description: string | null
        }
      | null
      | undefined

    return {
      description: data?.description || payloadDescription(event),
      meta: [
        ...(data?.casting_time
          ? [{ label: "Сотворение", value: data.casting_time }]
          : []),
        ...(data?.spell_range
          ? [{ label: "Дистанция", value: data.spell_range }]
          : []),
        ...(data?.duration
          ? [{ label: "Длительность", value: data.duration }]
          : []),
        ...(data?.components
          ? [{ label: "Компоненты", value: data.components }]
          : []),
      ],
    }
  }

  return {
    description:
      row.rules_text ||
      row.author_description ||
      row.effect_summary ||
      payloadDescription(event),
    meta: [
      ...(row.casting_time
        ? [{ label: "Сотворение", value: row.casting_time }]
        : []),
      ...(row.spell_range
        ? [{ label: "Дистанция", value: row.spell_range }]
        : []),
      ...(row.duration
        ? [{ label: "Длительность", value: row.duration }]
        : []),
      ...(row.components?.length
        ? [{ label: "Компоненты", value: row.components.join(", ") }]
        : []),
      ...(row.concentration
        ? [{ label: "Концентрация", value: "Да" }]
        : []),
      ...(row.ritual ? [{ label: "Ритуал", value: "Да" }] : []),
    ],
  }
}

async function loadAbilityDetail(
  event: UiChatEvent,
): Promise<Pick<DetailState, "description" | "meta">> {
  const embedded = payloadDescription(event)
  if (embedded) return { description: embedded, meta: [] }

  const characterId = event.author.characterId
  const mechanicId = payloadString(
    event,
    "templateMechanicId",
    "template_mechanic_id",
    "mechanicId",
    "mechanic_id",
  )

  if (!characterId || !mechanicId) {
    return {
      description: null,
      meta: [],
    }
  }

  const assignmentsResult = await supabase
    .from("character_template_assignments")
    .select("template_id, template_level")
    .eq("character_id", characterId)

  if (assignmentsResult.error) throw assignmentsResult.error

  const assignments =
    (assignmentsResult.data || []) as TemplateAssignmentRow[]
  const templateIds = [...new Set(assignments.map((item) => item.template_id))]
  if (!templateIds.length) return { description: null, meta: [] }

  const [levelsResult, templatesResult] = await Promise.all([
    supabase
      .from("rule_template_levels")
      .select("template_id, level, mechanics")
      .in("template_id", templateIds),
    supabase
      .from("rule_templates")
      .select("id, mechanics")
      .in("id", templateIds),
  ])

  if (levelsResult.error) throw levelsResult.error
  if (templatesResult.error) throw templatesResult.error

  const maxByTemplate = new Map(
    assignments.map((item) => [item.template_id, item.template_level]),
  )
  const levelRows = ((levelsResult.data || []) as TemplateLevelRow[]).filter(
    (row) => row.level <= (maxByTemplate.get(row.template_id) || 0),
  )
  const templateRows = (templatesResult.data || []) as TemplateRow[]

  const records = [
    ...levelRows.flatMap((row) => collectRecords(row.mechanics)),
    ...templateRows.flatMap((row) => collectRecords(row.mechanics)),
  ]

  const direct = records.find((record) => readString(record, "id") === mechanicId)
  if (!direct) return { description: null, meta: [] }

  const directPayload = isRecord(direct.payload) ? direct.payload : null
  const directDescription =
    readString(direct, "description") ||
    (directPayload
      ? readString(directPayload, "description", "rulesText", "rules_text")
      : null)

  if (directDescription) {
    return { description: directDescription, meta: [] }
  }

  const sourceKey = readString(direct, "sourceKey", "source_key")
  const sourceDescription = sourceKey
    ? records
        .filter(
          (record) =>
            readString(record, "sourceKey", "source_key") === sourceKey,
        )
        .map((record) => {
          const payload = isRecord(record.payload) ? record.payload : null
          return payload
            ? readString(payload, "description", "rulesText", "rules_text")
            : null
        })
        .find((value): value is string => Boolean(value))
    : null

  const presentation = isRecord(direct.presentation)
    ? direct.presentation
    : null
  const fallback =
    presentation
      ? readString(
          presentation,
          "authorExplanation",
          "author_explanation",
          "summary",
        )
      : null

  return {
    description: sourceDescription || fallback || null,
    meta: [],
  }
}

async function loadDetail(
  event: UiChatEvent,
  presentation: GameCardPresentation,
): Promise<Pick<DetailState, "description" | "meta">> {
  if (event.type === "spell") return loadSpellDetail(event, presentation)
  if (event.type === "class_ability") return loadAbilityDetail(event)

  return {
    description: payloadDescription(event) || event.game?.detail || null,
    meta: [],
  }
}

function GameEventDetails({
  event,
  presentation,
  onClose,
}: {
  event: UiChatEvent
  presentation: GameCardPresentation
  onClose: () => void
}) {
  const [state, setState] = useState<DetailState>({
    loading: true,
    description: payloadDescription(event),
    meta: [],
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    void loadDetail(event, presentation)
      .then((result) => {
        if (cancelled) return
        setState({
          loading: false,
          description: result.description,
          meta: result.meta,
          error: null,
        })
      })
      .catch((reason) => {
        if (cancelled) return
        setState((current) => ({
          ...current,
          loading: false,
          error:
            reason instanceof Error
              ? reason.message
              : "Подробности не загрузились.",
        }))
      })

    return () => {
      cancelled = true
    }
  }, [event, presentation])

  return (
    <div
      className="u1-room-game-detail-backdrop"
      onPointerDown={onClose}
    >
      <section
        className="u1-room-game-detail"
        role="dialog"
        aria-modal="true"
        aria-label={presentation.title}
        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
      >
        <header>
          <div>
            <span>{presentation.eyebrow}</span>
            <strong>{presentation.title}</strong>
            {presentation.subtitle ? <small>{presentation.subtitle}</small> : null}
          </div>
          <button type="button" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="u1-room-game-detail__body">
          {state.meta.length ? (
            <div className="u1-room-game-detail__meta">
              {state.meta.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {state.loading && !state.description ? (
            <div className="u1-room-game-detail__loading">
              <i aria-hidden="true" />
              <span>Загружаю описание…</span>
            </div>
          ) : null}

          {state.description ? (
            <p className="u1-room-game-detail__description">
              {state.description}
            </p>
          ) : !state.loading ? (
            <p className="u1-room-game-detail__empty">
              Для этого старого события подробное описание не было сохранено.
              Механика и тип действия показаны выше.
            </p>
          ) : null}

          {state.error ? (
            <small className="u1-room-game-detail__error">
              Не удалось обновить подробности. Показываю сохранённые данные.
            </small>
          ) : null}

          <footer>
            <span>{event.author.name}</span>
            <time>{formatMessageTime(event.createdAt)}</time>
          </footer>
        </div>
      </section>
    </div>
  )
}

export default function ChatGameEventCard({ event }: { event: UiChatEvent }) {
  const presentation = useMemo(() => presentGameEvent(event), [event])
  const [open, setOpen] = useState(false)
  const inspectable = event.type !== "roll"

  return (
    <>
      <article
        className="u1-room-game-card"
        data-event-type={event.type}
        data-inspectable={inspectable || undefined}
        aria-label={presentation.eyebrow}
        role={inspectable ? "button" : undefined}
        tabIndex={inspectable ? 0 : undefined}
        onClick={inspectable ? () => setOpen(true) : undefined}
        onKeyDown={
          inspectable
            ? (keyboardEvent) => {
                if (
                  keyboardEvent.key === "Enter" ||
                  keyboardEvent.key === " "
                ) {
                  keyboardEvent.preventDefault()
                  setOpen(true)
                }
              }
            : undefined
        }
      >
        <header className="u1-room-game-card__header">
          <span className="u1-room-game-card__icon" aria-hidden="true">
            <GameIcon type={event.type} />
          </span>
          <span className="u1-room-game-card__eyebrow">
            {presentation.eyebrow}
          </span>
          <time>{formatMessageTime(event.createdAt)}</time>
        </header>

        <div className="u1-room-game-card__content">
          <div className="u1-room-game-card__title">
            <strong>{presentation.title}</strong>
            {presentation.subtitle ? <small>{presentation.subtitle}</small> : null}
          </div>

          {presentation.roll ? (
            <StructuredRollSummary roll={presentation.roll} />
          ) : null}

          {presentation.chips.length ? (
            <div className="u1-room-game-card__chips">
              {presentation.chips.map((chip) => <span key={chip}>{chip}</span>)}
            </div>
          ) : null}

          {presentation.stats.length ? (
            <div
              className="u1-room-game-card__stats"
              data-stat-count={presentation.stats.length}
            >
              {presentation.stats.map((stat) => (
                <div
                  key={stat.label}
                  data-emphasis={stat.emphasis || undefined}
                >
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {presentation.resources.length ? (
            <div className="u1-room-game-card__resources">
              {presentation.resources.map((resource, index) => (
                <div key={resource.label + ":" + index}>
                  <span>{resource.label}</span>
                  <strong>
                    {resource.amount !== null ? "−" + resource.amount : "Расход"}
                  </strong>
                  {resource.current !== null && resource.max !== null ? (
                    <small>Состояние {resource.current} / {resource.max}</small>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {presentation.note ? (
            <p className="u1-room-game-card__note">{presentation.note}</p>
          ) : null}

          <footer className="u1-room-game-card__footer">
            <span>{event.author.name}</span>
            {inspectable ? <small>Нажмите для описания</small> : null}
            {event.editedAt ? <small>изменено</small> : null}
          </footer>
        </div>
      </article>

      {open ? (
        <GameEventDetails
          event={event}
          presentation={presentation}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
