import type {
  CharacterSource,
  ResolvedAction,
  ResolvedSpell,
} from "../character-engine/index.ts"

export type CharacterSheetEntityTarget =
  | {
      kind: "feature"
      featureId: string
      label?: string
    }
  | {
      kind: "resource"
      stateKey: string
      label?: string
    }
  | {
      kind: "spell"
      spellKey: string
      level?: number
      label?: string
    }
  | {
      kind: "item"
      itemId: string
      label?: string
    }
  | {
      kind: "effect"
      effectId: string
      label?: string
    }

export type CharacterSheetEntityNavigator = (
  target: CharacterSheetEntityTarget,
) => void

function uniqueTargets(targets: CharacterSheetEntityTarget[]) {
  const seen = new Set<string>()

  return targets.filter((target) => {
    const key =
      target.kind === "feature"
        ? "feature:" + target.featureId
        : target.kind === "resource"
          ? "resource:" + target.stateKey
          : target.kind === "spell"
            ? "spell:" + target.spellKey
            : target.kind === "item"
              ? "item:" + target.itemId
              : "effect:" + target.effectId

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function characterSheetEntityFromSource(
  source: CharacterSource | null | undefined,
): CharacterSheetEntityTarget | null {
  if (!source) return null

  const sourceType = (source.sourceType || "").toLocaleLowerCase("ru-RU")
  const sourceId = source.id || ""

  if (sourceType === "inventory_item" || sourceId.startsWith("item:")) {
    const itemId = sourceId.match(/^item:([^:]+)(?::|$)/)?.[1]
    return itemId
      ? { kind: "item", itemId, label: source.name }
      : null
  }

  if (
    sourceType === "character_feature" ||
    sourceType === "legacy_feature" ||
    sourceId.startsWith("feature:") ||
    sourceId.startsWith("legacy-feature:")
  ) {
    const featureId =
      sourceId.match(/^(?:feature|legacy-feature):([^:]+)(?::|$)/)?.[1] ||
      sourceId

    return {
      kind: "feature",
      featureId,
      label: source.name,
    }
  }

  if (
    sourceType.includes("effect") ||
    sourceType.includes("status") ||
    sourceType.includes("condition") ||
    sourceId.startsWith("effect:")
  ) {
    return {
      kind: "effect",
      effectId: sourceId,
      label: source.name,
    }
  }

  return null
}

export function characterSheetLinkedEntitiesForAction(
  action: ResolvedAction,
): CharacterSheetEntityTarget[] {
  const targets: CharacterSheetEntityTarget[] = []

  for (const cost of action.resourceCosts) {
    targets.push({
      kind: "resource",
      stateKey: cost.key,
      label: cost.key,
    })
  }

  for (const option of action.costOptions) {
    for (const cost of option.costs) {
      targets.push({
        kind: "resource",
        stateKey: cost.key,
        label: cost.key,
      })
    }
  }

  for (const requirement of action.requirements) {
    if (requirement.kind === "resource") {
      targets.push({
        kind: "resource",
        stateKey: requirement.key,
        label: requirement.label || requirement.key,
      })
      continue
    }

    if (
      requirement.kind === "grant" &&
      (requirement.target === "feature" || requirement.target === "trait")
    ) {
      targets.push({
        kind: "feature",
        featureId: requirement.key,
        label: requirement.label || requirement.key,
      })
    }
  }

  for (const effect of action.effects) {
    if (effect.kind !== "resource") continue
    targets.push({
      kind: "resource",
      stateKey: effect.key,
      label: effect.key,
    })
  }

  for (const sourceRef of action.sources) {
    const sourceTarget = characterSheetEntityFromSource(sourceRef.source)
    if (sourceTarget) targets.push(sourceTarget)
  }

  return uniqueTargets(targets)
}

export function characterSheetLinkedEntitiesForSpell(
  spell: ResolvedSpell,
): CharacterSheetEntityTarget[] {
  const targets: CharacterSheetEntityTarget[] = []

  for (const access of spell.accesses) {
    for (const method of access.methods) {
      for (const option of method.resourceOptions) {
        for (const cost of option.costs) {
          targets.push({
            kind: "resource",
            stateKey: cost.key,
            label: cost.key,
          })
        }
      }
    }

    for (const sourceRef of access.sources) {
      const sourceTarget = characterSheetEntityFromSource(sourceRef.source)
      if (sourceTarget) targets.push(sourceTarget)
    }
  }

  return uniqueTargets(targets)
}

export function characterSheetEntitiesUsingResource(
  actions: ResolvedAction[],
  spells: ResolvedSpell[],
  stateKey: string,
): CharacterSheetEntityTarget[] {
  const targets: CharacterSheetEntityTarget[] = []

  for (const action of actions) {
    const linked = characterSheetLinkedEntitiesForAction(action)
    if (
      linked.some(
        (target) =>
          target.kind === "resource" &&
          target.stateKey === stateKey,
      )
    ) {
      targets.push({
        kind: "feature",
        featureId: "action:" + action.stateKey,
        label: action.label,
      })
    }
  }

  for (const spell of spells) {
    const linked = characterSheetLinkedEntitiesForSpell(spell)
    if (
      linked.some(
        (target) =>
          target.kind === "resource" &&
          target.stateKey === stateKey,
      )
    ) {
      targets.push({
        kind: "spell",
        spellKey: spell.key,
        level: spell.identity.level,
        label: spell.identity.name,
      })
    }
  }

  return uniqueTargets(targets)
}

export function characterSheetEntityLabel(
  target: CharacterSheetEntityTarget,
) {
  if (target.label?.trim()) return target.label.trim()

  if (target.kind === "feature") return target.featureId
  if (target.kind === "resource") return target.stateKey
  if (target.kind === "spell") return target.spellKey
  if (target.kind === "item") return target.itemId
  return target.effectId
}
