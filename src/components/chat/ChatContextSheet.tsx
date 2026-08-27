import { useEffect, useMemo, useState } from "react"
import { useCharacters } from "../../context/CharacterContext"
import { useWorldState } from "../../hooks/useWorldState"
import { supabase } from "../../lib/supabase"
import { formatCampaignTime } from "../../world-state/time"
import type { DayPeriod } from "../../world-state/types"
import CharacterAvatar from "../characters/CharacterAvatar"
import WorldPositionSheet from "../world/WorldPositionSheet"

type RoomRow = {
  id: string
  title: string
  room_type: "character" | "scene" | "flood"
  character_id: string | null
  location_id: string | null
  campaign_day: number
  day_period: DayPeriod
  room_state: "open" | "gm_only" | "closed"
  scene_state: "active" | "closed"
  open_to_campaign: boolean
  campaign_can_write: boolean
  is_read_only: boolean
}

type Props = {
  roomId: string
  onClose: () => void
  onOpenCharacter: (characterId: string) => void
  onOpenSettings?: () => void
  onChanged?: () => void
}

export default function ChatContextSheet({ roomId, onClose, onOpenCharacter, onOpenSettings, onChanged }: Props) {
  const { characters, canManage } = useCharacters()
  const [room, setRoom] = useState<RoomRow | null>(null)
  const [participants, setParticipants] = useState<string[]>([])
  const [editingPosition, setEditingPosition] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const subjectCharacterId = room?.room_type === "character" ? room.character_id : null
  const world = useWorldState(subjectCharacterId)

  async function loadRoom() {
    const { data, error: roomError } = await supabase.from("chat_rooms").select("id,title,room_type,character_id,location_id,campaign_day,day_period,room_state,scene_state,open_to_campaign,campaign_can_write,is_read_only").eq("id", roomId).maybeSingle()
    if (roomError || !data) { setError(roomError?.message || "Комната недоступна."); return }
    setRoom(data as RoomRow)
    if (data.room_type === "scene") {
      const { data: rows } = await supabase.from("scene_participants").select("character_id").eq("room_id", roomId)
      setParticipants((rows || []).map((row) => row.character_id))
    } else setParticipants([])
  }

  useEffect(() => { void loadRoom() }, [roomId])

  const character = useMemo(() => room?.character_id ? characters.find((item) => item.id === room.character_id) || null : null, [characters, room])
  const sceneParticipants = useMemo(() => participants.map((id) => characters.find((item) => item.id === id)).filter(Boolean), [characters, participants])
  const scenePosition = room ? { location_id: room.location_id, campaign_day: room.campaign_day || 1, day_period: room.day_period || "day" as DayPeriod } : null
  const contextPosition = room?.room_type === "character" ? world.currentState : scenePosition
  const contextLocation = world.locations.find((location) => location.id === contextPosition?.location_id) || null

  async function setRoomState(state: "open" | "gm_only" | "closed") {
    setBusy(true); setError("")
    const { error: rpcError } = await supabase.rpc("set_chat_room_state", { p_room_id: roomId, p_state: state })
    setBusy(false)
    if (rpcError) { setError(rpcError.message); return }
    await loadRoom(); onChanged?.()
  }

  async function setAccess(canRead: boolean, canWrite: boolean) {
    setBusy(true); setError("")
    const { error: rpcError } = await supabase.rpc("set_chat_room_campaign_access", { p_room_id: roomId, p_can_read: canRead, p_can_write: canWrite })
    setBusy(false)
    if (rpcError) { setError(rpcError.message); return }
    await loadRoom(); onChanged?.()
  }

  async function savePosition(locationId: string | null, campaignDay: number, dayPeriod: DayPeriod) {
    if (!room) return { ok: false, error: "Комната не найдена." }
    if (room.room_type === "character" && room.character_id) return world.setCharacterPosition(room.character_id, locationId, campaignDay, dayPeriod)
    if (room.room_type === "scene") return world.setScenePosition(room.id, locationId, campaignDay, dayPeriod)
    return { ok: false, error: "У Флуда нет игровой позиции." }
  }

  async function syncParticipants() {
    if (!room || room.room_type !== "scene") return
    setBusy(true); setError("")
    const result = await world.syncScene(room.id, true, true)
    setBusy(false)
    if (!result.ok) { setError(result.error || "Не удалось синхронизировать участников."); return }
    onChanged?.()
  }

  if (!room) return <div className="soft-sheet-backdrop" onMouseDown={onClose}><section className="soft-sheet context-sheet" onMouseDown={(event) => event.stopPropagation()}><div className="soft-sheet__handle"/><div className="context-loading">{error || "Загружаем контекст…"}</div></section></div>

  const stateLabel = room.is_read_only ? "Только чтение" : room.room_state === "gm_only" ? "Только ГМ пишет" : room.room_state === "closed" ? "Закрыт" : "Открыт"

  return (
    <>
      <div className="soft-sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
        <section className="soft-sheet context-sheet" role="dialog" aria-modal="true">
          <div className="soft-sheet__handle" />
          <header className="soft-sheet__header"><div><small>Игровой контекст</small><h2>{room.title}</h2></div><button type="button" className="soft-sheet__close" onClick={onClose}>×</button></header>

          {room.room_type === "character" && character && (
            <button className="context-identity" type="button" onClick={() => onOpenCharacter(character.id)}><CharacterAvatar character={character} size="medium"/><span><small>Персонаж</small><strong>{character.name}</strong><em>{character.character_class} · {character.level} ур.</em></span><b>›</b></button>
          )}

          <div className="context-grid">
            <button type="button" className="context-row" onClick={() => { if (contextLocation) window.location.hash = "#/world" }}><span className="context-row__icon">◈</span><span><small>Локация</small><strong>{contextLocation?.name || "Не задана"}</strong></span><b>›</b></button>
            <button type="button" className="context-row" onClick={() => canManage && setEditingPosition(true)}><span className="context-row__icon">◷</span><span><small>Время</small><strong>{contextPosition ? formatCampaignTime(contextPosition) : "Не задано"}</strong></span>{canManage && <b>›</b>}</button>
          </div>

          {room.room_type === "character" && world.activeScenes.length > 0 && <section className="context-section"><h3>Сейчас здесь</h3>{world.activeScenes.map((scene) => <button key={scene.room_id} type="button" className="context-scene" onClick={() => { window.location.hash = `#/chat/${scene.room_id}` }}><span>✦</span><div><small>Активная сцена</small><strong>{scene.title}</strong></div><b>›</b></button>)}</section>}

          {room.room_type === "character" && <section className="context-section"><h3>Рядом сейчас</h3>{world.nearby.length ? <div className="context-people">{world.nearby.map((person) => <button type="button" key={person.id} onClick={() => onOpenCharacter(person.id)}><CharacterAvatar character={person} size="small"/><span>{person.name}</span></button>)}</div> : <p className="context-empty">Никого из известных персонажей в этой точке времени.</p>}{world.otherTimes.length > 0 && <div className="context-other-time"><small>В этой локации, но в другое время</small>{world.otherTimes.map((person) => <span key={person.id}>{person.name} · {person.relation === "earlier" ? "раньше" : "позже"}</span>)}</div>}</section>}

          {room.room_type === "scene" && <section className="context-section"><h3>Участники</h3>{sceneParticipants.length ? <div className="context-people">{sceneParticipants.map((person) => person && <button type="button" key={person.id} onClick={() => onOpenCharacter(person.id)}><CharacterAvatar character={person} size="small"/><span>{person.name}</span></button>)}</div> : <p className="context-empty">Участники ещё не выбраны.</p>}</section>}

          <section className="context-section context-room-state"><div><small>Состояние комнаты</small><strong>{stateLabel}</strong></div>{canManage && <button type="button" onClick={onOpenSettings}>Управление</button>}</section>

          {canManage && room.room_type !== "flood" && <section className="gm-context-actions"><h3>Быстрые действия ГМ</h3><div className="gm-context-actions__grid"><button type="button" onClick={() => setEditingPosition(true)}>◈ Изменить позицию</button>{room.room_type === "scene" && <button type="button" disabled={busy} onClick={() => void syncParticipants()}>⇄ Синхронизировать</button>}<button type="button" disabled={busy} onClick={() => void setAccess(true, true)}>Читать и писать всем</button><button type="button" disabled={busy} onClick={() => void setRoomState("gm_only")}>Только ГМ пишет</button><button type="button" disabled={busy} onClick={() => void setAccess(true, false)}>Читать всем</button><button type="button" disabled={busy} className="is-danger" onClick={() => void setRoomState("closed")}>Закрыть чат</button></div></section>}

          {error && <div className="sheet-error">{error}</div>}
        </section>
      </div>

      {editingPosition && contextPosition && <WorldPositionSheet title={room.room_type === "character" ? character?.name || room.title : room.title} position={contextPosition} locations={world.locations} onClose={() => setEditingPosition(false)} onSave={async (locationId, campaignDay, dayPeriod) => { const result = await savePosition(locationId, campaignDay, dayPeriod); if (result.ok) { await loadRoom(); onChanged?.() } return result }} />}
    </>
  )
}
