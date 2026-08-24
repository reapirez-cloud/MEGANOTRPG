import { useMemo } from "react"
import { useCharacters } from "../context/CharacterContext"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import { diaryPosts } from "../data/mock"

type Props = { characterId: string; onBack: () => void }

export default function CharacterProfile({ characterId, onBack }: Props) {
  const { characters, members } = useCharacters()

  const character = useMemo(
    () => characters.find((item) => item.id === characterId) ?? null,
    [characterId, characters],
  )

  if (!character) {
    return (
      <div className="screen">
        <header className="screen-header">
          <button className="icon-button" type="button" onClick={onBack}>←</button>
          <h1 className="screen-header__title">Персонаж</h1>
          <span />
        </header>
        <div className="center-state">Персонаж не найден.</div>
      </div>
    )
  }

  const member = character.assigned_user_id
    ? members.find((item) => item.user_id === character.assigned_user_id)
    : null
  const active = member?.active_character_id === character.id
  const fullName = member ? `${character.name} (${member.display_name})` : character.name

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none"><path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="screen-header__title">{fullName}</h1>
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
            {member && <p className="profile-player-name">Игрок: {member.display_name}</p>}
            <p className="profile-subtitle">{character.character_class} · {character.level} уровень</p>
            <p className="profile-subtitle">{character.bio || "Пока без описания."}</p>
          </div>
        </section>

        <nav className="profile-tabs">
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
                  <div className="item-title">{fullName}</div>
                  <div className="item-meta">{post.time}</div>
                </div>
              </div>
              <p className="diary-post__body">{post.text}</p>
              <div className="diary-post__actions"><span>♡ {post.likes}</span><span>◯ {post.comments}</span></div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
