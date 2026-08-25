import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"

import CharacterAvatar from "../components/characters/CharacterAvatar"
import ContextActionSheet, {
  type ContextAction,
} from "../components/common/ContextActionSheet"
import ImageUploadField from "../components/common/ImageUploadField"
import { useAuth } from "../context/AuthContext"
import {
  useCharacters,
  type Character,
} from "../context/CharacterContext"
import { useLongPressItem } from "../hooks/useLongPressItem"
import { useRooms } from "../hooks/useRooms"
import { resolveCampaignMediaUrl } from "../lib/campaignMedia"
import {
  deleteCampaignMediaObject,
  uploadCampaignFile,
} from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import type { ChatRoom } from "../types/chat"

type Props = {
  onOpenCharacter: (id: string) => void
  onOpenRoom: (id: string) => void
}

type WorkspaceTab = "desk" | "npcs" | "files" | "chats"

type GmProfile = {
  campaign_id: string
  user_id: string
  title: string
  bio: string
  avatar_url: string | null
}

type WorkspaceFolder = {
  id: string
  campaign_id: string
  workspace_user_id: string
  parent_id: string | null
  name: string
  sort_order: number
}

type WorkspaceFile = {
  id: string
  campaign_id: string
  workspace_user_id: string
  folder_id: string | null
  created_by: string
  kind: "note" | "upload"
  title: string
  body: string
  file_url: string | null
  original_name: string | null
  mime_type: string | null
  updated_at: string
}

type NpcNote = {
  character_id: string
  body: string
}

type Dialog =
  | { type: "profile" }
  | { type: "npc" }
  | { type: "folder"; folder: WorkspaceFolder | null }
  | { type: "note"; file: WorkspaceFile | null }
  | { type: "room"; room: ChatRoom }
  | null

type WorkspaceMenu =
  | { type: "npc"; item: Character }
  | { type: "folder"; item: WorkspaceFolder }
  | { type: "file"; item: WorkspaceFile }
  | { type: "room"; item: ChatRoom }

const tabs: Array<{ id: WorkspaceTab; label: string; icon: string }> = [
  { id: "desk", label: "Пульт", icon: "✦" },
  { id: "npcs", label: "NPC", icon: "♟" },
  { id: "files", label: "Материалы", icon: "▤" },
  { id: "chats", label: "Сцены", icon: "◌" },
]

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function WorkspaceDownload({ value, label }: { value: string; label: string }) {
  const [href, setHref] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void resolveCampaignMediaUrl(value).then((url) => {
      if (!cancelled) setHref(url)
    })
    return () => {
      cancelled = true
    }
  }, [value])

  if (!href) return <span className="gm-file-link gm-file-link--loading">Готовим файл…</span>
  return (
    <a className="gm-file-link" href={href} target="_blank" rel="noreferrer">
      Открыть {label} ↗
    </a>
  )
}

