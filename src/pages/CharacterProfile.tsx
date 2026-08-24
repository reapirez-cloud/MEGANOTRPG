import { useMemo } from "react"

import { useCharacters } from "../context/CharacterContext"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import { diaryPosts } from "../data/mock"

type Props = {
  characterId: string
  onBack: () => void
}

export default function CharacterProfile({ characterId, onBack }: Props) {
  const { characters, activeCharacter, setActiveCharacter } = useCharacters()

  const character = useMemo(
    () => characters.find((item) => item.id === characterId) ?? null,
    [characterId, characters],
  )

  if (!character) {
    return (
      <div className="screen">
        <header className="screen-header">
          <button className="icon-button" type="button" onClick={onBack}>
            ←
          </button>
          <h1 className="screen-header__title">Персонаж</h1>
          <span />
        </header>

        <div className="center-state">
          Персонаж не найден.
        </div>
      </div>
    )
  }

  const active = character.id === activeCharacter?.id

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
        <section className="profile-hero profile-hero--real-avatar">
          <CharacterAvatar character={character} size="large" />

          <div className="profile-hero__copy">
            <div className="profile-name-row">
              <h2 className="profile-name">{character.name}</h2>
              {active && <span className="active-badge">Активен</span>}
            </div>
            <p className="profile-subtitle">
              {character.character_class} · {character.level} уровень
            </p>
            <p className="profile-subtitle">
              {character.bio || "Пока без описания."}
            </p>
          </div>
        </section>

        {!active && (
          <button
            className="profile-active-button"
            type="button"
            onClick={() => void setActiveCharacter(character.id)}
          >
            Сделать активным персонажем
          </button>
        )}

        <nav className="profile-tabs" aria-label="Разделы персонажа">
          <button className="profile-tab profile-tab--active" type="button">Дневник</button>
          <button className="profile-tab" type="button">Инвентарь</button>
          <button className="profile-tab" type="button">Лист</button>
        </nav>

        <div className="diary-feed">
          {diaryPosts.map((post) => (
            <article className="diary-post surface" key={post.id}>
              <div className="diary-post__top">
                <CharacterAvatar character={character} size="small" />

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
