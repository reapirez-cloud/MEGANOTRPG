import { useMemo } from "react"
import { createRoot } from "react-dom/client"

import { resolveCharacterContract } from "../character-engine/index.ts"
import { buildLegacyCharacterEngineInput } from "../lib/legacyCharacterEngineAdapter.ts"
import type { CharacterSheet, CharacterSpell } from "../types/characterSheet.ts"
import { AIProvider } from "../ai/AIProvider.tsx"
import CharacterSheetSpells from "../ui-v1-isolated/CharacterSheetSpells.tsx"
import { SnakeProvider } from "../ui-v1-isolated/SnakeProvider.tsx"

import "../ui-v1-isolated/styles.css"
import "../ui-v1-isolated/snake.css"
import "../ui-v1-isolated/character-sheet-theme.css"
import "../ui-v1-isolated/character-sheet-backgrounds.css"
import "../ui-v1-isolated/character-sheet-shell.css"
import "../ui-v1-isolated/character-sheet-spells.css"

const now = "2026-09-17T12:00:00.000Z"

function spell(
  id: string,
  name: string,
  level: number,
  castingTime: string,
  concentration = false,
): CharacterSpell {
  return {
    id,
    character_id: "stage2-cleric",
    name,
    spell_level: level,
    school: level === 0 ? "Evocation" : "Abjuration",
    casting_time: castingTime,
    spell_range: "60 футов",
    duration: concentration ? "Концентрация, до 1 минуты" : "Мгновенно",
    components: "В, С",
    concentration,
    ritual: false,
    prepared: true,
    cast_mode: level === 0 ? "cantrip" : "slot",
    slot_level: level || null,
    description: `${name}: тестовое описание для визуальной сертификации панели.`,
    source: "Жрец",
    sort_order: level,
    created_at: now,
    updated_at: now,
  }
}

const spells: CharacterSpell[] = [
  spell("sacred-flame", "Священный огонь", 0, "Действие"),
  spell("healing-word", "Шёпот исцеления", 0, "Бонусное действие"),
  spell("light", "Магический свет", 0, "Действие"),
  spell("guidance", "Указание", 0, "Действие", true),
  spell("cure-wounds", "Лечение", 1, "Действие"),
  spell("bless", "Благословение", 1, "Действие", true),
  spell("shield-of-faith", "Щит веры", 1, "Бонусное действие", true),
  spell("protection", "Защита от добра и зла", 1, "Действие", true),
  spell("purify", "Очищение от зла", 1, "Действие"),
  spell("silence", "Молчание", 2, "Действие", true),
  spell("lesser-restoration", "Малое восстановление", 2, "Действие"),
  spell("detect-thoughts", "Обнаружение мыслей", 2, "Действие", true),
  spell("remove-curse", "Снятие проклятия", 3, "Действие"),
  spell("circle-of-protection", "Круг защиты", 3, "Действие", true),
  spell("revivify", "Оживить мёртвых", 3, "Действие"),
]

const sheet: CharacterSheet = {
  character_id: "stage2-cleric",
  race: "Человек",
  background: "Послушник",
  alignment: "Нейтральный",
  experience: 6500,
  strength: 10,
  dexterity: 12,
  constitution: 14,
  intelligence: 11,
  wisdom: 18,
  charisma: 13,
  armor_class: 17,
  initiative_bonus: 1,
  speed: 30,
  proficiency_bonus: 3,
  max_hp: 38,
  current_hp: 38,
  temp_hp: 0,
  hit_dice: "5к8",
  death_save_successes: 0,
  death_save_failures: 0,
  passive_perception: 17,
  saving_throw_proficiencies: ["wisdom", "charisma"],
  skill_proficiencies: {},
  proficiencies: "",
  languages: "Общий",
  senses: "",
  personality_traits: "",
  ideals: "",
  bonds: "",
  flaws: "",
  backstory: "",
  notes: "",
  spellcasting_enabled: true,
  spell_change_unlocked: true,
  spellcasting_ability: "wisdom",
  spell_save_dc: 15,
  spell_attack_bonus: 7,
  spell_slots: {
    "1": { max: 4, used: 0 },
    "2": { max: 3, used: 0 },
    "3": { max: 3, used: 3 },
    "4": { max: 2, used: 0 },
    "5": { max: 1, used: 0 },
  },
  created_at: now,
  updated_at: now,
}

function Stage2SpellPanelPreview() {
  const contract = useMemo(() => {
    const input = buildLegacyCharacterEngineInput({
      character: { id: "stage2-cleric", name: "Аурелия", level: 5 },
      sheet,
      spells,
      features: [],
    })
    return resolveCharacterContract(input)
  }, [])

  return (
    <main className="u1-character-sheet" data-class-key="cleric">
      <span className="u1-character-sheet__fixed-backdrop" aria-hidden="true" />
      <section className="u1-character-sheet__content" data-section="spells">
        <CharacterSheetSpells
          characterId="stage2-cleric"
          characterClass="Жрица"
          characterLevel={5}
          classKey="cleric"
          contract={contract}
          legacySpells={spells}
          focusLevel={1}
        />
      </section>
    </main>
  )
}

const root = document.getElementById("character-spell-panels-stage2-root")
if (!root) throw new Error("Stage 2 spell panel root not found")

createRoot(root).render(
  <AIProvider>
    <SnakeProvider>
      <div className="u1-app">
        <div className="u1-stage">
          <div className="u1-view">
            <Stage2SpellPanelPreview />
          </div>
        </div>
      </div>
    </SnakeProvider>
  </AIProvider>,
)
