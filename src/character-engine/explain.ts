import { parseActionGrantPayload, actionAttackBonusTarget, actionDamageModifierTarget } from "./actions.ts"
import { evaluateFormula, type FormulaContext } from "./formulas.ts"
import { grantIdentity, resolveGrantResolution } from "./grants.ts"
import { proficiencyBonusForLevel } from "./numeric.ts"
import { parseResourceGrantPayload, resourceMaxTarget, resourceStateKey } from "./resources.ts"
import { resolveCharacterInput } from "./resolver.ts"
import {
  parseSpellGrantPayload,
  spellMethodAttackBonusTarget,
  spellMethodSaveDcTarget,
} from "./spells.ts"
import { applySuppressions } from "./suppressions.ts"
import type {
  AbilityKey,
  CharacterContribution,
  CharacterEngineInput,
  CharacterSource,
  FormulaExpression,
  GrantContribution,
  GrantTarget,
  NumericContribution,
  NumericTarget,
  PassiveKey,
  ProficiencyRank,
  ResolvedCharacter,
  ResolvedGrant,
  ResolvedNumber,
  ResolvedSourceRef,
  SkillKey,
} from "./types.ts"

export type ExplanationStatus = "active" | "inactive" | "suppressed"

export type ExplanationNodeKind =
  | "result"
  | "base"
  | "derived"
  | "formula"
  | "reference"
  | "contribution"
  | "source"
  | "state"
  | "grant"
  | "resource"
  | "action"
  | "spell"
  | "suppression"

export interface ExplanationNode {
  kind: ExplanationNodeKind
  key: string
  value?: number | string | boolean | null
  active?: boolean
  status?: ExplanationStatus
  operation?: string
  operand?: number
  contributionId?: string
  source?: CharacterSource
  children?: ExplanationNode[]
}

export type CharacterExplainQuery =
  | { kind: "number"; target: NumericTarget }
  | { kind: "grant"; target: GrantTarget; key: string; variantKey?: string }
  | { kind: "resource"; stateKey: string }
  | { kind: "action"; stateKey: string }
  | { kind: "spell"; spellKey: string; accessKey?: string; methodKey?: string }

export interface CharacterExplanation {
  query: CharacterExplainQuery
  active: boolean
  value?: number | string | boolean | null
  /** Compact, locale-neutral mechanical summary. UI may render the tree instead. */
  summary: string
  tree: ExplanationNode
}

export class ExplainEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExplainEngineError"
  }
}

const PASSIVE_SKILLS: Record<PassiveKey, SkillKey> = {
  perception: "perception",
  investigation: "investigation",
  insight: "insight",
}

function formulaContext(character: ResolvedCharacter): FormulaContext {
  const context: FormulaContext = {
    "core.level": character.level,
    "core.proficiencyBonus": character.proficiencyBonus.value,
  }
  for (const [ability, resolved] of Object.entries(character.abilities)) {
    context[`abilities.${ability}.score`] = resolved.value
    context[`abilities.${ability}.modifier`] = resolved.modifier
  }
  for (const resource of character.resources) {
    context[`resources.${resource.stateKey}.current`] = resource.current
    context[`resources.${resource.stateKey}.max`] = resource.max.value
  }
  return context
}

function contributionById(input: CharacterEngineInput, id: string): CharacterContribution | undefined {
  return input.contributions.find((contribution) => contribution.id === id)
}

function contributionNode(
  input: CharacterEngineInput,
  ref: ResolvedSourceRef,
  status: ExplanationStatus = "active",
): ExplanationNode {
  const contribution = contributionById(input, ref.contributionId)
  if (!contribution) {
    return {
      kind: "source",
      key: ref.source.id,
      contributionId: ref.contributionId,
      source: ref.source,
      status,
    }
  }

  if (contribution.kind === "numeric") {
    return {
      kind: "contribution",
      key: contribution.target,
      operation: contribution.operation,
      operand: contribution.value,
      contributionId: contribution.id,
      source: contribution.source,
      status,
    }
  }
  if (contribution.kind === "formula") {
    return {
      kind: "contribution",
      key: contribution.target,
      operation: contribution.operation,
      contributionId: contribution.id,
      source: contribution.source,
      status,
    }
  }
  if (contribution.kind === "grant") {
    return {
      kind: "contribution",
      key: grantIdentity(contribution.target, contribution.key, contribution.variantKey ?? "default"),
      operation: contribution.operation,
      contributionId: contribution.id,
      source: contribution.source,
      status,
    }
  }
  return {
    kind: "suppression",
    key: contribution.id,
    operation: contribution.operation,
    contributionId: contribution.id,
    source: contribution.source,
    status,
  }
}

