import type { CSSProperties, ReactNode } from "react"

import CampaignMediaFrame from "../components/common/CampaignMediaFrame"
import type { MediaPresentation } from "../media/presentation"
import type { SnakeAction } from "../snake-engine"
import {
  CHARACTER_SHEET_NAVIGATION,
  type CharacterSheetSection,
  type CharacterSheetTarget,
} from "./characterSheetUiContract"
import { SnakeTrigger } from "./SnakeProvider"

export type CharacterSheetShellProps = {
  characterId: string
  characterName: string
  characterClass: string
  level: number
  classKey: string
  portraitUrl: string | null
  portraitPresentation: MediaPresentation | null
  panelArtUrl?: string | null
  panelArtPresentation?: MediaPresentation | null
  dead?: boolean
  activeSection?: CharacterSheetSection
  portraitActions: SnakeAction[]
  onOpenPortrait?: () => void
  onNavigate: (target: CharacterSheetTarget) => void
  onBack: () => void
  core?: ReactNode
  children?: ReactNode
}

export default function CharacterSheetShell({
  characterId,
  characterName,
  characterClass,
  level,
  classKey,
  portraitUrl,
  portraitPresentation,
  panelArtUrl = null,
  panelArtPresentation = null,
  dead = false,
  activeSection = "overview",
  portraitActions,
  onOpenPortrait,
  onNavigate,
  onBack,
  core,
  children,
}: CharacterSheetShellProps) {
  const entity = { type: "character", id: characterId, label: characterName }

  return (
    <main
      className="u1-character-sheet"
      data-class-key={classKey}
      data-dead={dead || undefined}
      data-has-panel-art={panelArtUrl ? true : undefined}
      data-has-portrait={portraitUrl ? true : undefined}
      style={
        panelArtUrl
          ? (() => {
              const crop = panelArtPresentation?.crop
              const positionX =
                crop && crop.width < 0.999999
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        (crop.x / (1 - crop.width)) * 100,
                      ),
                    )
                  : 50
              const positionY =
                crop && crop.height < 0.999999
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        (crop.y / (1 - crop.height)) * 100,
                      ),
                    )
                  : 0

              return {
                "--cv-class-panel-art":
                  `url(${JSON.stringify(panelArtUrl)})`,
                "--cv-class-panel-art-size": crop
                  ? `${100 / crop.width}% auto`
                  : "100% auto",
                "--cv-class-panel-art-position": crop
                  ? `${positionX}% ${positionY}%`
                  : "center top",
              } as CSSProperties
            })()
          : undefined
      }
    >
      <header className="u1-character-sheet__topbar">
        <button
          type="button"
          className="u1-character-sheet__back"
          onClick={onBack}
          aria-label="Назад"
        >
          ←
        </button>
        <span>ПЕРСОНАЖ</span>
        <i aria-hidden="true" />
      </header>

      <section className="u1-character-sheet__masthead" aria-label="Персонаж">
        <div className="u1-character-sheet__portrait-cell">
          <SnakeTrigger entity={entity} actions={portraitActions}>
            <button
              type="button"
              className="u1-character-sheet__portrait"
              onClick={onOpenPortrait}
              aria-label={portraitUrl ? "Открыть арт персонажа" : characterName}
            >
              <span
                className="u1-character-sheet__hero-class-art"
                aria-hidden="true"
              />
              <CampaignMediaFrame
                className="u1-character-sheet__portrait-media"
                value={portraitUrl}
                presentation={portraitPresentation}
                alt=""
              />
              <span className="u1-character-sheet__portrait-shade" aria-hidden="true" />
              <span className="u1-character-sheet__hero-haze" aria-hidden="true" />
              <span className="u1-character-sheet__identity">
                <strong>{characterName}</strong>
                <small>
                  {characterClass || "Без класса"}
                  {" · "}
                  ур. {level}
                </small>
              </span>
            </button>
          </SnakeTrigger>
        </div>

        <aside className="u1-character-sheet__rail" aria-label="Разделы персонажа">
          <div className="u1-character-sheet__rail-list">
            {CHARACTER_SHEET_NAVIGATION.map((item) => {
              const active =
                item.target.kind === "section" &&
                item.target.section === activeSection

              return (
                <button
                  key={item.id}
                  type="button"
                  className="u1-character-sheet__rail-row"
                  data-target-kind={item.target.kind}
                  data-active={active || undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(item.target)}
                >
                  <span
                    className="u1-character-sheet__icon-placeholder"
                    data-icon-slot={item.iconSlot}
                    data-nav-id={item.id}
                    aria-hidden="true"
                  />
                  <strong>{item.label}</strong>
                  <i aria-hidden="true">›</i>
                </button>
              )
            })}
          </div>
        </aside>
      </section>

      {core}

      <section className="u1-character-sheet__content">
        {children}
      </section>
    </main>
  )
}
