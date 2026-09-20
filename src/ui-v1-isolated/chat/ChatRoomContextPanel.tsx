import { useMemo, useState } from "react"

import {
  createChatCharacterRecoverySnakeAction,
  type ChatRecoveryTrigger,
} from "../../chat-runtime/participantActions.ts"
import type { SnakeActionResult } from "../../snake-engine/index.ts"
import { useSnake } from "../SnakeProvider"
import type { UiV1ChatRoomSummary } from "../useUiV1ChatRoom"
import type { UiV1ChatParticipant } from "./useUiV1ChatParticipants"
import "./chat-context-panel.css"

type Props = {
  room: UiV1ChatRoomSummary
  participants: UiV1ChatParticipant[]
  loading: boolean
  error: string
  targetCharacterId?: string
  campaignId: string
  userId: string
  canManage: boolean
  onOpenParticipant: (participant: UiV1ChatParticipant) => void
  onBackToRoom: () => void
  onOpenSheet: (characterId: string) => void
  onOpenInventory: (characterId: string) => void
}

function roomTypeLabel(room: UiV1ChatRoomSummary) {
  if (room.room_type === "character") return "Личная история"
  if (room.room_type === "scene") return "Игровая сцена"
  return "Флуд"
}

function roomStateLabel(room: UiV1ChatRoomSummary) {
  if (room.is_read_only) return "Только чтение"
  if (room.room_state === "closed" || room.scene_state === "closed") return "Завершено"
  if (room.room_state === "gm_only") return "Пишет только GM"
  return "Активно"
}

function participantSubtitle(participant: UiV1ChatParticipant) {
  const classLabel = participant.characterClass || (
    participant.characterType === "npc" ? "Персонаж мира" : "Без класса"
  )
  return `${classLabel} · ${participant.level} ур.`
}

