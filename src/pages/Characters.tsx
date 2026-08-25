import { useMemo, useState } from "react"
import type { FormEvent } from "react"

import { useAuth } from "../context/AuthContext"
import {
  useCharacters,
  type CampaignMember,
  type Character,
} from "../context/CharacterContext"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import ImageUploadField from "../components/common/ImageUploadField"
import { useLongPressItem } from "../hooks/useLongPressItem"

type Props = { onOpenCharacter: (id: string) => void }
type Editor =
  | { type: "create" }
  | { type: "edit"; character: Character }
  | { type: "role"; member: CampaignMember }
  | null

export default function Characters({ onOpenCharacter }: Props) {
  const { user } = useAuth()
  const {
    characters,
    members,
    campaignId,
    canManage,
    isOwner,
    createInvite,
    createCharacter,
    updateCharacter,
    setActiveForMember,
    setMemberRole,
  } = useCharacters()

  const [editor, setEditor] = useState<Editor>(null)
  const [name, setName] = useState("")
  const [characterClass, setCharacterClass] = useState("")
  const [level, setLevel] = useState("1")
  const [bio, setBio] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [assignedUserId, setAssignedUserId] = useState("")
  const [telegramIdInput, setTelegramIdInput] = useState("")
  const [roleValue, setRoleValue] = useState<"gm" | "player">("player")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [inviteStatus, setInviteStatus] = useState("")
  const [creatingInvite, setCreatingInvite] = useState(false)
  const bindCharacterLongPress = useLongPressItem<Character>((character) => {
    if (canManage) openEdit(character)
    else onOpenCharacter(character.id)
  })

  const telegramMembers = useMemo(
    () => members.filter((member) => Boolean(member.telegram_user_id)),
    [members],
  )

  const telegramMatch = useMemo(() => {
    const cleaned = telegramIdInput.trim()
    if (!cleaned) return null
    return members.find((member) => member.telegram_user_id === cleaned) ?? null
  }, [members, telegramIdInput])

  function resetForm() {
    setName("")
    setCharacterClass("")
    setLevel("1")
    setBio("")
    setAvatarUrl("")
    setAssignedUserId("")
    setTelegramIdInput("")
    setFormError("")
  }

  function openCreate() {
    resetForm()
    setEditor({ type: "create" })
  }

  function openEdit(character: Character) {
    const assignedMember = character.assigned_user_id
      ? members.find((member) => member.user_id === character.assigned_user_id)
      : null

    setName(character.name)
    setCharacterClass(character.character_class)
    setLevel(String(character.level))
    setBio(character.bio)
    setAvatarUrl(character.avatar_url || "")
    setAssignedUserId(character.assigned_user_id || "")
    setTelegramIdInput(assignedMember?.telegram_user_id || "")
    setFormError("")
    setEditor({ type: "edit", character })
  }

  function openRoleEditor(member: CampaignMember) {
    setRoleValue(member.role)
    setFormError("")
    setEditor({ type: "role", member })
  }

  function selectMember(userId: string) {
    setAssignedUserId(userId)
    const member = members.find((item) => item.user_id === userId)
    setTelegramIdInput(member?.telegram_user_id || "")
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

    let resolvedUserId: string | null = assignedUserId || null
    const requestedTelegramId = telegramIdInput.trim()

    if (requestedTelegramId) {
      const matchedMember = members.find(
        (member) => member.telegram_user_id === requestedTelegramId,
      )

      if (!matchedMember) {
        setFormError(
          "Игрок с таким Telegram ID не найден. Он должен хотя бы один раз открыть Mini App через бота.",
        )
        return
      }

      resolvedUserId = matchedMember.user_id
    }

    setSaving(true)
    setFormError("")

    const input = {
      name,
      character_class: characterClass,
      level: parsedLevel,
      bio,
      avatar_url: avatarUrl || null,
      assigned_user_id: resolvedUserId,
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

  async function submitRole(event: FormEvent) {
    event.preventDefault()
    if (editor?.type !== "role") return

    setSaving(true)
    setFormError("")
    const result = await setMemberRole(editor.member.user_id, roleValue)
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error || "Не удалось изменить роль.")
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

  async function makeInvite() {
    setCreatingInvite(true)
    setInviteStatus("")
    const result = await createInvite()
    setCreatingInvite(false)
    if (!result.ok || !result.code) {
      setInviteStatus(result.error || "Не удалось создать приглашение.")
      return
    }
    setInviteCode(result.code)
    try {
      await navigator.clipboard.writeText(result.code)
      setInviteStatus("Код скопирован — можно отправить игроку.")
    } catch {
      setInviteStatus("Код готов — нажми на него, чтобы скопировать.")
    }
  }

  async function copyInvite() {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
      setInviteStatus("Код скопирован.")
    } catch {
      setInviteStatus("Не удалось скопировать автоматически.")
    }
  }

  function memberLabel(member: CampaignMember) {
    if (member.is_owner) return "Владелец"
    return member.role === "gm" ? "GM" : "Игрок"
  }

  function telegramLabel(member: CampaignMember) {
    if (!member.telegram_user_id) return "Старый web-профиль"
    const username = member.telegram_username ? `@${member.telegram_username} · ` : ""
    return `${username}TG ID ${member.telegram_user_id}`
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
        {...bindCharacterLongPress(character)}
        className={`character-social-card surface ${isActive ? "character-social-card--active" : ""}`}
        key={character.id}
        style={{ touchAction: "pan-y" }}
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
            {member?.telegram_user_id && (
              <span className="character-telegram-owner">
                TG ID {member.telegram_user_id}
              </span>
            )}
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
        {isOwner && (
          <section className="section owner-control-section">
            <div className="section-head">
              <div>
                <h3 className="section-title">Роли кампании</h3>
                <p className="item-meta">
                  Роль игрока и привязка персонажа теперь независимы друг от друга
                </p>
              </div>
            </div>

            <div className="owner-control-card surface">
              <div>
                <span>Текущий GM</span>
                <strong>{currentGm?.display_name || "Не назначен"}</strong>
              </div>
              <small className="owner-role-hint">
                GM может вообще не иметь персонажа
              </small>
            </div>
          </section>
        )}

        {canManage && (
          <section className="section">
            <div className="section-head">
              <div>
                <h3 className="section-title">Пригласить игрока</h3>
                <p className="item-meta">
                  Одно приглашение действует 30 дней и рассчитано на 20 входов.
                </p>
              </div>
              <button
                className="section-link"
                type="button"
                onClick={() => void makeInvite()}
                disabled={creatingInvite}
              >
                {creatingInvite ? "Создаём…" : "+ Код"}
              </button>
            </div>
            {inviteCode && (
              <button
                className="campaign-invite-card surface"
                type="button"
                onClick={() => void copyInvite()}
              >
                <span>Код приглашения</span>
                <strong>{inviteCode}</strong>
                <small>Нажми, чтобы скопировать</small>
              </button>
            )}
            {inviteStatus && <p className="inline-status">{inviteStatus}</p>}
          </section>
        )}

        <section className="section">
          <div className="section-head">
            <div>
              <h3 className="section-title">
                Персонажи кампании
              </h3>
              <p className="item-meta">
                {canManage
                  ? "Персонажа можно привязать к конкретному Telegram ID"
                  : "Активные герои других игроков видны вместе с их историями"}
              </p>
            </div>
            {canManage && (
              <button className="section-link" type="button" onClick={openCreate}>
                + Персонаж
              </button>
            )}
          </div>

          <div className="character-social-list">
            {characters.length === 0 && (
              <div className="character-empty surface">
                {canManage
                  ? "Персонажей пока нет."
                  : "В кампании пока нет доступных персонажей."}
              </div>
            )}
            {characters.map(renderCard)}
          </div>
        </section>

        {canManage && (
          <section className="section">
            <div className="section-head">
              <div>
                <h3 className="section-title">Участники</h3>
                <p className="item-meta">
                  Роль назначается отдельно. Telegram ID показан прямо здесь.
                </p>
              </div>
            </div>

            <div className="member-role-list surface">
              {members.map((member) => (
                <div className="member-role-row" key={member.user_id}>
                  <span className="member-role-avatar">
                    {member.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="member-role-copy">
                    <strong>{member.display_name}</strong>
                    <small>{memberLabel(member)}</small>
                    <span className={member.telegram_user_id ? "member-telegram" : "member-telegram member-telegram--legacy"}>
                      {telegramLabel(member)}
                    </span>
                  </div>
                  {isOwner && !member.is_owner && (
                    <button
                      className="member-role-edit"
                      type="button"
                      onClick={() => openRoleEditor(member)}
                    >
                      Роль
                    </button>
                  )}
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
                  {editor.type === "create" ? "Новый персонаж" : "Редактировать персонажа"}
                </h3>
                <p className="sheet-copy">
                  Роль игрока здесь не меняется. Здесь только сам персонаж и его владелец.
                </p>
              </div>
              <button className="sheet-close" type="button" onClick={() => setEditor(null)}>
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
                <label className="field-label" htmlFor="character-class">Класс / роль</label>
                <input
                  id="character-class"
                  className="app-input"
                  value={characterClass}
                  onChange={(event) => setCharacterClass(event.target.value)}
                  placeholder="Плут"
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
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                />
              </div>
            </div>

            <div className="telegram-assignment-box">
              <label className="field-label" htmlFor="character-telegram-id">
                Telegram ID игрока
              </label>
              <input
                id="character-telegram-id"
                className="app-input"
                value={telegramIdInput}
                onChange={(event) => {
                  setTelegramIdInput(event.target.value.replace(/\D/g, ""))
                  setAssignedUserId("")
                }}
                inputMode="numeric"
                placeholder="Например: 465441613"
              />

              {telegramIdInput && (
                <div className={`telegram-id-match ${telegramMatch ? "telegram-id-match--ok" : "telegram-id-match--missing"}`}>
                  {telegramMatch
                    ? `Найден: ${telegramMatch.display_name}${telegramMatch.telegram_username ? ` (@${telegramMatch.telegram_username})` : ""}`
                    : "Такого Telegram ID среди вошедших участников пока нет"}
                </div>
              )}

              <label className="field-label" htmlFor="character-player">
                Или выбрать вошедшего игрока
              </label>
              <select
                id="character-player"
                className="app-select"
                value={assignedUserId}
                onChange={(event) => selectMember(event.target.value)}
              >
                <option value="">Не привязывать</option>
                {telegramMembers.map((member) => (
                  <option value={member.user_id} key={member.user_id}>
                    {member.display_name}
                    {member.telegram_username ? ` · @${member.telegram_username}` : ""}
                    {` · TG ${member.telegram_user_id}`}
                  </option>
                ))}
              </select>

              <p className="telegram-assignment-help">
                Если игрока нет в списке, он должен один раз открыть приложение через Telegram-бота.
              </p>
            </div>

            <ImageUploadField
              value={avatarUrl}
              onChange={setAvatarUrl}
              folder="character-avatars"
              campaignId={campaignId}
              label="Аватар"
              hint="Квадратное изображение лучше всего смотрится в профиле."
            />

            <label className="field-label" htmlFor="character-bio">Короткое описание</label>
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

      {editor?.type === "role" && (
        <div className="sheet-backdrop" onMouseDown={() => setEditor(null)}>
          <form
            className="bottom-sheet assignment-sheet"
            onSubmit={submitRole}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">Роль: {editor.member.display_name}</h3>
                <p className="sheet-copy">
                  Роль не привязывает персонажа. GM может работать вообще без персонажа.
                </p>
              </div>
              <button className="sheet-close" type="button" onClick={() => setEditor(null)}>
                ×
              </button>
            </div>

            {editor.member.telegram_user_id && (
              <div className="role-telegram-card">
                <span>{editor.member.telegram_username ? `@${editor.member.telegram_username}` : "Telegram"}</span>
                <strong>TG ID {editor.member.telegram_user_id}</strong>
              </div>
            )}

            <label className="field-label" htmlFor="member-role">Роль участника</label>
            <select
              id="member-role"
              className="app-select"
              value={roleValue}
              onChange={(event) => setRoleValue(event.target.value === "gm" ? "gm" : "player")}
            >
              <option value="player">Игрок</option>
              <option value="gm">GM</option>
            </select>

            <div className="auth-note">
              В кампании остаётся один GM. Если назначить нового GM, предыдущий автоматически станет игроком. Персонажи при этом не перепривязываются.
            </div>

            {formError && <div className="auth-error">{formError}</div>}
            <button className="sheet-save" type="submit" disabled={saving}>
              {saving ? "Сохраняем…" : "Сохранить роль"}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
