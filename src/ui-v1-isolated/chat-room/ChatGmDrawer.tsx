import { useCallback, useEffect, useMemo, useState } from "react"

import { createEngineCommandContext } from "../../engine-contracts/index.ts"
import { supabase } from "../../lib/supabase"
import { oracle } from "../../oracle-engine/runtime.ts"
import type { DayPeriod } from "../../world-state/types.ts"
import {
  chatRoomDayPeriodLabel,
  type ChatRoomShellModel,
} from "./chatRoomContracts"
import "./chat-gm-drawer.css"

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

type TargetCharacter = {
  id: string
  name: string
  character_class: string | null
  level: number | null
  character_type: "pc" | "npc"
}

type LocationRow = {
  id: string
  name: string
}

type CharacterWorldRow = {
  location_id: string | null
  campaign_day: number | null
  day_period: DayPeriod | null
}

type RecoveryTrigger = "short_rest" | "long_rest" | "dawn"

const periodOptions: Array<{ value: DayPeriod; label: string }> = [
  { value: "dawn", label: "Рассвет" },
  { value: "morning", label: "Утро" },
  { value: "day", label: "День" },
  { value: "late_day", label: "После полудня" },
  { value: "evening", label: "Вечер" },
  { value: "night", label: "Ночь" },
  { value: "deep_night", label: "Глубокая ночь" },
]

function targetCaption(character: TargetCharacter) {
  const className = character.character_class?.trim() || "Без класса"
  return `${className} · ${Math.max(1, Number(character.level || 1))} ур.`
}

function recoveryLabel(trigger: RecoveryTrigger) {
  if (trigger === "short_rest") return "Короткий отдых применён"
  if (trigger === "long_rest") return "Долгий отдых применён"
  return "Рассвет применён"
}

