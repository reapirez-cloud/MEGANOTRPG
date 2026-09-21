import type { InventoryItem } from "../types/characterSheet.ts"

export type ItemRechargeTrigger = "short_rest" | "long_rest" | "dawn"
export type ItemRechargeRestore = "full" | "amount"

export type ItemRechargeConfig = {
  trigger: ItemRechargeTrigger | null
  restore: ItemRechargeRestore
  amount: number | null
}

const rechargeTriggers = new Set<ItemRechargeTrigger>([
  "short_rest",
  "long_rest",
  "dawn",
])

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function trigger(value: unknown): ItemRechargeTrigger | null {
  return typeof value === "string" && rechargeTriggers.has(value as ItemRechargeTrigger)
    ? value as ItemRechargeTrigger
    : null
}

function amount(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function readItemRecharge(
  itemState: InventoryItem["item_state"] | undefined,
): ItemRechargeConfig {
  const recharge = record(record(itemState)?.recharge)
  if (!recharge) return { trigger: null, restore: "full", amount: null }

  let source = recharge
  if (Array.isArray(recharge.rules)) {
    const firstRule = recharge.rules.map(record).find(Boolean)
    if (firstRule) source = firstRule
  }

  const fromRule = trigger(source.trigger)
  const triggers = Array.isArray(recharge.triggers)
    ? recharge.triggers.map(trigger).filter((value): value is ItemRechargeTrigger => Boolean(value))
    : []
  const restore: ItemRechargeRestore = source.restore === "amount" ? "amount" : "full"

  return {
    trigger: fromRule ?? triggers[0] ?? null,
    restore,
    amount: restore === "amount" ? amount(source.amount) : null,
  }
}

export function writeItemRecharge(
  itemState: InventoryItem["item_state"] | undefined,
  config: ItemRechargeConfig,
): Record<string, unknown> {
  const next = { ...(record(itemState) || {}) }

  if (!config.trigger) {
    delete next.recharge
    return next
  }

  next.recharge = {
    triggers: [config.trigger],
    restore: config.restore,
    ...(config.restore === "amount"
      ? { amount: Math.max(1, config.amount ?? 1) }
      : {}),
  }
  return next
}


export type ItemAttunementState = {
  required: boolean
  attuned: boolean
}

export function readItemAttunement(
  itemState: InventoryItem["item_state"] | undefined,
): ItemAttunementState {
  const attunement = record(record(itemState)?.attunement)
  return {
    required: attunement?.required === true,
    attuned: attunement?.attuned === true,
  }
}
