import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"

import { useAIViewContextLayer } from "../ai/AIProvider"
import type { AbilityKey } from "../character-engine/index.ts"
import { useResolvedCharacterRuntime } from "../hooks/useResolvedCharacterRuntime"
import type { SnakeAction } from "../snake-engine"
import CharacterInventoryInterface from "./CharacterInventoryInterface"
import CharacterSheetCore from "./CharacterSheetCore"
import CharacterSheetFeatures from "./CharacterSheetFeatures"
import { buildCharacterAbilitiesReadModel } from "./characterAbilitiesReadModel"
import { buildCharacterProficienciesReadModel } from "./characterProficienciesReadModel"
import CharacterSheetOverview from "./CharacterSheetOverview"
import CharacterSheetProficiencies from "./CharacterSheetProficiencies"
import CharacterSheetQuests from "./CharacterSheetQuests"
import CharacterSheetShell from "./CharacterSheetShell"
import CharacterSheetSpells from "./CharacterSheetSpells"
import { characterSheetPortraitFrameUrl } from "./characterSheetVisualAssets"
import {
  CHARACTER_INVENTORY_INTERFACE_CONTRACT,
  type CharacterSheetSection,
  type CharacterSheetTarget,
} from "./characterSheetUiContract"
import { resolveCharacterSheetClassKey } from "./characterSheetClassKey"
import {
  characterSheetHistoryStateWith,
  readCharacterSheetHistory,
  type CharacterSheetHistorySnapshot,
} from "./characterSheetHistory"
import {
  type CharacterSheetEntityTarget,
} from "./characterSheetEntityNavigation"
import { createCharacterSnakeActions } from "./characterSnakeActions"
import { createWorkshopCharacterActions } from "./gmWorkshopSnakeActions"
import { useGMWorkshopData } from "./useGMWorkshopData"
import { useSnake } from "./SnakeProvider"
import { useUiV1CharacterControl } from "./useUiV1CharacterControl"
import { useCharacterQuests } from "./useCharacterQuests"
import {
  classReferenceArtSlot,
  useUiV1ReferenceMedia,
} from "./useUiV1ReferenceMedia"
import { createSheetReferenceMediaActions } from "./characterSheetMediaActions"
import { useWorkspaceData } from "./useWorkspaceData"
import { bindTelegramBackButton } from "./telegramBackButton"
import "./character-sheet-theme.css"
import "./character-sheet-backgrounds.css"
import "./character-sheet-shell.css"
import "./character-sheet-header-stage2.css"
import "./character-sheet-header-stage3.css"
import "./character-sheet-core.css"
import "./character-sheet-features.css"
import "./character-sheet-overview.css"
import "./character-sheet-proficiencies.css"
import "./character-sheet-quests.css"
import "./character-sheet-spells.css"
import "./character-inventory-interface.css"

function historyStateWith(snapshot: CharacterSheetHistorySnapshot) {
  return characterSheetHistoryStateWith(window.history.state, snapshot)
}

function classKeyFrom(
  characterClass: string,
  assignments: ReturnType<typeof useUiV1CharacterControl>["assignments"],
  templates: ReturnType<typeof useUiV1CharacterControl>["templates"],
) {
  const assignedClass = assignments
    .map((assignment) => templates.find((template) => template.id === assignment.template_id) || null)
    .find((template) => template?.kind === "class")

  return resolveCharacterSheetClassKey({
    characterClass,
    assignedClass: assignedClass
      ? {
          slug: assignedClass.slug,
          catalog_key: assignedClass.catalog_key,
        }
      : null,
  })
}

