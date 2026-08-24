import { useState } from "react"
import type { FormEvent } from "react"

import { useAuth } from "../context/AuthContext"
import { useCharacters, type Character } from "../context/CharacterContext"
import CharacterAvatar from "../components/characters/CharacterAvatar"

type Props = { onOpenCharacter: (id: string) => void }
type Editor = { type: "create" } | { type: "assign"; character: Character } | null

export default function Characters({ onOpenCharacter }: Props) {
  const { user } = useAuth()
  const {
    characters,
    members,
    myCharacters,
    isGm,
    hasGm,
    claimGm,
    createCharacter,
    assignCharacter,
    setActiveForMember,
  } = useCharacters()

  const [editor, setEditor] = useState<Editor>(null)
  const [name, setName] = useState("")
  const [characterClass, setCharacterClass] = useState("")
  const [level, setLevel] = useState("1")
  const [bio, setBio] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [assignedUserId, setAssignedUserId] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  async function becomeGm() {
    setSaving(true)
    const result = await claimGm()
    setSaving(false)
    if (!result.ok) setFormError(result.error || "Не удалось назначить GM.")
  }

  function openCreate() {
    setName("")
    setCharacterClass("")
    setLevel("1")
    setBio("")
    setAvatarUrl("")
    setAssignedUserId("")
    setFormError("")
    setEditor({ type: "create" })
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault()
    const parsedLevel = Number.parseInt(level, 10)

    if (!name.trim()) {
      setFormError("Укажи имя персонажа.")
      return
    }

    if (!Number.isFinite(parsedLevel) || parsedLevel < 1 || parsedLevel > 30) {
      setFormError("Уровень должен быть от 1 до 30.")
      return
    }

    setSaving(true)
    setFormError("")

    const result = await createCharacter({
      name,
      character_class: characterClass,
      level: parsedLevel,
      bio,
      avatar_url: avatarUrl || null,
      assigned_user_id: assignedUserId || null,
    })

    setSaving(false)

    if (!result.ok) {
      setFormError(result.error || "Не удалось создать персонажа.")
      return
    }

    setEditor(null)
  }

  async function assign(userId: string | null) {
    if (editor?.type !== "assign") return
    setSaving(true)
    setFormError("")
    const result = await assignCharacter(editor.character.id, userId)
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error || "Не удалось прикрепить персонажа.")
      return
    }

    setEditor(null)
  }

  async function makeActive(character: Character) {
    if (!character.assigned_user_id) return
    setSaving(true)
    const result = await setActiveForMember(character.assigned_user_id, character.id)
    setSaving(false)
    if (!result.ok) setFormError(result.error || "Не удалось изменить активного персонажа.")
  }

  function renderCard(character: Character) {
    const member = character.assigned_user_id
      ? members.find((item) => item.user_id === character.assigned_user_id)
      : null
    const isActive = member?.active_character_id === character.id
    const title = member ? `${character.name} (${member.display_name})` : character.name
    const own = character.assigned_user_id === user.id

    return (
      <article className={`character-social-card surface ${isActive ? "character-social-card--active" : ""}`} key={character.id}>
        <button className="character-social-card__main" type="button" onClick={() => onOpenCharacter(character.id)}>
          <CharacterAvatar character={character} size="large" />
          <span className="character-social-card__body">
            <span className="character-social-card__name-row">
              <strong>{title}</strong>
              {isActive && <em>Активен</em>}
            </span>
            <small>{character.character_class} · {character.level} уровень</small>
            <span className="character-social-card__bio">{character.bio || "Пока без описания."}</span>
          </span>
          <span className="character-social-card__chevron">›</span>
        </button>

        {isGm && (
          <div className="gm-character-actions">
            <button type="button" onClick={() => { setFormError(""); setEditor({ type: "assign", character }) }}>
              {member ? `Игрок: ${member.display_name}` : "Прикрепить игрока"}
            </button>
            {member && !isActive && (
              <button type="button" onClick={() => void makeActive(character)} disabled={saving}>
                Сделать активным
              </button>
            )}
          </div>
        )}

        {!isGm && own && (
          <div className="player-character-note">
            {isActive ? "GM назначил этого персонажа активным" : "Персонаж прикреплён к тебе, но сейчас не активен"}
          </div>
        )}
      </article>
    )
  }

  const otherCharacters = characters.filter((character) => character.assigned_user_id !== user.id)

  return (
    <>
      <div className="page-stack">
        {!hasGm && (
          <div className="gm-bootstrap surface">
            <div>
              <strong>Кампания ещё без GM</strong>
              <p>Тот, кто ведёт игру, должен один раз забрать роль GM.</p>
            </div>
            <button type="button" onClick={() => void becomeGm()} disabled={saving}>Стать GM</button>
          </div>
        )}

        <section className="section">
          <div className="section-head">
            <div>
              <h3 className="section-title">Мои персонажи</h3>
              <p className="item-meta">Активного выбирает GM, не игрок</p>
            </div>
            {isGm && <button className="section-link" type="button" onClick={openCreate}>+ Персонаж</button>}
          </div>

          <div className="character-social-list">
            {myCharacters.length === 0 && <div className="character-empty surface">GM пока не прикрепил к тебе персонажа.</div>}
            {myCharacters.map(renderCard)}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <h3 className="section-title">{isGm ? "Все персонажи кампании" : "Группа"}</h3>
              <p className="item-meta">Персонаж (имя игрока)</p>
            </div>
          </div>
          <div className="character-social-list">
            {(isGm ? characters : otherCharacters).map(renderCard)}
          </div>
        </section>

        {formError && !editor && <div className="auth-error">{formError}</div>}
      </div>

      {editor?.type === "create" && (
        <div className="sheet-backdrop" onMouseDown={() => setEditor(null)}>
          <form className="bottom-sheet character-editor-sheet" onSubmit={submitCreate} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div><h3 className="sheet-title">Новый персонаж</h3><p className="sheet-copy">Персонажей создаёт и прикрепляет GM.</p></div>
              <button className="sheet-close" type="button" onClick={() => setEditor(null)}>×</button>
            </div>

            <label className="field-label" htmlFor="character-name">Имя персонажа</label>
            <input id="character-name" className="app-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя персонажа" maxLength={80} autoFocus />

            <div className="character-editor-grid">
              <div>
                <label className="field-label" htmlFor="character-class">Класс / роль</label>
                <input id="character-class" className="app-input" value={characterClass} onChange={(e) => setCharacterClass(e.target.value)} placeholder="Плут" />
              </div>
              <div>
                <label className="field-label" htmlFor="character-level">Уровень</label>
                <input id="character-level" className="app-input" type="number" min="1" max="30" value={level} onChange={(e) => setLevel(e.target.value)} />
              </div>
            </div>

            <label className="field-label" htmlFor="character-player">Прикрепить к игроку</label>
            <select id="character-player" className="app-select" value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}>
              <option value="">Пока никому</option>
              {members.map((member) => <option value={member.user_id} key={member.user_id}>{member.display_name}</option>)}
            </select>

            <label className="field-label" htmlFor="character-avatar">Аватар</label>
            <input id="character-avatar" className="app-input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="Пока ссылка; потом Storage" />

            <label className="field-label" htmlFor="character-bio">Короткое описание</label>
            <textarea id="character-bio" className="app-textarea" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={600} />

            {formError && <div className="auth-error">{formError}</div>}
            <button className="sheet-save" type="submit" disabled={saving}>{saving ? "Создаём…" : "Создать персонажа"}</button>
          </form>
        </div>
      )}

      {editor?.type === "assign" && (
        <div className="sheet-backdrop" onMouseDown={() => setEditor(null)}>
          <div className="bottom-sheet assignment-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div><h3 className="sheet-title">{editor.character.name}</h3><p className="sheet-copy">Выбери игрока.</p></div>
              <button className="sheet-close" type="button" onClick={() => setEditor(null)}>×</button>
            </div>

            <button type="button" className="assignment-row" onClick={() => void assign(null)} disabled={saving}>
              <span className="assignment-row__avatar">—</span><span><strong>Никому</strong><small>Оставить без игрока</small></span>
            </button>

            {members.map((member) => (
              <button type="button" className="assignment-row" key={member.user_id} onClick={() => void assign(member.user_id)} disabled={saving}>
                <span className="assignment-row__avatar">{member.display_name.slice(0, 1).toUpperCase()}</span>
                <span><strong>{member.display_name}</strong><small>{member.role === "gm" ? "GM" : "Игрок"}</small></span>
              </button>
            ))}

            {formError && <div className="auth-error">{formError}</div>}
          </div>
        </div>
      )}
    </>
  )
}
