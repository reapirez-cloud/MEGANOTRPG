import { defaultDiceRoller, evaluateRollValue, rollDice, validateDice } from "./dice.ts"
import { applyScalingRules, validateScalingRule } from "./scaling.ts"
import type {
  DiceRoller,
  RollContext,
  RollEffectDefinition,
  RollEffectResult,
  RollExecutionResult,
  RollInstanceResult,
  RollRecipe,
  RollResolutionDefinition,
  RollResolutionResult,
  RollSequenceDefinition,
} from "./types.ts"

export class RollEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RollEngineError"
  }
}

function nonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new RollEngineError(`${label} must not be empty`)
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) throw new RollEngineError(`${label} must be an integer >= 1`)
}

function validateResolution(resolution: RollResolutionDefinition): void {
  if (resolution.kind === "save" && !resolution.ability) {
    throw new RollEngineError("save ability must be defined")
  }
}

function validateEffect(effect: RollEffectDefinition): void {
  nonEmpty(effect.key, "effect key")
  validateDice(effect.dice)
  for (const rule of effect.scaling ?? []) validateScalingRule(rule)
}

function validateSequence(sequence: RollSequenceDefinition): void {
  nonEmpty(sequence.key, "sequence key")
  if (sequence.instances !== undefined) positiveInteger(sequence.instances, "sequence instances")
  validateResolution(sequence.resolution)
  if (sequence.effects.length === 0 && sequence.resolution.kind === "none") {
    throw new RollEngineError(
      `sequence ${sequence.key} must define a resolution and/or at least one rolled effect`,
    )
  }
  const effectKeys = new Set<string>()
  for (const effect of sequence.effects) {
    validateEffect(effect)
    if (effectKeys.has(effect.key)) throw new RollEngineError(`duplicate effect key: ${effect.key}`)
    effectKeys.add(effect.key)
  }
  for (const rule of sequence.instanceScaling ?? []) validateScalingRule(rule)
}

export function validateRollRecipe(recipe: RollRecipe): void {
  nonEmpty(recipe.key, "recipe key")
  nonEmpty(recipe.name, "recipe name")
  if (recipe.spellLevel !== undefined && (!Number.isInteger(recipe.spellLevel) || recipe.spellLevel < 0)) {
    throw new RollEngineError("spellLevel must be an integer >= 0")
  }

  if (recipe.interaction === "link") {
    if (recipe.sequences && recipe.sequences.length > 0) {
      throw new RollEngineError("link-only recipe must not define roll sequences")
    }
    return
  }

  if (!recipe.sequences || recipe.sequences.length === 0) {
    throw new RollEngineError("roll recipe must define at least one sequence")
  }
  const sequenceKeys = new Set<string>()
  for (const sequence of recipe.sequences) {
    validateSequence(sequence)
    if (sequenceKeys.has(sequence.key)) throw new RollEngineError(`duplicate sequence key: ${sequence.key}`)
    sequenceKeys.add(sequence.key)
  }
}

function resolveResolution(
  resolution: RollResolutionDefinition,
  context: RollContext,
  roller: DiceRoller,
): RollResolutionResult {
  if (resolution.kind === "automatic" || resolution.kind === "none") return resolution
  if (resolution.kind === "save") {
    return {
      kind: "save",
      ability: resolution.ability,
      dc: evaluateRollValue(resolution.dc, context),
      onSuccess: resolution.onSuccess,
    }
  }

  const d20 = roller(20)
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) {
    throw new RollEngineError(`dice roller returned invalid d20 result: ${d20}`)
  }
  const bonus = evaluateRollValue(resolution.bonus, context)
  return {
    kind: "attack",
    d20,
    bonus,
    total: d20 + bonus,
    ...(resolution.target ? { target: resolution.target } : {}),
  }
}

function resolveEffect(
  effect: RollEffectDefinition,
  context: RollContext,
  roller: DiceRoller,
): RollEffectResult {
  const baseModifier = effect.modifier ? evaluateRollValue(effect.modifier, context) : 0
  const scaled = applyScalingRules(
    { diceCount: effect.dice.count, instances: 1, modifier: baseModifier },
    effect.scaling,
    context,
  )
  const result = rollDice(
    { count: scaled.diceCount, sides: effect.dice.sides },
    scaled.modifier,
    roller,
  )
  return {
    key: effect.key,
    kind: effect.kind,
    ...(effect.damageType ? { damageType: effect.damageType } : {}),
    ...(effect.label ? { label: effect.label } : {}),
    roll: result,
  }
}

function resolveSequence(
  sequence: RollSequenceDefinition,
  context: RollContext,
  roller: DiceRoller,
) {
  const scaled = applyScalingRules(
    { diceCount: 0, instances: sequence.instances ?? 1, modifier: 0 },
    sequence.instanceScaling,
    context,
  )
  const instances: RollInstanceResult[] = []
  for (let index = 0; index < scaled.instances; index += 1) {
    instances.push({
      index,
      resolution: resolveResolution(sequence.resolution, context, roller),
      effects: sequence.effects.map((effect) => resolveEffect(effect, context, roller)),
    })
  }
  return { key: sequence.key, instances }
}

export function executeRollRecipe(
  recipe: RollRecipe,
  context: RollContext,
  roller: DiceRoller = defaultDiceRoller,
): RollExecutionResult {
  validateRollRecipe(recipe)
  if (!Number.isInteger(context.characterLevel) || context.characterLevel < 1) {
    throw new RollEngineError("context.characterLevel must be an integer >= 1")
  }
  if (recipe.spellLevel !== undefined && context.spellLevel !== undefined && recipe.spellLevel !== context.spellLevel) {
    throw new RollEngineError(
      `recipe spell level ${recipe.spellLevel} does not match context spell level ${context.spellLevel}`,
    )
  }
  if (
    recipe.spellLevel !== undefined &&
    recipe.spellLevel > 0 &&
    context.castLevel !== undefined &&
    context.castLevel < recipe.spellLevel
  ) {
    throw new RollEngineError("castLevel cannot be below the spell base level")
  }

  if (recipe.interaction === "link") {
    return { kind: "link", recipeKey: recipe.key, name: recipe.name }
  }

  return {
    kind: "roll",
    recipeKey: recipe.key,
    name: recipe.name,
    ...(recipe.spellLevel !== undefined ? { spellLevel: recipe.spellLevel } : {}),
    ...(context.castLevel !== undefined ? { castLevel: context.castLevel } : {}),
    sequences: recipe.sequences!.map((sequence) => resolveSequence(sequence, context, roller)),
  }
}
