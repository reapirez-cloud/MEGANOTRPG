import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useAuth } from "../context/AuthContext"
import { useCharacters, type Character } from "../context/CharacterContext"
import { useRooms } from "../hooks/useRooms"
import { useChatActors } from "../hooks/useChatActors"
import { useNpcZoneHabitats } from "../hooks/useNpcZoneHabitats"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import CharacterCreationWizard, { type CharacterWizardTarget } from "../components/characters/CharacterCreationWizard"
import CampaignImage from "../components/common/CampaignImage"
import ContextActionSheet from "../components/common/ContextActionSheet"
import type { ContextAction } from "../components/common/ContextActionSheet"
import { NpcHabitatZonesSheet } from "../components/world/NpcZoneHabitatSheet"
import { useLongPressItem } from "../hooks/useLongPressItem"
import { supabase } from "../lib/supabase"
import { deleteCampaignMediaObject, uploadCampaignFile } from "../lib/mediaUpload"
import { resolveCampaignMediaUrl } from "../lib/campaignMedia"

type Props = { onOpenCharacter: (id: string) => void; onOpenRoom: (id: string) => void }
type Tab = "characters" | "members" | "chats" | "materials"
type CharFilter = "all" | "active" | "inactive" | "npc" | "private"
type FileRow = { id: string; folder_id: string | null; kind: "note" | "upload"; title: string; body: string; file_url: string | null; original_name: string | null; mime_type: string | null; updated_at: string }
type FolderRow = { id: string; name: string; sort_order: number }

function MaterialLink({ value, label }: { value: string; label: string }) {
  const [href, setHref] = useState<string | null>(null)
  useEffect(() => {
    let cancel = false
    void resolveCampaignMediaUrl(value).then((url) => { if (!cancel) setHref(url) })
    return () => { cancel = true }
  }, [value])
  return href ? <a className="control-file-link" href={href} target="_blank" rel="noreferrer">Открыть {label} ↗</a> : <span className="control-file-link">Готовим ссылку…</span>
}

