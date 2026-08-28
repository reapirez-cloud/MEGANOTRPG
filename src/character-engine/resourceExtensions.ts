import { resourceStateKey } from "./resources.ts"
import type {
  GrantPayload,
  ResolvedAction,
  ResolvedGrant,
  ResolvedResource,
  ResolvedSpell,
  ResolvedSpellResourceOption,
} from "./types.ts"

function payloadObject(payload: GrantPayload | undefined): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
}

function actionDefinitionFor(action: ResolvedAction, grants: ResolvedGrant[]): Record<string, unknown> | null {
  const grant = grants.find((candidate) =>
    candidate.target === "action" &&
    candidate.key === action.key &&
    candidate.variantKey === action.variantKey
  )
  return payloadObject(grant?.payload)
}

/**
 * `minimum` is native in the older Action Engine. `maximum` is a generic
 * resource-ledger extension used for exact/upper-bound checks such as
 * “this pool must be empty”. It deliberately knows nothing about class names.
 */
export function applyResourceRequirementMaximums(
  actions: ResolvedAction[],
  grants: ResolvedGrant[],
  resources: ResolvedResource[],
): ResolvedAction[] {
  return actions.map((action) => {
    const definition = actionDefinitionFor(action, grants)
    const rawRequirements = Array.isArray(definition?.requirements)
      ? definition.requirements
      : []
    if (!rawRequirements.length) return action

    let changed = false
    const requirements = action.requirements.map((resolved, index) => {
      const raw = rawRequirements[index]
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return resolved
      const record = raw as Record<string, unknown>
      if (record.kind !== "resource" || typeof record.maximum !== "number" || !Number.isFinite(record.maximum)) {
        return resolved
      }
      const key = typeof record.key === "string" ? record.key : ""
      const variantKey = typeof record.variantKey === "string" && record.variantKey.trim()
        ? record.variantKey
        : "default"
      const stateKey = resourceStateKey(key, variantKey)
      const resource = resources.find((candidate) => candidate.stateKey === stateKey)
      const maximumSatisfied = resource !== undefined && resource.current <= Math.max(0, record.maximum)
      if (maximumSatisfied === resolved.satisfied) return resolved
      changed = true
      return { ...resolved, satisfied: resolved.satisfied && maximumSatisfied }
    })

    if (!changed) return action
    const engineRequirementsSatisfied = requirements
      .filter((requirement) => requirement.enforcement === "engine")
      .every((requirement) => requirement.satisfied)
    return {
      ...action,
      requirements,
      available: action.available && engineRequirementsSatisfied,
    }
  })
}

function bonusSpellSlotDefinitions(
  grants: ResolvedGrant[],
  resources: ResolvedResource[],
): Array<{ resource: ResolvedResource; castLevel: number }> {
  const result: Array<{ resource: ResolvedResource; castLevel: number }> = []
  for (const grant of grants) {
    if (grant.target !== "resource") continue
    const payload = payloadObject(grant.payload)
    const castLevel = payload?.spellSlotLevel
    if (!Number.isInteger(castLevel) || (castLevel as number) < 1 || (castLevel as number) > 9) continue
    const stateKey = resourceStateKey(grant.key, grant.variantKey)
    const resource = resources.find((candidate) => candidate.stateKey === stateKey)
    if (resource) result.push({ resource, castLevel: castLevel as number })
  }
  return result
}

function bonusOption(resource: ResolvedResource, castLevel: number): ResolvedSpellResourceOption {
  return {
    key: `bonus-slot:${resource.stateKey}`,
    castLevel,
    costs: [{
      key: resource.key,
      variantKey: resource.variantKey,
      stateKey: resource.stateKey,
      amount: 1,
      current: resource.current,
      max: resource.max.value,
      available: resource.current >= 1,
    }],
    available: resource.current >= 1,
  }
}

/**
 * A resource grant may declare `spellSlotLevel: N`. CE then exposes that pool as
 * another legal payment for spells of level <= N without increasing the normal
 * spell_slot_N maximum. This models temporary/bonus slots and remains generic for
 * items, boons and future class features.
 */
export function augmentSpellsWithBonusSlotResources(
  spells: ResolvedSpell[],
  grants: ResolvedGrant[],
  resources: ResolvedResource[],
): ResolvedSpell[] {
  const bonusSlots = bonusSpellSlotDefinitions(grants, resources)
  if (!bonusSlots.length) return spells

  return spells.map((spell) => ({
    ...spell,
    accesses: spell.accesses.map((access) => {
      const methods = access.methods.map((method) => {
        const existingStateKeys = new Set(
          method.resourceOptions.flatMap((option) => option.costs.map((cost) => cost.stateKey)),
        )
        const extra = bonusSlots
          .filter(({ resource, castLevel }) => castLevel >= spell.identity.level && !existingStateKeys.has(resource.stateKey))
          .map(({ resource, castLevel }) => bonusOption(resource, castLevel))
        if (!extra.length) return method
        const resourceOptions = [...method.resourceOptions, ...extra]
        return {
          ...method,
          resourceOptions,
          available: (!method.requiresPrepared || access.prepared) && resourceOptions.some((option) => option.available),
        }
      })
      return {
        ...access,
        methods,
        available: methods.some((method) => method.available),
      }
    }),
  }))
}
