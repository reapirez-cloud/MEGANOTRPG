import { describe, expect, it } from "vitest"

import {
  isSpellAvailableToCharacter,
  maxAvailableSpellLevel,
  normalizeSpellClass,
} from "../src/lib/spellCatalog"

describe("spell catalog class normalization", () => {
  it("recognizes Russian and English base classes", () => {
    expect(normalizeSpellClass("Жрец")).toBe("cleric")
    expect(normalizeSpellClass(" cleric ")).toBe("cleric")
    expect(normalizeSpellClass("Варлок")).toBe("warlock")
    expect(normalizeSpellClass("Волшебник")).toBe("wizard")
  })

  it("does not guess unknown or custom classes", () => {
    expect(normalizeSpellClass("Мрут")).toBeNull()
    expect(normalizeSpellClass("Персонаж")).toBeNull()
  })
})

describe("spell catalog availability", () => {
  it("uses the highest slot level with a positive maximum", () => {
    expect(maxAvailableSpellLevel({
      "1": { max: 4, used: 2 },
      "2": { max: 3, used: 3 },
      "3": { max: 2, used: 2 },
      "4": { max: 0, used: 0 },
    })).toBe(3)
  })

  it("shows cantrips plus spells up to the character slot ceiling", () => {
    const clericCantrip = { spell_level: 0, classes: ["cleric" as const] }
    const clericThird = { spell_level: 3, classes: ["cleric" as const] }
    const clericFourth = { spell_level: 4, classes: ["cleric" as const] }
    const wizardThird = { spell_level: 3, classes: ["wizard" as const] }

    expect(isSpellAvailableToCharacter(clericCantrip, "cleric", 3, true)).toBe(true)
    expect(isSpellAvailableToCharacter(clericThird, "cleric", 3, true)).toBe(true)
    expect(isSpellAvailableToCharacter(clericFourth, "cleric", 3, true)).toBe(false)
    expect(isSpellAvailableToCharacter(wizardThird, "cleric", 3, true)).toBe(false)
  })

  it("requires spellcasting to be enabled for the smart available filter", () => {
    const spell = { spell_level: 1, classes: ["cleric" as const] }
    expect(isSpellAvailableToCharacter(spell, "cleric", 3, false)).toBe(false)
  })
})
