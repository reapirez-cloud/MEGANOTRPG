import { artItems } from "../data/mock"

export default function Art() {
  return (
    <div className="page-stack">
      <section className="section">
        <div className="section-head">
          <div>
            <h3 className="section-title">Галерея кампании</h3>
            <p className="item-meta">Арты, сцены и комиксы в одной ленте</p>
          </div>

          <button className="section-link" type="button">+ Добавить</button>
        </div>

        <div className="art-grid" aria-label="Галерея артов">
          {artItems.map((art) => (
            <button
              type="button"
              className="art-tile"
              key={art.id}
              aria-label={art.title}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
