import { useEffect, useMemo, useState } from "react"

import { warlockInvocationsReference } from "../../data/classes/warlockInvocationsReference"
import { supabase } from "../../lib/supabase"

type InvocationView = {
  id: string
  slug: string
  level: number
  name: string
  nameEn: string
  summary: string
  rulesText: string
  repeatable: boolean
  requiredInvocations: string[]
}

type DefinitionRow = {
  id: string
  slug: string
  current_revision: number
}

type RevisionRow = {
  definition_id: string
  revision: number
  name: string
  summary: string | null
  rules_text: string | null
  data: Record<string, unknown> | null
}

function fallbackInvocations(): InvocationView[] {
  return warlockInvocationsReference.map((entry, index) => {
    const original = entry.details
      .find((item) => item.startsWith("Оригинальное название:"))
      ?.replace(/^Оригинальное название:\s*/u, "")
      .replace(/\.$/u, "") || ""

    return {
      id: `fallback:${index}`,
      slug: `fallback-${index}`,
      level: entry.level,
      name: entry.name.replace(/^Воззвание:\s*/u, ""),
      nameEn: original,
      summary: entry.mechanics,
      rulesText: [entry.mechanics, ...entry.details.filter((item) => !item.startsWith("Оригинальное название:"))]
        .filter(Boolean)
        .join("\n\n"),
      repeatable: entry.details.some((item) => /повтор/u.test(item)),
      requiredInvocations: [],
    }
  })
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

export default function WarlockInvocationsReference() {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<InvocationView[]>(() => fallbackInvocations())
  const [selected, setSelected] = useState<InvocationView | null>(null)
  const [loading, setLoading] = useState(true)
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU")

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      const definitions = await supabase
        .from("reference_definitions")
        .select("id, slug, current_revision")
        .eq("kind", "feature")
        .eq("scope", "system")
        .eq("status", "active")
        .order("slug", { ascending: true })

      if (cancelled) return
      if (definitions.error || !definitions.data?.length) {
        setLoading(false)
        return
      }

      const defs = definitions.data as unknown as DefinitionRow[]
      const ids = defs.map((item) => item.id)
      const revisions = await supabase
        .from("reference_definition_revisions")
        .select("definition_id, revision, name, summary, rules_text, data")
        .in("definition_id", ids)

      if (cancelled) return
      if (revisions.error) {
        setLoading(false)
        return
      }

      const revisionByDefinition = new Map(
        ((revisions.data || []) as unknown as RevisionRow[])
          .filter((revision) => {
            const definition = defs.find((item) => item.id === revision.definition_id)
            return definition?.current_revision === revision.revision
          })
          .map((revision) => [revision.definition_id, revision]),
      )

      const next = defs.flatMap((definition): InvocationView[] => {
        const revision = revisionByDefinition.get(definition.id)
        if (!revision) return []

        const data = revision.data || {}
        if (data.feature_kind !== "eldritch_invocation" || data.class_key !== "warlock") {
          return []
        }

        return [{
          id: definition.id,
          slug: definition.slug,
          level:
            typeof data.minimum_warlock_level === "number"
              ? data.minimum_warlock_level
              : 1,
          name: revision.name,
          nameEn: typeof data.name_en === "string" ? data.name_en : "",
          summary: revision.summary || revision.rules_text || "",
          rulesText: revision.rules_text || revision.summary || "",
          repeatable: data.repeatable === true,
          requiredInvocations: stringArray(data.required_invocations),
        }]
      })

      if (next.length) setRows(next)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const invocations = useMemo(
    () => rows
      .filter((entry) => {
        if (!normalizedQuery) return true
        return [
          entry.name,
          entry.nameEn,
          entry.summary,
          entry.rulesText,
          ...entry.requiredInvocations,
        ]
          .join(" ")
          .toLocaleLowerCase("ru-RU")
          .includes(normalizedQuery)
      })
      .sort(
        (a, b) =>
          a.level - b.level ||
          a.name.localeCompare(b.name, "ru"),
      ),
    [normalizedQuery, rows],
  )

  return (
    <>
      <main className="reference-guide-content reference-guide-content--list">
        <div className="reference-guide-section-note">
          <strong>Таинственные воззвания колдуна</strong>
          <p>
            Живой русский каталог из базы: уровень доступа, требования и точное правило.
            Нажми на карточку, чтобы открыть подробности.
          </p>
        </div>

        <input
          aria-label="Поиск по инвокациям"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти воззвание или требование…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(255,255,255,.05)",
            color: "inherit",
          }}
        />

        {loading ? (
          <div className="reference-catalog-status">Обновляю русский каталог…</div>
        ) : null}

        <div className="reference-class-feature-list">
          {invocations.length ? invocations.map((entry) => (
            <button
              className="reference-class-feature reference-class-feature--button surface"
              type="button"
              key={entry.id}
              onClick={() => setSelected(entry)}
            >
              <span className="reference-class-feature__head">
                <span>{entry.level} ур.</span>
                <strong>Воззвание: {entry.name}</strong>
                <em aria-hidden="true">›</em>
              </span>
              <span className="reference-class-feature__preview">{entry.summary}</span>
              {entry.nameEn ? <small>{entry.nameEn}</small> : null}
            </button>
          )) : (
            <div className="reference-catalog-status">
              По этому запросу воззваний не найдено.
            </div>
          )}
        </div>
      </main>

      {selected ? (
        <section
          className="reference-feature-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Воззвание: ${selected.name}`}
        >
          <div className="reference-feature-detail-page">
            <header className="reference-feature-detail-header">
              <button
                className="icon-button"
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Назад к списку воззваний"
              >
                ←
              </button>
              <div>
                <span>{selected.level} уровень колдуна</span>
                <h2>{selected.name}</h2>
              </div>
              <span />
            </header>

            <main className="reference-feature-detail-content">
              {selected.nameEn ? (
                <section className="reference-class-mechanics surface">
                  <span>Оригинальное название</span>
                  <p>{selected.nameEn}</p>
                </section>
              ) : null}

              <section className="reference-feature-detail-rule surface">
                <span>Правило</span>
                <p>{selected.rulesText || selected.summary}</p>
              </section>

              {selected.repeatable || selected.requiredInvocations.length ? (
                <section className="reference-feature-detail-facts">
                  <span>Требования</span>
                  <ul className="reference-rule-facts">
                    {selected.repeatable ? <li>Воззвание можно выбирать повторно, если его правило это допускает.</li> : null}
                    {selected.requiredInvocations.map((requirement) => (
                      <li key={requirement}>Требуется: {requirement}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </main>
          </div>
        </section>
      ) : null}
    </>
  )
}
