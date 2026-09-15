import { useState, type CSSProperties } from "react"

import { useAIViewContextLayer } from "../ai/AIProvider"
import CampaignMediaFrame from "../components/common/CampaignMediaFrame"
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

function CharacterStrip({
  character,
  selected = false,
  onClick,
}: {
  character: WorkspaceCharacter
  selected?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="u1-actor-strip"
      data-selected={selected || undefined}
      data-dead={character.lifeState === "dead" || undefined}
      onClick={onClick}
    >
      <CampaignMediaFrame
        className="u1-actor-strip__media"
        value={character.panelAvatarUrl || character.avatarUrl}
        presentation={character.panelAvatarPresentation}
        alt=""
        aria-hidden="true"
      />
      <span className="u1-actor-strip__shade" aria-hidden="true" />
      <span className="u1-actor-strip__copy">
        <strong>{character.name}</strong>
        <small>
          {character.lifeState === "dead" && <>Мёртв · </>}
          {character.characterClass || (character.characterType === "npc" ? "Персонаж мира" : "Без класса")}
          {" · "}
          {character.level}
        </small>
      </span>
    </button>
  )
}

function CharacterShelf({
  title,
  caption,
  characters,
  defaultOpen = false,
  emptyText,
  isSelected,
  onCharacterClick,
}: {
  title: string
  caption: string
  characters: WorkspaceCharacter[]
  defaultOpen?: boolean
  emptyText: string
  isSelected?: (character: WorkspaceCharacter) => boolean
  onCharacterClick: (character: WorkspaceCharacter) => void
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="u1-character-shelf" data-open={open || undefined}>
      <button
        type="button"
        className="u1-character-shelf__trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <strong>{title}</strong>
          <small>{characters.length ? `${caption} · ${characters.length}` : emptyText}</small>
        </span>
        <b aria-hidden="true">{String(characters.length).padStart(2, "0")}</b>
      </button>

      {open && (
        <div className="u1-character-shelf__list">
          {characters.length ? (
            characters.map((character) => (
              <CharacterStrip
                key={character.id}
                character={character}
                selected={isSelected?.(character)}
                onClick={() => onCharacterClick(character)}
              />
            ))
          ) : (
            <div className="u1-character-shelf__empty">{emptyText}</div>
          )}
        </div>
      )}
    </section>
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
  applyMedia,
  onOpenCharacter,
}: {
  character: WorkspaceCharacter | null
  narrator: boolean
  coverUrl: string | null
  canEditAvatar: boolean
  applyMedia: ReturnType<typeof useWorkspaceData>["applyCharacterMedia"]
  onOpenCharacter: (characterId: string) => void
}) {
  const [selectedAbility, setSelectedAbility] =
    useState<WorkspaceAbilityKey | null>(null)

  const style = mediaStyle(narrator ? coverUrl : null)
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
      {character ? (
        <CampaignMediaFrame
          className="u1-active-identity__media"
          value={character.panelAvatarUrl || character.avatarUrl}
          presentation={character.panelAvatarPresentation}
          alt=""
          aria-hidden="true"
        />
      ) : (
        <span className="u1-active-identity__media" aria-hidden="true" />
      )}
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

  const actions = createCharacterSnakeActions({
    canEditAvatar,
    character,
    applyMedia: (slot, input) => applyMedia(character.id, slot, input),
  })
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

  useAIViewContextLayer(
    "workspace",
    data.loading
      ? null
      : {
          screen: "workspace",
          route: "#/workspace",
          title: data.canManage ? "Я · рабочее пространство GM" : "Я · персонажи",
          text: data.narratorSelected
            ? "Сейчас выбран Рассказчик как активный голос кампании."
            : data.activeCharacter
              ? "Сейчас выбран активный персонаж «" + data.activeCharacter.name + "»."
              : "Активный персонаж сейчас не выбран.",
          entity: data.activeCharacter
            ? {
                type: "character",
                id: data.activeCharacter.id,
                label: data.activeCharacter.name,
              }
            : null,
          facts: {
            campaignTitle: data.campaignTitle,
            canManage: data.canManage,
            narratorSelected: data.narratorSelected,
            activeCharacter: data.activeCharacter
              ? {
                  id: data.activeCharacter.id,
                  name: data.activeCharacter.name,
                  class: data.activeCharacter.characterClass,
                  level: data.activeCharacter.level,
                  lifeState: data.activeCharacter.lifeState,
                  hp: data.activeCharacter.sheet
                    ? {
                        current: data.activeCharacter.sheet.currentHp,
                        max: data.activeCharacter.sheet.maxHp,
                      }
                    : null,
                  abilities: data.activeCharacter.sheet?.abilities.map((ability) => ({
                    key: ability.key,
                    score: ability.score,
                    modifier: ability.modifier,
                  })) || [],
                }
              : null,
            playerCharacters: data.playerCharacters.slice(0, 20).map((character) => ({
              id: character.id,
              name: character.name,
              class: character.characterClass,
              level: character.level,
            })),
            ownCharacters: data.ownCharacters.slice(0, 20).map((character) => ({
              id: character.id,
              name: character.name,
              class: character.characterClass,
              level: character.level,
              lifeState: character.lifeState,
            })),
            worldCharacters: data.worldSpeakerCharacters.slice(0, 20).map((character) => ({
              id: character.id,
              name: character.name,
              class: character.characterClass,
              level: character.level,
            })),
          },
        },
    35,
  )

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

      <section className="u1-workspace__actors" aria-label="Персонажи и текущий голос">
        {data.loading ? (
          <div className="u1-workspace__loading" aria-label="Загрузка персонажей"><span /><span /><span /></div>
        ) : data.error ? (
          <div className="u1-workspace__error">{data.error}</div>
        ) : (
          <>
            {data.canManage && (
              <NarratorStrip
                coverUrl={data.campaignCoverUrl}
                selected={data.narratorSelected}
                onClick={() => data.selectSpeaker(null)}
              />
            )}

            <CharacterShelf
              title="Персонажи игроков"
              caption="Активные"
              characters={data.playerCharacters}
              emptyText="У других игроков сейчас нет активных персонажей."
              onCharacterClick={(character) => onOpenCharacter(character.id)}
            />

            {data.ownCharacters.length > 0 && (
              <CharacterShelf
                title="Мои персонажи"
                caption={data.canManage ? "Голоса" : "Доступные"}
                characters={data.ownCharacters}
                defaultOpen={!data.canManage}
                emptyText="Своих персонажей пока нет."
                isSelected={(character) =>
                  Boolean(data.canManage && data.activeCharacter?.id === character.id)
                }
                onCharacterClick={(character) => {
                  if (data.canManage && character.lifeState === "alive") {
                    data.selectSpeaker(character.id)
                    return
                  }
                  onOpenCharacter(character.id)
                }}
              />
            )}

            {data.canManage && data.worldSpeakerCharacters.length > 0 && (
              <CharacterShelf
                title="Персонажи мира"
                caption="Голоса"
                characters={data.worldSpeakerCharacters}
                emptyText="Персонажей мира пока нет."
                isSelected={(character) => data.activeCharacter?.id === character.id}
                onCharacterClick={(character) => data.selectSpeaker(character.id)}
              />
            )}
          </>
        )}
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
          applyMedia={data.applyCharacterMedia}
          onOpenCharacter={onOpenCharacter}
        />
      </footer>
    </main>
  )
}
