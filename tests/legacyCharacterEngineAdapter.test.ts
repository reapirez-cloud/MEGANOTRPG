import assert from "node:assert/strict"
import test from "node:test"

import { resolveLegacyCharacterEngineView } from "../src/lib/legacyCharacterEngineAdapter.ts"
import type { CharacterFeature, CharacterSheet, CharacterSpell } from "../src/types/characterSheet.ts"

function sheet(overrides: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    character_id: "c1", race: "Человек", background: "", alignment: "", experience: 0,
    strength: 8, dexterity: 8, constitution: 7, intelligence: 10, wisdom: 18, charisma: 19,
    armor_class: 11, initiative_bonus: -1, speed: 30, proficiency_bonus: 2,
    max_hp: 19, current_hp: 19, temp_hp: 0, hit_dice: "4d8",
    death_save_successes: 0, death_save_failures: 0, passive_perception: 14,
    saving_throw_proficiencies: ["wisdom", "charisma"],
    skill_proficiencies: {}, proficiencies: "", languages: "Общий", senses: "",
    personality_traits: "", ideals: "", bonds: "", flaws: "", backstory: "", notes: "",
    spellcasting_enabled: true, spell_change_unlocked: false, spellcasting_ability: "wisdom",
    spell_save_dc: 9, spell_attack_bonus: 1,
    spell_slots: { "1": { max: 4, used: 1 }, "2": { max: 3, used: 0 } },
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function spell(overrides: Partial<CharacterSpell> = {}): CharacterSpell {
  return {
    id: "s1", character_id: "c1", name: "Guiding Bolt", spell_level: 1,
    school: "Evocation", casting_time: "1 action", spell_range: "120 ft", duration: "Instant",
    components: "V, S", concentration: false, ritual: false, prepared: true,
    cast_mode: "slot", slot_level: 1, description: "", source: "Cleric", sort_order: 0,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function feature(overrides: Partial<CharacterFeature> = {}): CharacterFeature {
  return {
    id: "f1", character_id: "c1", kind: "feature", name: "Field Test",
    description: "Visible unless its source is suppressed.", sort_order: 0,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

test("legacy adapter routes sheet math through Character Engine and ignores stale spell DC", () => {
  const view = resolveLegacyCharacterEngineView({
    character: { id: "c1", name: "William", level: 4 },
    sheet: sheet(), spells: [spell()], features: [],
  })

  assert.equal(view.contract.abilities.wisdom.modifier, 4)
  assert.equal(view.contract.proficiencyBonus.value, 2)
  assert.equal(view.contract.spellcasting.byAbility.wisdom.saveDc, 14)
  assert.equal(view.contract.spellcasting.byAbility.wisdom.attackBonus, 6)
  assert.equal(view.contract.combat.ac.value, 11)
  assert.equal(view.contract.combat.initiative.value, -1)
})

test("passive perception is derived by CE instead of trusting the stale sheet cache", () => {
  const view = resolveLegacyCharacterEngineView({
    character: { id: "c1", name: "Vita", level: 4 },
    sheet: sheet({
      wisdom: 20,
      passive_perception: 10,
      skill_proficiencies: { perception: 1 },
    }),
    spells: [],
    features: [],
  })

  assert.equal(view.contract.abilities.wisdom.modifier, 5)
  assert.equal(view.contract.skills.perception.proficiencyRank, 1)
  assert.equal(view.contract.skills.perception.bonus.value, 7)
  assert.equal(view.contract.passives.perception.value, 17)
  assert.equal(
    view.input.contributions.some((entry) => entry.kind === "numeric" && entry.target === "passives.perception" && entry.operation === "SET"),
    false,
  )
})

test("legacy spell slots become resources and spell access is not a free cast", () => {
  const view = resolveLegacyCharacterEngineView({
    character: { id: "c1", name: "William", level: 4 },
    sheet: sheet(), spells: [spell()], features: [],
  })
  const first = view.contract.resources.find((resource) => resource.key === "spell_slot_1")
  assert.ok(first)
  assert.equal(first.current, 3)
  assert.equal(first.max.value, 4)

  const resolvedSpell = view.contract.spells[0]
  assert.ok(resolvedSpell)
  const method = resolvedSpell.accesses[0]!.methods[0]!
  assert.equal(method.attackBonus?.value, 6)
  assert.equal(method.saveDc?.value, 14)
  assert.equal(method.resourceOptions.find((option) => option.key === "slot-1")?.available, true)
})

test("a slot spell with no configured capacity remains unavailable instead of becoming free", () => {
  const view = resolveLegacyCharacterEngineView({
    character: { id: "c1", name: "Mage", level: 3 },
    sheet: sheet({ spell_slots: {} }), spells: [spell({ spell_level: 2, slot_level: 2 })], features: [],
  })
  const method = view.contract.spells[0]!.accesses[0]!.methods[0]!
  assert.equal(method.resourceOptions.length, 1)
  assert.equal(method.resourceOptions[0]!.available, false)
  assert.equal(method.available, false)
})

test("explicit integration snapshot feeds CE without registry ordering and uses canonical generic-feature suppression", () => {
  const visible = resolveLegacyCharacterEngineView({
    character: { id: "c1", name: "Snapshot", level: 4 },
    sheet: sheet({ spellcasting_enabled: false, spell_slots: {} }),
    spells: [],
    features: [feature()],
    inventoryContributions: [],
    resourceStates: {},
    templateBundles: [],
    suppressedSourceIds: new Set<string>(),
  })
  assert.equal(visible.contract.capabilities.features.some((entry) => entry.key === "f1"), true)

  const suppressed = resolveLegacyCharacterEngineView({
    character: { id: "c1", name: "Snapshot", level: 4 },
    sheet: sheet({ spellcasting_enabled: false, spell_slots: {} }),
    spells: [],
    features: [feature()],
    inventoryContributions: [],
    resourceStates: {},
    templateBundles: [],
    suppressedSourceIds: new Set(["feature:f1"]),
  })
  assert.equal(suppressed.contract.capabilities.features.some((entry) => entry.key === "f1"), false)
})


test("legacy adapter ignores malformed persisted feature mechanics instead of bricking CE", () => {
  const malformed = feature({
    id: "bad-feature",
    name: "Malformed metadata",
    mechanics: [{ kind: "feat", slug: "actor" }] as unknown as CharacterFeature["mechanics"],
  })

  const view = resolveLegacyCharacterEngineView({
    character: { id: "c1", name: "Kevin", level: 14 },
    sheet: sheet({ spellcasting_enabled: false, spell_slots: {} }),
    spells: [],
    features: [malformed],
    inventoryContributions: [],
    resourceStates: {},
    templateBundles: [],
    suppressedSourceIds: new Set<string>(),
  })

  assert.equal(view.contract.name, "Kevin")
  assert.equal(view.contract.capabilities.features.some((entry) => entry.key === "bad-feature"), true)
})


test("legacy adapter keeps different catalog spells separate when their localized names collide", () => {
  const hex = spell({
    id: "hex-row",
    catalog_spell_id: "catalog-hex",
    name: "Сглаз",
    spell_level: 1,
    school: "Enchantment",
    cast_mode: "slot",
    slot_level: 1,
  })
  const eyebite = spell({
    id: "eyebite-row",
    catalog_spell_id: "catalog-eyebite",
    name: "Сглаз",
    spell_level: 6,
    school: "Necromancy",
    cast_mode: "slot",
    slot_level: 6,
  })

  const view = resolveLegacyCharacterEngineView({
    character: { id: "c1", name: "Kevin", level: 14 },
    sheet: sheet({
      spell_slots: {
        "1": { max: 1, used: 0 },
        "6": { max: 1, used: 0 },
      },
    }),
    spells: [hex, eyebite],
    features: [],
    inventoryContributions: [],
    resourceStates: {},
    templateBundles: [],
    suppressedSourceIds: new Set<string>(),
  })

  assert.equal(view.contract.spells.length, 2)
  assert.deepEqual(
    view.contract.spells.map((entry) => [entry.identity.name, entry.identity.level, entry.identity.school]),
    [
      ["Сглаз", 1, "Enchantment"],
      ["Сглаз", 6, "Necromancy"],
    ],
  )
  assert.notEqual(view.contract.spells[0]!.key, view.contract.spells[1]!.key)
})
