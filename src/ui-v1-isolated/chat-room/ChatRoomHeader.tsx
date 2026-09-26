import type { ChatRoomShellModel } from "./chatRoomContracts"
import { pushAppHash } from "../navigationGestures"

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
  const location = model.context.locationName || "Не определена"

  return (
    <div className="u1-room-context u1-room-location-preview" aria-label={`Локация: ${location}`}>
      <div className="u1-room-location-preview__art">
        {model.context.locationImageUrl && (
          <img src={model.context.locationImageUrl} alt="" decoding="async" draggable={false} />
        )}
      </div>
      <strong className="u1-room-location-preview__name" title={location}>{location}</strong>
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