function ParticipantAvatar({ participant }: { participant: UiV1ChatParticipant }) {
  return (
    <span className="u1-chat-context-avatar" aria-hidden="true">
      {participant.avatarUrl ? (
        <img src={participant.avatarUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        participant.name.slice(0, 1).toLocaleUpperCase("ru-RU")
      )}
    </span>
  )
}

function RoomContext({
  room,
  participants,
  loading,
  error,
  canManage,
  onOpenParticipant,
}: Pick<
  Props,
  "room" | "participants" | "loading" | "error" | "canManage" | "onOpenParticipant"
>) {
  return (
    <div className="u1-chat-context" data-chat-context-view="room">
      <section className="u1-chat-context-summary">
        <small>{roomTypeLabel(room)}</small>
        <strong>{room.title}</strong>
        <span>{roomStateLabel(room)}</span>
      </section>

      {room.room_type !== "flood" && (
        <section className="u1-chat-context-section">
          <header>
            <div>
              <small>Персонажи</small>
              <strong>Участники</strong>
            </div>
            <span>{loading ? "…" : participants.length}</span>
          </header>

          {loading ? (
            <div className="u1-chat-context-skeleton" aria-label="Загрузка участников">
              <i /><i /><i />
            </div>
          ) : error ? (
            <div className="u1-chat-context-note is-error">{error}</div>
          ) : participants.length ? (
            <div className="u1-chat-context-people">
              {participants.map((participant) => (
                <button
                  type="button"
                  key={participant.id}
                  className="u1-chat-context-person"
                  onClick={() => onOpenParticipant(participant)}
                >
                  <ParticipantAvatar participant={participant} />
                  <span>
                    <strong>{participant.name}</strong>
                    <small>{participantSubtitle(participant)}</small>
                  </span>
                  <em data-dead={participant.lifeState === "dead" || undefined}>
                    {participant.lifeState === "dead" ? "Мёртв" : "›"}
                  </em>
                </button>
              ))}
            </div>
          ) : (
            <div className="u1-chat-context-note">Участники ещё не назначены.</div>
          )}
        </section>
      )}

      <section className="u1-chat-context-section">
        <header>
          <div><small>Комната</small><strong>Контекст</strong></div>
          <span>{canManage ? "GM" : "PLAYER"}</span>
        </header>
        <dl className="u1-chat-context-facts">
          <div><dt>Тип</dt><dd>{roomTypeLabel(room)}</dd></div>
          <div><dt>Состояние</dt><dd>{roomStateLabel(room)}</dd></div>
          <div><dt>День кампании</dt><dd>{room.campaign_day || "—"}</dd></div>
        </dl>
      </section>

      <p className="u1-chat-context-law">
        Отдых, инвентарь и управление применяются только из контекста конкретного персонажа.
      </p>
    </div>
  )
}

function ParticipantContext({
  participant,
  campaignId,
  userId,
  canManage,
  onBackToRoom,
  onOpenSheet,
  onOpenInventory,
}: {
  participant: UiV1ChatParticipant
  campaignId: string
  userId: string
  canManage: boolean
  onBackToRoom: () => void
  onOpenSheet: (characterId: string) => void
  onOpenInventory: (characterId: string) => void
}) {
  const snake = useSnake()
  const [busy, setBusy] = useState<ChatRecoveryTrigger | null>(null)
  const [error, setError] = useState("")
  const isOwn = participant.assignedUserId === userId
  const canOpenPrivateSurfaces = canManage || isOwn

  async function recover(trigger: ChatRecoveryTrigger) {
    if (busy) return
    setBusy(trigger)
    setError("")

    const action = createChatCharacterRecoverySnakeAction({
      campaignId,
      requestedBy: userId,
      canManage,
      targetCharacterId: participant.id,
      targetName: participant.name,
      trigger,
    })

    const result: SnakeActionResult = await snake.executeAction(
      action,
      { type: "character", id: participant.id },
    )

    if (result.type === "error") setError(result.message)
    setBusy(null)
  }

  return (
    <div className="u1-chat-character-context" data-chat-context-view="character">
      <button type="button" className="u1-chat-character-context__back" onClick={onBackToRoom}>
        ‹ Комната
      </button>

      <section className="u1-chat-character-hero">
        <ParticipantAvatar participant={participant} />
        <div>
          <small>
            {canManage
              ? "GM / управление"
              : isOwn
                ? "Ваш персонаж"
                : "Участник сцены"}
          </small>
          <strong>{participant.name}</strong>
          <span>{participantSubtitle(participant)}</span>
        </div>
        <em data-dead={participant.lifeState === "dead" || undefined}>
          {participant.lifeState === "dead" ? "Мёртв" : "Активен"}
        </em>
      </section>

      {canOpenPrivateSurfaces ? (
        <section className="u1-chat-character-actions">
          <button type="button" onClick={() => onOpenSheet(participant.id)}>
            <span>◇</span>
            <div><small>Персонаж</small><strong>Лист и состояния</strong></div>
            <b>›</b>
          </button>
          <button type="button" onClick={() => onOpenInventory(participant.id)}>
            <span>▧</span>
            <div><small>Персонаж</small><strong>Инвентарь</strong></div>
            <b>›</b>
          </button>
        </section>
      ) : (
        <div className="u1-chat-context-note">
          Игрок видит участника сцены, но не получает его лист, инвентарь или управляющие действия.
        </div>
      )}

      {canManage && (
        <section className="u1-chat-recovery">
          <header>
            <small>GM / персонаж</small>
            <strong>Отдых и восстановление</strong>
          </header>
          <div>
            <button type="button" disabled={Boolean(busy)} onClick={() => void recover("short_rest")}>
              <span>◷</span><strong>Короткий отдых</strong><small>{busy === "short_rest" ? "Выполняем…" : "Восстановить по short rest"}</small>
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void recover("long_rest")}>
              <span>☾</span><strong>Долгий отдых</strong><small>{busy === "long_rest" ? "Выполняем…" : "Восстановить по long rest"}</small>
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void recover("dawn")}>
              <span>☀</span><strong>Рассвет</strong><small>{busy === "dawn" ? "Выполняем…" : "Применить dawn recovery"}</small>
            </button>
          </div>
          <p>Цель команды зафиксирована: {participant.name}. Выбор «от лица» на неё не влияет.</p>
        </section>
      )}

      {error && <div className="u1-chat-context-note is-error">{error}</div>}
    </div>
  )
}

export function ChatRoomContextPanel(props: Props) {
  const target = useMemo(
    () => props.targetCharacterId
      ? props.participants.find((participant) => participant.id === props.targetCharacterId) || null
      : null,
    [props.participants, props.targetCharacterId],
  )

  if (props.targetCharacterId && !target && props.loading) {
    return <div className="u1-chat-context-skeleton is-detail"><i /><i /><i /></div>
  }

  if (target) {
    return (
      <ParticipantContext
        participant={target}
        campaignId={props.campaignId}
        userId={props.userId}
        canManage={props.canManage}
        onBackToRoom={props.onBackToRoom}
        onOpenSheet={props.onOpenSheet}
        onOpenInventory={props.onOpenInventory}
      />
    )
  }

  return (
    <RoomContext
      room={props.room}
      participants={props.participants}
      loading={props.loading}
      error={props.error}
      canManage={props.canManage}
      onOpenParticipant={props.onOpenParticipant}
    />
  )
}
