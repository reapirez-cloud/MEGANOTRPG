import { evaluateCondition } from "./conditions.ts"
import { resolveNumericConflicts } from "./conflicts.ts"
import { validateCharacterEngineInput } from "./core.ts"
import { evaluateFormula, selectFormula, type FormulaContext } from "./formulas.ts"
import {
  resolveGrants,
  resolveProficiencyRank,
  savingThrowProficiencyKey,
  skillProficiencyKey,
} from "./grants.ts"
import { abilityModifier, proficiencyBonusForLevel } from "./numeric.ts"
import {
  ABILITY_KEYS,
  PASSIVE_KEYS,
  SKILL_KEYS,
  type AbilityKey,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterEngineInput,
  type CharacterState,
  type FormulaContribution,
  type FormulaExpression,
  type NumericContribution,
  type NumericTarget,
  type PassiveKey,
  type ResolvedAbility,
  type ResolvedCharacter,
  type ResolvedNumber,
  type ResolvedSavingThrow,
  type ResolvedSkill,
  type SkillKey,
} from "./types.ts"

const SKILL_ABILITIES: Record<SkillKey, AbilityKey> = {
  acrobatics: "dexterity",
  animal_handling: "wisdom",
  arcana: "intelligence",
  athletics: "strength",
  deception: "charisma",
  history: "intelligence",
  insight: "wisdom",
  intimidation: "charisma",
  investigation: "intelligence",
  medicine: "wisdom",
  nature: "intelligence",
  perception: "wisdom",
  performance: "charisma",
  persuasion: "charisma",
  religion: "intelligence",
  sleight_of_hand: "dexterity",
  stealth: "dexterity",
  survival: "wisdom",
}

const PASSIVE_SKILLS: Record<PassiveKey, SkillKey> = {
  perception: "perception",
  investigation: "investigation",
  insight: "insight",
}

function resolveNumber(
  target: NumericTarget,
  baseValue: number,
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHpForConditions: number,
): ResolvedNumber {
  const relevant = contributions.filter(
    (contribution): contribution is NumericContribution =>
      contribution.kind === "numeric" &&
      contribution.target === target &&
      evaluateCondition(contribution.condition, { state, maxHp: maxHpForConditions }),
  )
  const resolution = resolveNumericConflicts(baseValue, relevant)
  return {
    value: resolution.value,
    baseValue,
    sources: resolution.contributions.map((contribution) => ({
      contributionId: contribution.id,
      source: contribution.source,
    })),
  }
}

const DEFAULT_AC_FORMULA: FormulaExpression = {
  kind: "add",
  terms: [
    { kind: "literal", value: 10 },
    { kind: "reference", key: "abilities.dexterity.modifier" },
  ],
}