export default function ChatGmDrawer({
  model,
  onClose,
  onChanged,
  onOpenCharacter,
}: {
  model: ChatRoomShellModel
  onClose: () => void
  onChanged: () => void | Promise<void>
  onOpenCharacter: (characterId: string) => void
}) {
  const [room, setRoom] = useState<RoomRow | null>(null)
  const [targets, setTargets] = useState<TargetCharacter[]>([])
  const [targetId, setTargetId] = useState("")
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [locationId, setLocationId] = useState("")
  const [campaignDay, setCampaignDay] = useState(1)
  const [dayPeriod, setDayPeriod] = useState<DayPeriod>("day")
  const [positionEditing, setPositionEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")

  const gmContext = useCallback(
    (actorCharacterId?: string | null) =>
      createEngineCommandContext({
        campaignId: model.viewer.campaignId,
        requestedBy: model.viewer.userId,
        authority: "gm",
        ...(actorCharacterId ? { actorCharacterId } : {}),
      }),
    [model.viewer.campaignId, model.viewer.userId],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError("")

    const [roomResult, locationsResult] = await Promise.all([
      supabase
        .from("chat_rooms")
        .select(
          "id,title,room_type,character_id,location_id,campaign_day,day_period,room_state,scene_state,open_to_campaign,campaign_can_write,is_read_only",
        )
        .eq("id", model.roomId)
        .eq("campaign_id", model.viewer.campaignId)
        .maybeSingle(),
      supabase
        .from("locations")
        .select("id,name")
        .eq("campaign_id", model.viewer.campaignId)
        .eq("lifecycle_state", "active")
        .order("sort_order", { ascending: true }),
    ])

    if (roomResult.error || !roomResult.data) {
      setRoom(null)
      setError(roomResult.error?.message || "Комната недоступна.")
      setLoading(false)
      return
    }

    const nextRoom = roomResult.data as RoomRow
    setRoom(nextRoom)
    setLocations((locationsResult.data || []) as LocationRow[])

    let nextTargets: TargetCharacter[] = []
    if (nextRoom.room_type === "character" && nextRoom.character_id) {
      const result = await supabase
        .from("characters")
        .select("id,name,character_class,level,character_type")
        .eq("campaign_id", model.viewer.campaignId)
        .eq("id", nextRoom.character_id)
        .eq("life_state", "alive")
        .maybeSingle()

      if (result.data) nextTargets = [result.data as TargetCharacter]
    } else if (nextRoom.room_type === "scene") {
      const participantsResult = await supabase
        .from("scene_participants")
        .select("character_id")
        .eq("room_id", model.roomId)

      const participantIds = (participantsResult.data || [])
        .map((entry) => entry.character_id as string)
        .filter(Boolean)

      let characterQuery = supabase
        .from("characters")
        .select("id,name,character_class,level,character_type")
        .eq("campaign_id", model.viewer.campaignId)
        .eq("life_state", "alive")

      if (participantIds.length) {
        characterQuery = characterQuery.in("id", participantIds)
      } else {
        characterQuery = characterQuery.eq("character_type", "pc")
      }

      const result = await characterQuery.order("name", { ascending: true })
      nextTargets = (result.data || []) as TargetCharacter[]
    }

    setTargets(nextTargets)

    const preferredTargetId =
      nextTargets.find(
        (character) =>
          character.id ===
          (model.identity?.kind === "character"
            ? model.identity.character.id
            : null),
      )?.id ||
      nextTargets.find(
        (character) => character.id === model.viewer.playerCharacterId,
      )?.id ||
      nextTargets[0]?.id ||
      ""

    setTargetId((current) =>
      nextTargets.some((character) => character.id === current)
        ? current
        : preferredTargetId,
    )

    if (nextRoom.room_type === "character" && nextRoom.character_id) {
      const worldResult = await supabase
        .from("character_world_state")
        .select("location_id,campaign_day,day_period")
        .eq("campaign_id", model.viewer.campaignId)
        .eq("character_id", nextRoom.character_id)
        .maybeSingle()

      const world = (worldResult.data as CharacterWorldRow | null) || null
      setLocationId(world?.location_id || nextRoom.location_id || "")
      setCampaignDay(
        Math.max(1, Number(world?.campaign_day || nextRoom.campaign_day || 1)),
      )
      setDayPeriod(world?.day_period || nextRoom.day_period || "day")
    } else {
      setLocationId(nextRoom.location_id || "")
      setCampaignDay(Math.max(1, Number(nextRoom.campaign_day || 1)))
      setDayPeriod(nextRoom.day_period || "day")
    }

    setLoading(false)
  }, [
    model.identity,
    model.roomId,
    model.viewer.campaignId,
    model.viewer.playerCharacterId,
  ])

  useEffect(() => {
    void load()
  }, [load])

  const target = useMemo(
    () => targets.find((character) => character.id === targetId) || null,
    [targetId, targets],
  )

  const roomStateLabel =
    room?.is_read_only
      ? "Только чтение"
      : room?.room_state === "gm_only"
        ? "Только ГМ пишет"
        : room?.room_state === "closed"
          ? "Закрыт"
          : "Открыт"

  const accessLabel = !room || room.room_type === "flood"
    ? "Системный доступ"
    : room.open_to_campaign
      ? room.campaign_can_write
        ? "Игроки читают и пишут"
        : "Игроки только читают"
      : "Скрыт от игроков"

  async function run(
    key: string,
    task: () => Promise<void>,
    successMessage?: string,
  ) {
    if (busy) return
    setBusy(key)
    setError("")
    setNotice("")

    try {
      await task()
      if (successMessage) setNotice(successMessage)
      await load()
      await onChanged()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Действие не выполнено.",
      )
    } finally {
      setBusy("")
    }
  }

  async function recover(trigger: RecoveryTrigger) {
    if (!target) return

    await run(
      "recover:" + trigger,
      async () => {
        await oracle.characters.recover(
          gmContext(target.id),
          target.id,
          trigger,
        )
      },
      `${target.name}: ${recoveryLabel(trigger)}.`,
    )
  }

  async function setRoomState(state: "open" | "gm_only" | "closed") {
    await run("room:" + state, async () => {
      const { error: rpcError } = await supabase.rpc("set_chat_room_state", {
        p_room_id: model.roomId,
        p_state: state,
      })
      if (rpcError) throw rpcError
    })
  }

  async function setAccess(canRead: boolean, canWrite: boolean) {
    await run(
      `access:${canRead}:${canWrite}`,
      async () => {
        const { error: rpcError } = await supabase.rpc(
          "set_chat_room_campaign_access",
          {
            p_room_id: model.roomId,
            p_can_read: canRead,
            p_can_write: canWrite,
          },
        )
        if (rpcError) throw rpcError
      },
    )
  }

  async function syncParticipants() {
    if (!room || room.room_type !== "scene") return

    await run(
      "sync",
      async () => {
        await oracle.world.syncSceneParticipants(
          gmContext(target?.id || null),
          model.roomId,
          { syncLocation: true, syncTime: true },
        )
      },
      "Участники сцены синхронизированы.",
    )
  }

  async function savePosition() {
    if (!room || room.room_type === "flood") return

    const normalizedDay = Math.max(1, Math.trunc(campaignDay || 1))
    const normalizedLocation = locationId || null

    await run(
      "position",
      async () => {
        if (room.room_type === "character" && room.character_id) {
          await oracle.world.moveCharacter(
            gmContext(room.character_id),
            room.character_id,
            normalizedLocation,
            normalizedDay,
            dayPeriod,
          )
          return
        }

        await oracle.world.setScenePosition(
          gmContext(target?.id || null),
          model.roomId,
          normalizedLocation,
          normalizedDay,
          dayPeriod,
        )
      },
      "Позиция и время обновлены.",
    )
    setPositionEditing(false)
  }

  return (
    <div
      className="u1-gm-drawer-backdrop"
      role="presentation"
      data-swipe-navigation="ignore"
      onPointerDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <aside
        className="u1-gm-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Шторка мастера"
        data-swipe-navigation="ignore"
      >
        <header className="u1-gm-drawer__head">
          <div>
            <span>GM / КОНТЕКСТ</span>
            <strong>{room?.title || model.roomTitle}</strong>
            <small>{roomStateLabel} · {accessLabel}</small>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="u1-gm-drawer__body">
          {loading ? (
            <div className="u1-gm-drawer__loading">Загружаем мастерскую…</div>
          ) : (
            <>
              {room?.room_type !== "flood" ? (
                <section className="u1-gm-drawer__section">
                  <div className="u1-gm-drawer__section-head">
                    <span>Контекст</span>
                    <button
                      type="button"
                      onClick={() => setPositionEditing((value) => !value)}
                    >
                      {positionEditing ? "Готово" : "Изменить"}
                    </button>
                  </div>

                  <div className="u1-gm-drawer__facts">
                    <div>
                      <small>Локация</small>
                      <strong>
                        {locations.find((entry) => entry.id === locationId)?.name ||
                          model.context.locationName ||
                          "Не задана"}
                      </strong>
                    </div>
                    <div>
                      <small>Время</small>
                      <strong>
                        День {campaignDay} · {chatRoomDayPeriodLabel(dayPeriod)}
                      </strong>
                    </div>
                  </div>

                  {positionEditing ? (
                    <div className="u1-gm-drawer__position">
                      <label>
                        <span>Локация</span>
                        <select
                          value={locationId}
                          onChange={(event) => setLocationId(event.target.value)}
                        >
                          <option value="">Не задана</option>
                          {locations.map((location) => (
                            <option value={location.id} key={location.id}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>День</span>
                        <input
                          type="number"
                          min={1}
                          max={99999}
                          value={campaignDay}
                          onChange={(event) =>
                            setCampaignDay(
                              Math.max(1, Number(event.target.value || 1)),
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>Время суток</span>
                        <select
                          value={dayPeriod}
                          onChange={(event) =>
                            setDayPeriod(event.target.value as DayPeriod)
                          }
                        >
                          {periodOptions.map((period) => (
                            <option value={period.value} key={period.value}>
                              {period.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="u1-gm-drawer__primary"
                        disabled={Boolean(busy)}
                        onClick={() => void savePosition()}
                      >
                        {busy === "position" ? "Сохраняем…" : "Сохранить позицию"}
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {room?.room_type !== "flood" ? (
                <section className="u1-gm-drawer__section">
                  <div className="u1-gm-drawer__section-head">
                    <span>Отдых и восстановление</span>
                  </div>

                  {targets.length ? (
                    <>
                      <label className="u1-gm-drawer__target">
                        <span>Персонаж</span>
                        <select
                          value={targetId}
                          onChange={(event) => setTargetId(event.target.value)}
                        >
                          {targets.map((character) => (
                            <option value={character.id} key={character.id}>
                              {character.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {target ? (
                        <button
                          type="button"
                          className="u1-gm-drawer__target-card"
                          onClick={() => onOpenCharacter(target.id)}
                        >
                          <span>
                            {(target.name.trim()[0] || "◇").toLocaleUpperCase("ru-RU")}
                          </span>
                          <div>
                            <strong>{target.name}</strong>
                            <small>{targetCaption(target)}</small>
                          </div>
                          <b>›</b>
                        </button>
                      ) : null}

                      <div className="u1-gm-drawer__recovery">
                        <button
                          type="button"
                          disabled={Boolean(busy) || !target}
                          onClick={() => void recover("short_rest")}
                        >
                          <span>◷</span>
                          <strong>Короткий отдых</strong>
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy) || !target}
                          onClick={() => void recover("long_rest")}
                        >
                          <span>☾</span>
                          <strong>Долгий отдых</strong>
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy) || !target}
                          onClick={() => void recover("dawn")}
                        >
                          <span>☀</span>
                          <strong>Рассвет</strong>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="u1-gm-drawer__empty">
                      Нет доступного персонажа для восстановления.
                    </div>
                  )}
                </section>
              ) : null}

              {room?.room_type === "scene" ? (
                <section className="u1-gm-drawer__section">
                  <div className="u1-gm-drawer__section-head">
                    <span>Сцена</span>
                  </div>
                  <button
                    type="button"
                    className="u1-gm-drawer__wide"
                    disabled={Boolean(busy)}
                    onClick={() => void syncParticipants()}
                  >
                    ⇄ Синхронизировать участников с местом и временем
                  </button>
                </section>
              ) : null}

              {room && room.room_type !== "flood" ? (
                <section className="u1-gm-drawer__section">
                  <div className="u1-gm-drawer__section-head">
                    <span>Доступ игроков</span>
                  </div>
                  <div className="u1-gm-drawer__control-grid">
                    <button
                      type="button"
                      className={
                        room.open_to_campaign && room.campaign_can_write
                          ? "is-active"
                          : ""
                      }
                      disabled={Boolean(busy)}
                      onClick={() => void setAccess(true, true)}
                    >
                      Читать и писать
                    </button>
                    <button
                      type="button"
                      className={
                        room.open_to_campaign && !room.campaign_can_write
                          ? "is-active"
                          : ""
                      }
                      disabled={Boolean(busy)}
                      onClick={() => void setAccess(true, false)}
                    >
                      Только читать
                    </button>
                    <button
                      type="button"
                      className={!room.open_to_campaign ? "is-active" : ""}
                      disabled={Boolean(busy)}
                      onClick={() => void setAccess(false, false)}
                    >
                      Скрыть
                    </button>
                  </div>
                </section>
              ) : null}

              {room && room.room_type !== "character" ? (
                <section className="u1-gm-drawer__section">
                  <div className="u1-gm-drawer__section-head">
                    <span>Режим комнаты</span>
                  </div>
                  <div className="u1-gm-drawer__control-grid">
                    <button
                      type="button"
                      className={room.room_state === "open" ? "is-active" : ""}
                      disabled={Boolean(busy)}
                      onClick={() => void setRoomState("open")}
                    >
                      Открыт
                    </button>
                    <button
                      type="button"
                      className={room.room_state === "gm_only" ? "is-active" : ""}
                      disabled={Boolean(busy)}
                      onClick={() => void setRoomState("gm_only")}
                    >
                      Только ГМ
                    </button>
                    <button
                      type="button"
                      className={
                        room.room_state === "closed"
                          ? "is-active is-danger"
                          : "is-danger"
                      }
                      disabled={Boolean(busy)}
                      onClick={() => void setRoomState("closed")}
                    >
                      Закрыть
                    </button>
                  </div>
                </section>
              ) : null}

              {notice ? (
                <div className="u1-gm-drawer__notice">{notice}</div>
              ) : null}
              {error ? (
                <div className="u1-gm-drawer__error">{error}</div>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