export default function GmWorkspace({ onOpenCharacter, onOpenRoom }: Props) {
  const { user, profile: accountProfile } = useAuth()
  const {
    campaignId,
    campaignTitle,
    characters,
    isOwner,
    createCharacter,
    deleteCharacter,
  } = useCharacters()
  const rooms = useRooms()
  const uploadRef = useRef<HTMLInputElement | null>(null)

  const [tab, setTab] = useState<WorkspaceTab>("desk")
  const [gmProfile, setGmProfile] = useState<GmProfile | null>(null)
  const [folders, setFolders] = useState<WorkspaceFolder[]>([])
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [npcNotes, setNpcNotes] = useState<Record<string, string>>({})
  const [activeNpcNote, setActiveNpcNote] = useState<string | null>(null)
  const [selectedFolder, setSelectedFolder] = useState("all")
  const [dialog, setDialog] = useState<Dialog>(null)
  const [workspaceMenu, setWorkspaceMenu] = useState<WorkspaceMenu | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")

  const [profileTitle, setProfileTitle] = useState("Ведущий")
  const [profileBio, setProfileBio] = useState("")
  const [profileAvatar, setProfileAvatar] = useState("")
  const [npcName, setNpcName] = useState("")
  const [npcRole, setNpcRole] = useState("")
  const [npcBio, setNpcBio] = useState("")
  const [npcVisibility, setNpcVisibility] = useState<"campaign" | "private">("private")
  const [folderName, setFolderName] = useState("")
  const [noteTitle, setNoteTitle] = useState("")
  const [noteBody, setNoteBody] = useState("")
  const [roomTitle, setRoomTitle] = useState("")
  const bindWorkspaceLongPress = useLongPressItem<WorkspaceMenu>((item) => {
    setWorkspaceMenu(item)
  })

  const npcs = useMemo(
    () => characters.filter((character) => character.character_type === "npc"),
    [characters],
  )

  const visibleFiles = useMemo(() => {
    if (selectedFolder === "all") return files
    if (selectedFolder === "root") return files.filter((file) => !file.folder_id)
    return files.filter((file) => file.folder_id === selectedFolder)
  }, [files, selectedFolder])

  const gameRooms = useMemo(
    () => rooms.rooms.filter((room) => room.category === "game"),
    [rooms.rooms],
  )

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setError("")

    const [profileResult, foldersResult, filesResult, notesResult] = await Promise.all([
      supabase
        .from("gm_profiles")
        .select("campaign_id, user_id, title, bio, avatar_url")
        .eq("campaign_id", campaignId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("gm_workspace_folders")
        .select("id, campaign_id, workspace_user_id, parent_id, name, sort_order")
        .eq("campaign_id", campaignId)
        .eq("workspace_user_id", user.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("gm_workspace_files")
        .select("id, campaign_id, workspace_user_id, folder_id, created_by, kind, title, body, file_url, original_name, mime_type, updated_at")
        .eq("campaign_id", campaignId)
        .eq("workspace_user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("gm_npc_notes")
        .select("character_id, body")
        .eq("campaign_id", campaignId)
        .eq("workspace_user_id", user.id),
    ])

    const firstError =
      profileResult.error || foldersResult.error || filesResult.error || notesResult.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    const nextProfile = (profileResult.data || null) as GmProfile | null
    setGmProfile(nextProfile)
    setProfileTitle(nextProfile?.title || "Ведущий")
    setProfileBio(nextProfile?.bio || "")
    setProfileAvatar(nextProfile?.avatar_url || "")
    setFolders((foldersResult.data || []) as WorkspaceFolder[])
    setFiles((filesResult.data || []) as WorkspaceFile[])
    setNpcNotes(
      Object.fromEntries(
        ((notesResult.data || []) as NpcNote[]).map((note) => [note.character_id, note.body]),
      ),
    )
    setLoading(false)
  }, [campaignId, user.id])

  useEffect(() => {
    void load()
  }, [load])

  function openProfileEditor() {
    setError("")
    setProfileTitle(gmProfile?.title || "Ведущий")
    setProfileBio(gmProfile?.bio || "")
    setProfileAvatar(gmProfile?.avatar_url || "")
    setDialog({ type: "profile" })
  }

  function openNpcEditor() {
    setError("")
    setNpcName("")
    setNpcRole("")
    setNpcBio("")
    setNpcVisibility("private")
    setDialog({ type: "npc" })
  }

  function openFolderEditor(folder: WorkspaceFolder | null = null) {
    setError("")
    setFolderName(folder?.name || "")
    setDialog({ type: "folder", folder })
  }

  function openNoteEditor(file: WorkspaceFile | null = null) {
    setError("")
    setNoteTitle(file?.title || "")
    setNoteBody(file?.body || "")
    setDialog({ type: "note", file })
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    const { error: saveError } = await supabase.from("gm_profiles").upsert(
      {
        campaign_id: campaignId,
        user_id: user.id,
        title: profileTitle.trim() || "Ведущий",
        bio: profileBio.trim(),
        avatar_url: profileAvatar.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campaign_id,user_id" },
    )
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setDialog(null)
    await load()
  }

  async function createNpc(event: FormEvent) {
    event.preventDefault()
    if (!npcName.trim()) return
    setSaving(true)
    setError("")
    const result = await createCharacter({
      name: npcName,
      character_class: npcRole || "NPC",
      level: 1,
      bio: npcBio,
      avatar_url: null,
      assigned_user_id: null,
      character_type: "npc",
      visibility: npcVisibility,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error || "Не удалось создать NPC.")
      return
    }
    setDialog(null)
    setTab("npcs")
  }

  async function saveFolder(event: FormEvent) {
    event.preventDefault()
    if (!folderName.trim() || dialog?.type !== "folder") return
    setSaving(true)
    setError("")
    const query = dialog.folder
      ? supabase
          .from("gm_workspace_folders")
          .update({ name: folderName.trim(), updated_at: new Date().toISOString() })
          .eq("id", dialog.folder.id)
      : supabase.from("gm_workspace_folders").insert({
          campaign_id: campaignId,
          workspace_user_id: user.id,
          name: folderName.trim(),
        })
    const { error: saveError } = await query
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setDialog(null)
    await load()
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault()
    if (dialog?.type !== "note" || !noteTitle.trim()) return
    setSaving(true)
    setError("")

    const payload = {
      campaign_id: campaignId,
      workspace_user_id: user.id,
      folder_id:
        selectedFolder !== "all" && selectedFolder !== "root" ? selectedFolder : null,
      created_by: user.id,
      kind: "note" as const,
      title: noteTitle.trim(),
      body: noteBody.trim(),
      updated_at: new Date().toISOString(),
    }

    const query = dialog.file
      ? supabase.from("gm_workspace_files").update(payload).eq("id", dialog.file.id)
      : supabase.from("gm_workspace_files").insert(payload)
    const { error: saveError } = await query
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setDialog(null)
    await load()
  }

  async function uploadFile(file: File | null) {
    if (!file) return
    setUploading(true)
    setError("")
    const upload = await uploadCampaignFile(file, "gm-private", campaignId)
    if (!upload.ok) {
      setUploading(false)
      setError(upload.error)
      return
    }

    const { error: saveError } = await supabase.from("gm_workspace_files").insert({
      campaign_id: campaignId,
      workspace_user_id: user.id,
      folder_id:
        selectedFolder !== "all" && selectedFolder !== "root" ? selectedFolder : null,
      created_by: user.id,
      kind: "upload",
      title: file.name.replace(/\.[^.]+$/, "").slice(0, 160) || "Файл",
      file_url: upload.url,
      original_name: file.name.slice(0, 240),
      mime_type: file.type || null,
    })
    setUploading(false)
    if (saveError) {
      await deleteCampaignMediaObject(upload.url)
      setError(saveError.message)
      return
    }
    await load()
  }

  async function saveNpcNote(characterId: string) {
    setSaving(true)
    setError("")
    const { error: saveError } = await supabase.from("gm_npc_notes").upsert(
      {
        character_id: characterId,
        campaign_id: campaignId,
        workspace_user_id: user.id,
        body: npcNotes[characterId]?.trim() || "",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "character_id,workspace_user_id" },
    )
    setSaving(false)
    if (saveError) setError(saveError.message)
  }

  async function removeFile(file: WorkspaceFile) {
    if (!window.confirm(`Удалить «${file.title}»?`)) return
    setError("")
    const { error: deleteError } = await supabase
      .from("gm_workspace_files")
      .delete()
      .eq("id", file.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    if (file.file_url) await deleteCampaignMediaObject(file.file_url)
    await load()
  }

  async function removeFolder(folder: WorkspaceFolder) {
    if (!window.confirm(`Удалить папку «${folder.name}»? Материалы останутся без папки.`)) return
    setError("")
    const { error: deleteError } = await supabase
      .from("gm_workspace_folders")
      .delete()
      .eq("id", folder.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setSelectedFolder("all")
    await load()
  }

  async function createRoom(event: FormEvent) {
    event.preventDefault()
    if (!roomTitle.trim()) return
    setSaving(true)
    setError("")
    const result = await rooms.createGameRoom(roomTitle)
    setSaving(false)
    if (!result.ok) {
      setError(result.error || "Не удалось создать чат.")
      return
    }
    setRoomTitle("")
    if (result.id) onOpenRoom(result.id)
  }

  async function saveRoom(event: FormEvent) {
    event.preventDefault()
    if (dialog?.type !== "room" || !roomTitle.trim()) return
    setSaving(true)
    setError("")
    const result = await rooms.renameRoom(dialog.room.id, roomTitle)
    setSaving(false)
    if (!result.ok) {
      setError(result.error || "Не удалось переименовать чат.")
      return
    }
    setDialog(null)
  }

  async function removeNpc(npc: Character) {
    if (!window.confirm(`Удалить NPC «${npc.name}» и все связанные данные?`)) return
    const result = await deleteCharacter(npc.id)
    if (!result.ok) setError(result.error || "Не удалось удалить NPC.")
  }

  async function removeRoom(room: ChatRoom) {
    if (!window.confirm(`Удалить чат «${room.title}» вместе с сообщениями?`)) return
    const result = await rooms.deleteRoom(room.id)
    if (!result.ok) setError(result.error || "Не удалось удалить чат.")
  }

  function workspaceActions(target: WorkspaceMenu): ContextAction[] {
    if (target.type === "npc") {
      const npc = target.item
      return [
        {
          id: "open",
          label: "Открыть NPC",
          detail: "Профиль, лист и игровые данные",
          icon: "↗",
          onSelect: () => onOpenCharacter(npc.id),
        },
        {
          id: "note",
          label: "Секретная заметка",
          detail: "Эту заметку видишь только ты",
          icon: "✎",
          onSelect: () => {
            setTab("npcs")
            setActiveNpcNote(npc.id)
          },
        },
        {
          id: "delete",
          label: "Удалить NPC",
          detail: "NPC и связанные игровые данные будут удалены",
          icon: "×",
          danger: true,
          onSelect: () => removeNpc(npc),
        },
      ]
    }

    if (target.type === "folder") {
      const folder = target.item
      return [
        {
          id: "open",
          label: "Открыть папку",
          detail: "Показать материалы внутри",
          icon: "▤",
          onSelect: () => {
            setTab("files")
            setSelectedFolder(folder.id)
          },
        },
        {
          id: "rename",
          label: "Переименовать",
          detail: "Изменить название папки",
          icon: "✎",
          onSelect: () => openFolderEditor(folder),
        },
        {
          id: "delete",
          label: "Удалить папку",
          detail: "Материалы останутся без папки",
          icon: "×",
          danger: true,
          onSelect: () => removeFolder(folder),
        },
      ]
    }

    if (target.type === "file") {
      const file = target.item
      return [
        ...(file.kind === "note"
          ? [{
              id: "edit",
              label: "Редактировать заметку",
              detail: "Изменить заголовок и содержание",
              icon: "✎",
              onSelect: () => openNoteEditor(file),
            }]
          : []),
        {
          id: "delete",
          label: file.kind === "note" ? "Удалить заметку" : "Удалить файл",
          detail: "Удаление нельзя будет отменить",
          icon: "×",
          danger: true,
          onSelect: () => removeFile(file),
        },
      ]
    }

    const room = target.item
    return [
      {
        id: "open",
        label: "Открыть чат",
        detail: "Перейти к игровой сцене",
        icon: "↗",
        onSelect: () => onOpenRoom(room.id),
      },
      {
        id: "rename",
        label: "Переименовать",
        detail: "Изменить название игровой сцены",
        icon: "✎",
        onSelect: () => {
          setRoomTitle(room.title)
          setDialog({ type: "room", room })
        },
      },
      {
        id: "delete",
        label: "Удалить чат",
        detail: "Комната и её сообщения будут удалены",
        icon: "×",
        danger: true,
        onSelect: () => removeRoom(room),
      },
    ]
  }

  function workspaceMenuTitle(target: WorkspaceMenu) {
    if (target.type === "npc") return target.item.name
    if (target.type === "folder") return target.item.name
    return target.item.title
  }

  if (loading) {
    return <div className="center-state"><span className="status-spinner" /><span>Открываем рабочее место…</span></div>
  }

  return (
    <>
      <div className="gm-workspace page-stack">
        <section className="gm-profile-card surface">
          <div className="gm-profile-card__glow" />
          <CharacterAvatar
            character={{
              name: accountProfile.display_name,
              avatar_url: gmProfile?.avatar_url || null,
            }}
            size="large"
          />
          <div className="gm-profile-card__copy">
            <span>{isOwner ? "Владелец · режим ведущего" : "Гейм-мастер"}</span>
            <h2>{accountProfile.display_name}</h2>
            <strong>{gmProfile?.title || "Ведущий"}</strong>
            <p>{gmProfile?.bio || `Рабочее пространство кампании «${campaignTitle}».`}</p>
          </div>
          <button className="gm-profile-edit" type="button" onClick={openProfileEditor} aria-label="Изменить профиль ГМ">✎</button>
        </section>

        <nav className="gm-workspace-tabs" aria-label="Разделы рабочего места">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "gm-workspace-tab gm-workspace-tab--active" : "gm-workspace-tab"}
              onClick={() => setTab(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {error && <div className="auth-error">{error}</div>}

        {tab === "desk" && (
          <>
            <section className="gm-desk-grid">
              <button className="gm-tool-card surface" type="button" onClick={openNpcEditor}>
                <span className="gm-tool-card__icon">♟</span>
                <strong>Создать NPC</strong>
                <small>{npcs.length} в кампании</small>
              </button>
              <button className="gm-tool-card surface" type="button" onClick={() => { setTab("files"); openNoteEditor() }}>
                <span className="gm-tool-card__icon">✎</span>
                <strong>Новая заметка</strong>
                <small>{files.filter((file) => file.kind === "note").length} сохранено</small>
              </button>
              <button className="gm-tool-card surface" type="button" onClick={() => setTab("chats")}>
                <span className="gm-tool-card__icon">◌</span>
                <strong>Игровая сцена</strong>
                <small>{gameRooms.length} чатов</small>
              </button>
              <button className="gm-tool-card surface" type="button" onClick={() => { setTab("files"); uploadRef.current?.click() }}>
                <span className="gm-tool-card__icon">⇧</span>
                <strong>Загрузить файл</strong>
                <small>Приватные материалы</small>
              </button>
            </section>

            <section className="section">
              <div className="section-head"><div><h3 className="section-title">Под рукой</h3><p className="item-meta">Последние наработки и сцены</p></div></div>
              <div className="gm-recent-list surface">
                {files.slice(0, 3).map((file) => (
                  <button
                    {...bindWorkspaceLongPress({ type: "file", item: file })}
                    key={file.id}
                    type="button"
                    onClick={() => { setTab("files"); if (file.kind === "note") openNoteEditor(file) }}
                    style={{ touchAction: "pan-y" }}
                  >
                    <span>{file.kind === "note" ? "✎" : "▧"}</span>
                    <span><strong>{file.title}</strong><small>{formatUpdated(file.updated_at)}</small></span>
                    <em>›</em>
                  </button>
                ))}
                {files.length === 0 && <div className="gm-inline-empty">Добавь первую заметку или файл для подготовки.</div>}
              </div>
            </section>
          </>
        )}

        {tab === "npcs" && (
          <section className="section">
            <div className="section-head">
              <div><h3 className="section-title">NPC кампании</h3><p className="item-meta">Публичные профили и закрытые заметки ведущих</p></div>
              <button className="section-link" type="button" onClick={openNpcEditor}>+ NPC</button>
            </div>
            <div className="gm-npc-list">
              {npcs.map((npc) => (
                <article
                  {...bindWorkspaceLongPress({ type: "npc", item: npc })}
                  className="gm-npc-card surface"
                  key={npc.id}
                  style={{ touchAction: "pan-y" }}
                >
                  <button className="gm-npc-card__main" type="button" onClick={() => onOpenCharacter(npc.id)}>
                    <CharacterAvatar character={npc} size="large" />
                    <span><strong>{npc.name}</strong><small>{npc.character_class} · {npc.visibility === "private" ? "только я" : "виден игрокам"}</small><p>{npc.bio || "Без публичного описания."}</p></span>
                    <em>›</em>
                  </button>
                  <button className="gm-npc-note-toggle" type="button" onClick={() => setActiveNpcNote(activeNpcNote === npc.id ? null : npc.id)}>
                    {activeNpcNote === npc.id ? "Скрыть заметку" : "Секретная заметка"}
                  </button>
                  {activeNpcNote === npc.id && (
                    <div className="gm-npc-note-editor">
                      <textarea
                        className="app-textarea"
                        value={npcNotes[npc.id] || ""}
                        onChange={(event) => setNpcNotes((current) => ({ ...current, [npc.id]: event.target.value }))}
                        placeholder="Мотивы, секреты, реплики, планы…"
                        maxLength={12000}
                      />
                      <button className="secondary-action-button" type="button" disabled={saving} onClick={() => void saveNpcNote(npc.id)}>Сохранить заметку</button>
                    </div>
                  )}
                </article>
              ))}
              {npcs.length === 0 && <div className="character-empty surface">NPC пока нет. Создай первого прямо здесь.</div>}
            </div>
          </section>
        )}

        {tab === "files" && (
          <section className="section">
            <div className="section-head">
              <div><h3 className="section-title">Материалы ГМ</h3><p className="item-meta">Эти записи и файлы видишь только ты</p></div>
              <div className="section-actions">
                <button className="section-link" type="button" onClick={() => openFolderEditor()}>+ Папка</button>
                <button className="section-link" type="button" onClick={() => openNoteEditor()}>+ Заметка</button>
              </div>
            </div>

            <div className="gm-folder-rail">
              <button type="button" className={selectedFolder === "all" ? "active" : ""} onClick={() => setSelectedFolder("all")}>Все</button>
              <button type="button" className={selectedFolder === "root" ? "active" : ""} onClick={() => setSelectedFolder("root")}>Без папки</button>
              {folders.map((folder) => (
                <button
                  {...bindWorkspaceLongPress({ type: "folder", item: folder })}
                  key={folder.id}
                  type="button"
                  className={selectedFolder === folder.id ? "active" : ""}
                  onClick={() => setSelectedFolder(folder.id)}
                  style={{ touchAction: "pan-y" }}
                >
                  ▤ {folder.name}
                </button>
              ))}
            </div>

            <div className="gm-file-toolbar surface">
              <div><strong>{selectedFolder === "all" ? "Все материалы" : selectedFolder === "root" ? "Без папки" : folders.find((folder) => folder.id === selectedFolder)?.name}</strong><small>{visibleFiles.length} элементов</small></div>
              <div className="gm-file-toolbar__actions">
                {selectedFolder !== "all" && selectedFolder !== "root" && (
                  <button
                    className="gm-folder-delete"
                    type="button"
                    aria-label="Удалить выбранную папку"
                    onClick={() => {
                      const folder = folders.find((item) => item.id === selectedFolder)
                      if (folder) void removeFolder(folder)
                    }}
                  >
                    ×
                  </button>
                )}
                <button type="button" onClick={() => uploadRef.current?.click()} disabled={uploading}>{uploading ? "Загрузка…" : "⇧ Файл"}</button>
              </div>
            </div>

            <div className="gm-file-list">
              {visibleFiles.map((file) => (
                <article
                  {...bindWorkspaceLongPress({ type: "file", item: file })}
                  className="gm-file-card surface"
                  key={file.id}
                  style={{ touchAction: "pan-y" }}
                >
                  <div className="gm-file-card__icon">{file.kind === "note" ? "✎" : "▧"}</div>
                  <div className="gm-file-card__copy">
                    <strong>{file.title}</strong>
                    <small>{file.kind === "note" ? "Заметка" : file.original_name || "Файл"} · {formatUpdated(file.updated_at)}</small>
                    {file.kind === "note" && file.body && <p>{file.body}</p>}
                    {file.kind === "upload" && file.file_url && <WorkspaceDownload value={file.file_url} label={file.original_name || "файл"} />}
                  </div>
                  <div className="gm-file-card__actions">
                    {file.kind === "note" && <button type="button" onClick={() => openNoteEditor(file)}>✎</button>}
                    <button type="button" onClick={() => void removeFile(file)}>×</button>
                  </div>
                </article>
              ))}
              {visibleFiles.length === 0 && <div className="character-empty surface">В этом разделе пока пусто.</div>}
            </div>
          </section>
        )}

        {tab === "chats" && (
          <section className="section">
            <div className="section-head"><div><h3 className="section-title">Игровые сцены</h3><p className="item-meta">Создай комнату, затем настрой доступ игроков</p></div></div>
            <form className="gm-room-create surface" onSubmit={createRoom}>
              <input className="app-input" value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} placeholder="Название новой сцены" maxLength={120} />
              <button type="submit" disabled={saving || !roomTitle.trim()}>Создать</button>
            </form>
            <div className="gm-room-list surface">
              {gameRooms.map((room) => (
                <button
                  {...bindWorkspaceLongPress({ type: "room", item: room })}
                  type="button"
                  key={room.id}
                  onClick={() => onOpenRoom(room.id)}
                  style={{ touchAction: "pan-y" }}
                >
                  <span className="gm-room-list__icon">◌</span>
                  <span><strong>{room.title}</strong><small>{room.preview || "Открыть сцену и настроить участников"}</small></span>
                  {room.unread_count > 0 && <em>{room.unread_count}</em>}
                  <b>›</b>
                </button>
              ))}
              {gameRooms.length === 0 && <div className="gm-inline-empty">Игровых сцен пока нет.</div>}
            </div>
          </section>
        )}

        <input
          ref={uploadRef}
          className="media-hidden-input"
          type="file"
          accept="image/*,.pdf,.txt,.md,.doc,.docx,.xls,.xlsx,.zip"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] || null
            event.currentTarget.value = ""
            void uploadFile(file)
          }}
        />
      </div>

      {dialog?.type === "profile" && (
        <div className="sheet-backdrop" onMouseDown={() => setDialog(null)}>
          <form className="bottom-sheet gm-editor-sheet" onSubmit={saveProfile} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head"><div><h3 className="sheet-title">Профиль ГМ</h3><p className="sheet-copy">Твоя рабочая подпись внутри кампании.</p></div><button className="sheet-close" type="button" onClick={() => setDialog(null)}>×</button></div>
            <label className="field-label">Роль / подпись</label>
            <input className="app-input" value={profileTitle} onChange={(event) => setProfileTitle(event.target.value)} maxLength={100} />
            <label className="field-label">О себе как о ведущем</label>
            <textarea className="app-textarea" value={profileBio} onChange={(event) => setProfileBio(event.target.value)} maxLength={1200} />
            <ImageUploadField value={profileAvatar} onChange={setProfileAvatar} folder="gm-profile" campaignId={campaignId} label="Аватар ГМ" />
            {error && <div className="auth-error">{error}</div>}
            <button className="sheet-save" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
          </form>
        </div>
      )}

      {dialog?.type === "npc" && (
        <div className="sheet-backdrop" onMouseDown={() => setDialog(null)}>
          <form className="bottom-sheet gm-editor-sheet" onSubmit={createNpc} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head"><div><h3 className="sheet-title">Новый NPC</h3><p className="sheet-copy">NPC с отметкой «Только я» не увидят игроки, другие ГМ и владелец.</p></div><button className="sheet-close" type="button" onClick={() => setDialog(null)}>×</button></div>
            <label className="field-label">Имя</label>
            <input className="app-input" value={npcName} onChange={(event) => setNpcName(event.target.value)} maxLength={80} autoFocus />
            <label className="field-label">Роль / архетип</label>
            <input className="app-input" value={npcRole} onChange={(event) => setNpcRole(event.target.value)} placeholder="Трактирщик, антагонист, союзник…" maxLength={120} />
            <label className="field-label">Публичное описание</label>
            <textarea className="app-textarea" value={npcBio} onChange={(event) => setNpcBio(event.target.value)} maxLength={1200} />
            <label className="field-label">Видимость</label>
            <select className="app-select" value={npcVisibility} onChange={(event) => setNpcVisibility(event.target.value === "campaign" ? "campaign" : "private")}>
              <option value="private">Только я</option>
              <option value="campaign">Виден всей кампании</option>
            </select>
            {error && <div className="auth-error">{error}</div>}
            <button className="sheet-save" type="submit" disabled={saving || !npcName.trim()}>{saving ? "Создаём…" : "Создать NPC"}</button>
          </form>
        </div>
      )}

      {dialog?.type === "folder" && (
        <div className="sheet-backdrop" onMouseDown={() => setDialog(null)}>
          <form className="bottom-sheet compact-editor-sheet" onSubmit={saveFolder} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head"><div><h3 className="sheet-title">{dialog.folder ? "Переименовать папку" : "Новая папка"}</h3><p className="sheet-copy">Например: «Сессия 8», «Злодеи» или «Карты».</p></div><button className="sheet-close" type="button" onClick={() => setDialog(null)}>×</button></div>
            <input className="app-input" value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Название папки" maxLength={120} autoFocus />
            {error && <div className="auth-error">{error}</div>}
            <button className="sheet-save" type="submit" disabled={saving || !folderName.trim()}>{saving ? "Сохраняем…" : dialog.folder ? "Сохранить" : "Создать папку"}</button>
          </form>
        </div>
      )}

      {dialog?.type === "note" && (
        <div className="sheet-backdrop" onMouseDown={() => setDialog(null)}>
          <form className="bottom-sheet gm-note-sheet" onSubmit={saveNote} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head"><div><h3 className="sheet-title">{dialog.file ? "Редактировать заметку" : "Новая заметка"}</h3><p className="sheet-copy">Черновик не публикуется в ленте и не виден игрокам.</p></div><button className="sheet-close" type="button" onClick={() => setDialog(null)}>×</button></div>
            <input className="app-input" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Заголовок" maxLength={160} autoFocus />
            <textarea className="app-textarea gm-note-body" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="План сцены, реплики, секреты, последствия…" maxLength={30000} />
            {error && <div className="auth-error">{error}</div>}
            <button className="sheet-save" type="submit" disabled={saving || !noteTitle.trim()}>{saving ? "Сохраняем…" : "Сохранить заметку"}</button>
          </form>
        </div>
      )}

      {dialog?.type === "room" && (
        <div className="sheet-backdrop" onMouseDown={() => setDialog(null)}>
          <form className="bottom-sheet compact-editor-sheet" onSubmit={saveRoom} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head"><div><h3 className="sheet-title">Переименовать чат</h3><p className="sheet-copy">Название изменится у всех участников комнаты.</p></div><button className="sheet-close" type="button" onClick={() => setDialog(null)}>×</button></div>
            <input className="app-input" value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} maxLength={120} autoFocus />
            {error && <div className="auth-error">{error}</div>}
            <button className="sheet-save" type="submit" disabled={saving || !roomTitle.trim()}>{saving ? "Сохраняем…" : "Сохранить"}</button>
          </form>
        </div>
      )}

      {workspaceMenu && (
        <ContextActionSheet
          title={workspaceMenuTitle(workspaceMenu)}
          subtitle="Долгое нажатие открывает действия"
          actions={workspaceActions(workspaceMenu)}
          onClose={() => setWorkspaceMenu(null)}
        />
      )}
    </>
  )
}
