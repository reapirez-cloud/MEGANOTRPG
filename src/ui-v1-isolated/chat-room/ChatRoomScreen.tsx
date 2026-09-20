import {
  chatRoomDayPeriodLabel,
  type ChatRoomHeaderCharacter,
} from "./chatRoomContracts"
import { useChatRoomShell } from "./useChatRoomShell"
import "./chat-room-stage1.css"

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  )
}

function CharacterFallback({ name }: { name: string }) {
  return (
    <span className="u1-room-character__fallback" aria-hidden="true">
      {(name.trim()[0] || "◇").toLocaleUpperCase("ru-RU")}
    </span>
  )
}

function HpBlock({ character }: { character: ChatRoomHeaderCharacter }) {
  const hpKnown =
    typeof character.currentHp === "number" &&
    typeof character.maxHp === "number" &&
    character.maxHp > 0

  const ratio = hpKnown
    ? Math.max(0, Math.min(1, character.currentHp! / character.maxHp!))
    : 0

  return (
    <div className="u1-room-hp" data-known={hpKnown || undefined}>
      <div className="u1-room-hp__label">
        <span>HP</span>
        <strong>
          {hpKnown
            ? character.currentHp + " / " + character.maxHp
            : "— / —"}
          {character.tempHp > 0 ? (
            <em>+{character.tempHp}</em>
          ) : null}
        </strong>
      </div>
      <span className="u1-room-hp__track" aria-hidden="true">
        <i style={{ transform: `scaleX(${ratio})` }} />
      </span>
    </div>
  )
}

function LoadingShell() {
  return (
    <main className="u1-room-shell u1-room-shell--loading" aria-busy="true">
      <div className="u1-room-topbar">
        <span className="u1-room-skeleton u1-room-skeleton--back" />
        <span className="u1-room-skeleton u1-room-skeleton--title" />
      </div>
      <div className="u1-room-skeleton u1-room-skeleton--hero" />
      <div className="u1-room-feed-placeholder" aria-hidden="true" />
    </main>
  )
}

export default function ChatRoomScreen({ roomId }: { roomId: string }) {
  const { model, loading, error, reload } = useChatRoomShell(roomId)

  if (loading) return <LoadingShell />

  if (!model || error) {
    return (
      <main className="u1-room-shell" data-chat-room-stage="1">
        <div className="u1-room-topbar">
          <button
            type="button"
            className="u1-room-back"
            aria-label="Назад к чатам"
            onClick={() => {
              window.location.hash = "#/chats"
            }}
          >
            <BackIcon />
          </button>
          <span className="u1-room-topbar__title">Чат</span>
        </div>

        <section className="u1-room-error" role="alert">
          <span aria-hidden="true">◇</span>
          <strong>Комната не загрузилась</strong>
          <p>{error || "Комната недоступна."}</p>
          <button type="button" onClick={() => void reload()}>
            Повторить
          </button>
        </section>
      </main>
    )
  }

  const character = model.character
  const dayPeriod = chatRoomDayPeriodLabel(model.context.dayPeriod)

  return (
    <main
      className="u1-room-shell"
      data-chat-room-stage="1"
      data-room-type={model.roomType}
    >
      <header className="u1-room-topbar">
        <button
          type="button"
          className="u1-room-back"
          aria-label="Назад к чатам"
          onClick={() => {
            window.location.hash = "#/chats"
          }}
        >
          <BackIcon />
        </button>

        <div className="u1-room-topbar__copy">
          <span>
            {model.roomType === "character"
              ? "Личная история"
              : model.roomType === "scene"
                ? "Сцена"
                : "Флуд"}
          </span>
          <strong>{model.roomTitle}</strong>
        </div>

        {model.readOnly ? (
          <span className="u1-room-readonly">Архив</span>
        ) : null}
      </header>

      <section className="u1-room-character" aria-label="Персонаж и состояние">
        <div className="u1-room-character__portrait">
          {character?.avatarUrl ? (
            <img
              src={character.avatarUrl}
              alt=""
              decoding="async"
              draggable={false}
            />
          ) : (
            <CharacterFallback name={character?.name || model.roomTitle} />
          )}
          <span className="u1-room-character__portrait-shade" aria-hidden="true" />
        </div>

        <div className="u1-room-character__main">
          <div className="u1-room-character__identity">
            <span>Персонаж</span>
            <h1>{character?.name || "Персонаж не выбран"}</h1>
            <p>
              {character
                ? character.className + " · " + character.level + " уровень"
                : "Контекст персонажа отсутствует"}
            </p>
          </div>

          {character ? <HpBlock character={character} /> : null}
        </div>

        <div className="u1-room-context">
          <div>
            <span>Время суток</span>
            <strong>{dayPeriod}</strong>
            {model.context.campaignDay ? (
              <small>День {model.context.campaignDay}</small>
            ) : null}
          </div>
          <i aria-hidden="true" />
          <div>
            <span>Локация</span>
            <strong>{model.context.locationName || "Не определена"}</strong>
          </div>
        </div>
      </section>

      <section className="u1-room-feed-placeholder" aria-label="Лента чата">
        <span aria-hidden="true" />
        <p>Лента сообщений будет подключена следующим этапом.</p>
      </section>
    </main>
  )
}
