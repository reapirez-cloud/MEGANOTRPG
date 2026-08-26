import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterContribution,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import {
  RollContextError,
  RollEngineError,
  RollScalingError,
  createSpellRollContext,
  executeRollRecipe,
  type DiceRoller,
  type RollRecipe,
  type RollValueExpression,
} from "../src/roll-engine/index.ts"

const ref = (key: RollValueExpression extends { kind: "reference"; key: infer K } ? K : never): RollValueExpression => ({
  kind: "reference",
  key,
})
const lit = (value: number): RollValueExpression => ({ kind: "literal", value })

function sequenceRoller(values: number[]): DiceRoller {
  let index = 0
  return (sides) => {
    const value = values[index++]
    if (value === undefined) throw new Error(`test roller exhausted before d${sides}`)
    return value
  }
}

function constantRoller(value: number): DiceRoller {
  return () => value
}

const detectMagic: RollRecipe = {
  key: "detect-magic",
  name: "Detect Magic",
  sourceKind: "spell",
  interaction: "link",
  spellLevel: 1,
}

const fireBolt: RollRecipe = {
  key: "fire-bolt",
  name: "Fire Bolt",
  sourceKind: "spell",
  interaction: "roll",
  spellLevel: 0,
  sequences: [
    {
      key: "bolt",
      resolution: { kind: "attack", bonus: ref("attack_bonus"), target: "armor_class" },
      effects: [
        {
          key: "fire",
          kind: "damage",
          damageType: "fire",
          dice: { count: 1, sides: 10 },
          scaling: [
            {
              kind: "steps",
              reference: { source: "character_level" },
              steps: [
                { atLeast: 1, adjustment: { diceCount: 1 } },
                { atLeast: 5, adjustment: { diceCount: 2 } },
                { atLeast: 11, adjustment: { diceCount: 3 } },
                { atLeast: 17, adjustment: { diceCount: 4 } },
              ],
            },
          ],
        },
      ],
    },
  ],
}

const fireball: RollRecipe = {
  key: "fireball",
  name: "Fireball",
  sourceKind: "spell",
  interaction: "roll",
  spellLevel: 3,
  sequences: [
    {
      key: "blast",
      resolution: {
        kind: "save",
        ability: "dexterity",
        dc: ref("save_dc"),
        onSuccess: "half",
      },
      effects: [
        {
          key: "fire",
          kind: "damage",
          damageType: "fire",
          dice: { count: 8, sides: 6 },
          scaling: [
            {
              kind: "per_level",
              reference: { source: "cast_level" },
              above: 3,
              diceCountPerLevel: 1,
            },
          ],
        },
      ],
    },
  ],
}

const cureWounds: RollRecipe = {
  key: "cure-wounds",
  name: "Cure Wounds",
  sourceKind: "spell",
  interaction: "roll",
  spellLevel: 1,
  sequences: [
    {
      key: "healing",
      resolution: { kind: "none" },
      effects: [
        {
          key: "healing",
          kind: "healing",
          dice: { count: 2, sides: 8 },
          modifier: ref("casting_ability_modifier"),
          scaling: [
            {
              kind: "per_level",
              reference: { source: "cast_level" },
              above: 1,
              diceCountPerLevel: 2,
            },
          ],
        },
      ],
    },
  ],
}

const magicMissile: RollRecipe = {
  key: "magic-missile",
  name: "Magic Missile",
  sourceKind: "spell",
  interaction: "roll",
  spellLevel: 1,
  sequences: [
    {
      key: "dart",
      instances: 3,
      instanceScaling: [
        {
          kind: "per_level",
          reference: { source: "cast_level" },
          above: 1,
          instancesPerLevel: 1,
        },
      ],
      resolution: { kind: "automatic" },
      effects: [
        {
          key: "force",
          kind: "damage",
          damageType: "force",
          dice: { count: 1, sides: 4 },
          modifier: lit(1),
        },
      ],
    },
  ],
}

const scorchingRay: RollRecipe = {
  key: "scorching-ray",
  name: "Scorching Ray",
  sourceKind: "spell",
  interaction: "roll",
  spellLevel: 2,
  sequences: [
    {
      key: "ray",
      instances: 3,
      instanceScaling: [
        {
          kind: "per_level",
          reference: { source: "cast_level" },
          above: 2,
          instancesPerLevel: 1,
        },
      ],
      resolution: { kind: "attack", bonus: ref("attack_bonus"), target: "armor_class" },
      effects: [
        {
          key: "fire",
          kind: "damage",
          damageType: "fire",
          dice: { count: 2, sides: 6 },
        },
      ],
    },
  ],
}