function SectionPlaceholder({ section }: { section: CharacterSheetSection }) {
  const copy: Record<Exclude<CharacterSheetSection, "overview" | "features" | "spells" | "quests">, { title: string; body: string }> = {
    proficiencies: {
      title: "Владения",
      body: "Владения, языки и чувства остаются частью листа и открываются в нижней области. Детальную раскладку этого раздела подключим отдельным этапом.",
    },
    biography: {
      title: "Биография",
      body: "Биография остаётся частью листа и заменяет только нижнюю область, не открывая отдельный экран.",
    },
  }

  if (
    section === "overview" ||
    section === "features" ||
    section === "spells" ||
    section === "quests"
  ) return null

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
  const [auxiliaryEnabled, setAuxiliaryEnabled] = useState(false)
  const [section, setSection] = useState<CharacterSheetSection>("overview")
  const [interfaceMode, setInterfaceMode] = useState<"inventory" | null>(null)
  const [spellsDataEnabled, setSpellsDataEnabled] = useState(false)
  const [inventoryDataEnabled, setInventoryDataEnabled] = useState(false)
  const [featuresDataEnabled, setFeaturesDataEnabled] = useState(false)
  const [questsDataEnabled, setQuestsDataEnabled] = useState(false)
  const control = useUiV1CharacterControl(characterId, {
    loadSpells: spellsDataEnabled,
    loadInventory: inventoryDataEnabled,
    loadFeatures: featuresDataEnabled,
    loadResources: false,
  })
  const quests = useCharacterQuests(characterId, questsDataEnabled)
  const classKey = classKeyFrom(
    control.character?.characterClass || "",
    control.assignments,
    control.templates,
  )
  const workspace = useWorkspaceData({
    enabled: auxiliaryEnabled,
    characterId,
    minimal: true,
  })
  const referenceMedia = useUiV1ReferenceMedia(auxiliaryEnabled, classKey)
  const workshop = useGMWorkshopData(
    auxiliaryEnabled && control.canManage,
    characterId,
  )
  const snake = useSnake()
  const runtime = useResolvedCharacterRuntime(control.runtimeEntity)

  const abilitiesReadModel = useMemo(() => {
    const snapshot = runtime.snapshot
    if (!snapshot) return null

    return buildCharacterAbilitiesReadModel({
      contract: snapshot.contract,
      contributions: snapshot.input.contributions,
      sourceNodes: snapshot.sourceNodes,
      suppressedSourceIds: [
        ...runtime.templates.suppressions.sourceIds,
        ...runtime.preparation.suppressedSourceIds,
      ],
      templateBundles: runtime.templates.bundles,
      backgroundName: control.sheet?.background,
      features: control.features,
      achievements: control.achievements,
    })
  }, [
    runtime.preparation.suppressedSourceIds,
    runtime.snapshot,
    control.achievements,
    control.features,
    control.sheet?.background,
    runtime.templates.bundles,
    runtime.templates.suppressions.sourceIds,
  ])

  const proficienciesReadModel = useMemo(() => {
    const snapshot = runtime.snapshot
    if (!snapshot) return null

    return buildCharacterProficienciesReadModel({
      contract: snapshot.contract,
      legacy: control.sheet,
      contributions: snapshot.input.contributions,
      sourceNodes: snapshot.sourceNodes,
      suppressedSourceIds: [
        ...runtime.templates.suppressions.sourceIds,
        ...runtime.preparation.suppressedSourceIds,
      ],
      managerSuppressedSourceIds:
        runtime.templates.suppressions.sourceIds,
    })
  }, [
    runtime.preparation.suppressedSourceIds,
    runtime.snapshot,
    control.sheet,
    runtime.templates.suppressions.sourceIds,
  ])

  useEffect(() => {
    setAuxiliaryEnabled(false)
    setSpellsDataEnabled(false)
    setInventoryDataEnabled(false)
    setFeaturesDataEnabled(false)
    setQuestsDataEnabled(false)
  }, [characterId])

  useEffect(() => {
    if (section === "spells") setSpellsDataEnabled(true)
    if (section === "features") setFeaturesDataEnabled(true)
    if (section === "quests") setQuestsDataEnabled(true)
    if (interfaceMode === "inventory") setInventoryDataEnabled(true)
  }, [interfaceMode, section])

  useEffect(() => {
    if (
      auxiliaryEnabled ||
      control.loading ||
      runtime.status === "loading" ||
      runtime.status === "stale"
    ) return

    const timer = window.setTimeout(() => {
      setAuxiliaryEnabled(true)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [auxiliaryEnabled, control.loading, runtime.status])
  const [expandedAbility, setExpandedAbility] = useState<AbilityKey | null>(null)
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [selectedSpellId, setSelectedSpellId] = useState<string | null>(null)
  const [selectedResourceKey, setSelectedResourceKey] = useState<string | null>(null)
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null)
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [entityFocus, setEntityFocus] =
    useState<CharacterSheetEntityTarget | null>(null)
  const [spellFocusLevel, setSpellFocusLevel] = useState<number | null>(null)

  const classSpellProfile = useMemo(() => {
    const assignedClass = control.assignments
      .map((assignment) =>
        control.templates.find((template) => template.id === assignment.template_id) || null,
      )
      .find((template) => template?.kind === "class")
    const meta = assignedClass?.rules_meta || {}
    const metaText = (key: string) => {
      const value = meta[key]
      return typeof value === "string" && value.trim() ? value.trim() : null
    }

    return {
      preparationRefresh: metaText("spell_preparation_refresh"),
      selectionMode: metaText("spell_selection_mode"),
      progression: metaText("spell_progression"),
    }
  }, [control.assignments, control.templates])

  const identityMeta = useMemo(() => {
    const subclass = control.assignments
      .map((assignment) =>
        control.templates.find((template) => template.id === assignment.template_id) || null,
      )
      .find((template) => template?.kind === "subclass")
      ?.name.trim() || ""

    const assignedSubrace = control.assignments
      .map((assignment) =>
        control.templates.find((template) => template.id === assignment.template_id) || null,
      )
      .find((template) => template?.kind === "subrace")
      ?.name.trim() || ""

    const assignedRace = control.assignments
      .map((assignment) =>
        control.templates.find((template) => template.id === assignment.template_id) || null,
      )
      .find((template) => template?.kind === "race")
      ?.name.trim() || ""

    return {
      subclass,
      race: control.sheet?.race?.trim() || assignedSubrace || assignedRace,
    }
  }, [control.assignments, control.sheet?.race, control.templates])

  const classSheetBackground = referenceMedia.get(
    classReferenceArtSlot(classKey, "sheet_background"),
  )
  const classPortraitFrame = referenceMedia.get(
    classReferenceArtSlot(classKey, "portrait_frame"),
  )

  const classBackgroundActions = createSheetReferenceMediaActions({
    controller: referenceMedia,
    targetField: classReferenceArtSlot(classKey, "sheet_background"),
    title: "Фон листа · " + (control.character?.characterClass || classKey),
    eyebrow: "Лист персонажа · оформление",
    composeLabel: "Фон листа · 9:16",
    shape: "rect",
    aspectRatio: 9 / 16,
    applyLabel: "Установить фон",
    successNotice: "Фон листа обновлён.",
    resetTitle: "Сбросить фон",
    resetNotice: "Встроенный фон класса восстановлен.",
  })

  const classResourceActions = createSheetReferenceMediaActions({
    controller: referenceMedia,
    targetField: classReferenceArtSlot(classKey, "resource"),
    title: "Иконка ресурса класса",
    eyebrow: "Лист персонажа · оформление",
    composeLabel: "Ресурс класса · 1:1",
    shape: "square",
    aspectRatio: 1,
    applyLabel: "Установить иконку",
    successNotice: "Классовая иконка ресурса обновлена.",
    resetTitle: "Сбросить иконку ресурса",
    resetNotice: "Встроенная иконка ресурса класса восстановлена.",
  })

  const classSpellSlotActions = createSheetReferenceMediaActions({
    controller: referenceMedia,
    targetField: classReferenceArtSlot(classKey, "spell_slot"),
    title: "Иконка ячеек заклинаний",
    eyebrow: "Лист персонажа · оформление",
    composeLabel: "Ячейки заклинаний · 1:1",
    shape: "square",
    aspectRatio: 1,
    applyLabel: "Установить иконку",
    successNotice: "Классовая иконка ячеек обновлена.",
    resetTitle: "Сбросить иконку ячеек",
    resetNotice: "Встроенная иконка ячеек класса восстановлена.",
  })

  const classVisualActions: SnakeAction[] = referenceMedia.isOwner
    ? [{
        id: "character-sheet-class-visuals",
        label: "Оформление листа",
        kind: "branch",
        group: "media",
        children: [
          {
            id: "character-sheet-background",
            label: "Фон листа",
            kind: "branch",
            children: classBackgroundActions,
          },
          {
            id: "character-sheet-class-resource",
            label: "Иконка ресурса класса",
            kind: "branch",
            children: classResourceActions,
          },
          {
            id: "character-sheet-class-spell-slot",
            label: "Иконка ячеек",
            kind: "branch",
            children: classSpellSlotActions,
          },
        ],
      }]
    : []

  const applyHistorySnapshot = useCallback((
    snapshot: CharacterSheetHistorySnapshot,
  ) => {
    if (snapshot.kind === "interface") {
      setSection(snapshot.returnSection)
      setFocusedItemId(snapshot.focusedItemId)
      setInterfaceMode(snapshot.interface)
      return
    }

    setSection(snapshot.section)
    setFocusedItemId(null)
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

  const navigateSheet = useCallback((
    target: CharacterSheetTarget,
    options?: { focusedItemId?: string | null },
  ) => {
    const current = ensureOverviewHistory()

    if (target.kind === "interface") {
      const returnSection =
        current.kind === "sheet" ? current.section : section

      const nextFocusedItemId =
        options && "focusedItemId" in options
          ? options.focusedItemId || null
          : focusedItemId

      const next: CharacterSheetHistorySnapshot = {
        characterId,
        kind: "interface",
        interface: "inventory",
        returnSection,
        focusedItemId: nextFocusedItemId,
      }
      window.history.pushState(
        historyStateWith(next),
        "",
        window.location.href,
      )
      setSection(returnSection)
      setFocusedItemId(nextFocusedItemId)
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
      setFocusedItemId(null)
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
    setFocusedItemId(null)
    setInterfaceMode(null)
  }, [
    characterId,
    ensureOverviewHistory,
    focusedItemId,
    interfaceMode,
    section,
  ])

  const navigateEntity = useCallback((
    target: CharacterSheetEntityTarget,
  ) => {
    setEntityFocus(target)

    if (target.kind === "feature") {
      setSelectedFeatureId(target.featureId)
      setSelectedEffectId(null)
      setSpellFocusLevel(null)
      navigateSheet({ kind: "section", section: "features" })
      return
    }

    if (target.kind === "effect") {
      setSelectedEffectId(target.effectId)
      setSelectedFeatureId(null)
      setSpellFocusLevel(null)
      navigateSheet({ kind: "section", section: "features" })
      return
    }

    if (target.kind === "resource") {
      setSelectedResourceKey(target.stateKey)
      setSpellFocusLevel(null)
      navigateSheet({ kind: "section", section: "overview" })
      return
    }

    if (target.kind === "spell") {
      setSelectedSpellId(target.spellKey)
      setSpellFocusLevel(
        typeof target.level === "number" &&
          target.level >= 0 &&
          target.level <= 9
          ? target.level
          : null,
      )
      navigateSheet({ kind: "section", section: "spells" })
      return
    }

    setFocusedItemId(target.itemId)
    if (interfaceMode !== "inventory") {
      navigateSheet(
        { kind: "interface", interface: "inventory" },
        { focusedItemId: target.itemId },
      )
    } else {
      const current =
        readCharacterSheetHistory(window.history.state, characterId)
      if (current?.kind === "interface") {
        window.history.replaceState(
          historyStateWith({
            ...current,
            focusedItemId: target.itemId,
          }),
          "",
          window.location.href,
        )
      }
    }
  }, [characterId, interfaceMode, navigateSheet])

  const handleBack = useCallback(() => {
    const current = readCharacterSheetHistory(window.history.state, characterId)

    if (interfaceMode === "inventory") {
      if (current?.kind === "interface") {
        window.history.back()
      } else {
        setFocusedItemId(null)
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
  
  useEffect(
    () => bindTelegramBackButton(handleBack, { priority: 100 }),
    [handleBack],
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
          onOpen: () => setInterfaceMode(null),
        })
      : []

  const mediaActions: SnakeAction[] =
    control.canControlCharacter && workspaceCharacter && control.character
      ? createCharacterSnakeActions({
          canEditAvatar: true,
          character: workspaceCharacter,
          applyMedia: (slot, input) =>
            workspace.applyCharacterMedia(characterId, slot, input),
          resetMedia: (slot) =>
            workspace.resetCharacterMedia(characterId, slot),
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
    ...classVisualActions,
    ...managerActions,
  ]

  const authorityRole = control.isOwner
    ? "admin"
    : control.canManage
      ? "gm"
      : "player"

  const activeContextEntity = useMemo(() => {
    if (interfaceMode === "inventory" && focusedItemId) {
      return {
        type: "inventory-item",
        id: focusedItemId,
        label:
          control.inventory.find((item) => item.id === focusedItemId)?.name ||
          undefined,
      }
    }

    if (entityFocus) {
      if (entityFocus.kind === "feature") {
        return {
          type: "character-feature",
          id: entityFocus.featureId,
          label: entityFocus.label,
        }
      }
      if (entityFocus.kind === "resource") {
        return {
          type: "character-resource",
          id: entityFocus.stateKey,
          label: entityFocus.label,
        }
      }
      if (entityFocus.kind === "spell") {
        return {
          type: "character-spell",
          id: entityFocus.spellKey,
          label: entityFocus.label,
        }
      }
      if (entityFocus.kind === "item") {
        return {
          type: "inventory-item",
          id: entityFocus.itemId,
          label: entityFocus.label,
        }
      }
      return {
        type: "character-effect",
        id: entityFocus.effectId,
        label: entityFocus.label,
      }
    }

    if (section === "features" && selectedEffectId) {
      return { type: "character-effect", id: selectedEffectId }
    }
    if (section === "features" && selectedFeatureId) {
      return { type: "character-ability", id: selectedFeatureId }
    }
    if (section === "spells" && selectedSpellId) {
      return { type: "character-spell", id: selectedSpellId }
    }
    if (section === "overview" && selectedResourceKey) {
      return { type: "character-resource", id: selectedResourceKey }
    }

    return control.character
      ? {
          type: "character",
          id: control.character.id,
          label: control.character.name,
        }
      : { type: "character", id: characterId }
  }, [
    characterId,
    control.character,
    control.inventory,
    entityFocus,
    focusedItemId,
    interfaceMode,
    section,
    selectedEffectId,
    selectedFeatureId,
    selectedResourceKey,
    selectedSpellId,
  ])

  const sheetViewContext = useMemo(() => ({
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
        : "Открыт лист персонажа и его текущая игровая секция."
      : "Лист персонажа открыт, но данные недоступны.",
    entity: activeContextEntity,
    facts: control.character
      ? {
          characterId,
          section,
          interfaceMode,
          expandedAbility,
          selectedFeatureId:
            section === "features" ? selectedFeatureId : null,
          selectedSpellId:
            section === "spells" ? selectedSpellId : null,
          selectedResourceKey:
            section === "overview" ? selectedResourceKey : null,
          selectedEffectId:
            section === "features" ? selectedEffectId : null,
          focusedItemId:
            interfaceMode === "inventory" ? focusedItemId : null,
          entityFocus,
          spellFocusLevel:
            section === "spells" ? spellFocusLevel : null,
          inventoryHolderId: null,
          inventoryInterfaceStatus:
            CHARACTER_INVENTORY_INTERFACE_CONTRACT.status,
          inventoryImplementationRoadmap:
            CHARACTER_INVENTORY_INTERFACE_CONTRACT.implementationRoadmap,
          authorityRole,
          canManage: control.canManage,
          canControlCharacter: control.canControlCharacter,
          isOwner: control.isOwner,
          assignedToCurrentUser:
            control.character.assignedUserId === control.userId,
          snakePermissions: {
            inspect: true,
            navigate: true,
            editMedia: control.canControlCharacter,
            controlCharacter: control.canControlCharacter,
            manageCharacter: control.canManage,
            manageCampaign: control.canManage,
          },
          runtimeStatus: runtime.status,
          shellVersion: 2,
          class: control.character.characterClass,
          level: control.character.level,
          spellCount: control.spells.length,
          featureCount: control.features.length,
          questCount: section === "quests" ? quests.quests.length : null,
          inventoryCount: control.inventory.length,
          resourceCount: control.resources.length,
        }
      : {
          characterId,
          authorityRole,
          canManage: control.canManage,
          canControlCharacter: false,
          isOwner: control.isOwner,
          snakePermissions: {
            inspect: true,
            navigate: true,
            editMedia: false,
            controlCharacter: false,
            manageCharacter: control.canManage,
            manageCampaign: control.canManage,
          },
          error: control.error,
        },
  }), [
    activeContextEntity,
    authorityRole,
    characterId,
    control.canControlCharacter,
    control.canManage,
    control.character,
    control.error,
    control.features.length,
    control.inventory.length,
    control.isOwner,
    control.resources.length,
    quests.quests.length,
    control.spells.length,
    control.userId,
    entityFocus,
    expandedAbility,
    focusedItemId,
    interfaceMode,
    runtime.status,
    section,
    selectedEffectId,
    selectedFeatureId,
    selectedResourceKey,
    selectedSpellId,
    spellFocusLevel,
  ])

  useEffect(() => {
    if (control.loading) {
      snake.setViewContext(null)
      return
    }

    snake.setViewContext(sheetViewContext)
    return () => snake.setViewContext(null)
  }, [control.loading, sheetViewContext, snake.setViewContext])

  useAIViewContextLayer(
    "character-sheet-v2",
    control.loading ? null : sheetViewContext,
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
        characterId={characterId}
        characterName={character.name}
        classKey={classKey}
        items={control.inventory}
        canControl={control.canControlCharacter}
        focusedItemId={focusedItemId}
        onMoveItem={control.moveItemSimple}
        onQuickAccessItem={control.setQuickAccessSimple}
        onSwapItems={control.swapItemsSimple}
        onEquipItem={(item) => control.setEquipped(item, true)}
        onUseItem={control.useItem}
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
      race={identityMeta.race}
      subclass={identityMeta.subclass}
      classKey={classKey}
      portraitUrl={portraitUrl}
      portraitPresentation={portraitPresentation}
      portraitFrameUrl={
        classPortraitFrame?.url || characterSheetPortraitFrameUrl(classKey)
      }
      panelArtUrl={classSheetBackground?.url || null}
      panelArtPresentation={classSheetBackground?.presentation || null}
      dead={character.lifeState === "dead"}
      activeSection={section}
      portraitActions={portraitActions}
      onOpenPortrait={
        portraitViewAction?.surface
          ? () => snake.openSurface(portraitViewAction.surface!)
          : undefined
      }
      onNavigate={(target) => {
        setEntityFocus(null)

        if (target.kind === "interface") {
          setFocusedItemId(null)
        } else if (target.section === "features") {
          setSelectedFeatureId(null)
          setSelectedEffectId(null)
        } else if (target.section === "spells") {
          setSelectedSpellId(null)
          setSpellFocusLevel(null)
        }

        navigateSheet(
          target,
          target.kind === "interface"
            ? { focusedItemId: null }
            : undefined,
        )
      }}
      onBack={handleBack}
      core={
        <CharacterSheetCore
          contract={runtime.snapshot?.contract || null}
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
      {section === "overview" ? (
        <CharacterSheetOverview
          characterId={characterId}
          classKey={classKey}
          contract={runtime.snapshot?.contract || null}
          resourceSyncInputs={runtime.snapshot?.resourceSyncInputs || []}
          runtimeError={runtime.error || undefined}
          focusResourceKey={
            entityFocus?.kind === "resource"
              ? entityFocus.stateKey
              : null
          }
          onSelectResource={(stateKey) => setSelectedResourceKey(stateKey)}
          onNavigateEntity={navigateEntity}
          mediaController={referenceMedia}
          onOpenFeatures={() => {
            setEntityFocus(null)
            setSelectedFeatureId(null)
            setSelectedEffectId(null)
            navigateSheet({ kind: "section", section: "features" })
          }}
          onOpenSpells={(level) => {
            setEntityFocus(null)
            setSelectedSpellId(null)
            setSpellFocusLevel(
              typeof level === "number" && level >= 0 && level <= 9
                ? level
                : null,
            )
            navigateSheet({ kind: "section", section: "spells" })
          }}
        />
      ) : section === "features" ? (
        <CharacterSheetFeatures
          characterId={characterId}
          model={abilitiesReadModel}
          runtimeError={runtime.error || undefined}
          canManage={control.canManage}
          onSelect={(abilityId) => {
            setSelectedFeatureId(abilityId)
            setEntityFocus(null)
          }}
          onSetSuppressed={runtime.templates.suppressions.setSuppressed}
        />
      ) : section === "quests" ? (
        <CharacterSheetQuests
          quests={quests.quests}
          loading={quests.loading}
          error={quests.error}
          onReload={() => {
            void quests.reload()
          }}
          canManage={control.canManage}
          managerCatalog={{
            locations: workshop.locations
              .filter((location) => location.lifecycleState !== "archived")
              .map((location) => ({
                id: location.id,
                name: location.name,
              })),
            npcs: workshop.characters
              .filter((candidate) => candidate.characterType === "npc")
              .map((candidate) => ({
                id: candidate.id,
                name: candidate.name,
              })),
            items: workshop.definitions
              .filter((definition) =>
                definition.kind === "item" &&
                definition.status !== "archived"
              )
              .map((definition) => ({
                id: definition.id,
                name: definition.name,
              })),
          }}
        />
      ) : section === "proficiencies" ? (
        <CharacterSheetProficiencies
          characterId={characterId}
          model={proficienciesReadModel}
          runtimeError={runtime.error || undefined}
          canManage={control.canManage}
          onSetSuppressed={runtime.templates.suppressions.setSuppressed}
        />
      ) : section === "spells" ? (
        <CharacterSheetSpells
          characterId={characterId}
          classKey={classKey}
          classSpellProfile={classSpellProfile}
          contract={runtime.snapshot?.contract || null}
          legacySpells={control.spells}
          runtimeError={runtime.error || undefined}
          focusLevel={spellFocusLevel}
          focusSpellKey={
            entityFocus?.kind === "spell"
              ? entityFocus.spellKey
              : null
          }
          canEditPreparation={control.canControlCharacter}
          onSetPrepared={control.setSpellPrepared}
          onNavigateEntity={navigateEntity}
          mediaController={referenceMedia}
          onSelect={(spellId) => {
            setSelectedSpellId(spellId)
            setEntityFocus(null)
            setSpellFocusLevel(null)
          }}
        />
      ) : (
        <SectionPlaceholder section={section} />
      )}
    </CharacterSheetShell>
  )
}