export function resolveCharacter(
  base: BaseCharacter,
  state: CharacterState,
  contributions: CharacterContribution[] = [],
): ResolvedCharacter {
  validateCharacterEngineInput({ base, state, contributions })

  const maxHp = resolveNumber(
    "combat.maxHp",
    base.baseMaxHp,
    contributions,
    state,
    base.baseMaxHp,
  )
  const proficiencyBonus = resolveNumber(
    "core.proficiencyBonus",
    proficiencyBonusForLevel(base.level),
    contributions,
    state,
    maxHp.value,
  )

  const abilities = Object.fromEntries(
    ABILITY_KEYS.map((ability) => {
      const resolved = resolveNumber(
        `abilities.${ability}`,
        base.abilities[ability],
        contributions,
        state,
        maxHp.value,
      )
      const result: ResolvedAbility = { ...resolved, modifier: abilityModifier(resolved.value) }
      return [ability, result]
    }),
  ) as Record<AbilityKey, ResolvedAbility>

  // Set-like grants are resolved before skills/saves because proficiency grants
  // can change their derived numbers.
  const grants = resolveGrants(contributions, state, maxHp.value)

  const skills = Object.fromEntries(
    SKILL_KEYS.map((skill) => {
      const ability = SKILL_ABILITIES[skill]
      const proficiency = resolveProficiencyRank(
        base.skillProficiencies?.[skill],
        grants,
        skillProficiencyKey(skill),
      )
      const result: ResolvedSkill = {
        key: skill,
        ability,
        proficiencyRank: proficiency.rank,
        proficiencySources: proficiency.sources,
        bonus: resolveNumber(
          `skills.${skill}.bonus`,
          abilities[ability].modifier + proficiencyBonus.value * proficiency.rank,
          contributions,
          state,
          maxHp.value,
        ),
      }
      return [skill, result]
    }),
  ) as Record<SkillKey, ResolvedSkill>

  const savingThrows = Object.fromEntries(
    ABILITY_KEYS.map((ability) => {
      const proficiency = resolveProficiencyRank(
        base.savingThrowProficiencies?.[ability],
        grants,
        savingThrowProficiencyKey(ability),
      )
      const result: ResolvedSavingThrow = {
        ability,
        proficiencyRank: proficiency.rank,
        proficiencySources: proficiency.sources,
        bonus: resolveNumber(
          `savingThrows.${ability}.bonus`,
          abilities[ability].modifier + proficiencyBonus.value * proficiency.rank,
          contributions,
          state,
          maxHp.value,
        ),
      }
      return [ability, result]
    }),
  ) as Record<AbilityKey, ResolvedSavingThrow>

  const formulaContext: FormulaContext = { "core.proficiencyBonus": proficiencyBonus.value }
  for (const ability of ABILITY_KEYS) {
    formulaContext[`abilities.${ability}.score`] = abilities[ability].value
    formulaContext[`abilities.${ability}.modifier`] = abilities[ability].modifier
  }

  const acFormulaContributions = contributions.filter(
    (contribution): contribution is FormulaContribution =>
      contribution.kind === "formula" &&
      contribution.target === "combat.ac" &&
      evaluateCondition(contribution.condition, { state, maxHp: maxHp.value }),
  )
  const acSelection = selectFormula("combat.ac", DEFAULT_AC_FORMULA, acFormulaContributions)
  const acFormulaValue = evaluateFormula(acSelection.formula, formulaContext)
  const acNumeric = resolveNumber("combat.ac", acFormulaValue, contributions, state, maxHp.value)
  const ac = {
    ...acNumeric,
    formula: acSelection.formula,
    formulaSources: acSelection.sources,
  }

  const speed = resolveNumber("combat.speed", base.baseSpeed, contributions, state, maxHp.value)
  const initiative = resolveNumber(
    "combat.initiative",
    abilities.dexterity.modifier,
    contributions,
    state,
    maxHp.value,
  )
  const passives = Object.fromEntries(
    PASSIVE_KEYS.map((passive) => {
      const skill = PASSIVE_SKILLS[passive]
      return [
        passive,
        resolveNumber(
          `passives.${passive}`,
          10 + skills[skill].bonus.value,
          contributions,
          state,
          maxHp.value,
        ),
      ]
    }),
  ) as Record<PassiveKey, ResolvedNumber>

  const spellcastingByAbility = Object.fromEntries(
    ABILITY_KEYS.map((ability) => {
      const attackBonus = abilities[ability].modifier + proficiencyBonus.value
      return [ability, { attackBonus, saveDc: 8 + attackBonus }]
    }),
  ) as ResolvedCharacter["spellcasting"]["byAbility"]

  return {
    id: base.id,
    name: base.name,
    level: base.level,
    proficiencyBonus,
    abilities,
    skills,
    savingThrows,
    combat: {
      ac,
      maxHp,
      currentHp: state.currentHp,
      tempHp: state.tempHp,
      speed,
      initiative,
    },
    passives,
    spellcasting: { byAbility: spellcastingByAbility },
    grants,
  }
}

export function resolveCharacterInput(input: CharacterEngineInput): ResolvedCharacter {
  return resolveCharacter(input.base, input.state, input.contributions)
}
