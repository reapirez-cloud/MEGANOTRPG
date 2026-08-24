import { useState } from "react"
import type { FormEvent } from "react"

import { useAuth } from "../context/AuthContext"
import {
  useCharacters,
  type Character,
} from "../context/CharacterContext"
import CharacterAvatar from "../components/characters/CharacterAvatar"

type Props = { onOpenCharacter: (id: string) => void }
type Editor =
  | { type: "create" }
  | { type: "edit"; character: Character }
  | { type: "gm" }
  | null

export default function Characters({ onOpenCharacter }: Props) {
  const { user } = useAuth()
  const {
    characters,
    members,
    myCharacters,
    canManage,
    isOwner,
    hasOwner,
    claimOwner,
    createCharacter,
    updateCharacter,
    setActiveForMember,
    setGm,
  } = useCharacters()

  const [editor, setEditor] = useState<Editor>(null)
  const [name, setName] = useState("")
  const [characterClass, setCharacterClass] = useState("")
  const [level, setLevel] = useState("1")
  const [bio, setBio] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [assignedUserId, setAssignedUserId] = useState("")
  const [gmUserId, setGmUserId] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  function resetForm() {
    setName("")
    setCharacterClass("")
    setLevel("1")
    setBio("")
    setAvatarUrl("")
    setAssignedUserId("")
    setFormError("")
  }

  function openCreate() {
    resetForm()
    setEditor({ type: "create" })
  }

  function openEdit(character: Character) {
    setName(character.name)
    setCharacterClass(character.character_class)
    setLevel(String(character.level))
    setBio(character.bio)
    setAvatarUrl(character.avatar_url || "")
    setAssignedUserId(character.assigned_user_id || "")
    setFormError("")
    setEditor({ type: "edit", character })
  }

  function openGmEditor() {
    const currentGm = members.find((member) => member.role === "gm")
    setGmUserId(currentGm?.user_id || "")
    setFormError("")
    setEditor({ type: "gm" })
  }

  async function becomeOwner() {
    setSaving(true)
    setFormError("")
    const result = await claimOwner()
    setSaving(false)
    if (!result.ok) setFormError(result.error || "Не удалось назначить владельца.")
  }

  async function submitCharacter(event: FormEvent) {
    event.preventDefault()
    if (editor?.type !== "create" && editor?.type !== "edit") return

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

    const input = {
      name,
      character_class: characterClass,
      level: parsedLevel,
      bio,
      avatar_url: avatarUrl || null,
      assigned_user_id: assignedUserId || null,
    }

    const result =
      editor.type === "create"
        ? await createCharacter(input)
        : await updateCharacter(editor.character.id, input)

    setSaving(false)

    if (!result.ok) {
      setFormError(result.error || "Не удалось сохранить персонажа.")
      return
    }

    setEditor(null)
  }

  async function submitGm(event: FormEvent) {
    event.preventDefault()

    if (!gmUserId) {
      setFormError("Выбери игрока, который будет GM.")
      return
    }

    setSaving(true)
    setFormError("")
    const result = await setGm(gmUserId)
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error || "Не удалось назначить GM.")
      return
    }

    setEditor(null)
  }

  async function makeActive(character: Character) {
    if (!character.assigned_user_id) return
    setSaving(true)
    setFormError("")
    const result = await setActiveForMember(
      character.assigned_user_id,
      character.id,
    )
    setSaving(false)
    if (!result.ok) {
      setFormError(result.error || "Не удалось изменить активного персонажа.")
    }
  }

  function renderCard(character: Character) {
    const member = character.assigned_user_id
      ? members.find((item) => item.user_id === character.assigned_user_id)
      : null
    const isActive = member?.active_character_id === character.id
    const title = member
      ? `${character.name} (${member.display_name})`
      : character.name

    return (
      <article
        className={`character-social-card surface ${isActive ? "character-social-card--active" : ""}`}
        key={character.id}
      >
        <button
          className="character-social-card__main"
          type="button"
          onClick={() => onOpenCharacter(character.id)}
        >
          <CharacterAvatar character={character} size="large" />
          <span className="character-social-card__body">
            <span className="character-social-card__name-row">
              <strong>{title}</strong>
              {isActive && <em>Активен</em>}
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

        {canManage && (
          <div className="gm-character-actions">
            <button type="button" onClick={() => openEdit(character)}>
              ✎ Редактировать
            </button>
            {member && !isActive && (
              <button
                type="button"
                onClick={() => void makeActive(character)}
                disabled={saving}
              >
                Сделать активным
              </button>
            )}
          </div>
        )}

        {!canManage && character.assigned_user_id === user.id && (
          <div className="player-character-note">
            {isActive
              ? "Этот персонаж назначен тебе активным"
              : "Персонаж прикреплён к тебе. Активного выбирает GM или владелец"}
          </div>
        )}
      </article>
    )
  }

  const currentGm = members.find((member) => member.role === "gm")

  return (
    <>
      <div className="page-stack">
        {!hasOwner && (
          <div className="owner-bootstrap surface">
            <div>
              <strong>Кампания ещё без владельца</strong>
              <p>
                Владелец — это держатель приложения. Он не обязан быть GM, но
                имеет те же права управления.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void becomeOwner()}
              disabled={saving}
            >
              Я владелец
            </button>
          </div>
        )}

        {isOwner && (
          <section className="section owner-control-section">
            <div className="section-head">
              <div>
                <h3 className="section-title">Управление кампанией</h3>
                <p className="item-meta">Владелец приложения · отдельная роль от GM</p>
              </div>
            </div>

            <div className="owner-control-card surface">
              <div>
                <span>Текущий GM</span>
                <strong>{currentGm?.display_name || "Не назначен"}</strong>
              </div>
              <button type="button" onClick={openGmEditor}>
                {currentGm ? "Сменить GM" : "Назначить GM"}
              </button>
            </div>
          </section>
        )}

        <section className="section">
          <div className="section-head">
            <div>
              <h3 className="section-title">
                {canManage ? "Персонажи кампании" : "Мои персонажи"}
              </h3>
              <p className="item-meta">
                {canManage
                  ? "GM и владелец создают, прикрепляют и редактируют персонажей"
                  : "Здесь только персонажи, заранее прикреплённые к тебе"}
              </p>
            </div>
            {canManage && (
              <button
                className="section-link"
                type="button"
                onClick={openCreate}
              >
                + Персонаж
              </button>
            )}
          </div>

          <div className="character-social-list">
            {(canManage ? characters : myCharacters).length === 0 && (
              <div className="character-empty surface">
                {canManage
                  ? "Персонажей пока нет."
                  : "GM или владелец пока не прикрепил к тебе персонажа."}
              </div>
            )}
            {(canManage ? characters : myCharacters).map(renderCard)}
          </div>
        </section>

        {canManage && (
          <section className="section">
            <div className="section-head">
              <div>
                <h3 className="section-title">Участники</h3>
                <p className="item-meta">Кто игрок, кто GM, кто владелец</p>
              </div>
            </div>

            <div className="member-role-list surface">
              {members.map((member) => (
                <div className="member-role-row" key={member.user_id}>
                  <span className="member-role-avatar">
                    {member.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{member.display_name}</strong>
                    <small>
                      {member.is_owner
                        ? "Владелец"
                        : member.role === "gm"
                          ? "GM"
                          : "Игрок"}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {formError && !editor && <div className="auth-error">{formError}</div>}
      </div>

      {(editor?.type === "create" || editor?.type === "edit") && (
        <div className="sheet-backdrop" onMouseDown={() => setEditor(null)}>
          <form
            className="bottom-sheet character-editor-sheet"
            onSubmit={submitCharacter}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">
                  {editor.type === "create"
                    ? "Новый персонаж"
                    : "Редактировать персонажа"}
                </h3>
                <p className="sheet-copy">
                  Эти данные меняют только GM или владелец.
                </p>
              </div>
              <button
                className="sheet-close"
                type="button"
                onClick={() => setEditor(null)}
              >
                ×
              </button>
            </div>

            <label className="field-label" htmlFor="character-name">
              Имя персонажа
            </label>
            <input
              id="character-name"
              className="app-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Имя персонажа"
              maxLength={80}
              autoFocus
            />

            <div className="character-editor-grid">
              <div>
                <label className="field-label" htmlFor="character-class">
                  Класс / роль
                </label>
                <input
                  id="character-class"
                  className="app-input"
                  value={characterClass}
                  onChange={(event) => setCharacterClass(event.target.value)}
                  placeholder="Плут"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="character-level">
                  Уровень
                </label>
                <input
                  id="character-level"
                  className="app-input"
                  type="number"
                  min="1"
                  max="30"
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                />
              </div>
            </div>

            <label className="field-label" htmlFor="character-player">
              Прикрепить к игроку
            </label>
            <select
              id="character-player"
              className="app-select"
              value={assignedUserId}
              onChange={(event) => setAssignedUserId(event.target.value)}
            >
              <option value="">Пока никому</option>
              {members.map((member) => (
                <option value={member.user_id} key={member.user_id}>
                  {member.display_name}
                  {member.is_owner
                    ? " · владелец"
                    : member.role === "gm"
                      ? " · GM"
                      : ""}
                </option>
              ))}
            </select>

            <label className="field-label" htmlFor="character-avatar">
              Аватар
            </label>
            <input
              id="character-avatar"
              className="app-input"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="Пока ссылка; потом Storage"
            />

            <label className="field-label" htmlFor="character-bio">
              Короткое описание
            </label>
            <textarea
              id="character-bio"
              className="app-textarea"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={600}
            />

            {formError && <div className="auth-error">{formError}</div>}
            <button className="sheet-save" type="submit" disabled={saving}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          </form>
        </div>
      )}

      {editor?.type === "gm" && (
        <div className="sheet-backdrop" onMouseDown={() => setEditor(null)}>
          <form
            className="bottom-sheet assignment-sheet"
            onSubmit={submitGm}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">Назначить GM</h3>
                <p className="sheet-copy">
                  GM может быть только один. Старый GM автоматически станет игроком.
                </p>
              </div>
              <button
                className="sheet-close"
                type="button"
                onClick={() => setEditor(null)}
              >
                ×
              </button>
            </div>

            <label className="field-label" htmlFor="gm-player">
              Новый GM
            </label>
            <select
              id="gm-player"
              className="app-select"
              value={gmUserId}
              onChange={(event) => setGmUserId(event.target.value)}
            >
              <option value="">Выбрать игрока</option>
              {members
                .filter((member) => !member.is_owner)
                .map((member) => (
                  <option value={member.user_id} key={member.user_id}>
                    {member.display_name}
                    {member.role === "gm" ? " · текущий GM" : ""}
                  </option>
                ))}
            </select>

            {formError && <div className="auth-error">{formError}</div>}
            <button className="sheet-save" type="submit" disabled={saving}>
              {saving ? "Назначаем…" : "Назначить GM"}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
