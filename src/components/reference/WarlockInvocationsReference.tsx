import { useMemo, useState } from "react"

import { warlockInvocationsReference } from "../../data/classes/warlockInvocationsReference"

export default function WarlockInvocationsReference() {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLocaleLowerCase("ru")

  const invocations = useMemo(
    () => warlockInvocationsReference
      .filter((entry) => {
        if (!normalizedQuery) return true
        return [entry.name, entry.mechanics, ...entry.details]
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes(normalizedQuery)
      })
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "ru")),
    [normalizedQuery],
  )

  return (
    <main className="reference-guide-content reference-guide-content--list">
      <div className="reference-guide-section-note">
        <strong>Таинственные воззвания колдуна</strong>
        <p>Отдельный каталог воззваний: уровень доступа, точное правило и требования. Это справочный список, а применение механик ведёт Character Engine.</p>
      </div>
      <input
        aria-label="Поиск по инвокациям"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Найти воззвание или требование…"
        style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)", color: "inherit" }}
      />
      <div className="reference-class-feature-list">
        {invocations.length ? invocations.map((entry, index) => (
          <article className="reference-class-feature surface" key={`${entry.level}:${entry.name}:${index}`}>
            <span className="reference-class-feature__head">
              <span>{entry.level} ур.</span>
              <strong>{entry.name}</strong>
            </span>
            <span className="reference-class-feature__preview">{entry.mechanics}</span>
            {entry.details.length ? <ul className="reference-rule-facts">{entry.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
          </article>
        )) : <div className="reference-catalog-status">По этому запросу воззваний не найдено.</div>}
      </div>
    </main>
  )
}