test("peaceful spell is link-only and never invents a meaningless roll", () => {
  const result = executeRollRecipe(
    detectMagic,
    { characterLevel: 4, spellLevel: 1, castLevel: 1 },
    constantRoller(1),
  )
  assert.deepEqual(result, { kind: "link", recipeKey: "detect-magic", name: "Detect Magic" })
})

test("spell attack rolls attack and potential damage immediately", () => {
  const result = executeRollRecipe(
    fireBolt,
    { characterLevel: 11, spellLevel: 0, castLevel: 0, attackBonus: 6 },
    sequenceRoller([12, 4, 5, 6]),
  )
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  const instance = result.sequences[0]!.instances[0]!
  assert.deepEqual(instance.resolution, {
    kind: "attack",
    d20: 12,
    bonus: 6,
    total: 18,
    target: "armor_class",
  })
  assert.deepEqual(instance.effects[0]!.roll, {
    dice: { count: 3, sides: 10 },
    rolls: [4, 5, 6],
    diceTotal: 15,
    modifier: 0,
    total: 15,
  })
})

test("save spell rolls damage now while leaving hit/save decision to GM", () => {
  const result = executeRollRecipe(
    fireball,
    { characterLevel: 9, spellLevel: 3, castLevel: 5, saveDc: 16 },
    constantRoller(3),
  )
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  const instance = result.sequences[0]!.instances[0]!
  assert.deepEqual(instance.resolution, {
    kind: "save",
    ability: "dexterity",
    dc: 16,
    onSuccess: "half",
  })
  assert.equal(instance.effects[0]!.roll.dice.count, 10)
  assert.equal(instance.effects[0]!.roll.total, 30)
  assert.equal(result.castLevel, 5)
})

test("healing can scale from cast level and add casting ability automatically", () => {
  const result = executeRollRecipe(
    cureWounds,
    { characterLevel: 7, spellLevel: 1, castLevel: 3, castingAbilityModifier: 4 },
    constantRoller(2),
  )
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  const healing = result.sequences[0]!.instances[0]!.effects[0]!.roll
  assert.deepEqual(healing.dice, { count: 6, sides: 8 })
  assert.equal(healing.diceTotal, 12)
  assert.equal(healing.modifier, 4)
  assert.equal(healing.total, 16)
})

test("automatic multi-instance spell scales number of darts from slot level", () => {
  const result = executeRollRecipe(
    magicMissile,
    { characterLevel: 5, spellLevel: 1, castLevel: 3 },
    constantRoller(2),
  )
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  const darts = result.sequences[0]!.instances
  assert.equal(darts.length, 5)
  assert.equal(darts.every((dart) => dart.resolution.kind === "automatic"), true)
  assert.deepEqual(darts.map((dart) => dart.effects[0]!.roll.total), [3, 3, 3, 3, 3])
})

test("multi-ray spell produces independent attack and damage rolls for every ray", () => {
  const result = executeRollRecipe(
    scorchingRay,
    { characterLevel: 7, spellLevel: 2, castLevel: 4, attackBonus: 7 },
    constantRoller(4),
  )
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  const rays = result.sequences[0]!.instances
  assert.equal(rays.length, 5)
  for (const ray of rays) {
    assert.deepEqual(ray.resolution, {
      kind: "attack",
      d20: 4,
      bonus: 7,
      total: 11,
      target: "armor_class",
    })
    assert.equal(ray.effects[0]!.roll.total, 8)
  }
})

