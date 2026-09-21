import type { ChatRoomShellModel } from "./chatRoomContracts"
import { chatRoomDayPeriodLabel } from "./chatRoomContracts"
import { pushAppHash } from "../navigationGestures"

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

export default function ChatRoomHeader({
  model,
}: {
  model: ChatRoomShellModel
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

  const actorContent = (
    <>
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
    </>
  )

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
      {character ? (
        <button
          type="button"
          className="u1-room-character u1-room-character--interactive"
          data-identity-kind={identity.kind}
          aria-label={"Открыть карточку персонажа " + character.name}
          onClick={() => {
            pushAppHash(
              "workspace/character/" + encodeURIComponent(character.id),
            )
          }}
        >
          {actorContent}
        </button>
      ) : (
        <div
          className="u1-room-character"
          data-identity-kind={identity.kind}
        >
          {actorContent}
        </div>
      )}

      <SceneContext model={model} />
    </section>
  )
}
