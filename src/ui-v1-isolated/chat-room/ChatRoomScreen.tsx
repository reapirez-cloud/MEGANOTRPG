import {
  chatRoomDayPeriodLabel,
  type ChatRoomHeaderCharacter,
} from "./chatRoomContracts"
import ChatComposer from "./ChatComposer"
import ChatFeed from "./ChatFeed"
import { useChatRoomShell } from "./useChatRoomShell"
import "./chat-room-stage1.css"

type QuickActionId = "inventory" | "class" | "spells" | "attack"

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  )
}

function QuickActionIcon({ action }: { action: QuickActionId }) {
  if (action === "inventory") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8.5V6.8A5 5 0 0 1 12 2a5 5 0 0 1 5 4.8v1.7" />
        <path d="M4.5 8.5h15l-1 12h-13l-1-12Z" />
        <path d="M8.2 12.2h7.6" />
      </svg>
    )
  }

  if (action === "class") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.8 15 9l6.2 3-6.2 3-3 6.2L9 15l-6.2-3L9 9l3-6.2Z" />
        <circle cx="12" cy="12" r="2.1" />
      </svg>
    )
  }

  if (action === "spells") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.2 4.5c3.1-.9 5.7-.4 7.8 1.5v14c-2.1-1.9-4.7-2.4-7.8-1.5v-14Z" />
        <path d="M19.8 4.5c-3.1-.9-5.7-.4-7.8 1.5v14c2.1-1.9 4.7-2.4 7.8-1.5v-14Z" />
        <path d="m16.6 8.2.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5.5-1.1Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 19 4-4" />
      <path d="m8 16 8.9-8.9 2 2L10 18l-2-2Z" />
      <path d="m15.8 5.8 2.4-2.4 2.4 2.4-2.4 2.4" />
      <path d="M4 20h5" />
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
          {character.tempHp > 0 ? <em>+{character.tempHp}</em> : null}
        </strong>
      </div>
      <span className="u1-room-hp__track" aria-hidden="true">
        <i style={{ transform: `scaleX(${ratio})` }} />
      </span>
    </div>
  )
}

function CharacterHeader({
  model,
}: {
  model: NonNullable<ReturnType<typeof useChatRoomShell>["model"]>
}) {
  const identity = model.identity
  if (!identity) return null

  const character = identity.kind === "character" ? identity.character : null
  const name =
    identity.kind === "character" ? identity.character.name : identity.name
  const dayPeriod = chatRoomDayPeriodLabel(model.context.dayPeriod)

  return (
    <section
      className="u1-room-character"
      aria-label={identity.kind === "narrator" ? "Рассказчик" : "Персонаж и состояние"}
      data-identity-kind={identity.kind}
    >
      <div className="u1-room-character__portrait">
        {character?.avatarUrl ? (
          <img
            src={character.avatarUrl}
            alt=""
            decoding="async"
            draggable={false}
          />
        ) : (
          <CharacterFallback name={name} />
        )}
        <span className="u1-room-character__portrait-shade" aria-hidden="true" />
      </div>

      <div className="u1-room-character__main">
        <div className="u1-room-character__identity">
          <span>{identity.kind === "narrator" ? "Голос мастера" : "Персонаж"}</span>
          <h1>{name}</h1>
          <p>
            {character
              ? character.className + " · " + character.level + " уровень"
              : "Рассказчик сцены"}
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
  )
}

function QuickActions({
  hasEquippedWeapon,
}: {
  hasEquippedWeapon: boolean
}) {
  const actions: Array<{ id: QuickActionId; label: string }> = [
    { id: "inventory", label: "Инвентарь" },
    { id: "class", label: "Классовые умения" },
    { id: "spells", label: "Заклинания" },
    ...(hasEquippedWeapon
      ? [{ id: "attack" as const, label: "Атака" }]
      : []),
  ]

  return (
    <nav className="u1-room-quick-actions" aria-label="Быстрые действия">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="u1-room-quick-action"
          data-action={action.id}
          data-placeholder="true"
          aria-label={action.label + " — будет подключено позже"}
          onClick={() => undefined}
        >
          <span className="u1-room-quick-action__icon">
            <QuickActionIcon action={action.id} />
          </span>
          <span>{action.label}</span>
        </button>
      ))}
    </nav>
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
      <main className="u1-room-shell" data-chat-room-stage="5">
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

  const hasCharacterIdentity =
    model.identity?.kind === "character" && model.quickActions.hasCharacter

  return (
    <main
      className="u1-room-shell"
      data-chat-room-stage="5"
      data-room-type={model.roomType}
      data-has-identity={Boolean(model.identity) || undefined}
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

      <CharacterHeader model={model} />

      {hasCharacterIdentity ? (
        <QuickActions
          hasEquippedWeapon={model.quickActions.hasEquippedWeapon}
        />
      ) : null}

      <ChatFeed roomId={roomId} />
      <ChatComposer model={model} />
    </main>
  )
}