function sourceNodes(input: CharacterEngineInput, refs: ResolvedSourceRef[]): ExplanationNode[] {
  return refs.map((ref) => contributionNode(input, ref))
}

function numericRoot(
  input: CharacterEngineInput,
  key: string,
  resolved: ResolvedNumber,
  base: ExplanationNode,
): ExplanationNode {
  return {
    kind: "result",
    key,
    value: resolved.value,
    active: true,
    children: [base, ...sourceNodes(input, resolved.sources)],
  }
}

function abilityModifierNode(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  ability: AbilityKey,
  guard: Set<string>,
): ExplanationNode {
  return {
    kind: "derived",
    key: `abilities.${ability}.modifier`,
    value: character.abilities[ability].modifier,
    children: [explainNumberTree(input, character, `abilities.${ability}`, guard)],
  }
}

function proficiencyRankNode(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  kind: "skill" | "savingThrow",
  key: SkillKey | AbilityKey,
): ExplanationNode {
  const resolved =
    kind === "skill"
      ? character.skills[key as SkillKey]
      : character.savingThrows[key as AbilityKey]
  const baseRank: ProficiencyRank =
    kind === "skill"
      ? (input.base.skillProficiencies?.[key as SkillKey] ?? 0)
      : (input.base.savingThrowProficiencies?.[key as AbilityKey] ?? 0)
  const proficiencyKey = kind === "skill" ? `skill:${key}` : `savingThrow:${key}`

  const suppressionResolution = applySuppressions(input.contributions, input.state)
  const grantResolution = resolveGrantResolution(
    suppressionResolution.contributions,
    input.state,
    character.combat.maxHp.value,
  )
  const mode = grantResolution.modes.get(grantIdentity("proficiency", proficiencyKey)) ?? "merge"

  const children: ExplanationNode[] = [
    { kind: "base", key: `${kind}.${key}.baseProficiencyRank`, value: baseRank },
    ...sourceNodes(input, resolved.proficiencySources),
  ]
  if (mode === "suppress") {
    children.push({
      kind: "grant",
      key: grantIdentity("proficiency", proficiencyKey),
      active: false,
      status: "suppressed",
    })
  } else if (mode === "replace") {
    children.push({
      kind: "grant",
      key: grantIdentity("proficiency", proficiencyKey),
      operation: "REPLACE",
      active: true,
    })
  }

  return {
    kind: "derived",
    key: `${kind}.${key}.proficiencyRank`,
    value: resolved.proficiencyRank,
    children,
  }
}

function formulaReferenceNode(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  key: string,
  guard: Set<string>,
): ExplanationNode {
  if (key === "core.level") {
    return { kind: "base", key, value: character.level }
  }
  if (key === "core.proficiencyBonus") {
    return explainNumberTree(input, character, "core.proficiencyBonus", guard)
  }

  const abilityScore = key.match(/^abilities\.(strength|dexterity|constitution|intelligence|wisdom|charisma)\.score$/)
  if (abilityScore) {
    return explainNumberTree(input, character, `abilities.${abilityScore[1] as AbilityKey}`, guard)
  }
  const abilityModifier = key.match(/^abilities\.(strength|dexterity|constitution|intelligence|wisdom|charisma)\.modifier$/)
  if (abilityModifier) {
    return abilityModifierNode(input, character, abilityModifier[1] as AbilityKey, guard)
  }

  for (const resource of character.resources) {
    if (key === `resources.${resource.stateKey}.current`) {
      return {
        kind: "state",
        key,
        value: resource.current,
        children: sourceNodes(input, resource.sources),
      }
    }
    if (key === `resources.${resource.stateKey}.max`) {
      return explainNumberTree(input, character, resourceMaxTarget(resource.stateKey), guard)
    }
  }

  const value = formulaContext(character)[key]
  if (typeof value === "number" && Number.isFinite(value)) {
    return { kind: "reference", key, value }
  }
  throw new ExplainEngineError(`cannot explain formula reference: ${key}`)
}

