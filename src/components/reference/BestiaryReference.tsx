import { useEffect, useMemo, useState } from "react"

import { supabase } from "../../lib/supabase"

type BestiaryEntry = {
  id: string
  slug: string
  name_en: string
  size: string | null
  creature_type: string | null
  subtype: string | null
  alignment: string | null
  armor_class: number | null
  hit_points: number | null
  hit_dice: string | null
  challenge_rating: number | string | null
  xp: number | null
  source_label: string | null
  rules_year: number | null
  sort_order: number | null
}

const BESTIARY_FIELDS = "id,slug,name_en,size,creature_type,subtype,alignment,armor_class,hit_points,hit_dice,challenge_rating,xp,source_label,rules_year,sort_order"

export default function BestiaryReference() {
  const [entries, setEntries] = useState<BestiaryEntry[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    void (async () => {
      setLoading(true)
      setError("")
      const { data, error: loadError } = await supabase
        .from("bestiary_catalog")
        .select(BESTIARY_FIELDS)
        .eq("rules_year", 2014)
        .order("sort_order", { ascending: true })

      if (!active) return
      if (loadError) {
        setEntries([])
        setError(loadError.message || "Не удалось загрузить бестиарий.")
      } else {
        setEntries((data || []) as BestiaryEntry[])
      }
      setLoading(false)
    })()

    return () => { active = false }
  }, [])

  const normalizedQuery = query.trim().toLocaleLowerCase("en")
  const visibleEntries = useMemo(() => {
    if (!normalizedQuery) return entries
    return entries.filter((entry) => [entry.name_en, entry.creature_type, entry.subtype, entry.alignment, entry.slug]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("en")
      .includes(normalizedQuery))
  }, [entries, normalizedQuery])

  return (
    <main className="reference-guide-content reference-guide-content--list">
      <div className="reference-guide-section-note">
        <strong>Бестиарий D&amp;D 5e, правила 2014</strong>
        <p>Живой каталог из Supabase. Статы и механики существ загружены без перевода, как и планировалось.</p>
      </div>
      <input
        aria-label="Поиск по бестиарию"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Найти существо по названию или типу…"
        style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)", color: "inherit" }}
      />
      {loading && <div className="reference-catalog-status">Загружаю бестиарий…</div>}
      {error && <div className="reference-catalog-status is-error">Бестиарий временно недоступен: {error}</div>}
      {!loading && !error && <div className="reference-class-list">
        {visibleEntries.length ? visibleEntries.map((entry) => (
          <article className="reference-class-card surface" key={entry.id}>
            <span className="reference-class-card__monogram">{entry.name_en.slice(0, 1).toUpperCase()}</span>
            <span className="reference-class-card__copy">
              <span className="reference-class-card__title"><strong>{entry.name_en}</strong><small>CR {entry.challenge_rating ?? "—"}</small></span>
              <span>{[entry.size, entry.creature_type, entry.subtype].filter(Boolean).join(" • ") || "Creature"}</span>
              <em>AC {entry.armor_class ?? "—"} • HP {entry.hit_points ?? "—"}{entry.hit_dice ? ` (${entry.hit_dice})` : ""} • {entry.xp ?? 0} XP</em>
            </span>
          </article>
        )) : <div className="reference-catalog-status">По этому запросу существ не найдено.</div>}
      </div>}
      {!loading && !error && <div className="reference-catalog-status">Показано: {visibleEntries.length} из {entries.length} • {entries[0]?.source_label || "D&D 5e SRD 5.1 (2014 rules)"}</div>}
    </main>
  )
}
