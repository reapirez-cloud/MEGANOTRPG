import { characters } from "../data/mock"

type Props = {
  onOpenCharacter: (id: string) => void
}

export default function Characters({ onOpenCharacter }: Props) {
  return (
    <div className="page-stack">
      <section className="section">
        <div className="section-head">
          <div>
            <h3 className="section-title">Персонажи игроков</h3>
            <p className="item-meta">Профиль, дневник и данные героя</p>
          </div>
        </div>

        <div className="character-list">
          {characters.map((character) => (
            <article
              className="character-card surface"
              key={character.id}
              onClick={() => onOpenCharacter(character.id)}
            >
              <div className="character-card__avatar">
                {character.name.slice(0, 1)}
              </div>

              <div className="character-card__body">
                <h4 className="character-card__name">{character.name}</h4>
                <div className="item-meta">{character.role}</div>
                <p className="character-card__bio">{character.bio}</p>
              </div>

              <div className="character-card__chevron">›</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
