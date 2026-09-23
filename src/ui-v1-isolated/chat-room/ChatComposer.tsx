import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react"

import { supabase } from "../../lib/supabase"
import ChatActionHost from "./ChatActionHost"
import { chatRoomPresentationState } from "./chatRoomPresentation"
import {
  CHAT_ACTION_REQUEST_EVENT,
  CHAT_MESSAGE_SENT_EVENT,
  type ChatActionLauncherMode,
  type ChatActionRequestDetail,
  type ChatRoomShellModel,
  type ChatSpeakerOption,
} from "./chatRoomContracts"
import { useChatSpeakerOptions } from "./useChatSpeakerOptions"
import {
  cancelPlayerTurnDraft,
  loadPlayerTurnDraft,
  newPlayerTurnCommandId,
  orderedPlayerTurnComponents,
  reorderPlayerTurnComponents,
  savePlayerTurnDraft,
  submitPlayerTurnDraft,
  type PlayerTurnComponent,
  type PlayerTurnDraft,
  type PlayerTurnEntry,
  type PlayerTurnSlot,
} from "./playerTurnQueue"

const ACTION_MENU_ITEMS: Array<{
  mode: ChatActionLauncherMode
  label: string
  hint: string
}> = [
  { mode: "roll", label: "Бросок", hint: "Кубы и проверки" },
  { mode: "ability", label: "Способности", hint: "Класс и подкласс" },
  { mode: "spell", label: "Заклинания", hint: "Доступная магия" },
  { mode: "item", label: "Инвентарь", hint: "Предметы и расходники" },
  { mode: "action", label: "Атака", hint: "Оружие и боевые действия" },
]

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 5 16 7-16 7 2.3-6.1L15 12 6.3 11.1 4 5Z" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5" />
    </svg>
  )
}

function NarratorIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 7.5c1.7-2 3.5-3 5.5-3s3.8 1 5.5 3v6c-1.7 3.8-3.5 5.7-5.5 5.7s-3.8-1.9-5.5-5.7v-6Z" />
      <path d="M9 11h.1M14.9 11h.1M9.5 15c1.7 1 3.3 1 5 0" />
    </svg>
  )
}

function ActionIcon({ mode }: { mode: ChatActionLauncherMode }) {
  if (mode === "roll") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 7 4v8l-7 6-7-6V7l7-4Z" />
        <path d="m5 7 7 4 7-4M12 11v10" />
      </svg>
    )
  }

  if (mode === "spell") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 4.5c3-.9 5.5-.4 7.5 1.5v14c-2-1.9-4.5-2.4-7.5-1.5v-14ZM19.5 4.5c-3-.9-5.5-.4-7.5 1.5v14c2-1.9 4.5-2.4 7.5-1.5v-14Z" />
      </svg>
    )
  }

  if (mode === "item") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8V6.8A5 5 0 0 1 12 2a5 5 0 0 1 5 4.8V8" />
        <path d="M4.5 8h15l-1 12h-13l-1-12Z" />
      </svg>
    )
  }

  if (mode === "action") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 19 4-4M8 16l8.8-8.8 2 2L10 18l-2-2Z" />
        <path d="m15.7 5.9 2.5-2.5 2.4 2.4-2.5 2.5M4 20h5" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8 15 9l6.2 3-6.2 3-3 6.2L9 15l-6.2-3L9 9l3-6.2Z" />
      <circle cx="12" cy="12" r="2.1" />
    </svg>
  )
}

function SpeakerAvatar({
  option,
  compact = false,
}: {
  option: ChatSpeakerOption
  compact?: boolean
}) {
  if (option.avatarUrl) {
    return (
      <img
        className="u1-chat-composer__speaker-avatar"
        data-compact={compact || undefined}
        src={option.avatarUrl}
        alt=""
        decoding="async"
        draggable={false}
      />
    )
  }

  return (
    <span
      className="u1-chat-composer__speaker-avatar u1-chat-composer__speaker-avatar--fallback"
      data-compact={compact || undefined}
      aria-hidden="true"
    >
      {option.kind === "narrator" ? (
        <NarratorIcon />
      ) : (
        (option.name.trim()[0] || "◇").toLocaleUpperCase("ru-RU")
      )}
    </span>
  )
}

