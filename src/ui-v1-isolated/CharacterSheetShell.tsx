import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"

import CampaignMediaFrame from "../components/common/CampaignMediaFrame"
import type { MediaPresentation } from "../media/presentation"
import type { SnakeAction } from "../snake-engine"
import {
  CHARACTER_SHEET_NAVIGATION,
  type CharacterSheetSection,
  type CharacterSheetTarget,
} from "./characterSheetUiContract"
import { SnakeTrigger } from "./SnakeProvider"

function CharacterSheetNavIcon({ id }: { id: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.45,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  }

  if (id === "features") {
    return (
      <svg {...common}>
        <path d="M12 3.25 14.15 9.8 20.7 12l-6.55 2.2L12 20.75 9.85 14.2 3.3 12l6.55-2.2L12 3.25Z" />
        <circle cx="12" cy="12" r="1.45" />
      </svg>
    )
  }

  if (id === "spells") {
    return (
      <svg {...common}>
        <path d="M5 6.35c2.55-.7 4.6-.25 7 1.25v10.05c-2.4-1.5-4.45-1.95-7-1.25V6.35Z" />
        <path d="M19 6.35c-2.55-.7-4.6-.25-7 1.25v10.05c2.4-1.5 4.45-1.95 7-1.25V6.35Z" />
        <path d="m16.85 2.95.45 1.2 1.2.45-1.2.45-.45 1.2-.45-1.2-1.2-.45 1.2-.45.45-1.2Z" />
      </svg>
    )
  }

  if (id === "biography") {
    return (
      <svg {...common}>
        <path d="M7.1 4.25h8.65c1.2 0 2.15.95 2.15 2.15v12.1H8.25c-1.2 0-2.15-.95-2.15-2.15V5.25c0-.55.45-1 1-1Z" />
        <path d="M8.55 8.2h6.9M8.55 11.2h6.9M8.55 14.2h4.45" />
        <path d="M6.1 16.35c0-1.2.95-2.15 2.15-2.15" />
      </svg>
    )
  }

  if (id === "inventory") {
    return (
      <svg {...common}>
        <path d="M7.25 8.65h9.5l1.5 10.1H5.75l1.5-10.1Z" />
        <path d="M9 8.65V7.2a3 3 0 0 1 6 0v1.45" />
        <path d="M9.15 12.1h5.7" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="1.35" />
    </svg>
  )
}

export type CharacterSheetShellProps = {
  characterId: string
  characterName: string
  characterClass: string
  level: number
  classKey: string
  portraitUrl: string | null
  portraitPresentation: MediaPresentation | null
  portraitFrameUrl?: string | null
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
  portraitFrameUrl = null,
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
  const railListRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const scroller = railListRef.current
    if (!scroller) return

    const active = scroller.querySelector<HTMLElement>('[aria-current="page"]')
    if (!active) return

    const top = active.offsetTop
    const bottom = top + active.offsetHeight
    const viewportTop = scroller.scrollTop
    const viewportBottom = viewportTop + scroller.clientHeight

    if (top >= viewportTop && bottom <= viewportBottom) return

    const targetTop =
      top < viewportTop
        ? top
        : Math.max(0, bottom - scroller.clientHeight)

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    scroller.scrollTo({
      top: targetTop,
      behavior: reducedMotion ? "auto" : "smooth",
    })
  }, [activeSection])

  return (
    <main
      className="u1-character-sheet"
      data-class-key={classKey}
      data-dead={dead || undefined}
      data-has-panel-art={panelArtUrl ? true : undefined}
      data-has-portrait={portraitUrl ? true : undefined}
      data-has-portrait-frame={portraitFrameUrl ? true : undefined}
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
      <span className="u1-character-sheet__fixed-backdrop" aria-hidden="true" />
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
              {portraitFrameUrl ? (
                <img
                  className="u1-character-sheet__portrait-frame"
                  src={portraitFrameUrl}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
              ) : null}
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
          <div
            ref={railListRef}
            className="u1-character-sheet__rail-list"
            role="navigation"
            aria-label="Навигация по листу персонажа"
          >
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
                    className="u1-character-sheet__nav-icon"
                    data-icon-slot={item.iconSlot}
                    data-nav-id={item.id}
                    aria-hidden="true"
                  >
                    <CharacterSheetNavIcon id={item.id} />
                  </span>
                  <strong>{item.label}</strong>
                  <span className="u1-character-sheet__rail-chevron" aria-hidden="true">›</span>
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
