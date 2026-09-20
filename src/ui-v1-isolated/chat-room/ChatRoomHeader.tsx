import type { ChatRoomShellModel } from "./chatRoomContracts"
import { chatRoomDayPeriodLabel } from "./chatRoomContracts"

type QuickActionId = "inventory" | "class" | "spells" | "attack"

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

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.5v5l3 1.8" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2" />
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

function HpBlock({
  character,
}: {
  character: Extract<
    NonNullable<ChatRoomShellModel["identity"]>,
    { kind: "character" }
  >["character"]
}) {
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

function SceneContext({ model }: { model: ChatRoomShellModel }) {
  const dayPeriod = chatRoomDayPeriodLabel(model.context.dayPeriod)
  const location = model.context.locationName || "Не определена"

  return (
    <div className="u1-room-context" aria-label="Контекст сцены">
      <div className="u1-room-context__item" data-context="time">
        <span className="u1-room-context__icon">
          <ClockIcon />
        </span>
        <span className="u1-room-context__copy">
          <span>Время суток</span>
          <strong>{dayPeriod}</strong>
          {model.context.campaignDay ? (
            <small>День {model.context.campaignDay}</small>
          ) : null}
        </span>
      </div>

      <div className="u1-room-context__item" data-context="location">
        <span className="u1-room-context__icon">
          <LocationIcon />
        </span>
        <span className="u1-room-context__copy">
          <span>Локация</span>
          <strong title={location}>{location}</strong>
        </span>
      </div>
    </div>
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
    <nav
      className="u1-room-quick-actions"
      aria-label="Быстрые действия"
      data-action-count={actions.length}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="u1-room-quick-action"
          data-action={action.id}
          data-placeholder="true"
          aria-label={action.label + " — будет подключено на этапе действий"}
          title={action.label}
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

export default function ChatRoomHeader({
  model,
  showQuickActions,
}: {
  model: ChatRoomShellModel
  showQuickActions: boolean
}) {
  const identity = model.identity
  if (!identity) {
    return (
      <section
        className="u1-room-head-stage3 u1-room-head-stage3--observer"
        aria-label="Контекст чата"
      >
        <SceneContext model={model} />
      </section>
    )
  }

  const character = identity.kind === "character" ? identity.character : null
  const name =
    identity.kind === "character" ? identity.character.name : identity.name

  return (
    <section
      className="u1-room-head-stage3"
      data-identity-kind={identity.kind}
      aria-label={
        identity.kind === "narrator"
          ? "Рассказчик и контекст сцены"
          : "Персонаж и контекст сцены"
      }
    >
      <div className="u1-room-character" data-identity-kind={identity.kind}>
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
          <span
            className="u1-room-character__portrait-shade"
            aria-hidden="true"
          />
        </div>

        <div className="u1-room-character__main">
          <div className="u1-room-character__identity">
            <span>
              {identity.kind === "narrator" ? "Голос мастера" : "Персонаж"}
            </span>
            <h1 title={name}>{name}</h1>
            <p>
              {character
                ? character.className + " · " + character.level + " уровень"
                : "Рассказчик сцены"}
            </p>
          </div>

          {character ? <HpBlock character={character} /> : null}
        </div>
      </div>

      <SceneContext model={model} />

      {showQuickActions ? (
        <QuickActions
          hasEquippedWeapon={model.quickActions.hasEquippedWeapon}
        />
      ) : null}
    </section>
  )
}
