import {
  abilityModifier,
  proficiencyBonusForLevel,
  resolveCharacterContract,
  type AbilityKey,
  type CharacterContribution,
  type CharacterEngineInput,
  type CharacterSource,
  type NumericContribution,
  type ProficiencyRank,
  type ResolvedCharacterContract,
  type ResourceState,
  type SkillKey,
  type SpellResourceOption,
} from "../character-engine/index.ts"
import type { Character } from "../context/CharacterContext.tsx"
import {
  featureMechanicContributions,
  inventoryMechanicContributions,
  registeredCharacterInventory,
} from "./characterMechanics.ts"
import { registeredCharacterResourceState } from "./resourceRuntime.ts"
import { characterTemplateContributions } from "../rule-templates/registry.ts"
import type { CharacterFeature, CharacterSheet, CharacterSpell, InventoryItem, SkillRank } from "../types/characterSheet.ts"

export interface LegacyCharacterEngineView { input: CharacterEngineInput; contract: ResolvedCharacterContract; spellcastingAbility?: AbilityKey }

const ABILITY_ALIASES: Record<string, AbilityKey> = {
  strength: "strength", str: "strength", сила: "strength", сил: "strength",
  dexterity: "dexterity", dex: "dexterity", ловкость: "dexterity", лов: "dexterity",
  constitution: "constitution", con: "constitution", телосложение: "constitution", тел: "constitution",
  intelligence: "intelligence", int: "intelligence", интеллект: "intelligence", инт: "intelligence",
  wisdom: "wisdom", wis: "wisdom", мудрость: "wisdom", мдр: "wisdom",
  charisma: "charisma", cha: "charisma", харизма: "charisma", хар: "charisma",
}
function normalize(value: string): string { return value.trim().toLocaleLowerCase("ru-RU").replace(/[._-]+/g, " ").replace(/\s+/g, " ") }
export function parseLegacySpellcastingAbility(value: string | null | undefined): AbilityKey | undefined { return value ? ABILITY_ALIASES[normalize(value)] : undefined }
function legacySource(id: string, name: string, sourceType = "legacy"): CharacterSource { return { id, name, sourceType, visibility: "campaign" } }
function setNumber(id: string, target: NumericContribution["target"], value: number, source: CharacterSource): NumericContribution { return { id, kind: "numeric", target, operation: "SET", value, source, priority: -100 } }
function splitReferenceText(value: string): string[] { return value.split(/[\n;,]+/).map((entry) => entry.trim()).filter(Boolean) }
function addTextGrants(contributions: CharacterContribution[], target: "language" | "proficiency" | "sense", text: string, source: CharacterSource): void { splitReferenceText(text).forEach((label, index) => contributions.push({ id: `${source.id}:${target}:${index}`, kind: "grant", operation: "GRANT", target, key: label, ...(target === "proficiency" ? { payload: { rank: 1 } } : {}), source })) }
function skillRanks(value: CharacterSheet["skill_proficiencies"]): Partial<Record<SkillKey, ProficiencyRank>> { return Object.fromEntries(Object.entries(value || {}).map(([key, rank]) => [key, Math.max(0, Math.min(2, Number(rank))) as ProficiencyRank])) as Partial<Record<SkillKey, ProficiencyRank>> }
function savingThrowRanks(value: string[]): Partial<Record<AbilityKey, ProficiencyRank>> { const result: Partial<Record<AbilityKey, ProficiencyRank>> = {}; for (const raw of value || []) { const ability = ABILITY_ALIASES[normalize(raw)]; if (ability) result[ability] = 1 } return result }
function legacySpellKey(spell: CharacterSpell): string { const clean = spell.name.trim().toLocaleLowerCase("ru-RU").replace(/[^a-zа-яё0-9]+/giu, "-").replace(/^-|-$/g, ""); return clean ? `spell:${clean}` : `spell:${spell.id}` }
function configuredSlotLevels(sheet: CharacterSheet, spells: CharacterSpell[]): number[] { const levels = new Set<number>(); for (let level = 1; level <= 9; level += 1) if (Number(sheet.spell_slots?.[String(level)]?.max || 0) > 0) levels.add(level); for (const spell of spells) if (spell.spell_level > 0 && spell.cast_mode !== "cantrip") levels.add(spell.spell_level); return [...levels].sort((a, b) => a - b) }
function slotResourceKey(level: number): string { return `spell_slot_${level}` }
function slotOptions(spellLevel: number, slotLevels: number[]): SpellResourceOption[] { return slotLevels.filter((level) => level >= spellLevel).map((level) => ({ key: `slot-${level}`, castLevel: level, costs: [{ key: slotResourceKey(level), amount: 1 }] })) }
function expectedPassivePerception(sheet: CharacterSheet, resolvedProficiency: number): number { const rank = Number((sheet.skill_proficiencies || {}).perception || 0) as SkillRank; return 10 + abilityModifier(sheet.wisdom) + resolvedProficiency * rank }

