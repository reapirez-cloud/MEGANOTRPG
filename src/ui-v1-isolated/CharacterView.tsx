import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"

import { useAIViewContextLayer } from "../ai/AIProvider"
import type { AbilityKey } from "../character-engine"
import { useResolvedCharacterRuntime } from "../hooks/useResolvedCharacterRuntime"
import type { SnakeAction } from "../snake-engine"
import CharacterInventoryInterface from "./CharacterInventoryInterface"
import CharacterSheetCore from "./CharacterSheetCore"
import CharacterSheetShell from "./CharacterSheetShell"
import {
  isCharacterSheetSection,
  type CharacterSheetSection,
  type CharacterSheetTarget,
} from "./characterSheetUiContract"
import { createCharacterSnakeActions } from "./characterSnakeActions"
import { createWorkshopCharacterActions } from "./gmWorkshopSnakeActions"
import { useGMWorkshopData } from "./useGMWorkshopData"
import { useSnake } from "./SnakeProvider"
import { useUiV1CharacterControl } from "./useUiV1CharacterControl"
import { useWorkspaceData } from "./useWorkspaceData"
import "./character-sheet-theme.css"
import "./character-sheet-shell.css"
import "./character-sheet-core.css"
import "./character-inventory-interface.css"

type CharacterSheetHistorySnapshot =
  | {
      characterId: string
      kind: "sheet"
      section: CharacterSheetSection
    }
  | {
      characterId: string
      kind: "interface"
      interface: "inventory"
      returnSection: CharacterSheetSection
    }

function readCharacterSheetHistory(
  value: unknown,
  characterId: string,
): CharacterSheetHistorySnapshot | null {
  if (!value || typeof value !== "object") return null

  const root = value as Record<string, unknown>
  const raw = root.characterSheet
  if (!raw || typeof raw !== "object") return null

  const state = raw as Record<string, unknown>
  if (state.characterId !== characterId) return null

  if (state.kind === "sheet" && isCharacterSheetSection(state.section)) {
    return {
      characterId,
      kind: "sheet",
      section: state.section,
    }
  }

  if (
    state.kind === "interface" &&
    state.interface === "inventory" &&
    isCharacterSheetSection(state.returnSection)
  ) {
    return {
      characterId,
      kind: "interface",
      interface: "inventory",
      returnSection: state.returnSection,
    }
  }

  return null
}

function historyStateWith(snapshot: CharacterSheetHistorySnapshot) {
  const current = window.history.state
  const base =
    current && typeof current === "object"
      ? { ...(current as Record<string, unknown>) }
      : {}

  return {
    ...base,
    characterSheet: snapshot,
  }
}

function classKeyFrom(
  characterClass: string,
  assignments: ReturnType<typeof useUiV1CharacterControl>["assignments"],
  templates: ReturnType<typeof useUiV1CharacterControl>["templates"],
) {
  const assignedClass = assignments
    .map((assignment) => templates.find((template) => template.id === assignment.template_id) || null)
    .find((template) => template?.kind === "class")

  if (assignedClass?.slug) return assignedClass.slug

  const value = characterClass.toLocaleLowerCase("ru-RU")
  const aliases: Array<[string, string]> = [
    ["воин", "fighter"], ["fighter", "fighter"],
    ["колдун", "warlock"], ["warlock", "warlock"],
    ["жрец", "cleric"], ["cleric", "cleric"],
    ["друид", "druid"], ["druid", "druid"],
    ["бард", "bard"], ["bard", "bard"],
    ["паладин", "paladin"], ["paladin", "paladin"],
    ["чарод", "sorcerer"], ["sorcer", "sorcerer"],
    ["волшеб", "wizard"], ["wizard", "wizard"],
    ["разбой", "rogue"], ["rogue", "rogue"],
    ["монах", "monk"], ["monk", "monk"],
  ]

  return aliases.find(([needle]) => value.includes(needle))?.[1] || "default"
}

function SectionPlaceholder({ section }: { section: CharacterSheetSection }) {
  const copy: Record<CharacterSheetSection, { title: string; body: string }> = {
    overview: {
      title: "Обзор персонажа",
      body: "Основные показатели уже закреплены выше. Здесь на этапе 6 появятся классовые ресурсы, ячейки заклинаний и краткие игровые блоки.",
    },
    features: {
      title: "Умения",
      body: "Раздел уже переключается внутри листа. Сортировка по источнику и полноценные действия будут подключены на этапе 7.",
    },
    spells: {
      title: "Заклинания",
      body: "Раздел уже переключается внутри листа. Группировка по уровням, подготовка и фильтры будут подключены на этапе 8.",
    },
    biography: {
      title: "Биография",
      body: "Биография остаётся частью листа и заменяет только нижнюю область, не открывая отдельный экран.",
    },
  }

  return (
    <div
      className="u1-character-sheet__stage-placeholder"
      data-section={section}
    >
      <span>{copy[section].title}</span>
      <p>{copy[section].body}</p>
    </div>
  )
}

