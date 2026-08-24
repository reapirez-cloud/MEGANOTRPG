import { worldActivity, worldCards } from "../data/mock"

export default function World() {
  return (
    <div className="page-stack">
      <section className="hero-card surface">
        <div>
          <div className="hero-card__eyebrow">Кампания</div>
          <h2 className="hero-card__title">Проклятые земли</h2>
          <p className="hero-card__copy">
            Открытые игроками места, события и достижения — компактно, без энциклопедии на главном экране.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h3 className="section-title">Локации</h3>
          <button className="section-link" type="button">Все</button>
        </div>

        <div className="compact-grid">
          {worldCards.map((item) => (
            <article className="world-tile surface" key={item.id}>
              <div className="world-tile__art" />
              <div className="world-tile__body">
                <h4 className="item-title">{item.title}</h4>
                <p className="item-meta">{item.meta}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h3 className="section-title">Последние изменения</h3>
        </div>

        <div className="activity-list surface">
          {worldActivity.map((text) => (
            <div className="activity-row" key={text}>
              <span className="activity-dot" />
              <div>
                <div className="item-title">{text}</div>
                <div className="item-meta">Недавно</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