async function sendTextMessage({
  roomId,
  userId,
  characterId,
  body,
}: {
  roomId: string
  userId: string
  characterId: string | null
  body: string
}) {
  const result = await supabase
    .from("chat_messages")
    .insert({
      room_id: roomId,
      client_id: userId,
      user_id: userId,
      character_id: characterId,
      author_name: "",
      body,
    })
    .select("id")
    .single()

  if (result.error) throw result.error
  return result.data?.id as number | undefined
}

async function triggerAiGameMasterTurn({
  campaignId,
  sourceChatMessageId,
}: {
  campaignId: string
  sourceChatMessageId: number
}) {
  const result = await supabase.functions.invoke("voss-agent", {
    body: {
      campaignId,
      action: "game_chat_turn",
      sourceChatMessageId,
    },
  })

  return !result.error
}

export default function ChatComposer({
  model,
}: {
  model: ChatRoomShellModel
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const speakerRef = useRef<HTMLDivElement | null>(null)
  const speakerTriggerRef = useRef<HTMLButtonElement | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const plusTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [text, setText] = useState("")
  const [speakerOpen, setSpeakerOpen] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [actionMode, setActionMode] =
    useState<ChatActionLauncherMode | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [turnDraft, setTurnDraft] = useState<PlayerTurnDraft | null>(null)
  const [movementText, setMovementText] = useState("")
  const [turnLoading, setTurnLoading] = useState(false)

  const speakers = useChatSpeakerOptions({
    campaignId: model.viewer.campaignId,
    userId: model.viewer.userId,
    roomId: model.roomId,
    enabled: model.canManage,
    viewerRole: model.viewer.role,
    playerCharacterId: model.viewer.playerCharacterId,
  })

  const presentation = chatRoomPresentationState(model)
  const playerHasCharacter = presentation.identityKind === "character"
  const canCompose = presentation.canCompose

  const selectedCharacterId = model.canManage
    ? speakers.selected.kind === "character"
      ? speakers.selected.id
      : null
    : model.identity?.kind === "character"
      ? model.identity.character.id
      : null

  const speakerName = model.canManage
    ? speakers.selected.name
    : model.identity?.kind === "character"
      ? model.identity.character.name
      : null

  const queuePlayerTurn = Boolean(
    !model.canManage &&
      model.roomType !== "flood" &&
      selectedCharacterId &&
      selectedCharacterId === model.viewer.playerCharacterId,
  )

  const hasQueuedTurnContent = Boolean(
    turnDraft?.action_entry ||
      turnDraft?.bonus_action_entry ||
      movementText.trim() ||
      text.trim(),
  )

  const resizeTextarea = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "auto"
    textarea.style.height = Math.min(textarea.scrollHeight, 108) + "px"
  }

  useEffect(() => {
    resizeTextarea()
  }, [text])

  useEffect(() => {
    if (!model.canManage || !model.canWrite) setSpeakerOpen(false)
    if (!canCompose) {
      setActionMenuOpen(false)
      setActionMode(null)
    }
  }, [canCompose, model.canManage, model.canWrite])

  useEffect(() => {
    setActionMode(null)
    setActionMenuOpen(false)
  }, [selectedCharacterId])

  useEffect(() => {
    let cancelled = false

    if (!queuePlayerTurn || !selectedCharacterId) {
      setTurnDraft(null)
      setMovementText("")
      return () => {
        cancelled = true
      }
    }

    setTurnLoading(true)
    void loadPlayerTurnDraft({
      roomId: model.roomId,
      characterId: selectedCharacterId,
    })
      .then((draft) => {
        if (cancelled) return
        setTurnDraft(draft)
        setMovementText(draft?.movement?.description || "")
        setText(draft?.description || "")
      })
      .catch((error) => {
        if (cancelled) return
        setSendError(
          error instanceof Error
            ? error.message
            : "Черновик хода не загрузился",
        )
      })
      .finally(() => {
        if (!cancelled) setTurnLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [model.roomId, queuePlayerTurn, selectedCharacterId])

  useEffect(() => {
    if (!speakerOpen) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (speakerRef.current?.contains(target)) return
      setSpeakerOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setSpeakerOpen(false)
      speakerTriggerRef.current?.focus()
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [speakerOpen])

  useEffect(() => {
    if (!actionMenuOpen) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (actionMenuRef.current?.contains(target)) return
      setActionMenuOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setActionMenuOpen(false)
      plusTriggerRef.current?.focus()
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [actionMenuOpen])

  useEffect(() => {
    const openRequestedAction = (event: Event) => {
      const detail = (event as CustomEvent<ChatActionRequestDetail>).detail
      if (!detail || detail.roomId !== model.roomId || !canCompose) return

      setSpeakerOpen(false)
      setActionMenuOpen(false)
      setActionMode(detail.mode)
    }

    window.addEventListener(CHAT_ACTION_REQUEST_EVENT, openRequestedAction)
    return () => {
      window.removeEventListener(
        CHAT_ACTION_REQUEST_EVENT,
        openRequestedAction,
      )
    }
  }, [canCompose, model.roomId])

  const openAction = (mode: ChatActionLauncherMode) => {
    setSpeakerOpen(false)
    setActionMenuOpen(false)
    setActionMode(mode)
  }

  const saveTurnState = async ({
    actionEntry = turnDraft?.action_entry || null,
    bonusActionEntry = turnDraft?.bonus_action_entry || null,
    movement = movementText.trim()
      ? { description: movementText.trim() }
      : null,
    componentOrder = turnDraft?.component_order || [],
    description = text,
  }: {
    actionEntry?: PlayerTurnEntry | null
    bonusActionEntry?: PlayerTurnEntry | null
    movement?: { description?: string } | null
    componentOrder?: PlayerTurnComponent[]
    description?: string
  } = {}) => {
    if (!queuePlayerTurn || !selectedCharacterId) {
      throw new Error("Очередь хода доступна только активному персонажу игрока.")
    }

    const saved = await savePlayerTurnDraft({
      roomId: model.roomId,
      characterId: selectedCharacterId,
      actionEntry,
      bonusActionEntry,
      movement,
      componentOrder,
      description,
      expectedRevision: turnDraft?.revision ?? null,
    })
    setTurnDraft(saved)
    setMovementText(saved.movement?.description || "")
    return saved
  }

  const queueTurnEntry = async (
    entry: PlayerTurnEntry,
    slot: PlayerTurnSlot,
  ) => {
    setSendError(null)
    try {
      if (slot === "bonus_action") {
        await saveTurnState({ bonusActionEntry: entry })
      } else {
        await saveTurnState({ actionEntry: entry })
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Действие не добавлено в ход"
      setSendError(message)
      throw error
    }
  }

  const moveTurnComponent = async (
    component: PlayerTurnComponent,
    direction: -1 | 1,
  ) => {
    if (!turnDraft) return

    const currentOrder = orderedPlayerTurnComponents(turnDraft)
    const nextOrder = reorderPlayerTurnComponents(
      currentOrder,
      component,
      direction,
    )
    if (nextOrder.join(":") === currentOrder.join(":")) return

    setSendError(null)
    try {
      await saveTurnState({ componentOrder: nextOrder })
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Порядок хода не изменён",
      )
    }
  }

  const clearTurnSlot = async (slot: PlayerTurnSlot) => {
    setSendError(null)
    try {
      await saveTurnState(
        slot === "action"
          ? {
              actionEntry: null,
              componentOrder: orderedPlayerTurnComponents(turnDraft).filter(
                (component) => component !== "action",
              ),
            }
          : {
              bonusActionEntry: null,
              componentOrder: orderedPlayerTurnComponents(turnDraft).filter(
                (component) => component !== "bonus_action",
              ),
            },
      )
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Слот хода не очищен",
      )
    }
  }

  const cancelTurn = async () => {
    setSendError(null)
    try {
      if (turnDraft?.id) await cancelPlayerTurnDraft(turnDraft.id)
      setTurnDraft(null)
      setMovementText("")
      setText("")
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Черновик хода не отменён",
      )
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    const body = text.trim()
    if (!canCompose || sending) return
    if (queuePlayerTurn && !hasQueuedTurnContent) return
    if (!queuePlayerTurn && !body) return

    setSending(true)
    setSendError(null)

    try {
      if (queuePlayerTurn && selectedCharacterId) {
        const saved = await saveTurnState({
          movement: movementText.trim()
            ? { description: movementText.trim() }
            : null,
          description: body,
        })
        const submitted = await submitPlayerTurnDraft({
          draftId: saved.id,
          revision: saved.revision,
          turnCommandId: newPlayerTurnCommandId(),
        })

        setTurnDraft(null)
        setMovementText("")
        setText("")
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto"
          textareaRef.current.focus()
        }

        window.dispatchEvent(
          new CustomEvent(CHAT_MESSAGE_SENT_EVENT, {
            detail: {
              roomId: model.roomId,
              messageId: submitted.trigger_message_id,
            },
          }),
        )

        void triggerAiGameMasterTurn({
          campaignId: model.viewer.campaignId,
          sourceChatMessageId: submitted.trigger_message_id,
        })
        return
      }

      const messageId = await sendTextMessage({
        roomId: model.roomId,
        userId: model.viewer.userId,
        characterId: selectedCharacterId,
        body,
      })
      setText("")
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
        textareaRef.current.focus()
      }
      window.dispatchEvent(
        new CustomEvent(CHAT_MESSAGE_SENT_EVENT, {
          detail: { roomId: model.roomId, messageId },
        }),
      )

      if (
        messageId &&
        model.roomType !== "flood" &&
        selectedCharacterId &&
        selectedCharacterId === model.viewer.playerCharacterId
      ) {
        void triggerAiGameMasterTurn({
          campaignId: model.viewer.campaignId,
          sourceChatMessageId: messageId,
        })
      }
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Сообщение не отправлено",
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <form
        className="u1-chat-composer"
        data-chat-composer-stage="5"
        data-can-compose={canCompose || undefined}
        data-read-only={model.readOnly || undefined}
        data-sending={sending || undefined}
        aria-busy={sending}
        onSubmit={(event) => void submit(event)}
      >
        {sendError ? (
          <div className="u1-chat-composer__error" role="status">
            {sendError}
          </div>
        ) : null}

        {queuePlayerTurn ? (
          <div
            className="u1-player-turn"
            data-turn-draft={turnDraft?.id || undefined}
            data-turn-loading={turnLoading || undefined}
          >
            <div className="u1-player-turn__slots">
              {(["action", "bonus_action"] as const).map((slot) => {
                const entry =
                  slot === "action"
                    ? turnDraft?.action_entry
                    : turnDraft?.bonus_action_entry
                return (
                  <div
                    key={slot}
                    className="u1-player-turn__slot"
                    data-filled={Boolean(entry) || undefined}
                  >
                    <span>{slot === "action" ? "Действие" : "Бонус"}</span>
                    <strong>{entry?.label || "Не выбрано"}</strong>
                    {entry ? (
                      <button
                        type="button"
                        aria-label={
                          slot === "action"
                            ? "Убрать действие из хода"
                            : "Убрать бонусное действие из хода"
                        }
                        onClick={() => void clearTurnSlot(slot)}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {turnDraft && orderedPlayerTurnComponents(turnDraft).length > 1 ? (
              <div
                className="u1-player-turn__order"
                aria-label="Порядок компонентов хода"
              >
                {orderedPlayerTurnComponents(turnDraft).map(
                  (component, index, order) => (
                    <div key={component} data-turn-component={component}>
                      <span>{index + 1}</span>
                      <strong>
                        {component === "action"
                          ? turnDraft.action_entry?.label || "Действие"
                          : component === "bonus_action"
                            ? turnDraft.bonus_action_entry?.label || "Бонус"
                            : turnDraft.movement?.description || "Движение"}
                      </strong>
                      <div>
                        <button
                          type="button"
                          aria-label="Выше"
                          disabled={index === 0 || sending}
                          onClick={() =>
                            void moveTurnComponent(component, -1)
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label="Ниже"
                          disabled={index === order.length - 1 || sending}
                          onClick={() =>
                            void moveTurnComponent(component, 1)
                          }
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : null}
            <div className="u1-player-turn__movement">
              <span>Движение</span>
              <input
                value={movementText}
                maxLength={1000}
                placeholder="Например: к двери, 20 футов"
                disabled={sending || turnLoading}
                onChange={(event) => setMovementText(event.target.value)}
                onBlur={() => {
                  if (!queuePlayerTurn || !selectedCharacterId) return
                  void saveTurnState({
                    movement: movementText.trim()
                      ? { description: movementText.trim() }
                      : null,
                  }).catch((error) => {
                    setSendError(
                      error instanceof Error
                        ? error.message
                        : "Движение не сохранено",
                    )
                  })
                }}
              />
              {hasQueuedTurnContent ? (
                <button
                  type="button"
                  className="u1-player-turn__cancel"
                  onClick={() => void cancelTurn()}
                  disabled={sending}
                >
                  Сбросить
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="u1-chat-composer__row">
          {presentation.showPersonaSelector ? (
            <div ref={speakerRef} className="u1-chat-composer__speaker">
              <button
                ref={speakerTriggerRef}
                type="button"
                className="u1-chat-composer__speaker-trigger"
                aria-label={"Пишет: " + speakers.selected.name}
                aria-expanded={speakerOpen}
                disabled={speakers.loading || !model.canWrite}
                onClick={() => {
                  setActionMenuOpen(false)
                  setSpeakerOpen((value) => !value)
                }}
              >
                <SpeakerAvatar option={speakers.selected} compact />
                <ChevronIcon />
              </button>

              {speakerOpen ? (
                <div
                  className="u1-chat-composer__speaker-menu"
                  role="listbox"
                  aria-label="Выбор личности"
                >
                  {speakers.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={option.id === speakers.selectedId}
                      data-selected={
                        option.id === speakers.selectedId || undefined
                      }
                      onClick={() => {
                        speakers.selectSpeaker(option.id)
                        setSpeakerOpen(false)
                      }}
                    >
                      <SpeakerAvatar option={option} />
                      <span>
                        <strong>{option.name}</strong>
                        <small>
                          {option.kind === "narrator"
                            ? "Голос мастера"
                            : "Персонаж"}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            ref={actionMenuRef}
            className="u1-chat-composer__action-anchor"
          >
            <button
              ref={plusTriggerRef}
              type="button"
              className="u1-chat-composer__plus"
              aria-label="Игровые действия"
              aria-expanded={actionMenuOpen}
              disabled={!canCompose}
              onClick={() => {
                setSpeakerOpen(false)
                setActionMenuOpen((value) => !value)
              }}
            >
              <PlusIcon />
            </button>

            {actionMenuOpen ? (
              <div
                className="u1-chat-composer__action-menu"
                role="menu"
                aria-label="Игровые действия"
              >
                {ACTION_MENU_ITEMS.map((item) => (
                  <button
                    key={item.mode}
                    type="button"
                    role="menuitem"
                    data-action-mode={item.mode}
                    onClick={() => openAction(item.mode)}
                  >
                    <span className="u1-chat-composer__action-icon">
                      <ActionIcon mode={item.mode} />
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </span>
                    <em aria-hidden="true">›</em>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <label className="u1-chat-composer__field">
            <span className="u1-sr-only">Сообщение</span>
            <textarea
              ref={textareaRef}
              value={text}
              rows={1}
              maxLength={5000}
              placeholder={
                model.readOnly
                  ? "Чат закрыт"
                  : queuePlayerTurn
                    ? "Опиши ход или реплику…"
                    : canCompose
                      ? "Сообщение…"
                      : playerHasCharacter
                        ? "Нет права писать в этот чат"
                        : "Нет персонажа в этой сцене"
              }
              disabled={!canCompose || sending}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
          </label>

          <button
            type="submit"
            className="u1-chat-composer__send"
            aria-label={queuePlayerTurn ? "Отправить ход" : "Отправить"}
            disabled={
              !canCompose ||
              sending ||
              (queuePlayerTurn ? !hasQueuedTurnContent : !text.trim())
            }
            data-sending={sending || undefined}
          >
            {sending ? (
              <span className="u1-chat-composer__sending-dot" />
            ) : (
              <SendIcon />
            )}
          </button>
        </div>
      </form>

      {actionMode ? (
        <ChatActionHost
          key={actionMode + ":" + (selectedCharacterId || "narrator")}
          model={model}
          mode={actionMode}
          characterId={selectedCharacterId}
          speakerName={speakerName}
          queuePlayerTurn={queuePlayerTurn}
          onQueueTurnEntry={queueTurnEntry}
          onClose={() => setActionMode(null)}
        />
      ) : null}
    </>
  )
}
