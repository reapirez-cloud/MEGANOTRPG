import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react"

import { supabase } from "../../lib/supabase"
import {
  CHAT_MESSAGE_SENT_EVENT,
  type ChatRoomShellModel,
  type ChatSpeakerOption,
} from "./chatRoomContracts"
import { useChatSpeakerOptions } from "./useChatSpeakerOptions"

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

export default function ChatComposer({
  model,
}: {
  model: ChatRoomShellModel
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const speakerRef = useRef<HTMLDivElement | null>(null)
  const speakerTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [text, setText] = useState("")
  const [speakerOpen, setSpeakerOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const speakers = useChatSpeakerOptions({
    campaignId: model.viewer.campaignId,
    userId: model.viewer.userId,
    roomId: model.roomId,
    enabled: model.canManage,
    viewerRole: model.viewer.role,
    playerCharacterId: model.viewer.playerCharacterId,
  })

  const playerHasCharacter = model.identity?.kind === "character"
  const canCompose =
    model.canWrite && (model.canManage || playerHasCharacter)

  const selectedCharacterId = model.canManage
    ? speakers.selected.kind === "character"
      ? speakers.selected.id
      : null
    : model.identity?.kind === "character"
      ? model.identity.character.id
      : null

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
  }, [model.canManage, model.canWrite])

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

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    const body = text.trim()
    if (!body || !canCompose || sending) return

    setSending(true)
    setSendError(null)

    try {
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
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Сообщение не отправлено",
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <form
      className="u1-chat-composer"
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

      <div className="u1-chat-composer__row">
        {model.canManage ? (
          <div ref={speakerRef} className="u1-chat-composer__speaker">
            <button
              ref={speakerTriggerRef}
              type="button"
              className="u1-chat-composer__speaker-trigger"
              aria-label={"Пишет: " + speakers.selected.name}
              aria-expanded={speakerOpen}
              disabled={speakers.loading || !model.canWrite}
              onClick={() => setSpeakerOpen((value) => !value)}
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

        <button
          type="button"
          className="u1-chat-composer__plus"
          data-placeholder="true"
          aria-label="Дополнительные действия — будут подключены позже"
          disabled={!canCompose}
          onClick={() => undefined}
        >
          <PlusIcon />
        </button>

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
          aria-label="Отправить"
          disabled={!canCompose || !text.trim() || sending}
          data-sending={sending || undefined}
        >
          {sending ? <span className="u1-chat-composer__sending-dot" /> : <SendIcon />}
        </button>
      </div>
    </form>
  )
}
