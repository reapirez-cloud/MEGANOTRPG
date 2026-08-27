import { useMemo, useState } from "react"
import type { FormEvent } from "react"

import { useRooms } from "../hooks/useRooms"
import { useCharacters } from "../context/CharacterContext"
import CampaignImage from "../components/common/CampaignImage"
import ImageUploadField from "../components/common/ImageUploadField"
import ContextActionSheet, { type ContextAction } from "../components/common/ContextActionSheet"
import type { ChatRoom } from "../types/chat"
import { useLongPressItem } from "../hooks/useLongPressItem"
import { deleteCampaignMediaObject } from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import "../game-story-v2.css"

type Props = { onOpenRoom: (id: string) => void }
type Editor = { mode: "create" } | { mode: "edit"; room: ChatRoom } | null

function roomLabel(room: ChatRoom) {
  if (room.room_type === "character") return "Персональная история"
  if (room.room_type === "scene") return "Общая сцена"
  return "Флуд"
}

export default function Chats({ onOpenRoom }: Props) {
  const { canManage, campaignId, characters } = useCharacters()
  const rooms = useRooms()
  const [editor, setEditor] = useState<Editor>(null)
  const [title, setTitle] = useState("")
  const [preview, setPreview] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [menu, setMenu] = useState<ChatRoom | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChatRoom | null>(null)
  const bind = useLongPressItem<ChatRoom>((room) => setMenu(room))

  const characterMap = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  )

  const flood = rooms.rooms.filter((room) => room.room_type === "flood")
  const personal = rooms.rooms.filter((room) => room.room_type === "character")
  const scenes = rooms.rooms.filter((room) => room.room_type === "scene")

  function openCreate() {
    setTitle("")
    setPreview("")
    setError("")
    setEditor({ mode: "create" })
  }

  function openEdit(room: ChatRoom) {
    setTitle(room.title)
    setPreview(room.avatar_url || "")
    setError("")
    setEditor({ mode: "edit", room })
  }

  async function closeEditor() {
    if (editor?.mode === "create" && preview) await deleteCampaignMediaObject(preview)
    if (editor?.mode === "edit" && preview && preview !== editor.room.avatar_url) {
      await deleteCampaignMediaObject(preview)
    }
    setEditor(null)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editor) return
    setSaving(true)
    setError("")

    if (editor.mode === "create") {
      if (!title.trim()) {
        setSaving(false)
        setError("Укажи название сцены.")
        return
      }
      const result = await rooms.createSceneRoom(title)
      if (!result.ok || !result.id) {
        setSaving(false)
        setError(result.error || "Не удалось создать сцену.")
        return
      }
      if (preview) {
        const art = await rooms.setRoomAvatar(result.id, preview)
        if (!art.ok) {
          setSaving(false)
          setError(art.error || "Сцена создана, но превью не сохранилось.")
          return
        }
      }
      setSaving(false)
      setEditor(null)
      onOpenRoom(result.id)
      return
    }

    const room = editor.room
    const oldPreview = room.avatar_url
    if (room.room_type === "scene" && title.trim() !== room.title) {
      const rename = await rooms.renameRoom(room.id, title)
      if (!rename.ok) {
        setSaving(false)
        setError(rename.error || "Не удалось сохранить название.")
        return
      }
    }

    const art = await rooms.setRoomAvatar(room.id, preview || null)
    setSaving(false)
    if (!art.ok) {
      setError(art.error || "Не удалось сохранить превью.")
      return
    }
    if (oldPreview && oldPreview !== preview) void deleteCampaignMediaObject(oldPreview)
    setEditor(null)
  }

  async function remove(room: ChatRoom) {
    setSaving(true)
    setError("")
    const result = await rooms.deleteRoom(room.id)
    setSaving(false)
    if (!result.ok) {
      setError(result.error || "Не удалось удалить сцену.")
      return
    }
    if (room.avatar_url) void deleteCampaignMediaObject(room.avatar_url)
    setDeleteTarget(null)
  }

  async function setCharacterLife(room: ChatRoom, next: "alive" | "dead") {
    if (!room.character_id) return
    setSaving(true)
    setError("")
    const { error: lifeError } = await supabase.rpc("set_character_life_state", {
      p_character_id: room.character_id,
      p_life_state: next,
    })
    setSaving(false)
    setMenu(null)
    if (lifeError) {
      setError(lifeError.message)
      return
    }
    await rooms.reload()
  }

  function actions(room: ChatRoom): ContextAction[] {
    const dead = room.character_life_state === "dead"
    return [
      {
        id: "open",
        label: "Открыть",
        detail: room.is_read_only ? "История доступна только для чтения" : "Перейти в чат",
        icon: "↗",
        onSelect: () => onOpenRoom(room.id),
      },
      ...(canManage
        ? [{
            id: "edit",
            label: room.room_type === "scene" ? "Настроить сцену" : "Изменить превью",
            detail: room.room_type === "character" ? "Чат остаётся закреплён за персонажем" : "Оформление комнаты",
            icon: "✎",
            onSelect: () => openEdit(room),
          } satisfies ContextAction]
        : []),
      ...(canManage && room.room_type === "character" && room.character_id
        ? [{
            id: dead ? "revive" : "death",
            label: dead ? "Вернуть персонажа" : "Отметить погибшим",
            detail: dead ? "Снова открыть персональную игровую историю" : "Закрыть персональный чат для новых сообщений",
            icon: dead ? "↺" : "†",
            danger: !dead,
            onSelect: () => setCharacterLife(room, dead ? "alive" : "dead"),
          } satisfies ContextAction]
        : []),
      ...(canManage && room.room_type === "scene"
        ? [{
            id: "delete",
            label: "Удалить сцену",
            detail: "Сообщения и вложения будут удалены",
            icon: "×",
            danger: true,
            onSelect: () => setDeleteTarget(room),
          } satisfies ContextAction]
        : []),
    ]
  }

  function cinematicRoom(room: ChatRoom) {
    const character = room.character_id ? characterMap.get(room.character_id) : null
    const dead = room.room_type === "character" && room.character_life_state === "dead"
    return (
      <article
        {...bind(room)}
        style={{ touchAction: "pan-y" }}
        className={`game-room-card ${dead ? "game-room-card--dead" : ""}`}
        key={room.id}
      >
        <button type="button" className="game-room-card__open" onClick={() => onOpenRoom(room.id)}>
          {room.avatar_url
            ? <CampaignImage className="game-room-card__art" value={room.avatar_url} alt="" />
            : <div className="game-room-card__fallback">{room.room_type === "character" ? "◇" : "✦"}</div>}
          <span className="game-room-card__shade" />
          <span className="game-room-card__content">
            <span className="game-room-card__meta">
              <small>{roomLabel(room)}</small>
              {dead && <em>Мёртв</em>}
              {!dead && room.is_read_only && <em>Только чтение</em>}
            </span>
            <strong>{room.title}</strong>
            {character && <small className="game-room-card__character">{character.character_class} · {character.level} ур.</small>}
            <span className="game-room-card__preview">{room.preview || "Пока без сообщений"}</span>
          </span>
          <span className="game-room-card__side">
            <time>{room.time}</time>
            {room.unread_count > 0 && <b>{room.unread_count > 99 ? "99+" : room.unread_count}</b>}
          </span>
        </button>
        {canManage && (
          <button className="game-room-card__menu" type="button" onClick={() => setMenu(room)} aria-label="Действия">
            •••
          </button>
        )}
      </article>
    )
  }

  function cinematicList(items: ChatRoom[], empty: string) {
    return (
      <div className="game-room-grid">
        {items.map(cinematicRoom)}
        {!items.length && <div className="game-room-empty">{empty}</div>}
      </div>
    )
  }

  if (rooms.loading) {
    return <div className="center-state"><span className="status-spinner" /><span>Загружаем чаты…</span></div>
  }

  return (
    <>
      <div className="chats-game page-stack">
        {(error || rooms.error) && <div className="auth-error">{error || rooms.error}</div>}

        {flood.length > 0 && (
          <section className="chat-flood-section">
            <div className="game-section-head">
              <div><span>Общение</span><h3>Флуд</h3></div>
            </div>
            {flood.map((room) => (
              <button key={room.id} className="flood-room-row" type="button" onClick={() => onOpenRoom(room.id)}>
                <span className="flood-room-row__icon">◌</span>
                <span><strong>{room.title}</strong><small>{room.preview}</small></span>
                {room.unread_count > 0 && <b>{room.unread_count > 99 ? "99+" : room.unread_count}</b>}
              </button>
            ))}
          </section>
        )}

        <section>
          <div className="game-section-head">
            <div><span>Игра</span><h3>Персонажи</h3><p>Каждый чат принадлежит конкретному персонажу.</p></div>
          </div>
          {cinematicList(personal, "Персональные чаты появятся вместе с PC.")}
        </section>

        <section>
          <div className="game-section-head">
            <div><span>Игра</span><h3>Сцены</h3><p>Общие события, куда могут входить несколько персонажей.</p></div>
            {canManage && <button type="button" onClick={openCreate}>＋ Сцена</button>}
          </div>
          {cinematicList(scenes, "Общих сцен пока нет.")}
        </section>
      </div>

      {editor && (
        <div className="sheet-backdrop" onMouseDown={() => void closeEditor()}>
          <form className="bottom-sheet v2-editor-sheet chat-room-editor-v2" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <header className="v2-sheet-head">
              <div>
                <span>{editor.mode === "create" ? "Общая игровая сцена" : roomLabel(editor.room)}</span>
                <h3>{editor.mode === "create" ? "Новая сцена" : editor.room.title}</h3>
                <p>Картинка становится широким превью комнаты. Затемнение накладывается автоматически, чтобы текст всегда читался.</p>
              </div>
              <button type="button" onClick={() => void closeEditor()}>×</button>
            </header>

            <section className="v2-form-section">
              {(editor.mode === "create" || editor.room.room_type === "scene") && (
                <>
                  <label className="field-label">Название</label>
                  <input className="app-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} autoFocus />
                </>
              )}
              <ImageUploadField
                value={preview}
                onChange={setPreview}
                folder="chat-previews"
                campaignId={campaignId}
                label="Превью чата"
                hint="Лучше широкое изображение: персонаж, место или арт сцены"
              />
            </section>

            {error && <div className="auth-error">{error}</div>}
            <button className="v2-primary-button v2-full-button" type="submit" disabled={saving || (editor.mode === "create" && !title.trim())}>
              {saving ? "Сохраняем…" : editor.mode === "create" ? "Создать сцену" : "Сохранить"}
            </button>
          </form>
        </div>
      )}

      {menu && <ContextActionSheet title={menu.title} subtitle={roomLabel(menu)} actions={actions(menu)} onClose={() => setMenu(null)} />}

      {deleteTarget && (
        <div className="sheet-backdrop" onMouseDown={() => setDeleteTarget(null)}>
          <section className="bottom-sheet v2-confirm" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <span className="v2-confirm-icon">×</span>
            <h3>Удалить сцену «{deleteTarget.title}»?</h3>
            <p>Сцена, сообщения и вложения исчезнут без восстановления.</p>
            <div>
              <button type="button" onClick={() => setDeleteTarget(null)}>Отмена</button>
              <button type="button" className="is-danger" disabled={saving} onClick={() => void remove(deleteTarget)}>
                {saving ? "Удаляем…" : "Удалить"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