function formulaNode(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  expression: FormulaExpression,
  guard: Set<string>,
): ExplanationNode {
  const context = formulaContext(character)
  const value = evaluateFormula(expression, context)

  switch (expression.kind) {
    case "literal":
      return { kind: "formula", key: "literal", value }
    case "reference":
      return {
        kind: "reference",
        key: expression.key,
        value,
        children: [formulaReferenceNode(input, character, expression.key, guard)],
      }
    case "add":
      return {
        kind: "formula",
        key: "add",
        value,
        children: expression.terms.map((term) => formulaNode(input, character, term, guard)),
      }
    case "subtract":
      return {
        kind: "formula",
        key: "subtract",
        value,
        children: [
          formulaNode(input, character, expression.left, guard),
          formulaNode(input, character, expression.right, guard),
        ],
      }
    case "multiply":
      return {
        kind: "formula",
        key: "multiply",
        value,
        children: expression.factors.map((factor) => formulaNode(input, character, factor, guard)),
      }
    case "min":
    case "max":
      return {
        kind: "formula",
        key: expression.kind,
        value,
        children: expression.values.map((child) => formulaNode(input, character, child, guard)),
      }
    case "clamp":
      return {
        kind: "formula",
        key: "clamp",
        value,
        children: [
          formulaNode(input, character, expression.value, guard),
          ...(expression.min === undefined
            ? []
            : [{ kind: "formula" as const, key: "clamp.min", value: expression.min }]),
          ...(expression.max === undefined
            ? []
            : [{ kind: "formula" as const, key: "clamp.max", value: expression.max }]),
        ],
      }
  }
}

function formulaBaseWithSources(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  key: string,
  expression: FormulaExpression,
  refs: ResolvedSourceRef[],
  guard: Set<string>,
): ExplanationNode {
  return {
    kind: "derived",
    key,
    value: evaluateFormula(expression, formulaContext(character)),
    children: [formulaNode(input, character, expression, guard), ...sourceNodes(input, refs)],
  }
}

function explainResourceMaxBase(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  stateKey: string,
  guard: Set<string>,
): ExplanationNode {
  const resource = character.resources.find((candidate) => candidate.stateKey === stateKey)
  if (!resource) throw new ExplainEngineError(`resolved resource not found: ${stateKey}`)
  const grant = character.grants.find(
    (candidate) =>
      candidate.target === "resource" &&
      resourceStateKey(candidate.key, candidate.variantKey) === stateKey,
  )
  if (!grant) throw new ExplainEngineError(`resource grant not found: ${stateKey}`)
  const definition = parseResourceGrantPayload(grant.payload)

  if (typeof definition.max === "number") {
    return {
      kind: "base",
      key: `resources.${stateKey}.definition.max`,
      value: definition.max,
      children: sourceNodes(input, grant.sources),
    }
  }
  return formulaBaseWithSources(
    input,
    character,
    `resources.${stateKey}.definition.max`,
    definition.max,
    grant.sources,
    guard,
  )
}

function explainActionNumberBase(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  target: NumericTarget,
  guard: Set<string>,
): { resolved: ResolvedNumber; base: ExplanationNode } | undefined {
  for (const action of character.actions) {
    const grant = character.grants.find(
      (candidate) =>
        candidate.target === "action" &&
        candidate.key === action.key &&
        candidate.variantKey === action.variantKey,
    )
    if (!grant) continue
    const definition = parseActionGrantPayload(grant.payload)

    if (action.attack && target === actionAttackBonusTarget(action.stateKey) && definition.attack) {
      return {
        resolved: action.attack.bonus,
        base: formulaBaseWithSources(
          input,
          character,
          `${target}.formula`,
          definition.attack.bonus,
          grant.sources,
          guard,
        ),
      }
    }

    for (const damage of action.damage) {
      if (target !== actionDamageModifierTarget(action.stateKey, damage.key)) continue
      const definitionDamage = definition.damage?.find((candidate) => candidate.key === damage.key)
      const expression: FormulaExpression = definitionDamage?.modifier ?? { kind: "literal", value: 0 }
      return {
        resolved: damage.modifier,
        base: formulaBaseWithSources(
          input,
          character,
          `${target}.formula`,
          expression,
          grant.sources,
          guard,
        ),
      }
    }
  }
  return undefined
}

