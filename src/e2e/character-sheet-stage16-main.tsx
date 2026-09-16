import { useCallback, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

import { AIProvider } from "../ai/AIProvider"
import type { SnakeAction } from "../snake-engine"
import CharacterInventoryInterface from "../ui-v1-isolated/CharacterInventoryInterface"
import CharacterSheetShell from "../ui-v1-isolated/CharacterSheetShell"
import {
  characterSheetHistoryStateWith,
  readCharacterSheetHistory,
  type CharacterSheetHistorySnapshot,
} from "../ui-v1-isolated/characterSheetHistory"
import {
  type CharacterSheetSection,
  type CharacterSheetTarget,
} from "../ui-v1-isolated/characterSheetUiContract"
import { SnakeProvider, SnakeTrigger } from "../ui-v1-isolated/SnakeProvider"
import { bindTelegramBackButton } from "../ui-v1-isolated/telegramBackButton"

import "../ui-v1-isolated/styles.css"
import "../ui-v1-isolated/snake.css"
import "../ui-v1-isolated/character-sheet-theme.css"
import "../ui-v1-isolated/character-sheet-shell.css"
import "../ui-v1-isolated/character-sheet-core.css"
import "../ui-v1-isolated/character-sheet-features.css"
import "../ui-v1-isolated/character-sheet-overview.css"
import "../ui-v1-isolated/character-sheet-spells.css"
import "../ui-v1-isolated/character-inventory-interface.css"

const characterId = "stage16-character"

function stateWith(snapshot: CharacterSheetHistorySnapshot) {
  return characterSheetHistoryStateWith(window.history.state, snapshot)
}

function Stage16Harness() {
  const [section, setSection] = useState<CharacterSheetSection>("overview")
  const [inventory, setInventory] = useState(false)
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [leftRoute, setLeftRoute] = useState(false)

  const applySnapshot = useCallback((snapshot: CharacterSheetHistorySnapshot) => {
    if (snapshot.kind === "interface") {
      setSection(snapshot.returnSection)
      setInventory(true)
      setFocusedItemId(snapshot.focusedItemId)
      return
    }

    setSection(snapshot.section)
    setInventory(false)
    setFocusedItemId(null)
  }, [])

  useEffect(() => {
    const current = readCharacterSheetHistory(window.history.state, characterId)
    if (current) {
      applySnapshot(current)
    } else {
      const initial: CharacterSheetHistorySnapshot = {
        characterId,
        kind: "sheet",
        section: "overview",
      }
      window.history.replaceState(stateWith(initial), "", window.location.href)
      applySnapshot(initial)
    }

    const onPopState = (event: PopStateEvent) => {
      const snapshot = readCharacterSheetHistory(event.state, characterId)
      if (snapshot) applySnapshot(snapshot)
    }

    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [applySnapshot])

  const navigate = useCallback((target: CharacterSheetTarget) => {
    const current =
      readCharacterSheetHistory(window.history.state, characterId) || {
        characterId,
        kind: "sheet" as const,
        section: "overview" as const,
      }

    if (target.kind === "interface") {
      const next: CharacterSheetHistorySnapshot = {
        characterId,
        kind: "interface",
        interface: "inventory",
        returnSection:
          current.kind === "sheet" ? current.section : section,
        focusedItemId,
      }
      window.history.pushState(stateWith(next), "", window.location.href)
      applySnapshot(next)
      return
    }

    const next: CharacterSheetHistorySnapshot = {
      characterId,
      kind: "sheet",
      section: target.section,
    }

    if (
      current.kind === "sheet" &&
      current.section === "overview" &&
      target.section !== "overview"
    ) {
      window.history.pushState(stateWith(next), "", window.location.href)
    } else {
      window.history.replaceState(stateWith(next), "", window.location.href)
    }

    applySnapshot(next)
  }, [applySnapshot, focusedItemId, section])

  const handleBack = useCallback(() => {
    const current = readCharacterSheetHistory(window.history.state, characterId)

    if (
      current?.kind === "interface" ||
      (current?.kind === "sheet" && current.section !== "overview")
    ) {
      window.history.back()
      return
    }

    setLeftRoute(true)
  }, [])

  useEffect(() => bindTelegramBackButton(handleBack), [handleBack])

  const snakeActions: SnakeAction[] = [{
    id: "stage16-inspect",
    label: "Осмотреть",
    surface: {
      kind: "detail",
      eyebrow: "Stage 16",
      title: "Touch target",
      body: "Snake opened after a deliberate long press.",
    },
  }]

  if (leftRoute) {
    return (
      <main data-testid="stage16-left-route">
        Лист покинут
      </main>
    )
  }

  if (inventory) {
    return (
      <CharacterInventoryInterface
        characterId={characterId}
        characterName="Сертификационный герой"
        classKey="fighter"
        focusedItemId={focusedItemId}
        focusedItemName={focusedItemId ? "Тестовый предмет" : null}
        onBack={handleBack}
      />
    )
  }

  return (
    <CharacterSheetShell
      characterId={characterId}
      characterName="Сертификационный герой"
      characterClass="Воин"
      level={5}
      classKey="fighter"
      portraitUrl={null}
      portraitPresentation={null}
      portraitActions={[]}
      activeSection={section}
      onNavigate={navigate}
      onBack={handleBack}
      core={
        <section
          className="u1-character-sheet-core"
          data-testid="stage16-core"
        >
          <div className="u1-character-sheet-core__quick">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="u1-character-sheet-core__quick-row"
              >
                <span className="u1-character-sheet-core__quick-icon" />
                <span className="u1-character-sheet-core__quick-label">
                  Показатель {index + 1}
                </span>
                <strong>{10 + index}</strong>
              </div>
            ))}
          </div>
          <div className="u1-character-sheet-core__abilities">
            {["СИЛ", "ЛВК", "ТЕЛ", "ИНТ", "МДР", "ХАР"].map(
              (label, index) => (
                <button
                  key={label}
                  type="button"
                  className="u1-character-sheet-core__ability-row"
                >
                  <span>{label}</span>
                  <strong>{10 + index}</strong>
                  <em>+2</em>
                </button>
              ),
            )}
          </div>
        </section>
      }
    >
      <div
        data-testid="stage16-scroll-content"
        style={{ minHeight: 880, paddingBottom: 40 }}
      >
        <p>
          Mobile certification surface. Content is intentionally tall so
          scrolling, sticky safe areas and long press can be exercised.
        </p>

        <SnakeTrigger
          entity={{
            type: "stage16-target",
            id: "touch-target",
            label: "Touch target",
          }}
          actions={snakeActions}
        >
          <button
            type="button"
            data-testid="stage16-snake-target"
            style={{
              width: "100%",
              minHeight: 52,
              marginTop: 24,
            }}
          >
            Удерживать для Snake
          </button>
        </SnakeTrigger>

        <button
          type="button"
          data-testid="stage16-focus-item"
          onClick={() => setFocusedItemId("item-stage16")}
          style={{
            width: "100%",
            minHeight: 52,
            marginTop: 24,
          }}
        >
          Выбрать тестовый предмет
        </button>
      </div>
    </CharacterSheetShell>
  )
}

const root = document.getElementById("character-sheet-stage16-root")
if (!root) throw new Error("Stage 16 root not found")

createRoot(root).render(
  <AIProvider>
    <SnakeProvider>
      <Stage16Harness />
    </SnakeProvider>
  </AIProvider>,
)
