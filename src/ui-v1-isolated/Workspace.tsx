import { useState, type CSSProperties } from "react"

import PlayerProfileMark from "./PlayerProfileMark"
import { SnakeTrigger } from "./SnakeProvider"
import { createCharacterSnakeActions } from "./characterSnakeActions"
import {
  useWorkspaceData,
  type WorkspaceAbilityKey,
  type WorkspaceAbilitySummary,
  type WorkspaceCharacter,
} from "./useWorkspaceData"

type Props = {
  onOpenCharacter: (characterId: string) => void
  onOpenManagement: () => void
}

function mediaStyle(url: string | null): CSSProperties | undefined {
  if (!url) return undefined
  return { "--u1-workspace-media": `url("${url}")` } as CSSProperties
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : String(value)
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

function StatReveal({ ability }: { ability: WorkspaceAbilitySummary }) {
  return (
    <section
      className="u1-active-identity__stat-reveal"
      id={`workspace-stat-${ability.key}`}
      aria-label={ability.label}
    >
      <header>
        <strong>{ability.label}</strong>
        <span>{ability.score}</span>
        <small>{signed(ability.modifier)}</small>
      </header>

      {ability.skills.length ? (
        <div className="u1-active-identity__skills">
          {ability.skills.map((skill) => (
            <div key={skill.id} data-rank={skill.rank || undefined}>
              <span>{skill.label}</span>
              <strong>{signed(skill.bonus)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="u1-active-identity__skills-empty">
          К этой характеристике навыков нет.
        </div>
      )}
    </section>
  )
}

function ActiveIdentity({
  character,
  narrator,
  coverUrl,
  canEditAvatar,
  onOpenCharacter,
}: {
  character: WorkspaceCharacter | null
  narrator: boolean
  coverUrl: string | null
  canEditAvatar: boolean
  onOpenCharacter: (characterId: string) => void
}) {
  const [selectedAbility, setSelectedAbility] =
    useState<WorkspaceAbilityKey | null>(null)

  const style = mediaStyle(character?.avatarUrl || (narrator ? coverUrl : null))
  const selectedStat = character?.sheet?.abilities.find(
    (ability) => ability.key === selectedAbility,
  ) || null

  const panel = (
    <div
      className="u1-active-identity"
      data-narrator={narrator || undefined}
      data-stat-open={selectedAbility || undefined}
      style={style}
    >
      <span className="u1-active-identity__media" aria-hidden="true" />
      <span className="u1-active-identity__veil" aria-hidden="true" />

      {character && (
        <button
          type="button"
          className="u1-active-identity__open-zone"
          onClick={() => onOpenCharacter(character.id)}
          aria-label={`Открыть персонажа ${character.name}`}
        />
      )}

      <div className="u1-active-identity__body">
        <div className="u1-active-identity__headline">
          <div>
            <strong>
              {narrator ? "Рассказчик" : character?.name || "Персонаж не выбран"}
            </strong>
            <small>
              {narrator
                ? "Голос мира"
                : character
                  ? `${character.characterClass || "Без класса"} · ${character.level}`
                  : "ГМ ещё не назначил активного персонажа"}
            </small>
          </div>

          {character?.sheet && (
            <div className="u1-active-identity__hp">
              <span>НР</span>
              <strong>{character.sheet.currentHp} / {character.sheet.maxHp}</strong>
            </div>
          )}
        </div>

        {character?.sheet && (
          <div className="u1-active-identity__stats" aria-label="Характеристики персонажа">
            {character.sheet.abilities.map((ability) => {
              const open = selectedAbility === ability.key
              return (
                <button
                  type="button"
                  key={ability.key}
                  data-active={open || undefined}
                  aria-expanded={open}
                  aria-controls={`workspace-stat-${ability.key}`}
                  onClick={() => {
                    setSelectedAbility((current) =>
                      current === ability.key ? null : ability.key,
                    )
                  }}
                >
                  <strong>{ability.score}</strong>
                  <span>{ability.short}</span>
                </button>
              )
            })}
          </div>
        )}

        {selectedStat && <StatReveal ability={selectedStat} />}
      </div>
    </div>
  )

  if (!character) return panel

  const actions = createCharacterSnakeActions({ canEditAvatar })
  if (!actions.length) return panel

  return (
    <SnakeTrigger
      entity={{ type: "character", id: character.id }}
      actions={actions}
    >
      {panel}
    </SnakeTrigger>
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
          key={data.activeCharacter?.id || (data.narratorSelected ? "narrator" : "empty")}
          character={data.activeCharacter}
          narrator={data.narratorSelected}
          coverUrl={data.campaignCoverUrl}
          canEditAvatar={data.canEditActiveAvatar}
          onOpenCharacter={onOpenCharacter}
        />
      </footer>
    </main>
  )
}
