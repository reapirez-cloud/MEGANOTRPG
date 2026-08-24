import { characters, diaryPosts } from "../data/mock"

type Props = {
  characterId: string
  onBack: () => void
}

export default function CharacterProfile({ characterId, onBack }: Props) {
  const character =
    characters.find((item) => item.id === characterId) ?? characters[0]

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <h1 className="screen-header__title">{character.name}</h1>
        <span />
      </header>

      <div className="profile-scroll">
        <section className="profile-hero">
          <div className="profile-hero__avatar">
            {character.name.slice(0, 1)}
          </div>

          <div>
            <h2 className="profile-name">{character.name}</h2>
            <p className="profile-subtitle">{character.role}</p>
            <p className="profile-subtitle">{character.bio}</p>
          </div>
        </section>

        <nav className="profile-tabs" aria-label="Разделы персонажа">
          <button className="profile-tab profile-tab--active" type="button">Дневник</button>
          <button className="profile-tab" type="button">Инвентарь</button>
          <button className="profile-tab" type="button">Лист</button>
        </nav>

        <div className="diary-feed">
          {diaryPosts.map((post) => (
            <article className="diary-post surface" key={post.id}>
              <div className="diary-post__top">
                <div className="diary-post__mini-avatar">
                  {character.name.slice(0, 1)}
                </div>

                <div>
                  <div className="item-title">{character.name}</div>
                  <div className="item-meta">{post.time}</div>
                </div>
              </div>

              <p className="diary-post__body">{post.text}</p>

              <div className="diary-post__actions">
                <span>♡ {post.likes}</span>
                <span>◯ {post.comments}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