export function buildLegacyCharacterEngineInput(args: {
  character: Pick<Character, "id" | "name" | "level">
  sheet: CharacterSheet
  spells: CharacterSpell[]
  features: CharacterFeature[]
  inventory?: InventoryItem[]
  resourceStates?: Record<string, ResourceState>
}): CharacterEngineInput {
  const { character, sheet, spells, features } = args
  const inventory = args.inventory ?? registeredCharacterInventory(character.id)
  const sheetSource = legacySource("legacy-sheet", "Базовый лист персонажа", "legacy_sheet")
  const contributions: CharacterContribution[] = []
  const standardProficiency = proficiencyBonusForLevel(character.level)
  if (sheet.proficiency_bonus !== standardProficiency) contributions.push(setNumber("legacy:proficiency-override", "core.proficiencyBonus", sheet.proficiency_bonus, sheetSource))
  const resolvedProficiency = sheet.proficiency_bonus !== standardProficiency ? sheet.proficiency_bonus : standardProficiency
  contributions.push(setNumber("legacy:ac", "combat.ac", sheet.armor_class, sheetSource))
  const naturalInitiative = abilityModifier(sheet.dexterity)
  if (sheet.initiative_bonus !== naturalInitiative) contributions.push(setNumber("legacy:initiative-override", "combat.initiative", sheet.initiative_bonus, sheetSource))
  const expectedPassive = expectedPassivePerception(sheet, resolvedProficiency)
  if (sheet.passive_perception !== expectedPassive) contributions.push(setNumber("legacy:passive-perception-override", "passives.perception", sheet.passive_perception, sheetSource))
  addTextGrants(contributions, "language", sheet.languages, sheetSource); addTextGrants(contributions, "proficiency", sheet.proficiencies, sheetSource); addTextGrants(contributions, "sense", sheet.senses, sheetSource)
  for (const feature of features) { const source = legacySource(`legacy-feature:${feature.id}`, feature.name, "legacy_feature"); contributions.push({ id: `legacy:feature:${feature.id}`, kind: "grant", operation: "GRANT", target: "feature", key: feature.id, payload: { label: feature.name, description: feature.description, kind: feature.kind, legacyFeatureId: feature.id }, source }) }
  contributions.push(...featureMechanicContributions(features), ...inventoryMechanicContributions(inventory), ...characterTemplateContributions(character.id, character.level))

  const resources: Record<string, ResourceState> = { ...registeredCharacterResourceState(character.id), ...(args.resourceStates || {}) }
  const slotLevels = configuredSlotLevels(sheet, spells)
  for (const level of slotLevels) {
    const slot = sheet.spell_slots?.[String(level)]; const max = Math.max(0, Number(slot?.max || 0)); const used = Math.max(0, Number(slot?.used || 0)); const key = slotResourceKey(level)
    contributions.push({ id: `legacy:resource:${key}`, kind: "grant", operation: "GRANT", target: "resource", key, payload: { max, initial: "full", label: `Ячейки ${level} уровня`, recharge: { triggers: ["long_rest"], restore: "full" } }, source: sheetSource })
    resources[key] = { current: Math.max(0, max - used) }
  }

  const spellcastingAbility = parseLegacySpellcastingAbility(sheet.spellcasting_ability)
  if (sheet.spellcasting_enabled) for (const spell of spells) {
    const isCantrip = spell.spell_level === 0 || spell.cast_mode === "cantrip"; const options = isCantrip ? [] : slotOptions(spell.spell_level, slotLevels)
    contributions.push({ id: `legacy:spell:${spell.id}`, kind: "grant", operation: "GRANT", target: "spell", key: legacySpellKey(spell), variantKey: `legacy-${spell.id}`, payload: { spell: { name: spell.name, level: spell.spell_level, ...(spell.school.trim() ? { school: spell.school.trim() } : {}), ritual: spell.ritual }, preparation: { mode: "not_required" }, methods: [{ key: "legacy-cast", kind: "spellcasting", ...(spellcastingAbility ? { ability: spellcastingAbility } : {}), requiresPrepared: false, ...(isCantrip ? {} : { resourceOptions: options }) }] }, source: legacySource(`legacy-spell-source:${spell.id}`, spell.source || spell.name, "legacy_spell") })
  }

  return { base: { id: character.id, name: character.name, level: character.level, abilities: { strength: sheet.strength, dexterity: sheet.dexterity, constitution: sheet.constitution, intelligence: sheet.intelligence, wisdom: sheet.wisdom, charisma: sheet.charisma }, baseMaxHp: sheet.max_hp, baseSpeed: sheet.speed, skillProficiencies: skillRanks(sheet.skill_proficiencies), savingThrowProficiencies: savingThrowRanks(sheet.saving_throw_proficiencies) }, state: { currentHp: sheet.current_hp, tempHp: sheet.temp_hp, resources }, contributions }
}

export function resolveLegacyCharacterEngineView(args: {
  character: Pick<Character, "id" | "name" | "level">
  sheet: CharacterSheet
  spells: CharacterSpell[]
  features: CharacterFeature[]
  inventory?: InventoryItem[]
  resourceStates?: Record<string, ResourceState>
}): LegacyCharacterEngineView {
  const input = buildLegacyCharacterEngineInput(args); const spellcastingAbility = parseLegacySpellcastingAbility(args.sheet.spellcasting_ability)
  return { input, contract: resolveCharacterContract(input), ...(spellcastingAbility ? { spellcastingAbility } : {}) }
}
