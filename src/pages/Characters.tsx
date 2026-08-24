import { useMemo, useState } from "react"
import type { FormEvent } from "react"

import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import CharacterAvatar from "../components/characters/CharacterAvatar"

type Props = {
  onOpenCharacter: (id: string) => void
}

type FormState = {
  name: string
  character_class: string
  level: string
  bio: string
  avatar_url: string
}

const emptyForm: FormState = {
  name: "",
  character_class: "",
  level: "1",
  bio: "",
  avatar_url: "",
}

export default function Characters({ onOpenCharacter }: Props) {
  const { user } = useAuth()
  const {
    characters,
    activeCharacter,
    setActiveCharacter,
    createCharacter,
  } = useCharacters()

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const myCharacters = useMemo(
    () => characters.filter((character) => character.owner_user_id === user.id),
    [characters, user.id],
  )

  const otherCharacters = useMemo(
    () => characters.filter((character) => character.owner_user_id !== user.id),
    [characters, user.id],
  )

  async function submit(event: FormEvent) {
    event.preventDefault()

    const name = form.name.trim()
    if (!name) {
      setFormError("Укажи имя персонажа.")
      return
    }

    const level = Number.parseInt(form.level, 10)
    if (!Number.isFinite(level) || level < 1 || level > 30) {
      setFormError("Уровень должен быть от 1 до 30.")
      return
    }

    setSaving(true)
    setFormError("")

    const result = await createCharacter({
      name,
      character_class: form.character_class.trim() || "Персонаж",
      level,
      bio: form.bio,
      avatar_url: form.avatar_url || null,
    })

    setSaving(false)

    if (!result.ok) {
      setFormError(result.error || "Не удалось создать персонажа.")
      return
    }

    setForm(emptyForm)
    setCreateOpen(false)
  }

  function renderCharacterCard(character: (typeof characters)[number], owned: boolean) {
    const active = character.id === activeCharacter?.id

    return (
      <article
        className={`character-social-card surface ${active ? "character-social-card--active" : ""}`}
        key={character.id}
      >
        <button
          type="button"
          className="character-social-card__main"
          onClick={() => onOpenCharacter(character.id)}
        >
          <CharacterAvatar character={character} size="large" />

          <span className="character-social-card__body">
            <span className="character-social-card__name-row">
              <strong>{character.name}</strong>
              {active && <em>Активен</em>}
            </span>
            <small>
              {character.character_class} · {character.level} уровень
            </small>
            <span className="character-social-card__bio">
              {character.bio || "Пока без описания."}
            </span>
          </span>

          <span className="character-social-card__chevron">›</span>
        </button>

        {owned && !active && (
          <button
            type="button"
            className="character-social-card__activate"
            onClick={() => void setActiveCharacter(character.id)}
          >
            Сделать активным
          </button>
        )}
      </article>
    )
  }

  return (
    <>
      <div className="page-stack">
        <section className="section">
          <div className="section-head">
            <div>
              <h3 className="section-title">Мои персонажи</h3>
              <p className="item-meta">
                Активный персонаж используется в игровых чатах
              </p>
            </div>

            <button
              className="section-link"
              type="button"
              onClick={() => setCreateOpen(true)}
            >
              + Создать
            </button>
          </div>

          <div className="character-social-list">
            {myCharacters.map((character) => renderCharacterCard(character, true))}
          </div>
        </section>

        {otherCharacters.length > 0 && (
          <section className="section">
            <div className="section-head">
              <div>
                <h3 className="section-title">Группа</h3>
                <p className="item-meta">Остальные персонажи игроков</p>
              </div>
            </div>

            <div className="character-social-list">
              {otherCharacters.map((character) => renderCharacterCard(character, false))}
            </div>
          </section>
        )}
      </div>

      {createOpen && (
        <div className="sheet-backdrop" onMouseDown={() => setCreateOpen(false)}>
          <form
            className="bottom-sheet character-editor-sheet"
            onSubmit={submit}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />

            <div className="character-picker-sheet__head">
              <div>
                <h3 className="sheet-title">Новый персонаж</h3>
                <p className="sheet-copy">
                  Его можно будет сделать активным в любой момент.
                </p>
              </div>
              <button
                className="sheet-close"
                type="button"
                onClick={() => setCreateOpen(false)}
              >
                ×
              </button>
            </div>

            <label className="field-label" htmlFor="character-name">Имя</label>
            <input
              id="character-name"
              className="app-input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Имя персонажа"
              maxLength={80}
              autoFocus
            />

            <div className="character-editor-grid">
              <div>
                <label className="field-label" htmlFor="character-class">Класс</label>
                <input
                  id="character-class"
                  className="app-input"
                  value={form.character_class}
                  onChange={(event) =>
                    setForm({ ...form, character_class: event.target.value })
                  }
                  placeholder="Например: Плут"
                  maxLength={80}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="character-level">Уровень</label>
                <input
                  id="character-level"
                  className="app-input"
                  type="number"
                  min="1"
                  max="30"
                  value={form.level}
                  onChange={(event) => setForm({ ...form, level: event.target.value })}
                />
              </div>
            </div>

            <label className="field-label" htmlFor="character-avatar">
              Аватар / арт
            </label>
            <input
              id="character-avatar"
              className="app-input"
              value={form.avatar_url}
              onChange={(event) => setForm({ ...form, avatar_url: event.target.value })}
              placeholder="Ссылка на изображение"
              inputMode="url"
            />

            <label className="field-label" htmlFor="character-bio">Коротко о персонаже</label>
            <textarea
              id="character-bio"
              className="app-textarea"
              value={form.bio}
              onChange={(event) => setForm({ ...form, bio: event.target.value })}
              placeholder="Пара строк для карточки"
              maxLength={600}
            />

            {formError && <div className="auth-error">{formError}</div>}

            <button className="sheet-save" type="submit" disabled={saving}>
              {saving ? "Создаём…" : "Создать персонажа"}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
