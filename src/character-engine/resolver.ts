import { validateCharacterEngineInput } from "./core.ts"
import {
  ABILITY_KEYS,
  SKILL_KEYS,
  type AbilityKey,
  type BaseCharacter,
  type CharacterCondition,
  type CharacterContribution,
  type CharacterEngineInput,
  type CharacterState,
  type GrantContribution,
  type NumericContribution,
  type NumericOperation,
  type NumericTarget,
  type ProficiencyRank,
  type ResolvedAbility,
  type ResolvedCharacter,
  type ResolvedGrant,
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

function compareContributionOrder(
  left: Pick<CharacterContribution, "id" | "priority">,
  right: Pick<CharacterContribution, "id" | "priority">,
) {
  const priorityDifference = (left.priority ?? 0) - (right.priority ?? 0)
  return priorityDifference || left.id.localeCompare(right.id)
}

export function abilityModifier(score: number) {
  return Math.floor((score - 10) / 2)
}

/** Default 5e proficiency progression. A contribution can override or modify it. */
export function proficiencyBonusForLevel(level: number) {
  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(level)))
  return 2 + Math.floor((normalizedLevel - 1) / 4)
}

function isConditionActive(
  condition: CharacterCondition | undefined,
  state: CharacterState,
  maxHp: number,
) {
  if (!condition || condition.kind === "always") return true

  if (condition.kind === "hp_below_percent") {
    if (maxHp <= 0) return false
    return state.currentHp / maxHp < condition.percent / 100
  }

  return false
}

function applyNumericOperation(current: number, operation: NumericOperation, operand: number) {
  switch (operation) {
    case "ADD":
      return current + operand
    case "SUBTRACT":
      return current - operand
    case "SET":
      return operand
    case "MIN":
      return Math.max(current, operand)
    case "MAX":
      return Math.min(current, operand)
    case "MULTIPLY":
      return current * operand
  }
}

function resolveNumber(
  target: NumericTarget,
  baseValue: number,
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHpForConditions: number,
): ResolvedNumber {
  const relevant = contributions
    .filter((contribution): contribution is NumericContribution => {
      return (
        contribution.kind === "numeric" &&
        contribution.target === target &&
        isConditionActive(contribution.condition, state, maxHpForConditions)
      )
    })
    .sort(compareContributionOrder)

  let value = baseValue
  for (const contribution of relevant) {
    value = applyNumericOperation(value, contribution.operation, contribution.value)
  }

  return {
    value,
    baseValue,
    sources: relevant.map((contribution) => ({
      contributionId: contribution.id,
      source: contribution.source,
    })),
  }
}

function resolveGrants(
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHp: number,
): ResolvedGrant[] {
  const active = contributions
    .filter((contribution): contribution is GrantContribution => {
      return contribution.kind === "grant" && isConditionActive(contribution.condition, state, maxHp)
    })
    .sort(compareContributionOrder)

  const groups = new Map<
    string,
    {
      target: GrantContribution["target"]
      key: string
      variantKey: string
      payload?: unknown
      sources: ResolvedGrant["sources"]
    }
  >()

  for (const contribution of active) {
    const variantKey = contribution.variantKey ?? "default"
    const identity = `${contribution.target}:${contribution.key}:${variantKey}`
    const current = groups.get(identity) ?? {
      target: contribution.target,
      key: contribution.key,
      variantKey,
      payload: undefined,
      sources: [],
    }

    if (contribution.operation === "SUPPRESS") {
      current.sources = []
      current.payload = undefined
      groups.set(identity, current)
      continue
    }

    if (current.payload === undefined && contribution.payload !== undefined) {
      current.payload = contribution.payload
    }
    current.sources.push({
      contributionId: contribution.id,
      source: contribution.source,
    })
    groups.set(identity, current)
  }

  return [...groups.values()]
    .filter((grant) => grant.sources.length > 0)
    .sort((left, right) => {
      return (
        left.target.localeCompare(right.target) ||
        left.key.localeCompare(right.key) ||
        left.variantKey.localeCompare(right.variantKey)
      )
    })
}

function proficiencyRank(value: ProficiencyRank | undefined): ProficiencyRank {
  return value ?? 0
}

export function resolveCharacter(
  base: BaseCharacter,
  state: CharacterState,
  contributions: CharacterContribution[] = [],
): ResolvedCharacter {
  validateCharacterEngineInput({ base, state, contributions })

  // Max HP is resolved first so HP-dependent conditions elsewhere use the current resolved maximum.
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
      const result: ResolvedAbility = {
        ...resolved,
        modifier: abilityModifier(resolved.value),
      }
      return [ability, result]
    }),
  ) as Record<AbilityKey, ResolvedAbility>

  const skills = Object.fromEntries(
    SKILL_KEYS.map((skill) => {
      const ability = SKILL_ABILITIES[skill]
      const rank = proficiencyRank(base.skillProficiencies?.[skill])
      const result: ResolvedSkill = {
        key: skill,
        ability,
        proficiencyRank: rank,
        bonus: abilities[ability].modifier + proficiencyBonus.value * rank,
      }
      return [skill, result]
    }),
  ) as Record<SkillKey, ResolvedSkill>

  const savingThrows = Object.fromEntries(
    ABILITY_KEYS.map((ability) => {
      const rank = proficiencyRank(base.savingThrowProficiencies?.[ability])
      const result: ResolvedSavingThrow = {
        ability,
        proficiencyRank: rank,
        bonus: abilities[ability].modifier + proficiencyBonus.value * rank,
      }
      return [ability, result]
    }),
  ) as Record<AbilityKey, ResolvedSavingThrow>

  const speed = resolveNumber(
    "combat.speed",
    base.baseSpeed,
    contributions,
    state,
    maxHp.value,
  )

  const spellcastingByAbility = Object.fromEntries(
    ABILITY_KEYS.map((ability) => {
      const attackBonus = abilities[ability].modifier + proficiencyBonus.value
      return [
        ability,
        {
          attackBonus,
          saveDc: 8 + attackBonus,
        },
      ]
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
      maxHp,
      currentHp: state.currentHp,
      tempHp: state.tempHp,
      speed,
      initiative: abilities.dexterity.modifier,
    },
    passives: {
      perception: 10 + skills.perception.bonus,
      investigation: 10 + skills.investigation.bonus,
      insight: 10 + skills.insight.bonus,
    },
    spellcasting: {
      byAbility: spellcastingByAbility,
    },
    grants: resolveGrants(contributions, state, maxHp.value),
  }
}

/** Canonical object-based Character Engine entry point. */
export function resolveCharacterInput(input: CharacterEngineInput): ResolvedCharacter {
  return resolveCharacter(input.base, input.state, input.contributions)
}
