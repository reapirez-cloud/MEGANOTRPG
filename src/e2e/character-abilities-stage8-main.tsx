import { createRoot } from "react-dom/client"

import { AIProvider } from "../ai/AIProvider"
import CharacterSheetFeatures from "../ui-v1-isolated/CharacterSheetFeatures"
import CharacterSheetShell from "../ui-v1-isolated/CharacterSheetShell"
import type {
  CharacterAbilitiesReadModel,
  CharacterAbilityGroupKey,
  CharacterAbilityRow,
} from "../ui-v1-isolated/characterAbilitiesReadModel"
import { SnakeProvider } from "../ui-v1-isolated/SnakeProvider"

import "../ui-v1-isolated/styles.css"
import "../ui-v1-isolated/snake.css"
import "../ui-v1-isolated/character-sheet-theme.css"
import "../ui-v1-isolated/character-sheet-backgrounds.css"
import "../ui-v1-isolated/character-sheet-shell.css"
import "../ui-v1-isolated/character-sheet-core.css"
import "../ui-v1-isolated/character-sheet-features.css"
import "../ui-v1-isolated/character-sheet-overview.css"
import "../ui-v1-isolated/character-sheet-spells.css"

function row(
  group: CharacterAbilityGroupKey,
  index: number,
  label: string,
  options?: { suppressed?: boolean; icon?: string },
): CharacterAbilityRow {
  return {
    id: `${group}:stage8-${index}`,
    group,
    sourceId: `stage8:${group}:${index}`,
    sourceIds: [`stage8:${group}:${index}`],
    sourceName: group === "class" ? "Воин" : group === "subclass" ? "Мастер битвы" : group === "race" ? "Человек" : group === "background" ? "Солдат" : "Активные состояния",
    sourceNames: [],
    sourceType: "stage8",
    label,
    shortDescription: "Короткое описание способности для проверки плотности строки.",
    unlockLevel: 1,
    icon: options?.icon || "feature:second-wind",
    status: options?.suppressed ? "suppressed" : "active",
    runtimeAvailable: true,
    mechanics: [],
    voss: { explanation: "", nuances: [], comment: "" },
    capabilities: { inspect: true, suppress: true },
  }
}

const model: CharacterAbilitiesReadModel = {
  groups: [
    {
      key: "class",
      label: "Класс",
      sourceNames: ["Воин"],
      rows: [
        row("class", 1, "Второе дыхание", { icon: "feature:second-wind" }),
        row("class", 2, "Всплеск действий"),
        row("class", 3, "Несгибаемый"),
        row("class", 4, "Экстра атака"),
        row("class", 5, "Тактическая выдержка"),
      ],
      totalCount: 5,
      activeCount: 5,
      suppressedCount: 0,
    },
    {
      key: "subclass",
      label: "Подкласс",
      sourceNames: ["Мастер битвы"],
      rows: [
        row("subclass", 1, "Манёвр: Контратака"),
        row("subclass", 2, "Манёвр: Толчок"),
        row("subclass", 3, "Знай своего врага"),
      ],
      totalCount: 3,
      activeCount: 3,
      suppressedCount: 0,
    },
    {
      key: "race",
      label: "Раса",
      sourceNames: ["Человек"],
      rows: [
        row("race", 1, "Универсальность"),
        row("race", 2, "Наследие"),
      ],
      totalCount: 2,
      activeCount: 2,
      suppressedCount: 0,
    },
    {
      key: "background",
      label: "Предыстория",
      sourceNames: [],
      rows: [],
      totalCount: 0,
      activeCount: 0,
      suppressedCount: 0,
    },
    {
      key: "effect",
      label: "Эффекты",
      sourceNames: ["Активные состояния"],
      rows: [
        row("effect", 1, "Благословение", { suppressed: true }),
      ],
      totalCount: 1,
      activeCount: 0,
      suppressedCount: 1,
    },
  ],
  unclassifiedSourceIds: [],
}

function Stage8Harness() {
  return (
    <CharacterSheetShell
      characterId="stage8-character"
      characterName="Сертификационный герой"
      characterClass="Воин"
      race="Человек"
      subclass="Мастер битвы"
      level={8}
      classKey="fighter"
      portraitUrl={null}
      portraitPresentation={null}
      portraitActions={[]}
      activeSection="features"
      onNavigate={() => {}}
      onBack={() => {}}
    >
      <div data-testid="stage8-abilities-wrap">
        <CharacterSheetFeatures
          characterId="stage8-character"
          model={model}
          canManage={false}
        />
      </div>
    </CharacterSheetShell>
  )
}

const root = document.getElementById("character-abilities-stage8-root")
if (!root) throw new Error("Stage 8 root not found")

createRoot(root).render(
  <AIProvider>
    <SnakeProvider>
      <div className="u1-app">
        <div className="u1-stage">
          <div className="u1-view">
            <Stage8Harness />
          </div>
        </div>
      </div>
    </SnakeProvider>
  </AIProvider>,
)