function explainSpellNumberBase(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  target: NumericTarget,
  guard: Set<string>,
): { resolved: ResolvedNumber; base: ExplanationNode } | undefined {
  for (const spell of character.spells) {
    for (const access of spell.accesses) {
      const grant = character.grants.find(
        (candidate) =>
          candidate.target === "spell" &&
          candidate.key === spell.key &&
          candidate.variantKey === access.key,
      )
      if (!grant) continue
      const definition = parseSpellGrantPayload(grant.payload)
      for (const method of access.methods) {
        const methodDefinition = definition.methods.find((candidate) => candidate.key === method.key)
        if (!methodDefinition) continue

        if (
          method.attackBonus &&
          target === spellMethodAttackBonusTarget(spell.key, access.key, method.key)
        ) {
          const expression: FormulaExpression =
            methodDefinition.attackBonus ??
            (methodDefinition.ability
              ? {
                  kind: "add",
                  terms: [
                    { kind: "reference", key: `abilities.${methodDefinition.ability}.modifier` },
                    { kind: "reference", key: "core.proficiencyBonus" },
                  ],
                }
              : { kind: "literal", value: method.attackBonus.baseValue })
          return {
            resolved: method.attackBonus,
            base: formulaBaseWithSources(
              input,
              character,
              `${target}.formula`,
              expression,
              grant.sources,
              guard,
            ),
          }
        }

        if (method.saveDc && target === spellMethodSaveDcTarget(spell.key, access.key, method.key)) {
          const expression: FormulaExpression =
            methodDefinition.saveDc ??
            (methodDefinition.ability
              ? {
                  kind: "add",
                  terms: [
                    { kind: "literal", value: 8 },
                    { kind: "reference", key: `abilities.${methodDefinition.ability}.modifier` },
                    { kind: "reference", key: "core.proficiencyBonus" },
                  ],
                }
              : { kind: "literal", value: method.saveDc.baseValue })
          return {
            resolved: method.saveDc,
            base: formulaBaseWithSources(
              input,
              character,
              `${target}.formula`,
              expression,
              grant.sources,
              guard,
            ),
          }
        }
      }
    }
  }
  return undefined
}