export default function GmWorkspace({ onOpenCharacter, onOpenRoom }: Props) {
  const { user } = useAuth()
  const { campaignId, campaignTitle, characters, members, isOwner, refresh, createInvite, updateCharacter, deleteCharacter, setActiveForMember, setMemberRole } = useCharacters()
  const rooms = useRooms()
  const chatActors = useChatActors()
  const habitats = useNpcZoneHabitats()

  const [tab, setTab] = useState<Tab>("characters")
  const [filter, setFilter] = useState<CharFilter>("all")
  const [query, setQuery] = useState("")
  const [editor, setEditor] = useState<CharacterWizardTarget | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null)
  const [zoneNpcTarget, setZoneNpcTarget] = useState<Character | null>(null)
  const [invite, setInvite] = useState("")
  const [memberEdit, setMemberEdit] = useState<string | null>(null)
  const [memberRole, setMemberRoleValue] = useState<"gm" | "player">("player")
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [folder, setFolder] = useState("all")
  const [noteOpen, setNoteOpen] = useState<FileRow | null | "new">(null)
  const [noteTitle, setNoteTitle] = useState("")
  const [noteBody, setNoteBody] = useState("")
  const [folderEditor, setFolderEditor] = useState<FolderRow | "new" | null>(null)
  const [folderName, setFolderName] = useState("")
  const [folderMenu, setFolderMenu] = useState<FolderRow | null>(null)
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<FolderRow | null>(null)
  const uploadRef = useRef<HTMLInputElement | null>(null)
  const [roomCreate, setRoomCreate] = useState(false)
  const [roomTitle, setRoomTitle] = useState("")

  const activeIds = useMemo(() => new Set(members.map((member) => member.active_character_id).filter(Boolean)), [members])
  const visibleCharacters = useMemo(() => characters.filter((character) => {
    const q = query.trim().toLocaleLowerCase("ru-RU")
    if (q && !`${character.name} ${character.character_class} ${character.bio}`.toLocaleLowerCase("ru-RU").includes(q)) return false
    if (filter === "active") return character.character_type === "pc" && activeIds.has(character.id)
    if (filter === "inactive") return character.character_type === "pc" && !activeIds.has(character.id)
    if (filter === "npc") return character.character_type === "npc"
    if (filter === "private") return character.visibility === "private"
    return true
  }), [activeIds, characters, filter, query])

  const loadMaterials = useCallback(async () => {
    const [folderResult, fileResult] = await Promise.all([
      supabase.from("gm_workspace_folders").select("id,name,sort_order").eq("campaign_id", campaignId).eq("workspace_user_id", user.id).order("sort_order"),
      supabase.from("gm_workspace_files").select("id,folder_id,kind,title,body,file_url,original_name,mime_type,updated_at").eq("campaign_id", campaignId).eq("workspace_user_id", user.id).order("updated_at", { ascending: false }),
    ])
    if (folderResult.error || fileResult.error) { setError((folderResult.error || fileResult.error)!.message); return }
    setFolders((folderResult.data || []) as FolderRow[])
    setFiles((fileResult.data || []) as FileRow[])
  }, [campaignId, user.id])

  useEffect(() => {
    if (tab !== "materials") return
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void loadMaterials() })
    return () => { cancelled = true }
  }, [loadMaterials, tab])

  const openFolderMenu = useCallback((item: FolderRow) => setFolderMenu(item), [])
  const bindFolderLongPress = useLongPressItem(openFolderMenu)

  const visibleFiles = folder === "all" ? files : folder === "root" ? files.filter((file) => !file.folder_id) : files.filter((file) => file.folder_id === folder)

  function createChar(kind: "pc" | "npc") { setError(""); setEditor({ mode: "create", type: kind }) }
  function editChar(character: Character) { setError(""); setEditor({ mode: "edit", character }) }

  async function removeCharacter() {
    if (!deleteTarget) return
    setSaving(true)
    const result = await deleteCharacter(deleteTarget.id)
    setSaving(false)
    if (!result.ok) { setError(result.error || "Не удалось удалить персонажа."); return }
    if (deleteTarget.avatar_url) void deleteCampaignMediaObject(deleteTarget.avatar_url)
    setDeleteTarget(null)
  }

  async function toggleActive(character: Character) {
    if (!character.assigned_user_id) return
    const active = activeIds.has(character.id)
    const result = await setActiveForMember(character.assigned_user_id, active ? null : character.id)
    if (!result.ok) setError(result.error || "Не удалось изменить активность.")
  }

  async function toggleNpcHabitat(npc: Character, zoneId: string, attached: boolean) {
    const result = await habitats.setAttached(npc.id, zoneId, attached)
    if (!result.ok) setError(result.error || "Не удалось изменить обычную зону NPC.")
  }

  async function makeInvite() {
    const result = await createInvite()
    if (!result.ok || !result.code) { setError(result.error || "Не удалось создать приглашение."); return }
    setInvite(result.code)
    try { await navigator.clipboard.writeText(result.code) } catch { /* clipboard may be unavailable */ }
  }

  function openMember(id: string) {
    const member = members.find((item) => item.user_id === id)
    if (!member) return
    setMemberRoleValue(member.role)
    setMemberEdit(id)
    setError("")
  }

  async function saveMemberRole() {
    if (!memberEdit) return
    const result = await setMemberRole(memberEdit, memberRole)
    if (!result.ok) { setError(result.error || "Не удалось изменить роль."); return }
    setMemberEdit(null)
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault()
    if (!noteOpen || !noteTitle.trim()) return
    setSaving(true)
    const payload = { campaign_id: campaignId, workspace_user_id: user.id, folder_id: folder !== "all" && folder !== "root" ? folder : null, created_by: user.id, kind: "note", title: noteTitle.trim(), body: noteBody.trim(), updated_at: new Date().toISOString() }
    const result = noteOpen === "new" ? await supabase.from("gm_workspace_files").insert(payload) : await supabase.from("gm_workspace_files").update(payload).eq("id", noteOpen.id)
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    setNoteOpen(null)
    await loadMaterials()
  }

  async function uploadFile(file: File | null) {
    if (!file) return
    setSaving(true)
    const upload = await uploadCampaignFile(file, "gm-private", campaignId)
    if (!upload.ok) { setSaving(false); setError(upload.error); return }
    const { error: uploadError } = await supabase.from("gm_workspace_files").insert({ campaign_id: campaignId, workspace_user_id: user.id, folder_id: folder !== "all" && folder !== "root" ? folder : null, created_by: user.id, kind: "upload", title: file.name.replace(/\.[^.]+$/, ""), file_url: upload.url, original_name: file.name, mime_type: file.type || null })
    setSaving(false)
    if (uploadError) { await deleteCampaignMediaObject(upload.url); setError(uploadError.message); return }
    await loadMaterials()
  }

  async function deleteFile(file: FileRow) {
    const { error: deleteError } = await supabase.from("gm_workspace_files").delete().eq("id", file.id)
    if (deleteError) { setError(deleteError.message); return }
    if (file.file_url) void deleteCampaignMediaObject(file.file_url)
    await loadMaterials()
  }

  function editFolder(target: FolderRow | "new") {
    setFolderName(target === "new" ? "" : target.name)
    setFolderEditor(target)
    setError("")
  }

  async function saveFolder(event: FormEvent) {
    event.preventDefault()
    if (!folderEditor || !folderName.trim()) return
    setSaving(true)
    const query = folderEditor === "new"
      ? supabase.from("gm_workspace_folders").insert({ campaign_id: campaignId, workspace_user_id: user.id, name: folderName.trim() })
      : supabase.from("gm_workspace_folders").update({ name: folderName.trim() }).eq("id", folderEditor.id).eq("campaign_id", campaignId).eq("workspace_user_id", user.id)
    const { error: folderError } = await query
    setSaving(false)
    if (folderError) { setError(folderError.message); return }
    setFolderEditor(null)
    await loadMaterials()
  }

  async function deleteFolder() {
    if (!folderDeleteTarget) return
    setSaving(true)
    const { error: folderError } = await supabase.from("gm_workspace_folders").delete().eq("id", folderDeleteTarget.id).eq("campaign_id", campaignId).eq("workspace_user_id", user.id)
    setSaving(false)
    if (folderError) { setError(folderError.message); return }
    if (folder === folderDeleteTarget.id) setFolder("root")
    setFolderDeleteTarget(null)
    await loadMaterials()
  }

  async function createRoom(event: FormEvent) {
    event.preventDefault()
    const result = await rooms.createGameRoom(roomTitle)
    if (!result.ok) { setError(result.error || "Не удалось создать чат."); return }
    setRoomCreate(false)
    setRoomTitle("")
    if (result.id) onOpenRoom(result.id)
  }

  const tabs: Array<[Tab, string, string]> = [
    ["characters", "Персонажи", String(characters.length)],
    ["members", "Участники", String(members.length)],
    ["chats", "Чаты", String(rooms.rooms.length)],
    ["materials", "Материалы", String(files.length)],
  ]

  const folderActions: ContextAction[] = folderMenu ? [
    { id: "open", icon: "▤", label: "Открыть папку", detail: "Показать её заметки и файлы", onSelect: () => setFolder(folderMenu.id) },
    { id: "rename", icon: "✎", label: "Переименовать", detail: "Изменить название папки", onSelect: () => editFolder(folderMenu) },
    { id: "delete", icon: "×", label: "Удалить папку", detail: "Материалы останутся без папки", danger: true, onSelect: () => setFolderDeleteTarget(folderMenu) },
  ] : []

  return <>
    <div className="control-center">
      <header className="control-center-head"><span>Управление кампанией</span><h2>{campaignTitle}</h2><p>Игровая витрина отдельно. Здесь — всё, что относится к управлению.</p></header>
      <nav className="control-tabs">{tabs.map(([id, label, count]) => <button type="button" className={tab === id ? "is-active" : ""} key={id} onClick={() => setTab(id)}><span>{label}</span><small>{count}</small></button>)}</nav>
      {(error || habitats.error) && <div className="auth-error">{error || habitats.error}</div>}

      {tab === "characters" && <section className="control-section">
        <div className="control-toolbar"><label className="control-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти персонажа"/></label><div className="control-create"><button type="button" onClick={() => createChar("pc")}>＋ PC</button><button type="button" onClick={() => createChar("npc")}>＋ NPC</button></div></div>
        <div className="control-filter-rail">{(["all", "active", "inactive", "npc", "private"] as CharFilter[]).map((id) => <button type="button" className={filter === id ? "is-active" : ""} onClick={() => setFilter(id)} key={id}>{id === "all" ? "Все" : id === "active" ? "Активные" : id === "inactive" ? "Неактивные" : id === "npc" ? "NPC" : "Только я"}</button>)}</div>
        <div className="control-character-list">{visibleCharacters.map((character) => {
          const member = character.assigned_user_id ? members.find((item) => item.user_id === character.assigned_user_id) : null
          const active = activeIds.has(character.id)
          const bound = chatActors.boundIds.has(character.id)
          const bindable = chatActors.bindableCharacters.some((item) => item.id === character.id)
          const habitatCount = character.character_type === "npc" ? habitats.zonesForNpc(character.id).length : 0
          return <article className="control-character-row" key={character.id}>
            <button className="control-character-main" type="button" onClick={() => onOpenCharacter(character.id)}><CharacterAvatar character={character} size="large"/><span><span className="control-character-name"><strong>{character.name}</strong>{active && <i>Активен</i>}{character.character_type === "npc" && <i>NPC</i>}{character.visibility === "private" && <i>Только я</i>}</span><small>{character.character_class} · {character.level} ур.{member ? ` · ${member.display_name}` : ""}</small><p>{character.bio || "Без описания"}</p></span><em>›</em></button>
            <div className="control-character-actions">{character.character_type === "pc" && member && <button type="button" className={active ? "is-active" : ""} onClick={() => void toggleActive(character)}>{active ? "Убрать из активных" : "Сделать активным"}</button>}{character.character_type === "npc" && <button type="button" className="npc-zone-action" onClick={() => setZoneNpcTarget(character)}>Отправить в зону{habitatCount ? ` · ${habitatCount}` : ""}</button>}{bindable && <button type="button" className={bound ? "is-active" : ""} onClick={() => void chatActors.setBinding(character.id, !bound)}>{bound ? "✓ Личность чата" : "Говорить в чате"}</button>}<button type="button" onClick={() => editChar(character)}>Изменить</button><button className="is-danger" type="button" onClick={() => setDeleteTarget(character)}>Удалить</button></div>
          </article>
        })}{!visibleCharacters.length && <div className="v2-empty-state"><span>◇</span><strong>Ничего не найдено</strong><p>Измени фильтр или создай нового персонажа.</p></div>}</div>
      </section>}

      {tab === "members" && <section className="control-section"><div className="section-head"><div><h3 className="section-title">Участники</h3><p className="item-meta">Роль аккаунта и персонаж — независимые вещи</p></div><button className="section-link" type="button" onClick={() => void makeInvite()}>＋ Приглашение</button></div>{invite && <button className="control-invite" type="button" onClick={() => navigator.clipboard?.writeText(invite)}><span>Код приглашения</span><strong>{invite}</strong><small>Нажми, чтобы скопировать</small></button>}<div className="control-member-list">{members.map((member) => { const active = member.active_character_id ? characters.find((character) => character.id === member.active_character_id) : null; return <button type="button" key={member.user_id} onClick={() => openMember(member.user_id)}><span className="control-member-avatar">{member.display_name.slice(0, 1).toUpperCase()}</span><span><strong>{member.display_name}</strong><small>{member.is_owner ? "Владелец" : member.role === "gm" ? "ГМ" : "Игрок"}{active ? ` · играет ${active.name}` : " · без активного PC"}</small>{member.telegram_username && <em>@{member.telegram_username}</em>}</span><i>›</i></button> })}</div></section>}

      {tab === "chats" && <section className="control-section"><div className="section-head"><div><h3 className="section-title">Чаты кампании</h3><p className="item-meta">Сцены, доступ и быстрый переход</p></div><button className="section-link" type="button" onClick={() => setRoomCreate(true)}>＋ Чат</button></div><div className="control-room-list">{rooms.rooms.map((room) => <button type="button" key={room.id} onClick={() => onOpenRoom(room.id)}><span className="control-room-art">{room.avatar_url ? <CampaignImage value={room.avatar_url} alt=""/> : <span>{room.title.slice(0, 1)}</span>}</span><span><strong>{room.title}</strong><small>{room.category === "flood" ? "Флуд" : "Игровая сцена"} · {room.preview}</small></span><em>›</em></button>)}</div></section>}

      {tab === "materials" && <section className="control-section"><div className="section-head"><div><h3 className="section-title">Материалы</h3><p className="item-meta">Приватное рабочее пространство этого ГМа</p></div><div className="section-actions"><button className="section-link" type="button" onClick={() => editFolder("new")}>＋ Папка</button><button className="section-link" type="button" onClick={() => { setNoteTitle(""); setNoteBody(""); setNoteOpen("new") }}>＋ Заметка</button><button className="section-link" type="button" onClick={() => uploadRef.current?.click()}>⇧ Файл</button></div></div><input ref={uploadRef} className="media-hidden-input" type="file" onChange={(event) => { void uploadFile(event.target.files?.[0] || null); event.currentTarget.value = "" }}/><div className="control-filter-rail"><button className={folder === "all" ? "is-active" : ""} type="button" onClick={() => setFolder("all")}>Все</button><button className={folder === "root" ? "is-active" : ""} type="button" onClick={() => setFolder("root")}>Без папки</button>{folders.map((item) => <button className={folder === item.id ? "is-active" : ""} type="button" key={item.id} onClick={() => setFolder(item.id)} aria-label={`${item.name}. Удерживайте для действий`} {...bindFolderLongPress(item)}>{item.name}</button>)}</div>{folders.length > 0 && <p className="control-folder-hint">Удерживай папку, чтобы переименовать или удалить её.</p>}<div className="control-file-list">{visibleFiles.map((file) => <article key={file.id}><span className="control-file-icon">{file.kind === "note" ? "✎" : "▧"}</span><span><strong>{file.title}</strong><small>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(file.updated_at))}</small>{file.kind === "upload" && file.file_url && <MaterialLink value={file.file_url} label={file.original_name || "файл"}/>}</span><div>{file.kind === "note" && <button type="button" onClick={() => { setNoteTitle(file.title); setNoteBody(file.body); setNoteOpen(file) }}>Изменить</button>}<button className="is-danger" type="button" onClick={() => void deleteFile(file)}>Удалить</button></div></article>)}{!visibleFiles.length && <div className="v2-empty-state"><span>▤</span><strong>Материалов нет</strong><p>Заметки и файлы видишь только ты.</p></div>}</div></section>}
    </div>

    {editor && <CharacterCreationWizard target={editor} campaignId={campaignId} members={members} updateCharacter={updateCharacter} onClose={() => setEditor(null)} onSaved={async (characterId, openCharacter) => { await refresh(); setEditor(null); if (openCharacter) onOpenCharacter(characterId) }}/>} 

    {zoneNpcTarget && <NpcHabitatZonesSheet npc={zoneNpcTarget} zones={habitats.activeZones} selectedIds={new Set(habitats.zonesForNpc(zoneNpcTarget.id))} savingKey={habitats.savingKey} onClose={() => setZoneNpcTarget(null)} onToggle={(zoneId, next) => { void toggleNpcHabitat(zoneNpcTarget, zoneId, next) }}/>} 

    {deleteTarget && <div className="sheet-backdrop" onMouseDown={() => setDeleteTarget(null)}><section className="bottom-sheet v2-confirm" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><span className="v2-confirm-icon">×</span><h3>Удалить «{deleteTarget.name}»?</h3><p>Лист, инвентарь, дневник и связанные данные будут удалены.</p><div><button type="button" onClick={() => setDeleteTarget(null)}>Отмена</button><button className="is-danger" type="button" onClick={() => void removeCharacter()} disabled={saving}>Удалить</button></div></section></div>}

    {memberEdit && <div className="sheet-backdrop" onMouseDown={() => setMemberEdit(null)}><section className="bottom-sheet v2-editor-sheet" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><header className="v2-sheet-head"><div><span>Участник</span><h3>{members.find((member) => member.user_id === memberEdit)?.display_name}</h3><p>Роль управляет правами, но не тем, какого PC человек может иметь.</p></div><button type="button" onClick={() => setMemberEdit(null)}>×</button></header><section className="v2-form-section"><label className="field-label">Роль</label><select className="app-select" value={memberRole} disabled={!isOwner || members.find((member) => member.user_id === memberEdit)?.is_owner} onChange={(event) => setMemberRoleValue(event.target.value === "gm" ? "gm" : "player")}><option value="player">Игрок</option><option value="gm">ГМ</option></select><p className="control-field-help">Персонаж назначается в редакторе самого PC — туда можно выбрать любого участника, включая владельца и ГМа.</p></section>{isOwner && <button className="v2-primary-button v2-full-button" type="button" onClick={() => void saveMemberRole()}>Сохранить роль</button>}</section></div>}

    {noteOpen && <div className="sheet-backdrop" onMouseDown={() => setNoteOpen(null)}><form className="bottom-sheet v2-editor-sheet" onSubmit={saveNote} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><header className="v2-sheet-head"><div><span>Материалы</span><h3>{noteOpen === "new" ? "Новая заметка" : "Редактировать заметку"}</h3><p>Эту запись видишь только ты.</p></div><button type="button" onClick={() => setNoteOpen(null)}>×</button></header><section className="v2-form-section"><label className="field-label">Название</label><input className="app-input" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} autoFocus/><label className="field-label">Текст</label><textarea className="app-textarea control-note-text" value={noteBody} onChange={(event) => setNoteBody(event.target.value)}/></section><button className="v2-primary-button v2-full-button" type="submit" disabled={saving || !noteTitle.trim()}>Сохранить</button></form></div>}

    {folderEditor && <div className="sheet-backdrop" onMouseDown={() => setFolderEditor(null)}><form className="bottom-sheet v2-editor-sheet" onSubmit={saveFolder} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><header className="v2-sheet-head"><div><span>Материалы</span><h3>{folderEditor === "new" ? "Новая папка" : "Переименовать папку"}</h3><p>Папки видишь только ты.</p></div><button type="button" onClick={() => setFolderEditor(null)}>×</button></header><section className="v2-form-section"><label className="field-label" htmlFor="folder-name">Название</label><input id="folder-name" className="app-input" value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} autoFocus/></section><button className="v2-primary-button v2-full-button" type="submit" disabled={saving || !folderName.trim()}>{saving ? "Сохраняем…" : "Сохранить"}</button></form></div>}

    {folderMenu && <ContextActionSheet title={folderMenu.name} subtitle="Действия с папкой" actions={folderActions} onClose={() => setFolderMenu(null)}/>}

    {folderDeleteTarget && <div className="sheet-backdrop" onMouseDown={() => setFolderDeleteTarget(null)}><section className="bottom-sheet v2-confirm" role="dialog" aria-modal="true" aria-label={`Удалить папку ${folderDeleteTarget.name}`} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><span className="v2-confirm-icon">×</span><h3>Удалить «{folderDeleteTarget.name}»?</h3><p>Заметки и файлы не пропадут — они перейдут в «Без папки».</p><div><button type="button" onClick={() => setFolderDeleteTarget(null)}>Отмена</button><button className="is-danger" type="button" onClick={() => void deleteFolder()} disabled={saving}>{saving ? "Удаляем…" : "Удалить"}</button></div></section></div>}

    {roomCreate && <div className="sheet-backdrop" onMouseDown={() => setRoomCreate(false)}><form className="bottom-sheet v2-editor-sheet" onSubmit={createRoom} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><header className="v2-sheet-head"><div><span>Чаты</span><h3>Новая игровая сцена</h3><p>Арт и доступ можно настроить после создания.</p></div><button type="button" onClick={() => setRoomCreate(false)}>×</button></header><section className="v2-form-section"><label className="field-label">Название</label><input className="app-input" value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} autoFocus/></section><button className="v2-primary-button v2-full-button" type="submit" disabled={!roomTitle.trim()}>Создать и открыть</button></form></div>}
  </>
}