test("class-level scaling is available without pretending it is total character level", () => {
  const recipe: RollRecipe = {
    key: "class-scaling-test",
    name: "Class Scaling Test",
    interaction: "roll",
    sequences: [
      {
        key: "effect",
        resolution: { kind: "none" },
        effects: [
          {
            key: "damage",
            kind: "damage",
            dice: { count: 1, sides: 6 },
            scaling: [
              {
                kind: "steps",
                reference: { source: "class_level", classKey: "wizard" },
                steps: [
                  { atLeast: 1, adjustment: { diceCount: 1 } },
                  { atLeast: 5, adjustment: { diceCount: 2 } },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
  const result = executeRollRecipe(
    recipe,
    { characterLevel: 10, classLevels: { wizard: 4, cleric: 6 } },
    constantRoller(3),
  )
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  assert.equal(result.sequences[0]!.instances[0]!.effects[0]!.roll.dice.count, 1)
})

function spellCharacterInput(slot5Current = 1): CharacterEngineInput {
  const contributions: CharacterContribution[] = [
    {
      id: "slot-3",
      kind: "grant",
      operation: "GRANT",
      target: "resource",
      key: "spell-slot-3",
      payload: { max: 3 },
      source: { id: "wizard", name: "Wizard" },
    },
    {
      id: "slot-5",
      kind: "grant",
      operation: "GRANT",
      target: "resource",
      key: "spell-slot-5",
      payload: { max: 1 },
      source: { id: "wizard", name: "Wizard" },
    },
    {
      id: "fireball-access",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "fireball",
      variantKey: "wizard",
      payload: {
        spell: { name: "Fireball", level: 3 },
        preparation: { mode: "always_prepared" },
        methods: [
          {
            key: "slots",
            kind: "spell_slots",
            ability: "intelligence",
            resourceOptions: [
              {
                key: "slot-3",
                castLevel: 3,
                costs: [{ key: "spell-slot-3", amount: 1 }],
              },
              {
                key: "slot-5",
                castLevel: 5,
                costs: [{ key: "spell-slot-5", amount: 1 }],
              },
            ],
          },
        ],
      },
      source: { id: "wizard", name: "Wizard" },
    },
  ]

  return {
    base: {
      id: "roll-character",
      name: "Roll Character",
      level: 9,
      abilities: {
        strength: 8,
        dexterity: 14,
        constitution: 14,
        intelligence: 18,
        wisdom: 10,
        charisma: 10,
      },
      baseMaxHp: 50,
      baseSpeed: 30,
    },
    state: {
      currentHp: 50,
      tempHp: 0,
      resources: {
        "spell-slot-3": { current: 3 },
        "spell-slot-5": { current: slot5Current },
      },
    },
    contributions,
  }
}

test("selected resolved slot determines castLevel so a 5th-level Fireball cannot roll base damage", () => {
  const character = resolveCharacterContract(spellCharacterInput())
  const prepared = createSpellRollContext(character, {
    spellKey: "fireball",
    accessKey: "wizard",
    methodKey: "slots",
    resourceOptionKey: "slot-5",
  })

  assert.equal(prepared.context.castLevel, 5)
  assert.equal(prepared.context.spellLevel, 3)
  assert.equal(prepared.context.castingAbilityModifier, 4)
  assert.equal(prepared.context.attackBonus, 8)
  assert.equal(prepared.context.saveDc, 16)
  assert.equal(prepared.resourceOption?.key, "slot-5")

  const result = executeRollRecipe(fireball, prepared.context, constantRoller(2))
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  assert.equal(result.sequences[0]!.instances[0]!.effects[0]!.roll.dice.count, 10)
})

test("resolved spell context refuses an exhausted slot before any dice are rolled", () => {
  const character = resolveCharacterContract(spellCharacterInput(0))
  assert.throws(
    () =>
      createSpellRollContext(character, {
        spellKey: "fireball",
        accessKey: "wizard",
        methodKey: "slots",
        resourceOptionKey: "slot-5",
      }),
    RollContextError,
  )
})

test("Roll Engine rejects casting a leveled spell below its base level", () => {
  assert.throws(
    () =>
      executeRollRecipe(
        fireball,
        { characterLevel: 9, spellLevel: 3, castLevel: 2, saveDc: 16 },
        constantRoller(1),
      ),
    RollEngineError,
  )
})

test("scaling fails explicitly when required class level is absent", () => {
  const recipe: RollRecipe = {
    key: "missing-class",
    name: "Missing Class",
    interaction: "roll",
    sequences: [
      {
        key: "effect",
        resolution: { kind: "none" },
        effects: [
          {
            key: "damage",
            kind: "damage",
            dice: { count: 1, sides: 6 },
            scaling: [
              {
                kind: "steps",
                reference: { source: "class_level", classKey: "wizard" },
                steps: [{ atLeast: 1, adjustment: { diceCount: 1 } }],
              },
            ],
          },
        ],
      },
    ],
  }
  assert.throws(
    () => executeRollRecipe(recipe, { characterLevel: 4 }, constantRoller(1)),
    RollScalingError,
  )
})