function explainNumberTree(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  target: NumericTarget,
  guard = new Set<string>(),
): ExplanationNode {
  if (guard.has(target)) throw new ExplainEngineError(`explanation dependency cycle: ${target}`)
  const nextGuard = new Set(guard)
  nextGuard.add(target)

  if (target === "core.proficiencyBonus") {
    return numericRoot(input, target, character.proficiencyBonus, {
      kind: "derived",
      key: "proficiencyBonusForLevel",
      value: proficiencyBonusForLevel(character.level),
      children: [{ kind: "base", key: "core.level", value: character.level }],
    })
  }

  const abilityMatch = target.match(/^abilities\.(strength|dexterity|constitution|intelligence|wisdom|charisma)$/)
  if (abilityMatch) {
    const ability = abilityMatch[1] as AbilityKey
    return numericRoot(input, target, character.abilities[ability], {
      kind: "base",
      key: `base.abilities.${ability}`,
      value: input.base.abilities[ability],
    })
  }

  const skillMatch = target.match(/^skills\.([^\.]+)\.bonus$/)
  if (skillMatch) {
    const skill = skillMatch[1] as SkillKey
    const resolved = character.skills[skill]
    if (!resolved) throw new ExplainEngineError(`resolved skill not found: ${skill}`)
    return numericRoot(input, target, resolved.bonus, {
      kind: "derived",
      key: `${target}.base",
      value: resolved.bonus.baseValue,
      children: [
        abilityModifierNode(input, character, resolved.ability, nextGuard),
        explainNumberTree(input, character, "core.proficiencyBonus", nextGuard),
        proficiencyRankNode(input, character, "skill", skill),
      ],
    })
  }

  const savingThrowMatch = target.match(/^savingThrows\.([^\.]+)\.bonus$/)
  if (savingThrowMatch) {
    const ability = savingThrowMatch[1] as AbilityKey
    const resolved = character.savingThrows[ability]
    if (!resolved) throw new ExplainEngineError(`resolved saving throw not found: ${ability}`)
    return numericRoot(input, target, resolved.bonus, {
      kind: "derived",
      key: `${target}.base`,
      value: resolved.bonus.baseValue,
      children: [
        abilityModifierNode(input, character, ability, nextGuard),
        explainNumberTree(input, character, "core.proficiencyBonus", nextGuard),
        proficiencyRankNode(input, character, "savingThrow", ability),
      ],
    })
  }

  const passiveMatch = target.match(/^passives\.(perception|investigation|insight)$/)
  if (passiveMatch) {
    const passive = passiveMatch[1] as PassiveKey
    const skill = PASSIVE_SKILLS[passive]
    const resolved = character.passives[passive]
    return numericRoot(input, target, resolved, {
      kind: "derived",
      key: `${target}.base`,
      value: resolved.baseValue,
      children: [
        { kind: "base", key: "passive.constant", value: 10 },
        explainNumberTree(input, character, `skills.${skill}.bonus`, nextGuard),
      ],
    })
  }

  if (target === "combat.maxHp") {
    return numericRoot(input, target, character.combat.maxHp, {
      kind: "base",
      key: "base.baseMaxHp",
      value: input.base.baseMaxHp,
    })
  }
  if (target === "combat.speed") {
    return numericRoot(input, target, character.combat.speed, {
      kind: "base",
      key: "base.baseSpeed",
      value: input.base.baseSpeed,
    })
  }
  if (target === "combat.initiative") {
    return numericRoot(input, target, character.combat.initiative, abilityModifierNode(input, character, "dexterity", nextGuard))
  }
  if (target === "combat.ac") {
    const base = formulaBaseWithSources(
      input,
      character,
      "combat.ac.formula",
      character.combat.ac.formula,
      character.combat.ac.formulaSources,
      nextGuard,
    )
    return numericRoot(input, target, character.combat.ac, base)
  }

  for (const resource of character.resources) {
    if (target === resourceMaxTarget(resource.stateKey)) {
      return numericRoot(
        input,
        target,
        resource.max,
        explainResourceMaxBase(input, character, resource.stateKey, nextGuard),
      )
    }
  }

  const action = explainActionNumberBase(input, character, target, nextGuard)
  if (action) return numericRoot(input, target, action.resolved, action.base)

  const spell = explainSpellNumberBase(input, character, target, nextGuard)
  if (spell) return numericRoot(input, target, spell.resolved, spell.base)

  throw new ExplainEngineError(`unsupported or inactive numeric explain target: ${target}`)
}

function summaryForNumber(target: NumericTarget, tree: ExplanationNode): string {
  const value = tree.value
  const direct = (tree.children ?? [])
    .filter((child) => child.kind === "contribution")
    .map((child) => `${child.operation ?? "?"} ${child.operand ?? ""}@${child.source?.name ?? child.contributionId ?? "?"}`.trim())
  return `${target}=${String(value)}${direct.length ? ` <- ${direct.join("; ")}` : ""}`
}

function sourceHasAncestor(
  contribution: CharacterContribution,
  sourceId: string,
  input: CharacterEngineInput,
): boolean {
  if (contribution.source.id === sourceId) return true
  let current = contribution.source.parentSourceId
  const visited = new Set<string>()
  while (current) {
    if (current === sourceId) return true
    if (visited.has(current)) return false
    visited.add(current)
    const parentContribution = input.contributions.find((candidate) => candidate.source.id === current)
    current = parentContribution?.source.parentSourceId
  }
  return false
}

function suppressionNodesForContribution(
  input: CharacterEngineInput,
  contribution: CharacterContribution,
): ExplanationNode[] {
  const resolution = applySuppressions(input.contributions, input.state)
  if (!resolution.suppressedContributionIds.includes(contribution.id)) return []

  return resolution.controls
    .filter((control) => {
      if (control.selector.kind === "contribution") {
        return control.selector.contributionId === contribution.id
      }
      return control.selector.includeDescendants === false
        ? contribution.source.id === control.selector.sourceId
        : sourceHasAncestor(contribution, control.selector.sourceId, input)
    })
    .map((control) => ({
      kind: "suppression" as const,
      key: control.id,
      operation: "SUPPRESS",
      contributionId: control.id,
      source: control.source,
      status: "active" as const,
    }))
}

function explainGrant(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  target: GrantTarget,
  key: string,
  variantKey = "default",
): ExplanationNode {
  const identity = grantIdentity(target, key, variantKey)
  const resolved = character.grants.find(
    (grant) => grant.target === target && grant.key === key && grant.variantKey === variantKey,
  )
  if (resolved) {
    return {
      kind: "grant",
      key: identity,
      active: true,
      status: "active",
      children: sourceNodes(input, resolved.sources),
    }
  }

  const candidates = input.contributions
    .filter(
      (contribution): contribution is GrantContribution =>
        contribution.kind === "grant" &&
        contribution.target === target &&
        contribution.key === key &&
        (contribution.variantKey ?? "default") === variantKey,
    )
    .sort((left, right) => left.id.localeCompare(right.id))

  const children: ExplanationNode[] = []
  const universal = applySuppressions(input.contributions, input.state)
  for (const contribution of candidates) {
    if (universal.suppressedContributionIds.includes(contribution.id)) {
      children.push({
        ...contributionNode(
          input,
          { contributionId: contribution.id, source: contribution.source },
          "suppressed",
        ),
        children: suppressionNodesForContribution(input, contribution),
      })
    } else {
      children.push(
        contributionNode(
          input,
          { contributionId: contribution.id, source: contribution.source },
          contribution.operation === "SUPPRESS" ? "suppressed" : "inactive",
        ),
      )
    }
  }

  return {
    kind: "grant",
    key: identity,
    active: false,
    status: children.some((child) => child.status === "suppressed") ? "suppressed" : "inactive",
    children,
  }
}

function explainResource(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  stateKey: string,
): ExplanationNode {
  const resource = character.resources.find((candidate) => candidate.stateKey === stateKey)
  if (!resource) {
    const candidates = input.contributions.filter(
      (contribution): contribution is GrantContribution =>
        contribution.kind === "grant" &&
        contribution.target === "resource" &&
        resourceStateKey(contribution.key, contribution.variantKey ?? "default") === stateKey,
    )
    const first = candidates[0]
    return {
      kind: "resource",
      key: stateKey,
      active: false,
      status: "inactive",
      children: first
        ? [explainGrant(input, character, "resource", first.key, first.variantKey ?? "default")]
        : [],
    }
  }

  return {
    kind: "resource",
    key: stateKey,
    active: true,
    status: "active",
    children: [
      {
        kind: "state",
        key: `resources.${stateKey}.current`,
        value: resource.current,
      },
      explainNumberTree(input, character, resourceMaxTarget(stateKey)),
      ...sourceNodes(input, resource.sources),
    ],
  }
}

function explainAction(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  stateKey: string,
): ExplanationNode {
  const action = character.actions.find((candidate) => candidate.stateKey === stateKey)
  if (!action) {
    const candidate = input.contributions.find(
      (contribution): contribution is GrantContribution =>
        contribution.kind === "grant" &&
        contribution.target === "action" &&
        resourceStateKey(contribution.key, contribution.variantKey ?? "default") === stateKey,
    )
    return {
      kind: "action",
      key: stateKey,
      active: false,
      status: "inactive",
      children: candidate
        ? [explainGrant(input, character, "action", candidate.key, candidate.variantKey ?? "default")]
        : [],
    }
  }

  const children: ExplanationNode[] = [
    ...sourceNodes(input, action.sources),
    ...(action.attack
      ? [explainNumberTree(input, character, actionAttackBonusTarget(action.stateKey))]
      : []),
    ...action.damage.map((damage) =>
      explainNumberTree(input, character, actionDamageModifierTarget(action.stateKey, damage.key)),
    ),
    ...action.resourceCosts.map((cost) => ({
      kind: "resource" as const,
      key: cost.stateKey,
      active: cost.available,
      value: cost.current,
      children: [
        { kind: "state" as const, key: `${cost.stateKey}.current`, value: cost.current },
        { kind: "base" as const, key: `${cost.stateKey}.cost`, value: cost.amount },
      ],
    })),
  ]

  return {
    kind: "action",
    key: stateKey,
    active: action.available,
    status: action.available ? "active" : "inactive",
    children,
  }
}

function explainSpell(
  input: CharacterEngineInput,
  character: ResolvedCharacter,
  spellKey: string,
  accessKey?: string,
  methodKey?: string,
): ExplanationNode {
  const spell = character.spells.find((candidate) => candidate.key === spellKey)
  if (!spell) {
    const candidate = input.contributions.find(
      (contribution): contribution is GrantContribution =>
        contribution.kind === "grant" && contribution.target === "spell" && contribution.key === spellKey,
    )
    return {
      kind: "spell",
      key: spellKey,
      active: false,
      status: "inactive",
      children: candidate
        ? [explainGrant(input, character, "spell", candidate.key, candidate.variantKey ?? "default")]
        : [],
    }
  }

  const accesses = accessKey
    ? spell.accesses.filter((candidate) => candidate.key === accessKey)
    : spell.accesses
  if (accessKey && accesses.length === 0) {
    return {
      kind: "spell",
      key: `${spellKey}::${accessKey}`,
      active: false,
      status: "inactive",
      children: [explainGrant(input, character, "spell", spellKey, accessKey)],
    }
  }

  const accessNodes = accesses.map((access) => {
    const methods = methodKey
      ? access.methods.filter((candidate) => candidate.key === methodKey)
      : access.methods
    const methodNodes = methods.map((method) => ({
      kind: "derived" as const,
      key: `spells.${spellKey}.access.${access.key}.method.${method.key}`,
      active: method.available,
      status: method.available ? ("active" as const) : ("inactive" as const),
      children: [
        ...(method.attackBonus
          ? [
              explainNumberTree(
                input,
                character,
                spellMethodAttackBonusTarget(spellKey, access.key, method.key),
              ),
            ]
          : []),
        ...(method.saveDc
          ? [
              explainNumberTree(
                input,
                character,
                spellMethodSaveDcTarget(spellKey, access.key, method.key),
              ),
            ]
          : []),
        ...method.resourceOptions.map((option) => ({
          kind: "resource" as const,
          key: option.key,
          active: option.available,
          value: option.castLevel,
          children: option.costs.map((cost) => ({
            kind: "state" as const,
            key: cost.stateKey,
            active: cost.available,
            value: cost.current,
            children: [{ kind: "base" as const, key: "cost", value: cost.amount }],
          })),
        })),
      ],
    }))

    return {
      kind: "grant" as const,
      key: grantIdentity("spell", spellKey, access.key),
      active: access.available,
      status: access.available ? ("active" as const) : ("inactive" as const),
      children: [
        {
          kind: "state" as const,
          key: access.preparedFactKey ?? `spells.${spellKey}.${access.key}.preparation`,
          value: access.prepared,
        },
        ...sourceNodes(input, access.sources),
        ...methodNodes,
      ],
    }
  })

  return {
    kind: "spell",
    key: methodKey
      ? `${spellKey}::${accessKey ?? "*"}::${methodKey}`
      : accessKey
        ? `${spellKey}::${accessKey}`
        : spellKey,
    active: accessNodes.some((node) => node.active),
    status: accessNodes.some((node) => node.active) ? "active" : "inactive",
    children: accessNodes,
  }
}

/**
 * Builds a deterministic, structured provenance tree on demand.
 * The UI can localize/render this tree without performing game math itself.
 */
export function explainCharacter(
  input: CharacterEngineInput,
  query: CharacterExplainQuery,
): CharacterExplanation {
  const character = resolveCharacterInput(input)

  if (query.kind === "number") {
    const tree = explainNumberTree(input, character, query.target)
    return {
      query,
      active: true,
      value: tree.value,
      summary: summaryForNumber(query.target, tree),
      tree,
    }
  }

  if (query.kind === "grant") {
    const tree = explainGrant(input, character, query.target, query.key, query.variantKey ?? "default")
    return {
      query,
      active: tree.active ?? false,
      value: tree.active ?? false,
      summary: `${tree.key}:${tree.active ? "active" : "inactive"}`,
      tree,
    }
  }

  if (query.kind === "resource") {
    const tree = explainResource(input, character, query.stateKey)
    return {
      query,
      active: tree.active ?? false,
      value: tree.active ?? false,
      summary: `resource.${query.stateKey}:${tree.active ? "active" : "inactive"}`,
      tree,
    }
  }

  if (query.kind === "action") {
    const tree = explainAction(input, character, query.stateKey)
    return {
      query,
      active: tree.active ?? false,
      value: tree.active ?? false,
      summary: `action.${query.stateKey}:${tree.active ? "available" : "unavailable"}`,
      tree,
    }
  }

  const tree = explainSpell(input, character, query.spellKey, query.accessKey, query.methodKey)
  return {
    query,
    active: tree.active ?? false,
    value: tree.active ?? false,
    summary: `spell.${query.spellKey}:${tree.active ? "available" : "unavailable"}`,
    tree,
  }
}
