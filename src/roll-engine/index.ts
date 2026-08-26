export {
  RollContextError,
  createSpellRollContext,
  type PreparedSpellRollContext,
  type SpellRollContextSelection,
} from "./character-context.ts"
export {
  RollDiceError,
  defaultDiceRoller,
  evaluateRollValue,
  rollDice,
  validateDice,
} from "./dice.ts"
export {
  RollEngineError,
  executeRollRecipe,
  validateRollRecipe,
} from "./engine.ts"
export {
  RollScalingError,
  applyScalingRules,
  scalingReferenceValue,
  validateScalingRule,
  type AppliedScaling,
} from "./scaling.ts"
export {
  type DiceDefinition,
  type DiceRoller,
  type DiceRollResult,
  type RollContext,
  type RollEffectDefinition,
  type RollEffectResult,
  type RollExecutionResult,
  type RollInstanceResult,
  type RollRecipe,
  type RollResolutionDefinition,
  type RollResolutionResult,
  type RollScalingAdjustment,
  type RollScalingReference,
  type RollScalingRule,
  type RollScalingSource,
  type RollSequenceDefinition,
  type RollSequenceResult,
  type RollValueExpression,
  type RollValueReference,
  type SaveAbility,
} from "./types.ts"
export {
  ROLL_ENGINE_STATUS,
  ROLL_ENGINE_VERSION,
  ROLL_ENGINE_VERSION_INFO,
} from "./version.ts"
