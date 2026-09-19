import { createRoot } from "react-dom/client"

import { AIProvider } from "../ai/AIProvider.tsx"
import CharacterSheetProficiencies from "../ui-v1-isolated/CharacterSheetProficiencies.tsx"
import CharacterSheetShell from "../ui-v1-isolated/CharacterSheetShell.tsx"
import type {
  CharacterProficienciesReadModel,
  CharacterProficiencyRow,
  CharacterProficiencySource,
} from "../ui-v1-isolated/characterProficienciesReadModel.ts"
import { SnakeProvider } from "../ui-v1-isolated/SnakeProvider.tsx"

import "../ui-v1-isolated/styles.css"
import "../ui-v1-isolated/snake.css"
import "../ui-v1-isolated/character-sheet-theme.css"
import "../ui-v1-isolated/character-sheet-backgrounds.css"
import "../ui-v1-isolated/character-sheet-shell.css"
import "../ui-v1-isolated/character-sheet-core.css"
import "../ui-v1-isolated/character-sheet-proficiencies.css"

const manager =
  new URLSearchParams(window.location.search).get("manager") === "1"

function source(
  id: string,
  name: string,
  suppressed = false,
): CharacterProficiencySource {
  return {
    contributionId: "stage7:" + id,
    sourceId: "stage7:source:" + id,
    name,
    sourceType: "stage7_fixture",
    suppressed,
    suppressedBySourceId: suppressed ? "stage7:source:" + id : null,
    directlyManagedSuppressed: suppressed,
    suppressible: true,
  }
}

function row(
  group: CharacterProficiencyRow["group"],
  key: string,
  label: string,
  sourceName: string,
  options?: {
    suppressed?: boolean
    rank?: 1 | 2
    extraSources?: CharacterProficiencySource[]
  },
): CharacterProficiencyRow {
  const primary = source(
    group + ":" + key,
    sourceName,
    options?.suppressed,
  )

  return {
    id: group + ":" + key,
    group,
    key,
    label,
    rank: options?.rank || 1,
    origin: "character-engine",
    catalogued: true,
    status: options?.suppressed ? "suppressed" : "active",
    sources: [primary, ...(options?.extraSources || [])],
  }
}

const weapons = [
  row("weapons", "weapon:simple", "Простое оружие", "Воин"),
  row("weapons", "weapon:martial", "Воинское оружие", "Воин"),
  row(
    "weapons",
    "weapon:martial-light",
    "Воинское оружие со свойством «Лёгкое»",
    "Монах",
  ),
  row("weapons", "weapon:war-pick", "Боевая кирка", "Талант"),
]

const armor: CharacterProficiencyRow[] = []

const tools = [
  row("tools", "tool:herbalism-kit", "Набор травника", "Предыстория"),
  row("tools", "tool:smith-tools", "Инструменты кузнеца", "Воин"),
  row("tools", "tool:brewer-supplies", "Инструменты пивовара", "Предыстория"),
  row("tools", "tool:calligrapher-supplies", "Инструменты каллиграфа", "Талант"),
  row("tools", "tool:cartographer-tools", "Инструменты картографа", "Предыстория"),
  row("tools", "tool:glassblower-tools", "Инструменты стеклодува", "Предыстория"),
  row("tools", "tool:jeweler-tools", "Инструменты ювелира", "Предыстория"),
  row("tools", "tool:leatherworker-tools", "Инструменты кожевника", "Предыстория"),
  row("tools", "tool:musical:bagpipes", "Волынка", "Бард"),
  row("tools", "tool:musical:drum", "Барабан", "Бард"),
  row("tools", "tool:musical:lute", "Лютня", "Бард"),
  row("tools", "tool:musical:viol", "Виола", "Бард"),
]

const languages = [
  row("languages", "common", "Общий", "Раса"),
  row("languages", "dwarvish", "Дварфский", "Раса"),
  row("languages", "elvish", "Эльфийский", "Предыстория"),
  row("languages", "giant", "Великаний", "Талант"),
  row("languages", "goblin", "Гоблинский", "Предыстория"),
  row("languages", "draconic", "Драконий", "Раса"),
  row("languages", "infernal", "Инфернальный", "Талант"),
  row("languages", "primordial", "Первичный", "Предыстория"),
  row("languages", "sylvan", "Сильван", "Предыстория"),
  row(
    "languages",
    "deep-speech",
    "Глубинная речь",
    "Эффект",
    { suppressed: true },
  ),
]

const savingThrows = [
  row("saving_throws", "savingThrow:strength", "Сила", "Воин"),
  row("saving_throws", "savingThrow:constitution", "Телосложение", "Воин"),
]

const model: CharacterProficienciesReadModel = {
  groups: [
    {
      key: "weapons",
      label: "Оружие",
      description: "Ты знаешь, как обращаться со следующим оружием:",
      iconSlot: "sheet:proficiencies:weapons",
      catalogMode: "open",
      catalogCount: null,
      rows: weapons,
      currentCount: weapons.length,
    },
    {
      key: "armor",
      label: "Доспехи",
      description: "Ты умеешь использовать:",
      iconSlot: "sheet:proficiencies:armor",
      catalogMode: "closed",
      catalogCount: 4,
      rows: armor,
      currentCount: armor.length,
    },
    {
      key: "tools",
      label: "Инструменты",
      description: "Ты владеешь следующими наборами:",
      iconSlot: "sheet:proficiencies:tools",
      catalogMode: "open",
      catalogCount: null,
      rows: tools,
      currentCount: tools.length,
    },
    {
      key: "languages",
      label: "Языки",
      description: "Ты говоришь и понимаешь:",
      iconSlot: "sheet:proficiencies:languages",
      catalogMode: "open",
      catalogCount: null,
      rows: languages,
      currentCount: languages.filter((entry) => entry.status === "active").length,
    },
    {
      key: "saving_throws",
      label: "Спасброски",
      description: "У тебя есть владение в следующих спасбросках:",
      iconSlot: "sheet:proficiencies:saving-throws",
      catalogMode: "closed",
      catalogCount: 6,
      rows: savingThrows,
      currentCount: savingThrows.length,
    },
  ],
  unclassifiedRuntimeKeys: [],
  unclassifiedLegacyTokens: [],
}

function Stage7Harness() {
  return (
    <CharacterSheetShell
      characterId="stage7-character"
      characterName="Сертификационный герой"
      characterClass="Воин"
      race="Человек"
      subclass="Мастер битвы"
      level={8}
      classKey="fighter"
      portraitUrl={null}
      portraitPresentation={null}
      portraitActions={[]}
      activeSection="proficiencies"
      onNavigate={() => {}}
      onBack={() => {}}
    >
      <div data-testid="stage7-proficiencies-wrap">
        <CharacterSheetProficiencies
          characterId="stage7-character"
          model={model}
          canManage={manager}
          onSetSuppressed={async () => ({ ok: true })}
        />
      </div>
    </CharacterSheetShell>
  )
}

const root = document.getElementById("character-proficiencies-stage7-root")
if (!root) throw new Error("Stage 7 proficiencies root not found")

createRoot(root).render(
  <AIProvider>
    <SnakeProvider>
      <div className="u1-app">
        <div className="u1-stage">
          <div className="u1-view">
            <Stage7Harness />
          </div>
        </div>
      </div>
    </SnakeProvider>
  </AIProvider>,
)