export default function CharacterView({
  characterId,
  onBack,
}: {
  characterId: string
  onBack: () => void
}) {
  const control = useUiV1CharacterControl(characterId)
  const workspace = useWorkspaceData()
  const workshop = useGMWorkshopData()
  const snake = useSnake()
  const runtime = useResolvedCharacterRuntime(control.runtimeEntity)
  const [section, setSection] = useState<CharacterSheetSection>("overview")
  const [interfaceMode, setInterfaceMode] = useState<"inventory" | null>(null)
  const [expandedAbility, setExpandedAbility] = useState<AbilityKey | null>(null)

  const classKey = useMemo(
    () => classKeyFrom(
      control.character?.characterClass || "",
      control.assignments,
      control.templates,
    ),
    [control.assignments, control.character?.characterClass, control.templates],
  )

  const applyHistorySnapshot = useCallback((
    snapshot: CharacterSheetHistorySnapshot,
  ) => {
    if (snapshot.kind === "interface") {
      setSection(snapshot.returnSection)
      setInterfaceMode(snapshot.interface)
      return
    }

    setSection(snapshot.section)
    setInterfaceMode(null)
  }, [])

  useEffect(() => {
    const current = readCharacterSheetHistory(window.history.state, characterId)

    if (current) {
      applyHistorySnapshot(current)
    } else {
      const overview: CharacterSheetHistorySnapshot = {
        characterId,
        kind: "sheet",
        section: "overview",
      }
      window.history.replaceState(
        historyStateWith(overview),
        "",
        window.location.href,
      )
      applyHistorySnapshot(overview)
    }

    const onPopState = (event: PopStateEvent) => {
      const snapshot = readCharacterSheetHistory(event.state, characterId)
      if (snapshot) applyHistorySnapshot(snapshot)
    }

    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [applyHistorySnapshot, characterId])

  const ensureOverviewHistory = useCallback(() => {
    const current = readCharacterSheetHistory(window.history.state, characterId)
    if (current) return current

    const overview: CharacterSheetHistorySnapshot = {
      characterId,
      kind: "sheet",
      section: "overview",
    }
    window.history.replaceState(
      historyStateWith(overview),
      "",
      window.location.href,
    )
    return overview
  }, [characterId])

  const navigateSheet = useCallback((target: CharacterSheetTarget) => {
    const current = ensureOverviewHistory()

    if (target.kind === "interface") {
      const returnSection =
        current.kind === "sheet" ? current.section : section

      const next: CharacterSheetHistorySnapshot = {
        characterId,
        kind: "interface",
        interface: "inventory",
        returnSection,
      }
      window.history.pushState(
        historyStateWith(next),
        "",
        window.location.href,
      )
      setSection(returnSection)
      setInterfaceMode("inventory")
      return
    }

    const nextSection = target.section
    if (interfaceMode === null && nextSection === section) return

    if (nextSection === "overview") {
      if (
        current.kind === "sheet" &&
        current.section !== "overview"
      ) {
        window.history.back()
        return
      }

      const overview: CharacterSheetHistorySnapshot = {
        characterId,
        kind: "sheet",
        section: "overview",
      }
      window.history.replaceState(
        historyStateWith(overview),
        "",
        window.location.href,
      )
      setSection("overview")
      setInterfaceMode(null)
      return
    }

    const next: CharacterSheetHistorySnapshot = {
      characterId,
      kind: "sheet",
      section: nextSection,
    }

    if (current.kind === "sheet" && current.section === "overview") {
      window.history.pushState(
        historyStateWith(next),
        "",
        window.location.href,
      )
    } else {
      window.history.replaceState(
        historyStateWith(next),
        "",
        window.location.href,
      )
    }

    setSection(nextSection)
    setInterfaceMode(null)
  }, [
    characterId,
    ensureOverviewHistory,
    interfaceMode,
    section,
  ])

  const handleBack = useCallback(() => {
    const current = readCharacterSheetHistory(window.history.state, characterId)

    if (interfaceMode === "inventory") {
      if (current?.kind === "interface") {
        window.history.back()
      } else {
        setInterfaceMode(null)
      }
      return
    }

    if (section !== "overview") {
      if (current?.kind === "sheet" && current.section !== "overview") {
        window.history.back()
      } else {
        const overview: CharacterSheetHistorySnapshot = {
          characterId,
          kind: "sheet",
          section: "overview",
        }
        window.history.replaceState(
          historyStateWith(overview),
          "",
          window.location.href,
        )
        setSection("overview")
      }
      return
    }

    onBack()
  }, [characterId, interfaceMode, onBack, section])

  const workspaceCharacter =
    workspace.characters.find((item) => item.id === characterId) || null
  const workshopCharacter =
    workshop.characters.find((item) => item.id === characterId) || null

  const managerActions: SnakeAction[] =
    control.canManage && workshopCharacter
      ? createWorkshopCharacterActions({
          character: workshopCharacter,
          members: workshop.members,
          templates: workshop.templates,
          assignments: workshop.templateAssignments,
          locations: workshop.locations,
          npcHabitats: workshop.npcHabitats,
          operations: workshop.operations,
          onOpen: () => setInterfaceMode(null),
        })
      : []

  const mediaActions: SnakeAction[] =
    workspaceCharacter && control.character
      ? createCharacterSnakeActions({
          canEditAvatar: control.canControlCharacter,
          character: workspaceCharacter,
          applyMedia: (slot, input) =>
            workspace.applyCharacterMedia(characterId, slot, input),
        })
      : []

  const portraitUrl =
    workspaceCharacter?.sheetHeroUrl ||
    workspaceCharacter?.panelAvatarUrl ||
    workspaceCharacter?.avatarUrl ||
    control.character?.panelAvatarUrl ||
    control.character?.avatarUrl ||
    null

  const portraitPresentation = workspaceCharacter?.sheetHeroAssetId
    ? workspaceCharacter.sheetHeroPresentation
    : workspaceCharacter?.panelAvatarAssetId
      ? workspaceCharacter.panelAvatarPresentation
      : control.character?.panelAvatarPresentation || null

  const portraitViewAction: SnakeAction | null =
    control.character && portraitUrl
      ? {
          id: "view-character-sheet-portrait",
          label: "Открыть арт",
          surface: {
            kind: "media",
            eyebrow: "Персонаж",
            title: control.character.name,
            items: [{
              id: "character-sheet-portrait",
              src: portraitUrl,
              title: control.character.name,
            }],
          },
        }
      : null

  const portraitActions = [
    ...(portraitViewAction ? [portraitViewAction] : []),
    ...mediaActions,
    ...managerActions,
  ]

  useAIViewContextLayer(
    "character-sheet-v2",
    control.loading
      ? null
      : {
          screen: interfaceMode === "inventory"
            ? "character-inventory-interface"
            : "character-sheet",
          route: "#/workspace/character/" + characterId,
          title: control.character
            ? "Персонаж · " + control.character.name
            : "Персонаж",
          text: control.character
            ? interfaceMode === "inventory"
              ? "Открыт отдельный интерфейс инвентаря персонажа."
              : "Открыт новый постоянный shell листа персонажа."
            : "Лист персонажа открыт, но данные недоступны.",
          entity: control.character
            ? {
                type: "character",
                id: control.character.id,
                label: control.character.name,
              }
            : { type: "character", id: characterId },
          facts: control.character
            ? {
                section,
                interfaceMode,
                expandedAbility,
                runtimeStatus: runtime.status,
                shellVersion: 2,
                class: control.character.characterClass,
                level: control.character.level,
                spellCount: control.spells.length,
                featureCount: control.features.length,
                inventoryCount: control.inventory.length,
                resourceCount: control.resources.length,
              }
            : { characterId, error: control.error },
        },
    60,
  )

  if (control.loading) {
    return (
      <main className="u1-character-sheet" data-class-key="default">
        <div className="u1-character-sheet__stage-placeholder">
          <span>Загрузка персонажа…</span>
        </div>
      </main>
    )
  }

  if (control.error || !control.character) {
    return (
      <main className="u1-character-sheet" data-class-key="default">
        <header className="u1-character-sheet__topbar">
          <button
            type="button"
            className="u1-character-sheet__back"
            onClick={handleBack}
            aria-label="Назад"
          >
            ←
          </button>
          <span>ПЕРСОНАЖ</span>
          <i aria-hidden="true" />
        </header>
        <div className="u1-character-sheet__stage-placeholder">
          <span>{control.error || "Персонаж не найден."}</span>
        </div>
      </main>
    )
  }

  const character = control.character

  if (interfaceMode === "inventory") {
    return (
      <CharacterInventoryInterface
        characterName={character.name}
        classKey={classKey}
        onBack={handleBack}
      />
    )
  }

  return (
    <CharacterSheetShell
      characterId={characterId}
      characterName={character.name}
      characterClass={character.characterClass}
      level={character.level}
      classKey={classKey}
      portraitUrl={portraitUrl}
      portraitPresentation={portraitPresentation}
      dead={character.lifeState === "dead"}
      activeSection={section}
      portraitActions={portraitActions}
      onOpenPortrait={
        portraitViewAction?.surface
          ? () => snake.openSurface(portraitViewAction.surface!)
          : undefined
      }
      onNavigate={navigateSheet}
      onBack={handleBack}
      core={
        <CharacterSheetCore
          contract={runtime.snapshot?.contract || null}
          sheet={control.sheet}
          spellcastingAbility={runtime.snapshot?.spellcastingAbility}
          expandedAbility={expandedAbility}
          onToggleAbility={(ability) =>
            setExpandedAbility((current) =>
              current === ability ? null : ability
            )
          }
        />
      }
    >
      <SectionPlaceholder section={section} />
    </CharacterSheetShell>
  )
}
