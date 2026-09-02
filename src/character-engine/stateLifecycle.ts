import type { ResourceRechargeTrigger } from "./types.ts"

export type RecoverableStateTrigger = Exclude<ResourceRechargeTrigger, "manual" | "never">

const PREFIX = "recovery-state["
const SEPARATOR = "]::"

/**
 * Names one persistent state fact together with the recovery events that end it.
 * The Character Engine still treats the fact as ordinary state; recovery only
 * interprets this generic lifecycle envelope and never branches on class/ruleset keys.
 */
export function recoverableStateKey(
  key: string,
  triggers: RecoverableStateTrigger[],
): string {
  const normalizedKey = key.trim()
  if (!normalizedKey) throw new Error("recoverable state key must not be empty")
  if (triggers.length === 0) throw new Error("recoverable state triggers must not be empty")

  const normalizedTriggers = [...new Set(triggers)].sort()
  return `${PREFIX}${normalizedTriggers.join(",")}${SEPARATOR}${normalizedKey}`
}

/** Returns true when an explicit recovery event ends the wrapped state fact. */
export function stateRecoversOn(
  stateKey: string,
  trigger: ResourceRechargeTrigger,
): boolean {
  if (trigger === "manual" || trigger === "never" || !stateKey.startsWith(PREFIX)) return false

  const separatorIndex = stateKey.indexOf(SEPARATOR, PREFIX.length)
  if (separatorIndex < 0) return false

  const encodedTriggers = stateKey.slice(PREFIX.length, separatorIndex)
  return encodedTriggers.split(",").includes(trigger)
}
