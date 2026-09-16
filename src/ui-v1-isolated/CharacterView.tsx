import { useMemo } from "react"

import { useAIViewContextLayer } from "../ai/AIProvider"
import type { SnakeAction } from "../snake-engine"
import { createCharacterSnakeActions } from "./characterSnakeActions"
import CharacterSheetShell from "./CharacterSheetShell"
import { createWorkshopCharacterActions } from "./gmWorkshopSnakeActions"
import { useGMWorkshopData } from "./useGMWorkshopData"
import { useSnake } from "./SnakeProvider"
import { useUiV1CharacterControl } from "./useUiV1CharacterControl"
import { useWorkspaceData } from "./useWorkspaceData"
import "./character-sheet-theme.css"
import "./character-sheet-shell.css"

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

  const classKey = useMemo(
    () => classKeyFrom(
      control.character?.characterClass || "",
      control.assignments,
      control.templates,
    ),
    [control.assignments, control.character?.characterClass, control.templates],
  )

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
          onOpen: () => undefined,
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
          screen: "character-sheet",
          route: "#/workspace/character/" + characterId,
          title: control.character
            ? "Персонаж · " + control.character.name
            : "Персонаж",
          text: control.character
            ? "Открыт новый постоянный shell листа персонажа."
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
                section: "overview",
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
            onClick={onBack}
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
      portraitActions={portraitActions}
      onOpenPortrait={
        portraitViewAction?.surface
          ? () => snake.openSurface(portraitViewAction.surface!)
          : undefined
      }
      onBack={onBack}
    >
      <div className="u1-character-sheet__stage-placeholder">
        <span>Обзор персонажа</span>
        <p>
          Старый лист удалён. Следующие этапы подключат 50/50 показатели,
          ресурсы, заклинания и переключаемые разделы внутрь этой области.
        </p>
      </div>
    </CharacterSheetShell>
  )
}
