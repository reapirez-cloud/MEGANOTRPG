import type { CSSProperties } from "react"

import PlayerProfileMark from "./PlayerProfileMark"
import { useWorkspaceData, type WorkspaceCharacter } from "./useWorkspaceData"

type Props = {
  onOpenCharacter: (characterId: string) => void
  onOpenManagement: () => void
}

function mediaStyle(url: string | null): CSSProperties | undefined {
  if (!url) return undefined
  return { "--u1-workspace-media": `url("${url}")` } as CSSProperties
}

function CharacterStrip({ character, onClick }: { character: WorkspaceCharacter; onClick: () => void }) {
  return (
    <button type="button" className="u1-actor-strip" style={mediaStyle(character.avatarUrl)} onClick={onClick}>
      <span className="u1-actor-strip__media" aria-hidden="true" />
      <span className="u1-actor-strip__shade" aria-hidden="true" />
      <span className="u1-actor-strip__copy">
        <strong>{character.name}</strong>
        <small>
          {character.characterClass || (character.characterType === "npc" ? "Персонаж мира" : "Без класса")}
          {" · "}
          {character.level}
        </small>
      </span>
    </button>
  )
}

function NarratorStrip({ coverUrl, selected, onClick }: { coverUrl: string | null; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="u1-actor-strip u1-actor-strip--narrator"
      data-selected={selected || undefined}
      style={mediaStyle(coverUrl)}
      onClick={onClick}
    >
      <span className="u1-actor-strip__media" aria-hidden="true" />
      <span className="u1-actor-strip__narrator-mark" aria-hidden="true" />
      <span className="u1-actor-strip__shade" aria-hidden="true" />
      <span className="u1-actor-strip__copy">
        <strong>Рассказчик</strong>
        <small>Голос мира</small>
      </span>
    </button>
  )
}

function ActiveIdentity({
  character,
  narrator,
  coverUrl,
  onOpenCharacter,
}: {
  character: WorkspaceCharacter | null
  narrator: boolean
  coverUrl: string | null
  onOpenCharacter: (characterId: string) => void
}) {
  const style = mediaStyle(character?.avatarUrl || (narrator ? coverUrl : null))
  const content = (
    <>
      <span className="u1-active-identity__media" aria-hidden="true" />
      <span className="u1-active-identity__veil" aria-hidden="true" />
      <span className="u1-active-identity__copy">
        <strong>{narrator ? "Рассказчик" : character?.name || "Персонаж не выбран"}</strong>
        <small>
          {narrator
            ? "Голос мира"
            : character
              ? `${character.characterClass || "Без класса"} · ${character.level}`
              : "ГМ ещё не назначил активного персонажа"}
        </small>
      </span>
      {character && <span className="u1-active-identity__open" aria-hidden="true">↗</span>}
    </>
  )

  if (character) {
    return (
      <button
        type="button"
        className="u1-active-identity"
        style={style}
        onClick={() => onOpenCharacter(character.id)}
        aria-label={`Открыть персонажа ${character.name}`}
      >
        {content}
      </button>
    )
  }

  return (
    <div className="u1-active-identity" data-narrator={narrator || undefined} style={style}>
      {content}
    </div>
  )
}

export default function Workspace({ onOpenCharacter, onOpenManagement }: Props) {
  const data = useWorkspaceData()

  return (
    <main className="u1-workspace" data-manager={data.canManage || undefined}>
      <div className="u1-workspace__ambient" style={mediaStyle(data.campaignCoverUrl)} aria-hidden="true" />

      <header className="u1-workspace__header">
        <div className="u1-workspace__title">
          <strong>Я</strong>
          <span>{data.canManage ? "Кто говорит сейчас" : "Мои персонажи"}</span>
        </div>
        <PlayerProfileMark />
      </header>

      <section className="u1-workspace__actors" aria-label={data.canManage ? "Выбор текущего голоса" : "Мои персонажи"}>
        {data.loading ? (
          <div className="u1-workspace__loading" aria-label="Загрузка персонажей"><span /><span /><span /></div>
        ) : data.error ? (
          <div className="u1-workspace__error">{data.error}</div>
        ) : data.canManage ? (
          <>
            <NarratorStrip coverUrl={data.campaignCoverUrl} selected={data.narratorSelected} onClick={() => data.selectSpeaker(null)} />
            {data.otherCharacters.map((character) => (
              <CharacterStrip key={character.id} character={character} onClick={() => data.selectSpeaker(character.id)} />
            ))}
          </>
        ) : data.otherCharacters.length ? (
          <>
            <div className="u1-workspace__section-label"><span>Другие персонажи</span><i aria-hidden="true" /></div>
            {data.otherCharacters.map((character) => (
              <CharacterStrip key={character.id} character={character} onClick={() => onOpenCharacter(character.id)} />
            ))}
          </>
        ) : null}
      </section>

      <footer className="u1-workspace__footer">
        {data.canManage && (
          <div className="u1-workspace__control-strip">
            <div>
              <strong>{data.campaignTitle || "Кампания"}</strong>
              <small>Текущая кампания</small>
            </div>
            <button type="button" onClick={onOpenManagement}>Управление</button>
          </div>
        )}

        <ActiveIdentity
          character={data.activeCharacter}
          narrator={data.narratorSelected}
          coverUrl={data.campaignCoverUrl}
          onOpenCharacter={onOpenCharacter}
        />
      </footer>
    </main>
  )
}
